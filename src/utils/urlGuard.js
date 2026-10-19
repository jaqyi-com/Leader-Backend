"use strict";
// SSRF protection for every server-side fetch of a user-supplied URL.
//
// Blocks non-http(s) schemes, credentials in URLs, unusual ports, and any destination that
// resolves to a private / loopback / link-local / cloud-metadata address. The check runs at
// connection time (custom DNS lookup), so DNS rebinding and redirects to internal hosts are
// covered as well as the initial hostname.

const net = require("net");
const dns = require("dns");
const http = require("http");
const https = require("https");
const axios = require("axios");

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

const blocked = new net.BlockList();
[
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].forEach(([a, p]) => blocked.addSubnet(a, p, "ipv4"));
[["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96]]
  .forEach(([a, p]) => blocked.addSubnet(a, p, "ipv6"));

function isBlockedIp(ip) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  const fam = net.isIPv6(ip) ? "ipv6" : "ipv4";
  return blocked.check(ip, fam);
}

function assertSafeHostname(hostname) {
  const host = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("Blocked destination");
  }
  if (net.isIP(host) && isBlockedIp(host)) throw new Error("Blocked destination");
}

/** Validate scheme / credentials / port / literal host of a URL string. Returns the URL object. */
function assertPublicHttpUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) URLs are allowed");
  if (u.username || u.password) throw new Error("Credentials in URL are not allowed");
  if (!ALLOWED_PORTS.has(u.port)) throw new Error("Port not allowed");
  assertSafeHostname(u.hostname);
  return u;
}

// DNS lookup that refuses to connect to non-public addresses (closes DNS-rebinding gaps).
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: 4 }];
    const bad = list.find((a) => isBlockedIp(a.address));
    if (bad || list.length === 0) return callback(new Error("Blocked destination"));
    if (options && options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

const httpAgent = new http.Agent({ lookup: guardedLookup });
const httpsAgent = new https.Agent({ lookup: guardedLookup });

/**
 * GET a public URL. Same signature as axios.get(url, config) but SSRF-safe:
 * validates the URL, pins DNS to public addresses, re-validates every redirect hop,
 * and caps the response size.
 */
async function publicGet(rawUrl, config = {}) {
  const u = assertPublicHttpUrl(rawUrl);
  return axios.get(u.toString(), {
    maxContentLength: 5 * 1024 * 1024,
    maxBodyLength: 5 * 1024 * 1024,
    maxRedirects: 3,
    ...config,
    httpAgent,
    httpsAgent,
    beforeRedirect: (options) => {
      assertSafeHostname(options.hostname);
      if (options.protocol !== "http:" && options.protocol !== "https:") throw new Error("Blocked redirect");
    },
  });
}

module.exports = { assertPublicHttpUrl, isBlockedIp, publicGet };

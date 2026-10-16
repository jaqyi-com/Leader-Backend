"use strict";

const net = require("net");
const crypto = require("crypto");
let SocksClient = null;
try {
  SocksClient = require("socks").SocksClient;
} catch (_) {}

const {
  FREEMAIL_DOMAINS,
  SECURITY_GATEWAY_PATTERNS,
  BLOCKED_HINTS,
  INVALID_HINTS,
  DISABLED_HINTS,
  FULL_HINTS,
  GREYLIST_HINTS,
  POLICY_HINTS,
  SMTP_RESULTS
} = require("./constants");

const DEFAULT_SMTP_PORT = 25;
const DEFAULT_SMTP_TIMEOUT_MS = 5000;
const SMTP_HELO_DOMAIN = process.env.SMTP_HELO_DOMAIN || "mail-verifier.org";
const SMTP_MAIL_FROM = process.env.SMTP_MAIL_FROM || "verify@mail-verifier.org";

/**
 * Checks whether outbound SMTP probes (port 25) are enabled in this environment.
 * Default is TRUE unless explicitly set to "false".
 */
function isSmtpProbingEnabled() {
  if (process.env.ENABLE_SMTP_PROBES === "false") return false;
  return true;
}

/**
 * Checks if an MX host belongs to a known enterprise security gateway.
 * Informational only: M365 and Proofpoint are probed normally.
 */
function isSecurityGateway(mxHost) {
  if (!mxHost) return false;
  const cleanMx = mxHost.toLowerCase().trim();
  return SECURITY_GATEWAY_PATTERNS.some(pattern => pattern.test(cleanMx));
}

/**
 * Checks if a domain is a known major freemail provider.
 */
function isFreemailDomain(domain) {
  if (!domain) return false;
  return FREEMAIL_DOMAINS.has(domain.toLowerCase().trim());
}

/**
 * Classifies an SMTP RCPT reply code + text into one of 7 granular reply states.
 * Adapted from reacher / AfterShip / ETL pipeline parser.
 * A refusal of *us* (IP reputation) is marked BLOCKED, never INVALID.
 */
function classifyReply(code, text = "") {
  const t = text.toLowerCase();
  if (code >= 200 && code < 300) {
    return SMTP_RESULTS.ACCEPTED;
  }
  if (code >= 400 && code < 500) {
    if (FULL_HINTS.some(h => t.includes(h))) return SMTP_RESULTS.FULL;
    if (GREYLIST_HINTS.some(h => t.includes(h))) return SMTP_RESULTS.GREYLISTED;
    return SMTP_RESULTS.UNKNOWN;
  }
  if (code >= 500 && code < 600) {
    if (BLOCKED_HINTS.some(h => t.includes(h))) return SMTP_RESULTS.BLOCKED;
    if (INVALID_HINTS.some(h => t.includes(h))) return SMTP_RESULTS.INVALID;
    if (DISABLED_HINTS.some(h => t.includes(h))) return SMTP_RESULTS.DISABLED;
    if (FULL_HINTS.some(h => t.includes(h))) return SMTP_RESULTS.FULL;
    if (POLICY_HINTS.some(h => t.includes(h))) return SMTP_RESULTS.BLOCKED;
    // Bare 550 with no specific reason text is almost always "no such user"
    return SMTP_RESULTS.INVALID;
  }
  return SMTP_RESULTS.UNKNOWN;
}

/**
 * Raw RFC 1928 SOCKS5 tunnel connector with zero external dependencies.
 */
function socks5Connect(proxyHost, proxyPort, targetHost, targetPort, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: proxyHost, port: proxyPort });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`SOCKS5 proxy connection to ${proxyHost}:${proxyPort} timed out`));
    }, timeoutMs);
    if (timer.unref) timer.unref();

    let step = 0; // 0: greeting, 1: connect

    socket.once("connect", () => {
      // Step 0: Greeting (Version 5, 1 method: No Authentication required)
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    socket.on("data", (data) => {
      if (step === 0) {
        if (data.length < 2 || data[0] !== 0x05 || data[1] !== 0x00) {
          socket.destroy();
          return reject(new Error("SOCKS5 proxy rejected no-auth connection"));
        }
        step = 1;
        // Step 1: Connect to domain
        const hostBuf = Buffer.from(targetHost, "utf8");
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(targetPort, 0);
        const req = Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
          hostBuf,
          portBuf
        ]);
        socket.write(req);
      } else if (step === 1) {
        if (data.length < 4 || data[0] !== 0x05 || data[1] !== 0x00) {
          socket.destroy();
          const errCode = data[1] || "unknown";
          return reject(new Error(`SOCKS5 connect to ${targetHost}:${targetPort} failed (code ${errCode})`));
        }
        clearTimeout(timer);
        resolve(socket);
      }
    });

    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Creates socket either directly or via SOCKS5 proxy tunnel.
 */
async function createSmtpSocket(mxHost, timeoutMs, options = {}) {
  const socksProxyEnv = process.env.SOCKS5_PROXY || "";
  const useSocks = options.socks5 || socksProxyEnv || process.env.USE_SOCKS5_PROXY === "true" || process.env.SOCKS5_PROXY_PORT;

  if (useSocks) {
    let socksHost = "127.0.0.1";
    let socksPort = 1080;

    const proxyStr = typeof options.socks5 === "string" ? options.socks5 : (socksProxyEnv || "");
    if (proxyStr) {
      const parts = proxyStr.split(":");
      socksHost = parts[0] || "127.0.0.1";
      socksPort = parseInt(parts[1] || "1080", 10);
    } else {
      socksHost = process.env.SOCKS5_PROXY_HOST || "127.0.0.1";
      socksPort = parseInt(process.env.SOCKS5_PROXY_PORT || "1080", 10);
    }

    // Try SocksClient if available, otherwise native socks5Connect
    if (SocksClient) {
      try {
        const info = await SocksClient.createConnection({
          proxy: { host: socksHost, port: socksPort, type: 5 },
          command: "connect",
          destination: { host: mxHost, port: DEFAULT_SMTP_PORT },
          timeout: timeoutMs
        });
        return info.socket;
      } catch (_) {}
    }

    return await socks5Connect(socksHost, socksPort, mxHost, DEFAULT_SMTP_PORT, timeoutMs);
  }

  // Direct connection
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: mxHost, port: DEFAULT_SMTP_PORT });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP connect timeout to ${mxHost}:25 after ${timeoutMs}ms`));
    }, timeoutMs);
    if (timer.unref) timer.unref();

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Reads a full (possibly multi-line) SMTP reply from the socket.
 */
function readReply(socket, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const lines = [];

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`SMTP read timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    if (timer.unref) timer.unref();

    function onData(chunk) {
      buffer += chunk.toString("utf8");
      while (true) {
        const idx = buffer.indexOf("\n");
        if (idx === -1) break;
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        lines.push(line);

        // Terminal line check: "250 ..." or "550 " (digit digit digit SPACE)
        const match = line.match(/^(\d{3})( )?(.*)$/);
        if (match && match[2] === " ") {
          cleanup();
          const code = parseInt(match[1], 10);
          return resolve({ code, text: lines.join(" ") });
        }
      }
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    function onClose() {
      cleanup();
      if (lines.length > 0) {
        const match = lines[lines.length - 1].match(/^(\d{3})/);
        const code = match ? parseInt(match[1], 10) : 0;
        return resolve({ code, text: lines.join(" ") });
      }
      reject(new Error("Connection closed by remote host"));
    }

    function cleanup() {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    }

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

async function sendCmd(socket, cmd, timeoutMs = 5000) {
  socket.write(cmd + "\r\n");
  return await readReply(socket, timeoutMs);
}

/**
 * Executes ONE single SMTP session with pipelined / sequential RCPT checks:
 * EHLO → MAIL FROM → RCPT <random> (if catch-all unproven) → RCPT <target> → QUIT
 */
async function singleSmtpSession(mxHost, rcpts, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_SMTP_TIMEOUT_MS;
  const helo = options.helo || SMTP_HELO_DOMAIN;
  const mailFrom = options.mailFrom || SMTP_MAIL_FROM;

  let socket = null;
  try {
    socket = await createSmtpSocket(mxHost, timeoutMs, options);

    // 1. Read Server Banner (expect 220)
    const banner = await readReply(socket, timeoutMs);
    if (banner.code !== 220) {
      return { ok: false, error: `${mxHost}: banner refusal (${banner.text})`, blocked: banner.code >= 500 };
    }

    // 2. EHLO with HELO fallback
    let ehlo = await sendCmd(socket, `EHLO ${helo}`, timeoutMs);
    if (ehlo.code !== 250) {
      ehlo = await sendCmd(socket, `HELO ${helo}`, timeoutMs);
    }

    // 3. MAIL FROM
    const mailFromReply = await sendCmd(socket, `MAIL FROM:<${mailFrom}>`, timeoutMs);
    if (mailFromReply.code !== 250) {
      return { ok: false, error: `${mxHost}: sender refused (${mailFromReply.text})`, blocked: true };
    }

    // 4. RCPT TO for each recipient
    const replies = [];
    for (const r of rcpts) {
      const rcptReply = await sendCmd(socket, `RCPT TO:<${r}>`, timeoutMs);
      replies.push(rcptReply);
      if (rcptReply.code === 421) break; // Server closing connection
    }

    return { ok: true, replies, mx: mxHost };
  } catch (err) {
    const isPort25Blocked = err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "EHOSTUNREACH" || (err.message && err.message.includes("timed out"));
    return { ok: false, error: `${mxHost}:25 ${err.code || err.message}${isPort25Blocked ? " (port 25 may be blocked)" : ""}`, blocked: false };
  } finally {
    if (socket) {
      try {
        if (!socket.destroyed) {
          socket.write("QUIT\r\n");
          socket.end();
          socket.destroy();
        }
      } catch (_) {}
    }
  }
}

/**
 * Unified multi-MX SMTP Verifier:
 * - Probes random catch-all & target email in a SINGLE TCP session
 * - Tries up to 3 MX hosts if one times out or drops connection
 * - Classifies reply using reacher / ETL pipeline 7-class heuristics
 */
async function probeSmtp(email, domain, mxHosts = [], options = {}) {
  if (!isSmtpProbingEnabled()) {
    return {
      smtpResult: SMTP_RESULTS.UNKNOWN,
      catchAll: options.knownCatchAll ?? null,
      code: null,
      message: "SMTP probing is currently disabled via ENABLE_SMTP_PROBES configuration",
      primaryMx: mxHosts[0] || null,
      blocked: false,
      smtpGated: true
    };
  }

  const hosts = Array.isArray(mxHosts) && mxHosts.length > 0 ? mxHosts : (options.primaryMx ? [options.primaryMx] : []);
  if (hosts.length === 0 || !email || !domain) {
    return {
      smtpResult: SMTP_RESULTS.UNKNOWN,
      catchAll: options.knownCatchAll ?? null,
      code: null,
      message: "Missing MX host or recipient email for SMTP probe",
      primaryMx: null,
      blocked: false,
      smtpGated: false
    };
  }

  const known = options.knownCatchAll;
  const randomAddr = `${crypto.randomBytes(6).toString("hex")}.${crypto.randomBytes(3).toString("hex")}@${domain}`;
  const rcpts = (known !== null && known !== undefined) ? [email] : [randomAddr, email];

  let lastErr = "";
  let res = null;

  // Try top 3 MX servers on failure
  for (const mx of hosts.slice(0, 3)) {
    res = await singleSmtpSession(mx, rcpts, options);
    if (res.ok) break;
    lastErr = res.error;
  }

  if (!res || !res.ok) {
    return {
      smtpResult: res && res.blocked ? SMTP_RESULTS.BLOCKED : SMTP_RESULTS.UNKNOWN,
      catchAll: known ?? null,
      code: null,
      message: lastErr,
      primaryMx: hosts[0],
      blocked: res?.blocked || false,
      smtpGated: false
    };
  }

  const targetReply = res.replies[res.replies.length - 1];
  const targetCode = targetReply?.code || 0;
  const targetText = targetReply?.text || "closed early";
  const smtp = classifyReply(targetCode, targetText);

  let catchAll = known ?? null;
  if (catchAll === null && res.replies.length >= 2) {
    const randomReply = res.replies[0];
    const rclass = classifyReply(randomReply.code, randomReply.text);
    if (rclass === SMTP_RESULTS.ACCEPTED) {
      catchAll = true;
    } else if (rclass === SMTP_RESULTS.INVALID || rclass === SMTP_RESULTS.DISABLED) {
      catchAll = false;
    }
  }

  return {
    smtpResult: smtp,
    catchAll,
    code: targetCode,
    message: targetText.slice(0, 200),
    primaryMx: res.mx,
    blocked: smtp === SMTP_RESULTS.BLOCKED,
    smtpGated: false
  };
}

/**
 * Backward-compatible single-recipient wrapper.
 */
async function probeSmtpMailbox(mxHost, recipientEmail, timeoutMs = DEFAULT_SMTP_TIMEOUT_MS) {
  const domain = recipientEmail.split("@")[1] || "";
  const r = await probeSmtp(recipientEmail, domain, [mxHost], { timeoutMs });
  return {
    result: r.smtpResult,
    code: r.code,
    message: r.message,
    banner: null,
    smtpGated: r.smtpGated
  };
}

module.exports = {
  probeSmtp,
  probeSmtpMailbox,
  singleSmtpSession,
  classifyReply,
  isSmtpProbingEnabled,
  isFreemailDomain,
  isSecurityGateway,
  DEFAULT_SMTP_PORT,
  DEFAULT_SMTP_TIMEOUT_MS
};

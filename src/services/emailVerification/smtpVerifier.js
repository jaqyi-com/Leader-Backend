"use strict";

const net = require("net");
let SocksClient = null;
try {
  SocksClient = require("socks").SocksClient;
} catch (_) {}

const { FREEMAIL_DOMAINS, SMTP_RESULTS } = require("./constants");

const DEFAULT_SMTP_PORT = 25;
const DEFAULT_SMTP_TIMEOUT_MS = 8000;
const SMTP_HELO_DOMAIN = process.env.SMTP_HELO_DOMAIN || "mail-verifier.org";
const SMTP_MAIL_FROM = process.env.SMTP_MAIL_FROM || "verify@mail-verifier.org";

/**
 * Checks whether outbound SMTP probes (port 25) are enabled in this environment.
 */
function isSmtpProbingEnabled() {
  return process.env.ENABLE_SMTP_PROBES === "true" || process.env.USE_SOCKS5_PROXY === "true";
}

/**
 * Checks if a domain is a known major freemail provider.
 */
function isFreemailDomain(domain) {
  if (!domain) return false;
  return FREEMAIL_DOMAINS.has(domain.toLowerCase().trim());
}

/**
 * Creates socket either directly or via SOCKS5 proxy tunnel.
 */
async function createSmtpSocket(mxHost, timeoutMs) {
  const useSocks = process.env.USE_SOCKS5_PROXY === "true" || process.env.SOCKS5_PROXY_PORT;

  if (useSocks && SocksClient) {
    const socksHost = process.env.SOCKS5_PROXY_HOST || "127.0.0.1";
    const socksPort = parseInt(process.env.SOCKS5_PROXY_PORT || "1080", 10);

    const info = await SocksClient.createConnection({
      proxy: {
        host: socksHost,
        port: socksPort,
        type: 5
      },
      command: "connect",
      destination: {
        host: mxHost,
        port: DEFAULT_SMTP_PORT
      },
      timeout: timeoutMs
    });
    return info.socket;
  }

  return net.createConnection({ host: mxHost, port: DEFAULT_SMTP_PORT });
}

/**
 * Raw TCP SMTP probe against an MX host on port 25.
 * 
 * Sequence:
 *   1. Connect to MX host : 25
 *   2. Read server banner (220)
 *   3. Send EHLO <domain> (expect 250)
 *   4. Send MAIL FROM:<verify@mail-verifier.org> (expect 250)
 *   5. Send RCPT TO:<target@domain.com> (expect 2xx, 4xx, 5xx)
 *   6. Send QUIT (expect 221)
 *   * NEVER sends DATA *
 * 
 * @param {string} mxHost        Lowest-preference MX host (e.g. "aspmx.l.google.com")
 * @param {string} recipientEmail Target email to verify
 * @param {number} [timeoutMs=8000] Socket timeout
 * @returns {Promise<{ result: 'accepted'|'rejected'|'unknown', code: number, message: string, banner: string }>}
 */
async function probeSmtpMailbox(mxHost, recipientEmail, timeoutMs = DEFAULT_SMTP_TIMEOUT_MS) {
  if (!isSmtpProbingEnabled()) {
    return {
      result: SMTP_RESULTS.UNKNOWN,
      code: null,
      message: "SMTP probing is currently disabled via ENABLE_SMTP_PROBES configuration",
      banner: null,
      smtpGated: true
    };
  }

  if (!mxHost || !recipientEmail) {
    return {
      result: SMTP_RESULTS.UNKNOWN,
      code: null,
      message: "Missing MX host or recipient email for SMTP probe",
      banner: null,
      smtpGated: false
    };
  }

  return new Promise(async (resolve) => {
    let socket = null;
    let step = 0; // 0: banner, 1: ehlo, 2: mail_from, 3: rcpt_to, 4: quit
    let banner = "";
    let lastCode = null;
    let lastMessage = "";
    let resolved = false;

    const cleanupAndResolve = (result, code, msg) => {
      if (resolved) return;
      resolved = true;
      try {
        if (socket && !socket.destroyed) {
          socket.write("QUIT\r\n");
          socket.end();
          socket.destroy();
        }
      } catch (_) {}

      resolve({
        result,
        code,
        message: msg,
        banner: banner || null,
        smtpGated: false
      });
    };

    try {
      socket = await createSmtpSocket(mxHost, timeoutMs);
    } catch (err) {
      return cleanupAndResolve(
        SMTP_RESULTS.UNKNOWN,
        null,
        `Failed to establish connection to ${mxHost}:25 (${err.message})`
      );
    }

    socket.setTimeout(timeoutMs);

    socket.on("timeout", () => {
      cleanupAndResolve(
        SMTP_RESULTS.UNKNOWN,
        408,
        `SMTP connection to ${mxHost}:25 timed out after ${timeoutMs}ms`
      );
    });

    socket.on("error", (err) => {
      const isBlocked = err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "EHOSTUNREACH";
      cleanupAndResolve(
        SMTP_RESULTS.UNKNOWN,
        null,
        `SMTP socket error (${err.code || err.message})${isBlocked ? " - port 25 may be blocked" : ""}`
      );
    });

    let buffer = "";

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      
      // Wait for complete CRLF line
      if (!buffer.endsWith("\n")) {
        return;
      }

      const lines = buffer.split(/\r?\n/).filter(Boolean);
      buffer = "";

      for (const line of lines) {
        // SMTP response format: "250-..." (multiline) or "250 ..." (terminal line)
        const match = line.match(/^(\d{3})([ -])(.*)$/);
        if (!match) continue;

        const code = parseInt(match[1], 10);
        const isTerminal = match[2] === " ";
        const text = match[3];

        if (!isTerminal) continue; // wait for terminal line of multi-line reply

        lastCode = code;
        lastMessage = line;

        // Step 0: Initial Server Banner (expect 220)
        if (step === 0) {
          banner = text;
          if (code === 220) {
            step = 1;
            socket.write(`EHLO ${SMTP_HELO_DOMAIN}\r\n`);
          } else {
            cleanupAndResolve(SMTP_RESULTS.UNKNOWN, code, `Unexpected banner code: ${line}`);
          }
        }
        // Step 1: Response to EHLO (expect 250)
        else if (step === 1) {
          if (code === 250) {
            step = 2;
            socket.write(`MAIL FROM:<${SMTP_MAIL_FROM}>\r\n`);
          } else {
            // Fallback to HELO if EHLO not recognized
            step = 2;
            socket.write(`HELO ${SMTP_HELO_DOMAIN}\r\n`);
          }
        }
        // Step 2: Response to MAIL FROM (expect 250)
        else if (step === 2) {
          if (code === 250) {
            step = 3;
            socket.write(`RCPT TO:<${recipientEmail}>\r\n`);
          } else if (code >= 400 && code < 500) {
            cleanupAndResolve(SMTP_RESULTS.UNKNOWN, code, `Sender address temporary rejection: ${line}`);
          } else {
            cleanupAndResolve(SMTP_RESULTS.UNKNOWN, code, `Sender address rejected: ${line}`);
          }
        }
        // Step 3: Response to RCPT TO (Critical Step)
        else if (step === 3) {
          if (code >= 200 && code < 300) {
            // 250 OK: Mailbox accepted
            cleanupAndResolve(SMTP_RESULTS.ACCEPTED, code, `Mailbox accepted by MX host (${line})`);
          } else if (code >= 400 && code < 500) {
            // 4xx: Temporary failure / greylisting / rate limit
            cleanupAndResolve(SMTP_RESULTS.UNKNOWN, code, `Temporary failure/greylisting from MX host (${line})`);
          } else if (code >= 500 && code < 600) {
            // 5xx: Mailbox does not exist / user unknown / permanent failure
            cleanupAndResolve(SMTP_RESULTS.REJECTED, code, `Mailbox rejected by MX host (${line})`);
          } else {
            cleanupAndResolve(SMTP_RESULTS.UNKNOWN, code, `Unexpected RCPT response: ${line}`);
          }
        }
      }
    });
  });
}

module.exports = {
  probeSmtpMailbox,
  isSmtpProbingEnabled,
  isFreemailDomain,
  DEFAULT_SMTP_PORT
};

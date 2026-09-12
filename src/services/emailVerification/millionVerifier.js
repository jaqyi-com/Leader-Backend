"use strict";

const axios = require("axios");

const API_KEY = process.env.MILLIONVERIFIER_API_KEY || "OV7aZTbeRXTMuRixG9wliVpno";
const BASE_URL = "https://api.millionverifier.com/api/v3";

/**
 * Checks remaining credits on MillionVerifier.
 */
async function getCredits() {
  try {
    const res = await axios.get(`${BASE_URL}/credits`, {
      params: { api: API_KEY },
      timeout: 10000
    });
    return res.data;
  } catch (err) {
    throw new Error(`[MillionVerifier] Credits check failed: ${err.message}`);
  }
}

/**
 * Verifies a single email using MillionVerifier real-time API.
 * 
 * Result format:
 * {
 *   email: 'user@domain.com',
 *   quality: 'good' | 'bad' | 'risky',
 *   result: 'ok' | 'invalid' | 'catch_all' | 'unknown' | 'disposable',
 *   subresult: 'ok' | 'no_mailbox' | 'mailbox_full' | 'greylisted' | etc.,
 *   free: boolean,
 *   role: boolean,
 *   didyoumean: string,
 *   credits: number,
 *   livemode: boolean
 * }
 */
async function verifyEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return {
      email,
      quality: "bad",
      result: "invalid",
      subresult: "invalid_syntax",
      isValid: false
    };
  }

  const clean = email.trim().toLowerCase();

  try {
    const res = await axios.get(BASE_URL, {
      params: {
        api: API_KEY,
        email: clean
      },
      timeout: 15000
    });

    const data = res.data;
    const isValid = data.result === "ok" && data.quality === "good";

    return {
      email: clean,
      quality: data.quality,
      result: data.result,
      subresult: data.subresult,
      free: data.free,
      role: data.role,
      didyoumean: data.didyoumean || "",
      credits: data.credits,
      isValid
    };
  } catch (err) {
    return {
      email: clean,
      quality: "unknown",
      result: "unknown",
      subresult: err.message,
      isValid: false
    };
  }
}

module.exports = {
  verifyEmail,
  getCredits,
  API_KEY
};

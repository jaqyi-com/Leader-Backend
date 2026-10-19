/**
 * Single source of truth for the JWT signing secret.
 * Refuses to start without a real secret so tokens can never be signed with a guessable default.
 */
const INSECURE_DEFAULTS = new Set(["changeme-secret", "changeme", "secret", "your-secret-here"]);

function loadJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const placeholder = /change[-_ ]?(me|this)|your[-_ ]?secret|replace[-_ ]?me/i;
  if (!secret || INSECURE_DEFAULTS.has(secret.trim().toLowerCase()) || placeholder.test(secret)) {
    throw new Error(
      "[Auth] JWT_SECRET is missing or set to an insecure default. " +
      "Set a random value of at least 32 characters (e.g. `openssl rand -hex 32`) and restart."
    );
  }
  if (secret.length < 32) {
    console.warn("[Auth] ⚠ JWT_SECRET is shorter than 32 characters — use a longer random value.");
  }
  return secret;
}

module.exports = { JWT_SECRET: loadJwtSecret(), JWT_ALGORITHMS: ["HS256"] };

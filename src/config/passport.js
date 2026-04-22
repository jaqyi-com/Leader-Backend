const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const authService = require("../services/authService");

/**
 * Configure Google OAuth 2.0 Strategy.
 * Called once at server startup via configurePassport().
 */
function configurePassport() {
  // Only configure if credentials are present
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn("[Passport] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set. Google OAuth disabled.");
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email =
            profile.emails?.[0]?.value || `${profile.id}@google.com`;
          const avatar = profile.photos?.[0]?.value || null;

          const result = await authService.handleGoogleOAuth({
            googleId: profile.id,
            email,
            name: profile.displayName || email.split("@")[0],
            avatar,
          });

          done(null, result);
        } catch (err) {
          done(err, null);
        }
      }
    )
  );
}

module.exports = { configurePassport };

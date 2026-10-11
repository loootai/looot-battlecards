// Runs before `npm run demo`. The demo has no sign-in, so it refuses to start next to a real looot token
// unless an admin password is set. Same rule as src/lib/auth/policy.ts.
const env = process.env;
const hasAuth = !!(env.BATTLECARDS_ADMIN_PASSWORD_HASH?.trim() || (env.BATTLECARDS_ADMIN_PASSWORD && env.BATTLECARDS_ADMIN_PASSWORD.length >= 12));
if (env.LOOOT_TOKEN?.trim() && !hasAuth) {
  console.error("The demo has no sign-in and will not start while LOOOT_TOKEN is set.");
  console.error("Unset LOOOT_TOKEN, or set BATTLECARDS_ADMIN_PASSWORD (12+ characters) to sign in.");
  process.exit(1);
}

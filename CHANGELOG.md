# Changelog

Built from the GitHub release notes. Each version links to its release page.

## 0.1.4 (2026-10-11)

**Security fix. Earlier versions had no admin authentication.** Versions 0.1.3 and older served every page and API route of the web UI with no sign-in. Anyone who could reach a running copy could read the stored cards, download them, and start paid looot runs on the server's token. If you run v0.1.3 or older on a host other than your own machine, upgrade to v0.1.4 and set `BATTLECARDS_ADMIN_PASSWORD` (12 or more characters) before you expose it. The CLI is not affected.

What changed
- Every page and API route is public on purpose or admin. Admin routes need a signed session (httpOnly, SameSite=Lax cookie, 8 hours), a same-origin request and a CSRF token on writes. Without a password the admin routes answer 503 and /login shows a setup page.
- 4 public routes (health, login, two auth routes), 3 admin pages, 3 admin API routes.
- The spend cap for a web build is `BATTLECARDS_MAX_SPEND_USD` on the server (default $1). The cap field in the build form is gone and a cap sent in a request is ignored.
- /api/build needs the token that /api/quote issued for the same input, and is limited to 6 builds an hour per session.
- Card downloads need the session and are never cached.
- Security headers on every response.

Upgrade notes
- Set `BATTLECARDS_ADMIN_PASSWORD` or `BATTLECARDS_ADMIN_PASSWORD_HASH` (`npm run hash-password`).
- `npm run demo` still has no sign-in, but refuses to start while `LOOOT_TOKEN` is set.
- Behind a VPN or identity-aware proxy is still the stronger setup. See "Securing a deployment" in the README.

[Release page](https://github.com/loootai/looot-battlecards/releases/tag/v0.1.4)

## 0.1.3 (2026-10-10)

Sidebar: nested-item support in the shared shell

[Release page](https://github.com/loootai/looot-battlecards/releases/tag/v0.1.3)

## 0.1.2 (2026-10-10)

Sidebar layout.

[Release page](https://github.com/loootai/looot-battlecards/releases/tag/v0.1.2)

## 0.1.1 (2026-10-10)

Dependency security bump. next and eslint-config-next 16.3.7 to 16.3.8, which fixes six Next.js advisories (GHSA-3w37-wq28-93x7, GHSA-4jqv-mc3x-m676, GHSA-39w2-rjm5-chcv, GHSA-f87g-xv8r-7p7x, GHSA-mcj8-r9mp-w47p, GHSA-cjq9-62q9-8jv4). No code changes. v0.1.0 is unchanged.

[Release page](https://github.com/loootai/looot-battlecards/releases/tag/v0.1.1)

## 0.1.0 (2026-10-10)

First release. Plan, quote, build and export battlecards for 1 to 10 competitors on looot. Demo mode, CLI with --dry-run and a spend cap, web UI, Claude Code skill. No paid looot run was made: parsing is built from catalog docs and fixtures.

[Release page](https://github.com/loootai/looot-battlecards/releases/tag/v0.1.0)

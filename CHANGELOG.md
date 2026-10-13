# Changelog

Built from the GitHub release notes. Each version links to its release page.

## Unreleased

- Fix: the sign-in form could not be used in a browser. Chrome sends `Origin: null` for a same-origin form post under `Referrer-Policy: no-referrer`, and the same-origin check refused it with 403. The check now falls back to `Sec-Fetch-Site` for `null`.

## 0.1.5 (2026-10-11)

Spend limits, version 2. Before this, a build was limited only by the cap per build, an in-memory rate limit and the token balance. Nothing limited spend across builds, two builds started together could both pass, a key with the day in it made a repeat on a new day pay again, and the cap in the engine was checked against a counter that each run kept for itself.

What changed

- Period budget: a daily and a monthly amount (UTC), $10 and $50 by default, saved in `budget.json` in `LOOOT_BATTLECARDS_DATA_DIR` (default `.looot-data`). The signed-in owner changes it on the new Costs page (`PUT /api/budget`, session and CSRF token). `LOOOT_BATTLECARDS_DAILY_USD` and `LOOOT_BATTLECARDS_MONTHLY_USD` set the starting values. A build request cannot raise it, and one that carries a budget field is refused with 400. The cap per build still comes only from the server (`BATTLECARDS_MAX_SPEND_USD`); a cap in a request is ignored.
- Check order: the quote, the cap per build, an atomic reservation against the period budget, then the call.
- Reserve then settle: each paid call reserves its list price under a lock file before it is made, and is refused if used plus reserved plus the price would pass either budget. The reservation becomes the real cost when the call ends and goes back when looot answers with an error. A call still running keeps it and is never counted as $0. The next build looks up pending calls with `GET /v1/runs/{id}` and settles them. A reservation that cannot be looked up is released after 24 hours.
- Stable keys: the key was a hash of the input plus the day. It is now a hash of the competitor, signal, endpoint and normalised input, plus a 7-day refresh window (`floor(time / 7 days)`). No date or clock time goes in. No call input carries a date: the news search uses the relative window `qdr:m`, and a test fails if one appears. `--fresh <tag>` gives every call a new stable key for the tag.
- Stored results: a finished call is stored for 40 days under its key, so the same request is answered with no call and no charge. The up-front budget check ignores calls that have a stored answer.
- Per-run cap race fixed: calls started together now count against the cap before the first await, so they cannot all pass.
- The sidebar spend panel and the Costs page show used, reserved and remaining for today and this month. The CLI prints what is left before a run and takes `--partial` and `--fresh`.
- Call status `skipped_budget` is new: a section skipped because the period budget was reached.

For upgraders

- No migration. This repo has no database. `budget.json` is a new file. Run one instance on a persistent disk, since the file is not shared between hosts.
- `/api/budget` and `/costs` are new admin routes. The route map and its tests include them.
- Keys changed shape, so the first build after upgrading pays once for calls that ran earlier. Cards are now reused for 7 days instead of 1 day, so a second build on the next day is free. Pass `--fresh <tag>` in the CLI to look again sooner.

[Release page](https://github.com/loootai/looot-battlecards/releases/tag/v0.1.5)

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

> Bot-strength fix: 56 local unit/UI/integration checks passed, including reproduced hanging-queen and mate-in-one blunders, tactical Easy play, capture-only legality and search-deadline progress. Full browser coverage includes actual-worker queen defence and preserving its candidate on worker failure; see PR #2 for the final CI result.

> Bot/responsive update: build and 52 local tests passed. Adds actual-worker browser coverage for all difficulties, cancellation, black-side play, restore, promotion, timeout, paired undo, rematches and 21 device/board combinations; see the latest GitHub CI run for browser results.

> Update: fixed Vercel empty-output rejection with generated robots.txt; public access is now the default. Earlier private-mode test results below describe the optional gate.

# Verification record

Prepared September 28, 2026; renamed to Cubic Chess on September 29, 2026. Verification uses Node.js 24.19.0.

## Completed here

| Check | Result |
| --- | --- |
| Build/syntax, server entry import and restricted static output | Passed |
| Official Vercel Node builder (`@vercel/node` 16.0.1) | Passed; Node 24 Lambda created with protected assets and schema included |
| Engine, theme, records/search, DOM UI and browser client tests | 27 passed |
| HTTP, password gate, WebSockets, multiplayer and PostgreSQL SQL integration | 21 passed with portable PostgreSQL |
| Production dependency audit (`npm audit --omit=dev`) | No reported vulnerabilities at preparation time |
| Features retained from the previous Sites snapshot | Rules, application behavior, themes, CSS, setup, piece assets, favicon and result/export behavior retained; branding updated to Cubic Chess |

**48 automated tests passed again after the rename on September 29, 2026.** PostgreSQL integration was executed using PGlite (PostgreSQL compiled to WASM). Requests alternated between two independent HTTP servers over the same database. Native `pg` connections are used by production and by the full CI suite.

### Behaviors exercised

- Legal 3D movement, castling, king safety, en passant, promotion, all dimension presets/custom bounds, turns and game endings.
- Local saved position, undo, configuration, clock display, themes, guide/navigation, result view and local rematch archive.
- Private pages/assets/API, fail-closed configuration, origin checks, password rotation, logout and database-backed login throttling.
- Exclusive seats, out-of-turn/illegal actions, stale revisions, immediate retry handling, concurrent moves and room-creation quota.
- Listed versus unlisted rooms, hidden seat hashes, unauthorized room reads, cancellation and expiry.
- Actual HTTP/WebSocket connections, one-time tickets, ticket expiry, snapshots after joins/moves/draw/resignation, reconnect and shared database updates.
- Long-poll updates, client fallback and reconnect behavior, stale response protection, server clock expiry and increment.
- Finished results, opponent-approved rematches, swapped seats, unchanged settings, preserved previous result and a single child match on concurrent acceptance.

## GitHub Actions verification

[Successful run — September 29, 2026](https://github.com/ssrivats1601-dev/cubic-chess/actions/runs/36586433419)

Tested application commit: `4fbb0b6daf6386cc1bad1eb945e7d96bc2a947d6`. Later documentation-only commits do not change the tested runtime.

| CI check | Result |
| --- | --- |
| Clean `npm ci` and production build checks | Passed |
| Engine, theme, records/search, DOM UI and client tests | 27 passed |
| HTTP/WebSocket/security/concurrency tests using native PostgreSQL 17 | 21 passed |
| Chromium desktop and touch/mobile gameplay | Passed |
| Responsive layouts at 320, 390, 768, 1024 and 1440 pixels | Passed |
| Two independent browsers, WebSocket and long-poll fallback, stale-response rejection, socket renewal and network-loss recovery | Passed |
| Listed/unlisted rooms, turns, draws and resignation | Passed |
| Browser runtime errors | None detected |

The tested move appeared in the second browser after 409 ms on this CI run. This is a measured test result, not a production latency guarantee. Browser screenshots are available in the run's `browser-results` artifact. The native PostgreSQL and Chromium checks that were unavailable locally are now completed in CI.

## Remaining deployment checks

- Source is published in the public `ssrivats1601-dev/cubic-chess` repository with the owner's approval. The website retains its password gate.
- No Vercel deployment, Vercel account settings, hosted provider database or production smoke test was executed. Configure the three variables in README and follow `docs/DEPLOYMENT.md` after deploying.
- Existing Sites database rows and origin-scoped browser identities are not imported.

Future runtime changes should pass `npm run check` and `npm run test:browser` before promotion. Keep the deployed website password-protected.

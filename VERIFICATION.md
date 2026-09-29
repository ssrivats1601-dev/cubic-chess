# Verification record

Prepared September 28, 2026; renamed to Cubic Chess on September 29, 2026. Verification uses Node.js 24.19.0.

## Completed here

| Check | Result |
| --- | --- |
| Build/syntax, server entry import and empty public output | Passed |
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

## Limits of this verification

- Native PostgreSQL could not start in this workspace. PGlite serializes database connections and therefore does not prove native PostgreSQL's behavior under transaction contention. The included GitHub Actions job runs the same suite against PostgreSQL 17 to cover that remaining check.
- The Chromium download could not complete here. Desktop/touch browser suites are included in CI but have **not been run in this workspace**. DOM/UI tests passed; screenshots and real browser layout checks remain a CI gate.
- The owner authorized publication to the public `ssrivats1601-dev/cubic-chess` repository on September 29, 2026. No Vercel deployment, Vercel account settings, real provider database or production smoke test was executed. Follow `docs/DEPLOYMENT.md` after deploying.
- The source preserves the existing feature set; it does not import existing Sites database rows or origin-scoped browser identities.

Run `npm run check` against a disposable native PostgreSQL test database, then `npm run test:browser`, before promoting a real deployment. Keep the deployed website password-protected while doing so.

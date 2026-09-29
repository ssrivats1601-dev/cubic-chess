# Architecture

## Sources of truth

- `src/engine.js` is shared by the browser and server. The server validates moves independently of browser hints.
- PostgreSQL owns online rooms, hashed seats, revisions, player presence, clocks, draw offers and rematch links.
- Local games, preferences and the random seat secret belong to the browser's local storage.
- Function instances own only disposable connection objects, timers and a database pool.

## Commit model

Ordinary room actions use compare-and-swap updates: `UPDATE ... WHERE code = ... AND revision = ...`, incrementing the revision exactly once. Stale/concurrent actions return HTTP 409, and the client refreshes. The latest action's identifier is hashed with the player secret hash to recognize an immediate retry. Old actions cannot overwrite a newer revision. A disconnected browser never grants itself an online move locally.

Rematch acceptance inserts a new room with swapped players and links it from the finished room in one **SERIALIZABLE** transaction. PostgreSQL serialization/deadlock conflicts become a retryable 409 response. The old result stays finished. Waiting-room creation also uses a serializable guarded insert, maintaining the three-waiting-room quota under concurrent requests.

The SQL adapter translates only internally authored `?` placeholders to numbered PostgreSQL parameters. Player inputs are bound values. Dynamic column names are chosen by the server, never supplied by the client. Millisecond timestamp columns are BIGINT and are decoded as numbers within JavaScript's safe date range.

## Access layers

1. Shared site password: HMAC-signed, HttpOnly, SameSite=Strict 12-hour cookie; Secure on Vercel. Either password or session-secret rotation invalidates previous cookies.
2. Browser seat secret: 256-bit random value sent in an HTTP header. Only a SHA-256 hash is stored in the room.
3. Room membership: only seated players can read that match or act on it. Unlisted rooms are hidden from discovery.
4. WebSocket tickets: 256-bit random value, hashed in the database, valid for 30 seconds, consumed once atomically. An upgrade also requires the site cookie and same-origin validation.

Sign-in attempts use an atomic database counter keyed by a keyed hash of the source IP. A Vercel deployment uses its platform-forwarded client IP; local development uses the socket address. Raw passwords, raw player tokens and database URLs are not logged.

HTML, scripts and assets all go through the Node handler; the static output folder stays empty. API responses and assets are private/no-store. CSP, frame restrictions, noindex and same-origin checks accompany the gate. The app does not expose anonymous spectators or public game records.

This shared-password model has no account directory, per-person revocation, OAuth, invitation emails or cross-device seat recovery. It is not a replica of the original Sites identity system.

## Realtime

Authenticated HTTP commands commit changes; socket connections distribute snapshots. Sockets on different instances read the same database, so no process-local room map or sticky-session requirement exists. Slow sockets are closed, incoming socket messages cannot mutate matches, and renewed connections reload state. Client revision checks prevent late HTTP responses from rolling back a newer socket snapshot.

Vercel's maximum function duration is handled by deliberate socket renewal plus automatic fallback. PostgreSQL supplies durability; WebSockets are delivery channels, not storage.

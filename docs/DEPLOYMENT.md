> Current default: public website; only DATABASE_URL is required. Password/session instructions below apply only when SITE_ACCESS=private.

# Deployment and operations

## Required configuration

`vercel.json` selects the plain Node function, Fluid compute, a 60-second request limit, protected asset inclusion, and a catch-all rewrite to `api/server.js`. All app files are read by that function after authorization. `public/` contains only a generated robots.txt, satisfying Vercel’s nonempty output requirement. The build rejects all other static files.

The function does not listen on its own port. Vercel owns the HTTP listener. `scripts/dev.mjs` starts the same server locally. `DATABASE_URL`, `SITE_PASSWORD` and `SESSION_SECRET` are read only on the server. Public access is the default. Set SITE_ACCESS=private explicitly to enable the optional password gate; missing secrets then close access.

Use a pooled PostgreSQL URL and choose a nearby database region in your Vercel project settings. Each warm instance permits up to five database connections, released after use. Vercel's `attachDatabasePool` handles idle connections on instance suspension. Preserve provider TLS options; do not disable certificate validation.

## Production smoke test

Run this after the first actual Vercel deployment, which has not been performed for this export:

1. Open the URL in an incognito window. Check that `/`, `/app.js` and `/api/health` cannot expose app content before signing in.
2. Sign in in two independent browser profiles with different names. A normal tab shares its seat identity with other tabs in the same profile.
3. Create a listed 8×8×8 room in one profile. Find it through **Open rooms**, filter by host name, and join from the other profile.
4. Move the white knight from `1b1` to `3b2`, then the black knight from `1b8` to `3b7`. Verify both boards and move histories update without refresh.
5. Leave the game open for over a minute. Confirm automatic connection renewal. Disable one browser's network temporarily, make a move in the other, then reconnect and verify the latest position.
6. Block `/api/socket-ticket` in one browser's network tools and reload. Confirm the status changes to automatic updates and moves still synchronize. Unblock it and reload when done.
7. Offer and accept a draw. Check the result and download a move record. Offer a rematch; accept from the opponent, open it in both profiles and verify swapped colors and reset clocks.
8. Create an unlisted room. Confirm it is absent from the other player's open-room listing, then join with the code.
9. Create a 4×4×4 game with a one-minute clock. Verify layer navigation, clock synchronization and timeout adjudication.
10. Check all six themes on a mobile-width screen, then play/restore a local game. Sign out and confirm the cookie no longer grants browser access.

## Clock and transport behavior

The server validates every move and commits it before acknowledging it. Clients display the clock using the timestamp from the server, refreshed by socket messages or API replies. The elapsed balance is computed from saved clock state, so it continues through disconnects and server restarts. Expiry is finalized on the next read or action; no permanent background timer is required. A timeout loses regardless of the opponent's material, as in the retained variant rules.

Room connections poll authoritative storage every 500 ms; lobby connections every 1 second. Unchanged connections get heartbeats every 3 seconds. The browser reconnects when the function ends or heartbeat stops, obtaining a fresh one-time ticket and the current database snapshot. Long polling checks for updates every 250 ms for up to 5 seconds per request. These are live updates with network/database latency, not a guarantee of zero delay.

This design is intended for a private group. Active connections generate database reads. Watch database connection, request duration and usage limits on your selected hosting plans before inviting a large audience.

## Common problems

| Symptom | Check |
| --- | --- |
| Setup required / HTTP 503 at home | Password must be 12+ characters, session secret 32+; set them for the deployment environment and redeploy |
| Sign-in temporarily unavailable | Database URL, provider connectivity/TLS, table-creation permission and provider limits |
| Too many sign-in attempts | Ten attempts per source IP in 15 minutes; the counter is shared across server instances |
| Automatic updates instead of Live | Socket upgrades may be unavailable or blocked; long polling is the intended fallback |
| Repeated disconnected status | Database connectivity, expired site session, connection limits, or an expired room |
| Cannot rejoin seat after clearing storage | Browser seat secret was deleted; no account recovery exists |
| Empty room list after moving from Sites | New database/origin starts separately; see migration notes |
| Test refuses database URL | Use `TEST_DATABASE_URL` with a disposable database name ending in `_test` |
| Docker test database missing | Initialization scripts run only on a new data volume; create the test database manually as shown in README |

## Backups and updates

Use the database provider's backups or `pg_dump` to back up the database before modifying its schema. Keep credentials outside Git. The schema currently consists of additive `CREATE IF NOT EXISTS` statements; future schema changes need explicit migration steps and versioning.

Run CI before promoting changes. New deployments read the same external database, and clients reconnect when old socket connections end. No game data is stored in Vercel's temporary filesystem.

Rotate `SITE_PASSWORD` or `SESSION_SECRET` to invalidate existing sessions. Cookies expire after 12 hours. Existing socket sessions stop within 45 seconds and require valid access before reconnecting. Share the new password only with intended players.

To remove physically expired rows, run `npm run db:cleanup` with the intended `DATABASE_URL`. It does not remove unexpired games. This package does not add a Vercel cron requirement.

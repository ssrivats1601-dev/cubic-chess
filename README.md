# Cubic Chess · realtime 3D chess

A complete GitHub-ready application for **Vercel + PostgreSQL**, adapted from the existing 3D chess site. Includes frontend, chess engine, server, local SVG assets, database schema, pinned dependencies, automated tests, and deployment configuration.

Source repository: [ssrivats1601-dev/cubic-chess](https://github.com/ssrivats1601-dev/cubic-chess). The source is public; the website opens without a shared password by default. The existing Sites deployment is separate.

## What is retained

| Feature | Implementation |
| --- | --- |
| 3D chess | Layer 1–8, files a–h, ranks 1–8; starting pieces on layer 1; king, rook, bishop, queen, knight and pawn rules |
| Computer opponent | Easy, Medium, Hard and Expert; either color; module-worker search, paired undo, saved games and every board variant |
| Legal games | Turns, blockers, check, mate, stalemate, castling on layer 1, promotion, en passant, repetition and king-only draws |
| Variants | 4×4×4, 6×6×6, 8×8×4, 8×8×8, single-floor and custom 4–8 files × 4–8 ranks × 1–8 layers |
| Clocks | Untimed or 1–180 minutes, increment 0–60 seconds; server decides online timeouts |
| Internet play | Shared lobby, listed/unlisted rooms, room-code invitations, exclusive seats and presence |
| Live updates | WebSockets, automatic renewal/reconnection, heartbeat detection and long-poll fallback |
| Dedicated pages | Lobby, open-room search, new game, my matches, instructions, variants/clocks, appearance and match |
| Appearance | Six complete themes, saved preference, responsive desktop/mobile boards, keyboard navigation, layer previews and move hints |
| Match endings | Result summary, final-board inspection, draw offers, resignation, opponent-approved rematches with colors swapped |
| Records/local play | Move-record download, persistent local game, undo, local rematch and last 10 completed local results |
| Removed pieces | No Jester, Count, reserves or drops |

See [feature and rule details](docs/FEATURES.md) and [verification results](VERIFICATION.md).

## Deploy to Vercel

### 1. Import this GitHub repository

In Vercel, select **Add New → Project** and import `ssrivats1601-dev/cubic-chess`. Keep the root directory at the repository root and the framework preset at **Other**. The committed `vercel.json` supplies the install command, build command, output directory, routing, Fluid compute and function duration; `package.json` selects Node.js 24. No source changes are required.

To work locally, clone it with:

```sh
git clone https://github.com/ssrivats1601-dev/cubic-chess.git
cd cubic-chess
```

The public repository contains no production credentials. Configure the three server-side variables below in Vercel before deploying. Multiplayer needs an external PostgreSQL database; connecting Git alone cannot create its credentials.

### 2. Create a PostgreSQL database

Use a PostgreSQL provider such as Neon or Supabase (also available through Vercel's storage marketplace). Copy its **pooled PostgreSQL connection string**. Keep the TLS settings supplied by your provider. Use a database dedicated to Cubic Chess.

Cubic Chess uses `pg` over TCP and needs a database role permitted to create its tables and indexes. The schema is applied safely on first database use, coordinated across cold starts. You can also run `npm run db:migrate` yourself. Builds do not connect to the database.

### 3. Import the repository into Vercel

Choose **Add New → Project → Import Git Repository**. Use these settings:

| Setting | Value |
| --- | --- |
| Framework preset | Other |
| Root directory | Project root containing `package.json` |
| Node.js | 24.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `public` (generated robots.txt only) |
| Fluid compute | Enabled by `vercel.json` |

Add these **server-side environment variables** before deployment:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your pooled PostgreSQL URL, including its TLS options |
| `SITE_PASSWORD` | Optional: only used with `SITE_ACCESS=private` |
| `SESSION_SECRET` | Optional: only used with `SITE_ACCESS=private` |

Generate a secret locally with `openssl rand -hex 32`, or run `npm run setup` and read the generated `.env`. Do not use `NEXT_PUBLIC_`, `VITE_`, or any other client-exposed prefix for these values.

Use separate databases/secrets for Production and Preview if you enable preview deployments. Don't set `TEST_DATABASE_URL` on Vercel. `VERCEL` is supplied by the platform.

### 4. Deploy and verify access

The app opens directly, without a site password. Only DATABASE_URL is required for online play. Old SITE_PASSWORD and SESSION_SECRET values do not enable the gate. Optional private hosting requires SITE_ACCESS=private, a 12-character password and a 32-character session secret.

After deployment, use the [production smoke test](docs/DEPLOYMENT.md#production-smoke-test). Listed rooms are visible to visitors; unlisted rooms require the code. Player seat tokens still protect moves.

Vercel currently documents native WebSockets in Functions as beta, with Fluid compute required. Connections have a maximum lifetime. Cubic Chess renews its sockets after 45 seconds and reloads state from PostgreSQL. If upgrades are unavailable, automatic long-poll updates preserve multiplayer. Provider limits and actual latency still apply.

## Run locally

Requires Node.js 24, npm, and PostgreSQL. Docker Compose is one convenient way to run the database:

```sh
npm ci
npm run setup
docker compose up -d --wait
npm run db:migrate
npm start
```

Open **http://127.0.0.1:3000** to play directly. The local server and database bind to loopback. Two separate browser profiles give you two player identities.

If Docker is unavailable, point `DATABASE_URL` in `.env` at your PostgreSQL server. The app itself has no Cloudflare, Sites, OpenAI API, CDN asset or paid font dependency. npm downloads the exact dependencies in `package-lock.json`; dependencies are not vendored into the repository.

## Test

```sh
npm run build
npm run test:portable
```

The portable suite uses PostgreSQL compiled to WASM and requires no separate database. It tests SQL and game behavior but serializes database connections, so it cannot establish native PostgreSQL transaction isolation under contention.

For the complete native PostgreSQL and browser suites:

```sh
docker compose up -d --wait
npm test
npx playwright install --with-deps chromium
npm run test:browser
```

`npm test` uses `TEST_DATABASE_URL` in `.env`, and **deletes game data in that test database**. It requires a database name ending in `_test` and never falls back to `DATABASE_URL`. Docker creates `cubic_chess_test` on its first initialization. If an older Docker volume lacks it, run:

```sh
docker compose exec database createdb -U cubic_chess cubic_chess_test
```

GitHub Actions runs the native PostgreSQL and browser suites on pushes and pull requests. See [VERIFICATION.md](VERIFICATION.md) for what was actually run when this package was prepared.

## Project map

| Path | Purpose |
| --- | --- |
| `src/` | All frontend source, shared chess engine and SVG assets |
| `api/server.js` | Exported Vercel HTTP/WebSocket server entry |
| `server/` | Password sessions, HTTP routing, multiplayer API, socket updates and PostgreSQL adapter |
| `migrations/` | PostgreSQL schema |
| `scripts/` | Build checks, local server, setup, migrations and cleanup |
| `tests/` | Engine, UI, client, security, database, integration and browser tests |
| `.github/workflows/ci.yml` | Native PostgreSQL + browser CI |
| `docs/` | Deployment, architecture, privacy, feature and migration notes |

## Data and access

Seats belong to a random secret saved in that browser's local storage. The server keeps only a hash. Clearing site data loses that seat identity; there is no email/account recovery. The shared site password is a private access gate, not individual user registration.

Waiting rooms expire after 30 minutes. Joined rooms are retained for seven days from joining, a move or rematch activity. The list shows at most 40 waiting rooms and eight of your online matches. Download records you want to keep. Local history is stored only in the browser. `npm run db:cleanup` deletes already expired rows; schedule it externally if you need physical cleanup.

Existing Sites rooms and browser saves **do not automatically transfer to a new Vercel origin/database**. This package preserves features and code. See [migration notes](docs/MIGRATION.md) before moving existing players.

The repository is public by the owner's choice. Website access still requires its configured password. No open-source license is granted for the project by this package; third-party packages retain their respective licenses.

## Hosting references

Checked September 29, 2026:

- [Vercel WebSockets](https://vercel.com/docs/functions/websockets)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel connection pooling](https://vercel.com/kb/guide/connection-pooling-with-functions)
- [PostgreSQL providers through Vercel](https://vercel.com/docs/postgres)

## Playing the computer

Open New game, choose Computer opponent under On-device game, choose a difficulty and your color, then Start bot game. Easy selects random legal moves; Medium scores captures and safety; Hard and Expert search progressively deeper within 1.2 and 2.5 second budgets. These levels have no Elo rating. Search runs in a worker, with a legal-move fallback if workers are unavailable. Bot games need no database connection and save on the current browser. Undo returns to your previous turn; automatic draw rules, promotion, clocks, resignation and rematches are supported. Human draw-agreement controls are hidden in bot games.

The board fits the viewport and keeps square cells on rectangular variants. Tablet layouts put match details below the board, and mobile controls use touch-friendly sizing.

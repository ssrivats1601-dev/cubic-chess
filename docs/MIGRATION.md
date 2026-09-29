# From the Sites version

This repository adapts the source snapshot `acd25a803986d0c731fc89260116d7b25fe35f0b` into a standalone Node/PostgreSQL application. It does not modify or redeploy the original Sites project.

## Changes needed for another host

| Original | This repository |
| --- | --- |
| Cloudflare Worker entry | Native Node HTTP server exported to Vercel |
| D1/SQLite database | External PostgreSQL with pooled connections |
| Worker WebSocketPair | Native `ws` server with renewable sockets |
| Sites access control | Application password gate and optional Vercel protection |
| Sites deployment manifest | `vercel.json`, GitHub Actions and Docker Compose |
| Local Miniflare runtime | Same Node HTTP server used in production |

The game engine, configuration, six themes, pages and result/export logic are retained. The display name, page titles, access form, match-record exports, package and documentation now use Cubic Chess. Existing `cubehouse.*` browser storage keys and the access cookie name are intentionally retained so an upgrade on the same origin preserves local games, themes and player identities. Frontend changes add Sign out, redirect an expired site session to sign-in, and clear connection watchdogs when stopping a subscription.

## Existing data

A new PostgreSQL database starts with no rooms. Browser storage is tied to the website origin: a Vercel URL does not inherit the original site's player secret, local game, local results or theme preference. Importing room rows without transferring player identities would leave those seats inaccessible.

Before switching existing players, finish active matches and download any move records they need. Start new rooms on Vercel. Existing Sites records remain governed by the original site's retention policy.

No production database data or player secrets are bundled. No automatic migration/import endpoint is enabled. If historical room transfer is later required, plan a separate, authorized migration with backups, schema conversion and an explicit way to recover the corresponding player identities.

## Scope

This is a complete source repository, not a copy of the previous large offline dependency archive. `package-lock.json` pins dependency resolution and `npm ci` installs it. npm registry access is needed for a first install. PostgreSQL is a separately running service locally or a managed database in production.

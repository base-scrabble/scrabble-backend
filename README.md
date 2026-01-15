# Based Scrabble Backend

Backend API + Socket.IO server for the Based Scrabble app at https://basescrabble.xyz.

**Current reality (important):** the live app is **free-to-play + waitlist**. Any “staked/on-chain settlement” plumbing that exists in this repo should be treated as **optional / not enabled by default** unless you explicitly turn it on.

## Tech stack

- Node.js (see `engines.node` in `package.json`)
- Express + Socket.IO
- Prisma + Postgres (Neon in production)

## Deployments (current)

- **Frontend:** Vercel
- **Backend:** Fly.io
- **Database:** Neon Postgres

## API surface

All routes are mounted under `/api` in `server.cjs`.

- `GET /api/health` — health check
- `POST /api/waitlist/join` — join waitlist
- `GET /api/waitlist/:code` — referral stats
- `GET /api/waitlist/:code/referrals` — referral count
- `POST /api/gameplay/create`, `POST /api/gameplay/:gameId/join`, ... — gameplay endpoints
- Socket.IO at `/socket.io`

## Local development

### Prerequisites

- Node.js `22.x`
- A Postgres database (local Docker, local Postgres, or Neon)

### 1) Install

```bash
cd scrabble-backend
npm install
```

### 2) Configure environment

Create a `.env` (or set environment variables in your shell).

Minimum for local dev:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
JWT_SECRET=change-me
PORT=3000
```

Optional / only if you explicitly enable blockchain-related background services:

```bash
# Turn services off explicitly (recommended for local dev)
ENABLE_BLOCKCHAIN_LISTENER=false
ENABLE_SUBMITTER=false

# If you enable them, you will also need chain RPC + contract + signer settings.
RPC_URL=
RPC_WSS_URL=
SCRABBLE_GAME_ADDRESS=
BACKEND_SIGNER_PRIVATE_KEY=
SUBMITTER_PRIVATE_KEY=
```

### 3) Database migrations

This repo uses Prisma migrations in `prisma/migrations`.

- Local-only (safe for your own dev DB):

```bash
npm run migrate
```

- Shared/staging/prod DBs: prefer `npx prisma migrate deploy` (do not generate new migrations from a prod DB).

### 4) Run the server

```bash
npm run dev
```

Health check:

- http://localhost:3000/api/health

## Tests

Run the backend test suite:

```bash
npm test
```

Notes:

- `npm test` runs `vitest run` (non-watch) so it exits cleanly.
- The settlement smoke test is implemented as a Vitest suite in `tests/settlementSmoke.test.cjs`.
- Vitest globals are enabled via `vitest.config.js` so the `.cjs` test does not need to import Vitest.

### Frontend integration note (dev ports)

The frontend Vite dev proxy in `scrabble-frontend/vite.config.js` targets `http://localhost:8000` by default.

You have two options:

1) Set `PORT=8000` for the backend when running locally, **or**
2) Update the Vite proxy target to match your backend port.

## CORS

Allowed origins are enforced via a hardcoded allowlist in `server.cjs` (includes localhost dev ports and the production domain).

If you are developing from a new origin (e.g. a different LAN IP/port), you may need to add it to the allowlist.

## Prisma safety (production)

- Do **not** run destructive commands (like `migrate reset`) on production.
- Avoid editing Prisma schema/migrations without explicit approval.

## License

See the repository license.
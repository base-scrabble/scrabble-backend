# Fly.io (local scaffolding)

This repo now includes local-only Fly.io deployment scaffolding:

- Dockerfile: `scrabble-backend/Dockerfile`
- Fly config: `scrabble-backend/fly.toml`

Do **not** deploy or push until explicitly approved.

## Readiness / health

This repo also exposes a readiness endpoint:

- `GET /api/ready` — checks DB connectivity via Prisma (`SELECT 1`), returns `200` when ready, `503` when not.

Fly is configured to gate traffic on `/api/ready`.

Important: keep `/api/health` fast and dependency-light so Fly can gate traffic correctly.

## Env vars / secrets mapping

### Required for a normal production backend

### Production boot behavior (recommended for Fly)

- `FAIL_FAST_ON_DB=true` — if Prisma fails to connect during boot, the process exits so Fly can restart it.
- `DB_CONNECT_TIMEOUT_MS` — optional boot-time DB connect timeout (default 8000ms). Helps avoid hanging boots.
- `READY_TIMEOUT_MS` — optional `/api/ready` DB-check timeout override (default 1500ms).

- `DATABASE_URL` (Postgres URL; used by Prisma)
- `JWT_SECRET` (JWT signing/verifying)
- `PRIVY_JWKS_URL` (Privy JWKS URI)

### Strongly recommended explicit toggles (optional)

These default to enabled unless set to `false`.

- `ENABLE_BLOCKCHAIN_LISTENER=false` (recommended for initial bring-up)
- `ENABLE_SUBMITTER=false` (recommended for initial bring-up)

### Required only if you enable blockchain listener/submitter

- `RPC_URL`
- `RPC_WSS_URL`
- `SCRABBLE_GAME_ADDRESS`
- `BACKEND_SIGNER_PRIVATE_KEY`
- `SUBMITTER_PRIVATE_KEY`
- `CHAIN_ID`
- `WALLET_ADDRESS`

### Optional tuning

- `LISTENER_MAX_RECONNECTS`
- `LISTENER_RECONNECT_DELAY_MS`
- `SUBMITTER_CHECK_CRON`
- `SUBMITTER_MAX_ATTEMPTS`

## Fail-fast DB behavior (recommended on Fly)

If `FAIL_FAST_ON_DB=true`, the process exits when Prisma cannot connect during startup. This prevents Fly from routing traffic to an instance that can't reach the database.

## CORS: allowing Fly hostnames

CORS is enforced via an allowlist in `server.cjs`.

To avoid hardcoding future Fly hostnames/domains, you can set:

- `CORS_ALLOWED_ORIGINS` — comma-separated full origins (e.g. `https://myapp.fly.dev,https://api.basescrabble.xyz`)
- `CORS_ALLOWED_HOST_SUFFIXES` — comma-separated hostname suffixes (e.g. `.fly.dev,.basescrabble.xyz`)

If Fly provides `FLY_APP_NAME`, the backend automatically allows `https://$FLY_APP_NAME.fly.dev`.

## Local (no deploy) sanity commands

From `scrabble-backend/`:

- Build image: `docker build -t scrabble-backend:fly .`
- Run container: `docker run --rm -p 3000:3000 --env-file .env scrabble-backend:fly`

Fly CLI (still no deploy):

- Validate config: `fly config validate -c fly.toml`

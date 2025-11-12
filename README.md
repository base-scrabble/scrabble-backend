🧩 Based Scrabble Backend

Backend API powering the Based Scrabble Farcaster Mini App — built on Base Chain, deployed on Render, and integrated with QuickNode RPC and NeonDB (PostgreSQL).

🚀 Overview

This backend handles:

Real-time multiplayer gameplay (Socket.IO)

Secure authentication (JWT)

Word validation with Scrabble dictionary

Blockchain event syncing (via Ethers + QuickNode RPC)

Automated on-chain result submission (Submitter Service)

Tournament scheduling and leaderboard tracking

Owner CMS data feed and analytics

All major logic runs on Node.js + Express + Prisma, with live WebSocket listeners connected to Base Sepolia for development and Base Mainnet for production.

🧠 Core Features
Category	Description
⚡ Gameplay	Real-time multiplayer Scrabble engine via Socket.IO
🔐 Auth	JWT tokens + bcrypt password hashing
📚 Dictionary	Built-in Scrabble dictionary (off-chain validation)
🧱 Blockchain	Ethers v6 listener + QuickNode RPC/WSS dual provider
🪄 Backend Signer	EIP-712 signatures for deposit/join/cancel actions
🧾 Submitter Service	Automated on-chain submitResult() calls
⛓️ Event Sync	Listener auto-updates DB on GameFinished/TournamentConcluded
🧮 Prisma	NeonDB (PostgreSQL) ORM with type-safe queries
🛠️ Deployment	Render backend + Vercel frontend + QuickNode Base Sepolia RPC
🪩 Monitoring	Tournament scheduler, reconnect logic, error logging
🧩 Tech Stack

Backend:
Node.js | Express | Socket.IO | Ethers.js | Prisma | PostgreSQL (NeonDB)

Blockchain:
Base Chain (Sepolia → Mainnet) | QuickNode RPC | EIP-712 Signatures | Backend Signer | Submitter Automation

Deployment:
Render (backend API + Socket.IO) | Vercel (frontend) | NeonDB (Postgres pooler)

⚙️ Environment Variables (.env)
# Base config
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://based-scrabble.vercel.app

# Database (NeonDB)
DATABASE_URL=postgresql://USER:PASSWORD@ep-restless-dream-ad2gmxrg-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require

# Prisma connection pool tuning
PGSSLMODE=require
LISTENER_MAX_RECONNECTS=5
LISTENER_RECONNECT_DELAY_MS=30000

# Blockchain (Base chain via QuickNode)
SCRABBLE_GAME_ADDRESS=0xED92f4334f80A8D43d69c10b7cC91B5347901D42
RPC_URL=https://misty-proportionate-owl.base-sepolia.quiknode.pro/3057dcb195d42a6ae388654afca2ebb055b9bfd9/
RPC_WSS_URL=wss://misty-proportionate-owl.base-sepolia.quiknode.pro/3057dcb195d42a6ae388654afca2ebb055b9bfd9/

# Submitter wallet
SUBMITTER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
SUBMITTER_CHECK_CRON=*/30 * * * * *
SUBMITTER_MAX_ATTEMPTS=3

# JWT
JWT_SECRET=super-secret-key

# Admin
ADMIN_EMAIL=admin@basedscrabble.xyz
ADMIN_PASSWORD=your-admin-password

🧩 Service Structure
Service	Purpose
server.cjs	Main Express + Socket.IO entrypoint
services/blockchainListener.cjs	WebSocket listener for Base chain events
services/submitterService.cjs	Cron-based submitter for finalized games
services/nonceService.cjs	Manages EIP-712 nonces (cached + on-chain)
services/signatureService.cjs	Generates and verifies EIP-712 signatures
controllers/*.cjs	REST controllers for auth, gameplay, words, admin
lib/prisma.cjs	Prisma client instance for DB access
uploads/	User avatar uploads (storage folder)
🧮 Safe Prisma Workflow

Once deployed to NeonDB, only use these commands:

npx prisma validate
npx prisma db pull
npx prisma generate
npx prisma studio


⚠️ Never run prisma migrate dev or migrate reset on a live DB — it can wipe data.

🧰 Local Development
# 1. Install dependencies
npm install

# 2. Start in dev mode
npm run dev

# 3. Access health check
http://localhost:3000/api/health


If your QuickNode WSS closes, it automatically falls back to HTTP polling and retries every 30 seconds (configurable via LISTENER_RECONNECT_DELAY_MS).

🔗 Key API Endpoints
Category	Route	Description
Health	GET /api/health	Backend + DB status
Auth	POST /api/auth/register, POST /api/auth/login	User signup / login
Words	GET /api/words/validate/:word	Word validation
Games	POST /api/games / GET /api/games/:id	Create / fetch games
Blockchain	GET /api/blockchain/status	Listener & submitter status
Admin	GET /api/admin/dashboard	Admin overview
Tournament	GET /api/tournaments	List active tournaments
🔐 Blockchain Event Flow

Player finishes game → Backend marks status = completed

Submitter Service → Calls submitResult() on Base chain

Scrabble Contract emits GameFinished →
Blockchain Listener catches event via QuickNode WSS

Listener → Prisma DB: Updates winner, score, and Tx hash

Owner CMS / Frontend → Fetches live updates for display

🧱 Deployment Notes

✅ Backend — Render (works with Socket.IO and long-lived WebSockets)
⚠️ Frontend — Vercel (limited WebSocket support; use HTTP polling fallback)
🟢 Database — NeonDB (Postgres with pooler connection string)
🔵 RPC Provider — QuickNode (Base Sepolia and Base Mainnet)

🔒 Security Checklist

Keep all private keys and RPC URLs in Render/Vercel environment variables

Don’t expose .env in your repo

Rotate keys periodically before mainnet deployment

Use QuickNode rate-limit monitoring for listener health

Regularly check listener and submitter logs on Render dashboard

🧾 License

© 2025 Based Scrabble by noblepeter2000
Released under the MIT License.
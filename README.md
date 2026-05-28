# Tailoring ERP — Multi-Tenant SaaS Starter

A **multi-tenant tailoring ERP** scaffold with:

- **Schema-per-tenant** Postgres isolation (one schema per shop)
- **Mobile OTP** authentication (mock SMS adapter; pluggable for Twilio / MSG91 / Fast2SMS)
- **JWT + `X-Tenant-Id`** dual-source tenant resolution (defense in depth)
- **Node.js + Express + TypeScript + Prisma** backend
- **Vite + React + TypeScript + PWA** frontend (installable, offline-aware)
- **npm workspaces** monorepo

> Status: MVP scaffold focused on getting **multi-tenancy + OTP login** working end-to-end so you can test it before extending the ERP.

## Quick start

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for the full setup walkthrough and [docs/MULTI_TENANCY.md](docs/MULTI_TENANCY.md) for the architecture deep-dive.

```powershell
# 1. Postgres must be running and reachable
# 2. Install + configure
npm install
Copy-Item apps\backend\.env.example apps\backend\.env
Copy-Item apps\frontend\.env.example apps\frontend\.env

# 3. Create the platform schema
npm run platform:migrate

# 4. Run both apps
npm run dev
```

Open http://localhost:5173, sign up as "Acme Tailors" → verify OTP (printed in backend console or returned in the response) → you'll land in a tenant-scoped dashboard. Sign out, sign up a second shop, and confirm the customer lists are isolated.

## Project layout

```
RN/
├── apps/
│   ├── backend/      Node + Express + Prisma + TS
│   └── frontend/     Vite + React + PWA + TS
├── docs/
│   ├── INSTALLATION.md
│   └── MULTI_TENANCY.md
└── package.json      (npm workspaces root)
```

## What's intentionally NOT here yet

- Real SMS provider integration (adapter stub is in place — drop in Twilio/MSG91 keys later)
- Refresh tokens (single JWT for MVP)
- Subdomain-based tenant routing (header-based for dev simplicity)
- Migrations runner for tenant schemas (DDL is a SQL template — fine for early stage, swap for Prisma migrate or a versioned migrator before production)
- Role-based authorization beyond `OWNER` / `MANAGER` / `STAFF` shape

These are intentional deferrals — extend only when you need them.

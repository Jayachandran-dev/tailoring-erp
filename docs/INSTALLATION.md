# Installation Guide

End-to-end setup for the Tailoring ERP scaffold on **Windows / macOS / Linux**.

---

## 1. Prerequisites

| Tool        | Version       | Notes                                   |
| ----------- | ------------- | --------------------------------------- |
| Node.js     | **>= 20.10**  | Use [nvm-windows](https://github.com/coreybutler/nvm-windows) or `nvm` |
| npm         | **>= 10**     | Ships with Node 20                      |
| PostgreSQL  | **>= 14**     | Local install or Docker                 |
| Git         | any           | optional                                |

Verify:

```powershell
node -v
npm -v
psql --version
```

---

## 2. Start PostgreSQL

### Option A — Local install
Make sure the `postgres` service is running and you can connect:

```powershell
psql -U postgres -h localhost
```

### Option B — Docker (one-liner)

```powershell
docker run --name tailoring-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

### Create the database

```sql
CREATE DATABASE tailoring_erp;
```

---

## 3. Clone & install

```powershell
cd C:\Users\JAYACHANDRAN\Desktop\RN
npm install
```

The root `package.json` uses **npm workspaces** — a single `npm install` pulls deps for both `apps/backend` and `apps/frontend`. The backend's `postinstall` script also runs `prisma generate` for both the platform and tenant clients.

---

## 4. Configure environment variables

### Backend
```powershell
Copy-Item apps\backend\.env.example apps\backend\.env
```

Open `apps/backend/.env` and adjust:

| Variable                 | Required | Purpose                                                      |
| ------------------------ | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`           | yes      | Connection string with `?schema=public` (used by Prisma CLI) |
| `DATABASE_BASE_URL`      | yes      | Same connection string WITHOUT `?schema=...` (used at runtime to build per-tenant URLs) |
| `JWT_SECRET`             | yes      | Long random string (min 16 chars). Rotate for production.    |
| `SMS_PROVIDER`           | yes      | `mock` for dev. Swap later.                                  |
| `OTP_EXPOSE_IN_RESPONSE` | dev only | When `true`, OTP code is returned in the HTTP response — handy for testing without SMS. **Set to `false` in production.** |

### Frontend
```powershell
Copy-Item apps\frontend\.env.example apps\frontend\.env
```

`VITE_API_BASE_URL` defaults to `http://localhost:4000/api`. The Vite dev server also proxies `/api` → `localhost:4000`.

---

## 5. Initialize the **platform** schema

The platform schema holds the tenant registry, platform users, memberships, and OTP requests. Tenant business data lives in **separate per-tenant schemas** created at signup.

```powershell
npm run platform:migrate
```

This runs `prisma migrate dev` against `prisma/platform/schema.prisma`. On a fresh DB it will:
1. Create the `platform` Postgres schema
2. Create the `tenants`, `platform_users`, `tenant_memberships`, `otp_requests` tables
3. Create the `_prisma_migrations` table inside the `platform` schema

> Tenant schemas are NOT created here. They are provisioned on demand by `src/db/tenantProvisioner.ts` when a new shop signs up.

---

## 6. Run the dev servers

```powershell
npm run dev
```

This boots two processes in parallel:
- **Backend** → http://localhost:4000 (Express + tsx watch)
- **Frontend** → http://localhost:5173 (Vite + PWA)

Health check:

```powershell
curl http://localhost:4000/api/health
```

---

## 7. First end-to-end test

1. Open http://localhost:5173.
2. **Signup tab** → enter mobile `9876543210`, shop name `Acme Tailors`, owner name `Alice` → **Send OTP**.
3. The dev OTP is shown directly in the UI (because `OTP_EXPOSE_IN_RESPONSE=true`) and also printed in the **backend terminal** as `[MOCK SMS] OTP issued`.
4. Enter the OTP → **Verify & continue**.
   - Backend creates Postgres schema `tenant_acme_tailors`
   - Inserts row into `platform.tenants`
   - Inserts `platform.platform_users` + `platform.tenant_memberships`
   - Seeds `tenant_acme_tailors.users`
   - Signs a JWT carrying `{ sub, tenantId, schemaName, role }`
5. You land on the dashboard. Add a customer.
6. Inspect the DB:

```sql
-- platform schema
SELECT * FROM platform.tenants;
SELECT * FROM platform.platform_users;
SELECT * FROM platform.tenant_memberships;

-- tenant schema
SELECT * FROM tenant_acme_tailors.customers;
```

7. **Sign out** → switch to **Signup** again → create a second shop `Bobs Stitching` with a different mobile.
8. Confirm `tenant_bobs_stitching.customers` is empty and that adding a customer there does NOT appear in `tenant_acme_tailors.customers`. **This proves multi-tenant isolation.**

---

## 8. Building for production

```powershell
npm run build
```

- Backend → `apps/backend/dist/` → run with `node apps/backend/dist/server.js`
- Frontend → `apps/frontend/dist/` → static files servable by Nginx / Cloudflare Pages / S3+CloudFront

Before shipping:

- [ ] `JWT_SECRET` is a real secret managed by your secret store
- [ ] `OTP_EXPOSE_IN_RESPONSE=false`
- [ ] `SMS_PROVIDER` switched to a real adapter
- [ ] Postgres user used by the app does NOT have `SUPERUSER`; it needs `CREATE` on the database to create tenant schemas (or pre-provision schemas via a privileged migrator job)
- [ ] HTTPS termination + HSTS in front of both apps
- [ ] Backups: `pg_dump` of the platform DB (all schemas)

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| `Invalid environment variables` on backend start | `.env` missing or `JWT_SECRET` too short | Recopy `.env.example`; set a longer secret |
| `Unsafe tenant schema name` error | Shop name slug is empty or has only special chars | Use alphanumeric shop names |
| `permission denied to create schema` | DB user lacks `CREATE` privilege | `GRANT CREATE ON DATABASE tailoring_erp TO postgres;` |
| OTP never reaches console | Wrong `SMS_PROVIDER` value | Set `SMS_PROVIDER=mock` |
| `Tenant mismatch between token and X-Tenant-Id` (403) | You manually edited localStorage | Sign out, sign back in |
| PWA not updating after deploy | Service worker cache | Hard-reload (Ctrl+Shift+R) or bump the manifest's `name` |

---

## 10. Useful commands

```powershell
# Open Prisma Studio against the platform schema
npx prisma studio --schema apps/backend/prisma/platform/schema.prisma

# Regenerate Prisma clients after editing schemas
npm run platform:generate --workspace apps/backend
npm run tenant:generate   --workspace apps/backend

# Inspect Postgres schemas
psql -U postgres -d tailoring_erp -c "\dn"
```

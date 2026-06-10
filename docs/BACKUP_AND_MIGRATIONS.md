# Backup, Restore & Migration Runbook

This is the operator's playbook for keeping the tailoring-ERP database safe
and applying schema changes without losing tenant data.

> **Audience**: whoever runs the production server. Assumes Postgres 15+, a
> Unix-style shell, and that you can reach the DB host directly.

---

## 1. What you're protecting

Single Postgres database, multi-schema layout:

| Schema             | Owned by             | Contents                                                                 |
| ------------------ | -------------------- | ------------------------------------------------------------------------ |
| `platform`         | platform Prisma client | Tenants registry, platform users, memberships, OTP requests, sessions, staff invites, audit log. |
| `tenant_<slug>`    | tenant Prisma client  | One per shop: customers, designs, orders, payments, business settings.   |
| `public`           | unused              | Empty — Prisma is configured with explicit schemas only.                  |

Plus on-disk uploads under `apps/backend/uploads/<tenantSchema>/...` (customer images, etc.).
**Uploads are NOT in the DB**; back them up alongside.

---

## 2. Daily backup (logical, full DB)

Use `pg_dump` in custom format so you can restore individual schemas.

```bash
# Run this from any host that can reach the Postgres instance.
TS=$(date -u +%Y%m%dT%H%M%SZ)
PGPASSWORD="$DB_PASSWORD" pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname=tailoring_erp \
    --format=custom \
    --compress=9 \
    --file="tailoring_erp-${TS}.dump"
```

Then ship the `.dump` file to off-host storage (S3, B2, rsync target — anywhere
that isn't the same machine). A simple cron entry:

```
# /etc/cron.d/tailoring-erp-backup
0 2 * * *  postgres  /opt/terp/bin/backup.sh >> /var/log/terp-backup.log 2>&1
```

**Retention**: keep 7 daily + 4 weekly + 6 monthly. Don't keep backups only on
the same disk as Postgres.

### Don't forget the uploads

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
tar --create --gzip \
    --file="uploads-${TS}.tar.gz" \
    -C /opt/terp/apps/backend uploads
```

---

## 3. Restore

### 3a. Full DB restore (new host or disaster recovery)

```bash
createdb -U "$DB_USER" tailoring_erp                # if it doesn't exist
pg_restore \
    --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
    --dbname=tailoring_erp \
    --no-owner --no-privileges \
    --jobs=4 \
    tailoring_erp-20260529T020000Z.dump
```

Restore uploads:

```bash
tar -xzf uploads-20260529T020000Z.tar.gz -C /opt/terp/apps/backend
```

After the restore:

```bash
cd /opt/terp/apps/backend
npx prisma migrate status --schema prisma/platform/schema.prisma   # should say "up to date"
npm run start
```

### 3b. Single-tenant restore (recover one shop without disturbing others)

If only one tenant's schema is corrupted (accidental DELETE, bad import, etc.):

```bash
# Extract just that schema from the full dump.
pg_restore --list tailoring_erp-20260529T020000Z.dump \
    | grep ' tenant_acme '  > /tmp/restore.lst
pg_restore \
    --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
    --dbname=tailoring_erp \
    --schema=tenant_acme \
    --use-list=/tmp/restore.lst \
    --clean --if-exists \
    tailoring_erp-20260529T020000Z.dump
```

> ⚠️ `--clean --if-exists` will DROP and recreate every object in
> `tenant_acme`. Verify the tenant slug **twice** before running.

### 3c. Restore a single table

```bash
pg_restore -t customers --schema=tenant_acme --data-only \
    --dbname=tailoring_erp tailoring_erp-...dump
```

---

## 4. Point-in-time recovery (optional, recommended at scale)

Logical dumps lose changes between cron runs. For RPO < 1 day, enable WAL
archiving:

```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://terp-wal/%f --quiet'
```

Combined with `pg_basebackup` weekly, you can restore to any second.
Out of scope for the MVP; revisit when SLA demands it.

---

## 5. Schema migrations

There are **two** Prisma schemas — they migrate independently.

### 5a. Platform schema (one DB schema, shared)

```bash
cd apps/backend
npx prisma migrate dev --schema prisma/platform/schema.prisma --name <change>   # dev
npx prisma migrate deploy --schema prisma/platform/schema.prisma                # prod
```

`migrate deploy` applies any unapplied migrations and exits — safe to run on
every deploy.

### 5b. Tenant schemas (N schemas, one per shop)

Tenant schemas are bootstrapped from `apps/backend/prisma/tenant/tenant_template.sql`
at signup time by `src/db/tenantProvisioner.ts`. There is **no Prisma migrate
deploy step** for tenant schemas — instead we use `src/db/tenantPatcher.ts`
which idempotently re-applies the latest template DDL to every existing tenant
schema.

**Process to ship a tenant-schema change**:

1. Edit `apps/backend/prisma/tenant/schema.prisma` and add migration:
   ```bash
   npx prisma migrate dev --schema prisma/tenant/schema.prisma --name <change>
   ```
2. Regenerate `apps/backend/prisma/tenant/tenant_template.sql` so new tenants
   get the new shape. (See `package.json` script if one exists; otherwise
   copy from the latest tenant migration SQL.)
3. Add idempotent DDL to the template — every statement MUST be
   `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, etc., because the patcher replays the full
   template against EVERY tenant schema.
4. Test in staging:
   ```bash
   npm run tenant:patch -- --dry-run        # if implemented
   npm run tenant:patch                     # apply to every tenant
   ```
5. Deploy.

> ❗ Destructive tenant changes (drop column, rename) need a multi-step
> migration: deploy a backward-compatible release first (code reads both old
> and new), patch tenants, then deploy a release that drops the old.

---

## 6. Pre-deploy checklist

Before merging a release to `main`:

- [ ] All new Prisma migrations are committed and reviewed.
- [ ] `npm run build` is green in CI.
- [ ] If the change touches the tenant schema, the template SQL is updated
      AND every statement is idempotent.
- [ ] A fresh backup has been taken in the last 24h and verified
      (`pg_restore --list <file> | head` returns a non-empty manifest).

Before running the release on prod:

- [ ] Take an on-demand backup right before the deploy:
      `bash /opt/terp/bin/backup.sh && bash /opt/terp/bin/upload-to-s3.sh`
- [ ] Run `npx prisma migrate deploy --schema prisma/platform/schema.prisma`.
- [ ] Run the tenant patcher if the tenant schema changed.
- [ ] Smoke test: signup, login, create one order in a throw-away tenant.

---

## 7. Restore drill (run this quarterly)

Backups you've never restored from are wishful thinking. Once per quarter:

1. Spin up an empty Postgres instance (Docker is fine).
2. Restore yesterday's `.dump`.
3. Restore `uploads-*.tar.gz`.
4. Boot the API against the restored DB.
5. Log in as a known test tenant; verify orders + images load.
6. Tear down. Record the elapsed time — that's your RTO.

If the drill fails or takes longer than your SLA allows, fix that BEFORE you
need it for real.

---

## 8. Common emergencies

| Symptom                                     | First thing to do                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| "We dropped the wrong table"                | Stop writes (`systemctl stop terp-api`). Restore that schema from last night.     |
| "A tenant says their data is gone"          | Check `platform.audit_logs` for that user's recent DELETEs before restoring.      |
| "Prisma migrate failed mid-deploy on prod"  | Don't roll forward. Restore platform schema, fix the migration locally, redeploy.  |
| "Disk full, Postgres won't start"           | Free WAL: `pg_archivecleanup`. Never `rm` from `pg_wal/` directly.                 |
| "Suspected breach"                          | `platform.sessions` UPDATE SET revoked_at = now(); rotate JWT_SECRET; force re-login. |

---

## 9. What we are explicitly NOT doing yet

- No replica / hot standby. Single-node Postgres with nightly logical dumps.
- No WAL archiving (see §4).
- No automated restore drills — manual, quarterly (§7).
- No cross-region replication of `uploads/`.

Revisit each of these once paying tenants > ~100 or SLA promises < 24h RPO.

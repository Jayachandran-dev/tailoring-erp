-- Tenant template DDL. Executed when provisioning a new tenant.
-- The literal token __SCHEMA__ is replaced (safely, after identifier validation)
-- by tenantProvisioner.ts. Keep this file in sync with prisma/tenant/schema.prisma.

CREATE SCHEMA IF NOT EXISTS "__SCHEMA__";

SET LOCAL search_path TO "__SCHEMA__";

-- Enum for order status (created inside the tenant schema for isolation).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrderStatus' AND n.nspname = '__SCHEMA__'
  ) THEN
    CREATE TYPE "__SCHEMA__"."OrderStatus" AS ENUM
      ('PENDING','IN_PROGRESS','READY','DELIVERED','CANCELLED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "__SCHEMA__"."users" (
  "id"               TEXT PRIMARY KEY,
  "platform_user_id" TEXT UNIQUE NOT NULL,
  "mobile"           TEXT UNIQUE NOT NULL,
  "display_name"     TEXT,
  "role"             TEXT NOT NULL DEFAULT 'OWNER',
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "__SCHEMA__"."customers" (
  "id"         TEXT PRIMARY KEY,
  "name"       TEXT NOT NULL,
  "mobile"     TEXT,
  "email"      TEXT,
  "address"    TEXT,
  "gender"     TEXT,
  "notes"      TEXT,
  "image_url"  TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Forward-compat for tenants created before these columns existed.
ALTER TABLE "__SCHEMA__"."customers" ADD COLUMN IF NOT EXISTS "email"     TEXT;
ALTER TABLE "__SCHEMA__"."customers" ADD COLUMN IF NOT EXISTS "address"   TEXT;
ALTER TABLE "__SCHEMA__"."customers" ADD COLUMN IF NOT EXISTS "gender"    TEXT;
ALTER TABLE "__SCHEMA__"."customers" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
CREATE INDEX IF NOT EXISTS "customers_mobile_idx"
  ON "__SCHEMA__"."customers" ("mobile");

CREATE TABLE IF NOT EXISTS "__SCHEMA__"."measurements" (
  "id"           TEXT PRIMARY KEY,
  "customer_id"  TEXT NOT NULL REFERENCES "__SCHEMA__"."customers"("id") ON DELETE CASCADE,
  "garment_type" TEXT NOT NULL DEFAULT 'custom',
  "label"        TEXT,
  "data"         JSONB NOT NULL,
  "taken_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "__SCHEMA__"."measurements" ADD COLUMN IF NOT EXISTS "garment_type" TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE "__SCHEMA__"."measurements" ADD COLUMN IF NOT EXISTS "label"        TEXT;
ALTER TABLE "__SCHEMA__"."measurements" ADD COLUMN IF NOT EXISTS "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "measurements_customer_id_idx"
  ON "__SCHEMA__"."measurements" ("customer_id");

CREATE TABLE IF NOT EXISTS "__SCHEMA__"."orders" (
  "id"          TEXT PRIMARY KEY,
  "customer_id" TEXT NOT NULL REFERENCES "__SCHEMA__"."customers"("id") ON DELETE RESTRICT,
  "item_type"   TEXT,
  "status"      "__SCHEMA__"."OrderStatus" NOT NULL DEFAULT 'PENDING',
  "price_cents" INTEGER NOT NULL DEFAULT 0,
  "due_date"    TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Forward-compat: drop NOT NULL on legacy item_type (items now live in order_items).
ALTER TABLE "__SCHEMA__"."orders" ALTER COLUMN "item_type" DROP NOT NULL;
-- Richer order fields (idempotent).
ALTER TABLE "__SCHEMA__"."orders" ADD COLUMN IF NOT EXISTS "order_number"    TEXT;
ALTER TABLE "__SCHEMA__"."orders" ADD COLUMN IF NOT EXISTS "discount_cents"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "__SCHEMA__"."orders" ADD COLUMN IF NOT EXISTS "total_cents"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "__SCHEMA__"."orders" ADD COLUMN IF NOT EXISTS "paid_cents"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "__SCHEMA__"."orders" ADD COLUMN IF NOT EXISTS "priority"        TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "__SCHEMA__"."orders" ADD COLUMN IF NOT EXISTS "notes"           TEXT;
ALTER TABLE "__SCHEMA__"."orders" ADD COLUMN IF NOT EXISTS "delivered_at"    TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "orders_customer_id_idx"
  ON "__SCHEMA__"."orders" ("customer_id");
CREATE INDEX IF NOT EXISTS "orders_status_idx"
  ON "__SCHEMA__"."orders" ("status");
CREATE INDEX IF NOT EXISTS "orders_due_date_idx"
  ON "__SCHEMA__"."orders" ("due_date");
CREATE UNIQUE INDEX IF NOT EXISTS "orders_order_number_uniq"
  ON "__SCHEMA__"."orders" ("order_number");

-- Per-tenant monotonically increasing order number sequence
CREATE SEQUENCE IF NOT EXISTS "__SCHEMA__"."order_number_seq"
START WITH 1001 INCREMENT BY 1;

-- ============================================================
-- DESIGN CATALOG
-- ============================================================

CREATE TABLE IF NOT EXISTS "__SCHEMA__"."design_categories" (
  "id"         TEXT PRIMARY KEY,
  "name"       TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "design_categories_name_uniq"
ON "__SCHEMA__"."design_categories" (LOWER("name"));

CREATE TABLE IF NOT EXISTS "__SCHEMA__"."designs" (
  "id"          TEXT PRIMARY KEY,
  "category_id" TEXT NOT NULL REFERENCES "__SCHEMA__"."design_categories"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "code"        TEXT,
  "price_cents" INTEGER NOT NULL DEFAULT 0,
  "notes"       TEXT,
  "image_url"   TEXT,
  "tags"        TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "designs_category_id_idx"
ON "__SCHEMA__"."designs" ("category_id");

CREATE INDEX IF NOT EXISTS "designs_name_idx"
ON "__SCHEMA__"."designs" ("name");

-- ============================================================
-- ORDER LINE ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS "__SCHEMA__"."order_items" (
  "id"                   TEXT PRIMARY KEY,
  "order_id"             TEXT NOT NULL REFERENCES "__SCHEMA__"."orders"("id") ON DELETE CASCADE,
  "design_id"            TEXT REFERENCES "__SCHEMA__"."designs"("id") ON DELETE SET NULL,
  "measurement_id"       TEXT REFERENCES "__SCHEMA__"."measurements"("id") ON DELETE SET NULL,
  "garment_type"         TEXT NOT NULL DEFAULT 'custom',
  "name"                 TEXT NOT NULL,
  "image_url"            TEXT,
  "qty"                  INTEGER NOT NULL DEFAULT 1,
  "unit_price_cents"     INTEGER NOT NULL DEFAULT 0,
  "measurement_snapshot" JSONB,
  "notes"                TEXT,
  "sort_order"           INTEGER NOT NULL DEFAULT 0,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "order_items_order_id_idx"
ON "__SCHEMA__"."order_items" ("order_id");

-- Payments against an order.
CREATE TABLE IF NOT EXISTS "__SCHEMA__"."order_payments" (
  "id"           TEXT PRIMARY KEY,
  "order_id"     TEXT NOT NULL REFERENCES "__SCHEMA__"."orders"("id") ON DELETE CASCADE,
  "amount_cents" INTEGER NOT NULL,
  "method"       TEXT NOT NULL DEFAULT 'CASH', -- CASH | UPI | CARD | BANK | OTHER
  "reference"    TEXT,
  "notes"        TEXT,
  "paid_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "order_payments_order_id_idx"
  ON "__SCHEMA__"."order_payments" ("order_id");

-- Status timeline.
CREATE TABLE IF NOT EXISTS "__SCHEMA__"."order_status_history" (
  "id"          TEXT PRIMARY KEY,
  "order_id"    TEXT NOT NULL REFERENCES "__SCHEMA__"."orders"("id") ON DELETE CASCADE,
  "from_status" "__SCHEMA__"."OrderStatus",
  "to_status"   "__SCHEMA__"."OrderStatus" NOT NULL,
  "note"        TEXT,
  "changed_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "order_status_history_order_id_idx"
  ON "__SCHEMA__"."order_status_history" ("order_id");

-- ============================================================
-- DESIGN CATALOG
-- Shops curate their own categories (Blouse, Wedding, Kurta, …)
-- and a gallery of designs (image + name + optional price/notes)
-- under each category. Used as inspiration / order reference.
-- ============================================================
CREATE TABLE IF NOT EXISTS "__SCHEMA__"."design_categories" (
  "id"         TEXT PRIMARY KEY,
  "name"       TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "design_categories_name_uniq"
  ON "__SCHEMA__"."design_categories" (LOWER("name"));

CREATE TABLE IF NOT EXISTS "__SCHEMA__"."designs" (
  "id"          TEXT PRIMARY KEY,
  "category_id" TEXT NOT NULL REFERENCES "__SCHEMA__"."design_categories"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "code"        TEXT,
  "price_cents" INTEGER NOT NULL DEFAULT 0,
  "notes"       TEXT,
  "image_url"   TEXT,
  "tags"        TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "designs_category_id_idx"
  ON "__SCHEMA__"."designs" ("category_id");
CREATE INDEX IF NOT EXISTS "designs_name_idx"
  ON "__SCHEMA__"."designs" ("name");

-- ============================================================
-- PAYMENT SETTINGS
-- A shop can register one or more UPI accounts (e.g., GPay, PhonePe).
-- Exactly one is "default" — surfaced first in the payment dialog,
-- where a UPI QR code is generated for the customer to scan.
-- Each UPI payment can be linked back to the receiving account so
-- the shop can track collected totals per UPI handle.
-- ============================================================
CREATE TABLE IF NOT EXISTS "__SCHEMA__"."upi_accounts" (
  "id"          TEXT PRIMARY KEY,
  "label"       TEXT NOT NULL,                -- e.g., "Shop GPay", "Owner PhonePe"
  "upi_id"      TEXT NOT NULL,                -- VPA, e.g., "shop@okhdfcbank"
  "payee_name"  TEXT,                         -- shown on customer's UPI app
  "is_default"  BOOLEAN NOT NULL DEFAULT FALSE,
  "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
  "notes"       TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "upi_accounts_upi_id_uniq"
  ON "__SCHEMA__"."upi_accounts" (LOWER("upi_id"));

-- Link UPI payments to the receiving account (nullable so non-UPI payments
-- and older rows remain valid).
ALTER TABLE "__SCHEMA__"."order_payments"
  ADD COLUMN IF NOT EXISTS "upi_account_id" TEXT
    REFERENCES "__SCHEMA__"."upi_accounts"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "order_payments_upi_account_id_idx"
  ON "__SCHEMA__"."order_payments" ("upi_account_id");

-- ============================================================
-- BUSINESS SETTINGS
-- Singleton row (id = 'default') holding shop / business metadata.
-- Surfaced in the sidebar header, invoice/print views, and reports.
-- ============================================================
CREATE TABLE IF NOT EXISTS "__SCHEMA__"."business_settings" (
  "id"             TEXT PRIMARY KEY DEFAULT 'default',
  "business_name"  TEXT NOT NULL DEFAULT '',
  "legal_name"     TEXT,
  "tagline"        TEXT,
  "owner_name"     TEXT,
  "phone"          TEXT,
  "alt_phone"      TEXT,
  "email"          TEXT,
  "website"        TEXT,
  "address_line1"  TEXT,
  "address_line2"  TEXT,
  "city"           TEXT,
  "state"          TEXT,
  "pincode"        TEXT,
  "country"        TEXT NOT NULL DEFAULT 'India',
  "gstin"          TEXT,
  "pan"            TEXT,
  "currency"       TEXT NOT NULL DEFAULT 'INR',
  "timezone"       TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "logo_url"           TEXT,
  "visiting_card_url"  TEXT,
  "invoice_prefix" TEXT NOT NULL DEFAULT 'ORD-',
  "invoice_footer" TEXT,
  "terms"          TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Seed the singleton row so GET never returns null.
INSERT INTO "__SCHEMA__"."business_settings" ("id", "business_name")
  VALUES ('default', '')
  ON CONFLICT ("id") DO NOTHING;

-- Tenants that created business_settings before the visiting card column
-- existed still need the new column.
ALTER TABLE "__SCHEMA__"."business_settings"
  ADD COLUMN IF NOT EXISTS "visiting_card_url" TEXT;

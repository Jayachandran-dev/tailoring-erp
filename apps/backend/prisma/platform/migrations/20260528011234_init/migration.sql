-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateEnum
CREATE TYPE "platform"."TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PROVISIONING');

-- CreateEnum
CREATE TYPE "platform"."Role" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "platform"."OtpPurpose" AS ENUM ('SIGNUP', 'LOGIN');

-- CreateTable
CREATE TABLE "platform"."tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "status" "platform"."TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "owner_mobile" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."platform_users" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."tenant_memberships" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "platform"."Role" NOT NULL DEFAULT 'OWNER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."otp_requests" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" "platform"."OtpPurpose" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "platform"."tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_schema_name_key" ON "platform"."tenants"("schema_name");

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_mobile_key" ON "platform"."platform_users"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key" ON "platform"."tenant_memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "otp_requests_mobile_purpose_created_at_idx" ON "platform"."otp_requests"("mobile", "purpose", "created_at");

-- AddForeignKey
ALTER TABLE "platform"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

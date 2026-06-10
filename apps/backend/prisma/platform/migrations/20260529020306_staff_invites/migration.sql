-- AlterEnum
ALTER TYPE "platform"."OtpPurpose" ADD VALUE 'INVITE';

-- CreateTable
CREATE TABLE "platform"."staff_invites" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "role" "platform"."Role" NOT NULL DEFAULT 'STAFF',
    "display_name" TEXT,
    "token" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_token_key" ON "platform"."staff_invites"("token");

-- CreateIndex
CREATE INDEX "staff_invites_tenant_id_consumed_at_revoked_at_expires_at_idx" ON "platform"."staff_invites"("tenant_id", "consumed_at", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "staff_invites_mobile_idx" ON "platform"."staff_invites"("mobile");

-- AddForeignKey
ALTER TABLE "platform"."staff_invites" ADD CONSTRAINT "staff_invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."staff_invites" ADD CONSTRAINT "staff_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "platform"."platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

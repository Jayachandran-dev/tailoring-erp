-- CreateTable
CREATE TABLE "platform"."order_share_tokens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "last_viewed_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_share_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_share_tokens_token_key" ON "platform"."order_share_tokens"("token");

-- CreateIndex
CREATE INDEX "order_share_tokens_tenant_id_order_id_idx" ON "platform"."order_share_tokens"("tenant_id", "order_id");

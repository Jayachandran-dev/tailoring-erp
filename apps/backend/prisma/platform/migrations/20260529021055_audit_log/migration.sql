-- CreateTable
CREATE TABLE "platform"."audit_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "role" "platform"."Role",
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "error_code" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "platform"."audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "platform"."audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "platform"."audit_logs"("user_id", "created_at");

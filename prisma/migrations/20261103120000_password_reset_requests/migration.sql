-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_hash" VARCHAR(64) NOT NULL,
    "ip_address" INET,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_reset_requests_email_hash_requested_at_idx" ON "password_reset_requests"("email_hash", "requested_at");

-- CreateIndex
CREATE INDEX "password_reset_requests_ip_address_requested_at_idx" ON "password_reset_requests"("ip_address", "requested_at");

-- CreateIndex
CREATE INDEX "password_reset_requests_requested_at_idx" ON "password_reset_requests"("requested_at");

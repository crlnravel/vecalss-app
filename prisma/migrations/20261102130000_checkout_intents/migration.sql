-- CreateTable
CREATE TABLE "checkout_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "buyer_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "plan" VARCHAR(20) NOT NULL,
    "pricing_month" VARCHAR(7) NOT NULL,
    "amount_rupiah" INTEGER NOT NULL,
    "referral_code" VARCHAR(40),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkout_intents_buyer_id_created_at_idx" ON "checkout_intents"("buyer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_intents_buyer_id_idempotency_key_key" ON "checkout_intents"("buyer_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "checkout_intents" ADD CONSTRAINT "checkout_intents_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


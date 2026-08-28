-- Idempotency CAS protects terminal settlement and replay target transitions
-- against a concurrent finalizer or overdue worker.
ALTER TABLE "ai_idempotency_keys"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

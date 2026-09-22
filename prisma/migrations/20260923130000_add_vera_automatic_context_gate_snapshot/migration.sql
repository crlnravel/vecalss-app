-- Persist the server-owned automatic-context rollout decision captured at
-- admission. This is additive and leaves legacy requests untouched.

ALTER TABLE "ai_requests"
  ADD COLUMN "automatic_context_gate_snapshot" JSONB;

ALTER TABLE "ai_requests"
  ADD CONSTRAINT "ai_requests_automatic_context_gate_snapshot_check"
  CHECK (
    "automatic_context_gate_snapshot" IS NULL
    OR (
      jsonb_typeof("automatic_context_gate_snapshot") = 'object'
      AND "automatic_context_gate_snapshot" ? 'enabled'
      AND "automatic_context_gate_snapshot" ? 'state'
      AND "automatic_context_gate_snapshot" ? 'policyVersion'
      AND "automatic_context_gate_snapshot" ? 'evaluatedAt'
    )
  );

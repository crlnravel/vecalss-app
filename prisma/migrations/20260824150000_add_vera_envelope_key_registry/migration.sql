-- Vera envelope key registry: only KMS/root-key-wrapped material is durable.
CREATE TABLE "ai_envelope_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key_ref" VARCHAR(240) NOT NULL,
    "object_id" VARCHAR(240) NOT NULL,
    "wrapped_key_material" TEXT NOT NULL,
    "cipher_version" VARCHAR(40) NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "destroyed_at" TIMESTAMPTZ,
    CONSTRAINT "ai_envelope_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_envelope_keys_key_ref_key" ON "ai_envelope_keys"("key_ref");
CREATE INDEX "ai_envelope_keys_object_id_state_idx" ON "ai_envelope_keys"("object_id", "state");
CREATE INDEX "ai_envelope_keys_state_destroyed_at_idx" ON "ai_envelope_keys"("state", "destroyed_at");

CREATE OR REPLACE FUNCTION vera_ai_envelope_key_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.key_ref <> OLD.key_ref
     OR NEW.object_id <> OLD.object_id
     OR NEW.wrapped_key_material <> OLD.wrapped_key_material
     OR NEW.cipher_version <> OLD.cipher_version THEN
    RAISE EXCEPTION 'ai_envelope_keys cryptographic identity is append-only';
  END IF;
  IF OLD.state = 'destroyed' AND NEW.state <> 'destroyed' THEN
    RAISE EXCEPTION 'destroyed envelope keys cannot be resurrected';
  END IF;
  IF NEW.state NOT IN ('active', 'destroyed') THEN
    RAISE EXCEPTION 'invalid envelope key lifecycle state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_envelope_keys_immutable
BEFORE UPDATE ON "ai_envelope_keys"
FOR EACH ROW
EXECUTE FUNCTION vera_ai_envelope_key_immutable();

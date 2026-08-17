ALTER TABLE "system_configs"
  ADD COLUMN "draft_value" JSONB,
  ADD COLUMN "draft_updated_by_user_id" UUID,
  ADD COLUMN "draft_updated_at" TIMESTAMPTZ,
  ADD COLUMN "published_by_user_id" UUID,
  ADD COLUMN "published_at" TIMESTAMPTZ;

ALTER TABLE "system_configs"
  ADD CONSTRAINT "system_configs_draft_updated_by_user_id_fkey"
  FOREIGN KEY ("draft_updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "system_configs"
  ADD CONSTRAINT "system_configs_published_by_user_id_fkey"
  FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

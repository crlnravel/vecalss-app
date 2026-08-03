-- Establish the additive document-first resource contract. Existing module
-- assets remain untouched until the explicit Materi cutover/seed operation.
CREATE TYPE "module_asset_source_kind" AS ENUM ('hosted', 'managed');

ALTER TABLE "module_assets"
    ADD COLUMN "source_kind" "module_asset_source_kind",
    ADD COLUMN "managed_asset_id" UUID,
    ADD COLUMN "mime_type" VARCHAR(120),
    ADD COLUMN "original_name" VARCHAR(255);

ALTER TABLE "module_assets"
    ADD CONSTRAINT "module_assets_managed_asset_id_fkey"
    FOREIGN KEY ("managed_asset_id") REFERENCES "assets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "module_assets_managed_asset_id_idx"
    ON "module_assets"("managed_asset_id");

CREATE INDEX "module_assets_module_id_asset_type_idx"
    ON "module_assets"("module_id", "asset_type");

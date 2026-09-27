ALTER TABLE "tryout_items"
ADD COLUMN "snapshot_id" UUID;

CREATE UNIQUE INDEX "tryout_items_tryout_id_snapshot_id_key"
ON "tryout_items"("tryout_id", "snapshot_id");

ALTER TABLE "tryout_item_options"
ADD COLUMN "snapshot_option_id" UUID;

CREATE UNIQUE INDEX "tryout_item_options_tryout_item_id_snapshot_option_id_key"
ON "tryout_item_options"("tryout_item_id", "snapshot_option_id");

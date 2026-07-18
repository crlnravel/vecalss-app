CREATE TYPE "media_library_scope" AS ENUM ('kapten', 'admin');
CREATE TYPE "media_asset_state" AS ENUM ('pending', 'ready', 'trashed', 'failed');

CREATE TABLE "media_folders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "library_scope" "media_library_scope" NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "created_by_user_id" UUID,
    "trashed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_folders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "assets" ALTER COLUMN "url" DROP NOT NULL;
ALTER TABLE "assets"
    ADD COLUMN "folder_id" UUID,
    ADD COLUMN "library_scope" "media_library_scope" NOT NULL DEFAULT 'admin',
    ADD COLUMN "state" "media_asset_state" NOT NULL DEFAULT 'ready',
    ADD COLUMN "object_key" VARCHAR(512),
    ADD COLUMN "original_name" VARCHAR(255),
    ADD COLUMN "width" INTEGER,
    ADD COLUMN "height" INTEGER,
    ADD COLUMN "trashed_at" TIMESTAMPTZ,
    ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "assets_object_key_key" ON "assets"("object_key");
CREATE INDEX "assets_library_scope_folder_id_state_idx" ON "assets"("library_scope", "folder_id", "state");
CREATE INDEX "assets_library_scope_original_name_idx" ON "assets"("library_scope", "original_name");
CREATE INDEX "media_folders_library_scope_parent_id_trashed_at_idx" ON "media_folders"("library_scope", "parent_id", "trashed_at");

ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "media_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_folder_id_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "media_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

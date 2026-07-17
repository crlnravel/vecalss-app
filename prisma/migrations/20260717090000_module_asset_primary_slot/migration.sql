-- A module's asset positions are stable slots. Preserve every pre-existing
-- asset before making the slot addressable: duplicate slots are moved after
-- the module's current maximum position, retaining the earliest row as the
-- original slot occupant (and therefore the primary asset at slot 0).
WITH ranked_assets AS (
  SELECT
    id,
    module_id,
    sort_order,
    ROW_NUMBER() OVER (
      PARTITION BY module_id, sort_order
      ORDER BY created_at ASC, id ASC
    ) AS slot_rank,
    MAX(sort_order) OVER (PARTITION BY module_id) AS max_sort_order
  FROM "module_assets"
), duplicate_assets AS (
  SELECT
    id,
    max_sort_order + ROW_NUMBER() OVER (
      PARTITION BY module_id
      ORDER BY sort_order ASC, id ASC
    ) AS replacement_sort_order
  FROM ranked_assets
  WHERE slot_rank > 1
)
UPDATE "module_assets" AS assets
SET sort_order = duplicate_assets.replacement_sort_order
FROM duplicate_assets
WHERE assets.id = duplicate_assets.id;

CREATE UNIQUE INDEX "module_assets_module_id_sort_order_key"
ON "module_assets"("module_id", "sort_order");

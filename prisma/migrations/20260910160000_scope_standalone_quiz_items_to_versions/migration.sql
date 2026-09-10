-- Let a stable Kuis identity own more than one immutable item snapshot.
-- Legacy rows are linked to version 1 by the preceding migration; the
-- nullable fallback index protects any older writer that still has no version
-- link until the cutover flag is enabled.

DROP INDEX IF EXISTS "standalone_quiz_items_quiz_id_sort_order_key";

CREATE INDEX "standalone_quiz_items_quiz_id_sort_order_idx"
  ON "standalone_quiz_items"("quiz_id", "sort_order");

CREATE UNIQUE INDEX "standalone_quiz_items_quiz_id_sort_order_legacy_key"
  ON "standalone_quiz_items"("quiz_id", "sort_order")
  WHERE "quiz_version_id" IS NULL;

CREATE UNIQUE INDEX "standalone_quiz_items_quiz_version_id_sort_order_key"
  ON "standalone_quiz_items"("quiz_version_id", "sort_order")
  WHERE "quiz_version_id" IS NOT NULL;

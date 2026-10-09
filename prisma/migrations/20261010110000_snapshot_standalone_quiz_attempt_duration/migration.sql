ALTER TABLE "standalone_quiz_attempts"
ADD COLUMN "duration_seconds_snapshot" INTEGER,
ADD COLUMN "started_at" TIMESTAMPTZ,
ADD COLUMN "deadline_at" TIMESTAMPTZ;

-- Existing attempts have a trustworthy admission timestamp in created_at and
-- a pinned immutable version through their participation. Backfill only those
-- rows; stable-definition attempts do not prove which mutable duration was in
-- force when they started.
UPDATE "standalone_quiz_attempts" AS attempt
SET "duration_seconds_snapshot" = CASE
      WHEN version."duration_seconds" > 0 THEN version."duration_seconds"
      ELSE NULL
    END,
    "started_at" = attempt."created_at",
    "deadline_at" = CASE
      WHEN version."duration_seconds" > 0
        THEN attempt."created_at" + version."duration_seconds" * INTERVAL '1 second'
      ELSE NULL
    END
FROM "standalone_quiz_participations" AS participation
JOIN "standalone_quiz_versions" AS version
  ON version."id" = participation."quiz_version_id"
WHERE attempt."participation_id" = participation."id"
  AND attempt."started_at" IS NULL;

ALTER TABLE "standalone_quiz_attempts"
ADD CONSTRAINT "standalone_quiz_attempts_duration_snapshot_check"
CHECK (
  ("duration_seconds_snapshot" IS NULL AND "deadline_at" IS NULL)
  OR (
    "duration_seconds_snapshot" > 0
    AND "started_at" IS NOT NULL
    AND "deadline_at" = "started_at" + "duration_seconds_snapshot" * INTERVAL '1 second'
  )
);

-- Reinterpret Module.sequence_no as a subject-wide Materi position while
-- retaining hidden Topic ownership. The temporary shift preserves the existing
-- per-topic unique constraint during the rewrite.
UPDATE "modules"
SET "sequence_no" = "sequence_no" + 1000000
WHERE "topic_id" IN (
  SELECT topics.id
  FROM "topics" AS topics
  JOIN "subtests" AS subtests ON subtests.id = topics.subtest_id
  WHERE subtests.code IN ('PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM')
    AND topics.code ~ '^materi:(penalaran-umum|pengetahuan-pemahaman-umum|pemahaman-bacaan-menulis|pengetahuan-kuantitatif|literasi-bahasa-indonesia|literasi-bahasa-inggris|penalaran-matematika):section-[123]$'
);

WITH ranked AS (
  SELECT
    modules.id,
    ROW_NUMBER() OVER (
      PARTITION BY subtests.id
      ORDER BY topics.sort_order ASC, modules.sequence_no ASC, modules.code ASC
    )::integer AS sequence_no
  FROM "modules" AS modules
  JOIN "topics" AS topics ON topics.id = modules.topic_id
  JOIN "subtests" AS subtests ON subtests.id = topics.subtest_id
  WHERE subtests.code IN ('PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM')
    AND topics.code ~ '^materi:(penalaran-umum|pengetahuan-pemahaman-umum|pemahaman-bacaan-menulis|pengetahuan-kuantitatif|literasi-bahasa-indonesia|literasi-bahasa-inggris|penalaran-matematika):section-[123]$'
)
UPDATE "modules" AS modules
SET "sequence_no" = ranked.sequence_no
FROM ranked
WHERE modules.id = ranked.id;

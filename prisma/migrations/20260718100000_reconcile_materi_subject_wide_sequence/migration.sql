-- Reconcile the previously applied broad predicate with an exact ownership map.
-- The temporary range is derived above every affected absolute value.
WITH canonical(subject_code, topic_code) AS (VALUES
  ('PU','materi:penalaran-umum:section-1'),('PU','materi:penalaran-umum:section-2'),('PU','materi:penalaran-umum:section-3'),
  ('PPU','materi:pengetahuan-pemahaman-umum:section-1'),('PPU','materi:pengetahuan-pemahaman-umum:section-2'),('PPU','materi:pengetahuan-pemahaman-umum:section-3'),
  ('PBM','materi:pemahaman-bacaan-menulis:section-1'),('PBM','materi:pemahaman-bacaan-menulis:section-2'),('PBM','materi:pemahaman-bacaan-menulis:section-3'),
  ('PK','materi:pengetahuan-kuantitatif:section-1'),('PK','materi:pengetahuan-kuantitatif:section-2'),('PK','materi:pengetahuan-kuantitatif:section-3'),
  ('LBI','materi:literasi-bahasa-indonesia:section-1'),('LBI','materi:literasi-bahasa-indonesia:section-2'),('LBI','materi:literasi-bahasa-indonesia:section-3'),
  ('LBE','materi:literasi-bahasa-inggris:section-1'),('LBE','materi:literasi-bahasa-inggris:section-2'),('LBE','materi:literasi-bahasa-inggris:section-3'),
  ('PM','materi:penalaran-matematika:section-1'),('PM','materi:penalaran-matematika:section-2'),('PM','materi:penalaran-matematika:section-3')
), target AS (
  SELECT modules.id, ROW_NUMBER() OVER (ORDER BY modules.id) AS temp_rank,
    MAX(ABS(modules.sequence_no)) OVER () AS max_absolute, COUNT(*) OVER () AS total
  FROM "modules" modules JOIN "topics" topics ON topics.id=modules.topic_id JOIN "subtests" subtests ON subtests.id=topics.subtest_id
  JOIN canonical ON canonical.subject_code=subtests.code AND canonical.topic_code=topics.code
)
UPDATE "modules" modules SET "sequence_no" = target.max_absolute + target.total + target.temp_rank FROM target WHERE modules.id=target.id;

WITH canonical(subject_code, topic_code) AS (VALUES
  ('PU','materi:penalaran-umum:section-1'),('PU','materi:penalaran-umum:section-2'),('PU','materi:penalaran-umum:section-3'),
  ('PPU','materi:pengetahuan-pemahaman-umum:section-1'),('PPU','materi:pengetahuan-pemahaman-umum:section-2'),('PPU','materi:pengetahuan-pemahaman-umum:section-3'),
  ('PBM','materi:pemahaman-bacaan-menulis:section-1'),('PBM','materi:pemahaman-bacaan-menulis:section-2'),('PBM','materi:pemahaman-bacaan-menulis:section-3'),
  ('PK','materi:pengetahuan-kuantitatif:section-1'),('PK','materi:pengetahuan-kuantitatif:section-2'),('PK','materi:pengetahuan-kuantitatif:section-3'),
  ('LBI','materi:literasi-bahasa-indonesia:section-1'),('LBI','materi:literasi-bahasa-indonesia:section-2'),('LBI','materi:literasi-bahasa-indonesia:section-3'),
  ('LBE','materi:literasi-bahasa-inggris:section-1'),('LBE','materi:literasi-bahasa-inggris:section-2'),('LBE','materi:literasi-bahasa-inggris:section-3'),
  ('PM','materi:penalaran-matematika:section-1'),('PM','materi:penalaran-matematika:section-2'),('PM','materi:penalaran-matematika:section-3')
), ranked AS (
  SELECT modules.id, ROW_NUMBER() OVER (PARTITION BY subtests.id ORDER BY topics.sort_order, modules.sequence_no, modules.code)::integer AS sequence_no
  FROM "modules" modules JOIN "topics" topics ON topics.id=modules.topic_id JOIN "subtests" subtests ON subtests.id=topics.subtest_id
  JOIN canonical ON canonical.subject_code=subtests.code AND canonical.topic_code=topics.code
)
UPDATE "modules" modules SET "sequence_no"=ranked.sequence_no FROM ranked WHERE modules.id=ranked.id;

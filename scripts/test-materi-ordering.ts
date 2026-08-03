import "dotenv/config";
import pg from "pg";

import { reorderMateriSubject, saveMateriLesson } from "@/lib/materi/repository";
import { prisma } from "@/lib/prisma";

const { Client } = pg;

const SUBJECTS = [
  { code: "PU", slug: "penalaran-umum" },
  { code: "PPU", slug: "pengetahuan-pemahaman-umum" },
  { code: "PBM", slug: "pemahaman-bacaan-menulis" },
  { code: "PK", slug: "pengetahuan-kuantitatif" },
  { code: "LBI", slug: "literasi-bahasa-indonesia" },
  { code: "LBE", slug: "literasi-bahasa-inggris" },
  { code: "PM", slug: "penalaran-matematika" },
] as const;

const PU = "penalaran-umum";
const PPU = "pengetahuan-pemahaman-umum";
const HARNESS_TITLE = "Harness Ordering Sentinel";
const ORDERING_DOCUMENT_URL = "https://cdn.example.test/materi/ordering-fixture.pdf";
const FAILURE_TITLE = "Harness Forced Asset Failure";
const FAILURE_TRIGGER = "materi_ordering_harness_asset_failure";
const FAILURE_FUNCTION = "materi_ordering_harness_fail_asset";

type SubjectCode = (typeof SUBJECTS)[number]["code"];

type AssetSnapshot = {
  assetType: string;
  bodyText: string | null;
  createdAt: string;
  durationSeconds: number | null;
  id: string;
  managedAssetId: string | null;
  mediaUrl: string | null;
  moduleId: string;
  mimeType: string | null;
  originalName: string | null;
  sortOrder: number;
  sourceKind: string | null;
  title: string | null;
};

type ModuleSnapshot = {
  assets: AssetSnapshot[];
  code: string;
  createdAt: string;
  createdByUserId: string | null;
  estimatedMinutes: number | null;
  id: string;
  publishedAt: string | null;
  sequenceNo: number;
  status: string;
  subjectCode: SubjectCode;
  title: string;
  topicCode: string;
  topicId: string;
  updatedAt: string;
  updatedByUserId: string | null;
};

type TopicSnapshot = {
  code: string;
  id: string;
  subjectCode: SubjectCode;
  updatedAt: string;
};

type CountsSnapshot = {
  totalAssets: number;
  totalModules: number;
  unrelatedAssets: number;
  unrelatedModules: number;
};

type TargetSnapshot = {
  counts: CountsSnapshot;
  modules: ModuleSnapshot[];
  topics: TopicSnapshot[];
};

const EVIDENCE_ORDER: Record<SubjectCode, string[]> = Object.fromEntries(
  SUBJECTS.map((subject) => [
    subject.code,
    [1, 2, 3].map((sectionNo) => `demo:materi:${subject.slug}:unit-${sectionNo}`),
  ]),
) as Record<SubjectCode, string[]>;

function canonicalTopicCodes(subjectCode: SubjectCode) {
  const subject = SUBJECTS.find((candidate) => candidate.code === subjectCode);
  if (!subject) throw new Error(`Unknown Materi subject ${subjectCode}.`);
  return [1, 2, 3].map((sectionNo) => `materi:${subject.slug}:section-${sectionNo}`);
}

function allCanonicalTopicCodes(subjectCodes: SubjectCode[]) {
  return subjectCodes.flatMap(canonicalTopicCodes);
}

function stringify(value: unknown) {
  return JSON.stringify(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (stringify(actual) !== stringify(expected)) {
    throw new Error(`${message}\nexpected: ${stringify(expected)}\nactual: ${stringify(actual)}`);
  }
}

function formatDuration(seconds: number) {
  assert(Number.isInteger(seconds) && seconds > 0, "A selected lesson needs a positive optional-video duration.");
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function move<T>(values: T[], from: number, to: number) {
  const reordered = [...values];
  const [item] = reordered.splice(from, 1);
  assert(item !== undefined, "Cannot move a missing list item.");
  reordered.splice(to, 0, item);
  return reordered;
}

function modulesFor(snapshot: TargetSnapshot, subjectCode: SubjectCode) {
  return snapshot.modules.filter((module) => module.subjectCode === subjectCode);
}

function firstAssetByRole(module: ModuleSnapshot, assetType: "attachment" | "video") {
  return module.assets.find((asset) => asset.assetType === assetType);
}

function videoAsset(module: ModuleSnapshot) {
  return firstAssetByRole(module, "video");
}

function orderFor(snapshot: TargetSnapshot, subjectCode: SubjectCode) {
  return modulesFor(snapshot, subjectCode).map((module) => module.code);
}

async function snapshotTarget(client: pg.Client): Promise<TargetSnapshot> {
  const subjectCodes: SubjectCode[] = ["PU", "PPU"];
  const topicCodes = allCanonicalTopicCodes(subjectCodes);
  const moduleRows = await client.query<{
    asset_asset_type: string | null;
    asset_body_text: string | null;
    asset_created_at: string | null;
    asset_duration_seconds: number | null;
    asset_id: string | null;
    asset_media_url: string | null;
    asset_module_id: string | null;
    asset_managed_asset_id: string | null;
    asset_mime_type: string | null;
    asset_original_name: string | null;
    asset_sort_order: number | null;
    asset_source_kind: string | null;
    asset_title: string | null;
    code: string;
    created_at: string;
    created_by_user_id: string | null;
    estimated_minutes: number | null;
    id: string;
    published_at: string | null;
    sequence_no: number;
    status: string;
    subject_code: SubjectCode;
    title: string;
    topic_code: string;
    topic_id: string;
    updated_at: string;
    updated_by_user_id: string | null;
  }>(
    `SELECT
       m.id, m.code, m.sequence_no, m.title, m.topic_id, m.status::text, m.estimated_minutes,
       m.created_by_user_id, m.updated_by_user_id, m.created_at::text, m.updated_at::text, m.published_at::text,
       s.code AS subject_code, t.code AS topic_code,
       a.id AS asset_id, a.module_id AS asset_module_id, a.asset_type::text AS asset_asset_type,
       a.title AS asset_title, a.body_text AS asset_body_text, a.media_url AS asset_media_url,
       a.duration_seconds AS asset_duration_seconds, a.sort_order AS asset_sort_order, a.created_at::text AS asset_created_at,
       a.source_kind::text AS asset_source_kind, a.managed_asset_id AS asset_managed_asset_id,
       a.mime_type AS asset_mime_type, a.original_name AS asset_original_name
     FROM modules m
     JOIN topics t ON t.id = m.topic_id
     JOIN subtests s ON s.id = t.subtest_id
     LEFT JOIN module_assets a ON a.module_id = m.id
     WHERE s.code = ANY($1::text[]) AND t.code = ANY($2::text[]) AND t.parent_topic_id IS NULL
     ORDER BY s.code, m.sequence_no, m.code, a.sort_order, a.id`,
    [subjectCodes, topicCodes],
  );
  const topicRows = await client.query<{ code: string; id: string; subject_code: SubjectCode; updated_at: string }>(
    `SELECT t.id, t.code, s.code AS subject_code, t.updated_at::text
     FROM topics t JOIN subtests s ON s.id = t.subtest_id
     WHERE s.code = ANY($1::text[]) AND t.code = ANY($2::text[]) AND t.parent_topic_id IS NULL
     ORDER BY s.code, t.code`,
    [subjectCodes, topicCodes],
  );
  const countRows = await client.query<CountsSnapshot>(
    `WITH target_modules AS (
       SELECT m.id FROM modules m JOIN topics t ON t.id = m.topic_id JOIN subtests s ON s.id = t.subtest_id
       WHERE s.code = ANY($1::text[]) AND t.code = ANY($2::text[]) AND t.parent_topic_id IS NULL
     )
     SELECT
       (SELECT COUNT(*)::int FROM modules) AS "totalModules",
       (SELECT COUNT(*)::int FROM module_assets) AS "totalAssets",
       (SELECT COUNT(*)::int FROM modules WHERE id NOT IN (SELECT id FROM target_modules)) AS "unrelatedModules",
       (SELECT COUNT(*)::int FROM module_assets WHERE module_id NOT IN (SELECT id FROM target_modules)) AS "unrelatedAssets"`,
    [subjectCodes, topicCodes],
  );

  const modulesById = new Map<string, ModuleSnapshot>();
  for (const row of moduleRows.rows) {
    const snapshotModule = modulesById.get(row.id) ?? {
      assets: [],
      code: row.code,
      createdAt: row.created_at,
      createdByUserId: row.created_by_user_id,
      estimatedMinutes: row.estimated_minutes,
      id: row.id,
      publishedAt: row.published_at,
      sequenceNo: row.sequence_no,
      status: row.status,
      subjectCode: row.subject_code,
      title: row.title,
      topicCode: row.topic_code,
      topicId: row.topic_id,
      updatedAt: row.updated_at,
      updatedByUserId: row.updated_by_user_id,
    };
    if (row.asset_id) {
      snapshotModule.assets.push({
        assetType: row.asset_asset_type!,
        bodyText: row.asset_body_text,
        createdAt: row.asset_created_at!,
        durationSeconds: row.asset_duration_seconds,
        id: row.asset_id,
        managedAssetId: row.asset_managed_asset_id,
        mediaUrl: row.asset_media_url,
        mimeType: row.asset_mime_type,
        moduleId: row.asset_module_id!,
        originalName: row.asset_original_name,
        sortOrder: row.asset_sort_order!,
        sourceKind: row.asset_source_kind,
        title: row.asset_title,
      });
    }
    modulesById.set(row.id, snapshotModule);
  }

  return {
    counts: countRows.rows[0],
    modules: [...modulesById.values()],
    topics: topicRows.rows.map((row) => ({ code: row.code, id: row.id, subjectCode: row.subject_code, updatedAt: row.updated_at })),
  };
}

async function evidenceOrder(client: pg.Client) {
  const subjectCodes = SUBJECTS.map((subject) => subject.code);
  const rows = await client.query<{ code: string; subject_code: SubjectCode }>(
    `SELECT m.code, s.code AS subject_code
     FROM modules m JOIN topics t ON t.id = m.topic_id JOIN subtests s ON s.id = t.subtest_id
     WHERE s.code = ANY($1::text[]) AND t.code = ANY($2::text[]) AND t.parent_topic_id IS NULL
     ORDER BY s.code, m.sequence_no, m.code`,
    [subjectCodes, allCanonicalTopicCodes(subjectCodes)],
  );
  return SUBJECTS.reduce<Record<SubjectCode, string[]>>((orders, subject) => {
    orders[subject.code] = rows.rows.filter((row) => row.subject_code === subject.code).map((row) => row.code);
    return orders;
  }, {} as Record<SubjectCode, string[]>);
}

async function assertSubjectOrder(client: pg.Client, subjectSlug: string, expectedCodes: string[], message: string) {
  const subject = SUBJECTS.find((candidate) => candidate.slug === subjectSlug);
  assert(subject, `Unknown subject slug ${subjectSlug}.`);
  const rows = await client.query<{ code: string }>(
    `SELECT m.code FROM modules m JOIN topics t ON t.id = m.topic_id JOIN subtests s ON s.id = t.subtest_id
     WHERE s.code = $1 AND t.code = ANY($2::text[]) AND t.parent_topic_id IS NULL
     ORDER BY m.sequence_no, m.code`,
    [subject.code, canonicalTopicCodes(subject.code)],
  );
  assertEqual(rows.rows.map((row) => row.code), expectedCodes, message);
}

async function expectReject(operation: () => Promise<unknown>, message: string) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(message);
}

async function installFailureTrigger(client: pg.Client) {
  const existing = await client.query<{ exists: boolean }>("SELECT to_regprocedure($1) IS NOT NULL AS exists", [`public.${FAILURE_FUNCTION}()`]);
  assert(!existing.rows[0]?.exists, `Refusing to replace pre-existing function public.${FAILURE_FUNCTION}().`);
  await client.query(`CREATE FUNCTION public.${FAILURE_FUNCTION}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'materi ordering harness forced asset failure'; END; $$`);
  await client.query(`CREATE TRIGGER ${FAILURE_TRIGGER} BEFORE INSERT OR UPDATE ON module_assets FOR EACH ROW WHEN (NEW.title = '${FAILURE_TITLE}') EXECUTE FUNCTION public.${FAILURE_FUNCTION}()`);
}

async function cleanup(client: pg.Client, initial: TargetSnapshot, generatedModuleIds: string[], generatedCodes: string[]) {
  await client.query("BEGIN");
  try {
    await client.query(`DROP TRIGGER IF EXISTS ${FAILURE_TRIGGER} ON module_assets`);
    await client.query(`DROP FUNCTION IF EXISTS public.${FAILURE_FUNCTION}()`);

    if (generatedModuleIds.length > 0 || generatedCodes.length > 0) {
      const harnessModules = await client.query<{ id: string }>(
        "SELECT id FROM modules WHERE id = ANY($1::uuid[]) OR code = ANY($2::text[])",
        [generatedModuleIds, generatedCodes],
      );
      const harnessModuleIds = harnessModules.rows.map((row) => row.id);
      if (harnessModuleIds.length > 0) {
        await client.query("DELETE FROM module_assets WHERE module_id = ANY($1::uuid[])", [harnessModuleIds]);
        await client.query("DELETE FROM modules WHERE id = ANY($1::uuid[])", [harnessModuleIds]);
      }
    }

    const maxSequence = await client.query<{ value: number }>("SELECT COALESCE(MAX(ABS(sequence_no)), 0)::int AS value FROM modules");
    const temporaryBase = maxSequence.rows[0].value + initial.modules.length + 1;
    for (const [index, lesson] of initial.modules.entries()) {
      await client.query("UPDATE modules SET sequence_no = $1 WHERE id = $2", [temporaryBase + index, lesson.id]);
    }
    for (const lesson of initial.modules) {
      await client.query(
        `UPDATE modules SET
           topic_id = $1, sequence_no = $2, title = $3, status = $4::content_status, estimated_minutes = $5,
           created_by_user_id = $6, updated_by_user_id = $7, created_at = $8::timestamptz,
           updated_at = $9::timestamptz, published_at = $10::timestamptz
         WHERE id = $11`,
        [lesson.topicId, lesson.sequenceNo, lesson.title, lesson.status, lesson.estimatedMinutes,
          lesson.createdByUserId, lesson.updatedByUserId, lesson.createdAt, lesson.updatedAt, lesson.publishedAt, lesson.id],
      );
    }

    for (const lesson of initial.modules) {
      await client.query("DELETE FROM module_assets WHERE module_id = $1", [lesson.id]);
      for (const asset of lesson.assets) {
        await client.query(
          `INSERT INTO module_assets
             (id, module_id, asset_type, source_kind, managed_asset_id, title, body_text,
              media_url, mime_type, original_name, duration_seconds, sort_order, created_at)
           VALUES ($1, $2, $3::module_asset_type, $4::module_asset_source_kind, $5, $6, $7,
                   $8, $9, $10, $11, $12, $13::timestamptz)`,
          [asset.id, asset.moduleId, asset.assetType, asset.sourceKind, asset.managedAssetId,
            asset.title, asset.bodyText, asset.mediaUrl, asset.mimeType, asset.originalName,
            asset.durationSeconds, asset.sortOrder, asset.createdAt],
        );
      }
    }

    for (const topic of initial.topics) {
      await client.query("UPDATE topics SET updated_at = $1::timestamptz WHERE id = $2", [topic.updatedAt, topic.id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function assertCleanDatabase(client: pg.Client, initial: TargetSnapshot, generatedCodes: string[]) {
  assertEqual(await snapshotTarget(client), initial, "PU/PPU snapshot differs from its pre-harness state after cleanup.");
  assertEqual(await evidenceOrder(client), EVIDENCE_ORDER, "The seven-subject evidence order differs after cleanup.");
  const leftovers = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM modules m LEFT JOIN module_assets a ON a.module_id = m.id
     WHERE m.code = ANY($1::text[]) OR m.title = $2 OR a.title = $2`,
    [generatedCodes, HARNESS_TITLE],
  );
  assert(leftovers.rows[0].count === 0, "Harness module, code, or asset remains after cleanup.");
  const triggerResidue = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM pg_trigger trigger
     JOIN pg_class relation ON relation.oid = trigger.tgrelid
     WHERE trigger.tgname = 'materi_ordering_harness_asset_failure'
       AND relation.relname = 'module_assets'
       AND NOT trigger.tgisinternal`,
  );
  assert(triggerResidue.rows[0].count === 0, "Harness asset-failure trigger remains after cleanup.");
  const functionResidue = await client.query<{ procedure: string | null }>(
    "SELECT to_regprocedure('public.materi_ordering_harness_fail_asset()')::text AS procedure",
  );
  assert(functionResidue.rows[0].procedure === null, "Harness asset-failure function remains after cleanup.");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  assert(databaseUrl, "DATABASE_URL is required before running the ordering harness.");

  const client = new Client({ connectionString: databaseUrl });
  let initial: TargetSnapshot | undefined;
  const generatedModuleIds: string[] = [];
  const generatedCodes: string[] = [];
  let primaryError: unknown;

  try {
    await client.connect();
    const tutor = await client.query<{ id: string }>(
      `SELECT u.id FROM users u
       JOIN role_assignments r ON r.user_id = u.id AND r.role = 'tutor' AND r.revoked_at IS NULL
       JOIN tutor_profiles p ON p.user_id = u.id AND p.is_active
       WHERE u.status = 'active' LIMIT 1`,
    );
    assert(tutor.rowCount === 1, "No active tutor is available for the Materi ordering harness.");
    const tutorId = tutor.rows[0]?.id;
    assert(tutorId, "The active tutor result is missing its id.");

    initial = await snapshotTarget(client);
    assert(initial.modules.length > 4, "PU/PPU needs at least five modules for first/middle/last reorder coverage.");
    assert(initial.topics.length === 6, "PU/PPU must each retain exactly three canonical topics.");
    assertEqual(await evidenceOrder(client), EVIDENCE_ORDER, "The approved database is not at the evidence-backed seven-subject order before the harness runs.");

    const puOrder = orderFor(initial, "PU");
    const ppuOrder = orderFor(initial, "PPU");
    assert(puOrder.length > 2 && ppuOrder.length > 2, "PU and PPU must contain the three approved demo units.");

    const firstMove = move(puOrder, 0, puOrder.length - 1);
    await reorderMateriSubject(PU, firstMove, tutorId);
    await assertSubjectOrder(client, PU, firstMove, "First-item reorder did not persist its requested order.");

    const middleIndex = Math.floor(firstMove.length / 2);
    const middleMove = move(firstMove, middleIndex, middleIndex + 1);
    await reorderMateriSubject(PU, middleMove, tutorId);
    await assertSubjectOrder(client, PU, middleMove, "Middle-item reorder did not persist its requested order.");

    const lastMove = move(middleMove, middleMove.length - 1, 0);
    await reorderMateriSubject(PU, lastMove, tutorId);
    await assertSubjectOrder(client, PU, lastMove, "Last-item reorder did not persist its requested order.");
    await reorderMateriSubject(PU, puOrder, tutorId);
    await assertSubjectOrder(client, PU, puOrder, "Canonical PU order did not restore before concurrent tests.");

    await expectReject(() => reorderMateriSubject(PU, [...puOrder, puOrder[0]], tutorId), "Duplicate reorder payload unexpectedly succeeded.");
    await assertSubjectOrder(client, PU, puOrder, "Duplicate reorder rejection changed PU order.");
    await expectReject(() => reorderMateriSubject(PU, puOrder.slice(1), tutorId), "Missing-code reorder payload unexpectedly succeeded.");
    await assertSubjectOrder(client, PU, puOrder, "Missing-code reorder rejection changed PU order.");

    const overlappingFirst = [...puOrder].reverse();
    const overlappingSecond = move(puOrder, 1, puOrder.length - 2);
    const overlappingResults = await Promise.all([
      reorderMateriSubject(PU, overlappingFirst, tutorId),
      reorderMateriSubject(PU, overlappingSecond, tutorId),
    ]);
    assertEqual(overlappingResults[0].map((lesson) => lesson.code), overlappingFirst, "First overlapping reorder did not return its canonical result.");
    assertEqual(overlappingResults[1].map((lesson) => lesson.code), overlappingSecond, "Second overlapping reorder did not return its canonical result.");
    const overlappingFinal = await (async () => {
      const rows = await client.query<{ code: string }>(
        `SELECT m.code FROM modules m JOIN topics t ON t.id = m.topic_id JOIN subtests s ON s.id = t.subtest_id
         WHERE s.code = 'PU' AND t.code = ANY($1::text[]) ORDER BY m.sequence_no, m.code`,
        [canonicalTopicCodes("PU")],
      );
      return rows.rows.map((row) => row.code);
    })();
    assert(
      stringify(overlappingFinal) === stringify(overlappingFirst) || stringify(overlappingFinal) === stringify(overlappingSecond),
      "Overlapping reorders did not serialize to one submitted canonical order.",
    );
    await reorderMateriSubject(PU, puOrder, tutorId);

    const overlapLesson = modulesFor(initial, "PU").find((module) => videoAsset(module)?.mediaUrl && videoAsset(module)?.durationSeconds) ?? initial.modules[0];
    const overlapVideo = videoAsset(overlapLesson);
    assert(overlapVideo?.mediaUrl && overlapVideo.durationSeconds, "A PU lesson with a usable video resource is required.");
    const saveOverlapTitle = `${overlapLesson.title} [harness save overlap]`;
    const saveOverlapOrder = [...puOrder].reverse();
    await Promise.all([
      saveMateriLesson({
        code: overlapLesson.code,
        document: { hostedUrl: ORDERING_DOCUMENT_URL, originalName: "ordering-fixture.pdf" },
        subjectSlug: PU,
        title: saveOverlapTitle,
        videoDuration: formatDuration(overlapVideo.durationSeconds),
        videoUrl: overlapVideo.mediaUrl,
      }, tutorId),
      reorderMateriSubject(PU, saveOverlapOrder, tutorId),
    ]);
    await assertSubjectOrder(client, PU, saveOverlapOrder, "Save/reorder overlap did not retain the submitted reorder order.");
    const overlapResult = await client.query<{ media_url: string | null; title: string }>(
      `SELECT m.title,
              (SELECT a.media_url FROM module_assets a
               WHERE a.module_id = m.id AND a.asset_type = 'video'
               ORDER BY a.id LIMIT 1) AS media_url
       FROM modules m WHERE m.id = $1`,
      [overlapLesson.id],
    );
    assert(overlapResult.rows[0]?.title === saveOverlapTitle && overlapResult.rows[0]?.media_url === overlapVideo.mediaUrl, "Save/reorder overlap did not retain the saved content and video resource.");
    await reorderMateriSubject(PU, puOrder, tutorId);

    const created = await saveMateriLesson({
      document: { hostedUrl: ORDERING_DOCUMENT_URL, originalName: "ordering-fixture.pdf" },
      subjectSlug: PU,
      title: HARNESS_TITLE,
      videoDuration: "01:01",
      videoUrl: "https://example.test/harness.mp4",
    }, tutorId);
    generatedCodes.push(created.code);
    const createdRow = await client.query<{
      code: string; document_asset_type: string | null; document_media_url: string | null; id: string;
      video_asset_type: string | null; video_duration_seconds: number | null; video_media_url: string | null;
      sequence_no: number; status: string; title: string; topic_code: string;
    }>(
      `SELECT m.id, m.code, m.sequence_no, m.status::text, t.code AS topic_code,
              m.title,
              d.asset_type::text AS document_asset_type, d.media_url AS document_media_url,
              v.asset_type::text AS video_asset_type, v.media_url AS video_media_url,
              v.duration_seconds AS video_duration_seconds
       FROM modules m JOIN topics t ON t.id = m.topic_id
       LEFT JOIN LATERAL (
         SELECT asset_type, media_url FROM module_assets
         WHERE module_id = m.id AND asset_type = 'attachment'
         ORDER BY id LIMIT 1
       ) d ON true
       LEFT JOIN LATERAL (
         SELECT asset_type, media_url, duration_seconds FROM module_assets
         WHERE module_id = m.id AND asset_type = 'video'
         ORDER BY id LIMIT 1
       ) v ON true
       WHERE m.code = $1`,
      [created.code],
    );
    const createdModule = createdRow.rows[0];
    assert(createdModule, "Created harness lesson could not be reloaded.");
    generatedModuleIds.push(createdModule.id);
    assert(
      createdModule.sequence_no === puOrder.length + 1 && createdModule.topic_code === canonicalTopicCodes("PU")[0]
        && createdModule.status === "draft" && createdModule.title === HARNESS_TITLE
        && createdModule.document_asset_type === "attachment" && createdModule.document_media_url === ORDERING_DOCUMENT_URL
        && createdModule.video_asset_type === "video" && createdModule.video_media_url === "https://example.test/harness.mp4"
        && createdModule.video_duration_seconds === 61,
      "Create must append a draft with explicit document and optional video resources.",
    );

    const movable = modulesFor(initial, "PU").find((module) => videoAsset(module)?.mediaUrl && videoAsset(module)?.durationSeconds) ?? initial.modules[0];
    const movableVideo = videoAsset(movable);
    assert(movableVideo?.mediaUrl && movableVideo.durationSeconds, "A PU lesson with a usable video resource is required for the subject move.");
    await saveMateriLesson({
      code: movable.code,
      document: { hostedUrl: ORDERING_DOCUMENT_URL, originalName: "ordering-fixture.pdf" },
      subjectSlug: PPU,
      title: movable.title,
      videoDuration: formatDuration(movableVideo.durationSeconds),
      videoUrl: movableVideo.mediaUrl,
    }, tutorId);
    const moved = await client.query<{
      asset_id: string | null; asset_type: string | null; code: string; duration_seconds: number | null; media_url: string | null;
      published_at: string | null; sequence_no: number; status: string; subject_code: SubjectCode; topic_code: string;
    }>(
      `SELECT m.code, m.sequence_no, m.status::text, m.published_at::text, s.code AS subject_code, t.code AS topic_code,
              a.id AS asset_id, a.asset_type::text, a.media_url, a.duration_seconds
       FROM modules m JOIN topics t ON t.id = m.topic_id JOIN subtests s ON s.id = t.subtest_id
       LEFT JOIN LATERAL (
         SELECT id, asset_type, media_url, duration_seconds FROM module_assets
         WHERE module_id = m.id AND asset_type = 'video'
         ORDER BY id LIMIT 1
       ) a ON true WHERE m.id = $1`,
      [movable.id],
    );
    const movedModule = moved.rows[0];
    assert(
      movedModule?.code === movable.code && movedModule.subject_code === "PPU" && movedModule.topic_code === canonicalTopicCodes("PPU")[0]
        && movedModule.sequence_no === ppuOrder.length + 1 && movedModule.status === movable.status && movedModule.published_at === movable.publishedAt
        && movedModule.asset_id === movableVideo.id && movedModule.asset_type === movableVideo.assetType
        && movedModule.media_url === movableVideo.mediaUrl && movedModule.duration_seconds === movableVideo.durationSeconds,
      "Cross-subject save must preserve code, video resource, and lifecycle while appending to deterministic PPU placement.",
    );

    const forcedTarget = modulesFor(initial, "PPU").find((module) => videoAsset(module)?.mediaUrl && videoAsset(module)?.durationSeconds) ?? initial.modules[0];
    const forcedVideo = videoAsset(forcedTarget);
    assert(forcedVideo?.mediaUrl && forcedVideo.durationSeconds, "A PPU lesson with a usable video resource is required for forced rollback.");
    const forcedVideoUrl = forcedVideo.mediaUrl;
    const forcedDuration = forcedVideo.durationSeconds;
    const rollbackBefore = await snapshotTarget(client);
    await installFailureTrigger(client);
    await expectReject(
      () => saveMateriLesson({
        code: forcedTarget.code,
        document: { hostedUrl: ORDERING_DOCUMENT_URL, originalName: "ordering-fixture.pdf" },
        subjectSlug: PPU,
        title: FAILURE_TITLE,
        videoDuration: formatDuration(forcedDuration),
        videoUrl: forcedVideoUrl,
      }, tutorId),
      "Forced asset failure unexpectedly succeeded.",
    );
    assertEqual(await snapshotTarget(client), rollbackBefore, "Forced asset failure partially wrote state before cleanup.");
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      if (initial) {
        await cleanup(client, initial, generatedModuleIds, generatedCodes);
        await assertCleanDatabase(client, initial, generatedCodes);
      }
    } catch (cleanupError) {
      if (primaryError) throw new AggregateError([primaryError, cleanupError], "Materi ordering harness failed and cleanup did not complete.");
      throw cleanupError;
    } finally {
      try {
        await client.end();
      } finally {
        await prisma.$disconnect();
      }
    }
  }

  console.log("Materi ordering harness passed: reorders, invalid payloads, overlaps, create, subject move, rollback, and exact cleanup.");
}

function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    return [error.message, ...error.errors.map((nested) => describeError(nested))].join("\n\n");
  }
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

main().catch((error) => {
  console.error(describeError(error));
  process.exitCode = 1;
});

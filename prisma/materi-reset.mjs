import "dotenv/config";

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

import {
  MATERI_CATALOGUE,
  MATERI_DEMO_MODULES,
  MATERI_DEMO_PDF_FILENAME,
  MATERI_DEMO_VIDEO_URL,
  MATERI_DEMO_VIDEO_DURATION_SECONDS,
  MATERI_DOCUMENT_MIME_TYPE,
  resolveMateriDemoPdfUrl,
  seedMateriCatalogue,
} from "./materi-seed.mjs";

const { Client } = pg;

const MATERI_RESET_CONFIRMATION = "RESET_CANONICAL_MATERI_DEMO_ONLY";
const MATERI_SUBJECT_CODES = MATERI_CATALOGUE.map((subject) => subject.code);
const MATERI_TOPIC_CODES = MATERI_CATALOGUE.flatMap((subject) =>
  subject.sections.map((_, sectionIndex) => `materi:${subject.slug}:section-${sectionIndex + 1}`),
);
const MATERI_DEMO_CODES = MATERI_DEMO_MODULES.map((module) => module.code);

const ALLOWED_MODULE_FK_REFERENCES = new Set([
  "module_assets.module_id",
  "module_progress.module_id",
  "module_prerequisites.module_id",
  "module_prerequisites.prerequisite_module_id",
]);

function parseMateriResetArgs(argv) {
  const args = [...argv];
  const apply = args.includes("--apply");
  let confirmation = null;
  const unknown = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--apply") continue;
    if (argument === "--confirm") {
      confirmation = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (argument.startsWith("--confirm=")) {
      confirmation = argument.slice("--confirm=".length);
      continue;
    }
    if (argument === "--help" || argument === "-h") continue;
    unknown.push(argument);
  }
  if (unknown.length > 0) {
    throw new Error(`Unknown Materi reset argument(s): ${unknown.join(", ")}`);
  }
  if (!apply && confirmation !== null) {
    throw new Error("--confirm is only valid together with --apply; preflight is read-only by default.");
  }
  if (apply && confirmation !== MATERI_RESET_CONFIRMATION) {
    throw new Error(`Refusing to reset Materi without --confirm=${MATERI_RESET_CONFIRMATION}.`);
  }
  return { apply, confirmation };
}

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required before running the guarded Materi reset/seed.");
  return databaseUrl;
}

function requireTutorEmail() {
  const email = process.env.MATERI_SEED_TUTOR_EMAIL?.trim() || process.env.SEED_TUTOR_EMAIL?.trim();
  if (!email) {
    throw new Error("MATERI_SEED_TUTOR_EMAIL (or SEED_TUTOR_EMAIL) must identify an existing active tutor.");
  }
  return email;
}

function assertApplyPdfUrlIsExplicit(pdfUrl) {
  if (!process.env.MATERI_DEMO_PDF_URL?.trim()) {
    throw new Error("Applying the Materi reset requires an explicit MATERI_DEMO_PDF_URL; do not publish an implicit localhost fixture to a database.");
  }

  const hostname = new URL(pdfUrl).hostname.toLowerCase();
  const isLocalHost = hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || hostname === "::1"
    || hostname.endsWith(".local");
  if (isLocalHost && process.env.MATERI_ALLOW_LOCAL_PDF_URL !== "1") {
    throw new Error("The Materi reset will not publish a localhost PDF URL without MATERI_ALLOW_LOCAL_PDF_URL=1. Set an explicitly reachable MATERI_DEMO_PDF_URL for a shared/deployment database.");
  }
}

async function assertLocalDemoPdfAvailable(pdfUrl) {
  let parsed;
  try {
    parsed = new URL(pdfUrl);
  } catch {
    throw new Error(`Materi demo PDF URL is not a valid absolute URL: ${pdfUrl}`);
  }

  if (!parsed.pathname.endsWith("/api/materi-demo/test.pdf")) return;

  let fixture;
  try {
    fixture = await stat(join(process.cwd(), "tmp", MATERI_DEMO_PDF_FILENAME));
  } catch {
    throw new Error(`The local Materi demo PDF fixture is missing: tmp/${MATERI_DEMO_PDF_FILENAME}`);
  }
  if (!fixture.isFile() || fixture.size <= 0) {
    throw new Error(`The local Materi demo PDF fixture is empty or not a file: tmp/${MATERI_DEMO_PDF_FILENAME}`);
  }

  const header = await readFile(join(process.cwd(), "tmp", MATERI_DEMO_PDF_FILENAME), { encoding: null });
  if (header.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`The local Materi demo fixture does not have a PDF signature: tmp/${MATERI_DEMO_PDF_FILENAME}`);
  }
}

function expectedTopicKey(subjectCode, topicCode) {
  return `${subjectCode}:${topicCode}`;
}

function asInt(value) {
  return Number(value ?? 0);
}

function tableRowsForPrint(preflight) {
  return preflight.scopeRows.map((row) => ({
    subject: row.subject_code,
    section: row.topic_code,
    modules: asInt(row.module_count),
    assets: asInt(row.asset_count),
    progress: asInt(row.progress_count),
    prerequisites: asInt(row.prerequisite_count),
  }));
}

function printPreflight(preflight) {
  console.log("\nMATERI RESET PREFLIGHT (read-only)");
  console.log(`subjects: ${preflight.subjectRows.length} (expected ${MATERI_SUBJECT_CODES.length})`);
  console.log(`sections: ${preflight.topicRows.length} (expected ${MATERI_TOPIC_CODES.length})`);
  console.log(`canonical modules selected: ${preflight.moduleRows.length}`);
  console.log(`module assets selected: ${preflight.assetCount}`);
  console.log(`Materi-owned ModuleProgress selected: ${preflight.progressCount}`);
  console.log(`prerequisite rows touching selected modules: ${preflight.prerequisiteCount}`);
  console.log(`cross-scope prerequisite edges (abort): ${preflight.unexpectedPrerequisiteEdges.length}`);
  console.log(`shared managed Media Asset references (preserved): ${preflight.sharedManagedAssetReferenceCount}`);
  console.log(`unexpected canonical-subject modules: ${preflight.unexpectedSubjectModules.length}`);
  console.log(`unexpected module dependencies: ${preflight.unexpectedDependencies.length}`);
  console.table(tableRowsForPrint(preflight));
  if (preflight.unexpectedSubjectModules.length > 0) {
    console.table(preflight.unexpectedSubjectModules);
  }
  if (preflight.unexpectedDependencies.length > 0) {
    console.table(preflight.unexpectedDependencies);
  }
  if (preflight.unexpectedPrerequisiteEdges.length > 0) {
    console.table(preflight.unexpectedPrerequisiteEdges);
  }
}

function printPostCounts(postflight) {
  console.log("\nMATERI RESET/SEED POST COUNTS");
  console.log(`subjects: ${postflight.subjectCount}`);
  console.log(`sections: ${postflight.topicCount}`);
  console.log(`demo modules: ${postflight.demoModuleCount}`);
  console.log(`PDF attachment resources: ${postflight.attachmentCount}`);
  console.log(`optional video resources: ${postflight.videoCount}`);
  console.log(`Materi-owned ModuleProgress: ${postflight.progressCount}`);
  console.log(`prerequisite rows touching demo modules: ${postflight.prerequisiteCount}`);
  console.table(postflight.bySubject);
}

async function resolveActiveTutor(client, email) {
  const result = await client.query(
    `SELECT users.id
       FROM users
       JOIN role_assignments
         ON role_assignments.user_id = users.id
        AND role_assignments.role = 'tutor'
        AND role_assignments.revoked_at IS NULL
       JOIN tutor_profiles
         ON tutor_profiles.user_id = users.id
        AND tutor_profiles.is_active = TRUE
      WHERE LOWER(users.email) = LOWER($1)
        AND users.status = 'active'
      LIMIT 1
      FOR UPDATE OF users, role_assignments, tutor_profiles`,
    [email],
  );
  if (!result.rowCount) {
    throw new Error(`Tutor ${email} must be an existing active user with an active tutor role assignment and tutor profile.`);
  }
  return result.rows[0].id;
}

async function countModuleReferences(client, moduleRows) {
  const moduleIds = moduleRows.map((row) => row.id);
  if (moduleIds.length === 0) {
    return {
      assetCount: 0,
      progressCount: 0,
      prerequisiteCount: 0,
      sharedManagedAssetReferenceCount: 0,
      unexpectedDependencies: [],
      unexpectedPrerequisiteEdges: [],
    };
  }
  // Keep these reads sequential: node-postgres queues concurrent operations
  // on one client and emits a deprecation warning for Promise.all here.
  const assets = await client.query(
    "SELECT COUNT(*)::int AS count FROM module_assets WHERE module_id = ANY($1::uuid[])",
    [moduleIds],
  );
  const progress = await client.query(
    "SELECT COUNT(*)::int AS count FROM module_progress WHERE module_id = ANY($1::uuid[])",
    [moduleIds],
  );
  const prerequisites = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM module_prerequisites
      WHERE module_id = ANY($1::uuid[])
         OR prerequisite_module_id = ANY($1::uuid[])`,
    [moduleIds],
  );
  const sharedAssets = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM module_assets
      WHERE module_id = ANY($1::uuid[])
        AND managed_asset_id IS NOT NULL`,
    [moduleIds],
  );
  const crossScopePrerequisites = await client.query(
    `SELECT prerequisites.module_id,
            prerequisites.prerequisite_module_id,
            dependent.code AS dependent_code,
            prerequisite.code AS prerequisite_code
       FROM module_prerequisites prerequisites
       JOIN modules dependent ON dependent.id = prerequisites.module_id
       JOIN modules prerequisite ON prerequisite.id = prerequisites.prerequisite_module_id
      WHERE (
        prerequisites.module_id = ANY($1::uuid[])
        AND NOT (prerequisites.prerequisite_module_id = ANY($1::uuid[]))
      ) OR (
        prerequisites.prerequisite_module_id = ANY($1::uuid[])
        AND NOT (prerequisites.module_id = ANY($1::uuid[]))
      )
      ORDER BY dependent.code, prerequisite.code`,
    [moduleIds],
  );
  const foreignKeys = await client.query(
    `SELECT child_ns.nspname AS schema_name,
            child.relname AS table_name,
            child_col.attname AS column_name,
            con.conname AS constraint_name
       FROM pg_constraint con
       JOIN pg_class child ON child.oid = con.conrelid
       JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
       JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS child_key(attnum, position) ON TRUE
       JOIN pg_attribute child_col
         ON child_col.attrelid = child.oid
        AND child_col.attnum = child_key.attnum
      WHERE con.contype = 'f'
        AND con.confrelid = to_regclass('public.modules')
      ORDER BY child_ns.nspname, child.relname, child_col.attname`,
  );

  const unexpectedDependencies = [];
  for (const foreignKey of foreignKeys.rows) {
    const referenceKey = `${foreignKey.table_name}.${foreignKey.column_name}`;
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM ${quoteIdentifier(foreignKey.schema_name)}.${quoteIdentifier(foreignKey.table_name)}
        WHERE ${quoteIdentifier(foreignKey.column_name)} = ANY($1::uuid[])`,
      [moduleIds],
    );
    const count = asInt(countResult.rows[0]?.count);
    if (count > 0 && !ALLOWED_MODULE_FK_REFERENCES.has(referenceKey)) {
      unexpectedDependencies.push({
        count,
        constraint: foreignKey.constraint_name,
        reference: referenceKey,
      });
    }
  }

  return {
    assetCount: asInt(assets.rows[0]?.count),
    progressCount: asInt(progress.rows[0]?.count),
    prerequisiteCount: asInt(prerequisites.rows[0]?.count),
    sharedManagedAssetReferenceCount: asInt(sharedAssets.rows[0]?.count),
    unexpectedDependencies,
    unexpectedPrerequisiteEdges: crossScopePrerequisites.rows,
  };
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

async function inspectMateriReset(client) {
  const subjectResult = await client.query(
    `SELECT id, code, name, sort_order, is_active
       FROM subtests
      WHERE code = ANY($1::text[])
      ORDER BY sort_order, code`,
    [MATERI_SUBJECT_CODES],
  );
  const topicResult = await client.query(
    `SELECT topics.id, topics.code, topics.name, topics.sort_order,
            topics.is_active, topics.parent_topic_id,
            subtests.code AS subject_code
       FROM topics
       JOIN subtests ON subtests.id = topics.subtest_id
      WHERE subtests.code = ANY($1::text[])
        AND topics.code = ANY($2::text[])
      ORDER BY subtests.sort_order, topics.sort_order, topics.code`,
    [MATERI_SUBJECT_CODES, MATERI_TOPIC_CODES],
  );
  const moduleResult = await client.query(
    `SELECT modules.id, modules.code, modules.status::text AS status,
            topics.code AS topic_code, subtests.code AS subject_code
       FROM modules
       JOIN topics ON topics.id = modules.topic_id
       JOIN subtests ON subtests.id = topics.subtest_id
      WHERE subtests.code = ANY($1::text[])
        AND topics.code = ANY($2::text[])
      ORDER BY subtests.sort_order, topics.sort_order, modules.sequence_no, modules.code`,
    [MATERI_SUBJECT_CODES, MATERI_TOPIC_CODES],
  );
  const unexpectedSubjectModuleResult = await client.query(
    `SELECT modules.id, modules.code,
            subtests.code AS subject_code, topics.code AS topic_code
       FROM modules
       JOIN topics ON topics.id = modules.topic_id
       JOIN subtests ON subtests.id = topics.subtest_id
      WHERE subtests.code = ANY($1::text[])
        AND NOT (topics.code = ANY($2::text[]))
      ORDER BY subtests.sort_order, topics.sort_order, modules.sequence_no, modules.code`,
    [MATERI_SUBJECT_CODES, MATERI_TOPIC_CODES],
  );
  const scopeResult = await client.query(
    `SELECT subtests.code AS subject_code,
            topics.code AS topic_code,
            COUNT(DISTINCT modules.id)::int AS module_count,
            COUNT(DISTINCT module_assets.id)::int AS asset_count,
            COUNT(DISTINCT module_progress.id)::int AS progress_count,
            COUNT(DISTINCT module_prerequisites.module_id)
              + COUNT(DISTINCT module_prerequisites.prerequisite_module_id)::int AS prerequisite_count
       FROM subtests
       JOIN topics ON topics.subtest_id = subtests.id
       LEFT JOIN modules ON modules.topic_id = topics.id
       LEFT JOIN module_assets ON module_assets.module_id = modules.id
       LEFT JOIN module_progress ON module_progress.module_id = modules.id
       LEFT JOIN module_prerequisites
         ON module_prerequisites.module_id = modules.id
         OR module_prerequisites.prerequisite_module_id = modules.id
      WHERE subtests.code = ANY($1::text[])
        AND topics.code = ANY($2::text[])
      GROUP BY subtests.sort_order, subtests.code, topics.sort_order, topics.code
      ORDER BY subtests.sort_order, topics.sort_order, topics.code`,
    [MATERI_SUBJECT_CODES, MATERI_TOPIC_CODES],
  );

  const references = await countModuleReferences(client, moduleResult.rows);
  return {
    assetCount: references.assetCount,
    moduleRows: moduleResult.rows,
    prerequisiteCount: references.prerequisiteCount,
    progressCount: references.progressCount,
    sharedManagedAssetReferenceCount: references.sharedManagedAssetReferenceCount,
    subjectRows: subjectResult.rows,
    topicRows: topicResult.rows,
    scopeRows: scopeResult.rows,
    unexpectedDependencies: references.unexpectedDependencies,
    unexpectedPrerequisiteEdges: references.unexpectedPrerequisiteEdges,
    unexpectedSubjectModules: unexpectedSubjectModuleResult.rows,
  };
}

function assertSafeMateriPreflight(preflight) {
  const failures = [];
  if (preflight.subjectRows.length !== MATERI_SUBJECT_CODES.length) {
    failures.push(`expected exactly ${MATERI_SUBJECT_CODES.length} canonical subjects, found ${preflight.subjectRows.length}`);
  }
  const subjectByCode = new Map(preflight.subjectRows.map((row) => [row.code, row]));
  for (const [index, subject] of MATERI_CATALOGUE.entries()) {
    const row = subjectByCode.get(subject.code);
    if (!row) {
      failures.push(`missing canonical subject ${subject.code}`);
      continue;
    }
    if (row.name !== subject.name || asInt(row.sort_order) !== index + 1 || !row.is_active) {
      failures.push(`canonical subject ${subject.code} metadata differs from the shared contract`);
    }
  }

  if (preflight.topicRows.length !== MATERI_TOPIC_CODES.length) {
    failures.push(`expected exactly ${MATERI_TOPIC_CODES.length} canonical sections, found ${preflight.topicRows.length}`);
  }
  const topicsByKey = new Map(preflight.topicRows.map((row) => [expectedTopicKey(row.subject_code, row.code), row]));
  for (const subject of MATERI_CATALOGUE) {
    for (const [sectionIndex, section] of subject.sections.entries()) {
      const topicCode = `materi:${subject.slug}:section-${sectionIndex + 1}`;
      const row = topicsByKey.get(expectedTopicKey(subject.code, topicCode));
      if (!row) {
        failures.push(`missing canonical section ${subject.code}/${topicCode}`);
        continue;
      }
      if (row.name !== section.name || asInt(row.sort_order) !== sectionIndex + 1 || !row.is_active || row.parent_topic_id !== null) {
        failures.push(`canonical section ${subject.code}/${topicCode} metadata differs from the shared contract`);
      }
    }
  }
  if (preflight.unexpectedSubjectModules.length > 0) {
    failures.push("canonical subjects contain modules outside the three canonical section topics");
  }
  if (preflight.unexpectedDependencies.length > 0) {
    failures.push("canonical modules have quiz/tryout/operational dependencies outside the explicitly cleanable rows");
  }
  if (preflight.unexpectedPrerequisiteEdges.length > 0) {
    failures.push("canonical modules have prerequisite edges to modules outside the selected canonical Materi set");
  }
  if (failures.length > 0) {
    throw new Error(`Materi reset preflight aborted:\n- ${failures.join("\n- ")}`);
  }
}

async function deleteCanonicalMateri(client, moduleRows) {
  const moduleIds = moduleRows.map((row) => row.id);
  if (moduleIds.length === 0) return { assets: 0, modules: 0, prerequisites: 0, progress: 0 };
  const prerequisites = await client.query(
    `DELETE FROM module_prerequisites
      WHERE module_id = ANY($1::uuid[])
        AND prerequisite_module_id = ANY($1::uuid[])`,
    [moduleIds],
  );
  const progress = await client.query(
    "DELETE FROM module_progress WHERE module_id = ANY($1::uuid[])",
    [moduleIds],
  );
  const assets = await client.query(
    "DELETE FROM module_assets WHERE module_id = ANY($1::uuid[])",
    [moduleIds],
  );
  const modules = await client.query(
    "DELETE FROM modules WHERE id = ANY($1::uuid[])",
    [moduleIds],
  );
  return {
    assets: assets.rowCount,
    modules: modules.rowCount,
    prerequisites: prerequisites.rowCount,
    progress: progress.rowCount,
  };
}

async function inspectPostSeed(client) {
  const subjectCountResult = await client.query(
    "SELECT COUNT(*)::int AS count FROM subtests WHERE code = ANY($1::text[]) AND is_active = TRUE",
    [MATERI_SUBJECT_CODES],
  );
  const topicCountResult = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM topics
       JOIN subtests ON subtests.id = topics.subtest_id
      WHERE subtests.code = ANY($1::text[])
        AND topics.code = ANY($2::text[])
        AND topics.parent_topic_id IS NULL
        AND topics.is_active = TRUE`,
    [MATERI_SUBJECT_CODES, MATERI_TOPIC_CODES],
  );
  const demoModuleResult = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM modules
      WHERE code = ANY($1::text[])
        AND status = 'published'`,
    [MATERI_DEMO_CODES],
  );
  const attachmentResult = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM module_assets
      WHERE module_id IN (SELECT id FROM modules WHERE code = ANY($1::text[]))
        AND asset_type = 'attachment'
        AND source_kind = 'hosted'
        AND mime_type = $2
        AND original_name = $3
        AND media_url IS NOT NULL`,
    [MATERI_DEMO_CODES, MATERI_DOCUMENT_MIME_TYPE, MATERI_DEMO_PDF_FILENAME],
  );
  const videoResult = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM module_assets
      WHERE module_id IN (SELECT id FROM modules WHERE code = ANY($1::text[]))
        AND asset_type = 'video'
        AND source_kind = 'hosted'
        AND media_url = $2
        AND duration_seconds = $3`,
    [MATERI_DEMO_CODES, MATERI_DEMO_VIDEO_URL, MATERI_DEMO_VIDEO_DURATION_SECONDS],
  );
  const progressResult = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM module_progress
      WHERE module_id IN (SELECT id FROM modules WHERE code = ANY($1::text[]))`,
    [MATERI_DEMO_CODES],
  );
  const prerequisiteResult = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM module_prerequisites
      WHERE module_id IN (SELECT id FROM modules WHERE code = ANY($1::text[]))
         OR prerequisite_module_id IN (SELECT id FROM modules WHERE code = ANY($1::text[]))`,
    [MATERI_DEMO_CODES],
  );
  const bySubject = await client.query(
    `SELECT subtests.code AS subject, COUNT(modules.id)::int AS modules,
            COUNT(attachment.id)::int AS pdfs,
            COUNT(video.id)::int AS videos
       FROM subtests
       JOIN topics ON topics.subtest_id = subtests.id
       LEFT JOIN modules ON modules.topic_id = topics.id AND modules.code = ANY($3::text[])
       LEFT JOIN module_assets attachment
         ON attachment.module_id = modules.id AND attachment.asset_type = 'attachment'
       LEFT JOIN module_assets video
         ON video.module_id = modules.id AND video.asset_type = 'video'
      WHERE subtests.code = ANY($1::text[])
        AND topics.code = ANY($2::text[])
      GROUP BY subtests.sort_order, subtests.code
      ORDER BY subtests.sort_order`,
    [MATERI_SUBJECT_CODES, MATERI_TOPIC_CODES, MATERI_DEMO_CODES],
  );

  const postflight = {
    attachmentCount: asInt(attachmentResult.rows[0]?.count),
    bySubject: bySubject.rows.map((row) => ({ subject: row.subject, modules: asInt(row.modules), pdfs: asInt(row.pdfs), videos: asInt(row.videos) })),
    demoModuleCount: asInt(demoModuleResult.rows[0]?.count),
    prerequisiteCount: asInt(prerequisiteResult.rows[0]?.count),
    progressCount: asInt(progressResult.rows[0]?.count),
    subjectCount: asInt(subjectCountResult.rows[0]?.count),
    topicCount: asInt(topicCountResult.rows[0]?.count),
    videoCount: asInt(videoResult.rows[0]?.count),
  };
  const expectedVideoCount = MATERI_DEMO_MODULES.filter((module) => module.withVideo).length;
  if (
    postflight.subjectCount !== MATERI_SUBJECT_CODES.length
    || postflight.topicCount !== MATERI_TOPIC_CODES.length
    || postflight.demoModuleCount !== MATERI_DEMO_MODULES.length
    || postflight.attachmentCount !== MATERI_DEMO_MODULES.length
    || postflight.videoCount !== expectedVideoCount
    || postflight.progressCount !== 0
    || postflight.prerequisiteCount !== 0
  ) {
    throw new Error(`Materi post-seed verification failed: expected 7 subjects, 21 sections, 21 demo modules, 21 PDFs, ${expectedVideoCount} optional videos, zero progress, and zero prerequisites; got ${JSON.stringify(postflight)}.`);
  }
  return postflight;
}

async function runMateriResetSeed(argv = process.argv.slice(2)) {
  const options = parseMateriResetArgs(argv);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: node prisma/seed-materi.mjs [--apply --confirm=${MATERI_RESET_CONFIRMATION}]`);
    console.log("Without --apply the command performs only the guarded read-only preflight.");
    return;
  }

  // Resolve and validate the fixture before opening a transaction. In the
  // default local mode this prevents publishing rows that point at a missing
  // file after the destructive part of the operation has begun. Explicit
  // external PDF URLs remain the caller's delivery responsibility.
  const demoPdfUrl = resolveMateriDemoPdfUrl();
  if (options.apply) assertApplyPdfUrlIsExplicit(demoPdfUrl);
  await assertLocalDemoPdfAvailable(demoPdfUrl);

  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  let transactionStarted = false;
  try {
    await client.query(options.apply ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionStarted = true;
    // Serialize this deliberate operation and prevent new module/dependency
    // writes from appearing between the preflight and delete statements.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('vecalss:materi:demo-reset', 0))");
    if (options.apply) await client.query("LOCK TABLE modules IN ACCESS EXCLUSIVE MODE");

    const preflight = await inspectMateriReset(client);
    printPreflight(preflight);
    assertSafeMateriPreflight(preflight);
    if (!options.apply) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      console.log("\nPreflight passed. No reset or seed was applied. Add --apply and the exact confirmation token to execute it.");
      return;
    }

    const tutorEmail = requireTutorEmail();
    const tutorId = await resolveActiveTutor(client, tutorEmail);
    const deleted = await deleteCanonicalMateri(client, preflight.moduleRows);
    console.log(`\nDeleted only canonical Materi rows: ${deleted.modules} modules, ${deleted.assets} module assets, ${deleted.progress} ModuleProgress rows, ${deleted.prerequisites} prerequisite rows. Shared subjects/topics, users, quiz/tryout rows, and Media Assets were not targeted.`);
    await seedMateriCatalogue(client, { authorUserId: tutorId, pdfUrl: demoPdfUrl });
    const postflight = await inspectPostSeed(client);
    await client.query("COMMIT");
    transactionStarted = false;
    printPostCounts(postflight);
    console.log(`\nGuarded Materi reset + seed completed. Local PDF source: ${MATERI_DEMO_PDF_FILENAME} via ${process.env.MATERI_DEMO_PDF_URL?.trim() || process.env.MATERI_DEMO_PDF_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim() || "http://localhost:5023"}${process.env.MATERI_DEMO_PDF_URL ? "" : "/api/materi-demo/test.pdf"}. Browser progress is versioned by the v2 namespace; server Materi progress starts empty.`);
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
      console.error("Materi reset/seed rolled back; the database was left unchanged.");
    }
    throw error;
  } finally {
    await client.end();
  }
}

export {
  MATERI_RESET_CONFIRMATION,
  assertSafeMateriPreflight,
  inspectMateriReset,
  parseMateriResetArgs,
  runMateriResetSeed,
};

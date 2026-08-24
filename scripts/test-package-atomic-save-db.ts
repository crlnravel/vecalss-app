import "dotenv/config";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import pg from "pg";

const { Client } = pg;
const TEST_DATABASE_ENV = "PACKAGE_ATOMIC_SAVE_TEST_DATABASE_URL";

function connectionIdentity(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${TEST_DATABASE_ENV} must be a valid PostgreSQL URL.`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const host = ["localhost", "127.0.0.1", "::1"].includes(hostname) ? "local" : hostname;
  const port = Number(parsed.port || "5432");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  const userName = decodeURIComponent(parsed.username);
  return { databaseName, host, port, protocol: parsed.protocol, userName };
}

function sameConnectionIdentity(left: ReturnType<typeof connectionIdentity>, right: ReturnType<typeof connectionIdentity>) {
  return left.host === right.host
    && left.port === right.port
    && left.databaseName === right.databaseName
    && left.userName === right.userName;
}

function assertLocalTestDatabase(raw: string, runtimeRaw?: string) {
  const identity = connectionIdentity(raw);
  const runtimeIdentity = runtimeRaw ? connectionIdentity(runtimeRaw) : null;
  if (
    !["postgres:", "postgresql:"].includes(identity.protocol)
    || identity.host !== "local"
    || !/(?:package|atomic|integration|test)/iu.test(identity.databaseName)
    || process.env.NODE_ENV === "production"
    || (runtimeIdentity && sameConnectionIdentity(identity, runtimeIdentity))
  ) {
    throw new Error(`${TEST_DATABASE_ENV} must point to a distinct non-production local test database (host, port, database, and user are compared with runtime DATABASE_URL).`);
  }
}

function hex(value: string) {
  return Buffer.from(value, "utf8").toString("hex");
}

function revisionDigest({ difficulty, explanation, options, stem }: { difficulty: string; explanation: string; options: readonly { content: string; isCorrect: boolean; label: string; sortOrder: number }[]; stem: string }) {
  const optionStream = options
    .toSorted((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
    .map((option) => ["", option.content, String(option.isCorrect), option.label, String(option.sortOrder)].map(hex).join(":"))
    .join(":");
  const stream = [
    hex("question-revision-digest-v1"),
    hex(difficulty),
    hex(explanation),
    hex(""),
    optionStream,
    hex(stem),
    hex(""),
    hex("single_choice"),
  ].join(":");
  return createHash("sha256").update(stream).digest("hex");
}

async function requiredTables(client: pg.Client) {
  const result = await client.query<{ missing: string[] }>(
    `SELECT ARRAY_REMOVE(ARRAY[
      CASE WHEN to_regclass('public.users') IS NULL THEN 'users' END,
      CASE WHEN to_regclass('public.subtests') IS NULL THEN 'subtests' END,
      CASE WHEN to_regclass('public.question_banks') IS NULL THEN 'question_banks' END,
      CASE WHEN to_regclass('public.questions') IS NULL THEN 'questions' END,
      CASE WHEN to_regclass('public.question_revisions') IS NULL THEN 'question_revisions' END,
      CASE WHEN to_regclass('public.question_revision_options') IS NULL THEN 'question_revision_options' END,
      CASE WHEN to_regclass('public.reusable_question_packages') IS NULL THEN 'reusable_question_packages' END,
      CASE WHEN to_regclass('public.reusable_question_package_items') IS NULL THEN 'reusable_question_package_items' END,
      CASE WHEN to_regclass('public.reusable_question_package_versions') IS NULL THEN 'reusable_question_package_versions' END,
      CASE WHEN to_regclass('public.reusable_question_package_version_items') IS NULL THEN 'reusable_question_package_version_items' END,
      CASE WHEN to_regclass('public.reusable_question_package_version_item_options') IS NULL THEN 'reusable_question_package_version_item_options' END,
      CASE WHEN to_regclass('public.tryout_packages') IS NULL THEN 'tryout_packages' END,
      CASE WHEN to_regclass('public.tryout_sections') IS NULL THEN 'tryout_sections' END
    ], NULL) AS missing`,
  );
  assert.deepEqual(result.rows[0]?.missing ?? [], [], "The test database is missing the package atomic-save migrations.");
}

async function insertReadyRevision(client: pg.Client, { actorId, questionId, revisionId, revisionNo, stem }: { actorId: string; questionId: string; revisionId: string; revisionNo: number; stem: string }, manageTransaction = true) {
  const options = [
    { content: "Correct answer", isCorrect: true, label: "A", sortOrder: 0 },
    { content: "Distractor answer", isCorrect: false, label: "B", sortOrder: 1 },
  ];
  const contentDigest = revisionDigest({ difficulty: "medium", explanation: "Explanation", options, stem });
  if (manageTransaction) await client.query("BEGIN");
  try {
    if (manageTransaction) await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query(
      `INSERT INTO question_revisions
        (id, question_id, revision_no, status, provenance, stem, question_type, difficulty, explanation, content_digest, created_by_user_id, updated_by_user_id, ready_at)
       VALUES ($1::uuid, $2::uuid, $3, 'draft'::question_revision_status, 'authored'::question_revision_provenance, $4, 'single_choice'::question_type, 'medium'::difficulty_level, 'Explanation', $5, $6::uuid, $6::uuid, NULL)`,
      [revisionId, questionId, revisionNo, stem, contentDigest, actorId],
    );
    await client.query(
      `INSERT INTO question_revision_options (question_revision_id, label, content, is_correct, sort_order)
       VALUES ($1::uuid, 'A', 'Correct answer', true, 0), ($1::uuid, 'B', 'Distractor answer', false, 1)`,
      [revisionId],
    );
    await client.query(
      `UPDATE question_revisions
          SET status = 'ready'::question_revision_status, ready_at = NOW()
        WHERE id = $1::uuid`,
      [revisionId],
    );
    await client.query(
      `UPDATE questions
          SET current_revision_id = $1::uuid, revision = $2, stem = $3, difficulty = 'medium'::difficulty_level, explanation = 'Explanation'
        WHERE id = $4::uuid`,
      [revisionId, revisionNo, stem, questionId],
    );
    if (manageTransaction) await client.query("COMMIT");
  } catch (error) {
    if (manageTransaction) await client.query("ROLLBACK");
    throw error;
  }
}

async function packageState(client: pg.Client, packageId: string) {
  const [pkg, items, versions] = await Promise.all([
    client.query<{ revision: number; status: string; title: string }>("SELECT revision, status, title FROM reusable_question_packages WHERE id = $1::uuid", [packageId]),
    client.query<{ source_question_revision_id: string | null }>("SELECT source_question_revision_id FROM reusable_question_package_items WHERE package_id = $1::uuid ORDER BY sort_order", [packageId]),
    client.query<{ id: string; status: string; version_no: number }>("SELECT id, status, version_no FROM reusable_question_package_versions WHERE package_id = $1::uuid ORDER BY version_no", [packageId]),
  ]);
  return {
    itemRevisionIds: items.rows.map((item) => item.source_question_revision_id),
    revision: pkg.rows[0]?.revision,
    status: pkg.rows[0]?.status,
    title: pkg.rows[0]?.title,
    versions: versions.rows,
  };
}

async function cleanupFixture(client: pg.Client, { actorId, bankId, createdSubtest, packageIds, questionId, revisionIds, sectionId, subtestId, tryoutId }: { actorId: string; bankId: string; createdSubtest: boolean; packageIds: readonly string[]; questionId: string; revisionIds: readonly string[]; sectionId: string; subtestId: string; tryoutId: string }) {
  // The assessment schema deliberately protects Ready rows with immutable
  // triggers and Restrict FKs.  This fixture is isolated to a dedicated local
  // test database, so cleanup temporarily disables triggers only for its own
  // rows and restores them in the same transaction before committing.
  const tables = [
    "reusable_question_package_version_item_options",
    "reusable_question_package_version_items",
    "reusable_question_package_versions",
    "reusable_question_package_items",
    "reusable_question_packages",
    "tryout_sections",
    "tryout_packages",
    "question_revision_options",
    "question_revisions",
    "questions",
    "question_banks",
    "users",
  ];
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    for (const table of tables) await client.query(`ALTER TABLE ${table} DISABLE TRIGGER ALL`);
    await client.query("DELETE FROM tryout_sections WHERE id = $1::uuid", [sectionId]);
    await client.query("DELETE FROM tryout_packages WHERE id = $1::uuid", [tryoutId]);
    for (const packageId of packageIds) {
      await client.query("DELETE FROM reusable_question_package_versions WHERE package_id = $1::uuid", [packageId]);
      await client.query("DELETE FROM reusable_question_packages WHERE id = $1::uuid", [packageId]);
    }
    await client.query("DELETE FROM question_revision_options WHERE question_revision_id = ANY($1::uuid[])", [revisionIds]);
    await client.query("DELETE FROM question_revisions WHERE id = ANY($1::uuid[])", [revisionIds]);
    await client.query("DELETE FROM questions WHERE id = $1::uuid", [questionId]);
    await client.query("DELETE FROM question_banks WHERE id = $1::uuid", [bankId]);
    await client.query("DELETE FROM users WHERE id = $1::uuid", [actorId]);
    if (createdSubtest) await client.query("DELETE FROM subtests WHERE id = $1::uuid", [subtestId]);
    for (const table of tables) await client.query(`ALTER TABLE ${table} ENABLE TRIGGER ALL`);
    await client.query("COMMIT");
    inTransaction = false;
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Package fixture cleanup and rollback both failed.");
      }
    }
    throw error;
  }
}

async function assertFixtureAbsent(client: pg.Client, { actorId, bankId, createdSubtest, packageIds, questionId, revisionIds, sectionId, subtestId, tryoutId }: { actorId: string; bankId: string; createdSubtest: boolean; packageIds: readonly string[]; questionId: string; revisionIds: readonly string[]; sectionId: string; subtestId: string; tryoutId: string }) {
  const result = await client.query<Record<string, number>>(
    `SELECT
      (SELECT COUNT(*)::int FROM users WHERE id = $1::uuid) AS users,
      (SELECT COUNT(*)::int FROM question_banks WHERE id = $2::uuid) AS banks,
      (SELECT COUNT(*)::int FROM questions WHERE id = $3::uuid) AS questions,
      (SELECT COUNT(*)::int FROM question_revisions WHERE id = ANY($4::uuid[])) AS revisions,
      (SELECT COUNT(*)::int FROM question_revision_options WHERE question_revision_id = ANY($4::uuid[])) AS revision_options,
      (SELECT COUNT(*)::int FROM reusable_question_packages WHERE id = ANY($5::uuid[])) AS packages,
      (SELECT COUNT(*)::int FROM reusable_question_package_items WHERE package_id = ANY($5::uuid[])) AS package_items,
      (SELECT COUNT(*)::int FROM reusable_question_package_versions WHERE package_id = ANY($5::uuid[])) AS versions,
      (SELECT COUNT(*)::int FROM reusable_question_package_version_items item JOIN reusable_question_package_versions package_version ON package_version.id = item.package_version_id WHERE package_version.package_id = ANY($5::uuid[])) AS version_items,
      (SELECT COUNT(*)::int FROM reusable_question_package_version_item_options version_option JOIN reusable_question_package_version_items item ON item.id = version_option.package_version_item_id JOIN reusable_question_package_versions package_version ON package_version.id = item.package_version_id WHERE package_version.package_id = ANY($5::uuid[])) AS version_options,
      (SELECT COUNT(*)::int FROM tryout_sections WHERE id = $6::uuid) AS sections,
      (SELECT COUNT(*)::int FROM tryout_packages WHERE id = $7::uuid) AS tryouts`,
    [actorId, bankId, questionId, revisionIds, packageIds, sectionId, tryoutId],
  );
  assert.deepEqual(result.rows[0], {
    users: 0,
    banks: 0,
    questions: 0,
    revisions: 0,
    revision_options: 0,
    packages: 0,
    package_items: 0,
    versions: 0,
    version_items: 0,
    version_options: 0,
    sections: 0,
    tryouts: 0,
  }, "Package atomic-save fixture rows must be absent after cleanup");
  if (createdSubtest) {
    const subtest = await client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM subtests WHERE id = $1::uuid", [subtestId]);
    assert.equal(subtest.rows[0]?.count, 0, "Created package fixture Subtest must be absent after cleanup");
  }
}

async function main() {
  const rawDatabaseUrl = process.env[TEST_DATABASE_ENV]?.trim();
  if (!rawDatabaseUrl) {
    console.log(`Package atomic-save DB integration skipped: ${TEST_DATABASE_ENV} is required; configured DATABASE_URL is never used.`);
    return;
  }
  assertLocalTestDatabase(rawDatabaseUrl, process.env.DATABASE_URL?.trim());
  process.env.DATABASE_URL = rawDatabaseUrl;

  const client = new Client({ connectionString: rawDatabaseUrl });
  let prismaClient: { $disconnect: () => Promise<void> } | null = null;
  const actorId = randomUUID();
  const bankId = randomUUID();
  const questionId = randomUUID();
  const revisionOneId = randomUUID();
  const revisionTwoId = randomUUID();
  const tryoutId = randomUUID();
  const sectionId = randomUUID();
  const packageIds: string[] = [];
  let subtestId = "";
  let createdSubtest = false;
  let triggerName: string | null = null;
  let functionName: string | null = null;

  try {
    await client.connect();
    await requiredTables(client);

    const existingSubtest = await client.query<{ id: string }>("SELECT id FROM subtests WHERE code = 'PU' LIMIT 1");
    if (existingSubtest.rows[0]?.id) {
      subtestId = existingSubtest.rows[0].id;
    } else {
      subtestId = randomUUID();
      createdSubtest = true;
      await client.query(
        `INSERT INTO subtests (id, code, name) VALUES ($1::uuid, 'PU', 'Package Atomic Save Test')`,
        [subtestId],
      );
    }

    await client.query(
      `INSERT INTO users (id, email, full_name, password_hash)
       VALUES ($1::uuid, $2, 'Package Atomic Save Test', 'fixture-hash')`,
      [actorId, `package-atomic-${actorId}@example.test`],
    );
    await client.query(
      `INSERT INTO question_banks (id, code, name, status, created_by_user_id, updated_by_user_id)
       VALUES ($1::uuid, $2, 'Package Atomic Save Bank', 'published'::content_status, $3::uuid, $3::uuid)`,
      [bankId, `PACKAGE-ATOMIC-${actorId.slice(0, 8)}`, actorId],
    );
    await client.query("BEGIN");
    try {
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      await client.query(
        `INSERT INTO questions
          (id, code, question_bank_id, subtest_id, stem, question_type, difficulty, explanation, status, revision, current_revision_id, created_by_user_id, updated_by_user_id)
         VALUES ($1::uuid, $2, $3::uuid, $4::uuid, 'Original prompt', 'single_choice'::question_type, 'medium'::difficulty_level, 'Explanation', 'published'::content_status, 1, $5::uuid, $6::uuid, $6::uuid)`,
        [questionId, `PACKAGE-ATOMIC-Q-${actorId.slice(0, 8)}`, bankId, subtestId, revisionOneId, actorId],
      );
      await insertReadyRevision(client, { actorId, questionId, revisionId: revisionOneId, revisionNo: 1, stem: "Original prompt" }, false);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const {
      PackageConflictError,
      TryoutValidationError,
      readyReusableQuestionPackageVersion,
      saveReusableQuestionPackage,
    } = await import("../lib/tryout/repository");
    prismaClient = (await import("../lib/prisma")).prisma;

    const item = (sourceQuestionRevisionId?: string) => ({ pointValue: 1, sourceQuestionId: questionId, ...(sourceQuestionRevisionId ? { sourceQuestionRevisionId } : {}) });
    const base = { description: "Atomic save fixture", items: [item()], sourceBankId: bankId, subtest: "PU" as const, title: "Atomic save fixture" };

    const draft = await saveReusableQuestionPackage({ ...base, completionIntent: "draft" }, actorId);
    packageIds.push(draft.id);
    assert.equal(draft.releasedVersion, undefined, "Draft saves must not release a version");
    assert.equal((await packageState(client, draft.id)).versions.length, 0, "Draft saves must leave versions untouched");
    assert.deepEqual((await packageState(client, draft.id)).itemRevisionIds, [revisionOneId], "Draft compatibility may materialize the current revision identity");

    await assert.rejects(
      saveReusableQuestionPackage({ ...base, completionIntent: "ready", id: draft.id, expectedRevision: draft.revision, title: "Must reject unpinned Ready" }, actorId),
      (error: unknown) => error instanceof TryoutValidationError && /QuestionRevision/u.test(error.message),
      "Ready must reject omitted source revision identities",
    );
    assert.equal((await packageState(client, draft.id)).title, draft.title, "Rejected Ready must not overwrite the draft");

    const firstReady = await saveReusableQuestionPackage({ ...base, completionIntent: "ready", items: [item(revisionOneId)], title: "Versioned fixture" }, actorId);
    packageIds.push(firstReady.id);
    assert.equal(firstReady.releasedVersion?.versionNo, 1, "First Ready save must allocate v1");
    const firstState = await packageState(client, firstReady.id);
    assert.deepEqual(firstState.versions.map((version) => [version.version_no, version.status]), [[1, "published"]]);
    assert.equal(firstState.revision, 1, "Creating a package and releasing v1 starts at revision 1");
    const firstVersionId = firstState.versions[0]?.id;
    assert.ok(firstVersionId, "The first Ready save must return a persisted v1 row");
    await client.query(
      `INSERT INTO tryout_packages (id, code, title, created_by_user_id)
       VALUES ($1::uuid, $2, 'Package Atomic Save Tryout', $3::uuid)`,
      [tryoutId, `PACKAGE-ATOMIC-TRYOUT-${actorId.slice(0, 8)}`, actorId],
    );
    await client.query(
      `INSERT INTO tryout_sections (id, tryout_id, subtest_id, title, sequence_no, duration_seconds, question_count, package_version_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'PU · Package Atomic Save', 1, 60, 1, $4::uuid)`,
      [sectionId, tryoutId, subtestId, firstVersionId],
    );
    const initialBinding = await client.query<{ package_version_id: string | null }>("SELECT package_version_id FROM tryout_sections WHERE id = $1::uuid", [sectionId]);
    assert.equal(initialBinding.rows[0]?.package_version_id, firstVersionId, "The fixture Tryout section must bind v1");

    await insertReadyRevision(client, { actorId, questionId, revisionId: revisionTwoId, revisionNo: 2, stem: "Updated prompt" });
    const secondReady = await saveReusableQuestionPackage({ ...base, completionIntent: "ready", id: firstReady.id, expectedRevision: firstState.revision, items: [item(revisionTwoId)], title: "Versioned fixture v2" }, actorId);
    assert.equal(secondReady.releasedVersion?.versionNo, 2, "Updating a pinned package must allocate v2");
    const compatibilityVersions = await Promise.all([
      readyReusableQuestionPackageVersion(firstReady.id, actorId),
      readyReusableQuestionPackageVersion(firstReady.id, actorId),
    ]);
    assert.deepEqual(compatibilityVersions.map((version) => version.versionNo).sort((left, right) => left - right), [3, 4], "Concurrent Ready calls must allocate sequential version numbers");
    const versionRows = await client.query<{ source_content_digest: string | null; status: string; version_no: number }>(
      `SELECT version_no, status, source_content_digest
         FROM reusable_question_package_versions version
         JOIN reusable_question_package_version_items item ON item.package_version_id = version.id
        WHERE version.package_id = $1::uuid
        ORDER BY version_no`,
      [firstReady.id],
    );
    assert.deepEqual(versionRows.rows.map((row) => row.version_no), [1, 2, 3, 4], "Ready updates must preserve v1-v3 and add v4");
    assert.ok(versionRows.rows.every((row) => row.status === "published"));
    assert.notEqual(versionRows.rows[0]?.source_content_digest, versionRows.rows[1]?.source_content_digest, "Each immutable snapshot must retain its pinned source content");
    const bindingAfterReleases = await client.query<{ package_version_id: string | null }>("SELECT package_version_id FROM tryout_sections WHERE id = $1::uuid", [sectionId]);
    assert.equal(bindingAfterReleases.rows[0]?.package_version_id, firstVersionId, "Later package releases must not repoint an existing Tryout section from v1");

    const latestState = await packageState(client, firstReady.id);
    await assert.rejects(
      saveReusableQuestionPackage({ ...base, completionIntent: "ready", id: firstReady.id, expectedRevision: (latestState.revision ?? 1) - 1, items: [item(revisionTwoId)], title: "Stale overwrite" }, actorId),
      (error: unknown) => error instanceof PackageConflictError
        && error.code === "package_conflict"
        && error.packageId === firstReady.id
        && error.expectedRevision === (latestState.revision ?? 1) - 1
        && error.currentRevision === latestState.revision,
      "Stale expectedRevision must return the typed package conflict",
    );
    assert.equal((await packageState(client, firstReady.id)).title, latestState.title, "A stale CAS must not write metadata");

    const rollback = await saveReusableQuestionPackage({ ...base, completionIntent: "ready", items: [item(revisionOneId)], title: "Rollback fixture" }, actorId);
    packageIds.push(rollback.id);
    const rollbackBefore = await packageState(client, rollback.id);
    functionName = `test_package_atomic_fail_${rollback.id.replaceAll("-", "")}`;
    triggerName = `${functionName}_trigger`;
    await client.query(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM reusable_question_package_versions WHERE id = NEW.package_version_id AND package_id = '${rollback.id}'::uuid) THEN
          RAISE EXCEPTION 'intentional package atomic-save failure';
        END IF;
        RETURN NEW;
      END;
    $$`);
    await client.query(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON reusable_question_package_version_items FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
    await assert.rejects(
      saveReusableQuestionPackage({ ...base, completionIntent: "ready", id: rollback.id, expectedRevision: rollbackBefore.revision, items: [item(revisionTwoId)], title: "Should roll back" }, actorId),
      /intentional package atomic-save failure/u,
    );
    assert.deepEqual(await packageState(client, rollback.id), rollbackBefore, "Ready failure must roll back the working set and version atomically");

    console.log("Package atomic-save DB behavior passed (draft, v1, v4, stale CAS, concurrent numbering, rollback, pinned source identity).");
  } finally {
    const cleanupErrors: unknown[] = [];
    const attemptCleanup = async (label: string, operation: () => Promise<void>) => {
      try {
        await operation();
      } catch (error) {
        cleanupErrors.push(new AggregateError([error], `Package atomic-save ${label} failed.`));
      }
    };
    if (triggerName) await attemptCleanup("trigger cleanup", async () => {
      await client.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON reusable_question_package_version_items`);
    });
    if (functionName) await attemptCleanup("failure-function cleanup", async () => {
      await client.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    });
    if (prismaClient) await attemptCleanup("Prisma disconnect", async () => {
      await prismaClient!.$disconnect();
    });
    await attemptCleanup("fixture cleanup", async () => {
      await cleanupFixture(client, { actorId, bankId, createdSubtest, packageIds, questionId, revisionIds: [revisionOneId, revisionTwoId], sectionId, subtestId, tryoutId });
    });
    await attemptCleanup("fixture absence assertion", async () => {
      await assertFixtureAbsent(client, { actorId, bankId, createdSubtest, packageIds, questionId, revisionIds: [revisionOneId, revisionTwoId], sectionId, subtestId, tryoutId });
    });
    await attemptCleanup("PostgreSQL connection close", async () => {
      await client.end();
    });
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Package atomic-save fixture cleanup failed.");
  }
}

await main();

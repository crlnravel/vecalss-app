import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pg from "pg";

const { Client } = pg;
const TEST_DATABASE_ENV = "RANDOM_ASSEMBLY_SCHEMA_TEST_DATABASE_URL";

function assertLocalDatabase(raw: string) {
  const parsed = new URL(raw);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(host), `${TEST_DATABASE_ENV} must use a local PostgreSQL host.`);
  assert.match(database, /(?:random|assembly|schema|test)/iu, `${TEST_DATABASE_ENV} must name a disposable test database.`);
  assert.notEqual(process.env.DATABASE_URL?.trim(), raw, `${TEST_DATABASE_ENV} must be distinct from DATABASE_URL.`);
}

async function expectRejected(client: pg.Client, statement: string, values: unknown[], pattern: RegExp) {
  await assert.rejects(
    client.query(statement, values),
    (error: unknown) => error instanceof Error && pattern.test(error.message),
  );
}

async function expectTransactionRejected(client: pg.Client, statements: Array<{ sql: string; values?: unknown[] }>, pattern: RegExp) {
  await client.query("BEGIN");
  try {
    for (const statement of statements) await client.query(statement.sql, statement.values ?? []);
    await client.query("COMMIT");
    assert.fail(`Expected transaction to reject with ${pattern.source}`);
  } catch (error) {
    await client.query("ROLLBACK");
    assert.ok(error instanceof Error && pattern.test(error.message), error instanceof Error ? error : String(error));
  }
}

async function main() {
  const rawDatabaseUrl = process.env[TEST_DATABASE_ENV]?.trim();
  if (!rawDatabaseUrl) {
    console.log(`Random assembly schema DB contract skipped: ${TEST_DATABASE_ENV} is required; configured DATABASE_URL is never used.`);
    return;
  }
  assertLocalDatabase(rawDatabaseUrl);

  const client = new Client({ connectionString: rawDatabaseUrl });
  const userId = randomUUID();
  const subtestId = randomUUID();
  const bankId = randomUUID();
  const fixedPackageId = randomUUID();
  const poolPackageId = randomUUID();
  const fixedVersionId = randomUUID();
  const poolVersionId = randomUUID();
  const draftPoolVersionId = randomUUID();
  const draftFixedVersionId = randomUUID();
  const invalidQuotaVersionId = randomUUID();
  const tryoutId = randomUUID();

  try {
    await client.connect();
    const requiredTables = await client.query<{ missing: string[] }>(
      `SELECT ARRAY_REMOVE(ARRAY[
        CASE WHEN to_regclass('public.reusable_question_packages') IS NULL THEN 'reusable_question_packages' END,
        CASE WHEN to_regclass('public.reusable_question_package_versions') IS NULL THEN 'reusable_question_package_versions' END,
        CASE WHEN to_regclass('public.reusable_question_package_version_bank_scopes') IS NULL THEN 'bank_scopes' END,
        CASE WHEN to_regclass('public.reusable_question_package_version_rules') IS NULL THEN 'rules' END,
        CASE WHEN to_regclass('public.assessment_releases') IS NULL THEN 'assessment_releases' END
      ], NULL) AS missing`,
    );
    assert.deepEqual(requiredTables.rows[0]?.missing ?? [], [], "The test database must already have the migration applied.");

    await client.query(
      `INSERT INTO users (id, email, full_name, password_hash)
       VALUES ($1::uuid, $2, 'Random Assembly Schema Test', 'fixture-hash')`,
      [userId, `random-assembly-${userId}@example.test`],
    );
    await client.query(
      `INSERT INTO subtests (id, code, name) VALUES ($1::uuid, $2, 'Random Assembly Schema Test')`,
      [subtestId, `RAS-${userId.slice(0, 6)}`],
    );
    await client.query(
      `INSERT INTO question_banks (id, name, code, purpose, created_by_user_id, updated_by_user_id)
       VALUES ($1::uuid, 'Random Assembly Schema Bank', $2, 'tryout'::question_bank_purpose, $3::uuid, $3::uuid)`,
      [bankId, `RAS-BANK-${userId.slice(0, 6)}`, userId],
    );
    await client.query(
      `INSERT INTO reusable_question_packages
        (id, code, title, source_bank_id, subtest_id, created_by_user_id, updated_by_user_id, mode)
       VALUES
        ($1::uuid, $2, 'Fixed Schema Package', $4::uuid, $5::uuid, $3::uuid, $3::uuid, 'fixed_set'),
        ($6::uuid, $7, 'Pool Schema Package', $4::uuid, $5::uuid, $3::uuid, $3::uuid, 'random_pool')`,
      [fixedPackageId, `RAS-FIXED-${userId.slice(0, 6)}`, userId, bankId, subtestId, poolPackageId, `RAS-POOL-${userId.slice(0, 6)}`],
    );
    await client.query(
      `INSERT INTO tryout_packages (id, code, title, created_by_user_id)
       VALUES ($1::uuid, $2, 'Random Assembly Schema Tryout', $3::uuid)`,
      [tryoutId, `RAS-TRYOUT-${userId.slice(0, 6)}`, userId],
    );

    await client.query(
      `INSERT INTO reusable_question_package_versions
        (id, package_id, source_bank_id, version_no, mode, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'fixed_set', $4::uuid)`,
      [fixedVersionId, fixedPackageId, bankId, userId],
    );
    await client.query(
      `UPDATE reusable_question_package_versions
       SET status = 'published'
       WHERE id = $1::uuid`,
      [fixedVersionId],
    );
    const fixedMetadata = await client.query<{ subtest_id: string | null; definition_digest: string | null; ready_at: string | null }>(
      `SELECT subtest_id, definition_digest, ready_at
       FROM reusable_question_package_versions
       WHERE id = $1::uuid`,
      [fixedVersionId],
    );
    assert.ok(fixedMetadata.rows[0]?.subtest_id && fixedMetadata.rows[0]?.definition_digest && fixedMetadata.rows[0]?.ready_at);

    await expectTransactionRejected(
      client,
      [{
        sql: `INSERT INTO reusable_question_package_versions
          (id, package_id, source_bank_id, subtest_id, version_no, mode, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 'random_pool', $5::uuid)`,
        values: [randomUUID(), poolPackageId, bankId, subtestId, userId],
      }],
      /at least one Bank scope/u,
    );

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO reusable_question_package_versions
        (id, package_id, source_bank_id, subtest_id, version_no, mode, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 'random_pool', $5::uuid)`,
      [poolVersionId, poolPackageId, bankId, subtestId, userId],
    );
    await client.query(
      `INSERT INTO reusable_question_package_version_bank_scopes (package_version_id, question_bank_id)
       VALUES ($1::uuid, $2::uuid)`,
      [poolVersionId, bankId],
    );
    await client.query(
      `INSERT INTO reusable_question_package_version_rules (package_version_id, requested_count)
       VALUES ($1::uuid, 1)`,
      [poolVersionId],
    );
    await client.query("COMMIT");
    await client.query(
      `UPDATE reusable_question_package_versions SET status = 'published' WHERE id = $1::uuid`,
      [poolVersionId],
    );
    await expectRejected(
      client,
      `INSERT INTO assessment_releases
        (tryout_id, release_number, content_digest, payload, published_at, created_by_user_id,
         assembly_mode, assembly_package_id, assembly_package_version_id)
       VALUES ($1::uuid, 1, 'ras-missing-metadata', '{}'::jsonb, CURRENT_TIMESTAMP, $2::uuid,
         'random_pool', $3::uuid, $4::uuid)`,
      [tryoutId, userId, poolPackageId, poolVersionId],
      /Pool releases require complete seeded resolution metadata/u,
    );
    await client.query(
      `INSERT INTO assessment_releases
        (tryout_id, release_number, content_digest, payload, published_at, created_by_user_id,
         assembly_mode, assembly_package_id, assembly_package_version_id, resolver_version, assembly_seed,
         assembly_requested_count, assembly_candidate_count, assembly_resolved_source_ids, assembly_resolved_revision_digests)
       VALUES ($1::uuid, 1, 'ras-valid-release', '{}'::jsonb, CURRENT_TIMESTAMP, $2::uuid,
         'random_pool', $3::uuid, $4::uuid, 'seeded-fisher-yates-v1', 'ras-seed', 1, 1, '["q1"]'::jsonb, '["d1"]'::jsonb)`,
      [tryoutId, userId, poolPackageId, poolVersionId],
    );

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO reusable_question_package_versions
        (id, package_id, source_bank_id, subtest_id, version_no, mode, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 2, 'random_pool', $5::uuid)`,
      [draftPoolVersionId, poolPackageId, bankId, subtestId, userId],
    );
    await client.query(
      `INSERT INTO reusable_question_package_version_bank_scopes (package_version_id, question_bank_id)
       VALUES ($1::uuid, $2::uuid)`,
      [draftPoolVersionId, bankId],
    );
    await client.query(
      `INSERT INTO reusable_question_package_version_rules (package_version_id, requested_count)
       VALUES ($1::uuid, 1)`,
      [draftPoolVersionId],
    );
    await client.query("COMMIT");
    await expectRejected(
      client,
      `INSERT INTO assessment_releases
        (tryout_id, release_number, content_digest, payload, published_at, created_by_user_id,
         assembly_mode, assembly_package_id, assembly_package_version_id, resolver_version, assembly_seed,
         assembly_requested_count, assembly_candidate_count, assembly_resolved_source_ids, assembly_resolved_revision_digests)
       VALUES ($1::uuid, 2, 'ras-draft-release', '{}'::jsonb, CURRENT_TIMESTAMP, $2::uuid,
         'random_pool', $3::uuid, $4::uuid, 'seeded-fisher-yates-v1', 'ras-seed', 1, 1, '["q1"]'::jsonb, '["d1"]'::jsonb)`,
      [tryoutId, userId, poolPackageId, draftPoolVersionId],
      /Ready package version/u,
    );

    await client.query(
      `INSERT INTO reusable_question_package_versions
        (id, package_id, source_bank_id, version_no, mode, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 3, 'fixed_set', $4::uuid)`,
      [draftFixedVersionId, fixedPackageId, bankId, userId],
    );
    await expectRejected(
      client,
      `UPDATE reusable_question_package_version_bank_scopes
       SET package_version_id = $1::uuid
       WHERE package_version_id = $2::uuid`,
      [draftFixedVersionId, poolVersionId],
      /immutable/u,
    );
    await client.query(
      `DELETE FROM reusable_question_package_versions WHERE id = $1::uuid`,
      [draftFixedVersionId],
    );
    await client.query(
      `INSERT INTO reusable_question_package_versions
        (id, package_id, source_bank_id, version_no, mode, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 4, 'fixed_set', $4::uuid)`,
      [invalidQuotaVersionId, fixedPackageId, bankId, userId],
    );
    await expectRejected(
      client,
      `INSERT INTO reusable_question_package_version_rules
        (package_version_id, requested_count, easy_count, medium_count, hard_count)
       VALUES ($1::uuid, 3, 1, 1, 0)`,
      [invalidQuotaVersionId],
      /quota_sum_check/u,
    );

    console.log("Random assembly schema DB contract passed.");
  } finally {
    await client.end();
  }
}

await main();

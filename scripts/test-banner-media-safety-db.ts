import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pg from "pg";

const { Client } = pg;
const TEST_DATABASE_ENV = "BANNER_MEDIA_SAFETY_TEST_DATABASE_URL";
const LOCK_KEY = "vecalss:banner-media:mutation:v1";

function assertLocalDisposableDatabase(raw: string) {
  const parsed = new URL(raw);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(hostname)
      && /(?:banner|media|safety|test)/iu.test(databaseName),
    `${TEST_DATABASE_ENV} must point to a dedicated local banner/media test database.`,
  );
  assert.notEqual(process.env.DATABASE_URL?.trim(), raw, `${TEST_DATABASE_ENV} must be distinct from DATABASE_URL.`);
}

async function main() {
  const databaseUrl = process.env[TEST_DATABASE_ENV]?.trim();
  if (!databaseUrl) {
    console.log(`Banner media safety DB races skipped: ${TEST_DATABASE_ENV} is required; DATABASE_URL is never used.`);
    return;
  }
  assertLocalDisposableDatabase(databaseUrl);

  const first = new Client({ connectionString: databaseUrl });
  const second = new Client({ connectionString: databaseUrl });
  const schema = `banner_safety_${randomUUID().replaceAll("-", "")}`;
  const table = `"${schema}"."assets"`;

  try {
    await first.connect();
    await second.connect();
    await first.query(`CREATE SCHEMA "${schema}"`);
    await first.query(`
      CREATE TABLE ${table} (
        id uuid PRIMARY KEY,
        state text NOT NULL,
        trashed_at timestamptz,
        object_key text NOT NULL,
        mime_type text NOT NULL,
        size_bytes integer NOT NULL,
        folder_id uuid
      )
    `);

    const assetId = randomUUID();
    const folderId = randomUUID();
    await first.query(
      `INSERT INTO ${table} (id, state, object_key, mime_type, size_bytes, folder_id)
       VALUES ($1::uuid, 'pending', 'admin/test-object', 'image/png', 10, $2::uuid)`,
      [assetId, folderId],
    );

    await first.query("BEGIN");
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
    const blocked = await second.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked",
      [LOCK_KEY],
    );
    assert.equal(blocked.rows[0]?.locked, false, "the shared lock must serialize independent DB sessions");

    await first.query(
      `UPDATE ${table}
       SET state = 'trashed', trashed_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid AND state IN ('pending', 'ready') AND trashed_at IS NULL`,
      [assetId],
    );
    await first.query("COMMIT");
    await second.query("ROLLBACK");

    await second.query("BEGIN");
    await second.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
    const staleFinalize = await second.query(
      `UPDATE ${table}
       SET state = 'ready'
       WHERE id = $1::uuid AND state = 'pending' AND trashed_at IS NULL
         AND object_key = 'admin/test-object' AND mime_type = 'image/png' AND size_bytes = 10
         AND folder_id = $2::uuid`,
      [assetId, folderId],
    );
    assert.equal(staleFinalize.rowCount, 0, "a late finalize must not overwrite a trashed pending asset");
    await second.query("COMMIT");

    const state = await first.query<{ state: string; trashed_at: Date | null }>(
      `SELECT state, trashed_at FROM ${table} WHERE id = $1::uuid`,
      [assetId],
    );
    assert.equal(state.rows[0]?.state, "trashed");
    assert.ok(state.rows[0]?.trashed_at);

    await first.query(
      `UPDATE ${table} SET state = 'pending', trashed_at = NULL WHERE id = $1::uuid`,
      [assetId],
    );
    await first.query("BEGIN");
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
    const finalized = await first.query(
      `UPDATE ${table}
       SET state = 'ready'
       WHERE id = $1::uuid AND state = 'pending' AND trashed_at IS NULL
         AND object_key = 'admin/test-object' AND mime_type = 'image/png' AND size_bytes = 10
         AND folder_id = $2::uuid`,
      [assetId, folderId],
    );
    assert.equal(finalized.rowCount, 1);
    await first.query("COMMIT");

    await second.query("BEGIN");
    await second.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
    const duplicate = await second.query(
      `UPDATE ${table}
       SET state = 'ready'
       WHERE id = $1::uuid AND state = 'pending' AND trashed_at IS NULL
         AND object_key = 'admin/test-object' AND mime_type = 'image/png' AND size_bytes = 10
         AND folder_id = $2::uuid`,
      [assetId, folderId],
    );
    assert.equal(duplicate.rowCount, 0, "a duplicate finalize must use the explicit ready/idempotent branch");
    await second.query("COMMIT");

    console.log("banner media safety DB races passed");
  } finally {
    await first.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await first.end();
    await second.end();
  }
}

await main();

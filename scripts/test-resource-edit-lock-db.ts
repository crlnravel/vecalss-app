import "dotenv/config";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import pg from "pg";

const TEST_DATABASE_ENV = "RESOURCE_EDIT_LOCK_TEST_DATABASE_URL";
const { Client } = pg;

function configuredDatabase() {
  const raw = process.env[TEST_DATABASE_ENV]?.trim();
  if (!raw) {
    console.log(`Resource edit-lock DB races skipped: ${TEST_DATABASE_ENV} is required; configured DATABASE_URL is never used.`);
    return null;
  }
  const parsed = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol), `${TEST_DATABASE_ENV} must use PostgreSQL.`);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(parsed.hostname), `${TEST_DATABASE_ENV} must use a local PostgreSQL host.`);
  assert.notEqual(raw, process.env.DATABASE_URL?.trim(), `${TEST_DATABASE_ENV} must be distinct from DATABASE_URL.`);
  return raw;
}

function digest(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function leaseToken(seed: number) {
  const bytes = Buffer.alloc(32, seed);
  return bytes.toString("base64url");
}

async function run() {
  const connectionString = configuredDatabase();
  if (!connectionString) return;

  const schema = `resource_edit_lock_${randomUUID().replaceAll("-", "")}`;
  const first = new Client({ connectionString });
  const second = new Client({ connectionString });
  await first.connect();
  await second.connect();
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const qSchema = quote(schema);
  try {
    await first.query(`CREATE SCHEMA ${qSchema}`);
    await first.query(`CREATE TYPE ${qSchema}."edit_lease_resource_type" AS ENUM ('quiz', 'media_asset')`);
    await first.query(`CREATE TABLE ${qSchema}."edit_leases" (
      resource_type ${qSchema}."edit_lease_resource_type" NOT NULL,
      resource_id varchar(128) NOT NULL,
      holder_user_id uuid NOT NULL,
      token_digest varchar(64) NOT NULL,
      generation integer NOT NULL CHECK (generation > 0),
      acquired_at timestamptz NOT NULL,
      heartbeat_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      released_at timestamptz,
      PRIMARY KEY (resource_type, resource_id)
    )`);

    const resourceType = "quiz";
    const resourceId = randomUUID();
    const resourceKey = `${resourceType}:${resourceId}`;
    const holder = randomUUID();
    const firstToken = leaseToken(1);
    const rotatedToken = leaseToken(2);
    const staleToken = leaseToken(3);
    const gate = `vecalss:resource-edit:${resourceKey}`;

    await first.query("BEGIN");
    await first.query(`SET LOCAL search_path TO ${qSchema}`);
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [gate]);
    await first.query(`INSERT INTO "edit_leases" (
      resource_type, resource_id, holder_user_id, token_digest, generation,
      acquired_at, heartbeat_at, expires_at
    ) VALUES ($1::edit_lease_resource_type, $2, $3, $4, 1, clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '2 minutes')`, [
      resourceType,
      resourceId,
      holder,
      digest(firstToken),
    ]);

    await second.query("BEGIN");
    await second.query(`SET LOCAL search_path TO ${qSchema}`);
    await second.query("SET LOCAL lock_timeout = '5s'");
    const secondAcquisition = second.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [gate],
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    await first.query("COMMIT");
    await secondAcquisition;
    const locked = await second.query<{ generation: number; holder_user_id: string }>(
      "SELECT generation, holder_user_id FROM edit_leases WHERE resource_type = $1::edit_lease_resource_type AND resource_id = $2",
      [resourceType, resourceId],
    );
    assert.equal(locked.rows[0]?.generation, 1, "one winner must remain after simultaneous acquire");
    assert.equal(locked.rows[0]?.holder_user_id, holder);

    const rotated = await second.query<{ generation: number }>(
      `UPDATE edit_leases
       SET token_digest = $1, generation = generation + 1,
           heartbeat_at = clock_timestamp(), expires_at = clock_timestamp() + interval '2 minutes'
       WHERE resource_type = $2::edit_lease_resource_type AND resource_id = $3
         AND token_digest = $4 AND generation = 1 AND released_at IS NULL AND expires_at > clock_timestamp()
       RETURNING generation`,
      [digest(rotatedToken), resourceType, resourceId, digest(firstToken)],
    );
    assert.equal(rotated.rows[0]?.generation, 2, "current proof rotates atomically");
    const staleUpdate = await second.query(
      `UPDATE edit_leases SET heartbeat_at = clock_timestamp()
       WHERE resource_type = $1::edit_lease_resource_type AND resource_id = $2
         AND token_digest = $3 AND generation = 1 AND released_at IS NULL`,
      [resourceType, resourceId, digest(staleToken)],
    );
    assert.equal(staleUpdate.rowCount, 0, "stale requests cannot renew the rotated lease");
    const staleRelease = await second.query(
      `UPDATE edit_leases SET released_at = clock_timestamp()
       WHERE resource_type = $1::edit_lease_resource_type AND resource_id = $2
         AND token_digest = $3 AND generation = 1 AND released_at IS NULL`,
      [resourceType, resourceId, digest(firstToken)],
    );
    assert.equal(staleRelease.rowCount, 0, "stale releases cannot release the rotated lease");
    await second.query("COMMIT");

    const mediaFirst = new Client({ connectionString });
    const mediaSecond = new Client({ connectionString });
    await mediaFirst.connect();
    await mediaSecond.connect();
    try {
      const globalKey = "vecalss:banner-media:mutation:v1";
      await mediaFirst.query("BEGIN");
      await mediaFirst.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [globalKey]);
      await mediaFirst.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`vecalss:resource-edit:media_asset:${resourceId}`]);
      await mediaSecond.query("BEGIN");
      const blocked = mediaSecond.query(`SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked`, [globalKey]);
      assert.equal((await blocked).rows[0]?.locked, false, "Media transitions must share the Level-0 mutex");
      await mediaSecond.query("ROLLBACK");
      await mediaFirst.query("COMMIT");
    } finally {
      await mediaFirst.end();
      await mediaSecond.end();
    }
    console.log("resource edit-lock DB race tests passed");
  } finally {
    await first.query(`DROP SCHEMA IF EXISTS ${qSchema} CASCADE`).catch(() => undefined);
    await first.end();
    await second.end();
  }
}

await run();

import "dotenv/config";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import pg from "pg";

import { RoleName } from "../generated/prisma/client";
import {
  createDefaultBannerDesign,
  type BannerDesign,
} from "../lib/admin/banner-maker";
import {
  createBannerDesignEnvelope,
} from "../lib/banner/envelope";
import { BANNER_DESTINATIONS } from "../lib/banner/destinations";

const { Client } = pg;
const TEST_DATABASE_ENV = "BANNER_MEDIA_SAFETY_TEST_DATABASE_URL";
const FALLBACK_DATABASE_ENV = "VERA_DISPOSABLE_DATABASE_URL";
const DISPOSABLE_ACK_ENV = "VERA_DISPOSABLE_DB_ACK";
const TABLES = [
  "users",
  "auth_sessions",
  "role_assignments",
  "student_profiles",
  "assets",
  "system_configs",
] as const;
const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FIXTURE_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_SESSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STUDENT_SESSION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ASSET_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REVISION = "11111111-1111-4111-8111-111111111111";
const STALE_REVISION = "22222222-2222-4222-8222-222222222222";
const CONFIG_KEY = BANNER_DESTINATIONS.find(({ key }) => key === "beranda")?.configKey ?? "student.banner-maker.v2.beranda";
const NOW = new Date("2035-01-01T00:00:00.000Z");

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function connectionIdentity(raw: string) {
  const parsed = new URL(raw);
  return {
    databaseName: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
    host: parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, ""),
    port: Number(parsed.port || "5432"),
    protocol: parsed.protocol,
    userName: decodeURIComponent(parsed.username),
  };
}

function sameDatabase(left: ReturnType<typeof connectionIdentity>, right: ReturnType<typeof connectionIdentity>) {
  return left.host === right.host
    && left.port === right.port
    && left.databaseName === right.databaseName
    && left.userName === right.userName;
}

function readDisposableDatabaseUrl() {
  const explicit = process.env[TEST_DATABASE_ENV]?.trim();
  const fallback = process.env[FALLBACK_DATABASE_ENV]?.trim();
  const raw = explicit || fallback;
  if (!raw) {
    throw new Error(
      `Banner rendering DB checks require ${TEST_DATABASE_ENV} or ${FALLBACK_DATABASE_ENV}; `
      + "the configured application DATABASE_URL is never used.",
    );
  }

  const identity = connectionIdentity(raw);
  const configured = process.env.DATABASE_URL?.trim();
  const configuredIdentity = configured ? connectionIdentity(configured) : null;
  assert.ok(["postgres:", "postgresql:"].includes(identity.protocol), `${TEST_DATABASE_ENV} must use PostgreSQL.`);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(identity.host), `${TEST_DATABASE_ENV} must use a local PostgreSQL host.`);
  assert.ok(
    /(?:banner|media|safety|test)/iu.test(identity.databaseName)
      || (fallback && process.env[DISPOSABLE_ACK_ENV] === "1" && identity.databaseName === "vera_test"),
    `${TEST_DATABASE_ENV} must name a dedicated disposable banner test database.`,
  );
  assert.ok(!configuredIdentity || !sameDatabase(identity, configuredIdentity), `${TEST_DATABASE_ENV} must be distinct from DATABASE_URL.`);
  if (!explicit) assert.equal(process.env[DISPOSABLE_ACK_ENV], "1", `${FALLBACK_DATABASE_ENV} requires ${DISPOSABLE_ACK_ENV}=1.`);
  return raw;
}

function schemaDatabaseUrl(raw: string, schema: string) {
  const parsed = new URL(raw);
  parsed.searchParams.set("schema", schema);
  parsed.searchParams.set("options", `-c search_path=${schema},public`);
  return parsed.toString();
}

async function createIsolatedSchema(client: pg.Client, schema: string) {
  const quotedSchema = quoteIdentifier(schema);
  await client.query(`CREATE SCHEMA ${quotedSchema}`);
  await client.query(`CREATE TYPE ${quotedSchema}."user_status" AS ENUM ('active', 'locked', 'disabled', 'soft_deleted')`);
  await client.query(`CREATE TYPE ${quotedSchema}."session_status" AS ENUM ('active', 'revoked', 'expired')`);
  await client.query(`CREATE TYPE ${quotedSchema}."role_name" AS ENUM ('student', 'tutor', 'admin')`);
  await client.query(`CREATE TYPE ${quotedSchema}."onboarding_status" AS ENUM ('not_started', 'completed', 'skipped')`);
  await client.query(`CREATE TYPE ${quotedSchema}."media_library_scope" AS ENUM ('kapten', 'admin')`);
  await client.query(`CREATE TYPE ${quotedSchema}."media_asset_state" AS ENUM ('pending', 'ready', 'trashed', 'failed')`);
  for (const table of TABLES) {
    const quotedTable = quoteIdentifier(table);
    await client.query(`CREATE TABLE ${quotedSchema}.${quotedTable} (LIKE public.${quotedTable} INCLUDING DEFAULTS)`);
  }
  await client.query(`ALTER TABLE ${quotedSchema}."users" ALTER COLUMN status DROP DEFAULT`);
  await client.query(`ALTER TABLE ${quotedSchema}."users" ALTER COLUMN status TYPE ${quotedSchema}."user_status" USING status::text::${quotedSchema}."user_status"`);
  await client.query(`ALTER TABLE ${quotedSchema}."users" ALTER COLUMN status SET DEFAULT 'active'::${quotedSchema}."user_status"`);
  await client.query(`ALTER TABLE ${quotedSchema}."auth_sessions" ALTER COLUMN status DROP DEFAULT`);
  await client.query(`ALTER TABLE ${quotedSchema}."auth_sessions" ALTER COLUMN status TYPE ${quotedSchema}."session_status" USING status::text::${quotedSchema}."session_status"`);
  await client.query(`ALTER TABLE ${quotedSchema}."auth_sessions" ALTER COLUMN status SET DEFAULT 'active'::${quotedSchema}."session_status"`);
  await client.query(`ALTER TABLE ${quotedSchema}."role_assignments" ALTER COLUMN role TYPE ${quotedSchema}."role_name" USING role::text::${quotedSchema}."role_name"`);
  await client.query(`ALTER TABLE ${quotedSchema}."student_profiles" ALTER COLUMN onboarding_status DROP DEFAULT`);
  await client.query(`ALTER TABLE ${quotedSchema}."student_profiles" ALTER COLUMN onboarding_status TYPE ${quotedSchema}."onboarding_status" USING onboarding_status::text::${quotedSchema}."onboarding_status"`);
  await client.query(`ALTER TABLE ${quotedSchema}."student_profiles" ALTER COLUMN onboarding_status SET DEFAULT 'not_started'::${quotedSchema}."onboarding_status"`);
  await client.query(`ALTER TABLE ${quotedSchema}."assets" ALTER COLUMN library_scope DROP DEFAULT`);
  await client.query(`ALTER TABLE ${quotedSchema}."assets" ALTER COLUMN library_scope TYPE ${quotedSchema}."media_library_scope" USING library_scope::text::${quotedSchema}."media_library_scope"`);
  await client.query(`ALTER TABLE ${quotedSchema}."assets" ALTER COLUMN library_scope SET DEFAULT 'admin'::${quotedSchema}."media_library_scope"`);
  await client.query(`ALTER TABLE ${quotedSchema}."assets" ALTER COLUMN state DROP DEFAULT`);
  await client.query(`ALTER TABLE ${quotedSchema}."assets" ALTER COLUMN state TYPE ${quotedSchema}."media_asset_state" USING state::text::${quotedSchema}."media_asset_state"`);
  await client.query(`ALTER TABLE ${quotedSchema}."assets" ALTER COLUMN state SET DEFAULT 'ready'::${quotedSchema}."media_asset_state"`);
  await client.query(`CREATE UNIQUE INDEX ${quoteIdentifier(`${schema}_users_email_unique`)} ON ${quotedSchema}."users" (email)`);
  await client.query(`CREATE UNIQUE INDEX ${quoteIdentifier(`${schema}_sessions_token_unique`)} ON ${quotedSchema}."auth_sessions" (refresh_token_hash)`);
  await client.query(`CREATE UNIQUE INDEX ${quoteIdentifier(`${schema}_configs_key_unique`)} ON ${quotedSchema}."system_configs" (config_key)`);
}

async function dropIsolatedSchema(client: pg.Client, schema: string) {
  await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function makeDesign(): BannerDesign {
  const design = createDefaultBannerDesign();
  const [headline] = design.layers;
  assert.ok(headline?.type === "text");
  return {
    ...design,
    background: { assetId: ASSET_ID, type: "image" },
    layers: [{ ...headline, text: "DB banner {firstName}" }],
  };
}

function routeContext(slot = "background", revision = REVISION) {
  return { params: Promise.resolve({ destination: "beranda", revision, slot }) };
}

function bytesStream(bytes = new Uint8Array([137, 80, 78, 71])) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function insertUser(client: pg.Client, schema: string, {
  email,
  id,
  previewPurpose = null,
  status = "active",
}: {
  email: string;
  id: string;
  previewPurpose?: string | null;
  status?: "active" | "disabled";
}) {
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."users"
      (id, email, full_name, password_hash, preview_purpose, status, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::${quoteIdentifier(schema)}."user_status", $7, $7)`,
    [id, email, email, "test-only-not-a-credential", previewPurpose, status, NOW],
  );
}

async function insertRole(client: pg.Client, schema: string, userId: string, role: "admin" | "student") {
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."role_assignments" (id, user_id, role, assigned_at)
     VALUES ($1::uuid, $2::uuid, $3::${quoteIdentifier(schema)}."role_name", $4)`,
    [randomUUID(), userId, role, NOW],
  );
}

async function insertSession(client: pg.Client, schema: string, id: string, userId: string, rawToken: string) {
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."auth_sessions"
      (id, user_id, refresh_token_hash, status, issued_at, expires_at)
     VALUES ($1::uuid, $2::uuid, $3, 'active'::${quoteIdentifier(schema)}."session_status", $4, $5)`,
    [id, userId, hashToken(rawToken), NOW, new Date(NOW.getTime() + 60 * 60 * 1000)],
  );
}

async function insertAsset(client: pg.Client, schema: string, overrides: Record<string, unknown> = {}) {
  const values = {
    id: ASSET_ID,
    libraryScope: "admin",
    mimeType: "image/png",
    objectKey: "admin/banner-rendering.png",
    sizeBytes: 4,
    state: "ready",
    trashedAt: null,
    url: null,
    ...overrides,
  };
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."assets"
      (id, library_scope, mime_type, object_key, size_bytes, state, trashed_at, url)
     VALUES ($1::uuid, $2::${quoteIdentifier(schema)}."media_library_scope", $3, $4, $5, $6::${quoteIdentifier(schema)}."media_asset_state", $7, $8)`,
    [values.id, values.libraryScope, values.mimeType, values.objectKey, values.sizeBytes, values.state, values.trashedAt, values.url],
  );
}

async function insertConfig(client: pg.Client, schema: string, {
  configValue,
  draftValue,
  draftUpdatedAt = NOW,
  publishedAt = NOW,
}: {
  configValue: unknown;
  draftValue?: unknown;
  draftUpdatedAt?: Date | null;
  publishedAt?: Date | null;
}) {
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."system_configs"
      (id, config_key, config_value, draft_value, draft_updated_at, published_at, updated_at)
     VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb, $5, $6, $7)`,
    [randomUUID(), CONFIG_KEY, JSON.stringify(configValue), draftValue === undefined ? null : JSON.stringify(draftValue), draftUpdatedAt, publishedAt, NOW],
  );
}

async function main() {
  const databaseUrl = readDisposableDatabaseUrl();

  const schema = `banner_rendering_${process.pid}_${Date.now()}`;
  const previousPreviewFlag = process.env.ADMIN_STUDENT_PREVIEW_ENABLED;
  process.env.ADMIN_STUDENT_PREVIEW_ENABLED = "true";
  const adminToken = "admin-rendering-session-token";
  const studentToken = "student-rendering-session-token";
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await createIsolatedSchema(client, schema);
    const isolatedUrl = schemaDatabaseUrl(databaseUrl, schema);
    process.env.DATABASE_URL = isolatedUrl;
    const [{ GET: getPublished }, { GET: getDraft }, auth, delivery, r2, preview] = await Promise.all([
      import("../app/api/student-banners/[destination]/[revision]/[slot]/route"),
      import("../app/api/admin/student-banners/[destination]/draft/[revision]/[slot]/route"),
      import("../lib/auth/session"),
      import("../lib/banner/delivery"),
      import("../lib/media/r2"),
      import("../lib/admin/student-preview"),
    ]);
    const design = makeDesign();
    const envelope = createBannerDesignEnvelope(design, { revision: REVISION });
    const draftEnvelope = createBannerDesignEnvelope({ ...design, name: "DB draft" }, { revision: REVISION });

    await insertUser(client, schema, { email: "db-admin@example.invalid", id: ADMIN_ID });
    await insertRole(client, schema, ADMIN_ID, "admin");
    await insertSession(client, schema, ADMIN_SESSION_ID, ADMIN_ID, adminToken);
    await insertUser(client, schema, { email: "db-student@example.invalid", id: STUDENT_ID });
    await insertRole(client, schema, STUDENT_ID, "student");
    await insertSession(client, schema, STUDENT_SESSION_ID, STUDENT_ID, studentToken);
    await insertUser(client, schema, {
      email: "admin-student-preview@vecalss.local",
      id: FIXTURE_ID,
      previewPurpose: "admin.student-preview",
    });
    await insertRole(client, schema, FIXTURE_ID, "student");
    await client.query(
      `INSERT INTO ${quoteIdentifier(schema)}."student_profiles" (user_id, display_name, timezone)
       VALUES ($1::uuid, $2, $3)`,
      [FIXTURE_ID, "Managed Preview Student", "Asia/Jakarta"],
    );
    await insertAsset(client, schema);
    await insertConfig(client, schema, { configValue: envelope, draftValue: draftEnvelope });

    const adminSession = await auth.getReadOnlySessionContextForToken(adminToken);
    const studentSession = await auth.getReadOnlySessionContextForToken(studentToken);
    assert.equal(adminSession?.user.roles[0], RoleName.admin);
    assert.equal(studentSession?.user.roles[0], RoleName.student);
    assert.equal((await preview.resolveAdminStudentPreviewSubject())?.id, FIXTURE_ID);

    const storage = {
      readObject: async () => ({ body: bytesStream(), contentLength: 4, contentType: "image/png" }),
    };
    const published = await delivery.withBannerDeliveryTestOverrides({
      resolveSession: async () => studentSession,
    }, async () => r2.withMediaStorageTestOverrides(storage, async () => getPublished(new Request("https://vecalss.invalid"), routeContext())));
    assert.equal(published.status, 200, "real student session/config/asset rows must publish the image");
    assert.equal((await published.arrayBuffer()).byteLength, 4);

    const draft = await delivery.withBannerDeliveryTestOverrides({
      resolveSession: async () => adminSession,
    }, async () => r2.withMediaStorageTestOverrides(storage, async () => getDraft(new Request("https://vecalss.invalid"), routeContext())));
    assert.equal(draft.status, 200, "real Admin session + managed fixture + draft config must authorize preview");

    const deniedDraft = await delivery.withBannerDeliveryTestOverrides({
      resolveSession: async () => studentSession,
    }, async () => getDraft(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(deniedDraft.status, 403);

    const stale = await delivery.withBannerDeliveryTestOverrides({
      resolveSession: async () => studentSession,
    }, async () => r2.withMediaStorageTestOverrides(storage, async () => getPublished(new Request("https://vecalss.invalid"), routeContext("background", STALE_REVISION))));
    assert.equal(stale.status, 404);

    await client.query(`UPDATE ${quoteIdentifier(schema)}."assets" SET library_scope = 'kapten'::${quoteIdentifier(schema)}."media_library_scope" WHERE id = $1::uuid`, [ASSET_ID]);
    const wrongScope = await delivery.withBannerDeliveryTestOverrides({ resolveSession: async () => studentSession }, async () => getPublished(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(wrongScope.status, 404);
    await client.query(`UPDATE ${quoteIdentifier(schema)}."assets" SET library_scope = 'admin'::${quoteIdentifier(schema)}."media_library_scope", state = 'trashed'::${quoteIdentifier(schema)}."media_asset_state" WHERE id = $1::uuid`, [ASSET_ID]);
    const trashed = await delivery.withBannerDeliveryTestOverrides({ resolveSession: async () => studentSession }, async () => getPublished(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(trashed.status, 404);
    await client.query(`UPDATE ${quoteIdentifier(schema)}."assets" SET state = 'pending'::${quoteIdentifier(schema)}."media_asset_state", trashed_at = NULL WHERE id = $1::uuid`, [ASSET_ID]);
    const pending = await delivery.withBannerDeliveryTestOverrides({ resolveSession: async () => studentSession }, async () => getPublished(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(pending.status, 404);
    await client.query(`UPDATE ${quoteIdentifier(schema)}."assets" SET state = 'ready'::${quoteIdentifier(schema)}."media_asset_state", trashed_at = CURRENT_TIMESTAMP, mime_type = 'image/png' WHERE id = $1::uuid`, [ASSET_ID]);
    const timestampTrashed = await delivery.withBannerDeliveryTestOverrides({ resolveSession: async () => studentSession }, async () => getPublished(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(timestampTrashed.status, 404);
    await client.query(`UPDATE ${quoteIdentifier(schema)}."assets" SET trashed_at = NULL, mime_type = 'application/pdf' WHERE id = $1::uuid`, [ASSET_ID]);
    const wrongMime = await delivery.withBannerDeliveryTestOverrides({ resolveSession: async () => studentSession }, async () => getPublished(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(wrongMime.status, 404);

    await client.query(`UPDATE ${quoteIdentifier(schema)}."assets" SET mime_type = 'image/png' WHERE id = $1::uuid`, [ASSET_ID]);
    await client.query(`UPDATE ${quoteIdentifier(schema)}."system_configs" SET draft_value = $1::jsonb WHERE config_key = $2`, [JSON.stringify({ malformed: true }), CONFIG_KEY]);
    const malformedDraft = await delivery.withBannerDeliveryTestOverrides({ resolveSession: async () => adminSession }, async () => getDraft(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(malformedDraft.status, 404, "a malformed draft must not be served even when the published envelope is valid");

    await client.query(`UPDATE ${quoteIdentifier(schema)}."system_configs" SET config_value = $1::jsonb WHERE config_key = $2`, [JSON.stringify({ malformed: true }), CONFIG_KEY]);
    const malformedPublished = await delivery.withBannerDeliveryTestOverrides({ resolveSession: async () => studentSession }, async () => getPublished(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(malformedPublished.status, 404);

    const ambiguousFixtureId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await insertUser(client, schema, {
      email: "ambiguous-admin-student-preview@vecalss.local",
      id: ambiguousFixtureId,
      previewPurpose: "admin.student-preview",
    });
    const ambiguousFixture = await delivery.withBannerDeliveryTestOverrides({ resolveSession: async () => adminSession }, async () => getDraft(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(ambiguousFixture.status, 404, "multiple managed preview fixtures must deny the route");
    await client.query(`DELETE FROM ${quoteIdentifier(schema)}."users" WHERE id = $1::uuid`, [ambiguousFixtureId]);
    await client.query(`DELETE FROM ${quoteIdentifier(schema)}."role_assignments" WHERE user_id = $1::uuid`, [FIXTURE_ID]);
    await client.query(`DELETE FROM ${quoteIdentifier(schema)}."student_profiles" WHERE user_id = $1::uuid`, [FIXTURE_ID]);
    await client.query(`DELETE FROM ${quoteIdentifier(schema)}."users" WHERE id = $1::uuid`, [FIXTURE_ID]);
    const missingFixture = await delivery.withBannerDeliveryTestOverrides({ resolveSession: async () => adminSession }, async () => getDraft(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(missingFixture.status, 404, "missing managed preview fixture must deny the route");
    await insertUser(client, schema, {
      email: "admin-student-preview@vecalss.local",
      id: FIXTURE_ID,
      previewPurpose: "admin.student-preview",
      status: "disabled",
    });
    const invalidFixture = await delivery.withBannerDeliveryTestOverrides({ resolveSession: async () => adminSession }, async () => getDraft(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(invalidFixture.status, 404);

    console.log("banner rendering real Prisma/session/asset/config checks passed");
  } finally {
    await dropIsolatedSchema(client, schema).catch(() => undefined);
    await client.end();
    if (previousPreviewFlag === undefined) delete process.env.ADMIN_STUDENT_PREVIEW_ENABLED;
    else process.env.ADMIN_STUDENT_PREVIEW_ENABLED = previousPreviewFlag;
  }
}

await main();

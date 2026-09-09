import "dotenv/config";

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

import { parse as parseDotenv } from "dotenv";
import pg from "pg";

import { createBannerDesignEnvelope } from "../lib/banner/envelope";
import { BANNER_DESTINATIONS, BANNER_LEGACY_CONFIG_KEY, type BannerDestination } from "../lib/banner/destinations";
import { createDefaultBannerDesign, type BannerDesign } from "../lib/admin/banner-maker";
import { hashPassword } from "../lib/auth/crypto";

const { Client } = pg;

const TEST_DATABASE_ENV = "BANNER_MEDIA_SAFETY_TEST_DATABASE_URL";
const FALLBACK_DATABASE_ENV = "VERA_DISPOSABLE_DATABASE_URL";
const DISPOSABLE_ACK_ENV = "VERA_DISPOSABLE_DB_ACK";
const STATE_ENV = "BP06_BROWSER_STATE_PATH";
const PORT = 5146;
const STATE_PREFIX = "vecalss-bp06-browser-state";
const MIRROR_PREFIX = "vecalss-bp06-browser-";
const SCHEMA_PREFIX = "banner_bp06_browser_";
const MIRROR_DIST_DIR = ".next-bp06-browser";
const NEXT_ROUTE_TYPE_REFERENCES = ["./.next/types/routes.d.ts", "./.next/dev/types/routes.d.ts"] as const;

const ADMIN_ID = "a1111111-1111-4111-8111-111111111111";
const VOYAGER_ID = "b2222222-2222-4222-8222-222222222222";
const FIXTURE_ID = "00000000-0000-4000-8000-000000000001";
const ASSET_ID = "c3333333-3333-4333-8333-333333333333";
const NOW = new Date("2035-01-01T00:00:00.000Z");
const ASSET_URL = "https://placehold.co/1600x600/png?text=BP06+synthetic+banner";
const ADMIN_EMAIL = "bp06-admin@vecalss.test";
const VOYAGER_EMAIL = "bp06-voyager@vecalss.test";

const PUBLISHED_REVISIONS: Record<BannerDestination, string> = {
  beranda: "11111111-1111-4111-8111-111111111111",
  materi: "22222222-2222-4222-8222-222222222222",
  kuis: "33333333-3333-4333-8333-333333333333",
  tryout: "44444444-4444-4444-8444-444444444444",
};
const DRAFT_REVISIONS: Record<BannerDestination, string> = {
  beranda: "55555555-5555-4555-8555-555555555555",
  materi: "66666666-6666-4666-8666-666666666666",
  kuis: "77777777-7777-4777-8777-777777777777",
  tryout: "88888888-8888-4888-8888-888888888888",
};

type FixtureState = {
  credentialFile: string;
  envFile: string;
  mirrorRoot: string;
  port: number;
  publishedRevisions: Record<BannerDestination, string>;
  schema: string;
  stateFile: string;
  databaseUrl: string;
  draftRevisions: Record<BannerDestination, string>;
};

type CatalogRow = {
  tableName: string;
  columnName?: string;
  typeName?: string;
  isArray?: boolean;
  defaultExpression?: string | null;
};

type UniqueIndexRow = {
  indexName: string;
  indexDefinition: string;
};

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function statePath() {
  return resolve(process.env[STATE_ENV]?.trim() || join(tmpdir(), `${STATE_PREFIX}.json`));
}

function hasErrnoCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === code;
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
  assert.ok(raw, `BP06 fixture requires ${TEST_DATABASE_ENV} or ${FALLBACK_DATABASE_ENV}; configured DATABASE_URL is never used.`);

  const identity = connectionIdentity(raw);
  const configured = process.env.DATABASE_URL?.trim();
  const configuredIdentity = configured ? connectionIdentity(configured) : null;
  assert.ok(["postgres:", "postgresql:"].includes(identity.protocol), "BP06 fixture DB must use PostgreSQL.");
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(identity.host), "BP06 fixture DB must use a local PostgreSQL host.");
  assert.ok(
    /(?:banner|media|safety|test)/iu.test(identity.databaseName)
      || (fallback && process.env[DISPOSABLE_ACK_ENV] === "1" && identity.databaseName === "vera_test"),
    "BP06 fixture DB must name a dedicated disposable database.",
  );
  assert.ok(!configuredIdentity || !sameDatabase(identity, configuredIdentity), "BP06 fixture DB must be distinct from DATABASE_URL.");
  if (!explicit) assert.equal(process.env[DISPOSABLE_ACK_ENV], "1", `${FALLBACK_DATABASE_ENV} requires ${DISPOSABLE_ACK_ENV}=1.`);
  return raw;
}

function schemaDatabaseUrl(raw: string, schema: string) {
  const parsed = new URL(raw);
  parsed.searchParams.set("schema", schema);
  parsed.searchParams.set("options", `-c search_path=${schema},public`);
  return parsed.toString();
}

async function readEnumDefinitions(client: pg.Client) {
  const result = await client.query<{ typeName: string; label: string }>(
    `SELECT type.typname AS "typeName", enum_row.enumlabel AS label
       FROM pg_type type
       JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
       JOIN pg_enum enum_row ON enum_row.enumtypid = type.oid
      WHERE namespace.nspname = 'public'
      ORDER BY type.typname, enum_row.enumsortorder`,
  );
  const definitions = new Map<string, string[]>();
  for (const row of result.rows) {
    const values = definitions.get(row.typeName) ?? [];
    values.push(row.label);
    definitions.set(row.typeName, values);
  }
  return definitions;
}

async function readPublicSequences(client: pg.Client) {
  const result = await client.query<{ sequenceName: string }>(
    `SELECT class.relname AS "sequenceName"
       FROM pg_class class
       JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
      WHERE namespace.nspname = 'public' AND class.relkind = 'S'
      ORDER BY class.relname`,
  );
  return result.rows.map(({ sequenceName }) => sequenceName);
}

async function readPublicTables(client: pg.Client) {
  const result = await client.query<{ tableName: string }>(
    `SELECT class.relname AS "tableName"
       FROM pg_class class
       JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
      WHERE namespace.nspname = 'public' AND class.relkind IN ('r', 'p')
      ORDER BY class.relname`,
  );
  return result.rows.map(({ tableName }) => tableName);
}

async function createLocalSchema(client: pg.Client, schema: string, onSchemaCreated: () => void) {
  const quotedSchema = quoteIdentifier(schema);
  const enums = await readEnumDefinitions(client);
  const sequences = await readPublicSequences(client);
  const tables = await readPublicTables(client);

  await client.query(`CREATE SCHEMA ${quotedSchema}`);
  onSchemaCreated();
  for (const [typeName, labels] of enums) {
    await client.query(
      `CREATE TYPE ${quotedSchema}.${quoteIdentifier(typeName)} AS ENUM (${labels.map(quoteLiteral).join(", ")})`,
    );
  }
  for (const sequenceName of sequences) {
    await client.query(`CREATE SEQUENCE ${quotedSchema}.${quoteIdentifier(sequenceName)}`);
  }
  for (const tableName of tables) {
    await client.query(
      `CREATE TABLE ${quotedSchema}.${quoteIdentifier(tableName)} (LIKE public.${quoteIdentifier(tableName)} INCLUDING DEFAULTS)`,
    );
  }

  const enumColumns = await client.query<CatalogRow>(
    `SELECT class.relname AS "tableName", attribute.attname AS "columnName",
            CASE WHEN type.typtype = 'e' THEN type.typname ELSE element_type.typname END AS "typeName",
            (type.typtype <> 'e') AS "isArray",
            pg_get_expr(default_row.adbin, default_row.adrelid) AS "defaultExpression"
       FROM pg_attribute attribute
       JOIN pg_class class ON class.oid = attribute.attrelid
       JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
       JOIN pg_type type ON type.oid = attribute.atttypid
       LEFT JOIN pg_type element_type ON element_type.oid = type.typelem
       LEFT JOIN pg_attrdef default_row
         ON default_row.adrelid = attribute.attrelid AND default_row.adnum = attribute.attnum
      WHERE namespace.nspname = 'public'
        AND class.relkind IN ('r', 'p')
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND (type.typtype = 'e' OR element_type.typtype = 'e')
      ORDER BY class.relname, attribute.attnum`,
  );
  const enumNames = [...enums.keys()];
  const sequenceNames = new Set(sequences);
  for (const row of enumColumns.rows) {
    assert.ok(row.columnName && row.typeName);
    const table = `${quotedSchema}.${quoteIdentifier(row.tableName)}`;
    const column = quoteIdentifier(row.columnName);
    const localType = `${quotedSchema}.${quoteIdentifier(row.typeName)}${row.isArray ? "[]" : ""}`;
    const textCast = row.isArray ? `${column}::text[]` : `${column}::text`;
    await client.query(`ALTER TABLE ${table} ALTER COLUMN ${column} DROP DEFAULT`);
    await client.query(
      `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${localType} USING ${textCast}::${localType}`,
    );
    if (row.defaultExpression) {
      await client.query(
        `ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT ${rewriteCatalogExpression(row.defaultExpression, schema, enumNames, sequenceNames)}`,
      );
    }
  }

  // `LIKE ... INCLUDING DEFAULTS` copies expressions verbatim.  Re-apply
  // every public default after the enum conversion so a serial/identity
  // default can never retain a `public.*` sequence or enum type reference in
  // the disposable schema.
  const defaultColumns = await client.query<CatalogRow>(
    `SELECT class.relname AS "tableName", attribute.attname AS "columnName",
            pg_get_expr(default_row.adbin, default_row.adrelid) AS "defaultExpression"
       FROM pg_attribute attribute
       JOIN pg_class class ON class.oid = attribute.attrelid
       JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
       JOIN pg_attrdef default_row
         ON default_row.adrelid = attribute.attrelid AND default_row.adnum = attribute.attnum
      WHERE namespace.nspname = 'public'
        AND class.relkind IN ('r', 'p')
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
      ORDER BY class.relname, attribute.attnum`,
  );
  for (const row of defaultColumns.rows) {
    assert.ok(row.columnName && row.defaultExpression);
    const table = `${quotedSchema}.${quoteIdentifier(row.tableName)}`;
    const column = quoteIdentifier(row.columnName);
    await client.query(`ALTER TABLE ${table} ALTER COLUMN ${column} DROP DEFAULT`);
    await client.query(
      `ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT ${rewriteCatalogExpression(row.defaultExpression, schema, enumNames, sequenceNames)}`,
    );
  }

  // `CREATE TABLE ... LIKE ... INCLUDING DEFAULTS` does not copy standalone
  // indexes. Copy every non-constraint unique index before foreign keys so a
  // composite FK cannot silently disappear just because PostgreSQL requires a
  // unique index (rather than a UNIQUE constraint) on its target columns.
  await cloneLocalUniqueIndexes(client, schema);
  await cloneLocalConstraints(client, schema);
}

function rewriteCatalogExpression(
  expression: string,
  schema: string,
  enumNames: string[],
  sequenceNames: Set<string>,
) {
  let rewritten = expression
    .replaceAll('"public".', `${quoteIdentifier(schema)}.`)
    .replaceAll("public.", `${quoteIdentifier(schema)}.`);
  for (const enumName of enumNames) {
    rewritten = rewritten.replace(
      new RegExp(`::\\s*"?${enumName}"?(?![\\w])`, "gu"),
      `::${quoteIdentifier(schema)}.${quoteIdentifier(enumName)}`,
    );
  }
  for (const sequenceName of sequenceNames) {
    rewritten = rewritten.replace(
      new RegExp(`'(?:(?:public\\.)?)${sequenceName}'::regclass`, "gu"),
      `${quoteLiteral(`${schema}.${sequenceName}`)}::regclass`,
    );
  }
  return rewritten;
}

async function cloneLocalConstraints(client: pg.Client, schema: string) {
  const constraints = await client.query<{
    tableName: string;
    constraintName: string;
    constraintType: string;
    definition: string;
    referencedTableName: string | null;
  }>(
    `SELECT source.relname AS "tableName", constraint_row.conname AS "constraintName",
            constraint_row.contype AS "constraintType",
            pg_get_constraintdef(constraint_row.oid, true) AS definition,
            target.relname AS "referencedTableName"
       FROM pg_constraint constraint_row
       JOIN pg_class source ON source.oid = constraint_row.conrelid
       JOIN pg_namespace source_namespace ON source_namespace.oid = source.relnamespace
       LEFT JOIN pg_class target ON target.oid = constraint_row.confrelid
      WHERE source_namespace.nspname = 'public'
        AND constraint_row.contype IN ('p', 'u', 'f')
      ORDER BY constraint_row.contype = 'f', source.relname, constraint_row.conname`,
  );
  const quotedSchema = quoteIdentifier(schema);
  for (const row of constraints.rows.filter(({ constraintType }) => constraintType !== "f")) {
    await client.query(
      `ALTER TABLE ${quotedSchema}.${quoteIdentifier(row.tableName)} ADD CONSTRAINT ${quoteIdentifier(row.constraintName)} ${row.definition}`,
    );
  }
  for (const row of constraints.rows.filter(({ constraintType }) => constraintType === "f")) {
    assert.ok(row.referencedTableName);
    const definition = row.definition
      .replaceAll('"public".', `${quotedSchema}.`)
      .replaceAll("public.", `${quotedSchema}.`)
      .replace(
        new RegExp(`REFERENCES\\s+(?:${schema}\\.)?"?${row.referencedTableName}"?`, "iu"),
        `REFERENCES ${quotedSchema}.${quoteIdentifier(row.referencedTableName)}`,
      );
    // Do not catch 42830 here. The historical omission was
    // `questions_current_revision_identity_fkey`, whose target
    // `question_revisions(question_id, id)` is backed by the standalone
    // `question_revisions_question_id_id_key` index. That index is now copied
    // above; any remaining failure means the local schema is incomplete and
    // must fail closed instead of weakening fixture integrity.
    await client.query(
      `ALTER TABLE ${quotedSchema}.${quoteIdentifier(row.tableName)} ADD CONSTRAINT ${quoteIdentifier(row.constraintName)} ${definition}`,
    );
  }
}

async function cloneLocalUniqueIndexes(client: pg.Client, schema: string) {
  const result = await client.query<UniqueIndexRow>(
    `SELECT index_class.relname AS "indexName",
            pg_get_indexdef(index_class.oid) AS "indexDefinition"
       FROM pg_index index_row
       JOIN pg_class table_class ON table_class.oid = index_row.indrelid
       JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
       JOIN pg_class index_class ON index_class.oid = index_row.indexrelid
       LEFT JOIN pg_constraint constraint_row ON constraint_row.conindid = index_row.indexrelid
      WHERE table_namespace.nspname = 'public'
        AND table_class.relkind IN ('r', 'p')
        AND index_class.relkind IN ('i', 'I')
        AND index_row.indisunique
        AND NOT index_row.indisprimary
        AND constraint_row.oid IS NULL
      ORDER BY table_class.relname, index_class.relname`,
  );
  const quotedSchema = quoteIdentifier(schema);
  for (const row of result.rows) {
    const prefix = /^CREATE UNIQUE INDEX\s+(?:"(?:[^"]|"")+"|\S+)\s+ON\s+(ONLY\s+)?/u;
    assert.match(row.indexDefinition, prefix, `BP06 cannot rewrite unique index ${row.indexName}`);
    const rewritten = row.indexDefinition
      .replace(prefix, (_match, only: string | undefined) =>
        // PostgreSQL's CREATE INDEX grammar takes an unqualified index name;
        // the index is created in the schema of its (schema-qualified) table.
        `CREATE UNIQUE INDEX ${quoteIdentifier(row.indexName)} ON ${only ?? ""}`)
      .replaceAll('"public".', `${quotedSchema}.`)
      .replaceAll("public.", `${quotedSchema}.`);
    assert.doesNotMatch(rewritten, /(?:^|\W)"?public"?\./u, `BP06 unique index ${row.indexName} still references public`);
    await client.query(rewritten);
  }
}

async function dropLocalSchema(client: pg.Client, schema: string) {
  assert.match(schema, new RegExp(`^${SCHEMA_PREFIX}[a-z0-9_]+$`, "u"));
  await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
}

function browserDesign(destination: BannerDestination, variant: "published" | "draft") {
  const design = createDefaultBannerDesign();
  const [headline, supportingCopy] = design.layers;
  assert.ok(headline?.type === "text" && supportingCopy?.type === "text");
  return {
    ...design,
    background: { assetId: ASSET_ID, type: "image" },
    name: `BP06 ${destination} ${variant}`,
    layers: [
      { ...headline, text: variant === "published" ? "BP06 {firstName} published" : "BP06 {firstName} draft" },
      { ...supportingCopy, text: `Synthetic ${destination} {targetMajor} {targetUniversity}` },
    ],
  } satisfies BannerDesign;
}

async function insertUser(client: pg.Client, schema: string, values: {
  email: string;
  fullName: string;
  id: string;
  passwordHash: string;
  previewPurpose?: string | null;
}) {
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."users"
      (id, email, full_name, password_hash, preview_purpose, status, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, 'active'::${quoteIdentifier(schema)}."user_status", $6, $6)`,
    [values.id, values.email, values.fullName, values.passwordHash, values.previewPurpose ?? null, NOW],
  );
}

async function insertRole(client: pg.Client, schema: string, userId: string, role: "admin" | "student") {
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."role_assignments" (id, user_id, role, assigned_at)
     VALUES ($1::uuid, $2::uuid, $3::${quoteIdentifier(schema)}."role_name", $4)`,
    [randomUUID(), userId, role, NOW],
  );
}

async function insertProfile(client: pg.Client, schema: string, userId: string, displayName: string) {
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."student_profiles"
      (user_id, display_name, onboarding_status, timezone, created_at, updated_at)
     VALUES ($1::uuid, $2, 'completed'::${quoteIdentifier(schema)}."onboarding_status", $3, $4, $4)`,
    [userId, displayName, "Asia/Jakarta", NOW],
  );
}

async function insertAsset(client: pg.Client, schema: string) {
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."assets"
      (id, library_scope, state, object_key, original_name, url, mime_type, size_bytes, width, height, created_at, updated_at)
     VALUES ($1::uuid, 'admin'::${quoteIdentifier(schema)}."media_library_scope", 'ready'::${quoteIdentifier(schema)}."media_asset_state", NULL, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [ASSET_ID, "BP06 synthetic banner.png", ASSET_URL, "image/png", 4096, 1600, 600, NOW],
  );
}

async function insertConfig(client: pg.Client, schema: string, values: {
  configKey: string;
  configValue: unknown;
  draftValue?: unknown;
  draftUpdatedAt?: Date | null;
  publishedAt?: Date | null;
  updatedByUserId?: string | null;
}) {
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."system_configs"
      (id, config_key, config_value, draft_value, updated_by_user_id, updated_at,
       draft_updated_by_user_id, draft_updated_at, published_by_user_id, published_at)
     VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb, $5::uuid, $6,
             $5::uuid, $7, $5::uuid, $8)`,
    [
      randomUUID(),
      values.configKey,
      JSON.stringify(values.configValue),
      values.draftValue === undefined || values.draftValue === null ? null : JSON.stringify(values.draftValue),
      values.updatedByUserId ?? ADMIN_ID,
      NOW,
      values.draftUpdatedAt ?? (values.draftValue === undefined ? null : NOW),
      values.publishedAt ?? NOW,
    ],
  );
}

async function seedFixture(client: pg.Client, schema: string, credentials: { adminPassword: string; voyagerPassword: string }) {
  await insertUser(client, schema, {
    email: ADMIN_EMAIL,
    fullName: "BP06 Admin Verification Owner",
    id: ADMIN_ID,
    passwordHash: await hashPassword(credentials.adminPassword),
  });
  await insertRole(client, schema, ADMIN_ID, "admin");
  await insertUser(client, schema, {
    email: VOYAGER_EMAIL,
    fullName: "Voyager BP06 Long Personalization Verification Student",
    id: VOYAGER_ID,
    passwordHash: await hashPassword(credentials.voyagerPassword),
  });
  await insertRole(client, schema, VOYAGER_ID, "student");
  await insertProfile(client, schema, VOYAGER_ID, "Voyager BP06 Long Personalization Verification Student");
  await insertUser(client, schema, {
    email: "admin-student-preview@vecalss.local",
    fullName: "Managed BP06 Preview Subject",
    id: FIXTURE_ID,
    passwordHash: "managed-preview-fixture-no-login",
    previewPurpose: "admin.student-preview",
  });
  await insertRole(client, schema, FIXTURE_ID, "student");
  await insertProfile(client, schema, FIXTURE_ID, "Managed BP06 Preview Subject");
  await insertAsset(client, schema);

  const legacyText = Object.fromEntries(BANNER_DESTINATIONS.map(({ key }) => [key, {
    description: "Legacy fallback untuk {firstName} · {targetMajor} · {targetUniversity}",
    title: "Legacy {firstName}",
  }]));
  await insertConfig(client, schema, {
    configKey: "student.banners",
    configValue: legacyText,
    draftValue: null,
    publishedAt: NOW,
  });

  const legacyArtwork = browserDesign("beranda", "published");
  await insertConfig(client, schema, {
    configKey: BANNER_LEGACY_CONFIG_KEY,
    configValue: legacyArtwork,
    draftValue: null,
    publishedAt: NOW,
  });

  for (const { key, configKey } of BANNER_DESTINATIONS) {
    await insertConfig(client, schema, {
      configKey,
      configValue: createBannerDesignEnvelope(browserDesign(key, "published"), { revision: PUBLISHED_REVISIONS[key] }),
      draftValue: createBannerDesignEnvelope(browserDesign(key, "draft"), { revision: DRAFT_REVISIONS[key] }),
      publishedAt: NOW,
    });
  }
}

async function writeStateFiles(state: FixtureState, credentials: { adminEmail: string; adminPassword: string; voyagerEmail: string; voyagerPassword: string }) {
  const stateDirectory = dirname(state.stateFile);
  await mkdir(stateDirectory, { recursive: true });
  const credentialFile = state.credentialFile;
  const envFile = state.envFile;
  await writeFile(credentialFile, `${JSON.stringify(credentials, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(credentialFile, 0o600);
  const env = [
    `DATABASE_URL=${shellQuote(state.databaseUrl)}`,
    "ADMIN_STUDENT_PREVIEW_ENABLED=true",
    "BANNER_V2_ACTIVATION=enabled",
    "BANNER_BP01_WRITER_PROTECTION_ACK=1",
    "BANNER_LEGACY_WRITER_RETIREMENT_ACK=1",
    "BANNER_LEGACY_WRITER_DRAIN_ACK=1",
    "BANNER_TRUSTED_IMAGE_HOSTS=placehold.co",
    "NEXT_TELEMETRY_DISABLED=1",
  ].join("\n") + "\n";
  await writeFile(envFile, env, { encoding: "utf8", mode: 0o600 });
  await chmod(envFile, 0o600);
  await writeFile(state.stateFile, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(state.stateFile, 0o600);
}

function routeUrl(port: number, path: string) {
  return `http://127.0.0.1:${port}${path}`;
}

function printRoutes(state: FixtureState) {
  console.log(`BP06 browser fixture ready on ${routeUrl(state.port, "/")}`);
  console.log(`state=${state.stateFile}`);
  console.log(`mirror=${state.mirrorRoot}`);
  console.log(`envFile=${state.envFile}`);
  console.log(`credentialFile=${state.credentialFile}`);
  console.log("Admin editor: /admin/student-banners?destination=beranda|materi|kuis|tryout");
  console.log("Voyager: /dashboard | /courses | /quiz | /tryout");
  for (const { key } of BANNER_DESTINATIONS) {
    const published = state.publishedRevisions[key];
    const draft = state.draftRevisions[key];
    const suffix = key === "beranda" ? "" : `/${key === "materi" ? "courses" : key}`;
    console.log(`Admin preview ${key} published=${routeUrl(state.port, `/admin/student-preview${suffix}`)}`);
    console.log(`Admin preview ${key} draft=${routeUrl(state.port, `/admin/student-preview${suffix}?bannerSource=draft&revision=${draft}`)}`);
    console.log(`revisions ${key}: published=${published} draft=${draft}`);
  }
}

async function setup() {
  const databaseUrl = readDisposableDatabaseUrl();
  const stateFile = statePath();
  const orphanSchemaIndex = process.argv.indexOf("--orphan-schema");
  const orphanSchema = orphanSchemaIndex === -1 ? null : process.argv[orphanSchemaIndex + 1];
  if (orphanSchemaIndex !== -1) {
    assert.ok(orphanSchema, "--orphan-schema requires an exact schema name");
    assert.match(orphanSchema, new RegExp(`^${SCHEMA_PREFIX}[a-z0-9_]+$`, "u"));
    const orphanClient = new Client({ connectionString: databaseUrl });
    await orphanClient.connect();
    try {
      await dropLocalSchema(orphanClient, orphanSchema);
    } finally {
      await orphanClient.end();
    }
  }
  try {
    await lstat(stateFile);
    throw new Error(`BP06 fixture state already exists at ${stateFile}; run cleanup first.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const schema = `${SCHEMA_PREFIX}${process.pid}_${Date.now()}`;
  const mirrorRoot = join(tmpdir(), `${MIRROR_PREFIX}${process.pid}-${Date.now()}`);
  const envFile = join(dirname(stateFile), `${STATE_PREFIX}.env`);
  const credentialFile = join(dirname(stateFile), `${STATE_PREFIX}.credentials.json`);
  const isolatedUrl = schemaDatabaseUrl(databaseUrl, schema);
  const client = new Client({ connectionString: databaseUrl });
  const adminPassword = `BP06-${randomUUID()}-Aa7`;
  const voyagerPassword = `BP06-${randomUUID()}-Vv7`;
  const fixtureState: FixtureState = {
    credentialFile,
    databaseUrl: isolatedUrl,
    draftRevisions: DRAFT_REVISIONS,
    envFile,
    mirrorRoot,
    port: PORT,
    publishedRevisions: PUBLISHED_REVISIONS,
    schema,
    stateFile,
  };
  const fixtureCredentials = {
    adminEmail: ADMIN_EMAIL,
    adminPassword,
    voyagerEmail: VOYAGER_EMAIL,
    voyagerPassword,
  };
  let schemaOwned = false;
  try {
    await client.connect();
    await createLocalSchema(client, schema, () => {
      // Ownership begins only after this exact CREATE SCHEMA succeeds; a
      // collision can therefore never cause failure cleanup to drop it.
      schemaOwned = true;
    });
    await seedFixture(client, schema, { adminPassword, voyagerPassword });
    await client.end();
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    await mkdir(mirrorRoot, { recursive: true });
    // Mirror creation is intentionally explicit so no Next-generated file can
    // land through a symlink in the source workspace.
    const mirror = await createMirrorAt(sourceRoot, mirrorRoot);
    await assertMirrorBoundary(sourceRoot, mirror);
    assert.equal(mirror, fixtureState.mirrorRoot);
    await writeStateFiles(fixtureState, fixtureCredentials);
    printRoutes(fixtureState);
  } catch (error) {
    await client.end().catch(() => undefined);
    let schemaCleanupError: unknown = null;
    if (schemaOwned) {
      const cleanupClient = new Client({ connectionString: databaseUrl });
      try {
        await cleanupClient.connect();
        await dropLocalSchema(cleanupClient, schema);
      } catch (cleanupError) {
        schemaCleanupError = cleanupError;
      } finally {
        try {
          await cleanupClient.end();
        } catch (closeError) {
          schemaCleanupError ??= closeError;
        }
      }
      if (schemaCleanupError) {
        // Preserve exact ownership evidence when schema cleanup fails. The
        // private state lets a later explicit cleanup retry only this schema;
        // it is never replaced by a broad drop or silently discarded.
        try {
          await writeStateFiles(fixtureState, fixtureCredentials);
          console.error(`BP06 fixture setup failed; exact schema cleanup failed. Ownership state retained at ${stateFile}`);
        } catch {
          console.error(`BP06 fixture setup failed; exact schema cleanup failed and ownership state could not be retained for ${schema}`);
        }
      }
    }
    if (!schemaCleanupError) {
      await rm(mirrorRoot, { recursive: true, force: true });
      await rm(envFile, { force: true });
      await rm(credentialFile, { force: true });
    }
    throw error;
  }
}

async function createMirrorAt(root: string, mirrorRoot: string) {
  const skip = new Set([".git", ".next", "node_modules", ".env", ".env.local", "tmp", "output"]);
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
    const source = join(root, entry.name);
    const target = join(mirrorRoot, entry.name);
    if (entry.name === "next.config.ts") {
      const config = await readFile(source, "utf8");
      const distDirPattern = /\bdistDir\s*:\s*(["'])[^"']+\1/u;
      const patched = distDirPattern.test(config)
        ? config.replace(distDirPattern, `distDir: "${MIRROR_DIST_DIR}"`)
        : config.replace(
          "const nextConfig: NextConfig = {",
          `const nextConfig: NextConfig = {\n  distDir: "${MIRROR_DIST_DIR}",`,
        );
      assert.notEqual(patched, config, "BP06 mirror must patch Next distDir in its private config copy.");
      assert.match(patched, new RegExp(`\\bdistDir\\s*:\\s*["']${MIRROR_DIST_DIR}["']`, "u"));
      await writeFile(target, patched, "utf8");
    } else if (entry.name === "next-env.d.ts") {
      const sourceText = await readFile(source, "utf8");
      const patched = NEXT_ROUTE_TYPE_REFERENCES.reduce(
        (text, reference) => text.replaceAll(reference, reference.replace("./.next", `./${MIRROR_DIST_DIR}`)),
        sourceText,
      );
      assert.notEqual(patched, sourceText, "BP06 mirror must patch the generated next-env route type reference.");
      assert.doesNotMatch(
        patched,
        /import\s+["']\.\/\.next(?:\/dev)?\/types\/routes\.d\.ts["']/u,
        "BP06 mirror must keep every next-env route type inside its private distDir.",
      );
      assert.match(
        patched,
        new RegExp(`import\\s+["']\\./${MIRROR_DIST_DIR}(?:/dev)?/types/routes\\.d\\.ts["']`, "u"),
      );
      await writeFile(target, patched, "utf8");
    } else if (entry.name === "tsconfig.json") {
      const sourceText = await readFile(source, "utf8");
      const patched = sourceText
        .replaceAll(".next/types/**/*.ts", `${MIRROR_DIST_DIR}/types/**/*.ts`)
        .replaceAll(".next/dev/types/**/*.ts", `${MIRROR_DIST_DIR}/dev/types/**/*.ts`);
      const tsconfig = JSON.parse(patched) as {
        compilerOptions?: Record<string, unknown>;
        include?: unknown;
      };
      tsconfig.compilerOptions ??= {};
      tsconfig.compilerOptions.tsBuildInfoFile = `${MIRROR_DIST_DIR}/tsconfig.tsbuildinfo`;
      assert.ok(
        Array.isArray(tsconfig.include)
          && tsconfig.include.every((entry) => typeof entry !== "string" || !entry.startsWith(".next/")),
        "BP06 mirror tsconfig must not include source .next paths",
      );
      assert.equal(
        tsconfig.compilerOptions.tsBuildInfoFile,
        `${MIRROR_DIST_DIR}/tsconfig.tsbuildinfo`,
        "BP06 mirror tsconfig must keep incremental output private",
      );
      const serialized = `${JSON.stringify(tsconfig, null, 2)}\n`;
      assert.match(serialized, new RegExp(MIRROR_DIST_DIR, "u"));
      await writeFile(target, serialized, "utf8");
    } else if (["package.json", "pnpm-lock.yaml"].includes(entry.name)) {
      await copyFile(source, target);
    } else {
      await symlink(source, target, entry.isDirectory() ? "dir" : "file");
    }
  }
  await symlink(join(root, "node_modules"), join(mirrorRoot, "node_modules"), "dir");
  await mkdir(join(mirrorRoot, MIRROR_DIST_DIR), { recursive: true });
  return mirrorRoot;
}

async function assertMirrorBoundary(sourceRoot: string, mirrorRoot: string) {
  assert.notEqual(resolve(sourceRoot), resolve(mirrorRoot), "BP06 mirror must not be the source workspace");
  const privateOutput = await lstat(join(mirrorRoot, MIRROR_DIST_DIR));
  assert.ok(privateOutput.isDirectory() && !privateOutput.isSymbolicLink(), "BP06 Next output must be a real mirror-local directory");
  const sourceDependencies = await lstat(join(mirrorRoot, "node_modules"));
  assert.ok(sourceDependencies.isSymbolicLink(), "BP06 dependency mirror may symlink node_modules only");
  for (const copiedFile of ["next.config.ts", "next-env.d.ts", "tsconfig.json", "package.json", "pnpm-lock.yaml"]) {
    const copied = await lstat(join(mirrorRoot, copiedFile));
    assert.ok(copied.isFile() && !copied.isSymbolicLink(), `BP06 ${copiedFile} must be a private copied file`);
  }
  await assert.rejects(
    lstat(join(mirrorRoot, ".next")),
    (error: unknown) => hasErrnoCode(error, "ENOENT"),
    "BP06 mirror must not expose the source .next directory",
  );
}

async function cleanup() {
  const file = statePath();
  let serializedState: string;
  try {
    serializedState = await readFile(file, "utf8");
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) {
      console.log(`BP06 browser fixture cleanup: no state at ${file}; no owned fixture state exists.`);
      return;
    }
    throw error;
  }
  const state = JSON.parse(serializedState) as FixtureState;
  assert.equal(resolve(state.stateFile), file, "BP06 cleanup state must identify this exact state file.");
  assert.match(state.schema, new RegExp(`^${SCHEMA_PREFIX}[a-z0-9_]+$`, "u"));
  assert.match(state.mirrorRoot, new RegExp(`^${tmpdir().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\/${MIRROR_PREFIX}`, "u"));
  assert.equal(state.port, PORT, "BP06 cleanup state must target the approved fixture port.");
  const stateDirectory = dirname(file);
  assert.equal(
    resolve(state.envFile),
    join(stateDirectory, `${STATE_PREFIX}.env`),
    "BP06 cleanup env path must stay beside the exact state file",
  );
  assert.equal(
    resolve(state.credentialFile),
    join(stateDirectory, `${STATE_PREFIX}.credentials.json`),
    "BP06 cleanup credential path must stay beside the exact state file",
  );
  const rawDatabaseUrl = readDisposableDatabaseUrl();
  const identity = connectionIdentity(rawDatabaseUrl);
  const isolated = connectionIdentity(state.databaseUrl);
  assert.ok(sameDatabase(identity, isolated), "BP06 cleanup state must point at the validated disposable database.");
  const client = new Client({ connectionString: rawDatabaseUrl });
  await client.connect();
  try {
    await dropLocalSchema(client, state.schema);
  } finally {
    await client.end();
  }
  // State and private paths are ownership evidence until the exact schema
  // drop and database connection close both succeed. Any removal failure
  // below propagates and leaves the state file for a subsequent exact retry.
  await rm(state.mirrorRoot, { recursive: true, force: true });
  await rm(state.credentialFile, { force: true });
  await rm(state.envFile, { force: true });
  await rm(file, { force: true });
  console.log(`BP06 browser fixture cleaned: ${state.schema}`);
}

async function assertFixtureIsolation(state: FixtureState) {
  const client = new Client({ connectionString: state.databaseUrl });
  await client.connect();
  try {
    const definitions = await client.query<{ source: string; definition: string }>(
      `SELECT format('default:%s.%s', class.relname, attribute.attname) AS source,
              pg_get_expr(default_row.adbin, default_row.adrelid) AS definition
         FROM pg_attrdef default_row
         JOIN pg_class class ON class.oid = default_row.adrelid
         JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
         JOIN pg_attribute attribute
           ON attribute.attrelid = default_row.adrelid AND attribute.attnum = default_row.adnum
        WHERE namespace.nspname = $1
       UNION ALL
       SELECT format('constraint:%s.%s', source.relname, constraint_row.conname) AS source,
              pg_get_constraintdef(constraint_row.oid, true) AS definition
         FROM pg_constraint constraint_row
         JOIN pg_class source ON source.oid = constraint_row.conrelid
         JOIN pg_namespace namespace ON namespace.oid = source.relnamespace
        WHERE namespace.nspname = $1
       UNION ALL
       SELECT format('index:%s', index_class.relname) AS source,
              pg_get_indexdef(index_class.oid) AS definition
         FROM pg_index index_row
         JOIN pg_class index_class ON index_class.oid = index_row.indexrelid
         JOIN pg_class table_class ON table_class.oid = index_row.indrelid
         JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = $1`,
      [state.schema],
    );
    const publicDefinitions = definitions.rows.filter(({ definition }) => /public\./iu.test(definition));
    assert.deepEqual(
      publicDefinitions,
      [],
      `BP06 fixture definitions must not reference public schema: ${JSON.stringify(publicDefinitions)}`,
    );

    const publicDependencies = await client.query<{
      dependentName: string;
      referencedName: string;
      referencedKind: string;
    }>(
      `SELECT dependent_class.relname AS "dependentName",
              COALESCE(referenced_class.relname, referenced_type.typname, referenced_namespace.nspname) AS "referencedName",
              CASE
                WHEN referenced_class.oid IS NOT NULL THEN 'relation'
                WHEN referenced_type.oid IS NOT NULL THEN 'type'
                ELSE 'namespace'
              END AS "referencedKind"
         FROM pg_depend dependency
         JOIN pg_class dependent_class
           ON dependency.classid = 'pg_class'::regclass AND dependent_class.oid = dependency.objid
         JOIN pg_namespace dependent_namespace ON dependent_namespace.oid = dependent_class.relnamespace
         LEFT JOIN pg_class referenced_class
           ON dependency.refclassid = 'pg_class'::regclass AND referenced_class.oid = dependency.refobjid
         LEFT JOIN pg_namespace referenced_class_namespace ON referenced_class_namespace.oid = referenced_class.relnamespace
         LEFT JOIN pg_type referenced_type
           ON dependency.refclassid = 'pg_type'::regclass AND referenced_type.oid = dependency.refobjid
         LEFT JOIN pg_namespace referenced_type_namespace ON referenced_type_namespace.oid = referenced_type.typnamespace
         LEFT JOIN pg_namespace referenced_namespace
           ON dependency.refclassid = 'pg_namespace'::regclass AND referenced_namespace.oid = dependency.refobjid
        WHERE dependent_namespace.nspname = $1
          AND COALESCE(
            referenced_class_namespace.nspname,
            referenced_type_namespace.nspname,
            referenced_namespace.nspname
          ) = 'public'`,
      [state.schema],
    );
    assert.deepEqual(
      publicDependencies.rows,
      [],
      `BP06 fixture catalog dependencies must not point to public schema: ${JSON.stringify(publicDependencies.rows)}`,
    );

    const publicColumnTypes = await client.query<{ tableName: string; columnName: string; typeName: string }>(
      `SELECT class.relname AS "tableName", attribute.attname AS "columnName", type.typname AS "typeName"
         FROM pg_attribute attribute
         JOIN pg_class class ON class.oid = attribute.attrelid
         JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
         JOIN pg_type type ON type.oid = attribute.atttypid
         JOIN pg_namespace type_namespace ON type_namespace.oid = type.typnamespace
        WHERE namespace.nspname = $1
          AND type_namespace.nspname = 'public'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped`,
      [state.schema],
    );
    assert.deepEqual(
      publicColumnTypes.rows,
      [],
      `BP06 fixture columns must not use public user-defined types: ${JSON.stringify(publicColumnTypes.rows)}`,
    );

    const foreignKeys = await client.query<{ tableName: string; constraintName: string; targetSchema: string }>(
      `SELECT source.relname AS "tableName", constraint_row.conname AS "constraintName",
              target_namespace.nspname AS "targetSchema"
         FROM pg_constraint constraint_row
         JOIN pg_class source ON source.oid = constraint_row.conrelid
         JOIN pg_namespace source_namespace ON source_namespace.oid = source.relnamespace
         JOIN pg_class target ON target.oid = constraint_row.confrelid
         JOIN pg_namespace target_namespace ON target_namespace.oid = target.relnamespace
        WHERE source_namespace.nspname = $1
          AND constraint_row.contype = 'f'
          AND target_namespace.nspname <> $1`,
      [state.schema],
    );
    assert.deepEqual(
      foreignKeys.rows,
      [],
      `BP06 fixture foreign keys must stay inside the local schema: ${JSON.stringify(foreignKeys.rows)}`,
    );

    console.log(`BP06 fixture smoke isolation PASS: ${state.schema}`);
  } finally {
    await client.end();
  }
}

async function runFixtureSmoke() {
  // This deliberately exercises the exact production setup/cleanup functions;
  // it never starts Next or ego-browser and leaves no disposable state.
  try {
    await setup();
    const state = JSON.parse(await readFile(statePath(), "utf8")) as FixtureState;
    await assertFixtureIsolation(state);
  } finally {
    await cleanup();
  }
  await assert.rejects(
    lstat(statePath()),
    (error: unknown) => hasErrnoCode(error, "ENOENT"),
    "BP06 fixture smoke must remove its exact state file",
  );
  console.log("BP06 fixture smoke cleanup PASS: no state remains");
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function waitForChildExit(child: ChildProcess, timeoutMilliseconds: number) {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolveExit) => {
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolveExit();
    }, timeoutMilliseconds);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit();
    };
    child.once("exit", onExit);
  });
}

async function stopOwnedChild(child: ChildProcess | null, label: string) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await waitForChildExit(child, 8_000);
  if (child.exitCode === null) {
    console.error(`BP06 ${label} did not stop after SIGTERM; sending SIGKILL to the owned child`);
    child.kill("SIGKILL");
    await waitForChildExit(child, 3_000);
  }
}

function captureChildOutput(child: ChildProcess) {
  const lines: string[] = [];
  const capture = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/u)) {
      if (!line) continue;
      lines.push(line);
      if (lines.length > 80) lines.shift();
    }
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  return lines;
}

async function waitForNextReady(child: ChildProcess, output: string[]) {
  const url = routeUrl(PORT, "/login");
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next child exited before readiness (code ${child.exitCode}). Tail: ${output.slice(-12).join(" | ")}`);
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // The listener is not ready yet; bounded polling is intentional.
    }
    await sleep(500);
  }
  throw new Error(`Next child did not become ready within 90s. Tail: ${output.slice(-12).join(" | ")}`);
}

function browserVerificationScript() {
  return String.raw`
(async () => {
  const { readFile } = await import("node:fs/promises");
  const baseUrl = process.env.BP06_BROWSER_BASE_URL || "http://127.0.0.1:5146";
  const credentialPath = process.env.BP06_BROWSER_CREDENTIAL_FILE;
  if (!credentialPath) throw new Error("BP06 browser credential path is missing from the private child environment.");
  const credentials = JSON.parse(await readFile(credentialPath, "utf8"));
  const published = {
    beranda: "11111111-1111-4111-8111-111111111111",
    materi: "22222222-2222-4222-8222-222222222222",
    kuis: "33333333-3333-4333-8333-333333333333",
    tryout: "44444444-4444-4444-8444-444444444444",
  };
  const drafts = {
    beranda: "55555555-5555-4555-8555-555555555555",
    materi: "66666666-6666-4666-8666-666666666666",
    kuis: "77777777-7777-4777-8777-777777777777",
    tryout: "88888888-8888-4888-8888-888888888888",
  };
  const labels = { beranda: "Beranda", materi: "Materi", kuis: "Kuis", tryout: "Tryout" };
  const routes = { beranda: "/dashboard", materi: "/courses", kuis: "/quiz", tryout: "/tryout" };
  const passed = [];
  const failed = [];
  const notRun = [];
  let task = null;
  let opened = false;

  function errorText(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function fail(message) {
    throw new Error(message);
  }

  async function check(name, action) {
    try {
      const detail = await action();
      passed.push({ name, detail: detail || null });
      cliLog("BP06_BROWSER_PASS " + name + (detail ? " " + JSON.stringify(detail) : ""));
    } catch (error) {
      const message = errorText(error).replaceAll(/password|credential/giu, "redacted");
      failed.push({ name, message });
      cliLog("BP06_BROWSER_FAIL " + name + " " + message);
    }
  }

  async function go(path) {
    const url = baseUrl + path;
    if (!opened) {
      await openOrReuseTab(url, { wait: true, timeout: 30 });
      opened = true;
    } else {
      await gotoAndWait(url, { timeout: 30 });
    }
    await wait(1);
    return pageInfo();
  }

  async function text() {
    return String(await snapshotText());
  }

  async function login(email, password, expectedPath) {
    await go("/login");
    await fillInput("#login-email", email);
    await fillInput("#login-password", password);
    await click("button[type=submit]");
    await wait(3);
    const info = await pageInfo();
    if (!String(info.url).includes(expectedPath)) fail("login redirect was " + info.url);
    return info;
  }

  async function logout(expectedNotice) {
    await click('button[aria-label="Menu akun"]');
    await click('[role="menuitem"]:has-text("Keluar")');
    await click('[role="alertdialog"] button[type="submit"]');
    await wait(3);
    const info = await pageInfo();
    if (!String(info.url).includes("/login")) fail("logout did not return to /login: " + info.url);
    if (expectedNotice && !String(info.url).includes(expectedNotice)) fail("logout notice missing: " + info.url);
  }

  async function responsiveCheck(width) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 900,
      mobile: false,
      width,
    });
    await wait(0.5);
    const metrics = await js("(() => ({ height: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth }))()");
    if (!metrics || metrics.width !== width) fail("viewport width was not applied: " + JSON.stringify(metrics));
    if (metrics.scrollWidth > metrics.width + 2) fail("horizontal overflow at " + width + ": " + JSON.stringify(metrics));
    return metrics;
  }

  async function imageGet(path) {
    const result = await js("(async () => { const response = await fetch(" + JSON.stringify(path) + ", { cache: \"no-store\", redirect: \"manual\" }); return { status: response.status, type: response.headers.get(\"content-type\") }; })()");
    if (!result || result.status !== 200 || !String(result.type || "").startsWith("image/")) {
      fail("image GET did not return an image: " + JSON.stringify(result));
    }
    return result;
  }

  async function addAndSaveDraft(textValue) {
    await fillInput("#destination-desktop-layer-text", textValue);
    await click('button[aria-label^="Simpan draf"]');
    await wait(3);
    const body = await text();
    if (!body.includes("Draf banner tujuan tersimpan.")) fail("draft save confirmation was not rendered");
  }

  try {
    task = await useOrCreateTaskSpace("BP06 isolated browser verification");

    await check("login-page-real-route", async () => {
      const info = await go("/login");
      const body = await text();
      if (!String(info.url).includes("/login") || !body.includes("Masuk ke Vecalss")) fail("login page did not render");
      return { url: info.url };
    });

    await check("admin-login-cookie-and-redirect", async () => {
      const info = await login(credentials.adminEmail, credentials.adminPassword, "/admin");
      return { url: info.url };
    });

    await check("admin-preview-published-and-draft-four-destinations", async () => {
      const details = [];
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        const suffix = destination === "beranda" ? "" : "/" + (destination === "materi" ? "courses" : destination);
        const publishedInfo = await go("/admin/student-preview" + suffix);
        const publishedBody = await text();
        if (!String(publishedInfo.url).includes("/admin/student-preview") || !publishedBody.includes("Preview subject")) fail("published preview failed for " + destination);
        const draftInfo = await go("/admin/student-preview" + suffix + "?bannerSource=draft&revision=" + drafts[destination]);
        const draftBody = await text();
        if (!String(draftInfo.url).includes("bannerSource=draft") || !draftBody.includes("Preview subject")) fail("draft preview failed for " + destination);
        details.push(destination);
      }
      return { destinations: details };
    });

    await check("admin-image-get-families", async () => {
      await go("/admin/student-preview");
      const adminPublished = await imageGet("/api/admin/student-banners/beranda/published/" + published.beranda + "/background");
      const adminDraft = await imageGet("/api/admin/student-banners/beranda/draft/" + drafts.beranda + "/background");
      return { adminPublished, adminDraft };
    });

    await check("admin-editor-four-destinations-controls-headings", async () => {
      const details = [];
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        await go("/admin/student-banners?destination=" + destination);
        const body = await text();
        if (!body.includes("Banner maker") || !body.includes(labels[destination]) || !body.includes("Layer") || !body.includes("Edit banner")) fail("editor headings missing for " + destination);
        const controls = await js("(() => ({ addText: Boolean(document.querySelector('button[aria-label=\"Tambahkan teks\"]')), save: Boolean(document.querySelector('button[aria-label^=\"Simpan draf\"]')), publish: Boolean(document.querySelector('button[aria-label^=\"Terbitkan\"]')) }))()");
        if (!controls.addText || !controls.save || !controls.publish) fail("editor controls missing for " + destination);
        details.push(destination);
      }
      return { destinations: details };
    });

    await check("admin-responsive-desktop-320-360-390-keyboard", async () => {
      await go("/admin/student-banners?destination=beranda");
      const viewports = {};
      for (const width of [1280, 320, 360, 390]) viewports[width] = await responsiveCheck(width);
      await pressKey("Tab");
      const active = await js("(() => ({ id: document.activeElement && document.activeElement.id, tag: document.activeElement && document.activeElement.tagName }))()");
      if (!active || !active.tag) fail("Tab did not leave an active element");
      await responsiveCheck(1280);
      return { viewports, active };
    });

    await check("admin-dirty-switch-recovery-dialog", async () => {
      await go("/admin/student-banners?destination=beranda");
      await click('button[aria-label="Tambahkan teks"]');
      await click("#banner-destination");
      await click('[role="option"]:has-text("Materi")');
      const dialog = await js("(() => Boolean(document.querySelector('[data-testid=\"banner-destination-switch\"]')))");
      if (!dialog) fail("dirty destination switch dialog did not open");
      await click('[data-testid="banner-destination-switch"] button:has-text("Batal")');
      return { dialog: true };
    });

    await check("admin-save-publish-subsequent-draft-long-personalization-and-tall-short", async () => {
      await go("/admin/student-banners?destination=beranda");
      const longText = "BP06 {firstName} " + "x".repeat(150);
      await addAndSaveDraft(longText);
      const draftLink = await js("(() => { const node = document.querySelector('a[aria-label^=\"Pratinjau draf\"]'); return node ? node.getAttribute('href') : null; })()");
      if (!draftLink || !draftLink.includes("bannerSource=draft")) fail("saved draft preview link missing");
      await click('button[aria-label^="Terbitkan"]');
      await click('button:has-text("Terbitkan Beranda")');
      await wait(3);
      const afterPublish = await text();
      if (!afterPublish.includes("Banner tujuan diterbitkan.")) fail("publish confirmation was not rendered");
      await fillInput("#destination-desktop-banner-frame-height", "160");
      await pressKey("Tab");
      await fillInput("#destination-desktop-banner-frame-height", "1200");
      await pressKey("Tab");
      await addAndSaveDraft("BP06 {firstName} subsequent draft {targetMajor} {targetUniversity}");
      return { draftLink, longTextLength: longText.length, frameHeights: [160, 1200] };
    });

    await check("admin-stale-conflict-two-tabs", async () => {
      const first = await openOrReuseTab(baseUrl + "/admin/student-banners?destination=kuis&bp06tab=one", { wait: true, timeout: 30 });
      await wait(2);
      const firstTabs = await listTabs();
      const firstTab = firstTabs.find((tab) => String(tab.url || "").includes("bp06tab=one"));
      const second = await openOrReuseTab(baseUrl + "/admin/student-banners?destination=kuis&bp06tab=two", { wait: true, timeout: 30 });
      await wait(2);
      const secondTabs = await listTabs();
      const secondTab = secondTabs.find((tab) => String(tab.url || "").includes("bp06tab=two"));
      const firstId = firstTab && (firstTab.id || firstTab.tabId);
      const secondId = secondTab && (secondTab.id || secondTab.tabId);
      if (!firstId || !secondId) fail("two browser tabs were not addressable");
      await switchTab(firstId);
      await addAndSaveDraft("BP06 conflict winner {firstName}");
      await switchTab(secondId);
      await addAndSaveDraft("BP06 conflict stale {firstName}");
      const body = await text();
      if (!body.includes("Desain berubah di tab lain")) fail("stale conflict message missing");
      await closeTab(firstId);
      await closeTab(secondId);
      return { first: firstId, second: secondId };
    });

    notRun.push({ name: "recovery-correction", reason: "The retained browser fixture intentionally seeds valid v2 designs for all four fixed revisions; no malformed/legacy-only destination was introduced during this run." });

    await logout("signed-out");
    await check("voyager-login-cookie-and-redirect", async () => {
      const info = await login(credentials.voyagerEmail, credentials.voyagerPassword, "/dashboard");
      return { url: info.url };
    });

    await check("voyager-dashboard-courses-quiz-tryout", async () => {
      const details = [];
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        const info = await go(routes[destination]);
        const body = await text();
        if (String(info.url).includes("/login") || body.includes("Application error")) fail("Voyager route failed for " + destination);
        details.push({ destination, url: info.url });
      }
      return { routes: details };
    });

    await check("voyager-published-image-family-and-draft-invisibility", async () => {
      await go("/dashboard");
      const body = await text();
      if (body.includes("draft") || body.includes(drafts.beranda)) fail("draft data was visible to Voyager");
      const publicImage = await imageGet("/api/student-banners/beranda/" + published.beranda + "/background");
      return { publicImage };
    });

    await check("voyager-image-failure-fallback", async () => {
      await go("/dashboard");
      const changed = await js("(() => { const image = document.querySelector('[role=\"img\"] img'); if (!image) return false; image.src = '/bp06-missing-image.png'; return true; })()");
      if (!changed) fail("published banner image was not present for failure simulation");
      await wait(2);
      const fallback = await js("(() => Boolean(document.querySelector('[role=\"img\"] h2')))");
      if (!fallback) fail("banner fallback did not appear after image failure");
      return { fallback: true };
    });

    await logout("signed-out");
  } finally {
    if (task) {
      await completeTaskSpace(task.id, { keep: false });
    }
  }

  cliLog("BP06_BROWSER_SUMMARY " + JSON.stringify({ failed, notRun, passed }));
  if (failed.length > 0 || notRun.length > 0) process.exitCode = 1;
})().catch((error) => {
  cliLog("BP06_BROWSER_FATAL " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
`;
}

async function runBrowserSupervisor() {
  await setup();
  const state = JSON.parse(await readFile(statePath(), "utf8")) as FixtureState;
  const fixtureEnv = parseDotenv(await readFile(state.envFile, "utf8"));
  const { NODE_OPTIONS: _nodeOptions, ...inheritedEnv } = process.env;
  const childEnv = {
    ...inheritedEnv,
    ...fixtureEnv,
    BP06_BROWSER_BASE_URL: routeUrl(PORT, "/").replace(/\/$/u, ""),
    BP06_BROWSER_CREDENTIAL_FILE: state.credentialFile,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const nextBin = join(state.mirrorRoot, "node_modules", "next", "dist", "bin", "next");
  let nextChild: ChildProcess | null = null;
  let browserChild: ChildProcess | null = null;
  try {
    nextChild = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(PORT)], {
      cwd: state.mirrorRoot,
      env: childEnv,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const nextOutput = captureChildOutput(nextChild);
    await waitForNextReady(nextChild, nextOutput);
    console.log(`BP06 supervised Next child ready on ${routeUrl(PORT, "/")}`);
    browserChild = spawn("ego-browser", ["nodejs"], {
      cwd: state.mirrorRoot,
      env: childEnv,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const browserOutput = captureChildOutput(browserChild);
    browserChild.stdin?.end(browserVerificationScript());
    await waitForChildExit(browserChild, 180_000);
    if (browserChild.exitCode === null) {
      throw new Error("ego-browser child exceeded the bounded 180s verification window");
    }
    if (browserChild.exitCode !== 0) {
      throw new Error(`ego-browser verification exited ${browserChild.exitCode}. Tail: ${browserOutput.slice(-20).join(" | ")}`);
    }
  } finally {
    await stopOwnedChild(browserChild, "ego-browser child");
    await stopOwnedChild(nextChild, "Next child");
  }
}

const mode = process.argv.find((value) => ["setup", "cleanup", "smoke", "browser-supervisor"].includes(value)) ?? "setup";
if (mode === "setup") await setup();
else if (mode === "cleanup") await cleanup();
else if (mode === "smoke") await runFixtureSmoke();
else if (mode === "browser-supervisor") await runBrowserSupervisor();
else throw new Error(`Unknown BP06 browser fixture mode: ${mode}`);

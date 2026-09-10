import "dotenv/config";

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
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
const RECOVERY_DESTINATION = "tryout" as const;
const RECOVERY_TITLE_PREFIX = "BP06 legacy over-limit ";
const RECOVERY_TITLE = `${RECOVERY_TITLE_PREFIX}${"L".repeat(181 - RECOVERY_TITLE_PREFIX.length)}`;
const RECOVERY_CONFLICT_TITLE_PREFIX = "BP06 source changed ";
const RECOVERY_CONFLICT_TITLE = `${RECOVERY_CONFLICT_TITLE_PREFIX}${"C".repeat(181 - RECOVERY_CONFLICT_TITLE_PREFIX.length)}`;
const RECOVERY_DESCRIPTION = "BP06 legacy description {firstName} {targetMajor} {targetUniversity}";

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
  transitionRequestFile: string;
  transitionResponseFile: string;
  databaseUrl: string;
  draftRevisions: Record<BannerDestination, string>;
};

type BrowserPrivatePaths = Pick<
  FixtureState,
  "credentialFile" | "stateFile" | "transitionRequestFile" | "transitionResponseFile"
>;

type BrowserTransitionOperation = "prepare-recovery" | "source-conflict" | "restore-recovery";

type BrowserTransitionMessage = {
  operation: BrowserTransitionOperation;
  nonce: string;
};

type BrowserTransitionResponse = {
  completedAt: string;
  nonce: string;
  ok: boolean;
  operation: BrowserTransitionOperation;
  provenance?: string;
  error?: string;
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

type ForeignKeyTargetRow = {
  constraintName: string;
  targetSchemaName: string;
  targetTableName: string;
  targetColumns: string[];
  targetAttnums: number[];
  sourceConstraintNames: string[];
  sourceIndexNames: string[];
  sourceStandaloneIndexNames: string[];
  localTableExists: boolean;
  matchingConstraintNames: string[];
  matchingIndexNames: string[];
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

function expectedBrowserPrivatePaths(stateFile: string): BrowserPrivatePaths {
  const state = resolve(stateFile);
  const stateDirectory = dirname(state);
  return {
    credentialFile: join(stateDirectory, `${STATE_PREFIX}.credentials.json`),
    stateFile: state,
    transitionRequestFile: join(stateDirectory, `${STATE_PREFIX}.transition-request.json`),
    transitionResponseFile: join(stateDirectory, `${STATE_PREFIX}.transition-response.json`),
  };
}

async function assertPrivateRegularFile(file: string, label: string, ownerUid: number) {
  const entry = await lstat(file);
  assert.ok(entry.isFile() && !entry.isSymbolicLink(), `BP06 ${label} must be a regular non-symlink file`);
  assert.equal(entry.mode & 0o777, 0o600, `BP06 ${label} must be mode 0600`);
  assert.equal(entry.uid, ownerUid, `BP06 ${label} must be owned by the launching user`);
}

async function assertBrowserPrivatePaths(state: FixtureState): Promise<BrowserPrivatePaths> {
  const expected = expectedBrowserPrivatePaths(state.stateFile);
  const actual: BrowserPrivatePaths = {
    credentialFile: resolve(state.credentialFile),
    stateFile: resolve(state.stateFile),
    transitionRequestFile: resolve(state.transitionRequestFile),
    transitionResponseFile: resolve(state.transitionResponseFile),
  };
  for (const key of Object.keys(expected) as (keyof BrowserPrivatePaths)[]) {
    assert.equal(actual[key], expected[key], `BP06 ${key} must stay beside the exact state file`);
  }
  const getUid = process.getuid;
  if (typeof getUid !== "function") throw new Error("BP06 private-file ownership cannot be verified on this runtime");
  const ownerUid = getUid();
  await assertPrivateRegularFile(actual.stateFile, "state file", ownerUid);
  await assertPrivateRegularFile(actual.credentialFile, "credential file", ownerUid);
  for (const [path, label] of [
    [actual.transitionRequestFile, "transition request file"],
    [actual.transitionResponseFile, "transition response file"],
    [`${actual.transitionRequestFile}.tmp`, "transition request temp file"],
    [`${actual.transitionResponseFile}.tmp`, "transition response temp file"],
  ] as const) {
    try {
      await assertPrivateRegularFile(path, label, ownerUid);
    } catch (error) {
      if (!hasErrnoCode(error, "ENOENT")) throw error;
    }
  }
  return actual;
}

async function writePrivateJson(file: string, value: unknown) {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
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
  // Reconstructed DDL contains deparsed unqualified enum casts/operators.
  // Resolve them only against the fixture schema and pg_catalog; never fall
  // back to public while cloning the topology.
  await client.query(`SET search_path TO ${quotedSchema}, pg_catalog`);
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
  await cloneLocalUniqueIndexes(client, schema, enumNames, sequenceNames);
  await cloneLocalConstraints(client, schema, enumNames, sequenceNames);
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

async function cloneLocalConstraints(client: pg.Client, schema: string, enumNames: string[], sequenceNames: Set<string>) {
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
    const definition = rewriteCatalogExpression(row.definition, schema, enumNames, sequenceNames);
    await client.query(
      `ALTER TABLE ${quotedSchema}.${quoteIdentifier(row.tableName)} ADD CONSTRAINT ${quoteIdentifier(row.constraintName)} ${definition}`,
    );
  }
  // PostgreSQL validates every foreign-key target against the local
  // pg_constraint/pg_index topology at ADD CONSTRAINT time. Check the exact
  // ordered key, relation, uniqueness and index validity first so a missing
  // replay is reported with bounded, non-secret diagnostics rather than as an
  // opaque 42830 from whichever FK happens to be visited first. This covers
  // every source FK, including keys backed by standalone unique indexes and
  // keys backed by UNIQUE/PRIMARY KEY constraints.
  await assertLocalForeignKeyTargets(client, schema);
  for (const row of constraints.rows.filter(({ constraintType }) => constraintType === "f")) {
    assert.ok(row.referencedTableName);
    const definition = rewriteCatalogExpression(row.definition, schema, enumNames, sequenceNames)
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

async function assertLocalForeignKeyTargets(client: pg.Client, schema: string) {
  const result = await client.query<ForeignKeyTargetRow>(
    `WITH expected AS (
       SELECT foreign_key.oid AS "foreignKeyOid",
              foreign_key.conname AS "constraintName",
              target_namespace.nspname AS "targetSchemaName",
              target.oid AS "targetOid",
              target.relname AS "targetTableName",
              array_agg(target_attribute.attname ORDER BY key_part.key_position)::text[] AS "targetColumns",
              array_agg(target_attribute.attnum::int ORDER BY key_part.key_position)::int[] AS "targetAttnums"
         FROM pg_constraint foreign_key
         JOIN pg_class source ON source.oid = foreign_key.conrelid
         JOIN pg_namespace source_namespace ON source_namespace.oid = source.relnamespace
         JOIN pg_class target ON target.oid = foreign_key.confrelid
         JOIN pg_namespace target_namespace ON target_namespace.oid = target.relnamespace
         CROSS JOIN LATERAL unnest(foreign_key.confkey) WITH ORDINALITY
           AS key_part(attnum, key_position)
         JOIN pg_attribute target_attribute
           ON target_attribute.attrelid = target.oid
          AND target_attribute.attnum = key_part.attnum
        WHERE source_namespace.nspname = 'public'
          AND source.relkind IN ('r', 'p')
          AND target.relkind IN ('r', 'p')
          AND foreign_key.contype = 'f'
        GROUP BY foreign_key.oid, foreign_key.conname, target.oid, target_namespace.nspname, target.relname
     )
     SELECT expected."constraintName",
            expected."targetSchemaName",
            expected."targetTableName",
            expected."targetColumns",
            expected."targetAttnums",
            COALESCE(source_constraints.names, ARRAY[]::text[]) AS "sourceConstraintNames",
            COALESCE(source_indexes.names, ARRAY[]::text[]) AS "sourceIndexNames",
            COALESCE(source_standalone_indexes.names, ARRAY[]::text[]) AS "sourceStandaloneIndexNames",
            local_target.oid IS NOT NULL AS "localTableExists",
            COALESCE(matching_constraints.names, ARRAY[]::text[]) AS "matchingConstraintNames",
            COALESCE(matching_indexes.names, ARRAY[]::text[]) AS "matchingIndexNames"
       FROM expected
       LEFT JOIN LATERAL (
         SELECT array_agg(candidate.conname ORDER BY candidate.conname) AS names
           FROM pg_constraint candidate
          WHERE candidate.conrelid = expected."targetOid"
            AND candidate.contype IN ('p', 'u')
            AND candidate.convalidated
            AND ARRAY(
              SELECT key_part.attnum::int
                FROM unnest(candidate.conkey) WITH ORDINALITY
                  AS key_part(attnum, key_position)
               ORDER BY key_part.key_position
            ) = expected."targetAttnums"
       ) source_constraints ON TRUE
       LEFT JOIN LATERAL (
         SELECT array_agg(index_class.relname ORDER BY index_class.relname) AS names
           FROM pg_index candidate
           JOIN pg_class index_class ON index_class.oid = candidate.indexrelid
          WHERE candidate.indrelid = expected."targetOid"
            AND index_class.relkind IN ('i', 'I')
            AND candidate.indisunique
            AND candidate.indisvalid
            AND candidate.indisready
            AND candidate.indpred IS NULL
            AND candidate.indnkeyatts = cardinality(expected."targetAttnums")
            AND ARRAY(
              SELECT key_part.attnum::int
                FROM unnest(candidate.indkey::smallint[]) WITH ORDINALITY
                  AS key_part(attnum, key_position)
               WHERE key_part.key_position <= candidate.indnkeyatts
               ORDER BY key_part.key_position
            ) = expected."targetAttnums"
       ) source_indexes ON TRUE
       LEFT JOIN LATERAL (
         SELECT array_agg(index_class.relname ORDER BY index_class.relname) AS names
           FROM pg_index candidate
           JOIN pg_class index_class ON index_class.oid = candidate.indexrelid
          WHERE candidate.indrelid = expected."targetOid"
            AND index_class.relkind IN ('i', 'I')
            AND candidate.indisunique
            AND candidate.indisvalid
            AND candidate.indisready
            AND candidate.indpred IS NULL
            AND candidate.indnkeyatts = cardinality(expected."targetAttnums")
            AND NOT EXISTS (
              SELECT 1
                FROM pg_constraint owning_constraint
               WHERE owning_constraint.conindid = candidate.indexrelid
                 AND owning_constraint.contype IN ('p', 'u', 'x')
            )
            AND ARRAY(
              SELECT key_part.attnum::int
                FROM unnest(candidate.indkey::smallint[]) WITH ORDINALITY
                  AS key_part(attnum, key_position)
               WHERE key_part.key_position <= candidate.indnkeyatts
               ORDER BY key_part.key_position
            ) = expected."targetAttnums"
       ) source_standalone_indexes ON TRUE
       LEFT JOIN pg_class local_target
         ON local_target.relname = expected."targetTableName"
        AND expected."targetSchemaName" = 'public'
        AND local_target.relkind IN ('r', 'p')
        AND local_target.relnamespace = (
          SELECT local_namespace.oid
            FROM pg_namespace local_namespace
           WHERE local_namespace.nspname = $1
        )
       LEFT JOIN LATERAL (
         SELECT array_agg(candidate.conname ORDER BY candidate.conname) AS names
           FROM pg_constraint candidate
          WHERE candidate.conrelid = local_target.oid
            AND candidate.contype IN ('p', 'u')
            AND candidate.convalidated
            AND ARRAY(
              SELECT key_part.attnum::int
                FROM unnest(candidate.conkey) WITH ORDINALITY
                  AS key_part(attnum, key_position)
               ORDER BY key_part.key_position
            ) = expected."targetAttnums"
       ) matching_constraints ON TRUE
       LEFT JOIN LATERAL (
         SELECT array_agg(index_class.relname ORDER BY index_class.relname) AS names
           FROM pg_index candidate
           JOIN pg_class index_class ON index_class.oid = candidate.indexrelid
          WHERE candidate.indrelid = local_target.oid
            AND candidate.indisunique
            AND candidate.indisvalid
            AND candidate.indisready
            AND candidate.indpred IS NULL
            AND candidate.indnkeyatts = cardinality(expected."targetAttnums")
            AND ARRAY(
              SELECT key_part.attnum::int
                FROM unnest(candidate.indkey::smallint[]) WITH ORDINALITY
                  AS key_part(attnum, key_position)
               WHERE key_part.key_position <= candidate.indnkeyatts
               ORDER BY key_part.key_position
            ) = expected."targetAttnums"
       ) matching_indexes ON TRUE
      ORDER BY expected."targetTableName", expected."constraintName"`,
    [schema],
  );
  const missing = result.rows.filter(({ localTableExists, matchingConstraintNames, matchingIndexNames }) =>
    !localTableExists || (matchingConstraintNames.length === 0 && matchingIndexNames.length === 0));
  if (missing.length === 0) return;

  const boundedDiagnostics = missing.slice(0, 12).map((row) => ({
    constraintName: row.constraintName,
    targetSchemaName: row.targetSchemaName,
    targetTableName: row.targetTableName,
    targetColumns: row.targetColumns,
    sourceConstraintNames: row.sourceConstraintNames.slice(0, 8),
    sourceIndexNames: row.sourceIndexNames.slice(0, 8),
    sourceStandaloneIndexNames: row.sourceStandaloneIndexNames.slice(0, 8),
    localTableExists: row.localTableExists,
    matchingConstraintNames: row.matchingConstraintNames.slice(0, 8),
    matchingIndexNames: row.matchingIndexNames.slice(0, 8),
  }));
  console.error(`BP06 FK target invariant failed for ${missing.length} source FK(s): ${JSON.stringify(boundedDiagnostics)}`);
  assert.fail(`BP06 local FK target invariant failed for ${missing.length} source FK(s); see bounded diagnostics above`);
}

async function cloneLocalUniqueIndexes(client: pg.Client, schema: string, enumNames: string[], sequenceNames: Set<string>) {
  const result = await client.query<UniqueIndexRow>(
    `SELECT index_class.relname AS "indexName",
            pg_get_indexdef(index_class.oid) AS "indexDefinition"
       FROM pg_index index_row
       JOIN pg_class table_class ON table_class.oid = index_row.indrelid
       JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
       JOIN pg_class index_class ON index_class.oid = index_row.indexrelid
      WHERE table_namespace.nspname = 'public'
        AND table_class.relkind IN ('r', 'p')
        AND index_class.relkind IN ('i', 'I')
        AND index_row.indisunique
        AND index_row.indisvalid
        AND index_row.indisready
        AND NOT index_row.indisprimary
        AND NOT EXISTS (
          SELECT 1
            FROM pg_constraint constraint_row
           WHERE constraint_row.conindid = index_row.indexrelid
             AND constraint_row.contype IN ('p', 'u', 'x')
        )
      ORDER BY table_class.relname, index_class.relname`,
  );
  const quotedSchema = quoteIdentifier(schema);
  for (const row of result.rows) {
    const prefix = /^CREATE UNIQUE INDEX\s+(?:"(?:[^"]|"")+"|\S+)\s+ON\s+(ONLY\s+)?/u;
    const sourceDefinition = rewriteCatalogExpression(row.indexDefinition, schema, enumNames, sequenceNames);
    assert.match(sourceDefinition, prefix, `BP06 cannot rewrite unique index ${row.indexName}`);
    const rewritten = sourceDefinition
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

function legacyTextFixture(title = "Legacy {firstName}") {
  return Object.fromEntries(BANNER_DESTINATIONS.map(({ key }) => [key, {
    description: "Legacy fallback untuk {firstName} · {targetMajor} · {targetUniversity}",
    title,
  }]));
}

function recoveryLegacyFixture(title: string) {
  const value = legacyTextFixture();
  value[RECOVERY_DESTINATION] = {
    description: RECOVERY_DESCRIPTION,
    title,
  };
  return value;
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

  await insertConfig(client, schema, {
    configKey: "student.banners",
    configValue: legacyTextFixture(),
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

async function applyBrowserTransition(state: FixtureState, operation: BrowserTransitionOperation) {
  const rawDatabaseUrl = readDisposableDatabaseUrl();
  assert.ok(
    sameDatabase(connectionIdentity(rawDatabaseUrl), connectionIdentity(state.databaseUrl)),
    "BP06 browser transition must target the exact validated disposable database",
  );
  const destinationDefinition = BANNER_DESTINATIONS.find(({ key }) => key === RECOVERY_DESTINATION);
  assert.ok(destinationDefinition, "BP06 recovery destination definition is missing");
  const schemaName = quoteIdentifier(state.schema);
  const client = new Client({ connectionString: state.databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const destination = await client.query<{ id: string; configValue: unknown }>(
      `SELECT id, config_value AS "configValue"
         FROM ${schemaName}."system_configs"
        WHERE config_key = $1
        FOR UPDATE`,
      [destinationDefinition.configKey],
    );
    assert.equal(destination.rowCount, 1, "BP06 recovery transition requires the seeded tryout config row");
    const destinationId = destination.rows[0]?.id;
    assert.ok(destinationId, "BP06 recovery transition tryout config id is missing");
    const legacy = await client.query<{ id: string; configValue: unknown }>(
      `SELECT id, config_value AS "configValue"
         FROM ${schemaName}."system_configs"
        WHERE config_key = $1
        FOR UPDATE`,
      ["student.banners"],
    );
    assert.equal(legacy.rowCount, 1, "BP06 recovery transition requires the seeded legacy text row");
    const legacyId = legacy.rows[0]?.id;
    assert.ok(legacyId, "BP06 recovery transition legacy text config id is missing");

    if (operation === "prepare-recovery") {
      const destinationUpdate = await client.query(
        `UPDATE ${schemaName}."system_configs"
            SET config_value = $1::jsonb,
                draft_value = NULL,
                draft_updated_at = NULL,
                updated_at = NOW()
          WHERE id = $2::uuid`,
        [JSON.stringify({ design: null, revision: "broken", storageVersion: 2 }), destinationId],
      );
      assert.equal(destinationUpdate.rowCount, 1, "BP06 recovery transition must update exactly the seeded tryout config row");
      const legacyUpdate = await client.query(
        `UPDATE ${schemaName}."system_configs"
            SET config_value = $1::jsonb,
                updated_at = NOW()
          WHERE id = $2::uuid`,
        [JSON.stringify(recoveryLegacyFixture(RECOVERY_TITLE)), legacyId],
      );
      assert.equal(legacyUpdate.rowCount, 1, "BP06 recovery transition must update exactly the seeded legacy text row");
    } else if (operation === "source-conflict") {
      const legacyUpdate = await client.query(
        `UPDATE ${schemaName}."system_configs"
            SET config_value = $1::jsonb,
                updated_at = NOW()
          WHERE id = $2::uuid`,
        [JSON.stringify(recoveryLegacyFixture(RECOVERY_CONFLICT_TITLE)), legacyId],
      );
      assert.equal(legacyUpdate.rowCount, 1, "BP06 source-conflict transition must update exactly the seeded legacy text row");
    } else {
      const legacyUpdate = await client.query(
        `UPDATE ${schemaName}."system_configs"
            SET config_value = $1::jsonb,
                updated_at = NOW()
          WHERE id = $2::uuid`,
        [JSON.stringify(recoveryLegacyFixture(RECOVERY_TITLE)), legacyId],
      );
      assert.equal(legacyUpdate.rowCount, 1, "BP06 recovery restore transition must update exactly the seeded legacy text row");
    }
    await client.query("COMMIT");
    const provenance = operation === "prepare-recovery"
      ? `schema=${state.schema}; destination=${RECOVERY_DESTINATION}; v2 config invalidated; legacy text title length=${RECOVERY_TITLE.length}`
      : operation === "source-conflict"
        ? `schema=${state.schema}; legacy text source changed after recovery bootstrap; title length=${RECOVERY_CONFLICT_TITLE.length}`
        : `schema=${state.schema}; legacy text source restored to recovery fixture; title length=${RECOVERY_TITLE.length}`;
    console.log(`BP06 browser transition applied: ${operation}; ${provenance}`);
    return provenance;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function superviseBrowserTransitions(state: FixtureState, shouldStop: () => boolean) {
  const expected: BrowserTransitionOperation[] = ["prepare-recovery", "source-conflict", "restore-recovery"];
  let nextExpected = 0;
  const deadline = Date.now() + 210_000;
  await rm(state.transitionRequestFile, { force: true });
  await rm(state.transitionResponseFile, { force: true });
  await rm(`${state.transitionRequestFile}.tmp`, { force: true });
  await rm(`${state.transitionResponseFile}.tmp`, { force: true });
  while (!shouldStop() && Date.now() < deadline) {
    let request: BrowserTransitionMessage | null = null;
    try {
      request = JSON.parse(await readFile(state.transitionRequestFile, "utf8")) as BrowserTransitionMessage;
    } catch (error) {
      if (!hasErrnoCode(error, "ENOENT")) throw error;
    }
    if (request) {
      await rm(state.transitionRequestFile, { force: true });
      const operation = expected[nextExpected];
      let response: BrowserTransitionResponse;
      if (request.operation !== operation) {
        response = {
          completedAt: new Date().toISOString(),
          error: `unexpected transition order; expected ${operation ?? "none"}`,
          nonce: request.nonce,
          ok: false,
          operation: request.operation,
        };
      } else {
        try {
          const provenance = await applyBrowserTransition(state, request.operation);
          response = {
            completedAt: new Date().toISOString(),
            nonce: request.nonce,
            ok: true,
            operation: request.operation,
            provenance,
          };
          nextExpected += 1;
        } catch (error) {
          response = {
            completedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
            nonce: request.nonce,
            ok: false,
            operation: request.operation,
          };
        }
      }
      await writePrivateJson(state.transitionResponseFile, response);
    }
    await sleep(250);
  }
  if (!shouldStop() && nextExpected !== expected.length) {
    throw new Error(`BP06 browser transition supervisor timed out after ${nextExpected}/${expected.length} transitions.`);
  }
  return nextExpected;
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
    const suffix = key === "beranda"
      ? ""
      : key === "materi"
        ? "/courses"
        : key === "kuis"
          ? "/quiz"
          : "/tryout";
    console.log(`Admin preview ${key} published=${routeUrl(state.port, `/admin/student-preview${suffix}`)}`);
    console.log(`Admin preview ${key} draft=${routeUrl(state.port, `/admin/student-preview${suffix}?bannerSource=draft&revision=${draft}`)}`);
    console.log(`revisions ${key}: published=${published} draft=${draft}`);
  }
}

async function writeBrowserDiagnosticArtifact(state: FixtureState, payload: Record<string, unknown>) {
  const diagnosticFile = `${state.stateFile}.diagnostic.json`;
  const record = {
    generatedAt: new Date().toISOString(),
    ...payload,
  };
  await writeFile(diagnosticFile, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(diagnosticFile, 0o600);
  console.error(`BP06 diagnostic artifact retained at ${diagnosticFile}`);
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
  const transitionRequestFile = join(dirname(stateFile), `${STATE_PREFIX}.transition-request.json`);
  const transitionResponseFile = join(dirname(stateFile), `${STATE_PREFIX}.transition-response.json`);
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
    transitionRequestFile,
    transitionResponseFile,
  };
  const fixtureCredentials = {
    adminEmail: ADMIN_EMAIL,
    adminPassword,
    voyagerEmail: VOYAGER_EMAIL,
    voyagerPassword,
  };
  let schemaOwned = false;
  for (const privatePath of [transitionRequestFile, transitionResponseFile, `${transitionRequestFile}.tmp`, `${transitionResponseFile}.tmp`]) {
    await assert.rejects(
      lstat(privatePath),
      (error: unknown) => hasErrnoCode(error, "ENOENT"),
      `BP06 transition path already exists: ${privatePath}; run exact cleanup first.`,
    );
  }
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
    await assertMirrorRouteBoundary(sourceRoot, mirror);
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
      await rm(transitionRequestFile, { force: true });
      await rm(transitionResponseFile, { force: true });
      await rm(`${transitionRequestFile}.tmp`, { force: true });
      await rm(`${transitionResponseFile}.tmp`, { force: true });
    }
    throw error;
  }
}

async function createMirrorAt(root: string, mirrorRoot: string) {
  const skip = new Set([".git", ".next", "node_modules", ".env", ".env.local", "tmp", "output"]);
  const entries = await readdir(root, { withFileTypes: true });
  const routeDirectory = await findRouteDirectory(root, entries);
  for (const entry of entries) {
    if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
    const source = join(root, entry.name);
    const target = join(mirrorRoot, entry.name);
    if (entry.name === routeDirectory || (routeDirectory === "src/app" && entry.name === "src")) {
      // Next route discovery must see a real project-local app tree. The
      // dependency/source symlink mirror is useful for ordinary imports, but
      // a symlinked app root made the dev server answer 404 for /login.
      await copyDirectoryTree(source, target);
    } else if (entry.name === "next.config.ts") {
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

type DirectoryEntry = {
  isDirectory: () => boolean;
  name: string;
};

async function findRouteDirectory(root: string, entries?: DirectoryEntry[]) {
  const rootEntries = entries ?? await readdir(root, { withFileTypes: true });
  if (rootEntries.some((entry) => entry.name === "app" && entry.isDirectory())) return "app";
  const srcEntry = rootEntries.find((entry) => entry.name === "src" && entry.isDirectory());
  if (!srcEntry) return null;
  const srcEntries = await readdir(join(root, "src"), { withFileTypes: true });
  return srcEntries.some((entry) => entry.name === "app" && entry.isDirectory()) ? "src/app" : null;
}

async function copyDirectoryTree(source: string, target: string) {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryTree(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await copyFile(sourcePath, targetPath);
    } else {
      throw new Error(`BP06 route tree contains unsupported non-file entry: ${sourcePath}`);
    }
  }
}

async function assertMirrorRouteBoundary(sourceRoot: string, mirrorRoot: string) {
  const routeDirectory = await findRouteDirectory(sourceRoot);
  assert.ok(routeDirectory, "BP06 source must contain app/ or src/app/ for route discovery");
  if (!routeDirectory) throw new Error("BP06 source must contain app/ or src/app/ for route discovery");
  const requiredRelativeFiles = [
    `${routeDirectory}/globals.css`,
    `${routeDirectory}/layout.tsx`,
    `${routeDirectory}/login/page.tsx`,
    `${routeDirectory}/fonts/Sports World-Regular.ttf`,
  ];
  for (const relativeFile of requiredRelativeFiles) {
    const sourceFile = join(sourceRoot, relativeFile);
    const mirrorFile = join(mirrorRoot, relativeFile);
    const sourceEntry = await lstat(sourceFile);
    assert.ok(sourceEntry.isFile() && !sourceEntry.isSymbolicLink(), `BP06 source route dependency must be a regular file: ${relativeFile}`);
    const mirrorEntry = await lstat(mirrorFile);
    assert.ok(mirrorEntry.isFile() && !mirrorEntry.isSymbolicLink(), `BP06 mirror route dependency must be a real regular file: ${relativeFile}`);
    let parent = dirname(mirrorFile);
    while (parent.startsWith(`${mirrorRoot}/`) && parent !== mirrorRoot) {
      const parentEntry = await lstat(parent);
      assert.ok(parentEntry.isDirectory() && !parentEntry.isSymbolicLink(), `BP06 mirror route dependency parent must be real: ${parent}`);
      parent = dirname(parent);
    }
  }
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
  assert.equal(
    resolve(state.transitionRequestFile),
    join(stateDirectory, `${STATE_PREFIX}.transition-request.json`),
    "BP06 cleanup transition request path must stay beside the exact state file",
  );
  assert.equal(
    resolve(state.transitionResponseFile),
    join(stateDirectory, `${STATE_PREFIX}.transition-response.json`),
    "BP06 cleanup transition response path must stay beside the exact state file",
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
  await rm(state.transitionRequestFile, { force: true });
  await rm(state.transitionResponseFile, { force: true });
  await rm(`${state.transitionRequestFile}.tmp`, { force: true });
  await rm(`${state.transitionResponseFile}.tmp`, { force: true });
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
      `WITH local_dependents AS (
         SELECT 'pg_class'::regclass AS class_id, class.oid AS object_id,
                format('relation:%s', class.relname) AS object_name
           FROM pg_class class
           JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
          WHERE namespace.nspname = $1
         UNION ALL
         SELECT 'pg_constraint'::regclass, constraint_row.oid,
                format('constraint:%s.%s', source.relname, constraint_row.conname)
           FROM pg_constraint constraint_row
           JOIN pg_class source ON source.oid = constraint_row.conrelid
           JOIN pg_namespace namespace ON namespace.oid = source.relnamespace
          WHERE namespace.nspname = $1
         UNION ALL
         SELECT 'pg_type'::regclass, type.oid, format('type:%s', type.typname)
           FROM pg_type type
           JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
          WHERE namespace.nspname = $1
       )
       SELECT local_dependents.object_name AS "dependentName",
              COALESCE(
                referenced_class.relname,
                referenced_type.typname,
                referenced_namespace.nspname,
                referenced_proc.proname,
                referenced_operator.oprname,
                referenced_opclass.opcname,
                referenced_collation.collname
              ) AS "referencedName",
              CASE
                WHEN referenced_class.oid IS NOT NULL THEN 'relation'
                WHEN referenced_type.oid IS NOT NULL THEN 'type'
                WHEN referenced_proc.oid IS NOT NULL THEN 'function'
                WHEN referenced_operator.oid IS NOT NULL THEN 'operator'
                WHEN referenced_opclass.oid IS NOT NULL THEN 'operator class'
                WHEN referenced_collation.oid IS NOT NULL THEN 'collation'
                ELSE 'namespace'
              END AS "referencedKind"
         FROM pg_depend dependency
         JOIN local_dependents
           ON local_dependents.class_id = dependency.classid
          AND local_dependents.object_id = dependency.objid
         LEFT JOIN pg_class referenced_class
           ON dependency.refclassid = 'pg_class'::regclass AND referenced_class.oid = dependency.refobjid
         LEFT JOIN pg_namespace referenced_class_namespace ON referenced_class_namespace.oid = referenced_class.relnamespace
         LEFT JOIN pg_type referenced_type
           ON dependency.refclassid = 'pg_type'::regclass AND referenced_type.oid = dependency.refobjid
         LEFT JOIN pg_namespace referenced_type_namespace ON referenced_type_namespace.oid = referenced_type.typnamespace
         LEFT JOIN pg_namespace referenced_namespace
           ON dependency.refclassid = 'pg_namespace'::regclass AND referenced_namespace.oid = dependency.refobjid
         LEFT JOIN pg_proc referenced_proc
           ON dependency.refclassid = 'pg_proc'::regclass AND referenced_proc.oid = dependency.refobjid
         LEFT JOIN pg_namespace referenced_proc_namespace ON referenced_proc_namespace.oid = referenced_proc.pronamespace
         LEFT JOIN pg_operator referenced_operator
           ON dependency.refclassid = 'pg_operator'::regclass AND referenced_operator.oid = dependency.refobjid
         LEFT JOIN pg_namespace referenced_operator_namespace ON referenced_operator_namespace.oid = referenced_operator.oprnamespace
         LEFT JOIN pg_opclass referenced_opclass
           ON dependency.refclassid = 'pg_opclass'::regclass AND referenced_opclass.oid = dependency.refobjid
         LEFT JOIN pg_namespace referenced_opclass_namespace ON referenced_opclass_namespace.oid = referenced_opclass.opcnamespace
         LEFT JOIN pg_collation referenced_collation
           ON dependency.refclassid = 'pg_collation'::regclass AND referenced_collation.oid = dependency.refobjid
         LEFT JOIN pg_namespace referenced_collation_namespace ON referenced_collation_namespace.oid = referenced_collation.collnamespace
        WHERE COALESCE(
            referenced_class_namespace.nspname,
            referenced_type_namespace.nspname,
            referenced_namespace.nspname,
            referenced_proc_namespace.nspname,
            referenced_operator_namespace.nspname,
            referenced_opclass_namespace.nspname,
            referenced_collation_namespace.nspname
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

function safeDiagnosticText(value: string, limit = 1200) {
  return String(value)
    .replaceAll(/(?:password|credential|secret|token|cookie|authorization|database(?:_url)?|postgres(?:ql)?):?[^\s|,]+/giu, "[redacted]")
    .replaceAll(/(?:postgres(?:ql)?|mysql|redis):\/\/[^\s|,]+/giu, "[redacted-url]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[redacted-email]")
    .slice(0, limit);
}

function safeDiagnosticTail(lines: string[], limit = 12) {
  return lines
    .slice(-limit)
    .map((line) => safeDiagnosticText(line, 600))
    .join(" | ");
}

async function waitForNextReady(child: ChildProcess, output: string[]) {
  const url = routeUrl(PORT, "/login");
  const deadline = Date.now() + 90_000;
  let lastProbe: {
    bodySample?: string;
    contentType?: string | null;
    error?: string;
    location?: string | null;
    markers?: {
      email: boolean;
      heading: boolean;
      password: boolean;
    };
    status: number | null;
  } = { status: null };
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next child exited before readiness (code ${child.exitCode}). Probe: ${JSON.stringify(lastProbe)}. Tail: ${safeDiagnosticTail(output)}`);
    }
    try {
      const response = await fetch(url, { cache: "no-store", redirect: "manual" });
      const body = await response.text();
      const markers = {
        email: body.includes('id="login-email"'),
        heading: body.includes("Masuk ke Vecalss"),
        password: body.includes('id="login-password"'),
      };
      lastProbe = {
        bodySample: safeDiagnosticText(body),
        contentType: response.headers.get("content-type"),
        location: response.headers.get("location"),
        markers,
        status: response.status,
      };
      if (response.status !== 200) {
        throw new Error(`login readiness returned HTTP ${response.status}; expected 200 HTML. Probe: ${JSON.stringify(lastProbe)}. Tail: ${safeDiagnosticTail(output)}`);
      }
      // The host probe proves the server-rendered login shell. The interactive
      // client boundary owns the form controls, so their DOM presence is
      // asserted by the browser case after hydration rather than by this raw
      // response probe.
      if (String(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html") && markers.heading) return;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("login readiness returned HTTP")) throw error;
      lastProbe = {
        ...lastProbe,
        error: safeDiagnosticText(error instanceof Error ? error.message : String(error)),
      };
      // The listener is not ready yet; bounded polling is intentional.
    }
    await sleep(500);
  }
  throw new Error(`Next child did not render the expected login shell within 90s. Probe: ${JSON.stringify(lastProbe)}. Tail: ${safeDiagnosticTail(output)}`);
}

function browserVerificationScript(privatePaths: BrowserPrivatePaths) {
  const serializedPrivatePaths = JSON.stringify(privatePaths);
  return String.raw`
(async () => {
  const { lstat, readFile, rename, rm, writeFile } = await import("node:fs/promises");
  const { randomUUID } = await import("node:crypto");
  const { dirname, join, resolve } = await import("node:path");
  const privatePaths = ${serializedPrivatePaths};
  const baseUrl = "http://127.0.0.1:5146";
  const stateDirectory = dirname(resolve(privatePaths.stateFile));
  const expectedPaths = {
    credentialFile: join(stateDirectory, "${STATE_PREFIX}.credentials.json"),
    stateFile: resolve(privatePaths.stateFile),
    transitionRequestFile: join(stateDirectory, "${STATE_PREFIX}.transition-request.json"),
    transitionResponseFile: join(stateDirectory, "${STATE_PREFIX}.transition-response.json"),
  };
  for (const key of Object.keys(expectedPaths)) {
    if (resolve(privatePaths[key]) !== resolve(expectedPaths[key])) throw new Error("BP06 browser private path layout mismatch: " + key);
  }
  const getUid = process.getuid;
  if (typeof getUid !== "function") throw new Error("BP06 browser private-file ownership cannot be verified in the embedded runtime");
  const ownerUid = getUid();
  function isMissing(error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
  }
  async function assertPrivateFile(file, label, required) {
    let entry;
    try {
      entry = await lstat(file);
    } catch (error) {
      if (!required && isMissing(error)) return;
      throw new Error("BP06 " + label + " is not accessible");
    }
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("BP06 " + label + " must be a regular non-symlink file");
    if ((entry.mode & 0o777) !== 0o600) throw new Error("BP06 " + label + " must be mode 0600");
    if (entry.uid !== ownerUid) throw new Error("BP06 " + label + " must be owned by the launching user");
  }
  await assertPrivateFile(privatePaths.stateFile, "state file", true);
  await assertPrivateFile(privatePaths.credentialFile, "credential file", true);
  await assertPrivateFile(privatePaths.transitionRequestFile, "transition request file", false);
  await assertPrivateFile(privatePaths.transitionResponseFile, "transition response file", false);
  await assertPrivateFile(privatePaths.transitionRequestFile + ".tmp", "transition request temp file", false);
  await assertPrivateFile(privatePaths.transitionResponseFile + ".tmp", "transition response temp file", false);
  let stateMetadata;
  try {
    stateMetadata = JSON.parse(await readFile(privatePaths.stateFile, "utf8"));
  } catch {
    throw new Error("BP06 browser private state file is unreadable");
  }
  for (const key of ["credentialFile", "stateFile", "transitionRequestFile", "transitionResponseFile"]) {
    if (stateMetadata[key] !== privatePaths[key]) throw new Error("BP06 browser private state path mismatch: " + key);
  }
  let credentials;
  try {
    credentials = JSON.parse(await readFile(privatePaths.credentialFile, "utf8"));
  } catch {
    throw new Error("BP06 browser credential file is unreadable");
  }
  const credentialPath = privatePaths.credentialFile;
  const transitionRequestPath = privatePaths.transitionRequestFile;
  const transitionResponsePath = privatePaths.transitionResponseFile;
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
  const livePublishedRevisions = { ...published };
  const liveDraftRevisions = { ...drafts };
  const passed = [];
  const failed = [];
  const skipped = [];
  const notRun = [];
  const outcomes = new Map();
  let task = null;
  let opened = false;

  function errorText(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function fail(message) {
    throw new Error(message);
  }

  async function check(name, action, dependencies = []) {
    const unmet = dependencies.filter((dependency) => outcomes.get(dependency) !== "passed");
    if (unmet.length > 0) {
      const reason = "dependency not passed: " + unmet.join(", ");
      skipped.push({ name, reason });
      outcomes.set(name, "skipped");
      cliLog("BP06_BROWSER_SKIP " + name + " " + reason);
      return false;
    }
    try {
      const detail = await action();
      passed.push({ name, detail: detail || null });
      outcomes.set(name, "passed");
      cliLog("BP06_BROWSER_PASS " + name + (detail ? " " + JSON.stringify(detail) : ""));
      return true;
    } catch (error) {
      const message = errorText(error).replaceAll(/password|credential/giu, "redacted");
      failed.push({ name, message });
      outcomes.set(name, "failed");
      cliLog("BP06_BROWSER_FAIL " + name + " " + message);
      return false;
    }
  }

  async function screenshot(name) {
    const info = await pageInfo();
    await captureScreenshot();
    cliLog("BP06_BROWSER_SCREENSHOT " + JSON.stringify({ name, url: info.url, width: info.w, height: info.h }));
  }

  async function requestTransition(operation) {
    const nonce = randomUUID();
    const temporary = transitionRequestPath + ".tmp";
    await writeFile(temporary, JSON.stringify({ nonce, operation }) + "\n", { encoding: "utf8", mode: 0o600 });
    await rename(temporary, transitionRequestPath);
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        const response = JSON.parse(await readFile(transitionResponsePath, "utf8"));
        if (response.nonce !== nonce) {
          await wait(0.25);
          continue;
        }
        await rm(transitionResponsePath, { force: true });
        if (!response.ok) fail("supervisor transition " + operation + " failed: " + String(response.error || "unknown error"));
        cliLog("BP06_BROWSER_TRANSITION_ACK " + JSON.stringify({ operation, provenance: response.provenance || null }));
        return response;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
      }
      await wait(0.25);
    }
    fail("supervisor transition " + operation + " timed out");
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

  async function waitForLoginForm() {
    const deadline = Date.now() + 30_000;
    let markers = { email: false, form: false, password: false };
    while (Date.now() < deadline) {
      markers = await js("(() => ({ form: Boolean(document.querySelector('form')), email: Boolean(document.querySelector('#login-email')), password: Boolean(document.querySelector('#login-password')) }))()");
      if (markers.form && markers.email && markers.password) return markers;
      await wait(0.25);
    }
    fail("login form controls did not mount in the browser DOM within 30s: " + JSON.stringify(markers));
  }

  function safeDiagnostic(value, limit = 1200) {
    return String(value ?? "")
      .replaceAll(/(?:password|credential|secret|token|cookie|authorization|database(?:_url)?|postgres(?:ql)?):?[^\s|,]+/giu, "[redacted]")
      .replaceAll(/(?:postgres(?:ql)?|mysql|redis):\/\/[^\s|,]+/giu, "[redacted-url]")
      .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[redacted-email]")
      .slice(0, limit);
  }

  async function captureLoginDiagnostics(navigationInfo, snapshot, error) {
    let info = navigationInfo;
    try {
      info = await pageInfo();
    } catch {
      // Preserve the original navigation failure while recording what is available.
    }
    let dom = null;
    try {
      dom = await js("(() => ({ readyState: document.readyState, href: location.href, title: document.title, bodyText: (document.body?.innerText || '').slice(0, 1200), errorText: Array.from(document.querySelectorAll('[role=alert], [data-error]')).map((node) => node.textContent || '').join(' | ').slice(0, 600), formMarkers: { form: Boolean(document.querySelector('form')), email: Boolean(document.querySelector('#login-email')), password: Boolean(document.querySelector('#login-password')) } }))()");
    } catch (domError) {
      dom = { error: safeDiagnostic(domError) };
    }
    let http = null;
    try {
      http = await js("(async () => { const response = await fetch(" + JSON.stringify(baseUrl + "/login") + ", { cache: 'no-store', redirect: 'manual' }); return { status: response.status, contentType: response.headers.get('content-type'), location: response.headers.get('location') }; })()");
    } catch (httpError) {
      http = { error: safeDiagnostic(httpError) };
    }
    let screenshotCaptured = false;
    try {
      await captureScreenshot();
      screenshotCaptured = true;
    } catch {
      // Screenshot availability is diagnostic only and must not mask the assertion.
    }
    cliLog("BP06_BROWSER_DIAGNOSTIC " + JSON.stringify({
      check: "login-page-real-route",
      error: safeDiagnostic(error),
      page: info && {
        url: safeDiagnostic(info.url),
        title: safeDiagnostic(info.title),
        width: info.w,
        height: info.h,
      },
      dom: dom && {
        readyState: safeDiagnostic(dom.readyState),
        href: safeDiagnostic(dom.href),
        title: safeDiagnostic(dom.title),
        bodyText: safeDiagnostic(dom.bodyText),
        errorText: safeDiagnostic(dom.errorText || dom.error),
        formMarkers: dom.formMarkers,
      },
      http: http && {
        status: http.status,
        contentType: safeDiagnostic(http.contentType),
        location: safeDiagnostic(http.location),
        error: safeDiagnostic(http.error),
      },
      snapshot: safeDiagnostic(snapshot),
      screenshotCaptured,
    }));
  }

  function revisionFromDraftLink(link) {
    try {
      return new URL(link, baseUrl).searchParams.get("revision");
    } catch {
      return null;
    }
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

  async function cookieNames() {
    const result = await cdp("Storage.getCookies");
    return Array.isArray(result?.cookies) ? result.cookies.map((cookie) => String(cookie.name || "")) : [];
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

  async function imageGetFailure(path) {
    const result = await js("(async () => { const response = await fetch(" + JSON.stringify(path) + ", { cache: \"no-store\", redirect: \"manual\" }); return { status: response.status, type: response.headers.get(\"content-type\") }; })()");
    if (!result || result.status < 400 || String(result.type || "").startsWith("image/")) {
      fail("missing image did not fail as expected: " + JSON.stringify(result));
    }
    return result;
  }

  async function ensureTextLayer() {
    const hasTextInput = await js("(() => Boolean(document.querySelector('#destination-desktop-layer-text')))()");
    if (!hasTextInput) await click('button[aria-label="Tambahkan teks"]');
    await wait(0.5);
  }

  async function saveDraftObserving(textValue) {
    await ensureTextLayer();
    await fillInput("#destination-desktop-layer-text", textValue);
    await click('button[aria-label^="Simpan draf"]');
    await wait(3);
    return text();
  }

  async function addAndSaveDraft(textValue) {
    const body = await saveDraftObserving(textValue);
    if (!body.includes("Draf banner tujuan tersimpan.")) fail("draft save confirmation was not rendered");
  }

  try {
    task = await useOrCreateTaskSpace("BP06 isolated browser verification");

    await check("login-page-real-route", async () => {
      let info = null;
      let body = "";
      try {
        info = await go("/login");
        body = await text();
        if (!String(info.url).includes("/login") || !body.includes("Masuk ke Vecalss")) fail("login page did not render");
        const formMarkers = await waitForLoginForm();
        return { formMarkers, url: info.url };
      } catch (error) {
        await captureLoginDiagnostics(info, body, error);
        throw error;
      }
    });

    await check("admin-login-cookie-and-redirect", async () => {
      const info = await login(credentials.adminEmail, credentials.adminPassword, "/admin");
      const names = await cookieNames();
      if (!names.includes("vecalss_session")) fail("Admin login did not issue the expected session cookie");
      return { url: info.url };
    }, ["login-page-real-route"]);

    await check("admin-preview-published-and-draft-four-destinations", async () => {
      const details = [];
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        const suffix = destination === "beranda"
          ? ""
          : destination === "materi"
            ? "/courses"
            : destination === "kuis"
              ? "/quiz"
              : "/tryout";
        const publishedInfo = await go("/admin/student-preview" + suffix);
        const publishedBody = await text();
        if (!String(publishedInfo.url).includes("/admin/student-preview") || !publishedBody.includes("Student preview")) fail("published preview failed for " + destination);
        const draftInfo = await go("/admin/student-preview" + suffix + "?bannerSource=draft&revision=" + drafts[destination]);
        const draftBody = await text();
        if (!String(draftInfo.url).includes("bannerSource=draft") || !String(draftInfo.url).includes(drafts[destination]) || !draftBody.includes("Student preview")) fail("draft preview failed for " + destination);
        details.push(destination);
      }
      return { destinations: details };
    }, ["admin-login-cookie-and-redirect"]);

    await check("admin-image-get-families", async () => {
      const details = [];
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        const adminPublished = await imageGet("/api/admin/student-banners/" + destination + "/published/" + published[destination] + "/background");
        const adminDraft = await imageGet("/api/admin/student-banners/" + destination + "/draft/" + drafts[destination] + "/background");
        details.push({ destination, adminPublished, adminDraft });
      }
      return { destinations: details };
    }, ["admin-preview-published-and-draft-four-destinations"]);

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
    }, ["admin-login-cookie-and-redirect"]);

    await check("admin-responsive-desktop-320-360-390-keyboard", async () => {
      await go("/admin/student-banners?destination=beranda");
      const viewports = {};
      for (const width of [1280, 320, 360, 390]) {
        viewports[width] = await responsiveCheck(width);
        await screenshot("admin-editor-width-" + width);
      }
      await pressKey("Tab");
      const active = await js("(() => ({ id: document.activeElement && document.activeElement.id, tag: document.activeElement && document.activeElement.tagName }))()");
      if (!active || !active.tag) fail("Tab did not leave an active element");
      await responsiveCheck(1280);
      return { viewports, active };
    }, ["admin-editor-four-destinations-controls-headings"]);

    await check("admin-dirty-switch-recovery-dialog", async () => {
      await go("/admin/student-banners?destination=materi");
      await click('button[aria-label="Tambahkan teks"]');
      await click("#banner-destination");
      await click('[role="option"]:has-text("Kuis")');
      const dialog = await js("(() => Boolean(document.querySelector('[data-testid=\"banner-destination-switch\"]')))");
      if (!dialog) fail("dirty destination switch dialog did not open");
      await click('[data-testid="banner-destination-switch"] button:has-text("Batal")');
      const afterCancel = await pageInfo();
      if (!String(afterCancel.url).includes("destination=materi")) fail("dirty switch cancel left the current destination");
      await click("#banner-destination");
      await click('[role="option"]:has-text("Kuis")');
      await click('[data-testid="banner-destination-switch"] button:has-text("Buang dan beralih")');
      await wait(2);
      const afterDiscard = await pageInfo();
      if (!String(afterDiscard.url).includes("destination=kuis")) fail("dirty switch discard did not navigate");
      return { cancel: true, discard: true };
    }, ["admin-editor-four-destinations-controls-headings"]);

    await check("admin-publish-dialog-cancel", async () => {
      await go("/admin/student-banners?destination=kuis");
      await click('button[aria-label^="Terbitkan"]');
      const dialog = await js("(() => Boolean(document.querySelector('[data-testid=\"banner-publish-confirmation\"]')))");
      if (!dialog) fail("publish confirmation dialog did not open");
      await click('[data-testid="banner-publish-confirmation"] button:has-text("Batal")');
      const afterCancel = await js("(() => !document.querySelector('[data-testid=\"banner-publish-confirmation\"]'))()");
      if (!afterCancel) fail("publish confirmation dialog did not close on cancel");
      return { dialog: true, cancel: true };
    }, ["admin-dirty-switch-recovery-dialog"]);

    await check("admin-save-publish-subsequent-draft-long-personalization-and-tall-short", async () => {
      const destinations = [];
      const draftLinks = {};
      const isolationTokens = [];
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        await go("/admin/student-banners?destination=" + destination);
        const longText = "BP06 " + destination + " {firstName} " + "x".repeat(150);
        const isolationToken = "BP06-ISOLATION-" + destination;
        isolationTokens.push(isolationToken);
        await addAndSaveDraft(longText + " " + isolationToken);
        const draftLink = await js("(() => { const node = document.querySelector('a[aria-label^=\"Pratinjau draf\"]'); return node ? node.getAttribute('href') : null; })()");
        if (!draftLink || !draftLink.includes("bannerSource=draft")) fail("saved draft preview link missing for " + destination);
        draftLinks[destination] = draftLink;
        const draftRevision = revisionFromDraftLink(draftLink);
        if (draftRevision) liveDraftRevisions[destination] = draftRevision;
        await screenshot("admin-" + destination + "-long-personalization");
        await click('button[aria-label^="Terbitkan"]');
        await click('button:has-text("Terbitkan ' + destination.charAt(0).toUpperCase() + destination.slice(1) + '")');
        await wait(3);
        const afterPublish = await text();
        if (!afterPublish.includes("Banner tujuan diterbitkan.")) fail("publish confirmation was not rendered for " + destination);
        const publishedRevision = await js("(() => document.querySelector('input[name=\"revision\"]')?.value || null)()");
        if (!publishedRevision) fail("published revision was not exposed for " + destination);
        livePublishedRevisions[destination] = publishedRevision;
        await fillInput("#destination-desktop-banner-frame-height", "160");
        await pressKey("Tab");
        await screenshot("admin-" + destination + "-short-160");
        await fillInput("#destination-desktop-banner-frame-height", "1200");
        await pressKey("Tab");
        await screenshot("admin-" + destination + "-tall-1200");
        await addAndSaveDraft("BP06 " + destination + " subsequent draft {firstName} {targetMajor} {targetUniversity}");
        const body = await text();
        if (!body.includes("Draf banner tujuan tersimpan.")) fail("subsequent draft confirmation was not rendered for " + destination);
        const subsequentDraftLink = await js("(() => { const node = document.querySelector('a[aria-label^=\"Pratinjau draf\"]'); return node ? node.getAttribute('href') : null; })()");
        const subsequentDraftRevision = subsequentDraftLink ? revisionFromDraftLink(subsequentDraftLink) : null;
        if (subsequentDraftRevision) liveDraftRevisions[destination] = subsequentDraftRevision;
        for (const otherToken of isolationTokens.filter((token) => !token.endsWith(destination))) {
          if (body.includes(otherToken)) fail("draft text leaked across destinations: " + otherToken);
        }
        destinations.push(destination);
      }
      return { destinations, draftLinks, frameHeights: [160, 1200], longTextLength: 150 };
    }, ["admin-publish-dialog-cancel"]);

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
      const body = await saveDraftObserving("BP06 conflict stale {firstName}");
      if (!body.includes("Desain berubah di tab lain")) fail("stale conflict message missing");
      await closeTab(firstId);
      await closeTab(secondId);
      return { first: firstId, second: secondId };
    }, ["admin-save-publish-subsequent-draft-long-personalization-and-tall-short"]);

    await check("fixture-transition-prepare-recovery", async () => {
      const response = await requestTransition("prepare-recovery");
      return { operation: response.operation, provenance: response.provenance };
    }, ["admin-stale-conflict-two-tabs"]);

    await check("admin-recovery-bootstrap-lossless-correction", async () => {
      await go("/admin/student-banners?destination=tryout");
      const body = await text();
      if (!body.includes("Banner perlu dipulihkan") || !body.includes("Perbaiki starter teks sebelum menyimpan")) fail("recovery panel did not render");
      const initial = await js("(() => ({ title: document.querySelector('#banner-starter-title')?.value || '', description: document.querySelector('#banner-starter-description')?.value || '' }))()");
      if (!initial || initial.title.length !== 181 || !initial.title.startsWith("BP06 legacy over-limit ")) fail("over-limit legacy title was not retained losslessly");
      if (initial.description !== "BP06 legacy description {firstName} {targetMajor} {targetUniversity}") fail("legacy description was not retained losslessly");
      const correctedTitle = "BP06 recovered title {firstName}";
      const correctedDescription = "BP06 recovered description {targetMajor} {targetUniversity}";
      await fillInput("#banner-starter-description", correctedDescription);
      await fillInput("#banner-starter-title", correctedTitle);
      await pressKey("Tab");
      const corrected = await js("(() => ({ correction: Boolean(document.querySelector('[data-testid=\"banner-starter-correction\"]')), editor: Boolean(document.querySelector('button[aria-label=\"Tambahkan teks\"]')) }))()");
      if (!corrected || corrected.correction || !corrected.editor) fail("valid correction did not open the banner editor");
      await screenshot("recovery-correction-canvas");
      return { initialTitleLength: initial.title.length, correctedTitleLength: correctedTitle.length, correctedDescriptionLength: correctedDescription.length };
    }, ["fixture-transition-prepare-recovery"]);

    await check("fixture-transition-source-conflict", async () => {
      const response = await requestTransition("source-conflict");
      return { operation: response.operation, provenance: response.provenance };
    }, ["admin-recovery-bootstrap-lossless-correction"]);

    await check("admin-recovery-source-conflict", async () => {
      const body = await saveDraftObserving("BP06 recovery conflict attempt {firstName}");
      if (!body.includes("Sumber banner berubah sejak pemulihan ini dibuka.")) fail("source conflict was not shown after supervisor source mutation");
      return { conflict: true };
    }, ["fixture-transition-source-conflict"]);

    await check("fixture-transition-restore-recovery", async () => {
      const response = await requestTransition("restore-recovery");
      return { operation: response.operation, provenance: response.provenance };
    }, ["admin-recovery-source-conflict"]);

    await check("admin-recovery-save-publish-subsequent-draft", async () => {
      await go("/admin/student-banners?destination=tryout");
      const body = await text();
      if (!body.includes("Banner perlu dipulihkan")) fail("restored recovery source did not render");
      await click('button:has-text("Gunakan starter teks dan perbaiki")');
      await fillInput("#banner-starter-title", "BP06 recovered final {firstName}");
      await fillInput("#banner-starter-description", "BP06 recovered final {targetMajor} {targetUniversity}");
      await pressKey("Tab");
      await addAndSaveDraft("BP06 tryout recovered subsequent {firstName} {targetMajor} {targetUniversity}");
      const saved = await text();
      if (!saved.includes("Draf banner tujuan tersimpan.")) fail("recovery draft save confirmation was not rendered");
      const recoveryDraftLink = await js("(() => { const node = document.querySelector('a[aria-label^=\"Pratinjau draf\"]'); return node ? node.getAttribute('href') : null; })()");
      const recoveryDraftRevision = recoveryDraftLink ? revisionFromDraftLink(recoveryDraftLink) : null;
      if (!recoveryDraftRevision) fail("recovery draft preview revision was not exposed");
      liveDraftRevisions.tryout = recoveryDraftRevision;
      await click('button[aria-label^="Terbitkan"]');
      await click('button:has-text("Terbitkan Tryout")');
      await wait(3);
      const publishedBody = await text();
      if (!publishedBody.includes("Banner tujuan diterbitkan.")) fail("recovery publish confirmation was not rendered");
      const recoveryPublishedRevision = await js("(() => document.querySelector('input[name=\"revision\"]')?.value || null)()");
      if (!recoveryPublishedRevision) fail("recovery published revision was not exposed");
      livePublishedRevisions.tryout = recoveryPublishedRevision;
      await fillInput("#destination-desktop-banner-frame-height", "160");
      await pressKey("Tab");
      await screenshot("recovery-tryout-short-160");
      await fillInput("#destination-desktop-banner-frame-height", "1200");
      await pressKey("Tab");
      await screenshot("recovery-tryout-tall-1200");
      await addAndSaveDraft("BP06 tryout recovered subsequent draft {firstName} {targetUniversity}");
      const finalRecoveryDraftLink = await js("(() => { const node = document.querySelector('a[aria-label^=\"Pratinjau draf\"]'); return node ? node.getAttribute('href') : null; })()");
      const finalRecoveryDraftRevision = finalRecoveryDraftLink ? revisionFromDraftLink(finalRecoveryDraftLink) : null;
      if (finalRecoveryDraftRevision) liveDraftRevisions.tryout = finalRecoveryDraftRevision;
      return { recovered: true, frameHeights: [160, 1200] };
    }, ["fixture-transition-restore-recovery"]);

    await check("admin-logout-real-session", async () => {
      await logout("signed-out");
      const names = await cookieNames();
      if (names.includes("vecalss_session")) fail("Admin logout left the session cookie present");
      return { signedOut: true, cookieNames: names.filter((name) => name !== "vecalss_session") };
    }, ["admin-recovery-save-publish-subsequent-draft"]);
    await check("voyager-login-cookie-and-redirect", async () => {
      const info = await login(credentials.voyagerEmail, credentials.voyagerPassword, "/dashboard");
      const names = await cookieNames();
      if (!names.includes("vecalss_session")) fail("Voyager login did not issue the expected session cookie");
      return { url: info.url };
    }, ["admin-logout-real-session"]);

    await check("voyager-dashboard-courses-quiz-tryout", async () => {
      const details = [];
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        const info = await go(routes[destination]);
        const body = await text();
        if (String(info.url).includes("/login") || body.includes("Application error")) fail("Voyager route failed for " + destination);
        details.push({ destination, url: info.url });
      }
      return { routes: details };
    }, ["voyager-login-cookie-and-redirect"]);

    await check("voyager-published-image-family-and-draft-invisibility", async () => {
      const details = [];
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        await go(routes[destination]);
        const body = await text();
        if (body.toLowerCase().includes("draft") || body.includes(drafts[destination]) || body.includes(liveDraftRevisions[destination])) fail("draft data was visible to Voyager for " + destination);
        const publicImage = await imageGet("/api/student-banners/" + destination + "/" + livePublishedRevisions[destination] + "/background");
        details.push({ destination, publicImage });
      }
      await screenshot("voyager-published-four-destinations");
      return { destinations: details };
    }, ["voyager-dashboard-courses-quiz-tryout"]);

    await check("voyager-image-failure-fallback", async () => {
      const details = [];
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        await go(routes[destination]);
        const changed = await js("(() => { const image = document.querySelector('[role=\"img\"] img'); if (!image) return false; image.src = '/bp06-missing-image.png'; return true; })()");
        if (!changed) fail("published banner image was not present for failure simulation: " + destination);
        const failedGet = await imageGetFailure("/bp06-missing-image.png");
        await wait(2);
        const fallback = await js("(() => { const root = document.querySelector('[role=\"img\"]'); const heading = root?.querySelector('h2'); const description = root?.querySelector('p'); return { aria: root?.getAttribute('aria-label') || '', heading: heading?.textContent || '', description: description?.textContent || '', hasImage: Boolean(root?.querySelector('img')) }; })()");
        if (!fallback || !fallback.heading.trim() || !fallback.description.trim() || !fallback.aria.includes(fallback.heading.trim()) || fallback.hasImage) fail("banner fallback text/accessible state was incomplete: " + destination);
        await screenshot("voyager-" + destination + "-image-fallback");
        details.push({ destination, failedGet, fallback: { heading: fallback.heading, description: fallback.description, ariaPresent: true } });
      }
      return { destinations: details };
    }, ["voyager-published-image-family-and-draft-invisibility"]);

    await check("voyager-logout-real-session", async () => {
      await logout("signed-out");
      const names = await cookieNames();
      if (names.includes("vecalss_session")) fail("Voyager logout left the session cookie present");
      return { signedOut: true, cookieNames: names.filter((name) => name !== "vecalss_session") };
    }, ["voyager-image-failure-fallback"]);

    await check("logout-protected-route-denial-all-four", async () => {
      const denied = [];
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        const info = await go("/admin/student-banners?destination=" + destination);
        if (!String(info.url).includes("/login")) fail("logged-out protected route was not denied for " + destination);
        denied.push({ destination, url: info.url });
      }
      for (const destination of ["beranda", "materi", "kuis", "tryout"]) {
        const info = await go(routes[destination]);
        if (!String(info.url).includes("/login")) fail("logged-out Voyager route was not denied for " + destination);
        denied.push({ destination, surface: "voyager", url: info.url });
      }
      return { denied };
    }, ["voyager-logout-real-session"]);
  } finally {
    if (task) {
      await completeTaskSpace(task.id, { keep: false });
    }
  }

  cliLog("BP06_BROWSER_SUMMARY " + JSON.stringify({ failed, notRun, passed, skipped }));
  if (failed.length > 0 || notRun.length > 0 || skipped.length > 0) process.exitCode = 1;
})().catch((error) => {
  cliLog("BP06_BROWSER_FATAL " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
`;
}

async function runBrowserSupervisor() {
  await setup();
  const state = JSON.parse(await readFile(statePath(), "utf8")) as FixtureState;
  const privatePaths = await assertBrowserPrivatePaths(state);
  const fixtureEnv = parseDotenv(await readFile(state.envFile, "utf8"));
  const { NODE_OPTIONS: _nodeOptions, ...inheritedEnv } = process.env;
  const childEnv = {
    ...inheritedEnv,
    ...fixtureEnv,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const nextBin = join(state.mirrorRoot, "node_modules", "next", "dist", "bin", "next");
  let nextChild: ChildProcess | null = null;
  let browserChild: ChildProcess | null = null;
  let nextOutput: string[] = [];
  let browserOutput: string[] = [];
  let browserDone = false;
  let transitionPromise: Promise<number> | null = null;
  try {
    // Next 16 defaults to Turbopack, which rejects this fixture's deliberately
    // isolated mirror when its only dependency link resolves outside the
    // mirror root. Webpack is an officially supported dev-only selector and
    // keeps this browser fixture on the real app/server code without widening
    // turbopack.root or changing production next.config.
    const nextArgs = [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(PORT)];
    console.log(`BP06 supervised Next child launch: ${process.execPath} ${nextArgs.slice(1).join(" ")}`);
    nextChild = spawn(process.execPath, nextArgs, {
      cwd: state.mirrorRoot,
      env: childEnv,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    nextOutput = captureChildOutput(nextChild);
    await waitForNextReady(nextChild, nextOutput);
    console.log(`BP06 supervised Next child ready on ${routeUrl(PORT, "/")}`);
    // Keep the embedded evaluator explicitly in test mode; never inherit the
    // host application's NODE_ENV or fixture-private environment values.
    const browserEnv: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    for (const key of ["HOME", "LANG", "LC_ALL", "LOGNAME", "PATH", "SHELL", "TERM", "TMP", "TEMP", "TMPDIR", "USER"]) {
      const value = inheritedEnv[key];
      if (value !== undefined) browserEnv[key] = value;
    }
    browserChild = spawn("ego-browser", ["nodejs"], {
      cwd: state.mirrorRoot,
      env: browserEnv,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    browserOutput = captureChildOutput(browserChild);
    transitionPromise = superviseBrowserTransitions(state, () => browserDone);
    browserChild.stdin?.end(browserVerificationScript(privatePaths));
    await waitForChildExit(browserChild, 180_000);
    browserDone = true;
    const transitionCount = await transitionPromise;
    transitionPromise = null;
    if (browserChild.exitCode === null) {
      throw new Error("ego-browser child exceeded the bounded 180s verification window");
    }
    if (browserChild.exitCode !== 0) {
      throw new Error(`ego-browser verification exited ${browserChild.exitCode}. Ego tail: ${safeDiagnosticTail(browserOutput, 20)}. Next tail: ${safeDiagnosticTail(nextOutput, 20)}`);
    }
    if (transitionCount !== 3) {
      throw new Error(`ego-browser verification exited cleanly without completing all supervisor transitions (${transitionCount}/3).`);
    }
  } catch (error) {
    try {
      await writeBrowserDiagnosticArtifact(state, {
        browserTail: safeDiagnosticTail(browserOutput, 20),
        error: safeDiagnosticText(error instanceof Error ? error.message : String(error)),
        nextTail: safeDiagnosticTail(nextOutput, 20),
        stage: browserChild ? "browser-supervisor" : "next-readiness",
      });
    } catch (diagnosticError) {
      console.error(`BP06 diagnostic artifact write failed: ${safeDiagnosticText(diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError))}`);
    }
    throw error;
  } finally {
    browserDone = true;
    if (transitionPromise) {
      await transitionPromise.catch((error) => {
        console.error(`BP06 transition supervisor stopped: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
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

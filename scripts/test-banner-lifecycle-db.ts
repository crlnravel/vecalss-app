import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pg from "pg";

import {
  BannerMakerConflictError,
  BannerMakerSourceConflictError,
  BannerMakerValidationError,
  BannerMakerDraftMismatchError,
  BannerMakerRecoveryUnavailableError,
  createDefaultBannerDesign,
  createTextBannerStarterDesign,
  type BannerDesign,
  type BannerMakerDestinationSnapshot,
  type BannerSourceDescriptor,
} from "../lib/admin/banner-maker";
import {
  createBannerDesignEnvelope,
  parseBannerDesignEnvelope,
} from "../lib/banner/envelope";
import {
  BANNER_LEGACY_CONFIG_KEY,
  getBannerDestination,
} from "../lib/banner/destinations";
import { normalizeStudentBanners } from "../lib/student/banner-content";

const { Client } = pg;
const TEST_DATABASE_ENV = "BANNER_MEDIA_SAFETY_TEST_DATABASE_URL";
const FALLBACK_DATABASE_ENV = "VERA_DISPOSABLE_DATABASE_URL";
const DISPOSABLE_ACK_ENV = "VERA_DISPOSABLE_DB_ACK";
const TABLES = ["system_configs", "audit_logs"] as const;
const ACTOR_USER_ID = "11111111-1111-4111-8111-111111111111";

type ProductionModules = {
  banner: typeof import("../lib/admin/banner-maker-repository");
  prisma: typeof import("../lib/prisma");
};

type Outcome<T> =
  | { error?: never; ok: true; value: T }
  | { error: unknown; ok: false; value?: never };

type Fixture = {
  configKey: string;
  configValue: unknown;
  draftValue?: unknown;
  draftUpdatedAt?: string | null;
  publishedAt?: string | null;
};

async function updateConfigMetadata(client: pg.Client, schema: string, configKey: string, userId = ACTOR_USER_ID) {
  await client.query(
    `UPDATE ${quoteIdentifier(schema)}."system_configs"
        SET updated_by_user_id = $2::uuid,
            updated_at = $3::timestamptz
      WHERE config_key = $1`,
    [configKey, userId, "2026-09-08T02:00:00.000Z"],
  );
}

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
    console.log(`Banner lifecycle DB tests skipped: ${TEST_DATABASE_ENV} or ${FALLBACK_DATABASE_ENV} is required; configured DATABASE_URL is never used.`);
    return null;
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
  for (const table of TABLES) {
    const quotedTable = quoteIdentifier(table);
    await client.query(`CREATE TABLE ${quotedSchema}.${quotedTable} (LIKE public.${quotedTable} INCLUDING DEFAULTS)`);
  }

  const foreignKeys = await client.query<{ tableName: string; constraintName: string }>(
    `SELECT relation.relname AS "tableName", constraint_row.conname AS "constraintName"
       FROM pg_constraint constraint_row
       JOIN pg_class relation ON relation.oid = constraint_row.conrelid
       JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = $1 AND constraint_row.contype = 'f'`,
    [schema],
  );
  for (const foreignKey of foreignKeys.rows) {
    await client.query(
      `ALTER TABLE ${quotedSchema}.${quoteIdentifier(foreignKey.tableName)} DROP CONSTRAINT ${quoteIdentifier(foreignKey.constraintName)}`,
    );
  }

  await client.query(`ALTER TABLE ${quotedSchema}."system_configs" ADD PRIMARY KEY (id)`);
  await client.query(`ALTER TABLE ${quotedSchema}."system_configs" ADD UNIQUE (config_key)`);
  await client.query(`ALTER TABLE ${quotedSchema}."audit_logs" ADD PRIMARY KEY (id)`);
}

async function dropIsolatedSchema(client: pg.Client, schema: string) {
  await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
}

async function loadProductionModules(databaseUrl: string): Promise<ProductionModules> {
  process.env.DATABASE_URL = databaseUrl;
  const [{ prisma }, banner] = await Promise.all([
    import("../lib/prisma"),
    import("../lib/admin/banner-maker-repository"),
  ]);
  return { banner, prisma: { prisma } };
}

async function clearFixture(client: pg.Client, schema: string) {
  const quotedSchema = quoteIdentifier(schema);
  await client.query(`TRUNCATE TABLE ${TABLES.map((table) => `${quotedSchema}.${quoteIdentifier(table)}`).join(", ")}`);
}

async function insertConfig(client: pg.Client, schema: string, fixture: Fixture) {
  const id = randomUUID();
  const quotedSchema = quoteIdentifier(schema);
  await client.query(
    `INSERT INTO ${quotedSchema}."system_configs"
      (id, config_key, config_value, draft_value, updated_by_user_id, updated_at,
       draft_updated_by_user_id, draft_updated_at, published_by_user_id, published_at)
     VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb, $5::uuid, CURRENT_TIMESTAMP,
             $5::uuid, $6::timestamptz, $5::uuid, $7::timestamptz)`,
    [
      id,
      fixture.configKey,
      JSON.stringify(fixture.configValue),
      fixture.draftValue === undefined ? null : JSON.stringify(fixture.draftValue),
      ACTOR_USER_ID,
      fixture.draftUpdatedAt !== undefined
        ? fixture.draftUpdatedAt
        : fixture.draftValue === undefined
          ? null
          : "2026-09-08T00:00:00.000Z",
      fixture.publishedAt ?? null,
    ],
  );
  return id;
}

async function readConfig(client: pg.Client, schema: string, configKey: string) {
  const result = await client.query<{
    configValue: unknown;
    draftValue: unknown;
    draftUpdatedAt: string | null;
    id: string;
    publishedAt: string | null;
    updatedAt: string;
  }>(
    `SELECT id, config_value AS "configValue", draft_value AS "draftValue",
            draft_updated_at AS "draftUpdatedAt", published_at AS "publishedAt", updated_at AS "updatedAt"
       FROM ${quoteIdentifier(schema)}."system_configs"
      WHERE config_key = $1`,
    [configKey],
  );
  return result.rows[0] ?? null;
}

async function readAuditRows(client: pg.Client, schema: string) {
  const result = await client.query<{ action: string; metadata: Record<string, unknown> }>(
    `SELECT action, metadata FROM ${quoteIdentifier(schema)}."audit_logs" ORDER BY occurred_at ASC, id ASC`,
  );
  return result.rows;
}

async function settle<T>(promise: Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { error, ok: false };
  }
}

function makeDesign(text: string): BannerDesign {
  const design = createDefaultBannerDesign();
  const [headline, supportingCopy] = design.layers;
  assert.ok(headline?.type === "text" && supportingCopy?.type === "text");
  return {
    ...design,
    layers: [
      { ...headline, text },
      { ...supportingCopy, text: `${text} description` },
    ],
  };
}

async function withFixedDate<T>(callback: () => Promise<T>) {
  const OriginalDate = Date;
  const fixedTime = new OriginalDate("2026-09-08T12:00:00.000Z").getTime();
  const FixedDate = class extends OriginalDate {
    constructor(...args: never[]) {
      super(args.length === 0 ? fixedTime : args[0]);
    }

    static now() {
      return fixedTime;
    }
  };
  globalThis.Date = FixedDate as unknown as DateConstructor;
  try {
    return await callback();
  } finally {
    globalThis.Date = OriginalDate;
  }
}

async function sourceForSnapshot(snapshot: BannerMakerDestinationSnapshot) {
  assert.ok(snapshot.bootstrap.kind !== "unavailable-recovery");
  assert.ok(snapshot.bootstrap.source);
  return snapshot.bootstrap.source as BannerSourceDescriptor;
}

async function run(
  rawDatabaseUrl: string,
  schema: string,
  client: pg.Client,
  production: ProductionModules,
) {
  const { banner } = production;
  const destination = "beranda" as const;
  const definition = getBannerDestination(destination);
  assert.ok(definition);

  await clearFixture(client, schema);
  const legacyStudentOutput = {
    beranda: { title: "Legacy student title", description: "Legacy student description" },
  };
  await insertConfig(client, schema, {
    configKey: "student.banners",
    configValue: legacyStudentOutput,
  });
  const absent = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(absent.configId, null);
  assert.equal(absent.hasPublishedDesign, false);
  assert.equal(absent.hasSavedDraft, false);
  assert.equal(absent.publicationState, "never-published");
  assert.equal(absent.bootstrap.kind, "valid-design");
  const absentSource = await sourceForSnapshot(absent);
  const firstDesign = makeDesign("first destination draft");

  const concurrentResults = await withFixedDate(() => Promise.all([
    settle(banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: firstDesign,
      destination,
      expectedRevision: null,
      source: absentSource,
    })),
    settle(banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: makeDesign("losing first save"),
      destination,
      expectedRevision: null,
      source: absentSource,
    })),
  ]));
  assert.equal(concurrentResults.filter((result) => result.ok).length, 1);
  assert.equal(concurrentResults.filter((result) => !result.ok).length, 1);
  assert.ok(concurrentResults.some((result) => !result.ok && result.error instanceof BannerMakerConflictError));

  const firstSave = concurrentResults.find((result) => result.ok);
  assert.ok(firstSave?.ok);
  if (!firstSave?.ok) throw new Error("The concurrent first-save winner was not returned.");
  const afterFirstSave = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(afterFirstSave.hasSavedDraft, true);
  assert.equal(afterFirstSave.hasPublishedDesign, false);
  assert.equal(afterFirstSave.hasUnpublishedChanges, true);
  assert.equal(afterFirstSave.publicationState, "never-published");
  assert.ok(afterFirstSave.currentRevision);
  assert.equal(afterFirstSave.currentRevision, firstSave.value.currentRevision);

  const rawAfterFirstSave = await readConfig(client, schema, definition.configKey);
  assert.ok(rawAfterFirstSave);
  const firstEnvelope = parseBannerDesignEnvelope(rawAfterFirstSave.configValue, { allowNullDesign: true });
  const firstDraftEnvelope = parseBannerDesignEnvelope(rawAfterFirstSave.draftValue);
  assert.equal(firstEnvelope.design, null);
  assert.ok(firstDraftEnvelope.design);
  assert.equal(rawAfterFirstSave.publishedAt, null);
  assert.equal(rawAfterFirstSave.draftUpdatedAt !== null, true);

  await assert.rejects(
    banner.publishBannerMakerDestinationDesign({
      actorUserId: ACTOR_USER_ID,
      design: firstDesign,
      destination,
      expectedRevision: null,
    }),
    BannerMakerConflictError,
  );

  const secondDesign = makeDesign("second destination draft");
  const secondSave = await withFixedDate(() => banner.saveBannerMakerDestinationDraft({
    actorUserId: ACTOR_USER_ID,
    design: secondDesign,
    destination,
    expectedRevision: afterFirstSave.currentRevision,
  }));
  assert.notEqual(secondSave.currentRevision, afterFirstSave.currentRevision);
  const rawAfterSecondSave = await readConfig(client, schema, definition.configKey);
  assert.ok(rawAfterSecondSave);
  assert.equal(
    new Date(rawAfterSecondSave.updatedAt).getTime(),
    new Date(rawAfterFirstSave.updatedAt).getTime(),
    "timestamps are metadata and may collide",
  );

  const published = await withFixedDate(() => banner.publishBannerMakerDestinationDesign({
    actorUserId: ACTOR_USER_ID,
    design: secondDesign,
    destination,
    expectedRevision: secondSave.currentRevision,
  }));
  assert.equal(published.hasPublishedDesign, true);
  assert.equal(published.hasSavedDraft, false);
  assert.notEqual(published.currentRevision, secondSave.currentRevision);
  const publishedConfig = await readConfig(client, schema, definition.configKey);
  assert.ok(publishedConfig);
  const publishedEnvelope = parseBannerDesignEnvelope(publishedConfig.configValue);
  assert.deepEqual(publishedEnvelope.design, secondDesign);
  assert.equal(publishedConfig.draftValue, null);
  assert.ok(publishedConfig.publishedAt);
  const auditRows = await readAuditRows(client, schema);
  assert.deepEqual(auditRows.map(({ action }) => action).sort(), [
    "student_banner_maker_v2_draft_saved",
    "student_banner_maker_v2_draft_saved",
    "student_banner_maker_v2_published",
  ].sort());
  assert.equal(auditRows.every(({ metadata }) => metadata.destination === destination), true);
  assert.equal(new Set(auditRows.map(({ metadata }) => metadata.newRevision)).size, 3);

  const publishedRead = await banner.getPublishedBannerMakerDestinationDesign(destination);
  assert.deepEqual(publishedRead.design, secondDesign);
  assert.equal(publishedRead.revision, published.currentRevision);
  const unchangedStudentOutput = await readConfig(client, schema, "student.banners");
  assert.ok(unchangedStudentOutput);
  assert.deepEqual(unchangedStudentOutput.configValue, legacyStudentOutput);
  assert.deepEqual(normalizeStudentBanners(unchangedStudentOutput.configValue), normalizeStudentBanners(legacyStudentOutput));

  await clearFixture(client, schema);
  await insertConfig(client, schema, {
    configKey: "student.banners",
    configValue: {
      materi: { title: "Materi legacy", description: "Materi fallback" },
      kuis: { title: "Kuis legacy", description: "Kuis fallback" },
    },
  });
  const materiBefore = await banner.getBannerMakerDestinationSnapshot("materi");
  const kuisBefore = await banner.getBannerMakerDestinationSnapshot("kuis");
  const materiSave = await banner.saveBannerMakerDestinationDraft({
    actorUserId: ACTOR_USER_ID,
    design: makeDesign("materi destination"),
    destination: "materi",
    expectedRevision: null,
    source: await sourceForSnapshot(materiBefore),
  });
  const kuisSave = await banner.saveBannerMakerDestinationDraft({
    actorUserId: ACTOR_USER_ID,
    design: makeDesign("kuis destination"),
    destination: "kuis",
    expectedRevision: null,
    source: await sourceForSnapshot(kuisBefore),
  });
  assert.notEqual(materiSave.currentRevision, kuisSave.currentRevision);
  const kuisUnchangedBeforePublish = await banner.getBannerMakerDestinationSnapshot("kuis");
  assert.equal(kuisUnchangedBeforePublish.currentRevision, kuisSave.currentRevision);
  await banner.publishBannerMakerDestinationDesign({
    actorUserId: ACTOR_USER_ID,
    design: materiSave.design,
    destination: "materi",
    expectedRevision: materiSave.currentRevision,
  });
  const kuisAfterMateriPublish = await banner.getBannerMakerDestinationSnapshot("kuis");
  assert.equal(kuisAfterMateriPublish.currentRevision, kuisSave.currentRevision);
  assert.equal(kuisAfterMateriPublish.hasPublishedDesign, false);
  const crossDestinationStudentOutput = await readConfig(client, schema, "student.banners");
  assert.deepEqual(crossDestinationStudentOutput?.configValue, {
    materi: { title: "Materi legacy", description: "Materi fallback" },
    kuis: { title: "Kuis legacy", description: "Kuis fallback" },
  });

  await clearFixture(client, schema);
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(null),
  });
  const defaultOnly = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(defaultOnly.publicationState, "never-published");
  assert.equal(defaultOnly.hasSavedDraft, false);
  await assert.rejects(
    banner.publishBannerMakerDestinationDesign({
      actorUserId: ACTOR_USER_ID,
      design: firstDesign,
      destination,
      expectedRevision: defaultOnly.currentRevision,
    }),
    BannerMakerValidationError,
  );

  await clearFixture(client, schema);
  const defaultOnlyText = {
    beranda: { title: "Default-only source", description: "Source remains fenced." },
  };
  await insertConfig(client, schema, {
    configKey: "student.banners",
    configValue: defaultOnlyText,
  });
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(null),
  });
  const existingDefaultOnly = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(existingDefaultOnly.bootstrap.kind, "valid-design");
  assert.equal(existingDefaultOnly.currentRevision !== null, true);
  await assert.rejects(
    banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: firstDesign,
      destination,
      expectedRevision: existingDefaultOnly.currentRevision,
    }),
    BannerMakerValidationError,
  );
  const existingDefaultOnlySource = await sourceForSnapshot(existingDefaultOnly);
  await updateConfigMetadata(client, schema, "student.banners");
  await assert.rejects(
    banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: firstDesign,
      destination,
      expectedRevision: existingDefaultOnly.currentRevision,
      source: existingDefaultOnlySource,
    }),
    BannerMakerSourceConflictError,
  );
  const unchangedDefaultOnly = await readConfig(client, schema, definition.configKey);
  assert.ok(unchangedDefaultOnly);
  assert.equal(parseBannerDesignEnvelope(unchangedDefaultOnly.configValue, { allowNullDesign: true }).design, null);
  const refreshedDefaultOnly = await banner.getBannerMakerDestinationSnapshot(destination);
  const defaultOnlySave = await banner.saveBannerMakerDestinationDraft({
    actorUserId: ACTOR_USER_ID,
    design: firstDesign,
    destination,
    expectedRevision: refreshedDefaultOnly.currentRevision,
    source: await sourceForSnapshot(refreshedDefaultOnly),
  });
  assert.equal(defaultOnlySave.hasSavedDraft, true);

  await clearFixture(client, schema);
  const publishedOnlyDesign = makeDesign("published only");
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(publishedOnlyDesign),
    publishedAt: "2026-09-08T01:00:00.000Z",
  });
  const publishedOnly = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(publishedOnly.publicationState, "published");
  assert.equal(publishedOnly.hasPublishedDesign, true);
  assert.equal(publishedOnly.hasSavedDraft, false);
  await assert.rejects(
    banner.publishBannerMakerDestinationDesign({
      actorUserId: ACTOR_USER_ID,
      design: publishedOnlyDesign,
      destination,
      expectedRevision: publishedOnly.currentRevision,
    }),
    BannerMakerValidationError,
  );

  await clearFixture(client, schema);
  const draftOnlyDesign = makeDesign("draft only");
  const draftOnlyEnvelope = createBannerDesignEnvelope(draftOnlyDesign);
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(null),
    draftValue: draftOnlyEnvelope,
    draftUpdatedAt: "2026-09-08T01:00:00.000Z",
  });
  const draftOnly = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(draftOnly.publicationState, "never-published");
  assert.equal(draftOnly.hasSavedDraft, true);
  assert.equal(draftOnly.hasUnpublishedChanges, true);
  const draftOnlyPublish = await banner.publishBannerMakerDestinationDesign({
    actorUserId: ACTOR_USER_ID,
    design: draftOnlyDesign,
    destination,
    expectedRevision: draftOnly.currentRevision,
  });
  assert.equal(draftOnlyPublish.hasPublishedDesign, true);
  assert.equal(draftOnlyPublish.hasSavedDraft, false);

  await clearFixture(client, schema);
  const equalDefaultDraft = createDefaultBannerDesign();
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(null),
    draftValue: createBannerDesignEnvelope(equalDefaultDraft),
    draftUpdatedAt: "2026-09-08T01:00:00.000Z",
  });
  const equalDefaultSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(equalDefaultSnapshot.hasUnpublishedChanges, true);
  assert.equal(equalDefaultSnapshot.hasSavedDraft, true);
  assert.deepEqual(equalDefaultSnapshot.design, equalDefaultDraft);
  const equalDefaultRawBefore = await readConfig(client, schema, definition.configKey);
  assert.ok(equalDefaultRawBefore);
  await assert.rejects(
    banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: makeDesign("stale existing save"),
      destination,
      expectedRevision: randomUUID(),
    }),
    BannerMakerConflictError,
  );
  await assert.rejects(
    banner.publishBannerMakerDestinationDesign({
      actorUserId: ACTOR_USER_ID,
      design: equalDefaultDraft,
      destination,
      expectedRevision: randomUUID(),
    }),
    BannerMakerConflictError,
  );
  await assert.rejects(
    banner.publishBannerMakerDestinationDesign({
      actorUserId: ACTOR_USER_ID,
      design: makeDesign("mismatched submitted design"),
      destination,
      expectedRevision: equalDefaultSnapshot.currentRevision,
    }),
    BannerMakerDraftMismatchError,
  );
  assert.deepEqual((await readConfig(client, schema, definition.configKey))?.draftValue, equalDefaultRawBefore.draftValue);

  await clearFixture(client, schema);
  const missingTimestampDraft = makeDesign("missing timestamp draft");
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(null),
    draftValue: createBannerDesignEnvelope(missingTimestampDraft),
    draftUpdatedAt: null,
  });
  const missingTimestampSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(missingTimestampSnapshot.publicationState, "invalid");
  await assert.rejects(
    banner.publishBannerMakerDestinationDesign({
      actorUserId: ACTOR_USER_ID,
      design: missingTimestampDraft,
      destination,
      expectedRevision: missingTimestampSnapshot.currentRevision,
    }),
    BannerMakerRecoveryUnavailableError,
  );

  await clearFixture(client, schema);
  const publishedPlusDraft = makeDesign("published base");
  const unpublishedDraft = makeDesign("unpublished draft");
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(publishedPlusDraft),
    draftValue: createBannerDesignEnvelope(unpublishedDraft),
    draftUpdatedAt: "2026-09-08T01:00:00.000Z",
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  const publishedPlusDraftSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(publishedPlusDraftSnapshot.publicationState, "published");
  assert.equal(publishedPlusDraftSnapshot.hasPublishedDesign, true);
  assert.equal(publishedPlusDraftSnapshot.hasSavedDraft, true);
  assert.equal(publishedPlusDraftSnapshot.hasUnpublishedChanges, true);

  await clearFixture(client, schema);
  const publishedWithMalformedDraft = makeDesign("published survives bad draft");
  const publishedWithMalformedDraftRaw = { unsupported: true };
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(publishedWithMalformedDraft),
    draftValue: publishedWithMalformedDraftRaw,
    draftUpdatedAt: "2026-09-08T01:00:00.000Z",
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  const malformedDraftSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(malformedDraftSnapshot.publicationState, "invalid");
  assert.equal(malformedDraftSnapshot.bootstrap.kind, "unavailable-recovery");
  assert.equal(malformedDraftSnapshot.design, null);
  const malformedDraftPublishedRead = await banner.getPublishedBannerMakerDestinationDesign(destination);
  assert.deepEqual(malformedDraftPublishedRead.design, publishedWithMalformedDraft);
  assert.equal(malformedDraftPublishedRead.diagnostic, null);
  assert.deepEqual((await readConfig(client, schema, definition.configKey))?.draftValue, publishedWithMalformedDraftRaw);

  await clearFixture(client, schema);
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(publishedWithMalformedDraft),
    draftValue: createBannerDesignEnvelope(makeDesign("draft timestamp missing")),
    draftUpdatedAt: null,
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  const missingDraftTimestampSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(missingDraftTimestampSnapshot.publicationState, "invalid");
  const missingDraftTimestampRead = await banner.getPublishedBannerMakerDestinationDesign(destination);
  assert.deepEqual(missingDraftTimestampRead.design, publishedWithMalformedDraft);
  assert.equal(missingDraftTimestampRead.diagnostic, null);

  await clearFixture(client, schema);
  const invalidV2TextValue = {
    beranda: { title: "z".repeat(181), description: "Perbaiki lalu simpan." },
  };
  const invalidV2Published = makeDesign("published before v2 recovery");
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(invalidV2Published),
    draftValue: { unsupported: true },
    draftUpdatedAt: "2026-09-08T01:00:00.000Z",
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  await insertConfig(client, schema, {
    configKey: "student.banners",
    configValue: invalidV2TextValue,
  });
  const invalidV2TextSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(invalidV2TextSnapshot.bootstrap.kind, "unavailable-recovery");
  const invalidV2TextOption = invalidV2TextSnapshot.bootstrap.kind === "unavailable-recovery"
    ? invalidV2TextSnapshot.bootstrap.recoveryOptions.find((option) => option.kind === "legacy-text")
    : null;
  assert.ok(invalidV2TextOption?.kind === "legacy-text");
  assert.equal(invalidV2TextOption.bootstrap.kind, "starter-needs-edit");
  if (invalidV2TextOption.bootstrap.kind === "starter-needs-edit") {
    assert.equal(invalidV2TextOption.bootstrap.title.length, 181);
    const correctedInvalidV2Text = createTextBannerStarterDesign({
      description: invalidV2TextOption.bootstrap.description,
      destination,
      title: "Recovered invalid v2",
    });
    const recoveredInvalidV2 = await banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: correctedInvalidV2Text,
      destination,
      expectedRevision: null,
      source: invalidV2TextOption.source,
    });
    assert.equal(recoveredInvalidV2.hasPublishedDesign, true);
    assert.equal(recoveredInvalidV2.hasSavedDraft, true);
  }
  const recoveredInvalidV2Config = await readConfig(client, schema, definition.configKey);
  assert.ok(recoveredInvalidV2Config);
  assert.deepEqual(parseBannerDesignEnvelope(recoveredInvalidV2Config.configValue).design, invalidV2Published);
  assert.deepEqual(parseBannerDesignEnvelope(recoveredInvalidV2Config.draftValue).design, createTextBannerStarterDesign({
    description: invalidV2TextValue.beranda.description,
    destination,
    title: "Recovered invalid v2",
  }));
  assert.deepEqual((await readConfig(client, schema, "student.banners"))?.configValue, invalidV2TextValue);
  const recoveredInvalidV2PublishedRead = await banner.getPublishedBannerMakerDestinationDesign(destination);
  assert.deepEqual(recoveredInvalidV2PublishedRead.design, invalidV2Published);
  assert.equal(recoveredInvalidV2PublishedRead.diagnostic, null);

  await clearFixture(client, schema);
  const invalidRawConfig = { storageVersion: 2, revision: "broken", design: null };
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: invalidRawConfig,
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  const invalidV2 = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(invalidV2.publicationState, "invalid");
  assert.equal(invalidV2.bootstrap.kind, "unavailable-recovery");
  assert.equal(invalidV2.design, null);
  const invalidPublishedRead = await banner.getPublishedBannerMakerDestinationDesign(destination);
  assert.equal(invalidPublishedRead.design, null);
  assert.ok(invalidPublishedRead.diagnostic);
  assert.deepEqual((await readConfig(client, schema, definition.configKey))?.configValue, invalidRawConfig);

  await clearFixture(client, schema);
  const strictUuidPublished = makeDesign("strict uuid published");
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: createBannerDesignEnvelope(strictUuidPublished),
    draftValue: {
      design: makeDesign("strict uuid draft"),
      revision: "00000000-0000-0000-0000-000000000000",
      storageVersion: 2,
    },
    draftUpdatedAt: "2026-09-08T01:00:00.000Z",
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  const strictUuidDraftSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(strictUuidDraftSnapshot.publicationState, "invalid");
  const strictUuidDraftRead = await banner.getPublishedBannerMakerDestinationDesign(destination);
  assert.deepEqual(strictUuidDraftRead.design, strictUuidPublished);
  assert.equal(strictUuidDraftRead.diagnostic, null);

  await clearFixture(client, schema);
  const strictUuidPublishedRaw = {
    design: strictUuidPublished,
    revision: "00000000-0000-0000-0000-000000000000",
    storageVersion: 2,
  };
  await insertConfig(client, schema, {
    configKey: definition.configKey,
    configValue: strictUuidPublishedRaw,
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  const strictUuidPublishedSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(strictUuidPublishedSnapshot.publicationState, "invalid");
  const strictUuidPublishedRead = await banner.getPublishedBannerMakerDestinationDesign(destination);
  assert.equal(strictUuidPublishedRead.design, null);
  assert.ok(strictUuidPublishedRead.diagnostic);

  await clearFixture(client, schema);
  const legacyDefault = createDefaultBannerDesign();
  await insertConfig(client, schema, {
    configKey: BANNER_LEGACY_CONFIG_KEY,
    configValue: legacyDefault,
  });
  const legacyDefaultSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(legacyDefaultSnapshot.bootstrap.kind, "valid-design");
  assert.equal(legacyDefaultSnapshot.bootstrap.kind === "valid-design" && legacyDefaultSnapshot.bootstrap.source?.kind, "legacy-text");

  await clearFixture(client, schema);
  const legacyPublished = makeDesign("legacy published");
  await insertConfig(client, schema, {
    configKey: BANNER_LEGACY_CONFIG_KEY,
    configValue: legacyPublished,
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  const legacyPublishedSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(legacyPublishedSnapshot.bootstrap.kind, "valid-design");
  assert.equal(legacyPublishedSnapshot.bootstrap.kind === "valid-design" && legacyPublishedSnapshot.bootstrap.source?.sourceColumn, "configValue");

  await clearFixture(client, schema);
  const legacyDraft = makeDesign("legacy draft");
  await insertConfig(client, schema, {
    configKey: BANNER_LEGACY_CONFIG_KEY,
    configValue: legacyDefault,
    draftValue: legacyDraft,
    draftUpdatedAt: "2026-09-08T01:00:00.000Z",
  });
  const legacyDraftSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(legacyDraftSnapshot.bootstrap.kind, "valid-design");
  assert.equal(legacyDraftSnapshot.bootstrap.kind === "valid-design" && legacyDraftSnapshot.bootstrap.source?.sourceColumn, "draftValue");

  await clearFixture(client, schema);
  await insertConfig(client, schema, {
    configKey: BANNER_LEGACY_CONFIG_KEY,
    configValue: legacyPublished,
    draftValue: legacyDraft,
    draftUpdatedAt: "2026-09-08T01:00:00.000Z",
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  const legacyBothSnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(legacyBothSnapshot.bootstrap.kind, "valid-design");
  assert.equal(legacyBothSnapshot.design?.layers[0]?.type, "text");
  assert.equal(legacyBothSnapshot.design?.layers[0]?.type === "text" && legacyBothSnapshot.design.layers[0].text, "legacy draft");

  await clearFixture(client, schema);
  const malformedDraft = { unsupported: true };
  const legacyPublishedRowId = await insertConfig(client, schema, {
    configKey: BANNER_LEGACY_CONFIG_KEY,
    configValue: legacyPublished,
    draftValue: malformedDraft,
    draftUpdatedAt: "2026-09-08T01:00:00.000Z",
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  const malformedLegacySnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(malformedLegacySnapshot.bootstrap.kind, "unavailable-recovery");
  assert.ok(malformedLegacySnapshot.bootstrap.kind === "unavailable-recovery" && malformedLegacySnapshot.bootstrap.recoveryOptions.some(({ kind }) => kind === "legacy-published"));
  assert.equal((await readConfig(client, schema, BANNER_LEGACY_CONFIG_KEY))?.id, legacyPublishedRowId);
  assert.deepEqual((await readConfig(client, schema, BANNER_LEGACY_CONFIG_KEY))?.draftValue, malformedDraft);

  let recoveryOption = malformedLegacySnapshot.bootstrap.kind === "unavailable-recovery"
    ? malformedLegacySnapshot.bootstrap.recoveryOptions.find((option) => option.kind === "legacy-published")
    : null;
  assert.ok(recoveryOption?.kind === "legacy-published");
  await assert.rejects(
    banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: recoveryOption.design,
      destination,
      expectedRevision: null,
      source: { ...recoveryOption.source, digest: "0".repeat(64) },
    }),
    BannerMakerSourceConflictError,
  );
  await assert.rejects(
    banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: recoveryOption.design,
      destination,
      expectedRevision: null,
      source: { ...recoveryOption.source, rowId: randomUUID() },
    }),
    BannerMakerSourceConflictError,
  );
  await updateConfigMetadata(client, schema, BANNER_LEGACY_CONFIG_KEY, "66666666-6666-4666-8666-666666666666");
  await assert.rejects(
    banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: recoveryOption.design,
      destination,
      expectedRevision: null,
      source: recoveryOption.source,
    }),
    BannerMakerSourceConflictError,
  );
  const refreshedMalformedLegacy = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(refreshedMalformedLegacy.bootstrap.kind, "unavailable-recovery");
  recoveryOption = refreshedMalformedLegacy.bootstrap.kind === "unavailable-recovery"
    ? refreshedMalformedLegacy.bootstrap.recoveryOptions.find((option) => option.kind === "legacy-published")
    : null;
  assert.ok(recoveryOption?.kind === "legacy-published");
  await assert.rejects(
    banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: recoveryOption.design,
      destination,
      expectedRevision: null,
      source: { ...recoveryOption.source, sourceColumn: "draftValue" },
    }),
    BannerMakerRecoveryUnavailableError,
  );
  const recovered = await banner.saveBannerMakerDestinationDraft({
    actorUserId: ACTOR_USER_ID,
    design: recoveryOption.design,
    destination,
    expectedRevision: null,
    source: recoveryOption.source,
  });
  assert.equal(recovered.destination, destination);
  assert.equal((await readConfig(client, schema, definition.configKey))?.publishedAt, null);
  assert.equal(await readConfig(client, schema, "student.banner-maker.v2.materi"), null, "legacy artwork is not fanned out");

  await clearFixture(client, schema);
  const overLimitTitle = "x".repeat(181);
  const legacyTextValue = {
    beranda: { title: overLimitTitle, description: "Tetap gunakan {target}." },
  };
  await insertConfig(client, schema, {
    configKey: "student.banners",
    configValue: legacyTextValue,
  });
  const starterNeedsEdit = await banner.getBannerMakerDestinationSnapshot(destination);
    assert.equal(starterNeedsEdit.bootstrap.kind, "starter-needs-edit");
  if (starterNeedsEdit.bootstrap.kind === "starter-needs-edit") {
    assert.equal(starterNeedsEdit.bootstrap.title, overLimitTitle);
    assert.equal(starterNeedsEdit.bootstrap.title.length, 181);
    assert.equal("design" in starterNeedsEdit.bootstrap, false);
    assert.equal(starterNeedsEdit.bootstrap.issues[0]?.limit, 180);
    await assert.rejects(
      banner.saveBannerMakerDestinationDraft({
        actorUserId: ACTOR_USER_ID,
        design: createTextBannerStarterDesign({ description: starterNeedsEdit.bootstrap.description, destination, title: overLimitTitle }),
        destination,
        expectedRevision: null,
        source: starterNeedsEdit.bootstrap.source,
      }),
      BannerMakerValidationError,
    );
    const correctedDesign = createTextBannerStarterDesign({ description: starterNeedsEdit.bootstrap.description, destination, title: "Corrected title" });
    await banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: correctedDesign,
      destination,
      expectedRevision: null,
      source: starterNeedsEdit.bootstrap.source,
    });
  }
  assert.deepEqual((await readConfig(client, schema, "student.banners"))?.configValue, legacyTextValue);

  await clearFixture(client, schema);
  const recoveryTextValue = {
    beranda: { title: "y".repeat(181), description: "Pilih {target} setelah mengedit." },
  };
  await insertConfig(client, schema, {
    configKey: BANNER_LEGACY_CONFIG_KEY,
    configValue: legacyPublished,
    draftValue: malformedDraft,
    draftUpdatedAt: "2026-09-08T01:00:00.000Z",
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  await insertConfig(client, schema, {
    configKey: "student.banners",
    configValue: recoveryTextValue,
  });
  const textRecoverySnapshot = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(textRecoverySnapshot.bootstrap.kind, "unavailable-recovery");
  const textRecoveryOption = textRecoverySnapshot.bootstrap.kind === "unavailable-recovery"
    ? textRecoverySnapshot.bootstrap.recoveryOptions.find((option) => option.kind === "legacy-text")
    : null;
  assert.ok(textRecoveryOption?.kind === "legacy-text");
  assert.equal(textRecoveryOption.bootstrap.kind, "starter-needs-edit");
  if (textRecoveryOption.bootstrap.kind === "starter-needs-edit") {
    assert.equal(textRecoveryOption.bootstrap.title, recoveryTextValue.beranda.title);
    assert.equal(textRecoveryOption.bootstrap.title.length, 181);
    const correctedRecoveryDesign = createTextBannerStarterDesign({
      description: textRecoveryOption.bootstrap.description,
      destination,
      title: "Recovered from text",
    });
    const recoveredFromText = await banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: correctedRecoveryDesign,
      destination,
      expectedRevision: null,
      source: textRecoveryOption.source,
    });
    assert.equal(recoveredFromText.hasSavedDraft, true);
  }
  assert.deepEqual((await readConfig(client, schema, BANNER_LEGACY_CONFIG_KEY))?.draftValue, malformedDraft);
  assert.deepEqual((await readConfig(client, schema, "student.banners"))?.configValue, recoveryTextValue);

  await clearFixture(client, schema);
  const textSourceSnapshot = await banner.getBannerMakerDestinationSnapshot("materi");
  assert.equal(textSourceSnapshot.bootstrap.kind, "valid-design");
  const textSource = await sourceForSnapshot(textSourceSnapshot);
  await insertConfig(client, schema, {
    configKey: "student.banners",
    configValue: { materi: { title: "Changed after open", description: "Changed" } },
  });
  await assert.rejects(
    banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: makeDesign("stale text source"),
      destination: "materi",
      expectedRevision: null,
      source: textSource,
    }),
    BannerMakerSourceConflictError,
  );

  await clearFixture(client, schema);
  await insertConfig(client, schema, {
    configKey: BANNER_LEGACY_CONFIG_KEY,
    configValue: { unsupported: true },
    publishedAt: "2026-09-08T00:00:00.000Z",
  });
  const unsupported = await banner.getBannerMakerDestinationSnapshot(destination);
  assert.equal(unsupported.bootstrap.kind, "unavailable-recovery");
  assert.equal(unsupported.publicationState, "never-published");

  // Keep the function parameter in the test signature so the isolated URL is
  // clearly an explicit disposable target, never the application database.
  assert.ok(rawDatabaseUrl.includes("schema="));
}

const rawDatabaseUrl = readDisposableDatabaseUrl();
if (rawDatabaseUrl) {
  const schema = `banner_lifecycle_${randomUUID().replaceAll("-", "")}`;
  const setupClient = new Client({ connectionString: rawDatabaseUrl });
  await setupClient.connect();
  await createIsolatedSchema(setupClient, schema);
  const isolatedDatabaseUrl = schemaDatabaseUrl(rawDatabaseUrl, schema);
  const production = await loadProductionModules(isolatedDatabaseUrl);
  const assertionClient = new Client({ connectionString: isolatedDatabaseUrl });
  await assertionClient.connect();
  try {
    await run(isolatedDatabaseUrl, schema, assertionClient, production);
    console.log("banner lifecycle production repository tests passed");
  } finally {
    await production.prisma.prisma.$disconnect();
    await assertionClient.end();
    await dropIsolatedSchema(setupClient, schema);
    await setupClient.end();
  }
}

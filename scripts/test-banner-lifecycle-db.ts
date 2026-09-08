import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pg from "pg";

import {
  BannerMakerConflictError,
  BannerMakerSourceConflictError,
  BannerMakerValidationError,
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
      fixture.draftUpdatedAt ?? (fixture.draftValue === undefined ? null : "2026-09-08T00:00:00.000Z"),
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

  const recoveryOption = malformedLegacySnapshot.bootstrap.kind === "unavailable-recovery"
    ? malformedLegacySnapshot.bootstrap.recoveryOptions.find(({ kind }) => kind === "legacy-published")
    : null;
  assert.ok(recoveryOption);
  await assert.rejects(
    banner.saveBannerMakerDestinationDraft({
      actorUserId: ACTOR_USER_ID,
      design: recoveryOption.design ?? legacyPublished,
      destination,
      expectedRevision: null,
      source: { ...recoveryOption.source, digest: "0".repeat(64) },
    }),
    BannerMakerSourceConflictError,
  );
  const recovered = await banner.saveBannerMakerDestinationDraft({
    actorUserId: ACTOR_USER_ID,
    design: recoveryOption.design ?? legacyPublished,
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

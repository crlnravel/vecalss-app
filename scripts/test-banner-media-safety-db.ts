import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pg from "pg";

import {
  BannerMakerValidationError,
  createDefaultBannerDesign,
  type BannerDesign,
} from "../lib/admin/banner-maker";
import {
  createBannerDesignEnvelope,
  type BannerDesignEnvelope,
} from "../lib/banner/envelope";
import {
  BANNER_LEGACY_CONFIG_KEY,
  BANNER_V2_CONFIG_KEYS,
} from "../lib/banner/destinations";

const { Client } = pg;
const TEST_DATABASE_ENV = "BANNER_MEDIA_SAFETY_TEST_DATABASE_URL";
const FALLBACK_DATABASE_ENV = "VERA_DISPOSABLE_DATABASE_URL";
const DISPOSABLE_ACK_ENV = "VERA_DISPOSABLE_DB_ACK";
const TABLES = ["assets", "media_folders", "system_configs", "audit_logs"] as const;
const PLACEHOLDER_ASSET_ID = "7ca953d0-0f55-43a4-a644-28bb3c6f741b";

type ProductionModules = {
  banner: typeof import("../lib/admin/banner-maker-repository");
  media: typeof import("../lib/media/repository");
  prisma: typeof import("../lib/prisma");
  r2: typeof import("../lib/media/r2");
  safety: typeof import("../lib/banner/media-safety");
};

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

type Outcome<T> =
  | { error?: never; ok: true; value: T }
  | { error: unknown; ok: false; value?: never };

type HeadMode = "match" | "mismatch";

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function settle<T>(promise: Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { error, ok: false };
  }
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
    console.log(`Banner media safety DB races skipped: ${TEST_DATABASE_ENV} or ${FALLBACK_DATABASE_ENV} is required; configured DATABASE_URL is never used.`);
    return null;
  }

  const identity = connectionIdentity(raw);
  const configured = process.env.DATABASE_URL?.trim();
  const configuredIdentity = configured ? connectionIdentity(configured) : null;
  assert.ok(
    ["postgres:", "postgresql:"].includes(identity.protocol),
    `${TEST_DATABASE_ENV} must use a PostgreSQL URL.`,
  );
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(identity.host),
    `${TEST_DATABASE_ENV} must use a local PostgreSQL host.`,
  );
  assert.ok(
    /(?:banner|media|safety|test)/iu.test(identity.databaseName)
      || (fallback && process.env[DISPOSABLE_ACK_ENV] === "1" && identity.databaseName === "vera_test"),
    `${TEST_DATABASE_ENV} must name a dedicated disposable banner/media test database.`,
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
  await client.query(`CREATE TYPE ${quotedSchema}."media_library_scope" AS ENUM ('kapten', 'admin')`);
  await client.query(`CREATE TYPE ${quotedSchema}."media_asset_state" AS ENUM ('pending', 'ready', 'trashed', 'failed')`);
  await client.query(`
    CREATE TABLE ${quotedSchema}."assets" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      uploaded_by_user_id uuid,
      folder_id uuid,
      library_scope ${quotedSchema}."media_library_scope" NOT NULL DEFAULT 'admin',
      state ${quotedSchema}."media_asset_state" NOT NULL DEFAULT 'ready',
      object_key varchar(512) UNIQUE,
      original_name varchar(255),
      url text,
      mime_type varchar(120) NOT NULL,
      size_bytes integer NOT NULL,
      width integer,
      height integer,
      checksum varchar(128),
      trashed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query(`
    CREATE TABLE ${quotedSchema}."media_folders" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      library_scope ${quotedSchema}."media_library_scope" NOT NULL,
      parent_id uuid,
      name varchar(160) NOT NULL,
      created_by_user_id uuid,
      trashed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  for (const table of TABLES) {
    if (table === "assets" || table === "media_folders") continue;
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
  const [{ prisma }, banner, media, r2, safety] = await Promise.all([
    import("../lib/prisma"),
    import("../lib/admin/banner-maker-repository"),
    import("../lib/media/repository"),
    import("../lib/media/r2"),
    import("../lib/banner/media-safety"),
  ]);
  return { banner, media, prisma: { prisma }, r2, safety };
}

async function clearFixture(client: pg.Client, schema: string) {
  const quotedSchema = quoteIdentifier(schema);
  await client.query(`TRUNCATE TABLE ${TABLES.map((table) => `${quotedSchema}.${quoteIdentifier(table)}`).join(", ")}`);
}

function createImageDesign(assetId: string): BannerDesign {
  return {
    ...createDefaultBannerDesign(),
    background: { assetId, type: "image" },
  };
}

function createEnvelope(design: BannerDesign | null): BannerDesignEnvelope {
  return createBannerDesignEnvelope(design, { revision: randomUUID() });
}

async function insertConfig(
  client: pg.Client,
  schema: string,
  configKey: string,
  configValue: unknown,
  draftValue: unknown = null,
) {
  await client.query(
    `INSERT INTO ${quoteIdentifier(schema)}."system_configs"
      (id, config_key, config_value, draft_value, updated_at)
     VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb, CURRENT_TIMESTAMP)`,
    [randomUUID(), configKey, JSON.stringify(configValue), draftValue === null ? null : JSON.stringify(draftValue)],
  );
}

function assertServiceError(
  outcome: Outcome<unknown>,
  MediaServiceError: ProductionModules["media"]["MediaServiceError"],
  messagePattern: RegExp,
) {
  assert.equal(outcome.ok, false, "the repository operation must reject");
  if (outcome.ok) return;
  assert.ok(outcome.error instanceof MediaServiceError, "the repository must expose its service error");
  if (outcome.error instanceof MediaServiceError) {
    assert.equal(outcome.error.status, 409);
    assert.match(outcome.error.message, messagePattern);
  }
}

function assertBannerValidationError(outcome: Outcome<unknown>, messagePattern: RegExp) {
  assert.equal(outcome.ok, false, "the banner writer must reject");
  if (outcome.ok) return;
  assert.ok(outcome.error instanceof BannerMakerValidationError, "the banner writer must expose its validation error");
  if (outcome.error instanceof BannerMakerValidationError) {
    assert.match(outcome.error.message, messagePattern);
  }
}

async function runLockOrderedRace<T, U>(
  safety: ProductionModules["safety"],
  first: () => Promise<T>,
  second: () => Promise<U>,
) {
  const firstLockHeld = deferred<void>();
  const releaseFirst = deferred<void>();
  let firstLock = true;

  return safety.withBannerMediaMutationTestHook(async () => {
    if (!firstLock) return;
    firstLock = false;
    firstLockHeld.resolve();
    await releaseFirst.promise;
  }, async () => {
    const firstPromise = settle(first());
    await firstLockHeld.promise;
    const secondPromise = settle(second());
    await Promise.resolve();
    releaseFirst.resolve();
    return { first: await firstPromise, second: await secondPromise };
  });
}

async function runHeadOrderedRace<T>(
  objectKey: string,
  headMode: HeadMode,
  setHeadGate: (gate: { mode: HeadMode; objectKey: string; started: Deferred<void>; release: Deferred<void> } | null) => void,
  finalize: () => Promise<T>,
  competitor: () => Promise<unknown>,
) {
  const started = deferred<void>();
  const release = deferred<void>();
  setHeadGate({ mode: headMode, objectKey, release, started });
  try {
    const finalizePromise = settle(finalize());
    await started.promise;
    const competitorOutcome = await settle(competitor());
    assert.equal(competitorOutcome.ok, true, "the competing move/trash must commit before storage verification resumes");
    release.resolve();
    return { competitor: competitorOutcome, finalize: await finalizePromise };
  } finally {
    release.resolve();
    setHeadGate(null);
  }
}

async function main() {
  const rawDatabaseUrl = readDisposableDatabaseUrl();
  if (!rawDatabaseUrl) return;

  const originalDatabaseUrl = process.env.DATABASE_URL;
  const setupClient = new Client({ connectionString: rawDatabaseUrl });
  const schema = `banner_safety_${randomUUID().replaceAll("-", "")}`;
  let production: ProductionModules | null = null;
  let storageObjects = new Map<string, { etag: string; mimeType: string; sizeBytes: number }>();
  let headGate: { mode: HeadMode; objectKey: string; started: Deferred<void>; release: Deferred<void> } | null = null;

  try {
    await setupClient.connect();
    await createIsolatedSchema(setupClient, schema);
    production = await loadProductionModules(schemaDatabaseUrl(rawDatabaseUrl, schema));
    const { banner, media, prisma: prismaModule, r2, safety } = production;
    const db = prismaModule.prisma;
    const actorUserId = randomUUID();

    await r2.withMediaStorageTestOverrides({
      createUploadUrl: async (objectKey, mimeType) => {
        storageObjects.set(objectKey, {
          etag: `etag-${objectKey}`,
          mimeType,
          sizeBytes: 10,
        });
        return {
          expiresInSeconds: 600,
          uploadUrl: `https://storage.test/upload/${encodeURIComponent(objectKey)}`,
        };
      },
      headObject: async (objectKey) => {
        const object = storageObjects.get(objectKey);
        assert.ok(object, `the fake object must exist for ${objectKey}`);
        const gate = headGate;
        if (gate?.objectKey === objectKey) {
          gate.started.resolve();
          await gate.release.promise;
        }
        const metadataMatches = gate?.objectKey === objectKey && gate.mode === "mismatch";
        return {
          ContentLength: metadataMatches ? object.sizeBytes + 1 : object.sizeBytes,
          ContentType: object.mimeType,
          ETag: `"${object.etag}"`,
        };
      },
    }, async () => {
      const requestUpload = (folderId: string | null = null) => media.requestMediaUpload({
        fileName: "banner.png",
        folderId,
        mimeType: "image/png",
        scope: "admin",
        sizeBytes: 10,
        uploadedByUserId: actorUserId,
      });

      const assetState = async (assetId: string) => db.asset.findUnique({
        select: { folderId: true, objectKey: true, state: true, trashedAt: true, checksum: true },
        where: { id: assetId },
      });
      const folderState = async (folderId: string) => db.mediaFolder.findUnique({
        select: { parentId: true, trashedAt: true },
        where: { id: folderId },
      });
      const configState = async (configKey: string) => db.systemConfig.findUnique({
        select: { configValue: true, draftValue: true, draftUpdatedAt: true },
        where: { configKey },
      });

      const createFolder = (name: string, parentId: string | null = null) => media.createMediaFolder({
        createdByUserId: actorUserId,
        name,
        parentId,
        scope: "admin",
      });

      const finalize = (assetId: string, width = 120, height = 60) => media.finalizeMediaUpload({
        assetId,
        height,
        scope: "admin",
        width,
      });

      const createReadyAsset = async (folderId: string | null = null) => {
        const ticket = await requestUpload(folderId);
        await finalize(ticket.assetId);
        return ticket;
      };

      const reset = async () => {
        await clearFixture(setupClient, schema);
        storageObjects = new Map();
        headGate = null;
      };

      const replaceAssetId = (value: unknown, assetId: string) => JSON.parse(JSON.stringify(value).replaceAll(PLACEHOLDER_ASSET_ID, assetId));

      // Exhaustive scanner fixtures: every retained v1/v2 published and draft column
      // must deny a real production trash operation when it references the asset.
      const validReferenceCases: Array<{
        configKey: string;
        configValue: unknown;
        draftValue: unknown;
        label: string;
      }> = [
        {
          configKey: BANNER_LEGACY_CONFIG_KEY,
          configValue: createDefaultBannerDesign(),
          draftValue: createImageDesign(PLACEHOLDER_ASSET_ID),
          label: "v1 draft",
        },
        {
          configKey: BANNER_LEGACY_CONFIG_KEY,
          configValue: createImageDesign(PLACEHOLDER_ASSET_ID),
          draftValue: null,
          label: "v1 published",
        },
        ...BANNER_V2_CONFIG_KEYS.flatMap((configKey) => [
          {
            configKey,
            configValue: createEnvelope(createImageDesign(PLACEHOLDER_ASSET_ID)),
            draftValue: null,
            label: `${configKey} published`,
          },
          {
            configKey,
            configValue: createEnvelope(null),
            draftValue: createEnvelope(createImageDesign(PLACEHOLDER_ASSET_ID)),
            label: `${configKey} draft`,
          },
        ]),
      ];

      for (const testCase of validReferenceCases) {
        await reset();
        const ticket = await createReadyAsset();
        await insertConfig(
          setupClient,
          schema,
          testCase.configKey,
          replaceAssetId(testCase.configValue, ticket.assetId),
          testCase.draftValue === null ? null : replaceAssetId(testCase.draftValue, ticket.assetId),
        );
        const denied = await settle(media.trashMediaAsset("admin", ticket.assetId));
        assertServiceError(denied, media.MediaServiceError, /masih digunakan|verifikasi/iu);
        assert.equal((await assetState(ticket.assetId))?.state, "ready", `${testCase.label} must roll back trash`);
      }

      // Every retained v1/v2 column must fail closed on malformed input.
      const malformedCases: Array<{ configKey: string; configValue: unknown; draftValue: unknown; label: string }> = [
        { configKey: BANNER_LEGACY_CONFIG_KEY, configValue: { invalid: true }, draftValue: null, label: "v1 published malformed" },
        { configKey: BANNER_LEGACY_CONFIG_KEY, configValue: createDefaultBannerDesign(), draftValue: { invalid: true }, label: "v1 draft malformed" },
        ...BANNER_V2_CONFIG_KEYS.flatMap((configKey) => [
          { configKey, configValue: { storageVersion: 1 }, draftValue: null, label: `${configKey} published malformed` },
          { configKey, configValue: createEnvelope(null), draftValue: { storageVersion: 1 }, label: `${configKey} draft malformed` },
        ]),
      ];

      for (const testCase of malformedCases) {
        await reset();
        const ticket = await createReadyAsset();
        await insertConfig(setupClient, schema, testCase.configKey, testCase.configValue, testCase.draftValue);
        const denied = await settle(media.trashMediaAsset("admin", ticket.assetId));
        assertServiceError(denied, media.MediaServiceError, /tidak dapat diverifikasi/iu);
        assert.equal((await assetState(ticket.assetId))?.state, "ready", `${testCase.label} must roll back trash`);
      }

      // Folder trash is all-or-nothing for both pending and ready descendants.
      await reset();
      const rollbackFolder = await createFolder("rollback");
      const rollbackPending = await requestUpload(rollbackFolder.id);
      const rollbackReady = await createReadyAsset(rollbackFolder.id);
      await insertConfig(setupClient, schema, BANNER_V2_CONFIG_KEYS[0], createEnvelope(createImageDesign(rollbackReady.assetId)), null);
      const folderDenied = await settle(media.trashMediaFolder("admin", rollbackFolder.id));
      assertServiceError(folderDenied, media.MediaServiceError, /masih digunakan/iu);
      assert.equal((await folderState(rollbackFolder.id))?.trashedAt, null);
      assert.equal((await assetState(rollbackPending.assetId))?.state, "pending");
      assert.equal((await assetState(rollbackReady.assetId))?.state, "ready");

      await reset();
      const successfulFolder = await createFolder("successful");
      const successfulPending = await requestUpload(successfulFolder.id);
      const successfulReady = await createReadyAsset(successfulFolder.id);
      const folderSuccess = await settle(media.trashMediaFolder("admin", successfulFolder.id));
      assert.equal(folderSuccess.ok, true);
      assert.ok((await folderState(successfulFolder.id))?.trashedAt);
      assert.equal((await assetState(successfulPending.assetId))?.state, "trashed");
      assert.equal((await assetState(successfulReady.assetId))?.state, "trashed");

      // Save/publish versus asset/folder trash covers every pairing in both
      // lock acquisition orders. Writer-first cases seed a draft for publish
      // before the race; trash-first publish cases deliberately leave no draft
      // that already references the image, because that draft would correctly
      // make the trash operation fail before publish gets the lock.
      await reset();
      const saveAssetWriterFirstFolder = await createFolder("save-asset-writer-first");
      const saveAssetWriterFirstAsset = await createReadyAsset(saveAssetWriterFirstFolder.id);
      const saveAssetWriterFirstDesign = createImageDesign(saveAssetWriterFirstAsset.assetId);
      const saveAssetWriterFirstRace = await runLockOrderedRace(
        safety,
        () => banner.saveBannerMakerDraft({ actorUserId, design: saveAssetWriterFirstDesign, expectedVersion: null }),
        () => media.trashMediaAsset("admin", saveAssetWriterFirstAsset.assetId),
      );
      assert.equal(saveAssetWriterFirstRace.first.ok, true);
      assertServiceError(saveAssetWriterFirstRace.second, media.MediaServiceError, /masih digunakan/iu);
      const saveAssetWriterFirstConfig = await configState(BANNER_LEGACY_CONFIG_KEY);
      assert.deepEqual(saveAssetWriterFirstConfig?.configValue, createDefaultBannerDesign());
      assert.deepEqual(saveAssetWriterFirstConfig?.draftValue, saveAssetWriterFirstDesign);
      assert.equal((await folderState(saveAssetWriterFirstFolder.id))?.trashedAt, null);
      assert.equal((await assetState(saveAssetWriterFirstAsset.assetId))?.state, "ready");

      await reset();
      const saveFolderWriterFirstFolder = await createFolder("save-folder-writer-first");
      const saveFolderWriterFirstAsset = await createReadyAsset(saveFolderWriterFirstFolder.id);
      const saveFolderWriterFirstDesign = createImageDesign(saveFolderWriterFirstAsset.assetId);
      const saveFolderWriterFirstRace = await runLockOrderedRace(
        safety,
        () => banner.saveBannerMakerDraft({ actorUserId, design: saveFolderWriterFirstDesign, expectedVersion: null }),
        () => media.trashMediaFolder("admin", saveFolderWriterFirstFolder.id),
      );
      assert.equal(saveFolderWriterFirstRace.first.ok, true);
      assertServiceError(saveFolderWriterFirstRace.second, media.MediaServiceError, /masih digunakan/iu);
      const saveFolderWriterFirstConfig = await configState(BANNER_LEGACY_CONFIG_KEY);
      assert.deepEqual(saveFolderWriterFirstConfig?.configValue, createDefaultBannerDesign());
      assert.deepEqual(saveFolderWriterFirstConfig?.draftValue, saveFolderWriterFirstDesign);
      assert.equal((await folderState(saveFolderWriterFirstFolder.id))?.trashedAt, null);
      assert.equal((await assetState(saveFolderWriterFirstAsset.assetId))?.state, "ready");

      await reset();
      const publishAssetWriterFirstFolder = await createFolder("publish-asset-writer-first");
      const publishAssetWriterFirstAsset = await createReadyAsset(publishAssetWriterFirstFolder.id);
      const publishAssetWriterFirstSavedDraft = await banner.saveBannerMakerDraft({
        actorUserId,
        design: createImageDesign(publishAssetWriterFirstAsset.assetId),
        expectedVersion: null,
      });
      const publishAssetWriterFirstRace = await runLockOrderedRace(
        safety,
        () => banner.publishBannerMakerDesign({
          actorUserId,
          design: publishAssetWriterFirstSavedDraft.design,
          expectedVersion: publishAssetWriterFirstSavedDraft.draftVersion,
        }),
        () => media.trashMediaAsset("admin", publishAssetWriterFirstAsset.assetId),
      );
      assert.equal(publishAssetWriterFirstRace.first.ok, true);
      assertServiceError(publishAssetWriterFirstRace.second, media.MediaServiceError, /masih digunakan/iu);
      const publishAssetWriterFirstConfig = await configState(BANNER_LEGACY_CONFIG_KEY);
      assert.deepEqual(publishAssetWriterFirstConfig?.configValue, publishAssetWriterFirstSavedDraft.design);
      assert.equal(publishAssetWriterFirstConfig?.draftValue, null);
      assert.equal((await folderState(publishAssetWriterFirstFolder.id))?.trashedAt, null);
      assert.equal((await assetState(publishAssetWriterFirstAsset.assetId))?.state, "ready");

      await reset();
      const publishFolderWriterFirstFolder = await createFolder("publish-folder-writer-first");
      const publishFolderWriterFirstAsset = await createReadyAsset(publishFolderWriterFirstFolder.id);
      const publishFolderWriterFirstSavedDraft = await banner.saveBannerMakerDraft({
        actorUserId,
        design: createImageDesign(publishFolderWriterFirstAsset.assetId),
        expectedVersion: null,
      });
      const persistedPublishDraft = await configState(BANNER_LEGACY_CONFIG_KEY);
      assert.equal(
        publishFolderWriterFirstSavedDraft.draftVersion,
        persistedPublishDraft?.draftUpdatedAt?.toISOString(),
        "publish must use the exact persisted PostgreSQL timestamptz version returned by save",
      );
      const publishFolderWriterFirstRace = await runLockOrderedRace(
        safety,
        () => banner.publishBannerMakerDesign({
          actorUserId,
          design: publishFolderWriterFirstSavedDraft.design,
          expectedVersion: publishFolderWriterFirstSavedDraft.draftVersion,
        }),
        () => media.trashMediaFolder("admin", publishFolderWriterFirstFolder.id),
      );
      assert.equal(
        publishFolderWriterFirstRace.first.ok,
        true,
        publishFolderWriterFirstRace.first.ok
          ? undefined
          : `publish failed: ${publishFolderWriterFirstRace.first.error instanceof Error ? `${publishFolderWriterFirstRace.first.error.name}: ${publishFolderWriterFirstRace.first.error.message}` : String(publishFolderWriterFirstRace.first.error)}`,
      );
      assertServiceError(publishFolderWriterFirstRace.second, media.MediaServiceError, /masih digunakan/iu);
      const publishFolderWriterFirstConfig = await configState(BANNER_LEGACY_CONFIG_KEY);
      assert.deepEqual(publishFolderWriterFirstConfig?.configValue, publishFolderWriterFirstSavedDraft.design);
      assert.equal(publishFolderWriterFirstConfig?.draftValue, null);
      assert.equal((await folderState(publishFolderWriterFirstFolder.id))?.trashedAt, null);
      assert.equal((await assetState(publishFolderWriterFirstAsset.assetId))?.state, "ready");

      await reset();
      const saveAssetTrashFirstFolder = await createFolder("save-asset-trash-first");
      const saveAssetTrashFirstAsset = await createReadyAsset(saveAssetTrashFirstFolder.id);
      const saveAssetTrashFirstRace = await runLockOrderedRace(
        safety,
        () => media.trashMediaAsset("admin", saveAssetTrashFirstAsset.assetId),
        () => banner.saveBannerMakerDraft({
          actorUserId,
          design: createImageDesign(saveAssetTrashFirstAsset.assetId),
          expectedVersion: null,
        }),
      );
      assert.equal(saveAssetTrashFirstRace.first.ok, true);
      assertBannerValidationError(saveAssetTrashFirstRace.second, /masih tersedia/iu);
      assert.equal((await folderState(saveAssetTrashFirstFolder.id))?.trashedAt, null);
      assert.equal((await assetState(saveAssetTrashFirstAsset.assetId))?.state, "trashed");
      assert.equal(await configState(BANNER_LEGACY_CONFIG_KEY), null);

      await reset();
      const saveFolderTrashFirstFolder = await createFolder("save-folder-trash-first");
      const saveFolderTrashFirstAsset = await createReadyAsset(saveFolderTrashFirstFolder.id);
      const saveFolderTrashFirstRace = await runLockOrderedRace(
        safety,
        () => media.trashMediaFolder("admin", saveFolderTrashFirstFolder.id),
        () => banner.saveBannerMakerDraft({
          actorUserId,
          design: createImageDesign(saveFolderTrashFirstAsset.assetId),
          expectedVersion: null,
        }),
      );
      assert.equal(saveFolderTrashFirstRace.first.ok, true);
      assertBannerValidationError(saveFolderTrashFirstRace.second, /masih tersedia/iu);
      assert.ok((await folderState(saveFolderTrashFirstFolder.id))?.trashedAt);
      assert.equal((await assetState(saveFolderTrashFirstAsset.assetId))?.state, "trashed");
      assert.equal(await configState(BANNER_LEGACY_CONFIG_KEY), null);

      await reset();
      const publishAssetTrashFirstFolder = await createFolder("publish-asset-trash-first");
      const publishAssetTrashFirstAsset = await createReadyAsset(publishAssetTrashFirstFolder.id);
      const publishAssetTrashFirstRace = await runLockOrderedRace(
        safety,
        () => media.trashMediaAsset("admin", publishAssetTrashFirstAsset.assetId),
        () => banner.publishBannerMakerDesign({
          actorUserId,
          design: createImageDesign(publishAssetTrashFirstAsset.assetId),
          expectedVersion: null,
        }),
      );
      assert.equal(publishAssetTrashFirstRace.first.ok, true);
      assertBannerValidationError(publishAssetTrashFirstRace.second, /masih tersedia/iu);
      assert.equal((await folderState(publishAssetTrashFirstFolder.id))?.trashedAt, null);
      assert.equal((await assetState(publishAssetTrashFirstAsset.assetId))?.state, "trashed");
      assert.equal(await configState(BANNER_LEGACY_CONFIG_KEY), null);

      await reset();
      const publishFolderTrashFirstFolder = await createFolder("publish-folder-trash-first");
      const publishFolderTrashFirstAsset = await createReadyAsset(publishFolderTrashFirstFolder.id);
      const publishFolderTrashFirstRace = await runLockOrderedRace(
        safety,
        () => media.trashMediaFolder("admin", publishFolderTrashFirstFolder.id),
        () => banner.publishBannerMakerDesign({
          actorUserId,
          design: createImageDesign(publishFolderTrashFirstAsset.assetId),
          expectedVersion: null,
        }),
      );
      assert.equal(publishFolderTrashFirstRace.first.ok, true);
      assertBannerValidationError(publishFolderTrashFirstRace.second, /masih tersedia/iu);
      assert.ok((await folderState(publishFolderTrashFirstFolder.id))?.trashedAt);
      assert.equal((await assetState(publishFolderTrashFirstAsset.assetId))?.state, "trashed");
      assert.equal(await configState(BANNER_LEGACY_CONFIG_KEY), null);

      // Folder creation and folder move both serialize before subtree trash.
      await reset();
      const topologyRoot = await createFolder("topology-root");
      const createRace = await runLockOrderedRace(
        safety,
        () => createFolder("topology-child", topologyRoot.id),
        () => media.trashMediaFolder("admin", topologyRoot.id),
      );
      assert.equal(createRace.first.ok, true);
      assert.equal(createRace.second.ok, true);
      if (createRace.first.ok) assert.ok((await folderState(createRace.first.value.id))?.trashedAt);
      assert.ok((await folderState(topologyRoot.id))?.trashedAt);

      await reset();
      const moveSource = await createFolder("move-source");
      const moveDestination = await createFolder("move-destination");
      const moveRace = await runLockOrderedRace(
        safety,
        () => media.moveMediaFolder({ folderId: moveSource.id, parentId: moveDestination.id, scope: "admin" }),
        () => media.trashMediaFolder("admin", moveDestination.id),
      );
      assert.equal(moveRace.first.ok, true);
      assert.equal(moveRace.second.ok, true);
      assert.equal((await folderState(moveSource.id))?.parentId, moveDestination.id);
      assert.ok((await folderState(moveSource.id))?.trashedAt);
      assert.ok((await folderState(moveDestination.id))?.trashedAt);

      // Upload-ticket creation versus folder trash uses the real request path,
      // including the signed-ticket seam and the pending asset transition.
      await reset();
      const uploadRoot = await createFolder("upload-race");
      const uploadRace = await runLockOrderedRace(
        safety,
        () => requestUpload(uploadRoot.id),
        () => media.trashMediaFolder("admin", uploadRoot.id),
      );
      assert.equal(uploadRace.first.ok, true);
      assert.equal(uploadRace.second.ok, true);
      if (uploadRace.first.ok) assert.equal((await assetState(uploadRace.first.value.assetId))?.state, "trashed");
      assert.ok((await folderState(uploadRoot.id))?.trashedAt);

      // A same-object verified ready upload is explicitly idempotent.
      await reset();
      const idempotent = await createReadyAsset();
      const secondFinalize = await settle(finalize(idempotent.assetId));
      assert.equal(secondFinalize.ok, true);
      assert.equal((await assetState(idempotent.assetId))?.state, "ready");

      // Finalize versus a real asset move: HEAD is outside the lock, then the
      // re-read rejects the stale folder identity rather than overwriting it.
      await reset();
      const moveFinalizeSource = await createFolder("finalize-move-source");
      const moveFinalizeDestination = await createFolder("finalize-move-destination");
      const moveFinalizeAsset = await createReadyAsset(moveFinalizeSource.id);
      const moveFinalizeObjectKey = (await assetState(moveFinalizeAsset.assetId))?.objectKey;
      assert.ok(moveFinalizeObjectKey);
      const finalizeMoveRace = await runHeadOrderedRace(
        moveFinalizeObjectKey,
        "match",
        (gate) => { headGate = gate; },
        () => finalize(moveFinalizeAsset.assetId),
        () => media.moveMediaAsset({ assetId: moveFinalizeAsset.assetId, folderId: moveFinalizeDestination.id, scope: "admin" }),
      );
      assertServiceError(finalizeMoveRace.finalize, media.MediaServiceError, /Upload berubah/iu);
      assert.equal((await assetState(moveFinalizeAsset.assetId))?.folderId, moveFinalizeDestination.id);
      assert.equal((await assetState(moveFinalizeAsset.assetId))?.state, "ready");

      // Late successful verification after trash must not revive the asset.
      await reset();
      const lateSuccess = await requestUpload();
      const lateSuccessObjectKey = (await assetState(lateSuccess.assetId))?.objectKey;
      assert.ok(lateSuccessObjectKey);
      const lateSuccessRace = await runHeadOrderedRace(
        lateSuccessObjectKey,
        "match",
        (gate) => { headGate = gate; },
        () => finalize(lateSuccess.assetId),
        () => media.trashMediaAsset("admin", lateSuccess.assetId),
      );
      assertServiceError(lateSuccessRace.finalize, media.MediaServiceError, /Upload berubah/iu);
      assert.equal((await assetState(lateSuccess.assetId))?.state, "trashed");

      // A late metadata mismatch after trash must also leave the row trashed,
      // not transition it to failed through a stale verifier.
      await reset();
      const lateMismatch = await requestUpload();
      const lateMismatchObjectKey = (await assetState(lateMismatch.assetId))?.objectKey;
      assert.ok(lateMismatchObjectKey);
      const lateMismatchRace = await runHeadOrderedRace(
        lateMismatchObjectKey,
        "mismatch",
        (gate) => { headGate = gate; },
        () => finalize(lateMismatch.assetId),
        () => media.trashMediaAsset("admin", lateMismatch.assetId),
      );
      assertServiceError(lateMismatchRace.finalize, media.MediaServiceError, /tidak sesuai/iu);
      assert.equal((await assetState(lateMismatch.assetId))?.state, "trashed");

      console.log("banner media safety production DB races passed");
    });

    await db.$disconnect();
  } finally {
    await setupClient.query("ROLLBACK").catch(() => undefined);
    await dropIsolatedSchema(setupClient, schema).catch(() => undefined);
    await setupClient.end().catch(() => undefined);
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
}

await main();

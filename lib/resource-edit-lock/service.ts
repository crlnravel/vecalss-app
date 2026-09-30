import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { acquireBannerMediaMutationLock } from "@/lib/banner/media-safety";
import { prisma } from "@/lib/prisma";
import {
  acquireResourceEditKey,
  withSerializationLockTimeout,
} from "@/lib/serialization/locks";

import {
  canonicalizeResourceKey,
  InvalidResourceKeyError,
  isLeaseInstanceToken,
  isUuid,
  isPositiveGeneration,
} from "./canonical";
import {
  EDIT_LEASE_RESOURCE_TYPES,
  EDIT_LEASE_TTL_MS,
  type EditLeaseResourceType,
  type EditLeaseServerStatus,
} from "./types";

const EDIT_LEASE_DURATION_MS = EDIT_LEASE_TTL_MS;

type EditLeaseDatabaseClient = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

type CanonicalResource = {
  resourceId: string;
  resourceKey: string;
  resourceType: EditLeaseResourceType;
};

type AcquireEditLeaseInput = CanonicalResource & {
  holderUserId: string;
  newToken: string;
};

type RotateEditLeaseInput = CanonicalResource & {
  holderUserId: string;
  newToken: string;
  previousGeneration: number;
  previousToken: string;
};

type ProofEditLeaseInput = CanonicalResource & {
  generation: number;
  holderUserId: string;
  token: string;
};

type TransientEditLeaseInput = {
  holderUserId: string;
  resourceId: unknown;
  resourceType: unknown;
};

type RawLeaseRow = {
  acquiredAt: Date;
  expiresAt: Date;
  generation: number;
  heartbeatAt: Date;
  holderEmail: string;
  holderName: string;
  holderUserId: string;
  releasedAt: Date | null;
  resourceId: string;
  resourceType: string;
  tokenDigest: string;
};

type RawLeaseCandidate = {
  resourceId: string;
  resourceType: string;
};

type EditLeaseErrorCode =
  | "invalid_proof"
  | "lease_expired"
  | "lease_superseded"
  | "resource_inaccessible"
  | "resource_locked";

class EditLeaseServiceError extends Error {
  readonly status: 403 | 409 | 422;

  constructor(
    readonly code: EditLeaseErrorCode,
    status: 403 | 409 | 422,
    message = "Resource edit proof tidak valid.",
  ) {
    super(message);
    this.name = "EditLeaseServiceError";
    this.status = status;
  }
}

function isEditLeaseResourceType(value: string): value is EditLeaseResourceType {
  return (EDIT_LEASE_RESOURCE_TYPES as readonly string[]).includes(value);
}

function digestLeaseToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function sameDigest(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function ensureHolderId(holderUserId: string) {
  if (!isUuid(holderUserId)) {
    throw new EditLeaseServiceError("invalid_proof", 422);
  }
}

function ensureToken(token: string) {
  if (!isLeaseInstanceToken(token)) {
    throw new EditLeaseServiceError("invalid_proof", 422);
  }
}

function ensureGeneration(generation: number) {
  if (!isPositiveGeneration(generation)) {
    throw new EditLeaseServiceError("invalid_proof", 422);
  }
}

function canonicalResource(resourceType: unknown, resourceId: unknown): CanonicalResource {
  try {
    return canonicalizeResourceKey(resourceType, resourceId);
  } catch (error) {
    if (error instanceof InvalidResourceKeyError) throw error;
    throw new EditLeaseServiceError("invalid_proof", 422);
  }
}

function prepareAcquire(input: {
  holderUserId: string;
  newToken: string;
  resourceId: unknown;
  resourceType: unknown;
}): AcquireEditLeaseInput {
  ensureHolderId(input.holderUserId);
  ensureToken(input.newToken);
  return { ...canonicalResource(input.resourceType, input.resourceId), holderUserId: input.holderUserId, newToken: input.newToken };
}

function prepareRotate(input: {
  holderUserId: string;
  newToken: string;
  previousGeneration: number;
  previousToken: string;
  resourceId: unknown;
  resourceType: unknown;
}): RotateEditLeaseInput {
  ensureHolderId(input.holderUserId);
  ensureToken(input.previousToken);
  ensureToken(input.newToken);
  ensureGeneration(input.previousGeneration);
  return {
    ...canonicalResource(input.resourceType, input.resourceId),
    holderUserId: input.holderUserId,
    newToken: input.newToken,
    previousGeneration: input.previousGeneration,
    previousToken: input.previousToken,
  };
}

function prepareProof(input: {
  generation: number;
  holderUserId: string;
  resourceId: unknown;
  resourceType: unknown;
  token: string;
}): ProofEditLeaseInput {
  ensureHolderId(input.holderUserId);
  ensureToken(input.token);
  ensureGeneration(input.generation);
  return {
    ...canonicalResource(input.resourceType, input.resourceId),
    generation: input.generation,
    holderUserId: input.holderUserId,
    token: input.token,
  };
}

async function databaseNow(db: EditLeaseDatabaseClient) {
  const rows = await db.$queryRaw<Array<{ serverNow: Date }>>`
    SELECT clock_timestamp() AS "serverNow"
  `;
  const serverNow = rows[0]?.serverNow;
  if (!(serverNow instanceof Date) || Number.isNaN(serverNow.getTime())) {
    throw new Error("PostgreSQL did not return a valid lease clock.");
  }
  return serverNow;
}

function isMediaResource(resourceType: EditLeaseResourceType) {
  return resourceType === "media_asset" || resourceType === "media_folder";
}

async function resourceExists(
  db: EditLeaseDatabaseClient,
  resource: CanonicalResource,
  holderUserId?: string,
) {
  const owner = holderUserId
    ? Prisma.sql`AND "created_by_user_id" = ${holderUserId}::uuid`
    : Prisma.empty;
  let rows: Array<{ exists: boolean }>;

  switch (resource.resourceType) {
    case "materi":
      rows = await db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM "modules"
          WHERE "code" = ${resource.resourceId}
            ${owner}
        ) AS "exists"
      `;
      break;
    case "quiz":
      rows = await db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM "standalone_quizzes"
          WHERE "id" = ${resource.resourceId}::uuid
            ${owner}
        ) AS "exists"
      `;
      break;
    case "question_bank":
      rows = await db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM "question_banks"
          WHERE "id" = ${resource.resourceId}::uuid
            ${owner}
        ) AS "exists"
      `;
      break;
    case "question_package":
      rows = await db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM "reusable_question_packages"
          WHERE "id" = ${resource.resourceId}::uuid
            ${owner}
        ) AS "exists"
      `;
      break;
    case "tryout":
      rows = await db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM "tryout_packages"
          WHERE "id" = ${resource.resourceId}::uuid
            ${owner}
        ) AS "exists"
      `;
      break;
    case "media_asset":
      rows = await db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM "assets"
          WHERE "id" = ${resource.resourceId}::uuid
            AND "library_scope" = 'kapten'::media_library_scope
            AND "state" <> 'trashed'::media_asset_state
        ) AS "exists"
      `;
      break;
    case "media_folder":
      rows = await db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM "media_folders"
          WHERE "id" = ${resource.resourceId}::uuid
            AND "library_scope" = 'kapten'::media_library_scope
            AND "trashed_at" IS NULL
        ) AS "exists"
      `;
      break;
    default:
      return false;
  }

  return rows[0]?.exists === true;
}

async function assertResourceAccessible(
  db: EditLeaseDatabaseClient,
  resource: CanonicalResource,
  holderUserId: string,
) {
  if (!(await resourceExists(db, resource, holderUserId))) {
    throw new EditLeaseServiceError(
      "resource_inaccessible",
      403,
      "Resource edit tidak tersedia.",
    );
  }
}

async function preflightResource(resource: CanonicalResource, holderUserId: string) {
  await assertResourceAccessible(prisma, resource, holderUserId);
}

async function acquireResourceBoundary(
  tx: Prisma.TransactionClient,
  resource: CanonicalResource,
) {
  if (isMediaResource(resource.resourceType)) {
    // All Media lease transitions use the existing Level-0 banner/media
    // mutex before their Level-1 resource key.
    await acquireBannerMediaMutationLock(tx);
  }
  await acquireResourceEditKey(tx, resource.resourceType, resource.resourceId);
}

async function withLeaseTransaction<T>(
  resource: CanonicalResource,
  holderUserId: string,
  callback: (tx: Prisma.TransactionClient, serverNow: Date) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => withSerializationLockTimeout(tx, async () => {
    await acquireResourceBoundary(tx, resource);
    // This is deliberately repeated after the advisory lock. The preliminary
    // query is only a cheap non-enumerating denial; this query closes the
    // check/use race before any lease row is read or written.
    await assertResourceAccessible(tx, resource, holderUserId);
    const serverNow = await databaseNow(tx);
    return callback(tx, serverNow);
  }));
}

async function readLease(db: EditLeaseDatabaseClient, resource: CanonicalResource) {
  const rows = await db.$queryRaw<RawLeaseRow[]>`
    SELECT
      lease."resource_type"::text AS "resourceType",
      lease."resource_id" AS "resourceId",
      lease."holder_user_id"::text AS "holderUserId",
      lease."token_digest" AS "tokenDigest",
      lease."generation" AS "generation",
      lease."acquired_at" AS "acquiredAt",
      lease."heartbeat_at" AS "heartbeatAt",
      lease."expires_at" AS "expiresAt",
      lease."released_at" AS "releasedAt",
      holder."full_name" AS "holderName",
      holder."email" AS "holderEmail"
    FROM "edit_leases" AS lease
    JOIN "users" AS holder ON holder."id" = lease."holder_user_id"
    WHERE lease."resource_type" = ${resource.resourceType}::edit_lease_resource_type
      AND lease."resource_id" = ${resource.resourceId}
  `;
  return rows[0] ?? null;
}

function remainingMs(expiresAt: Date, serverNow: Date) {
  return Math.max(0, Math.floor(expiresAt.getTime() - serverNow.getTime()));
}

function ownedStatus(lease: RawLeaseRow, serverNow: Date): EditLeaseServerStatus {
  return {
    generation: lease.generation,
    remainingMs: remainingMs(lease.expiresAt, serverNow),
    serverNow: serverNow.toISOString(),
    state: "owned",
  };
}

function lockedStatus(lease: RawLeaseRow, serverNow: Date): EditLeaseServerStatus {
  return {
    holderEmail: lease.holderEmail,
    holderName: lease.holderName,
    holderUserId: lease.holderUserId,
    remainingMs: remainingMs(lease.expiresAt, serverNow),
    serverNow: serverNow.toISOString(),
    state: "locked",
  };
}

function activeLease(lease: RawLeaseRow | null, serverNow: Date) {
  return Boolean(lease && lease.releasedAt === null && lease.expiresAt.getTime() > serverNow.getTime());
}

async function acquireEditLease(input: {
  holderUserId: string;
  newToken: string;
  resourceId: unknown;
  resourceType: unknown;
}) {
  const prepared = prepareAcquire(input);
  await preflightResource(prepared, prepared.holderUserId);

  return withLeaseTransaction(prepared, prepared.holderUserId, async (tx, serverNow) => {
    const current = await readLease(tx, prepared);
    if (activeLease(current, serverNow)) {
      return lockedStatus(current!, serverNow);
    }

    const expiresAt = new Date(serverNow.getTime() + EDIT_LEASE_DURATION_MS);
    await tx.$executeRaw`
      INSERT INTO "edit_leases" (
        "resource_type", "resource_id", "holder_user_id", "token_digest",
        "generation", "acquired_at", "heartbeat_at", "expires_at", "released_at"
      ) VALUES (
        ${prepared.resourceType}::edit_lease_resource_type,
        ${prepared.resourceId},
        ${prepared.holderUserId}::uuid,
        ${digestLeaseToken(prepared.newToken)},
        1,
        ${serverNow},
        ${serverNow},
        ${expiresAt},
        NULL
      )
      ON CONFLICT ("resource_type", "resource_id") DO UPDATE SET
        "holder_user_id" = EXCLUDED."holder_user_id",
        "token_digest" = EXCLUDED."token_digest",
        "generation" = "edit_leases"."generation" + 1,
        "acquired_at" = EXCLUDED."acquired_at",
        "heartbeat_at" = EXCLUDED."heartbeat_at",
        "expires_at" = EXCLUDED."expires_at",
        "released_at" = NULL
    `;

    const granted = await readLease(tx, prepared);
    if (!granted) throw new Error("Edit lease grant did not return a row.");
    return ownedStatus(granted, serverNow);
  });
}

async function rotateEditLease(input: {
  holderUserId: string;
  newToken: string;
  previousGeneration: number;
  previousToken: string;
  resourceId: unknown;
  resourceType: unknown;
}) {
  const prepared = prepareRotate(input);
  await preflightResource(prepared, prepared.holderUserId);

  return withLeaseTransaction(prepared, prepared.holderUserId, async (tx, serverNow) => {
    const current = await readLease(tx, prepared);
    const previousDigest = digestLeaseToken(prepared.previousToken);
    if (
      !current
      || current.releasedAt !== null
      || current.expiresAt.getTime() <= serverNow.getTime()
      || current.holderUserId !== prepared.holderUserId
      || current.generation !== prepared.previousGeneration
      || !sameDigest(current.tokenDigest, previousDigest)
    ) {
      throw new EditLeaseServiceError("lease_superseded", 409, "Izin edit telah digantikan.");
    }

    const expiresAt = new Date(serverNow.getTime() + EDIT_LEASE_DURATION_MS);
    const rows = await tx.$queryRaw<Array<{ generation: number }>>`
      UPDATE "edit_leases"
      SET "token_digest" = ${digestLeaseToken(prepared.newToken)},
          "generation" = "generation" + 1,
          "heartbeat_at" = ${serverNow},
          "expires_at" = ${expiresAt},
          "released_at" = NULL
      WHERE "resource_type" = ${prepared.resourceType}::edit_lease_resource_type
        AND "resource_id" = ${prepared.resourceId}
        AND "holder_user_id" = ${prepared.holderUserId}::uuid
        AND "token_digest" = ${previousDigest}
        AND "generation" = ${prepared.previousGeneration}
        AND "released_at" IS NULL
        AND "expires_at" > ${serverNow}
      RETURNING "generation"
    `;
    if (!rows[0]) throw new EditLeaseServiceError("lease_superseded", 409, "Izin edit telah digantikan.");

    const rotated = await readLease(tx, prepared);
    if (!rotated) throw new EditLeaseServiceError("lease_superseded", 409, "Izin edit telah digantikan.");
    return ownedStatus(rotated, serverNow);
  });
}

async function renewEditLease(input: {
  generation: number;
  holderUserId: string;
  resourceId: unknown;
  resourceType: unknown;
  token: string;
}) {
  const prepared = prepareProof(input);
  await preflightResource(prepared, prepared.holderUserId);

  return withLeaseTransaction(prepared, prepared.holderUserId, async (tx, serverNow) => {
    const current = await readLease(tx, prepared);
    if (!current || current.holderUserId !== prepared.holderUserId || current.generation !== prepared.generation || !sameDigest(current.tokenDigest, digestLeaseToken(prepared.token))) {
      throw new EditLeaseServiceError("lease_superseded", 409, "Izin edit telah digantikan.");
    }
    if (current.releasedAt !== null || current.expiresAt.getTime() <= serverNow.getTime()) {
      throw new EditLeaseServiceError("lease_expired", 409, "Izin edit telah berakhir.");
    }

    const expiresAt = new Date(serverNow.getTime() + EDIT_LEASE_DURATION_MS);
    const rows = await tx.$queryRaw<Array<{ generation: number }>>`
      UPDATE "edit_leases"
      SET "heartbeat_at" = ${serverNow}, "expires_at" = ${expiresAt}
      WHERE "resource_type" = ${prepared.resourceType}::edit_lease_resource_type
        AND "resource_id" = ${prepared.resourceId}
        AND "holder_user_id" = ${prepared.holderUserId}::uuid
        AND "token_digest" = ${digestLeaseToken(prepared.token)}
        AND "generation" = ${prepared.generation}
        AND "released_at" IS NULL
        AND "expires_at" > ${serverNow}
      RETURNING "generation"
    `;
    if (!rows[0]) throw new EditLeaseServiceError("lease_expired", 409, "Izin edit telah berakhir.");

    const renewed = await readLease(tx, prepared);
    if (!renewed) throw new EditLeaseServiceError("lease_expired", 409, "Izin edit telah berakhir.");
    return ownedStatus(renewed, serverNow);
  });
}

async function releaseEditLease(input: {
  generation: number;
  holderUserId: string;
  resourceId: unknown;
  resourceType: unknown;
  token: string;
}) {
  const prepared = prepareProof(input);
  await preflightResource(prepared, prepared.holderUserId);

  await withLeaseTransaction(prepared, prepared.holderUserId, async (tx, serverNow) => {
    await tx.$executeRaw`
      UPDATE "edit_leases"
      SET "released_at" = ${serverNow}
      WHERE "resource_type" = ${prepared.resourceType}::edit_lease_resource_type
        AND "resource_id" = ${prepared.resourceId}
        AND "holder_user_id" = ${prepared.holderUserId}::uuid
        AND "token_digest" = ${digestLeaseToken(prepared.token)}
        AND "generation" = ${prepared.generation}
        AND "released_at" IS NULL
        AND "expires_at" > ${serverNow}
    `;
  });
}

/**
 * Generic mutation boundary for registry-backed writers. It owns the same
 * advisory/resource revalidation sequence as the transport commands so a
 * delayed save cannot cross a rotate or expiry transition.
 */
async function assertEditLease(
  tx: Prisma.TransactionClient,
  input: {
    generation: number;
    holderUserId: string;
    resourceId: unknown;
    resourceType: unknown;
    token: string;
  },
) {
  const prepared = prepareProof(input);
  return withSerializationLockTimeout(tx, async () => {
    await acquireResourceBoundary(tx, prepared);
    await assertResourceAccessible(tx, prepared, prepared.holderUserId);
    const serverNow = await databaseNow(tx);
    // react-doctor-disable-next-line server-sequential-independent-await -- read time and lease state from the same transaction snapshot.
    const current = await readLease(tx, prepared);
    if (!current || current.holderUserId !== prepared.holderUserId || current.generation !== prepared.generation || !sameDigest(current.tokenDigest, digestLeaseToken(prepared.token))) {
      throw new EditLeaseServiceError("lease_superseded", 409, "Izin edit telah digantikan.");
    }
    if (current.releasedAt !== null || current.expiresAt.getTime() <= serverNow.getTime()) {
      throw new EditLeaseServiceError("lease_expired", 409, "Izin edit telah berakhir.");
    }
    return ownedStatus(current, serverNow);
  });
}

/**
 * Acquire server-owned one-shot edit claims inside an already-open mutation
 * transaction. Callers must hold every required Level-0 domain mutex before
 * entering this helper. Resource edit keys are acquired in canonical order,
 * and the claims are released before the callback returns. A callback error
 * is intentionally allowed to abort the enclosing transaction so no claim or
 * domain write can escape partially.
 *
 * Tokens never leave this function. The callback receives only canonical
 * resource identities; the helper asserts each newly granted proof before it
 * invokes the callback, so the first domain row lock is fenced by the same
 * lease boundary as a dedicated editor mutation.
 */
async function withTransientEditLeases<T>(
  tx: Prisma.TransactionClient,
  inputs: readonly TransientEditLeaseInput[],
  callback: (resources: readonly CanonicalResource[]) => Promise<T>,
) {
  const resources = inputs
    .map((input) => {
      ensureHolderId(input.holderUserId);
      return {
        ...canonicalResource(input.resourceType, input.resourceId),
        holderUserId: input.holderUserId,
      };
    })
    .sort((left, right) => left.resourceKey.localeCompare(right.resourceKey));
  const holderUserId = resources[0]?.holderUserId;
  if (resources.some((resource) => resource.holderUserId !== holderUserId)) {
    throw new EditLeaseServiceError("invalid_proof", 422, "Resource edit proof tidak valid.");
  }
  for (let index = 1; index < resources.length; index += 1) {
    if (resources[index - 1]!.resourceKey === resources[index]!.resourceKey) {
      throw new EditLeaseServiceError("invalid_proof", 422, "Resource edit proof tidak valid.");
    }
  }
  const claimHolderUserId = holderUserId!;

  return withSerializationLockTimeout(tx, async () => {
    const claims: Array<{
      generation: number;
      resource: CanonicalResource;
      token: string;
    }> = [];

    for (const prepared of resources) {
      // react-doctor-disable-next-line async-await-in-loop -- acquire resource claims in canonical order to prevent deadlocks.
      await acquireResourceBoundary(tx, prepared);
      await assertResourceAccessible(tx, prepared, prepared.holderUserId);
      const serverNow = await databaseNow(tx);
      const current = await readLease(tx, prepared);
      if (activeLease(current, serverNow)) {
        throw new EditLeaseServiceError("resource_locked", 409, "Resource sedang diedit pengguna lain.");
      }

      const token = randomBytes(32).toString("base64url");
      const generation = (current?.generation ?? 0) + 1;
      const expiresAt = new Date(serverNow.getTime() + EDIT_LEASE_DURATION_MS);
      await tx.$executeRaw`
        INSERT INTO "edit_leases" (
          "resource_type", "resource_id", "holder_user_id", "token_digest",
          "generation", "acquired_at", "heartbeat_at", "expires_at", "released_at"
        ) VALUES (
          ${prepared.resourceType}::edit_lease_resource_type,
          ${prepared.resourceId},
          ${prepared.holderUserId}::uuid,
          ${digestLeaseToken(token)},
          ${generation},
          ${serverNow},
          ${serverNow},
          ${expiresAt},
          NULL
        )
        ON CONFLICT ("resource_type", "resource_id") DO UPDATE SET
          "holder_user_id" = EXCLUDED."holder_user_id",
          "token_digest" = EXCLUDED."token_digest",
          "generation" = EXCLUDED."generation",
          "acquired_at" = EXCLUDED."acquired_at",
          "heartbeat_at" = EXCLUDED."heartbeat_at",
          "expires_at" = EXCLUDED."expires_at",
          "released_at" = NULL
      `;
      const granted = await readLease(tx, prepared);
      if (
        !granted
        || granted.holderUserId !== prepared.holderUserId
        || granted.generation !== generation
        || !sameDigest(granted.tokenDigest, digestLeaseToken(token))
        || !activeLease(granted, serverNow)
      ) {
        throw new EditLeaseServiceError("lease_superseded", 409, "Izin edit telah digantikan.");
      }
      claims.push({ generation, resource: prepared, token });
    }

    // The generated proofs are deliberately asserted before callback control
    // reaches any family repository row lock or write.
    for (const claim of claims) {
      // react-doctor-disable-next-line async-await-in-loop -- revalidate each lease in the same deterministic order as acquisition.
      const serverNow = await databaseNow(tx);
      const current = await readLease(tx, claim.resource);
      if (
        !current
        || current.holderUserId !== claimHolderUserId
        || current.generation !== claim.generation
        || !sameDigest(current.tokenDigest, digestLeaseToken(claim.token))
        || current.releasedAt !== null
        || current.expiresAt.getTime() <= serverNow.getTime()
      ) {
        throw new EditLeaseServiceError("lease_superseded", 409, "Izin edit telah digantikan.");
      }
    }

    const result = await callback(resources.map(({ holderUserId: _holderUserId, ...resource }) => resource));
    for (const claim of claims) {
      // react-doctor-disable-next-line async-await-in-loop -- release every claim after the callback in canonical order.
      const serverNow = await databaseNow(tx);
      await tx.$executeRaw`
        UPDATE "edit_leases"
        SET "released_at" = ${serverNow}
        WHERE "resource_type" = ${claim.resource.resourceType}::edit_lease_resource_type
          AND "resource_id" = ${claim.resource.resourceId}
          AND "holder_user_id" = ${claimHolderUserId}::uuid
          AND "token_digest" = ${digestLeaseToken(claim.token)}
          AND "generation" = ${claim.generation}
          AND "released_at" IS NULL
          AND "expires_at" > ${serverNow}
      `;
    }
    return result;
  });
}

async function deleteEditLeaseForResource(resourceType: unknown, resourceId: unknown) {
  const resource = canonicalResource(resourceType, resourceId);
  return prisma.$transaction(async (tx) => withSerializationLockTimeout(tx, async () => {
    await acquireResourceBoundary(tx, resource);
    return tx.$executeRaw`
      DELETE FROM "edit_leases"
      WHERE "resource_type" = ${resource.resourceType}::edit_lease_resource_type
        AND "resource_id" = ${resource.resourceId}
    `;
  }));
}

async function cleanupOrphanedEditLeases(limit = 100) {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 500) {
    throw new RangeError("Edit lease cleanup limit must be between 1 and 500.");
  }

  const candidates = await prisma.$queryRaw<RawLeaseCandidate[]>`
    SELECT "resource_type"::text AS "resourceType", "resource_id" AS "resourceId"
    FROM "edit_leases"
    WHERE "released_at" IS NOT NULL OR "expires_at" <= clock_timestamp()
    ORDER BY "resource_type"::text ASC, "resource_id" ASC
    LIMIT ${limit}
  `;

  let deleted = 0;
  for (const candidate of candidates) {
    if (!isEditLeaseResourceType(candidate.resourceType)) continue;
    let resource: CanonicalResource;
    try {
      resource = canonicalResource(candidate.resourceType, candidate.resourceId);
    } catch {
      continue;
    }

    const removed = await prisma.$transaction(async (tx) => withSerializationLockTimeout(tx, async () => {
      await acquireResourceBoundary(tx, resource);
      if (await resourceExists(tx, resource)) return false;
      const result = await tx.$executeRaw`
        DELETE FROM "edit_leases"
        WHERE "resource_type" = ${resource.resourceType}::edit_lease_resource_type
          AND "resource_id" = ${resource.resourceId}
          AND ("released_at" IS NOT NULL OR "expires_at" <= clock_timestamp())
      `;
      return result > 0;
    }));
    if (removed) deleted += 1;
  }
  return { deleted, scanned: candidates.length };
}

const gcOrphanedEditLeases = cleanupOrphanedEditLeases;

export {
  EditLeaseServiceError,
  EDIT_LEASE_DURATION_MS,
  acquireEditLease,
  assertEditLease,
  cleanupOrphanedEditLeases,
  deleteEditLeaseForResource,
  digestLeaseToken,
  gcOrphanedEditLeases,
  renewEditLease,
  releaseEditLease,
  rotateEditLease,
  withTransientEditLeases,
};

export type {
  AcquireEditLeaseInput,
  EditLeaseErrorCode,
  ProofEditLeaseInput,
  RotateEditLeaseInput,
  TransientEditLeaseInput,
};

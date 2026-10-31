import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { prisma } from "../lib/prisma";
import {
  acquireEditLease,
  assertEditLease,
  deleteEditLeaseForResource,
  EditLeaseServiceError,
  releaseEditLease,
  renewEditLease,
  rotateEditLease,
} from "../lib/resource-edit-lock/service";

/**
 * The same user never waits out their own lease: a fresh acquire takes it over
 * (generation + 1) and the replaced proof fails with `lease_taken_over`, while a
 * live lease held by another user still blocks. Expired or released leases keep
 * reporting `lease_superseded`/`lease_expired` so a lapsed tab can re-acquire.
 */
const url = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || url.pathname !== "/vecalss_dev") {
  throw new Error("Edit-lease takeover test requires the local disposable vecalss_dev database on port 55432.");
}

const activeTutorWhere = { status: "active" as const, softDeletedAt: null, previewPurpose: null, roleAssignments: { some: { role: "tutor" as const, revokedAt: null } } };
const token = () => randomBytes(32).toString("base64url");

const pkg = await prisma.reusableQuestionPackage.findFirstOrThrow({ orderBy: { createdAt: "asc" }, where: { createdBy: activeTutorWhere } });
const holder = pkg.createdByUserId;
const other = await prisma.user.findFirstOrThrow({ select: { id: true }, where: { ...activeTutorWhere, id: { not: holder } } });
const resource = { resourceId: pkg.id, resourceType: "question_package" as const };

const code = (action: () => Promise<unknown>) => action().then(
  () => null,
  (error: unknown) => (error instanceof EditLeaseServiceError ? error.code : error),
);
const expireLease = () => prisma.$executeRaw`
  UPDATE "edit_leases" SET "expires_at" = clock_timestamp() - interval '1 second'
  WHERE "resource_type" = 'question_package'::edit_lease_resource_type AND "resource_id" = ${pkg.id}`;

try {
  await deleteEditLeaseForResource(resource.resourceType, resource.resourceId);

  // A first tab acquires; the same user opening a second tab takes it over.
  const tabA = token();
  const first = await acquireEditLease({ ...resource, holderUserId: holder, newToken: tabA });
  assert.equal(first.state, "owned");
  assert.equal(first.generation, 1);

  const tabB = token();
  const second = await acquireEditLease({ ...resource, holderUserId: holder, newToken: tabB });
  assert.equal(second.state, "owned", "the same user takes over their own live lease");
  assert.equal(second.generation, 2, "takeover bumps the generation");

  // The replaced tab learns it was taken over on renew, rotate and release, and cannot save.
  assert.equal(await code(() => renewEditLease({ ...resource, generation: 1, holderUserId: holder, token: tabA })), "lease_taken_over");
  assert.equal(await code(() => rotateEditLease({ ...resource, holderUserId: holder, newToken: token(), previousGeneration: 1, previousToken: tabA })), "lease_taken_over");
  await releaseEditLease({ ...resource, generation: 1, holderUserId: holder, token: tabA });
  assert.equal(
    await code(() => prisma.$transaction((tx) => assertEditLease(tx, { ...resource, generation: 1, holderUserId: holder, token: tabA }))),
    "lease_taken_over",
    "save paths reject the stale proof and say it was taken over",
  );

  // The stale release above must not have released the new owner's lease.
  const renewed = await renewEditLease({ ...resource, generation: 2, holderUserId: holder, token: tabB });
  assert.equal(renewed.state, "owned");
  assert.equal(renewed.generation, 2);

  // Another user is still blocked, and cannot renew or rotate a proof that is not theirs.
  const blocked = await acquireEditLease({ ...resource, holderUserId: other.id, newToken: token() });
  assert.equal(blocked.state, "locked", "a different user stays blocked by a live lease");
  assert.equal(blocked.holderUserId, holder);
  assert.equal(await code(() => renewEditLease({ ...resource, generation: 2, holderUserId: other.id, token: tabB })), "lease_superseded");

  // A reload rotates its own proof normally.
  const rotatedToken = token();
  const rotated = await rotateEditLease({ ...resource, holderUserId: holder, newToken: rotatedToken, previousGeneration: 2, previousToken: tabB });
  assert.equal(rotated.generation, 3);

  // A lapsed or released lease is not a takeover: the old proof reports the plain codes.
  await expireLease();
  assert.equal(await code(() => renewEditLease({ ...resource, generation: 3, holderUserId: holder, token: rotatedToken })), "lease_expired");
  assert.equal(await code(() => rotateEditLease({ ...resource, holderUserId: holder, newToken: token(), previousGeneration: 3, previousToken: rotatedToken })), "lease_superseded");
  const afterExpiry = await acquireEditLease({ ...resource, holderUserId: other.id, newToken: token() });
  assert.equal(afterExpiry.state, "owned", "another user can acquire once the lease lapsed");
  assert.equal(afterExpiry.generation, 4);
  // The user whose lease lapsed now sees a live lease owned by someone else: a plain supersede, not a takeover.
  assert.equal(await code(() => renewEditLease({ ...resource, generation: 3, holderUserId: holder, token: rotatedToken })), "lease_superseded");
  assert.equal((await acquireEditLease({ ...resource, holderUserId: holder, newToken: token() })).state, "locked");
  assert.equal(
    await code(() => prisma.$transaction((tx) => assertEditLease(tx, { ...resource, generation: 3, holderUserId: holder, token: rotatedToken }))),
    "lease_superseded",
    "a save after another user took the lapsed lease is a plain supersede, not a takeover",
  );

  console.log("resource edit-lock takeover DB tests passed");
} finally {
  await deleteEditLeaseForResource(resource.resourceType, resource.resourceId).catch(() => undefined);
  await prisma.$disconnect();
}

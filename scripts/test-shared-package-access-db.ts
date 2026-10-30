import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { prisma } from "../lib/prisma";
import { acquireEditLease, EditLeaseServiceError, releaseEditLease } from "../lib/resource-edit-lock/service";
import {
  getAssemblyDraftForEdit,
  previewAssembly,
  validateAssemblyDraft,
} from "../lib/tryout/assembly-repository";
import { AssemblyValidationError } from "../lib/tryout/assembly-validation";
import {
  getReusableQuestionPackageForEdit,
  getReusableQuestionPackageVersionDetail,
  getReusableQuestionPackageVersionHub,
  listReusableQuestionPackages,
  saveReusableQuestionPackageMetadata,
} from "../lib/tryout/repository";

/**
 * Reusable question packages and assemblies are shared across Kapten, exactly
 * like Tryouts: any active Kapten or admin can read and edit them, accounts
 * without that role cannot, and the creator stays the owner of record while
 * the package/version rows keep naming whoever acted.
 */
const url = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || url.pathname !== "/vecalss_dev") {
  throw new Error("Shared package access test requires the local disposable vecalss_dev database on port 55432.");
}

const activeTutorWhere = { status: "active" as const, softDeletedAt: null, previewPurpose: null, roleAssignments: { some: { role: "tutor" as const, revokedAt: null } } };

const pkg = await prisma.reusableQuestionPackage.findFirstOrThrow({
  include: { versions: { orderBy: { versionNo: "desc" }, take: 1, where: { status: "published" } } },
  orderBy: { createdAt: "asc" },
  where: { createdBy: activeTutorWhere, versions: { some: { status: "published" } } },
});
const creatorId = pkg.createdByUserId;
const other = await prisma.user.findFirstOrThrow({ select: { id: true }, where: { ...activeTutorWhere, id: { not: creatorId } } });
const student = await prisma.user.findUniqueOrThrow({ select: { id: true }, where: { email: process.env.SEED_STUDENT_EMAIL?.trim() || "student@vecalss.local" } });
const publishedVersionNo = pkg.versions[0]?.versionNo;
assert(publishedVersionNo, "the fixture package needs a published version");

const original = { description: pkg.description, revision: pkg.revision, title: pkg.title, updatedByUserId: pkg.updatedByUserId };

try {
  // --- reads: a second Kapten sees what the creator sees; a student sees nothing ---
  const otherList = await listReusableQuestionPackages(other.id, { query: pkg.title });
  assert(otherList.items.some((item) => item.id === pkg.id), "a second Kapten lists another Kapten's package");
  assert.equal((await listReusableQuestionPackages(student.id)).totalItems, 0, "a student sees no package catalogue");
  assert((await getReusableQuestionPackageForEdit(pkg.id, other.id)), "a second Kapten opens the package editor");
  assert.equal(await getReusableQuestionPackageForEdit(pkg.id, student.id), null);
  assert((await getReusableQuestionPackageVersionHub(pkg.id, other.id)), "a second Kapten opens the version hub");
  assert.equal(await getReusableQuestionPackageVersionHub(pkg.id, student.id), null);
  assert((await getReusableQuestionPackageVersionDetail(pkg.id, publishedVersionNo, other.id)), "a second Kapten reads a published version");
  assert.equal(await getReusableQuestionPackageVersionDetail(pkg.id, publishedVersionNo, student.id), null);

  // --- assemblies: a student is refused; a second Kapten is never refused as unauthorized ---
  const refusal = (action: () => Promise<unknown>) => action().then(() => null, (error: unknown) => error);
  for (const run of [
    () => validateAssemblyDraft(pkg.id, student.id),
    () => getAssemblyDraftForEdit(pkg.id, student.id),
  ]) {
    const error = await refusal(run);
    assert(error instanceof AssemblyValidationError && error.code === "unauthorized", "a student cannot work on an assembly");
  }
  for (const run of [
    () => validateAssemblyDraft(pkg.id, other.id),
    () => getAssemblyDraftForEdit(pkg.id, other.id),
    () => previewAssembly({ packageId: pkg.id }, other.id),
  ]) {
    const error = await refusal(run);
    assert(!(error instanceof AssemblyValidationError && error.code === "unauthorized"), "a second Kapten is not refused by ownership");
  }

  // --- leases: a student cannot take one; a second Kapten can and may write ---
  const studentLease = await refusal(() => acquireEditLease({ holderUserId: student.id, newToken: randomBytes(32).toString("base64url"), resourceId: pkg.id, resourceType: "question_package" }));
  assert(studentLease instanceof EditLeaseServiceError && studentLease.code === "resource_inaccessible", "a student cannot lease a package");

  const token = randomBytes(32).toString("base64url");
  const lease = await acquireEditLease({ holderUserId: other.id, newToken: token, resourceId: pkg.id, resourceType: "question_package" });
  assert(lease.state === "owned" && lease.generation !== undefined, "a second Kapten can lease another Kapten's package");
  const proof = { generation: lease.generation, token };
  try {
    const saved = await saveReusableQuestionPackageMetadata({ description: "Shared Kapten edit", editLease: proof, id: pkg.id, title: `${pkg.title}` }, other.id);
    assert.equal(saved.id, pkg.id);
  } finally {
    await releaseEditLease({ ...proof, holderUserId: other.id, resourceId: pkg.id, resourceType: "question_package" });
  }

  // --- ownership stays recorded: creator unchanged, the row names the Kapten who acted ---
  const after = await prisma.reusableQuestionPackage.findUniqueOrThrow({ where: { id: pkg.id } });
  assert.equal(after.createdByUserId, creatorId, "the creator stays the owner of record");
  assert.equal(after.updatedByUserId, other.id, "the package names the Kapten who last changed it");
  assert.equal(after.revision, original.revision + 1);
  assert.equal(after.description, "Shared Kapten edit");

  // A student is refused at the repository even if a caller skipped the role check (no lease proof is
  // offered here, so the refusal may come from the lease check or the manager check; either way no write).
  const revisionBefore = (await prisma.reusableQuestionPackage.findUniqueOrThrow({ where: { id: pkg.id } })).revision;
  const studentWrite = await refusal(() => saveReusableQuestionPackageMetadata({ description: "x", id: pkg.id, title: pkg.title }, student.id));
  assert(studentWrite instanceof Error, "a student cannot write package metadata");
  assert.equal((await prisma.reusableQuestionPackage.findUniqueOrThrow({ where: { id: pkg.id } })).revision, revisionBefore, "the refused write changed nothing");

  console.log("Shared package/assembly access passed: second Kapten reads, leases and edits; student refused everywhere; creator unchanged.");
} finally {
  await prisma.reusableQuestionPackage.update({
    data: { description: original.description, revision: original.revision, title: original.title, updatedByUserId: original.updatedByUserId },
    where: { id: pkg.id },
  });
  await prisma.$disconnect();
}

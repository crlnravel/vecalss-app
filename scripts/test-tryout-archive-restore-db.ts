import "dotenv/config";
import assert from "node:assert/strict";

import { inviteTryoutParticipant } from "../lib/tryout/delivery-repository";
import { prisma } from "../lib/prisma";
import { archiveTryoutTransient, deleteTryoutTransient, getTryoutDeletionPlan, restoreTryoutTransient } from "../lib/tryout/repository";
import { createTa02Draft } from "./tryout-ta02-fixture";
import { createTa03Fixture } from "./tryout-ta03-fixture";

const auditCount = (tryoutId: string, action: string) => prisma.tryoutDeliveryAudit.count({ where: { action, tryoutId } });

async function main() {
  // A Tryout archived as a draft is restored as a draft, and archive/restore audit rows alone never block deleting it.
  const draft = await createTa02Draft();
  const draftId = draft.draft.id;
  await archiveTryoutTransient(draftId, draft.ownerId);
  assert.equal((await getTryoutDeletionPlan(draftId, draft.ownerId))?.hasHistory, false, "an untouched archived Tryout has no history");
  const restoredDraft = await restoreTryoutTransient(draftId, draft.ownerId);
  assert.equal(restoredDraft.status, "draft");
  assert.equal(await auditCount(draftId, "tryout.restored"), 1);
  await assert.rejects(restoreTryoutTransient(draftId, draft.ownerId), /tidak sedang diarsipkan/);
  await archiveTryoutTransient(draftId, draft.ownerId);
  await deleteTryoutTransient(draftId, draft.ownerId);
  assert.equal(await prisma.tryoutPackage.count({ where: { id: draftId } }), 0);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: draftId } }), 0);

  // A Tryout archived while published returns as published with its original publication time, and a
  // published Tryout is still not deletable until it is archived.
  const published = await createTa03Fixture();
  const publishedAt = (await prisma.tryoutPackage.findUniqueOrThrow({ where: { id: published.tryoutId } })).publishedAt;
  assert(publishedAt, "fixture is published");
  await archiveTryoutTransient(published.tryoutId, published.ownerId);
  const restored = await restoreTryoutTransient(published.tryoutId, published.ownerId);
  assert.equal(restored.status, "published");
  assert.equal((await prisma.tryoutPackage.findUniqueOrThrow({ where: { id: published.tryoutId } })).publishedAt?.getTime(), publishedAt.getTime());
  await assert.rejects(deleteTryoutTransient(published.tryoutId, published.ownerId), /terbit/);

  // Without history confirmation a Tryout with history stays undeletable; archiving is required for the purge.
  const plan = await getTryoutDeletionPlan(published.tryoutId, published.ownerId);
  assert(plan, "plan is readable by a Kapten");
  const invitation = await inviteTryoutParticipant(published.tryoutId, published.studentId, published.ownerId, "Purge regression");
  const session = await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: published.sessionId }, include: { assessmentRelease: true } });
  const release = session.assessmentRelease;
  assert(release, "fixture session is pinned to a release");
  const finished = await prisma.tryoutAttempt.create({ data: { admissionId: invitation.id, assessmentReleaseDigest: release.contentDigest, assessmentReleaseId: release.id, assessmentReleaseNumber: release.releaseNumber, attemptState: "submitted", contentSnapshot: { fixture: "purge" }, deliverySessionId: published.sessionId, releasePolicySnapshot: {}, serverDeadlineAt: session.availableUntil, serverStartedAt: session.availableFrom, status: "scored", studentId: published.studentId, tryoutId: published.tryoutId } });
  assert.equal((await getTryoutDeletionPlan(published.tryoutId, published.ownerId))?.hasHistory, true);
  await assert.rejects(deleteTryoutTransient(published.tryoutId, published.ownerId), /terbit/);
  await archiveTryoutTransient(published.tryoutId, published.ownerId);
  await assert.rejects(deleteTryoutTransient(published.tryoutId, published.ownerId), /riwayat/);
  const stillThere = await prisma.tryoutAttempt.count({ where: { id: finished.id } });
  assert.equal(stillThere, 1, "a refused delete keeps the attempt");

  // A student still working blocks the purge; once finished, the archived Tryout goes with its whole history.
  await prisma.tryoutAttempt.update({ data: { attemptState: "in_progress", status: "in_progress" }, where: { id: finished.id } });
  await assert.rejects(deleteTryoutTransient(published.tryoutId, published.ownerId, { withHistory: true }), /sedang mengerjakan/);
  await prisma.tryoutAttempt.update({ data: { attemptState: "submitted", status: "scored" }, where: { id: finished.id } });
  await deleteTryoutTransient(published.tryoutId, published.ownerId, { withHistory: true });
  for (const [name, count] of Object.entries({
    admissions: await prisma.tryoutAdmission.count({ where: { tryoutId: published.tryoutId } }),
    attempts: await prisma.tryoutAttempt.count({ where: { tryoutId: published.tryoutId } }),
    audits: await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: published.tryoutId } }),
    package: await prisma.tryoutPackage.count({ where: { id: published.tryoutId } }),
    releases: await prisma.assessmentRelease.count({ where: { tryoutId: published.tryoutId } }),
    sessions: await prisma.tryoutDeliverySession.count({ where: { tryoutId: published.tryoutId } }),
  })) assert.equal(count, 0, `${name} are purged`);
  const purged = await prisma.auditLog.findFirst({ where: { action: "tryout.purged", targetId: published.tryoutId } });
  assert(purged, "the purge leaves an audit log entry");

  // Releases stay append-only outside a purge of their own Tryout.
  const other = await createTa03Fixture();
  await assert.rejects(prisma.assessmentRelease.deleteMany({ where: { tryoutId: other.tryoutId } }), /assessment_release_append_only|constraint/);
  console.log("Tryout archive/restore/delete and history purge passed.");
}

main().then(() => prisma.$disconnect(), async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });

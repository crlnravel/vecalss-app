import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma";
import { digestAssessmentReleasePayload } from "../lib/tryout/assessment-release-canonical.mjs";
import { startTryoutAttempt } from "../lib/tryout/attempt-repository";
import { createTa03Fixture } from "./tryout-ta03-fixture";
import { requireTa02LocalDatabase } from "./tryout-ta02-fixture";

export type Sr01Item = { id: string; snapshotId?: string; sourceQuestionId?: string; points: string; options: Array<{ id: string; isCorrect: boolean }> };
export type Sr01Snapshot = { items: Sr01Item[]; scoringConfig: unknown; sectionId: string; sequenceNo: number; subtestId: string; durationSeconds: number };

/** Runs in an isolated process; restores the native clock even on refusal. */
export async function atSr01Time<T>(time: Date, run: () => Promise<T>) {
  const native = globalThis.Date;
  globalThis.Date = new Proxy(native, {
    construct(target, args, newTarget) { return Reflect.construct(target, args.length ? args : [time.getTime()], newTarget); },
    get(target, key) { return key === "now" ? () => time.getTime() : Reflect.get(target, key); },
  });
  try { return await run(); } finally { globalThis.Date = native; }
}

/** New Tryout/release only; never edits a pre-existing attempt or seeded user. */
export async function createSr01Fixture(name: string, ordinal: number, irt = false, windowStart?: Date) {
  requireTa02LocalDatabase();
  const fixture = await createTa03Fixture();
  const session = await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: fixture.sessionId }, include: { assessmentRelease: true } });
  if (!session.assessmentRelease) throw new Error("SR-01 needs a pinned fixture release");
  const payload = structuredClone(session.assessmentRelease.payload) as unknown as { sections: Array<{ durationSeconds: number; items: Sr01Item[]; scoring: { config: unknown } }> };
  for (const section of payload.sections) {
    if (section.items.length < 2) throw new Error("SR-01 requires two fixture items per section");
    section.items = section.items.slice(0, 2);
    section.items[0].points = "7";
    section.items[1].points = "3";
    section.durationSeconds = 60;
    if (irt) section.scoring.config = { method: "irt_2pl", itemParameters: section.items.map((item) => ({ itemId: item.snapshotId ?? item.sourceQuestionId, a: 1, b: 0 })) };
  }
  // Fixture content is finalized before the first attempt, then immutable.
  const release = await prisma.assessmentRelease.create({ data: { tryoutId: fixture.tryoutId, createdByUserId: fixture.ownerId, publishedAt: new Date(), releaseNumber: session.assessmentRelease.releaseNumber + 1, payload: JSON.parse(JSON.stringify(payload)), contentDigest: digestAssessmentReleasePayload(payload) } });
  const start = windowStart ?? new Date(Date.UTC(2036, 0, 1 + ordinal * 2));
  const end = new Date(start.getTime() + 600_000);
  await prisma.tryoutPackage.update({ where: { id: fixture.tryoutId }, data: { title: `SR-01 ${name}`, defaultResultReleasePolicy: "manual" } });
  const finalizedSession = await prisma.tryoutDeliverySession.create({ data: { tryoutId: fixture.tryoutId, name: `SR-01 ${name}`, createdByUserId: fixture.ownerId, updatedByUserId: fixture.ownerId, status: "active", assessmentReleaseId: release.id, availableFrom: start, availableUntil: end, resultReleasePolicy: "manual" } });
  const admission = await prisma.tryoutAdmission.create({ data: { tryoutId: fixture.tryoutId, studentId: fixture.studentId, status: "active", decidedByUserId: fixture.ownerId, decidedAt: start } });
  await prisma.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, deliverySessionId: finalizedSession.id, assignedByUserId: fixture.ownerId } });
  const started = await atSr01Time(start, () => startTryoutAttempt(finalizedSession.id, fixture.studentId));
  return { ...fixture, title: `SR-01 ${name}`, sessionId: finalizedSession.id, name, start, end, attemptId: started.attemptId, releaseId: release.id, releaseDigest: release.contentDigest,
    attemptRoute: `/tryout/attempt/${started.attemptId}`, resultRoute: `/tryout/attempt/${started.attemptId}/result` };
}

export async function sr01History(attemptId: string) {
  const attempt = await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { runs: { orderBy: { sequenceNo: "asc" }, include: { answers: { orderBy: { id: "asc" } } } }, assessmentRelease: true } });
  const immutable = {
    id: attempt.id, contentSnapshot: attempt.contentSnapshot, assessmentRelease: attempt.assessmentRelease,
    assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseNumber: attempt.assessmentReleaseNumber,
    serverStartedAt: attempt.serverStartedAt, serverDeadlineAt: attempt.serverDeadlineAt, releasePolicySnapshot: attempt.releasePolicySnapshot,
    runs: attempt.runs.map((run) => ({ id: run.id, contentSnapshot: run.contentSnapshot, assessmentReleaseId: run.assessmentReleaseId, assessmentReleaseDigest: run.assessmentReleaseDigest, assessmentReleaseNumber: run.assessmentReleaseNumber, serverStartedAt: run.serverStartedAt, serverDeadlineAt: run.serverDeadlineAt,
      answers: run.answers.map(({ id, tryoutItemId, selectedOptionId, selectedOptionIds, answeredAt, syncedAt }) => ({ id, tryoutItemId, selectedOptionId, selectedOptionIds, answeredAt, syncedAt })) })),
  };
  return { attempt, digest: createHash("sha256").update(JSON.stringify(immutable)).digest("hex") };
}

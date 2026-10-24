import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import {
  archiveTryout, archiveTryoutTransient, deleteTryoutTransient, getTryoutForEdit,
  setTryoutHidden, setTryoutHiddenTransient, unpublishTryout, unpublishTryoutTransient,
  updateTryoutMetadataTransient,
} from "../lib/tryout/repository";
import { inviteTryoutParticipant } from "../lib/tryout/delivery-repository";
import { saveTryoutAnswer, startActiveTestRun, startTryoutAttempt } from "../lib/tryout/attempt-repository";
import { getOwnedTryoutOperationsView } from "../lib/tryout/operations-view";
import { participantTryoutCatalogue, participantTryoutDetail } from "../lib/tryout/participant-repository";
import { EditLeaseServiceError } from "../lib/resource-edit-lock/service";
import { createTa03Fixture } from "./tryout-ta03-fixture";
import { createTa02Draft, withTa02Lease } from "./tryout-ta02-fixture";

type Fixture = Awaited<ReturnType<typeof createTa03Fixture>>;
const ledger: Record<string, unknown> = {};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function remember(name: string, fixture: Pick<Fixture, "tryoutId" | "ownerId" | "studentId" | "studentEmail">) {
  const parent = await prisma.tryoutPackage.findUnique({ where: { id: fixture.tryoutId }, select: { id: true, title: true, status: true, isHidden: true } });
  const sessions = await prisma.tryoutDeliverySession.findMany({ where: { tryoutId: fixture.tryoutId }, select: { id: true, name: true, status: true, availableFrom: true, availableUntil: true, assessmentReleaseId: true, isDefaultOpenRegistration: true } });
  ledger[name] = { ...fixture, parent, sessions };
  await writeFile(".scratch/tryout-f11/final-fixtures.json", JSON.stringify(ledger, null, 2));
}
async function history(tryoutId: string) {
  const [sections, releases, sessions, admissions, attempts] = await Promise.all([
    prisma.tryoutSection.findMany({ where: { tryoutId }, include: { items: { include: { options: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
    prisma.assessmentRelease.findMany({ where: { tryoutId }, orderBy: { id: "asc" } }),
    prisma.tryoutDeliverySession.findMany({ where: { tryoutId }, orderBy: { id: "asc" } }),
    prisma.tryoutAdmission.findMany({ where: { tryoutId }, include: { assignments: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
    prisma.tryoutAttempt.findMany({ where: { tryoutId }, include: { answers: { orderBy: { id: "asc" } }, runs: { orderBy: { id: "asc" } }, scoreBreakdowns: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
  ]);
  return hash({ sections, releases, sessions, admissions, attempts });
}
async function auditCount(id: string, action: string) {
  return prisma.tryoutDeliveryAudit.count({ where: { tryoutId: id, action } });
}
async function lease(id: string) {
  return prisma.editLease.findUnique({ where: { resourceType_resourceId: { resourceType: "tryout", resourceId: id } } });
}
async function grants(id: string) {
  const audits = await prisma.tryoutDeliveryAudit.findMany({ where: { tryoutId: id, action: "admission.invited" }, select: { id: true } });
  return {
    audits: audits.length,
    notifications: await prisma.notification.count({ where: { sourceEntityType: "tryout_invitation", sourceEntityId: { in: audits.map((row) => row.id) } } }),
    admissions: await prisma.tryoutAdmission.count({ where: { tryoutId: id } }),
    assignments: await prisma.tryoutDeliveryAssignment.count({ where: { admission: { tryoutId: id } } }),
  };
}
const grant = (fixture: Fixture) => inviteTryoutParticipant(fixture.tryoutId, fixture.studentId, fixture.ownerId, "Isolated lifecycle regression", false, fixture.sessionId);
async function expectLeaseError(command: () => Promise<unknown>, code: EditLeaseServiceError["code"]) {
  await assert.rejects(command, (error: unknown) => error instanceof EditLeaseServiceError && error.code === code);
}
async function atServerTime<T>(instant: Date, run: () => Promise<T>) {
  const NativeDate = globalThis.Date;
  // Only this isolated test process uses the controlled server Date seam.
  globalThis.Date = class extends NativeDate {
    constructor(value?: string | number | Date) { super(value === undefined ? instant.getTime() : value instanceof NativeDate ? value.getTime() : value); }
    static now() { return instant.getTime(); }
  } as DateConstructor;
  try { return await run(); } finally { globalThis.Date = NativeDate; }
}
async function raceFixture(days: number) {
  const fixture = await createTa03Fixture();
  // Disjoint future windows avoid competing seeded/peer attempts without edits.
  const availableFrom = new Date(Date.now() + days * 86_400_000);
  const availableUntil = new Date(availableFrom.getTime() + 86_400_000);
  await prisma.tryoutDeliverySession.update({ where: { id: fixture.sessionId }, data: { availableFrom, availableUntil } });
  return { fixture, availableFrom };
}

// This public no-proof command is the same boundary selected by mentor actions.
// Seeded accounts are reused; only isolated local Tryout copies are changed.
try {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/vecalss_dev");
  await mkdir(".scratch/tryout-f11", { recursive: true });
  const originalAttempts = await prisma.tryoutAttempt.findMany({ include: { answers: { orderBy: { id: "asc" } }, runs: { orderBy: { id: "asc" } }, scoreBreakdowns: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } });
  const fixture = await createTa03Fixture();
  const before = await history(fixture.tryoutId);
  const result = await setTryoutHiddenTransient(fixture.tryoutId, true, fixture.ownerId);
  assert.equal(result.isHidden, true);
  assert.equal((await prisma.tryoutPackage.findUniqueOrThrow({ where: { id: fixture.tryoutId } })).isHidden, true);
  assert.equal(await auditCount(fixture.tryoutId, "tryout.hidden"), 1);
  assert.equal(await history(fixture.tryoutId), before, "hide preserves sessions, content releases and participant history");
  assert((await lease(fixture.tryoutId))?.releasedAt, "transient claim is released on success");
  await setTryoutHiddenTransient(fixture.tryoutId, true, fixture.ownerId);
  assert.equal(await auditCount(fixture.tryoutId, "tryout.hidden"), 1, "hide replay emits no audit");
  await setTryoutHiddenTransient(fixture.tryoutId, false, fixture.ownerId);
  await setTryoutHiddenTransient(fixture.tryoutId, false, fixture.ownerId);
  assert.equal(await auditCount(fixture.tryoutId, "tryout.shown"), 1, "unhide replay emits no audit");
  assert.equal((await getTryoutForEdit(fixture.tryoutId, fixture.ownerId))?.isHidden, false);
  console.log("Public transient hide persisted with one audit.");

  const otherTutor = await prisma.user.findFirstOrThrow({ where: { id: { not: fixture.ownerId }, roleAssignments: { some: { role: "tutor", revokedAt: null } } }, select: { id: true } });
  const commands = [
    (actor: string) => setTryoutHiddenTransient(fixture.tryoutId, true, actor),
    (actor: string) => archiveTryoutTransient(fixture.tryoutId, actor),
    (actor: string) => unpublishTryoutTransient(fixture.tryoutId, actor),
    (actor: string) => updateTryoutMetadataTransient({ id: fixture.tryoutId, title: "Unauthorized", description: "" }, actor),
    (actor: string) => deleteTryoutTransient(fixture.tryoutId, actor),
  ];
  const refusedLease = await lease(fixture.tryoutId);
  const refusedHistory = await history(fixture.tryoutId);
  const refusedAudits = await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: fixture.tryoutId } });
  for (const actor of [otherTutor.id, fixture.studentId]) {
    for (const command of commands) await expectLeaseError(() => command(actor), "resource_inaccessible");
  }
  assert.deepEqual(await lease(fixture.tryoutId), refusedLease, "wrong owner/principal has no claim side effect");
  assert.equal(await history(fixture.tryoutId), refusedHistory);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: fixture.tryoutId } }), refusedAudits);

  await withTa02Lease(fixture.tryoutId, fixture.ownerId, async (proof) => {
    const held = await lease(fixture.tryoutId);
    for (const command of commands) await expectLeaseError(() => command(fixture.ownerId), "resource_locked");
    assert.deepEqual(await lease(fixture.tryoutId), held, "catalogue commands cannot steal a live editor's claim");
    await setTryoutHidden(fixture.tryoutId, true, fixture.ownerId, proof);
    await setTryoutHidden(fixture.tryoutId, false, fixture.ownerId, proof);
    await expectLeaseError(() => setTryoutHidden(fixture.tryoutId, true, fixture.ownerId, { ...proof, generation: proof.generation + 1 }), "lease_superseded");
  });
  await expectLeaseError(() => setTryoutHidden(fixture.tryoutId, true, fixture.ownerId, { generation: 1, token: "invalid" }), "invalid_proof");
  assert.equal(await history(fixture.tryoutId), before);
  const afterHeldAudits = await auditCount(fixture.tryoutId, "tryout.hidden");
  const canonicalLease = await lease(fixture.tryoutId);
  await assert.rejects(setTryoutHiddenTransient(fixture.tryoutId.toUpperCase(), true, fixture.ownerId), /tidak dapat diedit/);
  await assert.rejects(setTryoutHiddenTransient(fixture.sessionId, true, fixture.ownerId), /tidak dapat ditemukan/);
  await assert.rejects(setTryoutHiddenTransient(randomUUID(), true, fixture.ownerId), /tidak dapat ditemukan/);
  assert.deepEqual(await lease(fixture.tryoutId), canonicalLease, "raw/canonical mismatch rolls back its claim");
  assert.equal(await auditCount(fixture.tryoutId, "tryout.hidden"), afterHeldAudits);
  const wrongProofFixture = await createTa03Fixture();
  await withTa02Lease(fixture.tryoutId, fixture.ownerId, async (proof) => {
    await expectLeaseError(() => setTryoutHidden(wrongProofFixture.tryoutId, true, fixture.ownerId, proof), "lease_superseded");
  });
  assert.equal(await auditCount(wrongProofFixture.tryoutId, "tryout.hidden"), 0);
  await setTryoutHiddenTransient(fixture.tryoutId, true, fixture.ownerId);
  assert((await lease(fixture.tryoutId))!.generation > canonicalLease!.generation, "released editor claim can be superseded by a fresh transient claim");
  await setTryoutHiddenTransient(fixture.tryoutId, false, fixture.ownerId);
  const metadata = await updateTryoutMetadataTransient({ id: fixture.tryoutId, title: "F-11 metadata fixture", description: "Local isolated metadata regression" }, fixture.ownerId);
  assert.equal(metadata.title, "F-11 metadata fixture");
  assert.equal((await getTryoutForEdit(fixture.tryoutId, fixture.ownerId))?.description, "Local isolated metadata regression");
  assert.equal(await history(fixture.tryoutId), before, "metadata preserves the current release and session identity");
  await remember("reversible", fixture);
  console.log("Owner, principal, active-other-editor lease, stale held proof, canonical resource and metadata regressions passed.");

  const unpublished = await createTa03Fixture();
  const releaseBefore = (await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: unpublished.sessionId } })).assessmentReleaseId;
  const releasesBefore = await prisma.assessmentRelease.findMany({ where: { tryoutId: unpublished.tryoutId }, orderBy: { id: "asc" } });
  const unpublish = await unpublishTryoutTransient(unpublished.tryoutId, unpublished.ownerId);
  assert.equal(unpublish.status, "draft");
  assert.equal((await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: unpublished.sessionId } })).status, "closed");
  assert.equal((await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: unpublished.sessionId } })).assessmentReleaseId, releaseBefore);
  assert.deepEqual(await prisma.assessmentRelease.findMany({ where: { tryoutId: unpublished.tryoutId }, orderBy: { id: "asc" } }), releasesBefore);
  assert.equal(await auditCount(unpublished.tryoutId, "tryout.unpublished"), 1);
  assert.equal(await auditCount(unpublished.tryoutId, "delivery_session.main_auto_closed"), 1);
  const protectedHistory = await history(unpublished.tryoutId);
  const protectedLease = await lease(unpublished.tryoutId);
  await assert.rejects(unpublishTryoutTransient(unpublished.tryoutId, unpublished.ownerId), /sudah berubah/);
  await assert.rejects(deleteTryoutTransient(unpublished.tryoutId, unpublished.ownerId), /riwayat/);
  assert.equal(await history(unpublished.tryoutId), protectedHistory, "a previously published draft keeps its releases/session history");
  assert.deepEqual(await lease(unpublished.tryoutId), protectedLease, "refused replay/deletion rolls back temporary claims");
  await archiveTryoutTransient(unpublished.tryoutId, unpublished.ownerId);
  assert.equal(await history(unpublished.tryoutId), protectedHistory);
  assert.equal(await auditCount(unpublished.tryoutId, "tryout.archived"), 1);
  await assert.rejects(archiveTryoutTransient(unpublished.tryoutId, unpublished.ownerId), /sudah diarsipkan/);
  await assert.rejects(setTryoutHiddenTransient(unpublished.tryoutId, true, unpublished.ownerId), /harus diterbitkan/);
  await assert.rejects(grant(unpublished), /diarsipkan/);
  assert.equal(await auditCount(unpublished.tryoutId, "tryout.archived"), 1);
  assert(await getOwnedTryoutOperationsView(unpublished.tryoutId, unpublished.ownerId), "archived history remains readable");
  await remember("unpublishedThenArchived", unpublished);

  for (const operation of ["unpublish", "archive"] as const) {
    const held = await createTa03Fixture();
    await withTa02Lease(held.tryoutId, held.ownerId, (proof) => operation === "unpublish" ? unpublishTryout(held.tryoutId, held.ownerId, proof) : archiveTryout(held.tryoutId, held.ownerId, proof));
    assert.equal((await prisma.tryoutPackage.findUniqueOrThrow({ where: { id: held.tryoutId } })).status, operation === "unpublish" ? "draft" : "archived");
    if (operation === "archive") assert.equal(await getTryoutForEdit(held.tryoutId, held.ownerId), null, "archived content has no writable editor");
    await remember(`held-${operation}`, held);
  }
  const draft = await createTa02Draft();
  const draftSession = await prisma.tryoutDeliverySession.findFirstOrThrow({ where: { tryoutId: draft.draft.id } });
  assert.equal(draftSession.assessmentReleaseId, null);
  assert.equal(draftSession.status, "draft");
  assert.equal(await auditCount(draft.draft.id, "delivery_session.main_auto_created"), 1);
  await remember("untouchedDraftBeforeDelete", { ...draft, tryoutId: draft.draft.id });
  await deleteTryoutTransient(draft.draft.id, draft.ownerId);
  assert.equal(await getTryoutForEdit(draft.draft.id, draft.ownerId), null);
  assert.equal(await prisma.tryoutDeliverySession.count({ where: { tryoutId: draft.draft.id } }), 0);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: draft.draft.id } }), 0);
  await assert.rejects(updateTryoutMetadataTransient({ id: draft.draft.id, title: "Stale draft", description: "" }, draft.ownerId), /tidak dapat ditemukan/);
  const changedDraft = await createTa02Draft();
  await prisma.tryoutDeliverySession.updateMany({ where: { tryoutId: changedDraft.draft.id }, data: { fullscreenPrompt: true } });
  const changedHistory = await history(changedDraft.draft.id);
  await assert.rejects(deleteTryoutTransient(changedDraft.draft.id, changedDraft.ownerId), /riwayat/);
  assert.equal(await history(changedDraft.draft.id), changedHistory, "F6 only permits untouched draft setup deletion");
  await remember("protectedChangedDraft", { ...changedDraft, tryoutId: changedDraft.draft.id });
  console.log("No-proof unpublish/archive, held editor paths, replay and untouched/protected draft deletion passed.");

  for (const operation of ["hide", "archive", "unpublish"] as const) {
    const current = await createTa03Fixture();
    const mutate = () => operation === "hide" ? setTryoutHiddenTransient(current.tryoutId, true, current.ownerId) : operation === "archive" ? archiveTryoutTransient(current.tryoutId, current.ownerId) : unpublishTryoutTransient(current.tryoutId, current.ownerId);
    const outcomes = await Promise.allSettled([mutate(), grant(current)]);
    assert.equal(outcomes[0].status, "fulfilled");
    if (operation === "hide") assert.equal(outcomes[1].status, "fulfilled", "deliberate mentor grants remain allowed on hidden content");
    const count = outcomes[1].status === "fulfilled" ? 1 : 0;
    assert.deepEqual(await grants(current.tryoutId), { audits: count, notifications: count, admissions: count, assignments: count });
    if (operation === "hide") {
      const replay = await grant(current);
      assert.equal(replay.changed, false);
      assert.equal((await participantTryoutDetail(current.tryoutId, current.studentId))?.id, current.tryoutId);
      assert((await participantTryoutCatalogue(current.studentId)).some((item) => item.id === current.tryoutId));
    } else await assert.rejects(grant(current));
    assert.deepEqual(await grants(current.tryoutId), { audits: count, notifications: count, admissions: count, assignments: count });
    ledger[`${operation}GrantOutcomes`] = outcomes.map((outcome) => outcome.status);
    await remember(`${operation}GrantRace`, current);
  }

  let historyFixture: Fixture | undefined;
  for (const [index, operation] of (["hide", "unpublish", "archive"] as const).entries()) {
    const { fixture: current, availableFrom } = await raceFixture(120 + index * 45);
    const admission = await grant(current);
    const session = await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: current.sessionId }, include: { assessmentRelease: true } });
    assert(session.assessmentRelease);
    await assert.rejects(startTryoutAttempt(current.sessionId, current.studentId), /belum tersedia/);
    await atServerTime(availableFrom, async () => {
      const mutate = () => operation === "hide" ? setTryoutHiddenTransient(current.tryoutId, true, current.ownerId) : operation === "archive" ? archiveTryoutTransient(current.tryoutId, current.ownerId) : unpublishTryoutTransient(current.tryoutId, current.ownerId);
      const outcomes = await Promise.allSettled([mutate(), startTryoutAttempt(current.sessionId, current.studentId)]);
      const parent = await prisma.tryoutPackage.findUniqueOrThrow({ where: { id: current.tryoutId } });
      const attempts = await prisma.tryoutAttempt.findMany({ where: { tryoutId: current.tryoutId }, include: { runs: true } });
      const started = outcomes[1].status === "fulfilled";
      assert.equal(attempts.length, started ? 1 : 0);
      assert.equal(await auditCount(current.tryoutId, operation === "hide" ? "tryout.hidden" : operation === "archive" ? "tryout.archived" : "tryout.unpublished"), outcomes[0].status === "fulfilled" ? 1 : 0);
      if (operation === "hide") {
        assert.equal(outcomes[0].status, "fulfilled"); assert(started); assert.equal(parent.status, "published");
        const replay = await startTryoutAttempt(current.sessionId, current.studentId);
        assert.equal(replay.state, "existing"); assert.equal(replay.attemptId, attempts[0].id);
        const firstRun = attempts[0].runs.sort((left, right) => left.sequenceNo - right.sequenceNo)[0];
        await startActiveTestRun(attempts[0].id, firstRun.id, current.studentId);
        const item = await prisma.tryoutItem.findFirstOrThrow({ where: { tryoutId: current.tryoutId, tryoutSectionId: firstRun.tryoutSectionId }, include: { options: true } });
        await saveTryoutAnswer(attempts[0].id, firstRun.id, item.id, item.options[0].id, current.studentId);
        historyFixture = current;
      } else if (operation === "unpublish") {
        assert.equal(parent.status, started ? "published" : "draft");
        assert.equal(outcomes[0].status, started ? "rejected" : "fulfilled");
      } else {
        assert.equal(outcomes[0].status, "fulfilled"); assert.equal(parent.status, "archived");
        if (started) {
          const replay = await startTryoutAttempt(current.sessionId, current.studentId);
          assert.equal(replay.state, "existing"); assert.equal(replay.attemptId, attempts[0].id, "existing archived attempt replay preserves history");
        } else await assert.rejects(startTryoutAttempt(current.sessionId, current.studentId));
      }
      if (started) {
        assert.equal(attempts[0].admissionId, admission.id);
        assert.equal(attempts[0].assessmentReleaseId, session.assessmentRelease!.id);
        assert.equal(attempts[0].assessmentReleaseDigest, session.assessmentRelease!.contentDigest);
        assert.equal(attempts[0].assessmentReleaseNumber, session.assessmentRelease!.releaseNumber);
        assert.equal(attempts[0].runs.length, 7);
      }
      ledger[`${operation}StartOutcomes`] = outcomes.map((outcome) => outcome.status);
    });
    await remember(`${operation}StartRace`, current);
  }
  assert(historyFixture);
  const activeHistory = await history(historyFixture.tryoutId);
  await assert.rejects(unpublishTryoutTransient(historyFixture.tryoutId, historyFixture.ownerId), /terkunci/);
  await archiveTryoutTransient(historyFixture.tryoutId, historyFixture.ownerId);
  await assert.rejects(deleteTryoutTransient(historyFixture.tryoutId, historyFixture.ownerId), /Hanya Tryout draf/);
  assert.equal(await history(historyFixture.tryoutId), activeHistory, "archive/refused delete preserves active run, saved answer and release pins");
  assert(await getOwnedTryoutOperationsView(historyFixture.tryoutId, historyFixture.ownerId));
  await remember("archivedAttemptWithAnswer", historyFixture);

  const terminal = await createTa03Fixture();
  const terminalGrant = await grant(terminal);
  const terminalSession = await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: terminal.sessionId }, include: { assessmentRelease: true } });
  const release = terminalSession.assessmentRelease!;
  await prisma.tryoutAttempt.create({ data: { tryoutId: terminal.tryoutId, deliverySessionId: terminal.sessionId, studentId: terminal.studentId, admissionId: terminalGrant.id, assessmentReleaseId: release.id, assessmentReleaseNumber: release.releaseNumber, assessmentReleaseDigest: release.contentDigest, status: "scored", attemptState: "submitted", serverStartedAt: terminalSession.availableFrom, serverDeadlineAt: terminalSession.availableUntil, contentSnapshot: { fixture: "F11 terminal history" }, releasePolicySnapshot: {} } });
  const terminalHistory = await history(terminal.tryoutId);
  await assert.rejects(unpublishTryoutTransient(terminal.tryoutId, terminal.ownerId), /terkunci/);
  await archiveTryoutTransient(terminal.tryoutId, terminal.ownerId);
  assert.equal(await history(terminal.tryoutId), terminalHistory, "terminal attempt also freezes content and survives archive");
  await remember("terminalHistory", terminal);

  const originalAfter = await prisma.tryoutAttempt.findMany({ where: { id: { in: originalAttempts.map((row) => row.id) } }, include: { answers: { orderBy: { id: "asc" } }, runs: { orderBy: { id: "asc" } }, scoreBreakdowns: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } });
  assert.deepEqual(originalAfter, originalAttempts, "all pre-existing attempts/runs/answers remain untouched");
  ledger.preExistingHistory = { count: originalAttempts.length, beforeSha256: hash(originalAttempts), afterSha256: hash(originalAfter) };
  await writeFile(".scratch/tryout-f11/final-fixtures.json", JSON.stringify(ledger, null, 2));
  console.log("Concurrent public Start/grant outcomes, release pins/counts, active/terminal history and original attempts passed. Winner orders were observed, not forced.");
} finally {
  await prisma.$disconnect();
}

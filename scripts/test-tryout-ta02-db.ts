import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { getOwnedTryoutOperationsView } from "../lib/tryout/operations-view";
import { getTryoutForEdit, saveTryout } from "../lib/tryout/repository";
import { configureTryoutAdmission, registerForTryout } from "../lib/tryout/delivery-repository";
import { participantTryoutDetail } from "../lib/tryout/participant-repository";
import { startTryoutAttempt } from "../lib/tryout/attempt-repository";
import { requireTryoutCapability } from "../lib/tryout/capabilities";
import { parseMentorTryoutContext, buildMentorTryoutOperationsHref } from "../lib/navigation/canonical-context";
import { createTa02Draft, ta02SaveInput, withTa02Lease } from "./tryout-ta02-fixture";

type Fixture = Awaited<ReturnType<typeof createTa02Draft>>;
const fixtures: Record<string, { tryoutId: string; sessionId?: string; mode: string; ownerId: string; studentId: string; studentEmail: string; title: string; attemptId?: string }> = {};
function remember(name: string, fixture: Fixture, sessionId?: string, attemptId?: string) {
  fixtures[name] = { tryoutId: fixture.draft.id, mode: fixture.draft.admissionMode, ownerId: fixture.ownerId, studentId: fixture.studentId, studentEmail: fixture.studentEmail, title: fixture.draft.title, sessionId, attemptId };
}
async function edit(fixture: Fixture, change: Partial<Parameters<typeof saveTryout>[0]>) {
  const record = await getTryoutForEdit(fixture.draft.id, fixture.ownerId);
  assert(record);
  return withTa02Lease(record.id, fixture.ownerId, (editLease) => saveTryout({ ...ta02SaveInput(record), id: record.id, editLease, ...change }, fixture.ownerId));
}
async function publish(fixture: Fixture) {
  fixture.draft = await edit(fixture, { status: "published", availableFrom: new Date(Date.now() - 60_000), availableUntil: new Date(Date.now() + 86_400_000) });
  return prisma.tryoutDeliverySession.findFirstOrThrow({ where: { tryoutId: fixture.draft.id, isDefaultOpenRegistration: true } });
}
async function preservedHistory(tryoutId: string) {
  const [sections, releases, sessions, admissions, attempts] = await Promise.all([
    prisma.tryoutSection.findMany({ where: { tryoutId }, include: { items: { include: { options: true }, orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
    prisma.assessmentRelease.findMany({ where: { tryoutId }, orderBy: { id: "asc" } }),
    prisma.tryoutDeliverySession.findMany({ where: { tryoutId }, orderBy: { id: "asc" } }),
    prisma.tryoutAdmission.findMany({ where: { tryoutId }, include: { assignments: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
    prisma.tryoutAttempt.findMany({ where: { tryoutId }, include: { answers: true, runs: true, scoreBreakdowns: true }, orderBy: { id: "asc" } }),
  ]);
  return createHash("sha256").update(JSON.stringify({ sections, releases, sessions, admissions, attempts })).digest("hex");
}

try {
  const fixture = await createTa02Draft();
  const view = await getOwnedTryoutOperationsView(fixture.draft.id, fixture.ownerId);
  assert(view);
  assert.equal(view.admissionMode, "open", "new Tryout defaults to open");
  assert.equal(view.admissionConfigurationLocked, false, "a zero-attempt draft exposes editable admission configuration");
  remember("defaultDraft", fixture);
  const existingDraft = await createTa02Draft("approval_required");
  existingDraft.draft = await edit(existingDraft, { title: `${existingDraft.draft.title} edited` });
  assert.equal(existingDraft.draft.admissionMode, "approval_required", "omitted existing draft mode preserves choice");
  remember("editableDraft", existingDraft);

  for (const mode of ["open", "approval_required", "invitation_only"] as const) {
    const current = await createTa02Draft(mode);
    assert.equal(current.draft.admissionMode, mode);
    // Exercise an ordinary existing draft update with an explicit choice too.
    current.draft = await edit(current, { admissionMode: mode === "open" ? "invitation_only" : "open" });
    current.draft = await edit(current, { admissionMode: mode });
    assert.equal((await getTryoutForEdit(current.draft.id, current.ownerId))?.admissionMode, mode);
    const record = current.draft;
    const racing = await withTa02Lease(record.id, current.ownerId, (editLease) => Promise.allSettled([
      saveTryout({ ...ta02SaveInput(record), id: record.id, editLease, status: "published", availableFrom: new Date(Date.now() - 60_000), availableUntil: new Date(Date.now() + 86_400_000) }, current.ownerId),
      registerForTryout(record.id, current.studentId),
    ]));
    assert.equal(racing[0].status, "fulfilled", "publication succeeds atomically with saved draft mode");
    current.draft = (racing[0] as PromiseFulfilledResult<Fixture["draft"]>).value;
    assert.equal(current.draft.admissionMode, mode);
    const session = await prisma.tryoutDeliverySession.findFirstOrThrow({ where: { tryoutId: record.id, isDefaultOpenRegistration: true } });
    if (mode === "invitation_only") {
      if (racing[1].status === "fulfilled") assert.notEqual(racing[1].value.status, "active", "no open interval during invitation-only publication");
      await assert.rejects(registerForTryout(record.id, current.studentId), /undangan/);
      await assert.rejects(startTryoutAttempt(session.id, current.studentId));
      assert.equal(await prisma.tryoutAdmission.count({ where: { tryoutId: record.id } }), 0);
    } else {
      const registration = await registerForTryout(record.id, current.studentId);
      assert.equal(registration.status, mode === "open" ? "active" : "pending");
      if (racing[1].status === "fulfilled") assert.equal(racing[1].value.status, mode === "open" ? "active" : "pending", "first successful concurrent request uses chosen mode");
      const studentView = await participantTryoutDetail(record.id, current.studentId);
      assert.equal(studentView?.admissionStatus, mode === "open" ? "active" : "pending");
      assert.equal(await prisma.tryoutAdmission.count({ where: { tryoutId: record.id } }), 1);
      assert.equal(await prisma.tryoutDeliveryAssignment.count({ where: { admission: { tryoutId: record.id } } }), mode === "open" ? 1 : 0);
    }
    const before = await preservedHistory(record.id);
    await withTa02Lease(record.id, current.ownerId, (editLease) => assert.rejects(saveTryout({ ...ta02SaveInput(record), id: record.id, editLease, admissionMode: "open", status: "published" }, current.ownerId), /sudah terbit/));
    assert.equal(await preservedHistory(record.id), before, "published save cannot forge a configuration edit or rebuild content");
    remember(mode, current, session.id);
  }

  const preservation = await createTa02Draft("approval_required");
  const preservationSession = await publish(preservation);
  const students = await prisma.user.findMany({ where: { status: "active", previewPurpose: null, roleAssignments: { some: { role: "student", revokedAt: null } } }, orderBy: { email: "asc" }, take: 4 });
  assert.equal(students.length, 4);
  for (const [index, student] of students.entries()) {
    const status = (["pending", "active", "rejected", "revoked"] as const)[index];
    const admission = await prisma.tryoutAdmission.create({ data: { tryoutId: preservation.draft.id, studentId: student.id, status } });
    if (status === "active") await prisma.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, deliverySessionId: preservationSession.id, assignedByUserId: preservation.ownerId } });
  }
  const before = await preservedHistory(preservation.draft.id);
  await configureTryoutAdmission(preservation.draft.id, "open", preservation.ownerId, "Local admission preservation");
  assert.equal(await preservedHistory(preservation.draft.id), before, "all registration IDs/states, assignments, pins and content are preserved");
  for (const student of students) {
    const registration = await prisma.tryoutAdmission.findUniqueOrThrow({ where: { tryoutId_studentId: { tryoutId: preservation.draft.id, studentId: student.id } } });
    const repeated = await registerForTryout(preservation.draft.id, student.id);
    assert.equal(repeated.admissionId, registration.id);
    assert.equal(repeated.status, registration.status, "repeat registration cannot convert a pending/rejected/revoked registration");
  }
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: preservation.draft.id, action: "admission_mode.configured" } }), 1);
  const otherTutor = await prisma.user.findFirstOrThrow({ where: { id: { not: preservation.ownerId }, roleAssignments: { some: { role: "tutor", revokedAt: null } } } });
  await assert.rejects(configureTryoutAdmission(preservation.draft.id, "open", otherTutor.id, "Wrong owner"));
  await assert.rejects(configureTryoutAdmission(preservation.draft.id, "open", preservation.studentId, "Student"));
  await assert.rejects(configureTryoutAdmission(preservation.draft.id, "open", preservation.ownerId, " "));
  await assert.rejects(configureTryoutAdmission(preservation.draft.id, "forged" as "open", preservation.ownerId, "Invalid"), /Pilih akses/);
  assert.equal(await getOwnedTryoutOperationsView(preservation.draft.id, preservation.studentId), null);
  const fakeStudentSession = { user: { roles: ["student"] } } as Parameters<typeof requireTryoutCapability>[0];
  assert.throws(() => requireTryoutCapability(fakeStudentSession, "tryout.delivery.configure"));
  const audit = await prisma.tryoutDeliveryAudit.findFirstOrThrow({ where: { tryoutId: preservation.draft.id, action: "admission_mode.configured" } });
  assert.deepEqual(audit.before, { admissionMode: "approval_required" });
  assert.deepEqual(audit.after, { admissionMode: "open" });
  assert.equal(audit.reason, "Local admission preservation");
  await prisma.tryoutPackage.update({ where: { id: preservation.draft.id }, data: { status: "archived" } });
  await assert.rejects(configureTryoutAdmission(preservation.draft.id, "invitation_only", preservation.ownerId, "Stale archive"));
  assert.equal(await preservedHistory(preservation.draft.id), before);
  preservation.draft.admissionMode = "open";
  remember("archived", preservation, preservationSession.id);
  await withTa02Lease(existingDraft.draft.id, existingDraft.ownerId, async (editLease) => {
    await prisma.tryoutPackage.update({ where: { id: existingDraft.draft.id }, data: { status: "archived" } });
    await assert.rejects(saveTryout({ ...ta02SaveInput(existingDraft.draft), id: existingDraft.draft.id, editLease, admissionMode: "open" }, existingDraft.ownerId));
    await prisma.tryoutPackage.update({ where: { id: existingDraft.draft.id }, data: { status: "draft" } });
  });
  assert.equal((await getTryoutForEdit(existingDraft.draft.id, existingDraft.ownerId))?.admissionMode, "approval_required");

  const registrationRace = await createTa02Draft("open");
  const raceSession = await publish(registrationRace);
  const [configured, registered] = await Promise.all([
    configureTryoutAdmission(registrationRace.draft.id, "approval_required", registrationRace.ownerId, "Concurrent registration"),
    registerForTryout(registrationRace.draft.id, registrationRace.studentId),
  ]);
  assert.equal(configured.admissionMode, "approval_required");
  assert(["active", "pending"].includes(registered.status ?? ""));
  assert.equal(await prisma.tryoutAdmission.count({ where: { tryoutId: registrationRace.draft.id } }), 1);
  assert.equal(await prisma.tryoutDeliveryAssignment.count({ where: { admission: { tryoutId: registrationRace.draft.id } } }), registered.status === "active" ? 1 : 0);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: registrationRace.draft.id, action: "admission_mode.configured" } }), 1);
  registrationRace.draft.admissionMode = "approval_required";
  remember("registrationRace", registrationRace, raceSession.id);

  const startRace = await createTa02Draft("open");
  // Prior runs intentionally leave reusable attempts. Pick another existing
  // seeded student instead of deleting history or assuming Voyager is free.
  const freeStudent = await prisma.user.findFirstOrThrow({ where: { status: "active", previewPurpose: null, roleAssignments: { some: { role: "student", revokedAt: null } }, tryoutAttempts: { none: { status: "in_progress" } } }, orderBy: { email: "asc" } });
  startRace.studentId = freeStudent.id;
  startRace.studentEmail = freeStudent.email;
  const startSession = await publish(startRace);
  const primaryStudent = await prisma.user.findUniqueOrThrow({ where: { email: "student@vecalss.local" } });
  const competing = await prisma.tryoutAttempt.findFirst({ where: { studentId: primaryStudent.id, status: "in_progress", deliverySession: { availableFrom: { lte: startSession.availableUntil! }, availableUntil: { gte: startSession.availableFrom! } } } });
  if (competing) {
    const collisionProof = await createTa02Draft("open");
    const collisionSession = await publish(collisionProof);
    await registerForTryout(collisionProof.draft.id, primaryStudent.id);
    await assert.rejects(startTryoutAttempt(collisionSession.id, primaryStudent.id), /Peserta masih memiliki Tryout aktif pada sesi yang waktunya bertumpang tindih/);
    console.log("Reused primary Voyager refusal confirmed: Peserta masih memiliki Tryout aktif pada sesi yang waktunya bertumpang tindih.");
  }
  await registerForTryout(startRace.draft.id, startRace.studentId);
  assert.equal(await prisma.tryoutAttempt.count({ where: { studentId: freeStudent.id, status: "in_progress" } }), 0, "selected seeded Start target has no competing active attempt");
  const startResults = await Promise.allSettled([
    configureTryoutAdmission(startRace.draft.id, "invitation_only", startRace.ownerId, "Concurrent Start"),
    startTryoutAttempt(startSession.id, startRace.studentId),
  ]);
  if (startResults[1].status === "rejected") throw new Error(`Start race refused: ${String(startResults[1].reason)}`);
  const started = (startResults[1] as PromiseFulfilledResult<Awaited<ReturnType<typeof startTryoutAttempt>>>).value;
  assert.equal(await prisma.tryoutAttempt.count({ where: { tryoutId: startRace.draft.id } }), 1);
  assert.equal(await prisma.tryoutDeliveryAssignment.count({ where: { admission: { tryoutId: startRace.draft.id } } }), 1);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: startRace.draft.id, action: "admission_mode.configured" } }), startResults[0].status === "fulfilled" ? 1 : 0);
  const frozenView = await getOwnedTryoutOperationsView(startRace.draft.id, startRace.ownerId);
  assert.equal(frozenView?.admissionConfigurationLocked, true);
  assert.equal(await prisma.tryoutAttemptTestRun.count({ where: { attemptId: started.attemptId, status: "pending" } }), 7, "Start allocates all seven pending runs before opening a test; the allocated attempt already freezes access");
  const frozenHistory = await preservedHistory(startRace.draft.id);
  await assert.rejects(configureTryoutAdmission(startRace.draft.id, "open", startRace.ownerId, "Active attempt freeze"), /konfigurasi/);
  await withTa02Lease(startRace.draft.id, startRace.ownerId, (editLease) => assert.rejects(saveTryout({ ...ta02SaveInput(startRace.draft), id: startRace.draft.id, editLease, admissionMode: "approval_required" }, startRace.ownerId)));
  assert.equal(await preservedHistory(startRace.draft.id), frozenHistory, "frozen stale commands leave questions, pins, answers, runs and release fields intact");
  startRace.draft.admissionMode = frozenView!.admissionMode;
  remember("activeLock", startRace, startSession.id, started.attemptId);

  const pendingRecord = await createTa02Draft("open");
  const pendingSession = await publish(pendingRecord);
  const pendingAdmission = await registerForTryout(pendingRecord.draft.id, pendingRecord.studentId);
  assert(pendingAdmission.admissionId);
  const pendingRelease = await prisma.assessmentRelease.findUniqueOrThrow({ where: { id: pendingSession.assessmentReleaseId! } });
  const pendingAttempt = await prisma.tryoutAttempt.create({ data: { assessmentReleaseId: pendingRelease.id, assessmentReleaseNumber: pendingRelease.releaseNumber, assessmentReleaseDigest: pendingRelease.contentDigest, tryoutId: pendingRecord.draft.id, deliverySessionId: pendingSession.id, admissionId: pendingAdmission.admissionId, studentId: pendingRecord.studentId, serverStartedAt: new Date(Date.now() + 60_000), serverDeadlineAt: new Date(Date.now() + 3_600_000), contentSnapshot: {}, releasePolicySnapshot: {} } });
  await assert.rejects(configureTryoutAdmission(pendingRecord.draft.id, "invitation_only", pendingRecord.ownerId, "Allocated attempt freeze"), /konfigurasi/);
  assert.equal((await getOwnedTryoutOperationsView(pendingRecord.draft.id, pendingRecord.ownerId))?.admissionConfigurationLocked, true);
  remember("allocatedLock", pendingRecord, pendingSession.id, pendingAttempt.id);

  const terminalRecord = await createTa02Draft("open");
  const terminalSession = await publish(terminalRecord);
  const terminalAdmission = await registerForTryout(terminalRecord.draft.id, terminalRecord.studentId);
  assert(terminalAdmission.admissionId);
  const terminalRelease = await prisma.assessmentRelease.findUniqueOrThrow({ where: { id: terminalSession.assessmentReleaseId! } });
  const terminalAttempt = await prisma.tryoutAttempt.create({ data: { assessmentReleaseId: terminalRelease.id, assessmentReleaseNumber: terminalRelease.releaseNumber, assessmentReleaseDigest: terminalRelease.contentDigest, tryoutId: terminalRecord.draft.id, deliverySessionId: terminalSession.id, admissionId: terminalAdmission.admissionId, studentId: terminalRecord.studentId, status: "submitted", attemptState: "submitted", serverStartedAt: new Date(Date.now() - 60_000), serverDeadlineAt: new Date(Date.now() + 3_600_000), submittedAt: new Date(), contentSnapshot: {}, releasePolicySnapshot: {} } });
  await assert.rejects(configureTryoutAdmission(terminalRecord.draft.id, "invitation_only", terminalRecord.ownerId, "Terminal attempt freeze"), /konfigurasi/);
  assert.equal((await getOwnedTryoutOperationsView(terminalRecord.draft.id, terminalRecord.ownerId))?.admissionConfigurationLocked, true);
  remember("terminalLock", terminalRecord, terminalSession.id, terminalAttempt.id);
  const accessHref = buildMentorTryoutOperationsHref(fixtures.open.tryoutId, { delivery: "policy" });
  assert.equal(parseMentorTryoutContext(new URL(accessHref, "http://localhost").searchParams).delivery, "policy");
  await writeFile(new URL("../.scratch/tryout-ta02/fixtures.json", import.meta.url), JSON.stringify(fixtures, null, 2));
  console.log("TA-02 DB passed: default/create/edit/omit/reopen, atomic saved-mode publication and first request all3, student states and counts, unchanged registration/content/history, audit/reason/owner/student/archive guards, forged published save refusal, registration/Start races, allocated/active/terminal attempt freeze. Fixtures: .scratch/tryout-ta02/fixtures.json");
} finally { await prisma.$disconnect(); }

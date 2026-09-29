import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canRequestNewTryoutAdmission,
  isTryoutSessionExpired,
} from "../lib/tryout/registration-availability";

const [attempt, assessment, attemptRepository, delivery, detail, detailPage, registerPage, enrollment, result, waiting, workspace, workspaceUtils, participantRepository] = await Promise.all([
  readFile(new URL("../modules/tryout/ParticipantAttemptModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/assessment/AssessmentWorkspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/attempt-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/delivery-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutDetailModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/tryout/[tryoutId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/tryout/[tryoutId]/register/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutEnrollmentPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantResultModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantWaitingRoomModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutWorkspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutWorkspaceUtils.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/participant-repository.ts", import.meta.url), "utf8"),
]);

assert.match(workspaceUtils, /WIB/);

const attemptNavigationStart = attempt.indexOf("function getAttemptNavigationItems(");
const attemptNavigationEnd = attempt.indexOf("\nfunction ParticipantAttemptQuestionContent(", attemptNavigationStart);
assert.ok(attemptNavigationStart >= 0, "attempt navigation item builder must exist");
assert.ok(attemptNavigationEnd > attemptNavigationStart, "attempt navigation builder must end before question content");
const attemptNavigation = attempt.slice(attemptNavigationStart, attemptNavigationEnd);
assert.match(attemptNavigation, /isCurrent:\s*candidateIndex === index/);
assert.match(attemptNavigation, /state:\s*marked\.has\(candidate\.id\)\s*\?\s*"flagged"\s*:\s*answerIds\.has\(candidate\.id\)\s*\?\s*"answered"\s*:\s*"empty"/);
assert.match(assessment, /marker\.isCurrent \?\? marker\.state === "active"/);
assert.match(assessment, /marker\.state === "answered"\s*\?\s*" \(sudah dijawab\)"/);
assert.match(assessment, /marker\.state === "flagged"\s*\?\s*" \(ditandai\)"/);

const questionMarkerStart = assessment.indexOf("function AssessmentQuestionMarker(");
const questionPickerMarkerStart = assessment.indexOf("function AssessmentQuestionPickerMarker(", questionMarkerStart);
const annotationStart = assessment.indexOf("function AssessmentAnnotationOverlay(", questionPickerMarkerStart);
assert.ok(questionMarkerStart >= 0, "horizontal question marker must exist");
assert.ok(questionPickerMarkerStart > questionMarkerStart, "modal question picker marker must follow the horizontal marker");
assert.ok(annotationStart > questionPickerMarkerStart, "question picker marker must end before the annotation overlay");

for (const markerComponent of [
  assessment.slice(questionMarkerStart, questionPickerMarkerStart),
  assessment.slice(questionPickerMarkerStart, annotationStart),
]) {
  assert.match(markerComponent, /aria-current=\{isCurrent \? "step" : undefined\}/);
  assert.match(markerComponent, /aria-label=\{getAssessmentQuestionMarkerLabel\(marker\)\}/);
  assert.match(markerComponent, /!isCurrent && marker\.state === "answered"/);
  assert.match(markerComponent, /!isCurrent && marker\.state === "flagged"/);
  assert.match(markerComponent, /isCurrent &&/);
}
console.log("Tryout current, answered, and flagged navigation markers passed.");

assert.match(detail, /Menunggu jadwal sesi/);
assert.match(detail, /Khusus peserta undangan/);
assert.match(workspaceUtils, /function canEnterParticipantWaitingRoom/);
assert.match(workspace, /canEnterParticipantWaitingRoom\(tryout\)/);
assert.match(workspace, /\? "Mulai"/);
assert.match(workspace, /buildStudentTryoutSubrouteHref\(tryout\.id, "waiting"/);
assert.match(workspace, /Reset pencarian/);
assert.match(detailPage, /canEnterParticipantWaitingRoom\(tryout, selectedSessionId\)/);
assert.match(detailPage, /redirect\(buildStudentTryoutSubrouteHref\(tryout\.id, "waiting"/);
assert.match(detail, /ParticipantTryoutEnrollmentPanel/);
assert.match(detailPage, /participantTargetProfile/);
assert.match(detailPage, /universities/);
assert.match(enrollment, /AlertDialogTitle>Konfirmasi pendaftaran/);
assert.match(enrollment, /registerForTryoutWithTargetAction/);
assert.match(enrollment, /aria-label="Cari universitas target"/);
assert.match(registerPage, /buildStudentTryoutHref\(tryoutId/);

assert.match(waiting, /Panduan tryout/);
assert.match(waiting, /className="w-full"/);
assert.match(waiting, /Menyiapkan…/);
assert.match(waiting, /: "Mulai Tryout"/);
assert.match(waiting, /render=\{<Link href="\/tryout" \/>\}/);
assert.equal(
  waiting.match(/Kembali ke daftar Tryout/g)?.length,
  1,
  "an unavailable or expired session needs a catalogue link",
);
assert.doesNotMatch(waiting, /Kembali ke detail tryout/);
assert.doesNotMatch(waiting, /<Checkbox/);
assert.doesNotMatch(waiting, /Saya memahami timer tidak dapat dijeda/);
assert.doesNotMatch(waiting, /countdown/);
assert.match(workspace, /\? "Lanjutkan"/);
assert.match(workspace, /\? "Lihat hasil"/);
assert.match(workspace, /\? "Selesai"/);
assert.match(detail, /<BackButton\b[^>]*\blabel="Kembali ke katalog"/);
assert.doesNotMatch(detail, /<span>Detail Tryout<\/span>/);

assert.match(attempt, /:position`/);
assert.match(attempt, /Progres dipulihkan ke soal/);
assert.doesNotMatch(attempt, /className=\{cn\("hidden items-center gap-2 text-xs sm:flex"/);
assert.match(attempt, /Gagal tersimpan · pilih lagi/);
assert.match(attemptRepository, /\$executeRaw`SELECT pg_advisory_xact_lock/);
assert.doesNotMatch(attemptRepository, /\$queryRaw`SELECT pg_advisory_xact_lock/);
assert.match(attempt, /nativeButton=\{false\}[\s\S]*buildStudentAttemptHref\(attemptId/);
assert.match(waiting, /buildStudentAttemptHref\(attempt\.id/);
assert.match(waiting, /nativeButton=\{false\}/);
assert.match(result, /<BackButton href=\{safeReturnHref\} label="Kembali ke tryout"/);
assert.match(enrollment, /response\.result\.state === "unavailable"/);
assert.match(detail, /canRequestNewTryoutAdmission/);
assert.match(detail, /registrationWindowClosed/);
assert.match(workspace, /canRequestNewTryoutAdmission/);
assert.match(workspace, /registrationUnavailable/);
assert.match(participantRepository, /isTryoutSessionExpired/);
const unavailableGuard = delivery.indexOf("status === TryoutAdmissionStatus.active && !admissionWindowSession");
const newAdmissionTargetWrite = delivery.indexOf("await tx.studentProfile.update", unavailableGuard);
assert.ok(unavailableGuard > -1, "open registration must guard missing sessions");
assert.ok(newAdmissionTargetWrite > unavailableGuard, "target changes must happen only after session availability is confirmed");
const registrationStart = delivery.indexOf("async function registerForTryout(");
const pendingWindowCheck = delivery.indexOf("findDefaultSessionCandidate(tx, tryoutId)", registrationStart);
const newAdmissionCreate = delivery.indexOf("tx.tryoutAdmission.create", registrationStart);
assert.ok(pendingWindowCheck > registrationStart, "approval-required admissions must check the configured default session");
assert.ok(newAdmissionCreate > pendingWindowCheck, "expired registration windows must be rejected before an admission is created");
assert.match(delivery, /isTryoutAdmissionSessionAvailable/);
assert.match(delivery, /\$executeRaw`SELECT pg_advisory_xact_lock/);
assert.doesNotMatch(delivery, /\$queryRaw`SELECT pg_advisory_xact_lock/);

const registrationNow = new Date("2026-09-27T05:00:00.000Z");
const expiredDefaultSession = {
  assessmentReleaseId: "release-expired",
  availableUntil: new Date("2026-09-19T16:00:00.000Z"),
  id: "session-expired",
  isDefaultOpenRegistration: true,
  status: "active",
};
const futureDefaultSession = {
  ...expiredDefaultSession,
  availableUntil: new Date("2026-10-01T16:00:00.000Z"),
  id: "session-future",
};
assert.equal(isTryoutSessionExpired(expiredDefaultSession.availableUntil, registrationNow), true);
assert.equal(isTryoutSessionExpired(futureDefaultSession.availableUntil, registrationNow), false);
assert.equal(
  canRequestNewTryoutAdmission("approval_required", [expiredDefaultSession], registrationNow),
  false,
  "approval-required admissions must close after the default session expires",
);
assert.equal(
  canRequestNewTryoutAdmission("open", [expiredDefaultSession], registrationNow),
  false,
  "open admissions must close after the default session expires",
);
assert.equal(
  canRequestNewTryoutAdmission("approval_required", [futureDefaultSession], registrationNow),
  true,
  "a future default session must continue to accept approval-required registrations",
);
assert.equal(
  canRequestNewTryoutAdmission("approval_required", [], registrationNow),
  true,
  "approval-required registration remains available before a session is created",
);
assert.equal(
  canRequestNewTryoutAdmission("open", [], registrationNow),
  false,
  "open registration still requires a default session",
);

for (const slug of [
  "literasi-bahasa-inggris",
  "literasi-bahasa-indonesia",
  "pemahaman-bacaan-menulis",
  "pengetahuan-kuantitatif",
  "penalaran-matematika",
  "pengetahuan-pemahaman-umum",
  "penalaran-umum",
]) {
  assert.match(result, new RegExp(slug));
}
assert.doesNotMatch(result, /href="\/materi"/);
assert.match(result, /bukan nilai resmi SNBT/);
assert.match(result, /focus-visible:ring-4/);

console.log("Tryout participant UX contracts passed.");

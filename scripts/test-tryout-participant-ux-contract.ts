import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [attempt, attemptRepository, delivery, detail, detailPage, registerPage, enrollment, result, waiting, workspace, workspaceUtils] = await Promise.all([
  readFile(new URL("../modules/tryout/ParticipantAttemptModule.tsx", import.meta.url), "utf8"),
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
]);

assert.match(workspaceUtils, /WIB/);
assert.match(detail, /Menunggu jadwal sesi/);
assert.match(detail, /Khusus peserta undangan/);
assert.match(workspaceUtils, /function canEnterParticipantWaitingRoom/);
assert.match(workspace, /canEnterParticipantWaitingRoom\(tryout\)/);
assert.match(workspace, /\? "Mulai"/);
assert.match(workspace, /`\/tryout\/\$\{tryout\.id\}\/waiting`/);
assert.match(workspace, /Reset pencarian/);
assert.match(detailPage, /canEnterParticipantWaitingRoom\(tryout\)/);
assert.match(detailPage, /redirect\(`\/tryout\/\$\{tryout\.id\}\/waiting`\)/);
assert.match(detail, /ParticipantTryoutEnrollmentPanel/);
assert.match(detailPage, /participantTargetProfile/);
assert.match(detailPage, /universities/);
assert.match(enrollment, /AlertDialogTitle>Konfirmasi pendaftaran/);
assert.match(enrollment, /registerForTryoutWithTargetAction/);
assert.match(enrollment, /aria-label="Cari universitas target"/);
assert.match(registerPage, /redirect\(`\/tryout\/\$\{tryoutId\}`\)/);

assert.match(waiting, /Panduan tryout/);
assert.match(waiting, /className="w-full"/);
assert.match(waiting, /Menyiapkan…/);
assert.match(waiting, /: "Mulai"/);
assert.match(waiting, /<BackButton\b[^>]*\blabel="Kembali ke katalog tryout"/);
assert.equal(
  waiting.match(/<BackButton\b/g)?.length,
  2,
  "both waiting-room branches need a catalogue back link",
);
assert.doesNotMatch(waiting, /<span>Kembali ke katalog tryout<\/span>/);
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
assert.match(attempt, /nativeButton=\{false\}[\s\S]*render=\{<Link href=\{`\/tryout\/attempt/);
assert.match(waiting, /nativeButton=\{false\}[\s\S]*render=\{<Link href=\{resultReady/);
assert.match(result, /<BackButton\b[^>]*\bhref="\/tryout"[^>]*\blabel="Kembali ke tryout"/);
assert.match(enrollment, /response\.result\.state === "unavailable"/);
const unavailableGuard = delivery.indexOf("status === TryoutAdmissionStatus.active && !defaultSession");
const newAdmissionTargetWrite = delivery.indexOf("await tx.studentProfile.update", unavailableGuard);
assert.ok(unavailableGuard > -1, "open registration must guard missing sessions");
assert.ok(newAdmissionTargetWrite > unavailableGuard, "target changes must happen only after session availability is confirmed");
assert.match(delivery, /\$executeRaw`SELECT pg_advisory_xact_lock/);
assert.doesNotMatch(delivery, /\$queryRaw`SELECT pg_advisory_xact_lock/);

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

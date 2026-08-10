import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [attempt, delivery, detail, registration, result, waiting, workspace, workspaceUtils] = await Promise.all([
  readFile(new URL("../modules/tryout/ParticipantAttemptModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/delivery-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutDetailModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutRegistrationModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantResultModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantWaitingRoomModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutWorkspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutWorkspaceUtils.ts", import.meta.url), "utf8"),
]);

assert.match(workspaceUtils, /WIB/);
assert.match(detail, /Menunggu jadwal sesi/);
assert.match(detail, /Khusus peserta undangan/);
assert.match(workspace, /tryout\.admissionStatus === "active" && tryout\.assignments\.length/);
assert.match(workspace, /Reset pencarian/);

assert.match(waiting, /Aktivitas layar dicatat/);
assert.match(waiting, /tanpa penalti skor otomatis/);
assert.match(waiting, /Saya memahami timer tidak dapat dijeda/);

assert.match(attempt, /:position`/);
assert.match(attempt, /Progres dipulihkan ke soal/);
assert.doesNotMatch(attempt, /className=\{cn\("hidden items-center gap-2 text-xs sm:flex"/);
assert.match(attempt, /Gagal tersimpan · pilih lagi/);

assert.match(registration, /response\.result\.state === "unavailable"/);
const unavailableGuard = delivery.indexOf("status === TryoutAdmissionStatus.active && !defaultSession");
const newAdmissionTargetWrite = delivery.indexOf("await tx.studentProfile.update", unavailableGuard);
assert.ok(unavailableGuard > -1, "open registration must guard missing sessions");
assert.ok(newAdmissionTargetWrite > unavailableGuard, "target changes must happen only after session availability is confirmed");

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

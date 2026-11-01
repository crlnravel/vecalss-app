import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { projectParticipantTryoutResultAvailability } from "../lib/tryout/participant-result-projection";

const baseAttempt = {
  attemptReleaseState: "hidden",
  attemptScoringState: "scored",
  attemptStatus: "completed",
  hasScore: true,
  sessionReleaseState: "hidden",
};

assert.equal(
  projectParticipantTryoutResultAvailability(baseAttempt),
  "unreleased",
  "a completed, scored attempt stays unavailable while session and attempt releases are hidden",
);
assert.equal(
  projectParticipantTryoutResultAvailability({
    ...baseAttempt,
    attemptReleaseState: "scheduled",
    sessionReleaseState: "scheduled",
  }),
  "unreleased",
  "scheduled results remain unavailable until release state becomes released",
);
assert.equal(
  projectParticipantTryoutResultAvailability({
    ...baseAttempt,
    attemptScoringState: "recalculating",
  }),
  "processing",
  "a completed attempt without final scoring is still being prepared",
);
assert.equal(
  projectParticipantTryoutResultAvailability({
    ...baseAttempt,
    attemptReleaseState: "released",
    sessionReleaseState: "released",
  }),
  "released",
  "released results remain available",
);
assert.equal(
  projectParticipantTryoutResultAvailability({ ...baseAttempt, attemptStatus: "in_progress" }),
  null,
  "an in-progress attempt does not expose a result status",
);

const [participantRepository, detail, catalogue, waiting, result] = await Promise.all([
  readFile(new URL("../lib/tryout/participant-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutDetailModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutWorkspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantWaitingRoomModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantResultModule.tsx", import.meta.url), "utf8"),
]);

assert.match(participantRepository, /projectParticipantTryoutResultAvailability\(/);
assert.match(participantRepository, /attempts:\s*\{\s*select:\s*\{[^}]*releaseState:\s*true/s);
assert.match(participantRepository, /releaseState:\s*true/);
assert.match(participantRepository, /resultReleasePolicy:\s*true/);
assert.match(participantRepository, /effectiveResultReleasePolicy:\s*deliverySession\.resultReleasePolicy === "inherit"/);
// Student result-state wording lives in one module; each surface must use it instead of local strings.
const copy = await readFile(new URL("../lib/tryout/participant-result-copy.ts", import.meta.url), "utf8");
assert.match(copy, /availability === "released" \? "Lihat hasil" : "Periksa status hasil"/);
assert.match(copy, /label: "Hasil belum dibuka"/);
assert.match(copy, /Hasil belum dibuka\./);
assert.match(detail, /studentResultActionLabel\(attempt\.resultAvailability\)/);
assert.match(detail, /studentResultBadge\(/);
assert.match(catalogue, /studentResultActionLabel\(attempt\.resultAvailability\)/);
assert.match(waiting, /Tryout sudah selesai/);
assert.match(waiting, /studentResultActionLabel\(attempt\.resultAvailability\)/);
assert.match(waiting, /effectiveResultReleasePolicy/);
assert.match(waiting, /studentResultMessage\(/);
assert.match(result, /Hasil belum dibuka/);
assert.doesNotMatch(`${detail}${catalogue}${waiting}`, /Hasil tersedia|Hasilmu sudah tersedia|Menunggu rilis operator/);

console.log("Tryout participant result-release projection passed.");

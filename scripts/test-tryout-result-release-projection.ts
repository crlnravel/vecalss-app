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
assert.match(detail, /attempt\.resultAvailability === "released" \? "Lihat hasil" : "Periksa status hasil"/);
assert.match(detail, /label: "Hasil belum dibuka"/);
assert.match(catalogue, /attempt\.resultAvailability === "released"\s*\?\s*"Lihat hasil"\s*:\s*"Periksa status hasil"/);
assert.match(waiting, /Tryout sudah selesai/);
assert.match(waiting, /resultReleased \? "Lihat hasil" : "Periksa status hasil"/);
assert.match(waiting, /effectiveResultReleasePolicy === "manual"/);
assert.match(waiting, /Hasil belum dibuka/);
assert.match(result, /Hasil belum dibuka/);

console.log("Tryout participant result-release projection passed.");

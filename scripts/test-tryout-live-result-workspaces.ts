import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  deriveTryoutLiveProjection,
  deriveTryoutResultProjection,
  sanitizeTryoutWorkspaceParticipant,
} from "../lib/tryout/operations-projections";

const [delivery, operations, workspace, live, attempts, results, participants, attemptDetail, participantDetail, attemptDetailRoute, participantDetailRoute, sessionDetailRoute, sessionCreateRoute, operationsRoute] = await Promise.all([
  readFile(new URL("../lib/tryout/delivery-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/operations-view.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutBuilderPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutLivePageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutAttemptsPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutResultsPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutParticipantsPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutAttemptDetailPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutParticipantDetailPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/[tryoutId]/operations/attempts/[attemptId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/[tryoutId]/operations/participants/[admissionId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/[tryoutId]/operations/sessions/[sessionId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/[tryoutId]/operations/sessions/new/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/[tryoutId]/operations/page.tsx", import.meta.url), "utf8"),
]);

const baseRun = {
  catState: "not_applicable",
  integrityEvents: 0,
  remainingSeconds: null,
  scoringState: "pending",
  sequenceNo: 1,
  status: "pending",
};

const baseAttempt = {
  attemptId: "attempt-1",
  attemptState: "pending",
  scoringState: "pending",
  status: "pending",
  runs: [baseRun],
};

assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active" }).state, "registered");
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: baseAttempt }).state, "checked_in");
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, runs: [{ ...baseRun, status: "active" }] } }).state, "in_progress");
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, attemptState: "in_progress", status: "in_progress" } }).state, "in_progress");
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, attemptState: "in_progress", status: "in_progress", runs: [{ ...baseRun, remainingSeconds: 0, status: "active" }] } }).state, "needs_attention");
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, disconnectStartedAt: "2026-08-23T08:00:00.000Z" } }).state, "disconnected");
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, integrityEvents: 1 } }).state, "needs_attention");
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, runs: [{ ...baseRun, catState: "failed", catFailureReason: "CAT timeout" }] } }).state, "cat_failure");
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, attemptState: "submitted", status: "submitted" } }).state, "submitted");
assert.match(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, integrityEvents: 1 } }).reason, /tidak ada konsekuensi otomatis/iu);
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, attemptState: "submitted", status: "submitted", integrityEvents: 1 } }).state, "submitted");
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, attemptState: "submitted", status: "submitted", scoringReviewReason: "Tinjau" , scoringState: "review_required" } }).state, "submitted");
assert.equal(deriveTryoutLiveProjection({ admissionStatus: "active", attempt: { ...baseAttempt, attemptState: "submitted", status: "submitted", runs: [{ ...baseRun, catState: "failed", catFailureReason: "CAT timeout" }] } }).state, "submitted");
assert.match(delivery, /tryout\.status !== ContentStatus\.published/u, "Delivery mutations must reject draft Tryouts before ownership/session writes");
assert.doesNotMatch(workspace, /keepMounted/u, "draft Delivery content must not remain mounted in the gated builder");
assert.match(results, /window\.history\.replaceState[\s\S]*validSessionId/u, "stale Results session links must normalize to a safe session in the URL");

const hidden = deriveTryoutResultProjection({
  attempt: { ...baseAttempt, attemptState: "submitted", releaseReady: true, releaseState: "hidden", score: "88.50", scoringState: "scored", status: "submitted" },
  session: { rankingRule: "national", releaseState: "hidden" },
});
assert.equal(hidden.resultReadiness, "scored");
assert.equal(hidden.releaseState, "hidden");
assert.equal(hidden.scoreVisible, false);
assert.equal(hidden.displayScore, null);
assert.equal(hidden.rankingAvailability, "pending");

const sessionHidden = deriveTryoutResultProjection({
  attempt: { ...baseAttempt, attemptState: "submitted", releaseReady: true, releaseState: "scheduled", score: "88.50", scoringState: "scored", status: "submitted" },
  session: { rankingRule: "national", releaseState: "hidden" },
});
assert.equal(sessionHidden.releaseState, "hidden");
assert.equal(sessionHidden.scoreVisible, false);

const released = deriveTryoutResultProjection({
  attempt: { ...baseAttempt, attemptState: "submitted", releaseReady: true, releaseState: "released", score: "88.50", scoringState: "scored", status: "submitted" },
  session: { eligibleRankingAttempts: 2, rankingRule: "national", releaseState: "released" },
});
assert.equal(released.scoreVisible, true);
assert.equal(released.displayScore, "88.50");
assert.equal(released.rankingAvailability, "available");

const noRanking = deriveTryoutResultProjection({
  attempt: { ...baseAttempt, attemptState: "submitted", releaseReady: true, releaseState: "released", score: "88.50", scoringState: "scored", status: "submitted" },
  session: { eligibleRankingAttempts: 2, rankingRule: "none", releaseState: "released" },
});
assert.equal(noRanking.rankingAvailability, "unavailable");

const oneRankedAttempt = deriveTryoutResultProjection({
  attempt: { ...baseAttempt, attemptState: "submitted", releaseReady: true, releaseState: "released", score: "88.50", scoringState: "scored", status: "submitted" },
  session: { eligibleRankingAttempts: 1, rankingRule: "national", releaseState: "released" },
});
assert.equal(oneRankedAttempt.rankingAvailability, "unavailable");

const inconsistentRelease = deriveTryoutResultProjection({
  attempt: { ...baseAttempt, attemptState: "submitted", releaseReady: false, releaseState: "released", score: "88.50", scoringState: "scored", status: "submitted" },
  session: { eligibleRankingAttempts: 2, rankingRule: "national", releaseState: "released" },
});
assert.equal(inconsistentRelease.resultReadiness, "scoring_pending");
assert.equal(inconsistentRelease.scoreVisible, false);
assert.equal(inconsistentRelease.displayScore, null);

const review = deriveTryoutResultProjection({
  attempt: { ...baseAttempt, releaseState: "released", score: null, scoringReviewReason: "Perlu cek CAT", scoringState: "review_required" },
  session: { rankingRule: "cohort", releaseState: "released" },
});
assert.equal(review.resultReadiness, "review_required");
assert.equal(review.scoreVisible, false);
assert.equal(review.rankingAvailability, "pending");

const participantFixture = {
  attempt: { normalizedScore: "91", rawScore: "92", scaledScore: "91", score: "91" },
  score: { normalizedScore: "91", rawScore: "92", scaledScore: "91", score: "91" },
};
const hiddenParticipant = sanitizeTryoutWorkspaceParticipant(participantFixture, false);
assert.equal(hiddenParticipant.attempt?.score, null);
assert.equal(hiddenParticipant.attempt?.normalizedScore, null);
assert.equal(hiddenParticipant.score.score, null);
assert.equal(hiddenParticipant.score.rawScore, null);
const releasedParticipant = sanitizeTryoutWorkspaceParticipant(participantFixture, true);
assert.equal(releasedParticipant.attempt?.score, "91");
assert.equal(releasedParticipant.score.score, "91");

for (const label of ["Delivery", "Policy", "Sessions", "Participants", "Operations", "Live", "Attempts", "Results", "Results & release", "Review & Publish"]) assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
assert.match(workspace, /value="live"/u);
assert.match(workspace, /value="attempts"/u);
assert.match(workspace, /value="schedule"/u);
assert.match(workspace, /deliveryAreaFor/u);
assert.match(workspace, /value === "operations"\) return "sessions"/u);
assert.match(workspace, /KaptenTryoutLivePageModule/u);
assert.match(workspace, /KaptenTryoutAttemptsPageModule/u);
assert.match(workspace, /KaptenTryoutResultsPageModule/u);
assert.match(operations, /participantsWithAttention/u);
assert.match(operations, /participants: participantsWithAttention/u);
assert.match(operations, /deriveTryoutLiveProjection/u);
assert.match(operations, /deriveTryoutResultProjection/u);
assert.match(operations, /integrityEventTrail/u);
assert.match(operations, /catResolutionAudits/u);
assert.match(operations, /remainingSeconds/u);
assert.match(operations, /\["rejected", "revoked"\]/u);
assert.match(operations, /answer\.selectedOptionId \|\| answer\.answerText\?\.trim\(\)/u);
assert.match(operations, /eligibleRankingAttempts/u);
assert.match(operations, /resultReleaseReady/u);
assert.match(operations, /toTryoutWorkspaceView/u);
assert.match(operations, /sanitizeTryoutWorkspaceParticipant/u);
assert.doesNotMatch(operations, /participant: attempt\.student,\n\s+score: attempt\.score/u, "results must not carry raw hidden scores");
assert.match(operations, /toOperationsReleaseMetadata/u);
assert.doesNotMatch(operations, /payload: release\.payload/u, "operations client DTO must not include release payloads");
const builderPage = await readFile(new URL("../app/mentor/tryout/[tryoutId]/page.tsx", import.meta.url), "utf8");
assert.match(builderPage, /toTryoutWorkspaceView/u, "authoring workspace must receive the gated participant DTO");
assert.match(operations, /attempts: \[\]/u, "authoring workspace must not receive raw session attempts");
assert.match(delivery, /answers:\s*\{\s*select:/u);
assert.doesNotMatch(delivery.slice(delivery.lastIndexOf("answers:")), /isCorrect/u, "operations reads must not select answer correctness fields");
assert.match(live, /registered/u);
assert.match(live, /checked_in/u);
assert.match(live, /disconnected/u);
assert.match(live, /needs_attention/u);
assert.match(live, /cat_failure/u);
assert.match(live, /tidak ada penalti skor/iu);
assert.match(live, /marker lifecycle server/iu);
assert.match(attempts, /integrityEventTrail/u);
assert.match(attempts, /catResolutionAudits/u);
assert.match(attempts, /remainingSeconds/u);
assert.match(attempts, /Terputus/u);
assert.match(attempts, /Tidak ada konsekuensi otomatis/iu);
assert.match(results, /scoreVisible/u);
assert.match(results, /rankingAvailabilityLabels/u);
assert.match(results, /operations\/participants\/\$\{result\.admissionId\}/u);
assert.match(results, /bundle hasil parsial/u);
assert.match(results, /releaseBlockers/u);
assert.match(results, /Rilis manual tertahan/u);
assert.match(participants, /participant\.attention/u);
assert.doesNotMatch(attemptDetail, /<main\b/u, "attempt detail must not nest a page landmark inside MentorWorkspaceShell");
assert.doesNotMatch(participantDetail, /<main\b/u, "participant detail must not nest a page landmark inside MentorWorkspaceShell");
assert.match(attemptDetailRoute, /contentElement="div"/u);
assert.match(participantDetailRoute, /contentElement="div"/u);
assert.match(sessionDetailRoute, /operations\.status !== "published"/u, "session detail must not render for a draft Tryout");
assert.match(sessionCreateRoute, /operations\.status !== "published"/u, "session creation must not render for a draft Tryout");
assert.match(operationsRoute, /workspace=schedule&delivery=sessions/u, "legacy operations route must land on Delivery Sessions");

console.log("Tryout Live, Attempts, and Results workspace contracts passed.");

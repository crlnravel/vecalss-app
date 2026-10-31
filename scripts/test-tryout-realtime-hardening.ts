import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { deriveTryoutLiveProjection } from "../lib/tryout/operations-projections";

const [attemptRepository, operationsView, mentorActions, participantActions, liveModule, refreshModule, liveAction, detailModule] = await Promise.all([
  readFile(new URL("../lib/tryout/attempt-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/operations-view.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/tryout-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/participant-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutLivePageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutOperationsRefresh.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/tryout-operations-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutAttemptDetailPageModule.tsx", import.meta.url), "utf8"),
]);

assert.match(attemptRepository, /function lockAttemptScope/u);
// Row locks live in the shared lock helpers, which sort their keys; lockAttemptScope must take them in the canonical order.
const lockHelpers = await readFile(new URL("../lib/tryout/locks.ts", import.meta.url), "utf8");
const serializationLocks = await readFile(new URL("../lib/serialization/locks.ts", import.meta.url), "utf8");
assert.match(serializationLocks, /async function lockOrderedRows/u, "the shared helper that orders row locks exists");
assert.match(lockHelpers, /await lockOrderedRows\(tx, LOCK_LEVEL\.runtime/u, "runtime row locks go through the sorted lock helper");
for (const table of ["tryout_delivery_sessions", "tryout_admissions", "tryout_delivery_assignments", "tryout_attempts", "tryout_attempt_test_runs"]) {
  assert.match(lockHelpers, new RegExp(`FROM ${table} WHERE id = [^\\n]+FOR UPDATE`, "u"), `${table} rows are locked FOR UPDATE`);
}
const lockScopeStart = attemptRepository.indexOf("async function lockAttemptScope");
const lockScopeBody = attemptRepository.slice(lockScopeStart, attemptRepository.indexOf("\nasync function", lockScopeStart + 1));
const lockCalls = ["lockTryoutSessions", "lockTryoutAdmissions", "lockTryoutAssignments", "lockTryoutAttempts", "lockTryoutRuns"].map((name) => lockScopeBody.indexOf(`${name}(`));
assert(lockCalls.every((position, index) => position > 0 && (index === 0 || position > lockCalls[index - 1])), "lockAttemptScope locks sessions, admissions, assignments, attempts, then runs");
assert.match(attemptRepository, /function synchronizeTryoutOperations/u);
// Tryouts are shared across Kapten: operations sync requires an active Kapten or admin, not the creator.
assert.match(attemptRepository, /isActiveTryoutManager\(tx, actorId\)/u);
assert.doesNotMatch(attemptRepository, /createdByUserId: actorId/u);
assert.match(attemptRepository, /attempt\.serverDeadlineAt <= now/u);
assert.match(attemptRepository, /attempt\.deadline_expired/u);
assert.match(attemptRepository, /attempt\.disconnect_started/u);
assert.match(attemptRepository, /attempt\.disconnect_reconciled/u);
assert.match(attemptRepository, /attempt\.disconnect_terminal/u);
assert.match(attemptRepository, /after: json\(\{ attemptId, disconnectStartedAt: now\.toISOString\(\), runId \}\)/u);
assert.match(attemptRepository, /origin\.runId !== runId/u);
assert.match(attemptRepository, /isManagedPreviewPurpose/u);
assert.match(attemptRepository, /assignment\.status !== TryoutAssignmentStatus\.active/u);
const operationsSync = attemptRepository.slice(
  attemptRepository.indexOf("async function synchronizeTryoutOperations"),
  attemptRepository.indexOf("type DisconnectCommandResult"),
);
assert.match(operationsSync, /const candidates = await prisma\.\$transaction\(async \(tx\) =>/u, "candidates are read in their own short transaction");
assert.match(operationsSync, /for \(const candidate of candidates\) \{/u);
assert.match(operationsSync, /const synchronized = await prisma\.\$transaction\(async \(tx\) =>/u);
assert.match(operationsSync, /synchronizeAttempt\(tx, candidate\.id, now, actorId\)/u);
assert.match(operationsSync, /if \(!synchronized\) return false/u);
assert.doesNotMatch(operationsSync, /return prisma\.\$transaction\(async \(tx\) => \{[\s\S]*const candidates/u, "refresh must not retain candidate locks across the candidate loop");

assert.match(operationsView, /synchronizeTryoutOperations\(tryoutId, actorId\)/u);
assert.match(operationsView, /if \(!synchronized\) return null/u);

assert.match(mentorActions, /managementSession\("tryout\.results\.manage"\)/u);
assert.match(mentorActions, /startTryoutDisconnect\(attemptId, runId, session\.user\.id/u);
assert.match(mentorActions, /reconcileTryoutDisconnect\(attemptId, runId, session\.user\.id/u);
assert.match(participantActions, /requireStudentSession/u);
assert.match(participantActions, /startTryoutDisconnect\(attemptId, runId, session\.user\.id/u);
assert.match(participantActions, /reconcileTryoutDisconnect\(attemptId, runId, session\.user\.id/u);

assert.match(liveAction, /requireTutorSession/u);
assert.match(liveAction, /toTryoutWorkspaceView/u);
assert.match(liveModule, /^"use client";/u);
assert.match(liveModule, /useTryoutOperationsRefresh/u);
assert.match(refreshModule, /^"use client";/u);
assert.match(refreshModule, /refreshTryoutLiveAction/u);
assert.match(refreshModule, /setInterval\(poll, LIVE_REFRESH_INTERVAL_MS\)/u);
assert.match(refreshModule, /MAX_AUTO_REFRESH_FAILURES/u);
assert.match(refreshModule, /document\.visibilityState/u);
assert.match(refreshModule, /lastUpdatedAt/u);
assert.doesNotMatch(liveModule, /recordTryoutIntegrityEventAction/u);
assert.doesNotMatch(liveModule, /disconnectStartedAt\s*=/u);
assert.doesNotMatch(detailModule, /startTryoutDisconnectAction/u);
assert.doesNotMatch(detailModule, /reconcileTryoutDisconnectAction/u);

const projection = deriveTryoutLiveProjection({
  admissionStatus: "active",
  attempt: {
    attemptId: "attempt-1",
    attemptState: "in_progress",
    disconnectStartedAt: "2026-08-23T08:00:00.000Z",
    reconciledAt: "2026-08-23T08:01:00.000Z",
    scoringState: "pending",
    status: "in_progress",
    runs: [{ sequenceNo: 1, status: "active", scoringState: "pending" }],
  },
});
assert.equal(projection.state, "in_progress");
assert.equal(projection.disconnectStartedAt, "2026-08-23T08:00:00.000Z");
assert.equal(projection.reconciledAt, "2026-08-23T08:01:00.000Z");
assert.equal(deriveTryoutLiveProjection({
  admissionStatus: "active",
  attempt: {
    attemptId: "attempt-2",
    attemptState: "in_progress",
    scoringState: "pending",
    status: "in_progress",
    runs: [{ sequenceNo: 2, status: "expired", scoringState: "review_required" }],
  },
}).state, "needs_attention");
assert.equal(deriveTryoutLiveProjection({
  admissionStatus: "active",
  attempt: {
    attemptId: "attempt-expired-disconnect",
    attemptState: "expired",
    disconnectStartedAt: "2026-08-23T08:00:00.000Z",
    scoringState: "pending",
    status: "expired",
    runs: [{ sequenceNo: 1, status: "expired", scoringState: "pending" }],
  },
}).state, "submitted");
assert.equal(deriveTryoutLiveProjection({
  admissionStatus: "active",
  attempt: {
    attemptId: "attempt-expired-run-after-disconnect",
    attemptState: "in_progress",
    disconnectStartedAt: "2026-08-23T08:00:00.000Z",
    reconciledAt: "2026-08-23T08:05:00.000Z",
    scoringState: "pending",
    status: "in_progress",
    runs: [{ sequenceNo: 1, status: "expired", scoringState: "pending" }],
  },
}).state, "needs_attention");
assert.equal(deriveTryoutLiveProjection({
  admissionStatus: "active",
  attempt: {
    attemptId: "attempt-terminal-integrity",
    attemptState: "submitted",
    integrityEvents: 1,
    scoringState: "review_required",
    status: "submitted",
    runs: [{ sequenceNo: 1, status: "sealed", scoringState: "review_required" }],
  },
}).state, "submitted");

console.log("Tryout realtime hardening contracts passed.");

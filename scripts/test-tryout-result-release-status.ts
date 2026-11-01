import assert from "node:assert/strict";

import { describeParticipantResultStatus, describePublishBlockedReason, describeResultReleaseRule } from "@/lib/tryout/result-release-status";
import type { TryoutSessionReadiness } from "@/lib/tryout/result-readiness";

const status = (inProgress: boolean, releaseState: string, resultReadiness: string) => describeParticipantResultStatus({ inProgress, result: { releaseState, resultReadiness } });

assert.equal(status(true, "hidden", "scored"), null);
assert.equal(describeParticipantResultStatus({ inProgress: false, result: null }), null);
assert.equal(status(false, "hidden", "not_started"), null);
assert.equal(status(false, "released", "scored")?.label, "Dirilis");
assert.equal(status(false, "released", "scored")?.tone, "success");
assert.equal(status(false, "hidden", "scored")?.label, "Belum dirilis");
assert.equal(status(false, "scheduled", "scored")?.label, "Terjadwal");
assert.equal(status(false, "hidden", "scoring_pending")?.label, "Menunggu penilaian");
// A released attempt whose stored result failed review is never shown as released.
const review = status(false, "released", "review_required");
assert.equal(review?.label, "Perlu diperiksa");
assert.equal(review?.tone, "attention");
for (const value of [review, status(false, "hidden", "scoring_pending"), status(false, "hidden", "scored")]) {
  assert.doesNotMatch(`${value?.label} ${value?.hint}`, /AssessmentRelease|snapshot|digest|binding|Test run|v\d/i);
}

const base: TryoutSessionReadiness = {
  availableUntil: "2026-11-02T03:00:00.000Z",
  blockers: [],
  counts: { abandoned: 0, attempts: 3, blocked: 0, candidates: 3, excluded: 0, noAttempt: 0, ready: 3, void: 0 },
  effectivePolicy: "manual",
  inherited: false,
  policy: { baseline: { auditCount: 0, policy: "manual" }, editable: false, reason: null, receipt: null, session: null, value: "manual" },
  publication: null,
  ready: true,
  scope: { sessionId: "s", tryoutId: "t" },
  serverNow: "2026-11-02T04:00:00.000Z",
  sessionName: "Sesi 1",
};
const blocker = (category: TryoutSessionReadiness["blockers"][number]["category"], attemptId: string | null = "a1") => ({ attemptId, category, message: "RAW internal message", section: null });

assert.equal(describePublishBlockedReason(base, true), null, "ready and available means the action is enabled");
assert.match(describePublishBlockedReason(base, false) ?? "", /sedang diperiksa/);
assert.equal(describePublishBlockedReason({ ...base, effectivePolicy: "immediate", blockers: [blocker("end", null)], ready: false }, true), null, "no release action exists for automatic policies");
assert.match(describePublishBlockedReason({ ...base, publication: { actorId: null, reason: null, releasedAt: "2026-11-02T04:00:00.000Z" } }, true) ?? "", /sudah dirilis pada .*WIB/, "released without a receipt explains the disabled button");
assert.equal(describePublishBlockedReason({ ...base, publication: { actorId: null, reason: null, receipt: { actorId: "u", actorName: "K", id: "r", participantCount: 1, reason: "x", releasedAt: "2026-11-02T04:00:00.000Z", sessionId: "s", tryoutId: "t" }, releasedAt: "2026-11-02T04:00:00.000Z" } }, true), null, "a receipt opens the record instead");
assert.match(describePublishBlockedReason({ ...base, blockers: [blocker("end", null)], ready: false }, true) ?? "", /Sesi belum berakhir.*WIB/);
assert.match(describePublishBlockedReason({ ...base, blockers: [blocker("empty", null)], ready: false }, true) ?? "", /Belum ada pengerjaan/);
const unfinished = describePublishBlockedReason({ ...base, blockers: [blocker("unfinished", "a1"), blocker("unfinished", "a2")], counts: { ...base.counts, blocked: 2 }, ready: false }, true) ?? "";
assert.match(unfinished, /^2 pengerjaan belum selesai/);
const review2 = describePublishBlockedReason({ ...base, blockers: [blocker("binding"), blocker("explanations")], counts: { ...base.counts, blocked: 1 }, ready: false }, true) ?? "";
assert.match(review2, /1 dari 3 pengerjaan perlu diperiksa/);
for (const text of [unfinished, review2]) assert.doesNotMatch(text, /RAW internal message/);
// The first applicable reason wins: an open session is reported before individual attempts.
assert.match(describePublishBlockedReason({ ...base, blockers: [blocker("binding"), blocker("end", null)], counts: { ...base.counts, blocked: 1 }, ready: false }, true) ?? "", /Sesi belum berakhir/);

const rule = (sessionPolicy: string | null, defaultPolicy = "manual", extra: { availableUntil?: string; scheduledReleaseAt?: string } = {}) => describeResultReleaseRule({ defaultPolicy, sessionPolicy, ...extra });
assert.match(rule("inherit", "manual"), /Kapten merilis hasil setelah sesi berakhir/, "inherit follows the Tryout default");
assert.match(rule(null, "immediate"), /setelah semua skor siap/);
assert.match(rule("manual", "immediate"), /Kapten merilis/, "a session's own rule wins over the default");
assert.match(rule("automatic_at_end", "manual", { availableUntil: "2026-11-02T03:00:00.000Z" }), /setelah sesi berakhir,.*WIB/);
assert.match(rule("scheduled", "manual", { scheduledReleaseAt: "2026-11-03T03:00:00.000Z" }), /pada.*WIB/);
assert.equal(rule("scheduled"), "Aturan rilis: terbuka otomatis sesuai jadwal.");
assert.equal(rule("bogus"), "Aturan rilis belum tersedia.");

console.log("Tryout result release status contracts passed.");

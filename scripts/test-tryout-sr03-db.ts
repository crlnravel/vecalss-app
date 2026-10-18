import "dotenv/config";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { prisma } from "../lib/prisma";
import { calculateTryoutAttempt, inspectTryoutCalculation, inspectTryoutSessionReadiness, participantTryoutResult, releaseTryoutSessionResults, synchronizeTryoutSessionReleaseState } from "../lib/tryout/result-repository";
import { attemptState, saveTryoutAnswer, sealTryoutTestRun, startActiveTestRun, startTryoutAttempt } from "../lib/tryout/attempt-repository";
import { configureTryoutDefaultResultRelease as productionConfigureTryoutDefaultResultRelease, TryoutDeliveryValidationError } from "../lib/tryout/delivery-repository";
import { archiveTryoutTransient } from "../lib/tryout/repository";
import { acquireTryoutIdentityMutex } from "../lib/tryout/locks";
import { atSr01Time, createSr01Fixture, sr01History, type Sr01Snapshot } from "./tryout-sr01-fixture";
import { requireTa02LocalDatabase } from "./tryout-ta02-fixture";
import { createTa03Fixture } from "./tryout-ta03-fixture";
import { serveTryoutReadinessInspection } from "../lib/tryout/result-readiness-http";
import type { SessionContext } from "../lib/auth/types";
import { buildMentorTryoutAttemptHref, buildMentorTryoutHref } from "../lib/navigation/canonical-context";
import { isUuid } from "../lib/resource-edit-lock/canonical";
import { isTryoutPolicyBaseline } from "../lib/tryout/result-readiness";
import { requireTryoutCapability, TryoutCapabilityError } from "../lib/tryout/capabilities";
import { hasRole } from "../lib/auth/session";
import { RoleName } from "../generated/prisma/client";

// Immutable previous command source can demonstrate the fresh-intent CAS red
// through the same real public DB command/dependencies, without product edits.
const configureTryoutDefaultResultRelease: typeof productionConfigureTryoutDefaultResultRelease = process.env.SR03_POLICY_COMMAND_SOURCE
  ? new Function("exports", "require", `${ts.transpileModule(readFileSync(process.env.SR03_POLICY_COMMAND_SOURCE, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText}; return exports.configureTryoutDefaultResultRelease;`)({}, createRequire(import.meta.url))
  : productionConfigureTryoutDefaultResultRelease;

const output = ".scratch/tryout-sr03";
type Fixture = Awaited<ReturnType<typeof createSr01Fixture>>;
const fixtures: Array<{ name: string; tryoutId: string; sessionId: string; attemptId: string; route: string; role: string }> = [];
const evidence: string[] = [];
let base = 0;
async function nextWindow() { const latest = await prisma.tryoutDeliverySession.aggregate({ _max: { availableUntil: true } }); return new Date(Math.max(base, latest._max.availableUntil?.getTime() ?? 0) + 2 * 86_400_000); }
const scope = (f: Fixture) => ({ tryoutId: f.tryoutId, sessionId: f.sessionId });
const snapshot = async (f: Fixture) => ({
  session: await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: f.sessionId } }),
  attempts: await prisma.tryoutAttempt.findMany({ where: { deliverySessionId: f.sessionId }, orderBy: { id: "asc" } }),
  audits: await prisma.tryoutDeliveryAudit.findMany({ where: { deliverySessionId: f.sessionId }, orderBy: { id: "asc" } }),
});
async function fixture(name: string, ready = true, missingExplanations = false) {
  const f = await createSr01Fixture(`SR03 ${name}`, fixtures.length, false, await nextWindow(), missingExplanations);
  fixtures.push({ name, tryoutId: f.tryoutId, sessionId: f.sessionId, attemptId: f.attemptId, route: `/mentor/tryout/${f.tryoutId}?workspace=participants&session=${f.sessionId}`, role: "Kapten" });
  if (ready) await score(f, f.attemptId);
  return f;
}
async function score(f: Fixture, attemptId: string) {
  await prisma.tryoutAttempt.update({ where: { id: attemptId }, data: { status: "expired", attemptState: "expired", scoringState: "review_required" } });
  await prisma.tryoutAttemptTestRun.updateMany({ where: { attemptId }, data: { status: "expired", scoringState: "review_required", calculationReleaseable: false } });
  await calculateTryoutAttempt(attemptId, f.ownerId, "Siapkan hasil lokal untuk pemeriksaan sesi.");
}
async function addAttempt(f: Fixture, index: number) {
  const admission = await prisma.tryoutAdmission.create({ data: { tryoutId: f.tryoutId, studentId: f.students.filter((student) => student.id !== f.studentId)[index].id, status: "active" } });
  await prisma.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, deliverySessionId: f.sessionId, assignedByUserId: f.ownerId } });
  const started = await atSr01Time(f.start, () => startTryoutAttempt(f.sessionId, admission.studentId));
  return { id: started.attemptId, studentId: admission.studentId };
}
async function refuse(f: Fixture, command: () => Promise<unknown>, message?: RegExp) {
  const before = await snapshot(f);
  if (message) await assert.rejects(command, message); else await assert.rejects(command);
  assert.deepEqual(await snapshot(f), before, "Refusal preserves bundle and audit");
}
async function qaFixture(name: string, f: { tryoutId: string; sessionId: string; ownerId: string; studentId: string; attemptId?: string }) {
  const session = await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: f.sessionId }, select: { assessmentReleaseId: true, availableFrom: true, availableUntil: true, releaseState: true, resultReleasePolicy: true, status: true, tryout: { select: { status: true, defaultResultReleasePolicy: true } } } });
  const attempt = f.attemptId ? await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: f.attemptId }, select: { attemptState: true, status: true, scoringState: true, releaseState: true } }) : null;
  const context = { session: f.sessionId, workspace: "participants" as const };
  return { name, tryoutId: f.tryoutId, sessionId: f.sessionId, releaseId: session.assessmentReleaseId, attemptId: f.attemptId ?? null, ownerId: f.ownerId, studentId: f.studentId, roles: { mentor: "Kapten", student: "Voyager" },
    currentPolicy: session.resultReleasePolicy === "inherit" ? session.tryout.defaultResultReleasePolicy : session.resultReleasePolicy, inherited: session.resultReleasePolicy === "inherit", defaultPolicy: session.tryout.defaultResultReleasePolicy,
    tryoutStatus: session.tryout.status, sessionStatus: session.status, sessionReleaseState: session.releaseState, attempt,
    availableFrom: session.availableFrom.toISOString(), availableUntil: session.availableUntil.toISOString(), routes: { hasil: buildMentorTryoutHref(f.tryoutId, context), recovery: f.attemptId ? buildMentorTryoutAttemptHref(f.tryoutId, f.attemptId, context) : null }, timing: "Future disjoint fixture window; no live short window. Readiness end fence uses actual server time." };
}
await mkdir(output, { recursive: true });
try {
  requireTa02LocalDatabase();
  const last = await prisma.tryoutDeliverySession.aggregate({ _max: { availableUntil: true } });
  base = Math.max(Date.UTC(2040, 0, 1), last._max.availableUntil?.getTime() ?? 0) + 2 * 86_400_000;
  const f = await fixture("end equality");
  await refuse(f, () => atSr01Time(new Date(f.end.getTime() - 1), () => releaseTryoutSessionResults(f.sessionId, f.ownerId, "Periksa batas akhir sesi.")), /sesi belum berakhir/);
  const released = await atSr01Time(f.end, () => releaseTryoutSessionResults(f.sessionId, f.ownerId, "Rilis tepat pada waktu selesai."));
  assert.equal(released.state, "released"); assert.equal(released.releasedAt?.toISOString(), f.end.toISOString());
  const saved = await snapshot(f);
  const replay = await releaseTryoutSessionResults(f.sessionId, f.ownerId, "Periksa tanda terima.");
  assert.equal(replay.state, "existing"); assert.equal(replay.releasedAt?.toISOString(), released.releasedAt?.toISOString()); assert.deepEqual(await snapshot(f), saved);
  const plus = await fixture("end plus1");
  assert.equal((await atSr01Time(new Date(plus.end.getTime() + 1), () => releaseTryoutSessionResults(plus.sessionId, plus.ownerId, "Rilis setelah waktu selesai."))).state, "released");
  evidence.push("B06 fresh−1 refused atomically; fresh equality/+1 released; replay preserved receipt/audit");
  console.log("PASS", evidence.at(-1));

  const queued = await fixture("queued before end");
  let unlock!: () => void; let locked!: () => void;
  const gate = new Promise<void>((resolve) => { unlock = resolve; }); const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const holder = prisma.$transaction(async (tx) => { await acquireTryoutIdentityMutex(tx, { kind: "session", id: queued.sessionId }); locked(); await gate; }, { timeout: 10000 });
  await acquired;
  await atSr01Time(new Date(queued.end.getTime() - 1), async () => {
    const request = releaseTryoutSessionResults(queued.sessionId, queued.ownerId, "Permintaan menunggu sampai sesi selesai.");
    let observed = false;
    try {
      for (let n = 0; n < 50; n++) {
        const rows = await prisma.$queryRaw<Array<{ blocked: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0 AND query LIKE '%pg_advisory_xact_lock%') AS blocked`;
        if (rows[0].blocked) { observed = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert(observed, "Actual public command must be queued on canonical identity lock");
      await atSr01Time(queued.end, async () => { unlock(); await holder; assert.equal((await request).state, "released"); });
    } finally { unlock(); await holder; await request.catch(() => {}); }
  });
  evidence.push("B06 actual pg_blocking_pids confirms pre-end request acquires locks at equality and publishes using fresh clock"); console.log("PASS", evidence.at(-1));

  const mixed = await fixture("ready with damaged exclusions");
  const extra = await addAttempt(mixed, 0);
  await prisma.tryoutAttempt.update({ where: { id: extra.id }, data: { attemptState: "void", status: "scored", score: 99, scoringState: "scored", releaseState: "released", releaseAt: mixed.start } });
  await prisma.tryoutAttemptTestRun.updateMany({ where: { attemptId: extra.id }, data: { contentSnapshot: { privateDiagnostic: "invalid" } } });
  const abandoned = await addAttempt(mixed, 1);
  await prisma.tryoutAttempt.update({ where: { id: abandoned.id }, data: { attemptState: "abandoned", status: "abandoned", score: 98, scoringState: "scored" } });
  await prisma.tryoutAttemptTestRun.updateMany({ where: { attemptId: abandoned.id }, data: { contentSnapshot: { privateDiagnostic: "invalid" } } });
  const abandonedBefore = await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: abandoned.id }, include: { runs: true } });
  const excludedBefore = await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: extra.id }, include: { runs: true } });
  const read = await atSr01Time(mixed.end, () => inspectTryoutSessionReadiness(scope(mixed), mixed.ownerId));
  assert(read?.ready); assert.equal(read.counts.excluded, 2); assert.equal(read.counts.ready, 1);
  assert(!JSON.stringify(read).match(/contentSnapshot|isCorrect|selectedOption|calculationInput|privateDiagnostic/));
  assert.equal((await synchronizeTryoutSessionReleaseState(mixed.sessionId, mixed.end)).releaseState, "hidden", "Manual synchronization never publishes");
  await atSr01Time(mixed.end, () => releaseTryoutSessionResults(mixed.sessionId, mixed.ownerId, "Rilis peserta yang memenuhi syarat."));
  assert.deepEqual(await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: extra.id }, include: { runs: true } }), excludedBefore);
  assert.deepEqual(await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: abandoned.id }, include: { runs: true } }), abandonedBefore);
  const student = await atSr01Time(mixed.end, () => participantTryoutResult(mixed.attemptId, mixed.studentId));
  assert(student.released); assert(student.ranking); assert.equal(student.ranking.rank, null); assert.equal(student.ranking.total, 1); assert.equal(student.ranking.state, "unavailable");
  evidence.push("B01/B11 malformed void+scored/released history excluded before validation, never rewritten/ranked; manual sync nonpublishing"); console.log("PASS", evidence.at(-1));

  const blocked = await fixture("same damage blocks candidate");
  await prisma.tryoutAttemptTestRun.updateMany({ where: { attemptId: blocked.attemptId }, data: { contentSnapshot: { privateDiagnostic: "invalid" } } });
  const blockedRead = await atSr01Time(blocked.end, () => inspectTryoutSessionReadiness(scope(blocked), blocked.ownerId));
  assert(!blockedRead?.ready); assert(blockedRead?.blockers.some((row) => row.category === "binding"));
  assert.equal((await synchronizeTryoutSessionReleaseState(blocked.sessionId, blocked.end)).ready, false);
  await refuse(blocked, () => atSr01Time(blocked.end, () => releaseTryoutSessionResults(blocked.sessionId, blocked.ownerId, "Harus ditolak.")));
  const excludedOnly = await fixture("excluded only", false);
  await prisma.tryoutAttempt.update({ where: { id: excludedOnly.attemptId }, data: { attemptState: "abandoned", status: "abandoned" } });
  await prisma.tryoutAttemptTestRun.updateMany({ where: { attemptId: excludedOnly.attemptId }, data: { contentSnapshot: { privateDiagnostic: "invalid" } } });
  const only = await atSr01Time(excludedOnly.end, () => inspectTryoutSessionReadiness(scope(excludedOnly), excludedOnly.ownerId));
  assert(!only?.ready); assert.equal(only?.counts.excluded, 1); assert(only?.blockers.some((row) => row.category === "empty"));
  await refuse(excludedOnly, () => atSr01Time(excludedOnly.end, () => releaseTryoutSessionResults(excludedOnly.sessionId, excludedOnly.ownerId, "Harus ditolak.")));
  await assert.rejects(configureTryoutDefaultResultRelease(excludedOnly.tryoutId, "immediate", excludedOnly.ownerId, "Pengerjaan yang ditinggalkan tetap mengunci aturan."), /sudah dimulai/);
  evidence.push("B02–B05 non-excluded corruption and all-excluded cohorts refuse publication"); console.log("PASS", evidence.at(-1));

  const missing = await fixture("missing frozen explanations", true, true);
  const missingRead = await atSr01Time(missing.end, () => inspectTryoutSessionReadiness(scope(missing), missing.ownerId));
  assert(!missingRead?.ready); assert.equal(missingRead?.blockers.filter((row) => row.category === "explanations").length, 7);
  assert(!missingRead?.blockers.some((row) => row.category === "binding"), "Frozen source genuinely lacks explanations; no post-Start repair/mismatch fixture");
  await refuse(missing, () => atSr01Time(missing.end, () => releaseTryoutSessionResults(missing.sessionId, missing.ownerId, "Pembahasan belum lengkap.")));
  const unfinished = await fixture("unfinished blocks", false);
  const unfinishedRead = await atSr01Time(unfinished.end, () => inspectTryoutSessionReadiness(scope(unfinished), unfinished.ownerId));
  assert(unfinishedRead?.blockers.some((row) => row.category === "unfinished"));
  assert(unfinishedRead?.blockers.some((row) => row.category === "scoring")); assert.equal(unfinishedRead?.counts.blocked, 1);
  await refuse(unfinished, () => atSr01Time(unfinished.end, () => releaseTryoutSessionResults(unfinished.sessionId, unfinished.ownerId, "Perlu penyelesaian.")));
  evidence.push("B02/B04/B05 genuine pre-Start frozen missing explanations yield7 honest blockers; unfinished nonexcluded remains blocking with multiple reasons"); console.log("PASS", evidence.at(-1));

  await refuse(plus, () => releaseTryoutSessionResults(plus.sessionId, plus.studentId, "Bukan pemilik."));
  await refuse(plus, () => releaseTryoutSessionResults(plus.sessionId, plus.ownerId, " "));
  await assert.rejects(configureTryoutDefaultResultRelease(mixed.tryoutId, "immediate", mixed.ownerId, "Sudah ada pengerjaan."), /sudah dimulai/);
  const archived = await fixture("archived ready");
  await archiveTryoutTransient(archived.tryoutId, archived.ownerId);
  await assert.rejects(configureTryoutDefaultResultRelease(archived.tryoutId, "immediate", archived.ownerId, "Arsip tidak dapat diubah."));
  const archiveRead = await atSr01Time(archived.end, () => inspectTryoutSessionReadiness(scope(archived), archived.ownerId));
  assert(archiveRead?.ready); assert(!archiveRead.policy.editable);
  await refuse(archived, () => atSr01Time(new Date(archived.end.getTime() - 1), () => releaseTryoutSessionResults(archived.sessionId, archived.ownerId, "Arsip tidak mempercepat akhir.")), /sesi belum berakhir/);
  evidence.push("B08/B14/C03 owner, reason, any-attempt and archive configuration fences; archived readiness visible; archive cannot release early"); console.log("PASS", evidence.at(-1));

  const policy = await createTa03Fixture();
  const policyStart = await nextWindow();
  const policyEnd = new Date(policyStart.getTime() + 600_000);
  await prisma.tryoutDeliverySession.update({ where: { id: policy.sessionId }, data: { availableFrom: policyStart, availableUntil: policyEnd, resultReleasePolicy: "inherit" } });
  const explicit = await prisma.tryoutDeliverySession.create({ data: { tryoutId: policy.tryoutId, name: "Riwayat dengan aturan sendiri", availableFrom: new Date(policyEnd.getTime() + 1000), availableUntil: new Date(policyEnd.getTime() + 601000), resultReleasePolicy: "scheduled", scheduledReleaseAt: new Date(policyEnd.getTime() + 602000), assessmentReleaseId: (await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: policy.sessionId } })).assessmentReleaseId, status: "active", createdByUserId: policy.ownerId, updatedByUserId: policy.ownerId } });
  const policyScope = { tryoutId: policy.tryoutId, sessionId: policy.sessionId };
  const configured = await configureTryoutDefaultResultRelease(policy.tryoutId, "manual", policy.ownerId, "Tunggu peninjauan Kapten.");
  const policyRead = await inspectTryoutSessionReadiness(policyScope, policy.ownerId);
  assert(policyRead?.policy.editable); assert.equal(policyRead.effectivePolicy, "manual"); assert(policyRead.inherited); assert.deepEqual(policyRead.policy.receipt, configured.receipt);
  const explicitRead = await inspectTryoutSessionReadiness({ ...policyScope, sessionId: explicit.id }, policy.ownerId);
  assert(explicitRead);
  assert.equal(explicitRead?.effectivePolicy, "scheduled"); assert.equal(explicitRead.inherited, false); assert.equal(explicitRead.policy.sessions.length, 2);
  assert.equal(await inspectTryoutSessionReadiness(policyScope, policy.studentId), null);
  await assert.rejects(configureTryoutDefaultResultRelease(policy.tryoutId, "inherit" as "manual", policy.ownerId, "Tidak tersedia."));
  await assert.rejects(configureTryoutDefaultResultRelease(policy.tryoutId, "immediate", policy.studentId, "Bukan pemilik."));
  await assert.rejects(configureTryoutDefaultResultRelease(policy.tryoutId, "immediate", policy.ownerId, " "));
  const admission = await prisma.tryoutAdmission.create({ data: { tryoutId: policy.tryoutId, studentId: policy.studentId, status: "active" } });
  await prisma.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, deliverySessionId: policy.sessionId, assignedByUserId: policy.ownerId } });
  assert.equal((await inspectTryoutSessionReadiness(policyScope, policy.ownerId))?.counts.noAttempt, 1);
  fixtures.push({ name: "multisession editable policy", ...policyScope, attemptId: "", route: `/mentor/tryout/${policy.tryoutId}?workspace=participants&session=${policy.sessionId}`, role: "Kapten" });

  const correlated = await createTa03Fixture(); const correlatedStart = await nextWindow(); const correlatedEnd = new Date(correlatedStart.getTime() + 600_000);
  await prisma.tryoutDeliverySession.update({ where: { id: correlated.sessionId }, data: { availableFrom: correlatedStart, availableUntil: correlatedEnd, resultReleasePolicy: "inherit" } });
  const correlatedScope = { tryoutId: correlated.tryoutId, sessionId: correlated.sessionId };
  const policyState = async (tryoutId = correlated.tryoutId) => ({ package: await prisma.tryoutPackage.findUniqueOrThrow({ where: { id: tryoutId }, select: { defaultResultReleasePolicy: true, updatedAt: true } }), audits: await prisma.tryoutDeliveryAudit.findMany({ where: { tryoutId }, orderBy: { id: "asc" } }) });
  const baselineByIntent = new Map<string, NonNullable<Awaited<ReturnType<typeof inspectTryoutSessionReadiness>>>["policy"]["baseline"]>();
  async function correlatedConfigure(...args: Parameters<typeof configureTryoutDefaultResultRelease>) {
    const id = args[5]?.toLowerCase();
    if (id && !baselineByIntent.has(id)) { const current = await inspectTryoutSessionReadiness({ tryoutId: args[0], sessionId: args[0] === correlated.tryoutId ? correlated.sessionId : policy.sessionId }, correlated.ownerId); assert(current); if (!baselineByIntent.has(id)) baselineByIntent.set(id, current.policy.baseline); }
    return configureTryoutDefaultResultRelease(args[0], args[1], args[2], args[3], args[4], args[5], id ? baselineByIntent.get(id) : undefined);
  }
  const initialPolicyRead = await inspectTryoutSessionReadiness(correlatedScope, correlated.ownerId); assert(initialPolicyRead); assert.equal(initialPolicyRead.policy.baseline.auditCount, 0, "Initial no-audit baseline is usable");
  const originalId = randomUUID(); const unrelatedId = randomUUID(); const newerId = randomUUID(); const sameReason = "Tunggu peninjauan bersama.";
  const correlationSession: SessionContext = { sessionId: "owned-correlation-read", expiresAt: new Date(Date.now() + 100000), user: { id: correlated.ownerId, email: "tutor@vecalss.local", fullName: "Kapten", roles: ["tutor"], status: "active", mustChangePassword: false, onboardingStatus: "completed" } };
  const policyActionSource = readFileSync("modules/mentor/tryout-result-policy-action.ts", "utf8").replace(/^import[^\n]*\n/gm, "");
  const forwardedPolicyCalls: unknown[][] = [];
  const policyAction = new Function("exports", "requireSession", "hasRole", "isTryoutPolicyBaseline", "isUuid", "requireTryoutCapability", "TryoutCapabilityError", "configureTryoutDefaultResultRelease", "TryoutDeliveryValidationError", `${ts.transpileModule(policyActionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText};return exports.configureTryoutResultPolicyAction;`)({}, async () => correlationSession, hasRole, isTryoutPolicyBaseline, isUuid, requireTryoutCapability, TryoutCapabilityError, async (...args: unknown[]) => { forwardedPolicyCalls.push(args); return { receipt: { id: args[5], expectedBaseline: args[6], configuredAt: new Date().toISOString(), reason: args[3], policy: args[1] } }; }, TryoutDeliveryValidationError) as (intent: unknown) => Promise<{ ok: boolean; confirmedRefusal?: boolean }>;
  const actionIntent = { ...correlatedScope, requestId: originalId, policy: "manual", reason: sameReason, expectedBaseline: initialPolicyRead.policy.baseline };
  for (const invalid of [undefined, null, { auditCount: -1, policy: "manual" }, { auditCount: 0.5, policy: "manual" }, { auditCount: 0, policy: "private" }]) assert.deepEqual(await policyAction({ ...actionIntent, expectedBaseline: invalid }), { ok: false, confirmedRefusal: true, message: "Permintaan penyimpanan tidak dapat digunakan. Mulai perubahan baru." });
  assert.equal(forwardedPolicyCalls.length, 0); assert.equal((await policyAction(actionIntent)).ok, true); assert.equal(forwardedPolicyCalls.length, 1); assert.deepEqual(forwardedPolicyCalls[0], [correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, originalId, initialPolicyRead.policy.baseline]);
  async function correlationHttp(requestId: string) {
    const response = await serveTryoutReadinessInspection(new Request(`http://localhost/api/mentor/tryout/result-readiness?${new URLSearchParams({ ...correlatedScope, requestId })}`), { getSession: async () => correlationSession, authorize: (current) => { requireTryoutCapability(current, "tryout.results.manage"); return { allowCrossOwner: hasRole(current, RoleName.admin) }; }, read: inspectTryoutSessionReadiness });
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /private, no-store/); return (await response.json()).snapshot;
  }
  async function awaitBlockedCommand(holderPid: number) {
    for (let n = 0; n < 50; n++) { const rows = await prisma.$queryRaw<Array<{ blocked: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${holderPid} = ANY(pg_blocking_pids(pid)) AND query LIKE '%pg_advisory_xact_lock%') AS blocked`; if (rows[0].blocked) return; await new Promise((resolve) => setTimeout(resolve, 10)); }
    assert.fail("Policy command must be observably blocked on the canonical mutex");
  }
  async function underHeldPolicyLock<T>(command: () => Promise<T>, inspect: () => Promise<void>) {
    let release!: () => void; let locked!: () => void; let holderPid = 0;
    const gate = new Promise<void>((resolve) => { release = resolve; }); const acquired = new Promise<void>((resolve) => { locked = resolve; });
    const holder = prisma.$transaction(async (tx) => { await acquireTryoutIdentityMutex(tx, { kind: "tryout", id: correlated.tryoutId }); holderPid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0].pid; locked(); await gate; }, { timeout: 10000 });
    await acquired; const pending = command();
    try { await awaitBlockedCommand(holderPid); await inspect(); release(); await holder; return await pending; }
    finally { release(); await holder; await pending.catch(() => {}); }
  }
  // B is queued first, then unseen A (both read the initial no-audit state).
  // PostgreSQL blocking proves the original A is already in flight before B
  // commits; count+policy CAS is evaluated only after A acquires the mutex.
  let releaseTwoWriter!: () => void; let twoWriterLocked!: () => void; let twoWriterPid = 0;
  const twoWriterGate = new Promise<void>((resolve) => { releaseTwoWriter = resolve; }); const twoWriterAcquired = new Promise<void>((resolve) => { twoWriterLocked = resolve; });
  const twoWriterHolder = prisma.$transaction(async (tx) => { await acquireTryoutIdentityMutex(tx, { kind: "tryout", id: correlated.tryoutId }); twoWriterPid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0].pid; twoWriterLocked(); await twoWriterGate; }, { timeout: 10000 });
  await twoWriterAcquired;
  baselineByIntent.set(unrelatedId, initialPolicyRead.policy.baseline);
  const queuedB = correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, unrelatedId);
  const unseenId = randomUUID();
  let queuedA!: Promise<{ status: "committed"; value: unknown } | { status: "refused"; error: unknown }>;
  try {
    await awaitBlockedCommand(twoWriterPid);
    queuedA = configureTryoutDefaultResultRelease(correlated.tryoutId, "immediate", correlated.ownerId, "Original first request.", false, unseenId, initialPolicyRead.policy.baseline).then((value) => ({ status: "committed" as const, value }), (error: unknown) => ({ status: "refused" as const, error }));
    let bothBlocked = false;
    for (let n = 0; n < 50; n++) { const rows = await prisma.$queryRaw<Array<{ blocked: bigint }>>`SELECT count(*) AS blocked FROM pg_stat_activity WHERE ${twoWriterPid} = ANY(pg_blocking_pids(pid)) AND query LIKE '%pg_advisory_xact_lock%'`; if (Number(rows[0].blocked) >= 2) { bothBlocked = true; break; } await new Promise((resolve) => setTimeout(resolve, 10)); }
    assert(bothBlocked, "Both public first-execution commands must be blocked before B commits");
    assert.equal((await correlationHttp(unseenId)).policy.intentReceipt, null);
  } finally { releaseTwoWriter(); await twoWriterHolder; await Promise.allSettled([queuedB, ...(queuedA ? [queuedA] : [])]); }
  const unrelated = await queuedB; const unseen = await queuedA;
  assert.equal(unseen.status, "refused"); if (unseen.status === "refused") assert.match(String(unseen.error), /Aturan rilis telah berubah/);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { id: unseenId } }), 0); assert.equal((await policyState()).package.defaultResultReleasePolicy, "manual");
  const delayedFirstId = randomUUID(); const beforeStale = await policyState();
  let staleRefused = false;
  try { await underHeldPolicyLock(() => configureTryoutDefaultResultRelease(correlated.tryoutId, "immediate", correlated.ownerId, "Delayed first execution.", false, delayedFirstId, initialPolicyRead.policy.baseline), async () => { assert.equal((await correlationHttp(delayedFirstId)).policy.intentReceipt, null); }); }
  catch (error) { assert.match(String(error), /Aturan rilis telah berubah/); staleRefused = true; }
  assert(staleRefused); assert.deepEqual(await policyState(), beforeStale, "B commits before unseen A acquires mutex: A cannot overwrite B or create audit");
  const samePolicyBaseline = (await inspectTryoutSessionReadiness(correlatedScope, correlated.ownerId))!.policy.baseline;
  await correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, "Alasan baru dengan aturan sama.", false, randomUUID());
  const beforeSamePolicyStale = await policyState();
  await assert.rejects(configureTryoutDefaultResultRelease(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, randomUUID(), samePolicyBaseline), /Aturan rilis telah berubah/);
  assert.deepEqual(await policyState(), beforeSamePolicyStale, "Count catches intervening same-policy write even when value matches");
  const original = await underHeldPolicyLock(() => correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, originalId), async () => {
    const read = await correlationHttp(originalId); assert.equal(read.policy.value, "manual"); assert.equal(read.policy.intentReceipt, null, "Identical other intent cannot release the delayed original fence");
  });
  assert.equal(original.receipt.id, originalId);
  const newer = await correlatedConfigure(correlated.tryoutId, "automatic_at_end", correlated.ownerId, "Aturan yang lebih baru.", false, newerId);
  const interleaved = await inspectTryoutSessionReadiness(correlatedScope, correlated.ownerId, false, originalId.toUpperCase()); assert(interleaved); assert.equal(interleaved.policy.value, "automatic_at_end"); assert.deepEqual(interleaved.policy.intentReceipt, original.receipt); assert.deepEqual(interleaved.policy.receipt, newer.receipt);
  const requestedHttp = await correlationHttp(originalId.toUpperCase()); assert.deepEqual(requestedHttp.policy.intentReceipt, original.receipt); assert.equal(requestedHttp.policy.value, "automatic_at_end"); assert(!JSON.stringify(requestedHttp).match(/contentSnapshot|selectedOption|isCorrect|calculationInput/));
  const beforeReplay = await policyState();
  const delayedReplay = await underHeldPolicyLock(() => correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, originalId), async () => { const read = await inspectTryoutSessionReadiness(correlatedScope, correlated.ownerId, false, originalId); assert.deepEqual(read?.policy.intentReceipt, original.receipt); assert.equal(read?.policy.value, "automatic_at_end"); });
  assert.deepEqual(delayedReplay.receipt, original.receipt); assert.deepEqual(await policyState(), beforeReplay, "Delayed original after confirmed commit cannot overwrite a newer policy");
  const concurrentReplays = await Promise.all([correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, originalId), correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, ` ${sameReason} `, false, originalId.toUpperCase())]); concurrentReplays.forEach((reply) => assert.deepEqual(reply.receipt, original.receipt)); assert.deepEqual(await policyState(), beforeReplay);
  const concurrentId = randomUUID(); const concurrentReason = "Simpan satu kali dari dua permintaan.";
  const concurrent = await Promise.all([correlatedConfigure(correlated.tryoutId, "automatic_at_end", correlated.ownerId, concurrentReason, false, concurrentId), correlatedConfigure(correlated.tryoutId, "automatic_at_end", correlated.ownerId, concurrentReason, false, concurrentId)]); assert.deepEqual(concurrent[0].receipt, concurrent[1].receipt); assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { id: concurrentId } }), 1);
  async function refusePolicy(command: () => Promise<unknown>, target = correlated.tryoutId) { const before = await policyState(target); await assert.rejects(command); assert.deepEqual(await policyState(target), before); }
  await refusePolicy(() => configureTryoutDefaultResultRelease(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, randomUUID()));
  for (const badBaseline of [{ auditCount: -1, policy: "manual" }, { auditCount: 0.5, policy: "manual" }, { auditCount: Number.MAX_SAFE_INTEGER + 1, policy: "manual" }, null]) await refusePolicy(() => configureTryoutDefaultResultRelease(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, randomUUID(), badBaseline as never));
  await refusePolicy(() => configureTryoutDefaultResultRelease(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, originalId, initialPolicyRead.policy.baseline));
  for (const badId of ["not-a-request", "00000000-0000-0000-0000-000000000000", ` ${originalId} `]) await refusePolicy(() => correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, badId));
  await refusePolicy(() => correlatedConfigure(correlated.tryoutId, "immediate", correlated.ownerId, sameReason, false, originalId));
  await refusePolicy(() => correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, "Alasan berbeda.", false, originalId));
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@vecalss.local" }, select: { id: true } });
  await refusePolicy(() => correlatedConfigure(correlated.tryoutId, "manual", admin.id, sameReason, true, originalId));
  await refusePolicy(() => correlatedConfigure(policy.tryoutId, "manual", policy.ownerId, sameReason, false, originalId), policy.tryoutId);
  const foreignAction = await prisma.tryoutDeliveryAudit.findFirstOrThrow({ where: { tryoutId: correlated.tryoutId, action: { not: "result_release.default_configured" } } });
  await refusePolicy(() => correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, foreignAction.id));
  assert.equal((await inspectTryoutSessionReadiness(correlatedScope, admin.id, true, originalId))?.policy.intentReceipt, null);
  assert.equal((await inspectTryoutSessionReadiness(policyScope, policy.ownerId, false, originalId))?.policy.intentReceipt, null);
  assert.equal((await inspectTryoutSessionReadiness(correlatedScope, correlated.ownerId))?.policy.intentReceipt, undefined, "Normal readiness DTO does not add a hidden requested receipt");
  const correlatedAdmission = await prisma.tryoutAdmission.create({ data: { tryoutId: correlated.tryoutId, studentId: correlated.studentId, status: "active" } }); await prisma.tryoutDeliveryAssignment.create({ data: { admissionId: correlatedAdmission.id, deliverySessionId: correlated.sessionId, assignedByUserId: correlated.ownerId } });
  const correlatedAttempt = await atSr01Time(correlatedStart, () => startTryoutAttempt(correlated.sessionId, correlated.studentId));
  const frozenPolicy = await policyState(); assert.deepEqual((await correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, originalId)).receipt, original.receipt); assert.deepEqual(await policyState(), frozenPolicy);
  await refusePolicy(() => correlatedConfigure(correlated.tryoutId, "immediate", correlated.ownerId, "Perubahan baru.", false, randomUUID()));
  await atSr01Time(correlatedEnd, () => attemptState(correlatedAttempt.attemptId, correlated.studentId)); await archiveTryoutTransient(correlated.tryoutId, correlated.ownerId);
  const archivedPolicy = await policyState(); assert.deepEqual((await correlatedConfigure(correlated.tryoutId, "manual", correlated.ownerId, sameReason, false, originalId)).receipt, original.receipt); assert.deepEqual(await policyState(), archivedPolicy);
  await writeFile(`${output}/policy-correlation-evidence.json`, JSON.stringify({ tryoutId: correlated.tryoutId, sessionId: correlated.sessionId, unrelated: unrelated.receipt, original: original.receipt, newer: newer.receipt, concurrent: concurrent[0].receipt, currentPolicyAfterReplays: archivedPolicy.package.defaultResultReleasePolicy, interleaving: "fresh ID requires expected audit-count/policy CAS; mutex-delayed unseen A after B atomic refusal; same-policy different-reason invalidates baseline; other identical receipt cannot confirm queued A; A commits then B; inspect A sees own receipt/current B; lock-delayed replay A preserves B; concurrent same ID audit1; actor/scope/action/payload reuse refuses; replay survives freeze/archive" }, null, 2));
  evidence.push("Persisted policy request UUID + monotonic baseline CAS: unrelated identical audit cannot confirm delayed A; own historical A/current B projection; queued/concurrent exact replay audit1 never overwrites B; UUID/actor/scope/action/payload refusal atomic; frozen/archived receipt-only replay"); console.log("PASS", evidence.at(-1));
  // A second new Tryout exercises first-Start concurrency without consuming the editable QA fixture.
  const raced = await createTa03Fixture();
  const raceStart = await nextWindow(); const raceEnd = new Date(raceStart.getTime() + 600_000);
  await prisma.tryoutDeliverySession.update({ where: { id: raced.sessionId }, data: { availableFrom: raceStart, availableUntil: raceEnd, resultReleasePolicy: "inherit" } });
  const raceAdmission = await prisma.tryoutAdmission.create({ data: { tryoutId: raced.tryoutId, studentId: raced.studentId, status: "active" } });
  await prisma.tryoutDeliveryAssignment.create({ data: { admissionId: raceAdmission.id, deliverySessionId: raced.sessionId, assignedByUserId: raced.ownerId } });
  await atSr01Time(raceStart, async () => {
    const results = await Promise.allSettled([startTryoutAttempt(raced.sessionId, raced.studentId), configureTryoutDefaultResultRelease(raced.tryoutId, "manual", raced.ownerId, "Coba bersamaan dengan mulai.")]);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(await prisma.tryoutAttempt.count({ where: { tryoutId: raced.tryoutId } }), 1);
    assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: raced.tryoutId, action: "result_release.default_configured" } }), results[1].status === "fulfilled" ? 1 : 0);
    await assert.rejects(configureTryoutDefaultResultRelease(raced.tryoutId, "immediate", raced.ownerId, "Mulai pertama sudah terjadi."), /sudah dimulai/);
  });
  evidence.push("B12–B14 inherited/explicit scheduled scope, owner/reason/unsupported refusal, truthful no-attempt count and real first-Start/configure serialization"); console.log("PASS", evidence.at(-1));

  for (const mode of ["immediate", "automatic_at_end", "scheduled"] as const) {
    const auto = await fixture(`automatic ${mode}`);
    const threshold = mode === "scheduled" ? new Date(auto.end.getTime() + 1000) : auto.end;
    await prisma.tryoutDeliverySession.update({ where: { id: auto.sessionId }, data: { resultReleasePolicy: mode, scheduledReleaseAt: mode === "scheduled" ? threshold : null } });
    const beforeThreshold = await synchronizeTryoutSessionReleaseState(auto.sessionId, new Date(threshold.getTime() - 1));
    assert.equal(beforeThreshold.releaseState, mode === "immediate" ? "released" : "scheduled");
    const atThreshold = await synchronizeTryoutSessionReleaseState(auto.sessionId, threshold); assert.equal(atThreshold.releaseState, "released");
    await refuse(auto, () => releaseTryoutSessionResults(auto.sessionId, auto.studentId, "Bukan pemilik."));
  }
  const nonManual = await fixture("manual command cannot override automatic");
  await prisma.tryoutDeliverySession.update({ where: { id: nonManual.sessionId }, data: { resultReleasePolicy: "automatic_at_end" } });
  await refuse(nonManual, () => atSr01Time(nonManual.end, () => releaseTryoutSessionResults(nonManual.sessionId, nonManual.ownerId, "Tidak boleh mengganti aturan.")), /kebijakan manual/);
  evidence.push("B13 original immediate/end/scheduled thresholds preserved; explicit command refuses nonmanual"); console.log("PASS", evidence.at(-1));

  const ties = await fixture("tied cohort atomic double release"); const tied = await addAttempt(ties, 0); await score(ties, tied.id);
  const doubleRelease = await atSr01Time(ties.end, () => Promise.all([releaseTryoutSessionResults(ties.sessionId, ties.ownerId, "Rilis serentak pertama."), releaseTryoutSessionResults(ties.sessionId, ties.ownerId, "Rilis serentak kedua.")]));
  assert.deepEqual(doubleRelease.map((row) => row.state).sort(), ["existing", "released"]);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { deliverySessionId: ties.sessionId, action: "result.bundle_released" } }), 1);
  for (const row of [{ id: ties.attemptId, studentId: ties.studentId }, tied]) { const result = await atSr01Time(ties.end, () => participantTryoutResult(row.id, row.studentId)); assert(result.ranking); assert.equal(result.ranking.rank, 1); assert.equal(result.ranking.total, 2); }
  evidence.push("B09/B10/B11 concurrent public release creates one committed bundle/audit; equal scores keep competition rank1/total2"); console.log("PASS", evidence.at(-1));

  const irtStart = await nextWindow();
  const irt = await createSr01Fixture("SR03 fractional IRT", 0, true, irtStart);
  const run = (await sr01History(irt.attemptId)).attempt.runs[0]; const item = (run.contentSnapshot as unknown as Sr01Snapshot).items[0];
  await atSr01Time(irt.start, async () => { await startActiveTestRun(irt.attemptId, run.id, irt.studentId); await saveTryoutAnswer(irt.attemptId, run.id, item.id, item.options.find((option) => option.isCorrect)!.id, irt.studentId); await sealTryoutTestRun(irt.attemptId, run.id, irt.studentId); });
  await atSr01Time(irt.end, () => attemptState(irt.attemptId, irt.studentId));
  assert((await atSr01Time(irt.end, () => inspectTryoutSessionReadiness(scope(irt), irt.ownerId)))?.ready);
  await atSr01Time(irt.end, () => releaseTryoutSessionResults(irt.sessionId, irt.ownerId, "Rilis perhitungan IRT pecahan."));
  const irtResult = await atSr01Time(irt.end, () => participantTryoutResult(irt.attemptId, irt.studentId)); assert(irtResult.released); assert.equal(irtResult.finalScore, 8.56);
  const immutableIrt = await snapshot(irt); await prisma.tryoutAttempt.update({ where: { id: irt.attemptId }, data: { scoringVersion: "older-published-version" } });
  const older = await snapshot(irt); await synchronizeTryoutSessionReleaseState(irt.sessionId, irt.end); await calculateTryoutAttempt(irt.attemptId, irt.ownerId, "Riwayat tetap tersimpan."); assert.deepEqual(await snapshot(irt), older); assert.equal(immutableIrt.attempts.length, 1);
  evidence.push("B04 fractional IRT raw0.4011/breakdown0.40 publishes and reads8.56 without false corruption; older published version immutable"); console.log("PASS", evidence.at(-1));

  const race = await fixture("recovery expiry release archive", false);
  await prisma.tryoutAttempt.update({ where: { id: race.attemptId }, data: { status: "expired", attemptState: "expired", scoringState: "review_required" } });
  await prisma.tryoutAttemptTestRun.updateMany({ where: { attemptId: race.attemptId }, data: { status: "expired", scoringState: "review_required" } });
  await atSr01Time(race.end, async () => {
    const results = await Promise.allSettled([calculateTryoutAttempt(race.attemptId, race.ownerId, "Pulihkan hasil."), attemptState(race.attemptId, race.studentId), releaseTryoutSessionResults(race.sessionId, race.ownerId, "Rilis setelah siap."), archiveTryoutTransient(race.tryoutId, race.ownerId)]);
    assert.equal(results[0].status, "fulfilled"); assert.equal(results[3].status, "fulfilled");
    await releaseTryoutSessionResults(race.sessionId, race.ownerId, "Rilis atau periksa tanda terima.");
    await assert.rejects(startTryoutAttempt(race.sessionId, race.students.find((student) => student.id !== race.studentId)!.id));
  });
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { deliverySessionId: race.sessionId, action: "result.bundle_released" } }), 1);
  evidence.push("D05–D06 real recovery/expiry/release/archive commands serialize; one bundle audit and no new post-end Start"); console.log("PASS", evidence.at(-1));

  // Fresh ready QA session remains unreleased, alongside blocked/excluded-only/archive/multisession fixtures above.
  const readyQA = await fixture("QA ready unreleased");
  const rollback = await fixture("atomic refusal invalid release actor");
  await refuse(rollback, () => atSr01Time(rollback.end, () => releaseTryoutSessionResults(rollback.sessionId, randomUUID(), "Actor unavailable.", true)));
  const session: SessionContext = { sessionId: "owned-read", expiresAt: new Date(Date.now() + 100000), user: { id: policy.ownerId, email: "tutor@vecalss.local", fullName: "Kapten", roles: ["tutor"], status: "active", mustChangePassword: false, onboardingStatus: "completed" } };
  // Execute the real route's exported GET, replacing only request-session and
  // projection IO. Capability and cross-owner role decisions use real helpers.
  const routeSource = readFileSync(new URL("../app/api/mentor/tryout/result-readiness/route.ts", import.meta.url), "utf8").replace(/^import[^\n]*\n/gm, "");
  const routeJs = ts.transpileModule(routeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let routeSession: SessionContext | null = session; let projected = 0; const capabilities: string[] = []; const ownerScopes: boolean[] = [];
  const GET = new Function("exports", "getReadOnlySessionContext", "requireTryoutCapability", "hasRole", "RoleName", "serveTryoutReadinessInspection", "inspectTryoutSessionReadiness", `${routeJs}; return exports.GET;`)(
    {}, async () => routeSession, (current: SessionContext, capability: Parameters<typeof requireTryoutCapability>[1]) => { capabilities.push(capability); requireTryoutCapability(current, capability); }, hasRole, RoleName, serveTryoutReadinessInspection,
    async (_scope: unknown, _actor: string, crossOwner: boolean) => { projected++; ownerScopes.push(crossOwner); return policyRead; },
  ) as (request: Request) => Promise<Response>;
  const routeRequest = () => new Request(`http://localhost/api/mentor/tryout/result-readiness?${new URLSearchParams(policyScope)}`);
  for (const [roles, status, crossOwner] of [[[RoleName.student], 403, null], [[RoleName.tutor], 200, false], [[RoleName.admin], 200, true], [[], 403, null]] as Array<[RoleName[], number, boolean | null]>) {
    routeSession = { ...session, user: { ...session.user, roles } }; const before = projected; const response = await GET(routeRequest()); assert.equal(response.status, status);
    if (status === 403) { assert.deepEqual(await response.json(), { ok: false }); assert.equal(projected, before); }
    else assert.equal(ownerScopes.at(-1), crossOwner);
  }
  assert.deepEqual(capabilities, Array(4).fill("tryout.results.manage"));
  routeSession = null; assert.equal((await GET(routeRequest())).status, 401);
  routeSession = { ...session, user: { ...session.user, mustChangePassword: true } }; assert.equal((await GET(routeRequest())).status, 403); assert.equal(capabilities.length, 4);
  evidence.push("Actual readiness GET delegates to central results.manage capability and hasRole(admin); student/no-role denied generically without projection; owned tutor/admin scopes preserved"); console.log("PASS", evidence.at(-1));
  let releasePolicyLock!: () => void; let policyLocked!: () => void;
  const policyGate = new Promise<void>((resolve) => { releasePolicyLock = resolve; }); const policyAcquired = new Promise<void>((resolve) => { policyLocked = resolve; });
  const policyHolder = prisma.$transaction(async (tx) => { await acquireTryoutIdentityMutex(tx, { kind: "tryout", id: policy.tryoutId }); policyLocked(); await policyGate; }, { timeout: 10000 });
  await policyAcquired;
  const pendingPolicy = configureTryoutDefaultResultRelease(policy.tryoutId, "manual", policy.ownerId, "Vérifikasi pembacaan mandiri.");
  try {
    const response = await Promise.race([serveTryoutReadinessInspection(new Request(`http://localhost/api/mentor/tryout/result-readiness?${new URLSearchParams(policyScope)}`), { getSession: async () => session, authorize: (current) => { requireTryoutCapability(current, "tryout.results.manage"); return { allowCrossOwner: hasRole(current, RoleName.admin) }; }, read: inspectTryoutSessionReadiness }), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("Read queued behind write")), 2500); timer.unref(); })]);
    assert.equal(response.status, 200); assert.equal((await response.json()).snapshot.policy.receipt.id, configured.receipt.id);
  } finally { releasePolicyLock(); await policyHolder; await pendingPolicy; }
  assert.equal(await inspectTryoutSessionReadiness({ tryoutId: readyQA.tryoutId, sessionId: policy.sessionId }, readyQA.ownerId), null);
  evidence.push("D01–D04 actual owned HTTP/read transaction completes while public policy write waits on identity lock; atomic DB refusal preserves bundle/audit; cross-session read denied"); console.log("PASS", evidence.at(-1));

  const recoverableQA = await fixture("QA recoverable legacy expired", false);
  await prisma.tryoutAttempt.update({ where: { id: recoverableQA.attemptId }, data: { status: "expired", attemptState: "expired", scoringState: "review_required" } });
  await prisma.tryoutAttemptTestRun.updateMany({ where: { attemptId: recoverableQA.attemptId }, data: { status: "expired", scoringState: "review_required", calculationReleaseable: false } });
  assert.equal(await prisma.tryoutScoreBreakdown.count({ where: { attemptId: recoverableQA.attemptId } }), 0);
  const recoverableRead = await inspectTryoutSessionReadiness(scope(recoverableQA), recoverableQA.ownerId); assert(recoverableRead); assert.equal(recoverableRead.counts.blocked, 1); assert.equal(recoverableRead.counts.ready, 0);
  assert.equal((await inspectTryoutCalculation({ ...scope(recoverableQA), attemptId: recoverableQA.attemptId }, recoverableQA.ownerId))?.state, "ready", "Leave the valid legacy-expired fixture recoverable, without performing recovery in setup");
  await writeFile(`${output}/qa-fixtures-candidate2.json`, JSON.stringify({ generatedBy: "SR03 public DB script", fixtures: await Promise.all([
    qaFixture("recoverable legacy expired; blocked1→ready1 after explicit SR02 recovery", recoverableQA), qaFixture("ready unreleased; manual hidden", readyQA), qaFixture("corrupt non-excluded blocker", blocked), qaFixture("excluded-only", excludedOnly), qaFixture("archived readiness", archived), qaFixture("editable inherited policy and no-attempt student", policy), qaFixture("explicit scheduled historical session", { ...policy, sessionId: explicit.id }),
  ]) }, null, 2));
  evidence.push("Reusable sanitized QA map includes recoverable legacy-expired/7valid snapshots/no aggregate, ready hidden, corrupt, excluded-only, archived and editable multisession scopes"); console.log("PASS", evidence.at(-1));
} finally {
  await writeFile(`${output}/db-evidence.json`, JSON.stringify({ evidence, fixtures }, null, 2));
  await prisma.$disconnect();
}

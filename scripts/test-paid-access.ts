import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { RoleName } from "../generated/prisma/client";
import {
  isPaidAccessEnforced,
  paidAccessDenial,
  studentMayUsePaidSurfaces,
} from "../lib/billing/enforcement";
import {
  ACCESS_PLAN_CODES,
  addCalendarMonths,
  getFullAccessEndsAt,
} from "../lib/billing/plans";
import {
  BillingAccessError,
  deriveAccessState,
  extendAccess,
  getAccessState,
  grantAccess,
  hasPaidAccess,
  listAccessHistory,
  pauseAccess,
  resumeAccess,
  revokeAccess,
  type BillingAccessErrorCode,
} from "../lib/billing/service";
import { prisma } from "../lib/prisma";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:paid-access only runs against the local dev database on 127.0.0.1:55432.");
}

const runId = randomUUID().slice(0, 8);
const userIds: string[] = [];
const at = (iso: string) => new Date(iso);

async function makeUser(label: string, role: RoleName) {
  const user = await prisma.user.create({
    data: {
      email: `paid-access-${label}-${runId}@vecalss.local`,
      fullName: `Paid Access ${label}`,
      passwordHash: "not-a-real-hash",
      roleAssignments: { create: [{ role }] },
    },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

const key = () => `test-${randomUUID()}`;

async function rejects(code: BillingAccessErrorCode, run: () => Promise<unknown>, label: string = code) {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof BillingAccessError, `${label}: expected a BillingAccessError, got ${String(error)}`);
    assert.equal(error.code, code, label);
    return true;
  });
}

const fullEnv = {
  FULL_ACCESS_ENDS_ON_MANDIRI: "2027-08-31",
  FULL_ACCESS_ENDS_ON_UTBK: "2027-06-30",
};

async function main() {
  // ---- Calendar maths (Asia/Jakarta) -----------------------------------
  const iso = (date: Date) => date.toISOString();
  assert.equal(iso(addCalendarMonths(at("2026-11-03T10:00:00+07:00"), 1)), iso(at("2026-12-03T10:00:00+07:00")));
  assert.equal(iso(addCalendarMonths(at("2027-01-31T10:00:00+07:00"), 1)), iso(at("2027-02-28T10:00:00+07:00")), "31 Jan -> 28 Feb");
  assert.equal(iso(addCalendarMonths(at("2028-01-31T10:00:00+07:00"), 1)), iso(at("2028-02-29T10:00:00+07:00")), "leap year");
  assert.equal(iso(addCalendarMonths(at("2028-02-29T23:59:59+07:00"), 12)), iso(at("2029-02-28T23:59:59+07:00")), "29 Feb + 12 months");
  assert.equal(iso(addCalendarMonths(at("2027-03-31T08:00:00+07:00"), 1)), iso(at("2027-04-30T08:00:00+07:00")));
  assert.equal(iso(addCalendarMonths(at("2026-12-15T09:30:00+07:00"), 1)), iso(at("2027-01-15T09:30:00+07:00")), "across the year");
  assert.equal(iso(addCalendarMonths(at("2027-03-31T08:00:00+07:00"), -1)), iso(at("2027-02-28T08:00:00+07:00")));
  // 20:00 UTC on 31 Dec is already 1 Jan in Jakarta: the month is counted on the Jakarta calendar.
  assert.equal(iso(addCalendarMonths(at("2026-12-31T20:00:00Z"), 1)), iso(at("2027-01-31T20:00:00Z")));
  assert.equal(iso(addCalendarMonths(at("2026-11-30T16:59:00Z"), 1)), iso(at("2026-12-30T16:59:00Z")));

  // ---- Full Access dates come from configuration, never from code -------
  assert.equal(getFullAccessEndsAt("utbk", {}), null, "no default date");
  assert.equal(getFullAccessEndsAt("mandiri", {}), null);
  assert.equal(iso(getFullAccessEndsAt("utbk", fullEnv) as Date), "2027-06-30T17:00:00.000Z", "runs through the whole last day (Jakarta)");
  for (const bad of ["", " ", "2027-02-30", "30-06-2027", "2027/06/30", "2027-6-3", "tomorrow"]) {
    assert.equal(getFullAccessEndsAt("utbk", { FULL_ACCESS_ENDS_ON_UTBK: bad }), null, `"${bad}"`);
  }
  assert.deepEqual(ACCESS_PLAN_CODES.sort(), ["full_mandiri", "full_utbk", "monthly"]);

  // ---- State derivation ------------------------------------------------
  const win = { endsAt: at("2026-12-03T10:00:00+07:00"), planCode: "monthly", startsAt: at("2026-11-03T10:00:00+07:00") };
  assert.equal(deriveAccessState({ ...win, status: "active" }, at("2026-11-03T10:00:00+07:00")).status, "active", "start is inclusive");
  assert.equal(deriveAccessState({ ...win, status: "active" }, at("2026-11-03T09:59:59.999+07:00")).status, "none", "before the start");
  assert.equal(deriveAccessState({ ...win, status: "active" }, at("2026-12-03T09:59:59.999+07:00")).status, "active");
  assert.equal(deriveAccessState({ ...win, status: "active" }, at("2026-12-03T10:00:00+07:00")).status, "expired", "end is exclusive");
  assert.equal(deriveAccessState({ ...win, status: "suspended" }, at("2026-11-10T00:00:00Z")).status, "paused");
  assert.equal(deriveAccessState({ ...win, status: "cancelled" }, at("2026-11-10T00:00:00Z")).status, "revoked");
  assert.equal(deriveAccessState({ ...win, status: "trial" }, at("2026-11-10T00:00:00Z")).status, "none");

  // ---- Fixtures --------------------------------------------------------
  const admin = await makeUser("admin", RoleName.admin);
  const tutor = await makeUser("tutor", RoleName.tutor);
  const student = await makeUser("student", RoleName.student);
  const other = await makeUser("other", RoleName.student);
  const base = (studentId: string, overrides: Record<string, unknown> = {}) => ({
    actorUserId: admin,
    idempotencyKey: key(),
    reason: "pembayaran dikonfirmasi",
    source: "admin" as const,
    studentId,
    ...overrides,
  });
  const events = (studentId: string) => prisma.billingAccessEvent.count({ where: { studentId } });
  const audits = (studentId: string, action?: string) =>
    prisma.auditLog.count({ where: { action: action ?? { startsWith: "billing.access." }, targetId: studentId } });

  // Nothing yet.
  assert.deepEqual((await getAccessState(student)).status, "none");
  assert.equal(await hasPaidAccess(student), false);

  // ---- Grant (monthly), with an injected clock --------------------------
  const t0 = at("2026-11-03T10:00:00+07:00");
  const grantKey = key();
  const granted = await grantAccess({ ...base(student, { idempotencyKey: grantKey, now: t0 }), plan: "monthly" });
  assert.equal(granted.outcome, "applied");
  assert.equal(granted.state.status, "active");
  assert.equal(iso(granted.state.endsAt as Date), iso(at("2026-12-03T10:00:00+07:00")));
  assert.equal(granted.event?.kind, "grant");
  assert.equal(granted.event?.planCode, "monthly");
  assert.equal(await events(student), 1);
  assert.equal(await audits(student, "billing.access.grant"), 1);
  const auditRow = await prisma.auditLog.findFirstOrThrow({ where: { action: "billing.access.grant", targetId: student } });
  assert.equal(auditRow.actorUserId, admin);
  assert.equal(auditRow.targetType, "student");
  assert.equal((auditRow.metadata as { reason: string }).reason, "pembayaran dikonfirmasi");
  assert.equal((auditRow.metadata as { eventId: string }).eventId, granted.event?.id);

  // Boundaries on the database's own comparison.
  assert.equal(await hasPaidAccess(student, at("2026-11-03T10:00:00+07:00")), true, "at the start");
  assert.equal(await hasPaidAccess(student, at("2026-11-03T09:59:59.999+07:00")), false, "just before the start");
  assert.equal(await hasPaidAccess(student, at("2026-12-03T09:59:59.999+07:00")), true, "just before the end");
  assert.equal(await hasPaidAccess(student, at("2026-12-03T10:00:00+07:00")), false, "at the end");
  assert.equal(await hasPaidAccess(student, at("2030-01-01T00:00:00Z")), false, "long after, with nothing flipping the status");
  assert.equal(await hasPaidAccess(other), false, "another student has nothing");

  // ---- Idempotency -----------------------------------------------------
  const again = await grantAccess({ ...base(student, { idempotencyKey: grantKey, now: t0 }), plan: "monthly" });
  assert.equal(again.outcome, "duplicate");
  assert.equal(again.event?.id, granted.event?.id);
  assert.equal(await events(student), 1, "a repeated grant is a no-op");
  assert.equal(await audits(student, "billing.access.grant"), 1, "and writes no second audit event");
  await rejects("idempotency_conflict", () => grantAccess({ ...base(other, { idempotencyKey: grantKey, now: t0 }), plan: "monthly" }), "same key, other student");
  await rejects("idempotency_conflict", () => revokeAccess(base(student, { idempotencyKey: grantKey, now: t0 })), "same key, other operation");
  assert.equal(await events(other), 0);

  // A second grant with a new key while access runs is refused, not stacked.
  await rejects("already_active", () => grantAccess({ ...base(student, { now: t0 }), plan: "monthly" }));
  assert.equal(await events(student), 1);

  // Concurrent duplicates: one wins, the rest see the same event.
  const raceStudent = await makeUser("race", RoleName.student);
  const raceKey = key();
  const race = await Promise.all(
    Array.from({ length: 6 }, () => grantAccess({ ...base(raceStudent, { idempotencyKey: raceKey, now: t0 }), plan: "monthly" })),
  );
  assert.equal(race.filter((item) => item.outcome === "applied").length, 1);
  assert.equal(race.filter((item) => item.outcome === "duplicate").length, 5);
  assert.equal(await events(raceStudent), 1);
  // Concurrent different keys: still one running grant.
  const race2 = await makeUser("race2", RoleName.student);
  const settled = await Promise.allSettled(Array.from({ length: 5 }, () => grantAccess({ ...base(race2, { now: t0 }), plan: "monthly" })));
  assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(await events(race2), 1);

  // ---- Extend (monthly) ------------------------------------------------
  // Still active: one calendar month from the current end, not from today.
  const extended = await extendAccess({ ...base(student, { now: at("2026-11-20T10:00:00+07:00") }), plan: "monthly" });
  assert.equal(iso(extended.state.endsAt as Date), iso(at("2027-01-03T10:00:00+07:00")));
  assert.equal(iso(extended.state.startsAt as Date), iso(t0), "the start stays");
  const extendedAgain = await extendAccess({ ...base(student, { now: at("2026-11-21T10:00:00+07:00") }), plan: "monthly" });
  assert.equal(iso(extendedAgain.state.endsAt as Date), iso(at("2027-02-03T10:00:00+07:00")), "stacks");
  // Month ends: 31 Jan -> 28 Feb, and a leap year.
  const monthEnd = await makeUser("monthend", RoleName.student);
  await grantAccess({ ...base(monthEnd, { now: at("2027-01-31T10:00:00+07:00") }), plan: "monthly" });
  assert.equal(iso((await getAccessState(monthEnd, at("2027-01-31T11:00:00+07:00"))).endsAt as Date), iso(at("2027-02-28T10:00:00+07:00")));
  const leap = await makeUser("leap", RoleName.student);
  await grantAccess({ ...base(leap, { now: at("2028-01-31T10:00:00+07:00") }), plan: "monthly" });
  assert.equal(iso((await getAccessState(leap, at("2028-01-31T11:00:00+07:00"))).endsAt as Date), iso(at("2028-02-29T10:00:00+07:00")));

  // Expired: extending starts a new month from today.
  const lapsed = at("2027-02-10T10:00:00+07:00");
  assert.equal((await getAccessState(student, lapsed)).status, "expired");
  const restarted = await extendAccess({ ...base(student, { now: lapsed }), plan: "monthly" });
  assert.equal(iso(restarted.state.startsAt as Date), iso(lapsed));
  assert.equal(iso(restarted.state.endsAt as Date), iso(at("2027-03-10T10:00:00+07:00")));
  // Without access there is nothing to extend.
  await rejects("no_access", () => extendAccess({ ...base(other), plan: "monthly" }));

  // ---- Full Access -----------------------------------------------------
  const full = await makeUser("full", RoleName.student);
  await rejects("full_end_not_configured", () => grantAccess({ ...base(full, { env: {} }), plan: "full_utbk" }), "no date configured");
  await rejects("full_end_passed", () => grantAccess({ ...base(full, { env: fullEnv, now: at("2027-07-15T00:00:00+07:00") }), plan: "full_utbk" }), "date passed");
  assert.equal(await events(full), 0, "refusals write nothing");
  const fullGrant = await grantAccess({ ...base(full, { env: fullEnv, now: at("2026-11-03T10:00:00+07:00") }), plan: "full_utbk" });
  assert.equal(iso(fullGrant.state.endsAt as Date), "2027-06-30T17:00:00.000Z");
  assert.equal(fullGrant.state.planCode, "full_utbk");
  assert.equal((await getAccessState(full, at("2027-06-30T16:59:59Z"))).status, "active", "through the last day");
  assert.equal((await getAccessState(full, at("2027-06-30T17:00:00Z"))).status, "expired");
  await rejects("nothing_to_extend", () => extendAccess({ ...base(full, { env: fullEnv, now: at("2026-11-04T10:00:00+07:00") }), plan: "full_utbk" }));
  // Moving a monthly student up to Full Access sets the end date.
  const upgrade = await makeUser("upgrade", RoleName.student);
  await grantAccess({ ...base(upgrade, { now: at("2026-11-03T10:00:00+07:00") }), plan: "monthly" });
  const upgraded = await extendAccess({ ...base(upgrade, { env: fullEnv, now: at("2026-11-10T10:00:00+07:00") }), plan: "full_mandiri" });
  assert.equal(iso(upgraded.state.endsAt as Date), "2027-08-31T17:00:00.000Z");
  assert.equal(upgraded.state.planCode, "full_mandiri");

  // ---- Pause and resume ------------------------------------------------
  const pausable = await makeUser("pausable", RoleName.student);
  await grantAccess({ ...base(pausable, { now: at("2026-11-03T10:00:00+07:00") }), plan: "monthly" });
  const paused = await pauseAccess(base(pausable, { now: at("2026-11-10T10:00:00+07:00") }));
  assert.equal(paused.state.status, "paused");
  assert.equal(iso(paused.state.endsAt as Date), iso(at("2026-12-03T10:00:00+07:00")), "the end date does not move");
  assert.equal(await hasPaidAccess(pausable, at("2026-11-11T10:00:00+07:00")), false, "paused: no access");
  const pausedEvents = await events(pausable);
  assert.equal((await pauseAccess(base(pausable, { now: at("2026-11-11T10:00:00+07:00") }))).outcome, "unchanged", "pausing a paused account is a no-op");
  assert.equal(await events(pausable), pausedEvents);
  await rejects("paused", () => grantAccess({ ...base(pausable, { now: at("2026-11-11T10:00:00+07:00") }), plan: "monthly" }), "grant while paused");
  await rejects("paused", () => extendAccess({ ...base(pausable, { now: at("2026-11-11T10:00:00+07:00") }), plan: "monthly" }), "extend while paused");
  const resumed = await resumeAccess(base(pausable, { now: at("2026-11-12T10:00:00+07:00") }));
  assert.equal(resumed.state.status, "active");
  assert.equal(await hasPaidAccess(pausable, at("2026-11-12T11:00:00+07:00")), true);
  assert.equal((await resumeAccess(base(pausable, { now: at("2026-11-12T12:00:00+07:00") }))).outcome, "unchanged", "resuming a running account is a no-op");
  await rejects("not_active", () => pauseAccess(base(other, { now: at("2026-11-12T12:00:00+07:00") })), "pausing without access");
  // A pause that outlasts the access leaves it expired, not revived.
  const lateResume = await makeUser("lateresume", RoleName.student);
  await grantAccess({ ...base(lateResume, { now: at("2026-11-03T10:00:00+07:00") }), plan: "monthly" });
  await pauseAccess(base(lateResume, { now: at("2026-11-10T10:00:00+07:00") }));
  const lateResumed = await resumeAccess(base(lateResume, { now: at("2027-01-01T10:00:00+07:00") }));
  assert.equal(lateResumed.state.status, "expired");
  assert.equal(await hasPaidAccess(lateResume, at("2027-01-01T10:00:01+07:00")), false);
  assert.equal((await prisma.billingAccount.findUniqueOrThrow({ where: { studentId: lateResume } })).status, "expired");

  // ---- Revoke (a full refund) ------------------------------------------
  const refunded = await makeUser("refunded", RoleName.student);
  await grantAccess({ ...base(refunded, { now: at("2026-11-03T10:00:00+07:00") }), plan: "monthly" });
  const revokeKey = key();
  const revoked = await revokeAccess(base(refunded, { idempotencyKey: revokeKey, now: at("2026-11-08T10:00:00+07:00") }));
  assert.equal(revoked.state.status, "revoked");
  assert.equal(iso(revoked.state.endsAt as Date), iso(at("2026-11-08T10:00:00+07:00")), "access ends immediately");
  assert.equal(await hasPaidAccess(refunded, at("2026-11-08T10:00:00.001+07:00")), false);
  assert.equal(await hasPaidAccess(refunded), false, "revoked means no access, whatever the clock says");
  const refundEvents = await events(refunded);
  assert.equal((await revokeAccess(base(refunded, { now: at("2026-11-09T10:00:00+07:00") }))).outcome, "unchanged", "revoking a revoked account is a no-op");
  assert.equal((await revokeAccess(base(refunded, { idempotencyKey: revokeKey, now: at("2026-11-09T10:00:00+07:00") }))).outcome, "duplicate");
  assert.equal(await events(refunded), refundEvents);
  assert.equal((await revokeAccess(base(other, { now: at("2026-11-09T10:00:00+07:00") }))).outcome, "unchanged", "nothing to revoke");
  await rejects("revoked", () => extendAccess({ ...base(refunded, { now: at("2026-11-09T10:00:00+07:00") }), plan: "monthly" }));
  // The history stays, and a later purchase can start access again.
  assert.equal((await listAccessHistory(refunded)).map((item) => item.kind).join(","), "revoke,grant");
  const regranted = await grantAccess({ ...base(refunded, { now: at("2026-11-20T10:00:00+07:00") }), plan: "monthly" });
  assert.equal(regranted.state.status, "active");
  assert.equal((await listAccessHistory(refunded, 5)).length, 3);

  // ---- Expiry needs no job: it is read from the clock -------------------
  // The window is set relative to the database clock in SQL, so nothing here waits on real time.
  const clock = await makeUser("clock", RoleName.student);
  await grantAccess({ ...base(clock), plan: "monthly" });
  const setWindow = (studentId: string, starts: string, ends: string) => prisma.$executeRaw`
    UPDATE billing_accounts
    SET access_starts_at = now() + ${starts}::interval, access_expires_at = now() + ${ends}::interval
    WHERE student_id = ${studentId}::uuid`;
  await setWindow(clock, "-1 day", "1 hour");
  assert.equal(await hasPaidAccess(clock), true, "running");
  assert.equal((await getAccessState(clock)).status, "active");
  await setWindow(clock, "-1 day", "-1 second");
  assert.equal(await hasPaidAccess(clock), false, "ended on its own");
  assert.equal((await getAccessState(clock)).status, "expired");
  await setWindow(clock, "1 hour", "1 day");
  assert.equal(await hasPaidAccess(clock), false, "not started yet");
  assert.equal((await getAccessState(clock)).status, "none");
  await setWindow(clock, "-1 day", "1 hour");
  assert.equal(await hasPaidAccess(clock), true, "running again once the window covers now");
  assert.equal((await prisma.billingAccount.findUniqueOrThrow({ where: { studentId: clock } })).status, "active", "the stored status was never touched");

  // ---- Database time, not the application's ----------------------------
  // One transaction, one database clock: the event time and the access start are the same instant.
  const dbTime = await makeUser("dbtime", RoleName.student);
  const dbGrant = await grantAccess({ ...base(dbTime), plan: "monthly" });
  assert.equal(dbGrant.event?.occurredAt.getTime(), dbGrant.state.startsAt?.getTime(), "start follows the database clock");

  // ---- Who and what ----------------------------------------------------
  await rejects("student_not_found", () => grantAccess({ ...base(tutor), plan: "monthly" }), "a tutor");
  await rejects("student_not_found", () => grantAccess({ ...base(randomUUID()), plan: "monthly" }), "no such account");
  await rejects("invalid_reason", () => grantAccess({ ...base(other, { reason: "   " }), plan: "monthly" }), "blank reason");
  await rejects("invalid_reason", () => grantAccess({ ...base(other, { reason: "x".repeat(501) }), plan: "monthly" }), "long reason");
  await rejects("invalid_reason", () => grantAccess({ ...base(other, { actorUserId: null }), plan: "monthly" }), "no actor");
  await rejects("invalid_key", () => grantAccess({ ...base(other, { idempotencyKey: "short" }), plan: "monthly" }), "short key");
  await rejects("unknown_plan", () => grantAccess({ ...base(other), plan: "gold" as never }), "unknown plan");
  assert.equal(await events(other), 0);

  // ---- The history is append-only --------------------------------------
  const row = await prisma.billingAccessEvent.findFirstOrThrow({ where: { studentId: student } });
  await assert.rejects(() => prisma.$executeRaw`UPDATE billing_access_events SET reason = 'edited' WHERE id = ${row.id}::uuid`, /append-only/u);
  await assert.rejects(() => prisma.$executeRaw`DELETE FROM billing_access_events WHERE id = ${row.id}::uuid`, /append-only/u);
  await assert.rejects(() => prisma.billingAccessEvent.update({ data: { reason: "edited" }, where: { id: row.id } }), /append-only/u);
  await assert.rejects(() => prisma.billingAccessEvent.deleteMany({ where: { studentId: student } }), /append-only/u);
  await assert.rejects(() => prisma.$executeRaw`TRUNCATE billing_access_events`, /append-only/u);
  assert.equal((await prisma.billingAccessEvent.findUniqueOrThrow({ where: { id: row.id } })).reason, "pembayaran dikonfirmasi");
  // An admin change always names the admin and a reason, even if a caller skips the service.
  const account = await prisma.billingAccount.findUniqueOrThrow({ where: { studentId: student } });
  await assert.rejects(
    () => prisma.billingAccessEvent.create({
      data: { billingAccountId: account.id, idempotencyKey: key(), kind: "grant", reason: "no actor", resultingStatus: "active", source: "admin", studentId: student },
    }),
    /admin_actor_check|violates check constraint/u,
  );
  await assert.rejects(
    () => prisma.billingAccessEvent.create({
      data: { actorUserId: admin, billingAccountId: account.id, idempotencyKey: key(), kind: "grant", reason: "   ", resultingStatus: "active", source: "admin", studentId: student },
    }),
    /admin_actor_check|violates check constraint/u,
  );

  // Every applied change was audited; duplicates and no-ops were not.
  const history = await listAccessHistory(student, 50);
  const audited = await audits(student);
  assert.equal(audited, history.length, "one audit event per history event");
  assert.deepEqual(
    (await prisma.auditLog.findMany({ orderBy: { occurredAt: "asc" }, select: { action: true }, where: { action: { startsWith: "billing.access." }, targetId: student } })).map((item) => item.action),
    ["billing.access.grant", "billing.access.extend", "billing.access.extend", "billing.access.extend"],
  );

  // ---- The switch ------------------------------------------------------
  for (const [value, enforced] of [
    [undefined, false], ["", false], ["0", false], ["off", false], ["false", false], ["enabled", false], ["onn", false], [" 1 ", true],
    ["1", true], ["true", true], ["TRUE", true], ["on", true], ["yes", true],
  ] as const) {
    assert.equal(isPaidAccessEnforced({ PAID_ACCESS_ENFORCED: value }), enforced, String(value));
  }
  const off = {} as NodeJS.ProcessEnv;
  const on = { PAID_ACCESS_ENFORCED: "1" } as unknown as NodeJS.ProcessEnv;
  const nobody = await makeUser("nobody", RoleName.student);
  assert.equal(await studentMayUsePaidSurfaces(nobody, off), true, "off: everyone, as today");
  assert.equal(await studentMayUsePaidSurfaces(randomUUID(), off), true, "off: no lookup at all");
  assert.equal(await paidAccessDenial({ user: { id: nobody } }, off), null);
  assert.equal(await studentMayUsePaidSurfaces(nobody, on), false, "on: no access, no entry");
  const denial = await paidAccessDenial({ user: { id: nobody } }, on);
  assert.equal(denial?.status, 403);
  assert.deepEqual(
    { code: (await denial?.json())?.code },
    { code: "paid_access_required" },
  );
  const entitled = await makeUser("entitled", RoleName.student);
  await grantAccess({ ...base(entitled), plan: "monthly" });
  assert.equal(await studentMayUsePaidSurfaces(entitled, on), true, "on: running access");
  assert.equal(await paidAccessDenial({ user: { id: entitled } }, on), null);
  await pauseAccess(base(entitled));
  assert.equal(await studentMayUsePaidSurfaces(entitled, on), false, "on: paused");
  await resumeAccess(base(entitled));
  assert.equal(await studentMayUsePaidSurfaces(entitled, on), true);
  await revokeAccess(base(entitled));
  assert.equal(await studentMayUsePaidSurfaces(entitled, on), false, "on: revoked");
  assert.equal(await studentMayUsePaidSurfaces(entitled, off), true, "off again: open");

  console.log("Paid access checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Audit rows are append-only and reference the accounts, so the throwaway accounts stay, switched off.
    if (userIds.length) await prisma.user.updateMany({ data: { status: "disabled" }, where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

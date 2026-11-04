import {
  BillingAccessEventKind,
  BillingAccessSource,
  BillingStatus,
  Prisma,
  RoleName,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  ACCESS_PLANS,
  addCalendarMonths,
  getFullAccessEndsAt,
  isAccessPlan,
  type AccessPlan,
} from "./plans";

type Env = Partial<Record<string, string | undefined>>;

type BillingAccessErrorCode =
  | "already_active"
  | "full_end_not_configured"
  | "full_end_passed"
  | "idempotency_conflict"
  | "invalid_key"
  | "invalid_reason"
  | "no_access"
  | "not_active"
  | "nothing_to_extend"
  | "paused"
  | "revoked"
  | "student_not_found"
  | "unknown_plan";

class BillingAccessError extends Error {
  readonly code: BillingAccessErrorCode;

  constructor(code: BillingAccessErrorCode, message: string) {
    super(message);
    this.name = "BillingAccessError";
    this.code = code;
  }
}

/**
 * Where a student's paid access stands right now. "expired" is worked out from
 * the stored end date at read time, so no job has to flip it.
 */
type AccessStatus = "none" | "active" | "expired" | "paused" | "revoked";

type AccessState = {
  endsAt: Date | null;
  planCode: string | null;
  startsAt: Date | null;
  status: AccessStatus;
};

type AccountRow = {
  access_expires_at: Date | null;
  access_starts_at: Date | null;
  id: string;
  plan_code: string | null;
  status: BillingStatus;
};

const NO_ACCESS: AccessState = { endsAt: null, planCode: null, startsAt: null, status: "none" };

function deriveAccessState(
  account: {
    endsAt: Date | null;
    planCode: string | null;
    startsAt: Date | null;
    status: BillingStatus;
  },
  now: Date,
): AccessState {
  const { endsAt, planCode, startsAt, status } = account;
  const base = { endsAt, planCode, startsAt };

  if (status === BillingStatus.suspended) return { ...base, status: "paused" };
  if (status === BillingStatus.cancelled) return { ...base, status: "revoked" };
  if (status === BillingStatus.trial || !startsAt || !endsAt) return { ...NO_ACCESS };
  if (startsAt.getTime() > now.getTime()) return { ...NO_ACCESS };
  // Access runs from its start up to, but not including, its end.
  if (status === BillingStatus.expired || endsAt.getTime() <= now.getTime()) return { ...base, status: "expired" };

  return { ...base, status: "active" };
}

function stateFromRow(row: AccountRow, now: Date) {
  return deriveAccessState(
    { endsAt: row.access_expires_at, planCode: row.plan_code, startsAt: row.access_starts_at, status: row.status },
    now,
  );
}

type OperationInput = {
  actorUserId: string | null;
  /** Repeating a call with the same key changes nothing. */
  idempotencyKey: string;
  /** Replaces the database clock. Tests only: nothing in the app passes it. */
  now?: Date;
  reason: string;
  source: "admin" | "payment";
  studentId: string;
};

type PlanOperationInput = OperationInput & { env?: Env; plan: AccessPlan };

type AccessEvent = {
  endsAt: Date | null;
  id: string;
  idempotencyKey: string;
  kind: BillingAccessEventKind;
  occurredAt: Date;
  planCode: string | null;
  reason: string;
  resultingStatus: BillingStatus;
  startsAt: Date | null;
};

/**
 * applied: a new event was recorded. duplicate: this key was already used, so
 * the earlier result is returned. unchanged: the account was already in the
 * requested state (for example revoking a revoked account), so nothing was written.
 */
type OperationResult = {
  event: AccessEvent | null;
  outcome: "applied" | "duplicate" | "unchanged";
  state: AccessState;
};

function checkInput({ idempotencyKey, reason, source, actorUserId }: OperationInput) {
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length < 8 || idempotencyKey.length > 120) {
    throw new BillingAccessError("invalid_key", "The idempotency key must be 8 to 120 characters.");
  }
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (!trimmed || trimmed.length > 500) {
    throw new BillingAccessError("invalid_reason", "A reason of 1 to 500 characters is required.");
  }
  if (source === "admin" && !actorUserId) {
    throw new BillingAccessError("invalid_reason", "An admin change must name the admin.");
  }
  return trimmed;
}

const EVENT_SELECT = {
  endsAt: true,
  id: true,
  idempotencyKey: true,
  kind: true,
  occurredAt: true,
  planCode: true,
  reason: true,
  resultingStatus: true,
  startsAt: true,
} satisfies Prisma.BillingAccessEventSelect;

type Change = {
  endsAt: Date | null;
  planCode: string | null;
  startsAt: Date | null;
  status: BillingStatus;
};

type Decision =
  | { change: Change; kind: "apply" }
  | { kind: "unchanged" };

/**
 * One locked, audited transition. The account row is locked first, so two
 * concurrent calls for the same student run one after the other and the second
 * sees the first's result (including its idempotency key). Time comes from the
 * database unless a test passes its own.
 */
async function transition(
  input: OperationInput,
  kind: BillingAccessEventKind,
  decide: (account: AccountRow, state: AccessState, now: Date) => Decision,
): Promise<OperationResult> {
  checkInput(input);
  return prisma.$transaction((tx) => runTransition(tx, input, kind, decide));
}

type EventKindChoice = BillingAccessEventKind | ((state: AccessState) => BillingAccessEventKind);

/**
 * The body of `transition`, run inside a transaction the caller owns. A payment
 * uses it directly so the grant commits with the payment that earned it. The
 * kind may depend on the account's state (a payment is a grant or an extension
 * depending on whether access is running), so it can be a function of it.
 */
async function runTransition(
  tx: Prisma.TransactionClient,
  input: OperationInput,
  kindChoice: EventKindChoice,
  decide: (account: AccountRow, state: AccessState, now: Date) => Decision,
): Promise<OperationResult> {
  const reason = checkInput(input);

  {
    const student = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT u.id FROM users u
      WHERE u.id = ${input.studentId}::uuid
        AND u.soft_deleted_at IS NULL
        AND u.preview_purpose IS NULL
        AND EXISTS (
          SELECT 1 FROM role_assignments ra
          WHERE ra.user_id = u.id AND ra.role = ${RoleName.student}::role_name AND ra.revoked_at IS NULL
        )
    `;
    if (!student.length) throw new BillingAccessError("student_not_found", "The student account was not found.");

    await tx.$executeRaw`
      INSERT INTO billing_accounts (student_id, status) VALUES (${input.studentId}::uuid, 'trial')
      ON CONFLICT (student_id) DO NOTHING
    `;
    const accounts = await tx.$queryRaw<AccountRow[]>`
      SELECT id, status, plan_code, access_starts_at, access_expires_at
      FROM billing_accounts
      WHERE student_id = ${input.studentId}::uuid
      FOR UPDATE
    `;
    const account = accounts[0];
    const [{ now: databaseNow }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT now() AS now`;
    const now = input.now ?? databaseNow;
    const state = stateFromRow(account, now);

    const earlier = await tx.billingAccessEvent.findUnique({
      select: { ...EVENT_SELECT, kind: true, studentId: true },
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (earlier) {
      if (earlier.studentId !== input.studentId || (typeof kindChoice !== "function" && earlier.kind !== kindChoice)) {
        throw new BillingAccessError("idempotency_conflict", "This key was already used for a different change.");
      }
      return { event: earlier, outcome: "duplicate" as const, state };
    }

    const decision = decide(account, state, now);
    if (decision.kind === "unchanged") return { event: null, outcome: "unchanged" as const, state };
    const kind = typeof kindChoice === "function" ? kindChoice(state) : kindChoice;

    const { change } = decision;
    await tx.$executeRaw`
      UPDATE billing_accounts
      SET status = ${change.status}::billing_status,
          plan_code = ${change.planCode},
          access_starts_at = ${change.startsAt},
          access_expires_at = ${change.endsAt},
          extended_by_user_id = ${input.actorUserId}::uuid,
          updated_at = now()
      WHERE id = ${account.id}::uuid
    `;

    const event = await tx.billingAccessEvent.create({
      data: {
        actorUserId: input.actorUserId,
        billingAccountId: account.id,
        endsAt: change.endsAt,
        idempotencyKey: input.idempotencyKey,
        kind,
        // Prisma fills a defaulted timestamp from the application clock, so say it explicitly.
        occurredAt: now,
        planCode: change.planCode,
        reason,
        resultingStatus: change.status,
        source: input.source === "admin" ? BillingAccessSource.admin : BillingAccessSource.payment,
        startsAt: change.startsAt,
        studentId: input.studentId,
      },
      select: EVENT_SELECT,
    });

    await tx.auditLog.create({
      data: {
        action: `billing.access.${kind}`,
        actorUserId: input.actorUserId,
        metadata: {
          endsAt: change.endsAt?.toISOString() ?? null,
          eventId: event.id,
          idempotencyKey: input.idempotencyKey,
          planCode: change.planCode,
          reason,
          resultingStatus: change.status,
          source: input.source,
          startsAt: change.startsAt?.toISOString() ?? null,
        },
        targetId: input.studentId,
        targetType: "student",
      },
    });

    return {
      event,
      outcome: "applied" as const,
      state: deriveAccessState(
        { endsAt: change.endsAt, planCode: change.planCode, startsAt: change.startsAt, status: change.status },
        now,
      ),
    };
  }
}

function requirePlan(plan: unknown): AccessPlan {
  if (!isAccessPlan(plan)) throw new BillingAccessError("unknown_plan", "That plan does not exist.");
  return plan;
}

function fullEnd(plan: AccessPlan, now: Date, env: Env) {
  const target = ACCESS_PLANS[plan].fullTarget;
  if (!target) return null;

  const endsAt = getFullAccessEndsAt(target, env);
  if (!endsAt) throw new BillingAccessError("full_end_not_configured", "The Full Access end date is not set.");
  if (endsAt.getTime() <= now.getTime()) throw new BillingAccessError("full_end_passed", "The Full Access end date has passed.");
  return endsAt;
}

/**
 * Starts access for a student who has none (never had it, it ran out, or it was
 * revoked). Monthly runs one calendar month from now. Full Access runs to the
 * date set for its exam target.
 */
async function grantAccess(input: PlanOperationInput) {
  const plan = requirePlan(input.plan);
  const env = input.env ?? process.env;

  return transition(input, BillingAccessEventKind.grant, (_account, state, now) => {
    if (state.status === "active") throw new BillingAccessError("already_active", "The student already has access; extend it instead.");
    if (state.status === "paused") throw new BillingAccessError("paused", "Access is paused; resume it instead.");

    const endsAt = fullEnd(plan, now, env) ?? addCalendarMonths(now, 1);
    return { change: { endsAt, planCode: plan, startsAt: now, status: BillingStatus.active }, kind: "apply" };
  });
}

/**
 * Adds time to access that is running (or has just run out). Monthly adds one
 * calendar month to the current end date while access is still active, and to
 * today when it is not. Full Access moves the end to its configured date.
 */
async function extendAccess(input: PlanOperationInput) {
  const plan = requirePlan(input.plan);
  const env = input.env ?? process.env;

  return transition(input, BillingAccessEventKind.extend, (_account, state, now) => {
    if (state.status === "none") throw new BillingAccessError("no_access", "The student has no access to extend; grant it instead.");
    if (state.status === "revoked") throw new BillingAccessError("revoked", "Access was revoked; grant it again instead.");
    if (state.status === "paused") throw new BillingAccessError("paused", "Access is paused; resume it first.");

    const running = state.status === "active" && state.endsAt !== null;
    const startsAt = running ? (state.startsAt as Date) : now;
    const full = fullEnd(plan, now, env);
    let endsAt: Date;

    if (full) {
      if (running && (state.endsAt as Date).getTime() >= full.getTime()) {
        throw new BillingAccessError("nothing_to_extend", "Access already runs to or past that date.");
      }
      endsAt = full;
    } else {
      endsAt = addCalendarMonths(running ? (state.endsAt as Date) : now, 1);
    }

    return { change: { endsAt, planCode: plan, startsAt, status: BillingStatus.active }, kind: "apply" };
  });
}

/**
 * The access a payment buys, inside the transaction that accepts the payment
 * (key `order:<order id>`, source `payment`).
 *
 * - Monthly: one calendar month from the current end while access is running,
 *   otherwise from now. If Full Access is running it keeps its plan and gains
 *   the month after its end, so nobody loses what they paid for (checkout
 *   refuses this combination; this only covers a Full Access bought while the
 *   Monthly payment was open).
 * - Full Access: runs to the configured exam date, or keeps a later end the
 *   account already has.
 *
 * A grant that cannot happen (paused access, no Full Access date, an unknown
 * student) throws a `BillingAccessError` before anything is written, so the
 * caller can keep the payment and leave delivery pending. Repeating the call
 * with the same order returns the first result.
 */
async function grantPaidAccess(
  tx: Prisma.TransactionClient,
  input: { env?: Env; orderId: string; plan: AccessPlan; studentId: string },
) {
  const plan = requirePlan(input.plan);
  const env = input.env ?? process.env;

  return runTransition(
    tx,
    {
      actorUserId: null,
      idempotencyKey: `order:${input.orderId}`,
      reason: `Pembayaran pesanan ${input.orderId}`,
      source: "payment",
      studentId: input.studentId,
    },
    (state) => (state.status === "active" ? BillingAccessEventKind.extend : BillingAccessEventKind.grant),
    (account, state, now) => {
      if (state.status === "paused") throw new BillingAccessError("paused", "Access is paused; the payment is kept and delivery waits.");

      const running = state.status === "active" && state.endsAt !== null;
      const startsAt = running ? (state.startsAt as Date) : now;
      const full = fullEnd(plan, now, env);

      if (full) {
        const endsAt = running && (state.endsAt as Date).getTime() > full.getTime() ? (state.endsAt as Date) : full;
        return { change: { endsAt, planCode: plan, startsAt, status: BillingStatus.active }, kind: "apply" };
      }

      const keepsPlan = running && typeof state.planCode === "string" && state.planCode.startsWith("full_");
      return {
        change: {
          endsAt: addCalendarMonths(running ? (state.endsAt as Date) : now, 1),
          planCode: keepsPlan ? state.planCode : plan,
          startsAt,
          status: BillingStatus.active,
        },
        kind: "apply",
      };
    },
  );
}

/** Whether the student has Full Access running right now. Used to refuse a Monthly checkout. */
async function hasActiveFullAccess(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  studentId: string,
) {
  const rows = await db.$queryRaw<Array<{ active: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM billing_accounts
      WHERE student_id = ${studentId}::uuid
        AND status = 'active'
        AND starts_with(plan_code, 'full_')
        AND access_starts_at <= now()
        AND access_expires_at > now()
    ) AS active
  `;
  return rows[0]?.active === true;
}

const decideRevoke: (account: AccountRow, state: AccessState, now: Date) => Decision = (account, state, now) => {
  if (state.status === "revoked") return { kind: "unchanged" };
  if (account.status === BillingStatus.trial) return { kind: "unchanged" };

  const endsAt = account.access_expires_at && account.access_expires_at.getTime() < now.getTime()
    ? account.access_expires_at
    : now;
  return {
    change: {
      endsAt,
      planCode: account.plan_code,
      startsAt: account.access_starts_at && account.access_starts_at.getTime() > endsAt.getTime() ? endsAt : account.access_starts_at,
      status: BillingStatus.cancelled,
    },
    kind: "apply",
  };
};

const decidePause: (account: AccountRow, state: AccessState) => Decision = (account, state) => {
  if (state.status === "paused") return { kind: "unchanged" };
  if (state.status !== "active") throw new BillingAccessError("not_active", "Only running access can be paused.");

  return {
    change: {
      endsAt: account.access_expires_at,
      planCode: account.plan_code,
      startsAt: account.access_starts_at,
      status: BillingStatus.suspended,
    },
    kind: "apply",
  };
};

const decideResume: (account: AccountRow, state: AccessState, now: Date) => Decision = (account, state, now) => {
  if (state.status !== "paused") return { kind: "unchanged" };

  const ended = account.access_expires_at !== null && account.access_expires_at.getTime() <= now.getTime();
  return {
    change: {
      endsAt: account.access_expires_at,
      planCode: account.plan_code,
      startsAt: account.access_starts_at,
      status: ended ? BillingStatus.expired : BillingStatus.active,
    },
    kind: "apply",
  };
};

/**
 * Ends access immediately (a full refund). History, results and everything the
 * student produced stay; only access stops. Revoking a revoked account is a no-op.
 */
async function revokeAccess(input: OperationInput) {
  return transition(input, BillingAccessEventKind.revoke, decideRevoke);
}

/** `revokeAccess` inside a transaction the caller owns, so it commits with the refund that caused it. */
async function revokeAccessInTx(tx: Prisma.TransactionClient, input: OperationInput) {
  return runTransition(tx, input, BillingAccessEventKind.revoke, decideRevoke);
}

/** Holds access while a dispute is open. The end date does not move. Pausing a paused account is a no-op. */
async function pauseAccess(input: OperationInput) {
  return transition(input, BillingAccessEventKind.pause, decidePause);
}

/** `pauseAccess` inside a transaction the caller owns. */
async function pauseAccessInTx(tx: Prisma.TransactionClient, input: OperationInput) {
  return runTransition(tx, input, BillingAccessEventKind.pause, decidePause);
}

/** Lifts a pause. If the end date passed while paused, access is simply expired. */
async function resumeAccess(input: OperationInput) {
  return transition(input, BillingAccessEventKind.resume, decideResume);
}

/** `resumeAccess` inside a transaction the caller owns. */
async function resumeAccessInTx(tx: Prisma.TransactionClient, input: OperationInput) {
  return runTransition(tx, input, BillingAccessEventKind.resume, decideResume);
}

/** Whether a student has running paid access. Uses the database clock unless `now` is given. */
async function hasPaidAccess(studentId: string, now?: Date) {
  const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM billing_accounts
      WHERE student_id = ${studentId}::uuid
        AND status = 'active'
        AND access_starts_at IS NOT NULL
        AND access_expires_at IS NOT NULL
        AND access_starts_at <= COALESCE(${now ?? null}::timestamptz, now())
        AND access_expires_at > COALESCE(${now ?? null}::timestamptz, now())
    ) AS allowed
  `;
  return rows[0]?.allowed === true;
}

async function getAccessState(studentId: string, now?: Date): Promise<AccessState> {
  const rows = await prisma.$queryRaw<Array<AccountRow & { database_now: Date }>>`
    SELECT id, status, plan_code, access_starts_at, access_expires_at, now() AS database_now
    FROM billing_accounts
    WHERE student_id = ${studentId}::uuid
  `;
  const row = rows[0];
  return row ? stateFromRow(row, now ?? row.database_now) : { ...NO_ACCESS };
}

type AccessHistoryItem = AccessEvent & {
  actorName: string | null;
  source: BillingAccessSource;
};

/** Newest first, for the admin student page. */
async function listAccessHistory(studentId: string, limit = 10): Promise<AccessHistoryItem[]> {
  const rows = await prisma.billingAccessEvent.findMany({
    orderBy: { occurredAt: "desc" },
    select: { ...EVENT_SELECT, actor: { select: { fullName: true } }, source: true },
    take: limit,
    where: { studentId },
  });

  return rows.map(({ actor, ...event }) => ({ ...event, actorName: actor?.fullName ?? null }));
}

export {
  BillingAccessError,
  deriveAccessState,
  extendAccess,
  getAccessState,
  grantAccess,
  grantPaidAccess,
  hasActiveFullAccess,
  hasPaidAccess,
  listAccessHistory,
  pauseAccess,
  pauseAccessInTx,
  resumeAccess,
  resumeAccessInTx,
  revokeAccess,
  revokeAccessInTx,
};
export type {
  AccessEvent,
  AccessHistoryItem,
  AccessState,
  AccessStatus,
  BillingAccessErrorCode,
  OperationInput,
  OperationResult,
  PlanOperationInput,
};

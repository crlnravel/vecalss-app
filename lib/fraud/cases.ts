import "server-only";

import { prisma } from "@/lib/prisma";

import { writeFraudAudit, type Tx } from "./audit";
import { getFraudOwnerEmail, requireReason, type AdminContext, type OwnerContext } from "./authority";
import {
  FRAUD_RULE_VERSION,
  FRAUD_SIGNALS,
  isClosureReasonCode,
  type ClosureReasonCode,
  type FraudSignal,
  type Severity,
} from "./constants";
import { FraudConflictError, FraudValidationError } from "./errors";

type CaseState = "acknowledged" | "closed" | "escalated" | "open";
type CaseActor = { kind: "admin" | "owner"; userId: string } | { kind: "system" };

type OpenCaseInput = {
  /** Ids, codes and counts only: never a raw email, phone, IP or device value. */
  evidence: Record<string, unknown>;
  orderId?: string | null;
  paymentEventId?: string | null;
  policyVersion?: number | null;
  severity?: Severity;
  signal: FraudSignal;
  /** The id or lookup token the case is about; with the signal, it is the dedupe key. */
  subjectKey: string;
  subjectType: "block" | "device" | "event" | "ip" | "order" | "system" | "user";
  userId?: string | null;
};

/** The owner's account id, when FRAUD_OWNER_EMAIL names one that exists. */
async function findOwnerUserId(tx: Tx) {
  const email = getFraudOwnerEmail();
  if (!email) return null;

  const [row = null] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1`;
  return row?.id ?? null;
}

async function insertCaseEvent(
  tx: Tx,
  input: {
    actor: CaseActor;
    caseId: string;
    caseVersion: number;
    kind: string;
    metadata?: Record<string, unknown>;
    note?: string | null;
  },
) {
  const [{ id }] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO fraud_case_events (case_id, case_version, kind, actor_user_id, actor_kind, note, metadata)
    VALUES (
      ${input.caseId}::uuid, ${input.caseVersion}, ${input.kind},
      ${input.actor.kind === "system" ? null : input.actor.userId}::uuid, ${input.actor.kind},
      ${input.note ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    RETURNING id
  `;
  return id;
}

/**
 * Opens a case for a signal and subject, or adds a hit to the one that is
 * already open (deduped per signal and subject until it is closed). Runs in the
 * caller's transaction, so a case commits or rolls back with the event that
 * raised it. Never reads or writes a raw identifier.
 */
async function openFraudCase(tx: Tx, input: OpenCaseInput) {
  const severity = input.severity ?? FRAUD_SIGNALS[input.signal].severity;
  const ownerUserId = await findOwnerUserId(tx);

  const [row] = await tx.$queryRaw<Array<{ created: boolean; id: string; version: number }>>`
    INSERT INTO fraud_cases (
      signal, subject_type, subject_key, severity, rule_version, policy_version,
      owner_user_id, user_id, order_id, payment_event_id, evidence
    )
    VALUES (
      ${input.signal}, ${input.subjectType}, ${input.subjectKey}, ${severity}::fraud_severity,
      ${FRAUD_RULE_VERSION}, ${input.policyVersion ?? null}, ${ownerUserId}::uuid,
      ${input.userId ?? null}::uuid, ${input.orderId ?? null}::uuid, ${input.paymentEventId ?? null}::uuid,
      ${JSON.stringify(input.evidence)}::jsonb
    )
    ON CONFLICT (signal, subject_key) WHERE state <> 'closed' DO UPDATE SET
      hit_count = fraud_cases.hit_count + 1,
      last_seen_at = now(),
      severity = GREATEST(fraud_cases.severity, EXCLUDED.severity),
      evidence = fraud_cases.evidence || EXCLUDED.evidence,
      updated_at = now()
    RETURNING id, version, (xmax = 0) AS created
  `;

  await insertCaseEvent(tx, {
    actor: { kind: "system" },
    caseId: row.id,
    caseVersion: row.version,
    kind: row.created ? "opened" : "hit",
    metadata: input.evidence,
  });
  if (row.created) {
    await writeFraudAudit(tx, {
      action: "fraud.case.opened",
      metadata: { severity, signal: input.signal, subjectType: input.subjectType },
      targetId: row.id,
      targetType: "fraud_case",
    });
  }

  return { created: row.created, id: row.id };
}

type LockedCase = { id: string; state: CaseState; version: number };

async function lockCase(tx: Tx, caseId: string, expectedVersion: number): Promise<LockedCase> {
  const [row = null] = await tx.$queryRaw<LockedCase[]>`
    SELECT id, state::text AS state, version FROM fraud_cases WHERE id = ${caseId}::uuid FOR UPDATE
  `;
  if (!row) throw new FraudValidationError("not_found", "The case could not be found.");
  if (row.version !== expectedVersion) {
    throw new FraudConflictError("stale_version", "The case was changed by someone else. Reload it and try again.");
  }
  return row;
}

type StepInput = {
  actor: Exclude<CaseActor, { kind: "system" }>;
  caseId: string;
  expectedVersion: number;
  note: string;
};

/**
 * One step of a case's life, in the caller's transaction: lock the row, check
 * the version the caller saw, write the history row first, then move the case
 * (the database refuses a move that has no history row behind it).
 */
async function stepCase(
  tx: Tx,
  input: StepInput & { closureReason?: ClosureReasonCode; to: CaseState },
) {
  const current = await lockCase(tx, input.caseId, input.expectedVersion);

  const allowed: Record<CaseState, CaseState[]> = {
    acknowledged: ["escalated", "closed"],
    closed: ["open"],
    escalated: ["closed"],
    open: ["acknowledged", "escalated", "closed"],
  };
  if (!allowed[current.state].includes(input.to)) {
    throw new FraudConflictError("wrong_state", `A ${current.state} case cannot become ${input.to}.`);
  }

  if (input.to === "open") {
    // Only one case per signal and subject may be open. If the signal came back
    // and opened a newer case, that one carries the work forward.
    const [other = null] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT n.id FROM fraud_cases n JOIN fraud_cases c ON c.id = ${input.caseId}::uuid
      WHERE n.signal = c.signal AND n.subject_key = c.subject_key AND n.state <> 'closed' AND n.id <> c.id
      LIMIT 1
    `;
    if (other) {
      throw new FraudConflictError("wrong_state", "A newer case for the same signal is already open. Use that one.");
    }
  }

  const kind = input.to === "open" ? "reopened" : input.to;
  const nextVersion = current.version + 1;
  const eventId = await insertCaseEvent(tx, {
    actor: input.actor,
    caseId: input.caseId,
    caseVersion: nextVersion,
    kind,
    metadata: input.closureReason ? { closureReason: input.closureReason } : {},
    note: input.note,
  });

  if (input.to === "acknowledged") {
    await tx.$executeRaw`
      UPDATE fraud_cases SET state = 'acknowledged', version = ${nextVersion}, last_event_id = ${eventId}::uuid,
        acknowledged_at = now(), updated_at = now()
      WHERE id = ${input.caseId}::uuid
    `;
  } else if (input.to === "escalated") {
    await tx.$executeRaw`
      UPDATE fraud_cases SET state = 'escalated', version = ${nextVersion}, last_event_id = ${eventId}::uuid,
        escalated_at = now(), updated_at = now()
      WHERE id = ${input.caseId}::uuid
    `;
  } else if (input.to === "closed") {
    await tx.$executeRaw`
      UPDATE fraud_cases SET state = 'closed', version = ${nextVersion}, last_event_id = ${eventId}::uuid,
        closed_at = now(), closure_reason = ${input.closureReason}, updated_at = now()
      WHERE id = ${input.caseId}::uuid
    `;
  } else {
    await tx.$executeRaw`
      UPDATE fraud_cases SET state = 'open', version = ${nextVersion}, last_event_id = ${eventId}::uuid,
        acknowledged_at = NULL, escalated_at = NULL, closed_at = NULL, closure_reason = NULL, updated_at = now()
      WHERE id = ${input.caseId}::uuid
    `;
  }

  await writeFraudAudit(tx, {
    actorUserId: input.actor.userId,
    action: `fraud.case.${kind}`,
    metadata: { closureReason: input.closureReason ?? null, fromState: current.state, version: nextVersion },
    targetId: input.caseId,
    targetType: "fraud_case",
  });

  return nextVersion;
}

type CaseCommand = { caseId: string; expectedVersion: number; reason: string };

/** Any verified admin may acknowledge an open case. */
async function acknowledgeCase(admin: AdminContext, command: CaseCommand) {
  const note = requireReason(command.reason);
  const kind = admin.email === getFraudOwnerEmail() ? "owner" : "admin";

  return prisma.$transaction((tx) =>
    stepCase(tx, { actor: { kind, userId: admin.userId }, caseId: command.caseId, expectedVersion: command.expectedVersion, note, to: "acknowledged" }),
  );
}

async function escalateCase(owner: OwnerContext, command: CaseCommand) {
  const note = requireReason(command.reason);

  return prisma.$transaction((tx) =>
    stepCase(tx, { actor: { kind: "owner", userId: owner.userId }, caseId: command.caseId, expectedVersion: command.expectedVersion, note, to: "escalated" }),
  );
}

async function closeCase(owner: OwnerContext, command: CaseCommand & { closureReason: string }) {
  const note = requireReason(command.reason);
  if (!isClosureReasonCode(command.closureReason)) {
    throw new FraudValidationError("invalid_reason", "Choose why the case is closed.");
  }
  const closureReason = command.closureReason;

  return prisma.$transaction((tx) =>
    stepCase(tx, { actor: { kind: "owner", userId: owner.userId }, caseId: command.caseId, closureReason, expectedVersion: command.expectedVersion, note, to: "closed" }),
  );
}

/** New evidence reopens a closed case. The reason says what the new evidence is. */
async function reopenCase(owner: OwnerContext, command: CaseCommand) {
  const note = requireReason(command.reason);

  return prisma.$transaction((tx) =>
    stepCase(tx, { actor: { kind: "owner", userId: owner.userId }, caseId: command.caseId, expectedVersion: command.expectedVersion, note, to: "open" }),
  );
}

/** Records that a block belongs to a case. Idempotent; writes a history row the first time. */
async function linkBlockToCaseInTx(tx: Tx, input: { actorUserId: string | null; blockId: string; caseId: string }) {
  const linked = await tx.$executeRaw`
    INSERT INTO fraud_case_blocks (case_id, block_id, linked_by_user_id)
    VALUES (${input.caseId}::uuid, ${input.blockId}::uuid, ${input.actorUserId}::uuid)
    ON CONFLICT (case_id, block_id) DO NOTHING
  `;
  if (linked === 0) return false;

  const [row = null] = await tx.$queryRaw<Array<{ version: number }>>`SELECT version FROM fraud_cases WHERE id = ${input.caseId}::uuid`;
  if (!row) throw new FraudValidationError("not_found", "The case could not be found.");

  await insertCaseEvent(tx, {
    actor: input.actorUserId ? { kind: "owner", userId: input.actorUserId } : { kind: "system" },
    caseId: input.caseId,
    caseVersion: row.version,
    kind: "block_linked",
    metadata: { blockId: input.blockId },
  });
  return true;
}

/** Links an existing block to a case. */
async function linkBlockToCase(owner: OwnerContext, input: { blockId: string; caseId: string }) {
  return prisma.$transaction(async (tx) => {
    const linked = await linkBlockToCaseInTx(tx, { actorUserId: owner.userId, ...input });
    if (linked) {
      await writeFraudAudit(tx, {
        action: "fraud.case.block_linked",
        actorUserId: owner.userId,
        metadata: { blockId: input.blockId },
        targetId: input.caseId,
        targetType: "fraud_case",
      });
    }
    return linked;
  });
}

export {
  acknowledgeCase,
  closeCase,
  escalateCase,
  findOwnerUserId,
  insertCaseEvent,
  linkBlockToCase,
  linkBlockToCaseInTx,
  openFraudCase,
  reopenCase,
  stepCase,
};
export type { CaseActor, CaseState, OpenCaseInput };

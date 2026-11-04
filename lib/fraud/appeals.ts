import "server-only";

import { prisma } from "@/lib/prisma";

import { writeFraudAudit, type Tx } from "./audit";
import { requireReason, type OwnerContext } from "./authority";
import { liftBlockInTx, lockBlock } from "./blocks";
import { insertCaseEvent, linkBlockToCaseInTx, openFraudCase, stepCase } from "./cases";
import { APPEAL_WORKING_DAYS } from "./constants";
import { FraudConflictError, FraudValidationError } from "./errors";

/**
 * Appeals. One per block: the buyer reaches support through the contact on the
 * blocked screen, and the owner records what was said here. The owner decides
 * within three working days. A denied appeal can be reopened when new evidence
 * arrives. Everything is written to the block's case as well, so the case holds
 * the whole story.
 */

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Adds working days (Monday to Friday, Asia/Jakarta). No holiday list: a public
 * holiday counts as a working day, which only makes the deadline stricter.
 * `start` should be a database timestamp.
 */
function addWorkingDays(start: Date, days: number) {
  const local = new Date(start.getTime() + JAKARTA_OFFSET_MS);
  let remaining = days;
  while (remaining > 0) {
    local.setUTCDate(local.getUTCDate() + 1);
    const weekday = local.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return new Date(local.getTime() - JAKARTA_OFFSET_MS);
}

async function databaseNow(tx: Tx) {
  const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return now;
}

type FileAppealInput = {
  blockId: string;
  channel: string;
  expectedBlockVersion: number;
  summary: string;
};

/** Records an appeal against a block that is in force. One per block, ever. */
async function fileAppeal(owner: OwnerContext, input: FileAppealInput) {
  const summary = requireReason(input.summary);
  const channel = input.channel.trim().slice(0, 30);
  if (!channel) throw new FraudValidationError("invalid_reason", "Say how the appeal was received.");

  return prisma.$transaction(async (tx) => {
    const block = await lockBlock(tx, input.blockId, input.expectedBlockVersion);
    if (block.lapsed) throw new FraudConflictError("not_in_force", "This block has already lapsed, so there is nothing to appeal.");

    const [existing = null] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM fraud_appeals WHERE block_id = ${block.id}::uuid`;
    if (existing) throw new FraudConflictError("appeal_exists", "This block already has an appeal.");

    const opened = await openFraudCase(tx, {
      evidence: { blockId: block.id, blockType: block.blockType },
      subjectKey: `block:${block.id}`,
      subjectType: "block",
      signal: "block_appeal",
      userId: block.subjectUserId,
    });
    await linkBlockToCaseInTx(tx, { actorUserId: owner.userId, blockId: block.id, caseId: opened.id });

    const dueAt = addWorkingDays(await databaseNow(tx), APPEAL_WORKING_DAYS);
    const [appeal] = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO fraud_appeals (block_id, case_id, channel, summary, due_at)
      VALUES (${block.id}::uuid, ${opened.id}::uuid, ${channel}, ${summary}, ${dueAt})
      RETURNING id
    `;
    const [caseRow] = await tx.$queryRaw<Array<{ version: number }>>`SELECT version FROM fraud_cases WHERE id = ${opened.id}::uuid`;
    await insertCaseEvent(tx, {
      actor: { kind: "owner", userId: owner.userId },
      caseId: opened.id,
      caseVersion: caseRow.version,
      kind: "appeal_filed",
      metadata: { appealId: appeal.id, channel },
      note: summary,
    });
    await writeFraudAudit(tx, {
      action: "fraud.appeal.filed",
      actorUserId: owner.userId,
      metadata: { blockId: block.id, caseId: opened.id, channel },
      targetId: appeal.id,
      targetType: "fraud_appeal",
    });

    return { appealId: appeal.id, caseId: opened.id, dueAt };
  }, { maxWait: 10_000, timeout: 20_000 });
}

type LockedAppeal = { blockId: string; caseId: string; state: "denied" | "granted" | "pending"; version: number };

async function lockAppeal(tx: Tx, appealId: string, expectedVersion: number): Promise<LockedAppeal> {
  const [row = null] = await tx.$queryRaw<LockedAppeal[]>`
    SELECT block_id AS "blockId", case_id AS "caseId", state::text AS state, version
    FROM fraud_appeals WHERE id = ${appealId}::uuid FOR UPDATE
  `;
  if (!row) throw new FraudValidationError("not_found", "The appeal could not be found.");
  if (row.version !== expectedVersion) {
    throw new FraudConflictError("stale_version", "The appeal was changed by someone else. Reload it and try again.");
  }
  return row;
}

type DecideAppealInput = {
  appealId: string;
  decision: "denied" | "granted";
  expectedVersion: number;
  reason: string;
};

/** The owner's decision, with a written reason. Granting an appeal lifts the block in the same transaction. */
async function decideAppeal(owner: OwnerContext, input: DecideAppealInput) {
  const reason = requireReason(input.reason);

  return prisma.$transaction(async (tx) => {
    const appeal = await lockAppeal(tx, input.appealId, input.expectedVersion);
    if (appeal.state !== "pending") throw new FraudConflictError("wrong_state", `This appeal is already ${appeal.state}.`);

    if (input.decision === "granted") {
      const [block] = await tx.$queryRaw<Array<{ version: number }>>`SELECT version FROM fraud_blocks WHERE id = ${appeal.blockId}::uuid`;
      await liftBlockInTx(tx, owner, { blockId: appeal.blockId, expectedVersion: block.version, reason: `Banding dikabulkan: ${reason}` }, { appealId: input.appealId });
    }

    const version = appeal.version + 1;
    await tx.$executeRaw`
      UPDATE fraud_appeals
      SET state = ${input.decision}::fraud_appeal_state, decided_at = now(), decision_reason = ${reason}, version = ${version}
      WHERE id = ${input.appealId}::uuid
    `;
    const [caseRow] = await tx.$queryRaw<Array<{ version: number }>>`SELECT version FROM fraud_cases WHERE id = ${appeal.caseId}::uuid`;
    await insertCaseEvent(tx, {
      actor: { kind: "owner", userId: owner.userId },
      caseId: appeal.caseId,
      caseVersion: caseRow.version,
      kind: "appeal_decided",
      metadata: { appealId: input.appealId, decision: input.decision },
      note: reason,
    });
    await writeFraudAudit(tx, {
      action: "fraud.appeal.decided",
      actorUserId: owner.userId,
      metadata: { blockId: appeal.blockId, decision: input.decision, version },
      targetId: input.appealId,
      targetType: "fraud_appeal",
    });

    return { version };
  }, { maxWait: 10_000, timeout: 20_000 });
}

/** New evidence on a denied appeal: it goes back to pending with a new deadline, and its case is reopened if closed. */
async function reopenAppeal(owner: OwnerContext, input: { appealId: string; expectedVersion: number; reason: string }) {
  const reason = requireReason(input.reason);

  return prisma.$transaction(async (tx) => {
    const appeal = await lockAppeal(tx, input.appealId, input.expectedVersion);
    if (appeal.state !== "denied") throw new FraudConflictError("wrong_state", "Only a denied appeal can be reopened.");

    const [block] = await tx.$queryRaw<Array<{ inForce: boolean }>>`
      SELECT (status = 'active' AND (expires_at IS NULL OR expires_at > clock_timestamp())) AS "inForce"
      FROM fraud_blocks WHERE id = ${appeal.blockId}::uuid
    `;
    if (!block.inForce) throw new FraudConflictError("not_in_force", "The block has already ended, so there is nothing to reopen.");

    const dueAt = addWorkingDays(await databaseNow(tx), APPEAL_WORKING_DAYS);
    const version = appeal.version + 1;
    await tx.$executeRaw`
      UPDATE fraud_appeals
      SET state = 'pending', decided_at = NULL, decision_reason = NULL, reopen_count = reopen_count + 1,
          due_at = ${dueAt}, version = ${version}
      WHERE id = ${input.appealId}::uuid
    `;

    const [caseRow] = await tx.$queryRaw<Array<{ state: string; version: number }>>`
      SELECT state::text AS state, version FROM fraud_cases WHERE id = ${appeal.caseId}::uuid
    `;
    let caseVersion = caseRow.version;
    if (caseRow.state === "closed") {
      caseVersion = await stepCase(tx, {
        actor: { kind: "owner", userId: owner.userId },
        caseId: appeal.caseId,
        expectedVersion: caseRow.version,
        note: reason,
        to: "open",
      });
    }
    await insertCaseEvent(tx, {
      actor: { kind: "owner", userId: owner.userId },
      caseId: appeal.caseId,
      caseVersion,
      kind: "appeal_reopened",
      metadata: { appealId: input.appealId },
      note: reason,
    });
    await writeFraudAudit(tx, {
      action: "fraud.appeal.reopened",
      actorUserId: owner.userId,
      metadata: { blockId: appeal.blockId, version },
      targetId: input.appealId,
      targetType: "fraud_appeal",
    });

    return { version };
  }, { maxWait: 10_000, timeout: 20_000 });
}

export { addWorkingDays, decideAppeal, fileAppeal, reopenAppeal };

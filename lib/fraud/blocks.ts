import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { applyAccountDeactivation, applyAccountReactivation } from "@/lib/admin/enrollment/account-state";
import { lockAccount } from "@/lib/payments/risk/account-lock";
import { prisma } from "@/lib/prisma";

import { writeFraudAudit, type Tx } from "./audit";
import { requireReason, type OwnerContext } from "./authority";
import { findOwnerUserId, linkBlockToCaseInTx } from "./cases";
import {
  MAX_BLOCK_DAYS,
  REVIEW_INTERVAL_DAYS,
  type BlockReasonCode,
  type FraudBlockType,
} from "./constants";
import { FraudConflictError, FraudValidationError } from "./errors";
import { hintFor, lookupToken, normalizeEmailValue, normalizeIdentifier, tokenFor } from "./tokens";

/**
 * Typed fraud blocks. A block is "in force" when it is active and its end date,
 * if it has one, is still ahead of the database clock. That is decided at read
 * time, so a block lapses on schedule even when no job ever runs; marking it
 * `expired` afterwards is housekeeping and changes nothing about the answer.
 */

type Identifier = { token: string; type: FraudBlockType };

type CheckSubject = {
  /** The raw device cookie value, if the request carried one. */
  deviceToken?: string | null;
  email?: string | null;
  ip?: string | null;
  phone?: string | null;
  userId?: string | null;
};

type BlockMatch = { id: string; source: "automatic" | "manual"; type: FraudBlockType };

type BlockCheck = {
  blocked: boolean;
  /** The device lookup token for the request, for recording on an order. Null without a valid cookie. */
  deviceLookupToken: string | null;
  matches: BlockMatch[];
};

function lockKey(identifier: Identifier) {
  return `fraud:${identifier.type}:${identifier.token}`;
}

/** Shared while a checkout reads blocks, exclusive while a block is created or changed. */
async function lockIdentifiers(tx: Tx, identifiers: Identifier[], mode: "exclusive" | "shared") {
  const keys = [...new Set(identifiers.map(lockKey))].sort();
  for (const key of keys) {
    if (mode === "shared") {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`;
    } else {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    }
  }
}

async function resolveIdentifiers(tx: Tx, subject: CheckSubject) {
  const identifiers: Identifier[] = [];
  let email = subject.email ?? null;
  let phone = subject.phone ?? null;

  if (subject.userId) {
    identifiers.push({ token: subject.userId.toLowerCase(), type: "account" });
    if (email === null || phone === null) {
      const [row = null] = await tx.$queryRaw<Array<{ email: string; phone: string | null }>>`
        SELECT email, phone FROM users WHERE id = ${subject.userId}::uuid
      `;
      email ??= row?.email ?? null;
      phone ??= row?.phone ?? null;
    }
  }

  const add = (type: Exclude<FraudBlockType, "account">, raw: string | null | undefined) => {
    const token = raw ? tokenFor(type, raw) : null;
    if (token) identifiers.push({ token, type });
  };
  add("email", email);
  add("phone", phone);
  add("device", subject.deviceToken);
  add("ip", subject.ip);

  return identifiers;
}

async function findInForce(tx: Tx, identifiers: Identifier[]): Promise<BlockMatch[]> {
  if (identifiers.length === 0) return [];

  return tx.$queryRaw<BlockMatch[]>`
    SELECT id, block_type::text AS type, source::text AS source
    FROM fraud_blocks
    WHERE status = 'active'
      AND (expires_at IS NULL OR expires_at > clock_timestamp())
      AND (block_type::text, lookup_token) IN (${Prisma.join(identifiers.map((item) => Prisma.sql`(${item.type}, ${item.token})`))})
  `;
}

/**
 * Looks the subject's identifiers up among the blocks in force. With `lock`, it
 * first takes a shared lock on each identifier, so a block being created for
 * one of them waits for this transaction to end (and this transaction waits for
 * a block that is mid-creation). Checkout and the paid-order check use it.
 * Throws FraudConfigError when the lookup secret is missing in production.
 */
async function checkBlocks(tx: Tx, subject: CheckSubject, options: { lock?: boolean } = {}): Promise<BlockCheck> {
  const identifiers = await resolveIdentifiers(tx, subject);
  if (options.lock) await lockIdentifiers(tx, identifiers, "shared");

  const matches = await findInForce(tx, identifiers);
  const device = identifiers.find((item) => item.type === "device");

  return { blocked: matches.length > 0, deviceLookupToken: device?.token ?? null, matches };
}

/** Checks the identifiers an order carries, with the buyer's account, email and phone. */
async function checkOrderBlocks(tx: Tx, orderId: string) {
  const [order = null] = await tx.$queryRaw<Array<{ buyerId: string; deviceLookupToken: string | null; ip: string | null }>>`
    SELECT buyer_id AS "buyerId", device_lookup_token AS "deviceLookupToken", host(buyer_ip) AS ip
    FROM payment_orders WHERE id = ${orderId}::uuid
  `;
  if (!order) return { blocked: false, deviceLookupToken: null, matches: [] } satisfies BlockCheck;

  const identifiers = await resolveIdentifiers(tx, { ip: order.ip, userId: order.buyerId });
  if (order.deviceLookupToken) identifiers.push({ token: order.deviceLookupToken, type: "device" });
  await lockIdentifiers(tx, identifiers, "shared");

  const matches = await findInForce(tx, identifiers);
  return { blocked: matches.length > 0, deviceLookupToken: order.deviceLookupToken, matches } satisfies BlockCheck;
}

// ---------------------------------------------------------------------------
// Creating, renewing, lifting
// ---------------------------------------------------------------------------

type BlockActor = { kind: "system" } | { kind: "owner"; owner: OwnerContext };

type CreateBlockInput = {
  caseId?: string | null;
  /** Device and IP blocks only: how many days. Defaults to the longest allowed. */
  days?: number;
  reason: string;
  reasonCode: BlockReasonCode;
  target:
    | { type: "account"; userId: string }
    | { type: Exclude<FraudBlockType, "account">; value: string }
    /** A device already seen only as its lookup token (an order keeps nothing else). */
    | { type: "device"; token: string };
};

type CreatedBlock = { id: string; linkedAccountBlockId: string | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function recordBlockEvent(
  tx: Tx,
  input: {
    actor: BlockActor;
    blockId: string;
    kind: "created" | "expired" | "lifted" | "renewed";
    fromExpiresAt?: Date | null;
    reason: string;
    toExpiresAt?: Date | null;
    version: number;
  },
) {
  const actorUserId = input.actor.kind === "owner" ? input.actor.owner.userId : null;
  const [{ id }] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO fraud_block_events (block_id, block_version, kind, actor_user_id, actor_kind, reason, from_expires_at, to_expires_at)
    VALUES (
      ${input.blockId}::uuid, ${input.version}, ${input.kind}, ${actorUserId}::uuid, ${input.actor.kind},
      ${input.reason}, ${input.fromExpiresAt ?? null}, ${input.toExpiresAt ?? null}
    )
    RETURNING id
  `;
  return id;
}

/** Accounts holding these roles are never blocked: a block would lock staff out of their own tools. */
async function assertAccountMayBeBlocked(tx: Tx, userId: string) {
  const [row = null] = await tx.$queryRaw<Array<{ privileged: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM role_assignments WHERE user_id = ${userId}::uuid AND revoked_at IS NULL AND role IN ('admin', 'developer')
    ) AS privileged
    FROM users WHERE id = ${userId}::uuid
  `;
  if (!row) throw new FraudValidationError("not_found", "The account could not be found.");
  if (row.privileged) throw new FraudValidationError("protected_account", "An admin or developer account cannot be blocked.");
}

async function markExpiredInTx(tx: Tx, block: { id: string; version: number; expiresAt: Date | null }) {
  const version = block.version + 1;
  const eventId = await recordBlockEvent(tx, {
    actor: { kind: "system" },
    blockId: block.id,
    fromExpiresAt: block.expiresAt,
    kind: "expired",
    reason: "The block reached its end date.",
    version,
  });
  await tx.$executeRaw`
    UPDATE fraud_blocks
    SET status = 'expired', version = ${version}, ended_at = now(), last_event_id = ${eventId}::uuid, updated_at = now()
    WHERE id = ${block.id}::uuid
  `;
  await writeFraudAudit(tx, {
    action: "fraud.block.expired",
    metadata: { version },
    targetId: block.id,
    targetType: "fraud_block",
  });
}

async function createBlockInTx(tx: Tx, actor: BlockActor, input: CreateBlockInput): Promise<CreatedBlock> {
  const source = actor.kind === "owner" ? "manual" : "automatic";
  const reason = actor.kind === "owner" ? requireReason(input.reason) : input.reason.trim();
  const type = input.target.type;

  let token: string;
  let hint: string;
  let subjectUserId: string | null = null;

  if (input.target.type === "account") {
    if (!UUID_PATTERN.test(input.target.userId)) throw new FraudValidationError("invalid_identifier", "The account id is not valid.");
    subjectUserId = input.target.userId.toLowerCase();
    token = subjectUserId;
    hint = hintFor("account", subjectUserId);
  } else if ("token" in input.target) {
    if (!/^[0-9a-f]{64}$/u.test(input.target.token)) throw new FraudValidationError("invalid_identifier", "The device token is not valid.");
    token = input.target.token;
    hint = hintFor("device", token);
  } else {
    const normalized = normalizeIdentifier(input.target.type, input.target.value);
    if (normalized === null) throw new FraudValidationError("invalid_identifier", "That value is not valid for this type of block.");
    token = lookupToken(input.target.type, normalized);
    hint = hintFor(input.target.type, input.target.type === "device" ? token : normalized);

    if (input.target.type === "email") {
      const [row = null] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE lower(email) = ${normalizeEmailValue(input.target.value)} LIMIT 1`;
      subjectUserId = row?.id ?? null;
    }
  }

  const maxDays = MAX_BLOCK_DAYS[type];
  const days = input.days ?? maxDays ?? undefined;
  if (maxDays !== null && (days === undefined || !Number.isInteger(days) || days < 1 || days > maxDays)) {
    throw new FraudValidationError("invalid_duration", `A ${type} block lasts 1 to ${maxDays} days.`);
  }

  // Lock order, always: the account's row, then the identifiers, then rows.
  if (subjectUserId) {
    await assertAccountMayBeBlocked(tx, subjectUserId);
    await lockAccount(tx, subjectUserId);
  }
  await lockIdentifiers(tx, [{ token, type }, ...(type === "email" && subjectUserId && source === "manual" ? [{ token: subjectUserId, type: "account" as const }] : [])], "exclusive");

  const [existing = null] = await tx.$queryRaw<Array<{ expiresAt: Date | null; id: string; lapsed: boolean; version: number }>>`
    SELECT id, version, expires_at AS "expiresAt", (expires_at IS NOT NULL AND expires_at <= clock_timestamp()) AS lapsed
    FROM fraud_blocks WHERE block_type = ${type}::fraud_block_type AND lookup_token = ${token} AND status = 'active'
    FOR UPDATE
  `;
  if (existing) {
    if (!existing.lapsed) throw new FraudConflictError("already_blocked", "This identifier is already blocked.");
    await markExpiredInTx(tx, existing);
  }

  let deactivated = false;
  if (type === "account" && source === "manual" && subjectUserId) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${subjectUserId}::uuid FOR UPDATE`;
    const [user = null] = await tx.$queryRaw<Array<{ status: string }>>`SELECT status::text AS status FROM users WHERE id = ${subjectUserId}::uuid`;
    if (user?.status === "active") {
      await applyAccountDeactivation(tx, subjectUserId, actor.kind === "owner" ? actor.owner.userId : null);
      deactivated = true;
    }
  }

  const expiresSql = source === "automatic"
    ? Prisma.sql`now() + interval '24 hours'`
    : days !== undefined ? Prisma.sql`now() + make_interval(days => ${days})` : Prisma.sql`NULL`;
  const reviewSql = source === "manual" && maxDays === null
    ? Prisma.sql`now() + make_interval(days => ${REVIEW_INTERVAL_DAYS})`
    : Prisma.sql`NULL`;
  const ownerUserId = await findOwnerUserId(tx);
  const createdBy = actor.kind === "owner" ? actor.owner.userId : null;

  const [created] = await tx.$queryRaw<Array<{ expiresAt: Date | null; id: string }>>`
    INSERT INTO fraud_blocks (
      block_type, lookup_token, hint, subject_user_id, source, reason_code, reason_note,
      owner_user_id, created_by_user_id, deactivated_account, expires_at, review_due_at
    )
    VALUES (
      ${type}::fraud_block_type, ${token}, ${hint}, ${subjectUserId}::uuid, ${source}::fraud_block_source,
      ${input.reasonCode}, ${reason}, ${ownerUserId}::uuid, ${createdBy}::uuid, ${deactivated},
      ${expiresSql}, ${reviewSql}
    )
    RETURNING id, expires_at AS "expiresAt"
  `;
  await recordBlockEvent(tx, { actor, blockId: created.id, kind: "created", reason, toExpiresAt: created.expiresAt, version: 1 });
  await writeFraudAudit(tx, {
    action: "fraud.block.created",
    actorUserId: createdBy,
    metadata: { deactivatedAccount: deactivated, reasonCode: input.reasonCode, source, type },
    targetId: created.id,
    targetType: "fraud_block",
  });
  if (input.caseId) {
    await linkBlockToCaseInTx(tx, { actorUserId: createdBy, blockId: created.id, caseId: input.caseId });
  }

  // An existing account behind a manual email block is treated as an account block.
  let linkedAccountBlockId: string | null = null;
  if (type === "email" && source === "manual" && subjectUserId) {
    const [alreadyBlocked] = await tx.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM fraud_blocks WHERE block_type = 'account' AND lookup_token = ${subjectUserId} AND status = 'active'
          AND (expires_at IS NULL OR expires_at > clock_timestamp())
      ) AS blocked
    `;
    if (!alreadyBlocked.blocked) {
      const linked = await createBlockInTx(tx, actor, {
        caseId: input.caseId,
        reason,
        reasonCode: input.reasonCode,
        target: { type: "account", userId: subjectUserId },
      });
      linkedAccountBlockId = linked.id;
    }
  }

  return { id: created.id, linkedAccountBlockId };
}

/** Owner only. The OwnerContext proves the caller passed the authority check. */
async function createManualBlock(owner: OwnerContext, input: CreateBlockInput) {
  return prisma.$transaction((tx) => createBlockInTx(tx, { kind: "owner", owner }, input), { maxWait: 10_000, timeout: 20_000 });
}

/**
 * The system's own block: 24 hours, pending review, never an account
 * deactivation. Used by the daily job, in its own transaction per block.
 */
async function createAutomaticBlock(tx: Tx, input: Omit<CreateBlockInput, "days">) {
  return createBlockInTx(tx, { kind: "system" }, input);
}

type LockedBlock = {
  blockType: FraudBlockType;
  deactivatedAccount: boolean;
  expiresAt: Date | null;
  id: string;
  lapsed: boolean;
  reviewDueAt: Date | null;
  status: "active" | "expired" | "lifted";
  subjectUserId: string | null;
  token: string;
  version: number;
};

/**
 * Takes the locks for a change to an existing block in the same order as
 * creation (account row, identifier, then the block row) and checks that the
 * caller saw the current version.
 */
async function lockBlock(tx: Tx, blockId: string, expectedVersion: number): Promise<LockedBlock> {
  const [peek = null] = await tx.$queryRaw<Array<{ blockType: FraudBlockType; subjectUserId: string | null; token: string }>>`
    SELECT block_type::text AS "blockType", subject_user_id AS "subjectUserId", lookup_token AS token
    FROM fraud_blocks WHERE id = ${blockId}::uuid
  `;
  if (!peek) throw new FraudValidationError("not_found", "The block could not be found.");

  if (peek.subjectUserId) await lockAccount(tx, peek.subjectUserId);
  await lockIdentifiers(tx, [{ token: peek.token, type: peek.blockType }], "exclusive");

  const [row] = await tx.$queryRaw<LockedBlock[]>`
    SELECT id, block_type::text AS "blockType", lookup_token AS token, subject_user_id AS "subjectUserId",
           status::text AS status, version, expires_at AS "expiresAt", review_due_at AS "reviewDueAt",
           deactivated_account AS "deactivatedAccount",
           (expires_at IS NOT NULL AND expires_at <= clock_timestamp()) AS lapsed
    FROM fraud_blocks WHERE id = ${blockId}::uuid FOR UPDATE
  `;
  if (row.version !== expectedVersion) {
    throw new FraudConflictError("stale_version", "The block was changed by someone else. Reload it and try again.");
  }
  if (row.status !== "active") {
    throw new FraudConflictError("wrong_state", `The block has already ${row.status === "lifted" ? "been lifted" : "expired"}.`);
  }
  return row;
}

type BlockCommand = { blockId: string; expectedVersion: number; reason: string };

async function liftBlockInTx(tx: Tx, owner: OwnerContext, command: BlockCommand, context: { appealId?: string } = {}) {
  const reason = requireReason(command.reason);
  const block = await lockBlock(tx, command.blockId, command.expectedVersion);
  const version = block.version + 1;

  const eventId = await recordBlockEvent(tx, {
    actor: { kind: "owner", owner },
    blockId: block.id,
    fromExpiresAt: block.expiresAt,
    kind: "lifted",
    reason,
    version,
  });
  await tx.$executeRaw`
    UPDATE fraud_blocks
    SET status = 'lifted', version = ${version}, ended_at = now(), last_event_id = ${eventId}::uuid, updated_at = now()
    WHERE id = ${block.id}::uuid
  `;

  // Only a block that itself disabled the account gives it back.
  let reactivated = false;
  if (block.deactivatedAccount && block.subjectUserId) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${block.subjectUserId}::uuid FOR UPDATE`;
    const [user] = await tx.$queryRaw<Array<{ status: string }>>`SELECT status::text AS status FROM users WHERE id = ${block.subjectUserId}::uuid`;
    if (user?.status === "disabled") {
      await applyAccountReactivation(tx, block.subjectUserId);
      reactivated = true;
    }
  }

  await writeFraudAudit(tx, {
    action: "fraud.block.lifted",
    actorUserId: owner.userId,
    metadata: { appealId: context.appealId ?? null, reactivatedAccount: reactivated, type: block.blockType, version },
    targetId: block.id,
    targetType: "fraud_block",
  });

  return { reactivated, version };
}

async function liftBlock(owner: OwnerContext, command: BlockCommand) {
  return prisma.$transaction((tx) => liftBlockInTx(tx, owner, command), { maxWait: 10_000, timeout: 20_000 });
}

/**
 * Renewal needs a fresh written reason. A block that has already lapsed is not
 * renewed: the owner creates a new one, so the history shows a gap honestly.
 * Account, email and phone blocks have no end date, so renewing one starts
 * another 30-day review; a device or IP block gets its longest allowed length
 * (or `days`) counted from now.
 */
async function renewBlock(owner: OwnerContext, command: BlockCommand & { days?: number }) {
  const reason = requireReason(command.reason);

  return prisma.$transaction(async (tx) => {
    const block = await lockBlock(tx, command.blockId, command.expectedVersion);
    if (block.lapsed) {
      throw new FraudConflictError("not_in_force", "This block has already lapsed. Create a new block instead.");
    }

    const maxDays = MAX_BLOCK_DAYS[block.blockType];
    const days = command.days ?? maxDays ?? undefined;
    if (maxDays !== null && (days === undefined || !Number.isInteger(days) || days < 1 || days > maxDays)) {
      throw new FraudValidationError("invalid_duration", `A ${block.blockType} block lasts 1 to ${maxDays} days.`);
    }

    const version = block.version + 1;
    const [next] = maxDays === null
      ? await tx.$queryRaw<Array<{ expires: Date | null; review: Date }>>`SELECT NULL::timestamptz AS expires, now() + make_interval(days => ${REVIEW_INTERVAL_DAYS}) AS review`
      : await tx.$queryRaw<Array<{ expires: Date; review: Date | null }>>`SELECT now() + make_interval(days => ${days}) AS expires, NULL::timestamptz AS review`;

    const eventId = await recordBlockEvent(tx, {
      actor: { kind: "owner", owner },
      blockId: block.id,
      fromExpiresAt: block.expiresAt,
      kind: "renewed",
      reason,
      toExpiresAt: next.expires,
      version,
    });
    await tx.$executeRaw`
      UPDATE fraud_blocks
      SET version = ${version}, expires_at = ${next.expires}, review_due_at = ${next.review},
          last_event_id = ${eventId}::uuid, updated_at = now()
      WHERE id = ${block.id}::uuid
    `;
    await writeFraudAudit(tx, {
      action: "fraud.block.renewed",
      actorUserId: owner.userId,
      metadata: { type: block.blockType, version },
      targetId: block.id,
      targetType: "fraud_block",
    });

    return { version };
  }, { maxWait: 10_000, timeout: 20_000 });
}

/**
 * Housekeeping: marks blocks whose end date has passed as `expired`, with a
 * history row each. Nothing depends on it; a lapsed block already stopped
 * counting at its end date.
 */
async function markLapsedBlocksExpired(limit = 100) {
  const lapsed = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM fraud_blocks WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= clock_timestamp()
    ORDER BY expires_at LIMIT ${limit}
  `;

  let marked = 0;
  for (const { id } of lapsed) {
    marked += await prisma.$transaction(async (tx) => {
      const [peek = null] = await tx.$queryRaw<Array<{ blockType: FraudBlockType; subjectUserId: string | null; token: string }>>`
        SELECT block_type::text AS "blockType", subject_user_id AS "subjectUserId", lookup_token AS token FROM fraud_blocks WHERE id = ${id}::uuid
      `;
      if (!peek) return 0;
      if (peek.subjectUserId) await lockAccount(tx, peek.subjectUserId);
      await lockIdentifiers(tx, [{ token: peek.token, type: peek.blockType }], "exclusive");

      const [row = null] = await tx.$queryRaw<Array<{ expiresAt: Date | null; id: string; version: number }>>`
        SELECT id, version, expires_at AS "expiresAt" FROM fraud_blocks
        WHERE id = ${id}::uuid AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= clock_timestamp()
        FOR UPDATE
      `;
      if (!row) return 0;
      await markExpiredInTx(tx, row);
      return 1;
    });
  }
  return marked;
}

export {
  checkBlocks,
  checkOrderBlocks,
  createAutomaticBlock,
  createBlockInTx,
  createManualBlock,

  liftBlock,
  liftBlockInTx,
  lockBlock,
  markLapsedBlocksExpired,
  renewBlock,
};
export type { BlockActor, BlockCheck, BlockCommand, BlockMatch, CheckSubject, CreateBlockInput, CreatedBlock };

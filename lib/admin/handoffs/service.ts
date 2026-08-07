import { randomUUID } from "node:crypto";

import {
  EnrollmentHandoffMethod,
  EnrollmentHandoffStatus,
  Prisma,
  UserStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  buildEnrollmentInviteUrl,
  openEnrollmentHandoffSecret,
  rewrapEnrollmentHandoffSecret,
  sealEnrollmentHandoffSecret,
} from "./envelope";
import type {
  EnrollmentHandoffEnvelope,
  EnrollmentHandoffKeyRing,
} from "./envelope";
import {
  createOpaqueToken,
  generateTemporaryPassword,
  hashPassword,
  hashToken,
} from "@/lib/auth/crypto";

const OPEN_HANDOFF_STATUSES = [
  EnrollmentHandoffStatus.pending,
  EnrollmentHandoffStatus.released,
] as const;

const REISSUEABLE_HANDOFF_STATUSES = [
  EnrollmentHandoffStatus.pending,
  EnrollmentHandoffStatus.released,
  EnrollmentHandoffStatus.expired,
] as const;
const INVITE_HANDOFF_WINDOW_MS = 24 * 60 * 60 * 1000;

type HandoffStateErrorCode =
  | "handoff_not_found"
  | "handoff_already_released"
  | "handoff_not_releasable"
  | "handoff_expired"
  | "handoff_account_inactive"
  | "handoff_invalid_method"
  | "handoff_conflict";

class EnrollmentHandoffStateError extends Error {
  readonly code: HandoffStateErrorCode;

  constructor(code: HandoffStateErrorCode, message: string) {
    super(message);
    this.name = "EnrollmentHandoffStateError";
    this.code = code;
  }
}

type HandoffTransaction = Prisma.TransactionClient;

type CreateEnrollmentHandoffInput = {
  tx: HandoffTransaction;
  userId: string;
  createdByUserId?: string | null;
  sourceImportRowId?: string | null;
  method: EnrollmentHandoffMethod;
  rawSecret?: string | null;
  tokenHash?: string | null;
  expiresAt?: Date | null;
  status?: EnrollmentHandoffStatus;
};

type HandoffAuditInput = {
  tx: HandoffTransaction;
  actorUserId?: string | null;
  action: string;
  handoffId?: string | null;
  userId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

type LockedHandoff = {
  id: string;
  user_id: string;
  method: EnrollmentHandoffMethod;
  status: EnrollmentHandoffStatus;
  token_hash: string | null;
  secret_envelope: Prisma.JsonValue | null;
  expires_at: Date | null;
  user_status: UserStatus;
  soft_deleted_at: Date | null;
};

function jsonMetadata(value: Record<string, string | number | boolean | null> = {}) {
  return value as Prisma.InputJsonValue;
}

async function writeHandoffAudit({
  action,
  actorUserId = null,
  handoffId = null,
  metadata = {},
  tx,
  userId = null,
}: HandoffAuditInput) {
  return tx.auditLog.create({
    data: {
      action,
      actorUserId,
      metadata: jsonMetadata({
        handoffId,
        userId,
        ...metadata,
      }),
      targetId: handoffId,
      targetType: "enrollment_handoff",
    },
  });
}

async function createEnrollmentHandoff(input: CreateEnrollmentHandoffInput) {
  const id = randomUUID();
  const status = input.status ?? EnrollmentHandoffStatus.pending;
  const expiresAt = input.method === EnrollmentHandoffMethod.invite_link
    ? input.expiresAt ?? new Date(Date.now() + INVITE_HANDOFF_WINDOW_MS)
    : input.expiresAt ?? null;

  if (status === EnrollmentHandoffStatus.pending && !input.rawSecret) {
    throw new EnrollmentHandoffStateError(
      "handoff_invalid_method",
      "A pending enrollment handoff requires an in-memory secret.",
    );
  }

  if (input.method === EnrollmentHandoffMethod.invite_link && status === EnrollmentHandoffStatus.pending && !input.tokenHash) {
    throw new EnrollmentHandoffStateError(
      "handoff_invalid_method",
      "An invite handoff requires a token hash.",
    );
  }

  if (
    input.method === EnrollmentHandoffMethod.invite_link
    && (!expiresAt || expiresAt <= new Date())
  ) {
    throw new EnrollmentHandoffStateError(
      "handoff_expired",
      "An invite handoff must have a future expiry.",
    );
  }

  let secretEnvelope: EnrollmentHandoffEnvelope | null = null;

  if (input.rawSecret && status === EnrollmentHandoffStatus.pending) {
    secretEnvelope = sealEnrollmentHandoffSecret(input.rawSecret, {
      handoffId: id,
      method: input.method,
      userId: input.userId,
    });
  }

  const handoff = await input.tx.enrollmentHandoff.create({
    data: {
      createdByUserId: input.createdByUserId ?? null,
      expiresAt,
      id,
      method: input.method,
      secretEnvelope: secretEnvelope
        ? secretEnvelope as Prisma.InputJsonValue
        : Prisma.DbNull,
      sourceImportRowId: input.sourceImportRowId ?? null,
      status,
      tokenHash: input.tokenHash ?? null,
      userId: input.userId,
    },
  });

  return {
    handoffId: handoff.id,
    method: handoff.method,
    status: handoff.status,
  };
}

async function lockHandoff(tx: HandoffTransaction, handoffId: string) {
  const owners = await tx.$queryRaw<Array<{ user_id: string }>>`
    SELECT user_id
    FROM enrollment_handoffs
    WHERE id = ${handoffId}::uuid
  `;

  const owner = owners[0];

  if (!owner) {
    return null;
  }

  // Credential completion, deactivation, release, and reissue all acquire the
  // account lock first. That deterministic order prevents handoff/user lock
  // inversions from turning races into deadlocks.
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner.user_id}::uuid FOR UPDATE`;

  const rows = await tx.$queryRaw<LockedHandoff[]>`
    SELECT
      h.id,
      h.user_id,
      h.method,
      h.status,
      h.token_hash,
      h.secret_envelope,
      h.expires_at,
      u.status AS user_status,
      u.soft_deleted_at
    FROM enrollment_handoffs h
    INNER JOIN users u ON u.id = h.user_id
    WHERE h.id = ${handoffId}::uuid
    FOR UPDATE OF h
  `;

  return rows[0] ?? null;
}

async function lockEnrollmentHandoffByToken(tx: HandoffTransaction, tokenHash: string) {
  const owners = await tx.$queryRaw<Array<{ user_id: string }>>`
    SELECT user_id
    FROM enrollment_handoffs
    WHERE token_hash = ${tokenHash}
  `;

  const owner = owners[0];

  if (!owner) {
    return null;
  }

  await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner.user_id}::uuid FOR UPDATE`;

  const rows = await tx.$queryRaw<LockedHandoff[]>`
    SELECT
      h.id,
      h.user_id,
      h.method,
      h.status,
      h.token_hash,
      h.secret_envelope,
      h.expires_at,
      u.status AS user_status,
      u.soft_deleted_at
    FROM enrollment_handoffs h
    INNER JOIN users u ON u.id = h.user_id
    WHERE h.token_hash = ${tokenHash}
    FOR UPDATE OF h
  `;

  return rows[0] ?? null;
}

async function releaseEnrollmentHandoff(input: {
  handoffId: string;
  actorUserId: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const handoff = await lockHandoff(tx, input.handoffId);

    if (!handoff) {
      throw new EnrollmentHandoffStateError("handoff_not_found", "The enrollment handoff was not found.");
    }

    if (handoff.status === EnrollmentHandoffStatus.released) {
      return {
        handoffId: handoff.id,
        method: handoff.method,
        secret: null,
        status: "already_released" as const,
        userId: handoff.user_id,
      };
    }

    if (handoff.status !== EnrollmentHandoffStatus.pending || !handoff.secret_envelope) {
      throw new EnrollmentHandoffStateError(
        "handoff_not_releasable",
        "This enrollment handoff is no longer available for release.",
      );
    }

    if (
      handoff.user_status !== UserStatus.active
      || handoff.soft_deleted_at !== null
    ) {
      throw new EnrollmentHandoffStateError(
        "handoff_account_inactive",
        "The account is not active, so its handoff cannot be released.",
      );
    }

    const now = new Date();

    if (handoff.method === EnrollmentHandoffMethod.invite_link && handoff.expires_at && handoff.expires_at <= now) {
      await tx.enrollmentHandoff.update({
        data: {
          revokedAt: null,
          secretEnvelope: Prisma.DbNull,
          status: EnrollmentHandoffStatus.expired,
        },
        where: { id: handoff.id },
      });

      await writeHandoffAudit({
        action: "enrollment_handoff.expired",
        handoffId: handoff.id,
        metadata: {
          method: handoff.method,
        },
        tx,
        userId: handoff.user_id,
      });

      return {
        handoffId: handoff.id,
        method: handoff.method,
        secret: null,
        status: "expired" as const,
        userId: handoff.user_id,
      };
    }

    const secret = openEnrollmentHandoffSecret(handoff.secret_envelope, {
      handoffId: handoff.id,
      method: handoff.method,
      userId: handoff.user_id,
    });

    await tx.enrollmentHandoff.update({
      data: {
        releasedAt: now,
        secretEnvelope: Prisma.DbNull,
        status: EnrollmentHandoffStatus.released,
      },
      where: { id: handoff.id },
    });

    await writeHandoffAudit({
      action: "enrollment_handoff.released",
      actorUserId: input.actorUserId,
      handoffId: handoff.id,
      metadata: {
        method: handoff.method,
      },
      tx,
      userId: handoff.user_id,
    });

    return {
      handoffId: handoff.id,
      method: handoff.method,
      secret,
      status: "released" as const,
      userId: handoff.user_id,
    };
  });

  if (result.status === "expired") {
    throw new EnrollmentHandoffStateError(
      "handoff_expired",
      "This invite handoff has expired and must be reissued.",
    );
  }

  return result;
}

async function revokeOpenEnrollmentHandoffs(
  tx: HandoffTransaction,
  userId: string,
  actorUserId?: string | null,
) {
  const now = new Date();
  const result = await tx.enrollmentHandoff.updateMany({
    data: {
      revokedAt: now,
      secretEnvelope: Prisma.DbNull,
      status: EnrollmentHandoffStatus.revoked,
    },
    where: {
      status: { in: [...OPEN_HANDOFF_STATUSES] },
      userId,
    },
  });

  if (result.count > 0) {
    await writeHandoffAudit({
      action: "enrollment_handoff.revoked",
      actorUserId,
      metadata: {
        count: result.count,
        reason: "account_deactivated",
      },
      tx,
      userId,
    });
  }

  return result.count;
}

async function completeEnrollmentHandoffsForUser(
  tx: HandoffTransaction,
  userId: string,
  actorUserId?: string | null,
) {
  const now = new Date();
  const result = await tx.enrollmentHandoff.updateMany({
    data: {
      completedAt: now,
      secretEnvelope: Prisma.DbNull,
      status: EnrollmentHandoffStatus.completed,
    },
    where: {
      status: { in: [...OPEN_HANDOFF_STATUSES] },
      userId,
    },
  });

  if (result.count > 0) {
    await writeHandoffAudit({
      action: "enrollment_handoff.completed",
      actorUserId,
      metadata: {
        count: result.count,
      },
      tx,
      userId,
    });
  }

  return result.count;
}

async function completeEnrollmentHandoff(
  tx: HandoffTransaction,
  input: {
    handoffId: string;
    userId: string;
    actorUserId?: string | null;
  },
) {
  const now = new Date();
  const result = await tx.enrollmentHandoff.updateMany({
    data: {
      completedAt: now,
      secretEnvelope: Prisma.DbNull,
      status: EnrollmentHandoffStatus.completed,
    },
    where: {
      id: input.handoffId,
      status: { in: [...OPEN_HANDOFF_STATUSES] },
      userId: input.userId,
    },
  });

  if (result.count > 0) {
    await writeHandoffAudit({
      action: "enrollment_handoff.completed",
      actorUserId: input.actorUserId,
      handoffId: input.handoffId,
      tx,
      userId: input.userId,
    });
  }

  return result.count === 1;
}

async function acknowledgeEnrollmentHandoff(input: {
  handoffId: string;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const handoff = await lockHandoff(tx, input.handoffId);

    if (!handoff) {
      throw new EnrollmentHandoffStateError("handoff_not_found", "The enrollment handoff was not found.");
    }

    if (handoff.status !== EnrollmentHandoffStatus.released) {
      throw new EnrollmentHandoffStateError(
        "handoff_not_releasable",
        "Only a released handoff can be acknowledged.",
      );
    }

    const acknowledgedAt = new Date();
    const updated = await tx.enrollmentHandoff.update({
      data: { acknowledgedAt },
      where: { id: handoff.id },
    });

    await writeHandoffAudit({
      action: "enrollment_handoff.acknowledged",
      actorUserId: input.actorUserId,
      handoffId: handoff.id,
      metadata: {
        method: handoff.method,
      },
      tx,
      userId: handoff.user_id,
    });

    return updated;
  });
}

async function reissueEnrollmentHandoff(input: {
  handoffId: string;
  actorUserId: string;
  method?: EnrollmentHandoffMethod;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await lockHandoff(tx, input.handoffId);

    if (!existing) {
      throw new EnrollmentHandoffStateError("handoff_not_found", "The enrollment handoff was not found.");
    }

    if (!REISSUEABLE_HANDOFF_STATUSES.includes(existing.status as (typeof REISSUEABLE_HANDOFF_STATUSES)[number])) {
      throw new EnrollmentHandoffStateError(
        "handoff_conflict",
        "Only pending, released, or expired handoffs can be reissued.",
      );
    }

    if (existing.user_status !== UserStatus.active || existing.soft_deleted_at !== null) {
      throw new EnrollmentHandoffStateError(
        "handoff_account_inactive",
        "The account is not active, so its handoff cannot be reissued.",
      );
    }

    const method = input.method ?? existing.method;

    if (method !== existing.method) {
      throw new EnrollmentHandoffStateError(
        "handoff_invalid_method",
        "A handoff can only be reissued with its existing delivery method.",
      );
    }

    const now = new Date();
    const rawSecret = method === EnrollmentHandoffMethod.invite_link
      ? createOpaqueToken()
      : generateTemporaryPassword();
    const tokenHash = method === EnrollmentHandoffMethod.invite_link
      ? hashToken(rawSecret)
      : null;
    const passwordHash = method === EnrollmentHandoffMethod.temporary_password
      ? await hashPassword(rawSecret)
      : null;

    await tx.enrollmentHandoff.updateMany({
      data: {
        revokedAt: now,
        secretEnvelope: Prisma.DbNull,
        status: EnrollmentHandoffStatus.revoked,
      },
      where: {
        status: { in: [...REISSUEABLE_HANDOFF_STATUSES] },
        userId: existing.user_id,
      },
    });

    if (passwordHash) {
      await tx.user.update({
        data: {
          mustChangePassword: true,
          passwordHash,
          passwordUpdatedAt: now,
        },
        where: { id: existing.user_id },
      });
    }

    const expiresAt = method === EnrollmentHandoffMethod.invite_link
      ? new Date(now.getTime() + INVITE_HANDOFF_WINDOW_MS)
      : null;
    const newHandoffId = randomUUID();
    // Seal before mutating account state so key/configuration failures roll
    // back the entire reissue transaction; the envelope is then discarded
    // because this operation returns the replacement secret exactly once.
    sealEnrollmentHandoffSecret(rawSecret, {
      handoffId: newHandoffId,
      method,
      userId: existing.user_id,
    });

    await tx.enrollmentHandoff.create({
      data: {
        createdByUserId: input.actorUserId,
        expiresAt,
        id: newHandoffId,
        method,
        // Reissue returns the replacement secret once, so do not leave a
        // second copy available to a later release call.
        releasedAt: now,
        secretEnvelope: Prisma.DbNull,
        status: EnrollmentHandoffStatus.released,
        tokenHash,
        userId: existing.user_id,
      },
    });

    await writeHandoffAudit({
      action: "enrollment_handoff.reissued",
      actorUserId: input.actorUserId,
      handoffId: newHandoffId,
      metadata: {
        method,
        replacedHandoffId: existing.id,
      },
      tx,
      userId: existing.user_id,
    });

    return {
      handoffId: newHandoffId,
      inviteUrl: method === EnrollmentHandoffMethod.invite_link
        ? buildEnrollmentInviteUrl(rawSecret)
        : null,
      method,
      secret: rawSecret,
      userId: existing.user_id,
    };
  });
}

async function expireEnrollmentHandoffs(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.enrollmentHandoff.findMany({
      select: {
        id: true,
        userId: true,
      },
      where: {
        expiresAt: { lte: now },
        method: EnrollmentHandoffMethod.invite_link,
        status: { in: [...OPEN_HANDOFF_STATUSES] },
      },
    });
    let expiredCount = 0;

    for (const candidate of candidates) {
      const updated = await tx.enrollmentHandoff.updateMany({
        data: {
          secretEnvelope: Prisma.DbNull,
          status: EnrollmentHandoffStatus.expired,
        },
        where: {
          id: candidate.id,
          method: EnrollmentHandoffMethod.invite_link,
          expiresAt: { lte: now },
          status: { in: [...OPEN_HANDOFF_STATUSES] },
        },
      });

      if (updated.count === 1) {
        expiredCount += 1;
        await writeHandoffAudit({
          action: "enrollment_handoff.expired",
          handoffId: candidate.id,
          metadata: {
            method: EnrollmentHandoffMethod.invite_link,
          },
          tx,
          userId: candidate.userId,
        });
      }
    }

    return expiredCount;
  });
}

async function rewrapPendingEnrollmentHandoffs(input?: {
  batchSize?: number;
  keyRing?: EnrollmentHandoffKeyRing;
}) {
  const batchSize = Math.min(Math.max(input?.batchSize ?? 100, 1), 500);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{
      id: string;
      user_id: string;
      method: EnrollmentHandoffMethod;
      secret_envelope: Prisma.JsonValue;
    }>>`
      SELECT id, user_id, method, secret_envelope
      FROM enrollment_handoffs
      WHERE status = 'pending'::enrollment_handoff_status
        AND secret_envelope IS NOT NULL
      ORDER BY id
      LIMIT ${batchSize}
      FOR UPDATE
    `;

    for (const row of rows) {
      const envelope = rewrapEnrollmentHandoffSecret(
        row.secret_envelope,
        {
          handoffId: row.id,
          method: row.method,
          userId: row.user_id,
        },
        input?.keyRing,
      );

      await tx.enrollmentHandoff.update({
        data: { secretEnvelope: envelope as Prisma.InputJsonValue },
        where: { id: row.id },
      });
    }

    return rows.length;
  });
}

async function countUnreleasedEnvelopesByKeyId(keyId: string) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM enrollment_handoffs
    WHERE status IN ('pending'::enrollment_handoff_status, 'released'::enrollment_handoff_status)
      AND secret_envelope ->> 'keyId' = ${keyId}
  `;

  return Number(rows[0]?.count ?? BigInt(0));
}

async function assertEnrollmentHandoffKeyCanBeRemoved(keyId: string) {
  const count = await countUnreleasedEnvelopesByKeyId(keyId);

  if (count > 0) {
    throw new EnrollmentHandoffStateError(
      "handoff_conflict",
      "The handoff key is still referenced by unreleased envelopes.",
    );
  }

  return true;
}

export {
  EnrollmentHandoffStateError,
  acknowledgeEnrollmentHandoff,
  assertEnrollmentHandoffKeyCanBeRemoved,
  buildEnrollmentInviteUrl,
  completeEnrollmentHandoff,
  completeEnrollmentHandoffsForUser,
  createEnrollmentHandoff,
  countUnreleasedEnvelopesByKeyId,
  expireEnrollmentHandoffs,
  lockEnrollmentHandoffByToken,
  releaseEnrollmentHandoff,
  reissueEnrollmentHandoff,
  revokeOpenEnrollmentHandoffs,
  rewrapPendingEnrollmentHandoffs,
  writeHandoffAudit,
};

export type {
  CreateEnrollmentHandoffInput,
  HandoffTransaction,
};

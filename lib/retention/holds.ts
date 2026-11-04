import "server-only";

import { assertStillOwner } from "@/lib/disputes/export";
import { requireReason, type OwnerContext } from "@/lib/fraud/authority";
import { FraudValidationError } from "@/lib/fraud/errors";
import { prisma } from "@/lib/prisma";

import { RetentionError } from "./errors";

const SCOPES = ["order", "buyer", "case"] as const;
const CASE_KINDS = ["refund", "dispute", "fraud"] as const;

type HoldScope = (typeof SCOPES)[number];
type CaseKind = (typeof CASE_KINDS)[number];

type PlaceHoldInput = {
  caseKind?: CaseKind | null;
  env?: Partial<Record<string, string | undefined>>;
  reason: unknown;
  scope: HoldScope;
  subjectId: string;
};

const UUID = /^[0-9a-f-]{36}$/iu;

/** What the audit event points at, so the hold shows up in the audit log of the thing it covers. */
const AUDIT_TARGETS: Record<string, string> = {
  buyer: "user",
  dispute: "payment_dispute",
  fraud: "fraud_case",
  order: "payment_order",
  refund: "refund_case",
};

function requireReasonOrRetentionError(value: unknown) {
  try {
    return requireReason(value);
  } catch (error) {
    if (error instanceof FraudValidationError) throw new RetentionError("invalid_reason", "A written reason of 10 to 500 characters is required.");
    throw error;
  }
}

/**
 * Places a legal hold on one order, one buyer or one case. Owner only (the type
 * comes from `requireOwner`, which needs the verified second factor), with a
 * written reason, and re-checked against the database inside the transaction.
 * The hold row and its audit event are written together. While a hold is open,
 * the maintenance functions neither scrub nor delete what it covers. The app
 * cannot release a hold: that is `pnpm retention:release-hold`, on the owner's
 * database login (MS-19 C-01).
 */
async function placeLegalHold(owner: OwnerContext, input: PlaceHoldInput) {
  const reason = requireReasonOrRetentionError(input.reason);
  if (!SCOPES.includes(input.scope) || !UUID.test(input.subjectId)) throw new RetentionError("invalid_subject", "Unknown hold target.");
  const caseKind = input.scope === "case" ? input.caseKind : null;
  if (input.scope === "case" && (!caseKind || !CASE_KINDS.includes(caseKind))) throw new RetentionError("invalid_subject", "A case hold names the kind of case.");

  return prisma.$transaction(async (tx) => {
    await assertStillOwner(tx, owner, input.env);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`legal-hold:${input.scope}:${input.subjectId}`}, 0))`;

    const [existing = null] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM legal_holds
      WHERE released_at IS NULL AND scope = ${input.scope} AND subject_id = ${input.subjectId}::uuid
        AND case_kind IS NOT DISTINCT FROM ${caseKind ?? null}
    `;
    if (existing) throw new RetentionError("already_held", "This subject is already on hold.");

    let created: { id: string };
    try {
      [created] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO legal_holds (scope, subject_id, case_kind, reason, placed_by_user_id)
        VALUES (${input.scope}, ${input.subjectId}::uuid, ${caseKind ?? null}, ${reason}, ${owner.userId}::uuid)
        RETURNING id
      `;
    } catch {
      // The database refuses a subject that does not exist.
      throw new RetentionError("invalid_subject", "Unknown hold target.");
    }

    await tx.$executeRaw`
      INSERT INTO audit_logs (action, actor_user_id, target_type, target_id, metadata)
      VALUES (
        'retention.hold.placed', ${owner.userId}::uuid, ${AUDIT_TARGETS[caseKind ?? input.scope]}, ${input.subjectId}::uuid,
        ${JSON.stringify({ caseKind: caseKind ?? null, holdId: created.id, scope: input.scope })}::jsonb
      )
    `;
    return { holdId: created.id };
  });
}

export { CASE_KINDS, placeLegalHold, SCOPES };
export type { CaseKind, HoldScope, PlaceHoldInput };

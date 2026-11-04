import { RoleName } from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";

import { FraudAuthorityError } from "./errors";
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from "./constants";
import { FraudValidationError } from "./errors";

/**
 * Who may do what with blocks and cases.
 *
 * - Any admin with a verified second factor can view and acknowledge.
 * - Only the owner can create permanent blocks, lift or renew them, close,
 *   reopen or link cases, record and decide appeals, and publish policy
 *   versions. The owner is the account named by FRAUD_OWNER_EMAIL; when that
 *   setting is empty nobody is the owner, and every owner action is refused.
 *
 * `requireAdmin` and `requireOwner` take the session context, which only
 * carries the admin role after the second factor was verified (lib/auth/mfa).
 * They check that again, so a context that skipped the gate is still refused.
 */

declare const adminBrand: unique symbol;
declare const ownerBrand: unique symbol;

type AdminContext = { readonly [adminBrand]: true; readonly email: string; readonly userId: string };
type OwnerContext = { readonly [ownerBrand]: true; readonly email: string; readonly userId: string };

type AuthorityEnv = Partial<Record<string, string | undefined>>;

function getFraudOwnerEmail(env: AuthorityEnv = process.env) {
  return env.FRAUD_OWNER_EMAIL?.trim().toLowerCase() || null;
}

function requireAdmin(session: SessionContext | null): AdminContext {
  if (!session) throw new FraudAuthorityError("unauthenticated");
  if (session.user.mfaStatus !== "verified") throw new FraudAuthorityError("mfa_required");
  if (!session.user.roles.includes(RoleName.admin)) throw new FraudAuthorityError("not_admin");

  return { email: session.user.email.toLowerCase(), userId: session.user.id } as AdminContext;
}

function requireOwner(session: SessionContext | null, env: AuthorityEnv = process.env): OwnerContext {
  const admin = requireAdmin(session);
  const ownerEmail = getFraudOwnerEmail(env);
  if (!ownerEmail) throw new FraudAuthorityError("owner_unset");
  if (admin.email !== ownerEmail) throw new FraudAuthorityError("not_owner");

  return admin as unknown as OwnerContext;
}

/** What the interface needs to know to enable or disable owner-only controls. The server refuses either way. */
function describeAuthority(session: SessionContext | null, env: AuthorityEnv = process.env) {
  try {
    requireOwner(session, env);
    return { isOwner: true as const, ownerConfigured: true as const };
  } catch (error) {
    return {
      isOwner: false as const,
      ownerConfigured: !(error instanceof FraudAuthorityError && error.code === "owner_unset"),
    };
  }
}

/** A written reason of a sensible length, trimmed. */
function requireReason(value: unknown) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    throw new FraudValidationError(
      "invalid_reason",
      `A written reason of ${MIN_REASON_LENGTH} to ${MAX_REASON_LENGTH} characters is required.`,
    );
  }
  return reason;
}

export { describeAuthority, getFraudOwnerEmail, requireAdmin, requireOwner, requireReason };
export type { AdminContext, OwnerContext };

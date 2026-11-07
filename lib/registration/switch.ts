import { isPaidAccessEnforced } from "@/lib/billing/enforcement";
import { getPrivacyPolicy, getTermsOfService, isLegalApproved } from "@/lib/legal";
import type { LegalDocument } from "@/lib/legal/types";
import { isLocalStandInRuntime } from "@/lib/payments/stand-in/gate";
import { isLookupSecretAvailable } from "@/lib/fraud/tokens";

import { resolveTurnstileKeys } from "./turnstile";

type SwitchEnv = Partial<Record<string, string | undefined>>;

/** What can keep signup closed even when REGISTRATION_OPEN is on. */
type RegistrationBlocker =
  | "email_not_configured"
  | "fraud_lookup_unavailable"
  | "legal_not_approved"
  | "paywall_off"
  | "switch_off"
  | "turnstile_not_configured";

type RegistrationStatus = { blockers: RegistrationBlocker[]; open: boolean };

type StatusDeps = {
  env?: SwitchEnv;
  privacy?: LegalDocument;
  terms?: LegalDocument;
};

function isOn(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

/**
 * Whether students may register themselves. REGISTRATION_OPEN is off by default,
 * and even when it is on the server treats signup as closed unless every one of
 * these holds, so no single setting can open it by mistake:
 *
 * - PAID_ACCESS_ENFORCED is on (otherwise a new account would get everything,
 *   Vera included, for free);
 * - the sending domain is configured (EMAIL_FROM and RESEND_API_KEY), because
 *   nobody can verify an account without the email;
 * - the Turnstile keys are set (resolveTurnstileKeys);
 * - the privacy policy and the terms of service are approved in code and carry
 *   no owner placeholder;
 * - the fraud lookup secret is available, so blocks can be checked.
 *
 * One exception, for a developer's own machine only: where the same rule that
 * allows the local payment stand-in holds (isLocalStandInRuntime), draft legal
 * pages and a missing email sender do not close signup, so the flow can be
 * tried locally. It is never reached in production.
 */
function getRegistrationStatus({ env = process.env, privacy, terms }: StatusDeps = {}): RegistrationStatus {
  const blockers: RegistrationBlocker[] = [];
  const local = isLocalStandInRuntime(env);

  if (!isOn(env.REGISTRATION_OPEN)) blockers.push("switch_off");
  if (!isPaidAccessEnforced(env)) blockers.push("paywall_off");
  if (!local && !(env.EMAIL_FROM?.trim() && env.RESEND_API_KEY?.trim())) blockers.push("email_not_configured");
  if (!resolveTurnstileKeys(env)) blockers.push("turnstile_not_configured");
  if (!local && !(isLegalApproved(privacy ?? getPrivacyPolicy()) && isLegalApproved(terms ?? getTermsOfService()))) {
    blockers.push("legal_not_approved");
  }
  if (!isLookupSecretAvailable(env)) blockers.push("fraud_lookup_unavailable");

  return { blockers, open: blockers.length === 0 };
}

function isRegistrationOpen(deps: StatusDeps = {}) {
  return getRegistrationStatus(deps).open;
}

export { getRegistrationStatus, isRegistrationOpen };
export type { RegistrationBlocker, RegistrationStatus, StatusDeps, SwitchEnv };

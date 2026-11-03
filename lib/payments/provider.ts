import { getAppBaseUrl } from "@/lib/config";
import { isLocalDatabaseUrl } from "@/prisma/seed-password-policy.mjs";

import type { PaymentProviderAdapter } from "./adapter";
import { STAND_IN_PROVIDER_ID, StandInProvider } from "./stand-in/provider";

type ProviderEnv = Partial<Record<string, string | undefined>>;

/**
 * The stand-in may run only outside production and only against a database on
 * this machine, the same rule as `isSeedMfaAllowed` (prisma/seed-mfa.mjs).
 */
function isStandInAllowed(env: ProviderEnv = process.env) {
  return env.NODE_ENV !== "production" && isLocalDatabaseUrl(env.DATABASE_URL?.trim());
}

/**
 * The configured payment provider, or null when there is none. Null makes
 * checkout fail closed: there is no editable redirect to fall back on. A
 * stand-in request that the environment does not allow is treated as no
 * provider at all.
 */
function getPaymentProvider(env: ProviderEnv = process.env): PaymentProviderAdapter | null {
  const selected = env.PAYMENT_PROVIDER?.trim().toLowerCase();

  if (selected === STAND_IN_PROVIDER_ID) {
    if (!isStandInAllowed(env)) return null;

    return new StandInProvider({
      appBaseUrl: getAppBaseUrl(env as NodeJS.ProcessEnv),
      secret: env.PAYMENT_STAND_IN_SECRET,
    });
  }

  // E2Pay's adapter is selected here in phase B, once its documentation exists.
  return null;
}

export { getPaymentProvider, isStandInAllowed };

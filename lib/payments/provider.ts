import { getAppBaseUrl } from "@/lib/config";

import type { PaymentProviderAdapter } from "./adapter";
import { isLocalStandInRuntime } from "./stand-in/gate";
import { STAND_IN_PROVIDER_ID, StandInProvider } from "./stand-in/provider";

type ProviderEnv = Partial<Record<string, string | undefined>>;

/**
 * The stand-in may run only on a developer's own machine: not production, a
 * local database, a loopback app URL and no hosting-platform marker (see
 * `isLocalStandInRuntime`). A loopback database alone is not enough, because a
 * deployed container can have one too.
 */
function isStandInAllowed(env: ProviderEnv = process.env) {
  return isLocalStandInRuntime(env);
}

/**
 * The stand-in provider when `PAYMENT_PROVIDER=stand-in` and the runtime is
 * local, otherwise null. The provider factory, the buyer pay console and the
 * admin refund console all get it from here, so there is one gate.
 */
function getStandInProvider(env: ProviderEnv = process.env): StandInProvider | null {
  if (env.PAYMENT_PROVIDER?.trim().toLowerCase() !== STAND_IN_PROVIDER_ID) return null;
  if (!isStandInAllowed(env)) return null;

  return new StandInProvider({
    appBaseUrl: getAppBaseUrl(env as NodeJS.ProcessEnv),
    env,
    secret: env.PAYMENT_STAND_IN_SECRET,
  });
}

/**
 * The configured payment provider, or null when there is none. Null makes
 * checkout fail closed: there is no editable redirect to fall back on. A
 * stand-in request that the environment does not allow is treated as no
 * provider at all.
 */
function getPaymentProvider(env: ProviderEnv = process.env): PaymentProviderAdapter | null {
  if (env.PAYMENT_PROVIDER?.trim().toLowerCase() === STAND_IN_PROVIDER_ID) return getStandInProvider(env);

  // E2Pay's adapter is selected here in phase B, once its documentation exists.
  return null;
}

export { getPaymentProvider, getStandInProvider, isStandInAllowed };

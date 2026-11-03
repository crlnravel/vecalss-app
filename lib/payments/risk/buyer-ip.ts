import "server-only";

import type { PaymentProviderAdapter } from "../adapter";
import { isStandInAllowed } from "../provider";
import { STAND_IN_PROVIDER_ID } from "../stand-in/provider";

/** What the order records when the local stand-in runs without a trusted proxy. */
const STAND_IN_NO_PROXY_EXEMPTION = "stand-in-local-no-trusted-proxy";

/**
 * Every real checkout carries the buyer's IP, taken from the trusted proxy
 * header (on Vercel, the one hop it sets). When there is none, the checkout is
 * refused, with one exception: the dev-only stand-in on a local database has no
 * proxy in front of it, so it is exempt and the order records why. The exemption
 * depends on the provider and the environment together, never on the request.
 */
function resolveBuyerIpExemption(
  provider: PaymentProviderAdapter,
  env: Partial<Record<string, string | undefined>> = process.env,
) {
  return provider.id === STAND_IN_PROVIDER_ID && isStandInAllowed(env) ? STAND_IN_NO_PROXY_EXEMPTION : null;
}

export { resolveBuyerIpExemption, STAND_IN_NO_PROXY_EXEMPTION };

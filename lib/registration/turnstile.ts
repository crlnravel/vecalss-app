/**
 * Cloudflare Turnstile, without a package: the widget script comes from
 * Cloudflare (the CSP in next.config.ts allows it) and the token is checked
 * against the siteverify endpoint with TURNSTILE_SECRET_KEY. Tokens are single
 * use and expire after five minutes, so each is verified once.
 *
 * Missing keys fail closed everywhere except `next dev` (NODE_ENV=development),
 * where Cloudflare's published always-pass test keys stand in. A test secret
 * accepts only the dummy token a test site key produces, and a live secret
 * rejects it.
 */

type TurnstileEnv = Partial<Record<string, string | undefined>>;

type TurnstileKeys = { secretKey: string; siteKey: string };

type TurnstileResult = "failed" | "passed" | "unavailable";

type TurnstileVerifier = (input: { ipAddress: string | null; token: string | null }) => Promise<TurnstileResult>;

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
/** Cloudflare's published test keys: always pass (visible widget). */
const TEST_SITE_KEY = "1x00000000000000000000AA";
const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 5_000;

/** The configured keys, the test keys in local development, or null (signup stays closed). */
function resolveTurnstileKeys(env: TurnstileEnv = process.env): TurnstileKeys | null {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim();

  if (siteKey && secretKey) return { secretKey, siteKey };
  if (env.NODE_ENV === "development" && !siteKey && !secretKey) {
    return { secretKey: TEST_SECRET_KEY, siteKey: TEST_SITE_KEY };
  }
  return null;
}

/** The sitekey for the widget. It is public by design. */
function getTurnstileSiteKey(env: TurnstileEnv = process.env) {
  return resolveTurnstileKeys(env)?.siteKey ?? null;
}

function createTurnstileVerifier({
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = TIMEOUT_MS,
}: { env?: TurnstileEnv; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): TurnstileVerifier {
  return async ({ ipAddress, token }) => {
    const keys = resolveTurnstileKeys(env);
    if (!keys) return "unavailable";
    if (!token || token.length > MAX_TOKEN_LENGTH) return "failed";

    try {
      const response = await fetchImpl(SITEVERIFY_URL, {
        body: JSON.stringify({
          response: token,
          secret: keys.secretKey,
          ...(ipAddress ? { remoteip: ipAddress } : {}),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return "unavailable";

      const body = (await response.json().catch(() => null)) as { "error-codes"?: unknown; success?: unknown } | null;
      if (!body || typeof body.success !== "boolean") return "unavailable";
      if (body.success) return "passed";

      // Cloudflare's own faults and our own configuration are not the visitor's doing.
      const codes = Array.isArray(body["error-codes"]) ? body["error-codes"] : [];
      return codes.some((code) => code === "internal-error" || code === "invalid-input-secret" || code === "missing-input-secret" || code === "bad-request")
        ? "unavailable"
        : "failed";
    } catch {
      return "unavailable";
    }
  };
}

export {
  SITEVERIFY_URL,
  TEST_SECRET_KEY,
  TEST_SITE_KEY,
  TURNSTILE_SCRIPT_URL,
  createTurnstileVerifier,
  getTurnstileSiteKey,
  resolveTurnstileKeys,
};
export type { TurnstileKeys, TurnstileResult, TurnstileVerifier };

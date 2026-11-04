type GateEnv = Partial<Record<string, string | undefined>>;

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Variables a hosting platform sets on the machines it runs the app on. None of
 * them exists on a developer workstation, so any one of them means the process
 * is deployed, whatever NODE_ENV or the database host says. `vercel env pull`
 * can copy some of them into a local env file; that fails closed on purpose,
 * and the stand-in simply stays off until they are removed.
 */
const HOSTING_PLATFORM_MARKERS = [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_REGION",
  "VERCEL_DEPLOYMENT_ID",
  "NETLIFY",
  "CF_PAGES",
  "RENDER",
  "RAILWAY_ENVIRONMENT",
  "FLY_APP_NAME",
  "K_SERVICE",
  "AWS_LAMBDA_FUNCTION_NAME",
  "KUBERNETES_SERVICE_HOST",
] as const;

function isLoopbackBaseUrl(raw: string | undefined) {
  const value = raw?.trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Stand-in only: seeds retain the broader isLocalDatabaseUrl classification. */
function isStrictLoopbackDatabaseUrl(raw: string | undefined) {
  if (!raw?.trim()) return false;
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    return LOOPBACK_HOSTNAMES.has(host);
  } catch {
    return false;
  }
}

/**
 * The one rule for "this process is a developer's own machine". Every stand-in
 * entry point asks it: the provider factory, the buyer pay console, the admin
 * refund console, the buyer-IP exemption and the stand-in's fallback signing
 * secret. All of these must hold, otherwise it fails closed:
 *
 * - PAYMENT_STAND_IN_LOCAL is explicitly set to "1" for local development;
 * - NODE_ENV is not production;
 * - the database host is strictly loopback (host.docker.internal is not local);
 * - APP_BASE_URL is explicitly set to a loopback URL;
 * - no hosting-platform marker is present.
 */
function isLocalStandInRuntime(env: GateEnv = process.env) {
  return (
    env.PAYMENT_STAND_IN_LOCAL?.trim() === "1"
    && env.NODE_ENV !== "production"
    && isStrictLoopbackDatabaseUrl(env.DATABASE_URL)
    && isLoopbackBaseUrl(env.APP_BASE_URL)
    && !HOSTING_PLATFORM_MARKERS.some((name) => Boolean(env[name]?.trim()))
  );
}

export { HOSTING_PLATFORM_MARKERS, isLocalStandInRuntime, isStrictLoopbackDatabaseUrl };

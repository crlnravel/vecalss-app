import { isIP } from "node:net";

import { headers } from "next/headers";

type RequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

const MAX_TRUSTED_PROXY_COUNT = 10;

/**
 * Number of reverse proxies in front of the app that append to
 * `x-forwarded-for`. Anything left of those entries was written by the client
 * and is not trustworthy.
 *
 * Set TRUSTED_PROXY_COUNT explicitly for any other proxy chain. Vercel
 * overwrites the header with the real client address, so it defaults to one
 * hop there. With no trusted proxy the header is ignored entirely.
 */
function getTrustedProxyCount(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.TRUSTED_PROXY_COUNT?.trim();

  if (configured) {
    if (!/^\d+$/u.test(configured)) return 0;
    return Math.min(Number.parseInt(configured, 10), MAX_TRUSTED_PROXY_COUNT);
  }

  return env.VERCEL === "1" ? 1 : 0;
}

/**
 * Pick the client address the outermost trusted proxy saw: the Nth entry from
 * the right, where N is the trusted proxy count. Returns null when the header
 * is not trusted, too short, or the entry is not a valid IP address (the value
 * is stored in a Postgres `inet` column and used as a throttle key).
 */
function resolveClientIpAddress(
  forwardedFor: string | null,
  trustedProxyCount: number,
) {
  if (!forwardedFor || trustedProxyCount < 1) {
    return null;
  }

  const hops = forwardedFor
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  const candidate = hops[hops.length - trustedProxyCount];

  return candidate && isIP(candidate) !== 0 ? candidate : null;
}

async function getRequestMetadata(): Promise<RequestMetadata> {
  const requestHeaders = await headers();
  const ipAddress = resolveClientIpAddress(
    requestHeaders.get("x-forwarded-for"),
    getTrustedProxyCount(),
  );
  const userAgent = requestHeaders.get("user-agent");

  return {
    ipAddress,
    userAgent,
  };
}

export { getRequestMetadata, getTrustedProxyCount, resolveClientIpAddress };

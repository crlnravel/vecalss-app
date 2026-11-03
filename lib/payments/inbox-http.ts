import "server-only";

import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { getTrustedProxyCount, resolveClientIpAddress } from "@/lib/auth/request";
import { serverLogger } from "@/lib/server-logger";

import type { PaymentProviderAdapter } from "./adapter";
import { MAX_EVENT_BODY_BYTES } from "./constants";
import { scheduleOutboxDrain } from "./drain";
import { receivePaymentEvent } from "./inbox";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { headers: HEADERS, status });
}

type InboxDeps = {
  /** The configured provider, or null when none is set. */
  getProvider: () => PaymentProviderAdapter | null;
  /** Runs once the response is on its way; defaults to draining the outbox. */
  afterReceive?: () => void;
  env?: NodeJS.ProcessEnv;
};

/**
 * The provider-facing endpoint. It answers only for the configured provider,
 * reads the raw body (the signature is over those exact bytes), and lets the
 * adapter verify before anything is parsed or stored. A 5xx makes the provider
 * retry; every decided event, quarantined or not, is a 200.
 */
async function handlePaymentEventRequest(request: Request, providerId: string, deps: InboxDeps) {
  const provider = deps.getProvider();
  if (!provider || provider.id !== providerId) return json({ error: "not_found" }, 404);

  const rawBody = await readRequestBytesAtMost(request, MAX_EVENT_BODY_BYTES);
  if (rawBody === null) return json({ error: "request_too_large" }, 413);

  const callerIp = resolveClientIpAddress(
    request.headers.get("x-forwarded-for"),
    getTrustedProxyCount(deps.env),
  );

  try {
    const received = await receivePaymentEvent({ adapter: provider, callerIp, headers: request.headers, rawBody });

    if (received.status === "refused") {
      return received.reason === "bad_signature"
        ? json({ error: "invalid_signature" }, 401)
        : json({ error: received.reason === "stale" ? "stale_event" : "invalid_payload" }, 400);
    }

    (deps.afterReceive ?? scheduleOutboxDrain)();
    return received.result.status === "duplicate"
      ? json({ duplicate: true, received: true }, 200)
      : json({ outcome: received.result.outcome, received: true }, 200);
  } catch (error) {
    serverLogger.error("payments.inbox.failed", error instanceof Error ? error : new Error("inbox failed"), {
      area: "payments",
    });
    return json({ error: "event_unavailable" }, 503);
  }
}

export { handlePaymentEventRequest };
export type { InboxDeps };

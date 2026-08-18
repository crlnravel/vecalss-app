import {
  consumeInviteRateLimit,
  getTrustedInviteIdentity,
} from "@/lib/admin/handoffs/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "no-store",
};

function notFoundResponse() {
  return Response.json({ error: "not_found" }, { headers: responseHeaders, status: 404 });
}

function getSimulationWindowMs() {
  const value = Number.parseInt(process.env.SCALABILITY_RATE_LIMIT_WINDOW_MS ?? "60000", 10);
  return Number.isSafeInteger(value) && value > 0 ? value : 60_000;
}

export async function GET(request: Request) {
  if (process.env.SCALABILITY_SIMULATION !== "1") {
    return notFoundResponse();
  }

  const expectedSecret = process.env.SCALABILITY_SIMULATION_SECRET;
  if (!expectedSecret || request.headers.get("x-scalability-secret") !== expectedSecret) {
    return notFoundResponse();
  }

  const tokenHash = new URL(request.url).searchParams.get("tokenHash") ?? "";
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) {
    return Response.json(
      { error: "invalid_token_hash" },
      { headers: responseHeaders, status: 400 },
    );
  }

  const allowed = await consumeInviteRateLimit({
    identity: getTrustedInviteIdentity(),
    tokenHash,
    windowMs: getSimulationWindowMs(),
  });

  return Response.json(
    {
      allowed,
      instanceId: process.env.INSTANCE_ID ?? "unknown",
      pid: process.pid,
    },
    { headers: responseHeaders },
  );
}

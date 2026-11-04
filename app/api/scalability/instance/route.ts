import { hasSimulationSecret } from "@/lib/scalability/simulation-secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "no-store",
};

/**
 * Instance identity for the two-API scalability simulation. It moved off the
 * public /api/health, so it answers only during a simulation with the shared secret.
 */
export async function GET(request: Request) {
  const notFound = () => Response.json({ error: "not_found" }, { headers: responseHeaders, status: 404 });

  if (process.env.SCALABILITY_SIMULATION !== "1") return notFound();

  if (!hasSimulationSecret(request)) return notFound();

  return Response.json(
    {
      instanceId: process.env.INSTANCE_ID ?? "unknown",
      pid: process.pid,
    },
    { headers: responseHeaders },
  );
}

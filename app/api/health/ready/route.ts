import { checkDependencies, defaultProbes, isReady } from "@/lib/maintenance/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const readiness = await checkDependencies(defaultProbes);

  return Response.json(readiness, {
    headers: { "Cache-Control": "no-store" },
    status: isReady(readiness) ? 200 : 503,
  });
}

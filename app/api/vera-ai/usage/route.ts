import { getReadOnlySessionContext } from "@/lib/auth/session";
import { VERA_HTTP_HEADERS } from "@/lib/vera-ai/http";
import { readVeraUsageDto } from "@/lib/vera-ai/route-support";
import { serverLogger } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { headers: VERA_HTTP_HEADERS, status: 401 });
  try {
    return Response.json(await readVeraUsageDto(session.user.id), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    serverLogger.error("vera_ai.usage.read.failed", error, { area: "vera_ai.usage", operation: "read_usage" });
    return Response.json({ error: "usage_unavailable" }, { headers: VERA_HTTP_HEADERS, status: 503 });
  }
}

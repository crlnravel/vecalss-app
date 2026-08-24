import { getReadOnlySessionContext } from "@/lib/auth/session";
import { VeraDrillError } from "@/lib/vera-ai/drill-service";
import { isUuid, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { getVeraDrillService } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const { sessionId } = await context.params;
    if (!isUuid(sessionId)) throw new VeraHttpError("target_unavailable", 404);
    return Response.json(await getVeraDrillService().result(session.user.id, sessionId), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    const mapped = error instanceof VeraDrillError || error instanceof VeraHttpError ? { code: error.code, status: error.status } : { code: "vera_unavailable", status: 503 };
    return Response.json({ error: mapped.code }, { status: mapped.status, headers: VERA_HTTP_HEADERS });
  }
}

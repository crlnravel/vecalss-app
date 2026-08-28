import { getReadOnlySessionContext } from "@/lib/auth/session";
import { isUuid, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { mapLearnerServiceError } from "@/lib/vera-ai/learner-service";
import { getVeraLearnerService } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const { conversationId } = await context.params;
    if (!isUuid(conversationId)) throw new VeraHttpError("target_unavailable", 404);
    const url = new URL(request.url);
    const service = getVeraLearnerService();
    return Response.json(await service.listMessages({ studentId: session.user.id, conversationId, limit: service.parseLimit(url, 30), cursor: url.searchParams.get("cursor") }), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    const mapped = error instanceof VeraHttpError ? { code: error.code, status: error.status } : mapLearnerServiceError(error);
    return Response.json({ error: mapped.code, ...(mapped.details ?? {}) }, { status: mapped.status, headers: VERA_HTTP_HEADERS });
  }
}

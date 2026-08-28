import { getReadOnlySessionContext } from "@/lib/auth/session";
import { isUuid, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { VeraLifecycleError } from "@/lib/vera-ai/lifecycle-service";
import { getVeraLifecycleService } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ operationId: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const { operationId } = await context.params;
    if (!isUuid(operationId)) throw new VeraHttpError("target_unavailable", 404);
    return Response.json(await getVeraLifecycleService().readLifecycleStatus({ studentId: session.user.id, operationId }), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    if (error instanceof VeraLifecycleError) return Response.json({ error: error.code, ...(error.details ?? {}) }, { status: error.status, headers: VERA_HTTP_HEADERS });
    if (error instanceof VeraHttpError) return Response.json({ error: error.code }, { status: error.status, headers: VERA_HTTP_HEADERS });
    return Response.json({ error: "lifecycle_unavailable" }, { status: 503, headers: VERA_HTTP_HEADERS });
  }
}

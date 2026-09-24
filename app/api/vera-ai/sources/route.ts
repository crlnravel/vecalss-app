import { getReadOnlySessionContext } from "@/lib/auth/session";
import { VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { mapLearnerServiceError } from "@/lib/vera-ai/learner-service";
import { getVeraLearnerService, veraAutomaticContextGateForStudentFromPolicy } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    if ((await veraAutomaticContextGateForStudentFromPolicy(session.user.id)).enabled) {
      return Response.json({ error: "legacy_context_route_disabled" }, { status: 410, headers: VERA_HTTP_HEADERS });
    }
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    if (type !== null && type !== "material" && type !== "practice") throw new VeraHttpError("invalid_request", 400);
    const service = getVeraLearnerService();
    return Response.json(await service.listSources({ studentId: session.user.id, type, limit: service.parseLimit(url, 30), cursor: url.searchParams.get("cursor") }), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    const mapped = error instanceof VeraHttpError ? { code: error.code, status: error.status } : mapLearnerServiceError(error);
    return Response.json({ error: mapped.code, ...(mapped.details ?? {}) }, { status: mapped.status, headers: VERA_HTTP_HEADERS });
  }
}

import { getReadOnlySessionContext, getSessionContext } from "@/lib/auth/session";
import { isUuid, readJsonBody, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { VERA_MAX_CONTEXT_SOURCES } from "@/lib/vera-ai/contracts";
import { mapLearnerServiceError } from "@/lib/vera-ai/learner-service";
import { getVeraLearnerService, veraAutomaticContextEnabledForServer } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respondError(error: unknown) {
  const mapped = error instanceof VeraHttpError ? { code: error.code, status: error.status } : mapLearnerServiceError(error);
  return Response.json({ error: mapped.code, ...(mapped.details ?? {}) }, { status: mapped.status, headers: VERA_HTTP_HEADERS });
}

export async function GET(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    if (veraAutomaticContextEnabledForServer()) {
      return Response.json({ error: "legacy_context_route_disabled" }, { status: 410, headers: VERA_HTTP_HEADERS });
    }
    const { conversationId } = await context.params;
    if (!isUuid(conversationId)) throw new VeraHttpError("target_unavailable", 404);
    return Response.json(await getVeraLearnerService().readContext(session.user.id, conversationId), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    return respondError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const session = await getSessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    if (veraAutomaticContextEnabledForServer()) {
      return Response.json({ error: "legacy_context_route_disabled" }, { status: 410, headers: VERA_HTTP_HEADERS });
    }
    const { conversationId } = await context.params;
    if (!isUuid(conversationId)) throw new VeraHttpError("target_unavailable", 404);
    const value = await readJsonBody(request, 12 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new VeraHttpError("invalid_request", 400);
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["expectedContextVersion", "sources"].includes(key))
      || !Number.isInteger(body.expectedContextVersion) || !Array.isArray(body.sources) || body.sources.length > VERA_MAX_CONTEXT_SOURCES) throw new VeraHttpError("invalid_request", 400);
    const sources = body.sources.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new VeraHttpError("invalid_request", 400);
      const source = value as Record<string, unknown>;
      if (Object.keys(source).some((key) => !["sourceType", "sourceId"].includes(key))
        || (source.sourceType !== "material" && source.sourceType !== "practice") || typeof source.sourceId !== "string" || !isUuid(source.sourceId)) throw new VeraHttpError("invalid_request", 400);
      return { sourceType: source.sourceType as "material" | "practice", sourceId: source.sourceId };
    });
    return Response.json(await getVeraLearnerService().replaceContext({ studentId: session.user.id, conversationId, expectedContextVersion: body.expectedContextVersion as number, sources }), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    return respondError(error);
  }
}

import { AiConversationType } from "@/generated/prisma/client";
import { getReadOnlySessionContext, getSessionContext } from "@/lib/auth/session";
import { isSafeClientRequestId, readJsonBody, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { assertMvpFeatureEnabled } from "@/lib/vera-ai/contracts";
import { mapLearnerServiceError } from "@/lib/vera-ai/learner-service";
import { getVeraLearnerService } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const mapped = error instanceof VeraHttpError ? { code: error.code, status: error.status } : mapLearnerServiceError(error);
  return Response.json({ error: mapped.code, ...(mapped.details ?? {}) }, { status: mapped.status, headers: VERA_HTTP_HEADERS });
}

export async function GET(request: Request) {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const url = new URL(request.url);
    const service = getVeraLearnerService();
    return Response.json(await service.listConversations({
      studentId: session.user.id,
      limit: service.parseLimit(url, 20),
      cursor: url.searchParams.get("cursor"),
      includeArchived: url.searchParams.get("includeArchived") === "true",
    }), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const value = await readJsonBody(request, 8 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new VeraHttpError("invalid_request", 400);
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["clientRequestId", "conversationType", "title"].includes(key))
      || !isSafeClientRequestId(body.clientRequestId)
      || typeof body.conversationType !== "string"
      || !Object.values(AiConversationType).includes(body.conversationType as AiConversationType)
      || (body.title !== undefined && body.title !== null && typeof body.title !== "string")) throw new VeraHttpError("invalid_request", 400);
    const operation = body.conversationType === AiConversationType.vera_chat
      ? "chat"
      : body.conversationType === AiConversationType.weakness_analysis
        ? "analysis"
        : body.conversationType;
    assertMvpFeatureEnabled(operation, "conversation-http");
    const result = await getVeraLearnerService().createConversation({
      studentId: session.user.id,
      clientRequestId: body.clientRequestId,
      conversationType: body.conversationType as AiConversationType,
      title: body.title as string | null | undefined,
    });
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: VERA_HTTP_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

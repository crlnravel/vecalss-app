import { getReadOnlySessionContext, getSessionContext } from "@/lib/auth/session";
import { isUuid, readJsonBody, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { VeraLifecycleError } from "@/lib/vera-ai/lifecycle-service";
import { mapLearnerServiceError } from "@/lib/vera-ai/learner-service";
import { getVeraLearnerService, getVeraLifecycleService } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof VeraLifecycleError) {
    return Response.json({ error: error.code, ...(error.details ?? {}) }, { status: error.status, headers: VERA_HTTP_HEADERS });
  }
  const mapped = error instanceof VeraHttpError ? { code: error.code, status: error.status } : mapLearnerServiceError(error);
  return Response.json({ error: mapped.code, ...(mapped.details ?? {}) }, { status: mapped.status, headers: VERA_HTTP_HEADERS });
}

export async function GET(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const { conversationId } = await context.params;
    if (!isUuid(conversationId)) throw new VeraHttpError("target_unavailable", 404);
    return Response.json(await getVeraLearnerService().getConversation(session.user.id, conversationId), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const session = await getSessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const { conversationId } = await context.params;
    if (!isUuid(conversationId)) throw new VeraHttpError("target_unavailable", 404);
    const value = await readJsonBody(request, 8 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new VeraHttpError("invalid_request", 400);
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["title", "archived", "expectedVersion"].includes(key))
      || !Number.isInteger(body.expectedVersion)
      || (typeof body.title !== "string" && typeof body.archived !== "boolean")
      || (typeof body.title === "string" && typeof body.archived === "boolean")) throw new VeraHttpError("invalid_request", 400);
    if (typeof body.title === "string") {
      return Response.json(await getVeraLearnerService().renameConversation({
        studentId: session.user.id,
        conversationId,
        title: body.title,
        expectedVersion: body.expectedVersion as number,
      }), { headers: VERA_HTTP_HEADERS });
    }
    return Response.json(await getVeraLearnerService().setConversationArchived({
      studentId: session.user.id,
      conversationId,
      archived: body.archived as boolean,
      expectedVersion: body.expectedVersion as number,
    }), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const session = await getSessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const { conversationId } = await context.params;
    if (!isUuid(conversationId)) throw new VeraHttpError("target_unavailable", 404);
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      throw new VeraHttpError("invalid_request", 400);
    }
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) throw new VeraHttpError("invalid_request", 400);
    const value = await readJsonBody(request, 2 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new VeraHttpError("invalid_request", 400);
    const body = value as Record<string, unknown>;
    if (Object.keys(body).length !== 1 || !Number.isInteger(body.expectedVersion) || (body.expectedVersion as number) < 0) {
      throw new VeraHttpError("invalid_request", 400);
    }
    const result = await getVeraLifecycleService().requestConversationDelete({
      studentId: session.user.id,
      conversationId,
      expectedVersion: body.expectedVersion as number,
      idempotencyKey,
    });
    return Response.json(result, { status: result.replayed ? 200 : 202, headers: VERA_HTTP_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

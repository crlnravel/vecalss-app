import { getReadOnlySessionContext, getSessionContext } from "@/lib/auth/session";
import { isUuid, readJsonBody, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { VeraLifecycleError } from "@/lib/vera-ai/lifecycle-service";
import { mapLearnerServiceError } from "@/lib/vera-ai/learner-service";
import { getVeraLearnerService, getVeraLifecycleService } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ artifactRevisionId: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const { artifactRevisionId } = await context.params;
    if (!isUuid(artifactRevisionId)) throw new VeraHttpError("target_unavailable", 404);
    return Response.json(await getVeraLearnerService().getArtifact(session.user.id, artifactRevisionId), { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    if (error instanceof VeraLifecycleError) {
      return Response.json({ error: error.code, ...(error.details ?? {}) }, { status: error.status, headers: VERA_HTTP_HEADERS });
    }
    const mapped = error instanceof VeraHttpError ? { code: error.code, status: error.status } : mapLearnerServiceError(error);
    return Response.json({ error: mapped.code, ...(mapped.details ?? {}) }, { status: mapped.status, headers: VERA_HTTP_HEADERS });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ artifactRevisionId: string }> }) {
  const session = await getSessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const { artifactRevisionId } = await context.params;
    if (!isUuid(artifactRevisionId)) throw new VeraHttpError("artifact_unavailable", 410);
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      throw new VeraHttpError("invalid_request", 400);
    }
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) throw new VeraHttpError("invalid_request", 400);
    const value = await readJsonBody(request, 2 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new VeraHttpError("invalid_request", 400);
    const body = value as Record<string, unknown>;
    if (Object.keys(body).length !== 1 || !Number.isInteger(body.expectedLifecycleRevision) || (body.expectedLifecycleRevision as number) < 0) {
      throw new VeraHttpError("invalid_request", 400);
    }
    const result = await getVeraLifecycleService().requestArtifactDelete({
      studentId: session.user.id,
      artifactRevisionId,
      expectedLifecycleRevision: body.expectedLifecycleRevision as number,
      idempotencyKey,
    });
    return Response.json(result, { status: result.replayed ? 200 : 202, headers: VERA_HTTP_HEADERS });
  } catch (error) {
    if (error instanceof VeraLifecycleError) {
      return Response.json({ error: error.code, ...(error.details ?? {}) }, { status: error.status, headers: VERA_HTTP_HEADERS });
    }
    const mapped = error instanceof VeraHttpError ? { code: error.code, status: error.status } : mapLearnerServiceError(error);
    return Response.json({ error: mapped.code, ...(mapped.details ?? {}) }, { status: mapped.status, headers: VERA_HTTP_HEADERS });
  }
}

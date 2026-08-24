import { getSessionContext } from "@/lib/auth/session";
import { VeraArtifactCommandError } from "@/lib/vera-ai/artifact-commands";
import { isSafeClientRequestId, isUuid, readJsonBody, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { getVeraArtifactCommandService } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ artifactRevisionId: string }> }) {
  const session = await getSessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const { artifactRevisionId } = await context.params;
    if (!isUuid(artifactRevisionId)) throw new VeraHttpError("target_unavailable", 404);
    const value = await readJsonBody(request, 8 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new VeraHttpError("invalid_request", 400);
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["clientRequestId", "expectedArtifactRevision", "materializationSchemaVersion"].includes(key))
      || !isSafeClientRequestId(body.clientRequestId)
      || !Number.isInteger(body.expectedArtifactRevision) || (body.expectedArtifactRevision as number) < 1
      || body.materializationSchemaVersion !== "1") throw new VeraHttpError("invalid_request", 400);
    const result = await getVeraArtifactCommandService().materializeLearningRecommendation({ studentId: session.user.id, artifactRevisionId, clientRequestId: body.clientRequestId, expectedArtifactRevision: body.expectedArtifactRevision as number, materializationSchemaVersion: "1" });
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status, headers: VERA_HTTP_HEADERS });
    return Response.json(result.result, { status: result.replayed ? 200 : 201, headers: VERA_HTTP_HEADERS });
  } catch (error) {
    const mapped = error instanceof VeraHttpError || error instanceof VeraArtifactCommandError ? { code: error.code, status: error.status } : { code: "vera_unavailable", status: 503 };
    return Response.json({ error: mapped.code }, { status: mapped.status, headers: VERA_HTTP_HEADERS });
  }
}

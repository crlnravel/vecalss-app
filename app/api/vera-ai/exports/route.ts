import { getSessionContext } from "@/lib/auth/session";
import { readJsonBody, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { VeraLifecycleError } from "@/lib/vera-ai/lifecycle-service";
import { getVeraLifecycleService } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof VeraLifecycleError) {
    return Response.json({ error: error.code, ...(error.details ?? {}) }, { status: error.status, headers: VERA_HTTP_HEADERS });
  }
  if (error instanceof VeraHttpError) return Response.json({ error: error.code }, { status: error.status, headers: VERA_HTTP_HEADERS });
  return Response.json({ error: "export_unavailable" }, { status: 503, headers: VERA_HTTP_HEADERS });
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      throw new VeraHttpError("invalid_request", 400);
    }
    const key = request.headers.get("idempotency-key")?.trim();
    if (!key) throw new VeraHttpError("invalid_request", 400);
    const body = await readJsonBody(request, 2 * 1024);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || (body as Record<string, unknown>).format !== "json_v1") {
      throw new VeraHttpError("invalid_request", 400);
    }
    const result = await getVeraLifecycleService().createExport({ studentId: session.user.id, idempotencyKey: key, format: "json_v1" });
    const replayed = "replayed" in result && result.replayed;
    return Response.json(result, { status: replayed ? 200 : 202, headers: VERA_HTTP_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

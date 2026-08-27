import { getReadOnlySessionContext } from "@/lib/auth/session";
import { isUuid, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
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

export async function GET(request: Request, context: { params: Promise<{ exportId: string }> }) {
  const grant = request.headers.get("x-vera-export-grant")?.trim() || undefined;
  const session = await getReadOnlySessionContext();
  if (!session && !grant) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    const { exportId } = await context.params;
    if (!isUuid(exportId)) throw new VeraHttpError("target_unavailable", 404);
    const result = await getVeraLifecycleService().readExportStatus({ exportId, studentId: session?.user.id, grant });
    return Response.json(result, { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

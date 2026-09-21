import { getSessionContext } from "@/lib/auth/session";
import { VeraDrillError } from "@/lib/vera-ai/drill-service";
import { assertMvpFeatureEnabled, VeraContractError } from "@/lib/vera-ai/contracts";
import { isUuid, readJsonBody, VERA_HTTP_HEADERS, VeraHttpError } from "@/lib/vera-ai/http";
import { getVeraDrillService } from "@/lib/vera-ai/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const session = await getSessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: VERA_HTTP_HEADERS });
  try {
    assertMvpFeatureEnabled("drill", "adaptive-practice.answer-http");
    const { sessionId } = await context.params;
    if (!isUuid(sessionId)) throw new VeraHttpError("target_unavailable", 404);
    const value = await readJsonBody(request, 8 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new VeraHttpError("invalid_request", 400);
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["clientAnswerId", "expectedSessionRevision", "adaptivePracticeItemId", "itemRevisionToken", "selectedOptionKey"].includes(key))
      || typeof body.clientAnswerId !== "string" || typeof body.adaptivePracticeItemId !== "string" || !isUuid(body.adaptivePracticeItemId)
      || typeof body.itemRevisionToken !== "string" || typeof body.selectedOptionKey !== "string" || !Number.isInteger(body.expectedSessionRevision)) throw new VeraHttpError("invalid_request", 400);
    const result = await getVeraDrillService().answer({ studentId: session.user.id, sessionId, clientAnswerId: body.clientAnswerId, expectedSessionRevision: body.expectedSessionRevision as number, adaptivePracticeItemId: body.adaptivePracticeItemId, itemRevisionToken: body.itemRevisionToken, selectedOptionKey: body.selectedOptionKey });
    return Response.json({ answer: result.answer, sessionRevision: result.sessionRevision }, { status: result.replayed ? 200 : 201, headers: VERA_HTTP_HEADERS });
  } catch (error) {
    const mapped = error instanceof VeraDrillError || error instanceof VeraHttpError || error instanceof VeraContractError ? { code: error.code, status: error.status } : { code: "vera_unavailable", status: 503 };
    return Response.json({ error: mapped.code }, { status: mapped.status, headers: VERA_HTTP_HEADERS });
  }
}

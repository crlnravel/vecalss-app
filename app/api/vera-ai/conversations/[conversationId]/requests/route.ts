import { getReadOnlySessionContext, getSessionContext } from "@/lib/auth/session";
import { VeraAdmissionError } from "@/lib/vera-ai/admission";
import { VeraContractError } from "@/lib/vera-ai/contracts";
import { getVeraChatOrchestrator, readVeraRequestStatus } from "@/lib/vera-ai/route-support";
import { VERA_HTTP_HEADERS, VeraHttpError, isUuid, parseVeraRequestBody, readJsonBody } from "@/lib/vera-ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(code: string, status: number) {
  return Response.json({ error: code }, { headers: VERA_HTTP_HEADERS, status });
}

function statusForError(error: unknown): { code: string; status: number } {
  if (error instanceof VeraHttpError) return { code: error.code, status: error.status };
  if (error instanceof VeraAdmissionError || error instanceof VeraContractError) return { code: error.code, status: error.status };
  return { code: "vera_unavailable", status: 503 };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const session = await getSessionContext();
  if (!session) return errorResponse("unauthenticated", 401);
  const { conversationId } = await context.params;
  if (!isUuid(conversationId)) return errorResponse("conversation_not_found", 404);
  let body;
  try {
    body = parseVeraRequestBody(await readJsonBody(request));
  } catch (error) {
    const mapped = statusForError(error);
    return errorResponse(mapped.code, mapped.status);
  }

  try {
    const orchestrator = getVeraChatOrchestrator();
    const result = await orchestrator.sse({
      studentId: session.user.id,
      conversationId,
      clientRequestId: body.clientRequestId,
      kind: body.kind,
      text: body.text,
      selection: body.sourceIds.map((sourceId) => ({ sourceType: "material" as const, sourceId })),
      options: body.options,
      toolId: body.toolId,
      retryOfRequestId: body.retryOfRequestId,
      signal: request.signal,
    });
    return result;
  } catch (error) {
    const mapped = statusForError(error);
    return errorResponse(mapped.code, mapped.status);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const session = await getReadOnlySessionContext();
  if (!session) return errorResponse("unauthenticated", 401);
  const { conversationId } = await context.params;
  if (!isUuid(conversationId)) return errorResponse("conversation_not_found", 404);
  const clientRequestId = new URL(request.url).searchParams.get("clientRequestId");
  if (!clientRequestId || clientRequestId.length > 160) return errorResponse("invalid_request", 400);
  try {
    const status = await readVeraRequestStatus({
      studentId: session.user.id,
      conversationId,
      clientRequestId,
    });
    if (!status) return errorResponse("request_not_found", 404);
    return Response.json(status, { headers: VERA_HTTP_HEADERS });
  } catch (error) {
    const mapped = statusForError(error);
    return errorResponse(mapped.code, mapped.status);
  }
}

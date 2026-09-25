import {
  discardQuestionBankXlsxPreview,
} from "@/lib/question-bank/xlsx-import-repository";
import {
  QUESTION_BANK_XLSX_HTTP_HEADERS,
  isTrustedQuestionBankXlsxReadOrigin,
  mapQuestionBankXlsxError,
  parseQuestionBankXlsxPreviewId,
  questionBankXlsxErrorResponse,
  readTutorQuestionBankXlsxSession,
} from "@/lib/question-bank/xlsx-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ previewId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  if (!isTrustedQuestionBankXlsxReadOrigin(request)) {
    return questionBankXlsxErrorResponse("forbidden_origin", 403);
  }
  const session = await readTutorQuestionBankXlsxSession();
  if (session === null) return questionBankXlsxErrorResponse("unauthenticated", 401);
  if (session === false) return questionBankXlsxErrorResponse("resource_inaccessible", 403);
  try {
    const { previewId: rawPreviewId } = await context.params;
    const previewId = parseQuestionBankXlsxPreviewId(rawPreviewId);
    await discardQuestionBankXlsxPreview(session.user.id, previewId);
    return Response.json({ discarded: true }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS });
  } catch (error) {
    const mapped = mapQuestionBankXlsxError(error);
    return questionBankXlsxErrorResponse(mapped.code, mapped.status);
  }
}

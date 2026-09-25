import {
  completeQuestionBankXlsxUpload,
} from "@/lib/question-bank/xlsx-import-repository";
import {
  QUESTION_BANK_XLSX_HTTP_HEADERS,
  isTrustedQuestionBankXlsxOrigin,
  mapQuestionBankXlsxError,
  parseQuestionBankXlsxPreviewId,
  questionBankXlsxErrorResponse,
  readTutorQuestionBankXlsxSession,
} from "@/lib/question-bank/xlsx-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uploadId: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isTrustedQuestionBankXlsxOrigin(request)) {
    return questionBankXlsxErrorResponse("forbidden_origin", 403);
  }
  const session = await readTutorQuestionBankXlsxSession();
  if (session === null) return questionBankXlsxErrorResponse("unauthenticated", 401);
  if (session === false) return questionBankXlsxErrorResponse("resource_inaccessible", 403);

  try {
    const { uploadId: rawUploadId } = await context.params;
    const uploadId = parseQuestionBankXlsxPreviewId(rawUploadId);
    const result = await completeQuestionBankXlsxUpload(session.user.id, uploadId, request.signal);
    return Response.json({ completed: true, ...result, uploadId }, {
      headers: QUESTION_BANK_XLSX_HTTP_HEADERS,
    });
  } catch (error) {
    const mapped = mapQuestionBankXlsxError(error);
    return questionBankXlsxErrorResponse(mapped.code, mapped.status);
  }
}

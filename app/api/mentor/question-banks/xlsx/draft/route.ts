import {
  applyQuestionBankXlsxToDraft,
} from "@/lib/question-bank/xlsx-import-repository";
import {
  QUESTION_BANK_XLSX_HTTP_HEADERS,
  QuestionBankXlsxHttpError,
  isTrustedQuestionBankXlsxOrigin,
  mapQuestionBankXlsxError,
  parseQuestionBankXlsxDraftApplyRequest,
  questionBankXlsxErrorResponse,
  readTutorQuestionBankXlsxSession,
} from "@/lib/question-bank/xlsx-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isTrustedQuestionBankXlsxOrigin(request)) {
    return questionBankXlsxErrorResponse("forbidden_origin", 403);
  }
  const session = await readTutorQuestionBankXlsxSession();
  if (session === null) return questionBankXlsxErrorResponse("unauthenticated", 401);
  if (session === false) return questionBankXlsxErrorResponse("resource_inaccessible", 403);

  try {
    const body = await parseQuestionBankXlsxDraftApplyRequest(request);
    const result = await applyQuestionBankXlsxToDraft({
      attemptId: body.previewId,
      mediaFolderReservationId: body.mediaFolderReservationId,
      ownerUserId: session.user.id,
      signal: request.signal,
    });
    return Response.json({ result }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS });
  } catch (error) {
    if (error instanceof QuestionBankXlsxHttpError) {
      return questionBankXlsxErrorResponse(error.code, error.status);
    }
    const mapped = mapQuestionBankXlsxError(error);
    return questionBankXlsxErrorResponse(mapped.code, mapped.status);
  }
}

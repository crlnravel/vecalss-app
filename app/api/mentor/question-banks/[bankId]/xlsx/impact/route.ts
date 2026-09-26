import { QuestionBankCsvMutationError } from "@/lib/question-bank/csv-repository";
import { previewQuestionBankXlsxBankOverwriteImpact } from "@/lib/question-bank/xlsx-import-repository";
import {
  QuestionBankCsvHttpError,
  mapQuestionBankCsvError,
  responseForCsvCode,
} from "@/lib/question-bank/csv-http";
import {
  QUESTION_BANK_XLSX_HTTP_HEADERS,
  isTrustedQuestionBankXlsxOrigin,
  mapQuestionBankXlsxError,
  parseQuestionBankXlsxOverwriteImpactRequest,
  parseQuestionBankXlsxPreviewId,
  questionBankXlsxErrorResponse,
  readTutorQuestionBankXlsxSession,
} from "@/lib/question-bank/xlsx-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ bankId: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isTrustedQuestionBankXlsxOrigin(request)) {
    return questionBankXlsxErrorResponse("forbidden_origin", 403);
  }
  const session = await readTutorQuestionBankXlsxSession();
  if (session === null) return questionBankXlsxErrorResponse("unauthenticated", 401);
  if (session === false) return questionBankXlsxErrorResponse("resource_inaccessible", 403);

  try {
    const { bankId: rawBankId } = await context.params;
    const bankId = parseQuestionBankXlsxPreviewId(rawBankId);
    const { expectedRevision, previewId } = await parseQuestionBankXlsxOverwriteImpactRequest(request);
    const impact = await previewQuestionBankXlsxBankOverwriteImpact({
      actorId: session.user.id,
      attemptId: previewId,
      bankId,
      expectedRevision,
      signal: request.signal,
    });
    return Response.json({ impact }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS });
  } catch (error) {
    if (error instanceof QuestionBankCsvHttpError || error instanceof QuestionBankCsvMutationError) {
      const mapped = mapQuestionBankCsvError(error);
      return responseForCsvCode(mapped.code, mapped.status);
    }
    const mapped = mapQuestionBankXlsxError(error);
    return questionBankXlsxErrorResponse(mapped.code, mapped.status);
  }
}

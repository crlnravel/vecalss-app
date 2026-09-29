import {
  QuestionBankCsvHttpError,
  mapQuestionBankCsvError,
  parseQuestionBankCsvLeaseHeaders,
  responseForCsvCode,
} from "@/lib/question-bank/csv-http";
import { QuestionBankCsvMutationError, type QuestionBankCsvImportMode } from "@/lib/question-bank/csv-repository";
import { EditLeaseServiceError } from "@/lib/resource-edit-lock/service";
import {
  applyQuestionBankXlsxToBank,
} from "@/lib/question-bank/xlsx-import-repository";
import {
  QUESTION_BANK_XLSX_HTTP_HEADERS,
  QuestionBankXlsxHttpError,
  isTrustedQuestionBankXlsxOrigin,
  mapQuestionBankXlsxError,
  parseQuestionBankXlsxApplyRequest,
  parseQuestionBankXlsxPreviewId,
  questionBankXlsxErrorResponse,
  readTutorQuestionBankXlsxSession,
} from "@/lib/question-bank/xlsx-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ bankId: string }> },
) {
  if (!isTrustedQuestionBankXlsxOrigin(request)) {
    return questionBankXlsxErrorResponse("forbidden_origin", 403);
  }
  const session = await readTutorQuestionBankXlsxSession();
  if (session === null) return questionBankXlsxErrorResponse("unauthenticated", 401);
  if (session === false) return questionBankXlsxErrorResponse("resource_inaccessible", 403);

  try {
    const { bankId: rawBankId } = await context.params;
    const bankId = parseQuestionBankXlsxPreviewId(rawBankId);
    const modeValues = new URL(request.url).searchParams.getAll("mode");
    const mode = modeValues[0];
    if (modeValues.length !== 1 || (mode !== "append" && mode !== "overwrite")) {
      throw new QuestionBankXlsxHttpError("invalid_request", 400);
    }
    const { editLease, expectedRevision } = parseQuestionBankCsvLeaseHeaders(request);
    const { previewId } = await parseQuestionBankXlsxApplyRequest(request);
    const result = await applyQuestionBankXlsxToBank({
      actorId: session.user.id,
      attemptId: previewId,
      bankId,
      editLease,
      expectedRevision,
      mode: mode as QuestionBankCsvImportMode,
      signal: request.signal,
    });
    return Response.json({ result }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS });
  } catch (error) {
    if (error instanceof QuestionBankXlsxHttpError) {
      return questionBankXlsxErrorResponse(error.code, error.status);
    }
    if (
      error instanceof QuestionBankCsvHttpError
      || error instanceof QuestionBankCsvMutationError
      || error instanceof EditLeaseServiceError
      || (error && typeof error === "object" && "code" in error
        && (error as { code?: unknown }).code === "resource_busy_retry")
    ) {
      const mapped = mapQuestionBankCsvError(error);
      return responseForCsvCode(mapped.code, mapped.status);
    }
    const mapped = mapQuestionBankXlsxError(error);
    return questionBankXlsxErrorResponse(mapped.code, mapped.status);
  }
}

import { parseQuestionBankCsv } from "@/lib/question-bank/csv";
import {
  applyQuestionBankCsv,
  QuestionBankCsvMutationError,
} from "@/lib/question-bank/csv-repository";
import {
  QuestionBankCsvHttpError,
  isTrustedCsvOrigin,
  mapQuestionBankCsvError,
  parseCsvBankId,
  parseCsvMode,
  parseQuestionBankCsvLeaseHeaders,
  readBoundedCsvBody,
  readTutorCsvSession,
  responseForCsvCode,
} from "@/lib/question-bank/csv-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ bankId: string }> },
) {
  if (!isTrustedCsvOrigin(request)) return responseForCsvCode("forbidden_origin", 403);
  const session = await readTutorCsvSession();
  if (session === null) return responseForCsvCode("unauthenticated", 401);
  if (session === false) return responseForCsvCode("resource_inaccessible", 403);

  try {
    const { bankId: rawBankId } = await context.params;
    const bankId = parseCsvBankId(rawBankId);
    const modeValues = new URL(request.url).searchParams.getAll("mode");
    if (modeValues.length !== 1) throw new QuestionBankCsvHttpError("csv_structure_invalid", 422);
    const mode = parseCsvMode(modeValues[0]!);
    const headers = parseQuestionBankCsvLeaseHeaders(request);
    const bytes = await readBoundedCsvBody(request);
    const parsed = parseQuestionBankCsv(bytes);
    if (parsed.structuralErrors.length) return responseForCsvCode("csv_structure_invalid", 422);
    if (parsed.rowErrors.length || parsed.normalizedRows.length !== parsed.summary.dataRowCount) {
      return responseForCsvCode("csv_rows_invalid", 422);
    }
    const result = await applyQuestionBankCsv({
      actorId: session.user.id,
      bankId,
      editLease: headers.editLease,
      expectedRevision: headers.expectedRevision,
      mode,
      rows: parsed.normalizedRows,
    });
    return Response.json({ result }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof QuestionBankCsvHttpError) return responseForCsvCode(error.code, error.status);
    if (error instanceof QuestionBankCsvMutationError) return responseForCsvCode(mapQuestionBankCsvError(error).code);
    return responseForCsvCode(mapQuestionBankCsvError(error).code);
  }
}

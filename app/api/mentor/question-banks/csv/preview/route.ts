import { parseQuestionBankCsv } from "@/lib/question-bank/csv";
import {
  QuestionBankCsvHttpError,
  isTrustedCsvOrigin,
  mapQuestionBankCsvError,
  readBoundedCsvBody,
  readTutorCsvSession,
  responseForCsvCode,
} from "@/lib/question-bank/csv-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedCsvOrigin(request)) return responseForCsvCode("forbidden_origin", 403);
  const session = await readTutorCsvSession();
  if (session === null) return responseForCsvCode("unauthenticated", 401);
  if (session === false) return responseForCsvCode("resource_inaccessible", 403);

  try {
    const bytes = await readBoundedCsvBody(request);
    const result = parseQuestionBankCsv(bytes);
    return Response.json({
      byteLength: result.byteLength,
      normalizedRows: result.normalizedRows,
      rowErrors: result.rowErrors,
      structuralErrors: result.structuralErrors,
      summary: result.summary,
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof QuestionBankCsvHttpError) return responseForCsvCode(error.code, error.status);
    return responseForCsvCode(mapQuestionBankCsvError(error).code);
  }
}

import { QUESTION_BANK_CSV_HEADER } from "@/lib/question-bank/csv";
import { isTrustedCsvOrigin, readTutorCsvSession, responseForCsvCode } from "@/lib/question-bank/csv-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || isTrustedCsvOrigin(request);
}

export async function GET(request: Request) {
  if (!sameOrigin(request)) return responseForCsvCode("forbidden_origin", 403);
  const session = await readTutorCsvSession();
  if (session === null) return responseForCsvCode("unauthenticated", 401);
  if (session === false) return responseForCsvCode("resource_inaccessible", 403);

  return new Response(`${QUESTION_BANK_CSV_HEADER.join(",")}\n`, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Disposition": 'attachment; filename="templat-bank-soal.csv"',
      "Content-Type": "text/csv; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

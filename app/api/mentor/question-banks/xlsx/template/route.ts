import { createQuestionBankXlsxTemplate } from "@/lib/question-bank/xlsx";
import {
  QUESTION_BANK_XLSX_HTTP_HEADERS,
  isTrustedQuestionBankXlsxReadOrigin,
  readTutorQuestionBankXlsxSession,
} from "@/lib/question-bank/xlsx-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isTrustedQuestionBankXlsxReadOrigin(request)) {
    return Response.json({ error: "forbidden_origin" }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS, status: 403 });
  }
  const session = await readTutorQuestionBankXlsxSession();
  if (session === null) {
    return Response.json({ error: "unauthenticated" }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS, status: 401 });
  }
  if (session === false) {
    return Response.json({ error: "resource_inaccessible" }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS, status: 403 });
  }

  const bytes = await createQuestionBankXlsxTemplate();
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...QUESTION_BANK_XLSX_HTTP_HEADERS,
      "Content-Disposition": 'attachment; filename="template-bank-soal.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

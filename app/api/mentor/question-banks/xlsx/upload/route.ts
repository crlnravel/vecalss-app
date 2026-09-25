import {
  createQuestionBankXlsxUploadGrant,
} from "@/lib/question-bank/xlsx-import-repository";
import {
  isTrustedQuestionBankXlsxOrigin,
  mapQuestionBankXlsxError,
  parseQuestionBankXlsxUploadRequest,
  questionBankXlsxErrorResponse,
  readTutorQuestionBankXlsxSession,
} from "@/lib/question-bank/xlsx-http";
import { QUESTION_BANK_XLSX_HTTP_HEADERS } from "@/lib/question-bank/xlsx-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedQuestionBankXlsxOrigin(request)) {
    return questionBankXlsxErrorResponse("forbidden_origin", 403);
  }
  const session = await readTutorQuestionBankXlsxSession();
  if (session === null) return questionBankXlsxErrorResponse("unauthenticated", 401);
  if (session === false) return questionBankXlsxErrorResponse("resource_inaccessible", 403);

  try {
    const { fileName } = await parseQuestionBankXlsxUploadRequest(request);
    const grant = await createQuestionBankXlsxUploadGrant(session.user.id, fileName);
    return Response.json(grant, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS });
  } catch (error) {
    const mapped = mapQuestionBankXlsxError(error);
    return questionBankXlsxErrorResponse(mapped.code, mapped.status);
  }
}

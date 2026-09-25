import { readPrivateStagingObject } from "@/lib/media/r2";
import {
  readQuestionBankXlsxPreview,
} from "@/lib/question-bank/xlsx-import-repository";
import {
  mapConcurrent,
  readQuestionBankXlsxThumbnail,
} from "@/lib/question-bank/xlsx";
import {
  QUESTION_BANK_XLSX_HTTP_HEADERS,
  isTrustedQuestionBankXlsxReadOrigin,
  mapQuestionBankXlsxError,
  parseQuestionBankXlsxPreviewId,
  parseQuestionBankXlsxThumbnailOffset,
  questionBankXlsxErrorResponse,
  readTutorQuestionBankXlsxSession,
} from "@/lib/question-bank/xlsx-http";
import { QUESTION_BANK_XLSX_LIMITS } from "@/lib/question-bank/xlsx-limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ previewId: string }> };

export async function GET(request: Request, context: RouteContext) {
  if (!isTrustedQuestionBankXlsxReadOrigin(request)) {
    return questionBankXlsxErrorResponse("forbidden_origin", 403);
  }
  const session = await readTutorQuestionBankXlsxSession();
  if (session === null) return questionBankXlsxErrorResponse("unauthenticated", 401);
  if (session === false) return questionBankXlsxErrorResponse("resource_inaccessible", 403);

  try {
    const { previewId: rawPreviewId } = await context.params;
    const previewId = parseQuestionBankXlsxPreviewId(rawPreviewId);
    const offset = parseQuestionBankXlsxThumbnailOffset(new URL(request.url).searchParams.get("offset"));
    const preview = await readQuestionBankXlsxPreview(session.user.id, previewId, request.signal);
    const selected = preview.previewImageIndex.slice(offset, offset + QUESTION_BANK_XLSX_LIMITS.thumbnailPageSize);
    const images = await mapConcurrent(selected, QUESTION_BANK_XLSX_LIMITS.maxConcurrentImageOperations, async (image) => {
      const bytes = await readPrivateStagingObject(image.objectKey, QUESTION_BANK_XLSX_LIMITS.imageBytes, request.signal);
      return readQuestionBankXlsxThumbnail(bytes, image, request.signal);
    }, request.signal);
    if (request.signal.aborted) throw request.signal.reason ?? new Error("Thumbnail request cancelled.");
    return Response.json({
      images,
      nextOffset: offset + images.length < preview.previewImageIndex.length ? offset + images.length : null,
      offset,
    }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS });
  } catch (error) {
    const mapped = mapQuestionBankXlsxError(error);
    return questionBankXlsxErrorResponse(mapped.code, mapped.status);
  }
}

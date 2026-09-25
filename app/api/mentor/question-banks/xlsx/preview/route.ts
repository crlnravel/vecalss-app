import { readPrivateStagingObject } from "@/lib/media/r2";
import {
  QuestionBankXlsxImportError,
  beginQuestionBankXlsxPreview,
  finishQuestionBankXlsxCancellation,
  markQuestionBankXlsxCancellation,
  persistQuestionBankXlsxPreview,
  registerQuestionBankXlsxPreviewController,
  readQuestionBankXlsxPreview,
  rejectQuestionBankXlsxPreview,
  watchQuestionBankXlsxPreviewCancellation,
} from "@/lib/question-bank/xlsx-import-repository";
import {
  QUESTION_BANK_XLSX_HTTP_HEADERS,
  QuestionBankXlsxHttpError,
  isTrustedQuestionBankXlsxOrigin,
  mapQuestionBankXlsxError,
  parseQuestionBankXlsxPreviewRequest,
  questionBankXlsxErrorResponse,
  readTutorQuestionBankXlsxSession,
} from "@/lib/question-bank/xlsx-http";
import {
  mapConcurrent,
  parseQuestionBankXlsxWorkbook,
  readQuestionBankXlsxThumbnail,
} from "@/lib/question-bank/xlsx";
import { QUESTION_BANK_XLSX_LIMITS } from "@/lib/question-bank/xlsx-limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Deployment hint only: the active host and plan are not verified. The route
// relies on the documented fallback of direct private-R2 upload and a 300s
// synchronous preview budget; production compatibility remains a release gate.
export const maxDuration = 300;

async function previewThumbnails(
  ownerUserId: string,
  uploadId: string,
  signal: AbortSignal,
  offset = 0,
) {
  const preview = await readQuestionBankXlsxPreview(ownerUserId, uploadId, signal);
  const selected = preview.previewImageIndex.slice(offset, offset + QUESTION_BANK_XLSX_LIMITS.thumbnailPageSize);
  const thumbnails = await mapConcurrent(selected, QUESTION_BANK_XLSX_LIMITS.maxConcurrentImageOperations, async (image) => {
    const bytes = await readPrivateStagingObject(image.objectKey, QUESTION_BANK_XLSX_LIMITS.imageBytes, signal);
    const thumbnail = await readQuestionBankXlsxThumbnail(bytes, image, signal);
    return thumbnail;
  }, signal);
  if (signal.aborted) throw signal.reason ?? new Error("Preview request cancelled.");
  return {
    images: thumbnails,
    nextOffset: offset + thumbnails.length < preview.previewImageIndex.length ? offset + thumbnails.length : null,
    offset,
  };
}

export async function POST(request: Request) {
  if (!isTrustedQuestionBankXlsxOrigin(request)) {
    return questionBankXlsxErrorResponse("forbidden_origin", 403);
  }
  const session = await readTutorQuestionBankXlsxSession();
  if (session === null) return questionBankXlsxErrorResponse("unauthenticated", 401);
  if (session === false) return questionBankXlsxErrorResponse("resource_inaccessible", 403);

  let uploadId: string | null = null;
  let previewStarted = false;
  const previewController = new AbortController();
  const signal = AbortSignal.any([request.signal, previewController.signal]);
  let stopCancellationWatch = () => {};
  let unregisterController = () => {};
  try {
    ({ uploadId } = await parseQuestionBankXlsxPreviewRequest(request));
    unregisterController = registerQuestionBankXlsxPreviewController(uploadId, previewController);
    stopCancellationWatch = watchQuestionBankXlsxPreviewCancellation(
      session.user.id,
      uploadId,
      previewController,
    );
    const started = await beginQuestionBankXlsxPreview(session.user.id, uploadId, signal);
    if (started.replay) {
      const preview = await readQuestionBankXlsxPreview(session.user.id, uploadId, signal);
      const firstPage = await previewThumbnails(session.user.id, uploadId, signal, 0);
      if (signal.aborted) throw new Error("Preview request cancelled.");
      return Response.json({
        issues: [],
        normalizedRows: preview.manifest.normalizedRows,
        previewId: uploadId,
        summary: preview.manifest.summary,
        thumbnails: firstPage.images,
        thumbnailPage: { nextOffset: firstPage.nextOffset, offset: firstPage.offset },
      }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS });
    }

    previewStarted = true;
    const parsed = await parseQuestionBankXlsxWorkbook(started.workbookBytes, signal);
    if (signal.aborted) throw signal.reason ?? new Error("Preview request cancelled.");
    if (!parsed.manifest || parsed.issues.length) {
      const hasRows = parsed.issues.some((issue) => issue.kind === "row");
      const rejected = await rejectQuestionBankXlsxPreview(
        session.user.id,
        uploadId,
        hasRows ? "xlsx_rows_invalid" : "xlsx_structure_invalid",
      );
      if (!rejected) {
        throw new Error("Preview was cancelled before validation completed.");
      }
      return Response.json({
        error: hasRows ? "xlsx_rows_invalid" : "xlsx_structure_invalid",
        issues: parsed.issues,
        summary: parsed.summary,
      }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS, status: 422 });
    }

    const saved = await persistQuestionBankXlsxPreview({
      attemptId: uploadId,
      imagePayloads: parsed.imagePayloads,
      manifest: parsed.manifest,
      ownerUserId: session.user.id,
      signal,
      workbookBytes: started.workbookBytes,
    });
    if (signal.aborted) throw signal.reason ?? new Error("Preview request cancelled.");
    const firstPage = {
      images: parsed.thumbnails.map((thumbnail) => ({
        contentSha256: thumbnail.contentSha256,
        height: thumbnail.height,
        mimeType: thumbnail.mimeType,
        placements: thumbnail.placements,
        sizeBytes: thumbnail.sizeBytes,
        thumbnailBase64: thumbnail.thumbnailBase64,
        width: thumbnail.width,
      })),
      nextOffset: saved.previewImageIndex.length > QUESTION_BANK_XLSX_LIMITS.thumbnailPageSize
        ? QUESTION_BANK_XLSX_LIMITS.thumbnailPageSize
        : null,
      offset: 0,
    };
    return Response.json({
      issues: [],
      normalizedRows: saved.manifest.normalizedRows,
      previewId: uploadId,
      summary: saved.manifest.summary,
      thumbnails: firstPage.images,
      thumbnailPage: { nextOffset: firstPage.nextOffset, offset: firstPage.offset },
    }, { headers: QUESTION_BANK_XLSX_HTTP_HEADERS });
  } catch (error) {
    let mappedError = error;
    if (uploadId && signal.aborted) {
      await markQuestionBankXlsxCancellation(session.user.id, uploadId).catch(() => undefined);
      await finishQuestionBankXlsxCancellation(session.user.id, uploadId).catch(() => undefined);
      mappedError = new QuestionBankXlsxImportError("attempt_cancelled");
    } else if (uploadId && previewStarted && !(error instanceof QuestionBankXlsxHttpError)) {
      const rejected = await rejectQuestionBankXlsxPreview(session.user.id, uploadId, "xlsx_preview_failed");
      if (!rejected) {
        await finishQuestionBankXlsxCancellation(session.user.id, uploadId).catch(() => undefined);
        mappedError = new QuestionBankXlsxImportError("attempt_cancelled");
      }
    }
    const mapped = mapQuestionBankXlsxError(mappedError);
    return questionBankXlsxErrorResponse(mapped.code, mapped.status);
  } finally {
    stopCancellationWatch();
    unregisterController();
  }
}

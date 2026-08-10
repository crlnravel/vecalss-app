import { revalidatePath } from "next/cache";

import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import {
  ImportRetryError,
  isRetryBodyShape,
  parseRetrySelection,
  retryEnrollmentImport,
} from "@/lib/admin/imports";
import { isImportIdUuid } from "@/lib/admin/imports/contracts";
import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { requireAdminSession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETRY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === getTrustedAppBaseUrl();
  } catch {
    return false;
  }
}

function response(error: string, status: number) {
  return Response.json({ error }, { headers: RETRY_HEADERS, status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  if (!sameOrigin(request)) return response("invalid_origin", 403);
  const session = await requireAdminSession();
  const { importId } = await context.params;
  if (!isImportIdUuid(importId)) return response("invalid_import_id", 400);
  const bytes = await readRequestBytesAtMost(request, 64 * 1024);
  if (bytes === null) return response("request_too_large", 413);

  let body: unknown = {};
  if (bytes.byteLength > 0) {
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      return response("invalid_request", 400);
    }
  }
  if (!isRetryBodyShape(body)) {
    return response("row_selection_invalid", 400);
  }
  const candidate = body;
  const expectedGeneration = candidate.expectedGeneration === undefined
    ? undefined
    : typeof candidate.expectedGeneration === "number" && Number.isSafeInteger(candidate.expectedGeneration)
      ? candidate.expectedGeneration
      : null;
  const selection = parseRetrySelection(candidate);
  const idempotencyKey = candidate.idempotencyKey === undefined
    ? undefined
    : typeof candidate.idempotencyKey === "string"
      && candidate.idempotencyKey.trim().length > 0
      && Array.from(candidate.idempotencyKey.trim()).length <= 160
      && !/[\u0000-\u001f\u007f]/u.test(candidate.idempotencyKey)
      ? candidate.idempotencyKey
      : null;
  if (expectedGeneration === null || idempotencyKey === null || !selection) {
    return response("row_selection_invalid", 400);
  }

  try {
    const retryInput = {
      actorUserId: session.user.id,
      expectedGeneration,
      idempotencyKey,
      importId,
      ...(Object.prototype.hasOwnProperty.call(candidate, "rowIds") ? { rowIds: selection.rowIds } : {}),
      ...(Object.prototype.hasOwnProperty.call(candidate, "rowNumbers") ? { rowNumbers: selection.rowNumbers } : {}),
    };
    const result = await retryEnrollmentImport(retryInput);
    revalidatePath("/admin");
    revalidatePath("/admin/imports");
    return Response.json({
      import: {
        generation: result.generation,
        idempotent: result.idempotent,
        importId: result.importId,
        queueJobId: result.queueJobId,
        retriedCount: result.retriedCount,
        status: result.status,
      },
    }, { headers: RETRY_HEADERS });
  } catch (error) {
    if (error instanceof ImportRetryError) {
      return response(error.code, error.code === "import_not_found" ? 404 : 409);
    }
    return response("import_retry_unavailable", 500);
  }
}

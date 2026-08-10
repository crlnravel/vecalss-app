import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import {
  EnrollmentImportPreviewError,
  skipInvalidEnrollmentImportRows,
} from "@/lib/admin/imports/service";
import { isImportIdUuid, MAX_DATA_ROWS } from "@/lib/admin/imports/contracts";
import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { requireAdminReadOnlySession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SKIP_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }
  try {
    return origin === getTrustedAppBaseUrl();
  } catch {
    return false;
  }
}

function invalidResponse(code: string, status = 400) {
  return Response.json({ error: code }, { headers: SKIP_HEADERS, status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  if (!sameOrigin(request)) {
    return invalidResponse("invalid_origin", 403);
  }

  const session = await requireAdminReadOnlySession();
  const { importId } = await context.params;
  if (!isImportIdUuid(importId)) {
    return invalidResponse("invalid_import_id");
  }
  const bodyBytes = await readRequestBytesAtMost(request, 64 * 1024);
  if (bodyBytes === null) {
    return invalidResponse("request_too_large", 413);
  }

  try {
    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes)) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return invalidResponse("row_selection_invalid");
    }
    const bodyKeys = Object.keys(body).sort();
    if (bodyKeys.some((key) => key !== "rowIds" && key !== "rowNumbers")) {
      return invalidResponse("row_selection_invalid");
    }
    const candidate = body as { rowIds?: unknown; rowNumbers?: unknown };
    const rowIds = candidate.rowIds === undefined
      ? undefined
      : Array.isArray(candidate.rowIds) && candidate.rowIds.every((value) => typeof value === "string")
        ? candidate.rowIds
        : null;
    const rowNumbers = candidate.rowNumbers === undefined
      ? undefined
      : Array.isArray(candidate.rowNumbers) && candidate.rowNumbers.every((value) => typeof value === "number" && Number.isInteger(value))
        ? candidate.rowNumbers
        : null;
    if (rowIds === null || rowNumbers === null || (rowIds?.length ?? 0) + (rowNumbers?.length ?? 0) > MAX_DATA_ROWS) {
      return invalidResponse("row_selection_invalid");
    }

    const status = await skipInvalidEnrollmentImportRows({
      actorUserId: session.user.id,
      importId,
      rowIds,
      rowNumbers,
    });
    return Response.json({ import: status }, { headers: SKIP_HEADERS });
  } catch (error) {
    if (error instanceof EnrollmentImportPreviewError) {
      const status = error.code === "import_not_found" ? 404 : error.code === "import_not_draft" ? 409 : 400;
      return invalidResponse(error.code, status);
    }
    return invalidResponse("row_selection_invalid");
  }
}

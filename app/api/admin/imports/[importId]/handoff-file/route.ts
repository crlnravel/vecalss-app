import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import {
  EnrollmentImportHandoffFileError,
  MAX_SELECTED_HANDOFFS,
  releaseImportHandoffFile,
} from "@/lib/admin/imports";
import { isImportIdUuid } from "@/lib/admin/imports/contracts";
import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { requireAdminSession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDOFF_FILE_HEADERS = {
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

function errorStatus(code: string) {
  if (code === "import_not_found") return 404;
  if (code === "invalid_selection") return 400;
  return 409;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "invalid_origin" }, { headers: HANDOFF_FILE_HEADERS, status: 403 });
  }
  const session = await requireAdminSession();
  const { importId } = await context.params;
  if (!isImportIdUuid(importId)) {
    return Response.json({ error: "invalid_import_id" }, { headers: HANDOFF_FILE_HEADERS, status: 400 });
  }

  const bodyBytes = await readRequestBytesAtMost(request, 64 * 1024);
  if (bodyBytes === null) {
    return Response.json({ error: "request_too_large" }, { headers: HANDOFF_FILE_HEADERS, status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes));
  } catch {
    return Response.json({ error: "invalid_request" }, { headers: HANDOFF_FILE_HEADERS, status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "invalid_selection" }, { headers: HANDOFF_FILE_HEADERS, status: 400 });
  }
  const candidate = body as { handoffIds?: unknown };
  if (
    !Array.isArray(candidate.handoffIds)
    || candidate.handoffIds.length < 1
    || candidate.handoffIds.length > MAX_SELECTED_HANDOFFS
    || candidate.handoffIds.some((value) => typeof value !== "string")
  ) {
    return Response.json({ error: "invalid_selection" }, { headers: HANDOFF_FILE_HEADERS, status: 400 });
  }

  try {
    const result = await releaseImportHandoffFile({
      actorUserId: session.user.id,
      handoffIds: candidate.handoffIds,
      importId,
    });
    return new Response(result.content, {
      headers: {
        ...HANDOFF_FILE_HEADERS,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof EnrollmentImportHandoffFileError) {
      return Response.json(
        { error: error.code },
        { headers: HANDOFF_FILE_HEADERS, status: errorStatus(error.code) },
      );
    }
    return Response.json({ error: "handoff_file_unavailable" }, { headers: HANDOFF_FILE_HEADERS, status: 500 });
  }
}

import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import {
  acknowledgeImportHandoffs,
  EnrollmentImportHandoffFileError,
  MAX_SELECTED_HANDOFFS,
} from "@/lib/admin/imports";
import { isImportIdUuid } from "@/lib/admin/imports/contracts";
import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { requireAdminSession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACKNOWLEDGE_HEADERS = {
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
  return Response.json({ error }, { headers: ACKNOWLEDGE_HEADERS, status });
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

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return response("invalid_selection", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return response("invalid_selection", 400);
  const bodyKeys = Object.keys(body).sort();
  if (bodyKeys.length !== 1 || bodyKeys[0] !== "handoffIds") return response("invalid_selection", 400);
  const candidate = body as { handoffIds?: unknown };
  if (
    !Array.isArray(candidate.handoffIds)
    || candidate.handoffIds.length < 1
    || candidate.handoffIds.length > MAX_SELECTED_HANDOFFS
    || candidate.handoffIds.some((value) => typeof value !== "string")
  ) {
    return response("invalid_selection", 400);
  }

  try {
    const result = await acknowledgeImportHandoffs({
      actorUserId: session.user.id,
      handoffIds: candidate.handoffIds,
      importId,
    });
    return Response.json(result, { headers: ACKNOWLEDGE_HEADERS });
  } catch (error) {
    if (error instanceof EnrollmentImportHandoffFileError) {
      return response(error.code, error.code === "import_not_found" ? 404 : 409);
    }
    return response("handoff_acknowledge_unavailable", 500);
  }
}

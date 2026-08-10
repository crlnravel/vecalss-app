import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import { reissueEnrollmentHandoff, EnrollmentHandoffStateError } from "@/lib/admin/handoffs/service";
import { isImportIdUuid } from "@/lib/admin/imports/contracts";
import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { isUuid } from "@/lib/admin/operations/validation";
import { requireAdminSession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REISSUE_HEADERS = {
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
  return Response.json({ error }, { headers: REISSUE_HEADERS, status });
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
    return response("invalid_request", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return response("invalid_request", 400);
  const bodyKeys = Object.keys(body).sort();
  if (bodyKeys.length !== 1 || bodyKeys[0] !== "handoffId") return response("invalid_request", 400);
  const candidate = body as { handoffId?: unknown };
  if (typeof candidate.handoffId !== "string" || !isUuid(candidate.handoffId)) return response("invalid_handoff_id", 400);

  try {
    const result = await reissueEnrollmentHandoff({
      actorUserId: session.user.id,
      allowImportRecovery: true,
      handoffId: candidate.handoffId,
      importId,
    });
    return Response.json({
      handoffId: result.handoffId,
      importId,
      method: result.method,
      recoverableByImportFile: result.recoverableByImportFile,
    }, { headers: REISSUE_HEADERS });
  } catch (error) {
    if (error instanceof EnrollmentHandoffStateError) {
      const status = error.code === "handoff_not_found" ? 404 : 409;
      return response(error.code, status);
    }
    return response("handoff_reissue_unavailable", 500);
  }
}

import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext } from "@/lib/auth/session";
import { getAdminVeraUsageService, VeraAdminUsageError } from "@/lib/admin/ai-usage";
import { isSafeReportKey } from "@/lib/admin/ai-usage/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { headers: REPORT_HEADERS, status: 401 });
  if (!session.user.roles.includes(RoleName.admin)) return Response.json({ error: "forbidden" }, { headers: REPORT_HEADERS, status: 403 });

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!isSafeReportKey(idempotencyKey)) {
    return Response.json({ error: "missing_idempotency_key" }, { headers: REPORT_HEADERS, status: 400 });
  }

  try {
    const service = getAdminVeraUsageService();
    const result = await service.getReport({
      adminPrincipalId: session.user.id,
      idempotencyKey,
      params: new URL(request.url).searchParams,
    });
    return Response.json(result.body, { headers: REPORT_HEADERS, status: result.status });
  } catch (error) {
    if (error instanceof VeraAdminUsageError) {
      return Response.json(
        error.reservationId
          ? { state: "error", code: error.code, retryable: error.retryable, reservationId: error.reservationId }
          : { error: error.code },
        { headers: REPORT_HEADERS, status: error.status },
      );
    }
    return Response.json({ error: "report_unavailable" }, { headers: REPORT_HEADERS, status: 503 });
  }
}

import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext } from "@/lib/auth/session";
import { veraAiControlPlaneService } from "@/lib/admin/ai/service";
import { serverLogger } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECURE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { headers: SECURE_HEADERS, status: 401 });
  if (!session.user.roles.includes(RoleName.admin)) {
    return Response.json({ error: "forbidden" }, { headers: SECURE_HEADERS, status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const metric = (searchParams.get("metric") ?? "quota_units") as "quota_units" | "requests" | "tokens" | "cost";
  const groupBy = (searchParams.get("groupBy") ?? "feature") as "feature" | "model" | "gateway" | "status";
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const timezone = searchParams.get("timezone") ?? undefined;

  try {
    const data = await veraAiControlPlaneService.getUsage({ metric, groupBy, from, to, timezone });
    return Response.json(data, { headers: SECURE_HEADERS, status: 200 });
  } catch (error) {
    serverLogger.error("admin.ai.usage.read.failed", error, { area: "admin.ai", operation: "read_usage" });
    return Response.json({ error: "usage_unavailable" }, { headers: SECURE_HEADERS, status: 503 });
  }
}

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

export async function GET() {
  const session = await getReadOnlySessionContext();
  if (!session) return Response.json({ error: "unauthenticated" }, { headers: SECURE_HEADERS, status: 401 });
  if (!session.user.roles.includes(RoleName.admin)) {
    return Response.json({ error: "forbidden" }, { headers: SECURE_HEADERS, status: 403 });
  }

  try {
    const data = await veraAiControlPlaneService.getProviders();
    return Response.json(data, { headers: SECURE_HEADERS, status: 200 });
  } catch (error) {
    serverLogger.error("admin.ai.providers.read.failed", error, { area: "admin.ai", operation: "read_providers" });
    return Response.json({ error: "providers_unavailable" }, { headers: SECURE_HEADERS, status: 503 });
  }
}

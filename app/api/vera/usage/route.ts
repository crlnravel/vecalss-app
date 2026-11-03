import { paidAccessDenial } from "@/lib/billing/enforcement";
import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { serverLogger } from "@/lib/server-logger";
import { getVeraUsageSnapshot } from "@/lib/vera/ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk melihat pemakaian Vera." },
      { headers: responseHeaders, status: 401 },
    );
  }
  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { code: "forbidden", message: "Pemakaian Vera hanya tersedia untuk siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }
  const paidDenial = await paidAccessDenial(session);
  if (paidDenial) return paidDenial;

  try {
    const snapshot = await getVeraUsageSnapshot({ studentId: session.user.id });
    return Response.json(snapshot, { headers: responseHeaders });
  } catch (error) {
    serverLogger.error("vera.usage.read_failed", error, { area: "vera", operation: "read_usage" });
    return Response.json(
      { code: "vera_unavailable", message: "Pemakaian Vera belum dapat dimuat. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

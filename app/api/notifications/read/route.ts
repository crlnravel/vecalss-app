import { RoleName } from "@/generated/prisma/client";
import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { markAllStudentNotificationsRead } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function isSameOrigin(request: Request) {
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

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: "Permintaan notifikasi tidak berasal dari aplikasi." },
      { headers: responseHeaders, status: 403 },
    );
  }

  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { error: "Masuk sebagai siswa untuk memperbarui notifikasi." },
      { headers: responseHeaders, status: 401 },
    );
  }

  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { error: "Anda tidak memiliki akses ke notifikasi siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }

  try {
    const result = await markAllStudentNotificationsRead(session.user.id);
    return Response.json({ updatedCount: result.count }, { headers: responseHeaders });
  } catch {
    return Response.json(
      { error: "Notifikasi belum dapat diperbarui. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

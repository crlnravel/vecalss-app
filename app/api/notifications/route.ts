import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { getStudentNotificationFeed } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function unauthorizedResponse() {
  return Response.json(
    { error: "Masuk sebagai siswa untuk melihat notifikasi." },
    { headers: responseHeaders, status: 401 },
  );
}

export async function GET(request: Request) {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return unauthorizedResponse();
  }

  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { error: "Anda tidak memiliki akses ke notifikasi siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : undefined;
  const requestedPage = Number.parseInt(url.searchParams.get("page") ?? "", 10);
  const page = Number.isFinite(requestedPage) ? requestedPage : undefined;

  try {
    const feed = await getStudentNotificationFeed({ limit, page, userId: session.user.id });
    return Response.json(feed, { headers: responseHeaders });
  } catch {
    return Response.json(
      { error: "Notifikasi belum dapat dimuat. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

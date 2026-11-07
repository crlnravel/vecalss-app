import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { serverLogger } from "@/lib/server-logger";
import { listStudioDocuments } from "@/lib/vera/studio-documents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

/** The student's saved Studio documents, newest first. A Studio request is sent through the chat, which saves its document. */
export async function GET() {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk melihat dokumen Studio." },
      { headers: responseHeaders, status: 401 },
    );
  }
  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { code: "forbidden", message: "Studio Vera hanya tersedia untuk siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }

  try {
    const documents = await listStudioDocuments({ studentId: session.user.id });
    return Response.json({ documents }, { headers: responseHeaders });
  } catch (error) {
    serverLogger.error("vera.studio.list_failed", error, { area: "vera", operation: "list_studio" });
    return Response.json(
      { code: "vera_unavailable", message: "Dokumen belum dapat dimuat. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

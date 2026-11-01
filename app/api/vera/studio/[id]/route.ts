import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { serverLogger } from "@/lib/server-logger";
import { deleteStudioDocument, getStudioDocument } from "@/lib/vera/studio-documents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

/** A document that is missing, malformed or another student's gives the same answer, so ids reveal nothing. */
function notFound() {
  return Response.json(
    { code: "not_found", message: "Dokumen tidak ditemukan." },
    { headers: responseHeaders, status: 404 },
  );
}

/** One saved Studio document, with its markdown and sources. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk membuka dokumen." },
      { headers: responseHeaders, status: 401 },
    );
  }
  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { code: "forbidden", message: "Studio Vera hanya tersedia untuk siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }

  const { id } = await params;
  try {
    const document = await getStudioDocument({ studentId: session.user.id, id });
    return document ? Response.json({ document }, { headers: responseHeaders }) : notFound();
  } catch (error) {
    serverLogger.error("vera.studio.read_failed", error, { area: "vera", operation: "read_studio" });
    return Response.json(
      { code: "vera_unavailable", message: "Dokumen belum dapat dibuka. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

/** Deletes one saved Studio document. Its usage stays in the ledger. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk menghapus dokumen." },
      { headers: responseHeaders, status: 401 },
    );
  }
  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { code: "forbidden", message: "Studio Vera hanya tersedia untuk siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }

  const { id } = await params;
  try {
    const deleted = await deleteStudioDocument({ studentId: session.user.id, id });
    return deleted ? Response.json({ id }, { headers: responseHeaders }) : notFound();
  } catch (error) {
    serverLogger.error("vera.studio.delete_failed", error, { area: "vera", operation: "delete_studio" });
    return Response.json(
      { code: "vera_unavailable", message: "Dokumen belum dapat dihapus. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

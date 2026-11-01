import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { serverLogger } from "@/lib/server-logger";
import { VERA_ERROR_STATUS, VeraError } from "@/lib/vera/errors";
import { VeraLimitError } from "@/lib/vera/ledger";
import { studioRequestSchema } from "@/lib/vera/studio";
import { listStudioDocuments } from "@/lib/vera/studio-documents";
import { runVeraStudio } from "@/lib/vera/studio-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

/** The student's saved Studio documents, newest first. */
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

/** Runs one Studio tool and streams its document. The document is saved when the run completes. */
export async function POST(request: Request) {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk membuat dokumen." },
      { headers: responseHeaders, status: 401 },
    );
  }
  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { code: "forbidden", message: "Studio Vera hanya tersedia untuk siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = studioRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { code: "invalid_request", message: "Pilihan dokumen belum lengkap. Periksa lagi." },
      { headers: responseHeaders, status: 400 },
    );
  }

  try {
    return await runVeraStudio({ studentId: session.user.id, request: parsed.data, signal: request.signal });
  } catch (error) {
    if (error instanceof VeraError) {
      return Response.json(
        { code: error.code, message: error.message },
        { headers: responseHeaders, status: VERA_ERROR_STATUS[error.code] },
      );
    }
    if (error instanceof VeraLimitError) {
      return Response.json(
        {
          code: error.code,
          message: error.message,
          resetsAt: error.resetsAt.toISOString(),
          lowerEffort: error.lowerEffortFits,
        },
        { headers: responseHeaders, status: 429 },
      );
    }
    serverLogger.error("vera.studio.failed", error, { area: "vera", operation: "start_studio" });
    return Response.json(
      { code: "vera_unavailable", message: "Vera sedang tidak tersedia. Coba lagi nanti." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

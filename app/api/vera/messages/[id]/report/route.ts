import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { serverLogger } from "@/lib/server-logger";
import { VERA_ERROR_STATUS, VeraError } from "@/lib/vera/errors";
import { saveMessageReport, veraReportSchema } from "@/lib/vera/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

/** Reports one of the student's own answers. A second report for the same answer replaces the first. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk memakai Vera." },
      { headers: responseHeaders, status: 401 },
    );
  }
  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { code: "forbidden", message: "Vera hanya tersedia untuk siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = veraReportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { code: "invalid_request", message: "Pilih alasan laporan dulu." },
      { headers: responseHeaders, status: 400 },
    );
  }

  try {
    await saveMessageReport({
      studentId: session.user.id,
      messageId: id,
      reason: parsed.data.reason,
      note: parsed.data.note || null,
    });
    return Response.json({ ok: true }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof VeraError) {
      return Response.json(
        { code: error.code, message: error.message },
        { headers: responseHeaders, status: VERA_ERROR_STATUS[error.code] },
      );
    }
    serverLogger.error("vera.report.failed", error, { area: "vera", operation: "save_report" });
    return Response.json(
      { code: "vera_unavailable", message: "Laporanmu belum bisa disimpan. Coba lagi nanti." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

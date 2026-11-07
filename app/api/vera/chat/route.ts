import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { parseVeraChatRequest, runVeraChat } from "@/lib/vera/chat";
import { VERA_ERROR_STATUS, VeraError } from "@/lib/vera/errors";
import { VeraLimitError } from "@/lib/vera/ledger";
import { serverLogger } from "@/lib/server-logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null);
  const parsed = parseVeraChatRequest(body);
  if (!parsed.success) {
    return Response.json(
      { code: "invalid_request", message: "Pesanmu belum bisa dikirim. Coba tulis ulang." },
      { headers: responseHeaders, status: 400 },
    );
  }

  try {
    return await runVeraChat({ studentId: session.user.id, input: parsed.data, signal: request.signal });
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
    serverLogger.error("vera.chat.failed", error, { area: "vera", operation: "start_chat" });
    return Response.json(
      { code: "vera_unavailable", message: "Vera sedang tidak tersedia. Coba lagi nanti." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

import { paidAccessDenial } from "@/lib/billing/enforcement";
import { z } from "zod";

import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { serverLogger } from "@/lib/server-logger";
import { createConversation, listSessions } from "@/lib/vera/conversations";
import { VERA_CONVERSATION_TITLE } from "@/lib/vera/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

const querySchema = z.object({ archived: z.enum(["0", "1"]).default("0") });

/** The student's sessions, newest first. `archived=1` lists the archive. */
export async function GET(request: Request) {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk melihat sesi Vera." },
      { headers: responseHeaders, status: 401 },
    );
  }
  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { code: "forbidden", message: "Sesi Vera hanya tersedia untuk siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }
  const paidDenial = await paidAccessDenial(session);
  if (paidDenial) return paidDenial;

  const parsed = querySchema.safeParse({ archived: new URL(request.url).searchParams.get("archived") ?? "0" });
  if (!parsed.success) {
    return Response.json(
      { code: "invalid_request", message: "Daftar sesi belum bisa dibuka. Coba lagi." },
      { headers: responseHeaders, status: 400 },
    );
  }

  try {
    const conversations = await listSessions({ studentId: session.user.id, archived: parsed.data.archived === "1" });
    return Response.json({ conversations }, { headers: responseHeaders });
  } catch (error) {
    serverLogger.error("vera.sessions.list_failed", error, { area: "vera", operation: "list_sessions" });
    return Response.json(
      { code: "vera_unavailable", message: "Daftar sesi belum dapat dimuat. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

/** Opens an empty session. It stays out of the list until its first message is saved. */
export async function POST() {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk membuat sesi." },
      { headers: responseHeaders, status: 401 },
    );
  }
  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { code: "forbidden", message: "Sesi Vera hanya tersedia untuk siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }
  const paidDenial = await paidAccessDenial(session);
  if (paidDenial) return paidDenial;

  try {
    const id = await createConversation(session.user.id);
    return Response.json({ id, title: VERA_CONVERSATION_TITLE }, { headers: responseHeaders, status: 201 });
  } catch (error) {
    serverLogger.error("vera.sessions.create_failed", error, { area: "vera", operation: "create_session" });
    return Response.json(
      { code: "vera_unavailable", message: "Sesi baru belum bisa dibuat. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

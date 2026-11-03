import { paidAccessDenial } from "@/lib/billing/enforcement";
import { z } from "zod";

import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { serverLogger } from "@/lib/server-logger";
import { deleteSession, updateSession } from "@/lib/vera/conversations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

const idSchema = z.uuid();
const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.archived !== undefined, {
    message: "Tidak ada perubahan.",
  });

/** A session that is missing, malformed or another student's gives the same answer, so ids reveal nothing. */
function notFound() {
  return Response.json(
    { code: "not_found", message: "Sesi tidak ditemukan." },
    { headers: responseHeaders, status: 404 },
  );
}

/** Renames a session and archives or restores it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk mengubah sesi." },
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

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { code: "invalid_request", message: "Perubahan sesi belum bisa disimpan. Coba lagi." },
      { headers: responseHeaders, status: 400 },
    );
  }

  try {
    const found = await updateSession({ studentId: session.user.id, conversationId: id, ...parsed.data });
    return found ? Response.json({ id }, { headers: responseHeaders }) : notFound();
  } catch (error) {
    serverLogger.error("vera.sessions.update_failed", error, { area: "vera", operation: "update_session" });
    return Response.json(
      { code: "vera_unavailable", message: "Sesi belum dapat diubah. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

/** Deletes a session and its messages. Usage events stay in the ledger. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk menghapus sesi." },
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

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  try {
    const deleted = await deleteSession({ studentId: session.user.id, conversationId: id });
    return deleted ? Response.json({ id }, { headers: responseHeaders }) : notFound();
  } catch (error) {
    serverLogger.error("vera.sessions.delete_failed", error, { area: "vera", operation: "delete_session" });
    return Response.json(
      { code: "vera_unavailable", message: "Sesi belum dapat dihapus. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}

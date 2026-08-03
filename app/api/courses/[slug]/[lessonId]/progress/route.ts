import { RoleName } from "@/generated/prisma/client";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import {
  completeMateriLesson,
  MateriProgressError,
  skipToMateriLesson,
} from "@/lib/materi/progress";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
};

function errorResponse(error: unknown) {
  if (error instanceof MateriProgressError) {
    return Response.json(
      { code: error.code, error: error.message },
      { headers: responseHeaders, status: error.status },
    );
  }

  return Response.json(
    { code: "unavailable", error: "Progress Materi belum dapat disimpan. Coba lagi." },
    { headers: responseHeaders, status: 503 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string; slug: string }> },
) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return Response.json(
        { code: "unauthorized", error: "Masuk sebagai siswa untuk menyimpan progress Materi." },
        { headers: responseHeaders, status: 401 },
      );
    }
    if (!hasRole(session, RoleName.student)) {
      return Response.json(
        { code: "forbidden", error: "Anda tidak memiliki akses ke progress Materi siswa." },
        { headers: responseHeaders, status: 403 },
      );
    }

    const payload = await request.json().catch(() => null) as { action?: unknown } | null;
    const action = payload?.action;
    if (action !== "complete" && action !== "skip") {
      return Response.json(
        { code: "invalid", error: "Aksi progress Materi tidak valid." },
        { headers: responseHeaders, status: 400 },
      );
    }

    const { lessonId, slug } = await context.params;
    const snapshot = action === "complete"
      ? await completeMateriLesson(session.user.id, slug, lessonId)
      : await skipToMateriLesson(session.user.id, slug, lessonId);

    return Response.json(
      { courseSlug: slug, snapshot },
      { headers: responseHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

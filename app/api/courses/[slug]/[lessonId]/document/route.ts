import { RoleName } from "@/generated/prisma/client";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import {
  MateriDocumentDeliveryError,
  resolvePublishedMateriDocument,
} from "@/lib/materi/delivery";

export const dynamic = "force-dynamic";

const errorResponse = (error: unknown) => {
  if (error instanceof MateriDocumentDeliveryError) {
    return Response.json(
      { code: error.code, error: error.message },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        },
        status: error.status,
      },
    );
  }

  console.error("Unexpected Materi document delivery error", error);
  return Response.json(
    { code: "unavailable", error: "Dokumen PDF belum dapat dibuka. Coba lagi." },
    {
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
      },
      status: 503,
    },
  );
};

export async function GET(
  request: Request,
  context: { params: Promise<{ lessonId: string; slug: string }> },
) {
  try {
    const session = await getSessionContext();
    if (!session) {
      throw new MateriDocumentDeliveryError(
        "unauthorized",
        "Masuk sebagai siswa untuk membuka dokumen Materi.",
        401,
      );
    }
    if (!hasRole(session, RoleName.student)) {
      throw new MateriDocumentDeliveryError(
        "forbidden",
        "Anda tidak memiliki akses ke dokumen Materi siswa.",
        403,
      );
    }

    const { lessonId, slug } = await context.params;
    const url = new URL(request.url);
    const expectedManagedAssetId = url.searchParams.get("assetId") || url.searchParams.get("managedAssetId");
    const document = await resolvePublishedMateriDocument({
      courseSlug: slug,
      expectedManagedAssetId,
      lessonCode: lessonId,
      studentId: session.user.id,
    });

    return Response.json(
      { ...document, document },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

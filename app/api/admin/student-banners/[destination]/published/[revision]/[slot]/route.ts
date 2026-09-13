import {
  AdminStudentPreviewUnavailableError,
  requireAdminStudentPreviewRouteContext,
} from "@/lib/admin/student-preview";
import {
  BANNER_DELIVERY_HEADERS,
  BannerDeliveryError,
  assertBannerDeliverySession,
  deliverBannerImage,
  resolveBannerDeliverySession,
} from "@/lib/banner/delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof AdminStudentPreviewUnavailableError) {
    return Response.json(
      { error: "Admin preview banner tidak tersedia." },
      { headers: BANNER_DELIVERY_HEADERS, status: 404 },
    );
  }
  if (error instanceof BannerDeliveryError) {
    return Response.json(
      { error: error.message },
      { headers: BANNER_DELIVERY_HEADERS, status: error.status },
    );
  }

  console.error("Unexpected admin published banner delivery error", error);
  return Response.json(
    { error: "Gambar banner belum tersedia." },
    { headers: BANNER_DELIVERY_HEADERS, status: 503 },
  );
}

/**
 * Normal Admin Preview uses the published design but an Admin-only delivery
 * boundary. The student endpoint deliberately remains student-role-only, so
 * an Admin session never receives a private/Admin media URL by accident.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ destination: string; revision: string; slot: string }> },
) {
  try {
    const { destination, revision, slot } = await context.params;
    const session = await resolveBannerDeliverySession();
    assertBannerDeliverySession(session, "admin-published");
    if (!session) throw new BannerDeliveryError("Sesi tidak tersedia.", 401);
    await requireAdminStudentPreviewRouteContext(session);
    const image = await deliverBannerImage({ destination, revision, signal: request.signal, slot, source: "admin-published" });
    const headers = new Headers(BANNER_DELIVERY_HEADERS);
    headers.set("Content-Type", image.contentType);
    if (image.contentLength !== null) headers.set("Content-Length", String(image.contentLength));
    return new Response(image.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

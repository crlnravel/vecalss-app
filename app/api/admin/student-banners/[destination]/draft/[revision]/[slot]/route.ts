import {
  AdminStudentPreviewUnavailableError,
  assertAdminStudentPreviewEnabled,
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

  console.error("Unexpected admin banner delivery error", error);
  return Response.json(
    { error: "Gambar banner belum tersedia." },
    { headers: BANNER_DELIVERY_HEADERS, status: 503 },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ destination: string; revision: string; slot: string }> },
) {
  try {
    const { destination, revision, slot } = await context.params;
    const session = await resolveBannerDeliverySession();
    assertBannerDeliverySession(session, "draft");
    assertAdminStudentPreviewEnabled();
    const image = await deliverBannerImage({ destination, revision, slot, source: "draft" });
    const headers = new Headers(BANNER_DELIVERY_HEADERS);
    headers.set("Content-Type", image.contentType);
    if (image.contentLength !== null) headers.set("Content-Length", String(image.contentLength));
    return new Response(image.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

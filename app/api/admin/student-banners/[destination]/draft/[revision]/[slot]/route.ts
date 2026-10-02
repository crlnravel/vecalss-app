import {
  AdminStudentPreviewUnavailableError,
  requireAdminStudentPreviewRouteContext,
} from "@/lib/admin/student-preview";
import { serverLogger } from "@/lib/server-logger";
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

  serverLogger.error("admin.banner.draft_delivery.unexpected_failure", error, {
    area: "admin.banner",
    operation: "deliver_draft_banner",
  });
  return Response.json(
    { error: "Gambar banner belum tersedia." },
    { headers: BANNER_DELIVERY_HEADERS, status: 503 },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ destination: string; revision: string; slot: string }> },
) {
  try {
    const { destination, revision, slot } = await context.params;
    const session = await resolveBannerDeliverySession();
    assertBannerDeliverySession(session, "draft");
    if (!session) throw new BannerDeliveryError("Sesi tidak tersedia.", 401);
    await requireAdminStudentPreviewRouteContext(session);
    const image = await deliverBannerImage({ destination, revision, signal: request.signal, slot, source: "draft" });
    const headers = new Headers(BANNER_DELIVERY_HEADERS);
    headers.set("Content-Type", image.contentType);
    if (image.contentLength !== null) headers.set("Content-Length", String(image.contentLength));
    return new Response(image.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

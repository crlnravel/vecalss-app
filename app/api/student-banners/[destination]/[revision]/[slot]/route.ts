import {
  BANNER_DELIVERY_HEADERS,
  BannerDeliveryError,
  assertBannerDeliverySession,
  deliverBannerImage,
  resolveBannerDeliverySession,
} from "@/lib/banner/delivery";
import { serverLogger } from "@/lib/server-logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof BannerDeliveryError) {
    return Response.json(
      { error: error.message },
      { headers: BANNER_DELIVERY_HEADERS, status: error.status },
    );
  }

  serverLogger.error("student.banner.delivery.unexpected_failure", error, {
    area: "student.banner",
    operation: "deliver_banner",
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
    assertBannerDeliverySession(session, "published");
    const image = await deliverBannerImage({ destination, revision, signal: request.signal, slot, source: "published" });
    const headers = new Headers(BANNER_DELIVERY_HEADERS);
    headers.set("Content-Type", image.contentType);
    if (image.contentLength !== null) headers.set("Content-Length", String(image.contentLength));
    return new Response(image.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

import { parseMediaScope } from "@/lib/media/domain";
import { serverLogger } from "@/lib/server-logger";
import {
  getMediaAssetThumbnail,
  MediaServiceError,
  requireMediaSession,
} from "@/lib/media/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/media/[scope]/assets/[assetId]/thumbnail">,
) {
  try {
    const { assetId, scope: rawScope } = await context.params;
    const scope = parseMediaScope(rawScope);
    if (!scope) return Response.json({ error: "Pustaka media tidak valid." }, { status: 404 });
    await requireMediaSession(scope);

    const thumbnail = await getMediaAssetThumbnail(scope, assetId);
    if (thumbnail.fallbackUrl) return Response.redirect(thumbnail.fallbackUrl, 302);
    if (!thumbnail.body) return Response.json({ error: "Gambar pratinjau belum tersedia." }, { status: 404 });

    return new Response(thumbnail.body, {
      headers: {
        "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
        "Content-Type": thumbnail.contentType,
      },
    });
  } catch (error) {
    if (error instanceof MediaServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    serverLogger.error("media.thumbnail.unexpected_failure", error, {
      area: "media",
      operation: "load_thumbnail",
    });
    return Response.json({ error: "Gambar pratinjau belum tersedia." }, { status: 500 });
  }
}

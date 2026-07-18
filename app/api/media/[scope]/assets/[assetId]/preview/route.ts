import { parseMediaScope } from "@/lib/media/domain";
import {
  MediaServiceError,
  getMediaAssetPreview,
  requireMediaSession,
} from "@/lib/media/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/media/[scope]/assets/[assetId]/preview">,
) {
  try {
    const { assetId, scope: rawScope } = await context.params;
    const scope = parseMediaScope(rawScope);
    if (!scope) return Response.json({ error: "Library media tidak valid." }, { status: 404 });
    await requireMediaSession(scope);
    return Response.json(await getMediaAssetPreview(scope, assetId));
  } catch (error) {
    if (error instanceof MediaServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Unexpected media preview error", error);
    return Response.json({ error: "Preview gambar belum tersedia." }, { status: 500 });
  }
}

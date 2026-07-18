import { parseMediaScope } from "@/lib/media/domain";
import {
  MediaServiceError,
  createMediaFolder,
  finalizeMediaUpload,
  listMediaLibrary,
  moveMediaAsset,
  moveMediaFolder,
  renameMediaAsset,
  renameMediaFolder,
  requestMediaUpload,
  requireMediaSession,
  trashMediaAsset,
  trashMediaFolder,
} from "@/lib/media/repository";

export const dynamic = "force-dynamic";

const errorResponse = (error: unknown) => {
  if (error instanceof MediaServiceError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error("Unexpected media API error", error);
  return Response.json({ error: "Media belum dapat diproses. Coba lagi." }, { status: 500 });
};

export async function GET(
  request: Request,
  context: RouteContext<"/api/media/[scope]">,
) {
  try {
    const { scope: rawScope } = await context.params;
    const scope = parseMediaScope(rawScope);
    if (!scope) return Response.json({ error: "Library media tidak valid." }, { status: 404 });
    await requireMediaSession(scope);

    const url = new URL(request.url);
    const folderId = url.searchParams.get("folderId");
    const query = url.searchParams.get("query") ?? "";
    return Response.json(await listMediaLibrary({ folderId, query, scope }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/media/[scope]">,
) {
  try {
    const { scope: rawScope } = await context.params;
    const scope = parseMediaScope(rawScope);
    if (!scope) return Response.json({ error: "Library media tidak valid." }, { status: 404 });
    const session = await requireMediaSession(scope);
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("action" in body) || typeof body.action !== "string") {
      throw new MediaServiceError("Permintaan media tidak valid.");
    }

    switch (body.action) {
      case "create-folder":
        return Response.json({
          folder: await createMediaFolder({
            createdByUserId: session.user.id,
            name: "name" in body ? body.name : null,
            parentId: "parentId" in body ? body.parentId : null,
            scope,
          }),
        });
      case "rename-folder":
        if (!("folderId" in body) || typeof body.folderId !== "string") throw new MediaServiceError("Folder tidak valid.");
        await renameMediaFolder({ folderId: body.folderId, name: "name" in body ? body.name : null, scope });
        return Response.json({ ok: true });
      case "move-folder":
        if (!("folderId" in body) || typeof body.folderId !== "string") throw new MediaServiceError("Folder tidak valid.");
        await moveMediaFolder({ folderId: body.folderId, parentId: "parentId" in body ? body.parentId : null, scope });
        return Response.json({ ok: true });
      case "trash-folder":
        if (!("folderId" in body) || typeof body.folderId !== "string") throw new MediaServiceError("Folder tidak valid.");
        await trashMediaFolder(scope, body.folderId);
        return Response.json({ ok: true });
      case "rename-asset":
        if (!("assetId" in body) || typeof body.assetId !== "string") throw new MediaServiceError("Gambar tidak valid.");
        await renameMediaAsset({ assetId: body.assetId, name: "name" in body ? body.name : null, scope });
        return Response.json({ ok: true });
      case "move-asset":
        if (!("assetId" in body) || typeof body.assetId !== "string") throw new MediaServiceError("Gambar tidak valid.");
        await moveMediaAsset({ assetId: body.assetId, folderId: "folderId" in body ? body.folderId : null, scope });
        return Response.json({ ok: true });
      case "trash-asset":
        if (!("assetId" in body) || typeof body.assetId !== "string") throw new MediaServiceError("Gambar tidak valid.");
        await trashMediaAsset(scope, body.assetId);
        return Response.json({ ok: true });
      case "request-upload":
        return Response.json(await requestMediaUpload({
          fileName: "fileName" in body ? body.fileName : null,
          folderId: "folderId" in body ? body.folderId : null,
          mimeType: "mimeType" in body ? body.mimeType : null,
          scope,
          sizeBytes: "sizeBytes" in body ? body.sizeBytes : null,
          uploadedByUserId: session.user.id,
        }));
      case "finalize-upload":
        if (!("assetId" in body) || typeof body.assetId !== "string") throw new MediaServiceError("Gambar tidak valid.");
        await finalizeMediaUpload({
          assetId: body.assetId,
          height: "height" in body ? body.height : null,
          scope,
          width: "width" in body ? body.width : null,
        });
        return Response.json({ ok: true });
      default:
        throw new MediaServiceError("Aksi media tidak dikenali.");
    }
  } catch (error) {
    return errorResponse(error);
  }
}

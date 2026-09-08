import {
  AdminStudentPreviewDocumentError,
  getAdminPreviewMateriDocument,
} from "@/lib/admin/student-preview-reads";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self';",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

function errorResponse(error: AdminStudentPreviewDocumentError) {
  return Response.json(
    { code: error.code, error: error.message },
    { headers: responseHeaders, status: error.status },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ lessonId: string; slug: string }> },
) {
  const { lessonId, slug } = await context.params;
  const url = new URL(request.url);

  try {
    const result = await getAdminPreviewMateriDocument({
      courseSlug: slug,
      expectedManagedAssetId: url.searchParams.get("assetId") || url.searchParams.get("managedAssetId"),
      lessonCode: lessonId,
    });

    const wantsDownload = url.searchParams.get("download") === "1";
    if (url.searchParams.get("format") === "pdf" || wantsDownload) {
      return new Response(null, {
        headers: { ...responseHeaders, Location: wantsDownload ? result.data.downloadUrl ?? result.data.documentUrl : result.data.documentUrl },
        status: 302,
      });
    }

    return Response.json(result.data, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof AdminStudentPreviewDocumentError) {
      return errorResponse(error);
    }

    // Authentication redirects and unavailable preview-fixture errors are
    // intentionally allowed to propagate to Next's route handling. Only the
    // typed document errors above are part of this route's JSON contract.
    throw error;
  }
}

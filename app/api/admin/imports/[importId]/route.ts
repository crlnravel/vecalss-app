import {
  EnrollmentImportPreviewError,
  getEnrollmentImportStatus,
} from "@/lib/admin/imports/service";
import { isImportIdUuid } from "@/lib/admin/imports/contracts";
import { requireAdminReadOnlySession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  const session = await requireAdminReadOnlySession();
  const { importId } = await context.params;

  if (!isImportIdUuid(importId)) {
    return Response.json({ error: "invalid_import_id" }, { headers: STATUS_HEADERS, status: 400 });
  }

  try {
    const status = await getEnrollmentImportStatus({
      actorUserId: session.user.id,
      importId,
    });
    return Response.json({ import: status }, { headers: STATUS_HEADERS });
  } catch (error) {
    if (error instanceof EnrollmentImportPreviewError) {
      return Response.json({ error: error.code }, { headers: STATUS_HEADERS, status: error.code === "import_not_found" ? 404 : 409 });
    }
    return Response.json({ error: "import_unavailable" }, { headers: STATUS_HEADERS, status: 500 });
  }
}

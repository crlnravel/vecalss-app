import { revalidatePath } from "next/cache";

import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import {
  cancelEnrollmentImport,
  EnrollmentImportCancellationError,
} from "@/lib/admin/imports";
import { isImportIdUuid } from "@/lib/admin/imports/contracts";
import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { requireAdminSession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANCEL_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === getTrustedAppBaseUrl();
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "invalid_origin" }, { headers: CANCEL_HEADERS, status: 403 });
  }
  const bodyBytes = await readRequestBytesAtMost(request, 64 * 1024);
  if (bodyBytes === null) {
    return Response.json({ error: "request_too_large" }, { headers: CANCEL_HEADERS, status: 413 });
  }
  if (bodyBytes.byteLength > 0) {
    return Response.json({ error: "invalid_request" }, { headers: CANCEL_HEADERS, status: 400 });
  }
  const session = await requireAdminSession();
  const { importId } = await context.params;
  if (!isImportIdUuid(importId)) {
    return Response.json({ error: "invalid_import_id" }, { headers: CANCEL_HEADERS, status: 400 });
  }

  try {
    const result = await cancelEnrollmentImport({
      actorUserId: session.user.id,
      importId,
    });
    revalidatePath("/admin");
    revalidatePath("/admin/imports");
    return Response.json(result, { headers: CANCEL_HEADERS });
  } catch (error) {
    if (error instanceof EnrollmentImportCancellationError) {
      return Response.json(
        { error: error.code },
        { headers: CANCEL_HEADERS, status: error.code === "import_not_found" ? 404 : 409 },
      );
    }
    return Response.json({ error: "import_cancel_unavailable" }, { headers: CANCEL_HEADERS, status: 500 });
  }
}

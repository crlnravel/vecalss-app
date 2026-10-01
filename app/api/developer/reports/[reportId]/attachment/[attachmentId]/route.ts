import { getSessionContext } from "@/lib/auth/session";
import { readPrivateReportAttachment } from "@/lib/media/r2";
import { createReportAttachmentResponse } from "@/lib/reports/attachment-http";
import { hasDeveloperReportAccess } from "@/lib/reports/access";
import { getDeveloperReportAttachmentForAccess } from "@/lib/reports/queries";
import { REPORT_ATTACHMENT_MAX_SIZE_BYTES } from "@/lib/reports/validation";

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string; reportId: string }> },
) {
  const session = await getSessionContext();
  if (!session) return new Response(null, { status: 401 });
  if (!hasDeveloperReportAccess(session.user.roles, session.user.mustChangePassword)) {
    return new Response(null, { status: 403 });
  }

  const { attachmentId, reportId } = await params;
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode !== "preview" && mode !== "download") {
    return new Response(null, { status: 400 });
  }

  const attachment = await getDeveloperReportAttachmentForAccess(reportId, attachmentId);
  if (
    !attachment
    || !ALLOWED_CONTENT_TYPES.has(attachment.contentType)
    || attachment.sizeBytes <= 0
    || attachment.sizeBytes > REPORT_ATTACHMENT_MAX_SIZE_BYTES
  ) {
    return new Response(null, { status: 404 });
  }

  try {
    const bytes = await readPrivateReportAttachment(attachment.key, REPORT_ATTACHMENT_MAX_SIZE_BYTES);
    if (bytes.byteLength !== attachment.sizeBytes) return new Response(null, { status: 404 });

    return createReportAttachmentResponse(bytes, attachment, mode);
  } catch {
    return new Response(null, { status: 503 });
  }
}

export { GET };

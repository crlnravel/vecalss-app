import "server-only";

import { readPrivateReportAttachment } from "@/lib/media/r2";

import { createReportAttachmentResponse } from "./attachment-http";
import { hasAdminReportAccess } from "./access";
import { getAdminReportAttachmentForAccess, type ReportSession } from "./queries";
import { REPORT_ATTACHMENT_MAX_SIZE_BYTES } from "./validation";

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Answers a request for one report attachment. The route hands in the session it
 * read from the cookie: anonymous is 401, everyone but a verified admin with a
 * settled password is 403. Kept apart from the route so a test can call it
 * without a request scope.
 */
async function serveAdminReportAttachment({
  attachmentId,
  mode,
  reportId,
  session,
}: {
  attachmentId: string;
  mode: string | null;
  reportId: string;
  session: ReportSession;
}) {
  if (!session) return new Response(null, { status: 401 });
  if (!hasAdminReportAccess(session.user.roles, session.user.mustChangePassword)) {
    return new Response(null, { status: 403 });
  }

  if (mode !== "preview" && mode !== "download") {
    return new Response(null, { status: 400 });
  }

  const attachment = await getAdminReportAttachmentForAccess(reportId, attachmentId, session);
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

export { serveAdminReportAttachment };

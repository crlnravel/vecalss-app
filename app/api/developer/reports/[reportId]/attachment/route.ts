import { getSessionContext } from "@/lib/auth/session";
import { readPrivateReportAttachment } from "@/lib/media/r2";
import { getDeveloperReportAttachmentForDownload } from "@/lib/reports/queries";
import { hasDeveloperReportAccess } from "@/lib/reports/access";
import { REPORT_ATTACHMENT_MAX_SIZE_BYTES } from "@/lib/reports/validation";

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function contentDispositionForAttachment(fileName: string) {
  const asciiName = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/gu, "_")
    .replace(/[\\";/]/gu, "_")
    .replace(/[\r\n]/gu, "_")
    .slice(0, 180) || "lampiran";
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/gu, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const session = await getSessionContext();
  if (!session) return new Response(null, { status: 401 });
  if (!hasDeveloperReportAccess(session.user.roles, session.user.mustChangePassword)) {
    return new Response(null, { status: 403 });
  }

  const { reportId } = await params;
  const attachment = await getDeveloperReportAttachmentForDownload(reportId);
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

    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": contentDispositionForAttachment(attachment.fileName),
        "Content-Length": String(bytes.byteLength),
        "Content-Type": attachment.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}

export { GET };

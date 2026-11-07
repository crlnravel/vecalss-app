import { getSessionContext } from "@/lib/auth/session";
import { serveAdminReportAttachment } from "@/lib/reports/attachment-route";

async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string; reportId: string }> },
) {
  const session = await getSessionContext();
  const { attachmentId, reportId } = await params;

  return serveAdminReportAttachment({
    attachmentId,
    mode: new URL(request.url).searchParams.get("mode"),
    reportId,
    session,
  });
}

export { GET };

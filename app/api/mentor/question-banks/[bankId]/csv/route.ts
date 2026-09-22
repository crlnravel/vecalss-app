import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { exportQuestionBankCsv } from "@/lib/question-bank/csv-repository";
import { isUuid } from "@/lib/resource-edit-lock/canonical";
import { responseForCsvCode } from "@/lib/question-bank/csv-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPORT_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/csv; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ bankId: string }> },
) {
  void request;
  const session = await getReadOnlySessionContext();
  if (!session) return responseForCsvCode("unauthenticated", 401);
  if (!hasRole(session, RoleName.tutor)) return responseForCsvCode("resource_inaccessible", 403);
  const { bankId } = await context.params;
  if (!isUuid(bankId)) return responseForCsvCode("resource_inaccessible", 403);
  const result = await exportQuestionBankCsv(session.user.id, bankId);
  if (!result) return responseForCsvCode("resource_inaccessible", 403);
  return new Response(result.bytes, {
    headers: {
      ...EXPORT_HEADERS,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Content-Length": String(result.bytes.byteLength),
    },
  });
}

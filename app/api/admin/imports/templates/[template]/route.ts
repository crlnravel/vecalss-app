import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import {
  getImportTemplateDefinition,
  templateCsv,
} from "@/lib/admin/imports/contracts";
import { requireAdminReadOnlySession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/csv; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }
  try {
    return origin === getTrustedAppBaseUrl();
  } catch {
    return false;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ template: string }> },
) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "invalid_origin" }, { headers: TEMPLATE_HEADERS, status: 403 });
  }

  await requireAdminReadOnlySession();
  const { template } = await context.params;
  const definition = getImportTemplateDefinition(template);
  if (!definition) {
    return Response.json({ error: "invalid_template" }, { headers: TEMPLATE_HEADERS, status: 404 });
  }

  return new Response(templateCsv(definition), {
    headers: {
      ...TEMPLATE_HEADERS,
      "Content-Disposition": `attachment; filename="${definition.fileName}"`,
    },
  });
}

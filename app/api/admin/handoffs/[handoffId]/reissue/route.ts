import { EnrollmentHandoffMethod } from "@/generated/prisma/client";
import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import { reissueEnrollmentHandoff } from "@/lib/admin/handoffs/service";
import { isUuid } from "@/lib/admin/operations/validation";
import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { requireAdminSession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDOFF_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const MAX_HANDOFF_REQUEST_BYTES = 64 * 1024;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return false;

  try {
    return origin === getTrustedAppBaseUrl();
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ handoffId: string }> },
) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "invalid_request" }, { headers: HANDOFF_HEADERS, status: 403 });
  }

  const { handoffId } = await context.params;
  if (!isUuid(handoffId)) {
    return Response.json({ error: "invalid_handoff_id" }, { headers: HANDOFF_HEADERS, status: 400 });
  }

  const session = await requireAdminSession();
  let method: EnrollmentHandoffMethod | undefined;

  const bodyBytes = await readRequestBytesAtMost(request, MAX_HANDOFF_REQUEST_BYTES);
  if (bodyBytes === null) {
    return Response.json({ error: "request_too_large" }, { headers: HANDOFF_HEADERS, status: 413 });
  }

  if (bodyBytes.byteLength > 0) {
    try {
      const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes));
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return Response.json({ error: "invalid_request" }, { headers: HANDOFF_HEADERS, status: 400 });
      }

      const bodyKeys = Object.keys(body).sort();
      if (bodyKeys.length > 1 || (bodyKeys.length === 1 && bodyKeys[0] !== "method")) {
        return Response.json({ error: "invalid_request" }, { headers: HANDOFF_HEADERS, status: 400 });
      }

      const candidate = body as { method?: unknown };
      if ("method" in candidate) {
        if (candidate.method !== EnrollmentHandoffMethod.invite_link && candidate.method !== EnrollmentHandoffMethod.temporary_password) {
          return Response.json({ error: "invalid_request" }, { headers: HANDOFF_HEADERS, status: 400 });
        }
        method = candidate.method;
      }
    } catch {
      return Response.json({ error: "invalid_request" }, { headers: HANDOFF_HEADERS, status: 400 });
    }
  }

  try {
    const result = await reissueEnrollmentHandoff({
      actorUserId: session.user.id,
      handoffId,
      method,
    });

    return Response.json({
      recoverableByImportFile: result.recoverableByImportFile,
      handoffId: result.handoffId,
      inviteUrl: result.inviteUrl,
      method: result.method,
      temporaryPassword: result.method === EnrollmentHandoffMethod.temporary_password ? result.secret : null,
      userId: result.userId,
    }, { headers: HANDOFF_HEADERS });
  } catch {
    return Response.json({ error: "handoff_unavailable" }, { headers: HANDOFF_HEADERS, status: 409 });
  }
}

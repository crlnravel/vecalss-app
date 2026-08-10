import { EnrollmentHandoffMethod } from "@/generated/prisma/client";
import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import {
  confirmEnrollmentImport,
  EnrollmentImportConfirmationError,
} from "@/lib/admin/imports/service";
import { isImportIdUuid } from "@/lib/admin/imports/contracts";
import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { requireAdminSession } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM_HEADERS = {
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

function response(code: string, status: number) {
  return Response.json({ error: code }, { headers: CONFIRM_HEADERS, status });
}

function errorStatus(code: string) {
  if (code === "import_not_found") return 404;
  if (code === "invalid_handoff_method") return 400;
  if (code === "invalid_rows_pending_skip" || code === "invalid_import_state" || code === "import_not_draft") return 409;
  return 400;
}

export function isConfirmSameOrigin(request: Request) {
  return sameOrigin(request);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  if (!sameOrigin(request)) {
    return response("invalid_origin", 403);
  }

  const session = await requireAdminSession();
  const { importId } = await context.params;
  if (!isImportIdUuid(importId)) {
    return response("invalid_import_id", 400);
  }

  const bodyBytes = await readRequestBytesAtMost(request, 64 * 1024);
  if (bodyBytes === null) {
    return response("request_too_large", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes));
  } catch {
    return response("invalid_request", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return response("invalid_request", 400);
  }

  const bodyKeys = Object.keys(body).sort();
  if (bodyKeys.length !== 1 || bodyKeys[0] !== "handoffMethod") {
    return response("invalid_request", 400);
  }

  const candidate = body as { handoffMethod?: unknown };
  if (
    candidate.handoffMethod !== EnrollmentHandoffMethod.invite_link
    && candidate.handoffMethod !== EnrollmentHandoffMethod.temporary_password
  ) {
    return response("invalid_handoff_method", 400);
  }

  try {
    const result = await confirmEnrollmentImport({
      actorUserId: session.user.id,
      handoffMethod: candidate.handoffMethod,
      importId,
    });

    return Response.json({
      import: {
        generation: result.generation,
        handoffMethod: result.handoffMethod,
        idempotent: result.idempotent,
        importId: result.importId,
        queueJobId: result.queueJobId,
        status: result.status,
      },
    }, { headers: CONFIRM_HEADERS });
  } catch (error) {
    if (error instanceof EnrollmentImportConfirmationError) {
      return response(error.code, errorStatus(error.code));
    }
    return response("import_confirmation_unavailable", 500);
  }
}

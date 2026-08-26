import { requireAdminSession } from "@/lib/auth/access";

import { createAiPolicyCommandService } from "@/lib/admin/ai-policy/service";
import {
  actorFromSession,
  exactKeys,
  invalidRequest,
  optionalString,
  readPolicyBody,
  requestId,
  requiredRevision,
  responseForPolicyError,
  responseForPolicyResult,
} from "@/lib/admin/ai-policy/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ bundleId: string }> },
) {
  const session = await requireAdminSession();
  try {
    const { bundleId } = await context.params;
    const result = await createAiPolicyCommandService().readBundle(actorFromSession(session), bundleId);
    return responseForPolicyResult({ bundle: result });
  } catch (error) {
    return responseForPolicyError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ bundleId: string }> },
) {
  const session = await requireAdminSession();
  try {
    const { bundleId } = await context.params;
    const body = await readPolicyBody(request);
    exactKeys(body, ["clientRequestId", "expectedRevision", "patch", "reason"], ["clientRequestId", "expectedRevision", "patch"]);
    if (!body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) {
      invalidRequest("Patch kebijakan tidak valid.");
    }
    const result = await createAiPolicyCommandService().editDraft(actorFromSession(session), {
      bundleId,
      clientRequestId: requestId(body.clientRequestId),
      expectedRevision: requiredRevision(body.expectedRevision),
      patch: body.patch as Record<string, unknown>,
      reason: optionalString(body.reason, "reason"),
    });
    return responseForPolicyResult(result);
  } catch (error) {
    return responseForPolicyError(error);
  }
}

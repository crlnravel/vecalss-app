import { requireAdminSession } from "@/lib/auth/access";

import { createAiPolicyCommandService } from "@/lib/admin/ai-policy/service";
import {
  actorFromSession,
  exactKeys,
  optionalString,
  readPolicyBody,
  requestId,
  requiredRevision,
  responseForPolicyError,
  responseForPolicyResult,
  requiredString,
} from "@/lib/admin/ai-policy/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ bundleId: string }> },
) {
  const session = await requireAdminSession();
  try {
    const { bundleId } = await context.params;
    const body = await readPolicyBody(request);
    exactKeys(body, ["clientRequestId", "expectedRevision", "validationDigest", "reason"], ["clientRequestId", "expectedRevision", "validationDigest"]);
    const result = await createAiPolicyCommandService().approveDraft(actorFromSession(session), {
      bundleId,
      clientRequestId: requestId(body.clientRequestId),
      expectedRevision: requiredRevision(body.expectedRevision),
      validationDigest: requiredString(body.validationDigest, "validationDigest", 128),
      reason: optionalString(body.reason, "reason"),
    });
    return responseForPolicyResult(result);
  } catch (error) {
    return responseForPolicyError(error);
  }
}

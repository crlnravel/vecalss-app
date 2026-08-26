import { requireAdminSession } from "@/lib/auth/access";

import { createAiPolicyCommandService } from "@/lib/admin/ai-policy/service";
import {
  actorFromSession,
  exactKeys,
  readPolicyBody,
  requestId,
  requiredString,
  responseForPolicyError,
  responseForPolicyResult,
} from "@/lib/admin/ai-policy/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAdminSession();
  try {
    const body = await readPolicyBody(request);
    exactKeys(body, ["clientRequestId", "targetReference", "requestedUpperBound", "reason"]);
    const result = await createAiPolicyCommandService().requestRetentionExtension(actorFromSession(session), {
      clientRequestId: requestId(body.clientRequestId),
      targetReference: requiredString(body.targetReference, "targetReference", 160),
      requestedUpperBound: requiredString(body.requestedUpperBound, "requestedUpperBound", 64),
      reason: requiredString(body.reason, "reason"),
    });
    return responseForPolicyResult(result, 202);
  } catch (error) {
    return responseForPolicyError(error);
  }
}

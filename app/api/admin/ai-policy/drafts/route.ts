import { requireAdminSession } from "@/lib/auth/access";

import { createAiPolicyCommandService } from "@/lib/admin/ai-policy/service";
import {
  actorFromSession,
  exactKeys,
  optionalString,
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
    exactKeys(body, ["clientRequestId", "sourceBundleId", "reason"], ["clientRequestId", "reason"]);
    const result = await createAiPolicyCommandService().createDraft(actorFromSession(session), {
      clientRequestId: requestId(body.clientRequestId),
      sourceBundleId: optionalString(body.sourceBundleId, "sourceBundleId", 80),
      reason: requiredString(body.reason, "reason"),
    });
    return responseForPolicyResult(result, 200);
  } catch (error) {
    return responseForPolicyError(error);
  }
}

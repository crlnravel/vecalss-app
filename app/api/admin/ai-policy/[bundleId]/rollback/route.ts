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

export async function POST(
  request: Request,
  context: { params: Promise<{ bundleId: string }> },
) {
  const session = await requireAdminSession();
  try {
    const { bundleId } = await context.params;
    const body = await readPolicyBody(request);
    exactKeys(body, ["clientRequestId", "reason"]);
    const result = await createAiPolicyCommandService().rollback(actorFromSession(session), {
      bundleId,
      clientRequestId: requestId(body.clientRequestId),
      reason: requiredString(body.reason, "reason"),
    });
    return responseForPolicyResult(result);
  } catch (error) {
    return responseForPolicyError(error);
  }
}

import { requireAdminSession } from "@/lib/auth/access";

import { createAiPolicyCommandService } from "@/lib/admin/ai-policy/service";
import {
  actorFromSession,
  exactKeys,
  invalidRequest,
  readPolicyBody,
  requestId,
  requiredRevision,
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
    exactKeys(body, ["clientRequestId", "expectedRevision", "validationDigest", "mode", "range"], ["clientRequestId", "expectedRevision", "validationDigest", "mode"]);
    if (body.mode !== "categorical" && body.mode !== "aggregate") {
      invalidRequest("Mode preview tidak valid.");
    }
    const result = await createAiPolicyCommandService().previewDraft(actorFromSession(session), {
      bundleId,
      clientRequestId: requestId(body.clientRequestId),
      expectedRevision: requiredRevision(body.expectedRevision),
      validationDigest: requiredString(body.validationDigest, "validationDigest", 128),
      mode: body.mode,
      range: body.range && typeof body.range === "object" && !Array.isArray(body.range)
        ? body.range as { from: string; to: string; timezone: string }
        : undefined,
    });
    return responseForPolicyResult(result);
  } catch (error) {
    return responseForPolicyError(error);
  }
}

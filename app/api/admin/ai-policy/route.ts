import { requireAdminSession } from "@/lib/auth/access";

import { actorFromSession, responseForPolicyError, responseForPolicyResult, AI_POLICY_HTTP_HEADERS } from "@/lib/admin/ai-policy/http";
import { createAiPolicyCommandService } from "@/lib/admin/ai-policy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdminSession();
  try {
    const metadata = await createAiPolicyCommandService().getMetadata(actorFromSession(session));
    return responseForPolicyResult({ metadata }, 200);
  } catch (error) {
    return responseForPolicyError(error);
  }
}

export function HEAD() {
  return new Response(null, { headers: AI_POLICY_HTTP_HEADERS });
}

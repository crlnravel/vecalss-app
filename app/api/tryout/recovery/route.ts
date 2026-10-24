import { getReadOnlySessionContext } from "@/lib/auth/session";
import { serveParticipantRecoveryRequest } from "@/lib/tryout/participant-recovery-http";
import { participantActionRecoveryState } from "@/lib/tryout/participant-recovery-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return serveParticipantRecoveryRequest(request, { getSession: getReadOnlySessionContext, read: participantActionRecoveryState });
}

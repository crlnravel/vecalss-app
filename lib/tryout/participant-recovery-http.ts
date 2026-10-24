import type { SessionContext } from "@/lib/auth/types";
import type { ParticipantRecoveryScope, ParticipantRecoverySnapshot } from "@/lib/tryout/participant-action-recovery";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function recoveryScope(request: Request): ParticipantRecoveryScope | null {
  const query = new URL(request.url).searchParams;
  for (const key of query.keys()) {
    if (!["kind", "tryoutId", "sessionId"].includes(key) || query.getAll(key).length !== 1) return null;
  }
  const kind = query.get("kind");
  const tryoutId = query.get("tryoutId");
  const sessionId = query.get("sessionId");
  if (!tryoutId || !uuid.test(tryoutId) || (sessionId !== null && !uuid.test(sessionId))) return null;
  if (kind === "start") return sessionId ? { kind, tryoutId, sessionId } : null;
  return kind === "register" ? { kind, tryoutId, ...(sessionId ? { sessionId } : {}) } : null;
}

/** Public GET boundary, also used by route behavior tests with session/DB boundaries. */
export async function serveParticipantRecoveryRequest(request: Request, dependencies: {
  getSession: () => Promise<SessionContext | null>;
  read: (scope: ParticipantRecoveryScope, studentId: string) => Promise<ParticipantRecoverySnapshot>;
}) {
  const unavailable = (status: number) => Response.json({ ok: false }, { headers: responseHeaders, status });
  try {
    if (request.method !== "GET") return unavailable(405);
    const session = await dependencies.getSession();
    if (!session || session.expiresAt <= new Date()) return unavailable(401);
    if (!session.user.roles.includes("student") || session.user.status !== "active" || session.user.mustChangePassword || session.user.onboardingStatus === null || session.user.onboardingStatus === "not_started") return unavailable(403);
    const scope = recoveryScope(request);
    if (!scope) return unavailable(400);
    return Response.json({ ok: true, snapshot: await dependencies.read(scope, session.user.id) }, { headers: responseHeaders });
  } catch {
    return unavailable(503);
  }
}

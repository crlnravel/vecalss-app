import type { SessionContext } from "@/lib/auth/types";
import { isUuid } from "@/lib/resource-edit-lock/canonical";
import type { TryoutResultReadinessScope, TryoutSessionReadiness } from "@/lib/tryout/result-readiness";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function serveTryoutReadinessInspection(request: Request, dependencies: {
  getSession: () => Promise<SessionContext | null>;
  authorize: (session: SessionContext) => { allowCrossOwner: boolean };
  read: (scope: TryoutResultReadinessScope, actorId: string, allowCrossOwner: boolean, requestId?: string) => Promise<TryoutSessionReadiness | null>;
}) {
  const unavailable = (status: number) => Response.json({ ok: false }, { headers, status });
  try {
    if (request.method !== "GET") return unavailable(405);
    const session = await dependencies.getSession();
    if (!session || session.expiresAt <= new Date()) return unavailable(401);
    if (session.user.status !== "active" || session.user.mustChangePassword) return unavailable(403);
    let authorization: { allowCrossOwner: boolean };
    try { authorization = dependencies.authorize(session); } catch { return unavailable(403); }
    const query = new URL(request.url).searchParams;
    if (!query.has("tryoutId") || !query.has("sessionId") || query.size < 2 || query.size > 3 || [...query.keys()].some((key) => !["tryoutId", "sessionId", "requestId"].includes(key) || query.getAll(key).length !== 1 || !uuid.test(query.get(key) ?? ""))) return unavailable(400);
    if (query.has("requestId") && !isUuid(query.get("requestId")!)) return unavailable(400);
    const snapshot = await dependencies.read({ tryoutId: query.get("tryoutId")!, sessionId: query.get("sessionId")! }, session.user.id, authorization.allowCrossOwner, query.get("requestId")?.toLowerCase());
    return snapshot ? Response.json({ ok: true, snapshot }, { headers }) : unavailable(404);
  } catch { return unavailable(503); }
}

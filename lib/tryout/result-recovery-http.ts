import type { SessionContext } from "@/lib/auth/types";
import type { TryoutResultRecoveryScope, TryoutResultRecoverySnapshot } from "@/lib/tryout/result-recovery";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTryoutCalculationScope(value: unknown): TryoutResultRecoveryScope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 3 || !["attemptId", "sessionId", "tryoutId"].every((key) => typeof data[key] === "string" && uuid.test(data[key] as string))) return null;
  return { attemptId: data.attemptId as string, sessionId: data.sessionId as string, tryoutId: data.tryoutId as string };
}

/** Public GET boundary with no session heartbeat/profile writes and no Server Action dispatch. */
export async function serveTryoutCalculationInspection(request: Request, dependencies: {
  getSession: () => Promise<SessionContext | null>;
  read: (scope: TryoutResultRecoveryScope, actorId: string, allowCrossOwner: boolean) => Promise<TryoutResultRecoverySnapshot | null>;
}) {
  const unavailable = (status: number) => Response.json({ ok: false }, { headers, status });
  try {
    if (request.method !== "GET") return unavailable(405);
    const session = await dependencies.getSession();
    if (!session || session.expiresAt <= new Date()) return unavailable(401);
    if (session.user.status !== "active" || session.user.mustChangePassword || !session.user.roles.some((role) => role === "tutor" || role === "admin")) return unavailable(403);
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => query.getAll(key).length !== 1)) return unavailable(400);
    const scope = parseTryoutCalculationScope(Object.fromEntries(query));
    if (!scope) return unavailable(400);
    const snapshot = await dependencies.read(scope, session.user.id, session.user.roles.includes("admin"));
    return snapshot ? Response.json({ ok: true, snapshot }, { headers }) : unavailable(404);
  } catch { return unavailable(503); }
}

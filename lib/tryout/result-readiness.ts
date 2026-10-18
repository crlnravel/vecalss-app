export type TryoutPolicyBaseline = { auditCount: number; policy: string };
export function isTryoutPolicyBaseline(value: unknown): value is TryoutPolicyBaseline {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const baseline = value as TryoutPolicyBaseline;
  return Object.keys(value).length === 2 && Number.isSafeInteger(baseline.auditCount) && baseline.auditCount >= 0 && ["inherit", "immediate", "manual", "automatic_at_end", "scheduled"].includes(baseline.policy);
}
export type TryoutDefaultResultPolicy = "immediate" | "manual" | "automatic_at_end";
export type TryoutResultReadinessScope = { tryoutId: string; sessionId: string };
export type TryoutPolicyInspectionScope = TryoutResultReadinessScope & { requestId?: string };
export type TryoutReadinessBlocker = { category: "session" | "end" | "empty" | "unfinished" | "binding" | "scoring" | "explanations" | "published"; attemptId: string | null; section: number | null; message: string };
export type TryoutPolicyReceipt = { id: string; expectedBaseline?: TryoutPolicyBaseline; configuredAt: string; reason: string; policy: TryoutDefaultResultPolicy };
export type TryoutSessionReadiness = {
  scope: TryoutResultReadinessScope;
  sessionName: string;
  availableUntil: string;
  serverNow: string;
  effectivePolicy: string;
  inherited: boolean;
  ready: boolean;
  counts: { attempts: number; candidates: number; ready: number; blocked: number; excluded: number; void: number; abandoned: number; noAttempt: number };
  blockers: TryoutReadinessBlocker[];
  publication: { releasedAt: string; actorId: string | null; reason: string | null } | null;
  policy: { baseline: TryoutPolicyBaseline; editable: boolean; reason: string | null; value: string; receipt: TryoutPolicyReceipt | null; intentReceipt?: TryoutPolicyReceipt | null; sessions: Array<{ id: string; name: string; inherited: boolean; effectivePolicy: string }> };
};

export async function readTryoutSessionReadiness(scope: TryoutPolicyInspectionScope, fetcher: typeof fetch = fetch): Promise<{ ok: true; snapshot: TryoutSessionReadiness } | { ok: false }> {
  const query = new URLSearchParams({ tryoutId: scope.tryoutId, sessionId: scope.sessionId });
  if (scope.requestId) query.set("requestId", scope.requestId);
  const response = await fetcher(`/api/mentor/tryout/result-readiness?${query}`, { method: "GET", cache: "no-store", credentials: "same-origin" });
  return response.ok ? response.json() : { ok: false };
}

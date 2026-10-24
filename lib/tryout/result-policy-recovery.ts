import { readTryoutSessionReadiness, type TryoutPolicyBaseline, type TryoutDefaultResultPolicy, type TryoutPolicyReceipt, type TryoutPolicyInspectionScope, type TryoutResultReadinessScope, type TryoutSessionReadiness } from "@/lib/tryout/result-readiness";

export type TryoutPolicyIntent = TryoutResultReadinessScope & { requestId: string; expectedBaseline: TryoutPolicyBaseline; policy: TryoutDefaultResultPolicy; reason: string };
export type TryoutPolicyReply = { ok: true; receipt: TryoutPolicyReceipt } | { ok: false; confirmedRefusal: boolean; message: string };
export type TryoutPolicyReadReply = Awaited<ReturnType<typeof readTryoutSessionReadiness>>;
type PolicyState = { phase: "idle" | "writing" | "reading" | "unknown" | "retry" | "refused" | "saved" | "blocked"; intent: TryoutPolicyIntent | null; writePending: boolean; receipt: TryoutPolicyReceipt | null; message: string | null };
const initial: PolicyState = { phase: "idle", intent: null, writePending: false, receipt: null, message: null };
const unknown = "Hasil penyimpanan belum dapat dipastikan. Periksa status sebelum mengirim ulang.";
export const TRYOUT_POLICY_DEADLINE_MS = 15_000;

/** One immutable intent survives timeout. Independent inspection never shares the write queue. */
export function createTryoutPolicyRecovery(dependencies: {
  write: (intent: TryoutPolicyIntent) => Promise<TryoutPolicyReply>;
  read: (scope: TryoutPolicyInspectionScope) => Promise<TryoutPolicyReadReply>;
  schedule?: (callback: () => void, ms: number) => () => void;
}) {
  let state = initial;
  let active = false;
  let generation = 0;
  let transport = 0;
  const listeners = new Set<() => void>();
  const cancellations = new Set<() => void>();
  const publish = (next: PolicyState) => { state = next; listeners.forEach((notify) => notify()); };
  const schedule = dependencies.schedule ?? ((callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); });
  const busy = () => state.phase === "writing" || state.phase === "reading";
  const matchesReceipt = (receipt: TryoutPolicyReceipt | null | undefined, intent: TryoutPolicyIntent) => Boolean(receipt && receipt.id.toLowerCase() === intent.requestId.toLowerCase() && receipt.expectedBaseline?.auditCount === intent.expectedBaseline.auditCount && receipt.expectedBaseline?.policy === intent.expectedBaseline.policy && receipt.policy === intent.policy && receipt.reason === intent.reason.trim());
  async function bounded<T>(promise: Promise<T>) {
    let cancel = () => {};
    const deadline = new Promise<null>((resolve) => {
      const stop = schedule(() => resolve(null), TRYOUT_POLICY_DEADLINE_MS);
      cancel = () => { stop(); resolve(null); }; cancellations.add(cancel);
    });
    try { return await Promise.race([promise.then((value) => ({ value })), deadline]); }
    finally { cancel(); cancellations.delete(cancel); }
  }
  async function write(intent: TryoutPolicyIntent) {
    const current = ++generation;
    const currentTransport = ++transport;
    publish({ ...initial, phase: "writing", intent, writePending: true });
    const request = Promise.resolve().then(() => dependencies.write(intent)).catch((): TryoutPolicyReply => ({ ok: false, confirmedRefusal: false, message: unknown }));
    void request.then((reply) => {
      if (!active || currentTransport !== transport || state.intent !== intent || state.phase === "writing") return;
      if (state.phase === "saved") { publish({ ...state, writePending: false }); return; }
      if (!reply.ok && reply.confirmedRefusal) {
        generation++; cancellations.forEach((cancel) => cancel());
        publish({ ...initial, phase: "refused", message: reply.message });
      } else publish({ ...state, writePending: false, ...(state.phase === "retry" ? { phase: "unknown", message: unknown } : {}) });
    });
    const response = await bounded(request);
    if (!active || current !== generation) return null;
    if (!response) { publish({ ...state, phase: "unknown", message: unknown }); return null; }
    if (response.value.ok) {
      if (!matchesReceipt(response.value.receipt, intent)) { publish({ ...state, phase: "unknown", writePending: false, message: unknown }); return null; }
      publish({ ...state, phase: "saved", writePending: false, receipt: response.value.receipt, message: "Aturan rilis hasil tersimpan." }); return response.value;
    }
    publish(response.value.confirmedRefusal ? { ...initial, phase: "refused", message: response.value.message } : { ...state, phase: "unknown", writePending: false, message: unknown });
    return null;
  }
  async function inspect(): Promise<TryoutSessionReadiness | null> {
    if (!active || busy() || !state.intent || state.phase === "saved") return null;
    const intent = state.intent; const current = ++generation;
    publish({ ...state, phase: "reading" });
    const response = await bounded(Promise.resolve().then(() => dependencies.read({ tryoutId: intent.tryoutId, sessionId: intent.sessionId, requestId: intent.requestId })).catch((): TryoutPolicyReadReply => ({ ok: false })));
    if (!active || current !== generation) return null;
    if (!response?.value.ok || response.value.snapshot.scope.tryoutId !== intent.tryoutId || response.value.snapshot.scope.sessionId !== intent.sessionId) {
      publish({ ...state, phase: "unknown", message: "Status belum dapat diperiksa. Periksa koneksi, lalu coba pemeriksaan lagi." }); return null;
    }
    const snapshot = response.value.snapshot;
    const receipt = snapshot.policy.intentReceipt;
    const saved = matchesReceipt(receipt, intent);
    // A matching authoritative receipt resolves this intent even if its write
    // response is lost forever. Retire that transport before permitting edits;
    // any later response belongs to an older generation and must be ignored.
    if (saved) { transport++; generation++; }
    const phase = saved ? "saved" : state.writePending ? "unknown" : snapshot.policy.editable ? "retry" : "blocked";
    publish({ ...state, phase, writePending: saved ? false : state.writePending, receipt: saved ? receipt! : null, message: saved ? "Aturan rilis hasil tersimpan." : state.writePending ? "Penyimpanan sebelumnya masih menunggu jawaban. Periksa lagi sebelum mengirim ulang." : phase === "blocked" ? snapshot.policy.reason : "Perubahan belum tercatat. Pilihan dan alasan tetap tersedia untuk dikirim ulang." });
    return snapshot;
  }
  return {
    getSnapshot: () => state,
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    activate: () => { active = true; },
    dispose: () => { active = false; generation++; transport++; cancellations.forEach((cancel) => cancel()); },
    refreshed: () => { if (active && state.phase === "refused") publish(initial); },
    reset: () => { if (active && state.phase === "saved" && !state.writePending) publish(initial); },
    submit: async (intent: TryoutPolicyIntent) => { if (!active || busy() || state.intent || state.phase === "refused") return null; return write(Object.freeze({ ...intent, expectedBaseline: Object.freeze({ ...intent.expectedBaseline }), requestId: intent.requestId.toLowerCase() })); },
    inspect,
    replay: async () => {
      if (!active || state.phase !== "retry" || state.writePending || !state.intent) return null;
      await inspect();
      if (!active || state.phase !== "retry" || state.writePending || !state.intent) return null;
      return write(state.intent);
    },
  };
}

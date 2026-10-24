import type { TryoutPublicationReceipt, TryoutResultReadinessScope, TryoutSessionReadiness } from "@/lib/tryout/result-readiness";

export type TryoutPublicationIntent = TryoutResultReadinessScope & { reason: string };
export type TryoutPublicationReply = { ok: true; receipt: TryoutPublicationReceipt } | { ok: false; confirmedRefusal: boolean; message: string };
export type TryoutPublicationReadReply = { ok: true; snapshot: TryoutSessionReadiness } | { ok: false };
type State = { phase: "idle" | "writing" | "reading" | "unknown" | "retry" | "refused" | "saved" | "blocked"; intent: TryoutPublicationIntent | null; writePending: boolean; receipt: TryoutPublicationReceipt | null; message: string | null };
const initial: State = { phase: "idle", intent: null, writePending: false, receipt: null, message: null };
const unknown = "Hasil rilis belum dapat dipastikan. Periksa status sebelum mencoba lagi.";
export const TRYOUT_PUBLICATION_DEADLINE_MS = 15_000;
const sameScope = (a: TryoutResultReadinessScope, b: TryoutResultReadinessScope) => a.tryoutId === b.tryoutId && a.sessionId === b.sessionId;
const matches = (receipt: TryoutPublicationReceipt | null | undefined, intent: TryoutPublicationIntent) => Boolean(receipt && sameScope(receipt, intent) && receipt.id && receipt.actorId && Number.isFinite(Date.parse(receipt.releasedAt)) && Number.isSafeInteger(receipt.participantCount) && receipt.participantCount > 0);

/** Publication is immutable: the owned session receipt resolves any click for that bundle. */
export function createTryoutPublicationRecovery(dependencies: {
  write: (intent: TryoutPublicationIntent) => Promise<TryoutPublicationReply>;
  read: (scope: TryoutResultReadinessScope) => Promise<TryoutPublicationReadReply>;
  schedule?: (callback: () => void, ms: number) => () => void;
}) {
  let state = initial;
  let active = false;
  let generation = 0;
  let transport = 0;
  const listeners = new Set<() => void>();
  const cancellations = new Set<() => void>();
  const publish = (next: State) => { state = next; listeners.forEach((notify) => notify()); };
  const schedule = dependencies.schedule ?? ((callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); });
  const busy = () => state.phase === "writing" || state.phase === "reading";
  async function bounded<T>(promise: Promise<T>) {
    let cancel = () => {};
    const deadline = new Promise<null>((resolve) => { const stop = schedule(() => resolve(null), TRYOUT_PUBLICATION_DEADLINE_MS); cancel = () => { stop(); resolve(null); }; cancellations.add(cancel); });
    try { return await Promise.race([promise.then((value) => ({ value })), deadline]); }
    finally { cancel(); cancellations.delete(cancel); }
  }
  async function write(intent: TryoutPublicationIntent) {
    const current = ++generation; const currentTransport = ++transport;
    publish({ ...initial, phase: "writing", intent, writePending: true });
    const request = Promise.resolve().then(() => dependencies.write(intent)).catch((): TryoutPublicationReply => ({ ok: false, confirmedRefusal: false, message: unknown }));
    void request.then((reply) => {
      if (!active || currentTransport !== transport || state.intent !== intent || state.phase === "writing") return;
      if (!reply.ok && reply.confirmedRefusal) { generation++; cancellations.forEach((cancel) => cancel()); publish({ ...initial, phase: "refused", message: reply.message }); }
      else publish({ ...state, writePending: false, ...(state.phase === "retry" ? { phase: "unknown", message: unknown } : {}) });
    });
    const response = await bounded(request);
    if (!active || current !== generation) return null;
    if (!response) { publish({ ...state, phase: "unknown", message: unknown }); return null; }
    if (response.value.ok) {
      if (!matches(response.value.receipt, intent)) { publish({ ...state, phase: "unknown", writePending: false, message: unknown }); return null; }
      publish({ ...state, phase: "saved", writePending: false, receipt: response.value.receipt, message: "Hasil sesi sudah dirilis." }); return response.value;
    }
    publish(response.value.confirmedRefusal ? { ...initial, phase: "refused", message: response.value.message } : { ...state, phase: "unknown", writePending: false, message: unknown });
    return null;
  }
  async function inspect() {
    if (!active || busy() || !state.intent || state.phase === "saved") return null;
    const intent = state.intent; const current = ++generation;
    publish({ ...state, phase: "reading" });
    const response = await bounded(Promise.resolve().then(() => dependencies.read({ tryoutId: intent.tryoutId, sessionId: intent.sessionId })).catch((): TryoutPublicationReadReply => ({ ok: false })));
    if (!active || current !== generation) return null;
    if (!response?.value.ok || !sameScope(response.value.snapshot.scope, intent)) { publish({ ...state, phase: "unknown", message: "Status rilis belum dapat diperiksa. Periksa koneksi, lalu coba lagi." }); return null; }
    const snapshot = response.value.snapshot; const receipt = snapshot.publication?.receipt;
    const saved = matches(receipt, intent);
    if (saved) { transport++; generation++; }
    const phase = saved ? "saved" : state.writePending ? "unknown" : snapshot.ready && snapshot.effectivePolicy === "manual" && !snapshot.publication ? "retry" : "blocked";
    publish({ ...state, phase, receipt: saved ? receipt! : null, writePending: saved ? false : state.writePending, message: saved ? "Hasil sesi sudah dirilis." : state.writePending ? "Rilis sebelumnya masih menunggu jawaban. Periksa status sebelum mengirim ulang." : phase === "retry" ? "Rilis belum tercatat. Alasan tetap tersedia untuk dikirim ulang." : "Hasil belum dapat dirilis. Perbarui kesiapan dan periksa penghambatnya." });
    return snapshot;
  }
  return {
    getSnapshot: () => state,
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    activate: () => { active = true; },
    dispose: () => { active = false; generation++; transport++; cancellations.forEach((cancel) => cancel()); },
    submit: async (intent: TryoutPublicationIntent) => { if (!active || busy() || state.intent) return null; return write(Object.freeze({ ...intent })); },
    inspect,
    replay: async () => { if (!active || state.phase !== "retry" || state.writePending || !state.intent) return null; await inspect(); if (!active || state.phase !== "retry" || state.writePending || !state.intent) return null; return write(state.intent); },
  };
}

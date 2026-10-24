export type TryoutResultRecoveryScope = { tryoutId: string; sessionId: string; attemptId: string };
export type TryoutCalculationReceipt = { id: string; calculatedAt: string; reason: string };
export type TryoutResultRecoverySnapshot = {
  scope: TryoutResultRecoveryScope;
  state: "ready" | "calculated" | "released" | "blocked";
  receipt: TryoutCalculationReceipt | null;
  finalScore: number | null;
  message: string;
  sections: Array<{ sequenceNo: number; ready: boolean; message: string | null }>;
};
export type TryoutCalculationIntent = TryoutResultRecoveryScope & { reason: string };
export type TryoutCalculationReply = { ok: true; receipt: TryoutCalculationReceipt | null } | { ok: false; confirmedRefusal: boolean; message: string };
export type TryoutCalculationReadReply = { ok: true; snapshot: TryoutResultRecoverySnapshot } | { ok: false };
export const TRYOUT_CALCULATION_DEADLINE_MS = 15_000;

/** An ordinary authenticated GET can inspect a commit while its action response is held. */
export async function readTryoutCalculation(scope: TryoutResultRecoveryScope, fetcher: typeof fetch = fetch): Promise<TryoutCalculationReadReply> {
  const query = new URLSearchParams({ attemptId: scope.attemptId, sessionId: scope.sessionId, tryoutId: scope.tryoutId });
  const response = await fetcher(`/api/mentor/tryout/result-recovery?${query}`, { cache: "no-store", credentials: "same-origin", method: "GET" });
  if (!response.ok) return { ok: false };
  return await response.json() as TryoutCalculationReadReply;
}

type RecoveryState = {
  phase: "idle" | "writing" | "reading" | "unknown" | "retry" | "refused" | "saved" | "blocked";
  intent: TryoutCalculationIntent | null;
  writePending: boolean;
  message: string | null;
  receipt: TryoutCalculationReceipt | null;
};
const initial: RecoveryState = { phase: "idle", intent: null, writePending: false, message: null, receipt: null };
const unknown = "Hasil perhitungan belum dapat dipastikan. Periksa status sebelum mencoba lagi.";
const matches = (a: TryoutResultRecoveryScope, b: TryoutResultRecoveryScope) => a.attemptId === b.attemptId && a.tryoutId === b.tryoutId && a.sessionId === b.sessionId;

/** Owns one submitted reason/scope until refusal, persisted receipt or explicit same-intent replay. */
export function createTryoutCalculationRecovery(dependencies: {
  write: (intent: TryoutCalculationIntent) => Promise<TryoutCalculationReply>;
  read: (scope: TryoutResultRecoveryScope) => Promise<TryoutCalculationReadReply>;
  schedule?: (callback: () => void, ms: number) => () => void;
}) {
  let state = initial;
  let generation = 0;
  let writeGeneration = 0;
  let active = false;
  const listeners = new Set<() => void>();
  const cancellations = new Set<() => void>();
  const publish = (next: RecoveryState) => { state = next; listeners.forEach((notify) => notify()); };
  const schedule = dependencies.schedule ?? ((callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); });
  const busy = () => state.phase === "writing" || state.phase === "reading";
  async function bounded<T>(promise: Promise<T>) {
    let cancel = () => {};
    const deadline = new Promise<null>((resolve) => {
      const stop = schedule(() => resolve(null), TRYOUT_CALCULATION_DEADLINE_MS);
      cancel = () => { stop(); resolve(null); };
      cancellations.add(cancel);
    });
    try { return await Promise.race([promise.then((value) => ({ value })), deadline]); }
    finally { cancel(); cancellations.delete(cancel); }
  }
  async function write(intent: TryoutCalculationIntent) {
    const current = ++generation;
    const transport = ++writeGeneration;
    publish({ ...initial, phase: "writing", intent, writePending: true });
    const request = Promise.resolve().then(() => dependencies.write(intent)).catch((): TryoutCalculationReply => ({ ok: false, confirmedRefusal: false, message: unknown }));
    void request.then((reply) => {
      if (!active || transport !== writeGeneration || state.intent !== intent || state.phase === "writing") return;
      if (!reply.ok && reply.confirmedRefusal) {
        generation++;
        cancellations.forEach((cancel) => cancel());
        publish({ ...initial, phase: "refused", message: reply.message });
      } else {
        // Late success is reconciled by an explicit read, never by an old navigation/toast.
        publish({ ...state, writePending: false, ...(state.phase === "retry" ? { phase: "unknown", message: unknown } : {}) });
      }
    });
    const response = await bounded(request);
    if (!active || current !== generation) return null;
    if (!response) { publish({ ...state, phase: "unknown", message: unknown }); return null; }
    if (response.value.ok) {
      publish({ ...state, phase: "saved", writePending: false, receipt: response.value.receipt, message: "Skor sudah tersimpan. Hasil peserta tetap mengikuti aturan rilis sesi." });
      return response.value;
    }
    publish(response.value.confirmedRefusal ? { ...initial, phase: "refused", message: response.value.message } : { ...state, phase: "unknown", writePending: false, message: unknown });
    return null;
  }
  async function inspect() {
    if (!active || busy() || !state.intent) return null;
    const intent = state.intent;
    const current = ++generation;
    publish({ ...state, phase: "reading" });
    const response = await bounded(Promise.resolve().then(() => dependencies.read(intent)).catch((): TryoutCalculationReadReply => ({ ok: false })));
    if (!active || current !== generation) return null;
    if (!response?.value.ok || !matches(response.value.snapshot.scope, intent)) {
      publish({ ...state, phase: "unknown", message: "Status belum dapat diperiksa. Periksa koneksi, lalu coba pemeriksaan lagi." }); return null;
    }
    const snapshot = response.value.snapshot;
    const saved = snapshot.state === "calculated" || snapshot.state === "released";
    publish({ ...state, receipt: snapshot.receipt, phase: saved ? "saved" : state.writePending ? "unknown" : snapshot.state === "ready" ? "retry" : "blocked", message: state.writePending && !saved ? "Perhitungan sebelumnya masih menunggu jawaban. Periksa lagi nanti sebelum mengirim ulang." : snapshot.message });
    return snapshot;
  }
  return {
    getSnapshot: () => state,
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    activate: () => { active = true; },
    dispose: () => { active = false; generation++; writeGeneration++; cancellations.forEach((cancel) => cancel()); },
    submit: async (intent: TryoutCalculationIntent) => {
      if (!active || busy() || state.intent) return null;
      return write(Object.freeze({ ...intent }));
    },
    inspect,
    replay: async () => {
      if (!active || state.phase !== "retry" || state.writePending || !state.intent) return null;
      const snapshot = await inspect();
      if (!snapshot || state.phase !== "retry" || state.writePending || !state.intent) return null;
      return write(state.intent);
    },
  };
}

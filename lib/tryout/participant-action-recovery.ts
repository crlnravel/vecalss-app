export const PARTICIPANT_ACTION_DEADLINE_MS = 15_000;

export type ParticipantActionIntent =
  | { kind: "register"; tryoutId: string; sessionId?: string; target: { majorId: string; universityId: string } }
  | { kind: "start"; tryoutId: string; sessionId: string };

export type ParticipantRecoveryScope =
  | { kind: "register"; tryoutId: string; sessionId?: string }
  | { kind: "start"; tryoutId: string; sessionId: string };

export type ParticipantActionDestination =
  | { kind: "attempt"; attemptId: string; sessionId: string; result: boolean }
  | { kind: "waiting"; sessionId: string }
  | { kind: "detail" };

export type ParticipantRecoverySnapshot = {
  admission: { id: string; status: string } | null;
  assignment: { id: string; sessionId: string; status: string; availableFrom: string; availableUntil: string } | null;
  attempt: { id: string; status: string; serverDeadlineAt: string; assessmentReleaseId: string | null; assessmentReleaseNumber: number | null; assessmentReleaseDigest: string | null } | null;
  canRetry: boolean;
  destination: ParticipantActionDestination | null;
  message: string;
};

export type ParticipantActionWriteReply =
  | { ok: true; destination: ParticipantActionDestination }
  | { ok: false; confirmedRefusal: boolean; message: string };
export type ParticipantActionReadReply =
  | { ok: true; snapshot: ParticipantRecoverySnapshot }
  | { ok: false };
export type ParticipantActionRecoveryState = {
  phase: "idle" | "writing" | "unknown" | "reading" | "recovered" | "retry" | "blocked" | "refused" | "accepted";
  intent: ParticipantActionIntent | null;
  message: string | null;
  snapshot: ParticipantRecoverySnapshot | null;
  writePending: boolean;
};

const initialState: ParticipantActionRecoveryState = { phase: "idle", intent: null, message: null, snapshot: null, writePending: false };
const unknownMessage = "Hasil tindakanmu belum dapat dipastikan. Periksa status sebelum mencoba lagi.";

/** The components use this boundary for transport, deadlines and dispatch fencing. */
export function createParticipantActionRecovery({ write, read, schedule = (callback, ms) => {
  const timer = setTimeout(callback, ms);
  return () => clearTimeout(timer);
} }: {
  write: (intent: ParticipantActionIntent) => Promise<ParticipantActionWriteReply>;
  read: (intent: ParticipantActionIntent) => Promise<ParticipantActionReadReply>;
  schedule?: (callback: () => void, ms: number) => () => void;
}) {
  let state = initialState;
  let generation = 0;
  let writeGeneration = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const cancellations = new Set<() => void>();
  const publish = (next: ParticipantActionRecoveryState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const busy = () => state.phase === "writing" || state.phase === "reading";

  async function bounded<T>(request: Promise<T>): Promise<{ value: T } | null> {
    let cancel = () => {};
    const timeout = new Promise<null>((resolve) => {
      const stop = schedule(() => resolve(null), PARTICIPANT_ACTION_DEADLINE_MS);
      cancel = () => { stop(); resolve(null); };
      cancellations.add(cancel);
    });
    try { return await Promise.race([request.then((value) => ({ value })), timeout]); }
    finally { cancel(); cancellations.delete(cancel); }
  }

  async function performWrite(intent: ParticipantActionIntent) {
    const current = ++generation;
    const currentWrite = ++writeGeneration;
    publish({ phase: "writing", intent, snapshot: null, message: null, writePending: true });
    // Catch transport failure at the boundary. Rejection does not prove rollback.
    const request = (async () => write(intent))().catch((): ParticipantActionWriteReply => ({ ok: false, confirmedRefusal: false, message: unknownMessage }));
    void request.then((reply) => {
      if (disposed || currentWrite !== writeGeneration || state.intent !== intent) return;
      // A late receipt never navigates, declares rollback or applies old input.
      if (state.phase !== "writing") {
        if (!reply.ok && reply.confirmedRefusal) {
          // This receipt belongs to the retained intent and write generation.
          // Invalidate any concurrent inspection before unlocking correction.
          generation++;
          cancellations.forEach((cancel) => cancel());
          publish({ phase: "refused", intent: null, snapshot: null, message: reply.message, writePending: false });
          return;
        }
        publish({ ...state, writePending: false, ...(state.phase === "retry" ? { phase: "unknown", snapshot: null, message: unknownMessage } : {}) });
      }
    });
    const response = await bounded(request);
    if (disposed || current !== generation) return null;
    if (!response) {
      publish({ ...state, phase: "unknown", message: unknownMessage });
      return null;
    }
    if (response.value.ok) {
      publish({ ...state, phase: "accepted", writePending: false });
      return response.value.destination;
    }
    const refusal = response.value.confirmedRefusal;
    publish({ phase: refusal ? "refused" : "unknown", intent: refusal ? null : intent, snapshot: null, message: refusal ? response.value.message : unknownMessage, writePending: false });
    return null;
  }

  async function inspect() {
    if (disposed || busy() || !state.intent) return null;
    const intent = state.intent;
    const current = ++generation;
    publish({ ...state, phase: "reading", message: "Sedang memeriksa status…" });
    const response = await bounded(Promise.resolve().then(() => read(intent)).catch((): ParticipantActionReadReply => ({ ok: false })));
    if (disposed || current !== generation) return null;
    if (!response?.value.ok) {
      publish({ ...state, phase: "unknown", snapshot: null, message: "Status belum dapat diperiksa. Periksa koneksi, lalu periksa status lagi." });
      return null;
    }
    const snapshot = response.value.snapshot;
    const phase = snapshot.destination ? "recovered" : snapshot.canRetry && !state.writePending ? "retry" : state.writePending ? "unknown" : "blocked";
    publish({ ...state, phase, snapshot, message: state.writePending && !snapshot.destination ? "Tindakan sebelumnya masih menunggu jawaban. Periksa status lagi nanti; jangan mengirim ulang dulu." : snapshot.message });
    return snapshot;
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    activate: () => { disposed = false; },
    dispose: () => { disposed = true; generation++; writeGeneration++; cancellations.forEach((cancel) => cancel()); },
    submit: async (intent: ParticipantActionIntent) => {
      if (disposed || busy() || state.intent) return null;
      // Own the submitted value, so subsequent caller edits cannot alter a replay.
      const retained = intent.kind === "register" ? { ...intent, target: { ...intent.target } } : { ...intent };
      return performWrite(retained);
    },
    inspect,
    retry: async () => {
      if (disposed || state.phase !== "retry" || state.writePending || !state.intent) return null;
      // Each manual replay reads again: a previously available window may have ended.
      const snapshot = await inspect();
      if (!snapshot?.canRetry || state.phase !== "retry" || state.writePending || !state.intent) return null;
      return performWrite(state.intent);
    },
    continue: async () => {
      if (disposed || state.phase !== "recovered") return null;
      const snapshot = await inspect();
      return snapshot?.destination ?? null;
    },
  };
}

const MAIN_TRYOUT_SESSION_NAME = "Sesi utama";
const DEFAULT_MAIN_SESSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type MainTryoutSessionCandidate = {
  isDefaultOpenRegistration?: boolean;
  name?: string;
};

function isMainTryoutSession(session: MainTryoutSessionCandidate) {
  return session.name === MAIN_TRYOUT_SESSION_NAME || session.isDefaultOpenRegistration === true;
}

function selectMainTryoutSession<T extends MainTryoutSessionCandidate>(sessions: readonly T[]) {
  return sessions.find((session) => session.name === MAIN_TRYOUT_SESSION_NAME)
    ?? sessions.find((session) => session.isDefaultOpenRegistration === true)
    ?? sessions[0]
    ?? null;
}

function defaultMainSessionWindow(now = new Date()) {
  return {
    availableFrom: now,
    availableUntil: new Date(now.getTime() + DEFAULT_MAIN_SESSION_WINDOW_MS),
  };
}

/** History must start on a session with records, rather than a later empty main session. */
function selectTryoutHistorySession<T extends MainTryoutSessionCandidate & { id: string }>(sessions: readonly T[], attempts: readonly { sessionId: string }[]) {
  const populated = new Set(attempts.map((attempt) => attempt.sessionId));
  return sessions.find((session) => populated.has(session.id)) ?? selectMainTryoutSession(sessions);
}

export {
  DEFAULT_MAIN_SESSION_WINDOW_MS,
  MAIN_TRYOUT_SESSION_NAME,
  defaultMainSessionWindow,
  isMainTryoutSession,
  selectMainTryoutSession,
  selectTryoutHistorySession,
};
export type { MainTryoutSessionCandidate };

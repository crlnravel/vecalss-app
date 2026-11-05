import "server-only";

/**
 * Mention searches one student may make in a minute. The `@` menu searches on each pause in typing, so a student who types a
 * few words fires several searches, and this still stops a loop long before it can load the database.
 */
export const MENTION_SEARCHES_PER_MINUTE = 60;
const WINDOW_MS = 60_000;
/** Above this many tracked students, windows that have already ended are dropped, so the map cannot grow without bound. */
const PRUNE_ABOVE = 5_000;

const windows = new Map<string, { startedAt: number; searches: number }>();

/**
 * Takes one mention search from the student's current minute. Returns false when the minute is used up. The count is kept in
 * memory, so each server process keeps its own count. That is enough to stop a runaway loop without a shared store.
 */
export function takeMentionSearch(studentId: string, now: number = Date.now()): boolean {
  const current = windows.get(studentId);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    if (windows.size >= PRUNE_ABOVE) pruneEndedWindows(now);
    windows.set(studentId, { startedAt: now, searches: 1 });
    return true;
  }
  if (current.searches >= MENTION_SEARCHES_PER_MINUTE) return false;
  current.searches += 1;
  return true;
}

function pruneEndedWindows(now: number) {
  for (const [studentId, entry] of windows) {
    if (now - entry.startedAt >= WINDOW_MS) windows.delete(studentId);
  }
}

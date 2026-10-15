"use client";

import { useEffect, useRef } from "react";

export type DeadlineState = {
  status: string;
  availableUntil: Date | string | null;
  activeRun: { id: string; serverDeadlineAt: Date | string | null } | null;
};

type Props = {
  attemptId: string;
  state: DeadlineState | null;
  now: number;
  busy: boolean;
  refresh: (background?: boolean) => Promise<DeadlineState | null>;
  onExhausted: () => void;
};

// Six reads at most per authoritative deadline. Recalibration must not replenish
// this budget when the approximate clock crosses the same deadline again.
const retryDelays = [500, 1000, 2000, 4000, 8000];
type Progress = { attempts: number; nextAt: number; notified: boolean };

function deadlineTime(value: Date | string | null | undefined) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

function createReconciler() {
  const progress = new Map<string, Progress>();
  let latest: Props | null = null;
  let timer: number | null = null;
  let scheduledKey: string | null = null;
  let reading = false;
  let disposed = false;

  function target() {
    if (!latest?.state || latest.state.status !== "in_progress") return null;
    const session = deadlineTime(latest.state.availableUntil);
    const sessionKey = session === null ? null : `session:${session}`;
    // Once requested, a session deadline retains precedence despite clock noise.
    if (sessionKey && (latest.now >= session! || progress.has(sessionKey))) return sessionKey;
    const run = latest.state.activeRun;
    const deadline = deadlineTime(run?.serverDeadlineAt);
    const runKey = run && deadline !== null ? `run:${run.id}:${deadline}` : null;
    return runKey && (latest.now >= deadline! || progress.has(runKey)) ? runKey : null;
  }

  function clearTimer() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    scheduledKey = null;
  }

  function reconcile() {
    if (disposed) return;
    const key = target();
    if (scheduledKey !== key || latest?.busy || reading) clearTimer();
    if (!key || !latest || latest.busy || reading || timer !== null) return;
    const entry = progress.get(key) ?? { attempts: 0, nextAt: performance.now(), notified: false };
    if (entry.attempts > retryDelays.length) {
      if (!entry.notified) {
        entry.notified = true;
        latest.onExhausted();
      }
      return;
    }
    scheduledKey = key;
    timer = window.setTimeout(() => {
      timer = null;
      scheduledKey = null;
      if (disposed || latest?.busy || reading || target() !== key) {
        reconcile();
        return;
      }
      reading = true;
      entry.attempts++;
      progress.set(key, entry);
      const read = latest!.refresh;
      void read(true).then((state) => {
        if (!disposed && state && latest && target() === key) latest = { ...latest, state };
      }, () => {
        // Background refusals and transport errors share the same finite budget.
      }).finally(() => {
        reading = false;
        if (disposed) return;
        entry.nextAt = performance.now() + (retryDelays[entry.attempts - 1] ?? 0);
        reconcile();
      });
    }, Math.max(0, entry.nextAt - performance.now()));
  }

  return {
    update(props: Props) { latest = props; reconcile(); },
    dispose() { disposed = true; clearTimer(); },
  };
}

export function useParticipantDeadlineReconciliation({ attemptId, state, now, busy, refresh, onExhausted }: Props) {
  const reconcilerRef = useRef<ReturnType<typeof createReconciler> | null>(null);
  useEffect(() => {
    const reconciler = createReconciler();
    reconcilerRef.current = reconciler;
    return () => {
      reconciler.dispose();
      reconcilerRef.current = null;
    };
  }, [attemptId]);
  useEffect(() => {
    reconcilerRef.current?.update({ attemptId, state, now, busy, refresh, onExhausted });
  }, [attemptId, state, now, busy, refresh, onExhausted]);
}

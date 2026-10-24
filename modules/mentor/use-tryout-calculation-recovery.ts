"use client";

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createTryoutCalculationRecovery, readTryoutCalculation, type TryoutCalculationIntent, type TryoutCalculationReadReply, type TryoutCalculationReply, type TryoutResultRecoveryScope } from "@/lib/tryout/result-recovery";

/** Commit-time identity invalidates old callbacks before passive effects, including replacement/unmount. */
export function useTryoutCalculationRecovery({ scope, write, read = readTryoutCalculation, refresh, notify }: {
  scope: TryoutResultRecoveryScope;
  write: (intent: TryoutCalculationIntent) => Promise<TryoutCalculationReply>;
  read?: (scope: TryoutResultRecoveryScope) => Promise<TryoutCalculationReadReply>;
  refresh: () => void | Promise<void>;
  notify: (message: string, saved: boolean) => void;
}) {
  const { attemptId, tryoutId, sessionId } = scope;
  const controller = useMemo(() => ({
    ...createTryoutCalculationRecovery({ write, read }),
    scope: Object.freeze({ attemptId, tryoutId, sessionId }),
  }), [attemptId, tryoutId, sessionId, write, read]);
  const committed = useRef<typeof controller | null>(null);
  const [refreshState, setRefreshState] = useState<{ controller: typeof controller; failed: boolean } | null>(null);
  const refreshFailed = refreshState?.controller === controller && refreshState.failed;
  useLayoutEffect(() => {
    committed.current = controller;
    controller.activate();
    return () => { committed.current = null; controller.dispose(); };
  }, [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const current = () => committed.current === controller;
  useLayoutEffect(() => {
    if (committed.current === controller && state.phase === "refused") notify(state.message!, false);
  }, [controller, state, notify]);
  const reload = async () => {
    if (!current()) return;
    try { await refresh(); if (current()) setRefreshState({ controller, failed: false }); }
    catch {
      if (!current()) return;
      setRefreshState({ controller, failed: true });
      notify("Skor sudah tersimpan, tetapi tampilan belum diperbarui. Muat ulang tampilan untuk melihatnya.", true);
    }
  };
  const finish = async (saved: boolean) => {
    if (!current()) return;
    if (saved) { notify("Skor sudah tersimpan. Hasil peserta tetap mengikuti aturan rilis sesi.", true); await reload(); }
  };
  return {
    state, refreshFailed,
    submit: async (reason: string) => { if (!current() || controller.getSnapshot() !== state) return; const reply = await controller.submit({ ...controller.scope, reason }); await finish(Boolean(reply?.ok)); },
    inspect: async () => { if (!current() || controller.getSnapshot() !== state) return; const snapshot = await controller.inspect(); await finish(snapshot?.state === "calculated" || snapshot?.state === "released"); },
    replay: async () => { if (!current() || controller.getSnapshot() !== state) return; const reply = await controller.replay(); await finish(Boolean(reply?.ok)); },
    reload,
  };
}

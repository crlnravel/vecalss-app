"use client";

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createTryoutPublicationRecovery, type TryoutPublicationIntent, type TryoutPublicationReadReply, type TryoutPublicationReply } from "@/lib/tryout/result-publication-recovery";
import { readTryoutSessionReadiness, type TryoutResultReadinessScope } from "@/lib/tryout/result-readiness";

export function useTryoutPublicationRecovery({ scope, write, read = readTryoutSessionReadiness, refresh, notify }: {
  scope: TryoutResultReadinessScope;
  write: (intent: TryoutPublicationIntent) => Promise<TryoutPublicationReply>;
  read?: (scope: TryoutResultReadinessScope) => Promise<TryoutPublicationReadReply>;
  refresh: () => Promise<void>;
  notify: (message: string, saved: boolean) => void;
}) {
  const { tryoutId, sessionId } = scope;
  const controller = useMemo(() => createTryoutPublicationRecovery({ write: (intent) => write(Object.freeze({ ...intent, tryoutId, sessionId })), read: (selected) => read({ ...selected, tryoutId, sessionId }) }), [tryoutId, sessionId, write, read]);
  const committed = useRef<typeof controller | null>(null);
  const view = useRef(0);
  const [failed, setFailed] = useState<typeof controller | null>(null);
  useLayoutEffect(() => { committed.current = controller; controller.activate(); return () => { committed.current = null; controller.dispose(); }; }, [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const current = () => committed.current === controller;
  const reload = async () => {
    if (!current()) return false;
    const owner = view.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([refresh(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Refresh deadline")), 15_000); })]);
      if (current() && owner === view.current) setFailed(null);
      return current() && owner === view.current;
    } catch {
      if (current() && owner === view.current) { setFailed(controller); notify("Hasil sudah dirilis, tetapi tampilan belum diperbarui. Muat ulang tampilan.", true); }
      return false;
    } finally { clearTimeout(timer); }
  };
  const finish = async (owner: number) => {
    if (!current() || owner !== view.current) return false;
    const result = controller.getSnapshot();
    if (result.phase === "saved") { notify("Hasil sesi sudah dirilis.", true); await reload(); return current() && owner === view.current; }
    if (result.phase === "refused") notify(result.message!, false);
    return false;
  };
  return {
    state, refreshFailed: failed === controller, reload,
    dismiss: () => { if (current()) view.current++; },
    submit: async (reason: string) => { if (!current() || controller.getSnapshot() !== state || state.intent) return false; const owner = view.current; await controller.submit({ tryoutId, sessionId, reason }); return finish(owner); },
    inspect: async () => { if (!current() || controller.getSnapshot() !== state) return false; const owner = view.current; await controller.inspect(); return finish(owner); },
    replay: async () => { if (!current() || controller.getSnapshot() !== state) return false; const owner = view.current; await controller.replay(); return finish(owner); },
  };
}

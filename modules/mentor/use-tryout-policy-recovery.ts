"use client";

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createTryoutPolicyRecovery, type TryoutPolicyIntent, type TryoutPolicyReadReply, type TryoutPolicyReply } from "@/lib/tryout/result-policy-recovery";
import { readTryoutSessionReadiness, type TryoutResultReadinessScope, type TryoutPolicyInspectionScope } from "@/lib/tryout/result-readiness";

export function useTryoutPolicyRecovery({ scope, write, read = readTryoutSessionReadiness, refresh, notify }: {
  scope: TryoutResultReadinessScope;
  write: (intent: TryoutPolicyIntent) => Promise<TryoutPolicyReply>;
  read?: (scope: TryoutPolicyInspectionScope) => Promise<TryoutPolicyReadReply>;
  refresh: () => Promise<void>;
  notify: (message: string, saved: boolean) => void;
}) {
  const { tryoutId, sessionId } = scope;
  const controller = useMemo(() => createTryoutPolicyRecovery({
    write: (intent) => write(Object.freeze({ ...intent, tryoutId, sessionId })),
    read: (request) => read({ ...request, tryoutId, sessionId }),
  }), [tryoutId, sessionId, write, read]);
  const committed = useRef<typeof controller | null>(null);
  const [failed, setFailed] = useState<typeof controller | null>(null);
  useLayoutEffect(() => { committed.current = controller; controller.activate(); return () => { committed.current = null; controller.dispose(); }; }, [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const current = () => committed.current === controller;
  useLayoutEffect(() => { if (committed.current === controller && state.phase === "refused") notify(state.message!, false); }, [controller, state, notify]);
  const reload = async () => {
    if (!current()) return false;
    try { await refresh(); if (current()) setFailed(null); return current(); }
    catch { if (current()) { setFailed(controller); notify("Aturan rilis hasil tersimpan, tetapi tampilan belum diperbarui. Muat ulang tampilan.", true); } return false; }
  };
  const finish = async (saved: boolean) => { if (!current() || !saved) return false; notify("Aturan rilis hasil tersimpan.", true); await reload(); return current(); };
  return {
    refreshRefused: async () => { const refused = controller.getSnapshot(); if (!current() || refused.phase !== "refused") return false; try { await refresh(); if (!current() || controller.getSnapshot() !== refused) return false; controller.refreshed(); return true; } catch { if (current() && controller.getSnapshot() === refused) notify("Aturan terbaru belum dapat dimuat. Periksa koneksi, lalu coba lagi.", false); return false; } },
    state, refreshFailed: failed === controller, reload, reset: () => { if (current()) controller.reset(); },
    submit: async (intent: Omit<TryoutPolicyIntent, "tryoutId" | "sessionId" | "requestId">) => { if (!current() || controller.getSnapshot() !== state || state.intent || state.phase === "refused") return false; const result = await controller.submit({ ...intent, tryoutId, sessionId, requestId: crypto.randomUUID() }); return finish(Boolean(result?.ok)); },
    inspect: async () => { if (!current() || controller.getSnapshot() !== state) return false; await controller.inspect(); return finish(controller.getSnapshot().phase === "saved"); },
    replay: async () => { if (!current() || controller.getSnapshot() !== state) return false; const result = await controller.replay(); return finish(Boolean(result?.ok)); },
  };
}

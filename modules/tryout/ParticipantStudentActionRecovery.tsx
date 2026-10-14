"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { LoaderCircle } from "@/lib/icons";
import { buildStudentAttemptHref, buildStudentTryoutHref, buildStudentTryoutSubrouteHref } from "@/lib/navigation/canonical-context";
import { createParticipantActionRecovery, type ParticipantActionDestination, type ParticipantActionRecoveryState } from "@/lib/tryout/participant-action-recovery";
import { createParticipantRecoveryTransport, readParticipantRecovery } from "@/lib/tryout/participant-recovery-transport";
import { registerForTryoutWithTargetAction, startTryoutAttemptAction } from "@/modules/tryout/participant-actions";

export function participantRecoveryHref(destination: ParticipantActionDestination, tryoutId: string, returnToHref?: string, sessionId?: string) {
  if (destination.kind === "attempt") return buildStudentAttemptHref(destination.attemptId, { returnTo: returnToHref, session: destination.sessionId, result: destination.result });
  if (destination.kind === "waiting") return buildStudentTryoutSubrouteHref(tryoutId, "waiting", { returnTo: returnToHref, session: destination.sessionId });
  return buildStudentTryoutHref(tryoutId, { returnTo: returnToHref, session: sessionId });
}

export function useParticipantActionRecovery() {
  const [controller] = useState(() => createParticipantActionRecovery({
    ...createParticipantRecoveryTransport({
      register: registerForTryoutWithTargetAction,
      start: startTryoutAttemptAction,
      inspect: readParticipantRecovery,
    }),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  useEffect(() => { if (state.phase === "refused" && state.message) showToast(state.message, { variant: "error" }); }, [state.message, state.phase]);
  return { controller, state, busy: state.phase === "writing" || state.phase === "reading", locked: state.intent !== null };
}

export function ParticipantActionRecoveryControls({ state, onInspect, onRetry, onContinue }: {
  state: ParticipantActionRecoveryState;
  onInspect: () => void;
  onRetry: () => void;
  onContinue: () => void;
}) {
  if (!state.intent || state.phase === "writing" || state.phase === "accepted") return null;
  const reading = state.phase === "reading";
  return <div className="grid gap-3">
    <p className="text-sm leading-6 text-secondary-600" role="status">{state.message}</p>
    <div className="flex flex-wrap gap-2">
      <Button disabled={reading} onClick={onInspect} type="button" variant="outline">{reading ? <><LoaderCircle className="animate-spin" />Memeriksa…</> : "Periksa status"}</Button>
      {state.phase === "retry" ? <Button onClick={onRetry} type="button" variant="default">{state.intent.kind === "register" ? "Coba daftar lagi" : "Coba mulai lagi"}</Button> : null}
      {state.phase === "recovered" ? <Button onClick={onContinue} type="button" variant="default">Lanjutkan</Button> : null}
    </div>
  </div>;
}

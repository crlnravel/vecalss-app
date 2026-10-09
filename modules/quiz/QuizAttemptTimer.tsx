"use client";

import { useEffect, useState } from "react";

import { formatQuizRemainingTime } from "@/modules/quiz/time-format";

type QuizAttemptCountdownRuntime = {
  clearInterval: (interval: number) => void;
  monotonicNow: () => number;
  setInterval: (callback: () => void, delay: number) => number;
};

type QuizAttemptTimerRuntime = QuizAttemptCountdownRuntime & {
  isVisible: () => boolean;
  subscribeVisibility: (callback: () => void) => () => void;
};

type QuizAttemptClockSyncResult = {
  isSubmitted: boolean;
  remainingMilliseconds: number | null;
  serverProcessingMilliseconds: number;
};

function remainingAfterClockSync(
  remainingMilliseconds: number,
  requestElapsedMilliseconds: number,
  serverProcessingMilliseconds: number,
) {
  const estimatedOneWayTransitMilliseconds = Math.max(
    0,
    requestElapsedMilliseconds - Math.max(0, serverProcessingMilliseconds),
  ) / 2;
  return Math.max(0, remainingMilliseconds - estimatedOneWayTransitMilliseconds);
}

function startQuizAttemptCountdown({
  initialRemainingMilliseconds,
  onDeadline,
  onTick,
  runtime,
}: {
  initialRemainingMilliseconds: number;
  onDeadline: () => void;
  onTick: (remainingSeconds: number) => void;
  runtime: QuizAttemptCountdownRuntime;
}) {
  const startedAt = runtime.monotonicNow();
  let deadlineRequested = false;
  const requestDeadline = () => {
    if (deadlineRequested) return;
    deadlineRequested = true;
    onDeadline();
  };
  const updateCountdown = () => {
    const remainingMilliseconds = Math.max(
      0,
      initialRemainingMilliseconds - (runtime.monotonicNow() - startedAt),
    );
    onTick(Math.ceil(remainingMilliseconds / 1000));
    if (remainingMilliseconds === 0) requestDeadline();
  };
  const intervalId = runtime.setInterval(updateCountdown, 250);
  return () => runtime.clearInterval(intervalId);
}

function startQuizAttemptTimer({
  initialRemainingSeconds,
  onAutoSubmitted,
  onExpired,
  onTimeLockChange,
  onTick,
  runtime,
  syncAttempt,
}: {
  initialRemainingSeconds: number | null | undefined;
  onAutoSubmitted: () => void;
  onExpired: () => void;
  onTimeLockChange: (locked: boolean) => void;
  onTick: (remainingSeconds: number) => void;
  runtime: QuizAttemptTimerRuntime;
  syncAttempt: () => Promise<QuizAttemptClockSyncResult | null>;
}) {
  let cancelled = false;
  let syncInFlight = false;
  let stopCountdown: () => void = () => {};

  const sync = async () => {
    if (cancelled || syncInFlight) return;
    syncInFlight = true;
    const requestStartedAt = runtime.monotonicNow();
    try {
      const result = await syncAttempt();
      const responseReceivedAt = runtime.monotonicNow();
      if (cancelled || !result) return;
      if (result.isSubmitted) {
        onTimeLockChange(true);
        onAutoSubmitted();
        return;
      }
      if (result.remainingMilliseconds === null) {
        onTimeLockChange(false);
        return;
      }

      const currentRemainingMilliseconds = remainingAfterClockSync(
        result.remainingMilliseconds,
        responseReceivedAt - requestStartedAt,
        result.serverProcessingMilliseconds,
      );
      stopCountdown();
      if (currentRemainingMilliseconds === 0) {
        onTick(0);
        onTimeLockChange(true);
        onExpired();
        return;
      }
      onTick(Math.ceil(currentRemainingMilliseconds / 1000));
      onTimeLockChange(false);
      stopCountdown = startQuizAttemptCountdown({
        initialRemainingMilliseconds: currentRemainingMilliseconds,
        onDeadline: () => {
          onTimeLockChange(true);
          onExpired();
          void sync();
        },
        onTick,
        runtime,
      });
    } catch {
      // The server remains authoritative. Keep the last countdown visible;
      // the next foreground return or answer action will reconcile it again.
    } finally {
      syncInFlight = false;
    }
  };

  if (initialRemainingSeconds !== null && initialRemainingSeconds !== undefined) {
    stopCountdown = startQuizAttemptCountdown({
      initialRemainingMilliseconds: initialRemainingSeconds * 1000,
      onDeadline: () => {
        onTimeLockChange(true);
        onExpired();
        void sync();
      },
      onTick,
      runtime,
    });
  }

  const handleVisibility = () => {
    if (runtime.isVisible()) void sync();
  };
  const unsubscribeVisibility = runtime.subscribeVisibility(handleVisibility);
  void sync();

  return () => {
    cancelled = true;
    stopCountdown();
    unsubscribeVisibility();
  };
}

function QuizAttemptTimer({
  deadlineAt,
  fallbackTime,
  initialRemainingSeconds,
  onAutoSubmitted,
  onExpired,
  onTimeLockChange,
  serverNowAt,
  syncAttempt,
}: {
  deadlineAt: string | null | undefined;
  fallbackTime: string;
  initialRemainingSeconds: number | null | undefined;
  onAutoSubmitted: () => void;
  onExpired: () => void;
  onTimeLockChange: (locked: boolean) => void;
  serverNowAt: string | null | undefined;
  syncAttempt: () => Promise<{
    isSubmitted: boolean;
    remainingMilliseconds: number | null;
    serverProcessingMilliseconds: number;
  } | null>;
}) {
  const [remainingSeconds, setRemainingSeconds] = useState(
    initialRemainingSeconds ?? null,
  );

  useEffect(() => {
    if (!deadlineAt || !serverNowAt) return;
    return startQuizAttemptTimer({
      initialRemainingSeconds,
      onAutoSubmitted,
      onExpired,
      onTimeLockChange,
      onTick: setRemainingSeconds,
      runtime: {
      clearInterval: (interval) => window.clearInterval(interval),
      isVisible: () => document.visibilityState === "visible",
      monotonicNow: () => performance.now(),
      subscribeVisibility: (callback) => {
        document.addEventListener("visibilitychange", callback);
        return () => document.removeEventListener("visibilitychange", callback);
      },
      setInterval: (callback, delay) => window.setInterval(callback, delay),
      },
      syncAttempt,
    });
  }, [
    deadlineAt,
    initialRemainingSeconds,
    onAutoSubmitted,
    onExpired,
    onTimeLockChange,
    serverNowAt,
    syncAttempt,
  ]);

  const value =
    !deadlineAt || remainingSeconds === null
      ? fallbackTime
      : formatQuizRemainingTime(remainingSeconds);
  return (
    <span aria-label={`Waktu tersisa ${value}`} aria-live="off">
      {value}
    </span>
  );
}

export {
  QuizAttemptTimer,
  remainingAfterClockSync,
  startQuizAttemptCountdown,
  startQuizAttemptTimer,
};

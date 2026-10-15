"use client";

import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CalendarDays,
  Check,
  Clock,
  ClockCountdown,
  Expand,
  Flag,
  ListChecks,
  LoaderCircle,
  PenTool,
  Play,
  UserRound,
} from "@/lib/icons";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { TypedRouteState } from "@/components/ui/typed-route-state";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { createSingleFlightRead } from "@/lib/tryout/single-flight-read";
import { buildStudentAttemptHref } from "@/lib/navigation/canonical-context";
import { Minus, Plus } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { BrandLockup } from "@/modules/home/components/home-primitives";
import {
  AssessmentAnswerOption,
  AssessmentAnnotationOverlay,
  AssessmentIconButton,
  AssessmentQuestionNavigation,
  AssessmentUtilityPill,
  AssessmentWorkspace,
} from "@/modules/assessment/AssessmentWorkspace";
import { AssessmentNavigationFooter } from "@/modules/assessment/AssessmentNavigationFooter";
import type { AssessmentQuestionMarkerItem } from "@/modules/assessment/AssessmentWorkspace";
import {
  recordTryoutIntegrityEventAction,
  saveTryoutAnswerAction,
  sealTryoutTestRunAction,
  startActiveTryoutTestRunAction,
  tryoutAttemptStateAction,
} from "./participant-actions";

import { useParticipantDeadlineReconciliation } from "./use-participant-deadline-reconciliation";

type Option = { choiceKey: string; content: string; id: string; sortOrder: number };
type Item = { id: string; options: Option[]; prompt: string; questionType?: "single_choice" | "multiple_choice" | string | null; sortOrder: number };
type Snapshot = { durationSeconds: number; instructions?: string | null; items: Item[]; testType: "cbt" };
type Section = {
  durationSeconds: number;
  questionCount: number;
  subtest: { code: string; name: string };
  testType: "cbt";
  title: string;
};
type RunSummary = { id: string; section: Section; sequenceNo: number; status: string };
type State = {
  activeRun: null | {
    answers: Array<{ selectedOptionId: string | null; selectedOptionIds?: string[] | null; tryoutItemId: string }>;
    contentSnapshot: Snapshot;
    fullscreenPrompt: boolean;
    id: string;
    section: Section;
    serverDeadlineAt: Date | string | null;
    sequenceNo: number;
    status: string;
  };
  attemptId: string;
  availableUntil: Date | string | null;
  serverNow: string;
  runs: RunSummary[];
  status: string;
  tryoutDescription: string | null;
  tryoutEventName: string | null;
  tryoutOrganizer: string;
  tryoutTitle: string;
};

function formatTimer(deadline: Date | string | null, now: number) {
  const seconds = deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function remainingSeconds(deadline: Date | string | null, now: number) {
  return deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000)) : 0;
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours ? `${hours} jam${remainingMinutes ? ` ${remainingMinutes} menit` : ""}` : `${minutes} menit`;
}

function ParticipantAttemptStatusScreen({
  attemptId,
  busy,
  finished,
  nextRun,
  sessionEnded,
  onBegin,
  returnToHref,
  runs,
  sessionId,
  tryoutDescription,
  tryoutEventName,
  tryoutOrganizer,
  title,
}: {
  attemptId: string;
  busy: boolean;
  finished: boolean;
  nextRun?: RunSummary;
  sessionEnded: boolean;
  onBegin: (runId: string) => void;
  returnToHref?: string;
  runs: RunSummary[];
  sessionId?: string;
  tryoutDescription: string | null;
  tryoutEventName: string | null;
  tryoutOrganizer: string;
  title: string;
}) {
  const totalQuestions = runs.reduce((total, run) => total + run.section.questionCount, 0);
  const totalDuration = runs.reduce((total, run) => total + run.section.durationSeconds, 0);

  return (
    <main className="student-page-canvas min-h-svh px-4 py-8 text-secondary-900 sm:px-6 lg:py-12">
      <div className="mx-auto grid w-full max-w-[72rem] gap-8">
        <section className="overflow-hidden rounded-card border border-primary-100 bg-white shadow-[0_26px_80px_-46px_color-mix(in_oklab,var(--voyage-deep)_30%,transparent)]">
          <div className="bg-[linear-gradient(120deg,var(--voyage-deep)_0%,var(--voyage-forest)_68%,var(--voyage-leaf)_100%)] p-6 text-white sm:p-8">
            <h1 className="max-w-3xl font-heading text-3xl font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-4xl">{title}</h1>
            {tryoutDescription ? <p className="mt-4 max-w-2xl text-sm leading-6 text-primary-50 sm:text-base">{tryoutDescription}</p> : null}
          </div>
          <dl className="grid divide-y divide-primary-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            <div className="flex items-center gap-3 p-5 sm:p-6">
              <ListChecks aria-hidden="true" className="size-5 shrink-0 text-primary-700" />
              <div className="min-w-0"><dt className="text-xs text-secondary-500">Total soal</dt><dd className="mt-1 font-semibold">{totalQuestions} soal</dd></div>
            </div>
            <div className="flex items-center gap-3 p-5 sm:p-6">
              <Clock aria-hidden="true" className="size-5 shrink-0 text-primary-700" />
              <div className="min-w-0"><dt className="text-xs text-secondary-500">Total durasi</dt><dd className="mt-1 font-semibold">{formatDuration(totalDuration)}</dd></div>
            </div>
            <div className="flex items-center gap-3 p-5 sm:p-6">
              <UserRound aria-hidden="true" className="size-5 shrink-0 text-primary-700" />
              <div className="min-w-0"><dt className="text-xs text-secondary-500">Disusun oleh</dt><dd className="mt-1 truncate font-semibold" title={tryoutOrganizer}>{tryoutOrganizer}</dd></div>
            </div>
            {tryoutEventName ? (
              <div className="flex items-center gap-3 p-5 sm:p-6">
                <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-primary-700" />
                <div className="min-w-0"><dt className="text-xs text-secondary-500">Acara</dt><dd className="mt-1 truncate font-semibold" title={tryoutEventName}>{tryoutEventName}</dd></div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-5 sm:p-6">
                <ListChecks aria-hidden="true" className="size-5 shrink-0 text-primary-700" />
                <div className="min-w-0"><dt className="text-xs text-secondary-500">Bagian</dt><dd className="mt-1 font-semibold">{runs.length} bagian</dd></div>
              </div>
            )}
          </dl>
        </section>

        {sessionEnded ? <p aria-live="polite" className="text-sm font-medium text-secondary-700" role="status">Waktu sesi Tryout sudah berakhir.</p> : null}

        {finished ? (
          <section className="rounded-card border border-primary-100 bg-white p-6 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3">
              {["Memeriksa jawaban", "Menghitung skor", "Menyiapkan analisis"].map((label, itemIndex) => (
                <div className="rounded-card bg-primary-50 p-4 text-center" key={label}>
                  {itemIndex === 2 ? <LoaderCircle className="mx-auto animate-spin text-2xl text-primary-700 motion-reduce:animate-none" /> : <Check className="mx-auto text-2xl text-primary-700" />}
                  <p className="mt-2 text-sm font-semibold">{label}</p>
                </div>
              ))}
            </div>
            <Button className="mx-auto mt-6 flex" nativeButton={false} render={<Link href={buildStudentAttemptHref(attemptId, { result: true, returnTo: returnToHref, session: sessionId })} />} variant="default">Buka hasil <ArrowRight /></Button>
          </section>
        ) : (
          <div className="grid gap-3">
            {runs.map((candidate) => {
              const isNext = candidate.id === nextRun?.id;
              const isComplete = ["sealed", "expired"].includes(candidate.status);
              return (
                <article className="grid gap-4 rounded-card border border-primary-100 bg-white p-5 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_38%,transparent)] sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:items-center sm:p-6" key={candidate.id}>
                  <span className={cn("flex size-11 items-center justify-center rounded-full text-sm font-bold", isComplete ? "bg-primary-700 text-white" : isNext ? "bg-student-status-attention-bg text-student-status-attention-fg" : "bg-secondary-100 text-secondary-500")}>
                    {isComplete ? <Check /> : candidate.sequenceNo}
                  </span>
                  <div>
                    <h2 className="font-semibold">{candidate.section.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-500">
                      <span className="inline-flex items-center gap-1.5"><ListChecks aria-hidden="true" className="size-4 text-primary-700" />{candidate.section.questionCount} soal</span>
                      <span className="inline-flex items-center gap-1.5"><Clock aria-hidden="true" className="size-4 text-primary-700" />{formatDuration(candidate.section.durationSeconds)}</span>
                    </div>
                  </div>
                  {isNext ? <Button disabled={busy} onClick={() => onBegin(candidate.id)} variant="default">{busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Play />}Mulai bagian</Button> : <span className="text-sm text-secondary-500">{isComplete ? "Terkunci" : "Menunggu"}</span>}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function useParticipantAttemptController({ attemptId, returnToHref, sessionId }: { attemptId: string; returnToHref?: string; sessionId?: string }) {
  const [state, setState] = useState<State | null>(null);
  const [loadState, setLoadState] = useState<"error" | "loading" | "ready">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [operationStatus, setOperationStatus] = useState<"beginning" | "submitting" | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const activeRunRef = useRef<string | null>(null);
  const serverClockOffsetRef = useRef<number | null>(null);
  const stateRef = useRef<State | null>(null);
  const mountGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const pendingRefreshRef = useRef<{ generation: number; promise: Promise<State | null> } | null>(null);
  const readAttemptState = useMemo(() => createSingleFlightRead(() => tryoutAttemptStateAction(attemptId)), [attemptId]);
  useEffect(() => {
    mountedRef.current = true;
    const generation = ++mountGenerationRef.current;
    return () => {
      mountedRef.current = false;
      mountGenerationRef.current = generation + 1;
    };
  }, [attemptId]);
  const router = useRouter();
  const safeReturnHref = returnToHref ?? (sessionId ? `/tryout?session=${encodeURIComponent(sessionId)}` : "/tryout");
  const toggleAnnotation = useCallback(() => setAnnotationOpen((open) => !open), []);
  usePageStatusToast({
    active: saveState === "saving" || (busy && state !== null),
    message: operationStatus === "beginning"
      ? "Memulai bagian Tryout…"
      : operationStatus === "submitting"
        ? "Mengumpulkan jawaban bagian…"
        : busy
          ? "Memperbarui pengerjaan Tryout…"
          : "Menyimpan jawaban…",
    variant: "info",
  });

  const refresh = useCallback(function refreshAttempt(background = false): Promise<State | null> {
    const generation = mountGenerationRef.current;
    if (!mountedRef.current) return Promise.resolve(null);
    if (pendingRefreshRef.current?.generation === generation) return pendingRefreshRef.current.promise;
    const isCurrent = () => mountedRef.current && mountGenerationRef.current === generation;
    const promise = (async () => {
      setBusy(true);
      setLoadState(stateRef.current ? "ready" : "loading");
      setLoadError(null);
      try {
        const response = await readAttemptState();
        if (!isCurrent()) return null;
        const responseReceivedAt = performance.now();
        if (!response.ok) {
          if (stateRef.current && !background) {
            showToast(response.message, {
              action: { label: "Coba lagi", onClick: () => void refreshAttempt() },
              variant: "error",
            });
          } else if (!stateRef.current) {
            setLoadState("error");
            setLoadError(response.message);
          }
          return null;
        }
        const nextState = response.result as State;
        const serverNow = new Date(nextState.serverNow).getTime();
        if (Number.isFinite(serverNow)) {
          serverClockOffsetRef.current = serverNow - responseReceivedAt;
          setNow(serverNow);
        }
        const nextRunId = nextState.activeRun?.id ?? null;
        let restoredPositionMessage = "";
        if (nextRunId !== activeRunRef.current) {
          activeRunRef.current = nextRunId;
          if (nextRunId) {
            const saved = window.localStorage.getItem(`tryout:${attemptId}:${nextRunId}:marked`);
            try {
              setMarked(new Set(saved ? JSON.parse(saved) as string[] : []));
            } catch {
              setMarked(new Set());
            }
            const positionItemId = window.localStorage.getItem(`tryout:${attemptId}:${nextRunId}:position`);
            const restoredIndex = nextState.activeRun?.contentSnapshot.testType === "cbt" && positionItemId
              ? nextState.activeRun.contentSnapshot.items.findIndex((candidate) => candidate.id === positionItemId)
              : -1;
            const safeIndex = restoredIndex >= 0 ? restoredIndex : 0;
            setIndex(safeIndex);
            if (safeIndex > 0) restoredPositionMessage = `Progres dipulihkan ke soal ${safeIndex + 1}. Jawaban tersimpan dari server.`;
          } else {
            setIndex(0);
            setMarked(new Set());
          }
        }
        stateRef.current = nextState;
        setState(nextState);
        setLoadState("ready");
        setLoadError(null);
        if (restoredPositionMessage) showToast(restoredPositionMessage, { variant: "info" });
        return nextState;
      } catch (refreshError) {
        if (!isCurrent()) return null;
        unstable_rethrow(refreshError);
        const failureMessage = stateRef.current
          ? "Pengerjaan Tryout belum berhasil diperbarui. Periksa koneksi lalu coba lagi."
          : "Tryout belum berhasil dimuat. Periksa koneksi lalu coba lagi.";
        if (stateRef.current && !background) {
          showToast(failureMessage, {
            action: { label: "Coba lagi", onClick: () => void refreshAttempt() },
            variant: "error",
          });
        } else if (!stateRef.current) {
          setLoadState("error");
          setLoadError(failureMessage);
        }
        return null;
      } finally {
        if (isCurrent()) setBusy(false);
      }
    })();
    pendingRefreshRef.current = { generation, promise };
    void promise.finally(() => {
      if (pendingRefreshRef.current?.promise === promise) pendingRefreshRef.current = null;
    }).catch(() => {});
    return promise;
  }, [attemptId, readAttemptState]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => {
      const serverClockOffset = serverClockOffsetRef.current;
      setNow(serverClockOffset === null ? Date.now() : serverClockOffset + performance.now());
    }, 1000);
    return () => {
      window.clearTimeout(loadTimer);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const run = state?.activeRun;
  const parsedSessionDeadline = state?.availableUntil ? new Date(state.availableUntil).getTime() : null;
  const sessionDeadline = parsedSessionDeadline !== null && Number.isFinite(parsedSessionDeadline) ? parsedSessionDeadline : null;
  const sessionEnded = sessionDeadline !== null && now >= sessionDeadline;
  const snapshot = run?.contentSnapshot;
  const items = useMemo(
    () => {
      if (!snapshot) return [];
      return snapshot.items;
    },
    [snapshot],
  );
  const activeRunId = run?.id;
  const fullscreenPrompt = run?.fullscreenPrompt;

  useEffect(() => {
    if (!activeRunId) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeRunId]);

  useEffect(() => {
    if (!activeRunId) return;
    const report = (eventType: "focus_lost" | "focus_returned" | "visibility_hidden" | "visibility_visible" | "fullscreen_exited") => {
      void recordTryoutIntegrityEventAction(attemptId, activeRunId, eventType).then((response) => {
        if (!response.ok) showToast(response.message, { variant: "error" });
        else if (["focus_lost", "visibility_hidden", "fullscreen_exited"].includes(eventType)) {
          showToast("Perpindahan layar tercatat.", {
            id: `tryout-integrity-${attemptId}-${activeRunId}`,
            description: "Timer tetap berjalan tanpa penalti otomatis.",
            variant: "info",
          });
        }
      });
    };
    const handleFocus = () => report("focus_returned");
    const handleBlur = () => report("focus_lost");
    const handleVisibility = () => report(document.visibilityState === "hidden" ? "visibility_hidden" : "visibility_visible");
    const handleFullscreen = () => { if (fullscreenPrompt && !document.fullscreenElement) report("fullscreen_exited"); };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("fullscreenchange", handleFullscreen);
    };
  }, [activeRunId, attemptId, fullscreenPrompt]);

  useParticipantDeadlineReconciliation({
    attemptId, state, now, busy, refresh,
    onExhausted: () => showToast("Pengerjaan Tryout belum berhasil diperbarui. Periksa koneksi lalu coba lagi.", {
      action: { label: "Coba lagi", onClick: () => void refresh() },
      variant: "error",
    }),
  });

  useEffect(() => {
    if (sessionDeadline === null) return;
    const serverClockOffset = serverClockOffsetRef.current;
    const currentTime = serverClockOffset === null ? Date.now() : serverClockOffset + performance.now();
    const timeout = window.setTimeout(() => {
      const latestServerClockOffset = serverClockOffsetRef.current;
      setNow(latestServerClockOffset === null ? Date.now() : latestServerClockOffset + performance.now());
    }, Math.max(0, sessionDeadline - currentTime));
    return () => window.clearTimeout(timeout);
  }, [sessionDeadline, state]);


  const item = items[Math.min(index, Math.max(0, items.length - 1))];

  useEffect(() => {
    if (!run || snapshot?.testType !== "cbt" || !item) return;
    window.localStorage.setItem(`tryout:${attemptId}:${run.id}:position`, item.id);
  }, [attemptId, item, run, snapshot?.testType]);

  const selected = run?.answers.find((answer) => answer.tryoutItemId === item?.id);
  const selectedOptionIds = selected?.selectedOptionIds?.length
    ? selected.selectedOptionIds
    : selected?.selectedOptionId
      ? [selected.selectedOptionId]
      : [];
  const selectionMode = item?.questionType === "multiple_choice" ? "multiple" as const : "single" as const;
  const answerIds = useMemo(() => new Set(run?.answers.reduce<string[]>((ids, answer) => {
    const idsForAnswer = answer.selectedOptionIds?.length
      ? answer.selectedOptionIds
      : answer.selectedOptionId
        ? [answer.selectedOptionId]
        : [];
    if (idsForAnswer.length) ids.push(answer.tryoutItemId);
    return ids;
  }, []) ?? []), [run?.answers]);
  const unansweredCount = items.filter((candidate) => !answerIds.has(candidate.id)).length;
  const markedCount = items.filter((candidate) => marked.has(candidate.id)).length;

  const save = async (optionId: string) => {
    if (!run || !item) return;
    const nextSelectedOptionIds = selectionMode === "multiple"
      ? selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((candidate) => candidate !== optionId)
        : [...selectedOptionIds, optionId]
      : [optionId];
    setSaveState("saving");
    try {
      const response = await saveTryoutAnswerAction(attemptId, run.id, item.id, nextSelectedOptionIds);
      if (!response.ok) {
        setSaveState("error");
        showToast(response.message, {
          action: { label: "Coba simpan lagi", onClick: () => void save(optionId) },
          variant: "error",
        });
        return;
      }
      setSaveState("saved");
      setState((current) => {
        if (!current?.activeRun || current.activeRun.id !== run.id) return current;
        const otherAnswers = current.activeRun.answers.filter((answer) => answer.tryoutItemId !== item.id);
        return { ...current, activeRun: { ...current.activeRun, answers: [...otherAnswers, { selectedOptionId: nextSelectedOptionIds[0] ?? null, selectedOptionIds: nextSelectedOptionIds, tryoutItemId: item.id }] } };
      });
    } catch (saveError) {
      unstable_rethrow(saveError);
      setSaveState("error");
      showToast("Jawaban belum berhasil disimpan. Periksa koneksi lalu coba lagi.", {
        action: { label: "Coba simpan lagi", onClick: () => void save(optionId) },
        variant: "error",
      });
    }
  };

  const begin = async (runId: string) => {
    setBusy(true);
    setOperationStatus("beginning");
    try {
      const response = await startActiveTryoutTestRunAction(attemptId, runId);
      if (!response.ok) {
        showToast(response.message, {
          action: { label: "Mulai lagi", onClick: () => void begin(runId) },
          variant: "error",
        });
        return;
      }
      await refresh();
    } catch (beginError) {
      unstable_rethrow(beginError);
      showToast("Bagian ini belum berhasil dimulai. Coba lagi beberapa saat lagi.", {
        action: { label: "Mulai lagi", onClick: () => void begin(runId) },
        variant: "error",
      });
    } finally {
      setOperationStatus(null);
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!run) return;
    setSubmitOpen(false);
    setBusy(true);
    setOperationStatus("submitting");
    try {
      const response = await sealTryoutTestRunAction(attemptId, run.id);
      if (!response.ok) {
        showToast(response.message, {
          action: { label: "Coba kumpulkan lagi", onClick: () => void submit() },
          variant: "error",
        });
        return;
      }
      await refresh();
    } catch (submitError) {
      unstable_rethrow(submitError);
      showToast("Bagian ini belum berhasil dikumpulkan. Coba lagi beberapa saat lagi.", {
        action: { label: "Coba kumpulkan lagi", onClick: () => void submit() },
        variant: "error",
      });
    } finally {
      setOperationStatus(null);
      setBusy(false);
    }
  };

  const toggleReport = () => {
    if (!item) return;
    setReported((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const enterFullscreen = async () => {
    if (!run) return;
    try {
      await document.documentElement.requestFullscreen();
      const response = await recordTryoutIntegrityEventAction(attemptId, run.id, "fullscreen_entered");
      if (!response.ok) showToast(response.message, { variant: "error" });
    } catch (error) {
      unstable_rethrow(error);
      showToast("Browser tidak dapat memasuki layar penuh.", {
        description: "Tryout tetap dapat dilanjutkan.",
        variant: "warning",
      });
    }
  };
  return {
    answerIds,
    annotationOpen,
    begin,
    busy,
    enterFullscreen,
    exitOpen,
    index,
    item,
    items,
    loadError,
    loadState,
    marked,
    markedCount,
    now,
    refresh,
    reported,
    router,
    safeReturnHref,
    save,
    saveState,
    sessionEnded,
    selected: selectedOptionIds,
    selectionMode,
    setExitOpen,
    setIndex,
    setSubmitOpen,
    snapshot,
    state,
    submit,
    submitOpen,
    timerUrgent: run ? remainingSeconds(run.serverDeadlineAt, now) <= 300 : false,
    toggleAnnotation,
    toggleReport,
    unansweredCount,
  };
}

function ParticipantAttemptModule({ attemptId, returnToHref, sessionId }: { attemptId: string; returnToHref?: string; sessionId?: string }) {
  const controller = useParticipantAttemptController({ attemptId, returnToHref, sessionId });
  const { item, state } = controller;
  const run = state?.activeRun;

  if (!state) {
    if (controller.loadState === "error") {
      return <TypedRouteState className="student-page-canvas" context="Data pengerjaan tetap ada saat kamu mencoba lagi." description={controller.loadError ?? "Tryout belum dapat dimuat. Coba lagi untuk memeriksa layanan Tryout."} kind="error" onRetry={() => void controller.refresh()} returnHref={controller.safeReturnHref} returnLabel="Kembali ke Tryout" title="Pengerjaan Tryout belum berhasil dimuat" />;
    }
    return <TypedRouteState className="student-page-canvas" description="Memulihkan pengerjaan Tryout. Jawaban yang tersimpan tidak diubah." kind="loading" title="Pengerjaan Tryout" />;
  }

  const nextRun = controller.sessionEnded ? undefined : state.runs.find((candidate) => candidate.status === "pending");
  if (!run) {
    return <ParticipantAttemptStatusScreen attemptId={attemptId} busy={controller.busy} finished={state.status !== "in_progress"} nextRun={nextRun} sessionEnded={controller.sessionEnded} onBegin={controller.begin} returnToHref={returnToHref} runs={state.runs} sessionId={sessionId} title={state.tryoutTitle} tryoutDescription={state.tryoutDescription} tryoutEventName={state.tryoutEventName} tryoutOrganizer={state.tryoutOrganizer} />;
  }
  if (!item) {
    return <main className="student-page-canvas mx-auto min-h-svh max-w-3xl px-5 py-12"><p role="alert">Snapshot soal aktif tidak tersedia. Muat ulang untuk memulihkan keadaan server.</p><Button className="mt-5" onClick={() => void controller.refresh()} variant="default">Muat ulang</Button></main>;
  }

  return <ParticipantAttemptScreen answerIds={controller.answerIds} annotationOpen={controller.annotationOpen} busy={controller.busy} enterFullscreen={controller.enterFullscreen} exitOpen={controller.exitOpen} index={controller.index} item={item} items={controller.items} marked={controller.marked} markedCount={controller.markedCount} now={controller.now} onIndexChange={controller.setIndex} onExit={() => controller.router.push(controller.safeReturnHref)} onToggleAnnotation={controller.toggleAnnotation} onToggleReport={controller.toggleReport} reported={controller.reported} run={run} save={controller.save} saveState={controller.saveState} selected={controller.selected} selectionMode={controller.selectionMode} setExitOpen={controller.setExitOpen} setSubmitOpen={controller.setSubmitOpen} snapshot={controller.snapshot} submit={controller.submit} submitOpen={controller.submitOpen} timerUrgent={controller.timerUrgent} tryoutTitle={state.tryoutTitle} runCount={state.runs.length} unansweredCount={controller.unansweredCount} />;
}

type ActiveRun = NonNullable<State["activeRun"]>;

type ParticipantAttemptScreenProps = {
  answerIds: Set<string>;
  annotationOpen: boolean;
  busy: boolean;
  enterFullscreen: () => void;
  exitOpen: boolean;
  index: number;
  item: Item;
  items: Item[];
  marked: Set<string>;
  markedCount: number;
  now: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
  onToggleAnnotation: () => void;
  onToggleReport: () => void;
  reported: Set<string>;
  run: ActiveRun;
  save: (optionId: string) => void;
  saveState: "idle" | "saving" | "saved" | "error";
  selected: string[];
  selectionMode: "single" | "multiple";
  setExitOpen: (open: boolean) => void;
  setSubmitOpen: (open: boolean) => void;
  snapshot: Snapshot | undefined;
  submit: () => void;
  submitOpen: boolean;
  timerUrgent: boolean;
  tryoutTitle: string;
  runCount: number;
  unansweredCount: number;
};

function getAttemptReadingTextClass(textScale: "compact" | "default" | "large") {
  return textScale === "large" ? "text-xl leading-[1.9]" : textScale === "compact" ? "text-base leading-[1.8]" : "text-lg leading-[1.85]";
}

function getAttemptNavigationItems(items: Item[], index: number, marked: Set<string>, answerIds: Set<string>): AssessmentQuestionMarkerItem[] {
  return items.map((candidate, candidateIndex) => ({
    id: candidate.id,
    isCurrent: candidateIndex === index,
    number: candidateIndex + 1,
    state: marked.has(candidate.id) ? "flagged" : answerIds.has(candidate.id) ? "answered" : "empty",
  }));
}

function ParticipantAttemptQuestionContent({
  busy,
  index,
  item,
  items,
  onToggleReport,
  reported,
  save,
  saveState,
  selected,
  selectionMode,
}: Pick<ParticipantAttemptScreenProps, "busy" | "index" | "item" | "items" | "onToggleReport" | "reported" | "save" | "saveState" | "selected" | "selectionMode">) {
  const [textScale, setTextScale] = useState<"compact" | "default" | "large">("default");
  const selectedOptionIdSet = new Set(selected);
  return <div className="mx-auto w-full max-w-[1650px]"><div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.96fr)_minmax(34rem,1fr)] lg:gap-12 xl:grid-cols-[minmax(0,0.98fr)_minmax(36rem,1fr)] xl:gap-16"><section className="min-w-0"><div className="flex min-h-12 items-center justify-between gap-4"><span className="shrink-0 text-lg font-semibold">Soal {Math.min(index + 1, items.length)}</span><div className="flex shrink-0 items-center gap-2"><AssessmentUtilityPill active={reported.has(item.id)} icon={Flag} label="Laporkan soal" onClick={onToggleReport} /><AssessmentIconButton ariaLabel="Perkecil ukuran font" icon={Minus} onClick={() => setTextScale((current) => current === "large" ? "default" : "compact")} /><AssessmentIconButton ariaLabel="Perbesar ukuran font" icon={Plus} onClick={() => setTextScale((current) => current === "compact" ? "default" : "large")} /></div></div><p className={cn("mt-7 whitespace-pre-wrap font-medium text-secondary-800", getAttemptReadingTextClass(textScale))}>{item.prompt}</p></section><section className="grid gap-4">{item.options.map((option) => <AssessmentAnswerOption disabled={saveState === "saving" || busy} key={option.id} onClick={() => void save(option.id)} option={{ id: option.id, key: option.choiceKey, text: option.content }} selected={selectedOptionIdSet.has(option.id)} selectionMode={selectionMode} textScale={textScale} />)}</section></div></div>;
}

function ParticipantAttemptDialogs({
  busy,
  exitOpen,
  markedCount,
  setExitOpen,
  setSubmitOpen,
  submit,
  submitOpen,
  unansweredCount,
  onExit,
}: Pick<ParticipantAttemptScreenProps, "busy" | "exitOpen" | "markedCount" | "setExitOpen" | "setSubmitOpen" | "submit" | "submitOpen" | "unansweredCount" | "onExit">) {
  return <><AlertDialog onOpenChange={(open) => { if (!busy) setExitOpen(open); }} open={exitOpen}><AlertDialogContent variant="danger"><AlertDialogHeader><AlertDialogMedia variant="danger"><AlertTriangle /></AlertDialogMedia><AlertDialogTitle>Keluar dari Tryout?</AlertDialogTitle><AlertDialogDescription>Jawaban yang sudah tersimpan tetap ada. Kamu bisa kembali ke pengerjaan ini sebelum batas waktu. Waktu tetap berjalan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Tetap mengerjakan</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={onExit} variant="destructive">Keluar dari Tryout</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><AlertDialog onOpenChange={(open) => { if (!busy) setSubmitOpen(open); }} open={submitOpen}><AlertDialogContent pending={busy} variant="warning"><AlertDialogHeader><AlertDialogMedia variant="warning"><AlertTriangle /></AlertDialogMedia><AlertDialogTitle>{unansweredCount ? "Masih ada soal yang belum terjawab" : "Kumpulkan bagian ini?"}</AlertDialogTitle><AlertDialogDescription>{unansweredCount ? <>Kamu masih memiliki <strong className="text-secondary-900">{unansweredCount} soal belum terjawab</strong>. Periksa kembali sebelum mengumpulkan bagian ini.</> : <>Setelah dikumpulkan, bagian ini tidak dapat dibuka lagi. {markedCount ? <><strong className="text-secondary-900">{markedCount} soal ditandai</strong> masih menunggu pemeriksaanmu.</> : "Semua soal sudah terjawab."}</>}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy} variant="outline">Kembali</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void submit()} variant="destructive">{busy ? "Mengumpulkan…" : "Kumpulkan bagian"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

function ParticipantAttemptFooter({
  busy,
  index,
  items,
  onIndexChange,
  saveState,
  setSubmitOpen,
}: Pick<ParticipantAttemptScreenProps, "busy" | "index" | "items" | "onIndexChange" | "saveState" | "selected" | "setSubmitOpen" | "snapshot">) {
  return <AssessmentNavigationFooter><Button aria-label="Soal sebelumnya" className="h-12 w-full justify-center" disabled={busy || saveState === "saving" || index === 0} onClick={() => onIndexChange(index - 1)} size="lg" variant="outline"><ArrowLeft /><span className="sr-only">Sebelumnya</span></Button><button aria-label="Coretan (sementara dinonaktifkan)" className="inline-flex min-w-16 cursor-not-allowed items-center justify-center rounded-xl px-2 py-1 text-secondary-400 opacity-60" disabled title="Coretan sementara dinonaktifkan" type="button"><span className="grid size-11 place-items-center rounded-full border-2 border-secondary-300"><PenTool className="size-6" /></span></button>{index >= items.length - 1 ? <Button aria-label="Kumpulkan bagian" className="h-12 w-full justify-center" disabled={busy || saveState === "saving"} onClick={() => setSubmitOpen(true)} size="lg" variant="default">Kumpulkan bagian</Button> : <Button aria-label="Soal selanjutnya" className="h-12 w-full justify-center" disabled={busy || saveState === "saving"} onClick={() => onIndexChange(index + 1)} size="lg" variant="default"><span className="sr-only">Selanjutnya</span><ArrowRight /></Button>}</AssessmentNavigationFooter>;
}

function ParticipantAttemptHeader({ enterFullscreen, now, run, runCount, timerUrgent, tryoutTitle }: Pick<ParticipantAttemptScreenProps, "enterFullscreen" | "now" | "run" | "runCount" | "timerUrgent" | "tryoutTitle">) {
  return <div className="relative grid min-h-20 grid-cols-1 justify-items-center gap-2 bg-white px-14 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-0 sm:px-16 sm:py-2"><h2 className="sr-only">{tryoutTitle} · {run.section.title} · Bagian {run.sequenceNo}/{runCount}</h2><div className="scale-75 sm:col-start-2"><BrandLockup /></div><div className="flex w-full max-w-sm min-w-0 items-center justify-center gap-2 sm:col-start-3 sm:w-auto sm:justify-self-end"><div aria-label={`Sisa waktu ${formatTimer(run.serverDeadlineAt, now)}`} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-sm font-semibold tabular-nums shadow-sm", timerUrgent ? "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg" : "border-primary-100 bg-white text-secondary-700")}><ClockCountdown className="size-4" /><span>{formatTimer(run.serverDeadlineAt, now)}</span></div>{run.fullscreenPrompt ? <Button aria-label="Masuk layar penuh" className="gap-2 " onClick={() => void enterFullscreen()} size="default" title="Masuk layar penuh" type="button" variant="outline"><Expand aria-hidden="true" /><span className="hidden sm:inline">Layar penuh</span></Button> : null}</div></div>;
}

function ParticipantAttemptScreen(props: ParticipantAttemptScreenProps) {
  const navigationItems = getAttemptNavigationItems(props.items, props.index, props.marked, props.answerIds);
  return <AssessmentWorkspace content={<ParticipantAttemptQuestionContent busy={props.busy} index={props.index} item={props.item} items={props.items} onToggleReport={props.onToggleReport} reported={props.reported} save={props.save} saveState={props.saveState} selected={props.selected} selectionMode={props.selectionMode} />} dialog={<ParticipantAttemptDialogs busy={props.busy} exitOpen={props.exitOpen} markedCount={props.markedCount} onExit={props.onExit} setExitOpen={props.setExitOpen} setSubmitOpen={props.setSubmitOpen} submit={props.submit} submitOpen={props.submitOpen} unansweredCount={props.unansweredCount} />} exitControl={<Button aria-label="Keluar dari Tryout" disabled={props.busy} onClick={() => props.setExitOpen(true)} size="icon" title="Keluar dari Tryout" variant="outline"><ArrowLeft /></Button>} footer={<ParticipantAttemptFooter busy={props.busy} index={props.index} items={props.items} onIndexChange={props.onIndexChange} saveState={props.saveState} selected={props.selected} setSubmitOpen={props.setSubmitOpen} snapshot={props.snapshot} />} header={<ParticipantAttemptHeader enterFullscreen={props.enterFullscreen} now={props.now} run={props.run} runCount={props.runCount} timerUrgent={props.timerUrgent} tryoutTitle={props.tryoutTitle} />} annotation={<AssessmentAnnotationOverlay onClose={props.onToggleAnnotation} open={props.annotationOpen} />} navigation={<AssessmentQuestionNavigation items={navigationItems} onSelect={(number) => props.onIndexChange(number - 1)} />}/>;
}
export { ParticipantAttemptModule };

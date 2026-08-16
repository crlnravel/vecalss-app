"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowsOut,
  CalendarBlank,
  Check,
  CheckCircle,
  Clock,
  CircleNotch,
  ClockCountdown,
  Flag,
  FloppyDisk,
  ListChecks,
  PaperPlaneTilt,
  SpinnerGap,
  UserCircle,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
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
import { studentCatalogueCardVariants } from "@/components/ui/student-catalogue-card-variants";
import { cn } from "@/lib/utils";
import {
  AssessmentAnswerOption,
  AssessmentQuestionNavigation,
  AssessmentUtilityPill,
  AssessmentWorkspace,
} from "@/modules/assessment/AssessmentWorkspace";
import type { AssessmentQuestionMarkerItem } from "@/modules/assessment/AssessmentWorkspace";
import {
  recordTryoutIntegrityEventAction,
  saveTryoutAnswerAction,
  sealTryoutTestRunAction,
  startActiveTryoutTestRunAction,
  tryoutAttemptStateAction,
} from "./participant-actions";

type Option = { choiceKey: string; content: string; id: string; sortOrder: number };
type Item = { id: string; options: Option[]; prompt: string; sortOrder: number };
type Snapshot = { durationSeconds: number; instructions?: string | null; items: Item[]; testType: "cbt" | "cat" };
type Section = {
  durationSeconds: number;
  questionCount: number;
  subtest: { code: string; name: string };
  testType: "cbt" | "cat";
  title: string;
};
type RunSummary = { id: string; section: Section; sequenceNo: number; status: string };
type State = {
  activeRun: null | {
    answers: Array<{ selectedOptionId: string | null; tryoutItemId: string }>;
    contentSnapshot: Snapshot;
    fullscreenPrompt: boolean;
    id: string;
    section: Section;
    serverDeadlineAt: Date | string | null;
    sequenceNo: number;
    status: string;
  };
  attemptId: string;
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
  message,
  nextRun,
  onBegin,
  runs,
  tryoutDescription,
  tryoutEventName,
  tryoutOrganizer,
  title,
}: {
  attemptId: string;
  busy: boolean;
  finished: boolean;
  message: string;
  nextRun?: RunSummary;
  onBegin: (runId: string) => void;
  runs: RunSummary[];
  tryoutDescription: string | null;
  tryoutEventName: string | null;
  tryoutOrganizer: string;
  title: string;
}) {
  const totalQuestions = runs.reduce((total, run) => total + run.section.questionCount, 0);
  const totalDuration = runs.reduce((total, run) => total + run.section.durationSeconds, 0);

  return (
    <main className="min-h-svh bg-[#f7faf8] px-4 py-8 text-secondary-900 sm:px-6 lg:py-12">
      <div className="mx-auto grid w-full max-w-[78rem] gap-8">
        <section className="overflow-hidden rounded-[2rem] border border-primary-100 bg-white shadow-[0_26px_80px_-46px_rgba(1,76,56,0.3)]">
          <div className="bg-[linear-gradient(120deg,#014c38_0%,#176b4d_68%,#2f8a5d_100%)] p-6 text-white sm:p-8">
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
              <UserCircle aria-hidden="true" className="size-5 shrink-0 text-primary-700" />
              <div className="min-w-0"><dt className="text-xs text-secondary-500">Disusun oleh</dt><dd className="mt-1 truncate font-semibold" title={tryoutOrganizer}>{tryoutOrganizer}</dd></div>
            </div>
            {tryoutEventName ? (
              <div className="flex items-center gap-3 p-5 sm:p-6">
                <CalendarBlank aria-hidden="true" className="size-5 shrink-0 text-primary-700" />
                <div className="min-w-0"><dt className="text-xs text-secondary-500">Event</dt><dd className="mt-1 truncate font-semibold" title={tryoutEventName}>{tryoutEventName}</dd></div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-5 sm:p-6">
                <ListChecks aria-hidden="true" className="size-5 shrink-0 text-primary-700" />
                <div className="min-w-0"><dt className="text-xs text-secondary-500">Bagian</dt><dd className="mt-1 font-semibold">{runs.length} bagian</dd></div>
              </div>
            )}
          </dl>
        </section>

        {message ? <p className="flex items-center gap-2 rounded-2xl border border-student-status-attention-border bg-student-status-attention-bg p-4 text-sm text-student-status-attention-fg" role="alert"><WarningCircle />{message}</p> : null}

        {finished ? (
          <section className="rounded-[2rem] border border-primary-100 bg-white p-6 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3">
              {["Memeriksa jawaban", "Menghitung skor", "Menyiapkan analisis"].map((label, itemIndex) => (
                <div className="rounded-2xl bg-primary-50 p-4 text-center" key={label}>
                  {itemIndex === 2 ? <SpinnerGap className="mx-auto animate-spin text-2xl text-primary-700" /> : <Check className="mx-auto text-2xl text-primary-700" />}
                  <p className="mt-2 text-sm font-semibold">{label}</p>
                </div>
              ))}
            </div>
            <Button className="mx-auto mt-6 flex" nativeButton={false} render={<Link href={`/tryout/attempt/${attemptId}/result`} />} variant="brand">Buka hasil <ArrowRight /></Button>
          </section>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {runs.map((candidate) => {
              const isNext = candidate.id === nextRun?.id;
              const isComplete = ["sealed", "expired"].includes(candidate.status);
              return (
                <article className={cn(studentCatalogueCardVariants({ variant: "kuis" }), "text-left")} key={candidate.id}>
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid size-14 place-items-center rounded-[1.25rem] bg-[linear-gradient(135deg,#b7ddc3_0%,#eef8f1_100%)] text-[#176b4d] shadow-[inset_0_-2px_0_rgba(1,76,56,0.08)] md:size-20 md:rounded-[1.6rem]">
                      {isComplete ? <Check aria-hidden="true" className="size-7 md:size-9" /> : <ListChecks aria-hidden="true" className="size-7 md:size-9" />}
                    </span>
                    <span className="rounded-full bg-primary-50 px-3 py-2 text-xs font-extrabold tracking-[0.1em] text-primary-800">Bagian {candidate.sequenceNo}</span>
                  </div>

                  <div className="mt-8">
                    <h2 className="line-clamp-2 text-3xl leading-[0.98] font-extrabold tracking-[-0.035em] text-secondary-900 md:text-4xl">{candidate.section.title}</h2>
                    <p className="mt-3 max-w-[30ch] text-sm leading-6 text-secondary-500">{isComplete ? "Bagian ini sudah selesai dan terkunci." : isNext ? "Siap dikerjakan." : "Menunggu bagian sebelumnya."}</p>
                  </div>

                  <div className="mt-auto flex items-end justify-between gap-4 pt-8">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold text-secondary-600">
                      <span className="inline-flex items-center gap-1.5"><ListChecks aria-hidden="true" className="size-4" />{candidate.section.questionCount} soal</span>
                      <span className="inline-flex items-center gap-1.5"><Clock aria-hidden="true" className="size-4" />{formatDuration(candidate.section.durationSeconds)}</span>
                    </div>
                    {isNext ? (
                      <Button aria-label={`Mulai bagian ${candidate.section.title}`} className="grid size-11 shrink-0 place-items-center rounded-full p-0" disabled={busy} onClick={() => onBegin(candidate.id)} size="icon" title={`Mulai bagian ${candidate.section.title}`} variant="brand">
                        {busy ? <SpinnerGap className="animate-spin" /> : <ArrowUpRight aria-hidden="true" className="size-5" />}
                      </Button>
                    ) : (
                      <span className="shrink-0 text-sm font-semibold text-secondary-500">{isComplete ? "Terkunci" : "Menunggu"}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function ParticipantAttemptModule({ attemptId }: { attemptId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState("Memulihkan tryout dari server…");
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [exitOpen, setExitOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const activeRunRef = useRef<string | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await tryoutAttemptStateAction(attemptId);
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      const nextState = response.result as State;
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
      setState(nextState);
      setMessage(restoredPositionMessage);
    } catch (refreshError) {
      unstable_rethrow(refreshError);
      setMessage(refreshError instanceof Error ? refreshError.message : "Tryout belum dapat dimuat.");
    } finally {
      setBusy(false);
    }
  }, [attemptId]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(loadTimer);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const run = state?.activeRun;
  const snapshot = run?.contentSnapshot;
  const items = useMemo(
    () => snapshot?.testType === "cat" ? (snapshot.items.length ? [snapshot.items.at(-1)!] : []) : snapshot?.items ?? [],
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
        if (!response.ok) setMessage(response.message);
        else if (["focus_lost", "visibility_hidden", "fullscreen_exited"].includes(eventType)) setMessage("Perpindahan layar dicatat sebagai peringatan. Timer tetap berjalan tanpa penalti otomatis.");
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

  useEffect(() => {
    if (!run?.serverDeadlineAt || remainingSeconds(run.serverDeadlineAt, now) !== 0 || busy) return;
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [busy, now, refresh, run?.serverDeadlineAt]);

  const item = items[Math.min(index, Math.max(0, items.length - 1))];

  useEffect(() => {
    if (!run || snapshot?.testType !== "cbt" || !item) return;
    window.localStorage.setItem(`tryout:${attemptId}:${run.id}:position`, item.id);
  }, [attemptId, item, run, snapshot?.testType]);

  const selected = run?.answers.find((answer) => answer.tryoutItemId === item?.id)?.selectedOptionId ?? null;
  const answerIds = useMemo(() => new Set(run?.answers.reduce<string[]>((ids, answer) => {
    if (answer.selectedOptionId) ids.push(answer.tryoutItemId);
    return ids;
  }, []) ?? []), [run?.answers]);
  const unansweredCount = items.filter((candidate) => !answerIds.has(candidate.id)).length;
  const markedCount = items.filter((candidate) => marked.has(candidate.id)).length;

  const save = async (optionId: string) => {
    if (!run || !item) return;
    setSaveState("saving");
    setMessage("");
    try {
      const response = await saveTryoutAnswerAction(attemptId, run.id, item.id, optionId);
      if (!response.ok) {
        setSaveState("error");
        setMessage(response.message);
        return;
      }
      setSaveState("saved");
      setState((current) => {
        if (!current?.activeRun || current.activeRun.id !== run.id) return current;
        const otherAnswers = current.activeRun.answers.filter((answer) => answer.tryoutItemId !== item.id);
        return { ...current, activeRun: { ...current.activeRun, answers: [...otherAnswers, { selectedOptionId: optionId, tryoutItemId: item.id }] } };
      });
      if (snapshot?.testType === "cat") await refresh();
    } catch (saveError) {
      unstable_rethrow(saveError);
      setSaveState("error");
      setMessage(saveError instanceof Error ? saveError.message : "Jawaban belum dapat disimpan.");
    }
  };

  const begin = async (runId: string) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await startActiveTryoutTestRunAction(attemptId, runId);
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      await refresh();
    } catch (beginError) {
      unstable_rethrow(beginError);
      setMessage(beginError instanceof Error ? beginError.message : "Test belum dapat dimulai.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!run) return;
    setSubmitOpen(false);
    setBusy(true);
    try {
      const response = await sealTryoutTestRunAction(attemptId, run.id);
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      await refresh();
    } catch (submitError) {
      unstable_rethrow(submitError);
      setMessage(submitError instanceof Error ? submitError.message : "Test belum dapat dikirim.");
    } finally {
      setBusy(false);
    }
  };

  const toggleMarked = () => {
    if (!run || !item) return;
    const next = new Set(marked);
    if (next.has(item.id)) next.delete(item.id);
    else next.add(item.id);
    setMarked(next);
    window.localStorage.setItem(`tryout:${attemptId}:${run.id}:marked`, JSON.stringify([...next]));
  };

  const enterFullscreen = async () => {
    if (!run) return;
    try {
      await document.documentElement.requestFullscreen();
      const response = await recordTryoutIntegrityEventAction(attemptId, run.id, "fullscreen_entered");
      if (!response.ok) setMessage(response.message);
    } catch (error) {
      unstable_rethrow(error);
      setMessage("Browser tidak dapat memasuki layar penuh. Tryout tetap dapat dilanjutkan.");
    }
  };

  if (!state) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-[#f7faf8] px-5 text-secondary-700">
        <div className="text-center"><CircleNotch className="mx-auto animate-spin text-4xl text-primary-700" /><p className="mt-4">{message}</p></div>
      </main>
    );
  }

  const nextRun = state.runs.find((candidate) => candidate.status === "pending");

  if (!run) {
    return <ParticipantAttemptStatusScreen attemptId={attemptId} busy={busy} finished={state.status !== "in_progress"} message={message} nextRun={nextRun} onBegin={begin} runs={state.runs} title={state.tryoutTitle} tryoutDescription={state.tryoutDescription} tryoutEventName={state.tryoutEventName} tryoutOrganizer={state.tryoutOrganizer} />;
  }

  if (!item) {
    return <main className="mx-auto min-h-svh max-w-3xl px-5 py-12"><p role="alert">Snapshot soal aktif tidak tersedia. Muat ulang untuk memulihkan keadaan server.</p><Button className="mt-5" onClick={() => void refresh()} variant="brand">Muat ulang</Button></main>;
  }

  const secondsLeft = remainingSeconds(run.serverDeadlineAt, now);
  const timerUrgent = secondsLeft <= 300;

  return (
    <ParticipantAttemptScreen
      answerIds={answerIds}
      busy={busy}
      enterFullscreen={enterFullscreen}
      exitOpen={exitOpen}
      index={index}
      item={item}
      items={items}
      marked={marked}
      markedCount={markedCount}
      message={message}
      now={now}
      onIndexChange={setIndex}
      onExit={() => router.push("/tryout")}
      onToggleMarked={toggleMarked}
      run={run}
      save={save}
      saveState={saveState}
      selected={selected}
      setExitOpen={setExitOpen}
      setSubmitOpen={setSubmitOpen}
      snapshot={snapshot}
      submit={submit}
      submitOpen={submitOpen}
      timerUrgent={timerUrgent}
      tryoutTitle={state.tryoutTitle}
      runCount={state.runs.length}
      unansweredCount={unansweredCount}
    />
  );
}

type ActiveRun = NonNullable<State["activeRun"]>;

function ParticipantAttemptScreen({
  answerIds,
  busy,
  enterFullscreen,
  exitOpen,
  index,
  item,
  items,
  marked,
  markedCount,
  message,
  now,
  onIndexChange,
  onExit,
  onToggleMarked,
  run,
  save,
  saveState,
  selected,
  setExitOpen,
  setSubmitOpen,
  snapshot,
  submit,
  submitOpen,
  timerUrgent,
  tryoutTitle,
  runCount,
  unansweredCount,
}: {
  answerIds: Set<string>;
  busy: boolean;
  enterFullscreen: () => void;
  exitOpen: boolean;
  index: number;
  item: Item;
  items: Item[];
  marked: Set<string>;
  markedCount: number;
  message: string;
  now: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
  onToggleMarked: () => void;
  run: ActiveRun;
  save: (optionId: string) => void;
  saveState: "idle" | "saving" | "saved" | "error";
  selected: string | null;
  setExitOpen: (open: boolean) => void;
  setSubmitOpen: (open: boolean) => void;
  snapshot: Snapshot | undefined;
  submit: () => void;
  submitOpen: boolean;
  timerUrgent: boolean;
  tryoutTitle: string;
  runCount: number;
  unansweredCount: number;
}) {
  const navigationItems: AssessmentQuestionMarkerItem[] = items.map((candidate, candidateIndex) => ({
    id: candidate.id,
    number: candidateIndex + 1,
    state: candidateIndex === index
      ? "active"
      : marked.has(candidate.id)
        ? "flagged"
        : answerIds.has(candidate.id)
          ? "answered"
          : "empty",
  }));

  return (
    <AssessmentWorkspace
      content={
        <div className="mx-auto flex w-full max-w-[1550px] flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3 font-medium text-sm">
            <span className="font-semibold tracking-[0.08em] text-primary-700 uppercase">
              Soal {Math.min(index + 1, items.length)} dari {items.length}
            </span>
            <span className="text-secondary-300">•</span>
            <span className="font-medium text-secondary-400">{run.section.subtest.name}</span>
            <span className="text-secondary-300">|</span>
            {snapshot?.testType === "cbt" ? (
              <AssessmentUtilityPill
                active={marked.has(item.id)}
                icon={Flag}
                label={marked.has(item.id) ? "Ditandai" : "Tandai"}
                onClick={onToggleMarked}
              />
            ) : null}
            <p
              aria-live="polite"
              className={cn(
                "flex min-h-9 items-center gap-2 text-xs font-medium",
                saveState === "error" ? "text-student-status-danger-fg" : "text-secondary-500",
              )}
            >
              {saveState === "saving" ? <><SpinnerGap className="animate-spin" />Menyimpan…</> : null}
              {saveState === "saved" ? <><CheckCircle className="text-primary-700" />Tersimpan</> : null}
              {saveState === "error" ? <><WarningCircle />Gagal tersimpan · pilih lagi</> : null}
              {saveState === "idle" ? <><FloppyDisk />Simpan otomatis</> : null}
            </p>
          </div>

          {snapshot?.instructions ? (
            <aside className="rounded-2xl border border-primary-100 bg-primary-50 p-4 text-sm leading-6 text-secondary-700">
              <strong>Petunjuk:</strong> {snapshot.instructions}
            </aside>
          ) : null}
          {message ? (
            <p className="flex items-center gap-2 rounded-xl border border-student-status-attention-border bg-student-status-attention-bg p-3 text-sm text-student-status-attention-fg" role="status">
              <WarningCircle />{message}
            </p>
          ) : null}

          <div className="space-y-5">
            <div className="space-y-5 border-t border-primary-100 pt-5 pb-6 font-medium text-secondary-800">
              <p className="whitespace-pre-wrap text-lg leading-[1.85]">{item.prompt}</p>
            </div>

            <div className="grid gap-4">
              {item.options.map((option) => (
                <AssessmentAnswerOption
                  disabled={saveState === "saving" || busy}
                  key={option.id}
                  onClick={() => void save(option.id)}
                  option={{ id: option.id, key: option.choiceKey, text: option.content }}
                  selected={selected === option.id}
                />
              ))}
            </div>
          </div>
        </div>
      }
      dialog={
        <>
          <AlertDialog onOpenChange={(open) => { if (!busy) setExitOpen(open); }} open={exitOpen}>
            <AlertDialogContent variant="danger">
              <AlertDialogHeader>
                <AlertDialogMedia variant="danger"><Warning /></AlertDialogMedia>
                <AlertDialogTitle>Keluar dari tryout?</AlertDialogTitle>
                <AlertDialogDescription>
                  Jawaban yang sudah tersimpan tetap aman. Kamu bisa kembali lagi untuk melanjutkan bagian ini.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Tetap mengerjakan</AlertDialogCancel>
                <AlertDialogAction onClick={onExit} variant="destructive">Ya, Keluar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog onOpenChange={(open) => { if (!busy) setSubmitOpen(open); }} open={submitOpen}>
            <AlertDialogContent pending={busy} variant="warning">
              <AlertDialogHeader>
                <AlertDialogMedia variant="warning"><Warning /></AlertDialogMedia>
                <AlertDialogTitle>Kirim dan kunci bagian ini?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bagian yang dikirim tidak dapat dibuka lagi. Kamu masih memiliki <strong className="text-secondary-900">{unansweredCount} soal belum dijawab</strong> dan <strong className="text-secondary-900">{markedCount} soal ditandai</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy} variant="brandOutline">Periksa lagi</AlertDialogCancel>
                <AlertDialogAction disabled={busy} onClick={() => void submit()} variant="destructive">{busy ? "Memproses…" : "Kirim bagian"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
      exitControl={
        <Button
          aria-label="Keluar dari tryout"
          onClick={() => setExitOpen(true)}
          size="icon-sm"
          title="Keluar dari tryout"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
      }
      footer={
        <div className="sticky bottom-0 z-10 border-t border-primary-100 bg-white/96 px-4 py-4 backdrop-blur md:px-8 lg:px-10">
          <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
            {snapshot?.testType === "cbt" ? (
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button disabled={busy || saveState === "saving" || index === 0} onClick={() => onIndexChange(index - 1)} size="lg" variant="brandOutline"><ArrowLeft data-icon="inline-start" />Soal Sebelumnya</Button>
                <Button disabled={busy || saveState === "saving" || index >= items.length - 1} onClick={() => onIndexChange(index + 1)} size="lg" variant="brandOutline">Soal Selanjutnya<ArrowRight data-icon="inline-end" /></Button>
              </div>
            ) : <p className="text-sm text-secondary-600">Pilih jawaban untuk memuat soal adaptif berikutnya.</p>}
            <div className="grid grid-cols-1 gap-2 sm:flex">
              <Button disabled={busy || saveState === "saving"} onClick={() => setSubmitOpen(true)} size="lg" variant="brand"><PaperPlaneTilt />Kirim bagian</Button>
            </div>
          </div>
        </div>
      }
      header={
        <div className="flex items-center justify-between border-b border-primary-100 px-4 py-4 md:px-8 lg:px-10">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-3xl leading-none font-semibold text-secondary-900 md:text-4xl">
              {tryoutTitle}
            </h2>
            <p className="mt-2 truncate text-sm text-secondary-500">
              {run.section.title} · Bagian {run.sequenceNo}/{runCount}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div
              aria-label={`Sisa waktu ${formatTimer(run.serverDeadlineAt, now)}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-sm font-semibold tabular-nums shadow-sm",
                timerUrgent
                  ? "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg"
                  : "border-primary-100 bg-white text-secondary-700",
              )}
            >
              <ClockCountdown className="size-4" />
              <span>{formatTimer(run.serverDeadlineAt, now)}</span>
            </div>
            {run.fullscreenPrompt ? <Button aria-label="Masuk layar penuh" className="hidden sm:inline-flex" onClick={() => void enterFullscreen()} size="icon" variant="brandOutline"><ArrowsOut /></Button> : null}
          </div>
        </div>
      }
      navigation={
        <AssessmentQuestionNavigation
          items={navigationItems}
          onSelect={(number) => onIndexChange(number - 1)}
        />
      }
    />
  );
}

export { ParticipantAttemptModule };

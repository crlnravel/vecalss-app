"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowsOut,
  Check,
  CheckCircle,
  CircleNotch,
  ClockCountdown,
  Flag,
  FloppyDisk,
  GridFour,
  LockKey,
  PaperPlaneTilt,
  Play,
  SpinnerGap,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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

function QuestionPalette({
  answers,
  currentIndex,
  items,
  marked,
  onSelect,
}: {
  answers: Set<string>;
  currentIndex: number;
  items: Item[];
  marked: Set<string>;
  onSelect: (index: number) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {items.map((item, itemIndex) => {
          const isCurrent = itemIndex === currentIndex;
          const isAnswered = answers.has(item.id);
          const isMarked = marked.has(item.id);
          return (
            <Button
              aria-label={`Soal ${itemIndex + 1}${isAnswered ? ", sudah dijawab" : ", belum dijawab"}${isMarked ? ", ditandai" : ""}`}
              aria-pressed={isCurrent}
              className={cn(
                "relative rounded-xl font-mono",
                isCurrent && "border-[#f5c518] bg-[#fff8d8] text-[#5c4800] ring-2 ring-[#f5c518]/30",
                !isCurrent && isAnswered && "border-primary-700 bg-primary-700 text-white hover:bg-primary-800",
              )}
              key={item.id}
              onClick={() => onSelect(itemIndex)}
              size="icon-sm"
              variant={isCurrent || isAnswered ? "contextSelected" : "context"}
            >
              {itemIndex + 1}
              {isMarked ? <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-white bg-amber-500" /> : null}
            </Button>
          );
        })}
      </div>
      <div className="mt-5 grid gap-2 text-xs text-secondary-600">
        <span className="flex items-center gap-2"><span className="size-3 rounded border border-primary-200 bg-white" />Belum dijawab</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded bg-primary-700" />Sudah dijawab</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded border-2 border-[#f5c518] bg-[#fff8d8]" />Sedang dibuka</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-amber-500" />Ditandai</span>
      </div>
    </div>
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
  const [submitOpen, setSubmitOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const activeRunRef = useRef<string | null>(null);

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
  const completedRuns = state.runs.filter((candidate) => ["sealed", "expired"].includes(candidate.status)).length;

  if (!run) {
    const finished = state.status !== "in_progress";
    return (
      <main className="min-h-svh bg-[#f7faf8] px-4 py-8 text-secondary-900 sm:px-6 lg:py-12">
        <div className="mx-auto grid max-w-4xl gap-6">
          <header className="text-center">
            <p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">{state.tryoutTitle}</p>
            <h1 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{finished ? "Jawaban sedang diproses" : completedRuns ? "Bagian selesai. Tarik napas sejenak." : "Ujian siap dimulai"}</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-secondary-600 sm:text-base">{finished ? "Sistem sedang menyiapkan skor, peringkat, dan review jawabanmu." : "Timer hanya berjalan untuk bagian yang sedang aktif. Bagian yang telah dikirim tetap terkunci."}</p>
          </header>

          {message ? <p className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert"><WarningCircle />{message}</p> : null}

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
              <Button className="mx-auto mt-6 flex" render={<Link href={`/tryout/attempt/${attemptId}/result`} />} variant="brand">Buka hasil <ArrowRight /></Button>
            </section>
          ) : (
            <section className="overflow-hidden rounded-[2rem] border border-primary-100 bg-white">
              <div className="flex items-center justify-between gap-4 border-b border-primary-100 bg-primary-50 p-5 sm:p-6">
                <div><p className="text-sm font-semibold">Progres ujian</p><p className="mt-1 text-sm text-secondary-500">{completedRuns} dari {state.runs.length} bagian selesai</p></div>
                <span className="font-mono text-2xl font-semibold text-primary-800">{completedRuns}/{state.runs.length}</span>
              </div>
              <div className="grid divide-y divide-primary-100">
                {state.runs.map((candidate) => {
                  const isNext = candidate.id === nextRun?.id;
                  const isComplete = ["sealed", "expired"].includes(candidate.status);
                  return (
                    <div className="grid gap-4 p-5 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:items-center sm:p-6" key={candidate.id}>
                      <span className={cn("flex size-11 items-center justify-center rounded-full text-sm font-bold", isComplete ? "bg-primary-700 text-white" : isNext ? "bg-[#f5c518] text-[#3b3005]" : "bg-secondary-100 text-secondary-500")}>{isComplete ? <Check /> : candidate.sequenceNo}</span>
                      <div><h2 className="font-semibold">{candidate.section.title}</h2><p className="mt-1 text-sm text-secondary-500">{candidate.section.questionCount} soal · {Math.round(candidate.section.durationSeconds / 60)} menit · {candidate.section.testType.toUpperCase()}</p></div>
                      {isNext ? <Button disabled={busy} onClick={() => void begin(candidate.id)} variant="brand">{busy ? <SpinnerGap className="animate-spin" /> : <Play />}Mulai bagian</Button> : <span className="text-sm text-secondary-500">{isComplete ? "Terkunci" : "Menunggu"}</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>
    );
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
      index={index}
      item={item}
      items={items}
      marked={marked}
      markedCount={markedCount}
      message={message}
      now={now}
      onIndexChange={setIndex}
      onToggleMarked={toggleMarked}
      paletteOpen={paletteOpen}
      run={run}
      save={save}
      saveState={saveState}
      selected={selected}
      setPaletteOpen={setPaletteOpen}
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
  index,
  item,
  items,
  marked,
  markedCount,
  message,
  now,
  onIndexChange,
  onToggleMarked,
  paletteOpen,
  run,
  save,
  saveState,
  selected,
  setPaletteOpen,
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
  index: number;
  item: Item;
  items: Item[];
  marked: Set<string>;
  markedCount: number;
  message: string;
  now: number;
  onIndexChange: (index: number) => void;
  onToggleMarked: () => void;
  paletteOpen: boolean;
  run: ActiveRun;
  save: (optionId: string) => void;
  saveState: "idle" | "saving" | "saved" | "error";
  selected: string | null;
  setPaletteOpen: (open: boolean) => void;
  setSubmitOpen: (open: boolean) => void;
  snapshot: Snapshot | undefined;
  submit: () => void;
  submitOpen: boolean;
  timerUrgent: boolean;
  tryoutTitle: string;
  runCount: number;
  unansweredCount: number;
}) {
  return (
    <main className="min-h-svh bg-[#f4f7f5] text-secondary-900">
      <header className="sticky top-0 z-30 border-b border-primary-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-secondary-500">{tryoutTitle} · Bagian {run.sequenceNo}/{runCount}</p>
            <p className="mt-0.5 truncate font-semibold">{run.section.title}</p>
          </div>
          <div className={cn("flex min-h-11 items-center gap-2 rounded-xl px-3 font-mono text-lg font-semibold tabular-nums", timerUrgent ? "bg-red-50 text-red-800" : "bg-[#fff8d8] text-[#5c4800]")} aria-label={`Sisa waktu ${formatTimer(run.serverDeadlineAt, now)}`}>
            <ClockCountdown />
            <span className="hidden font-sans text-xs font-bold sm:inline">{timerUrgent ? "Segera habis" : "Sisa waktu"}</span>
            {formatTimer(run.serverDeadlineAt, now)}
          </div>
          {run.fullscreenPrompt ? <Button aria-label="Masuk layar penuh" className="hidden sm:inline-flex" onClick={() => void enterFullscreen()} size="icon" variant="brandOutline"><ArrowsOut /></Button> : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-8 lg:py-7">
        <div className="min-w-0">
          <div className="grid gap-3 rounded-2xl border border-primary-100 bg-white px-4 py-3 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.08em] text-primary-700 uppercase">Soal {Math.min(index + 1, items.length)} dari {items.length}</p>
              <p className="mt-1 text-sm text-secondary-500">{snapshot?.testType === "cat" ? "CAT · jawaban tidak dapat diubah setelah dikirim" : `${answerIds.size} dijawab · ${markedCount} ditandai`}</p>
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <p aria-live="polite" className={cn("flex min-h-9 items-center gap-2 text-xs font-medium", saveState === "error" ? "text-red-700" : "text-secondary-500")}>{saveState === "saving" ? <><SpinnerGap className="animate-spin" />Menyimpan…</> : saveState === "saved" ? <><CheckCircle className="text-primary-700" />Tersimpan</> : saveState === "error" ? <><WarningCircle />Gagal tersimpan · pilih lagi</> : <><FloppyDisk />Simpan otomatis</>}</p>
              {snapshot?.testType === "cbt" ? <Button className="lg:hidden" onClick={() => setPaletteOpen(true)} variant="brandOutline"><GridFour />Daftar soal</Button> : null}
            </div>
          </div>

          {snapshot?.instructions ? <aside className="mt-4 rounded-2xl border border-primary-100 bg-primary-50 p-4 text-sm leading-6 text-secondary-700"><strong>Petunjuk:</strong> {snapshot.instructions}</aside> : null}
          {message ? <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status"><WarningCircle />{message}</p> : null}

          <section className="mt-4 rounded-[1.75rem] border border-primary-100 bg-white p-5 sm:p-7 lg:p-8">
            <p className="whitespace-pre-wrap text-base leading-7 sm:text-lg sm:leading-8">{item.prompt}</p>
            <div className="mt-7 grid gap-3">
              {item.options.map((option) => (
                <Button
                  aria-pressed={selected === option.id}
                  className="h-auto min-h-14 w-full justify-start whitespace-normal rounded-2xl px-4 py-3 text-left text-base leading-6"
                  disabled={saveState === "saving"}
                  key={option.id}
                  onClick={() => void save(option.id)}
                  variant={selected === option.id ? "contextSelected" : "context"}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold", selected === option.id ? "border-primary-700 bg-primary-700 text-white" : "border-primary-200 bg-primary-50 text-primary-800")}>{option.choiceKey}</span>
                  <span>{option.content}</span>
                </Button>
              ))}
            </div>
          </section>

          <footer className="mt-4 flex flex-col gap-3 rounded-2xl border border-primary-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            {snapshot?.testType === "cbt" ? (
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button disabled={busy || saveState === "saving" || index === 0} onClick={() => onIndexChange(index - 1)} variant="brandOutline"><ArrowLeft />Sebelumnya</Button>
                <Button disabled={busy || saveState === "saving" || index >= items.length - 1} onClick={() => onIndexChange(index + 1)} variant="brandOutline">Berikutnya<ArrowRight /></Button>
              </div>
            ) : <p className="text-sm text-secondary-600">Pilih jawaban untuk memuat soal adaptif berikutnya.</p>}
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {snapshot?.testType === "cbt" ? <Button aria-pressed={marked.has(item.id)} onClick={onToggleMarked} variant={marked.has(item.id) ? "contextSelected" : "context"}><Flag />{marked.has(item.id) ? "Ditandai" : "Tandai"}</Button> : null}
              <Button disabled={busy || saveState === "saving"} onClick={() => setSubmitOpen(true)} variant="brand"><PaperPlaneTilt />Kirim bagian</Button>
            </div>
          </footer>
        </div>

        {snapshot?.testType === "cbt" ? (
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-[1.5rem] border border-primary-100 bg-white p-5">
              <p className="text-xs font-bold tracking-[0.12em] text-primary-700 uppercase">Daftar soal</p>
              <p className="mt-2 text-sm text-secondary-500">Pilih nomor untuk berpindah dalam bagian ini.</p>
              <div className="mt-5"><QuestionPalette answers={answerIds} currentIndex={index} items={items} marked={marked} onSelect={onIndexChange} /></div>
              <Button className="mt-6 w-full" onClick={() => setSubmitOpen(true)} variant="brandOutline"><LockKey />Akhiri bagian</Button>
            </div>
          </aside>
        ) : null}
      </div>

      <Dialog onOpenChange={setPaletteOpen} open={paletteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Daftar soal</DialogTitle><DialogDescription>Pilih nomor soal untuk berpindah.</DialogDescription></DialogHeader>
          <QuestionPalette answers={answerIds} currentIndex={index} items={items} marked={marked} onSelect={(nextIndex) => { onIndexChange(nextIndex); setPaletteOpen(false); }} />
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setSubmitOpen} open={submitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-50 text-amber-800"><Warning /></AlertDialogMedia>
            <AlertDialogTitle>Kirim dan kunci bagian ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Bagian yang dikirim tidak dapat dibuka lagi. Kamu masih memiliki <strong className="text-secondary-900">{unansweredCount} soal belum dijawab</strong> dan <strong className="text-secondary-900">{markedCount} soal ditandai</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="brandOutline">Periksa lagi</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()} variant="brand">Kirim bagian</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

export { ParticipantAttemptModule };

"use client";

import {
  ArrowRight,
  ArrowsClockwise,
  CheckCircle,
  Compass,
  Eye,
  SpinnerGap,
  WarningCircle,
  WifiHigh,
} from "@phosphor-icons/react";
import Link from "next/link";
import { ChevronLeft } from "@/lib/icons";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { SessionContext } from "@/lib/auth/types";
import type {
  ParticipantTryout,
  ParticipantTryoutAssignment,
} from "@/lib/tryout/participant-repository";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { startTryoutAttemptAction } from "@/modules/tryout/participant-actions";
import { formatDuration, formatSchedule } from "@/modules/tryout/ParticipantTryoutWorkspaceUtils";

function countdown(target: Date, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600) + days * 24;
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

const rules = [
  { description: "Gunakan koneksi yang stabil. Jawaban tersimpan otomatis dan status penyimpanan akan terlihat selama ujian.", icon: WifiHigh, title: "Koneksi stabil" },
  { description: "Timer server terus berjalan saat halaman dimuat ulang, ditutup, atau perangkat berpindah aplikasi.", icon: ArrowsClockwise, title: "Waktu terus berjalan" },
  { description: "Pada CBT, kamu bisa kembali ke soal dalam bagian yang sama. Pada CAT, jawaban terkunci setelah dikirim.", icon: Compass, title: "Ikuti format soal" },
  { description: "Perpindahan tab, hilang fokus, dan keluar dari layar penuh dicatat sebagai peringatan tanpa penalti skor otomatis.", icon: Eye, title: "Aktivitas layar dicatat" },
];

function ParticipantWaitingRoomModule({
  assignment,
  session,
  tryout,
}: {
  assignment: ParticipantTryoutAssignment;
  session: SessionContext;
  tryout: ParticipantTryout;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const acceptanceStorageKey = "vecalss:tryout-waiting:" + assignment.id + ":accepted";

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(acceptanceStorageKey) !== "true") return;
      const frame = window.requestAnimationFrame(() => setAccepted(true));
      return () => window.cancelAnimationFrame(frame);
    } catch {
      // Session storage can be unavailable in privacy-restricted browsers.
    }
  }, [acceptanceStorageKey]);

  const opensAt = new Date(assignment.availableFrom).getTime();
  const closesAt = new Date(assignment.availableUntil).getTime();
  const beforeWindow = now < opensAt;
  const afterWindow = now >= closesAt;
  const canStart = accepted && !beforeWindow && !afterWindow && assignment.status === "active";
  const attempt = assignment.attempt;
  const [hours, minutes, seconds] = countdown(beforeWindow ? assignment.availableFrom : assignment.availableUntil, now).split(":");
  const countdownLabel = beforeWindow
    ? "Tryout dibuka dalam:"
    : afterWindow
      ? "Sesi sudah berakhir."
      : "Batas akhir sesi dalam:";
  const countdownAriaLabel = afterWindow
    ? countdownLabel
    : countdownLabel + " " + hours + " jam " + minutes + " menit " + seconds + " detik";
  const countdownAnnouncement = afterWindow
    ? countdownLabel
    : countdownLabel + " " + hours + " jam " + minutes + " menit.";
  const totalDuration = tryout.sections.reduce((total, section) => total + section.durationSeconds, 0);
  const formatLabel = tryout.sections.some((section) => section.testType === "cat") ? "CBT + CAT" : "CBT";
  const blockedReason = assignment.status !== "active"
    ? "Sesi ini tidak lagi tersedia. Kembali ke detail tryout untuk melihat pilihan lain."
    : !accepted
      ? "Centang pernyataan di bawah untuk melanjutkan."
      : beforeWindow
        ? "Tombol akan aktif saat " + formatSchedule(assignment.availableFrom) + "."
        : afterWindow
          ? "Sesi ini sudah berakhir. Kembali ke detail tryout untuk melihat pilihan lain."
          : null;
  const startButtonLabel = busy
    ? "Menyiapkan…"
    : canStart
      ? "Masuk ke ujian"
      : assignment.status !== "active"
        ? "Sesi tidak tersedia"
        : !accepted
          ? "Setujui aturan untuk mulai"
          : beforeWindow
            ? "Menunggu waktu mulai"
            : "Sesi sudah berakhir";

  const handleStart = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await startTryoutAttemptAction(assignment.id);
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      window.location.assign(`/tryout/attempt/${response.result.attemptId}`);
    } catch (startError) {
      unstable_rethrow(startError);
      setMessage(startError instanceof Error ? startError.message : "Tryout belum dapat dimulai.");
    } finally {
      setBusy(false);
    }
  };

  if (attempt) {
    const resultReady = attempt.status !== "in_progress";
    return (
      <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Ruang tunggu" session={session} showSearch={false}>
        <div className="mx-auto grid w-full max-w-3xl gap-5 rounded-[2rem] border border-primary-100 bg-white p-7 text-center sm:p-10">
          <CheckCircle aria-hidden="true" className="mx-auto text-5xl text-primary-700" />
          <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em]">{resultReady ? "Tryout sudah selesai" : "Tryout masih berjalan"}</h1>
          <p className="text-secondary-600">{resultReady ? "Hasilmu siap diperiksa saat kebijakan rilis mengizinkan." : "Kamu dapat melanjutkan dari keadaan terakhir yang dikonfirmasi server."}</p>
          <Button className="mx-auto" render={<Link href={resultReady ? `/tryout/attempt/${attempt.id}/result` : `/tryout/attempt/${attempt.id}`} />} variant="brand">
            {resultReady ? "Lihat hasil" : "Lanjutkan ujian"} <ArrowRight />
          </Button>
        </div>
      </CourseWorkspaceShell>
    );
  }

  return (
    <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Ruang tunggu" mainClassName="gap-4 py-5 md:py-6" session={session} showSearch={false}>
      <Button
        className="w-fit text-secondary-600"
        render={<Link href={`/tryout/${tryout.id}`} />}
        size="sm"
        variant="ghost"
      >
        <ChevronLeft aria-hidden="true" />
        <span>Kembali ke detail tryout</span>
      </Button>

      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <section aria-describedby="waiting-room-countdown" aria-labelledby="waiting-room-title" className="relative isolate overflow-hidden rounded-[2rem] border border-primary-900/10 bg-[radial-gradient(circle_at_50%_85%,rgba(15,111,82,0.52),transparent_46%),linear-gradient(125deg,#002c22_0%,#00513b_52%,#002d23_100%)] text-white">
          <div aria-hidden="true" className="absolute inset-x-[18%] inset-y-[-35%] rounded-[48%] border border-white/5" />
          <div aria-hidden="true" className="absolute inset-x-[28%] inset-y-[-20%] rounded-[48%] border border-white/5" />
          <div className="relative grid min-h-[19rem] place-items-center px-5 py-10 text-center sm:min-h-[23rem] sm:px-10 sm:py-14">
            <div className="w-full">
              <h1 className="mx-auto max-w-3xl text-balance font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl lg:text-5xl" id="waiting-room-title">{tryout.title}</h1>
              <p className="mt-3 inline-flex items-center gap-2 text-base font-medium text-primary-100 sm:text-lg">
                <Compass aria-hidden="true" className="size-5" />
                <span>Ruang tunggu · {assignment.name}</span>
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold tracking-[0.12em] text-primary-100 uppercase sm:text-sm">
                <span>{formatLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{tryout.sections.length} bagian</span>
                <span aria-hidden="true">·</span>
                <span>{totalDuration ? formatDuration(totalDuration) : "Durasi menyusul"}</span>
                {tryout.examEvent ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{tryout.examEvent.name}</span>
                  </>
                ) : null}
              </div>
              <p className="mt-9 text-xl font-medium tracking-[-0.02em] text-primary-100 sm:text-2xl" id="waiting-room-countdown">{countdownLabel}</p>
              {afterWindow ? (
                <div aria-atomic="true" aria-live="polite" className="mx-auto mt-8 inline-flex min-h-14 items-center rounded-2xl border border-white/15 bg-white/10 px-5 text-xl font-semibold sm:text-2xl" role="status">Sesi sudah berakhir</div>
              ) : (
                <div aria-label={countdownAriaLabel} aria-live="off" className="mt-8 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-white sm:mt-10 sm:gap-4" role="timer">
                  <div><p className="font-mono text-5xl leading-none font-semibold tracking-[-0.08em] tabular-nums sm:text-7xl lg:text-9xl">{hours}</p><p className="mt-4 text-xs font-semibold tracking-[0.18em] text-primary-100 uppercase sm:text-base">Jam</p></div>
                  <span aria-hidden="true" className="font-mono text-5xl leading-none font-semibold sm:text-7xl lg:text-9xl">:</span>
                  <div><p className="font-mono text-5xl leading-none font-semibold tracking-[-0.08em] tabular-nums sm:text-7xl lg:text-9xl">{minutes}</p><p className="mt-4 text-xs font-semibold tracking-[0.18em] text-primary-100 uppercase sm:text-base">Menit</p></div>
                  <span aria-hidden="true" className="font-mono text-5xl leading-none font-semibold sm:text-7xl lg:text-9xl">:</span>
                  <div><p className="font-mono text-5xl leading-none font-semibold tracking-[-0.08em] tabular-nums sm:text-7xl lg:text-9xl">{seconds}</p><p className="mt-4 text-xs font-semibold tracking-[0.18em] text-primary-100 uppercase sm:text-base">Detik</p></div>
                </div>
              )}
              <p aria-atomic="true" aria-live="polite" className="sr-only">{countdownAnnouncement}</p>
              <div className="mx-auto mt-8 grid max-w-2xl gap-3 text-sm text-primary-100 sm:grid-cols-2 sm:gap-5">
                <p><span className="block text-xs font-semibold tracking-[0.14em] uppercase">Mulai</span><span className="mt-1 block text-white">{formatSchedule(assignment.availableFrom)}</span></p>
                <p><span className="block text-xs font-semibold tracking-[0.14em] uppercase">Batas akhir</span><span className="mt-1 block text-white">{formatSchedule(assignment.availableUntil)}</span></p>
              </div>
            </div>
          </div>
        </section>

        {message ? <p className="flex items-center gap-2 rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg p-4 text-sm text-student-status-danger-fg" role="alert"><WarningCircle aria-hidden="true" />{message}</p> : null}

        <section className="rounded-[2rem] border border-primary-100 bg-white p-6 sm:p-8">
          <h2 className="font-heading text-2xl font-semibold tracking-[-0.025em]">Sebelum mulai</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {rules.map((rule) => {
              const Icon = rule.icon;
              return (
                <article className="rounded-2xl border border-primary-100 p-4" key={rule.title}>
                  <Icon aria-hidden="true" className="text-2xl text-primary-700" />
                  <h3 className="mt-3 font-semibold">{rule.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-secondary-600">{rule.description}</p>
                </article>
              );
            })}
          </div>

          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl bg-primary-50 p-4 text-sm leading-6 text-secondary-800">
            <Checkbox
              checked={accepted}
              className="mt-1 size-5"
              onCheckedChange={(value) => {
                const nextAccepted = value === true;
                setAccepted(nextAccepted);
                try {
                  if (nextAccepted) {
                    window.sessionStorage.setItem(acceptanceStorageKey, "true");
                  } else {
                    window.sessionStorage.removeItem(acceptanceStorageKey);
                  }
                } catch {
                  // Session storage can be unavailable in privacy-restricted browsers.
                }
              }}
            />
            <span>Saya memahami timer tidak dapat dijeda dan siap mengikuti aturan sesi ini.</span>
          </label>

          <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex flex-col gap-3 border-t border-primary-100 bg-white/95 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-14px_30px_-24px_rgba(0,81,59,0.8)] backdrop-blur sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none sm:backdrop-blur-none">
            {blockedReason ? <p className="text-sm leading-6 text-secondary-600" id="start-tryout-help" role="status">{blockedReason}</p> : <span aria-hidden="true" />}
            <Button aria-busy={busy} aria-describedby={blockedReason ? "start-tryout-help" : undefined} className="w-full sm:w-auto" disabled={!canStart || busy} onClick={() => void handleStart()} size="lg" variant="brand">
              {busy ? <><SpinnerGap className="animate-spin" />{startButtonLabel}</> : <>{startButtonLabel} <ArrowRight /></>}
            </Button>
          </div>
        </section>
      </div>
    </CourseWorkspaceShell>
  );
}

export { ParticipantWaitingRoomModule };

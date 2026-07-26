"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  CheckCircle,
  Compass,
  FloppyDisk,
  LockKey,
  SpinnerGap,
  WarningCircle,
  WifiHigh,
} from "@phosphor-icons/react";
import Link from "next/link";
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

function countdown(target: Date, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600) + days * 24;
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

const rules = [
  { description: "Gunakan koneksi yang stabil. Jawaban dianggap aman setelah indikator tersimpan muncul.", icon: WifiHigh, title: "Koneksi stabil" },
  { description: "Hindari memuat ulang halaman. Timer server tetap berjalan meski halaman tertutup.", icon: ArrowsClockwise, title: "Jangan refresh" },
  { description: "CBT dapat dinavigasi dalam bagian yang sama; CAT tidak dapat kembali ke soal sebelumnya.", icon: Compass, title: "Navigasi per bagian" },
  { description: "Setiap jawaban disimpan otomatis tanpa tombol Simpan.", icon: FloppyDisk, title: "Simpan otomatis" },
  { description: "Bagian dikunci setelah dikirim dan akan terkirim otomatis ketika waktu habis.", icon: LockKey, title: "Kunci dan kirim otomatis" },
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

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const opensAt = new Date(assignment.availableFrom).getTime();
  const closesAt = new Date(assignment.availableUntil).getTime();
  const beforeWindow = now < opensAt;
  const afterWindow = now >= closesAt;
  const canStart = accepted && !beforeWindow && !afterWindow && assignment.status === "active";
  const attempt = assignment.attempt;
  const [hours, minutes, seconds] = countdown(beforeWindow ? assignment.availableFrom : assignment.availableUntil, now).split(":");
  const countdownLabel = beforeWindow
    ? "Waktu sebelum tryout dimulai:"
    : afterWindow
      ? "Waktu tryout telah berakhir."
      : "Sisa waktu tryout:";

  const handleStart = async () => {
    setBusy(true);
    setMessage(null);
    const response = await startTryoutAttemptAction(assignment.id);
    setBusy(false);
    if (!response.ok) {
      setMessage(response.message);
      return;
    }
    window.location.assign(`/tryout/attempt/${response.result.attemptId}`);
  };

  if (attempt) {
    const resultReady = attempt.status !== "in_progress";
    return (
      <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Ruang tunggu" session={session} showSearch={false}>
        <div className="mx-auto grid w-full max-w-3xl gap-5 rounded-[2rem] border border-primary-100 bg-white p-7 text-center sm:p-10">
          <CheckCircle className="mx-auto text-5xl text-primary-700" />
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
    <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Ruang tunggu" session={session} showSearch={false}>
      <Button className="w-fit" render={<Link href={`/tryout/${tryout.id}`} />} variant="ghost"><ArrowLeft />Kembali ke detail</Button>

      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <section aria-label={`${countdownLabel} ${hours} jam ${minutes} menit ${seconds} detik`} className="relative isolate overflow-hidden rounded-[2rem] border border-primary-900/10 bg-[radial-gradient(circle_at_50%_85%,rgba(15,111,82,0.52),transparent_46%),linear-gradient(125deg,#002c22_0%,#00513b_52%,#002d23_100%)] text-white">
          <div aria-hidden="true" className="absolute inset-x-[18%] inset-y-[-35%] rounded-[48%] border border-white/5" />
          <div aria-hidden="true" className="absolute inset-x-[28%] inset-y-[-20%] rounded-[48%] border border-white/5" />
          <div className="relative grid min-h-[19rem] place-items-center px-5 py-10 text-center sm:min-h-[23rem] sm:px-10 sm:py-14">
            <div>
              <p className="text-xl font-medium tracking-[-0.02em] text-primary-100 sm:text-2xl">{countdownLabel}</p>
              <div className="mt-8 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 text-white sm:mt-10 sm:gap-4">
                <div><p className="font-mono text-5xl leading-none font-semibold tracking-[-0.08em] tabular-nums sm:text-7xl lg:text-9xl">{hours}</p><p className="mt-4 text-xs font-semibold tracking-[0.18em] text-primary-100 uppercase sm:text-base">Jam</p></div>
                <span aria-hidden="true" className="font-mono text-5xl leading-none font-semibold sm:text-7xl lg:text-9xl">:</span>
                <div><p className="font-mono text-5xl leading-none font-semibold tracking-[-0.08em] tabular-nums sm:text-7xl lg:text-9xl">{minutes}</p><p className="mt-4 text-xs font-semibold tracking-[0.18em] text-primary-100 uppercase sm:text-base">Menit</p></div>
                <span aria-hidden="true" className="font-mono text-5xl leading-none font-semibold sm:text-7xl lg:text-9xl">:</span>
                <div><p className="font-mono text-5xl leading-none font-semibold tracking-[-0.08em] tabular-nums sm:text-7xl lg:text-9xl">{seconds}</p><p className="mt-4 text-xs font-semibold tracking-[0.18em] text-primary-100 uppercase sm:text-base">Detik</p></div>
              </div>
            </div>
          </div>
        </section>

        {message ? <p className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><WarningCircle />{message}</p> : null}

        <section className="rounded-[2rem] border border-primary-100 bg-white p-6 sm:p-8">
          <h2 className="font-heading text-2xl font-semibold tracking-[-0.025em]">Aturan Ujian</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {rules.map((rule) => {
              const Icon = rule.icon;
              return (
                <article className="rounded-2xl border border-primary-100 p-4" key={rule.title}>
                  <Icon className="text-2xl text-primary-700" />
                  <h3 className="mt-3 font-semibold">{rule.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-secondary-600">{rule.description}</p>
                </article>
              );
            })}
          </div>

          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl bg-primary-50 p-4 text-sm leading-6 text-secondary-800">
            <Checkbox checked={accepted} className="mt-1 size-5" onCheckedChange={(value) => setAccepted(value === true)} />
            <span>Saya sudah membaca aturan dan memahami bahwa timer bagian tidak dapat dijeda setelah dimulai.</span>
          </label>

          <div className="mt-6 flex justify-end">
            <Button disabled={!canStart || busy} onClick={() => void handleStart()} size="lg" variant="brand">
              {busy ? <><SpinnerGap className="animate-spin" />Menyiapkan…</> : <>Masuk ke ujian <ArrowRight /></>}
            </Button>
          </div>
        </section>
      </div>
    </CourseWorkspaceShell>
  );
}

export { ParticipantWaitingRoomModule };

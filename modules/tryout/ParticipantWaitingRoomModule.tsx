"use client";

import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Eye,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  WifiHigh,
} from "@/lib/icons";
import Link from "next/link";
import { ChevronLeft } from "@/lib/icons";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useState } from "react";

import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { buildStudentAttemptHref } from "@/lib/navigation/canonical-context";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import type {
  ParticipantTryout,
  ParticipantTryoutAssignment,
} from "@/lib/tryout/participant-repository";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { startTryoutAttemptAction } from "@/modules/tryout/participant-actions";
import { formatSchedule } from "@/modules/tryout/ParticipantTryoutWorkspaceUtils";

const rules = [
  { description: "Gunakan koneksi yang stabil. Jawaban tersimpan otomatis dan status penyimpanan akan terlihat selama ujian.", icon: WifiHigh, title: "Koneksi stabil" },
  { description: "Timer server terus berjalan saat halaman dimuat ulang, ditutup, atau perangkat berpindah aplikasi.", icon: RefreshCw, title: "Waktu terus berjalan" },
  { description: "Pada CBT, kamu bisa kembali ke soal dalam bagian yang sama dan meninjau jawaban sebelum mengumpulkan.", icon: Compass, title: "Ikuti format soal" },
  { description: "Perpindahan tab, hilang fokus, dan keluar dari layar penuh dicatat sebagai peringatan tanpa penalti skor otomatis.", icon: Eye, title: "Aktivitas layar dicatat" },
];

function waitingBlockedReason(assignment: ParticipantTryoutAssignment, beforeWindow: boolean, afterWindow: boolean) {
  if (assignment.status !== "active") return "Sesi ini tidak lagi tersedia. Kembali ke katalog tryout untuk melihat pilihan lain.";
  if (beforeWindow) return "Tombol akan aktif saat " + formatSchedule(assignment.availableFrom) + ".";
  if (afterWindow) return "Sesi ini sudah berakhir. Kembali ke katalog tryout untuk melihat pilihan lain.";
  return null;
}

function WaitingRoomAttemptState({ assignment, notificationFeed, returnToHref, session }: { assignment: ParticipantTryoutAssignment; notificationFeed?: StudentNotificationFeed; returnToHref?: string; session: SessionContext }) {
  const attempt = assignment.attempt;
  if (!attempt) return null;
  const resultReady = attempt.status !== "in_progress";
  const href = buildStudentAttemptHref(attempt.id, resultReady ? { result: true, returnTo: returnToHref, session: assignment.id } : { returnTo: returnToHref, session: assignment.id });
  return <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Ruang tunggu" mainClassName="gap-4 py-5 md:py-6" notificationFeed={notificationFeed} session={session} showSearch={false}><BackButton href={returnToHref ?? "/tryout"} label="Kembali ke katalog tryout"><ChevronLeft aria-hidden="true" className="size-5" /></BackButton><div className="mx-auto grid w-full max-w-3xl gap-5 px-1 py-8 text-center sm:px-4 sm:py-12"><CheckCircle2 aria-hidden="true" className="mx-auto text-5xl text-primary-700" /><h1 className="font-heading text-3xl font-semibold tracking-[-0.035em]">{resultReady ? "Tryout sudah selesai" : "Tryout masih berjalan"}</h1><p className="text-secondary-600">{resultReady ? "Hasilmu siap diperiksa saat kebijakan rilis mengizinkan." : "Kamu dapat melanjutkan dari keadaan terakhir yang dikonfirmasi server."}</p><Button className="mx-auto" nativeButton={false} render={<Link href={href} />} variant="brand">{resultReady ? "Lihat hasil" : "Lanjutkan ujian"} <ArrowRight /></Button></div></CourseWorkspaceShell>;
}

function WaitingRoomGuide({ assignment, blockedReason, busy, canStart, message, onStart, tryout }: { assignment: ParticipantTryoutAssignment; blockedReason: string | null; busy: boolean; canStart: boolean; message: string | null; onStart: () => void; tryout: ParticipantTryout; }) {
  return <><section aria-labelledby="waiting-room-title"><h1 className="max-w-2xl text-balance font-heading text-2xl font-semibold tracking-[-0.035em] sm:text-3xl" id="waiting-room-title">{tryout.title}</h1><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 sm:gap-8"><div><dt className="text-secondary-500">Mulai</dt><dd className="mt-1 font-semibold text-secondary-900"><time dateTime={new Date(assignment.availableFrom).toISOString()}>{formatSchedule(assignment.availableFrom)}</time></dd></div><div><dt className="text-secondary-500">Batas akhir</dt><dd className="mt-1 font-semibold text-secondary-900"><time dateTime={new Date(assignment.availableUntil).toISOString()}>{formatSchedule(assignment.availableUntil)}</time></dd></div></dl></section>{message ? <p className="flex items-center gap-2 rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg p-4 text-sm text-student-status-danger-fg" role="alert"><CircleAlert aria-hidden="true" />{message}</p> : null}<section aria-labelledby="tryout-guide-title"><h2 className="font-heading text-xl font-semibold tracking-[-0.025em]" id="tryout-guide-title">Panduan tryout</h2><ul className="mt-5 divide-y divide-primary-100">{rules.map((rule) => { const Icon = rule.icon; return <li className="flex gap-3 py-4 first:pt-0 last:pb-0" key={rule.title}><Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-700" /><div><h3 className="font-semibold text-secondary-900">{rule.title}</h3><p className="mt-1 text-sm leading-6 text-secondary-600">{rule.description}</p></div></li>; })}</ul><div className="mt-8 grid gap-3">{blockedReason ? <p className="text-sm leading-6 text-secondary-600" id="start-tryout-help" role="status">{blockedReason}</p> : null}<Button aria-busy={busy} aria-describedby={blockedReason ? "start-tryout-help" : undefined} className="w-full" disabled={!canStart || busy} onClick={onStart} size="lg" variant="brand">{busy ? <><LoaderCircle className="animate-spin" />Menyiapkan…</> : "Mulai"}</Button></div></section></>;
}

function ParticipantWaitingRoomModule({
  assignment,
  notificationFeed,
  returnToHref,
  session,
  tryout,
}: {
  assignment: ParticipantTryoutAssignment;
  notificationFeed?: StudentNotificationFeed;
  returnToHref?: string;
  session: SessionContext;
  tryout: ParticipantTryout;
}) {
  const [now, setNow] = useState(() => Date.now());
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
  const canStart = !beforeWindow && !afterWindow && assignment.status === "active";
  const attempt = assignment.attempt;
  const blockedReason = waitingBlockedReason(assignment, beforeWindow, afterWindow);

  const handleStart = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await startTryoutAttemptAction(assignment.id);
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      window.location.assign(buildStudentAttemptHref(response.result.attemptId, { returnTo: returnToHref, session: assignment.id }));
    } catch (startError) {
      unstable_rethrow(startError);
      setMessage(startError instanceof Error ? startError.message : "Tryout belum dapat dimulai.");
    } finally {
      setBusy(false);
    }
  };

  if (attempt) return <WaitingRoomAttemptState assignment={assignment} notificationFeed={notificationFeed} returnToHref={returnToHref} session={session} />;

  return (
    <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Ruang tunggu" mainClassName="gap-4 py-5 md:py-6" notificationFeed={notificationFeed} session={session} showSearch={false}>
      <BackButton
        href={returnToHref ?? "/tryout"}
        label="Kembali ke katalog tryout"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </BackButton>

      <div className="mx-auto grid w-full max-w-3xl gap-8"><WaitingRoomGuide assignment={assignment} blockedReason={blockedReason} busy={busy} canStart={canStart} message={message} onStart={() => void handleStart()} tryout={tryout} /></div>
    </CourseWorkspaceShell>
  );
}

export { ParticipantWaitingRoomModule };

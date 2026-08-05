import {
  ArrowRight,
  BookOpenText,
  CalendarBlank,
  ChartBar,
  Clock,
  Target,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import type {
  ParticipantTargetProfile,
  ParticipantTryout,
} from "@/lib/tryout/participant-repository";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

const fullDateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "full",
  timeZone: "Asia/Jakarta",
});
const shortTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  timeStyle: "short",
});

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours} jam${minutes ? ` ${minutes} menit` : ""}` : `${minutes} menit`;
}

function formatDate(value?: Date) {
  if (!value) return "Jadwal menyusul";
  return fullDateFormatter.format(new Date(value));
}

function formatTime(value?: Date) {
  if (!value) return "—";
  return shortTimeFormatter.format(new Date(value));
}

function ParticipantTryoutDetailModule({
  session,
  targetProfile,
  tryout,
}: {
  session: SessionContext;
  targetProfile: ParticipantTargetProfile;
  tryout: ParticipantTryout;
}) {
  const totalQuestions = tryout.sections.reduce((sum, section) => sum + section.questionCount, 0);
  const totalDuration = tryout.sections.reduce((sum, section) => sum + section.durationSeconds, 0);
  const assignedSession = tryout.assignments[0];
  const primarySession = assignedSession ?? tryout.sessions[0];
  const attempt = assignedSession?.attempt;
  const hasEnrolled = tryout.admissionStatus !== null;
  const target = targetProfile.university
    ? `${targetProfile.university.shortName ?? targetProfile.university.name}${targetProfile.major ? ` · ${targetProfile.major.name}` : ""}`
    : "Pilih saat mendaftar";

  let actionHref = `/tryout/${tryout.id}/register`;
  let actionLabel = "Daftar tryout";
  if (attempt?.status === "in_progress") {
    actionHref = `/tryout/attempt/${attempt.id}`;
    actionLabel = "Lanjutkan ujian";
  } else if (attempt) {
    actionHref = `/tryout/attempt/${attempt.id}/result`;
    actionLabel = "Lihat hasil";
  } else if (tryout.admissionStatus === "active") {
    actionHref = `/tryout/${tryout.id}/waiting`;
    actionLabel = "Masuk ruang tunggu";
  }

  const registrationBlocked = tryout.admissionStatus === "pending"
    || tryout.admissionStatus === "rejected"
    || tryout.admissionStatus === "revoked";

  return (
    <CourseWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Detail tryout"
      session={session}
      showSearch={false}
    >
      <Button
        aria-label="Kembali ke katalog"
        render={<Link href="/tryout" />}
        size="icon"
        title="Kembali ke katalog"
        variant="ghost"
      >
        <ChevronLeft />
      </Button>

      <section aria-label={`Banner ${tryout.title}`} className="relative aspect-video overflow-hidden rounded-[2rem] border border-primary-100 bg-primary-50">
        <Image
          alt=""
          className="object-cover"
          fill
          priority
          sizes="(min-width: 1280px) 1120px, (min-width: 768px) calc(100vw - 5rem), calc(100vw - 2rem)"
          src="/brand/tryout-placeholder-banner.jpg"
        />
      </section>

      <section aria-labelledby="tryout-information" className="rounded-[1.75rem] border border-primary-100 bg-white p-5 sm:p-7">
        <h1 id="tryout-information" className="max-w-[20ch] font-heading text-3xl leading-[1.06] font-semibold tracking-[-0.035em] text-secondary-900 sm:text-4xl">
          {tryout.title}
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-secondary-600 sm:text-base sm:leading-7">
          {tryout.description ?? "Simulasi terstruktur untuk mengukur kesiapanmu."}
        </p>

        <dl className="mt-6 grid gap-5 border-t border-primary-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="flex items-center gap-2 text-sm text-secondary-500"><Clock />Durasi</dt><dd className="mt-2 font-semibold text-secondary-900">{formatDuration(totalDuration)}</dd></div>
          <div><dt className="flex items-center gap-2 text-sm text-secondary-500"><BookOpenText />Soal</dt><dd className="mt-2 font-semibold text-secondary-900">{totalQuestions || "—"}</dd></div>
          <div><dt className="flex items-center gap-2 text-sm text-secondary-500"><UsersThree />Peserta</dt><dd className="mt-2 font-semibold text-secondary-900">{tryout.participantCount.toLocaleString("id-ID")}</dd></div>
          <div><dt className="flex items-center gap-2 text-sm text-secondary-500"><ChartBar />Format</dt><dd className="mt-2 font-semibold text-secondary-900">{tryout.sections.some((item) => item.testType === "cat") ? "CBT + CAT" : "CBT"}</dd></div>
        </dl>
      </section>

      <section aria-label="Jadwal dan target tryout" className="rounded-[1.75rem] border border-primary-100 bg-primary-50 p-5 sm:p-7">
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="flex items-center gap-2 text-sm text-secondary-500"><CalendarBlank className="text-primary-700" />Mulai</p>
            <p className="mt-2 text-base font-semibold text-secondary-900">{formatDate(primarySession?.availableFrom)}</p>
            <p className="mt-2 flex items-center gap-2 text-base text-secondary-700"><Clock className="text-primary-700" />{formatTime(primarySession?.availableFrom)}</p>
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm text-secondary-500"><CalendarBlank className="text-primary-700" />Selesai</p>
            <p className="mt-2 text-base font-semibold text-secondary-900">{formatDate(primarySession?.availableUntil)}</p>
            <p className="mt-2 flex items-center gap-2 text-base text-secondary-700"><Clock className="text-primary-700" />{formatTime(primarySession?.availableUntil)}</p>
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm text-secondary-500"><Target className="text-primary-700" />Target jurusan</p>
            <p className="mt-2 text-base font-semibold text-secondary-900">{target}</p>
          </div>
        </div>

        <div className="mt-8">
          {registrationBlocked ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              {tryout.admissionStatus === "pending" ? "Pendaftaran menunggu persetujuan." : "Akses pendaftaran tidak aktif."}
            </div>
          ) : (
            <Button className="w-full" render={<Link href={actionHref} />} size="lg" variant="brand">
              {actionLabel} <ArrowRight />
            </Button>
          )}
        </div>
      </section>

      {hasEnrolled ? (
        <section aria-label="Bagian tryout" className="rounded-[1.75rem] border border-primary-100 bg-white p-5 sm:p-7">
          <div className="grid gap-3">
            {tryout.sections.map((section) => (
              <div className="grid gap-3 rounded-2xl border border-primary-100 p-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center" key={`${section.sequenceNo}-${section.title}`}>
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-900 text-sm font-bold text-white">{section.sequenceNo}</span>
                <div>
                  <h3 className="font-semibold text-secondary-900">{section.title}</h3>
                  <p className="mt-1 text-sm text-secondary-500">{section.subtestName} · {section.testType.toUpperCase()}</p>
                </div>
                <p className="text-sm font-medium text-secondary-700">{section.questionCount} soal · {formatDuration(section.durationSeconds)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

    </CourseWorkspaceShell>
  );
}

export { ParticipantTryoutDetailModule };

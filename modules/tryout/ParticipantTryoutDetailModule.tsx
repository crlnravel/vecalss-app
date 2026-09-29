import {
  ArrowRight,
  Clock,
  CircleAlert,
  HourglassMedium,
  Info,
  ListChecks,
  LockKeyhole,
} from "@/lib/icons";
import Image from "next/image";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import type { SessionContext } from "@/lib/auth/types";
import { buildStudentAttemptHref, buildStudentTryoutHref, buildStudentTryoutSubrouteHref } from "@/lib/navigation/canonical-context";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import {
  canRequestNewTryoutAdmission,
  isTryoutAdmissionSessionAvailable,
  isTryoutSessionExpired,
} from "@/lib/tryout/registration-availability";
import type { ParticipantTryout } from "@/lib/tryout/participant-repository";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { ParticipantTryoutEnrollmentPanel, type MajorOption, type UniversityOption } from "@/modules/tryout/ParticipantTryoutEnrollmentPanel";

const detailDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  timeZone: "Asia/Jakarta",
  year: "numeric",
});
const shortTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

type SessionWindow = {
  availableFrom: Date;
  availableUntil: Date;
};

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours
    ? String(hours) + " jam" + (minutes ? " " + minutes + " menit" : "")
    : String(minutes) + " menit";
}

function formatTotalMinutes(seconds: number) {
  return String(Math.round(seconds / 60)) + " menit";
}

function formatDate(value?: Date) {
  if (!value) return "Jadwal menyusul";
  return detailDateFormatter.format(new Date(value));
}

function formatTime(value: Date) {
  return shortTimeFormatter.format(new Date(value)).replaceAll(".", ":");
}

function formatSessionWindow(value?: SessionWindow) {
  if (!value) return null;
  const startDate = formatDate(value.availableFrom);
  const endDate = formatDate(value.availableUntil);
  const startTime = formatTime(value.availableFrom);
  const endTime = formatTime(value.availableUntil);
  return startDate === endDate
    ? startDate + ", " + startTime + "–" + endTime + " WIB"
    : startDate +
        ", " +
        startTime +
        " WIB – " +
        endDate +
        ", " +
        endTime +
        " WIB";
}

const sectionGroupByCode: Record<string, string> = {
  PU: "Tes Potensi Skolastik (TPS)",
  PPU: "Tes Potensi Skolastik (TPS)",
  PBM: "Tes Potensi Skolastik (TPS)",
  PK: "Tes Potensi Skolastik (TPS)",
  LBI: "Tes Potensi Akademik",
  LBE: "Tes Potensi Akademik",
  PM: "Tes Potensi Akademik",
};

const sectionGroupOrder = [
  "Tes Potensi Skolastik (TPS)",
  "Tes Potensi Akademik",
];

function groupTryoutSections(sections: ParticipantTryout["sections"]) {
  const groups = new Map<
    string,
    {
      firstSequenceNo: number;
      label: string;
      sections: ParticipantTryout["sections"];
    }
  >();

  for (const section of sections) {
    const label =
      sectionGroupByCode[section.subtestCode] ?? "Tes Potensi Akademik";
    const current = groups.get(label);
    if (current) {
      current.sections.push(section);
    } else {
      groups.set(label, {
        firstSequenceNo: section.sequenceNo,
        label,
        sections: [section],
      });
    }
  }

  return [...groups.values()].sort((left, right) => {
    const leftOrder = sectionGroupOrder.indexOf(left.label);
    const rightOrder = sectionGroupOrder.indexOf(right.label);
    if (leftOrder !== -1 || rightOrder !== -1) {
      return (
        (leftOrder === -1 ? Number.MAX_SAFE_INTEGER : leftOrder) -
        (rightOrder === -1 ? Number.MAX_SAFE_INTEGER : rightOrder)
      );
    }
    return left.firstSequenceNo - right.firstSequenceNo;
  });
}

function groupId(label: string) {
  return (
    "tryout-group-" +
    label
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
  );
}

type TryoutSectionGroup = ReturnType<typeof groupTryoutSections>[number];

function TryoutSectionList({
  lockedSections,
  sectionGroups,
}: {
  lockedSections: boolean;
  sectionGroups: TryoutSectionGroup[];
}) {
  return (
    <div className="grid gap-0">
      {sectionGroups.map((group) => {
        const headingId = groupId(group.label);
        return (
          <section
            aria-labelledby={headingId}
            className="py-6 first:pt-1"
            key={group.label}
          >
            <div className="flex items-center gap-4 rounded-lg py-1 text-left">
              <span className="flex min-w-0 flex-1 items-center gap-4">
                <h2
                  id={headingId}
                  className="min-w-0 font-heading text-lg leading-tight font-extrabold tracking-[-0.025em] text-secondary-900"
                >
                  {group.label}
                </h2>
                <span
                  aria-hidden="true"
                  className="h-px min-w-4 flex-1 bg-primary-100"
                />
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {group.sections.map((section) => (
                <article
                  className="flex min-h-[5.75rem] items-center justify-between gap-4 rounded-xl bg-white px-4 py-4 shadow-[0_12px_28px_-24px_color-mix(in_oklab,var(--voyage-deep)_22%,transparent)] sm:px-5"
                  key={section.sequenceNo + "-" + section.title}
                >
                  <div className="min-w-0">
                    <h3 className="break-words font-heading text-base leading-5 font-extrabold tracking-[-0.02em] text-secondary-900">
                      {section.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-secondary-700">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-4 text-primary-600" />
                        {formatDuration(section.durationSeconds)}
                      </span>
                      <span aria-hidden="true" className="text-secondary-300">
                        |
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ListChecks className="size-4 text-primary-600" />
                        {section.questionCount} soal
                        <span className="sr-only">
                          {" · " + section.testType.toUpperCase()}
                        </span>
                      </span>
                    </div>
                  </div>

                  {lockedSections ? (
                    <span
                      aria-label={
                        section.title + " terkunci sampai kamu mendaftar"
                      }
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600"
                      role="img"
                    >
                      <LockKeyhole className="size-5" />
                    </span>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function getParticipantTryoutDetailModel(tryout: ParticipantTryout, sessionId: string | undefined, returnToHref: string | undefined) {
  const totalDuration = tryout.sections.reduce((sum, section) => sum + section.durationSeconds, 0);
  const totalQuestions = tryout.sections.reduce((sum, section) => sum + section.questionCount, 0);
  const assignedSession = sessionId ? tryout.assignments.find((assignment) => assignment.id === sessionId) : tryout.assignments[0];
  const attempt = assignedSession?.attempt;
  const hasEnrolled = tryout.admissionStatus !== null;
  const now = new Date();
  const defaultAdmissionSession = tryout.sessions.find((deliverySession) => deliverySession.isDefaultOpenRegistration);
  const selectedSession = sessionId ? tryout.sessions.find((deliverySession) => deliverySession.id === sessionId) : undefined;
  const defaultOpenSession = defaultAdmissionSession && isTryoutAdmissionSessionAvailable(defaultAdmissionSession, now)
    ? defaultAdmissionSession
    : undefined;
  const canRequestAdmission = canRequestNewTryoutAdmission(
    tryout.admissionMode,
    tryout.sessions,
    now,
    sessionId,
  );
  const registrationWindowClosed =
    tryout.admissionStatus === null &&
    tryout.admissionMode !== "invitation_only" &&
    !canRequestAdmission;
  const registrationWindowSession = selectedSession ?? defaultAdmissionSession;
  const registrationWindowEnded = Boolean(
    registrationWindowSession &&
      isTryoutSessionExpired(registrationWindowSession.availableUntil, now),
  );
  const summarySession = assignedSession ?? selectedSession ?? (
    tryout.admissionStatus === null && tryout.admissionMode !== "invitation_only"
      ? defaultAdmissionSession
      : undefined
  );
  const context = { returnTo: returnToHref, session: summarySession?.id ?? sessionId };

  let actionHref = buildStudentTryoutHref(tryout.id, context);
  let actionLabel = "Daftar Tryout";
  let canTakeAction = true;
  if (attempt?.status === "in_progress") {
    actionHref = buildStudentAttemptHref(attempt.id, context);
    actionLabel = "Lanjutkan Tryout";
  } else if (attempt) {
    actionHref = buildStudentAttemptHref(attempt.id, { ...context, result: true });
    actionLabel = attempt.resultAvailability === "released" ? "Lihat hasil" : "Periksa status hasil";
  } else if (tryout.admissionStatus === "active" && assignedSession && assignedSession.status === "active" && !assignedSession.isExpired) {
    actionHref = buildStudentTryoutSubrouteHref(tryout.id, "waiting", context);
    actionLabel = "Buka ruang tunggu";
  } else if (tryout.admissionStatus === "active" && assignedSession) {
    actionHref = buildStudentTryoutHref(tryout.id, context);
    actionLabel = "Sesi selesai";
    canTakeAction = false;
  }
  if (registrationWindowClosed && !attempt) {
    actionLabel = registrationWindowEnded ? "Sesi selesai" : "Pendaftaran ditutup";
    canTakeAction = false;
  }

  const admissionNotice = tryout.admissionStatus === "pending"
    ? {
        icon: HourglassMedium,
        message: "Pendaftaranmu sedang ditinjau Kapten. Jadwal sesi akan muncul setelah pendaftaran disetujui dan sesi ditetapkan.",
        title: "Menunggu persetujuan",
        tone: "amber" as const,
      }
    : tryout.admissionStatus === "active" && !assignedSession
      ? {
          icon: HourglassMedium,
          message: "Pendaftaranmu sudah disetujui. Kapten belum menetapkan sesi ujian; kamu akan melihat jadwal dan tombol masuk setelah sesi tersedia.",
          title: "Menunggu jadwal sesi",
          tone: "green" as const,
        }
        : tryout.admissionStatus === "rejected" || tryout.admissionStatus === "revoked"
        ? {
            icon: CircleAlert,
            message: tryout.admissionStatus === "rejected" ? "Pendaftaran ini tidak disetujui. Hubungi Kapten jika kamu memerlukan penjelasan atau ingin mengikuti sesi lain." : "Aksesmu ke Tryout ini sudah dinonaktifkan. Hubungi Kapten untuk mengetahui langkah berikutnya.",
            title: tryout.admissionStatus === "rejected" ? "Pendaftaran tidak disetujui" : "Akses dinonaktifkan",
            tone: "red" as const,
          }
        : registrationWindowClosed
          ? {
              icon: Info,
              message: registrationWindowEnded
                ? "Sesi ini sudah berakhir. Kamu tidak bisa mendaftar lagi."
                : "Belum ada sesi yang dapat menerima pendaftaran. Coba lagi nanti.",
              title: registrationWindowEnded ? "Sesi sudah berakhir" : "Pendaftaran ditutup",
              tone: "amber" as const,
            }
          : tryout.admissionMode === "invitation_only" && !hasEnrolled
          ? {
              icon: LockKeyhole,
              message: "Tryout ini hanya dapat diikuti melalui undangan Kapten. Jika kamu seharusnya mendapat akses, hubungi Kapten.",
              title: "Khusus peserta undangan",
              tone: "amber" as const,
            }
          : null;

  const availability = attempt?.status === "in_progress"
    ? { label: "Sedang dikerjakan", tone: "success" as const }
    : attempt
      ? attempt.resultAvailability === "released"
        ? { label: "Hasil tersedia", tone: "neutral" as const }
        : attempt.resultAvailability === "processing"
          ? { label: "Hasil sedang disiapkan", tone: "attention" as const }
          : { label: "Hasil belum dibuka", tone: "attention" as const }
      : tryout.admissionStatus === "rejected" || tryout.admissionStatus === "revoked"
        ? { label: "Tidak tersedia", tone: "danger" as const }
        : tryout.admissionStatus === "pending"
          ? { label: "Menunggu", tone: "attention" as const }
          : tryout.admissionStatus === "active" && !assignedSession
            ? { label: "Menunggu jadwal", tone: "attention" as const }
            : registrationWindowClosed
              ? { label: registrationWindowEnded ? "Selesai" : "Ditutup", tone: "neutral" as const }
              : tryout.admissionMode === "invitation_only" && !hasEnrolled
                ? { label: "Undangan", tone: "attention" as const }
              : assignedSession
                ? assignedSession.status !== "active"
                  ? { label: "Ditutup", tone: "neutral" as const }
                  : assignedSession.isAvailableNow
                    ? { label: "Aktif", tone: "success" as const }
                    : assignedSession.isExpired
                      ? { label: "Selesai", tone: "neutral" as const }
                      : { label: "Terjadwal", tone: "neutral" as const }
                : defaultOpenSession && defaultOpenSession.isAvailableNow
                  ? { label: "Aktif", tone: "success" as const }
                  : defaultOpenSession
                    ? { label: "Terjadwal", tone: "neutral" as const }
                    : { label: "Tersedia", tone: "neutral" as const };

  const statusMessage = availability.label === "Aktif"
    ? "Sudah dibuka"
    : availability.label === "Terjadwal"
      ? "Akan dibuka"
      : availability.label === "Selesai"
        ? "Tryout selesai"
        : availability.label === "Tersedia"
          ? "Pendaftaran tersedia"
          : availability.label;
  return {
    actionDisplayLabel: actionLabel === "Daftar Tryout" ? "Daftar Tryout" : actionLabel,
    actionHref,
    actionLabel,
    admissionNotice,
    availability,
    canTakeAction,
    lockedSections: !hasEnrolled && !attempt,
    sectionGroups: groupTryoutSections(tryout.sections),
    showReadinessNotice: !admissionNotice && !attempt && tryout.admissionStatus === null,
    statusMessage,
    summarySession,
    totalDuration,
    totalQuestions,
  };
}

type ParticipantTryoutDetailModel = ReturnType<typeof getParticipantTryoutDetailModel>;

function TryoutDetailHero({
  model,
  tryout,
}: {
  model: ParticipantTryoutDetailModel;
  tryout: ParticipantTryout;
}) {
  return (
    <section
      aria-labelledby="tryout-information"
      className="overflow-hidden rounded-3xl bg-white shadow-[0_18px_42px_-30px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)]"
    >
      <div className="relative isolate overflow-hidden bg-[var(--voyage-deep)]">
        <Image
          alt=""
          className="absolute inset-0 size-full object-cover object-center opacity-45 saturate-[0.72]"
          fill
          priority
          sizes="(min-width: 1024px) 64rem, calc(100vw - 2rem)"
          src={tryout.bannerUrl ?? "/brand/tryout-placeholder-banner.jpg"}
          unoptimized={Boolean(tryout.bannerUrl)}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(110deg,color-mix(in_oklab,var(--voyage-deep)_88%,transparent)_0%,color-mix(in_oklab,var(--voyage-deep)_68%,transparent)_52%,color-mix(in_oklab,var(--voyage-deep)_74%,transparent)_100%)]"
        />
        <div aria-hidden="true" className="h-[10.75rem] w-full sm:h-[11.25rem]" />
      </div>
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <h1
          className="text-center font-heading text-xl leading-tight font-extrabold tracking-[-0.035em] text-secondary-900 sm:text-2xl"
          id="tryout-information"
        >
          {tryout.title}
        </h1>
        <p className="mt-2 text-center text-sm leading-6 font-medium text-secondary-700 sm:text-base">
          {formatSessionWindow(model.summarySession) ?? "Jadwal akan muncul setelah pendaftaran disetujui."}
        </p>
        <p
          className={`mt-4 rounded-xl px-4 py-2.5 text-center text-sm leading-6 font-bold ${model.availability.tone === "success" ? "bg-student-status-success-bg text-student-status-success-fg" : model.availability.tone === "danger" ? "bg-student-status-danger-bg text-student-status-danger-fg" : model.availability.tone === "attention" ? "bg-student-status-attention-bg text-student-status-attention-fg" : "bg-primary-50 text-primary-700"}`}
        >
          {model.statusMessage}
        </p>
        <dl className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium text-secondary-700">
          <div className="flex items-center gap-2">
            <Clock className="size-5 text-primary-700" />
            <dt>Total Waktu</dt>
            <dd className="font-extrabold text-primary-700">
              {formatTotalMinutes(model.totalDuration)}
            </dd>
          </div>
          <span aria-hidden="true" className="text-secondary-300">
            |
          </span>
          <div className="flex items-center gap-2">
            <ListChecks className="size-5 text-primary-700" />
            <dt>Total Soal</dt>
            <dd className="font-extrabold text-primary-700">
              {model.totalQuestions} soal
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function TryoutAdmissionNotice({ model }: { model: ParticipantTryoutDetailModel }) {
  if (model.admissionNotice) {
    const AdmissionIcon = model.admissionNotice.icon;
    const noticeClassName = model.admissionNotice.tone === "green"
      ? "flex items-start gap-3 rounded-xl border border-student-status-success-border bg-student-status-success-bg p-4 text-sm leading-6 text-student-status-success-fg"
      : model.admissionNotice.tone === "red"
        ? "flex items-start gap-3 rounded-xl border border-student-status-danger-border bg-student-status-danger-bg p-4 text-sm leading-6 text-student-status-danger-fg"
        : "flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 p-4 text-sm leading-6 text-secondary-700";
    return <div className={noticeClassName} role="status"><AdmissionIcon className="mt-0.5 size-5 shrink-0" /><div><p className="font-bold">{model.admissionNotice.title}</p><p className="mt-1">{model.admissionNotice.message}</p></div></div>;
  }

  if (!model.showReadinessNotice) return null;
  return <div className="flex items-start gap-3 rounded-xl bg-primary-50 p-4 text-sm leading-6 text-secondary-700"><Info className="mt-0.5 size-5 shrink-0 text-primary-500" /><p>Yuk, daftar Tryout ini. Pilih <strong>Daftar Tryout</strong> di bawah.</p></div>;
}

function TryoutDetailAction({
  initialMajorId,
  initialUniversityId,
  majors,
  model,
  returnToHref,
  sessionId,
  tryout,
  universities,
}: {
  initialMajorId: string | null;
  initialUniversityId: string | null;
  majors: MajorOption[];
  model: ParticipantTryoutDetailModel;
  returnToHref?: string;
  sessionId?: string;
  tryout: ParticipantTryout;
  universities: UniversityOption[];
}) {
  if (model.admissionNotice || !model.canTakeAction) return null;
  if (model.actionLabel === "Daftar Tryout") {
    return <ParticipantTryoutEnrollmentPanel initialMajorId={initialMajorId} initialUniversityId={initialUniversityId} majors={majors} returnToHref={returnToHref} sessionId={model.summarySession?.id ?? sessionId} tryoutId={tryout.id} universities={universities} />;
  }
  return <Link className={buttonVariants({ className: "w-full", size: "lg", variant: "brand" })} href={model.actionHref}>{model.actionDisplayLabel}{model.actionDisplayLabel === "Daftar" ? null : <ArrowRight />}</Link>;
}

function ParticipantTryoutDetailContent({
  initialMajorId,
  initialUniversityId,
  majors,
  model,
  returnToHref,
  sessionId,
  tryout,
  universities,
}: {
  initialMajorId: string | null;
  initialUniversityId: string | null;
  majors: MajorOption[];
  model: ParticipantTryoutDetailModel;
  returnToHref?: string;
  sessionId?: string;
  tryout: ParticipantTryout;
  universities: UniversityOption[];
}) {
  return <div className="min-h-full font-sans text-[var(--voyage-ink)]"><div className="relative z-10 mx-auto flex w-full max-w-[64rem] flex-col gap-5 px-4 pb-16 pt-6 sm:px-6 sm:pt-8"><TryoutDetailHero model={model} tryout={tryout} /><TryoutAdmissionNotice model={model} /><TryoutSectionList lockedSections={model.lockedSections} sectionGroups={model.sectionGroups} /><TryoutDetailAction initialMajorId={initialMajorId} initialUniversityId={initialUniversityId} majors={majors} model={model} returnToHref={returnToHref} sessionId={sessionId} tryout={tryout} universities={universities} /></div></div>;
}

function ParticipantTryoutDetailModule({
  initialMajorId,
  initialUniversityId,
  majors,
  notificationFeed,
  returnToHref,
  session,
  sessionId,
  tryout,
  universities,
}: {
  initialMajorId: string | null;
  initialUniversityId: string | null;
  majors: MajorOption[];
  notificationFeed?: StudentNotificationFeed;
  returnToHref?: string;
  session: SessionContext;
  sessionId?: string;
  tryout: ParticipantTryout;
  universities: UniversityOption[];
}) {
  const model = getParticipantTryoutDetailModel(tryout, sessionId, returnToHref);
  return <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Detail Tryout" mainClassName="max-w-none gap-0 !p-0" notificationFeed={notificationFeed} session={session} showSearch={false}><ParticipantTryoutDetailContent initialMajorId={initialMajorId} initialUniversityId={initialUniversityId} majors={majors} model={model} returnToHref={returnToHref} sessionId={sessionId} tryout={tryout} universities={universities} /></CourseWorkspaceShell>;
}

export { ParticipantTryoutDetailModule };

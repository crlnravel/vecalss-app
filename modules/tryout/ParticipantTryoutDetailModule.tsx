import {
  ArrowRight,
  CaretDown,
  Clock,
  HourglassMedium,
  Info,
  ListChecks,
  LockKey,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import type { SessionContext } from "@/lib/auth/types";
import type { ParticipantTryout } from "@/lib/tryout/participant-repository";
import { ChevronLeft } from "@/lib/icons";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { ParticipantTryoutRegistrationPrompt } from "@/modules/tryout/ParticipantTryoutRegistrationPrompt";

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
                  className="flex min-h-[5.75rem] items-center justify-between gap-4 rounded-xl bg-white px-4 py-4 shadow-[0_12px_28px_-24px_rgba(1,76,56,0.22)] sm:px-5"
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
                      <LockKey className="size-5" />
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

function TryoutTargetSection({ href }: { href: string }) {
  return (
    <section
      aria-labelledby="target-jurusan"
      className="rounded-xl bg-white p-5 shadow-[0_14px_34px_-28px_rgba(1,76,56,0.26)] sm:p-6"
    >
      <h2
        id="target-jurusan"
        className="text-center font-heading text-xl font-extrabold tracking-[-0.025em] text-secondary-900"
      >
        Target Jurusan
      </h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
        <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-2xl bg-primary-100">
          <Image
            alt=""
            className="h-32 w-32 object-contain"
            height={256}
            src="/brand/mascot-vecalss.png"
            width={256}
          />
        </div>
        <div className="grid gap-3">
          <Link
            aria-label="Pilih universitas target"
            className="flex min-h-12 items-center justify-between rounded-xl bg-primary-50 px-4 text-sm font-bold text-secondary-500 transition hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-200"
            href={href}
          >
            <span>Pilih Universitas</span>
            <CaretDown className="size-5 text-primary-600" />
          </Link>
          <Link
            aria-label="Pilih jurusan target"
            className="flex min-h-12 items-center justify-between rounded-xl bg-primary-50 px-4 text-sm font-bold text-secondary-500 transition hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-200"
            href={href}
          >
            <span>Pilih Jurusan</span>
            <CaretDown className="size-5 text-primary-600" />
          </Link>
          <p className="text-sm leading-6 text-secondary-600">
            Target jurusan akan tersimpan di profilmu saat kamu menyelesaikan
            pendaftaran.
          </p>
        </div>
      </div>
    </section>
  );
}

function ParticipantTryoutDetailModule({
  session,
  tryout,
}: {
  session: SessionContext;
  tryout: ParticipantTryout;
}) {
  const totalDuration = tryout.sections.reduce(
    (sum, section) => sum + section.durationSeconds,
    0,
  );
  const totalQuestions = tryout.sections.reduce(
    (sum, section) => sum + section.questionCount,
    0,
  );
  const assignedSession = tryout.assignments[0];
  const attempt = assignedSession?.attempt;
  const hasEnrolled = tryout.admissionStatus !== null;
  const canPreviewSchedule =
    tryout.admissionMode === "open" && tryout.admissionStatus === null;
  const defaultOpenSession = canPreviewSchedule
    ? tryout.sessions.find(
        (deliverySession) =>
          deliverySession.isDefaultOpenRegistration &&
          deliverySession.status === "active" &&
          !deliverySession.isExpired,
      )
    : undefined;
  const summarySession =
    assignedSession ?? (canPreviewSchedule ? defaultOpenSession : undefined);

  let actionHref = "/tryout/" + tryout.id + "/register";
  let actionLabel = "Daftar tryout";
  let canTakeAction = true;
  if (attempt?.status === "in_progress") {
    actionHref = "/tryout/attempt/" + attempt.id;
    actionLabel = "Lanjutkan ujian";
  } else if (attempt) {
    actionHref = "/tryout/attempt/" + attempt.id + "/result";
    actionLabel = "Lihat hasil";
  } else if (
    tryout.admissionStatus === "active" &&
    assignedSession &&
    assignedSession.status === "active" &&
    !assignedSession.isExpired
  ) {
    actionHref = "/tryout/" + tryout.id + "/waiting";
    actionLabel = "Mulai";
  } else if (tryout.admissionStatus === "active" && assignedSession) {
    actionHref = "/tryout/" + tryout.id;
    actionLabel = "Sesi selesai";
    canTakeAction = false;
  }

  const admissionNotice = tryout.admissionStatus === "pending"
    ? {
        icon: HourglassMedium,
        message:
          "Pendaftaranmu sedang ditinjau Kapten. Jadwal sesi akan muncul setelah pendaftaran disetujui dan sesi ditetapkan.",
        title: "Menunggu persetujuan",
        tone: "amber" as const,
      }
    : tryout.admissionStatus === "active" && !assignedSession
      ? {
          icon: HourglassMedium,
          message:
            "Pendaftaranmu sudah disetujui. Kapten belum menetapkan sesi ujian; kamu akan melihat jadwal dan tombol masuk setelah sesi tersedia.",
          title: "Menunggu jadwal sesi",
          tone: "green" as const,
        }
      : tryout.admissionStatus === "rejected" ||
          tryout.admissionStatus === "revoked"
        ? {
            icon: WarningCircle,
            message:
              tryout.admissionStatus === "rejected"
                ? "Pendaftaran ini tidak disetujui. Hubungi Kapten jika kamu memerlukan penjelasan atau ingin mengikuti sesi lain."
                : "Aksesmu ke tryout ini sudah dinonaktifkan. Hubungi Kapten untuk mengetahui langkah berikutnya.",
            title:
              tryout.admissionStatus === "rejected"
                ? "Pendaftaran tidak disetujui"
                : "Akses dinonaktifkan",
            tone: "red" as const,
          }
        : tryout.admissionMode === "invitation_only" && !hasEnrolled
          ? {
              icon: LockKey,
              message:
                "Tryout ini hanya dapat diikuti melalui undangan Kapten. Jika kamu seharusnya mendapat akses, hubungi Kapten.",
              title: "Khusus peserta undangan",
              tone: "amber" as const,
            }
          : null;

  const availability = attempt?.status === "in_progress"
    ? { label: "Sedang dikerjakan", tone: "success" as const }
    : attempt
      ? { label: "Hasil tersedia", tone: "neutral" as const }
      : tryout.admissionStatus === "rejected" ||
          tryout.admissionStatus === "revoked"
        ? { label: "Tidak tersedia", tone: "danger" as const }
        : tryout.admissionStatus === "pending"
          ? { label: "Menunggu", tone: "attention" as const }
          : tryout.admissionStatus === "active" && !assignedSession
            ? { label: "Menunggu jadwal", tone: "attention" as const }
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

  const showReadinessNotice =
    !admissionNotice && !attempt && tryout.admissionStatus === null;
  const sectionGroups = groupTryoutSections(tryout.sections);
  const statusMessage =
    availability.label === "Aktif"
      ? "Telah Dibuka!"
      : availability.label === "Terjadwal"
        ? "Akan Dibuka"
        : availability.label === "Selesai"
          ? "Tryout Selesai"
          : availability.label === "Tersedia"
            ? "Pendaftaran Tersedia"
            : availability.label;
  const actionDisplayLabel =
    actionLabel === "Daftar tryout" ? "Daftar Sekarang" : actionLabel;
  const lockedSections = !hasEnrolled && !attempt;

  return (
    <CourseWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Detail tryout"
      mainClassName="max-w-none gap-0 !p-0"
      session={session}
      showSearch={false}
    >
      <div className="min-h-full bg-[#f7faf8] font-sans text-[#173c2d]">
        <div className="relative isolate overflow-hidden bg-[#014c38]">
          <Image
            alt=""
            className="absolute inset-0 size-full object-cover object-center opacity-45 saturate-[0.72]"
            fill
            priority
            sizes="100vw"
            src="/brand/tryout-placeholder-banner.jpg"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(110deg,rgba(1,76,56,0.88)_0%,rgba(1,76,56,0.68)_52%,rgba(1,76,56,0.74)_100%)]"
          />
          <div className="relative mx-auto w-full max-w-[64rem] px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
            <Link
              aria-label="Kembali ke katalog"
              className="inline-flex size-11 items-center justify-center rounded-lg text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              href="/tryout"
              title="Kembali ke katalog"
            >
              <ChevronLeft aria-hidden="true" className="size-6" />
            </Link>
          </div>
        </div>

        <div className="relative z-10 mx-auto -mt-16 flex w-full max-w-[64rem] flex-col gap-5 px-4 pb-16 sm:-mt-16 sm:px-6">
          <section
            aria-labelledby="tryout-information"
            className="rounded-xl bg-white px-5 py-5 shadow-[0_18px_42px_-30px_rgba(1,76,56,0.24)] sm:px-6 sm:py-6"
          >
            <h1
              id="tryout-information"
              className="text-center font-heading text-xl leading-tight font-extrabold tracking-[-0.035em] text-secondary-900 sm:text-2xl"
            >
              {tryout.title}
            </h1>
            <p className="mt-2 text-center text-sm leading-6 font-medium text-secondary-700 sm:text-base">
              {formatSessionWindow(summarySession) ??
                "Jadwal akan muncul setelah pendaftaran disetujui."}
            </p>

            <p
              className={
                "mt-4 rounded-xl px-4 py-2.5 text-center text-sm leading-6 font-bold " +
                (availability.tone === "success"
                  ? "bg-student-status-success-bg text-student-status-success-fg"
                  : availability.tone === "danger"
                    ? "bg-student-status-danger-bg text-student-status-danger-fg"
                    : availability.tone === "attention"
                      ? "bg-student-status-attention-bg text-student-status-attention-fg"
                      : "bg-primary-50 text-primary-700")
              }
            >
              {statusMessage}
            </p>

            <dl className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium text-secondary-700">
              <div className="flex items-center gap-2">
                <Clock className="size-5 text-primary-700" />
                <dt>Total Waktu</dt>
                <dd className="font-extrabold text-primary-700">
                  {formatTotalMinutes(totalDuration)}
                </dd>
              </div>
              <span aria-hidden="true" className="text-secondary-300">
                |
              </span>
              <div className="flex items-center gap-2">
                <ListChecks className="size-5 text-primary-700" />
                <dt>Total Soal</dt>
                <dd className="font-extrabold text-primary-700">
                  {totalQuestions} soal
                </dd>
              </div>
            </dl>
          </section>

          {admissionNotice ? (
            <div
              className={
                admissionNotice.tone === "green"
                  ? "flex items-start gap-3 rounded-xl border border-student-status-success-border bg-student-status-success-bg p-4 text-sm leading-6 text-student-status-success-fg"
                  : admissionNotice.tone === "red"
                    ? "flex items-start gap-3 rounded-xl border border-student-status-danger-border bg-student-status-danger-bg p-4 text-sm leading-6 text-student-status-danger-fg"
                    : "flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 p-4 text-sm leading-6 text-secondary-700"
              }
              role="status"
            >
              <admissionNotice.icon className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-bold">{admissionNotice.title}</p>
                <p className="mt-1">{admissionNotice.message}</p>
              </div>
            </div>
          ) : showReadinessNotice ? (
            <div className="flex items-start gap-3 rounded-xl bg-primary-50 p-4 text-sm leading-6 text-secondary-700">
              <Info className="mt-0.5 size-5 shrink-0 text-primary-500" />
              <p>
                Yuk, daftar tryout ini! Klik <strong>Daftar Sekarang</strong> di
                bawah.
              </p>
            </div>
          ) : null}

          <TryoutSectionList lockedSections={lockedSections} sectionGroups={sectionGroups} />

          {!admissionNotice && canTakeAction ? (
            actionLabel === "Daftar tryout" ? (
              <ParticipantTryoutRegistrationPrompt href={actionHref} />
            ) : (
              <Link
                className={buttonVariants({
                  className:
                    "h-12 w-full rounded-xl !bg-primary-700 text-base font-extrabold text-white shadow-none hover:!bg-primary-800 focus-visible:ring-primary-200",
                  size: "lg",
                  variant: "brand",
                })}
                href={actionHref}
              >
                {actionDisplayLabel}
                {actionDisplayLabel === "Daftar" ? null : <ArrowRight />}
              </Link>
            )
          ) : null}

          {!admissionNotice && actionLabel === "Daftar tryout" ? (
            <TryoutTargetSection href={actionHref} />
          ) : null}
        </div>
      </div>
    </CourseWorkspaceShell>
  );
}

export { ParticipantTryoutDetailModule };

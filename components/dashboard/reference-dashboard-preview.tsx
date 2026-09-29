import {
  BookOpenText,
  Gauge,
  LayoutDashboard,
  LibraryBig,
  ListChecks,
  Settings,
} from "@/lib/icons";

import {
  ReferenceActivityFeed,
  ReferenceGoalProgressRow,
  ReferencePageHeader,
  ReferenceSectionHeading,
  ReferenceStatCard,
  ReferenceStatGrid,
  ReferenceTaskCard,
} from "./reference-dashboard-primitives";
import { ReferenceDashboardShell } from "./reference-dashboard-shell";

const previewNavigation = [
  {
    label: "Konten Belajar",
    items: [
      { href: "/mentor/dashboard", icon: <LayoutDashboard aria-hidden="true" />, label: "Dashboard" },
      { href: "/mentor/materi", icon: <BookOpenText aria-hidden="true" />, label: "Materi" },
      { href: "/mentor/quiz", icon: <ListChecks aria-hidden="true" />, label: "Kuis" },
      { href: "/mentor/quiz/question-bank", icon: <LibraryBig aria-hidden="true" />, label: "Bank Soal" },
    ],
  },
  {
    label: "Ruang Kerja",
    items: [
      { href: "/mentor/tryout", icon: <Gauge aria-hidden="true" />, label: "Tryout" },
      { href: "/mentor/settings", icon: <Settings aria-hidden="true" />, label: "Pengaturan" },
    ],
  },
] as const;

const previewActivities = [
  {
    description: "Satu materi menunggu peninjauan sebelum diterbitkan.",
    icon: BookOpenText,
    id: "activity-1",
    label: "Tinjau konten",
    timestamp: "5 menit lalu",
    title: "Materi baru siap ditinjau",
    tone: "info" as const,
  },
  {
    description: "Kuis Penalaran Umum berhasil diperbarui.",
    icon: ListChecks,
    id: "activity-2",
    label: "Pembaruan",
    timestamp: "1 jam lalu",
    title: "Kuis diperbarui",
    tone: "success" as const,
  },
] as const;

function ReferenceDashboardComponentPreview() {
  return (
    <ReferenceDashboardShell
      brand={<span className="font-heading text-base font-semibold">Vecalss</span>}
      brandMark={<span className="size-3 rounded-full bg-primary-700" />}
      header={<span className="truncate text-sm font-medium text-secondary-500">Pratinjau komponen</span>}
      mobilePrimaryNavigation={previewNavigation[0].items}
      navigation={previewNavigation}
    >
      <ReferencePageHeader title="Komponen dashboard" />

      <section aria-label="Kartu statistik" className="space-y-4">
        <ReferenceSectionHeading
          title="Kartu statistik"
          description="Nilai tetap berada di dalam kartu yang dapat dipindai dan disentuh."
        />
        <ReferenceStatGrid>
          <ReferenceStatCard label="Materi aktif" supportingText="3 perlu ditinjau" value="12" />
          <ReferenceStatCard label="Kuis" supportingText="2 dijadwalkan" value="08" />
          <ReferenceStatCard label="Tryout" supportingText="1 sesi aktif" value="04" />
        </ReferenceStatGrid>
      </section>

      <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <ReferenceActivityFeed
          activities={previewActivities}
          nextAction="Tinjau materi yang terakhir diperbarui"
          title="Aktivitas terbaru"
        />

        <section aria-label="Baris progres" className="space-y-4">
          <ReferenceSectionHeading
            title="Baris progres"
            description="Ring progres menjaga konteks tanpa mengambil alih isi."
          />
          <div className="space-y-3">
            <ReferenceGoalProgressRow
              progress={72}
              status="on_track"
              summary="9 dari 12 item selesai"
              title="Paket UTBK minggu ini"
            />
            <ReferenceGoalProgressRow
              progress={38}
              status="in_progress"
              summary="3 dari 8 item selesai"
              title="Bank soal Penalaran Umum"
            />
          </div>
        </section>
      </div>

      <section aria-label="Kartu tugas" className="space-y-4">
        <ReferenceSectionHeading
          title="Kartu tugas"
          description="Metadata tetap opsional dan memakai ikon yang sudah dikenal."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ReferenceTaskCard
            assignee="Rina"
            createdByAi
            deadline="Besok"
            description="Pastikan penjelasan jawaban sudah konsisten dengan subtes."
            estimatedTime="45 menit"
            status="in_progress"
            title="Tinjau pembahasan soal"
          />
          <ReferenceTaskCard
            deadline="Jumat"
            description="Lengkapi metadata sebelum masuk ke antrean terbit."
            status="pending"
            title="Lengkapi metadata materi"
          />
        </div>
      </section>

    </ReferenceDashboardShell>
  );
}

export { ReferenceDashboardComponentPreview };

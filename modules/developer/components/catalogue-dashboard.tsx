"use client";

import { useState } from "react";

import {
  ReferenceActivityFeed,
  ReferenceActivityItem,
  ReferenceEmptyState,
  ReferenceGoalProgressRow,
  ReferencePageHeader,
  ReferenceProgressRing,
  ReferenceSectionHeading,
  ReferenceStatCard,
  ReferenceStatGrid,
  ReferenceStatusBadge,
  ReferenceSurface,
  ReferenceTaskCard,
} from "@/components/dashboard/reference-dashboard-primitives";
import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import { ReferenceSelectField } from "@/components/dashboard/reference-select-field";
import { REFERENCE_STATUS_LABELS } from "@/components/dashboard/reference-dashboard-tokens";
import { BookOpenText } from "@/lib/icons";

const options = [
  { label: "Penalaran Umum", value: "pu" },
  { label: "Pengetahuan Kuantitatif", value: "pk" },
];

function ReferenceControlsPreview() {
  const [value, setValue] = useState("pu");
  return (
    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
      <ReferenceSelect aria-label="Contoh pilihan subtes" onValueChange={setValue} options={options} value={value} />
      <ReferenceSelectField help="Pilih salah satu subtes untuk contoh ini." id="catalogue-reference-subject" label="Subtes" onValueChange={setValue} options={options} value={value} />
      <ReferenceSelectField disabled id="catalogue-reference-disabled" label="Pilihan nonaktif" options={options} value="pu" onValueChange={() => {}} />
      <ReferenceSelectField error="Pilih subtes sebelum melanjutkan." id="catalogue-reference-error" label="Pilihan belum lengkap" options={options} value="" onValueChange={() => {}} />
    </div>
  );
}

function ReferenceSurfacesPreview() {
  const [selected, setSelected] = useState(false);
  const [surfaceSelected, setSurfaceSelected] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
        {(["inset", "raised", "tactile"] as const).map((variant) => (
          <ReferenceSurface className="p-5" key={variant} variant={variant}>
            <code className="text-xs">variant=&quot;{variant}&quot;</code>
            <p className="mt-2 text-sm text-secondary-700">Contoh permukaan dashboard.</p>
          </ReferenceSurface>
        ))}
      </div>
      <ReferenceSurface
        aria-pressed={surfaceSelected}
        className="min-h-[44px] p-5"
        interactive
        onClick={() => setSurfaceSelected((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSurfaceSelected((current) => !current);
          }
        }}
        role="button"
        tabIndex={0}
        variant="raised"
      >
        <code className="text-xs">interactive=true</code>
        <p className="mt-2 text-sm text-secondary-700">
          {surfaceSelected ? "Permukaan contoh dipilih." : "Klik atau tekan Enter untuk memilih permukaan contoh."}
        </p>
      </ReferenceSurface>
      <ReferenceStatGrid>
        <ReferenceStatCard icon={BookOpenText} label="Materi contoh" supportingText="Data demonstrasi" value="12" />
        <ReferenceStatCard href="#component-reference-surfaces" label="Kuis contoh bertautan" supportingText="Tautan menuju bagian contoh ini" value="8" />
        <ReferenceStatCard label="Tryout contoh" value="4" />
      </ReferenceStatGrid>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <ReferenceTaskCard description="Kartu dengan metadata lengkap." estimatedTime="15 menit" assignee="Kapten contoh" deadline="Besok" status="in_progress" title="Tinjau materi contoh" />
        <ReferenceTaskCard description="Klik untuk mengubah status contoh di halaman ini." onClick={() => setSelected(!selected)} status={selected ? "completed" : "pending"} title="Kartu tugas interaktif" />
        <ReferenceTaskCard createdByAi description="Tautan menuju bagian contoh ini." href="#component-reference-surfaces" status="pending" title="Kartu tugas bertautan" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {Object.entries(REFERENCE_STATUS_LABELS).map(([status, label]) => (
          <ReferenceStatusBadge key={status} label={label} status={status} />
        ))}
      </div>
      <div className="space-y-3">
        <p className="text-xs font-semibold text-secondary-700">Pemetaan status ke tone Badge · ukuran xs, sm, dan md</p>
        <div className="flex flex-wrap items-center gap-3">
          {([
            { size: "xs", status: "scheduled" },
            { size: "sm", status: "in_progress" },
            { size: "md", status: "completed" },
          ] as const).map(({ size, status }) => (
            <div className="flex items-center gap-2" key={size}>
              <ReferenceStatusBadge size={size} status={status} />
              <code className="text-xs text-secondary-600">{status} · {size}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReferenceContentPreview() {
  const activity = { id: "catalogue-activity", title: "Materi contoh diperbarui", description: "Contoh aktivitas tanpa menyimpan perubahan.", timestamp: "Baru saja", tone: "info" as const };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <code className="text-xs text-secondary-600">ReferencePageHeader</code>
        <ReferencePageHeader title="Judul halaman contoh" />
      </div>
      <ReferenceSectionHeading description="Penjelasan singkat isi bagian." title="Judul bagian contoh" />
      <div className="flex flex-wrap items-center gap-6">
        {[0, 38, 72, 100].map((value) => <ReferenceProgressRing ariaLabel={`${value}% progres contoh`} key={value} value={value} />)}
      </div>
      <ReferenceGoalProgressRow progress={72} status="on_track" summary="9 dari 12 materi contoh selesai" title="Target belajar contoh" />
      <ReferenceGoalProgressRow href="#component-reference-content" progress={38} status="in_progress" summary="Tautan menuju bagian contoh ini" title="Target belajar bertautan" />
      <ReferenceActivityFeed activities={[activity]} title="Aktivitas contoh" />
      <ReferenceActivityItem activity={{ ...activity, id: "catalogue-single-activity", title: "Contoh satu aktivitas" }} isLast />
      <ReferenceEmptyState description="Daftar contoh belum memiliki aktivitas." title="Belum ada aktivitas contoh" />
      <p className="max-w-[65ch] text-sm leading-6 text-secondary-700">
        Komposisi berikut memakai ReferenceDashboardComponentPreview dan ReferenceDashboardShell.
        Navigasi dan tampilan contoh berada dalam area terpisah agar tidak mengubah katalog ini.
      </p>
      <iframe className="h-[720px] w-full rounded-2xl border border-primary-100" loading="lazy" src="/developer/components?preview=dashboard" title="Contoh komposisi dashboard dan navigasi" />
    </div>
  );
}

const dashboardSections = [
  { id: "reference-controls", title: "ReferenceSelect", description: "Pilihan dashboard dengan permukaan field inset bersama, label/bantuan, keadaan nonaktif, dan validasi melalui pemicu tooltip bernama.", sources: ["components/dashboard/reference-dashboard-controls.tsx", "components/dashboard/reference-select-field.tsx", "components/dashboard/reference-dashboard-tokens.ts", "components/ui/field.tsx", "components/ui/field-constants.ts", "components/ui/tooltip.tsx", "components/ui/button.tsx"], preview: <ReferenceControlsPreview /> },
  { id: "reference-surfaces", title: "ReferenceSurface dan kartu dashboard", description: "Permukaan inset, raised, tactile; kartu statistik, kartu tugas, pemetaan status badge, dan kontrol field bersama.", sources: ["components/dashboard/reference-dashboard-primitives.tsx", "components/dashboard/reference-dashboard-tokens.ts", "components/ui/field-constants.ts"], preview: <ReferenceSurfacesPreview /> },
  { id: "reference-content", title: "Header, aktivitas, dan progres dashboard", description: "Header halaman dan bagian, ring dan baris progres, aktivitas, keadaan kosong, serta referensi komposisi shell.", sources: ["components/dashboard/reference-dashboard-primitives.tsx", "components/dashboard/reference-dashboard-shell.tsx", "components/dashboard/reference-dashboard-preview.tsx", "components/dashboard/index.ts"], preview: <ReferenceContentPreview /> },
];

export { dashboardSections };

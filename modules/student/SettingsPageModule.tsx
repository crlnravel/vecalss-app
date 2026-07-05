import {
  Camera,
  ChevronDown,
  Trash2,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
  fieldControlClassName,
} from "@/components/ui/field";
import type {
  ExamEvent,
  Major,
  StudentProfile,
  University,
} from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

type SettingsProfile = StudentProfile & {
  targetExamEvent: ExamEvent | null;
  targetMajor: Major | null;
  targetUniversity: University | null;
};

const topTabs = [
  { label: "Akun", active: true },
  { label: "Notifikasi" },
  { label: "Berbagi" },
  { label: "Jadwal belajar" },
  { label: "Tagihan" },
  { label: "Pertanyaan" },
];

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ") || "",
  };
}

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatValue(value: string | null | undefined, fallback: string) {
  return value && value.trim().length > 0 ? value : fallback;
}

function SettingsSection({
  children,
  description,
  id,
  title,
}: {
  children: React.ReactNode;
  description: string;
  id: string;
  title: string;
}) {
  return (
    <section
      id={id}
      className="grid gap-6 border-t border-primary-100 py-8 first:border-t-0 first:pt-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10"
    >
      <div>
        <h2 className="text-[20px] leading-tight font-semibold text-secondary-900">
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-secondary-500">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function SettingsPageModule({
  profile,
  session,
}: {
  profile: SettingsProfile;
  session: SessionContext;
}) {
  const initials = getInitials(session.user.fullName);
  const { firstName, lastName } = splitName(session.user.fullName);
  const city = formatValue(profile.targetUniversity?.city, "Jakarta");
  const timezone = formatValue(profile.timezone, "Asia/Jakarta");
  const targetUniversity = formatValue(
    profile.targetUniversity?.name,
    "Belum memilih PTN",
  );
  const targetMajor = formatValue(
    profile.targetMajor?.name,
    "Belum memilih jurusan",
  );
  const targetExam = formatValue(
    profile.targetExamEvent?.name,
    "Belum memilih ujian",
  );

  return (
    <StudentWorkspaceShell
      activeLabel="Pengaturan"
      breadcrumbLabel="Pengaturan"
      mainClassName="max-w-[1460px] gap-6 px-3 py-6 md:px-6 lg:px-8"
      searchPlaceholder="Cari pengaturan akun atau preferensi..."
      session={session}
      sidebarFooterLabel={profile.targetUniversity?.name ?? "Atur target PTN"}
    >
      <div>
        <h1 className="text-[28px] leading-tight font-semibold text-secondary-900 md:text-[34px]">
          Pengaturan
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-secondary-500 md:text-sm">
          Atur akun dan preferensi belajarmu.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {topTabs.map((tab) => (
            <button
              key={tab.label}
              className={[
                "inline-flex rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
                tab.active
                  ? "bg-primary-700 text-white"
                  : "bg-secondary-100 text-secondary-700 hover:bg-primary-50 hover:text-primary-800",
              ].join(" ")}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <SettingsSection
          description="Atur detail akunmu."
          id="akun"
          title="Profil"
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_180px]">
            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="settings-first-name">Nama depan</FieldLabel>
                <FieldInput
                  defaultValue={firstName}
                  id="settings-first-name"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="settings-last-name">Nama belakang</FieldLabel>
                <FieldInput
                  defaultValue={lastName}
                  id="settings-last-name"
                />
              </Field>

              <Field className="md:col-span-2">
                <FieldLabel htmlFor="settings-email">Email</FieldLabel>
                <FieldInput
                  className="border-primary-300/60 shadow-[0_0_0_2px_rgba(122,189,168,0.16)]"
                  defaultValue={session.user.email}
                  id="settings-email"
                  type="email"
                />
              </Field>
            </div>

            <div className="flex flex-col items-start gap-3 xl:items-center xl:pt-2">
              <Avatar className="size-32 border border-primary-100 shadow-[0_18px_44px_-24px_rgba(1,76,56,0.32)]">
                <AvatarFallback className="bg-[linear-gradient(135deg,#d7ebe3_0%,#7abda8_100%)] text-2xl font-semibold text-primary-800">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2">
                <Button size="sm" type="button" variant="brandOutline">
                  <Camera className="size-4" />
                  Ganti foto
                </Button>
                <Button
                  aria-label="Hapus foto"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          description="Sesuaikan zona waktu dan formatmu."
          id="jadwal"
          title="Zona waktu & preferensi"
        >
          <div className="grid gap-5 lg:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="settings-city">Kota</FieldLabel>
              <FieldInput defaultValue={city} id="settings-city" />
            </Field>

            <Field>
              <FieldLabel htmlFor="settings-timezone">Zona waktu</FieldLabel>
              <div className="relative">
                <select
                  className={`${fieldControlClassName} appearance-none pr-12`}
                  defaultValue={timezone}
                  id="settings-timezone"
                >
                  <option value="Asia/Jakarta">Asia/Jakarta</option>
                  <option value="Asia/Makassar">Asia/Makassar</option>
                  <option value="Asia/Jayapura">Asia/Jayapura</option>
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="settings-format">Format tanggal & waktu</FieldLabel>
              <div className="relative">
                <select
                  className={`${fieldControlClassName} appearance-none pr-12`}
                  defaultValue="24h"
                  id="settings-format"
                >
                  <option value="24h">dd/mm/yyyy 00:00</option>
                  <option value="12h">dd/mm/yyyy 12:00 AM</option>
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
              </div>
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection
          description="Kalibrasi ritme belajar yang kamu inginkan."
          id="ritme-belajar"
          title="Motivasi & performa belajar"
        >
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="px-1 py-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-secondary-900">
                  Durasi belajar harian yang diinginkan
                </p>
                <span className="rounded-2xl bg-white px-3 py-2 text-[13px] font-medium text-secondary-900 shadow-sm ring-1 ring-primary-100">
                  2 jam
                </span>
              </div>
              <input
                className="mt-6 h-2 w-full cursor-pointer appearance-none rounded-full bg-primary-100 accent-[#075f46]"
                defaultValue="58"
                max="100"
                min="0"
                type="range"
              />
              <p className="mt-4 text-[13px] leading-6 text-secondary-500">
                Bantu kami menjaga alokasi belajar harianmu tetap realistis dan
                konsisten.
              </p>
            </div>

            <div className="px-1 py-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-secondary-900">
                  Rentang fokus inti per hari
                </p>
                <span className="rounded-2xl bg-white px-3 py-2 text-[13px] font-medium text-secondary-900 shadow-sm ring-1 ring-primary-100">
                  90 menit
                </span>
              </div>
              <input
                className="mt-6 h-2 w-full cursor-pointer appearance-none rounded-full bg-primary-100 accent-[#075f46]"
                defaultValue="44"
                max="100"
                min="0"
                type="range"
              />
              <p className="mt-4 text-[13px] leading-6 text-secondary-500">
                Prioritaskan jam paling fokus untuk materi yang paling menantang.
              </p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          description="Tambahkan info tentang target belajarmu."
          id="target-belajar"
          title="Target belajar"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="settings-target-university">
                PTN tujuan
              </FieldLabel>
              <FieldInput
                defaultValue={targetUniversity}
                id="settings-target-university"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="settings-target-major">
                Jurusan tujuan
              </FieldLabel>
              <FieldInput
                defaultValue={targetMajor}
                id="settings-target-major"
              />
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="settings-target-exam">Ujian target</FieldLabel>
              <FieldInput
                defaultValue={targetExam}
                id="settings-target-exam"
              />
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="settings-target-note">
                Catatan fokus
              </FieldLabel>
              <FieldTextarea
                className="min-h-[170px]"
                defaultValue={`Target utama: ${targetUniversity}${
                  targetMajor !== "Belum memilih jurusan" ? ` - ${targetMajor}` : ""
                }.\nFokus minggu ini: jaga progres belajar tetap stabil.`}
                id="settings-target-note"
              />
            </Field>
          </div>
        </SettingsSection>
      </div>
    </StudentWorkspaceShell>
  );
}

export { SettingsPageModule };

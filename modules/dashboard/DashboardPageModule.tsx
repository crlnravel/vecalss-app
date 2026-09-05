"use client";

import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  BookOpen,
  Bot,
  Bell,
  CalendarCheck,
  ChevronRight,
  Activity,
  Gauge,
  History,
  Info,
  ListChecks,
  UserRound,
  Target,
  Zap,
} from "@/lib/icons";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompactTabsList, CompactTabsTrigger } from "@/components/ui/compact-filter-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type {
  ExamEvent,
  Major,
  StudentProfile,
  University,
} from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import {
  resolveStudentBannerText,
  type StudentBannerContent,
} from "@/lib/student/banner-content";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";
import { cn } from "@/lib/utils";

type DashboardProfile = StudentProfile & {
  targetExamEvent: ExamEvent | null;
  targetMajor: Major | null;
  targetUniversity: University | null;
};

type DashboardIcon = ComponentType<{ className?: string }>;

const quickAccessItems: Array<{
  description: string;
  href: string;
  icon: DashboardIcon;
  label: string;
}> = [
  { description: "Lanjutkan bacaanmu", href: "/courses", icon: BookOpen, label: "Materi" },
  { description: "Latihan soal sesuai subtes", href: "/quiz", icon: ListChecks, label: "Kuis" },
  { description: "Uji kesiapan UTBK", href: "/tryout", icon: Gauge, label: "Tryout" },
  { description: "Tanya dan susun strategi belajar", href: "/vera-ai", icon: Bot, label: "Vera AI" },
  { description: "Cek update dan pengingat belajar", href: "/notifications", icon: Bell, label: "Notifikasi" },
  { description: "Atur data diri dan target", href: "/settings", icon: UserRound, label: "Profil" },
  { description: "Kelola jurusan dan kampus tujuan", href: "/settings#target-belajar", icon: Target, label: "Target Belajar" },
  { description: "Selesaikan tugas belajar hari ini", href: "#daily-mission", icon: CalendarCheck, label: "Misi Harian" },
  { description: "Lihat performa dan latihanmu", href: "#progress", icon: Activity, label: "Progress Belajar" },
];

const dailyMissionItems = [
  "Daftar Tryout SNBT Pintarly",
  "Kerjakan Latihan Kilat 10 Soal PU (Penalaran Umum)",
  "Selesaikan 1 Bacaan Materi",
];

const chapterTabs = [
  { label: "Penalaran Umum", value: "PU" },
  { label: "Pengetahuan dan Pemahaman Umum", value: "PPU" },
  { label: "Penalaran Berbasis Matematika", value: "PBM" },
  { label: "Pengetahuan Kuantitatif", value: "PK" },
  { label: "Literasi Bahasa Indonesia", value: "LBI" },
  { label: "Literasi Bahasa Inggris", value: "LBE" },
  { label: "Penalaran Matematika", value: "PM" },
];

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "Voyager";
}

function getExamDaysLeft(profile: DashboardProfile) {
  const examDate = profile.targetExamEvent?.examDate;

  if (!examDate) {
    return null;
  }

  const diff = examDate.getTime() - Date.now();

  if (diff <= 0) {
    return 0;
  }

  return Math.ceil(diff / 86_400_000);
}

function DashboardPageModule({
  banner,
  notificationFeed,
  profile,
  session,
}: {
  banner: StudentBannerContent;
  notificationFeed?: StudentNotificationFeed;
  profile: DashboardProfile;
  session: SessionContext;
}) {
  const firstName = getFirstName(session.user.fullName);
  const examDaysLeft = getExamDaysLeft(profile);
  const target = [
    profile.targetMajor?.name,
    profile.targetUniversity?.shortName ?? profile.targetUniversity?.name,
  ].filter(Boolean).join(" - ") || "target belajarmu";
  const bannerVariables = { firstName, target };

  return (
    <StudentWorkspaceShell
      accountMenuExtraItem="notifications"
      activeLabel="Beranda"
      breadcrumbLabel="Beranda"
      mainClassName="gap-8 lg:gap-9"
      notificationFeed={notificationFeed}
      searchPlaceholder="Cari materi, kuis, atau rekomendasi..."
      session={session}
    >
      <section>
        <Card className="relative min-h-[330px] overflow-hidden rounded-5xl border border-primary-200 bg-[linear-gradient(125deg,var(--voyage-surface)_0%,var(--voyage-sea-glass-wash)_48%,var(--voyage-sea-glass)_100%)] shadow-[0_28px_90px_-58px_color-mix(in_oklab,var(--voyage-deep)_42%,transparent)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] min-w-[20rem] lg:block">
            <div className="absolute inset-x-6 bottom-5 h-12 rounded-full bg-primary-900/12 blur-2xl" />
            <Image
              alt=""
              className="absolute right-[-2.5rem] bottom-[-2.5rem] h-auto w-[22rem] max-w-none object-contain drop-shadow-[0_26px_42px_color-mix(in_oklab,var(--voyage-deep)_18%,transparent)] xl:w-[26rem]"
              height={416}
              sizes="(min-width: 1280px) 416px, 352px"
              src="/brand/mascot-vecalss.png"
              width={416}
            />
          </div>
          <CardHeader className="relative gap-7 px-7 pb-0 pt-7 md:px-10 md:pt-10 lg:pr-[32%]">
            <div className="grid gap-10">
              <div>
                <CardTitle className="max-w-3xl text-4xl leading-[1.08] font-semibold text-secondary-900 md:text-5xl xl:text-6xl">
                  {resolveStudentBannerText(banner.title, bannerVariables)}
                </CardTitle>
                <CardDescription className="mt-5 max-w-[42ch] text-base leading-7 text-secondary-600 md:text-base">
                  {resolveStudentBannerText(banner.description, bannerVariables)}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-3">
                <HeroCountdownPill daysLeft={examDaysLeft} />
                <HeroDataPill />
              </div>
            </div>
          </CardHeader>
        </Card>
      </section>

      <DashboardDataNotice />
      <QuickAccessSection />
      <DailyMissionSection />
      <AnalyticsSection />
      <ChapterSkillsSection />
      <RecentActivitySection />
    </StudentWorkspaceShell>
  );
}

function HeroCountdownPill({ daysLeft }: { daysLeft: number | null }) {
  const label =
    daysLeft === null ? "Pasang target" : daysLeft === 0 ? "Hari H UTBK" : `H-${daysLeft} UTBK`;

  return (
    <div className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-white/80 bg-white/90 px-4 py-2 shadow-[0_14px_30px_-22px_color-mix(in_oklab,var(--voyage-deep)_50%,transparent)]">
      <CalendarCheck className="size-[18px] text-primary-700" />
      <span className="text-base font-bold leading-none text-primary-700">{label}</span>
    </div>
  );
}

function HeroDataPill() {
  return (
    <div className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary-200 bg-white/90 px-4 py-2 text-secondary-700 shadow-[0_14px_30px_-22px_color-mix(in_oklab,var(--voyage-deep)_50%,transparent)]">
      <Info aria-hidden="true" className="size-[18px] text-primary-700" />
      <span className="text-sm font-semibold leading-none">XP belum tersedia</span>
    </div>
  );
}

function DashboardDataNotice() {
  return (
    <Card className="border-primary-200 bg-primary-50/70 shadow-none">
      <CardContent className="flex items-start gap-3 px-5 py-4">
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-700" />
        <div>
          <p className="text-sm font-semibold text-secondary-900">Data dashboard belum tersedia</p>
          <p className="mt-1 text-sm leading-6 text-secondary-600">
            Ringkasan aktivitas di bawah belum tersambung ke sumber live. Nilai XP, misi, dan analitik tidak akan dianggap tersimpan sampai data tersedia.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSectionHeading({ icon: Icon, title }: { icon: DashboardIcon; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-5 text-secondary-900" />
      <h2 className="text-lg font-semibold tracking-tight text-secondary-900">{title}</h2>
    </div>
  );
}

function QuickAccessSection() {
  return (
    <section className="flex flex-col gap-4">
      <DashboardSectionHeading icon={Zap} title="Akses Cepat" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {quickAccessItems.map((item) => (
          <Link className="group block min-w-0" href={item.href} key={item.label}>
            <Card className={cn(
              REFERENCE_SURFACE_CLASS_NAMES.raised,
              REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
              "gap-0 py-0 ring-0",
            )}>
              <CardContent className="flex min-h-20 items-center gap-4 px-4 py-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-transparent text-primary-700">
                  <item.icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-[15px] font-semibold text-secondary-900">
                    {item.label}
                  </CardTitle>
                  <CardDescription className="mt-0.5 truncate text-xs text-secondary-500">
                    {item.description}
                  </CardDescription>
                </div>
                <ChevronRight className="size-5 shrink-0 text-secondary-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-700" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

function DailyMissionSection() {
  return (
    <section className="flex flex-col gap-4" id="daily-mission">
      <DashboardSectionHeading icon={Target} title="Misi Harian" />
      <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "gap-0 py-0 ring-0")}>
        <CardHeader className="flex flex-row items-center justify-between gap-4 px-5 pb-4 pt-5">
          <CardDescription className="text-sm text-secondary-500">
            Belum tersedia karena sumber aktivitas belum tersambung.
          </CardDescription>
          <span className="shrink-0 text-xs font-semibold text-secondary-500">Belum dimulai</span>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-5 pb-5">
          {dailyMissionItems.map((mission) => (
            <div
              aria-disabled="true"
              className="flex min-h-12 items-center gap-3 rounded-2xl border border-secondary-200 bg-secondary-50/60 px-3.5 py-2.5 text-secondary-500"
              key={mission}
            >
              <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border border-secondary-300 bg-white text-xs">–</span>
              <span className="text-sm font-medium">{mission}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function AnalyticsSection() {
  return (
    <section className="grid gap-4 lg:grid-cols-3" id="progress">
      <AccuracyCard />
      <PracticeActivityCard />
      <TryoutProgressCard />
    </section>
  );
}

function AnalyticsCard({ children, description, title }: { children: React.ReactNode; description: string; title: string }) {
  return (
    <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "min-h-[310px] gap-0 py-0 ring-0")}>
      <CardHeader className="gap-1 px-5 pb-0 pt-5">
        <CardTitle className="text-[15px] font-semibold text-secondary-900">{title}</CardTitle>
        <CardDescription className="text-xs text-secondary-500">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 px-5 pb-5 pt-3">{children}</CardContent>
    </Card>
  );
}

function AccuracyCard() {
  return <UnavailableAnalyticsCard description="Belum ada sumber aktivitas untuk menghitung akurasi." title="Akurasi" />;
}

function PracticeActivityCard() {
  return <UnavailableAnalyticsCard description="Belum ada sumber aktivitas untuk menampilkan tren." title="Aktivitas Latihan" />;
}

function UnavailableAnalyticsCard({ description, title }: { description: string; title: string }) {
  return (
    <AnalyticsCard description={description} title={title}>
      <Empty className="min-h-[230px] gap-3 border-0 p-4">
        <EmptyMedia className="size-12 rounded-full bg-secondary-100 text-secondary-500" variant="icon">
          <Info />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle className="text-sm font-medium text-secondary-600">Belum tersedia</EmptyTitle>
        </EmptyHeader>
      </Empty>
    </AnalyticsCard>
  );
}

function TryoutProgressCard() {
  return (
    <AnalyticsCard description="Nilai Tryout terakhir" title="Progress Tryout">
      <Empty className="min-h-[230px] gap-3 border-0 p-4">
        <EmptyHeader>
          <EmptyTitle className="text-sm font-medium text-secondary-500">Belum ada data Tryout yang selesai</EmptyTitle>
        </EmptyHeader>
      </Empty>
    </AnalyticsCard>
  );
}

function ChapterSkillsSection() {
  return (
    <section className="flex flex-col gap-4">
      <DashboardSectionHeading icon={Gauge} title="Keahlian per Bab" />
      <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "gap-0 py-0 ring-0")}>
        <CardContent className="px-4 pb-4 pt-4 md:px-5 md:pb-5">
          <Tabs defaultValue="PU">
            <CompactTabsList aria-label="Pilih bab">
              {chapterTabs.map((chapter) => (
                <CompactTabsTrigger
                  key={chapter.value}
                  value={chapter.value}
                >
                  {chapter.value}
                </CompactTabsTrigger>
              ))}
            </CompactTabsList>
            {chapterTabs.map((chapter) => (
              <TabsContent className="mt-2" key={chapter.value} value={chapter.value}>
                <Empty className="min-h-[350px] border-0 p-5">
                  <EmptyMedia className="size-14 rounded-full bg-primary-50 text-primary-500" variant="icon">
                    <BookOpen />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle className="text-base font-medium text-secondary-900">Belum ada data</EmptyTitle>
                    <EmptyDescription>
                      Mulai latihan {chapter.label} untuk melihat keahlian per bab!
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button nativeButton={false} render={<Link href="/quiz" />} size="sm" variant="brand">
                      Latihan Sekarang
                    </Button>
                  </EmptyContent>
                </Empty>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </section>
  );
}

function RecentActivitySection() {
  return (
    <section className="flex flex-col gap-4">
      <DashboardSectionHeading icon={History} title="Aktivitas Terakhir" />
      <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "gap-0 py-0 ring-0")}>
        <CardContent className="p-4 md:p-5">
          <Empty className="min-h-[250px] rounded-3xl border border-dashed border-secondary-300 bg-transparent p-5">
            <EmptyMedia className="mb-1" variant="default">
              <Image alt="" className="size-16 object-contain opacity-45 grayscale" height={64} src="/brand/mascot-vecalss.png" width={64} />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-base font-medium text-secondary-900">Kamu belum ada belajar nih.</EmptyTitle>
              <EmptyDescription>Yuk, mulai progress belajarmu sekarang!</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link href="/courses" />} size="sm" variant="brand">
                Lihat Materi
              </Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </section>
  );
}

export { DashboardPageModule };

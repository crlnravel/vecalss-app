"use client";

import dynamic from "next/dynamic";
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
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const Bar = dynamic(() => import("recharts").then((module) => module.Bar));
const BarChart = dynamic(() => import("recharts").then((module) => module.BarChart));
const CartesianGrid = dynamic(() => import("recharts").then((module) => module.CartesianGrid));
const PolarAngleAxis = dynamic(() => import("recharts").then((module) => module.PolarAngleAxis));
const PolarGrid = dynamic(() => import("recharts").then((module) => module.PolarGrid));
const Radar = dynamic(() => import("recharts").then((module) => module.Radar));
const RadarChart = dynamic(() => import("recharts").then((module) => module.RadarChart));
const XAxis = dynamic(() => import("recharts").then((module) => module.XAxis));

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
  { description: "Atur data diri, zona waktu, dan target", href: "/settings", icon: UserRound, label: "Profil" },
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

const emptyMastery = [
  { subject: "PU", value: 0 },
  { subject: "PPU", value: 0 },
  { subject: "PBM", value: 0 },
  { subject: "PK", value: 0 },
  { subject: "LBI", value: 0 },
  { subject: "LBE", value: 0 },
];

const emptyActivity = [
  { day: "Sen", minutes: 0 },
  { day: "Sel", minutes: 0 },
  { day: "Rab", minutes: 0 },
  { day: "Kam", minutes: 0 },
  { day: "Jum", minutes: 0 },
  { day: "Sab", minutes: 0 },
  { day: "Min", minutes: 0 },
];

const activityChartConfig = {
  minutes: {
    color: "#82c8b2",
    label: "Menit belajar",
  },
} satisfies ChartConfig;

const masteryChartConfig = {
  value: {
    color: "#b6d9cc",
    label: "Penguasaan",
  },
} satisfies ChartConfig;

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
      breadcrumbLabel="Beranda Siswa"
      mainClassName="gap-8 lg:gap-9"
      notificationFeed={notificationFeed}
      searchPlaceholder="Cari materi, kuis, atau rekomendasi..."
      session={session}
    >
      <section>
        <Card className="relative min-h-[330px] overflow-hidden rounded-5xl border border-primary-200 bg-[linear-gradient(125deg,#ffffff_0%,#eef9f2_48%,#bfe6ce_100%)] shadow-[0_28px_90px_-58px_rgba(1,76,56,0.42)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] min-w-[20rem] lg:block">
            <div className="absolute inset-x-6 bottom-5 h-12 rounded-full bg-primary-900/12 blur-2xl" />
            <Image
              alt=""
              className="absolute right-[-2.5rem] bottom-[-2.5rem] h-auto w-[22rem] max-w-none object-contain drop-shadow-[0_26px_42px_rgba(1,76,56,0.18)] xl:w-[26rem]"
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
                <HeroXpPill level={7} progress={68} total={100} xp="1.840" />
              </div>
            </div>
          </CardHeader>
        </Card>
      </section>

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
    <div className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-white/80 bg-white/90 px-4 py-2 shadow-[0_14px_30px_-22px_rgba(1,76,56,0.5)]">
      <CalendarCheck className="size-[18px] text-primary-700" />
      <span className="text-base font-bold leading-none text-primary-700">{label}</span>
    </div>
  );
}

function HeroXpPill({
  level,
  progress,
  total,
  xp,
}: {
  level: number;
  progress: number;
  total: number;
  xp: string;
}) {
  return (
    <div className="inline-flex min-h-10 overflow-hidden rounded-full bg-primary-700 text-white shadow-[0_14px_30px_-22px_rgba(1,76,56,0.58)]">
      <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-secondary-700">
        <span className="text-base font-bold leading-none text-primary-700">XP</span>
        <span className="text-lg font-bold leading-none">{xp}</span>
      </div>
      <div className="flex min-w-32 items-center gap-2.5 px-3.5 py-2">
        <div>
          <p className="text-xs font-bold leading-none">Tingkat {level}</p>
          <div className="mt-1 h-1.5 w-[72px] overflow-hidden rounded-full bg-primary-950/30">
            <div className="h-full rounded-full bg-white/86" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <span className="text-xs font-bold leading-none">{progress}/{total}</span>
      </div>
    </div>
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
            <Card className="gap-0 rounded-3xl border border-secondary-300 bg-white py-0 shadow-none ring-0 transition-colors hover:border-primary-300 hover:bg-primary-50/35">
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
      <DashboardSectionHeading icon={Target} title="Misi Harian Day 1" />
      <Card className="gap-0 rounded-3xl border border-secondary-300 bg-white py-0 shadow-none ring-0">
        <CardHeader className="flex flex-row items-center justify-between gap-4 px-5 pb-4 pt-5">
          <CardDescription className="text-sm text-secondary-500">
            Yuk, selesaikan tugas harian kamu!
          </CardDescription>
          <CardAction className="flex items-center gap-3">
            <span className="text-sm font-semibold text-secondary-600">0/3</span>
            <Progress aria-label="Progres misi harian" className="w-24 gap-0" value={0} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-5 pb-5">
          {dailyMissionItems.map((mission) => (
            <label
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-secondary-300 bg-white px-3.5 py-2.5 transition-colors hover:border-primary-200 hover:bg-primary-50/25"
              key={mission}
            >
              <Checkbox aria-label={mission} className="size-5 rounded-full border-secondary-300 bg-white" />
              <span className="text-sm font-medium text-secondary-800">{mission}</span>
            </label>
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
    <Card className="gap-0 min-h-[310px] rounded-3xl border border-secondary-300 bg-white py-0 shadow-none ring-0">
      <CardHeader className="gap-1 px-5 pb-0 pt-5">
        <CardTitle className="text-[15px] font-semibold text-secondary-900">{title}</CardTitle>
        <CardDescription className="text-xs text-secondary-500">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 px-5 pb-5 pt-3">{children}</CardContent>
    </Card>
  );
}

function AccuracyCard() {
  return (
    <AnalyticsCard description="Lakukan lebih banyak latihan untuk melihat analisis akurasi..." title="Akurasi">
      <div className="relative flex min-h-[230px] w-full items-center justify-center">
        <ChartContainer className="h-[220px] w-full max-w-[270px]" config={masteryChartConfig}>
          <RadarChart data={emptyMastery}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--secondary-500)", fontSize: 10 }} />
            <Radar dataKey="value" fill="var(--color-value)" fillOpacity={0.16} stroke="var(--color-value)" strokeWidth={2} />
          </RadarChart>
        </ChartContainer>
        <span className="pointer-events-none absolute rounded-full border border-secondary-300 bg-white px-2.5 py-1 text-xs font-semibold text-secondary-700">
          0%
        </span>
      </div>
    </AnalyticsCard>
  );
}

function PracticeActivityCard() {
  return (
    <AnalyticsCard description="7 hari terakhir" title="Aktivitas Latihan">
      <ChartContainer className="h-[230px] w-full" config={activityChartConfig}>
        <BarChart data={emptyActivity} margin={{ left: -18, right: 4, top: 12, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis axisLine={false} dataKey="day" tickLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="minutes" fill="var(--color-minutes)" radius={[8, 8, 3, 3]} />
        </BarChart>
      </ChartContainer>
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
      <Card className="gap-0 rounded-3xl border border-secondary-300 bg-white py-0 shadow-none ring-0">
        <CardContent className="px-4 pb-4 pt-4 md:px-5 md:pb-5">
          <Tabs defaultValue="PU">
            <TabsList className="flex w-full gap-2 overflow-x-auto bg-transparent p-0">
              {chapterTabs.map((chapter) => (
                <TabsTrigger
                  className="h-9 flex-none rounded-full bg-secondary-100 px-4 text-xs font-medium text-secondary-600 data-active:bg-primary-700 data-active:text-white"
                  key={chapter.value}
                  value={chapter.value}
                >
                  {chapter.value}
                </TabsTrigger>
              ))}
            </TabsList>
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
                    <Button className="rounded-full bg-primary-700 px-5 font-semibold text-white hover:bg-primary-800" nativeButton={false} render={<Link href="/quiz" />} size="sm">
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
      <Card className="gap-0 rounded-3xl border border-secondary-300 bg-white py-0 shadow-none ring-0">
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
              <Button className="rounded-full bg-primary-700 px-5 font-semibold text-white hover:bg-primary-800" nativeButton={false} render={<Link href="/courses" />} size="sm">
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

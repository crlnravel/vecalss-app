"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  XAxis,
} from "recharts";
import {
  Award,
  Bell,
  BookOpen,
  Bot,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Flame,
  Gauge,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageCircle,
  Search,
  Settings,
  Target,
  UserRound,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ExamEvent,
  Major,
  StudentProfile,
  University,
} from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import type { SessionContext } from "@/lib/auth/types";
import { logoutAction } from "@/modules/auth/actions";
import { BrandMark } from "@/modules/home/components/home-primitives";

type DashboardProfile = StudentProfile & {
  targetExamEvent: ExamEvent | null;
  targetMajor: Major | null;
  targetUniversity: University | null;
};

type NavigationItem = {
  badge?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const mainNavigation: NavigationItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "#materi-runtun", icon: BookOpen, label: "Materi Runtun" },
  { href: "#quiz", icon: ListChecks, label: "Quiz" },
  { href: "#tryout", icon: Gauge, label: "Tryout" },
  { href: "#progress", icon: Target, label: "Progress" },
  { href: "#vera-ai", icon: Bot, label: "Vera AI" },
];

const growthNavigation: NavigationItem[] = [
  { href: "#daily-mission", icon: Flame, label: "Daily Mission", badge: "3" },
  { href: "#notifications", icon: Bell, label: "Notifications", badge: "2" },
  { href: "#settings", icon: Settings, label: "Profile / Settings" },
];

const missions = [
  {
    checked: true,
    label: "Review Tryout Literasi",
    reward: "+20 XP",
  },
  {
    checked: true,
    label: "Selesaikan modul PU",
    reward: "+35 XP",
  },
  {
    checked: false,
    label: "Kerjakan 10 soal QR",
    reward: "+45 XP",
  },
  {
    checked: false,
    label: "Tanya Vera AI",
    reward: "Streak",
  },
];

const weakTopics = [
  {
    action: "Latihan sekarang",
    description: "Akurasi turun di simpulan implisit.",
    mastery: 42,
    module: "Modul 04: Struktur Argumen",
    title: "Penalaran Umum",
  },
  {
    action: "Review materi",
    description: "Waktu pengerjaan masih lambat.",
    mastery: 48,
    module: "Drill: Rasio dan Persentase",
    title: "Pengetahuan Kuantitatif",
  },
  {
    action: "Tanya Vera",
    description: "Perlu latihan baca grafik.",
    mastery: 54,
    module: "Vera AI: Analisis Grafik Cepat",
    title: "Literasi Data",
  },
];

const recentActivities = [
  {
    detail: "Modul 03 selesai, akurasi 82%.",
    icon: CheckCircle2,
    time: "09.20",
    title: "Menyelesaikan materi runtun",
  },
  {
    detail: "Fokus PU diperbarui.",
    icon: Bot,
    time: "Kemarin",
    title: "Analisis kelemahan diperbarui",
  },
  {
    detail: "Skor 676, naik 24 poin.",
    icon: Gauge,
    time: "2 hari lalu",
    title: "Tryout SNBT selesai",
  },
  {
    detail: "Badge Konsisten 7 Hari terbuka.",
    icon: Award,
    time: "Minggu ini",
    title: "Achievement baru",
  },
];

const studyActivity = [
  { day: "Sen", minutes: 40 },
  { day: "Sel", minutes: 55 },
  { day: "Rab", minutes: 36 },
  { day: "Kam", minutes: 72 },
  { day: "Jum", minutes: 48 },
  { day: "Sab", minutes: 64 },
  { day: "Min", minutes: 28 },
];

const scoreTrend = [
  { label: "T1", score: 612 },
  { label: "T2", score: 640 },
  { label: "T3", score: 652 },
  { label: "T4", score: 676 },
];

const masteryRadar = [
  { subject: "PU", value: 58 },
  { subject: "PPU", value: 72 },
  { subject: "PBM", value: 66 },
  { subject: "PK", value: 48 },
  { subject: "LBI", value: 74 },
  { subject: "LBE", value: 63 },
];

const activityChartConfig = {
  minutes: {
    color: "#1A6B3C",
    label: "Menit belajar",
  },
} satisfies ChartConfig;

const scoreChartConfig = {
  score: {
    color: "#1B2C6B",
    label: "Skor tryout",
  },
} satisfies ChartConfig;

const radarChartConfig = {
  value: {
    color: "#F5C518",
    label: "Mastery",
  },
} satisfies ChartConfig;

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "Voyager";
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
  profile,
  session,
}: {
  profile: DashboardProfile;
  session: SessionContext;
}) {
  const firstName = getFirstName(session.user.fullName);
  const initials = getInitials(session.user.fullName);
  const examDaysLeft = getExamDaysLeft(profile);
  const hasGoal = Boolean(profile.targetUniversity || profile.targetMajor);
  const missionProgress = Math.round(
    (missions.filter((mission) => mission.checked).length / missions.length) *
      100,
  );
  const studentLevel = 7;
  const studentXp = "1.840";
  const xpProgress = 68;

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-[#f7faf8] text-secondary-900">
        <Sidebar
          collapsible="icon"
          className="border-primary-100 bg-white/95 backdrop-blur"
        >
          <SidebarHeader className="gap-4 p-4">
            <Link
              href="/"
              className="flex items-center justify-center rounded-2xl px-1 py-1"
            >
              <BrandMark />
            </Link>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Belajar</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {[...mainNavigation, ...growthNavigation].map((item) => (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        isActive={item.href === "/dashboard"}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge ? (
                        <SidebarMenuBadge className="bg-accent-300 text-secondary-900">
                          {item.badge}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4">
            <div className="rounded-3xl border border-primary-100 bg-white p-3 shadow-sm group-data-[collapsible=icon]:p-2">
              <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
                <Avatar className="size-10 border border-primary-100">
                  <AvatarFallback className="bg-primary-700 text-sm font-semibold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-semibold text-secondary-900">
                    {session.user.fullName}
                  </p>
                  <p className="truncate text-xs text-secondary-500">
                    {profile.targetUniversity?.name ?? "Atur target PTN"}
                  </p>
                </div>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-[#f7faf8]/90 backdrop-blur-xl">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0 rounded-full border border-primary-100 bg-white shadow-sm" />

              <div className="hidden min-w-0 flex-1 md:block">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/" className="text-secondary-500">
                        Vecalss
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>Student Dashboard</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>

              <div className="relative ml-auto hidden w-full max-w-sm md:block">
                <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-secondary-400" />
                <Input
                  aria-label="Cari materi, quiz, atau rekomendasi"
                  className="h-10 rounded-full border-primary-100 bg-white pl-10 shadow-sm"
                  placeholder="Cari materi, quiz, atau rekomendasi..."
                />
              </div>

              <Button
                aria-label="Notifications"
                className="relative"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Bell />
                <span className="absolute top-2 right-2 size-2 rounded-full bg-[#F5C518]" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label="Open user menu"
                      className="rounded-full p-1"
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    />
                  }
                >
                  <Avatar className="size-9 border border-primary-100">
                    <AvatarFallback className="bg-primary-700 text-xs font-semibold text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>
                    <span className="block text-sm font-semibold text-secondary-900">
                      {session.user.fullName}
                    </span>
                    <span className="block truncate text-xs">
                      {session.user.email}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <UserRound />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings />
                      Preferences
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Bell />
                      Notifications
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <form action={logoutAction}>
                    <input name="audience" type="hidden" value="student" />
                    <DropdownMenuItem
                      render={<button className="w-full" type="submit" />}
                    >
                      <LogOut />
                      Log out
                    </DropdownMenuItem>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <ScrollArea className="h-[calc(100svh-4rem)]">
            <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-8 px-4 py-8 md:px-8 lg:px-10 lg:gap-9 lg:py-10">
              <section>
                <Card className="relative min-h-[330px] overflow-hidden rounded-[30px] border border-primary-100 bg-[linear-gradient(125deg,#ecfbf9_0%,#d8f2e3_52%,#fff1a8_100%)] shadow-[0_28px_90px_-58px_rgba(1,76,56,0.42)]">
                  <CardHeader className="relative gap-7 px-7 pb-0 pt-7 md:px-10 md:pt-10">
                    <div className="grid gap-10 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:items-start">
                      <div>
                        <CardTitle className="max-w-3xl text-[32px] leading-[1.08] font-semibold text-secondary-900 md:text-[40px] xl:text-[46px]">
                          Halo, {firstName}. Lanjutkan rute belajarmu.
                        </CardTitle>
                        <CardDescription className="mt-5 max-w-[42ch] text-[15px] leading-7 text-secondary-600 md:text-base">
                          Semangat mengejar{" "}
                          <span className="font-bold">Ilmu Komputer - UI </span>
                          ya!
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-3 2xl:justify-end">
                        <HeroCountdownPill daysLeft={examDaysLeft} />
                        <HeroXpPill
                          level={studentLevel}
                          progress={xpProgress}
                          total={100}
                          xp={studentXp}
                        />
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </section>

              {!hasGoal ? <BeginnerState /> : null}

              <section
                id="continue-learning"
                className="grid gap-6 xl:grid-cols-[minmax(340px,0.72fr)_minmax(0,1.28fr)]"
              >
                <DailyMissionCard missionProgress={missionProgress} />
                <ContinueLearningCard />
              </section>

              <section id="progress" className="grid">
                <ProgressOverview />
              </section>

              <section id="vera-ai">
                <FocusRecommendation />
              </section>

              <RecentActivity />
            </main>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function HeroCountdownPill({ daysLeft }: { daysLeft: number | null }) {
  const label =
    daysLeft === null
      ? "Pasang target"
      : daysLeft === 0
        ? "Hari H UTBK"
        : `H-${daysLeft} UTBK`;

  return (
    <div className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-white/80 bg-white/90 px-4 py-2 shadow-[0_14px_30px_-22px_rgba(1,76,56,0.5)]">
      <CalendarCheck className="size-[18px] text-primary-700" />
      <span className="text-base font-bold leading-none text-primary-700">
        {label}
      </span>
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
        <span className="text-base font-bold leading-none text-primary-700">
          XP
        </span>
        <span className="text-lg font-bold leading-none">{xp}</span>
      </div>
      <div className="flex min-w-32 items-center gap-2.5 px-3.5 py-2">
        <div>
          <p className="text-[11px] font-bold leading-none">Lvl {level}</p>
          <div className="mt-1 h-1.5 w-[72px] overflow-hidden rounded-full bg-primary-950/30">
            <div
              className="h-full rounded-full bg-white/86"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <span className="text-xs font-bold leading-none">
          {progress}/{total}
        </span>
      </div>
    </div>
  );
}

function DailyMissionCard({ missionProgress }: { missionProgress: number }) {
  return (
    <Card
      id="daily-mission"
      className="h-full rounded-[30px] border border-primary-100 shadow-[0_22px_70px_-54px_rgba(1,76,56,0.34)]"
    >
      <CardHeader className="gap-2 px-7 pt-7">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Flame className="size-4 text-primary-700" />
          Daily Mission
        </CardTitle>
        <CardAction>
          {/* <span className="inline-flex rounded-full bg-[#F5C518]/85 px-2.5 py-1 text-[11px] font-semibold leading-none text-secondary-900"> */}
          {/*   +100 XP */}
          {/* </span> */}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-6 px-7">
        <Progress className="gap-2" value={missionProgress}>
          <ProgressLabel className="text-sm font-medium">
            Progress misi
          </ProgressLabel>
          <ProgressValue className="text-xs text-secondary-500">
            {() => `${missionProgress}%`}
          </ProgressValue>
        </Progress>
        <div className="flex flex-col gap-3">
          {missions.map((mission) => (
            <div
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-3.5 py-3",
                mission.checked
                  ? "border-primary-100 bg-primary-50/75"
                  : "border-secondary-200 bg-white/80",
              )}
              key={mission.label}
            >
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  mission.checked
                    ? "border-primary-700 bg-primary-700 text-white"
                    : "border-secondary-200 bg-white text-secondary-400",
                )}
              >
                <CheckCircle2 className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-secondary-900">
                  {mission.label}
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-secondary-500">
                {mission.reward}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="mt-auto px-7 pb-7">
        <Button className="w-full" size="sm" variant="brand">
          Kerjakan misi berikutnya
          <ChevronRight data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}

function BeginnerState() {
  return (
    <Alert className="rounded-[28px] border-primary-100 bg-white px-5 py-4 shadow-sm">
      <Target />
      <AlertTitle>Lengkapi target agar dashboard makin personal.</AlertTitle>
      <AlertDescription className="mt-2 flex flex-col gap-3 text-secondary-600 md:flex-row md:items-center md:justify-between">
        <span>
          Pilih kampus, jurusan, dan jadwal exam untuk membuka rekomendasi
          belajar yang lebih presisi.
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="brand">
            Pasang target
          </Button>
          <Button size="sm" variant="brandOutline">
            Mulai modul pertama
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function ContinueLearningCard() {
  return (
    <Card className="h-full rounded-[30px] border border-primary-100 shadow-[0_20px_72px_-56px_rgba(1,76,56,0.28)]">
      <CardHeader className="gap-2 px-7 pt-7 md:px-8">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="size-4 text-primary-700" />
          Continue Learning
        </CardTitle>
        <CardAction>
          <Button size="sm" variant="ghost">
            Detail
            <ChevronRight data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-6 px-7 md:px-8">
        <div className="rounded-[26px] border border-primary-100 bg-primary-50/72 p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-primary-700 uppercase">
                Materi Runtun
              </p>
              <h2 className="mt-3 max-w-[26ch] text-xl leading-snug font-semibold text-secondary-900 md:text-2xl">
                Penalaran Umum: Struktur Argumen
              </h2>
            </div>
            <span className="inline-flex rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold leading-none text-secondary-700">
              18 menit lagi
            </span>
          </div>
          <Progress className="mt-6 gap-2" value={64}>
            <ProgressLabel className="text-sm font-medium">
              Progress modul
            </ProgressLabel>
            <ProgressValue className="text-xs text-secondary-500">
              {() => "64%"}
            </ProgressValue>
          </Progress>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label="Subtest" value="PU" />
          <MiniStat label="Lesson" value="4 / 7" />
          <MiniStat label="Quiz readiness" value="Siap" />
        </div>
      </CardContent>
      <CardFooter className="mt-auto gap-3 px-7 pb-7 md:px-8">
        <Button className="flex-1" size="sm" variant="brand">
          <BookOpen data-icon="inline-start" />
          Lanjut belajar
        </Button>
        <Button size="sm" variant="brandOutline">
          <Bot data-icon="inline-start" />
          Tanya Vera
        </Button>
      </CardFooter>
    </Card>
  );
}

function ProgressOverview() {
  return (
    <Card className="rounded-[30px] border border-primary-100 shadow-[0_20px_72px_-56px_rgba(1,76,56,0.24)]">
      <CardHeader className="gap-2 px-7 pt-7 md:px-8">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Target className="size-4 text-primary-700" />
          Progress Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-7 px-7 md:px-8">
        <div className="grid gap-4 md:grid-cols-5">
          <MiniStat label="Modules" value="18/32" />
          <MiniStat label="Tryout" value="676" />
          <MiniStat label="Quiz avg" value="78%" />
          <MiniStat label="Streak" value="12 hari" />
          <MiniStat label="Weakest" value="PK" />
        </div>
        <Tabs defaultValue="activity">
          <TabsList className="grid w-full max-w-[430px] grid-cols-3 rounded-2xl bg-primary-50 p-1">
            <TabsTrigger value="activity">Aktivitas</TabsTrigger>
            <TabsTrigger value="score">Tryout</TabsTrigger>
            <TabsTrigger value="mastery">Mastery</TabsTrigger>
          </TabsList>
          <TabsContent
            className="mt-7 rounded-[26px] border border-primary-100 bg-white/70 p-5 md:p-6"
            value="activity"
          >
            <ChartContainer
              className="h-[300px] w-full"
              config={activityChartConfig}
            >
              <BarChart data={studyActivity}>
                <CartesianGrid vertical={false} />
                <XAxis axisLine={false} dataKey="day" tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="minutes"
                  fill="var(--color-minutes)"
                  radius={[12, 12, 6, 6]}
                />
              </BarChart>
            </ChartContainer>
          </TabsContent>
          <TabsContent
            className="mt-7 rounded-[26px] border border-primary-100 bg-white/70 p-5 md:p-6"
            value="score"
          >
            <ChartContainer
              className="h-[300px] w-full"
              config={scoreChartConfig}
            >
              <AreaChart data={scoreTrend}>
                <CartesianGrid vertical={false} />
                <XAxis axisLine={false} dataKey="label" tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="score"
                  fill="var(--color-score)"
                  fillOpacity={0.18}
                  stroke="var(--color-score)"
                  strokeWidth={3}
                  type="monotone"
                />
              </AreaChart>
            </ChartContainer>
          </TabsContent>
          <TabsContent
            className="mt-7 rounded-[26px] border border-primary-100 bg-white/70 p-5 md:p-6"
            value="mastery"
          >
            <ChartContainer
              className="h-[300px] w-full"
              config={radarChartConfig}
            >
              <RadarChart data={masteryRadar}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Radar
                  dataKey="value"
                  fill="var(--color-value)"
                  fillOpacity={0.22}
                  stroke="var(--color-value)"
                  strokeWidth={2}
                />
              </RadarChart>
            </ChartContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function FocusRecommendation() {
  return (
    <Card className="overflow-hidden rounded-[30px] border border-primary-100 shadow-[0_22px_78px_-58px_rgba(1,76,56,0.32)]">
      <CardHeader className="gap-2 px-7 pt-7 md:px-8">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-primary-800">
          <Bot className="size-4 text-primary-700" />
          Vera AI Recommendation
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 px-7 md:px-8 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,1.08fr)]">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
          {weakTopics.map((topic) => (
            <div
              className="rounded-[24px] border border-primary-100 bg-white/86 p-5"
              key={topic.title}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-secondary-900">
                    {topic.title}
                  </p>
                  <p className="mt-1.5 max-w-[42ch] text-sm leading-6 text-secondary-500">
                    {topic.description}
                  </p>
                </div>
                <span className="inline-flex rounded-full bg-primary-200 px-2.5 py-1 text-[11px] font-semibold leading-none text-secondary-900">
                  {topic.mastery}%
                </span>
              </div>
              <Progress className="mt-4 gap-2" value={topic.mastery}>
                <ProgressLabel className="truncate text-xs text-secondary-600">
                  {topic.module}
                </ProgressLabel>
                <span className="ml-auto text-xs text-muted-foreground">
                  Mastery
                </span>
              </Progress>
            </div>
          ))}
        </div>

        <div className="flex flex-col rounded-[28px] border border-primary-800/20 bg-[#014C38] p-6 text-white md:p-7">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-white/56 uppercase">
              Vera AI
            </p>
            <p className="mt-4 max-w-[58ch] text-base leading-8 font-medium text-white/92 md:text-[17px]">
              Bagian yang paling perlu diperbaiki saat ini adalah Penalaran Umum
              dan PK. Mulai dari review Struktur Argumen, lalu lanjutkan drill
              rasio supaya akurasi naik tanpa mengorbankan waktu pengerjaan.
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-3 pt-8">
            <Button size="sm" variant="inverseOutline">
              Open Vera AI
              <MessageCircle data-icon="inline-end" />
            </Button>
            <Button
              className="bg-[#F5C518] text-secondary-900 hover:bg-[#F5C518]/90"
              size="sm"
              variant="default"
            >
              Review materi
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivity() {
  return (
    <Card
      size="sm"
      className="rounded-[28px] border border-primary-100 bg-white/92 shadow-[0_16px_56px_-52px_rgba(1,76,56,0.22)]"
    >
      <CardHeader className="gap-2 px-7 pt-7">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Home className="size-4 text-primary-700" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-7">
        {recentActivities.map((activity, index) => (
          <div className="flex gap-3" key={activity.title}>
            <div className="flex flex-col items-center">
              <div className="flex size-8 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <activity.icon className="size-4" />
              </div>
              {index < recentActivities.length - 1 ? (
                <div className="mt-2 h-full w-px bg-primary-100" />
              ) : null}
            </div>
            <div className="min-w-0 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-secondary-900">
                  {activity.title}
                </p>
                <span className="text-xs text-secondary-400">
                  {activity.time}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-secondary-500">
                {activity.detail}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-white/86 p-3.5 shadow-sm">
      <p className="text-xs text-secondary-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-secondary-900">{value}</p>
    </div>
  );
}

export { DashboardPageModule };

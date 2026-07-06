"use client";

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Filter,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/modules/student/components/stat-tile";
import { cn } from "@/lib/utils";
import { MentorInterventionComposer } from "@/modules/mentor/components/mentor-intervention-composer";
import { MentorStudentDetail } from "@/modules/mentor/components/mentor-student-detail";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { mentorDashboardMockData } from "@/modules/mentor/mock-data";
import type {
  MentorOverviewStat,
  MentorRiskLegendItem,
  MentorRiskTone,
  MentorRosterStudent,
  MentorStatusFilterKey,
  MentorSubtestFilter,
  MentorSubtestKey,
} from "@/modules/mentor/mock-data";

type MentorDashboardMode =
  | "ready"
  | "empty-cohort"
  | "no-selection"
  | "analytics-unavailable"
  | "no-risk";

const riskToneClasses: Record<MentorRiskTone, string> = {
  high: "border-[#f4d7d1] bg-[#fff7f5] text-[#9c2f22]",
  low: "border-primary-100 bg-primary-50 text-primary-800",
  medium: "border-[#f4e9bf] bg-[#fffdf0] text-[#856300]",
};

const trendToneClasses: Record<MentorRosterStudent["scoreTrendTone"], string> = {
  down: "border-[#f4d7d1] bg-[#fff7f5] text-[#9c2f22]",
  flat: "border-primary-100 bg-white text-secondary-700",
  up: "border-primary-100 bg-primary-50 text-primary-800",
};

const filterToneClasses: Record<MentorStatusFilterKey, string> = {
  all: "border-primary-200 bg-white text-secondary-900",
  "at-risk": "border-[#f4d7d1] bg-[#fff7f5] text-[#9c2f22]",
  "broken-streak": "border-[#f4e9bf] bg-[#fffdf0] text-[#856300]",
  "low-mastery": "border-primary-100 bg-primary-50 text-primary-800",
};

const subtestToneClasses: Record<MentorSubtestKey, string> = {
  all: "border-primary-200 bg-white text-secondary-900",
  Literasi: "border-primary-100 bg-primary-50 text-primary-800",
  Kuantitatif: "border-primary-100 bg-white text-secondary-700",
  Penalaran: "border-primary-100 bg-white text-secondary-700",
};

function countStudents(
  students: MentorRosterStudent[],
  predicate: (student: MentorRosterStudent) => boolean,
) {
  return students.filter(predicate).length;
}

function cloneStudentWithoutRisk(student: MentorRosterStudent): MentorRosterStudent {
  return {
    ...student,
    isAtRisk: false,
    isBrokenStreak: false,
    isLowMastery: false,
    riskLabel: "Stabil",
    riskTone: "low",
  };
}

function buildOverviewStats(
  students: MentorRosterStudent[],
): MentorOverviewStat[] {
  return [
    {
      label: "Total siswa",
      value: String(students.length),
    },
    {
      label: "At-risk",
      value: String(countStudents(students, (student) => student.isAtRisk)),
    },
    {
      label: "Broken streak",
      value: String(countStudents(students, (student) => student.isBrokenStreak)),
    },
    {
      label: "Score drop",
      value: String(countStudents(students, (student) => student.scoreTrendTone === "down")),
    },
  ];
}

function buildSubtestFilters(
  students: MentorRosterStudent[],
): MentorSubtestFilter[] {
  return [
    {
      key: "all",
      label: "Semua subtest",
      count: students.length,
    },
    {
      key: "Literasi",
      label: "Literasi",
      count: countStudents(students, (student) => student.subtest === "Literasi"),
    },
    {
      key: "Kuantitatif",
      label: "Kuantitatif",
      count: countStudents(students, (student) => student.subtest === "Kuantitatif"),
    },
    {
      key: "Penalaran",
      label: "Penalaran",
      count: countStudents(students, (student) => student.subtest === "Penalaran"),
    },
  ];
}

function buildRiskLegend(
  mode: MentorDashboardMode,
): MentorRiskLegendItem[] {
  if (mode === "no-risk") {
    return [
      {
        detail: "Tidak ada siswa yang masuk prioritas saat ini. Cohort ini bisa dipantau tanpa intervensi mendesak.",
        tone: "low",
        title: "Semua stabil",
      },
    ];
  }

  return [
    {
      detail: "Butuh tindak lanjut paling cepat. Warna dipakai hemat agar tidak terasa ramai.",
      tone: "high",
      title: "At risk",
    },
    {
      detail: "Menandakan ritme belajar putus atau absen beruntun.",
      tone: "medium",
      title: "Broken streak",
    },
    {
      detail: "Perlu penguatan pada subtest inti, tetapi belum darurat.",
      tone: "low",
      title: "Low mastery",
    },
  ];
}

function buildDashboardState(mode: MentorDashboardMode) {
  const base = mentorDashboardMockData;
  const isEmptyCohort = mode === "empty-cohort";
  const isAnalyticsUnavailable = mode === "analytics-unavailable";
  const isNoRisk = mode === "no-risk";

  const students = isEmptyCohort
    ? []
    : isNoRisk
      ? base.students.map(cloneStudentWithoutRisk)
      : base.students;

  const cohort = {
    ...base.cohort,
    cachedLabel: isAnalyticsUnavailable ? "Snapshot tersimpan" : base.cohort.cachedLabel,
    name: isEmptyCohort ? "Belum ada cohort aktif" : base.cohort.name,
    refreshedAt: isAnalyticsUnavailable ? "Analitik tidak tersedia" : base.cohort.refreshedAt,
  };

  const mentor = base.mentor;
  const overviewStats = buildOverviewStats(students);
  const statusFilters = base.statusFilters.map((filter) => ({
    ...filter,
    count:
      filter.key === "all"
        ? students.length
        : filter.key === "at-risk"
          ? countStudents(students, (student) => student.isAtRisk)
          : filter.key === "broken-streak"
            ? countStudents(students, (student) => student.isBrokenStreak)
            : countStudents(students, (student) => student.isLowMastery),
  }));
  const subtestFilters = buildSubtestFilters(students);
  const riskLegend = buildRiskLegend(mode);

  return {
    cohort,
    isAnalyticsUnavailable,
    isEmptyCohort,
    isNoRisk,
    mentor,
    notificationItems: base.notificationItems,
    overviewStats,
    riskLegend,
    statusFilters,
    students,
    subtestFilters,
  };
}

function StateBanner({
  description,
  label,
  tone,
}: {
  description: string;
  label: string;
  tone: "neutral" | "warning" | "success";
}) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: "border-primary-100 bg-white text-secondary-600",
    success: "border-primary-100 bg-primary-50 text-primary-800",
    warning: "border-[#ead9a5] bg-[#fffdf1] text-[#856300]",
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-3xl border px-4 py-4 md:flex-row md:items-center md:justify-between",
        toneClasses[tone],
      )}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-sm leading-6 opacity-90">{description}</p>
    </div>
  );
}

function EmptyRosterState({ title, description }: { description: string; title: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-primary-100 bg-[#fcfdfc] px-4 py-5 text-sm leading-6 text-secondary-500">
      <p className="text-base font-semibold text-secondary-900">{title}</p>
      <p className="mt-2">{description}</p>
    </div>
  );
}

function MentorDashboardPageModule({
  mode = "ready",
}: {
  mode?: MentorDashboardMode;
}) {
  const {
    cohort,
    isAnalyticsUnavailable,
    isEmptyCohort,
    isNoRisk,
    mentor,
    notificationItems,
    overviewStats,
    riskLegend,
    statusFilters,
    students,
    subtestFilters,
  } = buildDashboardState(mode);

  const [activeFilter, setActiveFilter] = useState<MentorStatusFilterKey>("all");
  const [activeSubtest, setActiveSubtest] = useState<MentorSubtestKey>("all");
  const [selectedStudentId, setSelectedStudentId] = useState(
    mode === "no-selection"
      ? ""
      : students.find((student) => student.selected)?.id ?? students[0]?.id ?? "",
  );

  const visibleStudents = students.filter((student) => {
    const matchesStatus =
      activeFilter === "all" ||
      (activeFilter === "at-risk" && student.isAtRisk) ||
      (activeFilter === "broken-streak" && student.isBrokenStreak) ||
      (activeFilter === "low-mastery" && student.isLowMastery);

    const matchesSubtest = activeSubtest === "all" || student.subtest === activeSubtest;

    return matchesStatus && matchesSubtest;
  });

  const selectedStudent =
    selectedStudentId && !isEmptyCohort && visibleStudents.length > 0
      ? visibleStudents.find((student) => student.id === selectedStudentId) ??
        visibleStudents[0] ??
        students.find((student) => student.id === selectedStudentId) ??
        null
      : null;

  const atRiskStudents = countStudents(students, (student) => student.isAtRisk);
  const brokenStreakStudents = countStudents(students, (student) => student.isBrokenStreak);
  const scoreDropStudents = countStudents(students, (student) => student.scoreTrendTone === "down");
  const urgentStudents = students.filter(
    (student) => student.isAtRisk || student.isBrokenStreak || student.isLowMastery,
  );

  const showEmptyCohort = isEmptyCohort;
  const showNoRiskState = isNoRisk && !isEmptyCohort;
  const rosterEmptyByFilter = !showEmptyCohort && visibleStudents.length === 0;

  return (
    <MentorWorkspaceShell
      activeLabel="Dashboard"
      breadcrumbLabel="Dashboard Kapten"
      cohortLabel={cohort.name}
      mentorEmail={mentor.email}
      mentorName={mentor.fullName}
      notificationItems={notificationItems}
      searchPlaceholder="Cari siswa, subtest, atau sinyal risiko..."
      sidebarFooterLabel={cohort.workspaceLabel}
    >
      <section id="overview" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex h-9 items-center rounded-full border border-primary-100 bg-white px-4 text-xs font-semibold uppercase tracking-[0.22em] text-secondary-500 shadow-sm">
              Kapten Overview
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl leading-tight font-semibold tracking-[-0.03em] text-secondary-900 md:text-5xl">
                Dashboard Kapten
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-secondary-600 md:text-base">
                Lapisan ringkasan ini dirancang untuk scan cohort dalam hitungan
                detik, menyorot siswa yang butuh sentuhan pertama, dan menjaga
                tampilan tetap tenang.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center rounded-full border border-primary-100 bg-primary-50 px-4 text-sm font-medium text-primary-800">
              {cohort.cachedLabel}
            </span>
            <span className="inline-flex h-9 items-center rounded-full border border-primary-100 bg-white px-4 text-sm font-medium text-secondary-700">
              {cohort.refreshedAt}
            </span>
            <span className="inline-flex h-9 items-center rounded-full border border-primary-100 bg-white px-4 text-sm font-medium text-secondary-700">
              {cohort.name}
            </span>
          </div>
        </div>

        {isAnalyticsUnavailable ? (
          <StateBanner
            label="Analitik sedang tidak tersedia"
            description="Data cached tetap terlihat, tetapi composer intervensi dikunci sampai sinkronisasi pulih."
            tone="warning"
          />
        ) : null}

        {showEmptyCohort ? (
          <StateBanner
            label="Belum ada cohort aktif"
            description="Masuknya data siswa belum tersedia, jadi dashboard menunggu roster pertama sebelum menampilkan triase."
            tone="neutral"
          />
        ) : null}

        {showNoRiskState ? (
          <StateBanner
            label="Tidak ada siswa yang masuk prioritas"
            description="Cohort ini sedang stabil, jadi detail risiko bisa tetap dipantau tanpa intervensi mendesak."
            tone="success"
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overviewStats.map((metric) => (
            <StatTile key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
        <Card id="students" className="border border-primary-100 bg-white shadow-sm">
          <CardHeader className="gap-3 pb-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-xl text-secondary-900">
                  Ranked student roster
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6">
                  Gunakan filter ringkas untuk memindai cohort, lalu buka siswa
                  yang paling butuh perhatian.
                </CardDescription>
              </div>

              <div className="inline-flex h-9 items-center rounded-full border border-primary-100 bg-primary-50 px-3 text-sm font-medium text-primary-800">
                {visibleStudents.length} siswa terlihat
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 pt-6">
            {showEmptyCohort ? (
              <EmptyRosterState
                title="Roster belum tersedia"
                description="Setelah cohort aktif tersinkron, daftar siswa akan muncul di sini lengkap dengan ranking dan filter risiko."
              />
            ) : (
              <>
                <div
                  id="filters"
                  className="space-y-4 rounded-3xl border border-primary-100 bg-[#fcfdfc] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex h-9 items-center gap-2 rounded-full border border-primary-100 bg-white px-3 text-xs font-semibold uppercase tracking-[0.18em] text-secondary-500">
                      <Filter className="size-3.5" />
                      Filter cepat
                    </div>

                    {statusFilters.map((filter) => (
                      <Button
                        key={filter.key}
                        aria-pressed={activeFilter === filter.key}
                        className={cn(
                          "h-9 rounded-full px-3 text-sm shadow-none",
                          filterToneClasses[filter.key],
                          activeFilter === filter.key
                            ? "ring-1 ring-[#f5c518]/20"
                            : "opacity-75 hover:opacity-100",
                        )}
                        onClick={() => setActiveFilter(filter.key)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <span>{filter.label}</span>
                        <span className="text-xs opacity-70">{filter.count}</span>
                      </Button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-8 items-center rounded-full border border-primary-100 bg-white px-3 text-xs font-semibold uppercase tracking-[0.18em] text-secondary-500">
                      Subtest
                    </span>

                    {subtestFilters.map((filter) => (
                      <Button
                        key={filter.key}
                        aria-pressed={activeSubtest === filter.key}
                        className={cn(
                          "h-9 rounded-full px-3 text-sm shadow-none",
                          subtestToneClasses[filter.key],
                          activeSubtest === filter.key
                            ? "ring-1 ring-[#f5c518]/20"
                            : "opacity-75 hover:opacity-100",
                        )}
                        onClick={() => setActiveSubtest(filter.key)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <span>{filter.label}</span>
                        <span className="text-xs opacity-70">{filter.count}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                {rosterEmptyByFilter ? (
                  <EmptyRosterState
                    title="Tidak ada siswa cocok dengan filter ini"
                    description="Coba ganti status atau subtest agar roster menampilkan siswa yang relevan."
                  />
                ) : (
                  <div className="space-y-3">
                    {visibleStudents.map((student) => {
                      const isSelected = student.id === selectedStudent?.id;

                      return (
                        <button
                          key={student.id}
                          aria-pressed={isSelected}
                          className={cn(
                            "flex w-full flex-col gap-4 rounded-3xl border px-4 py-4 text-left shadow-sm transition-all duration-200 md:flex-row md:items-start",
                            isSelected
                              ? "border-[#ead9a5] bg-[#fffdf1] ring-1 ring-[#f5c518]/20"
                              : "border-primary-100 bg-white hover:border-primary-200 hover:bg-primary-50/40",
                          )}
                          type="button"
                          onClick={() => setSelectedStudentId(student.id)}
                        >
                          <div className="flex items-center gap-3 md:flex-col md:items-center md:gap-2 md:pt-0.5">
                            <div className="flex size-11 items-center justify-center rounded-2xl border border-primary-100 bg-white text-xs font-semibold text-secondary-500">
                              {student.rank}
                            </div>
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary-100 bg-primary-700 text-sm font-semibold text-white">
                              {student.initials}
                            </div>
                          </div>

                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-secondary-900">
                                {student.name}
                              </p>
                              <span
                                className={cn(
                                  "inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium",
                                  riskToneClasses[student.riskTone],
                                )}
                              >
                                {student.riskLabel}
                              </span>
                              {isSelected ? (
                                <span className="inline-flex h-6 items-center rounded-full border border-[#ead9a5] bg-white px-2 text-xs font-medium text-[#856300]">
                                  Aktif
                                </span>
                              ) : null}
                            </div>

                            <p className="text-sm text-secondary-600">
                              {student.className} · {student.subtest} · {student.latestScoreLabel}{" "}
                              {student.latestScore}
                            </p>

                            <div className="flex flex-wrap gap-2">
                              <span
                                className={cn(
                                  "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium",
                                  trendToneClasses[student.scoreTrendTone],
                                )}
                              >
                                {student.scoreTrendTone === "down" ? (
                                  <ArrowDownRight className="size-3.5" />
                                ) : student.scoreTrendTone === "up" ? (
                                  <ArrowUpRight className="size-3.5" />
                                ) : (
                                  <Target className="size-3.5" />
                                )}
                                {student.scoreTrend}
                              </span>
                              <span className="inline-flex h-7 items-center rounded-full border border-primary-100 bg-white px-3 text-xs font-medium text-secondary-600">
                                {student.streakState}
                              </span>
                              <span className="inline-flex h-7 items-center rounded-full border border-primary-100 bg-primary-50 px-3 text-xs font-medium text-primary-800">
                                Weak: {student.weakSubtest}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 md:ml-auto md:flex-col md:items-end md:justify-start md:pt-0.5 md:text-right">
                            <p className="text-xs uppercase tracking-[0.2em] text-secondary-500">
                              Select
                            </p>
                            <div className="inline-flex items-center gap-1 text-sm font-medium text-secondary-700">
                              <span>{isSelected ? "Sedang dibuka" : "Pilih"}</span>
                              <ChevronRight className="size-4" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div id="signals" className="grid gap-4">
          <MentorStudentDetail
            analyticsUnavailable={isAnalyticsUnavailable}
            fallbackLabel="Snapshot tersimpan"
            fallbackMessage="Analitik tidak bisa di-refresh saat ini, jadi panel ini menampilkan data cached terbaru yang masih aman untuk dipakai triase."
            student={selectedStudent}
          />

          <MentorInterventionComposer
            disabled={isAnalyticsUnavailable || !selectedStudent}
            disabledReason={
              isAnalyticsUnavailable
                ? "Composer dibekukan sampai analitik kembali tersedia."
                : !selectedStudent
                  ? "Pilih satu siswa untuk mulai menulis intervensi."
                  : undefined
            }
            key={selectedStudent?.id ?? "empty"}
            student={selectedStudent}
          />

          <Card className="border border-primary-100 bg-white shadow-sm">
            <CardHeader className="gap-2">
              <CardTitle className="text-lg text-secondary-900">
                At-risk visual system
              </CardTitle>
              <CardDescription className="text-sm leading-6">
                Gold dipakai untuk perhatian, merah untuk risiko lebih tinggi,
                dan hijau tetap diredam supaya list terasa tenang.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              {showNoRiskState ? (
                <div className="rounded-3xl border border-primary-100 bg-primary-50/50 px-4 py-4 text-sm leading-6 text-primary-800">
                  Tidak ada siswa yang perlu sentuhan prioritas. Sinyal ini tetap
                  tersimpan untuk review berikutnya.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {riskLegend.map((item) => (
                    <div
                      key={item.title}
                      className={cn(
                        "rounded-3xl border p-4 shadow-sm",
                        riskToneClasses[item.tone],
                      )}
                    >
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 opacity-90">{item.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-3 rounded-3xl border border-primary-100 bg-[#fcfdfc] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-secondary-500">
                      Snapshot cepat
                    </p>
                    <p className="mt-1 text-sm font-semibold text-secondary-900">
                      {atRiskStudents} siswa berada di jalur perhatian
                    </p>
                  </div>
                  <span className="inline-flex h-8 items-center rounded-full border border-primary-100 bg-white px-3 text-sm font-medium text-secondary-700">
                    {cohort.refreshedAt}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                    <p className="text-xs text-secondary-500">At risk</p>
                    <p className="mt-1 text-lg font-semibold text-secondary-900">
                      {atRiskStudents}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                    <p className="text-xs text-secondary-500">Broken streak</p>
                    <p className="mt-1 text-lg font-semibold text-secondary-900">
                      {brokenStreakStudents}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                    <p className="text-xs text-secondary-500">Score drop</p>
                    <p className="mt-1 text-lg font-semibold text-secondary-900">
                      {scoreDropStudents}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-primary-100 bg-white shadow-sm">
            <CardHeader className="gap-2">
              <CardTitle className="text-lg text-secondary-900">
                Siswa yang paling perlu sentuhan
              </CardTitle>
              <CardDescription className="text-sm leading-6">
                Daftar ini dibuat untuk fokus pertama, bukan detail penuh.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 pt-0">
              {showEmptyCohort ? (
                <EmptyRosterState
                  title="Belum ada siswa untuk disorot"
                  description="Begitu cohort aktif, daftar prioritas akan muncul di sini."
                />
              ) : urgentStudents.length > 0 ? (
                urgentStudents.slice(0, 3).map((student) => (
                  <div
                    key={student.id}
                    className="flex items-start justify-between gap-3 rounded-3xl border border-primary-100 bg-[#fcfdfc] px-4 py-4 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-secondary-900">
                        {student.name}
                      </p>
                      <p className="mt-1 text-sm text-secondary-600">
                        {student.className} · {student.subtest}
                      </p>
                      <p className="mt-2 text-sm text-secondary-500">
                        {student.weakSubtest} · {student.streakState}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={cn(
                          "inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium",
                          riskToneClasses[student.riskTone],
                        )}
                      >
                        {student.riskLabel}
                      </span>
                      <p className="mt-3 text-sm font-semibold text-secondary-900">
                        {student.latestScore}
                      </p>
                      <p className="mt-1 text-xs text-secondary-500">
                        {student.scoreTrend}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyRosterState
                  title="Tidak ada siswa yang perlu sentuhan"
                  description="Cohort ini stabil, jadi daftar prioritas tetap kosong sampai ada sinyal baru."
                />
              )}

              <div className="rounded-3xl border border-dashed border-primary-100 bg-white px-4 py-4 text-sm leading-6 text-secondary-500">
                Detail siswa aktif dan composer intervensi sekarang sudah
                langsung terbuka di atas lapisan sinyal.
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section
        id="settings"
        className="rounded-3xl border border-dashed border-primary-100 bg-white/70 px-5 py-4 text-sm text-secondary-500 shadow-sm"
      >
        {isAnalyticsUnavailable
          ? "Analitik tidak tersedia, jadi dashboard ini tetap memakai snapshot cached sampai koneksi data pulih."
          : "Panel detail dan composer masih mock data, sementara wiring backend dan notifikasi nyata menyusul di tahap berikutnya."}
      </section>
    </MentorWorkspaceShell>
  );
}

function MentorDashboardLoadingState() {
  return (
    <main className="min-h-svh bg-[#f7faf8] text-secondary-900">
      <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-8 w-40 rounded-full" />
            <Skeleton className="h-12 w-[360px] max-w-full rounded-2xl" />
            <Skeleton className="h-5 w-[520px] max-w-full rounded-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="border border-primary-100 bg-white shadow-sm">
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-3 w-20 rounded-full" />
                <Skeleton className="h-8 w-16 rounded-2xl" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
          <Card className="border border-primary-100 bg-white shadow-sm">
            <CardHeader className="gap-3 pb-0">
              <Skeleton className="h-6 w-56 rounded-full" />
              <Skeleton className="h-5 w-[420px] max-w-full rounded-full" />
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <Skeleton className="h-24 rounded-3xl" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 rounded-3xl" />
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card className="border border-primary-100 bg-white shadow-sm">
              <CardHeader className="gap-3 pb-0">
                <Skeleton className="h-6 w-48 rounded-full" />
                <Skeleton className="h-5 w-[340px] max-w-full rounded-full" />
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <Skeleton className="h-40 rounded-3xl" />
                <div className="grid gap-3 lg:grid-cols-3">
                  <Skeleton className="h-32 rounded-3xl" />
                  <Skeleton className="h-32 rounded-3xl" />
                  <Skeleton className="h-32 rounded-3xl" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-primary-100 bg-white shadow-sm">
              <CardHeader className="gap-2">
                <Skeleton className="h-6 w-48 rounded-full" />
                <Skeleton className="h-5 w-[300px] max-w-full rounded-full" />
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <Skeleton className="h-28 rounded-3xl" />
                <Skeleton className="h-28 rounded-3xl" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

export { MentorDashboardLoadingState, MentorDashboardPageModule };

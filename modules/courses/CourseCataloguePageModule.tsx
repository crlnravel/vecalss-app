"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Filter,
  PlayCircle,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress, ProgressValue } from "@/components/ui/progress";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import {
  courseCatalogue,
  getCourseStats,
  type Course,
  type CourseDifficulty,
  type CourseProgressStatus,
} from "./data";

const allCategories = [
  "All categories",
  ...Array.from(new Set(courseCatalogue.map((course) => course.category))),
];

const difficulties: Array<CourseDifficulty | "All levels"> = [
  "All levels",
  "Beginner",
  "Intermediate",
  "Advanced",
];

const progressStatuses: Array<CourseProgressStatus | "All progress"> = [
  "All progress",
  "Not started",
  "In progress",
  "Completed",
];

type SortMode = "Newest" | "Popular" | "Progress";

function CourseCataloguePageModule({ session }: { session: SessionContext }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [difficulty, setDifficulty] =
    useState<(typeof difficulties)[number]>("All levels");
  const [progressStatus, setProgressStatus] =
    useState<(typeof progressStatuses)[number]>("All progress");
  const [sortMode, setSortMode] = useState<SortMode>("Newest");

  const visibleCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = courseCatalogue.filter((course) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [course.title, course.description, course.category]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesCategory =
        category === "All categories" || course.category === category;
      const matchesDifficulty =
        difficulty === "All levels" || course.difficulty === difficulty;
      const matchesProgress =
        progressStatus === "All progress" || course.status === progressStatus;

      return (
        matchesQuery &&
        matchesCategory &&
        matchesDifficulty &&
        matchesProgress
      );
    });

    return [...filtered].sort((first, second) => {
      if (sortMode === "Progress") {
        return second.progress - first.progress;
      }

      if (sortMode === "Popular") {
        return getCourseStats(second).totalVideos - getCourseStats(first).totalVideos;
      }

      return courseCatalogue.indexOf(first) - courseCatalogue.indexOf(second);
    });
  }, [category, difficulty, progressStatus, query, sortMode]);

  const totalVideos = courseCatalogue.reduce(
    (sum, course) => sum + getCourseStats(course).totalVideos,
    0,
  );
  const startedCourses = courseCatalogue.filter(
    (course) => course.status === "In progress",
  ).length;

  return (
    <CourseWorkspaceShell
      activeLabel="Course Catalogue"
      breadcrumbLabel="Course Catalogue"
      session={session}
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="relative overflow-hidden rounded-[30px] border border-primary-100 bg-[linear-gradient(125deg,#ecfbf9_0%,#ffffff_56%,#fff3bc_100%)] shadow-[0_28px_90px_-60px_rgba(1,76,56,0.44)]">
          <CardHeader className="gap-5 px-6 py-7 md:px-8 md:py-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-primary-700 uppercase">
                  Learning Library
                </p>
                <CardTitle className="mt-3 max-w-3xl text-[32px] leading-tight font-semibold text-secondary-900 md:text-[42px]">
                  Course Catalogue
                </CardTitle>
                <CardDescription className="mt-4 max-w-[64ch] text-[15px] leading-7 text-secondary-600 md:text-base">
                  Browse focused SNBT courses, continue your current modules,
                  and open structured video tutorials grouped by section.
                </CardDescription>
              </div>
              <Button
                className="rounded-full"
                render={
                  <Link href="/dashboard">
                    Dashboard
                    <ChevronRight data-icon="inline-end" />
                  </Link>
                }
                variant="brand"
              />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 px-6 pb-7 md:grid-cols-3 md:px-8">
            <CatalogueStat label="Courses" value={courseCatalogue.length} />
            <CatalogueStat label="Video tutorials" value={totalVideos} />
            <CatalogueStat label="In progress" value={startedCourses} />
          </CardContent>
        </Card>

        <Card className="rounded-[30px] border border-primary-100 bg-white shadow-[0_22px_72px_-58px_rgba(1,76,56,0.34)]">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-4 text-primary-700" />
              Next best step
            </CardTitle>
            <CardDescription className="leading-6">
              Continue the course with the most recent progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="rounded-[24px] border border-primary-100 bg-primary-50/75 p-4">
              <p className="text-sm font-semibold text-secondary-900">
                Penalaran Umum: Fondasi Argumen
              </p>
              <Progress className="mt-4 gap-2" value={64}>
                <ProgressValue className="ml-0 text-xs text-secondary-500">
                  {() => "64% complete"}
                </ProgressValue>
              </Progress>
              <Button
                className="mt-5 w-full"
                render={
                  <Link href="/courses/penalaran-umum-fondasi">
                    Resume course
                    <PlayCircle data-icon="inline-end" />
                  </Link>
                }
                size="sm"
                variant="brand"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-[30px] border border-primary-100 bg-white p-4 shadow-[0_18px_70px_-58px_rgba(1,76,56,0.35)] md:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_repeat(4,minmax(150px,180px))]">
          <label className="relative block">
            <span className="sr-only">Search courses</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-secondary-400" />
            <Input
              className="h-11 rounded-2xl border-primary-100 bg-primary-50/45 pl-10"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search courses..."
              value={query}
            />
          </label>
          <FilterSelect
            icon={Filter}
            label="Category"
            onChange={setCategory}
            options={allCategories}
            value={category}
          />
          <FilterSelect
            icon={Filter}
            label="Difficulty"
            onChange={(value) => setDifficulty(value as typeof difficulty)}
            options={difficulties}
            value={difficulty}
          />
          <FilterSelect
            icon={CheckCircle2}
            label="Progress"
            onChange={(value) => setProgressStatus(value as typeof progressStatus)}
            options={progressStatuses}
            value={progressStatus}
          />
          <FilterSelect
            icon={ArrowUpDown}
            label="Sort"
            onChange={(value) => setSortMode(value as SortMode)}
            options={["Newest", "Popular", "Progress"]}
            value={sortMode}
          />
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-secondary-900">
              Available courses
            </h2>
            <p className="mt-1 text-sm text-secondary-500">
              Showing {visibleCourses.length} of {courseCatalogue.length} courses
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleCourses.map((course) => (
            <CourseCard course={course} key={course.slug} />
          ))}
        </div>

        {visibleCourses.length === 0 ? (
          <Card className="mt-5 rounded-[28px] border border-primary-100 bg-white text-center shadow-sm">
            <CardContent className="px-6 py-10">
              <p className="text-base font-semibold text-secondary-900">
                No courses match your filters.
              </p>
              <p className="mt-2 text-sm text-secondary-500">
                Try a broader search or reset one of the filters above.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </CourseWorkspaceShell>
  );
}

function CatalogueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-white/80 bg-white/80 p-4 shadow-sm">
      <p className="text-2xl font-semibold text-primary-800">{value}</p>
      <p className="mt-1 text-xs font-semibold tracking-[0.12em] text-secondary-500 uppercase">
        {label}
      </p>
    </div>
  );
}

function FilterSelect({
  icon: Icon,
  label,
  onChange,
  options,
  value,
}: {
  icon: LucideIcon;
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary-400" />
      <select
        className="h-11 w-full appearance-none rounded-2xl border border-primary-100 bg-primary-50/45 px-10 text-sm font-medium text-secondary-800 outline-none transition-colors hover:bg-primary-50 focus:border-primary-400 focus:ring-3 focus:ring-primary-400/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CourseCard({ course }: { course: Course }) {
  const stats = getCourseStats(course);
  const Icon = course.icon;
  const hasProgress = course.status !== "Not started";

  return (
    <Link
      className="group block rounded-[28px] outline-none focus-visible:ring-3 focus-visible:ring-primary-400/25"
      href={`/courses/${course.slug}`}
    >
      <Card className="h-full rounded-[28px] border border-primary-100 bg-white py-0 shadow-[0_18px_60px_-52px_rgba(1,76,56,0.42)] transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary-300 group-hover:shadow-[0_26px_80px_-56px_rgba(1,76,56,0.48)]">
        <div
          className={cn(
            "relative m-3 mb-0 flex aspect-[1.52] items-center justify-center overflow-hidden rounded-[22px] border border-primary-100 bg-gradient-to-br",
            course.palette,
          )}
        >
          <div className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-secondary-700 shadow-sm">
            {stats.totalVideos} videos
          </div>
          <div className="flex size-16 items-center justify-center rounded-[22px] border border-primary-100 bg-white/86 text-primary-700 shadow-[0_18px_42px_-26px_rgba(1,76,56,0.45)]">
            <Icon className="size-7" />
          </div>
          <div className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-primary-700 text-white shadow-[0_14px_30px_-18px_rgba(1,76,56,0.5)]">
            <PlayCircle className="size-5" />
          </div>
        </div>

        <CardHeader className="gap-3 px-5 pt-5">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-800">
              {course.category}
            </span>
            <span className="rounded-full bg-secondary-100 px-2.5 py-1 text-[11px] font-semibold text-secondary-700">
              {course.difficulty}
            </span>
          </div>
          <div>
            <CardTitle className="line-clamp-2 text-lg leading-snug font-semibold text-secondary-900">
              {course.title}
            </CardTitle>
            <CardDescription className="mt-2 line-clamp-2 leading-6">
              {course.description}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-5 px-5 pb-5">
          <div className="grid grid-cols-3 gap-2">
            <CardMetric
              icon={BookOpen}
              label="Sections"
              value={stats.totalSections}
            />
            <CardMetric icon={PlayCircle} label="Videos" value={stats.totalVideos} />
            <CardMetric icon={Clock3} label="Duration" value={course.duration} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-secondary-600">
                {hasProgress ? course.status : "Not started"}
              </span>
              <span className="text-xs font-semibold text-primary-800">
                {course.progress}%
              </span>
            </div>
            <Progress value={course.progress} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CardMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-primary-50/55 p-3">
      <Icon className="size-3.5 text-primary-700" />
      <p className="mt-2 text-sm font-semibold text-secondary-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-secondary-500">{label}</p>
    </div>
  );
}

export { CourseCataloguePageModule };

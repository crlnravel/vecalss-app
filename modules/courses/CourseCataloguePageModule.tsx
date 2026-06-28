"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, PlayCircle, Search, Star } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import { courseCatalogue, getCourseStats, type Course } from "./data";

function CourseCataloguePageModule({ session }: { session: SessionContext }) {
  const [query, setQuery] = useState("");

  const visibleCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return courseCatalogue;
    }

    return courseCatalogue.filter((course) =>
      [course.code, course.title, course.description]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query]);

  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel="Materi"
      session={session}
    >
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[32px] leading-tight font-semibold text-secondary-900 md:text-[42px]">
              Materi
            </h1>
            <p className="mt-2 max-w-[56ch] text-sm leading-6 text-secondary-500 md:text-base">
              Pilih materi SNBT, lalu lanjutkan ke video pembelajaran yang sudah
              dikelompokkan per bagian.
            </p>
          </div>

          <label className="relative block w-full md:max-w-sm">
            <span className="sr-only">Cari materi</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-secondary-400" />
            <Input
              className="h-11 rounded-full border-primary-100 bg-white pl-10 shadow-sm"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari materi..."
              value={query}
            />
          </label>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleCourses.map((course, index) => (
            <CourseCard
              course={course}
              featured={index < 2}
              key={course.slug}
            />
          ))}
        </div>

        {visibleCourses.length === 0 ? (
          <div className="rounded-[28px] border border-primary-100 bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-base font-semibold text-secondary-900">
              Materi tidak ditemukan.
            </p>
            <p className="mt-2 text-sm text-secondary-500">
              Coba cari dengan kode seperti PU, PPU, PBM, PK, LBI, LBE, atau PM.
            </p>
          </div>
        ) : null}
      </section>
    </CourseWorkspaceShell>
  );
}

function CourseCard({
  course,
  featured,
}: {
  course: Course;
  featured: boolean;
}) {
  const stats = getCourseStats(course);
  const Icon = course.icon;
  const sizeClass = featured
    ? "min-h-[250px] md:min-h-[280px]"
    : "min-h-[220px] md:min-h-[250px]";

  return (
    <Link
      className={cn(
        "group relative flex overflow-hidden rounded-[34px] p-6 outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_70px_-50px_rgba(1,76,56,0.42)] focus-visible:ring-3 focus-visible:ring-primary-400/25 md:p-8",
        course.palette,
        sizeClass,
      )}
      href={`/courses/${course.slug}`}
    >
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="inline-flex items-center gap-2 text-sm font-semibold md:text-base">
            <Icon className="size-4" />
            <span>{course.code}</span>
          </div>
          <Star className="size-4 fill-current opacity-70" />
        </div>

        <div className="mt-auto">
          <h2
            className={cn(
              "max-w-[12ch] text-[30px] leading-[1.05] font-semibold md:text-[40px]",
              course.title.length > 24
                ? "max-w-[16ch] text-[28px] md:text-[34px]"
                : null,
            )}
          >
            {course.title}
          </h2>
          <p className="mt-4 line-clamp-2 max-w-[34ch] text-sm leading-6 opacity-82">
            {course.description}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" />
              {course.duration}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <PlayCircle className="size-4" />
              {stats.totalVideos} video
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-4" />
              {course.progress}%
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export { CourseCataloguePageModule };

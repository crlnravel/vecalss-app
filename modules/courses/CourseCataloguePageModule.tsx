"use client";

import { CheckCircle2, Clock3, PlayCircle } from "lucide-react";

import type { SessionContext } from "@/lib/auth/types";

import { CatalogueCard } from "./CatalogueCard";
import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import { courseCatalogue, getCourseStats, type Course } from "./data";

function CourseCataloguePageModule({ session }: { session: SessionContext }) {
  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel="Materi"
      session={session}
    >
      <section className="flex flex-col gap-5">
        <div>
          <div>
            <h1 className="text-[32px] leading-tight font-semibold text-secondary-900 md:text-[42px]">
              Materi
            </h1>
            <p className="mt-2 max-w-[56ch] text-sm leading-6 text-secondary-500 md:text-base">
              Cari materi yang ingin kamu pelajari di sini.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {courseCatalogue.map((course) => (
            <CourseCard course={course} key={course.slug} />
          ))}
        </div>
      </section>
    </CourseWorkspaceShell>
  );
}

function CourseCard({ course }: { course: Course }) {
  const stats = getCourseStats(course);

  return (
    <CatalogueCard
      code={course.code}
      description={course.description}
      href={`/courses/${course.slug}`}
      icon={course.icon}
      palette={course.palette}
      stats={[
        { icon: Clock3, label: "Durasi", value: course.duration },
        {
          icon: PlayCircle,
          label: "Video",
          value: `${stats.totalVideos} video`,
        },
        { icon: CheckCircle2, label: "Progress", value: `${course.progress}%` },
      ]}
      title={course.title}
    />
  );
}

export { CourseCataloguePageModule };

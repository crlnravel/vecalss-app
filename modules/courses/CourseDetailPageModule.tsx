import Link from "next/link";
import { ArrowLeft, BookOpen, Clock3, Lock, Play, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import { getCourseStats, type Course, type VideoTutorial } from "./data";

function CourseDetailPageModule({
  course,
  session,
}: {
  course: Course;
  session: SessionContext;
}) {
  const stats = getCourseStats(course);
  const Icon = course.icon;

  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={course.title}
      searchPlaceholder="Cari video di materi ini..."
      session={session}
    >
      <div>
        <Button
          render={
            <Link href="/courses">
              <ArrowLeft data-icon="inline-start" />
              Kembali ke materi
            </Link>
          }
          size="sm"
          variant="ghost"
        />
      </div>

      <section>
        <Card className="relative overflow-hidden rounded-[30px] border border-primary-100 bg-[linear-gradient(125deg,#ecfbf9_0%,#ffffff_56%,#fff3bc_100%)] shadow-[0_28px_90px_-60px_rgba(1,76,56,0.44)]">
          <CardHeader className="gap-6 px-6 py-7 md:px-8 md:py-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-primary-800 shadow-sm">
                    {course.code}
                  </span>
                  <span className="rounded-full bg-primary-700 px-3 py-1 text-xs font-semibold text-white">
                    {course.status}
                  </span>
                </div>
                <CardTitle className="mt-4 max-w-4xl text-[32px] leading-tight font-semibold text-secondary-900 md:text-[44px]">
                  {course.title}
                </CardTitle>
                <CardDescription className="mt-4 max-w-[68ch] text-[15px] leading-7 text-secondary-600 md:text-base">
                  {course.description}
                </CardDescription>
              </div>

              <div
                className={cn(
                  "flex h-40 w-40 shrink-0 items-center justify-center self-start rounded-[28px] border border-primary-100 shadow-[0_22px_60px_-42px_rgba(1,76,56,0.5)] md:h-52 md:w-52 md:self-auto",
                  course.palette,
                )}
              >
                <div className="flex size-20 items-center justify-center rounded-[28px] border border-primary-100 bg-white/86 text-primary-700 shadow-[0_18px_42px_-26px_rgba(1,76,56,0.45)]">
                  <Icon className="size-9" />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3 px-6 pb-7 sm:grid-cols-3 md:px-8">
            <DetailStat icon={BookOpen} label="Sections" value={stats.totalSections} />
            <DetailStat icon={PlayCircle} label="Videos" value={stats.totalVideos} />
            <DetailStat icon={Clock3} label="Duration" value={course.duration} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-8">
        {course.sections.map((section, sectionIndex) => (
          <div className="space-y-4" key={section.title}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-secondary-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-primary-800 shadow-sm">
                  {sectionIndex + 1}
                </span>
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-primary-700 uppercase">
                    {course.code}
                  </p>
                  <h2 className="text-xl font-semibold text-secondary-900 md:text-2xl">
                    {section.title}
                  </h2>
                </div>
              </div>
              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-secondary-600 shadow-sm">
                {section.videos.length} video
              </span>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {section.videos.map((video, videoIndex) => (
                <VideoCard
                  course={course}
                  key={`${section.title}-${video.title}`}
                  number={videoIndex + 1}
                  sectionTitle={section.title}
                  video={video}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </CourseWorkspaceShell>
  );
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-[22px] border border-white/80 bg-white/80 p-4 shadow-sm">
      <Icon className="size-4 text-primary-700" />
      <p className="mt-3 text-2xl font-semibold text-primary-800">{value}</p>
      <p className="mt-1 text-xs font-semibold tracking-[0.12em] text-secondary-500 uppercase">
        {label}
      </p>
    </div>
  );
}

function VideoCard({
  course,
  number,
  sectionTitle,
  video,
}: {
  course: Course;
  number: number;
  sectionTitle: string;
  video: VideoTutorial;
}) {
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${course.description} ${video.title} SNBT`,
  )}`;

  return (
    <a
      className={cn(
        "group block overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-[0_12px_38px_-28px_rgba(1,76,56,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-[0_24px_58px_-42px_rgba(1,76,56,0.55)] focus-visible:ring-3 focus-visible:ring-primary-400/25 focus-visible:outline-none",
        video.locked ? "pointer-events-none opacity-62" : null,
      )}
      href={youtubeUrl}
      rel="noreferrer"
      target="_blank"
    >
      <div
        className="relative aspect-video overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 52% 44%, rgba(255,255,255,0.16), transparent 22%), linear-gradient(145deg, #061327 0%, #020305 100%)",
        }}
      >
        <div className="absolute inset-0 grid place-items-center">
          <span
            className="grid size-16 place-items-center rounded-full text-white shadow-[0_18px_44px_-18px_rgba(238,29,36,0.7)] transition-transform group-hover:scale-105 md:size-20"
            style={{ backgroundColor: "#ee1d24" }}
          >
            {video.locked ? (
              <Lock className="size-7" />
            ) : (
              <Play className="ml-1 size-8 fill-current" />
            )}
          </span>
        </div>
        <div className="absolute right-3 bottom-3 rounded-md bg-black/78 px-2 py-1 text-sm font-semibold text-white">
          {video.duration}
        </div>
        {video.completed ? (
          <div className="absolute bottom-3 left-3 rounded-md bg-primary-700 px-2 py-1 text-xs font-semibold text-white">
            Selesai
          </div>
        ) : null}
      </div>

      <div className="p-5">
        <p className="text-xs font-semibold text-secondary-400">
          Video {number} · {sectionTitle}
        </p>
        <h3 className="mt-2 line-clamp-2 min-h-[3.25rem] text-lg leading-[1.42] font-semibold text-secondary-900">
          {video.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-secondary-500">
          YouTube video untuk materi {course.description}.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-semibold text-secondary-600">
            #{course.title.toLowerCase()}
          </span>
          <span className="rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-semibold text-secondary-600">
            #snbt
          </span>
          <span className="rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-semibold text-secondary-600">
            #youtube
          </span>
        </div>
      </div>
    </a>
  );
}

export { CourseDetailPageModule };

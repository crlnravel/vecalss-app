import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  Lock,
  Play,
  PlayCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
  const nextVideo =
    course.sections
      .flatMap((section) => section.videos)
      .find((video) => !video.completed && !video.locked) ??
    course.sections[0]?.videos[0];

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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="relative overflow-hidden rounded-[30px] border border-primary-100 bg-[linear-gradient(125deg,#ecfbf9_0%,#ffffff_56%,#fff3bc_100%)] shadow-[0_28px_90px_-60px_rgba(1,76,56,0.44)]">
          <CardHeader className="gap-6 px-6 py-7 md:px-8 md:py-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-primary-800 shadow-sm">
                    {course.code}
                  </span>
                  <span className="rounded-full bg-secondary-100 px-3 py-1 text-xs font-semibold text-secondary-700">
                    {course.difficulty}
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
                  "flex aspect-[1.15] w-full max-w-[220px] shrink-0 items-center justify-center rounded-[28px] border border-primary-100 shadow-[0_22px_60px_-42px_rgba(1,76,56,0.5)]",
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

        <Card className="rounded-[30px] border border-primary-100 bg-white shadow-[0_22px_72px_-58px_rgba(1,76,56,0.34)]">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="text-lg font-semibold">Course progress</CardTitle>
            <CardDescription>
              {stats.completedVideos} of {stats.totalVideos} videos completed
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <Progress className="gap-2" value={course.progress}>
              <ProgressValue className="ml-0 text-sm text-secondary-600">
                {() => `${course.progress}% complete`}
              </ProgressValue>
            </Progress>
            <Button className="mt-6 w-full" size="sm" variant="brand">
              <Play data-icon="inline-start" />
              {nextVideo ? `Continue: ${nextVideo.title}` : "Start course"}
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
        <Card className="rounded-[30px] border border-primary-100 bg-white shadow-[0_22px_72px_-58px_rgba(1,76,56,0.3)]">
          <CardHeader className="px-6 pt-6 md:px-7 md:pt-7">
            <CardTitle className="text-lg font-semibold">
              Course overview
            </CardTitle>
            <CardDescription className="leading-6">
              Start with the overview, then move through each section in order.
              Locked videos unlock as earlier lessons are completed.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 md:px-7 md:pb-7">
            <div
              className={cn(
                "relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-[28px] border border-primary-100 p-6",
                course.palette,
              )}
            >
              <div className="absolute top-5 left-5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-secondary-700 shadow-sm">
                Main content area
              </div>
              <button
                className="flex size-20 items-center justify-center rounded-full bg-primary-700 text-white shadow-[0_24px_60px_-30px_rgba(1,76,56,0.65)] transition-transform hover:scale-105"
                type="button"
              >
                <Play className="ml-1 size-8 fill-current" />
                <span className="sr-only">Play course overview</span>
              </button>
              <div className="absolute right-5 bottom-5 max-w-[220px] rounded-[22px] border border-primary-100 bg-white/88 p-4 shadow-sm">
                <p className="text-sm font-semibold text-secondary-900">
                  {nextVideo?.title ?? "Course overview"}
                </p>
                <p className="mt-1 text-xs text-secondary-500">
                  {nextVideo?.duration ?? course.duration}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[30px] border border-primary-100 bg-white shadow-[0_22px_72px_-58px_rgba(1,76,56,0.3)]">
          <CardHeader className="px-6 pt-6 md:px-7 md:pt-7">
            <CardTitle className="text-lg font-semibold">
              Video tutorials
            </CardTitle>
            <CardDescription className="leading-6">
              Lessons are grouped by section title so you can scan the course
              path quickly.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-6 pb-6 md:px-7 md:pb-7">
            {course.sections.map((section, sectionIndex) => (
              <div
                className="overflow-hidden rounded-[24px] border border-primary-100 bg-primary-50/45"
                key={section.title}
              >
                <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-5">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.14em] text-primary-700 uppercase">
                      Section {sectionIndex + 1}
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-secondary-900">
                      {section.title}
                    </h2>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-secondary-600">
                    {section.videos.length} videos
                  </span>
                </div>
                <Separator className="bg-primary-100/80" />
                <div className="bg-white">
                  {section.videos.map((video, videoIndex) => (
                    <VideoRow
                      key={video.title}
                      number={videoIndex + 1}
                      video={video}
                    />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
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

function VideoRow({
  number,
  video,
}: {
  number: number;
  video: VideoTutorial;
}) {
  const Icon = video.locked ? Lock : video.completed ? CheckCircle2 : Play;

  return (
    <div className="group/video flex items-center gap-3 border-b border-primary-100/70 px-4 py-3 last:border-b-0 md:px-5">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full border",
          video.completed
            ? "border-primary-700 bg-primary-700 text-white"
            : video.locked
              ? "border-secondary-200 bg-secondary-100 text-secondary-500"
              : "border-primary-100 bg-primary-50 text-primary-700 group-hover/video:border-primary-300",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-secondary-400">
            Video {number}
          </span>
          {video.locked ? (
            <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[10px] font-semibold text-secondary-600">
              Locked
            </span>
          ) : video.completed ? (
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-800">
              Completed
            </span>
          ) : (
            <span className="rounded-full bg-[#fff6c8] px-2 py-0.5 text-[10px] font-semibold text-secondary-800">
              Ready
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-secondary-900">
          {video.title}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-xs font-medium text-secondary-500">
          {video.duration}
        </span>
        <button
          className={cn(
            "flex size-9 items-center justify-center rounded-full border transition-colors",
            video.locked
              ? "cursor-not-allowed border-secondary-200 bg-secondary-100 text-secondary-400"
              : "border-primary-100 bg-white text-primary-700 hover:border-primary-300 hover:bg-primary-50",
          )}
          disabled={video.locked}
          type="button"
        >
          {video.locked ? <Lock className="size-4" /> : <Play className="size-4" />}
          <span className="sr-only">
            {video.locked ? "Locked video" : `Play ${video.title}`}
          </span>
        </button>
      </div>
    </div>
  );
}

export { CourseDetailPageModule };

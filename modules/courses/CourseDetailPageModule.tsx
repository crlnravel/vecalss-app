import Link from "next/link";
import Image from "next/image";
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
        <Card className="relative overflow-hidden rounded-6xl border border-[#dbe8e3] bg-white p-0 gap-0 shadow-[0_32px_100px_-72px_rgba(10,77,59,0.36)]">
          <CardHeader className="relative bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,246,0.96)_100%)] px-6 pt-8 pb-8 md:px-10 md:pt-10 md:pb-10">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute top-0 right-[-8%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(239,244,241,0.96)_0%,rgba(239,244,241,0.72)_42%,rgba(239,244,241,0)_74%)] md:top-4 md:h-[42rem] md:w-[42rem]" />
              <div className="absolute top-16 left-[58%] hidden gap-1.5 md:flex">
                <span className="size-2 rounded-full bg-primary-700/45" />
                <span className="size-2 rounded-full bg-primary-700/45" />
                <span className="size-2 rounded-full bg-primary-700/45" />
              </div>
            </div>

            <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.96fr)] lg:gap-12">
              <div className="max-w-2xl space-y-6">
                <span className="inline-flex w-fit items-center rounded-full bg-primary-50 px-5 py-2 text-sm font-semibold tracking-[0.08em] text-primary-900 shadow-sm ring-1 ring-primary-100">
                  {course.code}
                </span>
                <div className="space-y-3">
                  <CardTitle
                    className="text-[clamp(4.5rem,10vw,7rem)] leading-[0.88] font-semibold tracking-[-0.08em] text-primary-950"
                    style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
                  >
                    {course.title}
                  </CardTitle>
                  <h2 className="text-[clamp(1.55rem,3vw,2.7rem)] leading-[1.08] font-semibold text-secondary-700">
                    {course.description}
                  </h2>
                </div>
                <CardDescription className="max-w-[34rem] text-base leading-8 text-secondary-600 md:text-[1.05rem]">
                  {course.title === "PU"
                    ? "Pelajari kemampuan penalaran logis, analitis, dan kritis untuk menyelesaikan berbagai jenis soal secara tepat dan efisien."
                    : `Pelajari kemampuan ${course.description.toLowerCase()} melalui materi yang ringkas, terarah, dan mudah dipraktikkan.`}
                </CardDescription>
              </div>

              <div className="relative flex justify-center lg:justify-end">
                <div className="relative aspect-[879/639] w-full max-w-[560px]">
                  <div className="absolute inset-x-6 top-14 h-[72%] rounded-full bg-[radial-gradient(circle_at_center,rgba(239,244,241,0.96)_0%,rgba(239,244,241,0.72)_48%,rgba(239,244,241,0)_76%)]" />
                  <div className="absolute top-12 left-12 hidden gap-1.5 md:flex">
                    <span className="size-2 rounded-full bg-primary-700/45" />
                    <span className="size-2 rounded-full bg-primary-700/45" />
                    <span className="size-2 rounded-full bg-primary-700/45" />
                  </div>
                  <Image
                    alt={`${course.title} illustration`}
                    className="object-contain object-center drop-shadow-[0_28px_48px_rgba(10,77,59,0.14)]"
                    fill
                    priority
                    sizes="(min-width: 1024px) 42vw, 90vw"
                    src="/landing-assets/materi-hero-illustration.png"
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-0 border-t border-[#dbe8e3] bg-white px-0 py-0 lg:grid-cols-3 lg:divide-x lg:divide-[#dbe8e3]">
            <DetailStat
              icon={BookOpen}
              label="Bagian"
              value={stats.totalSections}
            />
            <DetailStat
              icon={PlayCircle}
              label="Video"
              value={stats.totalVideos}
            />
            <DetailStat icon={Clock3} label="Durasi" value={course.duration} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-8">
        {course.sections.map((section, sectionIndex) => (
          <div className="space-y-4" key={section.title}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-4xl bg-secondary-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-primary-800 shadow-sm">
                  {sectionIndex + 1}
                </span>
                <div>
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
    <div className="flex items-center gap-4 px-6 py-6 md:px-8 md:py-8">
      <Icon className="size-7 shrink-0 text-primary-700" />
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-[2rem] leading-none font-semibold tracking-[-0.05em] text-primary-900 md:text-[2.35rem]">
          {value}
        </p>
        <p className="text-base font-medium text-secondary-500 md:text-lg">
          {label}
        </p>
      </div>
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
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-[0_12px_38px_-28px_rgba(1,76,56,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-[0_24px_58px_-42px_rgba(1,76,56,0.55)] focus-visible:ring-3 focus-visible:ring-primary-400/25 focus-visible:outline-none",
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

      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold text-secondary-400">
          Video {number} · {sectionTitle}
        </p>
        <h3 className="mt-2 line-clamp-2 text-lg leading-[1.42] font-semibold text-secondary-900">
          {video.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-secondary-500">
          YouTube video untuk materi {course.description}.
        </p>
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
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

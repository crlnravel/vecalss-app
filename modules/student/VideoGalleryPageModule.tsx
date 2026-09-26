"use client";

import { useMemo, useState } from "react";

import {
  ArrowUpRight,
  Clock3,
  Play,
  Search,
  UserRound,
  Video,
} from "@/lib/icons";
import { ReferenceEmptyState } from "@/components/dashboard";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudentBadge } from "@/components/ui/student-badge";
import { SunkenTabButton } from "@/components/ui/sunken-tabs";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";
import {
  videoFilters,
  type VideoGalleryItem,
} from "@/modules/video/video-gallery-data";

const thumbnailToneClasses = {
  forest: "bg-voyage-forest",
  deep: "bg-voyage-deep",
  leaf: "bg-voyage-leaf",
} as const;

type VideoFilter = (typeof videoFilters)[number];

function VideoThumbnail({ video }: { video: VideoGalleryItem }) {
  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden text-white",
        thumbnailToneClasses[video.thumbnailTone],
      )}
    >
      <div aria-hidden="true" className="absolute -right-10 -top-14 size-44 rounded-full border-[18px] border-voyage-sea-glass/20" />
      <div aria-hidden="true" className="absolute -bottom-14 -left-8 size-44 rounded-full bg-voyage-deep/45 blur-2xl" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-secondary-950/25" />

      <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-secondary-950/45 px-2.5 py-1.5 text-ui-xs font-bold tracking-[0.08em] text-white uppercase backdrop-blur-sm">
            <Video aria-hidden="true" className="size-3.5" />
            {video.category} · {video.subject.split(" ")[0]}
          </span>
          {video.duration ? (
            <span className="rounded-lg bg-secondary-950/80 px-2.5 py-1.5 text-xs font-bold tabular-nums text-white">
              {video.duration}
            </span>
          ) : null}
        </div>

        <div className="relative z-10">
          <p className="text-ui-xs font-bold tracking-[0.16em] text-voyage-sea-glass uppercase">
            {video.thumbnailEyebrow}
          </p>
          <p className="mt-1 max-w-[14ch] whitespace-pre-line font-display text-2xl leading-[0.95] font-extrabold tracking-[-0.04em] text-white sm:text-3xl">
            {video.thumbnailTitle}
          </p>
        </div>
      </div>

      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-14 place-items-center rounded-full bg-voyage-warm-sun text-voyage-warm-sun-ink shadow-[0_12px_28px_-14px_color-mix(in_oklab,var(--voyage-deep)_75%,transparent)] transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none">
          <Play aria-hidden="true" className="ml-0.5 size-6" weight="fill" />
        </span>
      </span>

      <span className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-secondary-950/60 px-2.5 py-1.5 text-ui-xs font-bold text-white backdrop-blur-sm">
        YouTube
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
      </span>
    </div>
  );
}

function VideoCard({ video }: { video: VideoGalleryItem }) {
  return (
    <a
      aria-label={`Tonton ${video.title} di YouTube`}
      className={cn(
        REFERENCE_SURFACE_CLASS_NAMES.raised,
        REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
        "group flex min-w-0 flex-col overflow-hidden p-0 text-left outline-none focus-visible:ring-4 focus-visible:ring-primary-300/35",
      )}
      href={video.youtubeUrl}
      rel="noreferrer"
      target="_blank"
    >
      <VideoThumbnail video={video} />
      <div className="flex min-h-[13.5rem] flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StudentBadge size="xs" tone="category">
            {video.subtest}
          </StudentBadge>
          {video.isNew ? <StudentBadge size="xs" tone="attention">Baru</StudentBadge> : null}
        </div>

        <h3 className="mt-3 text-lg leading-tight font-extrabold tracking-[-0.03em] text-voyage-ink">
          {video.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-learning-muted-ink">
          {video.description}
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {video.tags.map((tag) => (
            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-ui-xs font-semibold text-primary-800" key={tag}>
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-primary-100 pt-4 text-xs font-semibold text-secondary-500">
          <span className="inline-flex items-center gap-1.5">
            <UserRound aria-hidden="true" className="size-3.5 text-primary-700" />
            Kapten Vecalss
          </span>
          {video.duration ? (
            <>
              <span aria-hidden="true" className="text-secondary-300">·</span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Clock3 aria-hidden="true" className="size-3.5 text-primary-700" />
                {video.duration}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </a>
  );
}

function VideoGalleryPageModule({
  notificationFeed,
  session,
  videos,
}: {
  notificationFeed?: StudentNotificationFeed;
  session: SessionContext;
  videos: VideoGalleryItem[];
}) {
  const [activeFilter, setActiveFilter] = useState<VideoFilter>("Semua");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredVideos = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("id-ID");

    return videos.filter((video) => {
      const matchesFilter = activeFilter === "Semua" || video.subtest === activeFilter;
      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;

      return [video.title, video.description, video.subject, ...video.tags]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .includes(normalizedQuery);
    });
  }, [activeFilter, searchQuery, videos]);

  return (
    <StudentWorkspaceShell
      activeLabel="Video"
      breadcrumbLabel="Video"
      mainClassName="gap-8"
      notificationFeed={notificationFeed}
      searchPlaceholder="Cari video belajar..."
      session={session}
    >
      <div className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
        <section aria-labelledby="video-gallery-title" className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-2xl leading-tight font-extrabold tracking-[-0.035em] text-voyage-ink md:text-3xl" id="video-gallery-title">
              Video belajar
            </h2>

            <div className="flex flex-col gap-3">
              <div className="relative min-w-0 md:max-w-[30rem]">
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-500" />
                <Input
                  aria-label="Cari video"
                  className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "pl-11")}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari judul atau topik..."
                  type="search"
                  value={searchQuery}
                />
              </div>

              <div aria-label="Filter subtes video" className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist">
                {videoFilters.map((filter) => {
                  const isActive = activeFilter === filter;

                  return (
                    <SunkenTabButton
                      aria-selected={isActive}
                      key={filter}
                      layout="content"
                      onClick={() => setActiveFilter(filter)}
                      role="tab"
                      selected={isActive}
                      type="button"
                    >
                      {filter}
                    </SunkenTabButton>
                  );
                })}
              </div>
            </div>
          </div>

          {filteredVideos.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" id="video-card-grid">
              {filteredVideos.map((video) => <VideoCard key={video.id} video={video} />)}
            </div>
          ) : (
            <ReferenceEmptyState
              action={videos.length > 0 ? (
                <Button onClick={() => { setActiveFilter("Semua"); setSearchQuery(""); }} size="sm" variant="brandOutline">
                  Lihat semua video
                </Button>
              ) : undefined}
              className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "border-learning-card-border")}
              description={videos.length > 0
                ? "Coba kata kunci lain atau pilih Semua untuk melihat koleksi yang tersedia."
                : "Video belajar belum tersedia."}
              icon={Video}
              title={videos.length > 0 ? "Video tidak ditemukan" : "Belum ada video belajar"}
            />
          )}
        </section>
      </div>
    </StudentWorkspaceShell>
  );
}

export { VideoGalleryPageModule };

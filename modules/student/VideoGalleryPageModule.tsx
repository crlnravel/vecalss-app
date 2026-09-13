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
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

type VideoFilter = "Semua" | "PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM";
type VideoCategory = "TPS" | "TPA";
type VideoSubtest = Exclude<VideoFilter, "Semua">;

type VideoGalleryItem = {
  category: VideoCategory;
  description: string;
  duration: string;
  id: string;
  isNew?: boolean;
  subtest: VideoSubtest;
  subject: string;
  tags: string[];
  thumbnailEyebrow: string;
  thumbnailTitle: string;
  thumbnailTone: keyof typeof thumbnailToneClasses;
  title: string;
  youtubeUrl: string;
};

const thumbnailToneClasses = {
  forest: "bg-voyage-forest",
  deep: "bg-voyage-deep",
  leaf: "bg-voyage-leaf",
} as const;

function youtubeSearchUrl(title: string) {
  // Prototype links keep the UI honest until Kapten video URLs are persisted.
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`Vecalss ${title}`)}`;
}

const videoItems = [
  {
    category: "TPS",
    description: "Pembahasan langkah demi langkah untuk soal-soal kuantitatif yang sering muncul.",
    duration: "30:00",
    id: "tps-pk-2026",
    isNew: true,
    subtest: "PK",
    subject: "Pengetahuan Kuantitatif",
    tags: ["TPS", "PK", "SNBT 2026"],
    thumbnailEyebrow: "PEMBAHASAN",
    thumbnailTitle: "TPS PK\nSNBT 2026",
    thumbnailTone: "deep",
    title: "Pembahasan TPS PK — SNBT 2026",
    youtubeUrl: youtubeSearchUrl("Pembahasan TPS PK SNBT 2026"),
  },
  {
    category: "TPS",
    description: "Kenali pola soal dan strategi cepat untuk menaklukkan penalaran kuantitatif.",
    duration: "21:47",
    id: "prediksi-kuantitatif",
    subtest: "PK",
    subject: "Pengetahuan Kuantitatif",
    tags: ["Prediksi", "Kuantitatif", "UTBK"],
    thumbnailEyebrow: "STRATEGI CEPAT",
    thumbnailTitle: "PREDIKSI\nKUANTITATIF",
    thumbnailTone: "forest",
    title: "Prediksi Soal Kuantitatif UTBK 2026",
    youtubeUrl: youtubeSearchUrl("Prediksi Soal Kuantitatif UTBK 2026"),
  },
  {
    category: "TPS",
    description: "Cara ringkas membaca persentase, diskon, dan perubahan nilai tanpa berlama-lama.",
    duration: "17:45",
    id: "diskon-persen",
    subtest: "PK",
    subject: "Pengetahuan Kuantitatif",
    tags: ["Persen", "Diskon", "Trik"],
    thumbnailEyebrow: "CARA CEPAT",
    thumbnailTitle: "DISKON\n& PERSEN",
    thumbnailTone: "leaf",
    title: "Cara Cepat Jawab Diskon dan Persen",
    youtubeUrl: youtubeSearchUrl("Cara Cepat Jawab Diskon dan Persen"),
  },
  {
    category: "TPS",
    description: "Pahami peluang lewat contoh sederhana dan pola hitung yang mudah diingat.",
    duration: "12:20",
    id: "peluang-pk",
    subtest: "PK",
    subject: "Pengetahuan Kuantitatif",
    tags: ["Peluang", "PK", "Latihan"],
    thumbnailEyebrow: "FONDASI",
    thumbnailTitle: "PELUANG\nDASAR",
    thumbnailTone: "deep",
    title: "Cara Cepat Jawab Soal Peluang PK",
    youtubeUrl: youtubeSearchUrl("Cara Cepat Jawab Soal Peluang PK"),
  },
  {
    category: "TPS",
    description: "Latihan bertahap untuk menemukan pola bilangan dan menyusun langkah paling efisien.",
    duration: "15:15",
    id: "pola-bilangan",
    subtest: "PU",
    subject: "Penalaran Umum",
    tags: ["Pola Bilangan", "PU", "Latihan"],
    thumbnailEyebrow: "BEDAH SOAL",
    thumbnailTitle: "POLA\nBILANGAN",
    thumbnailTone: "forest",
    title: "Cara Cepat Soal Pola Bilangan UTBK",
    youtubeUrl: youtubeSearchUrl("Cara Cepat Soal Pola Bilangan UTBK"),
  },
  {
    category: "TPA",
    description: "Bawa strategi membaca cepat ke sesi latihan dengan contoh bacaan yang relevan.",
    duration: "20:19",
    id: "literasi-bacaan",
    isNew: true,
    subtest: "LBI",
    subject: "Literasi Bahasa Indonesia",
    tags: ["LBI", "Literasi", "Strategi"],
    thumbnailEyebrow: "BEDAH BACAAN",
    thumbnailTitle: "LITERASI\nINDONESIA",
    thumbnailTone: "leaf",
    title: "Strategi Menjawab Soal Literasi Bahasa Indonesia",
    youtubeUrl: youtubeSearchUrl("Strategi Menjawab Soal Literasi Bahasa Indonesia"),
  },
  {
    category: "TPA",
    description: "Temukan cara menyusun fokus sebelum mulai membaca teks berbahasa Inggris.",
    duration: "18:42",
    id: "reading-comprehension",
    subtest: "LBE",
    subject: "Literasi Bahasa Inggris",
    tags: ["LBE", "Reading", "SNBT"],
    thumbnailEyebrow: "READING HACK",
    thumbnailTitle: "READING\nCOMPREHENSION",
    thumbnailTone: "deep",
    title: "Reading Comprehension: Temukan Ide Utama",
    youtubeUrl: youtubeSearchUrl("Reading Comprehension Temukan Ide Utama SNBT"),
  },
  {
    category: "TPA",
    description: "Latihan penalaran umum dengan pendekatan visual agar pola jawabannya lebih mudah terlihat.",
    duration: "14:08",
    id: "penalaran-umum",
    subtest: "PU",
    subject: "Penalaran Umum",
    tags: ["PU", "Penalaran", "Latihan"],
    thumbnailEyebrow: "KUPAS TUNTAS",
    thumbnailTitle: "PENALARAN\nUMUM",
    thumbnailTone: "forest",
    title: "Kupas Tuntas Penalaran Umum untuk SNBT",
    youtubeUrl: youtubeSearchUrl("Kupas Tuntas Penalaran Umum untuk SNBT"),
  },
] satisfies readonly VideoGalleryItem[];

const videoFilters: readonly VideoFilter[] = ["Semua", "PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"];

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
          <span className="rounded-lg bg-secondary-950/80 px-2.5 py-1.5 text-xs font-bold tabular-nums text-white">
            {video.duration}
          </span>
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
          <span aria-hidden="true" className="text-secondary-300">·</span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Clock3 aria-hidden="true" className="size-3.5 text-primary-700" />
            {video.duration}
          </span>
        </div>
      </div>
    </a>
  );
}

function VideoGalleryPageModule({
  notificationFeed,
  session,
}: {
  notificationFeed?: StudentNotificationFeed;
  session: SessionContext;
}) {
  const [activeFilter, setActiveFilter] = useState<VideoFilter>("Semua");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredVideos = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("id-ID");

    return videoItems.filter((video) => {
      const matchesFilter = activeFilter === "Semua" || video.subtest === activeFilter;
      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;

      return [video.title, video.description, video.subject, ...video.tags]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .includes(normalizedQuery);
    });
  }, [activeFilter, searchQuery]);

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
                    <button
                      aria-selected={isActive}
                      className={cn(
                        "min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition-[background-color,border-color,color,transform] duration-200 motion-reduce:transition-none",
                        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40",
                        isActive
                          ? "border-voyage-deep bg-voyage-deep text-white shadow-[0_8px_18px_-14px_color-mix(in_oklab,var(--voyage-deep)_80%,transparent)]"
                          : "border-primary-100 bg-white text-secondary-600 hover:border-primary-200 hover:bg-primary-50 hover:text-secondary-900",
                      )}
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      role="tab"
                      type="button"
                    >
                      {filter}
                    </button>
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
              action={
                <Button onClick={() => { setActiveFilter("Semua"); setSearchQuery(""); }} size="sm" variant="brandOutline">
                  Lihat semua video
                </Button>
              }
              className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "border-learning-card-border")}
              description="Coba kata kunci lain atau pilih Semua untuk melihat koleksi yang tersedia."
              icon={Video}
              title="Video tidak ditemukan"
            />
          )}
        </section>
      </div>
    </StudentWorkspaceShell>
  );
}

export { VideoGalleryPageModule };

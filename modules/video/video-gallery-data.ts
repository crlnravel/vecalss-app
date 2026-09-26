export const videoSubtests = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;

export type VideoCategory = "TPS" | "TPA";
export type VideoSubtest = (typeof videoSubtests)[number];
export type VideoStatus = "draft" | "published";
export type VideoThumbnailTone = "forest" | "deep" | "leaf";

export type VideoGalleryItem = {
  category: VideoCategory;
  description: string;
  duration: string | null;
  id: string;
  isNew?: boolean;
  isVisibleToStudents: boolean;
  subtest: VideoSubtest;
  status: VideoStatus;
  subject: string;
  tags: string[];
  thumbnailEyebrow: string;
  thumbnailTitle: string;
  thumbnailTone: VideoThumbnailTone;
  title: string;
  youtubeUrl: string;
};

export const videoFilters = ["Semua", ...videoSubtests] as const;

const subtestPresentation: Record<VideoSubtest, {
  category: VideoCategory;
  subject: string;
  thumbnailTone: VideoThumbnailTone;
}> = {
  PU: { category: "TPS", subject: "Penalaran Umum", thumbnailTone: "forest" },
  PPU: { category: "TPS", subject: "Pengetahuan dan Pemahaman Umum", thumbnailTone: "deep" },
  PBM: { category: "TPS", subject: "Pemahaman Bacaan dan Menulis", thumbnailTone: "leaf" },
  PK: { category: "TPS", subject: "Pengetahuan Kuantitatif", thumbnailTone: "deep" },
  LBI: { category: "TPA", subject: "Literasi Bahasa Indonesia", thumbnailTone: "leaf" },
  LBE: { category: "TPA", subject: "Literasi Bahasa Inggris", thumbnailTone: "forest" },
  PM: { category: "TPS", subject: "Penalaran Matematika", thumbnailTone: "deep" },
};

export function toVideoGalleryItem(record: {
  createdAt: Date;
  description: string | null;
  id: string;
  isVisibleToStudents: boolean;
  status: VideoStatus;
  subtest: VideoSubtest;
  title: string;
  youtubeUrl: string;
}): VideoGalleryItem {
  const presentation = subtestPresentation[record.subtest];
  const title = record.title.trim();

  return {
    category: presentation.category,
    description: record.description ?? "",
    duration: null,
    id: record.id,
    isNew: Date.now() - record.createdAt.getTime() < 10 * 24 * 60 * 60 * 1000,
    isVisibleToStudents: record.isVisibleToStudents,
    subtest: record.subtest,
    status: record.status,
    subject: presentation.subject,
    tags: [record.subtest, "YouTube"],
    thumbnailEyebrow: "VIDEO YOUTUBE",
    thumbnailTitle: title.toLocaleUpperCase("id-ID"),
    thumbnailTone: presentation.thumbnailTone,
    title,
    youtubeUrl: record.youtubeUrl,
  };
}

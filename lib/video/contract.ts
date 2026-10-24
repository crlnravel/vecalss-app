import {
  videoSubtests,
  type VideoSubtest,
} from "@/modules/video/video-gallery-data";

export const VIDEO_TITLE_MAX_LENGTH = 160;
export const VIDEO_DESCRIPTION_MAX_LENGTH = 1_000;

export type VideoInputField = "description" | "subtest" | "title" | "youtubeUrl";
export type VideoInputFieldErrors = Partial<Record<VideoInputField, string>>;

export type SaveKaptenVideoInput = {
  description: string;
  id?: string;
  subtest: VideoSubtest;
  title: string;
  youtubeUrl: string;
};

export type ValidatedKaptenVideoInput = Omit<SaveKaptenVideoInput, "id"> & { id?: string };

export class VideoGalleryValidationError extends Error {
  readonly fieldErrors: VideoInputFieldErrors;

  constructor(message: string, fieldErrors: VideoInputFieldErrors = {}) {
    super(message);
    this.name = "VideoGalleryValidationError";
    this.fieldErrors = fieldErrors;
  }
}

const videoSubtestSet = new Set<string>(videoSubtests);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

export function isVideoSubtest(value: unknown): value is VideoSubtest {
  return typeof value === "string" && videoSubtestSet.has(value);
}

export function parseYouTubeVideoId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase();
    const allowedHosts = new Set([
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
    ]);
    if (!allowedHosts.has(hostname)) return null;

    let videoId: string | null = null;
    if (hostname === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else {
      videoId = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null;
    }

    return videoId && videoIdPattern.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

export function isYouTubeVideoUrl(value: string): boolean {
  return parseYouTubeVideoId(value) !== null;
}

export function getYouTubeThumbnailUrl(value: string): string | null {
  const videoId = parseYouTubeVideoId(value);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

export function normalizeKaptenVideoInput(input: unknown): ValidatedKaptenVideoInput {
  if (!input || typeof input !== "object") {
    throw new VideoGalleryValidationError("Lengkapi informasi video terlebih dahulu.");
  }

  const raw = input as Partial<Record<keyof SaveKaptenVideoInput, unknown>>;
  const fieldErrors: VideoInputFieldErrors = {};
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  const youtubeUrl = typeof raw.youtubeUrl === "string" ? raw.youtubeUrl.trim() : "";
  const subtest = raw.subtest;

  if (!title) fieldErrors.title = "Masukkan judul video terlebih dahulu.";
  else if (title.length > VIDEO_TITLE_MAX_LENGTH) {
    fieldErrors.title = `Judul video maksimal ${VIDEO_TITLE_MAX_LENGTH} karakter.`;
  }

  if (!isYouTubeVideoUrl(youtubeUrl)) {
    fieldErrors.youtubeUrl = "Masukkan tautan YouTube yang mengarah langsung ke video.";
  }

  if (description.length > VIDEO_DESCRIPTION_MAX_LENGTH) {
    fieldErrors.description = `Deskripsi maksimal ${VIDEO_DESCRIPTION_MAX_LENGTH} karakter.`;
  }

  if (!isVideoSubtest(subtest)) fieldErrors.subtest = "Pilih subtes untuk video ini.";

  const id = raw.id;
  if (id !== undefined && (typeof id !== "string" || !uuidPattern.test(id))) {
    throw new VideoGalleryValidationError("Video ini tidak dapat diperbarui. Muat ulang halaman lalu coba lagi.");
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new VideoGalleryValidationError("Periksa kembali informasi video.", fieldErrors);
  }

  const videoId = parseYouTubeVideoId(youtubeUrl);
  if (!videoId || !isVideoSubtest(subtest)) {
    throw new VideoGalleryValidationError("Periksa kembali informasi video.");
  }

  return {
    description,
    ...(typeof id === "string" ? { id } : {}),
    subtest,
    title,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

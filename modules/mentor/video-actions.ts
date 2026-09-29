"use server";

import { revalidatePath } from "next/cache";

import { requireTutorSession } from "@/lib/auth/access";
import {
  VideoGalleryValidationError,
  type SaveKaptenVideoInput,
  type VideoInputFieldErrors,
} from "@/lib/video/contract";
import {
  KaptenVideoNotFoundError,
  deleteKaptenVideo,
  saveKaptenVideo,
  setKaptenVideoArchived,
} from "@/lib/video/repository";
import type { VideoGalleryItem } from "@/modules/video/video-gallery-data";

type VideoActionFailure = { fieldErrors?: VideoInputFieldErrors; message: string; ok: false };
type VideoActionResult = VideoActionFailure | { message: string; ok: true; video: VideoGalleryItem };
type VideoDeleteActionResult = VideoActionFailure | { message: string; ok: true };

const videoIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function revalidateVideoPaths() {
  revalidatePath("/mentor/videos");
  revalidatePath("/videos");
}

function failedVideoAction(error: unknown, fallbackMessage: string): VideoActionFailure {
  if (error instanceof VideoGalleryValidationError) {
    return { fieldErrors: error.fieldErrors, message: error.message, ok: false };
  }
  if (error instanceof KaptenVideoNotFoundError) {
    return { message: error.message, ok: false };
  }

  console.error("Kapten video mutation failed", error);
  return { message: fallbackMessage, ok: false };
}

async function saveKaptenVideoAction(input: SaveKaptenVideoInput): Promise<VideoActionResult> {
  const session = await requireTutorSession();
  try {
    const video = await saveKaptenVideo(input, session.user.id);
    revalidateVideoPaths();
    const message = input.id ? "Perubahan video tersimpan." : "Video ditambahkan.";
    return { message, ok: true, video };
  } catch (error) {
    return failedVideoAction(error, "Video tidak dapat disimpan saat ini. Coba lagi.");
  }
}

async function setKaptenVideoArchivedAction(
  videoId: string,
  archived: boolean,
): Promise<VideoActionResult> {
  const session = await requireTutorSession();
  try {
    if (!videoIdPattern.test(videoId) || typeof archived !== "boolean") {
      throw new VideoGalleryValidationError("Pilihan arsip video tidak dikenali. Muat ulang halaman lalu coba lagi.");
    }
    const video = await setKaptenVideoArchived(videoId, archived, session.user.id);
    revalidateVideoPaths();
    return {
      message: archived ? "Video diarsipkan." : "Video dipulihkan.",
      ok: true,
      video,
    };
  } catch (error) {
    return failedVideoAction(error, "Arsip video tidak dapat diubah. Coba lagi.");
  }
}

async function deleteKaptenVideoAction(
  videoId: string,
): Promise<VideoDeleteActionResult> {
  const session = await requireTutorSession();
  try {
    if (!videoIdPattern.test(videoId)) {
      throw new VideoGalleryValidationError("Video ini tidak dapat dihapus. Muat ulang halaman lalu coba lagi.");
    }
    await deleteKaptenVideo(videoId, session.user.id);
    revalidateVideoPaths();
    return { message: "Video dihapus.", ok: true };
  } catch (error) {
    return failedVideoAction(error, "Video tidak dapat dihapus saat ini. Coba lagi.");
  }
}

export {
  deleteKaptenVideoAction,
  saveKaptenVideoAction,
  setKaptenVideoArchivedAction,
};

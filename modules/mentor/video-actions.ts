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
  saveKaptenVideo,
  updateKaptenVideoPublication,
  updateKaptenVideoVisibility,
} from "@/lib/video/repository";
import type { VideoGalleryItem, VideoStatus } from "@/modules/video/video-gallery-data";

type VideoActionResult =
  | { fieldErrors?: VideoInputFieldErrors; message: string; ok: false }
  | { message: string; ok: true; video: VideoGalleryItem };

const videoIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function revalidateVideoPaths() {
  revalidatePath("/mentor/videos");
  revalidatePath("/videos");
}

function failedVideoAction(error: unknown, fallbackMessage: string): Extract<VideoActionResult, { ok: false }> {
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
    const message = input.id
      ? video.status === "published" ? "Perubahan video tersimpan." : "Video dijadikan draf."
      : video.status === "published" ? "Video ditambahkan dan diterbitkan." : "Draf video tersimpan.";
    return { message, ok: true, video };
  } catch (error) {
    return failedVideoAction(error, "Video tidak dapat disimpan saat ini. Coba lagi.");
  }
}

async function updateKaptenVideoPublicationAction(
  videoId: string,
  status: VideoStatus,
): Promise<VideoActionResult> {
  const session = await requireTutorSession();
  try {
    if (!videoIdPattern.test(videoId) || (status !== "draft" && status !== "published")) {
      throw new VideoGalleryValidationError("Status video tidak dikenali. Muat ulang halaman lalu coba lagi.");
    }
    const video = await updateKaptenVideoPublication(videoId, status, session.user.id);
    revalidateVideoPaths();
    return {
      message: status === "published" ? "Video diterbitkan." : "Video dijadikan draf.",
      ok: true,
      video,
    };
  } catch (error) {
    return failedVideoAction(error, "Status penerbitan video tidak dapat diubah. Coba lagi.");
  }
}

async function updateKaptenVideoVisibilityAction(
  videoId: string,
  isVisibleToStudents: boolean,
): Promise<VideoActionResult> {
  const session = await requireTutorSession();
  try {
    if (!videoIdPattern.test(videoId) || typeof isVisibleToStudents !== "boolean") {
      throw new VideoGalleryValidationError("Pengaturan tampilan video tidak dikenali. Muat ulang halaman lalu coba lagi.");
    }
    const video = await updateKaptenVideoVisibility(videoId, isVisibleToStudents, session.user.id);
    revalidateVideoPaths();
    return {
      message: isVisibleToStudents
        ? "Video disiapkan untuk ditampilkan kepada siswa."
        : "Video disembunyikan dari galeri siswa.",
      ok: true,
      video,
    };
  } catch (error) {
    return failedVideoAction(error, "Pengaturan tampilan video tidak dapat diubah. Coba lagi.");
  }
}

export {
  saveKaptenVideoAction,
  updateKaptenVideoPublicationAction,
  updateKaptenVideoVisibilityAction,
};

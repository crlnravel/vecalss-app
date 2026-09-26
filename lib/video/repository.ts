import "server-only";

import {
  KaptenVideoStatus,
  KaptenVideoSubtest,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizeKaptenVideoInput,
  type SaveKaptenVideoInput,
} from "@/lib/video/contract";
import {
  toVideoGalleryItem,
  type VideoGalleryItem,
  type VideoStatus,
} from "@/modules/video/video-gallery-data";

const gallerySelect = {
  createdAt: true,
  description: true,
  id: true,
  isVisibleToStudents: true,
  status: true,
  subtest: true,
  title: true,
  youtubeUrl: true,
} satisfies Prisma.KaptenVideoSelect;

type GalleryRecord = Prisma.KaptenVideoGetPayload<{ select: typeof gallerySelect }>;

export class KaptenVideoNotFoundError extends Error {
  constructor() {
    super("Video tidak ditemukan atau tidak dapat diubah.");
    this.name = "KaptenVideoNotFoundError";
  }
}

function toGalleryItem(record: GalleryRecord): VideoGalleryItem {
  return toVideoGalleryItem({
    ...record,
    status: record.status as VideoStatus,
    subtest: record.subtest,
  });
}

async function updateOwnedVideo(
  videoId: string,
  ownerUserId: string,
  changes: {
    isVisibleToStudents?: boolean;
    status?: VideoStatus;
  },
) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.kaptenVideo.findFirst({
      where: { createdByUserId: ownerUserId, id: videoId },
      select: { publishedAt: true, status: true },
    });
    if (!existing) throw new KaptenVideoNotFoundError();

    const data: Prisma.KaptenVideoUpdateManyMutationInput = {};
    if (changes.isVisibleToStudents !== undefined) {
      data.isVisibleToStudents = changes.isVisibleToStudents;
    }
    if (changes.status !== undefined) {
      const nextStatus = changes.status === "published"
        ? KaptenVideoStatus.published
        : KaptenVideoStatus.draft;
      data.status = nextStatus;
      data.publishedAt = nextStatus === KaptenVideoStatus.published
        ? existing.status === KaptenVideoStatus.published
          ? existing.publishedAt ?? new Date()
          : new Date()
        : null;
    }

    const result = await transaction.kaptenVideo.updateMany({
      where: { createdByUserId: ownerUserId, id: videoId },
      data,
    });
    if (result.count !== 1) throw new KaptenVideoNotFoundError();

    const updated = await transaction.kaptenVideo.findFirst({
      where: { createdByUserId: ownerUserId, id: videoId },
      select: gallerySelect,
    });
    if (!updated) throw new KaptenVideoNotFoundError();
    return toGalleryItem(updated);
  });
}

async function getKaptenVideoGalleryItems(ownerUserId: string): Promise<VideoGalleryItem[]> {
  const records = await prisma.kaptenVideo.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: gallerySelect,
    where: { createdByUserId: ownerUserId },
  });
  return records.map(toGalleryItem);
}

async function getStudentVideoGalleryItems(): Promise<VideoGalleryItem[]> {
  const records = await prisma.kaptenVideo.findMany({
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: gallerySelect,
    where: {
      isVisibleToStudents: true,
      status: KaptenVideoStatus.published,
    },
  });
  return records.map(toGalleryItem);
}

async function saveKaptenVideo(input: SaveKaptenVideoInput, ownerUserId: string): Promise<VideoGalleryItem> {
  const validated = normalizeKaptenVideoInput(input);
  const status = validated.status === "published"
    ? KaptenVideoStatus.published
    : KaptenVideoStatus.draft;
  const subtest = validated.subtest as KaptenVideoSubtest;

  if (!validated.id) {
    const created = await prisma.kaptenVideo.create({
      data: {
        createdByUserId: ownerUserId,
        description: validated.description || null,
        isVisibleToStudents: validated.isVisibleToStudents,
        publishedAt: status === KaptenVideoStatus.published ? new Date() : null,
        status,
        subtest,
        title: validated.title,
        youtubeUrl: validated.youtubeUrl,
      },
      select: gallerySelect,
    });
    return toGalleryItem(created);
  }

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.kaptenVideo.findFirst({
      where: { createdByUserId: ownerUserId, id: validated.id },
      select: { publishedAt: true, status: true },
    });
    if (!existing) throw new KaptenVideoNotFoundError();

    const publishedAt = status === KaptenVideoStatus.published
      ? existing.status === KaptenVideoStatus.published
        ? existing.publishedAt ?? new Date()
        : new Date()
      : null;
    const updatedCount = await transaction.kaptenVideo.updateMany({
      where: { createdByUserId: ownerUserId, id: validated.id },
      data: {
        description: validated.description || null,
        isVisibleToStudents: validated.isVisibleToStudents,
        publishedAt,
        status,
        subtest,
        title: validated.title,
        youtubeUrl: validated.youtubeUrl,
      },
    });
    if (updatedCount.count !== 1) throw new KaptenVideoNotFoundError();

    const updated = await transaction.kaptenVideo.findFirst({
      where: { createdByUserId: ownerUserId, id: validated.id },
      select: gallerySelect,
    });
    if (!updated) throw new KaptenVideoNotFoundError();
    return toGalleryItem(updated);
  });
}

async function updateKaptenVideoPublication(
  videoId: string,
  status: VideoStatus,
  ownerUserId: string,
): Promise<VideoGalleryItem> {
  return updateOwnedVideo(videoId, ownerUserId, { status });
}

async function updateKaptenVideoVisibility(
  videoId: string,
  isVisibleToStudents: boolean,
  ownerUserId: string,
): Promise<VideoGalleryItem> {
  return updateOwnedVideo(videoId, ownerUserId, { isVisibleToStudents });
}

export {
  getKaptenVideoGalleryItems,
  getStudentVideoGalleryItems,
  saveKaptenVideo,
  updateKaptenVideoPublication,
  updateKaptenVideoVisibility,
};

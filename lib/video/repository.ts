import "server-only";

import { KaptenVideoSubtest } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizeKaptenVideoInput,
  type SaveKaptenVideoInput,
} from "@/lib/video/contract";
import {
  toVideoGalleryItem,
  type VideoGalleryItem,
} from "@/modules/video/video-gallery-data";

const gallerySelect = {
  archivedAt: true,
  createdAt: true,
  description: true,
  id: true,
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
    subtest: record.subtest,
  });
}

async function setKaptenVideoArchived(
  videoId: string,
  archived: boolean,
  ownerUserId: string,
) {
  const result = await prisma.kaptenVideo.updateMany({
    where: { createdByUserId: ownerUserId, id: videoId },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (result.count !== 1) throw new KaptenVideoNotFoundError();

  const updated = await prisma.kaptenVideo.findFirst({
    where: { createdByUserId: ownerUserId, id: videoId },
    select: gallerySelect,
  });
  if (!updated) throw new KaptenVideoNotFoundError();
  return toGalleryItem(updated);
}

async function getKaptenVideoGalleryItems(ownerUserId: string): Promise<VideoGalleryItem[]> {
  const records = await prisma.kaptenVideo.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: gallerySelect,
    where: { createdByUserId: ownerUserId },
  });
  return records.map(toGalleryItem);
}

async function getKaptenVideoById(
  videoId: string,
  ownerUserId: string,
): Promise<VideoGalleryItem | null> {
  const record = await prisma.kaptenVideo.findFirst({
    select: gallerySelect,
    where: { createdByUserId: ownerUserId, id: videoId },
  });
  return record ? toGalleryItem(record) : null;
}

async function getStudentVideoGalleryItems(): Promise<VideoGalleryItem[]> {
  const records = await prisma.kaptenVideo.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: gallerySelect,
    where: { archivedAt: null },
  });
  return records.map(toGalleryItem);
}

async function saveKaptenVideo(input: SaveKaptenVideoInput, ownerUserId: string): Promise<VideoGalleryItem> {
  const validated = normalizeKaptenVideoInput(input);
  const subtest = validated.subtest as KaptenVideoSubtest;

  if (!validated.id) {
    const created = await prisma.kaptenVideo.create({
      data: {
        createdByUserId: ownerUserId,
        description: validated.description || null,
        subtest,
        title: validated.title,
        youtubeUrl: validated.youtubeUrl,
      },
      select: gallerySelect,
    });
    return toGalleryItem(created);
  }

  return prisma.$transaction(async (transaction) => {
    const updatedCount = await transaction.kaptenVideo.updateMany({
      where: { createdByUserId: ownerUserId, id: validated.id },
      data: {
        description: validated.description || null,
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

async function deleteKaptenVideo(videoId: string, ownerUserId: string): Promise<void> {
  const result = await prisma.kaptenVideo.deleteMany({
    where: { createdByUserId: ownerUserId, id: videoId },
  });
  if (result.count !== 1) throw new KaptenVideoNotFoundError();
}

export {
  deleteKaptenVideo,
  getKaptenVideoById,
  getKaptenVideoGalleryItems,
  getStudentVideoGalleryItems,
  saveKaptenVideo,
  setKaptenVideoArchived,
};

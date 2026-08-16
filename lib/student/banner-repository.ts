import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  normalizeStudentBanners,
  STUDENT_BANNERS_CONFIG_KEY,
} from "./banner-content";
import type { StudentBannerSet } from "./banner-content";

class StudentBannerConflictError extends Error {
  constructor() {
    super("Student banner copy changed since this editor was opened.");
    this.name = "StudentBannerConflictError";
  }
}

async function getStudentBannerSnapshot() {
  const config = await prisma.systemConfig.findUnique({
    select: { configValue: true, updatedAt: true },
    where: { configKey: STUDENT_BANNERS_CONFIG_KEY },
  });

  return {
    banners: normalizeStudentBanners(config?.configValue),
    version: config?.updatedAt.toISOString() ?? null,
  };
}

async function getStudentBannerContents() {
  const snapshot = await getStudentBannerSnapshot();
  return snapshot.banners;
}

async function updateStudentBannerContents({
  actorUserId,
  banners,
  expectedVersion,
}: {
  actorUserId: string;
  banners: StudentBannerSet;
  expectedVersion: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.systemConfig.findUnique({
      select: { id: true, updatedAt: true },
      where: { configKey: STUDENT_BANNERS_CONFIG_KEY },
    });
    const expectedTime = expectedVersion ? new Date(expectedVersion) : null;

    if (expectedVersion && (!current || !expectedTime || Number.isNaN(expectedTime.getTime()) || current.updatedAt.getTime() !== expectedTime.getTime())) {
      throw new StudentBannerConflictError();
    }

    if (!expectedVersion && current) {
      throw new StudentBannerConflictError();
    }

    const now = new Date();
    let config;

    if (current) {
      const updated = await tx.systemConfig.updateMany({
        data: {
          configValue: banners as unknown as Prisma.InputJsonValue,
          updatedAt: now,
          updatedByUserId: actorUserId,
        },
        where: {
          configKey: STUDENT_BANNERS_CONFIG_KEY,
          updatedAt: current.updatedAt,
        },
      });

      if (updated.count !== 1) {
        throw new StudentBannerConflictError();
      }

      config = await tx.systemConfig.findUniqueOrThrow({
        where: { id: current.id },
      });
    } else {
      try {
        config = await tx.systemConfig.create({
          data: {
            configKey: STUDENT_BANNERS_CONFIG_KEY,
            configValue: banners as unknown as Prisma.InputJsonValue,
            updatedByUserId: actorUserId,
          },
        });
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
          throw new StudentBannerConflictError();
        }

        throw error;
      }
    }

    await tx.auditLog.create({
      data: {
        action: "student_banners_updated",
        actorUserId,
        metadata: {
          bannerKeys: Object.keys(banners),
          configKey: STUDENT_BANNERS_CONFIG_KEY,
        },
        targetId: config.id,
        targetType: "system_config",
      },
    });

    return {
      banners: normalizeStudentBanners(config.configValue),
      updatedAt: config.updatedAt.toISOString(),
    };
  });
}

export {
  getStudentBannerContents,
  getStudentBannerSnapshot,
  StudentBannerConflictError,
  updateStudentBannerContents,
};

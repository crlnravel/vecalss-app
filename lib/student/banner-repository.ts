import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  normalizeStudentBanners,
  STUDENT_BANNERS_CONFIG_KEY,
} from "./banner-content";
import type { StudentBannerSet } from "./banner-content";

async function getStudentBannerContents() {
  const config = await prisma.systemConfig.findUnique({
    select: { configValue: true },
    where: { configKey: STUDENT_BANNERS_CONFIG_KEY },
  });

  return normalizeStudentBanners(config?.configValue);
}

async function updateStudentBannerContents({
  actorUserId,
  banners,
}: {
  actorUserId: string;
  banners: StudentBannerSet;
}) {
  return prisma.$transaction(async (tx) => {
    const config = await tx.systemConfig.upsert({
      create: {
        configKey: STUDENT_BANNERS_CONFIG_KEY,
        configValue: banners as unknown as Prisma.InputJsonValue,
        updatedByUserId: actorUserId,
      },
      update: {
        configValue: banners as unknown as Prisma.InputJsonValue,
        updatedByUserId: actorUserId,
      },
      where: { configKey: STUDENT_BANNERS_CONFIG_KEY },
    });

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

    return normalizeStudentBanners(config.configValue);
  });
}

export { getStudentBannerContents, updateStudentBannerContents };

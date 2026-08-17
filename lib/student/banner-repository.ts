import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  normalizeStudentBanners,
  STUDENT_BANNER_KEYS,
  STUDENT_BANNERS_CONFIG_KEY,
} from "./banner-content";
import type { StudentBannerSet } from "./banner-content";

class StudentBannerConflictError extends Error {
  constructor() {
    super("Student banner copy changed since this editor was opened.");
    this.name = "StudentBannerConflictError";
  }
}

class StudentBannerDraftMismatchError extends Error {
  constructor() {
    super("The submitted banner copy does not match the saved draft.");
    this.name = "StudentBannerDraftMismatchError";
  }
}

function studentBannerSetsEqual(left: StudentBannerSet, right: StudentBannerSet) {
  return STUDENT_BANNER_KEYS.every((key) => (
    left[key].title === right[key].title
    && left[key].description === right[key].description
  ));
}

function readExpectedVersion(expectedVersion: string | null) {
  if (!expectedVersion) {
    return null;
  }

  const expectedTime = new Date(expectedVersion);
  return Number.isNaN(expectedTime.getTime()) ? null : expectedTime;
}

function getDraftVersion({
  draftUpdatedAt,
  updatedAt,
}: {
  draftUpdatedAt: Date | null;
  updatedAt: Date;
}) {
  return draftUpdatedAt ?? updatedAt;
}

function hasExpectedVersion({
  currentVersion,
  expectedVersion,
}: {
  currentVersion: Date;
  expectedVersion: string | null;
}) {
  const expectedTime = readExpectedVersion(expectedVersion);
  return Boolean(expectedVersion && expectedTime && currentVersion.getTime() === expectedTime.getTime());
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

async function getStudentBannerSnapshot() {
  const config = await prisma.systemConfig.findUnique({
    select: {
      configValue: true,
      draftValue: true,
      draftUpdatedAt: true,
      publishedAt: true,
      updatedAt: true,
    },
    where: { configKey: STUDENT_BANNERS_CONFIG_KEY },
  });
  const published = normalizeStudentBanners(config?.configValue);
  const draft = normalizeStudentBanners(config?.draftValue ?? config?.configValue);
  const draftVersion = config ? getDraftVersion(config) : null;

  return {
    banners: draft,
    draft,
    draftVersion: draftVersion?.toISOString() ?? null,
    hasUnpublishedChanges: !studentBannerSetsEqual(draft, published),
    published,
    publishedAt: config?.publishedAt?.toISOString() ?? config?.updatedAt.toISOString() ?? null,
    version: draftVersion?.toISOString() ?? null,
  };
}

async function getStudentBannerContents() {
  const config = await prisma.systemConfig.findUnique({
    select: { configValue: true },
    where: { configKey: STUDENT_BANNERS_CONFIG_KEY },
  });

  return normalizeStudentBanners(config?.configValue);
}

async function saveStudentBannerDraft({
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
      select: {
        configValue: true,
        draftUpdatedAt: true,
        id: true,
        updatedAt: true,
      },
      where: { configKey: STUDENT_BANNERS_CONFIG_KEY },
    });

    if (current) {
      if (!hasExpectedVersion({
        currentVersion: getDraftVersion(current),
        expectedVersion,
      })) {
        throw new StudentBannerConflictError();
      }
    } else if (expectedVersion) {
      throw new StudentBannerConflictError();
    }

    const now = new Date();
    let config;

    if (current) {
      const updated = await tx.systemConfig.updateMany({
        data: {
          draftUpdatedAt: now,
          draftUpdatedByUserId: actorUserId,
          draftValue: banners as unknown as Prisma.InputJsonValue,
        },
        where: {
          configKey: STUDENT_BANNERS_CONFIG_KEY,
          draftUpdatedAt: current.draftUpdatedAt,
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
            configValue: normalizeStudentBanners(undefined) as unknown as Prisma.InputJsonValue,
            draftUpdatedAt: now,
            draftUpdatedByUserId: actorUserId,
            draftValue: banners as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new StudentBannerConflictError();
        }

        throw error;
      }
    }

    await tx.auditLog.create({
      data: {
        action: "student_banners_draft_saved",
        actorUserId,
        metadata: {
          bannerKeys: [...STUDENT_BANNER_KEYS],
          configKey: STUDENT_BANNERS_CONFIG_KEY,
        },
        targetId: config.id,
        targetType: "system_config",
      },
    });

    const published = normalizeStudentBanners(config.configValue);
    const draft = normalizeStudentBanners(config.draftValue ?? config.configValue);

    return {
      banners: draft,
      draftVersion: getDraftVersion(config).toISOString(),
      hasUnpublishedChanges: !studentBannerSetsEqual(draft, published),
    };
  });
}

async function publishStudentBannerContents({
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
      select: {
        configValue: true,
        draftUpdatedAt: true,
        draftValue: true,
        id: true,
        updatedAt: true,
      },
      where: { configKey: STUDENT_BANNERS_CONFIG_KEY },
    });

    if (current) {
      if (!hasExpectedVersion({
        currentVersion: getDraftVersion(current),
        expectedVersion,
      })) {
        throw new StudentBannerConflictError();
      }
    } else if (expectedVersion) {
      throw new StudentBannerConflictError();
    }

    const draft = current
      ? normalizeStudentBanners(current.draftValue ?? current.configValue)
      : banners;

    if (current && !studentBannerSetsEqual(draft, banners)) {
      throw new StudentBannerDraftMismatchError();
    }

    const now = new Date();
    let config;

    if (current) {
      const updated = await tx.systemConfig.updateMany({
        data: {
          configValue: draft as unknown as Prisma.InputJsonValue,
          draftUpdatedAt: null,
          draftUpdatedByUserId: null,
          draftValue: Prisma.DbNull,
          publishedAt: now,
          publishedByUserId: actorUserId,
          updatedAt: now,
          updatedByUserId: actorUserId,
        },
        where: {
          configKey: STUDENT_BANNERS_CONFIG_KEY,
          draftUpdatedAt: current.draftUpdatedAt,
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
            publishedAt: now,
            publishedByUserId: actorUserId,
            updatedByUserId: actorUserId,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new StudentBannerConflictError();
        }

        throw error;
      }
    }

    await tx.auditLog.create({
      data: {
        action: "student_banners_published",
        actorUserId,
        metadata: {
          bannerKeys: [...STUDENT_BANNER_KEYS],
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
  StudentBannerDraftMismatchError,
  publishStudentBannerContents,
  saveStudentBannerDraft,
};

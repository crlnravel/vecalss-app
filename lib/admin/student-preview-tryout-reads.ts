import "server-only";

import {
  ContentStatus,
  Prisma,
  TryoutDeliverySessionStatus,
} from "@/generated/prisma/client";
import type { AdminStudentPreviewContext } from "@/lib/admin/student-preview";
import { PreviewReadBoundary } from "@/lib/admin/preview-read-boundary";
import { sanitizePreviewText } from "@/lib/admin/student-preview-content-contract";
import { prisma } from "@/lib/prisma";
import { getAdminStudentPreviewBannerPresentation } from "@/lib/student/banner-reader";
import type { AdminStudentBannerRequest } from "@/lib/student/banner-reader";
import type { AdminStudentBannerRead } from "@/lib/student/banner-presentation";
import type { StudentBannerVariables } from "@/lib/student/banner-content";
import { getStudentBannerVariablesForUser } from "@/lib/student/banner-variables";

import {
  getPreviewTryoutScheduleStatus,
  isUuid,
  type PreviewTryoutScheduleStatus,
} from "./student-preview-tryout-contract";

type AdminPreviewTryoutSchedule = {
  availableFrom: string;
  availableUntil: string;
  id: string;
  name: string;
  scheduleStatus: Exclude<PreviewTryoutScheduleStatus, "draft">;
};

type AdminPreviewTryoutSection = {
  durationSeconds: number;
  instructions: string | null;
  questionCount: number;
  sequenceNo: number;
  testType: "cbt" | "cat";
  title: string;
};

type AdminPreviewTryout = {
  admission: {
    status: "active" | "pending" | "rejected" | "revoked" | null;
  };
  description: string | null;
  id: string;
  schedule: AdminPreviewTryoutSchedule[];
  sections: AdminPreviewTryoutSection[];
  title: string;
};

type AdminPreviewTryoutRead = {
  banner: AdminStudentBannerRead;
  bannerVariables: StudentBannerVariables;
  tryouts: AdminPreviewTryout[];
};

const previewTryoutSelect = {
  admissions: {
    select: { status: true },
  },
  deliverySessions: {
    orderBy: { availableFrom: "asc" as const },
    select: {
      availableFrom: true,
      availableUntil: true,
      id: true,
      name: true,
      status: true,
    },
    where: {
      status: { in: [TryoutDeliverySessionStatus.active, TryoutDeliverySessionStatus.closed, TryoutDeliverySessionStatus.archived] },
    },
  },
  description: true,
  id: true,
  sections: {
    orderBy: { sequenceNo: "asc" as const },
    select: {
      durationSeconds: true,
      instructions: true,
      questionCount: true,
      sequenceNo: true,
      testType: true,
      title: true,
    },
  },
  title: true,
} satisfies Prisma.TryoutPackageSelect;

type PreviewTryoutRecord = Prisma.TryoutPackageGetPayload<{
  select: typeof previewTryoutSelect;
}>;

function serializePreviewTryout(
  tryout: PreviewTryoutRecord,
  now = new Date(),
): AdminPreviewTryout {
  const admission = tryout.admissions[0] ?? null;
  const admissionStatus = admission?.status ?? null;

  return {
    admission: { status: admissionStatus },
    description: sanitizePreviewText(tryout.description) || null,
    id: tryout.id,
    schedule: tryout.deliverySessions.map((session) => ({
      availableFrom: session.availableFrom.toISOString(),
      availableUntil: session.availableUntil.toISOString(),
      id: session.id,
      name: sanitizePreviewText(session.name) || "Sesi Tryout",
      scheduleStatus: getPreviewTryoutScheduleStatus(session, now) as Exclude<PreviewTryoutScheduleStatus, "draft">,
    })),
    sections: tryout.sections.map((section) => ({
      durationSeconds: section.durationSeconds,
      instructions: sanitizePreviewText(section.instructions) || null,
      questionCount: section.questionCount,
      sequenceNo: section.sequenceNo,
      testType: section.testType,
      title: sanitizePreviewText(section.title) || `Test ${section.sequenceNo}`,
    })),
    title: sanitizePreviewText(tryout.title) || "Tryout tanpa judul",
  };
}

async function readAdminPreviewTryouts(
  context: AdminStudentPreviewContext,
  tryoutId?: string,
) {
  const records = await prismaTryoutFindMany(tryoutId, context.student.id);
  return records.map((tryout) => serializePreviewTryout(tryout));
}

async function prismaTryoutFindMany(tryoutId: string | undefined, previewStudentId: string) {
  return prisma.tryoutPackage.findMany({
    select: {
      ...previewTryoutSelect,
      admissions: {
        ...previewTryoutSelect.admissions,
        where: { studentId: previewStudentId },
      },
    },
    orderBy: { updatedAt: "desc" },
    where: {
      ...(tryoutId ? { id: tryoutId } : {}),
      isHidden: false,
      status: ContentStatus.published,
    },
  });
}

async function getAdminPreviewTryoutCatalogue(
  bannerRequest: AdminStudentBannerRequest = { mode: "published" },
) {
  return PreviewReadBoundary.run(async (context) => {
    const [tryouts, banner, bannerVariables] = await Promise.all([
      readAdminPreviewTryouts(context),
      getAdminStudentPreviewBannerPresentation("tryout", bannerRequest),
      getStudentBannerVariablesForUser(context.student.id, context.student.displayName),
    ]);
    return { banner, bannerVariables, tryouts } satisfies AdminPreviewTryoutRead;
  });
}

async function getAdminPreviewTryoutDetail(tryoutId: string) {
  if (!isUuid(tryoutId)) {
    return PreviewReadBoundary.run(async () => null);
  }

  return PreviewReadBoundary.run(async (context) => {
    const [tryout] = await readAdminPreviewTryouts(context, tryoutId);
    return tryout ?? null;
  });
}

export {
  getAdminPreviewTryoutCatalogue,
  getAdminPreviewTryoutDetail,
  serializePreviewTryout,
};

export type {
  AdminPreviewTryout,
  AdminPreviewTryoutRead,
  AdminPreviewTryoutSchedule,
  AdminPreviewTryoutSection,
};

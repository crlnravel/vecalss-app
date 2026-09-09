import "server-only";

import {
  ContentStatus,
  Prisma,
  TryoutAssignmentStatus,
  TryoutDeliverySessionStatus,
} from "@/generated/prisma/client";
import type { AdminStudentPreviewContext } from "@/lib/admin/student-preview";
import { PreviewReadBoundary } from "@/lib/admin/preview-read-boundary";
import { sanitizePreviewText } from "@/lib/admin/student-preview-content-contract";
import { prisma } from "@/lib/prisma";
import { getAdminStudentPreviewBannerPresentation } from "@/lib/student/banner-reader";
import type { AdminStudentBannerRequest } from "@/lib/student/banner-reader";
import type { AdminStudentBannerRead } from "@/lib/student/banner-presentation";

import {
  AdminPreviewTryoutRestartError,
  assertPreviewAssignmentInvariant,
} from "./student-preview-tryout";
import {
  getPreviewTryoutScheduleStatus,
  isEligiblePreviewTryoutSource,
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

type AdminPreviewTryoutAssignment = {
  assignedAt: string;
  deliverySessionId: string;
  id: string;
  name: string;
  scheduleStatus: Exclude<PreviewTryoutScheduleStatus, "draft">;
  status: "active" | "superseded";
};

type AdminPreviewTryout = {
  admission: {
    status: "active" | "pending" | "rejected" | "revoked" | null;
  };
  assignments: {
    current: AdminPreviewTryoutAssignment | null;
    history: AdminPreviewTryoutAssignment[];
  };
  description: string | null;
  id: string;
  restart: {
    currentAssignmentId: string | null;
    enabled: boolean;
    eligibleSourceSessionIds: string[];
    reason: "admission_repair_required" | "assignment_invariant" | "no_safe_source" | null;
  };
  schedule: AdminPreviewTryoutSchedule[];
  sections: AdminPreviewTryoutSection[];
  title: string;
};

type AdminPreviewTryoutRead = {
  banner: AdminStudentBannerRead;
  tryouts: AdminPreviewTryout[];
};

const previewTryoutSelect = {
  admissions: {
    include: {
      assignments: {
        include: {
          deliverySession: {
            select: {
              availableFrom: true,
              availableUntil: true,
              id: true,
              name: true,
              status: true,
            },
          },
        },
        orderBy: { assignedAt: "asc" as const },
      },
    },
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

function publicAssignment(
  assignment: {
    assignedAt: Date;
    deliverySession: {
      availableFrom: Date;
      availableUntil: Date;
      id: string;
      name: string;
      status: TryoutDeliverySessionStatus;
    };
    id: string;
    status: TryoutAssignmentStatus;
  },
  now: Date,
): AdminPreviewTryoutAssignment | null {
  const scheduleStatus = getPreviewTryoutScheduleStatus({
    availableFrom: assignment.deliverySession.availableFrom,
    availableUntil: assignment.deliverySession.availableUntil,
    status: assignment.deliverySession.status,
  }, now);
  if (scheduleStatus === "draft") return null;
  if (assignment.status !== TryoutAssignmentStatus.active && assignment.status !== TryoutAssignmentStatus.superseded) return null;

  return {
    assignedAt: assignment.assignedAt.toISOString(),
    deliverySessionId: assignment.deliverySession.id,
    id: assignment.id,
    name: sanitizePreviewText(assignment.deliverySession.name) || "Sesi Tryout",
    scheduleStatus,
    status: assignment.status,
  };
}

function serializePreviewTryout(
  tryout: PreviewTryoutRecord,
  previewStudentId: string,
  now = new Date(),
): AdminPreviewTryout {
  const admission = tryout.admissions[0] ?? null;
  const expectedKey = `admin.student-preview:${previewStudentId}:${tryout.id}`;
  let current: {
    id: string;
    previewCurrentKey: string | null;
    status: TryoutAssignmentStatus;
  } | null = null;
  let assignmentInvariant = false;
  if (admission) {
    try {
      current = assertPreviewAssignmentInvariant(admission.assignments, expectedKey);
    } catch (error) {
      if (!(error instanceof AdminPreviewTryoutRestartError) || error.code !== "preview_assignment_invariant") {
        throw error;
      }
      assignmentInvariant = true;
    }
  }
  const sourceSessions = tryout.deliverySessions.filter((session) => isEligiblePreviewTryoutSource(session, now));
  const assignments = admission
    ? admission.assignments
        .map((assignment) => publicAssignment(assignment, now))
        .filter((assignment): assignment is AdminPreviewTryoutAssignment => Boolean(assignment))
    : [];
  const currentAssignment = current ? assignments.find((assignment) => assignment.id === current.id) ?? null : null;
  const history = assignments.filter((assignment) => assignment.status === "superseded");
  const admissionStatus = admission?.status ?? null;

  return {
    admission: { status: admissionStatus },
    assignments: {
      current: currentAssignment,
      history,
    },
    description: sanitizePreviewText(tryout.description) || null,
    id: tryout.id,
    restart: {
      currentAssignmentId: current?.id ?? null,
      eligibleSourceSessionIds: sourceSessions.map((session) => session.id),
      enabled: !assignmentInvariant && sourceSessions.length > 0 && (admissionStatus === null || admissionStatus === "active"),
      reason: assignmentInvariant
        ? "assignment_invariant"
        : sourceSessions.length === 0
        ? "no_safe_source"
        : admissionStatus !== null && admissionStatus !== "active"
          ? "admission_repair_required"
          : null,
    },
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
  return records.map((tryout) => serializePreviewTryout(tryout, context.student.id));
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
      status: ContentStatus.published,
    },
  });
}

async function getAdminPreviewTryoutCatalogue(
  bannerRequest: AdminStudentBannerRequest = { mode: "published" },
) {
  return PreviewReadBoundary.run(async (context) => {
    const [tryouts, banner] = await Promise.all([
      readAdminPreviewTryouts(context),
      getAdminStudentPreviewBannerPresentation("tryout", bannerRequest),
    ]);
    return { banner, tryouts } satisfies AdminPreviewTryoutRead;
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
  AdminPreviewTryoutAssignment,
  AdminPreviewTryoutRead,
  AdminPreviewTryoutSchedule,
  AdminPreviewTryoutSection,
};

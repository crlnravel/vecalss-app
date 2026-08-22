import "server-only";

import {
  RoleName,
  TryoutAssignmentStatus,
  TryoutDeliverySessionStatus,
  TryoutAdmissionStatus,
  UserStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

class TryoutInvitationPickerError extends Error {}

type InvitationPickerStudent = {
  admission: {
    assignment: {
      availableFrom: string;
      availableUntil: string;
      id: string;
      name: string;
      status: TryoutDeliverySessionStatus;
    } | null;
    id: string;
    status: TryoutAdmissionStatus;
  } | null;
  displayName: string;
  id: string;
};

async function assertOwnedTryout(tryoutId: string, actorId: string) {
  const tryout = await prisma.tryoutPackage.findFirst({
    select: { id: true },
    where: { createdByUserId: actorId, id: tryoutId },
  });

  if (!tryout) {
    throw new TryoutInvitationPickerError("Tryout tidak ditemukan atau tidak dapat diakses.");
  }
}

async function searchTryoutInvitationStudents(
  tryoutId: string,
  actorId: string,
  query: string,
): Promise<InvitationPickerStudent[]> {
  // Keep ownership ahead of every student read. This also means a Kapten
  // cannot use an arbitrary Tryout id as a directory/PII probe.
  await assertOwnedTryout(tryoutId, actorId);

  const normalizedQuery = query.trim().slice(0, 80);
  if (normalizedQuery.length < 2) return [];

  const students = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      studentProfile: { select: { displayName: true } },
      tryoutAdmissions: {
        where: { tryoutId },
        select: {
          assignments: {
            orderBy: { assignedAt: "desc" },
            take: 1,
            where: { status: TryoutAssignmentStatus.active },
            select: {
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
          },
          id: true,
          status: true,
        },
      },
    },
    take: 20,
    where: {
      previewPurpose: null,
      roleAssignments: {
        some: { revokedAt: null, role: RoleName.student },
      },
      softDeletedAt: null,
      status: UserStatus.active,
      studentProfile: {
        is: {
          displayName: { contains: normalizedQuery, mode: "insensitive" },
        },
      },
    },
  });

  return students
    .map((student) => {
      const admission = student.tryoutAdmissions[0] ?? null;
      const assignment = admission?.assignments[0] ?? null;
      const displayName = student.studentProfile?.displayName?.trim();

      return {
        admission: admission
          ? {
              assignment: assignment
                ? {
                    availableFrom: assignment.deliverySession.availableFrom.toISOString(),
                    availableUntil: assignment.deliverySession.availableUntil.toISOString(),
                    id: assignment.deliverySession.id,
                    name: assignment.deliverySession.name,
                    status: assignment.deliverySession.status,
                  }
                : null,
              id: admission.id,
              status: admission.status,
            }
          : null,
        displayName: displayName || "Siswa tanpa nama",
        id: student.id,
      } satisfies InvitationPickerStudent;
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "id"));
}

export {
  searchTryoutInvitationStudents,
  TryoutInvitationPickerError,
};
export type { InvitationPickerStudent };

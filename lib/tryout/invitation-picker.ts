import "server-only";

import { RoleName, UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { selectMainTryoutSession } from "@/lib/tryout/main-session";
import { mentorParticipantIdentity } from "@/lib/tryout/mentor-participant-identity";

class TryoutInvitationPickerError extends Error {}

async function assertOwnedTryout(tryoutId: string, actorId: string) {
  const actor = await prisma.user.findFirst({
    select: { id: true },
    where: { id: actorId, status: UserStatus.active, softDeletedAt: null, roleAssignments: { some: { revokedAt: null, role: { in: [RoleName.tutor, RoleName.admin] } } } },
  });
  if (!actor) throw new TryoutInvitationPickerError("Anda tidak dapat mengakses daftar siswa.");
  const tryout = await prisma.tryoutPackage.findFirst({
    select: { deliverySessions: { select: { id: true, name: true, isDefaultOpenRegistration: true } } },
    where: { createdByUserId: actorId, id: tryoutId },
  });
  if (!tryout) throw new TryoutInvitationPickerError("Tryout tidak ditemukan atau tidak dapat diakses.");
  return tryout;
}

async function searchTryoutInvitationStudents(tryoutId: string, actorId: string, query: string) {
  // Authorization precedes every directory read, including short queries.
  const tryout = await assertOwnedTryout(tryoutId, actorId);
  const normalizedQuery = query.trim().slice(0, 80);
  if (normalizedQuery.length < 2) return [];
  const main = selectMainTryoutSession(tryout.deliverySessions);
  const students = await prisma.user.findMany({
    orderBy: [{ fullName: "asc" }, { email: "asc" }],
    select: {
      id: true, fullName: true, email: true,
      tryoutAdmissions: {
        where: { tryoutId },
        select: {
          id: true, status: true,
          assignments: {
            where: { deliverySessionId: main?.id ?? "00000000-0000-0000-0000-000000000000" },
            select: { id: true, status: true, deliverySessionId: true },
          },
        },
      },
    },
    take: 20,
    where: {
      previewPurpose: null, softDeletedAt: null, status: UserStatus.active,
      studentProfile: { isNot: null },
      roleAssignments: { some: { revokedAt: null, role: RoleName.student } },
      OR: [
        { fullName: { contains: normalizedQuery, mode: "insensitive" } },
        { email: { contains: normalizedQuery, mode: "insensitive" } },
      ],
    },
  });
  return students.map((student) => {
    const admission = student.tryoutAdmissions.at(0);
    return {
      ...mentorParticipantIdentity(student), id: student.id,
      admission: admission ? { id: admission.id, status: admission.status, assignment: admission.assignments.at(0) ?? null } : null,
    };
  });
}

type InvitationPickerStudent = Awaited<ReturnType<typeof searchTryoutInvitationStudents>>[number];
export { searchTryoutInvitationStudents, TryoutInvitationPickerError };
export type { InvitationPickerStudent };

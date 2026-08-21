import type { Metadata } from "next";

import { RoleName, UserStatus } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { NotificationsPageModule } from "@/modules/admin/NotificationsPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kirim Notifikasi | Vecalss LMS",
};

export default async function AdminNotificationsPage() {
  const session = await requireAdminSession();
  const cohortRows = await prisma.cohort.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      students: {
        select: { studentId: true },
        where: {
          leftAt: null,
          student: {
            roleAssignments: {
              some: {
                revokedAt: null,
                role: RoleName.student,
              },
            },
            softDeletedAt: null,
            status: UserStatus.active,
            previewPurpose: null,
          },
        },
      },
    },
    where: { isActive: true },
  });
  const cohorts: Array<{ activeStudentCount: number; id: string; name: string }> = [];
  for (const cohort of cohortRows) {
    const activeStudentCount = new Set(cohort.students.map((student) => student.studentId)).size;
    if (activeStudentCount > 0) {
      cohorts.push({ activeStudentCount, id: cohort.id, name: cohort.name });
    }
  }

  return (
    <NotificationsPageModule
      cohorts={cohorts}
      session={session}
    />
  );
}

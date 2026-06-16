import { RoleName } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { EnrollmentPageModule } from "@/modules/admin/EnrollmentPageModule";

export default async function EnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const resolvedSearchParams = await searchParams;

  const [examEvents, students] = await Promise.all([
    prisma.examEvent.findMany({
      orderBy: [{ examDate: "asc" }, { name: "asc" }],
      where: {
        isActive: true,
      },
    }),
    prisma.user.findMany({
      include: {
        studentProfile: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      where: {
        roleAssignments: {
          some: {
            revokedAt: null,
            role: RoleName.student,
          },
        },
      },
    }),
  ]);

  const error = typeof resolvedSearchParams.error === "string"
    ? resolvedSearchParams.error
    : null;
  const focus = typeof resolvedSearchParams.focus === "string"
    ? resolvedSearchParams.focus
    : null;
  const notice = typeof resolvedSearchParams.notice === "string"
    ? resolvedSearchParams.notice
    : null;

  return (
    <EnrollmentPageModule
      error={error}
      examEvents={examEvents}
      focus={focus}
      notice={notice}
      session={session}
      students={students}
    />
  );
}

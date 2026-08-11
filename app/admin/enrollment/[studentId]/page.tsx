import { notFound } from "next/navigation";

import { EnrollmentHandoffStatus, Prisma, RoleName } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import { buildDirectoryQuery, parseDirectoryQuery, parseUuid } from "@/lib/admin/operations/validation";
import { prisma } from "@/lib/prisma";
import { StudentDetailPageModule } from "@/modules/admin/StudentDetailPageModule";

export const dynamic = "force-dynamic";

function safeBackHref(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("?") || value.length > 320) {
    return "/admin/enrollment";
  }

  const parsed = parseDirectoryQuery(value);
  if (parsed.invalid) {
    return "/admin/enrollment";
  }

  const query = buildDirectoryQuery({
    focus: null,
    page: parsed.page,
    search: parsed.search,
    status: parsed.status,
  });

  return query ? `/admin/enrollment${query}` : "/admin/enrollment";
}

const studentInclude = {
  enrollmentHandoffs: {
    orderBy: { createdAt: "desc" },
    select: {
      expiresAt: true,
      id: true,
      method: true,
      sourceImportRowId: true,
      status: true,
    },
    take: 1,
    where: {
      status: {
        in: [
          EnrollmentHandoffStatus.pending,
          EnrollmentHandoffStatus.released,
          EnrollmentHandoffStatus.expired,
        ],
      },
    },
  },
  studentProfile: {
    include: {
      targetExamEvent: {
        select: {
          examDate: true,
          name: true,
        },
      },
      targetMajor: {
        include: {
          university: {
            select: {
              name: true,
              shortName: true,
            },
          },
        },
      },
      targetUniversity: {
        select: {
          name: true,
          shortName: true,
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const { studentId: rawStudentId } = await params;
  const studentId = parseUuid(rawStudentId);

  if (!studentId) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const studentWhere: Prisma.UserWhereInput = {
    id: studentId,
    roleAssignments: {
      some: {
        revokedAt: null,
        role: RoleName.student,
      },
    },
    softDeletedAt: null,
  };

  const [examEvents, student] = await Promise.all([
    prisma.examEvent.findMany({
      orderBy: [{ examDate: "asc" }, { name: "asc" }],
      where: { isActive: true },
    }),
    prisma.user.findFirst({
      include: studentInclude,
      where: studentWhere,
    }),
  ]);

  if (!student) {
    notFound();
  }

  return (
    <StudentDetailPageModule
      backHref={safeBackHref(resolvedSearchParams.from)}
      error={typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : null}
      examEvents={examEvents}
      notice={typeof resolvedSearchParams.notice === "string" ? resolvedSearchParams.notice : null}
      returnPath={`/admin/enrollment/${student.id}`}
      session={session}
      student={student}
    />
  );
}

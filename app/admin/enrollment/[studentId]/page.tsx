import { notFound } from "next/navigation";

import { Prisma, RoleName } from "@/generated/prisma/client";
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
    addedFrom: parsed.addedFrom,
    addedTo: parsed.addedTo,
    focus: null,
    page: parsed.page,
    search: parsed.search,
    status: parsed.status,
    statuses: parsed.statuses,
  });

  return query ? `/admin/enrollment${query}` : "/admin/enrollment";
}

const studentSelect = {
  createdAt: true,
  email: true,
  fullName: true,
  id: true,
  phone: true,
  status: true,
  studentProfile: {
    select: {
      targetExamEventId: true,
      targetExamEvent: {
        select: {
          examDate: true,
          name: true,
        },
      },
      targetMajor: {
        select: {
          name: true,
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
} satisfies Prisma.UserSelect;

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
      select: studentSelect,
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

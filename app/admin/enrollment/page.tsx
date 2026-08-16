import { EnrollmentHandoffStatus, Prisma, RoleName } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import { parseDirectoryParams } from "@/lib/admin/operations/validation";
import { prisma } from "@/lib/prisma";
import { EnrollmentPageModule } from "@/modules/admin/EnrollmentPageModule";

function startOfDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDate(value: string) {
  const date = startOfDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export default async function EnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const resolvedSearchParams = await searchParams;
  const directory = parseDirectoryParams({
    focus: resolvedSearchParams.focus,
    page: resolvedSearchParams.page,
    q: resolvedSearchParams.q,
    status: resolvedSearchParams.status,
    addedFrom: resolvedSearchParams.addedFrom,
    addedTo: resolvedSearchParams.addedTo,
  });
  const { addedFrom, addedTo, page, search, statuses } = directory;
  const pageSize = 20;
  const studentWhere: Prisma.UserWhereInput = {
    roleAssignments: {
      some: {
        revokedAt: null,
        role: RoleName.student,
      },
    },
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(addedFrom || addedTo
      ? {
          createdAt: {
            ...(addedFrom ? { gte: startOfDate(addedFrom) } : {}),
            ...(addedTo ? { lt: endOfDate(addedTo) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    softDeletedAt: null,
  };
  const [total, students] = await Promise.all([
    prisma.user.count({ where: studentWhere }),
    prisma.user.findMany({
      include: {
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
      },
      orderBy: {
        fullName: "asc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      where: studentWhere,
    }),
  ]);

  const error = directory.invalid
    ? "invalid-directory-query"
    : typeof resolvedSearchParams.error === "string"
    ? resolvedSearchParams.error
    : null;
  const focus = directory.focus;
  const notice = typeof resolvedSearchParams.notice === "string"
    ? resolvedSearchParams.notice
    : null;

  return (
    <EnrollmentPageModule
      error={error}
      focus={focus}
      notice={notice}
      page={page}
      pageCount={Math.max(1, Math.ceil(total / pageSize))}
      session={session}
      search={search}
      addedFrom={addedFrom}
      addedTo={addedTo}
      statusFilters={statuses}
      students={students}
      total={total}
    />
  );
}

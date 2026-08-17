import { EnrollmentHandoffStatus, Prisma, RoleName, UserStatus } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import {
  parseDirectoryParams,
  type DirectorySortDirection,
  type DirectorySortKey,
} from "@/lib/admin/operations/validation";
import { prisma } from "@/lib/prisma";
import { EnrollmentPageModule, type EnrolledStudent } from "@/modules/admin/EnrollmentPageModule";

const TEMPORARY_DEMO_STUDENT_COUNT = 200;
const DEMO_STATUS_CYCLE: UserStatus[] = [
  UserStatus.active,
  UserStatus.disabled,
  UserStatus.locked,
];

function startOfDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDate(value: string) {
  const date = startOfDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function createTemporaryDemoStudents(): EnrolledStudent[] {
  return Array.from({ length: TEMPORARY_DEMO_STUDENT_COUNT }, (_, index) => {
    const sequence = String(index + 1).padStart(3, "0");

    return {
      createdAt: new Date(Date.UTC(2026, 0, 1 + index)),
      email: `demo.student.${sequence}@vecalss.local`,
      fullName: `Demo Student ${sequence}`,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      lastLoginAt: null,
      mustChangePassword: false,
      status: DEMO_STATUS_CYCLE[index % DEMO_STATUS_CYCLE.length],
      enrollmentHandoffs: [],
      studentProfile: null,
      temporary: true,
    };
  });
}

function filterTemporaryDemoStudents(
  students: EnrolledStudent[],
  {
    addedFrom,
    addedTo,
    search,
    statuses,
  }: {
    addedFrom: string | null;
    addedTo: string | null;
    search: string;
    statuses: UserStatus[];
  },
) {
  const searchNeedle = search.toLowerCase();
  const from = addedFrom ? startOfDate(addedFrom) : null;
  const to = addedTo ? endOfDate(addedTo) : null;
  const statusSet = new Set(statuses);

  return students.filter((student) => {
    const matchesSearch = !searchNeedle
      || student.fullName.toLowerCase().includes(searchNeedle)
      || student.email.toLowerCase().includes(searchNeedle);
    const matchesStatus = !statuses.length || statusSet.has(student.status);
    const matchesFrom = !from || student.createdAt >= from;
    const matchesTo = !to || student.createdAt < to;

    return matchesSearch && matchesStatus && matchesFrom && matchesTo;
  });
}

function sortTemporaryDemoStudents(
  students: EnrolledStudent[],
  sort: DirectorySortKey | null,
  direction: DirectorySortDirection,
) {
  const sortKey = sort ?? "student";
  const sortDirection = sort ? direction : "asc";

  return [...students].sort((left, right) => {
    const comparison = sortKey === "email"
      ? left.email.localeCompare(right.email)
      : sortKey === "added"
        ? left.createdAt.getTime() - right.createdAt.getTime()
        : sortKey === "status"
          ? left.status.localeCompare(right.status)
          : left.fullName.localeCompare(right.fullName);

    if (comparison !== 0) {
      return sortDirection === "desc" ? -comparison : comparison;
    }

    return left.id.localeCompare(right.id);
  });
}

function studentOrderBy(
  sort: DirectorySortKey | null,
  direction: DirectorySortDirection,
): Prisma.UserOrderByWithRelationInput[] {
  if (sort === "email") {
    return [{ email: direction }, { fullName: "asc" }, { id: "asc" }];
  }

  if (sort === "added") {
    return [{ createdAt: direction }, { fullName: "asc" }, { id: "asc" }];
  }

  if (sort === "status") {
    return [{ status: direction }, { fullName: "asc" }, { id: "asc" }];
  }

  return [{ fullName: "asc" }, { id: "asc" }];
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
    pageSize: resolvedSearchParams.pageSize,
    q: resolvedSearchParams.q,
    sort: resolvedSearchParams.sort,
    status: resolvedSearchParams.status,
    direction: resolvedSearchParams.direction,
    addedFrom: resolvedSearchParams.addedFrom,
    addedTo: resolvedSearchParams.addedTo,
  });
  const { addedFrom, addedTo, direction, page, pageSize, search, sort, statuses } = directory;
  const demo = resolvedSearchParams.demo === "1";
  const examEvents = await prisma.examEvent.findMany({
    orderBy: [{ examDate: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
    },
    where: {
      isActive: true,
    },
  });
  const error = directory.invalid
    ? "invalid-directory-query"
    : typeof resolvedSearchParams.error === "string"
    ? resolvedSearchParams.error
    : null;
  const focus = directory.focus;
  const notice = typeof resolvedSearchParams.notice === "string"
    ? resolvedSearchParams.notice
    : null;

  if (demo) {
    const demoStudents = sortTemporaryDemoStudents(filterTemporaryDemoStudents(createTemporaryDemoStudents(), {
      addedFrom,
      addedTo,
      search,
      statuses,
    }), sort, direction);
    const total = demoStudents.length;

    return (
      <EnrollmentPageModule
        demo
        error={error}
        examEvents={examEvents}
        focus={focus}
        notice={notice}
        page={page}
        pageCount={Math.max(1, Math.ceil(total / pageSize))}
        pageSize={pageSize}
        session={session}
        search={search}
        sort={sort}
        direction={direction}
        addedFrom={addedFrom}
        addedTo={addedTo}
        statusFilters={statuses}
        students={demoStudents.slice((page - 1) * pageSize, page * pageSize)}
        total={total}
      />
    );
  }

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
      orderBy: studentOrderBy(sort, direction),
      skip: (page - 1) * pageSize,
      take: pageSize,
      where: studentWhere,
    }),
  ]);

  return (
    <EnrollmentPageModule
      demo={false}
      error={error}
      examEvents={examEvents}
      focus={focus}
      notice={notice}
      page={page}
      pageCount={Math.max(1, Math.ceil(total / pageSize))}
      pageSize={pageSize}
      session={session}
      search={search}
      sort={sort}
      direction={direction}
      addedFrom={addedFrom}
      addedTo={addedTo}
      statusFilters={statuses}
      students={students}
      total={total}
    />
  );
}

import { unstable_cache } from "next/cache";

import { EnrollmentHandoffStatus, Prisma, RoleName, UserStatus } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import {
  ADMIN_ACTIVE_EXAM_EVENTS_CACHE_TAG,
  ADMIN_STUDENT_DIRECTORY_CACHE_TAG,
} from "@/lib/admin/operations/directory-cache";
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

type EnrolledStudentProfile = NonNullable<EnrolledStudent["studentProfile"]>;

type CachedEnrolledStudent = {
  createdAt: string;
  email: string;
  fullName: string;
  id: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  status: EnrolledStudent["status"];
  enrollmentHandoffs: Array<{
    expiresAt: string | null;
    method: EnrolledStudent["enrollmentHandoffs"][number]["method"];
    status: EnrolledStudent["enrollmentHandoffs"][number]["status"];
  }>;
  studentProfile: {
    onboardingStatus: EnrolledStudentProfile["onboardingStatus"];
    targetExamEvent: {
      examDate: string | null;
      name: string;
    } | null;
    targetMajor: {
      name: string;
      university: {
        name: string;
        shortName: string | null;
      };
    } | null;
    targetUniversity: {
      name: string;
      shortName: string | null;
    } | null;
  } | null;
};

type CachedStudentDirectoryPage = {
  students: CachedEnrolledStudent[];
  total: number;
};

function buildStudentWhere({
  addedFrom,
  addedTo,
  search,
  statuses,
}: {
  addedFrom: string | null;
  addedTo: string | null;
  search: string;
  statuses: readonly UserStatus[];
}): Prisma.UserWhereInput {
  return {
    roleAssignments: {
      some: {
        revokedAt: null,
        role: RoleName.student,
      },
    },
    ...(statuses.length ? { status: { in: [...statuses] } } : {}),
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
}

function serializeStudent(student: EnrolledStudent): CachedEnrolledStudent {
  return {
    createdAt: student.createdAt.toISOString(),
    email: student.email,
    fullName: student.fullName,
    id: student.id,
    lastLoginAt: student.lastLoginAt?.toISOString() ?? null,
    mustChangePassword: student.mustChangePassword,
    status: student.status,
    enrollmentHandoffs: student.enrollmentHandoffs.map((handoff) => ({
      expiresAt: handoff.expiresAt?.toISOString() ?? null,
      method: handoff.method,
      status: handoff.status,
    })),
    studentProfile: student.studentProfile
      ? {
          onboardingStatus: student.studentProfile.onboardingStatus,
          targetExamEvent: student.studentProfile.targetExamEvent
            ? {
                examDate: student.studentProfile.targetExamEvent.examDate?.toISOString() ?? null,
                name: student.studentProfile.targetExamEvent.name,
              }
            : null,
          targetMajor: student.studentProfile.targetMajor
            ? {
                name: student.studentProfile.targetMajor.name,
                university: {
                  name: student.studentProfile.targetMajor.university.name,
                  shortName: student.studentProfile.targetMajor.university.shortName,
                },
              }
            : null,
          targetUniversity: student.studentProfile.targetUniversity
            ? {
                name: student.studentProfile.targetUniversity.name,
                shortName: student.studentProfile.targetUniversity.shortName,
              }
            : null,
        }
      : null,
  };
}

function hydrateStudents(students: CachedEnrolledStudent[]): EnrolledStudent[] {
  return students.map((student) => ({
    createdAt: new Date(student.createdAt),
    email: student.email,
    fullName: student.fullName,
    id: student.id,
    lastLoginAt: student.lastLoginAt ? new Date(student.lastLoginAt) : null,
    mustChangePassword: student.mustChangePassword,
    status: student.status,
    enrollmentHandoffs: student.enrollmentHandoffs.map((handoff) => ({
      expiresAt: handoff.expiresAt ? new Date(handoff.expiresAt) : null,
      method: handoff.method,
      status: handoff.status,
    })),
    studentProfile: student.studentProfile
      ? {
          onboardingStatus: student.studentProfile.onboardingStatus,
          targetExamEvent: student.studentProfile.targetExamEvent
            ? {
                examDate: student.studentProfile.targetExamEvent.examDate
                  ? new Date(student.studentProfile.targetExamEvent.examDate)
                  : null,
                name: student.studentProfile.targetExamEvent.name,
              }
            : null,
          targetMajor: student.studentProfile.targetMajor
            ? {
                name: student.studentProfile.targetMajor.name,
                university: student.studentProfile.targetMajor.university,
              }
            : null,
          targetUniversity: student.studentProfile.targetUniversity,
        }
      : null,
  }));
}

const getCachedStudentDirectoryPage = unstable_cache(
  async (
    page: number,
    pageSize: number,
    search: string,
    statuses: UserStatus[],
    addedFrom: string | null,
    addedTo: string | null,
    sort: DirectorySortKey | null,
    direction: DirectorySortDirection,
  ): Promise<CachedStudentDirectoryPage> => {
    const where = buildStudentWhere({ addedFrom, addedTo, search, statuses });
    const [total, students] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        select: {
          createdAt: true,
          email: true,
          fullName: true,
          id: true,
          lastLoginAt: true,
          mustChangePassword: true,
          status: true,
          enrollmentHandoffs: {
            orderBy: { createdAt: "desc" },
            select: {
              expiresAt: true,
              method: true,
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
        where,
      }),
    ]);

    return {
      students: students.map(serializeStudent),
      total,
    };
  },
  ["admin-student-directory-page"],
  {
    revalidate: 10,
    tags: [ADMIN_STUDENT_DIRECTORY_CACHE_TAG],
  },
);

const getCachedActiveExamEvents = unstable_cache(
  async () => prisma.examEvent.findMany({
    orderBy: [{ examDate: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
    },
    where: {
      isActive: true,
    },
  }),
  ["admin-active-exam-events"],
  {
    revalidate: 300,
    tags: [ADMIN_ACTIVE_EXAM_EVENTS_CACHE_TAG],
  },
);

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
  const examEvents = await getCachedActiveExamEvents();
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

  const cachedDirectory = await getCachedStudentDirectoryPage(
    page,
    pageSize,
    search,
    [...statuses].sort(),
    addedFrom,
    addedTo,
    sort,
    direction,
  );
  const students = hydrateStudents(cachedDirectory.students);
  const total = cachedDirectory.total;

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

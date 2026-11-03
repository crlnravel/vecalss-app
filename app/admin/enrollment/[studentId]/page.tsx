import { notFound } from "next/navigation";

import { Prisma, RoleName } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import { buildDirectoryQuery, parseDirectoryQuery, parseUuid } from "@/lib/admin/operations/validation";
import { isPaidAccessEnforced } from "@/lib/billing/enforcement";
import { ACCESS_PLANS, accessPlanLabel, getFullAccessEndsAt } from "@/lib/billing/plans";
import { getAccessState, listAccessHistory } from "@/lib/billing/service";
import { prisma } from "@/lib/prisma";
import { ACCESS_EVENT_LABEL } from "@/modules/admin/billing-copy";
import { StudentDetailPageModule } from "@/modules/admin/StudentDetailPageModule";

export const dynamic = "force-dynamic";

function dateTimeLabel(value: Date | null) {
  if (!value) return null;
  const date = value.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta", year: "numeric" });
  const time = value.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(":", ".");
  return `${date}, ${time} WIB`;
}

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
    direction: parsed.direction,
    focus: null,
    page: parsed.page,
    pageSize: parsed.pageSize,
    search: parsed.search,
    sort: parsed.sort,
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
    previewPurpose: null,
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

  const [accessState, accessHistory] = await Promise.all([
    getAccessState(student.id),
    listAccessHistory(student.id),
  ]);
  const fullPlansReady = {
    full_mandiri: getFullAccessEndsAt(ACCESS_PLANS.full_mandiri.fullTarget ?? "mandiri") !== null,
    full_utbk: getFullAccessEndsAt(ACCESS_PLANS.full_utbk.fullTarget ?? "utbk") !== null,
  };

  return (
    <StudentDetailPageModule
      access={{
        endsAtLabel: dateTimeLabel(accessState.endsAt),
        enforced: isPaidAccessEnforced(),
        fullPlansReady,
        history: accessHistory.map((event) => ({
          actorName: event.actorName,
          endsAtLabel: dateTimeLabel(event.endsAt),
          id: event.id,
          label: ACCESS_EVENT_LABEL[event.kind],
          occurredAtLabel: dateTimeLabel(event.occurredAt) ?? "",
          planLabel: event.planCode ? accessPlanLabel(event.planCode) : null,
          reason: event.reason,
        })),
        idempotencyKey: crypto.randomUUID(),
        planLabel: accessState.planCode ? accessPlanLabel(accessState.planCode) : null,
        status: accessState.status,
        studentId: student.id,
      }}
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

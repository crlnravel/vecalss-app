import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { VERA_IDR_PER_USD, VERA_LIMITS } from "@/lib/vera/config";
import { dayWindow, monthWindow, weekWindow } from "@/lib/vera/windows";

/** Most students the per-student table lists, heaviest month first. */
export const ADMIN_USAGE_STUDENT_LIMIT = 100;

const MICRO_USD_PER_USD = 1_000_000;

/**
 * What a usage row cost. A settled row costs what the provider billed. A failed row, a reservation that was never settled, keeps its
 * reserve, the same conservative charge the ledger's spend cap counts. A released row cost nothing.
 */
const BILLED_USD_MICROS = Prisma.sql`CASE WHEN status = 'settled' THEN cost_usd_micros WHEN status = 'failed' THEN reserved_usd_micros ELSE 0 END`;

export type AdminUsageTotals = {
  requests: number;
  credits: number;
  usd: number;
  idr: number;
};

export type AdminStudentUsage = {
  studentId: string;
  name: string;
  email: string;
  /** Credits used in each window, against the hard limit that window enforces. */
  day: { credits: number; limit: number };
  week: { credits: number; limit: number };
  month: { credits: number; limit: number };
  monthUsd: number;
  lastRequestAt: string | null;
};

export type AdminVeraUsage = {
  generatedAt: string;
  today: AdminUsageTotals;
  month: AdminUsageTotals;
  /** Students with at least one billed request this month. */
  activeStudents: number;
  /** Heaviest first, at most ADMIN_USAGE_STUDENT_LIMIT. */
  students: AdminStudentUsage[];
};

type Options = {
  now?: Date;
  /** Limits the totals and the table to these students. The tests use it; the admin pages read every student. */
  studentIds?: string[];
};

/**
 * The admin cost view over the usage ledger. It reads counts, credits and costs only. No prompt, answer, message or document text is
 * selected. A session title counts toward spend but is not a request, and a reservation still in flight counts toward neither.
 */
export async function getAdminVeraUsage({ now = new Date(), studentIds }: Options = {}): Promise<AdminVeraUsage> {
  const dayStart = dayWindow(now).start;
  const weekStart = weekWindow(now).start;
  const monthStart = monthWindow(now).start;
  const [today, month, activeStudents, rows] = await Promise.all([
    totalsSince(dayStart, studentIds),
    totalsSince(monthStart, studentIds),
    activeStudentCount(monthStart, studentIds),
    studentRows({ dayStart, weekStart, monthStart, studentIds }),
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((row) => row.student_id) } },
    select: { id: true, fullName: true, email: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  const students = rows.flatMap((row): AdminStudentUsage[] => {
    const user = byId.get(row.student_id);
    if (!user) return [];
    return [
      {
        studentId: user.id,
        name: user.fullName,
        email: user.email,
        day: { credits: round1(Number(row.day_credits)), limit: VERA_LIMITS.day.hardCredits },
        week: { credits: round1(Number(row.week_credits)), limit: VERA_LIMITS.week.hardCredits },
        month: { credits: round1(Number(row.month_credits)), limit: VERA_LIMITS.month.hardCredits },
        monthUsd: Number(row.month_usd_micros) / MICRO_USD_PER_USD,
        lastRequestAt: row.last_request_at ? row.last_request_at.toISOString() : null,
      },
    ];
  });

  return { generatedAt: now.toISOString(), today, month, activeStudents, students };
}

function studentFilter(studentIds?: string[]) {
  return studentIds ? Prisma.sql`AND student_id = ANY(${studentIds}::uuid[])` : Prisma.empty;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

async function totalsSince(since: Date, studentIds?: string[]): Promise<AdminUsageTotals> {
  const [row] = await prisma.$queryRaw<Array<{ requests: bigint | number; credits: string | number; usd_micros: string | number }>>`
    SELECT
      COUNT(*) FILTER (WHERE kind <> 'title' AND status IN ('settled', 'failed')) AS requests,
      COALESCE(SUM(credits), 0) AS credits,
      COALESCE(SUM(${BILLED_USD_MICROS}), 0) AS usd_micros
    FROM vera_usage_events
    WHERE created_at >= ${since}
      ${studentFilter(studentIds)}
  `;
  const usd = Number(row.usd_micros) / MICRO_USD_PER_USD;
  return { requests: Number(row.requests), credits: round1(Number(row.credits)), usd, idr: usd * VERA_IDR_PER_USD };
}

async function activeStudentCount(since: Date, studentIds?: string[]): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(DISTINCT student_id) AS count
    FROM vera_usage_events
    WHERE created_at >= ${since}
      AND kind <> 'title'
      AND status IN ('settled', 'failed')
      ${studentFilter(studentIds)}
  `;
  return Number(row.count);
}

type StudentRow = {
  student_id: string;
  day_credits: string | number;
  week_credits: string | number;
  month_credits: string | number;
  month_usd_micros: string | number;
  last_request_at: Date | null;
};

async function studentRows({
  dayStart,
  weekStart,
  monthStart,
  studentIds,
}: {
  dayStart: Date;
  weekStart: Date;
  monthStart: Date;
  studentIds?: string[];
}): Promise<StudentRow[]> {
  // The scan starts at the earlier of the week and the month, so a week that began last month keeps its days. Month totals
  // filter on the month alone, and only students with activity this month are listed.
  return prisma.$queryRaw<StudentRow[]>`
    SELECT
      student_id,
      COALESCE(SUM(credits) FILTER (WHERE created_at >= ${dayStart}), 0) AS day_credits,
      COALESCE(SUM(credits) FILTER (WHERE created_at >= ${weekStart}), 0) AS week_credits,
      COALESCE(SUM(credits) FILTER (WHERE created_at >= ${monthStart}), 0) AS month_credits,
      COALESCE(SUM(${BILLED_USD_MICROS}) FILTER (WHERE created_at >= ${monthStart}), 0) AS month_usd_micros,
      MAX(created_at) FILTER (WHERE kind <> 'title' AND status IN ('settled', 'failed')) AS last_request_at
    FROM vera_usage_events
    WHERE created_at >= LEAST(${weekStart}::timestamptz, ${monthStart}::timestamptz)
      ${studentFilter(studentIds)}
    GROUP BY student_id
    HAVING COUNT(*) FILTER (WHERE created_at >= ${monthStart}) > 0
    ORDER BY month_credits DESC, student_id
    LIMIT ${ADMIN_USAGE_STUDENT_LIMIT}
  `;
}

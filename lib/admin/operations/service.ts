import "server-only";

import {
  EnrollmentHandoffStatus,
  EnrollmentImportStatus,
  Prisma,
  RoleName,
  UserStatus,
} from "@/generated/prisma/client";
import { parseDirectoryParams } from "@/lib/admin/operations/validation";
import { prisma } from "@/lib/prisma";

const ATTENTION_HANDOFF_STATUSES = [
  EnrollmentHandoffStatus.pending,
  EnrollmentHandoffStatus.released,
] as const;

const ATTENTION_IMPORT_STATUSES = [
  EnrollmentImportStatus.draft,
  EnrollmentImportStatus.partial,
  EnrollmentImportStatus.failed,
] as const;

const RECENT_IMPORT_STATUSES = [
  EnrollmentImportStatus.draft,
  EnrollmentImportStatus.queued,
  EnrollmentImportStatus.processing,
  EnrollmentImportStatus.completed,
  EnrollmentImportStatus.partial,
  EnrollmentImportStatus.failed,
  EnrollmentImportStatus.cancelled,
] as const;

const ACTIVE_ROLE_ASSIGNMENT = {
  revokedAt: null,
} as const;

type OperationsRole = "student" | "kapten";

type OperationsAttentionItem = {
  createdAt: string;
  detail: string;
  id: string;
  kind: "handoff" | "import";
  label: string;
  status: string;
  statusLabel: string;
  dispatchGeneration?: number;
  sourceImportId?: string | null;
  sourceImportRowId?: string | null;
  title: string;
  href: string;
};

type OperationsAuditItem = {
  action: string;
  actorName: string;
  id: string;
  occurredAt: string;
};

type OperationsRecentImport = {
  createdAt: string;
  href: string;
  id: string;
  rowCount: number;
  role: OperationsRole;
  sourceFilename: string;
  status: string;
  statusLabel: string;
  updatedAt: string;
};

type AdminOperationsSnapshot = {
  counts: {
    activeKapten: number;
    activeStudents: number;
    awaitingHandoff: number;
    importsNeedingReview: number;
  };
  attention: OperationsAttentionItem[];
  attentionTotal: number;
  audits: OperationsAuditItem[];
  lastUpdatedAt: string;
  recentImports: OperationsRecentImport[];
};

type AdminDirectoryEntry = {
  createdAt: string;
  email: string;
  fullName: string;
  id: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  onboardingStatus: string | null;
  role: OperationsRole;
  status: UserStatus;
};

type AdminDirectoryPage = {
  entries: AdminDirectoryEntry[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
};

function formatImportStatus(status: EnrollmentImportStatus) {
  switch (status) {
    case EnrollmentImportStatus.draft:
      return "Draft needs review";
    case EnrollmentImportStatus.partial:
      return "Partially complete";
    case EnrollmentImportStatus.failed:
      return "Import failed";
    case EnrollmentImportStatus.queued:
      return "Queued";
    case EnrollmentImportStatus.processing:
      return "Processing";
    case EnrollmentImportStatus.completed:
      return "Completed";
    case EnrollmentImportStatus.cancelled:
      return "Cancelled";
    default:
      return status;
  }
}

function formatHandoffStatus(status: EnrollmentHandoffStatus) {
  switch (status) {
    case EnrollmentHandoffStatus.pending:
      return "Awaiting release";
    case EnrollmentHandoffStatus.released:
      return "Awaiting acknowledgement";
    default:
      return status.replaceAll("_", " ");
  }
}

function roleForAssignments(assignments: Array<{ role: RoleName }>): OperationsRole | null {
  if (assignments.some((assignment) => assignment.role === RoleName.student)) {
    return "student";
  }

  if (assignments.some((assignment) => assignment.role === RoleName.tutor)) {
    return "kapten";
  }

  return null;
}

async function getAdminOperationsSnapshot(): Promise<AdminOperationsSnapshot> {
  const [
    snapshotClock,
    activeStudents,
    activeKapten,
    awaitingHandoff,
    importsNeedingReview,
    handoffs,
    imports,
    recentImports,
    audits,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ snapshotAt: Date }>>(Prisma.sql`SELECT CURRENT_TIMESTAMP AS "snapshotAt"`),
    prisma.user.count({
      where: {
        roleAssignments: {
          some: {
            ...ACTIVE_ROLE_ASSIGNMENT,
            role: RoleName.student,
          },
        },
        status: UserStatus.active,
        softDeletedAt: null,
      },
    }),
    prisma.user.count({
      where: {
        roleAssignments: {
          some: {
            ...ACTIVE_ROLE_ASSIGNMENT,
            role: RoleName.tutor,
          },
        },
        status: UserStatus.active,
        softDeletedAt: null,
      },
    }),
    prisma.enrollmentHandoff.count({
      where: {
        acknowledgedAt: null,
        status: { in: [...ATTENTION_HANDOFF_STATUSES] },
        user: {
          softDeletedAt: null,
          status: UserStatus.active,
        },
      },
    }),
    prisma.enrollmentImport.count({
      where: { status: { in: [...ATTENTION_IMPORT_STATUSES] } },
    }),
    prisma.enrollmentHandoff.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        createdAt: true,
        id: true,
        method: true,
        sourceImportRow: { select: { importId: true } },
        sourceImportRowId: true,
        status: true,
        user: {
          select: {
            email: true,
            fullName: true,
            id: true,
            roleAssignments: {
              select: { role: true },
              where: { revokedAt: null },
            },
          },
        },
      },
      take: 12,
      where: {
        acknowledgedAt: null,
        status: { in: [...ATTENTION_HANDOFF_STATUSES] },
        user: {
          softDeletedAt: null,
          status: UserStatus.active,
        },
      },
    }),
    prisma.enrollmentImport.findMany({
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: {
        createdAt: true,
        id: true,
        role: true,
        rowCount: true,
        sourceFilename: true,
        status: true,
        dispatchGeneration: true,
      },
      take: 12,
      where: { status: { in: [...ATTENTION_IMPORT_STATUSES] } },
    }),
    prisma.enrollmentImport.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        createdAt: true,
        id: true,
        role: true,
        rowCount: true,
        sourceFilename: true,
        status: true,
        updatedAt: true,
      },
      take: 8,
      where: { status: { in: [...RECENT_IMPORT_STATUSES] } },
    }),
    prisma.auditLog.findMany({
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: {
        action: true,
        actor: { select: { fullName: true } },
        id: true,
        occurredAt: true,
      },
      take: 8,
    }),
  ]);

  const snapshotAt = snapshotClock[0]?.snapshotAt;
  if (!snapshotAt) {
    throw new Error("admin_snapshot_clock_unavailable");
  }

  const handoffAttention: OperationsAttentionItem[] = handoffs.map((handoff) => {
    const role = roleForAssignments(handoff.user.roleAssignments);
    const displayRole = role === "kapten" ? "Kapten" : "Student";
    const method = handoff.method === "invite_link" ? "invite link" : "temporary password";

    return {
      createdAt: handoff.createdAt.toISOString(),
      detail: `${displayRole} · ${method} · ${handoff.user.email}`,
      href: handoff.sourceImportRow?.importId
        ? `/admin/imports?focus=${encodeURIComponent(handoff.sourceImportRow.importId)}`
        : role === "kapten"
          ? `/admin/kapten?focus=${encodeURIComponent(handoff.user.id)}`
          : `/admin/enrollment?focus=${encodeURIComponent(handoff.user.id)}`,
      id: handoff.id,
      kind: "handoff",
      label: "Handoff",
      status: handoff.status,
      statusLabel: formatHandoffStatus(handoff.status),
      sourceImportId: handoff.sourceImportRow?.importId ?? null,
      sourceImportRowId: handoff.sourceImportRowId,
      title: handoff.user.fullName,
    };
  });

  const importAttention: OperationsAttentionItem[] = imports.map((item) => ({
    createdAt: item.createdAt.toISOString(),
    detail: `${item.role === "tutor" ? "Kapten" : "Students"} · ${item.rowCount} rows · ${item.sourceFilename}`,
    href: `/admin/imports?focus=${encodeURIComponent(item.id)}`,
    id: item.id,
    kind: "import",
    label: "Import",
    status: item.status,
    statusLabel: formatImportStatus(item.status),
    dispatchGeneration: item.dispatchGeneration,
    title: item.sourceFilename,
  }));

  return {
    attention: [...handoffAttention, ...importAttention]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, 16),
    attentionTotal: awaitingHandoff + importsNeedingReview,
    audits: audits.map((audit) => ({
      action: audit.action,
      actorName: audit.actor?.fullName ?? "System",
      id: audit.id,
      occurredAt: audit.occurredAt.toISOString(),
    })),
    counts: {
      activeKapten,
      activeStudents,
      awaitingHandoff,
      importsNeedingReview,
    },
    lastUpdatedAt: snapshotAt.toISOString(),
    recentImports: recentImports.map((item) => ({
      createdAt: item.createdAt.toISOString(),
      href: `/admin/imports?focus=${encodeURIComponent(item.id)}`,
      id: item.id,
      rowCount: item.rowCount,
      role: item.role === "tutor" ? "kapten" : "student",
      sourceFilename: item.sourceFilename,
      status: item.status,
      statusLabel: formatImportStatus(item.status),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

async function getAdminDirectoryPage({
  page = 1,
  pageSize = 20,
  query,
  role,
  status,
}: {
  page?: number;
  pageSize?: number;
  query?: string;
  role: OperationsRole;
  status?: UserStatus | "all";
}): Promise<AdminDirectoryPage> {
  const safePageSize = Math.min(Math.max(pageSize, 1), 50);
  const directory = parseDirectoryParams({ page: String(page), q: query, status });
  const safePage = directory.page;
  const normalizedQuery = directory.search;
  const safeStatus = directory.status;
  const roleName = role === "student" ? RoleName.student : RoleName.tutor;
  const where: Prisma.UserWhereInput = {
    roleAssignments: {
      some: {
        revokedAt: null,
        role: roleName,
      },
    },
    ...(safeStatus !== "all" ? { status: safeStatus } : {}),
    ...(normalizedQuery
      ? {
          OR: [
            { email: { contains: normalizedQuery, mode: "insensitive" } },
            { fullName: { contains: normalizedQuery, mode: "insensitive" } },
          ],
        }
      : {}),
    softDeletedAt: null,
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      select: {
        createdAt: true,
        email: true,
        fullName: true,
        id: true,
        lastLoginAt: true,
        mustChangePassword: true,
        roleAssignments: {
          select: { role: true },
          where: { revokedAt: null },
        },
        status: true,
        studentProfile: { select: { onboardingStatus: true } },
      },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
      where,
    }),
  ]);

  return {
    entries: users.map((user) => ({
      createdAt: user.createdAt.toISOString(),
      email: user.email,
      fullName: user.fullName,
      id: user.id,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      mustChangePassword: user.mustChangePassword,
      onboardingStatus: user.studentProfile?.onboardingStatus ?? null,
      role,
      status: user.status,
    })),
    page: safePage,
    pageCount: Math.max(1, Math.ceil(total / safePageSize)),
    pageSize: safePageSize,
    total,
  };
}

export {
  ATTENTION_HANDOFF_STATUSES,
  ATTENTION_IMPORT_STATUSES,
  RECENT_IMPORT_STATUSES,
  getAdminDirectoryPage,
  getAdminOperationsSnapshot,
};
export type {
  AdminDirectoryEntry,
  AdminDirectoryPage,
  AdminOperationsSnapshot,
  OperationsAttentionItem,
  OperationsAuditItem,
  OperationsRecentImport,
  OperationsRole,
};

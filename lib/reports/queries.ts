import "server-only";

import type { MentorReportFeature } from "@/generated/prisma/client";
import { getSessionContext } from "@/lib/auth/session";
import type { SessionContext } from "@/lib/auth/types";
import { prisma } from "@/lib/prisma";

import { hasAdminReportAccess } from "./access";

class AdminReportAccessError extends Error {
  constructor() {
    super("Admin role required to access reports.");
    this.name = "AdminReportAccessError";
  }
}

type AdminReportListItem = {
  authorName: string;
  createdAt: Date;
  feature: MentorReportFeature;
  id: string;
  title: string;
  url: string;
};

type AdminReportDetail = {
  attachments: {
    contentType: string;
    downloadUrl: string;
    fileName: string;
    id: string;
    previewUrl: string;
    sizeBytes: number;
  }[];
  author: {
    email: string;
    id: string;
    name: string;
  };
  createdAt: Date;
  description: string;
  feature: MentorReportFeature;
  id: string;
  title: string;
  url: string;
};

type AdminReportAttachmentAccess = {
  contentType: string;
  fileName: string;
  key: string;
  sizeBytes: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Admin only, and only a session that passed the second factor: the context
 * leaves the admin role out until then. A caller that already holds the session
 * passes it in (the attachment route does); the pages let this read it.
 */
type ReportSession = Pick<SessionContext, "user"> | null;

async function requireAdminReportAccess(suppliedSession?: ReportSession) {
  const session = suppliedSession === undefined ? await getSessionContext() : suppliedSession;
  if (!hasAdminReportAccess(session?.user.roles, session?.user.mustChangePassword)) {
    throw new AdminReportAccessError();
  }
}

async function listAdminReports(session?: ReportSession): Promise<AdminReportListItem[]> {
  await requireAdminReportAccess(session);

  const reports = await prisma.mentorReport.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      author: { select: { fullName: true } },
      createdAt: true,
      feature: true,
      id: true,
      title: true,
      url: true,
    },
  });

  return reports.map(({ author, ...report }) => ({
    ...report,
    authorName: author.fullName,
  }));
}

async function getAdminReportById(reportId: string, session?: ReportSession): Promise<AdminReportDetail | null> {
  await requireAdminReportAccess(session);
  if (!UUID_PATTERN.test(reportId)) return null;

  const report = await prisma.mentorReport.findUnique({
    where: { id: reportId },
    select: {
      author: { select: { email: true, fullName: true, id: true } },
      attachments: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          contentType: true,
          fileName: true,
          id: true,
          sizeBytes: true,
        },
      },
      createdAt: true,
      description: true,
      feature: true,
      id: true,
      title: true,
      url: true,
    },
  });

  if (!report) return null;

  const attachments = report.attachments.map((attachment) => {
    const attachmentUrl = `/api/admin/reports/${report.id}/attachment/${attachment.id}`;
    return {
      contentType: attachment.contentType,
      downloadUrl: `${attachmentUrl}?mode=download`,
      fileName: attachment.fileName,
      id: attachment.id,
      previewUrl: `${attachmentUrl}?mode=preview`,
      sizeBytes: attachment.sizeBytes,
    };
  });

  return {
    attachments,
    author: {
      email: report.author.email,
      id: report.author.id,
      name: report.author.fullName,
    },
    createdAt: report.createdAt,
    description: report.description,
    feature: report.feature,
    id: report.id,
    title: report.title,
    url: report.url,
  };
}

async function getAdminReportAttachmentForAccess(
  reportId: string,
  attachmentId: string,
  session?: ReportSession,
): Promise<AdminReportAttachmentAccess | null> {
  await requireAdminReportAccess(session);
  if (!UUID_PATTERN.test(reportId) || !UUID_PATTERN.test(attachmentId)) {
    return null;
  }

  const attachment = await prisma.mentorReportAttachment.findFirst({
    where: { id: attachmentId, reportId },
    select: {
      contentType: true,
      fileName: true,
      sizeBytes: true,
      storageKey: true,
    },
  });
  if (!attachment) return null;

  return {
    contentType: attachment.contentType,
    fileName: attachment.fileName,
    key: attachment.storageKey,
    sizeBytes: attachment.sizeBytes,
  };
}

export {
  AdminReportAccessError,
  getAdminReportAttachmentForAccess,
  getAdminReportById,
  listAdminReports,
};
export type {
  AdminReportAttachmentAccess,
  ReportSession,
  AdminReportDetail,
  AdminReportListItem,
};

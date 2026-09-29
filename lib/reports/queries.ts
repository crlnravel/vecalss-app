import "server-only";

import type { MentorReportFeature } from "@/generated/prisma/client";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

import { hasDeveloperReportAccess } from "./access";

class DeveloperReportAccessError extends Error {
  constructor() {
    super("Developer role required to access reports.");
    this.name = "DeveloperReportAccessError";
  }
}

type DeveloperReportListItem = {
  authorName: string;
  createdAt: Date;
  feature: MentorReportFeature;
  id: string;
  title: string;
  url: string;
};

type DeveloperReportDetail = {
  attachment: null | {
    contentType: string;
    downloadUrl: string;
    fileName: string;
    sizeBytes: number;
  };
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

type DeveloperReportAttachmentDownload = {
  contentType: string;
  fileName: string;
  key: string;
  sizeBytes: number;
};

async function requireDeveloperReportAccess() {
  const session = await getSessionContext();
  if (!hasDeveloperReportAccess(session?.user.roles, session?.user.mustChangePassword)) {
    throw new DeveloperReportAccessError();
  }
}

async function listDeveloperReports(): Promise<DeveloperReportListItem[]> {
  await requireDeveloperReportAccess();

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

async function getDeveloperReportById(reportId: string): Promise<DeveloperReportDetail | null> {
  await requireDeveloperReportAccess();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(reportId)) {
    return null;
  }

  const report = await prisma.mentorReport.findUnique({
    where: { id: reportId },
    select: {
      attachmentContentType: true,
      attachmentFileName: true,
      attachmentKey: true,
      attachmentSizeBytes: true,
      author: { select: { email: true, fullName: true, id: true } },
      createdAt: true,
      description: true,
      feature: true,
      id: true,
      title: true,
      url: true,
    },
  });

  if (!report) return null;

  const attachment = report.attachmentKey !== null
    && report.attachmentFileName !== null
    && report.attachmentContentType !== null
    && report.attachmentSizeBytes !== null
    ? {
        contentType: report.attachmentContentType,
        downloadUrl: `/api/developer/reports/${report.id}/attachment`,
        fileName: report.attachmentFileName,
        sizeBytes: report.attachmentSizeBytes,
      }
    : null;

  return {
    attachment,
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

async function getDeveloperReportAttachmentForDownload(
  reportId: string,
): Promise<DeveloperReportAttachmentDownload | null> {
  await requireDeveloperReportAccess();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(reportId)) {
    return null;
  }

  const report = await prisma.mentorReport.findUnique({
    where: { id: reportId },
    select: {
      attachmentContentType: true,
      attachmentFileName: true,
      attachmentKey: true,
      attachmentSizeBytes: true,
    },
  });

  if (
    !report
    || report.attachmentKey === null
    || report.attachmentFileName === null
    || report.attachmentContentType === null
    || report.attachmentSizeBytes === null
  ) {
    return null;
  }

  return {
    contentType: report.attachmentContentType,
    fileName: report.attachmentFileName,
    key: report.attachmentKey,
    sizeBytes: report.attachmentSizeBytes,
  };
}

export {
  DeveloperReportAccessError,
  getDeveloperReportAttachmentForDownload,
  getDeveloperReportById,
  listDeveloperReports,
};
export type {
  DeveloperReportAttachmentDownload,
  DeveloperReportDetail,
  DeveloperReportListItem,
};

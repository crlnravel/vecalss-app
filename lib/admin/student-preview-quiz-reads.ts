import "server-only";

import { ContentStatus, Prisma } from "@/generated/prisma/client";
import { getAdminStudentPreviewBannerPresentation } from "@/lib/student/banner-reader";
import type { AdminStudentBannerRequest } from "@/lib/student/banner-reader";
import type { AdminStudentBannerRead } from "@/lib/student/banner-presentation";
import type { StudentBannerVariables } from "@/lib/student/banner-content";
import { prisma } from "@/lib/prisma";
import type { AdminStudentPreviewContext } from "@/lib/admin/student-preview";
import { PreviewReadBoundary } from "@/lib/admin/preview-read-boundary";
import { getStudentBannerVariablesForUser } from "@/lib/student/banner-variables";
import {
  ADMIN_PREVIEW_QUIZ_SUBJECTS,
  assertAdminPreviewQuizPayloadSafe,
  getAdminPreviewQuizSubjectBySlug,
  toAdminPreviewQuizDetail,
  toAdminPreviewQuizSummary,
  type AdminPreviewQuizDetail,
  type AdminPreviewQuizSubjectWithQuizzes,
} from "@/lib/admin/student-preview-quiz-contract";

const previewQuizAssetSelect = {
  libraryScope: true,
  mimeType: true,
  state: true,
  trashedAt: true,
  url: true,
} satisfies Prisma.AssetSelect;

const previewQuizItemSelect = {
  options: {
    orderBy: { sortOrder: "asc" },
    select: {
      asset: { select: previewQuizAssetSelect },
      content: true,
      sortOrder: true,
    },
  },
  prompt: true,
  promptAsset: { select: previewQuizAssetSelect },
  sortOrder: true,
} satisfies Prisma.StandaloneQuizItemSelect;

const previewQuizSelect = {
  closesAt: true,
  description: true,
  items: {
    orderBy: { sortOrder: "asc" },
    select: previewQuizItemSelect,
  },
  opensAt: true,
  slug: true,
  subtest: { select: { code: true, name: true } },
  title: true,
} satisfies Prisma.StandaloneQuizSelect;

type PreviewQuizRecord = Prisma.StandaloneQuizGetPayload<{ select: typeof previewQuizSelect }>;

type AdminPreviewQuizCatalogueRead = {
  subjects: AdminPreviewQuizSubjectWithQuizzes[];
};

type AdminPreviewQuizCatalogueSurfaceRead = AdminPreviewQuizCatalogueRead & {
  banner: AdminStudentBannerRead;
  bannerVariables: StudentBannerVariables;
};

function toContractRecord(record: PreviewQuizRecord) {
  return {
    closesAt: record.closesAt,
    description: record.description,
    items: record.items.map((item) => ({
      options: item.options.map((option) => ({
        asset: option.asset
          ? {
              libraryScope: option.asset.libraryScope,
              mimeType: option.asset.mimeType,
              state: option.asset.state,
              trashedAt: option.asset.trashedAt,
              url: option.asset.url,
            }
          : null,
        content: option.content,
        sortOrder: option.sortOrder,
      })),
      prompt: item.prompt,
      promptAsset: item.promptAsset
        ? {
            libraryScope: item.promptAsset.libraryScope,
            mimeType: item.promptAsset.mimeType,
            state: item.promptAsset.state,
            trashedAt: item.promptAsset.trashedAt,
            url: item.promptAsset.url,
          }
        : null,
      sortOrder: item.sortOrder,
    })),
    opensAt: record.opensAt,
    slug: record.slug,
    subtest: record.subtest,
    title: record.title,
  };
}

async function readPublishedPreviewQuizRecords() {
  return prisma.standaloneQuiz.findMany({
    orderBy: [{ title: "asc" }, { slug: "asc" }],
    select: previewQuizSelect,
    where: { status: ContentStatus.published },
  });
}

function toPreviewQuizSubjects(
  records: PreviewQuizRecord[],
  now = new Date(),
): AdminPreviewQuizSubjectWithQuizzes[] {
  const summaries = records.flatMap((record) => {
    const summary = toAdminPreviewQuizSummary(toContractRecord(record), now);
    return summary ? [summary] : [];
  });

  return ADMIN_PREVIEW_QUIZ_SUBJECTS.flatMap((subject) => {
    const quizzes = summaries.filter((summary) => summary.subject.slug === subject.slug);
    return quizzes.length > 0 ? [{ ...subject, quizzes }] : [];
  });
}

async function readAdminPreviewQuizCatalogue(): Promise<AdminPreviewQuizCatalogueRead> {
  const records = await readPublishedPreviewQuizRecords();
  const subjects = toPreviewQuizSubjects(records);
  subjects.forEach((subject) => assertAdminPreviewQuizPayloadSafe(subject));
  return { subjects };
}

async function readAdminPreviewQuizSubject(slug: string): Promise<AdminPreviewQuizSubjectWithQuizzes | null> {
  const metadata = getAdminPreviewQuizSubjectBySlug(slug);
  if (!metadata) return null;

  const records = await readPublishedPreviewQuizRecords();
  const subject = toPreviewQuizSubjects(records).find((candidate) => candidate.slug === metadata.slug) ?? null;
  if (subject) assertAdminPreviewQuizPayloadSafe(subject);
  return subject;
}

async function readAdminPreviewQuizDetail(subjectSlug: string, quizSlug: string): Promise<AdminPreviewQuizDetail | null> {
  const metadata = getAdminPreviewQuizSubjectBySlug(subjectSlug);
  if (!metadata) return null;

  const record = await prisma.standaloneQuiz.findFirst({
    select: previewQuizSelect,
    where: {
      slug: quizSlug,
      status: ContentStatus.published,
      subtest: { code: metadata.code },
    },
  });
  if (!record) return null;

  const detail = toAdminPreviewQuizDetail(toContractRecord(record));
  if (detail) assertAdminPreviewQuizPayloadSafe(detail);
  return detail;
}

async function readAdminPreviewQuizCatalogueSurface(
  context: AdminStudentPreviewContext,
  bannerRequest: AdminStudentBannerRequest = { mode: "published" },
): Promise<AdminPreviewQuizCatalogueSurfaceRead> {
  const [catalogue, banners, bannerVariables] = await Promise.all([
    readAdminPreviewQuizCatalogue(),
    getAdminStudentPreviewBannerPresentation("kuis", bannerRequest),
    getStudentBannerVariablesForUser(context.student.id, context.student.displayName),
  ]);
  const result = {
    banner: banners,
    bannerVariables,
    subjects: catalogue.subjects,
  } satisfies AdminPreviewQuizCatalogueSurfaceRead;
  assertAdminPreviewQuizPayloadSafe(result.subjects);
  return result;
}

async function getAdminPreviewQuizCatalogue() {
  return PreviewReadBoundary.run(async () => readAdminPreviewQuizCatalogue());
}

async function getAdminPreviewQuizCatalogueSurface(
  bannerRequest: AdminStudentBannerRequest = { mode: "published" },
) {
  return PreviewReadBoundary.run(async (context) => readAdminPreviewQuizCatalogueSurface(context, bannerRequest));
}

async function getAdminPreviewQuizSubject(slug: string) {
  return PreviewReadBoundary.run(async () => readAdminPreviewQuizSubject(slug));
}

async function getAdminPreviewQuizDetail(subjectSlug: string, quizSlug: string) {
  return PreviewReadBoundary.run(async () => readAdminPreviewQuizDetail(subjectSlug, quizSlug));
}

export {
  getAdminPreviewQuizCatalogue,
  getAdminPreviewQuizCatalogueSurface,
  getAdminPreviewQuizDetail,
  getAdminPreviewQuizSubject,
};

export type {
  AdminPreviewQuizCatalogueRead,
  AdminPreviewQuizCatalogueSurfaceRead,
};

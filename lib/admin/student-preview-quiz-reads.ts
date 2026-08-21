import "server-only";

import { ContentStatus, Prisma } from "@/generated/prisma/client";
import { getAdminStudentPreviewBannerContents } from "@/lib/student/banner-repository";
import { prisma } from "@/lib/prisma";
import { PreviewReadBoundary } from "@/lib/admin/preview-read-boundary";
import {
  ADMIN_PREVIEW_QUIZ_SUBJECTS,
  assertAdminPreviewQuizPayloadSafe,
  getAdminPreviewQuizSubjectBySlug,
  sanitizeAdminPreviewQuizBanner,
  toAdminPreviewQuizDetail,
  toAdminPreviewQuizSummary,
  type AdminPreviewQuizDetail,
  type AdminPreviewQuizSubjectWithQuizzes,
  type AdminPreviewQuizSummary,
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
  banner: {
    description: string;
    title: string;
  };
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
  const summaries = records
    .map((record) => toAdminPreviewQuizSummary(toContractRecord(record), now))
    .filter((summary): summary is AdminPreviewQuizSummary => Boolean(summary));

  return ADMIN_PREVIEW_QUIZ_SUBJECTS
    .map((subject) => ({
      ...subject,
      quizzes: summaries.filter((summary) => summary.subject.slug === subject.slug),
    }))
    .filter((subject) => subject.quizzes.length > 0);
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

async function readAdminPreviewQuizCatalogueSurface(): Promise<AdminPreviewQuizCatalogueSurfaceRead> {
  const [catalogue, banners] = await Promise.all([
    readAdminPreviewQuizCatalogue(),
    getAdminStudentPreviewBannerContents(),
  ]);
  const result = {
    banner: sanitizeAdminPreviewQuizBanner(banners.kuis),
    subjects: catalogue.subjects,
  } satisfies AdminPreviewQuizCatalogueSurfaceRead;
  assertAdminPreviewQuizPayloadSafe(result.subjects);
  return result;
}

async function getAdminPreviewQuizCatalogue() {
  return PreviewReadBoundary.run(async () => readAdminPreviewQuizCatalogue());
}

async function getAdminPreviewQuizCatalogueSurface() {
  return PreviewReadBoundary.run(async () => readAdminPreviewQuizCatalogueSurface());
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

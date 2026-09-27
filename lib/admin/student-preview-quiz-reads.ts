import "server-only";

import { ContentStatus, Prisma, StandaloneQuizVersionState } from "@/generated/prisma/client";
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
    // Keep a compatibility fallback for pre-versioned rows only. Once an
    // active snapshot exists, toContractRecord prefers that version below.
    where: { quizVersionId: null },
    select: previewQuizItemSelect,
  },
  opensAt: true,
  slug: true,
  subtest: { select: { code: true, name: true } },
  title: true,
  versions: {
    orderBy: { updatedAt: "desc" },
    select: {
      items: {
        orderBy: { sortOrder: "asc" },
        select: previewQuizItemSelect,
      },
    },
    take: 1,
    where: { state: StandaloneQuizVersionState.active },
  },
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
  const items = record.versions[0]?.items ?? record.items;
  return {
    closesAt: record.closesAt,
    description: record.description,
    items: items.map((item) => ({
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
  // The managed Preview fixture may intentionally contain no published quiz
  // rows. Resolve that empty catalogue before traversing version/item/media
  // relations; this keeps the empty Kuis surface deterministic and avoids a
  // needless nested query over an otherwise empty read.
  const publishedIds = await prisma.standaloneQuiz.findMany({
    orderBy: [{ title: "asc" }, { slug: "asc" }],
    select: { id: true },
    where: { isHidden: false, status: ContentStatus.published },
  });
  if (publishedIds.length === 0) return [];

  return prisma.standaloneQuiz.findMany({
    orderBy: [{ title: "asc" }, { slug: "asc" }],
    select: previewQuizSelect,
    where: { id: { in: publishedIds.map(({ id }) => id) }, isHidden: false },
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

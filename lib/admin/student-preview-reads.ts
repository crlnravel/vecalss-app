import "server-only";

import {
  ContentStatus,
  MediaAssetState,
  MediaLibraryScope,
  ModuleAssetSourceKind,
  ModuleAssetType,
} from "@/generated/prisma/client";
import type { MateriDocument, MateriVideo } from "@/lib/materi/contract";
import {
  isMateriReady,
  isValidHostedPdfUrl,
  readMateriResources,
  type MateriResourceLike,
} from "@/lib/materi/contract";
import { materiSubjects } from "@/lib/materi/repository";
import {
  createMediaPreviewUrl,
  headMediaObject,
  PREVIEW_URL_TTL_SECONDS,
  R2ConfigurationError,
} from "@/lib/media/r2";
import { prisma } from "@/lib/prisma";
import {
  getAdminStudentPreviewBannerSnapshot,
} from "@/lib/student/banner-repository";
import { getAdminStudentPreviewBannerPresentation } from "@/lib/student/banner-reader";
import type { AdminStudentBannerRequest } from "@/lib/student/banner-reader";
import type { AdminStudentBannerRead } from "@/lib/student/banner-presentation";
import { buildStudentBannerVariables, type StudentBannerVariables } from "@/lib/student/banner-content";
import { getStudentBannerVariablesForUser } from "@/lib/student/banner-variables";
import type { AdminStudentPreviewContext } from "@/lib/admin/student-preview";
import {
  sanitizePreviewFileName,
  sanitizePreviewText,
  sanitizePreviewVideo,
} from "@/lib/admin/student-preview-content-contract";

import { PreviewReadBoundary } from "./preview-read-boundary";

const PREVIEW_DOCUMENT_MIME_TYPE = "application/pdf" as const;

type AdminPreviewBerandaRead = {
  banner: AdminStudentBannerRead;
  bannerVariables: StudentBannerVariables;
  firstName: string;
  profile: {
    displayName: string;
    examDaysLeft: number | null;
    examDate: string | null;
    targetMajor: string | null;
    targetUniversity: string | null;
  };
};

type AdminPreviewBannerEditorRead = Awaited<ReturnType<typeof getAdminStudentPreviewBannerSnapshot>>;

type AdminPreviewContentBlock = {
  body: string;
  title: string | null;
};

type AdminPreviewMateriLesson = {
  code: string;
  content: AdminPreviewContentBlock[];
  document: MateriDocument;
  optionalVideo: MateriVideo | null;
  position: number;
  sequenceNo: number;
  summary: string | null;
  title: string;
};

type AdminPreviewMateriCourse = {
  code: string;
  lessons: AdminPreviewMateriLesson[];
  name: string;
  slug: string;
  sortOrder: number;
};

type AdminPreviewMateriCatalogueRead = {
  banner: AdminStudentBannerRead;
  bannerVariables: StudentBannerVariables;
  courses: AdminPreviewMateriCourse[];
};

type AdminPreviewMateriDocumentDelivery = {
  documentUrl: string;
  downloadUrl?: string;
  expiresInSeconds: number | null;
  managedAssetId: string | null;
  mimeType: typeof PREVIEW_DOCUMENT_MIME_TYPE;
  originalName: string | null;
  sourceKind: "hosted" | "managed";
};

type AdminStudentPreviewDocumentErrorCode =
  | "missing"
  | "not_found"
  | "replaced"
  | "unavailable";

class AdminStudentPreviewDocumentError extends Error {
  readonly code: AdminStudentPreviewDocumentErrorCode;
  readonly status: number;

  constructor(
    code: AdminStudentPreviewDocumentErrorCode,
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "AdminStudentPreviewDocumentError";
    this.code = code;
    this.status = status;
  }
}

function toPreviewDocument(document: MateriDocument): MateriDocument {
  return {
    managedAssetId: document.managedAssetId,
    mimeType: PREVIEW_DOCUMENT_MIME_TYPE,
    originalName: sanitizePreviewFileName(document.originalName),
    sourceKind: document.sourceKind,
    // Delivery is always resolved through the admin-preview route. Keeping
    // the stored hosted URL out of client props prevents a stale page from
    // bypassing the current publication/feature-flag boundary.
    url: null,
  };
}

function toPreviewLesson(
  lesson: {
    assets: Array<MateriResourceLike & { bodyText?: string | null; title?: string | null }>;
    code: string;
    sequenceNo: number;
    summary: string | null;
    title: string;
  },
  position: number,
): AdminPreviewMateriLesson | null {
  const resources = readMateriResources(lesson.assets);
  if (!resources.document || !isMateriReady(lesson.title, resources)) return null;

  const content = lesson.assets.flatMap((asset) => {
    if (asset.assetType !== ModuleAssetType.text && asset.assetType !== ModuleAssetType.example) return [];
    const body = sanitizePreviewText(asset.bodyText);
    return body.length > 0
      ? [{ body, title: sanitizePreviewText(asset.title) || null }]
      : [];
  });

  const optionalVideo = resources.video
    ? sanitizePreviewVideo(resources.video.mediaUrl)
    : null;

  if (optionalVideo && resources.video) {
    optionalVideo.durationSeconds = resources.video.durationSeconds;
  }

  return {
    code: lesson.code,
    content,
    document: toPreviewDocument(resources.document),
    optionalVideo,
    position,
    sequenceNo: lesson.sequenceNo,
    summary: sanitizePreviewText(lesson.summary) || null,
    title: sanitizePreviewText(lesson.title) || "Materi tanpa judul",
  };
}

async function readAdminPreviewBeranda(
  context: AdminStudentPreviewContext,
  bannerRequest: AdminStudentBannerRequest = { mode: "published" },
): Promise<AdminPreviewBerandaRead> {
  const [profile, banner] = await Promise.all([
    prisma.studentProfile.findUnique({
      select: {
        displayName: true,
        targetExamEvent: { select: { examDate: true } },
        targetMajor: { select: { name: true } },
        targetUniversity: { select: { name: true, shortName: true } },
        timezone: true,
      },
      where: { userId: context.student.id },
    }),
    getAdminStudentPreviewBannerPresentation("beranda", bannerRequest),
  ]);

  const displayName = sanitizePreviewText(profile?.displayName) || sanitizePreviewText(context.student.displayName) || "Voyager";
  const targetMajor = sanitizePreviewText(profile?.targetMajor?.name) || null;
  const targetUniversity = sanitizePreviewText(profile?.targetUniversity?.shortName || profile?.targetUniversity?.name) || null;
  const bannerVariables = buildStudentBannerVariables({
    fullName: displayName,
    targetMajor,
    targetUniversity,
  });

  return {
    banner,
    bannerVariables,
    firstName: bannerVariables.firstName ?? "Voyager",
    profile: {
      displayName,
      examDaysLeft: profile?.targetExamEvent?.examDate
        ? Math.max(0, Math.ceil((profile.targetExamEvent.examDate.getTime() - Date.now()) / 86_400_000))
        : null,
      examDate: profile?.targetExamEvent?.examDate?.toISOString() ?? null,
      targetMajor,
      targetUniversity,
    },
  };
}

async function readAdminPreviewMateriCatalogue(): Promise<AdminPreviewMateriCourse[]> {
  const subjectCodes = materiSubjects.map((subject) => subject.code);
  const topicCodes = materiSubjects.flatMap(({ slug }) => (
    [1, 2, 3].map((sectionNo) => `materi:${slug}:section-${sectionNo}`)
  ));
  const subtests = await prisma.subtest.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      code: true,
      name: true,
      sortOrder: true,
      topics: {
        where: { code: { in: topicCodes }, isActive: true, parentTopicId: null },
        orderBy: { sortOrder: "asc" },
        select: {
          code: true,
          modules: {
            orderBy: [{ sequenceNo: "asc" }, { code: "asc" }],
            select: {
              assets: {
                orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
                select: {
                  assetType: true,
                  bodyText: true,
                  durationSeconds: true,
                  managedAssetId: true,
                  managedAsset: {
                    select: {
                      libraryScope: true,
                      mimeType: true,
                      objectKey: true,
                      originalName: true,
                      state: true,
                      trashedAt: true,
                      url: true,
                    },
                  },
                  mediaUrl: true,
                  mimeType: true,
                  originalName: true,
                  sourceKind: true,
                  title: true,
                },
                where: { assetType: { in: [ModuleAssetType.text, ModuleAssetType.example, ModuleAssetType.video, ModuleAssetType.attachment] } },
              },
              code: true,
              sequenceNo: true,
              status: true,
              summary: true,
              title: true,
            },
            where: {
              assets: { some: { assetType: ModuleAssetType.attachment } },
              status: ContentStatus.published,
            },
          },
        },
      },
    },
    where: { code: { in: subjectCodes }, isActive: true },
  });

  const subtestsByCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
  const topicCodeSet = new Set(topicCodes);

  return materiSubjects.flatMap((subject) => {
    const subtest = subtestsByCode.get(subject.code);
    if (!subtest) return [];

    const lessons = subtest.topics
      .flatMap((topic) => topicCodeSet.has(topic.code) ? topic.modules : [])
      .sort((left, right) => left.sequenceNo - right.sequenceNo || left.code.localeCompare(right.code))
      .flatMap((lesson, position) => {
        const preview = toPreviewLesson(lesson, position);
        return preview ? [preview] : [];
      });

    return [{
      code: subject.code,
      lessons,
      name: sanitizePreviewText(subtest.name) || subject.code,
      slug: subject.slug,
      sortOrder: subtest.sortOrder,
    }];
  });
}

async function readAdminPreviewMateriCourse(
  context: AdminStudentPreviewContext,
  slug: string,
): Promise<AdminPreviewMateriCourse | undefined> {
  void context;
  const catalogue = await readAdminPreviewMateriCatalogue();
  return catalogue.find((course) => course.slug === slug);
}

async function getAdminPreviewBeranda(
  bannerRequest: AdminStudentBannerRequest = { mode: "published" },
) {
  return PreviewReadBoundary.run((context) => readAdminPreviewBeranda(context, bannerRequest));
}

/**
 * Drafts are exposed only through this explicit editor loader. It remains
 * behind the preview capability boundary and the repository loader is
 * uncached, so draft JSON cannot contaminate published student responses.
 */
async function getAdminPreviewBannerEditor() {
  return PreviewReadBoundary.run(async () => getAdminStudentPreviewBannerSnapshot());
}

async function getAdminPreviewMateriCatalogue() {
  return PreviewReadBoundary.run(readAdminPreviewMateriCatalogue);
}

async function getAdminPreviewMateriCatalogueSurface(
  bannerRequest: AdminStudentBannerRequest = { mode: "published" },
) {
  return PreviewReadBoundary.run(async (context) => {
    const [courses, banner, bannerVariables] = await Promise.all([
      readAdminPreviewMateriCatalogue(),
      getAdminStudentPreviewBannerPresentation("materi", bannerRequest),
      getStudentBannerVariablesForUser(context.student.id, context.student.displayName),
    ]);
    return { banner, bannerVariables, courses } satisfies AdminPreviewMateriCatalogueRead;
  });
}

async function getAdminPreviewMateriCourse(slug: string) {
  return PreviewReadBoundary.run((context) => readAdminPreviewMateriCourse(context, slug));
}

async function getAdminPreviewMateriLesson(slug: string, lessonCode: string) {
  return PreviewReadBoundary.run(async (context) => {
    const course = await readAdminPreviewMateriCourse(context, slug);
    return {
      course,
      lesson: course?.lessons.find((lesson) => lesson.code === lessonCode),
    };
  });
}

async function resolveAdminPreviewMateriDocument({
  courseSlug,
  expectedManagedAssetId,
  lessonCode,
}: {
  courseSlug: string;
  expectedManagedAssetId?: string | null;
  lessonCode: string;
}): Promise<AdminPreviewMateriDocumentDelivery> {
  const subject = materiSubjects.find((candidate) => candidate.slug === courseSlug);
  if (!subject) {
    throw new AdminStudentPreviewDocumentError("not_found", "Materi tidak ditemukan.", 404);
  }

  const lesson = await prisma.module.findFirst({
    select: {
      assets: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          managedAssetId: true,
          managedAsset: {
            select: {
              libraryScope: true,
              mimeType: true,
              objectKey: true,
              originalName: true,
              sizeBytes: true,
              state: true,
              trashedAt: true,
            },
          },
          mediaUrl: true,
          mimeType: true,
          originalName: true,
          sourceKind: true,
        },
        where: { assetType: ModuleAssetType.attachment },
      },
    },
    where: {
      code: lessonCode,
      status: ContentStatus.published,
      topic: {
        code: { in: [1, 2, 3].map((sectionNo) => `materi:${subject.slug}:section-${sectionNo}`) },
        isActive: true,
        parentTopicId: null,
        subtest: { code: subject.code, isActive: true },
      },
    },
  });

  if (!lesson || lesson.assets.length === 0) {
    throw new AdminStudentPreviewDocumentError("not_found", "Dokumen Materi tidak tersedia untuk preview.", 404);
  }
  if (lesson.assets.length > 1) {
    throw new AdminStudentPreviewDocumentError("unavailable", "Dokumen Materi memiliki lebih dari satu sumber.", 409);
  }

  const attachment = lesson.assets[0];
  const expectedId = expectedManagedAssetId?.trim() || null;
  const currentManagedAssetId = attachment.managedAssetId?.trim() || null;
  if (expectedId && expectedId !== currentManagedAssetId) {
    throw new AdminStudentPreviewDocumentError("replaced", "Dokumen Materi sudah diganti. Muat ulang halaman preview.", 409);
  }

  const isManaged = attachment.sourceKind === ModuleAssetSourceKind.managed || Boolean(currentManagedAssetId);
  if (!isManaged) {
    const hostedUrl = attachment.mediaUrl?.trim() || "";
    if (
      attachment.mimeType?.trim().toLowerCase() !== PREVIEW_DOCUMENT_MIME_TYPE
      || !isValidHostedPdfUrl(hostedUrl, attachment.mimeType)
    ) {
      throw new AdminStudentPreviewDocumentError("unavailable", "URL PDF Materi tidak tersedia untuk preview.", 409);
    }

    return {
      documentUrl: hostedUrl,
      expiresInSeconds: null,
      managedAssetId: null,
      mimeType: PREVIEW_DOCUMENT_MIME_TYPE,
      originalName: sanitizePreviewFileName(attachment.originalName),
      sourceKind: "hosted",
    };
  }

  if (!currentManagedAssetId || !attachment.managedAsset) {
    throw new AdminStudentPreviewDocumentError("missing", "Dokumen PDF managed tidak ditemukan.", 404);
  }

  const managedAsset = attachment.managedAsset;
  if (managedAsset.state === MediaAssetState.trashed || managedAsset.trashedAt) {
    throw new AdminStudentPreviewDocumentError("unavailable", "Dokumen PDF Materi sudah dipindahkan ke Sampah.", 410);
  }
  if (
    managedAsset.libraryScope !== MediaLibraryScope.kapten
    || managedAsset.mimeType?.trim().toLowerCase() !== PREVIEW_DOCUMENT_MIME_TYPE
    || managedAsset.state !== MediaAssetState.ready
    || !managedAsset.objectKey
  ) {
    throw new AdminStudentPreviewDocumentError("unavailable", "Dokumen PDF managed belum tersedia untuk preview.", 503);
  }

  try {
    const head = await headMediaObject(managedAsset.objectKey);
    if (
      head.ContentLength !== managedAsset.sizeBytes
      || head.ContentType?.trim().toLowerCase() !== PREVIEW_DOCUMENT_MIME_TYPE
    ) {
      throw new AdminStudentPreviewDocumentError("unavailable", "Dokumen PDF Materi tidak cocok dengan metadata tersimpan.", 503);
    }

    const originalName = sanitizePreviewFileName(attachment.originalName || managedAsset.originalName) || "materi.pdf";
    const documentUrl = await createMediaPreviewUrl(managedAsset.objectKey);
    const downloadUrl = await createMediaPreviewUrl(managedAsset.objectKey, {
      contentDisposition: "attachment",
      fileName: originalName,
    });

    return {
      documentUrl,
      downloadUrl,
      expiresInSeconds: PREVIEW_URL_TTL_SECONDS,
      managedAssetId: currentManagedAssetId,
      mimeType: PREVIEW_DOCUMENT_MIME_TYPE,
      originalName,
      sourceKind: "managed",
    };
  } catch (error) {
    if (error instanceof AdminStudentPreviewDocumentError) throw error;
    if (error instanceof R2ConfigurationError) {
      throw new AdminStudentPreviewDocumentError("unavailable", "Penyimpanan dokumen PDF belum dikonfigurasi.", 503);
    }
    console.error("Admin student preview document delivery failed", error);
    throw new AdminStudentPreviewDocumentError("unavailable", "Dokumen PDF belum dapat dibuka. Coba lagi.", 503);
  }
}

async function getAdminPreviewMateriDocument(input: {
  courseSlug: string;
  expectedManagedAssetId?: string | null;
  lessonCode: string;
}) {
  return PreviewReadBoundary.run(() => resolveAdminPreviewMateriDocument(input));
}

export {
  AdminStudentPreviewDocumentError,
  getAdminPreviewBeranda,
  getAdminPreviewBannerEditor,
  getAdminPreviewMateriCatalogue,
  getAdminPreviewMateriCatalogueSurface,
  getAdminPreviewMateriCourse,
  getAdminPreviewMateriDocument,
  getAdminPreviewMateriLesson,
};

export type {
  AdminPreviewBerandaRead,
  AdminPreviewBannerEditorRead,
  AdminPreviewContentBlock,
  AdminPreviewMateriCourse,
  AdminPreviewMateriCatalogueRead,
  AdminPreviewMateriDocumentDelivery,
  AdminPreviewMateriLesson,
};

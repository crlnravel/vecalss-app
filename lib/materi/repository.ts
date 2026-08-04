import "server-only";

import {
  ContentStatus,
  MediaAssetState,
  MediaLibraryScope,
  ModuleAssetSourceKind,
  ModuleAssetType,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  MATERI_DOCUMENT_MIME_TYPE,
  isMateriReady,
  normalizeMateriDocumentInput,
  readMateriResources,
  validateMateriVideoInput,
  type MateriDocument,
  type MateriDocumentInput,
  type MateriResourceLike,
  type MateriResourceRead,
  type MateriVideo,
} from "./contract";
import { lockMateriSubjectScope, lockMateriSubjectScopes } from "./locks";

const materiSubjects = [
  { code: "PU", slug: "penalaran-umum" },
  { code: "PPU", slug: "pengetahuan-pemahaman-umum" },
  { code: "PBM", slug: "pemahaman-bacaan-menulis" },
  { code: "PK", slug: "pengetahuan-kuantitatif" },
  { code: "LBI", slug: "literasi-bahasa-indonesia" },
  { code: "LBE", slug: "literasi-bahasa-inggris" },
  { code: "PM", slug: "penalaran-matematika" },
] as const;

const materiSubjectCodes = materiSubjects.map((subject) => subject.code);
const materiTopicCodes = materiSubjects.flatMap(({ slug }) =>
  [1, 2, 3].map((sectionNo) => `materi:${slug}:section-${sectionNo}`),
);
const materiTopicCodeSet = new Set(materiTopicCodes);

type MateriSubjectCode = (typeof materiSubjects)[number]["code"];
type MateriCourseSlug = (typeof materiSubjects)[number]["slug"];
type MateriLifecycleStatus = keyof typeof ContentStatus;

type MateriPrimaryVideo = MateriVideo;

type MateriDocumentResource = MateriDocument;

type MentorMateriLesson = {
  code: string;
  createdAt: string;
  document: MateriDocumentResource | null;
  lifecycleStatus: MateriLifecycleStatus;
  optionalVideo: MateriPrimaryVideo | null;
  primaryVideo: MateriPrimaryVideo | null;
  publishedAt: string | null;
  readiness: "ready" | "incomplete";
  sequenceNo: number;
  title: string;
  updatedAt: string;
};

type MentorMateriSubject = {
  code: MateriSubjectCode;
  lessons: MentorMateriLesson[];
  name: string;
  slug: MateriCourseSlug;
  sortOrder: number;
};

type PublishedMateriLesson = {
  code: string;
  document: MateriDocumentResource;
  optionalVideo: MateriPrimaryVideo | null;
  sequenceNo: number;
  title: string;
};

type PublishedMateriCourse = {
  code: MateriSubjectCode;
  lessons: PublishedMateriLesson[];
  name: string;
  slug: MateriCourseSlug;
  sortOrder: number;
};

type SaveMateriLessonInput = {
  code?: string;
  /** Legacy alias retained so the current editor remains type-safe during cutover. */
  duration?: string;
  document?: MateriDocumentInput;
  documentAssetId?: string;
  documentMimeType?: string;
  documentName?: string;
  documentUrl?: string;
  hostedPdfUrl?: string;
  managedAssetId?: string;
  subjectSlug: string;
  title: string;
  videoDuration?: string;
  videoUrl?: string;
};

type BulkMateriLifecycleInput = {
  codes: string[];
  subjectSlug: string;
};

type MateriValidationField =
  | "code"
  | "document"
  | "documentMimeType"
  | "documentUrl"
  | "duration"
  | "managedAssetId"
  | "subjectSlug"
  | "title"
  | "videoDuration"
  | "videoUrl";

class MateriValidationError extends Error {
  fieldErrors: Partial<Record<MateriValidationField, string>>;

  constructor(message: string, fieldErrors: Partial<Record<MateriValidationField, string>> = {}) {
    super(message);
    this.name = "MateriValidationError";
    this.fieldErrors = fieldErrors;
  }
}

function getSubjectByCode(code: string) {
  return materiSubjects.find((subject) => subject.code === code);
}

function getSubjectBySlug(slug: string) {
  return materiSubjects.find((subject) => subject.slug === slug);
}

function getCanonicalTopicCodes(subjectSlug: string) {
  return [1, 2, 3].map((sectionNo) => `materi:${subjectSlug}:section-${sectionNo}`);
}

function isCanonicalTopicForSubject(subjectSlug: string, topicCode: string) {
  return getCanonicalTopicCodes(subjectSlug).includes(topicCode);
}

function createMateriCode(title: string) {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "materi-baru";

  return `materi-${slug}-${crypto.randomUUID().slice(0, 8)}`;
}

function toMateriResourceRead(assets: readonly MateriResourceLike[]): MateriResourceRead {
  return readMateriResources(assets);
}

function toMentorLesson(module: {
  assets: MateriResourceLike[];
  code: string;
  createdAt: Date;
  publishedAt: Date | null;
  sequenceNo: number;
  status: MateriLifecycleStatus;
  title: string;
  updatedAt: Date;
}): MentorMateriLesson {
  const resources = toMateriResourceRead(module.assets);
  const primaryVideo = resources.video;

  return {
    code: module.code,
    createdAt: module.createdAt.toISOString(),
    document: resources.document,
    lifecycleStatus: module.status,
    optionalVideo: primaryVideo,
    primaryVideo,
    publishedAt: module.publishedAt?.toISOString() ?? null,
    readiness: isMateriReady(module.title, resources) ? "ready" : "incomplete",
    sequenceNo: module.sequenceNo,
    title: module.title,
    updatedAt: module.updatedAt.toISOString(),
  };
}

/**
 * Mentor records deliberately retain drafts, archived rows, and incomplete
 * primary assets. The DTO is serializable and does not expose author/account
 * data to client components.
 */
async function getMentorMateriCatalogue(): Promise<MentorMateriSubject[]> {
  const subtests = await prisma.subtest.findMany({
    where: { code: { in: materiSubjectCodes } },
    orderBy: { sortOrder: "asc" },
    select: {
      code: true,
      name: true,
      sortOrder: true,
      topics: {
        where: { code: { in: materiTopicCodes }, parentTopicId: null },
        orderBy: { sortOrder: "asc" },
        select: {
          code: true,
          name: true,
          sortOrder: true,
          modules: {
            orderBy: [{ sequenceNo: "asc" }, { code: "asc" }],
            select: {
              assets: {
                where: { assetType: { in: [ModuleAssetType.attachment, ModuleAssetType.video] } },
                orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
                select: {
                  assetType: true,
                  durationSeconds: true,
                  managedAssetId: true,
                  managedAsset: { select: { libraryScope: true, mimeType: true, objectKey: true, originalName: true, state: true, trashedAt: true, url: true } },
                  mediaUrl: true,
                  mimeType: true,
                  originalName: true,
                  sourceKind: true,
                },
              },
              code: true,
              createdAt: true,
              publishedAt: true,
              sequenceNo: true,
              status: true,
              title: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });

  const byCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
  return materiSubjects.flatMap((subject) => {
    const subtest = byCode.get(subject.code);
    if (!subtest) {
      return [];
    }

    return [{
      code: subject.code,
      lessons: subtest.topics.reduce<MentorMateriLesson[]>((lessons, topic) => {
        if (!isCanonicalTopicForSubject(subject.slug, topic.code)) return lessons;
        for (const lessonModule of topic.modules) lessons.push(toMentorLesson(lessonModule));
        return lessons;
      }, []).sort((left, right) => left.sequenceNo - right.sequenceNo || left.code.localeCompare(right.code)),
      name: subtest.name,
      slug: subject.slug,
      sortOrder: subtest.sortOrder,
    }];
  });
}

async function getMentorMateriByCode(code: string): Promise<(MentorMateriLesson & {
  subject: Pick<MentorMateriSubject, "code" | "name" | "slug" | "sortOrder">;
}) | undefined> {
  const lessonRecord = await prisma.module.findUnique({
    where: { code },
    select: {
      assets: {
        where: { assetType: { in: [ModuleAssetType.attachment, ModuleAssetType.video] } },
        orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
        select: {
          assetType: true,
          durationSeconds: true,
          managedAssetId: true,
          managedAsset: { select: { libraryScope: true, mimeType: true, objectKey: true, originalName: true, state: true, trashedAt: true, url: true } },
          mediaUrl: true,
          mimeType: true,
          originalName: true,
          sourceKind: true,
        },
      },
      code: true,
      createdAt: true,
      publishedAt: true,
      sequenceNo: true,
      status: true,
      title: true,
      updatedAt: true,
      topic: { select: { code: true, subtest: { select: { code: true, name: true, sortOrder: true } } } },
    },
  });
  const subject = lessonRecord ? getSubjectByCode(lessonRecord.topic.subtest.code) : undefined;
  if (
    !lessonRecord
    || !subject
    || !materiTopicCodeSet.has(lessonRecord.topic.code)
    || !isCanonicalTopicForSubject(subject.slug, lessonRecord.topic.code)
  ) {
    return undefined;
  }

  return {
    ...toMentorLesson(lessonRecord),
    subject: { code: subject.code, name: lessonRecord.topic.subtest.name, slug: subject.slug, sortOrder: lessonRecord.topic.subtest.sortOrder },
  };
}

/**
 * Student reads admit only modules whose lifecycle is published and whose
 * required PDF document. Incomplete/stale published records are excluded in
 * the final DTO check as well as in the database predicate.
 */
async function getPublishedCourseCatalogue(): Promise<PublishedMateriCourse[]> {
  const subtests = await prisma.subtest.findMany({
    where: { code: { in: materiSubjectCodes }, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      code: true,
      name: true,
      sortOrder: true,
      topics: {
        where: { code: { in: materiTopicCodes }, parentTopicId: null, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          code: true,
          name: true,
          sortOrder: true,
          modules: {
            where: {
              status: ContentStatus.published,
              assets: { some: { assetType: ModuleAssetType.attachment } },
            },
            orderBy: [{ sequenceNo: "asc" }, { code: "asc" }],
            select: {
              assets: {
                where: { assetType: { in: [ModuleAssetType.attachment, ModuleAssetType.video] } },
                orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
                select: {
                  assetType: true,
                  durationSeconds: true,
                  managedAssetId: true,
                  managedAsset: { select: { libraryScope: true, mimeType: true, objectKey: true, originalName: true, state: true, trashedAt: true, url: true } },
                  mediaUrl: true,
                  mimeType: true,
                  originalName: true,
                  sourceKind: true,
                },
              },
              code: true,
              sequenceNo: true,
              title: true,
            },
          },
        },
      },
    },
  });

  const byCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
  return materiSubjects.flatMap((subject) => {
    const subtest = byCode.get(subject.code);
    if (!subtest) return [];

    return [{
      code: subject.code,
      lessons: subtest.topics.reduce<PublishedMateriLesson[]>((lessons, topic) => {
        if (!isCanonicalTopicForSubject(subject.slug, topic.code)) return lessons;
        for (const lessonModule of topic.modules) {
          const resources = toMateriResourceRead(lessonModule.assets);
          if (!resources.document || !isMateriReady(lessonModule.title, resources)) continue;
          lessons.push({
            code: lessonModule.code,
            document: resources.document,
            optionalVideo: resources.video,
            sequenceNo: lessonModule.sequenceNo,
            title: lessonModule.title,
          });
        }
        return lessons;
      }, []).sort((left, right) => left.sequenceNo - right.sequenceNo || left.code.localeCompare(right.code)),
      name: subtest.name,
      slug: subject.slug,
      sortOrder: subtest.sortOrder,
    }];
  });
}

async function getPublishedLesson(courseSlug: string, lessonCode: string): Promise<(PublishedMateriLesson & {
  course: Pick<PublishedMateriCourse, "code" | "name" | "slug" | "sortOrder">;
}) | undefined> {
  const subject = getSubjectBySlug(courseSlug);
  if (!subject) return undefined;

  const lessonRecord = await prisma.module.findFirst({
    where: {
      code: lessonCode,
      status: ContentStatus.published,
      topic: {
        code: { in: getCanonicalTopicCodes(subject.slug) },
        parentTopicId: null,
        isActive: true,
        subtest: { code: subject.code, isActive: true },
      },
      assets: { some: { assetType: ModuleAssetType.attachment } },
    },
    select: {
      assets: {
        where: { assetType: { in: [ModuleAssetType.attachment, ModuleAssetType.video] } },
        orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
        select: {
          assetType: true,
          durationSeconds: true,
          managedAssetId: true,
          managedAsset: { select: { libraryScope: true, mimeType: true, objectKey: true, originalName: true, state: true, trashedAt: true, url: true } },
          mediaUrl: true,
          mimeType: true,
          originalName: true,
          sourceKind: true,
        },
      },
      code: true,
      sequenceNo: true,
      title: true,
      topic: { select: { code: true, subtest: { select: { code: true, name: true, sortOrder: true } } } },
    },
  });
  const resources = lessonRecord ? toMateriResourceRead(lessonRecord.assets) : null;
  if (!lessonRecord || !resources?.document || !isMateriReady(lessonRecord.title, resources)) return undefined;

  return {
    code: lessonRecord.code,
    document: resources.document,
    optionalVideo: resources.video,
    sequenceNo: lessonRecord.sequenceNo,
    title: lessonRecord.title,
    course: { code: subject.code, name: lessonRecord.topic.subtest.name, slug: subject.slug, sortOrder: lessonRecord.topic.subtest.sortOrder },
  };
}

/** Reorders the complete mentor-visible subject set without exposing Topic as ordering state. */
async function reorderMateriSubject(subjectSlug: string, orderedCodes: string[], tutorId: string) {
  const subject = getSubjectBySlug(subjectSlug);
  if (!subject || !Array.isArray(orderedCodes) || !orderedCodes.every((code) => typeof code === "string" && code.trim())) {
    throw new MateriValidationError("Payload urutan Materi tidak valid.");
  }
  if (new Set(orderedCodes).size !== orderedCodes.length) {
    throw new MateriValidationError("Payload urutan Materi memuat kode duplikat.");
  }

  return prisma.$transaction(async (tx) => {
    await lockMateriSubjectScope(tx, subject.code);
    const topics = await tx.topic.findMany({
      where: { code: { in: getCanonicalTopicCodes(subject.slug) }, parentTopicId: null, subtest: { code: subject.code } },
      orderBy: { code: "asc" },
      select: { id: true },
    });
    if (topics.length !== 3) throw new MateriValidationError("Struktur internal Materi tidak lengkap.");

    // A deterministic lock order serializes overlapping subject reorders.
    await tx.$queryRaw`SELECT id FROM topics WHERE id = ANY(${topics.map((topic) => topic.id)}::uuid[]) ORDER BY id FOR UPDATE`;
    const current = await tx.module.findMany({
      where: { topicId: { in: topics.map((topic) => topic.id) } },
      orderBy: [{ sequenceNo: "asc" }, { code: "asc" }],
      select: { code: true, sequenceNo: true },
    });
    const currentCodes = current.map((lesson) => lesson.code);
    const orderedCodeSet = new Set(orderedCodes);
    if (currentCodes.length !== orderedCodes.length || currentCodes.some((code) => !orderedCodeSet.has(code))) {
      throw new MateriValidationError("Urutan Materi sudah berubah. Muat ulang lalu coba lagi.");
    }

    const maxSequence = Math.max(0, ...current.map((lesson) => lesson.sequenceNo));
    await Promise.all(
      current.map((lesson, index) => tx.module.update({
        where: { code: lesson.code },
        data: { sequenceNo: maxSequence + current.length + index + 1 },
      })),
    );
    await Promise.all(
      orderedCodes.map((code, index) => tx.module.update({
        where: { code },
        data: { sequenceNo: index + 1, updatedByUserId: tutorId },
      })),
    );

    return orderedCodes.map((code, index) => ({ code, sequenceNo: index + 1 }));
  });
}

/**
 * Writes a lesson and both affected learner orders in one transaction. Moving
 * every affected row through a high, collision-free temporary range lets the
 * final contiguous sequence update satisfy the topic/sequence unique key at
 * every statement, not merely at transaction commit.
 */
async function saveMateriLesson(input: SaveMateriLessonInput, tutorId: string) {
  const subject = getSubjectBySlug(input.subjectSlug);
  const title = input.title.trim();
  const documentInput: MateriDocumentInput = {
    ...input.document,
    hostedUrl: input.document?.hostedUrl ?? input.documentUrl ?? input.hostedPdfUrl,
    managedAssetId: input.document?.managedAssetId ?? input.documentAssetId ?? input.managedAssetId,
    mimeType: input.document?.mimeType ?? input.documentMimeType,
    originalName: input.document?.originalName ?? input.documentName,
    url: input.document?.url,
  };
  const documentValidation = normalizeMateriDocumentInput(documentInput);
  const videoDurationField = input.videoDuration !== undefined ? "videoDuration" : "duration";
  const videoValidation = validateMateriVideoInput({
    duration: input.videoDuration ?? input.duration,
    durationField: videoDurationField,
    url: input.videoUrl,
  });
  const fieldErrors = {
    ...documentValidation.errors,
    ...videoValidation.errors,
  } as Partial<Record<MateriValidationField, string>>;
  if (!subject) {
    throw new MateriValidationError("Pilih subject Materi yang tersedia.", { subjectSlug: "Pilih subject Materi yang tersedia." });
  }
  if (!title) fieldErrors.title = "Judul lesson wajib diisi.";
  if (Object.keys(fieldErrors).length > 0 || !documentValidation.document) {
    throw new MateriValidationError(
      "Lengkapi judul, PDF/ebook, dan pasangan video opsional sebelum menyimpan.",
      fieldErrors,
    );
  }

  const document = documentValidation.document;
  const video = videoValidation.video;
  let code = input.code?.trim();

  await prisma.$transaction(async (tx) => {
    // The current topic determines the source subject, so acquire the
    // canonical Materi subject locks before reading it. This prevents a
    // concurrent cross-subject save from changing the source while this
    // transaction is waiting for its ordering boundary.
    await lockMateriSubjectScopes(tx, materiSubjectCodes);
    const current = code ? await tx.module.findUnique({ where: { code }, select: { estimatedMinutes: true, id: true, code: true, status: true, topicId: true, topic: { select: { code: true, subtest: { select: { code: true } } } } } }) : null;
    if (code && !current) throw new MateriValidationError("Lesson tidak ditemukan.");
    if (current?.status === ContentStatus.archived) {
      throw new MateriValidationError("Materi yang diarsipkan tidak dapat diedit. Pulihkan materi terlebih dahulu.");
    }
    const source = current ? getSubjectByCode(current.topic.subtest.code) : undefined;
    if (current && (!source || !isCanonicalTopicForSubject(source.slug, current.topic.code))) throw new MateriValidationError("Lesson tidak berada dalam katalog Materi kanonis.");
    if (!code) code = createMateriCode(title);

    let managedAsset: {
      libraryScope: MediaLibraryScope;
      mimeType: string;
      objectKey: string | null;
      originalName: string | null;
      state: MediaAssetState;
      trashedAt: Date | null;
      url: string | null;
    } | null = null;
    if (document.sourceKind === "managed") {
      managedAsset = await tx.asset.findFirst({
        where: {
          id: document.managedAssetId!,
          libraryScope: MediaLibraryScope.kapten,
          mimeType: MATERI_DOCUMENT_MIME_TYPE,
          objectKey: { not: null },
          state: MediaAssetState.ready,
          trashedAt: null,
        },
        select: { libraryScope: true, mimeType: true, objectKey: true, originalName: true, state: true, trashedAt: true, url: true },
      });
      if (!managedAsset?.objectKey?.trim()) {
        throw new MateriValidationError("Dokumen PDF managed tidak tersedia.", { managedAssetId: "Pilih PDF managed yang masih tersedia." });
      }
    }

    const subjectSlugs = [...new Set([subject.slug, source?.slug].filter(Boolean))] as string[];
    const topics = await tx.topic.findMany({ where: { code: { in: subjectSlugs.flatMap(getCanonicalTopicCodes) }, parentTopicId: null }, orderBy: [{ subtestId: "asc" }, { code: "asc" }], select: { id: true, code: true, subtest: { select: { code: true } } } });
    const expectedTopics = subjectSlugs.length * 3;
    if (topics.length !== expectedTopics) throw new MateriValidationError("Struktur internal Materi tidak lengkap.");
    await tx.$queryRaw`SELECT id FROM topics WHERE id = ANY(${topics.map((topic) => topic.id)}::uuid[]) ORDER BY id FOR UPDATE`;

    const topicBySubject = new Map<string, typeof topics>();
    for (const topic of topics) {
      const group = topicBySubject.get(topic.subtest.code) ?? [];
      group.push(topic); topicBySubject.set(topic.subtest.code, group);
    }
    const modules = await tx.module.findMany({ where: { topicId: { in: topics.map((topic) => topic.id) } }, orderBy: [{ sequenceNo: "asc" }, { code: "asc" }], select: { code: true, sequenceNo: true, topicId: true } });
    const max = Math.max(0, ...modules.map((lesson) => Math.abs(lesson.sequenceNo)));
    await Promise.all(
      modules.map((lesson, index) => tx.module.update({
        where: { code: lesson.code },
        data: { sequenceNo: max + modules.length + index + 1 },
      })),
    );

    const sourceCode = source?.code;
    const destinationTopics = topicBySubject.get(subject.code);
    if (!destinationTopics?.length) {
      throw new MateriValidationError("Struktur internal Materi tidak lengkap.");
    }
    const destinationTopicId = current && sourceCode === subject.code ? current.topicId : destinationTopics[0].id;
    if (!current) {
      await tx.module.create({ data: { code, topicId: destinationTopicId, title, sequenceNo: max + (modules.length * 2) + 1, estimatedMinutes: video ? Math.ceil(video.durationSeconds / 60) : null, status: ContentStatus.draft, createdByUserId: tutorId, updatedByUserId: tutorId } });
    } else {
      await tx.module.update({ where: { code }, data: { ...(sourceCode === subject.code ? {} : { topicId: destinationTopicId }), title, estimatedMinutes: video ? Math.ceil(video.durationSeconds / 60) : null, updatedByUserId: tutorId } });
    }

    const orderFor = (subjectCode: string) => {
      const subjectTopics = topicBySubject.get(subjectCode);
      if (!subjectTopics) {
        throw new MateriValidationError("Struktur internal Materi tidak lengkap.");
      }
      return modules.reduce<string[]>((codes, lesson) => {
        if (lesson.code !== code && subjectTopics.some((topic) => topic.id === lesson.topicId)) {
          codes.push(lesson.code);
        }
        return codes;
      }, []);
    };
    const orders = new Map<string, string[]>();
    if (sourceCode && sourceCode !== subject.code) orders.set(sourceCode, orderFor(sourceCode));
    const destinationOrder = current && sourceCode === subject.code ? [...orderFor(subject.code), code] : [...orderFor(subject.code), code];
    if (current && sourceCode === subject.code) {
      const original = modules.reduce<string[]>((codes, lesson) => {
        if (destinationTopics.some((topic) => topic.id === lesson.topicId)) {
          codes.push(lesson.code);
        }
        return codes;
      }, []);
      orders.set(subject.code, original);
    } else orders.set(subject.code, destinationOrder);

    await Promise.all(
      [...orders.values()].flatMap((orderedCodes) => orderedCodes.map((moduleCode, index) => tx.module.update({
        where: { code: moduleCode },
        data: { sequenceNo: index + 1, updatedByUserId: tutorId },
      }))),
    );
    const saved = await tx.module.findUnique({ where: { code }, select: { id: true } });
    if (!saved) throw new Error("Lesson tersimpan tetapi tidak dapat dimuat ulang.");

    // Resource role, rather than slot, is authoritative. Temporarily move all
    // resources to a collision-free range, then assign document/video slots
    // without disturbing the relative ordering of unrelated content assets.
    const allAssets = await tx.moduleAsset.findMany({
      where: { moduleId: saved.id },
      select: { assetType: true, id: true, sortOrder: true },
    });
    const maxSort = Math.max(0, ...allAssets.map((asset) => Math.abs(asset.sortOrder)));
    await Promise.all(
      allAssets.map((asset, index) => tx.moduleAsset.update({
        where: { id: asset.id },
        data: { sortOrder: maxSort + allAssets.length + index + 100 },
      })),
    );

    const roleAssets = allAssets.filter((asset) => asset.assetType === ModuleAssetType.attachment || asset.assetType === ModuleAssetType.video);
    const unrelatedSorts = new Set(allAssets.reduce<number[]>((sorts, asset) => {
      if (!roleAssets.some((role) => role.id === asset.id)) sorts.push(asset.sortOrder);
      return sorts;
    }, []));
    const allocateSortOrder = () => {
      let candidate = 0;
      while (unrelatedSorts.has(candidate)) candidate += 1;
      unrelatedSorts.add(candidate);
      return candidate;
    };
    const documentAsset = roleAssets.find((asset) => asset.assetType === ModuleAssetType.attachment);
    const videoAsset = roleAssets.find((asset) => asset.assetType === ModuleAssetType.video);
    const documentSortOrder = allocateSortOrder();
    const videoSortOrder = video ? allocateSortOrder() : null;
    const documentData = {
      assetType: ModuleAssetType.attachment,
      bodyText: null,
      durationSeconds: null,
      managedAssetId: document.sourceKind === "managed" ? document.managedAssetId : null,
      mediaUrl: document.sourceKind === "hosted" ? document.url : null,
      mimeType: MATERI_DOCUMENT_MIME_TYPE,
      originalName: document.originalName || managedAsset?.originalName || null,
      sourceKind: document.sourceKind === "managed" ? ModuleAssetSourceKind.managed : ModuleAssetSourceKind.hosted,
      title,
    };
    if (documentAsset) {
      await tx.moduleAsset.update({ where: { id: documentAsset.id }, data: { ...documentData, sortOrder: documentSortOrder } });
    } else {
      await tx.moduleAsset.create({ data: { ...documentData, moduleId: saved.id, sortOrder: documentSortOrder } });
    }
    const duplicateDocumentAssets = roleAssets.filter((asset) => asset.assetType === ModuleAssetType.attachment && asset.id !== documentAsset?.id);
    if (duplicateDocumentAssets.length) await tx.moduleAsset.deleteMany({ where: { id: { in: duplicateDocumentAssets.map((asset) => asset.id) } } });

    if (video && videoSortOrder !== null) {
      const videoData = {
        assetType: ModuleAssetType.video,
        bodyText: null,
        durationSeconds: video.durationSeconds,
        managedAssetId: null,
        mediaUrl: video.mediaUrl,
        mimeType: null,
        originalName: null,
        sourceKind: ModuleAssetSourceKind.hosted,
        title,
      };
      if (videoAsset) {
        await tx.moduleAsset.update({ where: { id: videoAsset.id }, data: { ...videoData, sortOrder: videoSortOrder } });
      } else {
        await tx.moduleAsset.create({ data: { ...videoData, moduleId: saved.id, sortOrder: videoSortOrder } });
      }
    } else {
      const videoAssets = roleAssets.filter((asset) => asset.assetType === ModuleAssetType.video);
      if (videoAssets.length) await tx.moduleAsset.deleteMany({ where: { id: { in: videoAssets.map((asset) => asset.id) } } });
    }
    const duplicateVideoAssets = roleAssets.filter((asset) => asset.assetType === ModuleAssetType.video && asset.id !== videoAsset?.id);
    if (video && duplicateVideoAssets.length) await tx.moduleAsset.deleteMany({ where: { id: { in: duplicateVideoAssets.map((asset) => asset.id) } } });
    const unrelatedAssetUpdates = allAssets.reduce<Promise<unknown>[]>((updates, asset) => {
      if (!roleAssets.some((role) => role.id === asset.id)) {
        updates.push(tx.moduleAsset.update({ where: { id: asset.id }, data: { sortOrder: asset.sortOrder } }));
      }
      return updates;
    }, []);
    await Promise.all(unrelatedAssetUpdates);
  });
  const saved = await getMentorMateriByCode(code!);
  if (!saved) throw new Error("Lesson tersimpan tetapi tidak dapat dimuat ulang.");
  return saved;
}

type LockedMateriAsset = MateriResourceLike & { id: string };

type LockedMateriLifecycleLesson = {
  assets: LockedMateriAsset[];
  code: string;
  id: string;
  status: ContentStatus;
  title: string;
  topicId: string;
};

async function readLockedMateriLifecycleRecord(
  tx: Prisma.TransactionClient,
  code: string,
): Promise<{ lesson: LockedMateriLifecycleLesson; subject: (typeof materiSubjects)[number] }> {
  // The code does not reveal its subject until the canonical module row is
  // read, so acquire every canonical subject scope first. The lock helper
  // sorts these keys, which keeps cross-subject saves/reorders deadlock-safe.
  await lockMateriSubjectScopes(tx, materiSubjectCodes);

  const identity = await tx.module.findUnique({
    where: { code },
    select: {
      id: true,
      topic: {
        select: {
          code: true,
          parentTopicId: true,
          subtest: { select: { code: true } },
        },
      },
    },
  });
  if (!identity) throw new MateriValidationError("Lesson tidak ditemukan.", { code: "Lesson tidak ditemukan." });

  const subject = getSubjectByCode(identity.topic.subtest.code);
  if (
    !subject
    || identity.topic.parentTopicId !== null
    || !isCanonicalTopicForSubject(subject.slug, identity.topic.code)
  ) {
    throw new MateriValidationError("Lesson tidak berada dalam katalog Materi kanonis.");
  }

  const topics = await tx.topic.findMany({
    where: {
      code: { in: getCanonicalTopicCodes(subject.slug) },
      parentTopicId: null,
      subtest: { code: subject.code },
    },
    orderBy: { code: "asc" },
    select: { id: true },
  });
  if (topics.length !== 3) throw new MateriValidationError("Struktur internal Materi tidak lengkap.");
  await tx.$queryRaw`SELECT id FROM topics WHERE id = ANY(${topics.map((topic) => topic.id)}::uuid[]) ORDER BY id FOR UPDATE`;

  // Keep row-lock ordering consistent with save/reorder: subject scopes,
  // canonical topics, module, module-assets, then managed assets.
  await tx.$queryRaw`SELECT id FROM modules WHERE id = ${identity.id}::uuid FOR UPDATE`;
  const resourceRows = await tx.moduleAsset.findMany({
    where: { moduleId: identity.id },
    orderBy: { id: "asc" },
    select: { id: true, managedAssetId: true },
  });
  if (resourceRows.length > 0) {
    await tx.$queryRaw`SELECT id FROM module_assets WHERE id = ANY(${resourceRows.map((asset) => asset.id)}::uuid[]) ORDER BY id FOR UPDATE`;
  }
  const managedAssetIds = [...new Set(
    resourceRows
      .map((asset) => asset.managedAssetId)
      .filter((assetId): assetId is string => Boolean(assetId)),
  )].sort();
  if (managedAssetIds.length > 0) {
    await tx.$queryRaw`SELECT id FROM assets WHERE id = ANY(${managedAssetIds}::uuid[]) ORDER BY id FOR UPDATE`;
  }

  // Re-read after all canonical rows/resources are locked. This is the state
  // used for readiness and the conditional status transition below.
  const lesson = await tx.module.findUnique({
    where: { id: identity.id },
    select: {
      assets: {
        where: { assetType: { in: [ModuleAssetType.attachment, ModuleAssetType.video] } },
        orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          assetType: true,
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
        },
      },
      code: true,
      id: true,
      status: true,
      title: true,
      topicId: true,
      topic: {
        select: {
          code: true,
          parentTopicId: true,
          subtest: { select: { code: true } },
        },
      },
    },
  });
  if (!lesson) throw new MateriValidationError("Lesson tidak ditemukan.", { code: "Lesson tidak ditemukan." });
  const currentSubject = getSubjectByCode(lesson.topic.subtest.code);
  if (
    !currentSubject
    || currentSubject.code !== subject.code
    || lesson.topic.parentTopicId !== null
    || !isCanonicalTopicForSubject(currentSubject.slug, lesson.topic.code)
  ) {
    throw new MateriValidationError("Lesson tidak berada dalam katalog Materi kanonis.");
  }

  return {
    lesson: { ...lesson, assets: lesson.assets as LockedMateriAsset[] },
    subject: currentSubject,
  };
}

function getMateriDocumentLifecycleWhere(lesson: LockedMateriLifecycleLesson) {
  const resources = toMateriResourceRead(lesson.assets);
  const documentAsset = lesson.assets.find((asset) => asset.assetType === ModuleAssetType.attachment);
  if (!resources.document || !documentAsset) return null;

  if (resources.document.sourceKind === "managed") {
    const managedAssetId = documentAsset.managedAssetId?.trim();
    if (!managedAssetId) return null;
    return {
      some: {
        id: documentAsset.id,
        assetType: ModuleAssetType.attachment,
        sourceKind: ModuleAssetSourceKind.managed,
        managedAssetId,
        mimeType: MATERI_DOCUMENT_MIME_TYPE,
        managedAsset: {
          libraryScope: MediaLibraryScope.kapten,
          mimeType: MATERI_DOCUMENT_MIME_TYPE,
          objectKey: { not: null },
          state: MediaAssetState.ready,
          trashedAt: null,
        },
      },
    };
  }

  return {
    some: {
      id: documentAsset.id,
      assetType: ModuleAssetType.attachment,
      sourceKind: ModuleAssetSourceKind.hosted,
      mediaUrl: resources.document.url,
      mimeType: MATERI_DOCUMENT_MIME_TYPE,
    },
  };
}

function getMateriLifecycleTopicWhere(subject: (typeof materiSubjects)[number]) {
  return {
    code: { in: getCanonicalTopicCodes(subject.slug) },
    parentTopicId: null,
    subtest: { code: subject.code },
  };
}

async function publishMateriLesson(code: string, tutorId: string) {
  await prisma.$transaction(async (tx) => {
    const locked = await readLockedMateriLifecycleRecord(tx, code);
    if (!locked) throw new MateriValidationError("Lesson tidak ditemukan.", { code: "Lesson tidak ditemukan." });
    const { lesson, subject } = locked;
    if (lesson.status !== ContentStatus.draft) {
      throw new MateriValidationError("Hanya lesson draf yang dapat diterbitkan.");
    }
    const documentWhere = getMateriDocumentLifecycleWhere(lesson);
    if (!isMateriReady(lesson.title, toMateriResourceRead(lesson.assets)) || !documentWhere) {
      throw new MateriValidationError("Lengkapi judul dan PDF/ebook yang valid sebelum menerbitkan.");
    }

    const updated = await tx.module.updateMany({
      where: {
        id: lesson.id,
        code,
        status: ContentStatus.draft,
        topicId: lesson.topicId,
        topic: getMateriLifecycleTopicWhere(subject),
        assets: documentWhere,
      },
      data: { publishedAt: new Date(), status: ContentStatus.published, updatedByUserId: tutorId },
    });
    if (updated.count !== 1) throw new MateriValidationError("Status lesson berubah. Muat ulang halaman lalu coba lagi.");
  });
  return getMentorMateriByCode(code);
}

async function unpublishMateriLesson(code: string, tutorId: string) {
  await prisma.$transaction(async (tx) => {
    const locked = await readLockedMateriLifecycleRecord(tx, code);
    if (!locked) throw new MateriValidationError("Lesson tidak ditemukan.", { code: "Lesson tidak ditemukan." });
    const { lesson, subject } = locked;
    if (lesson.status !== ContentStatus.published) {
      throw new MateriValidationError("Hanya lesson yang sudah terbit dapat dibatalkan penerbitannya.");
    }

    const updated = await tx.module.updateMany({
      where: { id: lesson.id, code, status: ContentStatus.published, topicId: lesson.topicId, topic: getMateriLifecycleTopicWhere(subject) },
      data: { status: ContentStatus.draft, updatedByUserId: tutorId },
    });
    if (updated.count !== 1) throw new MateriValidationError("Status lesson berubah. Muat ulang halaman lalu coba lagi.");
  });
  return getMentorMateriByCode(code);
}

async function archiveMateriLesson(code: string, tutorId: string) {
  await prisma.$transaction(async (tx) => {
    const locked = await readLockedMateriLifecycleRecord(tx, code);
    if (!locked) throw new MateriValidationError("Lesson tidak ditemukan.", { code: "Lesson tidak ditemukan." });
    const { lesson, subject } = locked;
    if (lesson.status === ContentStatus.archived) throw new MateriValidationError("Lesson sudah diarsipkan.");

    const updated = await tx.module.updateMany({
      where: { id: lesson.id, code, status: { not: ContentStatus.archived }, topicId: lesson.topicId, topic: getMateriLifecycleTopicWhere(subject) },
      data: { status: ContentStatus.archived, updatedByUserId: tutorId },
    });
    if (updated.count !== 1) throw new MateriValidationError("Status lesson berubah. Muat ulang halaman lalu coba lagi.");
  });
  return getMentorMateriByCode(code);
}

function validateBulkMateriInput(input: BulkMateriLifecycleInput) {
  const subject = getSubjectBySlug(input.subjectSlug);
  if (!subject || !Array.isArray(input.codes) || input.codes.length === 0) {
    throw new MateriValidationError("Pilih setidaknya satu lesson pada subject yang valid.");
  }
  const codes = input.codes.map((code) => typeof code === "string" ? code.trim() : "");
  if (codes.some((code) => !code) || new Set(codes).size !== codes.length) {
    throw new MateriValidationError("Pilihan lesson tidak valid. Muat ulang halaman lalu coba lagi.");
  }
  return { codes, subject };
}

async function bulkUpdateMateriLifecycle(
  input: BulkMateriLifecycleInput,
  tutorId: string,
  operation: "publish" | "unpublish",
) {
  const { codes, subject } = validateBulkMateriInput(input);
  const requiredStatus = operation === "publish" ? ContentStatus.draft : ContentStatus.published;
  const nextStatus = operation === "publish" ? ContentStatus.published : ContentStatus.draft;

  await prisma.$transaction(async (tx) => {
    await lockMateriSubjectScope(tx, subject.code);
    const topics = await tx.topic.findMany({
      where: {
        code: { in: getCanonicalTopicCodes(subject.slug) },
        parentTopicId: null,
        subtest: { code: subject.code },
      },
      orderBy: { code: "asc" },
      select: { id: true },
    });
    if (topics.length !== 3) {
      throw new MateriValidationError("Struktur internal Materi tidak lengkap.");
    }

    // Use the same canonical-topic lock boundary as saves before validating
    // readiness or changing lifecycle state.
    await tx.$queryRaw`SELECT id FROM topics WHERE id = ANY(${topics.map((topic) => topic.id)}::uuid[]) ORDER BY id FOR UPDATE`;
    const topicIds = topics.map((topic) => topic.id);
    const records = await tx.module.findMany({
      where: {
        code: { in: codes },
        topicId: { in: topicIds },
      },
      select: {
        assets: {
          where: { assetType: { in: [ModuleAssetType.attachment, ModuleAssetType.video] } },
          orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
          select: {
            assetType: true,
            durationSeconds: true,
            managedAssetId: true,
            managedAsset: { select: { libraryScope: true, mimeType: true, objectKey: true, originalName: true, state: true, trashedAt: true, url: true } },
            mediaUrl: true,
            mimeType: true,
            originalName: true,
            sourceKind: true,
          },
        },
        code: true,
        status: true,
        title: true,
      },
    });
    if (records.length !== codes.length) {
      throw new MateriValidationError("Sebagian lesson tidak lagi berada pada subject ini. Muat ulang halaman lalu coba lagi.");
    }
    if (records.some((record) => record.status !== requiredStatus)) {
      throw new MateriValidationError(operation === "publish"
        ? "Pilih hanya lesson draf yang siap diterbitkan."
        : "Pilih hanya lesson yang sudah diterbitkan.");
    }
    if (operation === "publish" && records.some((record) => {
      const resources = toMateriResourceRead(record.assets);
      return !isMateriReady(record.title, resources);
    })) {
      throw new MateriValidationError("Pilih hanya lesson draf yang siap diterbitkan.");
    }

    const updated = await tx.module.updateMany({
      where: {
        code: { in: codes },
        status: requiredStatus,
        topicId: { in: topicIds },
      },
      data: {
        ...(operation === "publish" ? { publishedAt: new Date() } : {}),
        status: nextStatus,
        updatedByUserId: tutorId,
      },
    });
    if (updated.count !== codes.length) {
      throw new MateriValidationError("Status lesson berubah. Muat ulang halaman lalu coba lagi.");
    }
  });

  return { codes, status: nextStatus };
}

async function bulkPublishMateriLessons(input: BulkMateriLifecycleInput, tutorId: string) {
  return bulkUpdateMateriLifecycle(input, tutorId, "publish");
}

async function bulkUnpublishMateriLessons(input: BulkMateriLifecycleInput, tutorId: string) {
  return bulkUpdateMateriLifecycle(input, tutorId, "unpublish");
}

/**
 * Scheduled and archived lessons stay out of the student catalogue. Returning
 * one to draft deliberately changes only lifecycle/audit fields, preserving
 * its stable public code, document/video resources, topic placement, and
 * subject-wide sequence.
 */
async function returnMateriLessonToDraft(code: string, tutorId: string) {
  await prisma.$transaction(async (tx) => {
    const locked = await readLockedMateriLifecycleRecord(tx, code);
    if (!locked) throw new MateriValidationError("Lesson tidak ditemukan.", { code: "Lesson tidak ditemukan." });
    const { lesson, subject } = locked;
    if (lesson.status !== ContentStatus.scheduled && lesson.status !== ContentStatus.archived) {
      throw new MateriValidationError("Hanya lesson terjadwal atau diarsipkan yang dapat dikembalikan menjadi draf.");
    }

    const updated = await tx.module.updateMany({
      where: {
        id: lesson.id,
        code,
        status: { in: [ContentStatus.scheduled, ContentStatus.archived] },
        topicId: lesson.topicId,
        topic: getMateriLifecycleTopicWhere(subject),
      },
      data: { status: ContentStatus.draft, updatedByUserId: tutorId },
    });
    if (updated.count !== 1) throw new MateriValidationError("Status lesson berubah. Muat ulang halaman lalu coba lagi.");
  });
  return getMentorMateriByCode(code);
}

export {
  archiveMateriLesson,
  bulkPublishMateriLessons,
  bulkUnpublishMateriLessons,
  getMentorMateriByCode,
  getMentorMateriCatalogue,
  getPublishedCourseCatalogue,
  getPublishedLesson,
  materiSubjects,
  reorderMateriSubject,
  publishMateriLesson,
  returnMateriLessonToDraft,
  saveMateriLesson,
  unpublishMateriLesson,
  isMateriReady,
  normalizeMateriDocumentInput,
  readMateriResources,
  validateMateriVideoInput,
};
export type {
  BulkMateriLifecycleInput,
  MateriCourseSlug,
  MateriDocumentInput,
  MateriDocumentResource,
  MateriLifecycleStatus,
  MateriPrimaryVideo,
  MateriSubjectCode,
  MentorMateriLesson,
  MentorMateriSubject,
  PublishedMateriCourse,
  PublishedMateriLesson,
  SaveMateriLessonInput,
};
export { MateriValidationError };

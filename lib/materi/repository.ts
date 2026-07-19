import "server-only";

import { ContentStatus, ModuleAssetType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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

type MateriPrimaryVideo = {
  durationSeconds: number;
  mediaUrl: string;
};

type MentorMateriLesson = {
  code: string;
  createdAt: string;
  lifecycleStatus: MateriLifecycleStatus;
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
  durationSeconds: number;
  mediaUrl: string;
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
  duration: string;
  subjectSlug: string;
  title: string;
  videoUrl: string;
};

type BulkMateriLifecycleInput = {
  codes: string[];
  subjectSlug: string;
};

type MateriValidationField = "code" | "duration" | "subjectSlug" | "title" | "videoUrl";

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

function parseDurationSeconds(value: string) {
  const match = /^(\d{1,4}):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    throw new MateriValidationError(
      "Durasi harus memakai format MM:SS.",
      { duration: "Gunakan format MM:SS, misalnya 08:30." },
    );
  }

  const seconds = Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new MateriValidationError("Durasi harus lebih dari nol.", { duration: "Durasi harus lebih dari 00:00." });
  }

  return seconds;
}

function validateHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

function toPrimaryVideo(asset: {
  assetType: ModuleAssetType;
  durationSeconds: number | null;
  mediaUrl: string | null;
} | undefined) {
  if (!asset || asset.assetType !== ModuleAssetType.video || !asset.mediaUrl?.trim() || !asset.durationSeconds || asset.durationSeconds <= 0) {
    return null;
  }

  if (!validateHttpUrl(asset.mediaUrl)) {
    return null;
  }

  return { durationSeconds: asset.durationSeconds, mediaUrl: asset.mediaUrl };
}

function toMentorLesson(module: {
  assets: { assetType: ModuleAssetType; durationSeconds: number | null; mediaUrl: string | null }[];
  code: string;
  createdAt: Date;
  publishedAt: Date | null;
  sequenceNo: number;
  status: MateriLifecycleStatus;
  title: string;
  updatedAt: Date;
}): MentorMateriLesson {
  const primaryVideo = toPrimaryVideo(module.assets[0]);

  return {
    code: module.code,
    createdAt: module.createdAt.toISOString(),
    lifecycleStatus: module.status,
    primaryVideo,
    publishedAt: module.publishedAt?.toISOString() ?? null,
    readiness: primaryVideo && module.title.trim() ? "ready" : "incomplete",
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
                where: { assetType: ModuleAssetType.video, sortOrder: 0 },
                select: { assetType: true, durationSeconds: true, mediaUrl: true },
                take: 1,
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
      lessons: subtest.topics
        .filter((topic) => isCanonicalTopicForSubject(subject.slug, topic.code))
        .flatMap((topic) => topic.modules.map(toMentorLesson))
        .sort((left, right) => left.sequenceNo - right.sequenceNo || left.code.localeCompare(right.code)),
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
        where: { assetType: ModuleAssetType.video, sortOrder: 0 },
        select: { assetType: true, durationSeconds: true, mediaUrl: true },
        take: 1,
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
 * primary slot is a usable video. Incomplete/stale published records are
 * excluded in the final DTO check as well as in the database predicate.
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
              assets: { some: { assetType: ModuleAssetType.video, durationSeconds: { gt: 0 }, mediaUrl: { not: null }, sortOrder: 0 } },
            },
            orderBy: [{ sequenceNo: "asc" }, { code: "asc" }],
            select: {
              assets: { where: { assetType: ModuleAssetType.video, sortOrder: 0 }, select: { assetType: true, durationSeconds: true, mediaUrl: true }, take: 1 },
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
      lessons: subtest.topics
        .filter((topic) => isCanonicalTopicForSubject(subject.slug, topic.code))
        .flatMap((topic) => topic.modules.flatMap((module) => {
          const video = toPrimaryVideo(module.assets[0]);
          return video && module.title.trim() ? [{ ...video, code: module.code, sequenceNo: module.sequenceNo, title: module.title }] : [];
        }))
        .sort((left, right) => left.sequenceNo - right.sequenceNo || left.code.localeCompare(right.code)),
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
      assets: { some: { assetType: ModuleAssetType.video, durationSeconds: { gt: 0 }, mediaUrl: { not: null }, sortOrder: 0 } },
    },
    select: {
      assets: { where: { assetType: ModuleAssetType.video, sortOrder: 0 }, select: { assetType: true, durationSeconds: true, mediaUrl: true }, take: 1 },
      code: true,
      sequenceNo: true,
      title: true,
      topic: { select: { code: true, subtest: { select: { code: true, name: true, sortOrder: true } } } },
    },
  });
  const video = lessonRecord ? toPrimaryVideo(lessonRecord.assets[0]) : null;
  if (!lessonRecord || !video || !lessonRecord.title.trim()) return undefined;

  return {
    ...video,
    code: lessonRecord.code,
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
    const topics = await tx.topic.findMany({
      where: { code: { in: getCanonicalTopicCodes(subject.slug) }, parentTopicId: null, subtest: { code: subject.code } },
      orderBy: { code: "asc" },
      select: { id: true },
    });
    if (topics.length !== 3) throw new MateriValidationError("Struktur internal Materi tidak lengkap.");

    // A deterministic lock order serializes overlapping subject reorders.
    await tx.$queryRawUnsafe("SELECT id FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", topics.map((topic) => topic.id));
    const current = await tx.module.findMany({
      where: { topicId: { in: topics.map((topic) => topic.id) } },
      orderBy: [{ sequenceNo: "asc" }, { code: "asc" }],
      select: { code: true, sequenceNo: true },
    });
    const currentCodes = current.map((lesson) => lesson.code);
    if (currentCodes.length !== orderedCodes.length || currentCodes.some((code) => !orderedCodes.includes(code))) {
      throw new MateriValidationError("Urutan Materi sudah berubah. Muat ulang lalu coba lagi.");
    }

    const maxSequence = Math.max(0, ...current.map((lesson) => lesson.sequenceNo));
    for (const [index, lesson] of current.entries()) {
      await tx.module.update({ where: { code: lesson.code }, data: { sequenceNo: maxSequence + current.length + index + 1 } });
    }
    for (const [index, code] of orderedCodes.entries()) {
      await tx.module.update({ where: { code }, data: { sequenceNo: index + 1, updatedByUserId: tutorId } });
    }

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
  const videoUrl = input.videoUrl.trim();
  if (!subject || !title || !validateHttpUrl(videoUrl)) {
    throw new MateriValidationError("Lengkapi subject, judul, dan URL video yang valid.");
  }
  const durationSeconds = parseDurationSeconds(input.duration);
  let code = input.code?.trim();

  await prisma.$transaction(async (tx) => {
    const current = code ? await tx.module.findUnique({ where: { code }, select: { id: true, code: true, topicId: true, topic: { select: { code: true, subtest: { select: { code: true } } } } } }) : null;
    if (code && !current) throw new MateriValidationError("Lesson tidak ditemukan.");
    const source = current ? getSubjectByCode(current.topic.subtest.code) : undefined;
    if (current && (!source || !isCanonicalTopicForSubject(source.slug, current.topic.code))) throw new MateriValidationError("Lesson tidak berada dalam katalog Materi kanonis.");
    if (!code) code = createMateriCode(title);

    const subjectSlugs = [...new Set([subject.slug, source?.slug].filter(Boolean))] as string[];
    const topics = await tx.topic.findMany({ where: { code: { in: subjectSlugs.flatMap(getCanonicalTopicCodes) }, parentTopicId: null }, orderBy: [{ subtestId: "asc" }, { code: "asc" }], select: { id: true, code: true, subtest: { select: { code: true } } } });
    const expectedTopics = subjectSlugs.length * 3;
    if (topics.length !== expectedTopics) throw new MateriValidationError("Struktur internal Materi tidak lengkap.");
    await tx.$queryRawUnsafe("SELECT id FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", topics.map((topic) => topic.id));

    const topicBySubject = new Map<string, typeof topics>();
    for (const topic of topics) {
      const group = topicBySubject.get(topic.subtest.code) ?? [];
      group.push(topic); topicBySubject.set(topic.subtest.code, group);
    }
    const modules = await tx.module.findMany({ where: { topicId: { in: topics.map((topic) => topic.id) } }, orderBy: [{ sequenceNo: "asc" }, { code: "asc" }], select: { code: true, sequenceNo: true, topicId: true } });
    const max = Math.max(0, ...modules.map((lesson) => Math.abs(lesson.sequenceNo)));
    for (const [index, lesson] of modules.entries()) await tx.module.update({ where: { code: lesson.code }, data: { sequenceNo: max + modules.length + index + 1 } });

    const sourceCode = source?.code;
    const destinationTopics = topicBySubject.get(subject.code)!;
    const destinationTopicId = current && sourceCode === subject.code ? current.topicId : destinationTopics[0].id;
    if (!current) {
      await tx.module.create({ data: { code, topicId: destinationTopicId, title, sequenceNo: max + (modules.length * 2) + 1, estimatedMinutes: Math.ceil(durationSeconds / 60), status: ContentStatus.draft, createdByUserId: tutorId, updatedByUserId: tutorId } });
    } else {
      await tx.module.update({ where: { code }, data: { ...(sourceCode === subject.code ? {} : { topicId: destinationTopicId }), title, estimatedMinutes: Math.ceil(durationSeconds / 60), updatedByUserId: tutorId } });
    }

    const orderFor = (subjectCode: string) => modules.filter((lesson) => topicBySubject.get(subjectCode)!.some((topic) => topic.id === lesson.topicId)).map((lesson) => lesson.code).filter((candidate) => candidate !== code);
    const orders = new Map<string, string[]>();
    if (sourceCode && sourceCode !== subject.code) orders.set(sourceCode, orderFor(sourceCode));
    const destinationOrder = current && sourceCode === subject.code ? [...orderFor(subject.code), code] : [...orderFor(subject.code), code];
    if (current && sourceCode === subject.code) {
      const original = modules.filter((lesson) => topicBySubject.get(subject.code)!.some((topic) => topic.id === lesson.topicId)).map((lesson) => lesson.code);
      orders.set(subject.code, original);
    } else orders.set(subject.code, destinationOrder);

    for (const orderedCodes of orders.values()) for (const [index, moduleCode] of orderedCodes.entries()) await tx.module.update({ where: { code: moduleCode }, data: { sequenceNo: index + 1, updatedByUserId: tutorId } });
    const saved = await tx.module.findUnique({ where: { code }, select: { id: true } });
    if (!saved) throw new Error("Lesson tersimpan tetapi tidak dapat dimuat ulang.");
    await tx.moduleAsset.upsert({ where: { moduleId_sortOrder: { moduleId: saved.id, sortOrder: 0 } }, create: { moduleId: saved.id, sortOrder: 0, assetType: ModuleAssetType.video, title, mediaUrl: videoUrl, durationSeconds }, update: { assetType: ModuleAssetType.video, title, mediaUrl: videoUrl, durationSeconds } });
  });
  const saved = await getMentorMateriByCode(code!);
  if (!saved) throw new Error("Lesson tersimpan tetapi tidak dapat dimuat ulang.");
  return saved;
}

async function publishMateriLesson(code: string, tutorId: string) {
  const lesson = await getMentorMateriByCode(code);
  if (!lesson) throw new MateriValidationError("Lesson tidak ditemukan.", { code: "Lesson tidak ditemukan." });
  if (lesson.lifecycleStatus !== ContentStatus.draft) {
    throw new MateriValidationError("Hanya lesson draf yang dapat diterbitkan.");
  }
  if (lesson.readiness !== "ready") {
    throw new MateriValidationError("Lengkapi judul, durasi, dan URL video sebelum menerbitkan.");
  }

  const updated = await prisma.module.updateMany({
    where: { code, status: ContentStatus.draft },
    data: { publishedAt: new Date(), status: ContentStatus.published, updatedByUserId: tutorId },
  });
  if (updated.count !== 1) throw new MateriValidationError("Status lesson berubah. Muat ulang halaman lalu coba lagi.");
  return getMentorMateriByCode(code);
}

async function unpublishMateriLesson(code: string, tutorId: string) {
  const lesson = await getMentorMateriByCode(code);
  if (!lesson) throw new MateriValidationError("Lesson tidak ditemukan.", { code: "Lesson tidak ditemukan." });
  if (lesson.lifecycleStatus !== ContentStatus.published) {
    throw new MateriValidationError("Hanya lesson yang sudah terbit dapat dibatalkan penerbitannya.");
  }

  const updated = await prisma.module.updateMany({
    where: { code, status: ContentStatus.published },
    data: { status: ContentStatus.draft, updatedByUserId: tutorId },
  });
  if (updated.count !== 1) throw new MateriValidationError("Status lesson berubah. Muat ulang halaman lalu coba lagi.");
  return getMentorMateriByCode(code);
}

async function archiveMateriLesson(code: string, tutorId: string) {
  const lesson = await getMentorMateriByCode(code);
  if (!lesson) throw new MateriValidationError("Lesson tidak ditemukan.", { code: "Lesson tidak ditemukan." });
  if (lesson.lifecycleStatus === ContentStatus.archived) throw new MateriValidationError("Lesson sudah diarsipkan.");

  const updated = await prisma.module.updateMany({
    where: { code, status: { not: ContentStatus.archived } },
    data: { status: ContentStatus.archived, updatedByUserId: tutorId },
  });
  if (updated.count !== 1) throw new MateriValidationError("Status lesson berubah. Muat ulang halaman lalu coba lagi.");
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
    await tx.$queryRawUnsafe("SELECT id FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", topics.map((topic) => topic.id));
    const topicIds = topics.map((topic) => topic.id);
    const records = await tx.module.findMany({
      where: {
        code: { in: codes },
        topicId: { in: topicIds },
      },
      select: {
        assets: {
          where: { assetType: ModuleAssetType.video, sortOrder: 0 },
          select: { assetType: true, durationSeconds: true, mediaUrl: true },
          take: 1,
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
    if (operation === "publish" && records.some((record) => !record.title.trim() || !toPrimaryVideo(record.assets[0]))) {
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
 * its stable public code, primary video, topic placement, and sequence.
 */
async function returnMateriLessonToDraft(code: string, tutorId: string) {
  const lesson = await getMentorMateriByCode(code);
  if (!lesson) throw new MateriValidationError("Lesson tidak ditemukan.", { code: "Lesson tidak ditemukan." });
  if (lesson.lifecycleStatus !== ContentStatus.scheduled && lesson.lifecycleStatus !== ContentStatus.archived) {
    throw new MateriValidationError("Hanya lesson terjadwal atau diarsipkan yang dapat dikembalikan menjadi draf.");
  }

  const updated = await prisma.module.updateMany({
    where: { code, status: { in: [ContentStatus.scheduled, ContentStatus.archived] } },
    data: { status: ContentStatus.draft, updatedByUserId: tutorId },
  });
  if (updated.count !== 1) throw new MateriValidationError("Status lesson berubah. Muat ulang halaman lalu coba lagi.");
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
};
export type {
  BulkMateriLifecycleInput,
  MateriCourseSlug,
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

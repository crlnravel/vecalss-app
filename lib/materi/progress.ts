import "server-only";

import {
  ContentStatus,
  ModuleAssetType,
  ProgressStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isMateriReady,
  readMateriResources,
  type MateriResourceLike,
} from "@/lib/materi/contract";
import type { CourseProgressSnapshot } from "@/modules/courses/data";

import {
  buildCourseProgressSnapshot,
  ensureInitialProgressStatuses,
  getProgressionStatus,
  ProgressionTransitionError,
  transitionComplete,
  transitionSkip,
} from "./progress-state";
import { lockMateriProgressScope, lockMateriSubjectScope } from "./locks";
import { materiSubjects } from "./repository";

type ProgressionCourse = {
  code: string;
  lessons: readonly { code: string }[];
  slug: string;
};

type PublishedProgressionModule = {
  code: string;
  id: string;
  sequenceNo: number;
};

type ProgressRow = {
  moduleId: string;
  status: ProgressStatus;
};

type MateriProgressErrorCode = "invalid" | "locked" | "not_found";

class MateriProgressError extends Error {
  code: MateriProgressErrorCode;
  status: number;

  constructor(code: MateriProgressErrorCode, message: string, status: number) {
    super(message);
    this.name = "MateriProgressError";
    this.code = code;
    this.status = status;
  }
}

const progressError = (
  code: MateriProgressErrorCode,
  message: string,
  status: number,
) => new MateriProgressError(code, message, status);

function getSubject(courseSlug: string) {
  return materiSubjects.find((subject) => subject.slug === courseSlug);
}

async function findPublishedProgressionModules(
  tx: Prisma.TransactionClient,
  courseSlug: string,
): Promise<PublishedProgressionModule[]> {
  const subject = getSubject(courseSlug);
  if (!subject) return [];

  const topicCodes = [1, 2, 3].map(
    (sectionNo) => `materi:${subject.slug}:section-${sectionNo}`,
  );
  const records = await tx.module.findMany({
    where: {
      status: ContentStatus.published,
      topic: {
        code: { in: topicCodes },
        isActive: true,
        parentTopicId: null,
        subtest: { code: subject.code, isActive: true },
      },
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
      sequenceNo: true,
      title: true,
    },
  });

  return records.flatMap((record) => {
    const resources = readMateriResources(record.assets as MateriResourceLike[]);
    return isMateriReady(record.title, resources)
      ? [{ code: record.code, id: record.id, sequenceNo: record.sequenceNo }]
      : [];
  });
}

async function readProgressRows(
  tx: Prisma.TransactionClient,
  studentId: string,
  modules: readonly PublishedProgressionModule[],
) {
  if (modules.length === 0) return [] as ProgressRow[];

  return tx.moduleProgress.findMany({
    where: {
      moduleId: { in: modules.map((module) => module.id) },
      studentId,
    },
    select: { moduleId: true, status: true },
  });
}

async function upsertProgressStatus(
  tx: Prisma.TransactionClient,
  studentId: string,
  moduleId: string,
  status: ProgressStatus,
) {
  const now = new Date();
  const isCompleted = status === ProgressStatus.completed;
  const isAdmitted = status === ProgressStatus.in_progress || isCompleted;

  await tx.moduleProgress.upsert({
    where: { studentId_moduleId: { moduleId, studentId } },
    create: {
      completedAt: isCompleted ? now : null,
      lastOpenedAt: isAdmitted ? now : null,
      moduleId,
      percentComplete: isCompleted ? 100 : 0,
      status,
      studentId,
      unlockedAt: isAdmitted ? now : null,
    },
    update: {
      completedAt: isCompleted ? now : null,
      lastOpenedAt: isAdmitted ? now : undefined,
      percentComplete: isCompleted ? 100 : 0,
      status,
      unlockedAt: isAdmitted ? now : null,
    },
  });
}

async function ensureCurrentAdmission(
  tx: Prisma.TransactionClient,
  studentId: string,
  modules: readonly PublishedProgressionModule[],
) {
  let rows = await readProgressRows(tx, studentId, modules);
  const desired = ensureInitialProgressStatuses(modules, rows);
  if (modules.length === 0 || desired.every((row, index) => row.status === rows.find((current) => current.moduleId === modules[index]?.id)?.status)) {
    return rows;
  }

  // This covers both a brand-new student (first unit admission) and a
  // recovered/legacy row set whose active unit was missing after completion.
  const current = new Map(rows.map((row) => [row.moduleId, row.status]));
  for (const row of desired) {
    if (current.get(row.moduleId) !== row.status && row.status === ProgressStatus.in_progress) {
      await upsertProgressStatus(tx, studentId, row.moduleId, row.status);
    }
  }
  rows = await readProgressRows(tx, studentId, modules);
  return rows;
}

async function getCourseProgressSnapshotInTransaction(
  tx: Prisma.TransactionClient,
  studentId: string,
  courseSlug: string,
) {
  const subject = getSubject(courseSlug);
  if (!subject) return { completedLessonIds: [] } satisfies CourseProgressSnapshot;

  // The shared subject lock serializes this snapshot with mentor reorder/save
  // transactions as well as with this student's own progress mutations.
  await lockMateriSubjectScope(tx, subject.code);
  await lockMateriProgressScope(tx, studentId, subject.code);
  const modules = await findPublishedProgressionModules(tx, courseSlug);
  const rows = await ensureCurrentAdmission(tx, studentId, modules);

  return buildCourseProgressSnapshot(modules, rows);
}

async function getCourseProgressSnapshots(
  studentId: string,
  courses: readonly ProgressionCourse[],
): Promise<Record<string, CourseProgressSnapshot>> {
  return prisma.$transaction(async (tx) => {
    const snapshots: Record<string, CourseProgressSnapshot> = {};
    const orderedCourses = [...courses].sort((left, right) => left.code.localeCompare(right.code));

    for (const course of orderedCourses) {
      snapshots[course.slug] = await getCourseProgressSnapshotInTransaction(
        tx,
        studentId,
        course.slug,
      );
    }

    return snapshots;
  }, { timeout: 20_000 });
}

async function assertMateriLessonAdmitted(
  studentId: string,
  courseSlug: string,
  lessonCode: string,
) {
  const subject = getSubject(courseSlug);
  if (!subject) {
    throw progressError("not_found", "Materi tidak ditemukan.", 404);
  }

  return prisma.$transaction(async (tx) => {
    await lockMateriSubjectScope(tx, subject.code);
    await lockMateriProgressScope(tx, studentId, subject.code);
    const modules = await findPublishedProgressionModules(tx, courseSlug);
    const target = modules.find((module) => module.code === lessonCode);
    if (!target) {
      throw progressError("not_found", "Materi tidak ditemukan.", 404);
    }

    const rows = await ensureCurrentAdmission(tx, studentId, modules);
    const status = getProgressionStatus(rows, target.id);
    if (status !== ProgressStatus.in_progress && status !== ProgressStatus.completed) {
      throw progressError("locked", "Dokumen Materi belum tersedia.", 403);
    }

    return buildCourseProgressSnapshot(modules, rows);
  });
}

async function completeMateriLesson(
  studentId: string,
  courseSlug: string,
  lessonCode: string,
) {
  return prisma.$transaction(async (tx) => {
    const subject = getSubject(courseSlug);
    if (!subject) throw progressError("not_found", "Materi tidak ditemukan.", 404);

    await lockMateriSubjectScope(tx, subject.code);
    await lockMateriProgressScope(tx, studentId, subject.code);
    const modules = await findPublishedProgressionModules(tx, courseSlug);
    const target = modules.find((module) => module.code === lessonCode);
    if (!target) throw progressError("not_found", "Materi tidak ditemukan.", 404);

    let rows = await ensureCurrentAdmission(tx, studentId, modules);
    let transition: ReturnType<typeof transitionComplete>;
    try {
      transition = transitionComplete(modules, rows, target.id);
    } catch (error) {
      if (error instanceof ProgressionTransitionError) {
        throw progressError(error.code, error.message, error.code === "locked" ? 403 : 409);
      }
      throw error;
    }
    const current = new Map(rows.map((row) => [row.moduleId, row.status]));
    for (const row of transition.rows) {
      if (current.get(row.moduleId) !== row.status) {
        await upsertProgressStatus(tx, studentId, row.moduleId, row.status);
      }
    }
    rows = await readProgressRows(tx, studentId, modules);
    return buildCourseProgressSnapshot(modules, rows);
  });
}

async function skipToMateriLesson(
  studentId: string,
  courseSlug: string,
  lessonCode: string,
) {
  return prisma.$transaction(async (tx) => {
    const subject = getSubject(courseSlug);
    if (!subject) throw progressError("not_found", "Materi tidak ditemukan.", 404);

    await lockMateriSubjectScope(tx, subject.code);
    await lockMateriProgressScope(tx, studentId, subject.code);
    const modules = await findPublishedProgressionModules(tx, courseSlug);
    const target = modules.find((module) => module.code === lessonCode);
    if (!target) throw progressError("not_found", "Materi tidak ditemukan.", 404);
    const rows = await ensureCurrentAdmission(tx, studentId, modules);
    let transition: ReturnType<typeof transitionSkip>;
    try {
      transition = transitionSkip(modules, rows, target.id);
    } catch (error) {
      if (error instanceof ProgressionTransitionError) {
        throw progressError(error.code, error.message, error.code === "locked" ? 403 : 409);
      }
      throw error;
    }
    const current = new Map(rows.map((row) => [row.moduleId, row.status]));
    for (const row of transition.rows) {
      if (current.get(row.moduleId) !== row.status) {
        await upsertProgressStatus(tx, studentId, row.moduleId, row.status);
      }
    }

    const updatedRows = await readProgressRows(tx, studentId, modules);
    return buildCourseProgressSnapshot(modules, updatedRows);
  });
}

export {
  assertMateriLessonAdmitted,
  completeMateriLesson,
  getCourseProgressSnapshots,
  MateriProgressError,
  skipToMateriLesson,
};
export type { MateriProgressErrorCode, ProgressionCourse };

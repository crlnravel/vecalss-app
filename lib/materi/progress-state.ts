import { ProgressStatus } from "@/generated/prisma/client";
import type { CourseProgressSnapshot } from "@/modules/courses/data";

type ProgressionModule = {
  code: string;
  id: string;
  sequenceNo?: number;
};

type ProgressionRow = {
  moduleId: string;
  status: ProgressStatus;
};

type ProgressionTransitionErrorCode = "invalid" | "locked";

class ProgressionTransitionError extends Error {
  code: ProgressionTransitionErrorCode;

  constructor(code: ProgressionTransitionErrorCode, message: string) {
    super(message);
    this.name = "ProgressionTransitionError";
    this.code = code;
  }
}

function normalizeProgressRows(
  modules: readonly ProgressionModule[],
  rows: readonly ProgressionRow[],
) {
  const rowsByModuleId = new Map(rows.map((row) => [row.moduleId, row.status]));
  return modules.map((module) => ({
    moduleId: module.id,
    status: rowsByModuleId.get(module.id) ?? ProgressStatus.locked,
  }));
}

function getProgressionStatus(
  rows: readonly ProgressionRow[],
  moduleId: string,
) {
  return rows.find((row) => row.moduleId === moduleId)?.status ?? ProgressStatus.locked;
}

function isProgressStatusAdmitted(status: ProgressStatus) {
  return status === ProgressStatus.in_progress || status === ProgressStatus.completed;
}

function buildCourseProgressSnapshot(
  modules: readonly ProgressionModule[],
  rows: readonly ProgressionRow[],
): CourseProgressSnapshot {
  const normalizedRows = normalizeProgressRows(modules, rows);
  const completedLessonIds = modules
    .filter((module) => getProgressionStatus(normalizedRows, module.id) === ProgressStatus.completed)
    .map((module) => module.code);
  const currentIndex = modules.findIndex(
    (module) => getProgressionStatus(normalizedRows, module.id) === ProgressStatus.in_progress,
  );
  const hasSkippedBeforeCurrent = currentIndex > 0 && modules
    .slice(0, currentIndex)
    .some((module) => getProgressionStatus(normalizedRows, module.id) === ProgressStatus.skipped);

  return {
    completedLessonIds,
    ...(currentIndex >= 0 && hasSkippedBeforeCurrent
      ? { skippedToLessonId: modules[currentIndex]?.code }
      : {}),
  };
}

function ensureInitialProgressStatuses(
  modules: readonly ProgressionModule[],
  rows: readonly ProgressionRow[],
) {
  const normalizedRows = normalizeProgressRows(modules, rows);
  if (
    modules.length === 0
    || normalizedRows.some((row) => row.status === ProgressStatus.in_progress)
  ) {
    return normalizedRows;
  }

  const completed = new Set(
    normalizedRows
      .filter((row) => row.status === ProgressStatus.completed)
      .map((row) => row.moduleId),
  );
  const earliestIncompleteIndex = modules.findIndex((module) => !completed.has(module.id));
  if (earliestIncompleteIndex >= 0) {
    normalizedRows[earliestIncompleteIndex] = {
      moduleId: modules[earliestIncompleteIndex]!.id,
      status: ProgressStatus.in_progress,
    };
  }
  return normalizedRows;
}

function transitionComplete(
  modules: readonly ProgressionModule[],
  rows: readonly ProgressionRow[],
  targetModuleId: string,
) {
  const normalizedRows = ensureInitialProgressStatuses(modules, rows);
  const targetIndex = modules.findIndex((module) => module.id === targetModuleId);
  if (targetIndex < 0) {
    throw new ProgressionTransitionError("invalid", "Materi tidak ditemukan.");
  }

  const targetStatus = getProgressionStatus(normalizedRows, targetModuleId);
  if (targetStatus === ProgressStatus.completed) {
    return { rows: normalizedRows, snapshot: buildCourseProgressSnapshot(modules, normalizedRows) };
  }
  if (targetStatus !== ProgressStatus.in_progress) {
    throw new ProgressionTransitionError("locked", "Materi ini masih terkunci.");
  }

  normalizedRows[targetIndex] = {
    moduleId: targetModuleId,
    status: ProgressStatus.completed,
  };
  const completed = new Set(
    normalizedRows
      .filter((row) => row.status === ProgressStatus.completed)
      .map((row) => row.moduleId),
  );
  const nextIndex = modules.findIndex((module) => !completed.has(module.id));

  if (nextIndex >= 0) {
    for (const [index, module] of modules.entries()) {
      if (completed.has(module.id)) continue;
      normalizedRows[index] = {
        moduleId: module.id,
        status: index === nextIndex
          ? ProgressStatus.in_progress
          : normalizedRows[index]?.status === ProgressStatus.skipped
            ? ProgressStatus.skipped
            : ProgressStatus.locked,
      };
    }
  }

  return { rows: normalizedRows, snapshot: buildCourseProgressSnapshot(modules, normalizedRows) };
}

function transitionSkip(
  modules: readonly ProgressionModule[],
  rows: readonly ProgressionRow[],
  targetModuleId: string,
) {
  const normalizedRows = ensureInitialProgressStatuses(modules, rows);
  const targetIndex = modules.findIndex((module) => module.id === targetModuleId);
  if (targetIndex < 0) {
    throw new ProgressionTransitionError("invalid", "Materi tidak ditemukan.");
  }
  if (getProgressionStatus(normalizedRows, targetModuleId) === ProgressStatus.completed) {
    throw new ProgressionTransitionError("invalid", "Bacaan yang sudah selesai tidak dapat dilewati.");
  }

  const completed = new Set(
    normalizedRows
      .filter((row) => row.status === ProgressStatus.completed)
      .map((row) => row.moduleId),
  );
  for (const [index, module] of modules.entries()) {
    normalizedRows[index] = {
      moduleId: module.id,
      status: completed.has(module.id)
        ? ProgressStatus.completed
        : index < targetIndex
          ? ProgressStatus.skipped
          : index === targetIndex
            ? ProgressStatus.in_progress
            : ProgressStatus.locked,
    };
  }

  return { rows: normalizedRows, snapshot: buildCourseProgressSnapshot(modules, normalizedRows) };
}

export {
  buildCourseProgressSnapshot,
  ensureInitialProgressStatuses,
  getProgressionStatus,
  isProgressStatusAdmitted,
  ProgressionTransitionError,
  transitionComplete,
  transitionSkip,
};
export type {
  ProgressionModule,
  ProgressionRow,
  ProgressionTransitionErrorCode,
};

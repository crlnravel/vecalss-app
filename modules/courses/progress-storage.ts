"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  getCourseLesson,
  getCourseProgressState,
  getSeedCourseProgress,
  type Course,
  type CourseProgressSnapshot,
} from "@/modules/courses/data";

const STUDENT_MATERI_PROGRESS_STORAGE_KEY = "vecalss.student.materi-progress.v1";
const STUDENT_MATERI_PROGRESS_STORAGE_VERSION = 1;
const progressChangeEvent = "vecalss-student-materi-progress-change";
const serverStorageSnapshot = "__vecalss_server_student_materi_progress_snapshot__";

type StoredLearningProgress = Record<string, CourseProgressSnapshot>;

let inMemoryProgress: StoredLearningProgress | null = null;
let storageUnavailable = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function getCourseMap(courses: readonly Course[]) {
  return new Map(courses.map((course) => [course.slug, course]));
}

function parseStoredLearningProgress(
  value: string | null,
  courses: readonly Course[],
): StoredLearningProgress | null {
  if (!value) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) {
      return null;
    }

    const courseMap = getCourseMap(courses);
    const result: StoredLearningProgress = {};

    for (const [courseSlug, rawProgress] of Object.entries(parsed)) {
      const course = courseMap.get(courseSlug);
      if (!course || !isRecord(rawProgress) || !hasOnlyKeys(rawProgress, ["completedLessonIds", "skippedToLessonId"])) {
        return null;
      }

      const completedLessonIds = rawProgress.completedLessonIds;
      if (
        !Array.isArray(completedLessonIds)
        || completedLessonIds.some(
          (lessonId) => typeof lessonId !== "string" || lessonId.length === 0,
        )
        || new Set(completedLessonIds).size !== completedLessonIds.length
      ) {
        return null;
      }

      const skippedToLessonId = rawProgress.skippedToLessonId;
      if (
        skippedToLessonId !== undefined
        && (typeof skippedToLessonId !== "string" || skippedToLessonId.length === 0)
      ) {
        return null;
      }

      result[courseSlug] = {
        completedLessonIds: [...completedLessonIds],
        ...(skippedToLessonId === undefined ? {} : { skippedToLessonId }),
      };
    }

    return result;
  } catch {
    return null;
  }
}

function getSeedLearningProgress(courses: readonly Course[]): StoredLearningProgress {
  return Object.fromEntries(courses.map((course) => [course.slug, getSeedCourseProgress(course)]));
}

function mergeWithSeedProgress(
  stored: StoredLearningProgress | null,
  courses: readonly Course[],
): StoredLearningProgress {
  const seed = getSeedLearningProgress(courses);
  const courseMap = getCourseMap(courses);

  for (const course of courses) {
    const storedCourse = stored?.[course.slug];
    if (!storedCourse) {
      continue;
    }

    const seedCourse = seed[course.slug];
    seedCourse.completedLessonIds = [
      ...new Set([...seedCourse.completedLessonIds, ...storedCourse.completedLessonIds]),
    ];

    if (storedCourse.skippedToLessonId && courseMap.has(course.slug)) {
      seedCourse.skippedToLessonId = storedCourse.skippedToLessonId;
    }
  }

  return seed;
}

function readRawProgress() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(STUDENT_MATERI_PROGRESS_STORAGE_KEY);
  } catch {
    storageUnavailable = true;
    return null;
  }
}

function readInMemoryProgress(courses: readonly Course[]) {
  if (!inMemoryProgress) {
    return null;
  }

  try {
    const validated = parseStoredLearningProgress(JSON.stringify(inMemoryProgress), courses);
    return validated === null ? null : mergeWithSeedProgress(validated, courses);
  } catch {
    return null;
  }
}

function readLearningProgress(courses: readonly Course[]): StoredLearningProgress {
  if (storageUnavailable) {
    const memoryProgress = readInMemoryProgress(courses);
    if (memoryProgress) {
      return memoryProgress;
    }
  }

  return mergeWithSeedProgress(parseStoredLearningProgress(readRawProgress(), courses), courses);
}

function notifyProgressChange() {
  try {
    window.dispatchEvent(new Event(progressChangeEvent));
  } catch {
    // Event dispatch is best effort; the in-memory snapshot remains readable synchronously.
  }
}

function writeLearningProgress(
  progress: StoredLearningProgress,
  courses: readonly Course[],
) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const serialized = JSON.stringify(progress);
    if (parseStoredLearningProgress(serialized, courses) === null) {
      return false;
    }

    window.localStorage.setItem(STUDENT_MATERI_PROGRESS_STORAGE_KEY, serialized);
    inMemoryProgress = null;
    storageUnavailable = false;
    notifyProgressChange();
    return true;
  } catch {
    try {
      const validated = parseStoredLearningProgress(JSON.stringify(progress), courses);
      if (validated !== null) {
        inMemoryProgress = mergeWithSeedProgress(validated, courses);
        storageUnavailable = true;
        notifyProgressChange();
      }
    } catch {
      // Do not retain a value that could not be serialized and validated.
    }
    return false;
  }
}

function updateCourseProgress(
  courseSlug: string,
  update: (progress: CourseProgressSnapshot, course: Course) => CourseProgressSnapshot,
  courses: readonly Course[],
) {
  const course = courses.find((candidate) => candidate.slug === courseSlug);
  const current = readLearningProgress(courses);
  if (!course || !getCourseMap(courses).has(courseSlug)) {
    return current;
  }

  const next = {
    ...current,
    [courseSlug]: update(current[courseSlug] ?? getSeedCourseProgress(course), course),
  };
  writeLearningProgress(next, courses);
  return next;
}

function completeCourseLesson(
  courseSlug: string,
  lessonId: string,
  courses: readonly Course[],
) {
  return updateCourseProgress(courseSlug, (progress, course) => {
    if (!getCourseLesson(course, lessonId) || progress.completedLessonIds.includes(lessonId)) {
      return progress;
    }

    return {
      ...progress,
      completedLessonIds: [...progress.completedLessonIds, lessonId],
    };
  }, courses);
}

function skipToCourseLesson(
  courseSlug: string,
  lessonId: string,
  courses: readonly Course[],
) {
  return updateCourseProgress(courseSlug, (progress, course) => {
    if (
      !getCourseLesson(course, lessonId)
      || progress.completedLessonIds.includes(lessonId)
      || progress.skippedToLessonId === lessonId
    ) {
      return progress;
    }

    return { ...progress, skippedToLessonId: lessonId };
  }, courses);
}

function getStoredCourseProgress(courseSlug: string, courses: readonly Course[]) {
  return readLearningProgress(courses)[courseSlug];
}

function useCourseProgress(course: Course, courses: readonly Course[]) {
  const serializedProgress = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener(progressChangeEvent, onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(progressChangeEvent, onStoreChange);
      };
    },
    () => {
      const rawProgress = readRawProgress();
      if (storageUnavailable && inMemoryProgress) {
        return JSON.stringify(inMemoryProgress);
      }

      return rawProgress ?? "";
    },
    () => serverStorageSnapshot,
  );

  return useMemo(() => {
    const stored = serializedProgress === serverStorageSnapshot
      ? null
      : parseStoredLearningProgress(serializedProgress, courses);
    return getCourseProgressState(course, stored?.[course.slug] ?? getSeedCourseProgress(course));
  }, [course, courses, serializedProgress]);
}

export {
  getSeedLearningProgress,
  getStoredCourseProgress,
  parseStoredLearningProgress,
  readLearningProgress,
  completeCourseLesson,
  skipToCourseLesson,
  useCourseProgress,
  writeLearningProgress,
  STUDENT_MATERI_PROGRESS_STORAGE_KEY,
  STUDENT_MATERI_PROGRESS_STORAGE_VERSION,
};
export type { StoredLearningProgress };

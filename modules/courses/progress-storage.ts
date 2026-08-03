"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import {
  getCourseLesson,
  getCourseProgressState,
  getSeedCourseProgress,
  getLessonProgressStatus,
  type Course,
  type CourseProgressSnapshot,
} from "@/modules/courses/data";

// v2 is a deliberate curriculum boundary. The old video-first key and its
// baseline completions are never read or merged into the ebook-first path.
const STUDENT_MATERI_PROGRESS_STORAGE_KEY = "vecalss.student.materi-progress.v2";
const STUDENT_MATERI_PROGRESS_STORAGE_VERSION = 2;
const anonymousStudentIdentity = "anonymous";
const progressChangeEvent = "vecalss-student-materi-progress-change";
const serverStorageSnapshot = "__vecalss_server_student_materi_progress_snapshot__";

type StoredLearningProgress = Record<string, CourseProgressSnapshot>;

const inMemoryProgressByIdentity = new Map<string, StoredLearningProgress>();
const storageUnavailableIdentities = new Set<string>();
const hydratedServerProgressKeys = new Map<string, string>();

function normalizeStudentIdentity(studentIdentity?: string) {
  const normalized = studentIdentity?.trim();
  return normalized || anonymousStudentIdentity;
}

function getStudentMateriProgressStorageKey(studentIdentity?: string) {
  return `${STUDENT_MATERI_PROGRESS_STORAGE_KEY}.${encodeURIComponent(normalizeStudentIdentity(studentIdentity))}`;
}

function getProgressChangeEvent(studentIdentity?: string) {
  return `${progressChangeEvent}:${encodeURIComponent(normalizeStudentIdentity(studentIdentity))}`;
}

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
      const lessonIds = new Set(course.lessons.map((lesson) => lesson.id));
      if (
        !Array.isArray(completedLessonIds)
        || completedLessonIds.some(
          (lessonId) => typeof lessonId !== "string" || lessonId.length === 0 || !lessonIds.has(lessonId),
        )
        || new Set(completedLessonIds).size !== completedLessonIds.length
      ) {
        return null;
      }

      const skippedToLessonId = rawProgress.skippedToLessonId;
      if (
        skippedToLessonId !== undefined
        && (
          typeof skippedToLessonId !== "string"
          || skippedToLessonId.length === 0
          || !lessonIds.has(skippedToLessonId)
          || completedLessonIds.includes(skippedToLessonId)
        )
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

function readRawProgress(studentIdentity?: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(getStudentMateriProgressStorageKey(studentIdentity));
  } catch {
    storageUnavailableIdentities.add(normalizeStudentIdentity(studentIdentity));
    return null;
  }
}

function readInMemoryProgress(courses: readonly Course[], studentIdentity?: string) {
  const identity = normalizeStudentIdentity(studentIdentity);
  const progress = inMemoryProgressByIdentity.get(identity);
  if (!progress) {
    return null;
  }

  try {
    const validated = parseStoredLearningProgress(JSON.stringify(progress), courses);
    return validated === null ? null : mergeWithSeedProgress(validated, courses);
  } catch {
    return null;
  }
}

function readLearningProgress(
  courses: readonly Course[],
  studentIdentity?: string,
): StoredLearningProgress {
  const identity = normalizeStudentIdentity(studentIdentity);
  if (storageUnavailableIdentities.has(identity)) {
    const memoryProgress = readInMemoryProgress(courses, identity);
    if (memoryProgress) {
      return memoryProgress;
    }
  }

  return mergeWithSeedProgress(parseStoredLearningProgress(readRawProgress(identity), courses), courses);
}

function notifyProgressChange(studentIdentity?: string) {
  try {
    window.dispatchEvent(new Event(getProgressChangeEvent(studentIdentity)));
  } catch {
    // Event dispatch is best effort; the in-memory snapshot remains readable synchronously.
  }
}

function writeLearningProgress(
  progress: StoredLearningProgress,
  courses: readonly Course[],
  studentIdentity?: string,
) {
  if (typeof window === "undefined") {
    return false;
  }

  const identity = normalizeStudentIdentity(studentIdentity);
  const storageKey = getStudentMateriProgressStorageKey(identity);
  try {
    const serialized = JSON.stringify(progress);
    if (parseStoredLearningProgress(serialized, courses) === null) {
      return false;
    }

    window.localStorage.setItem(storageKey, serialized);
    inMemoryProgressByIdentity.delete(identity);
    storageUnavailableIdentities.delete(identity);
    notifyProgressChange(identity);
    return true;
  } catch {
    try {
      const validated = parseStoredLearningProgress(JSON.stringify(progress), courses);
      if (validated !== null) {
        inMemoryProgressByIdentity.set(identity, mergeWithSeedProgress(validated, courses));
        storageUnavailableIdentities.add(identity);
        notifyProgressChange(identity);
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
  studentIdentity?: string,
) {
  const course = courses.find((candidate) => candidate.slug === courseSlug);
  const current = readLearningProgress(courses, studentIdentity);
  if (!course || !getCourseMap(courses).has(courseSlug)) {
    return current;
  }

  const next = {
    ...current,
    [courseSlug]: update(current[courseSlug] ?? getSeedCourseProgress(course), course),
  };
  writeLearningProgress(next, courses, studentIdentity);
  return next;
}

function hydrateCourseProgress(
  courseSlug: string,
  snapshot: CourseProgressSnapshot,
  courses: readonly Course[],
  studentIdentity?: string,
) {
  const course = courses.find((candidate) => candidate.slug === courseSlug);
  if (!course) return false;

  const parsed = parseStoredLearningProgress(
    JSON.stringify({ [courseSlug]: snapshot }),
    courses,
  );
  if (!parsed) return false;

  const current = readLearningProgress(courses, studentIdentity);
  return writeLearningProgress(
    { ...current, [courseSlug]: parsed[courseSlug]! },
    courses,
    studentIdentity,
  );
}

function completeCourseLesson(
  courseSlug: string,
  lessonId: string,
  courses: readonly Course[],
  studentIdentity?: string,
) {
  return updateCourseProgress(courseSlug, (progress, course) => {
    const lessonStatus = getLessonProgressStatus(course, lessonId, progress);
    if (
      !getCourseLesson(course, lessonId)
      || lessonStatus === undefined
      || lessonStatus === "locked"
      || progress.completedLessonIds.includes(lessonId)
    ) {
      return progress;
    }

    return {
      ...progress,
      completedLessonIds: [...progress.completedLessonIds, lessonId],
    };
  }, courses, studentIdentity);
}

function skipToCourseLesson(
  courseSlug: string,
  lessonId: string,
  courses: readonly Course[],
  studentIdentity?: string,
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
  }, courses, studentIdentity);
}

function getStoredCourseProgress(
  courseSlug: string,
  courses: readonly Course[],
  studentIdentity?: string,
) {
  return readLearningProgress(courses, studentIdentity)[courseSlug];
}

function useCourseProgress(
  course: Course,
  courses: readonly Course[],
  serverProgress?: CourseProgressSnapshot,
  serverIdentity?: string,
) {
  const serverProgressKey = serverProgress ? JSON.stringify(serverProgress) : null;
  const normalizedIdentity = normalizeStudentIdentity(serverIdentity);
  const storageKey = getStudentMateriProgressStorageKey(normalizedIdentity);
  const hydrationKey = `${normalizedIdentity}:${course.slug}`;

  useEffect(() => {
    if (serverProgressKey === null || !serverProgress) {
      hydratedServerProgressKeys.delete(hydrationKey);
      return;
    }

    // Mark before writing so the external-store event triggered by the write
    // immediately renders the cache snapshot rather than the server seed.
    hydratedServerProgressKeys.set(hydrationKey, serverProgressKey);
    hydrateCourseProgress(course.slug, serverProgress, courses, normalizedIdentity);
  }, [course.slug, courses, hydrationKey, normalizedIdentity, serverProgress, serverProgressKey]);

  const serializedProgress = useSyncExternalStore(
    (onStoreChange) => {
      const onStorageChange = (event: StorageEvent) => {
        // Browser storage events are shared across accounts/tabs. Only the
        // identity-scoped v2 key may invalidate this subscriber.
        if (event.key !== null && event.key !== storageKey) {
          return;
        }
        onStoreChange();
      };
      const changeEvent = getProgressChangeEvent(normalizedIdentity);
      window.addEventListener("storage", onStorageChange);
      window.addEventListener(changeEvent, onStoreChange);
      return () => {
        window.removeEventListener("storage", onStorageChange);
        window.removeEventListener(changeEvent, onStoreChange);
      };
    },
    () => {
      const rawProgress = readRawProgress(normalizedIdentity);
      const inMemoryProgress = inMemoryProgressByIdentity.get(normalizedIdentity);
      if (storageUnavailableIdentities.has(normalizedIdentity) && inMemoryProgress) {
        return JSON.stringify(inMemoryProgress);
      }

      return rawProgress ?? "";
    },
    () => serverStorageSnapshot,
  );

  const shouldUseServerProgress = serverProgressKey !== null
    && hydratedServerProgressKeys.get(hydrationKey) !== serverProgressKey;

  return useMemo(() => {
    if (shouldUseServerProgress && serverProgress) {
      return getCourseProgressState(course, serverProgress);
    }

    const stored = serializedProgress === serverStorageSnapshot
      ? null
      : parseStoredLearningProgress(serializedProgress, courses);
    return getCourseProgressState(course, stored?.[course.slug] ?? getSeedCourseProgress(course));
  }, [course, courses, serializedProgress, serverProgress, shouldUseServerProgress]);
}

export {
  getSeedLearningProgress,
  getStoredCourseProgress,
  parseStoredLearningProgress,
  readLearningProgress,
  completeCourseLesson,
  hydrateCourseProgress,
  skipToCourseLesson,
  useCourseProgress,
  writeLearningProgress,
  getStudentMateriProgressStorageKey,
  STUDENT_MATERI_PROGRESS_STORAGE_KEY,
  STUDENT_MATERI_PROGRESS_STORAGE_VERSION,
};
export type { StoredLearningProgress };

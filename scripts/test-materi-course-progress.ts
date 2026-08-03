import assert from "node:assert/strict";

import {
  getCourseProgressState,
  getLessonProgressStatus,
  getSeedCourseProgress,
  toCourseCatalogue,
  type PublishedCourseContent,
} from "@/modules/courses/data";
import {
  completeCourseLesson,
  parseStoredLearningProgress,
  readLearningProgress,
  skipToCourseLesson,
  getStudentMateriProgressStorageKey,
  STUDENT_MATERI_PROGRESS_STORAGE_KEY,
  STUDENT_MATERI_PROGRESS_STORAGE_VERSION,
  writeLearningProgress,
} from "@/modules/courses/progress-storage";

const subjects = [
  ["PU", "penalaran-umum"],
  ["PPU", "pengetahuan-pemahaman-umum"],
  ["PBM", "pemahaman-bacaan-menulis"],
  ["PK", "pengetahuan-kuantitatif"],
  ["LBI", "literasi-bahasa-indonesia"],
  ["LBE", "literasi-bahasa-inggris"],
  ["PM", "penalaran-matematika"],
] as const;

const document = {
  managedAssetId: null,
  mimeType: "application/pdf",
  originalName: "bacaan.pdf",
  sourceKind: "hosted" as const,
  url: "https://cdn.example.test/materi/bacaan.pdf",
};

const content: PublishedCourseContent[] = subjects.map(([code, slug], subjectIndex) => ({
  code,
  lessons: [
    {
      code: `${slug}-1`,
      document,
      optionalVideo: subjectIndex === 0
        ? { durationSeconds: 90, mediaUrl: "https://video.example.test/pendamping" }
        : null,
      sequenceNo: 1,
      title: `${code} bacaan pertama`,
    },
    ...(subjectIndex === 0 ? [{
      code: `${slug}-2`,
      document,
      optionalVideo: null,
      sequenceNo: 2,
      title: `${code} bacaan kedua`,
    }] : []),
  ],
  name: `Subtes ${code}`,
  slug,
  sortOrder: subjectIndex,
}));

const courses = toCourseCatalogue(content);
const course = courses[0];
assert.ok(course, "the fixture course should exist");
assert.equal(course.lessons[0]?.document.sourceKind, "hosted");
assert.ok(course.lessons[0]?.optionalVideo, "document-plus-video is retained");
assert.equal(course.lessons[1]?.optionalVideo, null, "document-only is retained without a video placeholder");

assert.deepEqual(getSeedCourseProgress(course), { completedLessonIds: [] });
assert.equal(STUDENT_MATERI_PROGRESS_STORAGE_KEY.endsWith(".v2"), true);
assert.equal(STUDENT_MATERI_PROGRESS_STORAGE_VERSION, 2);

const initial = getCourseProgressState(course);
assert.equal(initial.nextLesson?.id, `${course.slug}-1`);
assert.equal(getLessonProgressStatus(course, `${course.slug}-2`), "locked");

const skipped = {
  completedLessonIds: [],
  skippedToLessonId: `${course.slug}-2`,
};
assert.equal(getLessonProgressStatus(course, `${course.slug}-2`, skipped), "active");
assert.equal(getCourseProgressState(course, skipped).nextLesson?.id, `${course.slug}-2`);

const completedAfterSkip = getCourseProgressState(course, {
  completedLessonIds: [`${course.slug}-2`],
  skippedToLessonId: `${course.slug}-2`,
});
assert.equal(completedAfterSkip.completedLessonIds.includes(`${course.slug}-2`), true);
assert.equal(
  completedAfterSkip.nextLesson?.id,
  `${course.slug}-1`,
  "completing a skipped target resumes the earliest incomplete unit",
);
assert.equal(completedAfterSkip.completionPercentage, 50);
assert.equal(
  getCourseProgressState(course, {
    completedLessonIds: [`${course.slug}-1`, `${course.slug}-2`],
    skippedToLessonId: `${course.slug}-2`,
  }).completionPercentage,
  100,
  "all-done is reported only at 100 percent",
);

const parsed = parseStoredLearningProgress(JSON.stringify({
  [course.slug]: {
    completedLessonIds: [`${course.slug}-1`],
  },
}), courses);
assert.equal(parsed?.[course.slug]?.completedLessonIds[0], `${course.slug}-1`);
assert.equal(
  parseStoredLearningProgress(JSON.stringify({
    [course.slug]: { completedLessonIds: [`${course.slug}-1`, `${course.slug}-1`] },
  }), courses),
  null,
  "duplicate completions are rejected",
);
assert.equal(
  parseStoredLearningProgress(JSON.stringify({
    [course.slug]: { completedLessonIds: [`${course.slug}-unknown`] },
  }), courses),
  null,
  "unknown lesson IDs fail closed",
);
assert.equal(
  parseStoredLearningProgress(JSON.stringify({
    [course.slug]: { completedLessonIds: [], skippedToLessonId: `${course.slug}-unknown` },
  }), courses),
  null,
  "unknown skipped lesson IDs fail closed",
);
assert.equal(
  getCourseProgressState(courses[1]!).completedLessonIds.length,
  0,
  "progress remains isolated per subject",
);

const storage = new Map<string, string>();
const fakeWindow = {
  dispatchEvent() { return true; },
  addEventListener() {},
  removeEventListener() {},
  localStorage: {
    getItem(key: string) { return storage.get(key) ?? null; },
    setItem(key: string, value: string) { storage.set(key, value); },
  },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });

storage.set("vecalss.student.materi-progress.v1", JSON.stringify({
  [course.slug]: { completedLessonIds: [`${course.slug}-1`] },
}));
assert.equal(
  readLearningProgress(courses)[course.slug]?.completedLessonIds.length,
  0,
  "the old v1 namespace cannot unlock the ebook-first curriculum",
);

const studentA = "student-a";
const studentB = "student-b";
assert.equal(
  getStudentMateriProgressStorageKey(studentA),
  `${STUDENT_MATERI_PROGRESS_STORAGE_KEY}.${encodeURIComponent(studentA)}`,
  "v2 storage keys are identity scoped",
);
assert.equal(storage.get(STUDENT_MATERI_PROGRESS_STORAGE_KEY), undefined);
assert.equal(
  writeLearningProgress({
    [course.slug]: { completedLessonIds: [`${course.slug}-1`] },
  }, courses, studentA),
  true,
);
assert.deepEqual(
  readLearningProgress(courses, studentA)[course.slug]?.completedLessonIds,
  [`${course.slug}-1`],
);
assert.deepEqual(
  readLearningProgress(courses, studentB)[course.slug]?.completedLessonIds,
  [],
  "account B never reads account A's v2 cache",
);

completeCourseLesson(course.slug, `${course.slug}-2`, courses);
assert.deepEqual(
  readLearningProgress(courses)[course.slug]?.completedLessonIds,
  [],
  "a locked unit cannot be completed through the local mutation helper",
);

completeCourseLesson(course.slug, `${course.slug}-1`, courses);
completeCourseLesson(course.slug, `${course.slug}-1`, courses);
assert.deepEqual(
  JSON.parse(storage.get(getStudentMateriProgressStorageKey()) ?? "{}")[course.slug],
  { completedLessonIds: [`${course.slug}-1`] },
);

skipToCourseLesson(course.slug, `${course.slug}-2`, courses);
skipToCourseLesson(course.slug, `${course.slug}-2`, courses);
assert.deepEqual(readLearningProgress(courses)[course.slug], {
  completedLessonIds: [`${course.slug}-1`],
  skippedToLessonId: `${course.slug}-2`,
});

console.log("Materi course document/progress checks passed.");

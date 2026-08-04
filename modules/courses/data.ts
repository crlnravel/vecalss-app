import type { MateriDocument, MateriVideo } from "@/lib/materi/contract";

type CourseDifficulty = "Dasar" | "Menengah" | "Lanjutan";
type CourseProgressStatus = "Belum mulai" | "Sedang dipelajari" | "Selesai";
type SubjectIcon = "brain" | "calculator" | "file-text" | "languages" | "library" | "pen-tool";

type PublishedLessonContent = {
  code: string;
  document: MateriDocument;
  optionalVideo: MateriVideo | null;
  sequenceNo: number;
  title: string;
};

type PublishedCourseContent = {
  code: string;
  lessons: PublishedLessonContent[];
  name: string;
  slug: string;
  sortOrder: number;
};

type CourseLessonResource = {
  document: MateriDocument;
  id: string;
  optionalVideo: MateriVideo | null;
  title: string;
};

type CourseLesson = CourseLessonResource & {
  courseSlug: string;
  position: number;
};

type CourseProgressSnapshot = {
  completedLessonIds: string[];
  skippedToLessonId?: string;
};

type LessonProgressStatus = "completed" | "active" | "available" | "locked";

type Course = {
  code: string;
  description: string;
  difficulty: CourseDifficulty;
  icon: SubjectIcon;
  palette: string;
  progress: number;
  slug: string;
  status: CourseProgressStatus;
  title: string;
  lessons: CourseLessonResource[];
};

type SubjectUiMetadata = {
  difficulty: CourseDifficulty;
  icon: SubjectIcon;
  palette: string;
};

const courseCardPalette = "bg-primary-100 text-primary-900";

// These are presentation-only choices. Published subject and lesson
// content is supplied by the server repository below.
const subjectUiMetadata: Record<string, SubjectUiMetadata> = {
  PU: { difficulty: "Dasar", icon: "brain", palette: courseCardPalette },
  PPU: { difficulty: "Menengah", icon: "library", palette: courseCardPalette },
  PBM: { difficulty: "Menengah", icon: "pen-tool", palette: courseCardPalette },
  PK: { difficulty: "Menengah", icon: "calculator", palette: courseCardPalette },
  LBI: { difficulty: "Menengah", icon: "file-text", palette: courseCardPalette },
  LBE: { difficulty: "Lanjutan", icon: "languages", palette: courseCardPalette },
  PM: { difficulty: "Lanjutan", icon: "calculator", palette: courseCardPalette },
};

function toCourseCatalogue(content: readonly PublishedCourseContent[]): Course[] {
  const byCode = new Map(content.map((course) => [course.code, course]));
  if (
    content.length !== Object.keys(subjectUiMetadata).length
    || Object.keys(subjectUiMetadata).some((code) => !byCode.has(code))
  ) {
    throw new Error("Published Materi catalogue is incomplete.");
  }

  return [...content]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((publishedCourse) => {
      const metadata = subjectUiMetadata[publishedCourse.code];
      if (!metadata) {
        throw new Error("Published Materi subject is incomplete.");
      }

      const lessons = [...publishedCourse.lessons]
        .sort((left, right) => left.sequenceNo - right.sequenceNo || left.code.localeCompare(right.code))
        .map((lesson) => ({
          // Student delivery is always resolved through the authenticated
          // same-origin route. Never put a raw hosted PDF URL in client props,
          // where a locked unit could bypass server admission.
          document: { ...lesson.document, url: null },
          id: lesson.code,
          optionalVideo: lesson.optionalVideo,
          title: lesson.title,
        }));

      return {
        code: publishedCourse.code,
        description: publishedCourse.name,
        difficulty: metadata.difficulty,
        icon: metadata.icon,
        palette: metadata.palette,
        progress: 0,
        lessons,
        slug: publishedCourse.slug,
        status: "Belum mulai",
        title: publishedCourse.code,
      };
    });
}

function getCourseBySlug(courses: readonly Course[], slug: string) {
  return courses.find((course) => course.slug === slug);
}

function getCourseLessons(course: Course): CourseLesson[] {
  return course.lessons.map((lesson, position) => ({
    ...lesson,
    courseSlug: course.slug,
    position,
  }));
}

function getCourseLesson(course: Course, lessonId: string) {
  return getCourseLessons(course).find((lesson) => lesson.id === lessonId);
}

function getSeedCourseProgress(course: Course): CourseProgressSnapshot {
  void course;
  return {
    // The ebook-first curriculum has a new browser-local progress generation.
    // Never carry the historical video-first baseline into this namespace.
    completedLessonIds: [],
  };
}

function getCourseProgressState(
  course: Course,
  progress: CourseProgressSnapshot = getSeedCourseProgress(course),
) {
  const lessons = getCourseLessons(course);
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const seedCompletedLessonIds = new Set(
    getSeedCourseProgress(course).completedLessonIds.filter((lessonId) => lessonsById.has(lessonId)),
  );
  const completedLessonIds = new Set(
    progress.completedLessonIds.filter((lessonId) => lessonsById.has(lessonId)),
  );

  seedCompletedLessonIds.forEach((lessonId) => completedLessonIds.add(lessonId));

  const skippedLesson = progress.skippedToLessonId
    ? lessonsById.get(progress.skippedToLessonId)
    : undefined;
  const activeSkippedLesson = skippedLesson && !completedLessonIds.has(skippedLesson.id)
    ? skippedLesson
    : undefined;
  // A skipped target is a temporary continuation point. Once that target is
  // completed, resume the earliest incomplete unit (including earlier units
  // that were skipped) instead of stranding them behind a permanent cutoff.
  const nextLesson = activeSkippedLesson ?? lessons.find(
    (lesson) => !completedLessonIds.has(lesson.id),
  );
  const completedCount = completedLessonIds.size;

  return {
    completedLessonIds: lessons.reduce<string[]>((lessonIds, lesson) => {
      if (completedLessonIds.has(lesson.id)) lessonIds.push(lesson.id);
      return lessonIds;
    }, []),
    completionPercentage: lessons.length === 0 ? 0 : Math.round((completedCount / lessons.length) * 100),
    lessons,
    nextLesson,
    skippedToLessonId: activeSkippedLesson?.id,
  };
}

function getLessonProgressStatus(
  course: Course,
  lessonId: string,
  progress: CourseProgressSnapshot = getSeedCourseProgress(course),
): LessonProgressStatus | undefined {
  const lesson = getCourseLesson(course, lessonId);
  if (!lesson) return undefined;

  const state = getCourseProgressState(course, progress);
  if (state.completedLessonIds.includes(lesson.id)) return "completed";
  if (state.nextLesson?.id === lesson.id) {
    return state.skippedToLessonId === lesson.id ? "active" : "available";
  }
  return "locked";
}

function getNextAvailableLesson(
  course: Course,
  progress: CourseProgressSnapshot = getSeedCourseProgress(course),
) {
  return getCourseProgressState(course, progress).nextLesson;
}

export {
  getCourseBySlug,
  getCourseLesson,
  getCourseLessons,
  getCourseProgressState,
  getLessonProgressStatus,
  getNextAvailableLesson,
  getSeedCourseProgress,
  toCourseCatalogue,
};
export type {
  Course,
  CourseDifficulty,
  CourseLesson,
  CourseProgressSnapshot,
  CourseProgressStatus,
  CourseLessonResource,
  LessonProgressStatus,
  PublishedCourseContent,
  SubjectIcon,
};

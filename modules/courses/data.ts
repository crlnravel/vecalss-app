import { studentMateriProgressBaseline } from "./progress-baseline";

type CourseDifficulty = "Dasar" | "Menengah" | "Lanjutan";
type CourseProgressStatus = "Belum mulai" | "Sedang dipelajari" | "Selesai";
type SubjectIcon = "brain" | "calculator" | "file-text" | "languages" | "library" | "pen-tool";

type PublishedLessonContent = {
  code: string;
  durationSeconds: number;
  mediaUrl: string;
  sequenceNo: number;
  title: string;
};

type PublishedTopicContent = {
  code: string;
  lessons: PublishedLessonContent[];
  name: string;
  sortOrder: number;
};

type PublishedCourseContent = {
  code: string;
  name: string;
  slug: string;
  sortOrder: number;
  topics: PublishedTopicContent[];
};

type VideoTutorial = {
  completed: boolean;
  duration: string;
  id: string;
  title: string;
  videoUrl: string;
};

type CourseLesson = VideoTutorial & {
  courseSlug: string;
  id: string;
  position: number;
  sectionIndex: number;
  sectionTitle: string;
  videoIndex: number;
};

type CourseProgressSnapshot = {
  completedLessonIds: string[];
  skippedToLessonId?: string;
};

type LessonProgressStatus = "completed" | "active" | "available" | "locked";

type CourseSection = {
  title: string;
  videos: VideoTutorial[];
};

type Course = {
  code: string;
  description: string;
  difficulty: CourseDifficulty;
  duration: string;
  icon: SubjectIcon;
  palette: string;
  progress: number;
  slug: string;
  status: CourseProgressStatus;
  title: string;
  sections: CourseSection[];
};

type SubjectUiMetadata = {
  difficulty: CourseDifficulty;
  icon: SubjectIcon;
  palette: string;
};

const courseCardPalette = "bg-primary-100 text-primary-900";

// These are presentation-only choices. Published subject, section, and lesson
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

function formatDuration(durationSeconds: number) {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatCourseDuration(durationSeconds: number) {
  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}j ${minutes}m` : `${minutes}m`;
}

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
      if (!metadata || publishedCourse.topics.length !== 3) {
        throw new Error("Published Materi subject is incomplete.");
      }

      const sections = [...publishedCourse.topics]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((topic) => ({
          title: topic.name,
          videos: [...topic.lessons]
            .sort((left, right) => left.sequenceNo - right.sequenceNo)
            .map((lesson) => ({
              completed: false,
              duration: formatDuration(lesson.durationSeconds),
              title: lesson.title,
              videoUrl: lesson.mediaUrl,
              id: lesson.code,
            })),
        }));
      const durationSeconds = publishedCourse.topics.flatMap((topic) => topic.lessons)
        .reduce((total, lesson) => total + lesson.durationSeconds, 0);

      return {
        code: publishedCourse.code,
        description: publishedCourse.name,
        difficulty: metadata.difficulty,
        duration: formatCourseDuration(durationSeconds),
        icon: metadata.icon,
        palette: metadata.palette,
        progress: 0,
        sections,
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
  return course.sections.flatMap((section, sectionIndex) =>
    section.videos.map((video, videoIndex) => ({
      ...video,
      courseSlug: course.slug,
      id: video.id,
      position: course.sections
        .slice(0, sectionIndex)
        .reduce((total, previousSection) => total + previousSection.videos.length, 0)
        + videoIndex,
      sectionIndex,
      sectionTitle: section.title,
      videoIndex,
    })),
  );
}

function getCourseLesson(course: Course, lessonId: string) {
  return getCourseLessons(course).find((lesson) => lesson.id === lessonId);
}

function getSeedCourseProgress(course: Course): CourseProgressSnapshot {
  return {
    completedLessonIds: [...(studentMateriProgressBaseline[course.slug as keyof typeof studentMateriProgressBaseline] ?? [])],
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
  const minimumPosition = skippedLesson?.position ?? 0;
  const nextLesson = lessons.find(
    (lesson) => lesson.position >= minimumPosition && !completedLessonIds.has(lesson.id),
  );
  const completedCount = completedLessonIds.size;

  return {
    completedLessonIds: lessons.filter((lesson) => completedLessonIds.has(lesson.id)).map((lesson) => lesson.id),
    completionPercentage: lessons.length === 0 ? 0 : Math.round((completedCount / lessons.length) * 100),
    lessons,
    nextLesson,
    skippedToLessonId: skippedLesson?.id,
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
  CourseSection,
  LessonProgressStatus,
  PublishedCourseContent,
  SubjectIcon,
  VideoTutorial,
};

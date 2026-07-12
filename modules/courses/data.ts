import {
  BookOpen,
  Brain,
  Calculator,
  FileText,
  Languages,
  LibraryBig,
  type LucideIcon,
  PenTool,
} from "lucide-react";

type CourseDifficulty = "Dasar" | "Menengah" | "Lanjutan";
type CourseProgressStatus = "Belum mulai" | "Sedang dipelajari" | "Selesai";

type VideoTutorial = {
  completed: boolean;
  duration: string;
  locked?: boolean;
  title: string;
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
  icon: LucideIcon;
  palette: string;
  progress: number;
  status: CourseProgressStatus;
  title: string;
  slug: string;
  sections: CourseSection[];
};

const courseCardPalette = "bg-primary-100 text-primary-900";

const courseCatalogue: Course[] = [
  {
    code: "TPS",
    description: "Penalaran Umum",
    difficulty: "Dasar",
    duration: "4j 20m",
    icon: Brain,
    palette: courseCardPalette,
    progress: 64,
    slug: "penalaran-umum",
    status: "Sedang dipelajari",
    title: "PU",
    sections: [
      {
        title: "Pengenalan PU",
        videos: [
          {
            completed: true,
            duration: "06:12",
            title: "Apa yang Diuji di Penalaran Umum",
          },
          {
            completed: true,
            duration: "08:24",
            title: "Cara Menggunakan Modul Ini",
          },
          {
            completed: false,
            duration: "10:08",
            title: "Pemetaan Kemampuan Awal",
          },
        ],
      },
      {
        title: "Konsep Inti",
        videos: [
          {
            completed: true,
            duration: "14:30",
            title: "Premis, Klaim, dan Simpulan",
          },
          {
            completed: false,
            duration: "17:42",
            title: "Kesalahan Umum Membaca Argumen",
          },
          {
            completed: false,
            duration: "12:56",
            title: "Strategi Eliminasi Cepat",
          },
        ],
      },
      {
        title: "Latihan",
        videos: [
          {
            completed: false,
            duration: "18:10",
            title: "Guided Exercise: Argumen Pendek",
          },
          {
            completed: false,
            duration: "21:36",
            locked: true,
            title: "Case Study: Set Argumen UTBK",
          },
        ],
      },
    ],
  },
  {
    code: "TPS",
    description: "Pengetahuan dan Pemahaman Umum",
    difficulty: "Menengah",
    duration: "3j 55m",
    icon: LibraryBig,
    palette: courseCardPalette,
    progress: 22,
    slug: "pengetahuan-pemahaman-umum",
    status: "Sedang dipelajari",
    title: "PPU",
    sections: [
      {
        title: "Pengenalan PPU",
        videos: [
          { completed: true, duration: "07:16", title: "Ruang Lingkup PPU" },
          {
            completed: false,
            duration: "09:44",
            title: "Membaca Informasi Secara Presisi",
          },
        ],
      },
      {
        title: "Konsep Inti",
        videos: [
          {
            completed: false,
            duration: "15:18",
            title: "Relasi Ide dalam Teks",
          },
          {
            completed: false,
            duration: "16:05",
            title: "Makna Kata dan Konteks",
          },
          {
            completed: false,
            duration: "13:40",
            locked: true,
            title: "Menghindari Distraktor Umum",
          },
        ],
      },
      {
        title: "Latihan",
        videos: [
          {
            completed: false,
            duration: "19:24",
            locked: true,
            title: "Guided Exercise: Informasi Implisit",
          },
          {
            completed: false,
            duration: "22:10",
            locked: true,
            title: "Case Study: Bacaan Campuran",
          },
        ],
      },
    ],
  },
  {
    code: "TPS",
    description: "Pemahaman Bacaan dan Menulis",
    difficulty: "Menengah",
    duration: "3j 40m",
    icon: PenTool,
    palette: courseCardPalette,
    progress: 0,
    slug: "pemahaman-bacaan-menulis",
    status: "Belum mulai",
    title: "PBM",
    sections: [
      {
        title: "Pengenalan PBM",
        videos: [
          { completed: false, duration: "06:58", title: "Format Soal PBM" },
          {
            completed: false,
            duration: "11:22",
            title: "Cara Membaca Kalimat Bermasalah",
          },
        ],
      },
      {
        title: "Konsep Inti",
        videos: [
          { completed: false, duration: "16:35", title: "Efektivitas Kalimat" },
          {
            completed: false,
            duration: "14:48",
            title: "Kohesi dan Koherensi Paragraf",
          },
          {
            completed: false,
            duration: "13:52",
            locked: true,
            title: "Kesalahan Ejaan yang Sering Muncul",
          },
        ],
      },
      {
        title: "Latihan",
        videos: [
          {
            completed: false,
            duration: "20:28",
            locked: true,
            title: "Guided Exercise: Sunting Kalimat",
          },
          {
            completed: false,
            duration: "23:12",
            locked: true,
            title: "Case Study: Paragraf Tidak Efektif",
          },
        ],
      },
    ],
  },
  {
    code: "TPS",
    description: "Pengetahuan Kuantitatif",
    difficulty: "Menengah",
    duration: "5j 05m",
    icon: Calculator,
    palette: courseCardPalette,
    progress: 38,
    slug: "pengetahuan-kuantitatif",
    status: "Sedang dipelajari",
    title: "PK",
    sections: [
      {
        title: "Number Sense",
        videos: [
          { completed: true, duration: "09:48", title: "Mental Math Warmup" },
          { completed: true, duration: "13:22", title: "Rasio dan Persentase" },
          {
            completed: false,
            duration: "16:14",
            title: "Mengenali Pola Bilangan",
          },
        ],
      },
      {
        title: "Konsep Inti",
        videos: [
          {
            completed: false,
            duration: "18:02",
            title: "Membandingkan Nilai Secara Cepat",
          },
          {
            completed: false,
            duration: "20:40",
            title: "Kesalahan Umum di Soal Kuantitatif",
          },
          {
            completed: false,
            duration: "15:45",
            locked: true,
            title: "Review Drill Bertempo",
          },
        ],
      },
      {
        title: "Latihan",
        videos: [
          {
            completed: false,
            duration: "24:00",
            locked: true,
            title: "Guided Exercise: Soal Campuran",
          },
          {
            completed: false,
            duration: "26:18",
            locked: true,
            title: "Case Study: Recovery Skor PK",
          },
        ],
      },
    ],
  },
  {
    code: "TPA",
    description: "Literasi Bahasa Indonesia",
    difficulty: "Menengah",
    duration: "3j 45m",
    icon: FileText,
    palette: courseCardPalette,
    progress: 0,
    slug: "literasi-bahasa-indonesia",
    status: "Belum mulai",
    title: "LBI",
    sections: [
      {
        title: "Pengenalan LBI",
        videos: [
          {
            completed: false,
            duration: "07:05",
            title: "Apa yang Diuji di LBI",
          },
          {
            completed: false,
            duration: "11:26",
            title: "Struktur Bacaan Panjang",
          },
        ],
      },
      {
        title: "Konsep Inti",
        videos: [
          { completed: false, duration: "16:50", title: "Menemukan Ide Pokok" },
          {
            completed: false,
            duration: "14:18",
            title: "Inferensi Tanpa Overthinking",
          },
          {
            completed: false,
            duration: "13:42",
            locked: true,
            title: "Nada dan Tujuan Penulis",
          },
        ],
      },
      {
        title: "Latihan",
        videos: [
          {
            completed: false,
            duration: "20:12",
            locked: true,
            title: "Guided Exercise: Teks Editorial",
          },
          {
            completed: false,
            duration: "22:30",
            locked: true,
            title: "Case Study: Reading Bertempo",
          },
        ],
      },
    ],
  },
  {
    code: "TPA",
    description: "Literasi Bahasa Inggris",
    difficulty: "Lanjutan",
    duration: "4j 10m",
    icon: Languages,
    palette: courseCardPalette,
    progress: 0,
    slug: "literasi-bahasa-inggris",
    status: "Belum mulai",
    title: "LBE",
    sections: [
      {
        title: "Reading Setup",
        videos: [
          { completed: false, duration: "08:44", title: "Course Orientation" },
          {
            completed: false,
            duration: "12:10",
            title: "Skimming vs Scanning",
          },
          {
            completed: false,
            duration: "10:58",
            title: "Vocabulary in Context",
          },
        ],
      },
      {
        title: "Konsep Inti",
        videos: [
          { completed: false, duration: "18:36", title: "Inference Questions" },
          {
            completed: false,
            duration: "17:05",
            locked: true,
            title: "Author Purpose and Tone",
          },
          {
            completed: false,
            duration: "15:34",
            locked: true,
            title: "Distractor Patterns",
          },
        ],
      },
      {
        title: "Latihan",
        videos: [
          {
            completed: false,
            duration: "23:20",
            locked: true,
            title: "Guided Exercise: Science Passage",
          },
          {
            completed: false,
            duration: "25:12",
            locked: true,
            title: "Case Study: Two-Passage Set",
          },
        ],
      },
    ],
  },
  {
    code: "TPA",
    description: "Penalaran Matematika",
    difficulty: "Lanjutan",
    duration: "4j 55m",
    icon: BookOpen,
    palette: courseCardPalette,
    progress: 0,
    slug: "penalaran-matematika",
    status: "Belum mulai",
    title: "PM",
    sections: [
      {
        title: "Pengenalan PM",
        videos: [
          {
            completed: false,
            duration: "08:16",
            title: "Format Penalaran Matematika",
          },
          {
            completed: false,
            duration: "12:38",
            title: "Menerjemahkan Cerita ke Model",
          },
          {
            completed: false,
            duration: "13:05",
            title: "Membaca Grafik dan Tabel",
          },
        ],
      },
      {
        title: "Konsep Inti",
        videos: [
          {
            completed: false,
            duration: "18:55",
            title: "Menghubungkan Data dan Operasi",
          },
          {
            completed: false,
            duration: "16:28",
            locked: true,
            title: "Kesalahan Umum di PM",
          },
          {
            completed: false,
            duration: "17:40",
            locked: true,
            title: "Memilih Simpulan Matematis",
          },
        ],
      },
      {
        title: "Latihan",
        videos: [
          {
            completed: false,
            duration: "24:18",
            locked: true,
            title: "Guided Exercise: Soal Tabel",
          },
          {
            completed: false,
            duration: "27:30",
            locked: true,
            title: "Case Study: Grafik Campuran",
          },
        ],
      },
    ],
  },
];

function getCourseBySlug(slug: string) {
  return courseCatalogue.find((course) => course.slug === slug);
}

function getCourseLessons(course: Course): CourseLesson[] {
  return course.sections.flatMap((section, sectionIndex) =>
    section.videos.map((video, videoIndex) => ({
      ...video,
      courseSlug: course.slug,
      id: `${course.slug}-${sectionIndex + 1}-${videoIndex + 1}`,
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
    completedLessonIds: getCourseLessons(course)
      .filter((lesson) => lesson.completed)
      .map((lesson) => lesson.id),
  };
}

function getCourseProgressState(
  course: Course,
  progress: CourseProgressSnapshot = getSeedCourseProgress(course),
) {
  const lessons = getCourseLessons(course);
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const seedCompletedLessonIds = new Set(getSeedCourseProgress(course).completedLessonIds);
  const completedLessonIds = new Set(
    progress.completedLessonIds.filter((lessonId) => lessonsById.has(lessonId)),
  );

  seedCompletedLessonIds.forEach((lessonId) => completedLessonIds.add(lessonId));

  const skippedLesson = progress.skippedToLessonId
    ? lessonsById.get(progress.skippedToLessonId)
    : undefined;
  const nextLesson = skippedLesson && !completedLessonIds.has(skippedLesson.id)
    ? skippedLesson
    : lessons.find((lesson) => !completedLessonIds.has(lesson.id));
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
  if (!lesson) {
    return undefined;
  }

  const state = getCourseProgressState(course, progress);
  if (state.completedLessonIds.includes(lesson.id)) {
    return "completed";
  }

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

function getCourseCompletionPercentage(
  course: Course,
  progress: CourseProgressSnapshot = getSeedCourseProgress(course),
) {
  return getCourseProgressState(course, progress).completionPercentage;
}

function getCourseStats(course: Course) {
  const totalSections = course.sections.length;
  const totalVideos = course.sections.reduce(
    (sum, section) => sum + section.videos.length,
    0,
  );
  const completedVideos = course.sections.reduce(
    (sum, section) =>
      sum + section.videos.filter((video) => video.completed).length,
    0,
  );

  return {
    completedVideos,
    totalSections,
    totalVideos,
  };
}

export {
  courseCatalogue,
  getCourseBySlug,
  getCourseCompletionPercentage,
  getCourseLesson,
  getCourseLessons,
  getCourseProgressState,
  getCourseStats,
  getLessonProgressStatus,
  getNextAvailableLesson,
  getSeedCourseProgress,
};
export type {
  Course,
  CourseLesson,
  CourseDifficulty,
  CourseProgressSnapshot,
  CourseProgressStatus,
  CourseSection,
  LessonProgressStatus,
  VideoTutorial,
};

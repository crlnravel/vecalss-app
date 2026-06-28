import {
  BarChart3,
  BookOpen,
  Brain,
  Calculator,
  FileText,
  Lightbulb,
  type LucideIcon,
  PenLine,
  Target,
} from "lucide-react";

type CourseDifficulty = "Beginner" | "Intermediate" | "Advanced";
type CourseProgressStatus = "Not started" | "In progress" | "Completed";

type VideoTutorial = {
  completed: boolean;
  duration: string;
  locked?: boolean;
  title: string;
};

type CourseSection = {
  title: string;
  videos: VideoTutorial[];
};

type Course = {
  category: string;
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

const courseCatalogue: Course[] = [
  {
    category: "Penalaran Umum",
    description:
      "Bangun fondasi membaca argumen, menarik kesimpulan, dan memilih strategi eliminasi jawaban.",
    difficulty: "Beginner",
    duration: "4j 20m",
    icon: Brain,
    palette: "from-primary-50 via-white to-[#dff3ea]",
    progress: 64,
    slug: "penalaran-umum-fondasi",
    status: "In progress",
    title: "Penalaran Umum: Fondasi Argumen",
    sections: [
      {
        title: "Introduction",
        videos: [
          { completed: true, duration: "06:12", title: "Welcome to the Course" },
          { completed: true, duration: "08:24", title: "How to Use This Course" },
          { completed: false, duration: "10:08", title: "Mapping Your Current Skill" },
        ],
      },
      {
        title: "Core Concepts",
        videos: [
          { completed: true, duration: "14:30", title: "Understanding Premises and Claims" },
          { completed: false, duration: "17:42", title: "Common Mistakes in Argument Questions" },
          { completed: false, duration: "12:56", title: "Fast Elimination Patterns" },
        ],
      },
      {
        title: "Practice",
        videos: [
          { completed: false, duration: "18:10", title: "Guided Exercise: Short Arguments" },
          { completed: false, duration: "21:36", locked: true, title: "Case Study: UTBK Argument Set" },
        ],
      },
    ],
  },
  {
    category: "Pengetahuan Kuantitatif",
    description:
      "Latihan kuantitatif runtun untuk rasio, persentase, pola bilangan, dan interpretasi cepat.",
    difficulty: "Intermediate",
    duration: "5j 05m",
    icon: Calculator,
    palette: "from-[#fff6c8] via-white to-primary-50",
    progress: 38,
    slug: "pengetahuan-kuantitatif-cepat",
    status: "In progress",
    title: "Pengetahuan Kuantitatif Cepat",
    sections: [
      {
        title: "Number Sense",
        videos: [
          { completed: true, duration: "09:48", title: "Mental Math Warmup" },
          { completed: true, duration: "13:22", title: "Ratio and Percentage Basics" },
          { completed: false, duration: "16:14", title: "Pattern Recognition" },
        ],
      },
      {
        title: "Core Concepts",
        videos: [
          { completed: false, duration: "18:02", title: "Comparing Values Efficiently" },
          { completed: false, duration: "20:40", title: "Common Mistakes in Quantitative Items" },
          { completed: false, duration: "15:45", locked: true, title: "Timed Drill Review" },
        ],
      },
      {
        title: "Practice",
        videos: [
          { completed: false, duration: "24:00", locked: true, title: "Guided Exercise: Mixed Questions" },
          { completed: false, duration: "26:18", locked: true, title: "Case Study: Score Recovery Plan" },
        ],
      },
    ],
  },
  {
    category: "Literasi Bahasa Indonesia",
    description:
      "Pahami struktur bacaan, ide pokok, implikasi, dan cara mengurai soal literasi panjang.",
    difficulty: "Intermediate",
    duration: "3j 45m",
    icon: FileText,
    palette: "from-primary-50 via-white to-secondary-100",
    progress: 0,
    slug: "literasi-bahasa-indonesia",
    status: "Not started",
    title: "Literasi Bahasa Indonesia Runtun",
    sections: [
      {
        title: "Introduction",
        videos: [
          { completed: false, duration: "07:05", title: "Welcome to Literasi Indonesia" },
          { completed: false, duration: "11:26", title: "How Long Passages Are Built" },
        ],
      },
      {
        title: "Core Concepts",
        videos: [
          { completed: false, duration: "16:50", title: "Finding Main Ideas" },
          { completed: false, duration: "14:18", title: "Inference Without Overthinking" },
          { completed: false, duration: "13:42", locked: true, title: "Tone and Author Intention" },
        ],
      },
      {
        title: "Practice",
        videos: [
          { completed: false, duration: "20:12", locked: true, title: "Guided Exercise: Editorial Passage" },
          { completed: false, duration: "22:30", locked: true, title: "Case Study: Timed Reading" },
        ],
      },
    ],
  },
  {
    category: "Literasi Bahasa Inggris",
    description:
      "Kuasai skimming, scanning, vocabulary in context, dan inferensi bahasa Inggris UTBK.",
    difficulty: "Advanced",
    duration: "4j 10m",
    icon: PenLine,
    palette: "from-secondary-100 via-white to-[#e8f3ff]",
    progress: 0,
    slug: "literasi-bahasa-inggris",
    status: "Not started",
    title: "English Literacy Strategy",
    sections: [
      {
        title: "Reading Setup",
        videos: [
          { completed: false, duration: "08:44", title: "Course Orientation" },
          { completed: false, duration: "12:10", title: "Skimming vs Scanning" },
          { completed: false, duration: "10:58", title: "Vocabulary in Context" },
        ],
      },
      {
        title: "Core Concepts",
        videos: [
          { completed: false, duration: "18:36", title: "Inference Questions" },
          { completed: false, duration: "17:05", locked: true, title: "Author Purpose and Tone" },
          { completed: false, duration: "15:34", locked: true, title: "Distractor Patterns" },
        ],
      },
      {
        title: "Practice",
        videos: [
          { completed: false, duration: "23:20", locked: true, title: "Guided Exercise: Science Passage" },
          { completed: false, duration: "25:12", locked: true, title: "Case Study: Two-Passage Set" },
        ],
      },
    ],
  },
  {
    category: "Tryout",
    description:
      "Pelajari cara membaca hasil tryout, menentukan prioritas remedial, dan menjaga momentum latihan.",
    difficulty: "Beginner",
    duration: "2j 35m",
    icon: Target,
    palette: "from-white via-primary-50 to-[#fff7d6]",
    progress: 100,
    slug: "tryout-review-system",
    status: "Completed",
    title: "Tryout Review System",
    sections: [
      {
        title: "Score Review",
        videos: [
          { completed: true, duration: "07:36", title: "Reading Your Score Report" },
          { completed: true, duration: "10:24", title: "Finding Weak Areas" },
        ],
      },
      {
        title: "Remedial Plan",
        videos: [
          { completed: true, duration: "13:48", title: "Building a 7-Day Recovery Plan" },
          { completed: true, duration: "16:15", title: "Choosing Drill Types" },
          { completed: true, duration: "14:08", title: "Tracking Confidence" },
        ],
      },
      {
        title: "Practice",
        videos: [
          { completed: true, duration: "19:50", title: "Guided Exercise: Review Sheet" },
          { completed: true, duration: "21:05", title: "Case Study: From 612 to 676" },
        ],
      },
    ],
  },
  {
    category: "Strategi Belajar",
    description:
      "Bangun ritme belajar yang realistis dengan daily mission, review mingguan, dan bantuan Vera AI.",
    difficulty: "Beginner",
    duration: "3j 15m",
    icon: Lightbulb,
    palette: "from-[#effaf5] via-white to-secondary-100",
    progress: 18,
    slug: "strategi-belajar-personal",
    status: "In progress",
    title: "Strategi Belajar Personal",
    sections: [
      {
        title: "Introduction",
        videos: [
          { completed: true, duration: "06:40", title: "Welcome to Your Study System" },
          { completed: false, duration: "09:20", title: "How to Use Daily Mission" },
        ],
      },
      {
        title: "Core Concepts",
        videos: [
          { completed: false, duration: "15:06", title: "Building a Weekly Learning Loop" },
          { completed: false, duration: "12:48", title: "Common Mistakes in Study Planning" },
          { completed: false, duration: "13:16", locked: true, title: "Using Vera AI for Review" },
        ],
      },
      {
        title: "Practice",
        videos: [
          { completed: false, duration: "18:32", locked: true, title: "Guided Exercise: Build Your Week" },
          { completed: false, duration: "20:44", locked: true, title: "Case Study: Busy Student Schedule" },
        ],
      },
    ],
  },
  {
    category: "Analisis Data",
    description:
      "Latihan membaca tabel, grafik, dan visual data yang sering muncul pada soal SNBT modern.",
    difficulty: "Advanced",
    duration: "4j 55m",
    icon: BarChart3,
    palette: "from-secondary-100 via-white to-primary-50",
    progress: 0,
    slug: "analisis-data-snbt",
    status: "Not started",
    title: "Analisis Data SNBT",
    sections: [
      {
        title: "Visual Reading",
        videos: [
          { completed: false, duration: "08:16", title: "Reading Tables Quickly" },
          { completed: false, duration: "12:38", title: "Chart Types You Must Know" },
          { completed: false, duration: "13:05", title: "Spotting Trend and Outlier" },
        ],
      },
      {
        title: "Core Concepts",
        videos: [
          { completed: false, duration: "18:55", title: "Connecting Text and Data" },
          { completed: false, duration: "16:28", locked: true, title: "Common Mistakes in Data Questions" },
          { completed: false, duration: "17:40", locked: true, title: "Choosing the Best Conclusion" },
        ],
      },
      {
        title: "Practice",
        videos: [
          { completed: false, duration: "24:18", locked: true, title: "Guided Exercise: Table Set" },
          { completed: false, duration: "27:30", locked: true, title: "Case Study: Multi-Chart Passage" },
        ],
      },
    ],
  },
  {
    category: "Rangkuman",
    description:
      "Review cepat seluruh subtest, prioritas materi, dan checklist belajar sebelum hari ujian.",
    difficulty: "Intermediate",
    duration: "2j 50m",
    icon: BookOpen,
    palette: "from-primary-50 via-white to-[#f4f0df]",
    progress: 0,
    slug: "final-review-snbt",
    status: "Not started",
    title: "Final Review SNBT",
    sections: [
      {
        title: "Exam Readiness",
        videos: [
          { completed: false, duration: "09:02", title: "Final Week Overview" },
          { completed: false, duration: "11:50", title: "What to Review First" },
        ],
      },
      {
        title: "Core Concepts",
        videos: [
          { completed: false, duration: "14:42", title: "High-Yield PU and PPU" },
          { completed: false, duration: "15:18", locked: true, title: "High-Yield PK and Data" },
          { completed: false, duration: "13:36", locked: true, title: "Literacy Last-Minute Review" },
        ],
      },
      {
        title: "Practice",
        videos: [
          { completed: false, duration: "19:15", locked: true, title: "Guided Exercise: Mixed Drill" },
          { completed: false, duration: "21:28", locked: true, title: "Case Study: Exam Morning Plan" },
        ],
      },
    ],
  },
];

function getCourseBySlug(slug: string) {
  return courseCatalogue.find((course) => course.slug === slug);
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

export { courseCatalogue, getCourseBySlug, getCourseStats };
export type {
  Course,
  CourseDifficulty,
  CourseProgressStatus,
  CourseSection,
  VideoTutorial,
};

import {
  Brain,
  Calculator,
  FileText,
  Languages,
  LibraryBig,
  PenTool,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

type QuizDifficulty = "Dasar" | "Menengah" | "Lanjutan";
type QuizStatus = "Siap dikerjakan" | "Perlu review" | "Baru ditambahkan";

type QuizItem = {
  completionRate: number;
  difficulty: QuizDifficulty;
  duration: string;
  questionCount: number;
  slug: string;
  status: QuizStatus;
  title: string;
};

type QuizSubject = {
  code: string;
  description: string;
  icon: LucideIcon;
  palette: string;
  quizzes: QuizItem[];
  slug: string;
  title: string;
};

const quizSubjects: QuizSubject[] = [
  {
    code: "TPS",
    description: "Penalaran Umum",
    icon: Brain,
    palette: "bg-[#dff5f8] text-[#0b5970]",
    title: "PU",
    slug: "penalaran-umum",
    quizzes: [
      {
        completionRate: 78,
        difficulty: "Menengah",
        duration: "25 menit",
        questionCount: 20,
        slug: "pu-fundamental-drill",
        status: "Siap dikerjakan",
        title: "PU Fundamental Drill",
      },
      {
        completionRate: 56,
        difficulty: "Menengah",
        duration: "30 menit",
        questionCount: 24,
        slug: "pu-premis-dan-simpulan",
        status: "Perlu review",
        title: "Premis dan Simpulan",
      },
      {
        completionRate: 0,
        difficulty: "Lanjutan",
        duration: "35 menit",
        questionCount: 22,
        slug: "pu-argumen-bertingkat",
        status: "Baru ditambahkan",
        title: "Argumen Bertingkat",
      },
    ],
  },
  {
    code: "TPS",
    description: "Pengetahuan dan Pemahaman Umum",
    icon: LibraryBig,
    palette: "bg-[#e8f6df] text-[#215c42]",
    title: "PPU",
    slug: "pengetahuan-pemahaman-umum",
    quizzes: [
      {
        completionRate: 64,
        difficulty: "Dasar",
        duration: "20 menit",
        questionCount: 18,
        slug: "ppu-informasi-eksplisit",
        status: "Siap dikerjakan",
        title: "Informasi Eksplisit",
      },
      {
        completionRate: 41,
        difficulty: "Menengah",
        duration: "28 menit",
        questionCount: 20,
        slug: "ppu-bacaan-singkat",
        status: "Perlu review",
        title: "Bacaan Singkat",
      },
      {
        completionRate: 12,
        difficulty: "Lanjutan",
        duration: "32 menit",
        questionCount: 22,
        slug: "ppu-inferensi-campuran",
        status: "Baru ditambahkan",
        title: "Inferensi Campuran",
      },
    ],
  },
  {
    code: "TPS",
    description: "Pemahaman Bacaan dan Menulis",
    icon: PenTool,
    palette: "bg-[#eee7ff] text-[#302063]",
    title: "PBM",
    slug: "pemahaman-bacaan-menulis",
    quizzes: [
      {
        completionRate: 33,
        difficulty: "Menengah",
        duration: "24 menit",
        questionCount: 16,
        slug: "pbm-kalimat-efektif",
        status: "Perlu review",
        title: "Kalimat Efektif",
      },
      {
        completionRate: 0,
        difficulty: "Lanjutan",
        duration: "29 menit",
        questionCount: 18,
        slug: "pbm-koherensi-paragraf",
        status: "Baru ditambahkan",
        title: "Koherensi Paragraf",
      },
    ],
  },
  {
    code: "TPS",
    description: "Pengetahuan Kuantitatif",
    icon: Calculator,
    palette: "bg-[#ffe8dd] text-[#872b16]",
    title: "PK",
    slug: "pengetahuan-kuantitatif",
    quizzes: [
      {
        completionRate: 33,
        difficulty: "Menengah",
        duration: "30 menit",
        questionCount: 18,
        slug: "pk-rasio-persentase",
        status: "Perlu review",
        title: "Rasio dan Persentase",
      },
      {
        completionRate: 0,
        difficulty: "Lanjutan",
        duration: "40 menit",
        questionCount: 22,
        slug: "pk-angka-cepat",
        status: "Baru ditambahkan",
        title: "Angka Cepat",
      },
    ],
  },
  {
    code: "TPA",
    description: "Literasi Bahasa Indonesia",
    icon: FileText,
    palette: "bg-[#fde5ec] text-[#7c1838]",
    title: "LBI",
    slug: "literasi-bahasa-indonesia",
    quizzes: [
      {
        completionRate: 72,
        difficulty: "Dasar",
        duration: "22 menit",
        questionCount: 15,
        slug: "lbi-ide-pokok",
        status: "Siap dikerjakan",
        title: "Ide Pokok",
      },
      {
        completionRate: 48,
        difficulty: "Menengah",
        duration: "26 menit",
        questionCount: 18,
        slug: "lbi-inferensi-editorial",
        status: "Perlu review",
        title: "Inferensi Editorial",
      },
      {
        completionRate: 12,
        difficulty: "Menengah",
        duration: "24 menit",
        questionCount: 16,
        slug: "lbi-bacaan-panjang",
        status: "Siap dikerjakan",
        title: "Bacaan Panjang",
      },
    ],
  },
  {
    code: "TPA",
    description: "Literasi Bahasa Inggris",
    icon: Languages,
    palette: "bg-[#e6eefc] text-[#1d3c73]",
    title: "LBE",
    slug: "literasi-bahasa-inggris",
    quizzes: [
      {
        completionRate: 27,
        difficulty: "Dasar",
        duration: "20 menit",
        questionCount: 14,
        slug: "lbe-vocabulary-context",
        status: "Perlu review",
        title: "Vocabulary in Context",
      },
      {
        completionRate: 0,
        difficulty: "Menengah",
        duration: "30 menit",
        questionCount: 18,
        slug: "lbe-two-passages",
        status: "Baru ditambahkan",
        title: "Two Passages",
      },
    ],
  },
  {
    code: "TPA",
    description: "Penalaran Matematika",
    icon: BookOpen,
    palette: "bg-[#fff4c9] text-[#705214]",
    title: "PM",
    slug: "penalaran-matematika",
    quizzes: [
      {
        completionRate: 19,
        difficulty: "Menengah",
        duration: "28 menit",
        questionCount: 16,
        slug: "pm-grafik-dan-tabel",
        status: "Perlu review",
        title: "Grafik dan Tabel",
      },
      {
        completionRate: 0,
        difficulty: "Lanjutan",
        duration: "36 menit",
        questionCount: 20,
        slug: "pm-soal-cerita-bertingkat",
        status: "Baru ditambahkan",
        title: "Soal Cerita Bertingkat",
      },
    ],
  },
];

function getQuizSubjectStats(subject: QuizSubject) {
  const totalQuizzes = subject.quizzes.length;
  const totalQuestions = subject.quizzes.reduce(
    (sum, quiz) => sum + quiz.questionCount,
    0,
  );
  const averageCompletion = Math.round(
    subject.quizzes.reduce((sum, quiz) => sum + quiz.completionRate, 0) /
      totalQuizzes,
  );

  return {
    averageCompletion,
    totalQuestions,
    totalQuizzes,
  };
}

function getQuizSubjectBySlug(slug: string) {
  return quizSubjects.find((subject) => subject.slug === slug);
}

export {
  getQuizSubjectBySlug,
  getQuizSubjectStats,
  quizSubjects,
};
export type { QuizDifficulty, QuizItem, QuizStatus, QuizSubject };

import type {
  QuizCorrectAnswerVisibility,
  QuizFormBehavior,
  QuizReviewTiming,
  QuizScorePolicy,
} from "@/modules/mentor/quiz-builder-types";

type QuizDifficulty = "Dasar" | "Menengah" | "Lanjutan";
type QuizStatus = "Siap dikerjakan" | "Perlu review" | "Baru ditambahkan";

type QuizItem = {
  attemptsAllowed?: number | null;
  completionRate: number;
  correctAnswerVisibility?: QuizCorrectAnswerVisibility;
  difficulty: QuizDifficulty;
  duration: string;
  formBehavior?: QuizFormBehavior;
  isCompleted?: boolean;
  latestAttemptId?: string;
  questionCount: number;
  retryDelaySeconds?: number | null;
  reviewTiming?: QuizReviewTiming;
  scorePolicy?: QuizScorePolicy;
  slug: string;
  status: QuizStatus;
  title: string;
};

type QuizAttemptNavState =
  | "active"
  | "answered"
  | "flagged"
  | "locked"
  | "empty";

type QuizAttemptQuestionOption = {
  id: string;
  key: string;
  text: string;
};

type QuizAttemptQuestion = {
  hint: string;
  id: string;
  options: QuizAttemptQuestionOption[];
  passage: string[];
  prompt: string;
  selectedOptionKey: string | null;
};

type QuizAttemptQuestionMarker = {
  number: number;
  state: QuizAttemptNavState;
};

type QuizAttempt = {
  answeredCount: number;
  currentNumber: number;
  estimatedFinish: string;
  flaggedCount: number;
  focusLabel: string;
  isSubmitted: boolean;
  markers: QuizAttemptQuestionMarker[];
  questions: QuizAttemptQuestion[];
  remainingTime: string;
};

type QuizSubject = {
  code: string;
  description: string;
  palette: string;
  quizzes: QuizItem[];
  slug: string;
  title: string;
};

const quizCardPalette = "bg-primary-100 text-primary-900";

const quizSubjects: QuizSubject[] = [
  {
    code: "TPS",
    description: "Penalaran Umum",
    palette: quizCardPalette,
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
    palette: quizCardPalette,
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
    palette: quizCardPalette,
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
    palette: quizCardPalette,
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
    palette: quizCardPalette,
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
    palette: quizCardPalette,
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
    palette: quizCardPalette,
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

function getQuizSubjectByCode(code: string) {
  return quizSubjects.find((subject) => subject.title === code);
}

function toDatabaseQuizItem(record: { attemptsAllowed?: number | null; correctAnswerVisibility?: QuizCorrectAnswerVisibility; formBehavior?: QuizFormBehavior; items: { id: string }[]; retryDelaySeconds?: number | null; reviewTiming?: QuizReviewTiming; scorePolicy?: QuizScorePolicy; slug: string; title: string }, isCompleted = false, latestAttemptId?: string): QuizItem {
  return {
    attemptsAllowed: record.attemptsAllowed,
    completionRate: 0,
    correctAnswerVisibility: record.correctAnswerVisibility,
    difficulty: "Menengah",
    duration: "",
    formBehavior: record.formBehavior,
    isCompleted,
    latestAttemptId,
    questionCount: record.items.length,
    retryDelaySeconds: record.retryDelaySeconds,
    reviewTiming: record.reviewTiming,
    scorePolicy: record.scorePolicy,
    slug: record.slug,
    status: "Baru ditambahkan",
    title: record.title,
  };
}

function getQuizBySlugs(subjectSlug: string, quizSlug: string) {
  return getQuizSubjectBySlug(subjectSlug)?.quizzes.find(
    (quiz) => quiz.slug === quizSlug,
  );
}

function getQuizAttemptBySlugs(subjectSlug: string, quizSlug: string) {
  const subject = getQuizSubjectBySlug(subjectSlug);
  const quiz = getQuizBySlugs(subjectSlug, quizSlug);

  if (!subject || !quiz) {
    return undefined;
  }

  const markers = Array.from({ length: quiz.questionCount }, (_, index) => {
    const number = index + 1;

    if (number === 1) {
      return { number, state: "active" } satisfies QuizAttemptQuestionMarker;
    }

    if (number <= Math.min(4, quiz.questionCount)) {
      return { number, state: "locked" } satisfies QuizAttemptQuestionMarker;
    }

    if (number === quiz.questionCount - 1) {
      return { number, state: "flagged" } satisfies QuizAttemptQuestionMarker;
    }

    if (number % 5 === 0) {
      return { number, state: "answered" } satisfies QuizAttemptQuestionMarker;
    }

    return { number, state: "empty" } satisfies QuizAttemptQuestionMarker;
  });

  const attempt: QuizAttempt = {
    answeredCount: Math.max(1, Math.round(quiz.questionCount * 0.25)),
    currentNumber: 1,
    estimatedFinish: "11:35 WIB",
    flaggedCount: 1,
    focusLabel: `Latihan ${subject.title}`,
    isSubmitted: false,
    markers,
    questions: [{
      hint: "Kalimat (3) menampilkan relasi sebab-akibat sebagai pola utama.",
      id: "preview-question-1",
      options: [
        {
          id: "preview-option-a",
          key: "A",
          text: "Pemerintah menaikkan harga BBM bersubsidi kemarin malam.",
        },
        {
          id: "preview-option-b",
          key: "B",
          text: "Mahasiswa berprestasi itu mendapatkan beasiswa penuh ke luar negeri.",
        },
        {
          id: "preview-option-c",
          key: "C",
          text: "Ayah membelikan adik sepeda baru di toko olahraga.",
        },
        {
          id: "preview-option-d",
          key: "D",
          text: "Buku sejarah yang tebal itu sangat membosankan bagi sebagian siswa.",
        },
        {
          id: "preview-option-e",
          key: "E",
          text: "Mereka bermain bola di lapangan sekolah saat hujan deras.",
        },
      ],
      passage: [
        "(1) Fenomena hustle culture mengagungkan kerja keras tanpa henti sebagai satu-satunya jalan menuju sukses.",
        "(2) Penganut paham ini sering kali mengabaikan kebutuhan istirahat biologis demi mengejar target produktivitas yang terkadang tidak realistis.",
        "(3) Akibatnya, kasus burnout atau kelelahan kronis di kalangan pekerja muda meningkat tajam dalam lima tahun terakhir.",
        "(4) Ironisnya, riset menunjukkan bahwa jam kerja yang berlebihan justru menurunkan kualitas output kreatif seseorang dalam jangka panjang.",
        "(5) Oleh karena itu, redefinisi makna produktivitas yang lebih manusiawi perlu segera dilakukan agar kesehatan mental pekerja tidak dikorbankan.",
      ],
      prompt: "Kalimat (3) memiliki pola dasar yang sama dengan kalimat...",
      selectedOptionKey: "B",
    }],
    remainingTime: "12:48",
  };

  return {
    attempt,
    quiz,
    subject,
  };
}

export {
  getQuizAttemptBySlugs,
  getQuizBySlugs,
  getQuizSubjectBySlug,
  getQuizSubjectByCode,
  getQuizSubjectStats,
  quizSubjects,
  toDatabaseQuizItem,
};
export type {
  QuizAttempt,
  QuizAttemptNavState,
  QuizDifficulty,
  QuizItem,
  QuizStatus,
  QuizSubject,
};

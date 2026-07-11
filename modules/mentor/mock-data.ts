import {
  BookOpenText,
  CalendarClock,
  FileQuestion,
  Gauge,
  Image as ImageIcon,
  LibraryBig,
  ListChecks,
  type LucideIcon,
  Video,
} from "lucide-react";

type KaptenContentStatus = "draft" | "scheduled" | "published" | "archived";
type KaptenResourceType = "materi" | "quiz" | "question-bank" | "tryout" | "media";

type KaptenSubject = {
  code: string;
  description: string;
  name: string;
  slug: string;
};

type KaptenResource = {
  description: string;
  href: string;
  id: string;
  primaryMetric: string;
  progress: number;
  resourceType: KaptenResourceType;
  scheduledFor?: string;
  status: KaptenContentStatus;
  subjectCode?: string;
  subjectName?: string;
  title: string;
  updatedAt: string;
};

type KaptenMateri = KaptenResource & {
  duration: string;
  resourceCount: number;
  sections: string[];
  videoUrl: string;
};

type KaptenQuiz = KaptenResource & {
  questionCount: number;
  sourceBank: string;
};

type KaptenQuestionBank = KaptenResource & {
  difficultyMix: string;
  questionCount: number;
  reusableIn: string[];
};

type KaptenTryout = KaptenResource & {
  questionCount: number;
  sections: {
    duration: string;
    questionCount: number;
    title: string;
  }[];
};

type KaptenMediaAsset = KaptenResource & {
  dimensions: string;
  fileSize: string;
  mimeType: string;
  usage: string;
};

type KaptenNotificationItem = {
  detail: string;
  href: string;
  icon: LucideIcon;
  time: string;
  title: string;
  unread: boolean;
};

const kaptenSubjects: KaptenSubject[] = [
  {
    code: "PU",
    description: "Penalaran umum dan logika argumen.",
    name: "Penalaran Umum",
    slug: "penalaran-umum",
  },
  {
    code: "PPU",
    description: "Pengetahuan dan pemahaman umum.",
    name: "Pengetahuan dan Pemahaman Umum",
    slug: "pengetahuan-pemahaman-umum",
  },
  {
    code: "PBM",
    description: "Pemahaman bacaan dan menulis.",
    name: "Pemahaman Bacaan dan Menulis",
    slug: "pemahaman-bacaan-menulis",
  },
  {
    code: "PK",
    description: "Pengetahuan kuantitatif dan numerasi.",
    name: "Pengetahuan Kuantitatif",
    slug: "pengetahuan-kuantitatif",
  },
];

const materi: KaptenMateri[] = [
  {
    description: "Video pembuka untuk membantu siswa mengenali premis, klaim, dan simpulan.",
    duration: "18 menit",
    href: "/mentor/materi/mod-pu-argumen",
    id: "mod-pu-argumen",
    primaryMetric: "3 section",
    progress: 72,
    resourceCount: 4,
    resourceType: "materi",
    sections: ["Pengenalan", "Contoh Terpandu", "Latihan Ringkas"],
    status: "draft",
    subjectCode: "PU",
    subjectName: "Penalaran Umum",
    title: "Struktur Argumen Dasar",
    updatedAt: "Diedit 26 menit lalu",
    videoUrl: "https://youtube.com/watch?v=vecalss-pu-argumen",
  },
  {
    description: "Materi video untuk membedakan gagasan utama, detail pendukung, dan distraktor.",
    duration: "24 menit",
    href: "/mentor/materi/mod-ppu-informasi",
    id: "mod-ppu-informasi",
    primaryMetric: "5 asset",
    progress: 46,
    resourceCount: 5,
    resourceType: "materi",
    scheduledFor: "Senin, 15 Juli 2026",
    sections: ["Konsep", "Checklist Baca", "Contoh Soal"],
    status: "scheduled",
    subjectCode: "PPU",
    subjectName: "Pengetahuan dan Pemahaman Umum",
    title: "Membaca Informasi Secara Presisi",
    updatedAt: "Diedit kemarin",
    videoUrl: "https://youtube.com/watch?v=vecalss-ppu-informasi",
  },
  {
    description: "Rangkaian video dan catatan untuk memperbaiki efektivitas kalimat.",
    duration: "31 menit",
    href: "/mentor/materi/mod-pbm-kalimat",
    id: "mod-pbm-kalimat",
    primaryMetric: "6 section",
    progress: 100,
    resourceCount: 6,
    resourceType: "materi",
    sections: ["Konsep", "Contoh Revisi", "Latihan Mandiri"],
    status: "published",
    subjectCode: "PBM",
    subjectName: "Pemahaman Bacaan dan Menulis",
    title: "Efektivitas Kalimat",
    updatedAt: "Diedit 3 hari lalu",
    videoUrl: "https://youtube.com/watch?v=vecalss-pbm-kalimat",
  },
];

const quizzes: KaptenQuiz[] = [
  {
    description: "Latihan pendek untuk mengecek pemahaman simpulan implisit.",
    href: "/mentor/quiz#quiz-pu-simpulan",
    id: "quiz-pu-simpulan",
    primaryMetric: "12 soal",
    progress: 64,
    questionCount: 12,
    resourceType: "quiz",
    sourceBank: "Bank Soal PU Inferensi",
    status: "draft",
    subjectCode: "PU",
    subjectName: "Penalaran Umum",
    title: "Quiz PU: Simpulan Implisit",
    updatedAt: "Diedit 1 jam lalu",
  },
  {
    description: "Kuis penguatan untuk rasio, persentase, dan grafik dasar.",
    href: "/mentor/quiz#quiz-pk-rasio",
    id: "quiz-pk-rasio",
    primaryMetric: "16 soal",
    progress: 88,
    questionCount: 16,
    resourceType: "quiz",
    scheduledFor: "Rabu, 17 Juli 2026",
    sourceBank: "Bank Soal PK Grafik",
    status: "scheduled",
    subjectCode: "PK",
    subjectName: "Pengetahuan Kuantitatif",
    title: "Quiz PK: Grafik dan Rasio",
    updatedAt: "Diedit kemarin",
  },
  {
    description: "Paket evaluasi topik kohesi dan koherensi paragraf.",
    href: "/mentor/quiz#quiz-pbm-paragraf",
    id: "quiz-pbm-paragraf",
    primaryMetric: "10 soal",
    progress: 100,
    questionCount: 10,
    resourceType: "quiz",
    sourceBank: "Bank Soal PBM Paragraf",
    status: "published",
    subjectCode: "PBM",
    subjectName: "Pemahaman Bacaan dan Menulis",
    title: "Quiz PBM: Koherensi Paragraf",
    updatedAt: "Diedit 4 hari lalu",
  },
];

const questionBanks: KaptenQuestionBank[] = [
  {
    description: "Kumpulan soal inferensi untuk quiz dan tryout PU.",
    difficultyMix: "40% sedang, 60% sulit",
    href: "/mentor/quiz/question-bank#bank-pu-inferensi",
    id: "bank-pu-inferensi",
    primaryMetric: "48 soal",
    progress: 78,
    questionCount: 48,
    resourceType: "question-bank",
    reusableIn: ["Quiz PU", "Tryout TPS"],
    status: "draft",
    subjectCode: "PU",
    subjectName: "Penalaran Umum",
    title: "Bank Soal PU Inferensi",
    updatedAt: "Diedit 42 menit lalu",
  },
  {
    description: "Soal grafik, tabel, rasio, dan perbandingan nilai.",
    difficultyMix: "55% sedang, 45% sulit",
    href: "/mentor/quiz/question-bank#bank-pk-grafik",
    id: "bank-pk-grafik",
    primaryMetric: "64 soal",
    progress: 100,
    questionCount: 64,
    resourceType: "question-bank",
    reusableIn: ["Quiz PK", "Tryout Campuran"],
    status: "published",
    subjectCode: "PK",
    subjectName: "Pengetahuan Kuantitatif",
    title: "Bank Soal PK Grafik",
    updatedAt: "Diedit 2 hari lalu",
  },
];

const tryouts: KaptenTryout[] = [
  {
    description: "Paket tryout mingguan dengan komposisi subtest TPS lengkap.",
    href: "/mentor/tryout#to-17",
    id: "to-17",
    primaryMetric: "88 soal",
    progress: 58,
    questionCount: 88,
    resourceType: "tryout",
    sections: [
      { duration: "30 menit", questionCount: 24, title: "Penalaran Umum" },
      { duration: "25 menit", questionCount: 22, title: "PBM" },
      { duration: "35 menit", questionCount: 42, title: "PK & PPU" },
    ],
    status: "draft",
    title: "Tryout 17 - TPS Campuran",
    updatedAt: "Diedit 18 menit lalu",
  },
  {
    description: "Tryout diagnostik untuk siswa baru sebelum masuk rute belajar.",
    href: "/mentor/tryout#diagnostik-awal",
    id: "diagnostik-awal",
    primaryMetric: "60 soal",
    progress: 100,
    questionCount: 60,
    resourceType: "tryout",
    scheduledFor: "Jumat, 19 Juli 2026",
    sections: [
      { duration: "30 menit", questionCount: 30, title: "Literasi" },
      { duration: "30 menit", questionCount: 30, title: "Kuantitatif" },
    ],
    status: "scheduled",
    title: "Diagnostik Awal SNBT",
    updatedAt: "Diedit kemarin",
  },
];

const mediaAssets: KaptenMediaAsset[] = [
  {
    description: "Thumbnail materi PU dengan ilustrasi struktur argumen.",
    dimensions: "1600 x 900",
    fileSize: "284 KB",
    href: "/mentor/media#thumb-pu-argumen",
    id: "thumb-pu-argumen",
    mimeType: "image/jpeg",
    primaryMetric: "284 KB",
    progress: 100,
    resourceType: "media",
    status: "published",
    title: "thumbnail-pu-argumen.jpg",
    updatedAt: "Diunggah 2 jam lalu",
    usage: "Dipakai di 1 materi",
  },
  {
    description: "Cover tryout untuk paket mingguan.",
    dimensions: "1920 x 1080",
    fileSize: "412 KB",
    href: "/mentor/media#cover-to-17",
    id: "cover-to-17",
    mimeType: "image/jpeg",
    primaryMetric: "412 KB",
    progress: 100,
    resourceType: "media",
    status: "draft",
    title: "cover-tryout-17.jpg",
    updatedAt: "Diunggah kemarin",
    usage: "Belum dipakai",
  },
];

const recentlyEdited: KaptenResource[] = [
  materi[0],
  tryouts[0],
  quizzes[0],
  questionBanks[0],
  materi[1],
];

const scheduledPublications: KaptenResource[] = [
  quizzes[1],
  materi[1],
  tryouts[1],
];

const allResources: KaptenResource[] = [
  ...materi,
  ...quizzes,
  ...questionBanks,
  ...tryouts,
  ...mediaAssets,
];

const kaptenNotificationItems: KaptenNotificationItem[] = [
  {
    detail: "Tryout 17 masih membutuhkan review komposisi soal sebelum bisa dijadwalkan.",
    href: "/mentor/tryout#to-17",
    icon: Gauge,
    time: "18 menit lalu",
    title: "Tryout menunggu review",
    unread: true,
  },
  {
    detail: "Quiz PK: Grafik dan Rasio sudah masuk antrean publikasi.",
    href: "/mentor/quiz#quiz-pk-rasio",
    icon: CalendarClock,
    time: "Kemarin",
    title: "Publikasi terjadwal",
    unread: true,
  },
  {
    detail: "Thumbnail baru sudah tersedia di Media.",
    href: "/mentor/media#thumb-pu-argumen",
    icon: ImageIcon,
    time: "2 jam lalu",
    title: "Asset siap dipakai",
    unread: false,
  },
];

const quickCreateItems = [
  {
    description: "Video, catatan, resource pendukung",
    href: "/mentor/materi/create",
    icon: Video,
    label: "Materi",
  },
  {
    description: "Kuis singkat dari question bank",
    href: "/mentor/quiz#create",
    icon: ListChecks,
    label: "Quiz",
  },
  {
    description: "Assessment bertahap dan terjadwal",
    href: "/mentor/tryout#create",
    icon: Gauge,
    label: "Tryout",
  },
  {
    description: "Soal reusable untuk quiz dan tryout",
    href: "/mentor/quiz/question-bank#create",
    icon: FileQuestion,
    label: "Question Bank",
  },
];

const contentTypeMeta: Record<
  KaptenResourceType,
  { icon: LucideIcon; label: string }
> = {
  materi: { icon: BookOpenText, label: "Materi" },
  media: { icon: ImageIcon, label: "Media" },
  quiz: { icon: ListChecks, label: "Quiz" },
  "question-bank": { icon: LibraryBig, label: "Question Bank" },
  tryout: { icon: Gauge, label: "Tryout" },
};

const statusLabels: Record<KaptenContentStatus, string> = {
  archived: "Archived",
  draft: "Draft",
  published: "Published",
  scheduled: "Scheduled",
};

function getMateriById(id: string) {
  return materi.find((item) => item.id === id) ?? null;
}

export {
  allResources,
  contentTypeMeta,
  getMateriById,
  kaptenNotificationItems,
  kaptenSubjects,
  mediaAssets,
  materi,
  questionBanks,
  quickCreateItems,
  quizzes,
  recentlyEdited,
  scheduledPublications,
  statusLabels,
  tryouts,
};

export type {
  KaptenContentStatus,
  KaptenMediaAsset,
  KaptenMateri,
  KaptenNotificationItem,
  KaptenQuestionBank,
  KaptenQuiz,
  KaptenResource,
  KaptenResourceType,
  KaptenSubject,
  KaptenTryout,
};

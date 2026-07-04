type VeraMessage = {
  id: string;
  role: "student" | "vera";
  text: string;
  time: string;
  context?: string;
};

type VeraQuickPrompt = {
  id: string;
  label: string;
  prompt: string;
};

type VeraWeaknessTopic = {
  id: string;
  subtest: string;
  topic: string;
  source: string;
  mastery: number;
  trend: string;
  recommendation: string;
};

type VeraRecommendation = {
  id: string;
  rank: string;
  type: "Materi" | "Quiz" | "Drill";
  title: string;
  reason: string;
  duration: string;
  href: string;
};

type VeraAdaptiveDrill = {
  id: string;
  topic: string;
  difficulty: string;
  questionCount: string;
  readiness: string;
  status: "Siap" | "Review" | "Ulang";
  source: string;
};

type VeraStrategySnapshot = {
  target: string;
  currentScore: string;
  targetScore: string;
  gap: string;
  focus: string[];
};

type VeraExplanationContext = {
  id: string;
  label: string;
  question: string;
  mistake: string;
  source: string;
};

const veraMessages: VeraMessage[] = [
  {
    id: "m-1",
    role: "vera",
    text: "Aku sudah membaca tryout terakhir dan quiz PU minggu ini. Fokus paling dekat: simpulan implisit, rasio, dan baca grafik.",
    time: "09.14",
    context: "Analisis otomatis",
  },
  {
    id: "m-2",
    role: "student",
    text: "Kenapa nilai PK-ku turun padahal latihan sudah lumayan sering?",
    time: "09.16",
  },
  {
    id: "m-3",
    role: "vera",
    text: "Polanya bukan jumlah latihan, tapi waktu pengerjaan. Akurasi kamu stabil di soal mudah, lalu turun saat soal rasio punya dua langkah hitung. Aku sarankan 8 soal adaptif dulu sebelum masuk modul baru.",
    time: "09.16",
    context: "PK - Rasio dan Persentase",
  },
];

const veraQuickPrompts: VeraQuickPrompt[] = [
  {
    id: "qp-1",
    label: "Baca hasil tryout",
    prompt: "Jelaskan kelemahan utama dari tryout terakhirku.",
  },
  {
    id: "qp-2",
    label: "Buat drill adaptif",
    prompt: "Buatkan drill 10 soal dari topik yang paling lemah.",
  },
  {
    id: "qp-3",
    label: "Strategi PTN",
    prompt: "Bandingkan posisiku dengan target jurusan dan buat strategi 14 hari.",
  },
  {
    id: "qp-4",
    label: "Bahas soal salah",
    prompt: "Jelaskan ulang soal yang terakhir salah dengan langkah yang lebih pelan.",
  },
];

const veraWeaknessTopics: VeraWeaknessTopic[] = [
  {
    id: "weak-1",
    subtest: "PU",
    topic: "Simpulan implisit",
    source: "Tryout SNBT 04",
    mastery: 42,
    trend: "-11% dari sesi sebelumnya",
    recommendation: "Review Struktur Argumen lalu kerjakan 6 soal bertahap.",
  },
  {
    id: "weak-2",
    subtest: "PK",
    topic: "Rasio dan persentase",
    source: "Quiz PK Modul 02",
    mastery: 48,
    trend: "Waktu rata-rata 2m 14d",
    recommendation: "Mulai drill adaptif dengan batas waktu ringan.",
  },
  {
    id: "weak-3",
    subtest: "LBI",
    topic: "Baca grafik cepat",
    source: "Latihan Literasi Data",
    mastery: 54,
    trend: "Akurasi naik, tempo belum stabil",
    recommendation: "Minta Vera pecah pola grafik sebelum lanjut tryout.",
  },
];

const veraRecommendations: VeraRecommendation[] = [
  {
    id: "rec-1",
    rank: "01",
    type: "Materi",
    title: "Penalaran Umum: Struktur Argumen",
    reason: "Membuka ulang konsep yang paling sering memicu jawaban ragu.",
    duration: "18 menit",
    href: "/courses/penalaran-umum",
  },
  {
    id: "rec-2",
    rank: "02",
    type: "Drill",
    title: "Rasio Bertingkat",
    reason: "Latihan pendek untuk memperbaiki tempo PK tanpa membuat sesi berat.",
    duration: "10 soal",
    href: "/vera-ai#drill",
  },
  {
    id: "rec-3",
    rank: "03",
    type: "Quiz",
    title: "PU - Simpulan dan Pernyataan",
    reason: "Validasi cepat setelah review materi, sebelum masuk tryout berikutnya.",
    duration: "12 menit",
    href: "/quiz/penalaran-umum",
  },
];

const veraAdaptiveDrills: VeraAdaptiveDrill[] = [
  {
    id: "drill-1",
    topic: "Rasio dan Persentase",
    difficulty: "Adaptive",
    questionCount: "8 soal",
    readiness: "Direkomendasikan sekarang",
    status: "Siap",
    source: "PK weakness score",
  },
  {
    id: "drill-2",
    topic: "Simpulan Implisit",
    difficulty: "Medium",
    questionCount: "6 soal",
    readiness: "Setelah review materi",
    status: "Review",
    source: "Tryout SNBT 04",
  },
  {
    id: "drill-3",
    topic: "Grafik dan Tabel",
    difficulty: "Adaptive",
    questionCount: "5 soal",
    readiness: "Ulang dari kesalahan kemarin",
    status: "Ulang",
    source: "Quiz Literasi Data",
  },
];

const veraStrategySnapshot: VeraStrategySnapshot = {
  target: "Ilmu Komputer - UI",
  currentScore: "676",
  targetScore: "715",
  gap: "39 poin",
  focus: [
    "Naikkan PK lewat drill tempo pendek.",
    "Pertahankan LBI dengan 1 review ringan per minggu.",
    "Gunakan tryout berikutnya untuk menguji stabilitas PU.",
  ],
};

const veraExplanationContexts: VeraExplanationContext[] = [
  {
    id: "explain-1",
    label: "PU Soal 17",
    question: "Simpulan yang paling tepat dari paragraf argumentatif.",
    mistake: "Memilih jawaban yang benar secara fakta, tapi tidak didukung teks.",
    source: "Tryout SNBT 04",
  },
  {
    id: "explain-2",
    label: "PK Soal 08",
    question: "Rasio campuran dengan dua perubahan persentase.",
    mistake: "Langkah kedua memakai basis awal, bukan basis setelah perubahan.",
    source: "Quiz PK Modul 02",
  },
  {
    id: "explain-3",
    label: "LBI Soal 12",
    question: "Membaca tren dari tabel sederhana.",
    mistake: "Terburu-buru mengambil angka terbesar, bukan perubahan terbesar.",
    source: "Latihan Literasi Data",
  },
];

export {
  veraAdaptiveDrills,
  veraExplanationContexts,
  veraMessages,
  veraQuickPrompts,
  veraRecommendations,
  veraStrategySnapshot,
  veraWeaknessTopics,
};
export type {
  VeraAdaptiveDrill,
  VeraExplanationContext,
  VeraMessage,
  VeraQuickPrompt,
  VeraRecommendation,
  VeraStrategySnapshot,
  VeraWeaknessTopic,
};

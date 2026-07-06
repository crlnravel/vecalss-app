type VeraToolId = "analysis" | "route" | "drill" | "review" | "ptn" | "summary";

type VeraContextTypeId = "practice" | "material" | "document";

type VeraContextType = {
  id: VeraContextTypeId;
  label: string;
  description: string;
};

type VeraContextSource = {
  id: string;
  title: string;
  type: VeraContextTypeId;
};

type VeraPracticeHistory = {
  id: string;
  title: string;
  kind: "Tryout" | "Quiz";
  meta: string;
  result: string;
};

type VeraMaterialHistory = {
  id: string;
  title: string;
  kind: "Modul" | "Video" | "Teks" | "Contoh soal" | "Pembahasan";
  topic: string;
  lastAccessed: string;
};

type VeraQuickPrompt = {
  id: string;
  label: string;
  mode: VeraToolId | "chat";
};

type VeraStudioTool = {
  id: VeraToolId;
  title: string;
  badge: string;
  outputTitle: string;
  outputBody: string;
  tone: "gold" | "mint" | "green" | "cream" | "sky" | "rose";
};

type VeraToolMode = {
  id: VeraToolId;
  eyebrow: string;
  title: string;
  description: string;
  highlights: string[];
  metrics: {
    label: string;
    value: string;
  }[];
  primaryAction: string;
  followUp: string;
};

const veraContextSources: VeraContextSource[] = [
  {
    id: "tryout-04",
    title: "Tryout SNBT 04",
    type: "practice",
  },
  {
    id: "quiz-pk-02",
    title: "Quiz PK Modul 02",
    type: "practice",
  },
  {
    id: "module-ratio",
    title: "Modul Rasio Dasar",
    type: "material",
  },
  {
    id: "concept-review",
    title: "Pembahasan Struktur Argumen",
    type: "material",
  },
  {
    id: "personal-summary",
    title: "Rangkuman PK Pribadi",
    type: "document",
  },
  {
    id: "external-notes",
    title: "Catatan UTBK Mingguan",
    type: "document",
  },
];

const veraContextTypes: VeraContextType[] = [
  {
    id: "practice",
    label: "Hasil Latihan",
    description: "Tryout or quiz.",
  },
  {
    id: "material",
    label: "Materi",
    description:
      "Modul resmi Vecalss, video, teks pembelajaran, contoh soal, pembahasan konsep.",
  },
  {
    id: "document",
    label: "Dokumen",
    description:
      "PDF, TXT, catatan siswa, file tambahan, rangkuman pribadi, materi eksternal.",
  },
];

const veraPracticeHistory: VeraPracticeHistory[] = [
  {
    id: "tryout-snbt-04",
    title: "Tryout SNBT 04",
    kind: "Tryout",
    meta: "Selesai 4 Juli 2026",
    result: "Skor 676",
  },
  {
    id: "quiz-pk-modul-02",
    title: "Quiz PK Modul 02",
    kind: "Quiz",
    meta: "Selesai 3 Juli 2026",
    result: "12 soal",
  },
  {
    id: "tryout-snbt-03",
    title: "Tryout SNBT 03",
    kind: "Tryout",
    meta: "Selesai 28 Juni 2026",
    result: "Skor 652",
  },
  {
    id: "quiz-pu-argumen",
    title: "Quiz PU Struktur Argumen",
    kind: "Quiz",
    meta: "Selesai 25 Juni 2026",
    result: "8 soal",
  },
];

const veraMaterialHistory: VeraMaterialHistory[] = [
  {
    id: "modul-rasio-dasar",
    title: "Modul Rasio Dasar",
    kind: "Modul",
    topic: "Pengetahuan Kuantitatif",
    lastAccessed: "Terakhir dibuka hari ini",
  },
  {
    id: "video-persentase",
    title: "Video Trik Persentase",
    kind: "Video",
    topic: "Pengetahuan Kuantitatif",
    lastAccessed: "Terakhir dibuka kemarin",
  },
  {
    id: "teks-struktur-argumen",
    title: "Teks Struktur Argumen",
    kind: "Teks",
    topic: "Penalaran Umum",
    lastAccessed: "Terakhir dibuka 2 hari lalu",
  },
  {
    id: "contoh-simpulan",
    title: "Contoh Soal Simpulan Implisit",
    kind: "Contoh soal",
    topic: "Penalaran Umum",
    lastAccessed: "Terakhir dibuka minggu ini",
  },
  {
    id: "pembahasan-grafik",
    title: "Pembahasan Konsep Grafik",
    kind: "Pembahasan",
    topic: "Literasi Data",
    lastAccessed: "Terakhir dibuka minggu ini",
  },
];

const veraQuickPrompts: VeraQuickPrompt[] = [
  {
    id: "prompt-drill",
    label: "Buat drill dari soal salah",
    mode: "drill",
  },
  {
    id: "prompt-route",
    label: "Susun rute belajar minggu ini",
    mode: "route",
  },
];

const veraStudioTools: VeraStudioTool[] = [
  {
    id: "analysis",
    title: "Analisis Kelemahan",
    badge: "Core",
    outputTitle: "Kelemahan utama ditemukan",
    outputBody:
      "PU simpulan implisit dan PK rasio dua langkah menjadi prioritas sesi berikutnya.",
    tone: "gold",
  },
  {
    id: "route",
    title: "Rute Belajar",
    badge: "Smart",
    outputTitle: "Rute 7 hari siap",
    outputBody:
      "Mulai dari review struktur argumen, lanjut drill PK, lalu validasi lewat quiz pendek.",
    tone: "mint",
  },
  {
    id: "drill",
    title: "Drill Adaptif",
    badge: "Smart",
    outputTitle: "Drill adaptif dibuat",
    outputBody:
      "8 soal rasio bertingkat dan 6 soal simpulan implisit siap dijadikan sesi fokus.",
    tone: "green",
  },
  {
    id: "review",
    title: "Bahas Soal Salah",
    badge: "Core",
    outputTitle: "Queue pembahasan terbuka",
    outputBody:
      "3 soal terbaru diprioritaskan: PU nomor 17, PK nomor 08, dan LBI nomor 12.",
    tone: "cream",
  },
  {
    id: "ptn",
    title: "Strategi PTN",
    badge: "Smart",
    outputTitle: "Strategi PTN diperbarui",
    outputBody:
      "Target Ilmu Komputer UI membutuhkan kenaikan stabil di PK dan PU selama 14 hari.",
    tone: "sky",
  },
  {
    id: "summary",
    title: "Ringkasan Belajar",
    badge: "Core",
    outputTitle: "Ringkasan sesi disiapkan",
    outputBody:
      "Vera merangkum fokus hari ini, konteks yang dipakai, dan tugas belajar berikutnya.",
    tone: "rose",
  },
];

const veraToolModes: Record<VeraToolId, VeraToolMode> = {
  analysis: {
    id: "analysis",
    eyebrow: "Mode analisis",
    title: "Vera membaca kelemahanmu dari konteks belajar.",
    description:
      "Analisis ini menggabungkan tryout terakhir, quiz modul, soal salah, dan target PTN supaya rekomendasi tidak terasa acak.",
    highlights: [
      "PU: simpulan implisit turun 11% dari sesi sebelumnya.",
      "PK: rasio dua langkah sering benar konsep, tetapi salah basis hitung.",
      "LBI: akurasi naik, tempo membaca tabel masih perlu dijaga.",
    ],
    metrics: [
      { label: "Sumber", value: "6 konteks" },
      { label: "Prioritas", value: "PU + PK" },
      { label: "Estimasi", value: "28 menit" },
    ],
    primaryAction: "Buat rute dari analisis",
    followUp: "Tanya Vera kenapa topik ini paling berpengaruh ke skor.",
  },
  route: {
    id: "route",
    eyebrow: "Mode rute belajar",
    title: "Rute minggu ini dibuat dari prioritas paling dekat.",
    description:
      "Vera mengurutkan materi, quiz, dan drill agar sesi belajar terasa pendek, jelas, dan nyambung dengan target skor.",
    highlights: [
      "Hari 1-2: review Struktur Argumen dan contoh simpulan.",
      "Hari 3-4: drill rasio bertingkat dengan batas waktu ringan.",
      "Hari 5-7: validasi lewat quiz pendek dan bahas soal salah.",
    ],
    metrics: [
      { label: "Durasi", value: "7 hari" },
      { label: "Beban", value: "Ringan" },
      { label: "Output", value: "3 sesi" },
    ],
    primaryAction: "Simpan rute belajar",
    followUp: "Minta Vera menyesuaikan rute kalau kamu hanya punya 20 menit.",
  },
  drill: {
    id: "drill",
    eyebrow: "Mode generator drill",
    title: "Drill adaptif siap dibuat dari soal salah.",
    description:
      "Pilih fokus, jumlah soal, lalu Vera menyiapkan latihan yang mengikuti kelemahan terdekat tanpa perlu cari soal manual.",
    highlights: [
      "8 soal PK rasio dan persentase, level adaptive.",
      "6 soal PU simpulan implisit, level medium.",
      "Pembahasan akan muncul setelah drill selesai dikerjakan.",
    ],
    metrics: [
      { label: "Soal", value: "14" },
      { label: "Topik", value: "2" },
      { label: "Status", value: "Siap" },
    ],
    primaryAction: "Generate drill",
    followUp: "Tanya Vera untuk mengubah tingkat kesulitan sebelum mulai.",
  },
  review: {
    id: "review",
    eyebrow: "Mode pembahasan",
    title: "Bahas soal salah tanpa keluar dari workspace.",
    description:
      "Vera menampilkan antrean soal salah, menjelaskan alasan jawabanmu meleset, lalu memberi pola yang harus diingat.",
    highlights: [
      "PU nomor 17: jawaban faktual, tetapi tidak didukung teks.",
      "PK nomor 08: basis persentase berubah di langkah kedua.",
      "LBI nomor 12: membaca angka terbesar, bukan perubahan terbesar.",
    ],
    metrics: [
      { label: "Antrean", value: "3 soal" },
      { label: "Sumber", value: "Tryout + quiz" },
      { label: "Mode", value: "Step-by-step" },
    ],
    primaryAction: "Mulai bahas soal",
    followUp: "Minta Vera menjelaskan dengan analogi yang lebih sederhana.",
  },
  ptn: {
    id: "ptn",
    eyebrow: "Mode strategi PTN",
    title: "Strategi menuju Ilmu Komputer UI.",
    description:
      "Vera membaca gap skor dan membuat prioritas yang realistis untuk menjaga peluang tanpa mengorbankan topik yang sudah stabil.",
    highlights: [
      "Skor saat ini 676, target aman 715.",
      "Gap 39 poin lebih mungkin dikejar dari PK dan PU.",
      "LBI cukup dijaga dengan review ringan mingguan.",
    ],
    metrics: [
      { label: "Target", value: "UI" },
      { label: "Gap", value: "39 poin" },
      { label: "Horizon", value: "14 hari" },
    ],
    primaryAction: "Susun strategi 14 hari",
    followUp: "Tanya Vera untuk membandingkan target cadangan.",
  },
  summary: {
    id: "summary",
    eyebrow: "Mode ringkasan",
    title: "Ringkasan belajar yang bisa dibawa ke sesi berikutnya.",
    description:
      "Vera menyimpan konteks penting supaya percakapan berikutnya langsung mulai dari keputusan belajar terbaru.",
    highlights: [
      "Fokus hari ini: simpulan implisit dan rasio dua langkah.",
      "Tindakan berikutnya: drill 14 soal sebelum modul baru.",
      "Catatan strategi: jaga LBI, dorong PK dan PU.",
    ],
    metrics: [
      { label: "Catatan", value: "3 poin" },
      { label: "Konteks", value: "Tersimpan" },
      { label: "Berikutnya", value: "Drill" },
    ],
    primaryAction: "Simpan ringkasan",
    followUp: "Minta Vera membuat versi singkat untuk reminder harian.",
  },
};

export {
  veraContextSources,
  veraContextTypes,
  veraMaterialHistory,
  veraPracticeHistory,
  veraQuickPrompts,
  veraStudioTools,
  veraToolModes,
};
export type {
  VeraContextSource,
  VeraContextType,
  VeraContextTypeId,
  VeraMaterialHistory,
  VeraPracticeHistory,
  VeraQuickPrompt,
  VeraStudioTool,
  VeraToolId,
  VeraToolMode,
};

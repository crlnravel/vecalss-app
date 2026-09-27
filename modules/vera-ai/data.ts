type VeraToolId = "analysis" | "route" | "review";

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

const veraQuickPrompts: VeraQuickPrompt[] = [
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
    id: "review",
    title: "Bahas Soal Salah",
    badge: "Core",
    outputTitle: "Queue pembahasan terbuka",
    outputBody:
      "3 soal terbaru diprioritaskan: PU nomor 17, PK nomor 08, dan LBI nomor 12.",
    tone: "cream",
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
      { label: "Sumber", value: "Hingga 4 sumber" },
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
};

export {
  veraQuickPrompts,
  veraStudioTools,
  veraToolModes,
};
export type {
  VeraQuickPrompt,
  VeraStudioTool,
  VeraToolId,
  VeraToolMode,
};

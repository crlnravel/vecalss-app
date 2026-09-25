export type VideoCategory = "TPS" | "TPA";
export type VideoSubtest = "PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM";
export type VideoThumbnailTone = "forest" | "deep" | "leaf";

export type VideoGalleryItem = {
  category: VideoCategory;
  description: string;
  duration: string;
  id: string;
  isNew?: boolean;
  subtest: VideoSubtest;
  subject: string;
  tags: string[];
  thumbnailEyebrow: string;
  thumbnailTitle: string;
  thumbnailTone: VideoThumbnailTone;
  title: string;
  youtubeUrl: string;
};

export const videoFilters: readonly ("Semua" | VideoSubtest)[] = [
  "Semua",
  "PU",
  "PPU",
  "PBM",
  "PK",
  "LBI",
  "LBE",
  "PM",
];

export function youtubeSearchUrl(title: string) {
  // Prototype links keep the UI honest until Kapten video URLs are persisted.
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`Vecalss ${title}`)}`;
}

export const videoItems = [
  {
    category: "TPS",
    description: "Pembahasan langkah demi langkah untuk soal-soal kuantitatif yang sering muncul.",
    duration: "30:00",
    id: "tps-pk-2026",
    isNew: true,
    subtest: "PK",
    subject: "Pengetahuan Kuantitatif",
    tags: ["TPS", "PK", "SNBT 2026"],
    thumbnailEyebrow: "PEMBAHASAN",
    thumbnailTitle: "TPS PK\nSNBT 2026",
    thumbnailTone: "deep",
    title: "Pembahasan TPS PK — SNBT 2026",
    youtubeUrl: youtubeSearchUrl("Pembahasan TPS PK SNBT 2026"),
  },
  {
    category: "TPS",
    description: "Kenali pola soal dan strategi cepat untuk menaklukkan penalaran kuantitatif.",
    duration: "21:47",
    id: "prediksi-kuantitatif",
    subtest: "PK",
    subject: "Pengetahuan Kuantitatif",
    tags: ["Prediksi", "Kuantitatif", "UTBK"],
    thumbnailEyebrow: "STRATEGI CEPAT",
    thumbnailTitle: "PREDIKSI\nKUANTITATIF",
    thumbnailTone: "forest",
    title: "Prediksi Soal Kuantitatif UTBK 2026",
    youtubeUrl: youtubeSearchUrl("Prediksi Soal Kuantitatif UTBK 2026"),
  },
  {
    category: "TPS",
    description: "Cara ringkas membaca persentase, diskon, dan perubahan nilai tanpa berlama-lama.",
    duration: "17:45",
    id: "diskon-persen",
    subtest: "PK",
    subject: "Pengetahuan Kuantitatif",
    tags: ["Persen", "Diskon", "Trik"],
    thumbnailEyebrow: "CARA CEPAT",
    thumbnailTitle: "DISKON\n& PERSEN",
    thumbnailTone: "leaf",
    title: "Cara Cepat Jawab Diskon dan Persen",
    youtubeUrl: youtubeSearchUrl("Cara Cepat Jawab Diskon dan Persen"),
  },
  {
    category: "TPS",
    description: "Pahami peluang lewat contoh sederhana dan pola hitung yang mudah diingat.",
    duration: "12:20",
    id: "peluang-pk",
    subtest: "PK",
    subject: "Pengetahuan Kuantitatif",
    tags: ["Peluang", "PK", "Latihan"],
    thumbnailEyebrow: "FONDASI",
    thumbnailTitle: "PELUANG\nDASAR",
    thumbnailTone: "deep",
    title: "Cara Cepat Jawab Soal Peluang PK",
    youtubeUrl: youtubeSearchUrl("Cara Cepat Jawab Soal Peluang PK"),
  },
  {
    category: "TPS",
    description: "Latihan bertahap untuk menemukan pola bilangan dan menyusun langkah paling efisien.",
    duration: "15:15",
    id: "pola-bilangan",
    subtest: "PU",
    subject: "Penalaran Umum",
    tags: ["Pola Bilangan", "PU", "Latihan"],
    thumbnailEyebrow: "BEDAH SOAL",
    thumbnailTitle: "POLA\nBILANGAN",
    thumbnailTone: "forest",
    title: "Cara Cepat Soal Pola Bilangan UTBK",
    youtubeUrl: youtubeSearchUrl("Cara Cepat Soal Pola Bilangan UTBK"),
  },
  {
    category: "TPA",
    description: "Bawa strategi membaca cepat ke sesi latihan dengan contoh bacaan yang relevan.",
    duration: "20:19",
    id: "literasi-bacaan",
    isNew: true,
    subtest: "LBI",
    subject: "Literasi Bahasa Indonesia",
    tags: ["LBI", "Literasi", "Strategi"],
    thumbnailEyebrow: "BEDAH BACAAN",
    thumbnailTitle: "LITERASI\nINDONESIA",
    thumbnailTone: "leaf",
    title: "Strategi Menjawab Soal Literasi Bahasa Indonesia",
    youtubeUrl: youtubeSearchUrl("Strategi Menjawab Soal Literasi Bahasa Indonesia"),
  },
  {
    category: "TPA",
    description: "Temukan cara menyusun fokus sebelum mulai membaca teks berbahasa Inggris.",
    duration: "18:42",
    id: "reading-comprehension",
    subtest: "LBE",
    subject: "Literasi Bahasa Inggris",
    tags: ["LBE", "Reading", "SNBT"],
    thumbnailEyebrow: "READING HACK",
    thumbnailTitle: "READING\nCOMPREHENSION",
    thumbnailTone: "deep",
    title: "Reading Comprehension: Temukan Ide Utama",
    youtubeUrl: youtubeSearchUrl("Reading Comprehension Temukan Ide Utama SNBT"),
  },
  {
    category: "TPA",
    description: "Latihan penalaran umum dengan pendekatan visual agar pola jawabannya lebih mudah terlihat.",
    duration: "14:08",
    id: "penalaran-umum",
    subtest: "PU",
    subject: "Penalaran Umum",
    tags: ["PU", "Penalaran", "Latihan"],
    thumbnailEyebrow: "KUPAS TUNTAS",
    thumbnailTitle: "PENALARAN\nUMUM",
    thumbnailTone: "forest",
    title: "Kupas Tuntas Penalaran Umum untuk SNBT",
    youtubeUrl: youtubeSearchUrl("Kupas Tuntas Penalaran Umum untuk SNBT"),
  },
] satisfies readonly VideoGalleryItem[];

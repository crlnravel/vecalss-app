const QUESTION_BANK_MATERI_OPTIONS = {
  PU: [
    "Deret Angka & Pola Bilangan",
    "Deret Gambar & Pola Visual",
    "Analogi Verbal",
    "Generalisasi dari Fakta",
    "Pengelompokan & Klasifikasi",
    "Silogisme & Premis",
    "Logika Proposisi",
    "Penalaran Analitik",
    "Menarik Kesimpulan dari Bacaan",
    "Menentukan Argumen yang Tepat",
    "Perbandingan Kuantitatif",
    "Interpretasi Data & Grafik",
    "Logika Matematika Dasar",
    "Perbandingan Senilai & Berbalik Nilai",
    "Soal Cerita & Penalaran Numerik",
  ],
  PBM: [
    "Ejaan & Tanda Baca",
    "Makna Kata & Frasa",
    "Morfologi & Pembentukan Kata",
    "Semantik: Makna dan Relasi Makna",
    "Pilihan Kata & Diksi yang Tepat",
    "Sintaksis: Fungsi & Struktur Kalimat",
    "Kalimat Aktif & Kalimat Pasif",
    "Kalimat Efektif Konjungsi dan Hubungan Logis",
    "Gagasan Utama & Gagasan Pendukung",
    "Kalimat Utama & Kalimat Pendukung",
    "Koherensi & Kohesi Paragraf",
    "Jenis Teks & Sikap Penulis",
    "Membandingkan Dua Teks",
    "Simpulan dan Inferensi Teks",
  ],
  PK: [
    "Bilangan Bulat & Operasinya",
    "Bilangan Pecahan & Desimal",
    "Perbandingan & Rasio",
    "Aritmetika Sosial",
    "Aljabar & Persamaan Linear",
    "Pertidaksamaan Linear",
    "Fungsi & Relasi",
    "Pola Bilangan & Barisan",
    "Bangun Datar & Kelilingnya",
    "Bangun Ruang & Volumenya",
    "Sudut & Garis",
    "Kesebangunan & Kekongruenan",
    "Statistika Deskriptif",
    "Penyajian Data",
    "Peluang & Kombinatorika",
  ],
  LBI: [
    "Perbendaharaan Kata (Kosakata)",
    "Tata Bahasa & Gramatikal",
    "Kosakata Baku & Serapan",
    "Makna Kontekstual Kata & Frasa",
    "Ejaan & Penulisan yang Benar",
    "Konjungsi & Penanda Wacana",
    "Gaya Bahasa & Ungkapan",
    "Memahami Teks Informasi",
    "Memahami Teks Sastra",
    "Menemukan Gagasan Pokok",
    "Menyimpulkan & Inferensi",
    "Membedakan Fakta & Opini",
    "Mengevaluasi Argumen Teks",
    "Membandingkan Informasi Antarteks",
    "Teks Multimodal (Data & Grafik)",
  ],
  PM: [
    "Representasi & Sifat Bilangan",
    "Operasi Hitung dalam Konteks",
    "Perbandingan & Proporsi",
    "Aritmetika Sosial Kontekstual",
    "Persamaan & Pertidaksamaan",
    "Fungsi & Grafik",
    "Pola & Generalisasi",
    "Pengukuran Bangun Datar",
    "Pengukuran Bangun Ruang",
    "Transformasi & Koordinat",
    "Teorema Pythagoras & Trigonometri",
    "Statistika Deskriptif",
    "Membaca & Menginterpretasi Data",
    "Peluang Empiris & Teoretis",
    "Aturan Pencacahan & Kombinatorika",
  ],
  PPU: [
    "Sinonim & Antonim",
    "Makna Kata dalam Konteks",
    "Bentuk Kata & Afiksasi",
    "Kalimat Efektif",
    "Ejaan & Tanda Baca",
    "Konjungsi & Hubungan Antarkalimat",
    "Kata Baku & Tidak Baku",
    "Ide Pokok & Gagasan Utama",
    "Simpulan & Inferensi Wacana",
    "Kepaduan Wacana (Kohesi & Koherensi)",
    "Pengetahuan Budaya Indonesia",
    "Pengetahuan Sejarah & Kewarganegaraan",
    "Pengetahuan Sains & Teknologi Umum",
    "Pengetahuan Sosial & Ekonomi",
    "Pengetahuan Lingkungan & Kesehatan",
  ],
  LBE: [
    "Vocabulary in Context",
    "Synonyms & Antonyms",
    "Grammar & Sentence Structure",
    "Word Forms & Parts of Speech",
    "Connectives & Discourse Markers",
    "Main Idea & Topic",
    "Specific Details & Facts",
    "Inference & Implied Meaning",
    "Author's Purpose & Tone",
    "Text Organization & Structure",
    "Reference & Pronoun",
    "Paraphrase & Restatement",
    "Evaluating Arguments",
    "Identifying Assumptions",
    "Comparing Two Passages",
  ],
} as const;

type QuestionBankMateriSubject = keyof typeof QUESTION_BANK_MATERI_OPTIONS;

function questionBankMateriOptions(subjectCode: string): readonly string[] {
  return QUESTION_BANK_MATERI_OPTIONS[
    subjectCode as QuestionBankMateriSubject
  ] ?? [];
}

function normalizeQuestionBankMateri(
  subjectCode: string,
  materi: string | null | undefined,
) {
  const normalized = materi?.trim() ?? "";
  return normalized && questionBankMateriOptions(subjectCode).includes(normalized)
    ? normalized
    : null;
}

function isQuestionBankMateri(
  subjectCode: string,
  materi: string | null | undefined,
) {
  return normalizeQuestionBankMateri(subjectCode, materi) === (materi?.trim() || null);
}

export {
  isQuestionBankMateri,
  normalizeQuestionBankMateri,
  questionBankMateriOptions,
  QUESTION_BANK_MATERI_OPTIONS,
};

export type { QuestionBankMateriSubject };

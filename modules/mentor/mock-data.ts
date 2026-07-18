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
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

type KaptenContentStatus = "draft" | "scheduled" | "published" | "archived";
type KaptenResourceType = "materi" | "quiz" | "question-bank" | "tryout" | "media";

type KaptenSubject = {
  code: string;
  description: string;
  name: string;
  slug: string;
};

type KaptenResource = {
  closesAt?: string;
  description: string;
  href: string;
  id: string;
  opensAt?: string;
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

type KaptenQuiz = KaptenResource & {
  questionCount: number;
  sourceBank: string;
  sourceBankId?: string;
};

type KaptenQuestionBank = KaptenResource & {
  difficultyMix: string;
  questionCount: number;
  reusableIn: string[];
  topic?: string;
};

type BankQuestion = {
  bankId: string;
  choices: {
    id: string;
    mediaAssetId?: string;
    text: string;
  }[];
  correctChoiceId: string;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  explanationMediaAssetId?: string;
  id: string;
  prompt: string;
  promptMediaAssetId?: string;
  subjectCode: string;
  tags: string[];
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
  {
    code: "LBI",
    description: "Literasi dalam Bahasa Indonesia.",
    name: "Literasi Bahasa Indonesia",
    slug: "literasi-bahasa-indonesia",
  },
  {
    code: "LBE",
    description: "Literasi dalam Bahasa Inggris.",
    name: "Literasi Bahasa Inggris",
    slug: "literasi-bahasa-inggris",
  },
  {
    code: "PM",
    description: "Penalaran matematika dan pemecahan masalah.",
    name: "Penalaran Matematika",
    slug: "penalaran-matematika",
  },
];


const quizzes: KaptenQuiz[] = [
  {
    description: "Latihan pendek untuk mengecek pemahaman simpulan implisit.",
    href: "/mentor/quiz/quiz-pu-simpulan",
    id: "quiz-pu-simpulan",
    primaryMetric: "12 soal",
    progress: 67,
    questionCount: 12,
    resourceType: "quiz",
    sourceBank: "Bank Soal PU Inferensi",
    sourceBankId: "bank-pu-inferensi",
    status: "draft",
    subjectCode: "PU",
    subjectName: "Penalaran Umum",
    title: "Quiz PU: Simpulan Implisit",
    updatedAt: "Diedit 1 jam lalu",
  },
  {
    description: "Kuis penguatan untuk rasio, persentase, dan grafik dasar.",
    href: "/mentor/quiz/quiz-pk-rasio",
    id: "quiz-pk-rasio",
    primaryMetric: "16 soal",
    progress: 88,
    questionCount: 16,
    resourceType: "quiz",
    closesAt: "2026-07-20T20:00",
    opensAt: "2026-07-19T08:00",
    sourceBank: "Bank Soal PK Grafik",
    sourceBankId: "bank-pk-grafik",
    status: "published",
    subjectCode: "PK",
    subjectName: "Pengetahuan Kuantitatif",
    title: "Quiz PK: Grafik dan Rasio",
    updatedAt: "Diedit kemarin",
  },
  {
    description: "Paket evaluasi topik kohesi dan koherensi paragraf.",
    href: "/mentor/quiz/quiz-pbm-paragraf",
    id: "quiz-pbm-paragraf",
    primaryMetric: "10 soal",
    progress: 100,
    questionCount: 10,
    resourceType: "quiz",
    sourceBank: "Bank Soal PBM Paragraf",
    sourceBankId: "bank-pbm-paragraf",
    status: "published",
    subjectCode: "PBM",
    subjectName: "Pemahaman Bacaan dan Menulis",
    title: "Quiz PBM: Koherensi Paragraf",
    updatedAt: "Diedit 4 hari lalu",
  },
];

const questionBanks: KaptenQuestionBank[] = [
  {
    description: "Kumpulan 15 soal inferensi untuk quiz dan tryout PU.",
    difficultyMix: "40% sedang, 60% sulit",
    href: "/mentor/quiz/question-bank/bank-pu-inferensi",
    id: "bank-pu-inferensi",
    primaryMetric: "15 soal",
    progress: 78,
    questionCount: 15,
    resourceType: "question-bank",
    reusableIn: ["Quiz PU", "Tryout TPS"],
    status: "draft",
    subjectCode: "PU",
    subjectName: "Penalaran Umum",
    title: "Bank Soal PU Inferensi",
    updatedAt: "Diedit 42 menit lalu",
  },
  {
    description: "Kumpulan 19 soal grafik, rasio, dan perbandingan nilai.",
    difficultyMix: "55% sedang, 45% sulit",
    href: "/mentor/quiz/question-bank/bank-pk-grafik",
    id: "bank-pk-grafik",
    primaryMetric: "19 soal",
    progress: 100,
    questionCount: 19,
    resourceType: "question-bank",
    reusableIn: ["Quiz PK", "Tryout Campuran"],
    status: "published",
    subjectCode: "PK",
    subjectName: "Pengetahuan Kuantitatif",
    title: "Bank Soal PK Grafik",
    updatedAt: "Diedit 2 hari lalu",
  },
  {
    description: "Kumpulan 13 soal kohesi, koherensi, dan gagasan penghubung paragraf.",
    difficultyMix: "50% mudah, 50% sedang",
    href: "/mentor/quiz/question-bank/bank-pbm-paragraf",
    id: "bank-pbm-paragraf",
    primaryMetric: "13 soal",
    progress: 94,
    questionCount: 13,
    resourceType: "question-bank",
    reusableIn: ["Quiz PBM", "Tryout Literasi"],
    status: "published",
    subjectCode: "PBM",
    subjectName: "Pemahaman Bacaan dan Menulis",
    title: "Bank Soal PBM Paragraf",
    updatedAt: "Diedit 3 hari lalu",
  },
];

const bankQuestions: BankQuestion[] = [
  {
    bankId: "bank-pu-inferensi",
    choices: [
      { id: "a", text: "Semua warga kota menggunakan transportasi umum." },
      { id: "b", text: "Sebagian warga kota masih menggunakan kendaraan pribadi." },
      { id: "c", text: "Transportasi umum hanya tersedia pada akhir pekan." },
      { id: "d", text: "Tidak ada warga kota yang bekerja dari rumah." },
    ],
    correctChoiceId: "b",
    difficulty: "medium",
    explanation: "Klaim peningkatan tidak membuktikan bahwa seluruh warga sudah beralih.",
    id: "pu-inferensi-1",
    prompt: "Jumlah pengguna transportasi umum meningkat tahun ini. Simpulan yang paling tepat adalah...",
    subjectCode: "PU",
    tags: ["inferensi", "simpulan"],
  },
  {
    bankId: "bank-pu-inferensi",
    choices: [
      { id: "a", text: "Peneliti selalu keliru." },
      { id: "b", text: "Data baru perlu diperiksa sebelum kesimpulan lama dipertahankan." },
      { id: "c", text: "Kesimpulan lama pasti benar." },
      { id: "d", text: "Semua data baru harus ditolak." },
    ],
    correctChoiceId: "b",
    difficulty: "hard",
    explanation: "Data yang berbeda menuntut pengujian ulang, bukan penolakan otomatis.",
    id: "pu-inferensi-2",
    prompt: "Jika data baru tidak selaras dengan kesimpulan awal, tindakan paling logis adalah...",
    subjectCode: "PU",
    tags: ["argumen", "evaluasi"],
  },
  {
    bankId: "bank-pu-inferensi",
    choices: [
      { id: "a", text: "Hujan turun sepanjang hari." },
      { id: "b", text: "Jalan licin dapat disebabkan oleh hujan." },
      { id: "c", text: "Semua jalan selalu licin." },
      { id: "d", text: "Tidak ada kendaraan yang lewat." },
    ],
    correctChoiceId: "b",
    difficulty: "easy",
    explanation: "Pernyataan tersebut menyatakan hubungan sebab yang mungkin, bukan kepastian berlebihan.",
    id: "pu-inferensi-3",
    prompt: "Manakah pernyataan yang merupakan inferensi wajar dari jalan yang basah dan licin?",
    subjectCode: "PU",
    tags: ["inferensi"],
  },
  {
    bankId: "bank-pk-grafik",
    choices: [
      { id: "a", text: "20%" },
      { id: "b", text: "25%" },
      { id: "c", text: "30%" },
      { id: "d", text: "40%" },
    ],
    correctChoiceId: "b",
    difficulty: "easy",
    explanation: "Kenaikan 20 dari dasar 80 adalah 20/80 atau 25%.",
    id: "pk-grafik-1",
    prompt: "Nilai meningkat dari 80 menjadi 100. Berapa persen kenaikannya?",
    subjectCode: "PK",
    tags: ["persentase", "rasio"],
  },
  {
    bankId: "bank-pk-grafik",
    choices: [
      { id: "a", text: "3 : 5" },
      { id: "b", text: "5 : 3" },
      { id: "c", text: "8 : 3" },
      { id: "d", text: "15 : 8" },
    ],
    correctChoiceId: "a",
    difficulty: "medium",
    explanation: "Rasio 24 : 40 disederhanakan dengan membagi keduanya dengan 8.",
    id: "pk-grafik-2",
    prompt: "Rasio 24 peserta perempuan terhadap 40 peserta laki-laki dalam bentuk paling sederhana adalah...",
    subjectCode: "PK",
    tags: ["rasio"],
  },
  {
    bankId: "bank-pk-grafik",
    choices: [
      { id: "a", text: "12" },
      { id: "b", text: "15" },
      { id: "c", text: "18" },
      { id: "d", text: "20" },
    ],
    correctChoiceId: "c",
    difficulty: "medium",
    explanation: "Jumlah 10, 15, dan 18 adalah 43; 43% dari 100 peserta berarti 43, sehingga sisa 57. Opsi ini menguji pembacaan nilai tertinggi pada grafik.",
    id: "pk-grafik-3",
    prompt: "Pada diagram batang, kategori tertinggi menunjukkan 18 peserta. Nilai kategori tertinggi adalah...",
    subjectCode: "PK",
    tags: ["grafik", "data"],
  },
  {
    bankId: "bank-pbm-paragraf",
    choices: [
      { id: "a", text: "Sebab itu" },
      { id: "b", text: "Namun" },
      { id: "c", text: "Selain itu" },
      { id: "d", text: "Misalnya" },
    ],
    correctChoiceId: "b",
    difficulty: "medium",
    explanation: "Namun menandai pertentangan antara dua gagasan.",
    id: "pbm-paragraf-1",
    prompt: "Pilih konjungsi yang tepat: " +
      "Rani sudah belajar dengan tekun. ..., ia tetap perlu beristirahat cukup.",
    subjectCode: "PBM",
    tags: ["koherensi", "konjungsi"],
  },
  {
    bankId: "bank-pbm-paragraf",
    choices: [
      { id: "a", text: "Kalimat pertama" },
      { id: "b", text: "Kalimat kedua" },
      { id: "c", text: "Kalimat ketiga" },
      { id: "d", text: "Kalimat keempat" },
    ],
    correctChoiceId: "a",
    difficulty: "easy",
    explanation: "Gagasan utama biasanya memuat pernyataan umum yang dijelaskan kalimat berikutnya.",
    id: "pbm-paragraf-2",
    prompt: "Dalam paragraf deduktif, gagasan utama umumnya terletak pada...",
    subjectCode: "PBM",
    tags: ["paragraf", "gagasan utama"],
  },
  {
    bankId: "bank-pbm-paragraf",
    choices: [
      { id: "a", text: "Pengulangan kata kunci secara wajar" },
      { id: "b", text: "Perubahan topik pada setiap kalimat" },
      { id: "c", text: "Penggunaan kalimat tanpa hubungan" },
      { id: "d", text: "Menghapus seluruh kata rujukan" },
    ],
    correctChoiceId: "a",
    difficulty: "medium",
    explanation: "Kohesi dibangun melalui pengulangan wajar, kata rujukan, dan konjungsi.",
    id: "pbm-paragraf-3",
    prompt: "Salah satu cara membangun kohesi paragraf adalah...",
    subjectCode: "PBM",
    tags: ["kohesi", "paragraf"],
  },
];

type SeedQuestionDefinition = {
  choices: [string, string, string, string];
  correctChoiceIndex: number;
  explanation: string;
  isReady?: boolean;
  prompt: string;
};

function seedQuestion(
  prompt: string,
  choices: [string, string, string, string],
  correctChoiceIndex: number,
  explanation: string,
  isReady = true,
): SeedQuestionDefinition {
  return { choices, correctChoiceIndex, explanation, isReady, prompt };
}

const seedQuizQuestions = {
  "quiz-pu-simpulan": [
    seedQuestion("Semua peserta yang lulus latihan rutin mengikuti evaluasi. Raka mengikuti evaluasi. Simpulan yang tepat adalah...", ["Raka pasti lulus latihan rutin.", "Raka mungkin tidak lulus latihan rutin.", "Semua peserta evaluasi lulus latihan rutin.", "Tidak dapat dipastikan apakah Raka lulus latihan rutin."], 3, "Mengikuti evaluasi adalah akibat dari lulus latihan rutin, tetapi tidak membuktikan bahwa setiap peserta evaluasi lulus."),
    seedQuestion("Data menunjukkan waktu baca meningkat setelah ruang baca diperpanjang. Kesimpulan paling hati-hati adalah...", ["Perpanjangan ruang baca mungkin berkaitan dengan peningkatan waktu baca.", "Ruang baca pasti satu-satunya penyebab peningkatan waktu baca.", "Semua siswa membaca lebih lama setiap hari.", "Peningkatan waktu baca tidak membutuhkan data lain."], 0, "Data menunjukkan hubungan waktu, tetapi belum cukup untuk memastikan satu-satunya penyebab."),
    seedQuestion("Jika sebuah argumen memakai satu contoh untuk menyimpulkan semua kasus, kelemahan utamanya adalah...", ["Contohnya selalu salah.", "Generalisasinya terlalu luas dari bukti terbatas.", "Kesimpulannya terlalu pendek.", "Argumennya tidak memakai angka."], 1, "Satu contoh tidak cukup mewakili seluruh populasi atau seluruh kasus."),
    seedQuestion("Pernyataan yang paling memperkuat klaim bahwa diskusi kelompok meningkatkan pemahaman adalah...", ["Siswa yang berdiskusi menunjukkan peningkatan skor dibanding kelompok tanpa diskusi.", "Diskusi kelompok dilakukan di ruang yang lebih besar.", "Sebagian siswa menyukai kerja mandiri.", "Guru menyediakan papan tulis baru."], 0, "Perbandingan hasil belajar dua kelompok secara langsung mendukung klaim tersebut."),
    seedQuestion("Manakah informasi yang paling relevan untuk menguji simpulan tentang kebiasaan belajar siswa?", ["Warna tas yang dipakai siswa.", "Frekuensi dan durasi belajar dari sampel siswa yang representatif.", "Merek alat tulis yang paling populer.", "Jumlah meja di kelas."], 1, "Frekuensi dan durasi belajar merupakan bukti langsung untuk menilai kebiasaan belajar."),
    seedQuestion("Sebuah survei hanya dilakukan pada siswa yang hadir di perpustakaan. Kesimpulan yang tidak dapat langsung diambil adalah...", ["Pengunjung perpustakaan memiliki alasan datang yang beragam.", "Semua siswa di sekolah rajin mengunjungi perpustakaan.", "Survei menggambarkan sebagian pengunjung perpustakaan.", "Data perlu dibatasi pada responden survei."], 1, "Responden hanya pengunjung perpustakaan, sehingga tidak mewakili seluruh siswa."),
    seedQuestion("Jika A menyebabkan B dan B menyebabkan C, pernyataan yang paling aman adalah...", ["A selalu menyebabkan C tanpa pengecualian.", "C pasti menyebabkan A.", "A dapat berkontribusi pada C melalui B.", "A dan C tidak memiliki hubungan."], 2, "Hubungan berantai memungkinkan kontribusi, tetapi tidak cukup untuk menyatakan kepastian mutlak."),
    seedQuestion("Bukti tambahan yang paling melemahkan klaim bahwa nilai naik karena satu metode belajar adalah...", ["Metode belajar digunakan selama satu bulan.", "Kenaikan serupa juga terjadi pada kelompok yang tidak memakai metode tersebut.", "Siswa diberi jadwal belajar.", "Guru menjelaskan metode di awal kelas."], 1, "Jika kelompok tanpa metode juga naik serupa, metode itu bukan penjelasan tunggal yang kuat."),
    seedQuestion("Manakah simpulan yang tidak melampaui informasi pada pernyataan awal?", ["Semua pembaca cepat pasti memahami teks.", "Sebagian peserta yang menyelesaikan latihan mendapat nilai tinggi.", "Tidak ada peserta yang membutuhkan bantuan.", "Latihan adalah satu-satunya cara mendapat nilai tinggi."], 1, "Simpulan tentang sebagian peserta tidak membuat klaim universal atau sebab tunggal.", false),
    seedQuestion("Sebuah grafik menunjukkan korelasi dua variabel. Hal yang belum dapat dipastikan dari grafik itu adalah...", ["Kedua variabel berubah bersama.", "Salah satu variabel menyebabkan perubahan variabel lain.", "Ada pola pada data yang diamati.", "Nilai variabel dapat dibandingkan."], 1, "Korelasi tidak dengan sendirinya membuktikan hubungan sebab-akibat.", false),
    seedQuestion("Pernyataan mana yang merupakan asumsi tersembunyi dalam argumen tentang jadwal belajar pagi?", ["Setiap siswa memiliki kondisi yang sama pada pagi hari.", "Jadwal belajar dapat ditulis di kalender.", "Pagi terjadi sebelum siang.", "Siswa dapat membawa buku ke sekolah."], 0, "Argumen yang menganggap belajar pagi terbaik untuk semua orang mengasumsikan kondisi setiap siswa seragam.", false),
    seedQuestion("Jika sebagian anggota kelompok menyelesaikan tugas lebih cepat, simpulan yang paling tepat adalah...", ["Semua anggota kelompok bekerja dengan kecepatan sama.", "Kelompok pasti menyelesaikan tugas paling cepat.", "Ada perbedaan kecepatan penyelesaian tugas antaranggota.", "Anggota yang lambat tidak mengerjakan tugas."], 2, "Informasi hanya mendukung adanya perbedaan kecepatan, bukan klaim tentang semua anggota.", false),
  ],
  "quiz-pk-rasio": [
    seedQuestion("Sebuah grafik menunjukkan kenaikan peserta dari 40 menjadi 50 orang. Berapa persen kenaikannya?", ["20%", "25%", "40%", "50%"], 1, "Kenaikan 10 dari dasar 40 adalah 10/40 × 100% = 25%."),
    seedQuestion("Rasio buku fiksi dan nonfiksi adalah 18 : 30. Bentuk paling sederhana rasio tersebut adalah...", ["3 : 5", "5 : 3", "6 : 10", "9 : 15"], 0, "Kedua bilangan dibagi 6 sehingga rasionya 3 : 5."),
    seedQuestion("Nilai 72 dari total 90 setara dengan persentase...", ["70%", "72%", "80%", "90%"], 2, "72/90 = 0,8 atau 80%."),
    seedQuestion("Pada diagram batang, penjualan Januari 120 unit dan Februari 150 unit. Selisihnya adalah...", ["20 unit", "25 unit", "30 unit", "35 unit"], 2, "Selisih 150 − 120 adalah 30 unit."),
    seedQuestion("Jika 3 dari 8 bagian diagram diberi warna biru, persentase bagian biru adalah...", ["30%", "37,5%", "40%", "62,5%"], 1, "3/8 × 100% = 37,5%."),
    seedQuestion("Harga sebuah buku didiskon 20% dari Rp75.000. Harga setelah diskon adalah...", ["Rp15.000", "Rp55.000", "Rp60.000", "Rp65.000"], 2, "Diskon 20% adalah Rp15.000, sehingga harga akhirnya Rp60.000."),
    seedQuestion("Rata-rata empat nilai adalah 80. Jika tiga nilai berjumlah 225, nilai keempat adalah...", ["85", "90", "95", "100"], 2, "Total empat nilai 4 × 80 = 320; 320 − 225 = 95."),
    seedQuestion("Tabel menunjukkan rasio siswa laki-laki dan perempuan 5 : 7. Jika totalnya 72, jumlah siswa perempuan adalah...", ["28", "30", "35", "42"], 3, "Jumlah bagian 12, tiap bagian 6; perempuan 7 × 6 = 42."),
    seedQuestion("Sebuah grafik naik dari 200 ke 260. Kenaikannya dalam persen adalah...", ["20%", "25%", "30%", "60%"], 2, "Kenaikan 60 dari 200 adalah 30%."),
    seedQuestion("Nilai 45 merupakan berapa persen dari 180?", ["20%", "25%", "30%", "35%"], 1, "45/180 = 1/4 = 25%."),
    seedQuestion("Jika 12 pekerja menyelesaikan tugas dalam 10 hari, jumlah hari yang diperlukan 15 pekerja dengan laju sama adalah...", ["6 hari", "8 hari", "10 hari", "12 hari"], 1, "Total kerja 120 orang-hari; 120/15 = 8 hari."),
    seedQuestion("Pada diagram lingkaran, sektor 90 derajat mewakili berapa persen data?", ["20%", "25%", "30%", "50%"], 1, "90 dari 360 derajat adalah satu perempat atau 25%."),
    seedQuestion("Perbandingan 0,6 : 1,5 dalam bentuk bilangan bulat paling sederhana adalah...", ["2 : 5", "3 : 5", "4 : 5", "6 : 15"], 0, "Kalikan keduanya dengan 10 menjadi 6 : 15, lalu bagi 3 menjadi 2 : 5."),
    seedQuestion("Harga naik 10% lalu turun 10%. Dibanding harga awal, hasil akhirnya adalah...", ["Tetap sama", "Naik 1%", "Turun 1%", "Turun 10%"], 2, "Misal harga 100 menjadi 110 lalu 99, sehingga turun 1% dari harga awal."),
    seedQuestion("Grafik menunjukkan 24 dari 60 siswa memilih opsi A. Persentase pemilih opsi A adalah...", ["30%", "35%", "40%", "45%"], 2, "24/60 = 0,4 atau 40%.", false),
    seedQuestion("Sebuah rasio 4 : 9 memiliki jumlah bagian 13. Jika total nilai 156, bagian yang mewakili 9 adalah...", ["48", "72", "96", "108"], 3, "Satu bagian bernilai 156/13 = 12, maka 9 bagian bernilai 108.", false),
  ],
  "quiz-pbm-paragraf": [
    seedQuestion("Pilih kalimat yang paling tepat sebagai gagasan utama paragraf tentang kebiasaan membaca.", ["Membaca rutin memperluas pengetahuan dan melatih daya pikir.", "Perpustakaan dibuka pukul tujuh pagi.", "Buku baru diletakkan di rak depan.", "Siswa membawa tas ke kelas."], 0, "Gagasan utama menyatakan pokok pembahasan yang dapat dijelaskan oleh kalimat lain."),
    seedQuestion("Konjungsi yang tepat untuk menghubungkan dua gagasan yang bertentangan adalah...", ["Selain itu", "Namun", "Karena", "Misalnya"], 1, "Namun digunakan untuk menyatakan pertentangan."),
    seedQuestion("Kalimat penjelas yang paling mendukung gagasan utama tentang perpustakaan sekolah adalah...", ["Perpustakaan menyediakan koleksi yang membantu siswa mencari sumber belajar.", "Gedung sekolah memiliki pagar berwarna hijau.", "Bel berbunyi sebelum pelajaran dimulai.", "Lapangan digunakan untuk upacara."], 0, "Kalimat tersebut langsung menjelaskan manfaat perpustakaan sebagai sumber belajar."),
    seedQuestion("Kata rujukan yang tepat untuk menggantikan frasa 'program literasi sekolah' adalah...", ["mereka", "itu", "kami", "kapan"], 1, "Kata 'itu' dapat merujuk pada benda atau program yang telah disebutkan."),
    seedQuestion("Urutan kalimat yang paling koheren untuk membentuk paragraf eksposisi adalah...", ["gagasan utama, penjelasan, contoh, simpulan", "contoh, simpulan, judul, salam", "simpulan, pertanyaan, angka, judul", "salam, contoh, daftar, penutup"], 0, "Paragraf eksposisi yang padu biasanya berkembang dari gagasan utama ke penjelasan dan contoh."),
    seedQuestion("Manakah kalimat yang tidak padu dengan topik manfaat membaca buku nonfiksi?", ["Buku nonfiksi membantu pembaca memahami fakta.", "Membaca nonfiksi menambah wawasan tentang suatu topik.", "Harga sepatu olahraga berubah setiap bulan.", "Informasi dalam nonfiksi dapat menjadi bahan diskusi."], 2, "Kalimat tentang harga sepatu tidak terkait dengan manfaat membaca nonfiksi."),
    seedQuestion("Pernyataan yang menunjukkan hubungan sebab-akibat dalam paragraf adalah...", ["Karena hujan deras, pertandingan ditunda.", "Pertandingan dan hujan terjadi pada hari yang sama.", "Pertandingan dimulai pukul tiga sore.", "Pemain membawa seragam cadangan."], 0, "Kata 'karena' menandai sebab dan akibat secara jelas."),
    seedQuestion("Pilih perbaikan kalimat agar penggunaan konjungsinya lebih efektif.", ["Rina belajar tekun, tetapi nilainya meningkat.", "Rina belajar tekun sehingga nilainya meningkat.", "Rina belajar tekun namun karena nilainya meningkat.", "Rina belajar tekun atau nilainya meningkat."], 1, "Konjungsi 'sehingga' tepat untuk menyatakan akibat dari belajar tekun."),
    seedQuestion("Kalimat simpulan yang tepat untuk paragraf tentang kegiatan diskusi kelas adalah...", ["Dengan demikian, diskusi kelas membantu siswa menimbang berbagai sudut pandang.", "Diskusi dimulai pada hari Senin pukul delapan.", "Setiap kelompok duduk melingkar di kelas.", "Guru membawa spidol berwarna biru."], 0, "Simpulan merangkum gagasan utama paragraf, bukan detail pelaksanaan."),
    seedQuestion("Pengulangan kata kunci yang paling wajar untuk menjaga kohesi paragraf adalah...", ["Membaca melatih fokus. Kebiasaan membaca juga memperkaya kosakata.", "Membaca melatih fokus. Sepeda itu berwarna merah.", "Membaca melatih fokus. Kemarin hujan deras.", "Membaca melatih fokus. Namun, namun, namun."], 0, "Pengulangan kata kunci secara wajar menjaga hubungan antarkalimat."),
  ],
} satisfies Record<string, SeedQuestionDefinition[]>;

const seedInventorySources = [
  {
    bankId: "bank-pu-inferensi",
    difficulty: "medium" as const,
    quizId: "quiz-pu-simpulan",
    subjectCode: "PU",
    tags: ["inferensi", "simpulan"],
  },
  {
    bankId: "bank-pk-grafik",
    difficulty: "medium" as const,
    quizId: "quiz-pk-rasio",
    subjectCode: "PK",
    tags: ["rasio", "kuantitatif"],
  },
  {
    bankId: "bank-pbm-paragraf",
    difficulty: "medium" as const,
    quizId: "quiz-pbm-paragraf",
    subjectCode: "PBM",
    tags: ["paragraf", "koherensi"],
  },
] as const;

for (const source of seedInventorySources) {
  bankQuestions.push(
    ...seedQuizQuestions[source.quizId].map((question, index) => ({
      bankId: source.bankId,
      choices: question.choices.map((text, choiceIndex) => ({
        id: String.fromCharCode(97 + choiceIndex),
        text,
      })),
      correctChoiceId: String.fromCharCode(97 + question.correctChoiceIndex),
      difficulty: source.difficulty,
      explanation: question.explanation,
      id: `${source.bankId}-inventory-${index + 1}`,
      prompt: question.prompt,
      subjectCode: source.subjectCode,
      tags: [...source.tags],
    })),
  );
}

function createSeedQuizSnapshots(
  quizId: string,
  bankId: string,
  questions: SeedQuestionDefinition[],
): QuizQuestionSnapshot[] {
  return questions.map((question, index) => {
    const choices = question.choices.map((text, choiceIndex) => ({
      id: String.fromCharCode(97 + choiceIndex),
      text,
    }));

    return {
      choices,
      correctChoiceId: choices[question.correctChoiceIndex]?.id ?? "a",
      explanation: question.explanation,
      id: `${quizId}-snapshot-${index + 1}`,
      isReady: question.isReady,
      origin: "bank",
      prompt: question.prompt,
      sourceQuestionId: `${bankId}-inventory-${index + 1}`,
    };
  });
}

const seedQuizContent: Record<
  string,
  { questions: QuizQuestionSnapshot[] }
> = {
  "quiz-pu-simpulan": {
    questions: createSeedQuizSnapshots(
      "quiz-pu-simpulan",
      "bank-pu-inferensi",
      seedQuizQuestions["quiz-pu-simpulan"],
    ),
  },
  "quiz-pk-rasio": {
    questions: createSeedQuizSnapshots(
      "quiz-pk-rasio",
      "bank-pk-grafik",
      seedQuizQuestions["quiz-pk-rasio"],
    ),
  },
  "quiz-pbm-paragraf": {
    questions: createSeedQuizSnapshots(
      "quiz-pbm-paragraf",
      "bank-pbm-paragraf",
      seedQuizQuestions["quiz-pbm-paragraf"],
    ),
  },
};

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
  tryouts[0],
  quizzes[0],
  questionBanks[0],
];

const scheduledPublications: KaptenResource[] = [
  quizzes[1],
  tryouts[1],
];

const allResources: KaptenResource[] = [
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
    href: "/mentor/quiz/quiz-pk-rasio",
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
    description: "Satu video lesson untuk setiap Materi.",
    href: "/mentor/materi/create",
    icon: Video,
    label: "Materi",
  },
  {
    description: "Kuis singkat dari question bank",
    href: "/mentor/quiz/create",
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
    href: "/mentor/quiz/question-bank/create",
    icon: FileQuestion,
    label: "Bank Soal",
  },
];

const contentTypeMeta: Record<
  KaptenResourceType,
  { icon: LucideIcon; label: string }
> = {
  materi: { icon: BookOpenText, label: "Materi" },
  media: { icon: ImageIcon, label: "Media" },
  quiz: { icon: ListChecks, label: "Quiz" },
  "question-bank": { icon: LibraryBig, label: "Bank Soal" },
  tryout: { icon: Gauge, label: "Tryout" },
};

const statusLabels: Record<KaptenContentStatus, string> = {
  archived: "Diarsipkan",
  draft: "Draf",
  published: "Diterbitkan",
  scheduled: "Terjadwal",
};

function getQuizById(id: string) {
  return quizzes.find((item) => item.id === id) ?? null;
}

function getSeedQuizContent(quizId: string | undefined) {
  return quizId ? seedQuizContent[quizId] ?? null : null;
}

export {
  allResources,
  bankQuestions,
  contentTypeMeta,
  getQuizById,
  getSeedQuizContent,
  kaptenNotificationItems,
  kaptenSubjects,
  mediaAssets,
  questionBanks,
  quickCreateItems,
  quizzes,
  recentlyEdited,
  scheduledPublications,
  statusLabels,
  tryouts,
};

export type {
  BankQuestion,
  KaptenContentStatus,
  KaptenMediaAsset,
  KaptenNotificationItem,
  KaptenQuestionBank,
  KaptenQuiz,
  KaptenResource,
  KaptenResourceType,
  KaptenSubject,
  KaptenTryout,
};

import type { Item } from "@/components/ui/accordion";
import type { RadioPillOption } from "@/components/ui/radio-pill-group";

export type NavItem = {
  href: string;
  label: string;
};

export type ProgramCardTone = "accent" | "dark" | "light";
export type ProgramCardChipTone = "accent" | "white";

export type ProgramCardData = {
  art: string;
  artAlt: string;
  chipTone: ProgramCardChipTone;
  href: string;
  title: [string, string];
  tone: ProgramCardTone;
};

export type JourneyStat = {
  label: string;
  suffix?: string;
  value: number;
};

export type VoyagePrinciple = {
  body: string;
  title: string;
};

export type PathwayTone = "deep" | "soft" | "paper" | "emerald";

export type Pathway = {
  art: string;
  artAlt: string;
  details: [string, string];
  id: string;
  kicker: string;
  outcome: string;
  summary: string;
  title: string;
  tone: PathwayTone;
};

export type SupportPillar = {
  body: string;
  title: string;
};

export type StudentProfile = {
  body: string;
  title: string;
};

export type CampusOutcome = {
  campus: string;
  markAlt: string;
  markSrc: string;
  programs: string[];
  result: string;
};

export type CrewMember = {
  blurb: string;
  campus: string;
  campusMarkAlt?: string;
  campusMarkSrc?: string;
  focus: string;
  fullName?: string;
  gpa?: string;
  id: string;
  isEmpty?: boolean;
  major?: string;
  name: string;
  photoAlt: string;
  photoSrc: string;
  profileAchievements?: string[];
  university?: string;
  utbkScore?: string;
};

export type Testimonial = {
  avatarAlt: string;
  avatarSrc: string;
  meta: string;
  name: string;
  outcome: string;
  quote: string;
  university: string;
  universityMarkAlt?: string;
  universityMarkSrc?: string;
};

export type AcceptanceResult = {
  campus: string;
  major: string;
  photoAlt: string;
  photoSrc: string;
  scoreDelta: string;
  student: string;
  year: string;
};

export type CampusCrewMark = {
  markAlt: string;
  markSrc: string;
  name: string;
};

export const marketingNavItems: NavItem[] = [
  { label: "About Us", href: "/#about" },
  { label: "Program", href: "/#program" },
  { label: "Login", href: "/login" },
];

export const footerItems: NavItem[] = [
  { label: "About Us", href: "/#about" },
  { label: "Program", href: "/#program" },
  { label: "Login", href: "/login" },
];

export const journeyStats: JourneyStat[] = [
  { value: 15000, suffix: "+", label: "Voyager" },
  { value: 4, suffix: " Tahun", label: "Perjalanan Berlayar" },
  { value: 1000, suffix: "+", label: "Voyager Berhasil" },
];

export const campusCrewMarks: CampusCrewMark[] = [
  {
    name: "ITB",
    markSrc: "/brand/campuses/itb.svg",
    markAlt: "Institut Teknologi Bandung mark",
  },
  {
    name: "UI",
    markSrc: "/brand/campuses/ui.png",
    markAlt: "Universitas Indonesia mark",
  },
  {
    name: "Unpad",
    markSrc: "/brand/campuses/unpad.png",
    markAlt: "Universitas Padjadjaran mark",
  },
  {
    name: "UGM",
    markSrc: "/brand/campuses/ugm.png",
    markAlt: "Universitas Gadjah Mada mark",
  },
  {
    name: "UPN",
    markSrc: "/brand/campuses/upn.png",
    markAlt: "Universitas Pembangunan Nasional Veteran Jakarta mark",
  },
  {
    name: "Unair",
    markSrc: "/brand/campuses/unair.png",
    markAlt: "Universitas Airlangga mark",
  },
];

export const voyagePrinciples: VoyagePrinciple[] = [
  {
    title: "Fundamental",
    body: "Fondasi konsep dibuat kuat sebelum masuk ke latihan berat.",
  },
  {
    title: "Konsisten",
    body: "Ritme belajar dijaga agar Voyager tetap bergerak setiap minggu.",
  },
  {
    title: "Disiplin",
    body: "Kebiasaan belajar dibangun sampai hari ujian tiba.",
  },
];

export const pathways: Pathway[] = [
  {
    id: "summer-class",
    kicker: "01",
    title: "Summer Class",
    summary: "Jaga momentum saat liburan.",
    outcome: "Holiday Expedition",
    details: [
      "Latihan terarah selama masa liburan.",
      "Cocok untuk kelas 10 dan 11 yang ingin mulai lebih awal.",
    ],
    art: "/landing-assets/program-foundation.svg",
    artAlt: "Ilustrasi program fondasi",
    tone: "paper",
  },
  {
    id: "supercharge-snbt",
    kicker: "02",
    title: "Supercharge TKA & SNBT",
    summary: "Kelas, peta belajar, dan latihan untuk SNBT dan TKA.",
    outcome: "Ocean Mission",
    details: [
      "Live class dan latihan berkala.",
      "Struktur belajar yang mudah diikuti.",
    ],
    art: "/landing-assets/program-weekly.svg",
    artAlt: "Ilustrasi persiapan SNBT",
    tone: "deep",
  },
  {
    id: "supercharge-mandiri",
    kicker: "03",
    title: "Supercharge Ujian Mandiri",
    summary: "Persiapan akhir menuju ujian mandiri PTN.",
    outcome: "Last Call Mission",
    details: [
      "Fokus pada strategi dan kesiapan akhir.",
      "Dirancang untuk fase menjelang ujian.",
    ],
    art: "/landing-assets/program-drill.svg",
    artAlt: "Ilustrasi persiapan ujian mandiri",
    tone: "soft",
  },
  {
    id: "private-mentoring",
    kicker: "04",
    title: "One on One",
    summary: "Pendampingan personal sesuai target dan ritme belajar.",
    outcome: "Private Navigator",
    details: [
      "Pendampingan personal sesuai kebutuhan.",
      "Cocok untuk Voyager yang butuh perhatian penuh.",
    ],
    art: "/landing-assets/program-consultation.svg",
    artAlt: "Ilustrasi mentoring pribadi",
    tone: "emerald",
  },
];

export const supportPillars: SupportPillar[] = [
  {
    title: "Peta belajar jelas",
    body: "Materi disusun agar siswa tahu apa yang harus dikuasai dan kapan harus mengulang.",
  },
  {
    title: "Ritme yang terjaga",
    body: "Belajar dibuat konsisten dengan jadwal, latihan, dan pengingat yang realistis.",
  },
  {
    title: "Kru yang mendampingi",
    body: "Tutor membantu siswa memahami proses, bukan sekadar memberi materi tambahan.",
  },
];

export const studentProfiles: StudentProfile[] = [
  {
    title: "Siswa dengan jadwal sekolah padat",
    body: "Belajar dibuat realistis agar tetap berjalan di tengah tugas, ujian sekolah, dan kegiatan harian.",
  },
  {
    title: "Siswa yang skor tryout-nya belum bergerak",
    body: "Kami bantu membaca pola kelemahan dan mengubahnya menjadi latihan yang lebih terarah.",
  },
  {
    title: "Siswa yang butuh ritme personal",
    body: "Pendampingan disesuaikan dengan pace, target, dan tantangan belajar masing-masing Voyager.",
  },
];

export const campusOutcomes: CampusOutcome[] = [
  {
    campus: "Institut Teknologi Bandung",
    result: "Tujuan untuk Voyager yang mengejar rumpun teknik, arsitektur, dan sains terapan.",
    programs: ["FTI RI", "SAPPK"],
    markSrc: "/brand/campuses/itb.svg",
    markAlt: "Institut Teknologi Bandung mark",
  },
  {
    campus: "Universitas Indonesia",
    result: "Pilihan banyak Voyager untuk bidang kesehatan, sosial, humaniora, dan sains.",
    programs: ["Kedokteran Gigi", "Psikologi"],
    markSrc: "/brand/campuses/ui.png",
    markAlt: "Universitas Indonesia mark",
  },
  {
    campus: "Universitas Padjadjaran",
    result: "Destinasi untuk Voyager yang menyiapkan jurusan kompetitif secara bertahap.",
    programs: ["Kedokteran", "Hukum"],
    markSrc: "/brand/campuses/unpad.png",
    markAlt: "Universitas Padjadjaran mark",
  },
  {
    campus: "Rute PTN lainnya",
    result: "Perjalanan juga terbuka menuju ITS, Unair, UGM, UPN, dan PTN unggulan lain.",
    programs: ["ITS", "Unair"],
    markSrc: "/brand/campuses/unair.png",
    markAlt: "Universitas Airlangga mark for additional destination routes",
  },
];

export const acceptanceResults: AcceptanceResult[] = [
  {
    student: "Voyager STEM",
    campus: "PTN bidang sains dan teknologi",
    major: "Kedokteran, teknik, sains, dan rumpun teknologi",
    year: "STEM",
    scoreDelta: "Cerita perjalanan dari target besar menuju hasil yang nyata",
    photoSrc: "/landing-assets/avatar-placeholder.png",
    photoAlt: "Placeholder avatar untuk Voyager STEM",
  },
  {
    student: "Voyager SHARE",
    campus: "PTN bidang sosial dan humaniora",
    major: "Psikologi, hukum, hubungan internasional, dan rumpun sosial",
    year: "SHARE",
    scoreDelta: "Belajar lebih terarah sampai pilihan jurusan terasa lebih dekat",
    photoSrc: "/landing-assets/avatar-placeholder.png",
    photoAlt: "Placeholder avatar untuk Voyager SHARE",
  },
  {
    student: "Alumni Summer Class",
    campus: "Berbagai PTN unggulan",
    major: "Fondasi kelas 10 dan 11 untuk persiapan yang lebih panjang",
    year: "2027",
    scoreDelta: "Momentum liburan diubah menjadi langkah awal yang konsisten",
    photoSrc: "/landing-assets/avatar-placeholder.png",
    photoAlt: "Placeholder avatar untuk Alumni Summer Class",
  },
];

export const crewMembers: CrewMember[] = [
  {
    id: "mufli",
    name: "Kak Mufli",
    fullName: "Abdulah Muflih R.",
    campus: "ITB",
    university: "Institut Teknologi Bandung (ITB)",
    campusMarkSrc: "/brand/campuses/itb.svg",
    campusMarkAlt: "Institut Teknologi Bandung mark",
    major: "Arsitektur",
    focus: "Arsitektur",
    utbkScore: "700",
    gpa: "3.80",
    blurb: "Membantu Voyager membangun cara berpikir runtut dari konsep dasar sampai strategi soal.",
    photoSrc: "/landing-assets/mentors/Mufli.png",
    photoAlt: "Foto Kak Mufli, tutor Arsitektur Vecalss",
    profileAchievements: [
      "Penerima Luar Biasa Scholarship, Batch 14",
      "Penerima IA Qatar ITB Scholarship",
    ],
  },
  {
    id: "mira",
    name: "Kak Mira",
    fullName: "Mira Izzati",
    campus: "UPN Veteran Jakarta",
    university: "UPN Veteran Jakarta",
    campusMarkSrc: "/brand/campuses/upn.png",
    campusMarkAlt: "Universitas Pembangunan Nasional Veteran Jakarta mark",
    major: "Kedokteran",
    focus: "Kedokteran",
    utbkScore: "-",
    gpa: "3.70",
    blurb: "Mendampingi siswa yang perlu disiplin belajar tinggi untuk target jurusan kompetitif.",
    photoSrc: "/landing-assets/mentors/Mira.png",
    photoAlt: "Foto Kak Mira, tutor Kedokteran Vecalss",
    profileAchievements: [
      "Berpartisipasi dalam submit nasional PKM-RS (2024)",
      "Berpartisipasi dalam submit nasional PKM-VGK (2025)",
    ],
  },
  {
    id: "adit",
    name: "Kak Adit",
    fullName: "Lorem ipsum dolor sit amet",
    campus: "Informasi kampus menyusul",
    university: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    major: "Lorem ipsum major",
    focus: "Lorem ipsum focus",
    utbkScore: "Lorem ipsum",
    gpa: "Lorem ipsum",
    blurb: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Profil tutor lengkap akan diperbarui setelah data resmi tersedia.",
    photoSrc: "/landing-assets/mentors/Adit.png",
    photoAlt: "Foto Kak Adit, tutor Vecalss",
    profileAchievements: [
      "Lorem ipsum dolor sit amet.",
      "Consectetur adipiscing elit sementara.",
    ],
  },
  {
    id: "dhini",
    name: "Kak Dhini",
    fullName: "Lorem ipsum dolor sit amet",
    campus: "Informasi kampus menyusul",
    university: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    major: "Lorem ipsum major",
    focus: "Lorem ipsum focus",
    utbkScore: "Lorem ipsum",
    gpa: "Lorem ipsum",
    blurb: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Profil tutor lengkap akan diperbarui setelah data resmi tersedia.",
    photoSrc: "/landing-assets/mentors/Dhini.png",
    photoAlt: "Foto Kak Dhini, tutor Vecalss",
    profileAchievements: [
      "Lorem ipsum dolor sit amet.",
      "Consectetur adipiscing elit sementara.",
    ],
  },
  {
    id: "nauval",
    name: "Kak Nauval",
    fullName: "Lorem ipsum dolor sit amet",
    campus: "Informasi kampus menyusul",
    university: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    major: "Lorem ipsum major",
    focus: "Lorem ipsum focus",
    utbkScore: "Lorem ipsum",
    gpa: "Lorem ipsum",
    blurb: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Profil tutor lengkap akan diperbarui setelah data resmi tersedia.",
    photoSrc: "/landing-assets/mentors/Nauval.png",
    photoAlt: "Foto Kak Nauval, tutor Vecalss",
    profileAchievements: [
      "Lorem ipsum dolor sit amet.",
      "Consectetur adipiscing elit sementara.",
    ],
  },
  {
    id: "kaori",
    name: "Kak Kaori",
    fullName: "Phonna Kaori E.",
    campus: "UPN Veteran Jakarta",
    university: "UPN Veteran Jakarta",
    campusMarkSrc: "/brand/campuses/upn.png",
    campusMarkAlt: "Universitas Pembangunan Nasional Veteran Jakarta mark",
    major: "Kedokteran",
    focus: "Kedokteran",
    utbkScore: "704.85",
    gpa: "3.60",
    blurb: "Mendampingi Voyager membangun disiplin belajar untuk target jurusan kompetitif.",
    photoSrc: "/landing-assets/mentors/Kaori.png",
    photoAlt: "Foto Kak Kaori, tutor Kedokteran Vecalss",
    profileAchievements: [
      "Berpartisipasi dalam submit nasional PKM-VGK (2025)",
      "Berpartisipasi dalam submit internasional Pre-Conference Competition AMSC (2025)",
    ],
  },
  {
    id: "abi",
    name: "Kak Abi",
    fullName: "Abizar Diaz Ulhaq",
    campus: "ITB",
    university: "Institut Teknologi Bandung (ITB)",
    campusMarkSrc: "/brand/campuses/itb.svg",
    campusMarkAlt: "Institut Teknologi Bandung mark",
    major: "Sistem Tenaga Listrik",
    focus: "Sistem Tenaga Listrik",
    utbkScore: "718",
    gpa: "3.05",
    blurb: "Membawa pendekatan analitis dan terstruktur untuk membantu Voyager menaklukkan konsep sulit.",
    photoSrc: "/landing-assets/mentors/Abi.png",
    photoAlt: "Foto Kak Abi, tutor Sistem Tenaga Listrik Vecalss",
    profileAchievements: [
      "Juara 1 INVATION: Product Design (Airnology 3.0, Universitas Airlangga, 2024)",
      "Juara 3 O2SN Kota Tangerang (2022)",
    ],
  },
  {
    id: "nadiv",
    name: "Kak Nadiv",
    fullName: "Lorem ipsum dolor sit amet",
    campus: "Informasi kampus menyusul",
    university: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    major: "Lorem ipsum major",
    focus: "Lorem ipsum focus",
    utbkScore: "Lorem ipsum",
    gpa: "Lorem ipsum",
    blurb: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Profil tutor lengkap akan diperbarui setelah data resmi tersedia.",
    photoSrc: "/landing-assets/mentors/Nadiv.png",
    photoAlt: "Foto Kak Nadiv, tutor Vecalss",
    profileAchievements: [
      "Lorem ipsum dolor sit amet.",
      "Consectetur adipiscing elit sementara.",
    ],
  },
  {
    id: "nicho",
    name: "Kak Nicho",
    fullName: "Lorem ipsum dolor sit amet",
    campus: "Informasi kampus menyusul",
    university: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    major: "Lorem ipsum major",
    focus: "Lorem ipsum focus",
    utbkScore: "Lorem ipsum",
    gpa: "Lorem ipsum",
    blurb: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Profil tutor lengkap akan diperbarui setelah data resmi tersedia.",
    photoSrc: "/landing-assets/mentors/Nicho.png",
    photoAlt: "Foto Kak Nicho, tutor Vecalss",
    profileAchievements: [
      "Lorem ipsum dolor sit amet.",
      "Consectetur adipiscing elit sementara.",
    ],
  },
];

export const testimonials: Testimonial[] = [
  {
    name: "Ayesha",
    meta: "Kedokteran Universitas Padjadjaran",
    outcome: "Terbantu",
    quote: "Selama aku di Vecalss, ngerasa terbantu karena bahan ajarnya lengkap dari recording zoomnya yang bisa diakses kalau berhalangan hadir. Tutornya juga so fun dan penjelasannya oke banget!",
    university: "Universitas Padjadjaran",
    universityMarkSrc: "/brand/campuses/unpad.png",
    universityMarkAlt: "Universitas Padjadjaran mark",
    avatarSrc: "/landing-assets/testimonials/Ayesha.png",
    avatarAlt: "Foto Ayesha, alumni Kedokteran Universitas Padjadjaran",
  },
  {
    name: "Tiara",
    meta: "Psikologi UNAND",
    outcome: "Terbantu",
    quote: "Jujur TO Vecalss ngebantu banget, terutama di PU yang tipe soalnya mirip sama yang keluar di ujian.",
    university: "Universitas Andalas",
    avatarSrc: "/landing-assets/testimonials/Tiara.png",
    avatarAlt: "Foto Tiara, alumni Psikologi UNAND",
  },
  {
    name: "Vertika",
    meta: "Hukum UNS",
    outcome: "Terbantu",
    quote: "Ngebantu banget, apalagi tryout dan quiz-nya jadi acuan buat tau bagian mana yang masih harus dibenerin.",
    university: "Universitas Sebelas Maret",
    avatarSrc: "/landing-assets/testimonials/Vertika.png",
    avatarAlt: "Foto Vertika, alumni Hukum UNS",
  },
  {
    name: "Naila",
    meta: "Sosiologi UNAIR",
    outcome: "Terbantu",
    quote: "Banget! Belajarku jadi lebih terarah dan nggak berasa sendirian karena ada community yang selalu nemenin prosesnya.",
    university: "Universitas Airlangga",
    universityMarkSrc: "/brand/campuses/unair.png",
    universityMarkAlt: "Universitas Airlangga mark",
    avatarSrc: "/landing-assets/testimonials/Naila.png",
    avatarAlt: "Foto Naila, alumni Sosiologi UNAIR",
  },
  {
    name: "Housen",
    meta: "Administrasi Perkantoran UI",
    outcome: "Terbantu",
    quote: "YES banget! Di waktu yang mepet pun materi-materinya masih bisa dipahami dengan baik berkat mentor dan kelas-kelasnya.",
    university: "Universitas Indonesia",
    universityMarkSrc: "/brand/campuses/ui.png",
    universityMarkAlt: "Universitas Indonesia mark",
    avatarSrc: "/landing-assets/testimonials/Housen.png",
    avatarAlt: "Foto Housen, alumni Administrasi Perkantoran UI",
  },
  {
    name: "Sheren",
    meta: "Geologi UI",
    outcome: "Terbantu",
    quote: "Ngebantu banget! Jadi nggak bingung harus mulai belajar dari mana karena semuanya udah lebih terarah.",
    university: "Universitas Indonesia",
    universityMarkSrc: "/brand/campuses/ui.png",
    universityMarkAlt: "Universitas Indonesia mark",
    avatarSrc: "/landing-assets/testimonials/Sheren.png",
    avatarAlt: "Foto Sheren, alumni Geologi UI",
  },
  {
    name: "Decky",
    meta: "Teknik Lepas Pantai ITS",
    outcome: "Terbantu",
    quote: "Jujur terbantu parah, terutama buat materi yang sebelumnya masih jadi kelemahanku.",
    university: "Institut Teknologi Sepuluh Nopember",
    avatarSrc: "/landing-assets/testimonials/Decky.png",
    avatarAlt: "Foto Decky, alumni Teknik Lepas Pantai ITS",
  },
  {
    name: "Rara",
    meta: "Sistem Informasi ITS",
    outcome: "Terbantu",
    quote: "Bangettt, belajar jadi lebih seru karena tutor dan community-nya sama-sama suportif.",
    university: "Institut Teknologi Sepuluh Nopember",
    avatarSrc: "/landing-assets/testimonials/Rara.png",
    avatarAlt: "Foto Rara, alumni Sistem Informasi ITS",
  },
  {
    name: "Ayesha",
    meta: "Kedokteran UNPAD",
    outcome: "Terbantu",
    quote: "Iyaa banget! Materinya lengkap, soal-soalnya banyak, jadi lebih enak buat latihan terus.",
    university: "Universitas Padjadjaran",
    universityMarkSrc: "/brand/campuses/unpad.png",
    universityMarkAlt: "Universitas Padjadjaran mark",
    avatarSrc: "/landing-assets/testimonials/Ayesha.png",
    avatarAlt: "Foto Ayesha, alumni Kedokteran UNPAD",
  },
];

export const faqItems: Item[] = [
  {
    id: "1",
    number: "01",
    question: "Vecalss itu full online atau ada offline-nya?",
    answer:
      "Vecalss 100% online, sehingga Voyager dari berbagai kota bisa belajar bersama tanpa batas lokasi.",
  },
  {
    id: "2",
    number: "02",
    question: "Program apa saja yang tersedia di Vecalss?",
    answer:
      "Ada Summer Class, Supercharge TKA & SNBT, Supercharge Ujian Mandiri, dan One on One.",
  },
  {
    id: "3",
    number: "03",
    question: "Siapa saja tutor di Vecalss?",
    answer:
      "Tutor Vecalss berasal dari UI, ITB, UGM, dan PTN unggulan lainnya.",
  },
  {
    id: "4",
    number: "04",
    question: "Apakah ada rekaman kalau tidak bisa hadir?",
    answer:
      "Ada. Sesi dapat ditonton ulang agar tidak ada Voyager yang tertinggal.",
  },
  {
    id: "5",
    number: "05",
    question: "Cocok untuk siswa kelas berapa?",
    answer:
      "Cocok untuk kelas 10, 11, 12, gap year, dan semi gap.",
  },
  {
    id: "6",
    number: "06",
    question: "Apakah ada komunitas setelah bergabung?",
    answer:
      "Ya. Voyager bergabung ke komunitas untuk berbagi strategi dan saling mendukung.",
  },
  {
    id: "7",
    number: "07",
    question: "Bagaimana cara mulai bergabung?",
    answer:
      "Kamu bisa mulai dari linktr.ee/vecalss.academy untuk melihat program yang sedang berjalan.",
  },
];

export const contactTopicOptions: readonly RadioPillOption<"quote" | "say-hi">[] = [
  { label: "Tanya program", value: "say-hi" },
  { label: "Mentoring pribadi", value: "quote" },
];

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
  quote?: string;
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
    summary: "Jaga ritme belajar selama liburan.",
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
    summary: "Kelas dan latihan terarah untuk SNBT dan TKA.",
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
    id: "tryout",
    kicker: "03",
    title: "Tryout",
    summary: "Ukur kesiapan lewat simulasi dan evaluasi.",
    outcome: "Exam Readiness Check",
    details: [
      "Simulasi mengikuti ritme ujian sesungguhnya.",
      "Hasil membantu menentukan fokus belajar berikutnya.",
    ],
    art: "/landing-assets/program-drill.svg",
    artAlt: "Ilustrasi simulasi tryout",
    tone: "soft",
  },
  {
    id: "vera-ai",
    kicker: "04",
    title: "Vera AI",
    summary: "Ringkas, berlatih, lalu tentukan langkah berikutnya.",
    outcome: "Adaptive Study Companion",
    details: [
      "Percakapan belajar tetap terhubung dengan aktivitasmu.",
      "Rekomendasi membantu menjaga arah perjalanan.",
    ],
    art: "/landing-assets/program-consultation.svg",
    artAlt: "Ilustrasi asisten belajar Vera AI",
    tone: "emerald",
  },
  {
    id: "materi-snbt",
    kicker: "05",
    title: "Materi SNBT",
    summary: "Kuasai konsep inti SNBT dari dasar.",
    outcome: "SNBT Knowledge Base",
    details: [
      "Konsep disusun dalam urutan yang mudah diikuti.",
      "Materi terhubung dengan kuis dan latihan.",
    ],
    art: "/landing-assets/program-stopwatch.svg",
    artAlt: "Ilustrasi materi belajar SNBT",
    tone: "paper",
  },
];

export const crewMembers: CrewMember[] = [
  {
    id: "mufli",
    name: "Kak Mufli",
    fullName: "Abdulah Muflih Rhamadani",
    campus: "ITB",
    university: "Institut Teknologi Bandung (ITB)",
    campusMarkSrc: "/brand/campuses/itb.svg",
    campusMarkAlt: "Institut Teknologi Bandung mark",
    major: "Arsitektur",
    focus: "Arsitektur",
    utbkScore: "700",
    gpa: "3.80",
    blurb: "Mahasiswa Arsitektur ITB yang aktif di bidang pendidikan, mentoring, organisasi kampus, dan pengembangan konten edukasi.",
    photoSrc: "/landing-assets/mentors/Mufli.png",
    photoAlt: "Foto Kak Mufli, tutor Arsitektur Vecalss",
    profileAchievements: [
      "Penerima Luar Biasa Scholarship, Batch 14",
      "Penerima IA Qatar ITB Scholarship",
    ],
    quote: "Live as if you were to die tomorrow. Learn as if you were to live forever.",
  },
  {
    id: "mira",
    name: "Kak Mira",
    fullName: "Mira Izzati",
    campus: "UPN Veteran Jakarta",
    university: "UPN Veteran Jakarta (UPNVJ)",
    campusMarkSrc: "/brand/campuses/upn.png",
    campusMarkAlt: "Universitas Pembangunan Nasional Veteran Jakarta mark",
    major: "Kedokteran",
    focus: "Kedokteran",
    utbkScore: "686.7",
    gpa: "3.70",
    blurb: "Mahasiswa Kedokteran UPNVJ yang aktif sebagai tutor dan relawan, dengan minat pada pembelajaran, penelitian, dan pengabdian masyarakat.",
    photoSrc: "/landing-assets/mentors/Mira.png",
    photoAlt: "Foto Kak Mira, tutor Kedokteran Vecalss",
    profileAchievements: [
      "National Submission PKM-RS (2024)",
      "National Submission PKM-VGK (2025)",
    ],
    quote: "God put that dream in your heart for a reason.",
  },
  {
    id: "dhini",
    name: "Kak Dhini",
    fullName: "Dhini Amalya",
    campus: "Unpad",
    university: "Universitas Padjadjaran",
    campusMarkSrc: "/brand/campuses/unpad.png",
    campusMarkAlt: "Universitas Padjadjaran mark",
    major: "Hubungan Internasional",
    focus: "Hubungan Internasional",
    utbkScore: "700",
    gpa: "3.82",
    blurb: "Mahasiswa Hubungan Internasional Unpad dengan minat pada global politics, partnership development, community engagement, dan riset berbasis advokasi.",
    photoSrc: "/landing-assets/mentors/Dhini.png",
    photoAlt: "Foto Kak Dhini, tutor Vecalss",
    profileAchievements: [
      "Top 5 Business Case Competition HIPMI Banyuwangi (2023)",
      "Semifinalist Scientific Paper Competition Festagama (2023)",
    ],
    quote: "Dreams don't work unless you do ;)",
  },
  {
    id: "nauval",
    name: "Kak Nauval",
    fullName: "Muhammad Nauval Ferry Widya Akmal",
    campus: "UI",
    university: "Universitas Indonesia",
    campusMarkSrc: "/brand/campuses/ui.png",
    campusMarkAlt: "Universitas Indonesia mark",
    major: "Fisika",
    focus: "Fisika",
    utbkScore: "SNBP 90",
    gpa: "3.71",
    blurb: "Mahasiswa Fisika UI yang berpengalaman dalam mengajar, business marketing, riset ilmiah, computational physics, dan pengembangan teknologi terapan.",
    photoSrc: "/landing-assets/mentors/Nauval.png",
    photoAlt: "Foto Kak Nauval, tutor Vecalss",
    profileAchievements: [
      "Finalist UI Incubate 2025",
      "1st Winner FIRA Indonesia 2025 - Emergency Drone",
      "3rd Winner EUREKA! ITB 2024 - Scientific Writing",
    ],
    quote: "No sacrifice, no victory.",
  },
  {
    id: "kaori",
    name: "Kak Kaori",
    fullName: "Phonna Kaori Elysia",
    campus: "UPN Veteran Jakarta",
    university: "UPN Veteran Jakarta (UPNVJ)",
    campusMarkSrc: "/brand/campuses/upn.png",
    campusMarkAlt: "Universitas Pembangunan Nasional Veteran Jakarta mark",
    major: "Kedokteran",
    focus: "Kedokteran",
    utbkScore: "704.95",
    gpa: "3.60",
    blurb: "Mahasiswa Kedokteran UPNVJ yang aktif dalam organisasi kemahasiswaan dan kegiatan kepemimpinan, khususnya di bidang kebijakan kesehatan dan pengembangan akademik.",
    photoSrc: "/landing-assets/mentors/Kaori.png",
    photoAlt: "Foto Kak Kaori, tutor Kedokteran Vecalss",
    profileAchievements: [
      "National Submission PKM-VGK 2025",
      "International Submission Pre-Conference Competition AMSC 2025",
    ],
    quote: "Education is the kindling of a flame, not the filling of a vessel.",
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
    blurb: "Mahasiswa Teknik Tenaga Listrik ITB dengan minat pada eksplorasi, olahraga, dan pendekatan belajar yang praktis serta terstruktur.",
    photoSrc: "/landing-assets/mentors/Abi.png",
    photoAlt: "Foto Kak Abi, tutor Sistem Tenaga Listrik Vecalss",
    profileAchievements: [
      "Learning Camp Perintis Scholarship 2024",
      "IEEE ITB Protech Sandbox Finalist 2025",
      "Juara 3 O2SN Kota Tangerang (2022)",
    ],
    quote: "Lakukan sekarang atau tidak sama sekali.",
  },
  {
    id: "nadiv",
    name: "Kak Nadiv",
    fullName: "Nadiv Rafi Nugroho",
    campus: "UI",
    university: "Universitas Indonesia",
    campusMarkSrc: "/brand/campuses/ui.png",
    campusMarkAlt: "Universitas Indonesia mark",
    major: "Ilmu Psikologi",
    focus: "Ilmu Psikologi",
    utbkScore: "PPU 800.91",
    gpa: "3.53",
    blurb: "Tutor, content creator, dan copywriter pendidikan dengan pengalaman lebih dari 3,5 tahun serta rekam jejak membangun media sosial edukasi.",
    photoSrc: "/landing-assets/mentors/Nadiv.png",
    photoAlt: "Foto Kak Nadiv, tutor Vecalss",
    profileAchievements: [
      "Pengunggahan Nasional Proposal PKM-RSH",
    ],
    quote: "Bermimpilah setinggi skor 1000! Jika engkau jatuh, engkau akan jatuh di antara skor 700.",
  },
  {
    id: "nicho",
    name: "Kak Nicho",
    fullName: "Nicholas Saputra Tjandra",
    campus: "UGM",
    university: "Universitas Gadjah Mada",
    campusMarkSrc: "/brand/campuses/ugm.png",
    campusMarkAlt: "Universitas Gadjah Mada mark",
    major: "Teknik Nuklir",
    focus: "Teknik Nuklir",
    utbkScore: "736",
    gpa: "3.89",
    blurb: "Tutor Vecalss dari Universitas Gadjah Mada.",
    photoSrc: "/landing-assets/mentors/Nicho.png",
    photoAlt: "Foto Kak Nicho, tutor Vecalss",
    profileAchievements: [
      "Participated in IAEA Uranium Mine Challenge",
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
      "Ada Summer Class, Supercharge TKA & SNBT, Tryout, Vera AI, dan Materi SNBT.",
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

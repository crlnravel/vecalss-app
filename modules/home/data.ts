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
  campusMarkAlt: string;
  campusMarkSrc: string;
  focus: string;
  name: string;
  photoAlt: string;
  photoSrc: string;
};

export type Testimonial = {
  avatarAlt: string;
  avatarSrc: string;
  meta: string;
  name: string;
  outcome: string;
  quote: string;
  university: string;
  universityMarkAlt: string;
  universityMarkSrc: string;
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
    name: "Mufli",
    campus: "ITB",
    campusMarkSrc: "/brand/campuses/itb.svg",
    campusMarkAlt: "Institut Teknologi Bandung mark",
    focus: "Arsitektur",
    blurb: "Membantu Voyager membangun cara berpikir runtut dari konsep dasar sampai strategi soal.",
    photoSrc: "/landing-assets/avatar-placeholder.png",
    photoAlt: "Placeholder avatar untuk Mufli",
  },
  {
    name: "Adit",
    campus: "UI",
    campusMarkSrc: "/brand/campuses/ui.png",
    campusMarkAlt: "Universitas Indonesia mark",
    focus: "Fisika",
    blurb: "Mengajar dengan pengalaman langsung sebagai pejuang PTN yang pernah melewati fase yang sama.",
    photoSrc: "/landing-assets/avatar-placeholder.png",
    photoAlt: "Placeholder avatar untuk Adit",
  },
  {
    name: "Nadiv",
    campus: "UI",
    campusMarkSrc: "/brand/campuses/ui.png",
    campusMarkAlt: "Universitas Indonesia mark",
    focus: "Psikologi",
    blurb: "Menjaga kelas tetap jelas, suportif, dan tidak membuat siswa merasa berjuang sendirian.",
    photoSrc: "/landing-assets/avatar-placeholder.png",
    photoAlt: "Placeholder avatar untuk Nadiv",
  },
  {
    name: "Kaori",
    campus: "UPN",
    campusMarkSrc: "/brand/campuses/upn.png",
    campusMarkAlt: "Universitas Pembangunan Nasional Veteran Jakarta mark",
    focus: "Kedokteran",
    blurb: "Mendampingi siswa yang perlu disiplin belajar tinggi untuk target jurusan kompetitif.",
    photoSrc: "/landing-assets/avatar-placeholder.png",
    photoAlt: "Placeholder avatar untuk Kaori",
  },
  {
    name: "Dhini",
    campus: "Unpad",
    campusMarkSrc: "/brand/campuses/unpad.png",
    campusMarkAlt: "Universitas Padjadjaran mark",
    focus: "Hubungan Internasional",
    blurb: "Membantu Voyager menata prioritas belajar tanpa kehilangan arah tujuan kampus.",
    photoSrc: "/landing-assets/avatar-placeholder.png",
    photoAlt: "Placeholder avatar untuk Dhini",
  },
  {
    name: "Nicho",
    campus: "UGM",
    campusMarkSrc: "/brand/campuses/ugm.png",
    campusMarkAlt: "Universitas Gadjah Mada mark",
    focus: "Teknik Nuklir",
    blurb: "Membawa sudut pandang akademik yang kuat sekaligus dekat dengan realitas siswa.",
    photoSrc: "/landing-assets/avatar-placeholder.png",
    photoAlt: "Placeholder avatar untuk Nicho",
  },
];

export const testimonials: Testimonial[] = [
  {
    name: "Alya",
    meta: "Voyager 2026",
    outcome: "Diterima",
    quote: "Vecalss bikin perjalanan belajarku terasa lebih jelas. Aku tahu harus mulai dari mana, kapan mengulang, dan bagaimana menjaga ritme sampai ujian.",
    university: "Universitas Indonesia",
    universityMarkSrc: "/brand/campuses/ui.png",
    universityMarkAlt: "Universitas Indonesia mark",
    avatarSrc: "/landing-assets/avatar-placeholder.png",
    avatarAlt: "Placeholder avatar untuk Alya",
  },
  {
    name: "Raka",
    meta: "Voyager 2026",
    outcome: "Diterima",
    quote: "Kelasnya rapi dan tutor menjelaskan dengan cara yang dekat. Latihan mingguan membantu aku tetap konsisten tanpa merasa kehilangan arah.",
    university: "Institut Teknologi Bandung",
    universityMarkSrc: "/brand/campuses/itb.svg",
    universityMarkAlt: "Institut Teknologi Bandung mark",
    avatarSrc: "/landing-assets/avatar-placeholder.png",
    avatarAlt: "Placeholder avatar untuk Raka",
  },
  {
    name: "Nadia",
    meta: "Voyager 2027",
    outcome: "Diterima",
    quote: "Aku suka karena belajarnya bukan cuma materi. Ada peta, evaluasi, dan dorongan kecil yang membuat target PTN terasa lebih mungkin dicapai.",
    university: "Universitas Padjadjaran",
    universityMarkSrc: "/brand/campuses/unpad.png",
    universityMarkAlt: "Universitas Padjadjaran mark",
    avatarSrc: "/landing-assets/avatar-placeholder.png",
    avatarAlt: "Placeholder avatar untuk Nadia",
  },
  {
    name: "Dimas",
    meta: "Voyager 2026",
    outcome: "Diterima",
    quote: "Menjelang ujian, Vecalss membantu aku memilah prioritas. Persiapan akhir jadi lebih tenang, fokus, dan tidak sekadar mengejar banyak soal.",
    university: "Universitas Airlangga",
    universityMarkSrc: "/brand/campuses/unair.png",
    universityMarkAlt: "Universitas Airlangga mark",
    avatarSrc: "/landing-assets/avatar-placeholder.png",
    avatarAlt: "Placeholder avatar untuk Dimas",
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
];

export const contactTopicOptions: readonly RadioPillOption<"quote" | "say-hi">[] = [
  { label: "Tanya program", value: "say-hi" },
  { label: "Mentoring pribadi", value: "quote" },
];

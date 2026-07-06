import {
  AlertTriangle,
  BookOpen,
  Flame,
  Sparkles,
  Users,
  TrendingDown,
  ShieldCheck,
} from "lucide-react";
import type { ComponentType } from "react";

type MentorNotificationItem = {
  detail: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  time: string;
  title: string;
  unread: boolean;
};

type MentorOverviewStat = {
  label: string;
  value: string;
};

type MentorStatusFilterKey = "all" | "at-risk" | "broken-streak" | "low-mastery";

type MentorStatusFilter = {
  count: number;
  key: MentorStatusFilterKey;
  label: string;
};

type MentorSubtestKey = "all" | "Literasi" | "Kuantitatif" | "Penalaran";

type MentorSubtestFilter = {
  count: number;
  key: MentorSubtestKey;
  label: string;
};

type MentorRiskTone = "high" | "medium" | "low";

type MentorRosterStudent = {
  className: string;
  id: string;
  initials: string;
  latestScore: string;
  latestScoreLabel: string;
  name: string;
  rank: number;
  riskLabel: string;
  riskTone: MentorRiskTone;
  scoreTrend: string;
  scoreTrendTone: "up" | "down" | "flat";
  selected: boolean;
  streakState: string;
  subtest: Exclude<MentorSubtestKey, "all">;
  weakSubtest: string;
  detail: MentorStudentDetail;
  isAtRisk: boolean;
  isBrokenStreak: boolean;
  isLowMastery: boolean;
};

type MentorRiskLegendItem = {
  detail: string;
  tone: MentorRiskTone;
  title: string;
};

type MentorLearningGap = {
  detail: string;
  mastery: number;
  title: string;
};

type MentorActivityItem = {
  detail: string;
  time: string;
  title: string;
};

type MentorInterventionSummary = {
  detail: string;
  time: string;
  title: string;
};

type MentorRecommendedModule = {
  href: string;
  reason: string;
  title: string;
  tone: "calm" | "warning";
};

type MentorStudentDetail = {
  focusSummary: string;
  learningGaps: MentorLearningGap[];
  lastIntervention: MentorInterventionSummary;
  messageStarter: string;
  recentActivity: MentorActivityItem[];
  recommendedModule: MentorRecommendedModule;
  trendSnapshot: string;
};

const mentorRoster: MentorRosterStudent[] = [
  {
    className: "XII-2",
    id: "nisa",
    initials: "NI",
    latestScore: "438",
    latestScoreLabel: "Skor terakhir",
    name: "Nisa Rahma",
    rank: 1,
    riskLabel: "At risk",
    riskTone: "high",
    scoreTrend: "Turun 12 poin",
    scoreTrendTone: "down",
    selected: true,
    streakState: "Streak putus 2 hari",
    subtest: "Literasi",
    weakSubtest: "Simpulan implisit",
    detail: {
      focusSummary: "Utamakan simpulan implisit dan cek ulang dua jawaban terakhir.",
      learningGaps: [
        {
          detail: "Masih sering lompat ke jawaban yang terlalu cepat.",
          mastery: 42,
          title: "Simpulan implisit",
        },
        {
          detail: "Butuh jeda baca yang lebih stabil saat data muncul panjang.",
          mastery: 51,
          title: "Literasi data",
        },
        {
          detail: "Ritme pengerjaan turun saat soal bertingkat.",
          mastery: 38,
          title: "Kontrol ritme",
        },
      ],
      lastIntervention: {
        detail: "Latihan pendek dikirim untuk membangun ulang ritme baca.",
        time: "Kemarin",
        title: "Intervensi terakhir",
      },
      messageStarter:
        "Nisa, kita fokus 10 menit ke simpulan implisit lalu cek ulang jawaban yang paling ragu.",
      recentActivity: [
        {
          detail: "Menyelesaikan 18 dari 20 soal dan berhenti lebih cepat di literasi panjang.",
          time: "2 jam lalu",
          title: "Tryout utama",
        },
        {
          detail: "Masih ragu di soal inferensi panjang dan simpulan bertumpuk.",
          time: "Kemarin",
          title: "Review terakhir",
        },
      ],
      recommendedModule: {
        href: "/courses",
        reason: "Paling dekat dengan gap utama hari ini.",
        title: "Literasi: Simpulan implisit",
        tone: "warning",
      },
      trendSnapshot: "Skor turun 12 poin, paling banyak di literasi inferensial.",
    },
    isAtRisk: true,
    isBrokenStreak: true,
    isLowMastery: true,
  },
  {
    className: "XII-1",
    id: "rafi",
    initials: "RA",
    latestScore: "471",
    latestScoreLabel: "Skor terakhir",
    name: "Rafi Mahendra",
    rank: 2,
    riskLabel: "Perlu tindak lanjut",
    riskTone: "medium",
    scoreTrend: "Naik 4 poin",
    scoreTrendTone: "up",
    selected: false,
    streakState: "Hadir, tetapi belum konsisten",
    subtest: "Kuantitatif",
    weakSubtest: "Grafik dan rasio",
    detail: {
      focusSummary: "Ambil grafik rasio dulu, lalu dorong tempo yang lebih stabil.",
      learningGaps: [
        {
          detail: "Masih kehilangan langkah saat membaca skala grafik.",
          mastery: 49,
          title: "Grafik",
        },
        {
          detail: "Rasio benar, tetapi pemilihan formula belum konsisten.",
          mastery: 55,
          title: "Rasio",
        },
        {
          detail: "Perlu latihan tempo agar tidak panik di soal hitung.",
          mastery: 46,
          title: "Tempo pengerjaan",
        },
      ],
      lastIntervention: {
        detail: "Catatan latihan dikirim setelah sesi sore.",
        time: "3 hari lalu",
        title: "Intervensi terakhir",
      },
      messageStarter:
        "Rafi, mulai dari grafik dulu lalu pilih satu soal rasio sebagai penguat.",
      recentActivity: [
        {
          detail: "Naik 4 poin setelah sesi latihan kuantitatif pendek.",
          time: "Hari ini",
          title: "Tryout mingguan",
        },
        {
          detail: "Masih sering berhenti saat grafik memiliki dua variabel.",
          time: "Kemarin",
          title: "Catatan mentor",
        },
      ],
      recommendedModule: {
        href: "/courses",
        reason: "Menutup gap grafik dan rasio paling cepat.",
        title: "Kuantitatif: Grafik cepat",
        tone: "calm",
      },
      trendSnapshot: "Skor naik 4 poin, tetapi konsistensi belum stabil.",
    },
    isAtRisk: true,
    isBrokenStreak: false,
    isLowMastery: true,
  },
  {
    className: "XII-4",
    id: "alya",
    initials: "AL",
    latestScore: "489",
    latestScoreLabel: "Skor terakhir",
    name: "Alya Putri",
    rank: 3,
    riskLabel: "Perlu tindak lanjut",
    riskTone: "medium",
    scoreTrend: "Stagnan",
    scoreTrendTone: "flat",
    selected: false,
    streakState: "Streak aman",
    subtest: "Penalaran",
    weakSubtest: "Simpulan berlapis",
    detail: {
      focusSummary: "Pertahankan ritme, lalu rapikan simpulan berlapis yang masih kabur.",
      learningGaps: [
        {
          detail: "Masih ragu saat dua opsi sama-sama terlihat benar.",
          mastery: 53,
          title: "Simpulan berlapis",
        },
        {
          detail: "Perlu pembacaan petunjuk yang lebih hemat waktu.",
          mastery: 58,
          title: "Seleksi petunjuk",
        },
        {
          detail: "Pola logika cukup baik, tinggal dirapikan di soal panjang.",
          mastery: 61,
          title: "Pola logika",
        },
      ],
      lastIntervention: {
        detail: "Sesi diskusi singkat dipakai untuk menahan jawaban impulsif.",
        time: "Kemarin",
        title: "Intervensi terakhir",
      },
      messageStarter:
        "Alya, pertahankan ritme lalu lihat kembali dua opsi yang paling dekat.",
      recentActivity: [
        {
          detail: "Skor stabil setelah dua sesi latihan penalaran berturut-turut.",
          time: "Hari ini",
          title: "Tryout utama",
        },
        {
          detail: "Masih butuh jeda baca sebelum mengunci simpulan akhir.",
          time: "Kemarin",
          title: "Review terakhir",
        },
      ],
      recommendedModule: {
        href: "/courses",
        reason: "Menjaga ritme sambil memperjelas simpulan berlapis.",
        title: "Penalaran: Simpulan berlapis",
        tone: "calm",
      },
      trendSnapshot: "Skor stagnan, tetapi ritme pengerjaan aman.",
    },
    isAtRisk: true,
    isBrokenStreak: false,
    isLowMastery: true,
  },
  {
    className: "XII-6",
    id: "dimas",
    initials: "DI",
    latestScore: "494",
    latestScoreLabel: "Skor terakhir",
    name: "Dimas Arjuna",
    rank: 4,
    riskLabel: "At risk",
    riskTone: "high",
    scoreTrend: "Turun 8 poin",
    scoreTrendTone: "down",
    selected: false,
    streakState: "Putus 1 sesi",
    subtest: "Kuantitatif",
    weakSubtest: "Persentase",
    detail: {
      focusSummary: "Persentase dulu, lalu baca ulang langkah yang paling sering terlewat.",
      learningGaps: [
        {
          detail: "Sering salah saat persentase berpadu dengan desimal.",
          mastery: 41,
          title: "Persentase",
        },
        {
          detail: "Langkah hitung cukup baik, tetapi urutan belum konsisten.",
          mastery: 48,
          title: "Urutan langkah",
        },
        {
          detail: "Butuh pengulangan ringan agar tempo kembali aman.",
          mastery: 44,
          title: "Tempo pengerjaan",
        },
      ],
      lastIntervention: {
        detail: "Sesi penguatan pendek dibuka setelah sesi yang terlewat.",
        time: "Kemarin",
        title: "Intervensi terakhir",
      },
      messageStarter:
        "Dimas, kita mulai dari persentase yang paling sering keluar lalu cek satu contoh penuh.",
      recentActivity: [
        {
          detail: "Skor turun 8 poin setelah satu sesi terlewat minggu ini.",
          time: "3 jam lalu",
          title: "Tryout mingguan",
        },
        {
          detail: "Perlu pengingat ritme agar tidak putus lagi.",
          time: "Kemarin",
          title: "Catatan mentor",
        },
      ],
      recommendedModule: {
        href: "/courses",
        reason: "Paling efektif untuk menutup gap dasar kuantitatif.",
        title: "Kuantitatif: Persentase praktis",
        tone: "warning",
      },
      trendSnapshot: "Skor turun 8 poin setelah ritme belajar terganggu.",
    },
    isAtRisk: true,
    isBrokenStreak: true,
    isLowMastery: true,
  },
  {
    className: "XII-7",
    id: "yusuf",
    initials: "YU",
    latestScore: "452",
    latestScoreLabel: "Skor terakhir",
    name: "Yusuf Hidayat",
    rank: 5,
    riskLabel: "At risk",
    riskTone: "high",
    scoreTrend: "Turun 10 poin",
    scoreTrendTone: "down",
    selected: false,
    streakState: "Putus 3 sesi",
    subtest: "Penalaran",
    weakSubtest: "Pola logika",
    detail: {
      focusSummary: "Pola logika harus dipasang ulang sebelum soal panjang dikejar.",
      learningGaps: [
        {
          detail: "Masih mudah tertukar saat petunjuk disusun bertingkat.",
          mastery: 39,
          title: "Pola logika",
        },
        {
          detail: "Perlu bantuan visual untuk menahan langkah yang hilang.",
          mastery: 45,
          title: "Urutan petunjuk",
        },
        {
          detail: "Tempo terlalu cepat setelah soal awal terasa mudah.",
          mastery: 43,
          title: "Kontrol tempo",
        },
      ],
      lastIntervention: {
        detail: "Pesan ulang jadwal belajar dikirim setelah dua sesi hilang.",
        time: "Kemarin",
        title: "Intervensi terakhir",
      },
      messageStarter:
        "Yusuf, kita rapikan pola logika dulu supaya langkahnya tidak loncat.",
      recentActivity: [
        {
          detail: "Tiga sesi terakhir tidak terselesaikan penuh.",
          time: "Hari ini",
          title: "Streak review",
        },
        {
          detail: "Masih paling lambat di soal dengan petunjuk berlapis.",
          time: "Kemarin",
          title: "Catatan mentor",
        },
      ],
      recommendedModule: {
        href: "/courses",
        reason: "Membantu membangun ulang urutan logika dari dasar.",
        title: "Penalaran: Pola logika",
        tone: "warning",
      },
      trendSnapshot: "Skor turun 10 poin, streak putus tiga sesi.",
    },
    isAtRisk: true,
    isBrokenStreak: true,
    isLowMastery: true,
  },
  {
    className: "XII-3",
    id: "hafiz",
    initials: "HA",
    latestScore: "523",
    latestScoreLabel: "Skor terakhir",
    name: "Hafiz Prakoso",
    rank: 6,
    riskLabel: "Stabil",
    riskTone: "low",
    scoreTrend: "Naik 6 poin",
    scoreTrendTone: "up",
    selected: false,
    streakState: "Stabil 5 hari",
    subtest: "Literasi",
    weakSubtest: "Literasi data",
    detail: {
      focusSummary: "Pertahankan stabilitas sambil menajamkan literasi data.",
      learningGaps: [
        {
          detail: "Cukup kuat, hanya perlu latihan interpretasi yang lebih cepat.",
          mastery: 68,
          title: "Literasi data",
        },
        {
          detail: "Butuh penguatan ringan pada ringkasan bacaan panjang.",
          mastery: 72,
          title: "Ringkasan bacaan",
        },
        {
          detail: "Tempo sudah aman, tinggal dijaga tetap rata.",
          mastery: 74,
          title: "Tempo baca",
        },
      ],
      lastIntervention: {
        detail: "Penguatan ringan diberikan untuk menjaga konsistensi.",
        time: "4 hari lalu",
        title: "Intervensi terakhir",
      },
      messageStarter:
        "Hafiz, kita pertahankan ritme dan kasih satu latihan literasi data yang lebih tajam.",
      recentActivity: [
        {
          detail: "Naik 6 poin dan tetap stabil selama lima hari.",
          time: "Hari ini",
          title: "Tryout utama",
        },
        {
          detail: "Tidak ada jeda belajar yang signifikan minggu ini.",
          time: "Kemarin",
          title: "Streak check",
        },
      ],
      recommendedModule: {
        href: "/courses",
        reason: "Mendukung stabilitas tanpa mengubah ritme yang sudah baik.",
        title: "Literasi: Literasi data",
        tone: "calm",
      },
      trendSnapshot: "Skor naik 6 poin, ritme belajar stabil.",
    },
    isAtRisk: false,
    isBrokenStreak: false,
    isLowMastery: false,
  },
];

const mentorDashboardMockData = {
  cohort: {
    cachedLabel: "Snapshot aktif",
    name: "Cohort XII - Soshum",
    refreshedAt: "12 menit lalu",
    workspaceLabel: "Ruang kerja kapten",
  },
  mentor: {
    email: "maya.adhitya@vecalss.local",
    fullName: "Maya Adhitya",
    roleLabel: "Kapten",
  },
  overviewStats: [
    {
      label: "Total siswa",
      value: "28",
    },
    {
      label: "At-risk",
      value: "6",
    },
    {
      label: "Broken streak",
      value: "4",
    },
    {
      label: "Score drop",
      value: "3",
    },
  ] satisfies MentorOverviewStat[],
  statusFilters: [
    {
      key: "all",
      label: "Semua",
      count: mentorRoster.length,
    },
    {
      key: "at-risk",
      label: "At risk",
      count: mentorRoster.filter((student) => student.isAtRisk).length,
    },
    {
      key: "broken-streak",
      label: "Broken streak",
      count: mentorRoster.filter((student) => student.isBrokenStreak).length,
    },
    {
      key: "low-mastery",
      label: "Low mastery",
      count: mentorRoster.filter((student) => student.isLowMastery).length,
    },
  ] satisfies MentorStatusFilter[],
  subtestFilters: [
    {
      key: "all",
      label: "Semua subtest",
      count: mentorRoster.length,
    },
    {
      key: "Literasi",
      label: "Literasi",
      count: mentorRoster.filter((student) => student.subtest === "Literasi").length,
    },
    {
      key: "Kuantitatif",
      label: "Kuantitatif",
      count: mentorRoster.filter((student) => student.subtest === "Kuantitatif")
        .length,
    },
    {
      key: "Penalaran",
      label: "Penalaran",
      count: mentorRoster.filter((student) => student.subtest === "Penalaran").length,
    },
  ] satisfies MentorSubtestFilter[],
  students: mentorRoster,
  riskLegend: [
    {
      detail: "Butuh tindak lanjut paling cepat. Warna dipakai hemat agar tidak terasa ramai.",
      tone: "high",
      title: "At risk",
    },
    {
      detail: "Menandakan ritme belajar putus atau absen beruntun.",
      tone: "medium",
      title: "Broken streak",
    },
    {
      detail: "Perlu penguatan pada subtest inti, tetapi belum darurat.",
      tone: "low",
      title: "Low mastery",
    },
  ] satisfies MentorRiskLegendItem[],
  notificationItems: [
    {
      detail: "Nisa dan Yusuf naik ke prioritas 1 setelah refresh snapshot pagi ini.",
      href: "/mentor/dashboard#students",
      icon: AlertTriangle,
      time: "Baru saja",
      title: "Prioritas cohort berubah",
      unread: true,
    },
    {
      detail: "4 siswa memiliki streak yang putus pada dua hari terakhir.",
      href: "/mentor/dashboard#signals",
      icon: Flame,
      time: "Pagi ini",
      title: "Broken streak terpantau",
      unread: true,
    },
    {
      detail: "Subtest Literasi masih mendominasi daftar perhatian minggu ini.",
      href: "/mentor/dashboard#students",
      icon: BookOpen,
      time: "Kemarin",
      title: "Subtest fokus diperbarui",
      unread: false,
    },
    {
      detail: "Ringkasan cohort tersimpan untuk review cepat sebelum intervensi.",
      href: "/mentor/dashboard#overview",
      icon: Sparkles,
      time: "Kemarin",
      title: "Snapshot tersimpan",
      unread: false,
    },
    {
      detail: "Cohort sekarang diringkas sebagai lapisan scan sebelum detail dibuka.",
      href: "/mentor/dashboard#overview",
      icon: Users,
      time: "Minggu ini",
      title: "Mode overview aktif",
      unread: false,
    },
    {
      detail: "Score drop kecil di dua siswa terakhir sudah masuk daftar pantauan.",
      href: "/mentor/dashboard#signals",
      icon: TrendingDown,
      time: "Minggu ini",
      title: "Score drop dipantau",
      unread: false,
    },
    {
      detail: "Siswa stabil tetap diberi label hijau agar scan cohort terasa tenang.",
      href: "/mentor/dashboard#students",
      icon: ShieldCheck,
      time: "Minggu ini",
      title: "Sinyal stabil dipertahankan",
      unread: false,
    },
  ] satisfies MentorNotificationItem[],
} as const;

export type {
  MentorActivityItem,
  MentorInterventionSummary,
  MentorLearningGap,
  MentorNotificationItem,
  MentorOverviewStat,
  MentorRecommendedModule,
  MentorRiskLegendItem,
  MentorRosterStudent,
  MentorStatusFilter,
  MentorStatusFilterKey,
  MentorSubtestFilter,
  MentorSubtestKey,
  MentorRiskTone,
  MentorStudentDetail,
};

export { mentorDashboardMockData };

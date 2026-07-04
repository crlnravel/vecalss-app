import {
  Crown,
  NotebookPen,
  Sparkles,
  TimerReset,
  type LucideIcon,
} from "lucide-react";

type TryoutCategory = {
  blurb: string;
  icon: LucideIcon;
  id: string;
  label: string;
  soon?: boolean;
};

type TryoutCard = {
  duration: string;
  id: string;
  indexLabel: string;
  isNew?: boolean;
  period: string;
  questionCount: string;
  status: string;
  title: string;
};

type TryoutSection = {
  description: string;
  id: string;
  kicker: string;
  title: string;
  tone: "cream" | "mint" | "sky";
  tryouts: TryoutCard[];
};

const tryoutCategories: TryoutCategory[] = [
  {
    id: "fleksibel",
    label: "TO Fleksibel",
    blurb: "Kerjakan sesuai ritme belajarmu, tetap dengan standar SNBT.",
    icon: TimerReset,
  },
  {
    id: "premium",
    label: "TO Premium",
    blurb: "Pilihan tryout dengan analisis lebih rapat dan paket unggulan.",
    icon: Crown,
  },
  {
    id: "reguler",
    label: "TO Reguler",
    blurb: "Rutin untuk menjaga tempo latihan mingguan tetap stabil.",
    icon: NotebookPen,
  },
  {
    id: "mini",
    label: "Mini TO",
    blurb: "Format singkat untuk cek cepat sebelum masuk sesi besar.",
    icon: Sparkles,
    soon: true,
  },
];

const tryoutSections: TryoutSection[] = [
  {
    id: "fleksibel",
    kicker: "Paling ramai",
    title: "Tryout Fleksibel",
    description:
      "Format paling dekat dengan referensi: visual besar, banner menonjol, dan kartu yang langsung terasa siap dipilih.",
    tone: "cream",
    tryouts: [
      {
        id: "fleksibel-14",
        duration: "3 jam 15 menit",
        indexLabel: "#14",
        isNew: true,
        period: "Juli 2026",
        questionCount: "160 soal",
        status: "Berlangsung",
        title: "Tryout SNBT Fleksibel #14 HOTS!",
      },
      {
        id: "fleksibel-13",
        duration: "3 jam 15 menit",
        indexLabel: "#13",
        isNew: true,
        period: "Juni 2026",
        questionCount: "160 soal",
        status: "Terbaru",
        title: "Tryout SNBT Fleksibel #13 HOTS!",
      },
      {
        id: "fleksibel-12",
        duration: "3 jam 15 menit",
        indexLabel: "#12",
        period: "Mei 2026",
        questionCount: "160 soal",
        status: "Review",
        title: "Tryout SNBT Fleksibel #12 HOTS!",
      },
      {
        id: "fleksibel-11",
        duration: "3 jam 15 menit",
        indexLabel: "#11",
        period: "April 2026",
        questionCount: "160 soal",
        status: "Arsip",
        title: "Tryout SNBT Fleksibel #11 HOTS!",
      },
    ],
  },
  {
    id: "premium",
    kicker: "Untuk target tinggi",
    title: "Tryout Premium",
    description:
      "Paket dengan nuansa lebih eksklusif, cocok untuk mendorong persepsi value tanpa meninggalkan pola katalog yang familiar.",
    tone: "sky",
    tryouts: [
      {
        id: "premium-07",
        duration: "3 jam 30 menit",
        indexLabel: "#07",
        isNew: true,
        period: "Juli 2026",
        questionCount: "180 soal",
        status: "Premium",
        title: "Tryout Premium SNBT #07 Intensive Review",
      },
      {
        id: "premium-06",
        duration: "3 jam 30 menit",
        indexLabel: "#06",
        period: "Juni 2026",
        questionCount: "180 soal",
        status: "Premium",
        title: "Tryout Premium SNBT #06 Strategy Drill",
      },
    ],
  },
  {
    id: "reguler",
    kicker: "Latihan mingguan",
    title: "Tryout Reguler",
    description:
      "Alternatif yang lebih ringan untuk menjaga kebiasaan belajar, tetap terasa satu keluarga dengan tryout fleksibel dan premium.",
    tone: "mint",
    tryouts: [
      {
        id: "reguler-09",
        duration: "2 jam 30 menit",
        indexLabel: "#09",
        isNew: true,
        period: "Juli 2026",
        questionCount: "120 soal",
        status: "Terjadwal",
        title: "Tryout Reguler #09 Momentum Builder",
      },
      {
        id: "reguler-08",
        duration: "2 jam 30 menit",
        indexLabel: "#08",
        period: "Juni 2026",
        questionCount: "120 soal",
        status: "Terjadwal",
        title: "Tryout Reguler #08 Weekly Progress Check",
      },
      {
        id: "reguler-07",
        duration: "2 jam 30 menit",
        indexLabel: "#07",
        period: "Mei 2026",
        questionCount: "120 soal",
        status: "Selesai",
        title: "Tryout Reguler #07 Foundation Refresh",
      },
    ],
  },
];

export type { TryoutCard, TryoutCategory, TryoutSection };
export { tryoutCategories, tryoutSections };

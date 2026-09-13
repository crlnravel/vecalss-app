import { FileQuestion, Gauge, ListChecks, Video } from "@/lib/icons";

const quickCreateItems = [
  {
    description: "Satu bacaan PDF untuk setiap Materi, dengan video pendamping opsional.",
    href: "/mentor/materi/create",
    icon: Video,
    label: "Materi",
  },
  {
    description: "Kuis singkat dari bank soal",
    href: "/mentor/quiz/create",
    icon: ListChecks,
    label: "Kuis",
  },
  {
    description: "Assessment bertahap dan terjadwal",
    href: "/mentor/tryout#create",
    icon: Gauge,
    label: "Tryout",
  },
  {
    description: "Soal yang dapat dipakai ulang untuk Kuis",
    href: "/mentor/quiz/question-bank/create?purpose=quiz",
    icon: FileQuestion,
    label: "Bank Soal Kuis",
  },
];

export { quickCreateItems };

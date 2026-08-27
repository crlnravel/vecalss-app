import {
  BookOpenText,
  Gauge,
  Image as ImageIcon,
  LibraryBig,
  ListChecks,
  type AppIcon,
} from "@/lib/icons";

type KaptenContentStatus = "draft" | "scheduled" | "published" | "archived";
type KaptenResourceType = "materi" | "quiz" | "question-bank" | "tryout" | "media";

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

const contentTypeMeta: Record<
  KaptenResourceType,
  { icon: AppIcon; label: string }
> = {
  materi: { icon: BookOpenText, label: "Materi" },
  media: { icon: ImageIcon, label: "Media" },
  quiz: { icon: ListChecks, label: "Kuis" },
  "question-bank": { icon: LibraryBig, label: "Bank Soal" },
  tryout: { icon: Gauge, label: "Tryout" },
};

const statusLabels: Record<KaptenContentStatus, string> = {
  archived: "Diarsipkan",
  draft: "Draf",
  published: "Diterbitkan",
  scheduled: "Terjadwal",
};

export { contentTypeMeta, statusLabels };
export type { KaptenContentStatus, KaptenResource, KaptenResourceType };

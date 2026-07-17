import type {
  MentorMateriLesson,
  MentorMateriSubject,
} from "@/lib/materi/repository";

type KaptenMateriStatus = "draft" | "scheduled" | "published" | "archived";

type KaptenMateriView = {
  code: string;
  description: string;
  duration: string;
  href: string;
  id: string;
  lifecycleStatus: KaptenMateriStatus;
  position: number;
  primaryMetric: string;
  progress: number;
  readiness: "ready" | "incomplete";
  resourceCount: number;
  resourceType: "materi";
  status: KaptenMateriStatus;
  subjectCode: string;
  subjectName: string;
  subjectSlug: string;
  title: string;
  updatedAt: string;
  updatedAtEpoch: number;
  videoUrl: string;
};

type KaptenMateriSubjectView = {
  code: string;
  description: string;
  name: string;
  slug: string;
};

function formatDuration(durationSeconds: number | undefined) {
  if (!durationSeconds || durationSeconds <= 0) return "";
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function relativeEditedAt(value: string) {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "Diedit baru saja";
  if (minutes < 60) return `Diedit ${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Diedit ${hours} jam lalu`;
  return `Diedit ${Math.floor(hours / 24)} hari lalu`;
}

function toKaptenMateriView(
  lesson: MentorMateriLesson & {
    subject: { code: string; name: string; slug: string };
  },
): KaptenMateriView {
  const duration = formatDuration(lesson.primaryVideo?.durationSeconds);
  const videoUrl = lesson.primaryVideo?.mediaUrl ?? "";
  return {
    code: lesson.code,
    description: `${lesson.subject.name} · Video Materi`,
    duration,
    href: `/mentor/materi/${lesson.code}`,
    id: lesson.code,
    lifecycleStatus: lesson.lifecycleStatus,
    position: lesson.sequenceNo,
    primaryMetric: lesson.readiness === "ready" ? (duration || "Durasi belum diisi") : `${duration || "Durasi belum diisi"} · Belum siap`,
    progress: lesson.readiness === "ready" ? 100 : 0,
    readiness: lesson.readiness,
    resourceCount: 1,
    resourceType: "materi",
    status: lesson.lifecycleStatus,
    subjectCode: lesson.subject.code,
    subjectName: lesson.subject.name,
    subjectSlug: lesson.subject.slug,
    title: lesson.title,
    updatedAt: relativeEditedAt(lesson.updatedAt),
    updatedAtEpoch: new Date(lesson.updatedAt).getTime(),
    videoUrl,
  };
}

function toKaptenMateriCatalogueView(catalogue: MentorMateriSubject[]) {
  const subjects: KaptenMateriSubjectView[] = catalogue.map((subject) => ({
    code: subject.code,
    description: subject.name,
    name: subject.name,
    slug: subject.slug,
  }));
  const lessons = catalogue.flatMap((subject) => subject.lessons.map((lesson) => toKaptenMateriView({
      ...lesson,
      subject,
    }))).sort((a, b) => a.position - b.position || a.code.localeCompare(b.code));

  return { lessons, subjects };
}

function toKaptenMateriEditorView(
  lesson: Awaited<ReturnType<typeof import("@/lib/materi/repository").getMentorMateriByCode>>,
) {
  return lesson ? toKaptenMateriView(lesson) : undefined;
}

export {
  formatDuration,
  toKaptenMateriCatalogueView,
  toKaptenMateriEditorView,
  toKaptenMateriView,
};
export type { KaptenMateriSubjectView, KaptenMateriView, KaptenMateriStatus };

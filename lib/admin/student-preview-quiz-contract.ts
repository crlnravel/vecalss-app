import {
  sanitizePreviewImageUrl,
  sanitizePreviewText,
} from "@/lib/admin/student-preview-content-contract";

const ADMIN_PREVIEW_QUIZ_SUBJECTS = [
  {
    code: "PU",
    description: "Penalaran umum dan logika argumen.",
    name: "Penalaran Umum",
    slug: "penalaran-umum",
    track: "TPS",
  },
  {
    code: "PPU",
    description: "Pengetahuan dan pemahaman umum.",
    name: "Pengetahuan dan Pemahaman Umum",
    slug: "pengetahuan-pemahaman-umum",
    track: "TPS",
  },
  {
    code: "PBM",
    description: "Pemahaman bacaan dan menulis.",
    name: "Pemahaman Bacaan dan Menulis",
    slug: "pemahaman-bacaan-menulis",
    track: "TPS",
  },
  {
    code: "PK",
    description: "Pengetahuan kuantitatif dan numerasi.",
    name: "Pengetahuan Kuantitatif",
    slug: "pengetahuan-kuantitatif",
    track: "TPS",
  },
  {
    code: "LBI",
    description: "Literasi dalam Bahasa Indonesia.",
    name: "Literasi Bahasa Indonesia",
    slug: "literasi-bahasa-indonesia",
    track: "TPA",
  },
  {
    code: "LBE",
    description: "Literasi dalam Bahasa Inggris.",
    name: "Literasi Bahasa Inggris",
    slug: "literasi-bahasa-inggris",
    track: "TPA",
  },
  {
    code: "PM",
    description: "Penalaran matematika dan pemecahan masalah.",
    name: "Penalaran Matematika",
    slug: "penalaran-matematika",
    track: "TPA",
  },
] as const;

type AdminPreviewQuizTrack = (typeof ADMIN_PREVIEW_QUIZ_SUBJECTS)[number]["track"];

type AdminPreviewQuizSubject = {
  code: string;
  description: string;
  name: string;
  slug: string;
  track: AdminPreviewQuizTrack;
};

type AdminPreviewQuizAvailabilityKind = "always" | "closed" | "open" | "upcoming";

type AdminPreviewQuizAvailability = {
  closesAt: string | null;
  kind: AdminPreviewQuizAvailabilityKind;
  label: string;
  opensAt: string | null;
};

type AdminPreviewQuizMedia = {
  alt: string;
  kind: "image";
  url: string;
};

type AdminPreviewQuizChoice = {
  key: string;
  media: AdminPreviewQuizMedia | null;
  text: string;
};

type AdminPreviewQuizQuestion = {
  choices: AdminPreviewQuizChoice[];
  displayOrder: number;
  key: string;
  media: AdminPreviewQuizMedia | null;
  prompt: string;
};

type AdminPreviewQuizSummary = {
  availability: AdminPreviewQuizAvailability;
  description: string | null;
  questionCount: number;
  slug: string;
  subject: AdminPreviewQuizSubject;
  title: string;
};

type AdminPreviewQuizDetail = AdminPreviewQuizSummary & {
  questions: AdminPreviewQuizQuestion[];
};

type AdminPreviewQuizSubjectWithQuizzes = AdminPreviewQuizSubject & {
  quizzes: AdminPreviewQuizSummary[];
};

type AdminPreviewQuizAssetInput = {
  libraryScope?: string | null;
  mimeType?: string | null;
  state?: string | null;
  trashedAt?: Date | null;
  url?: string | null;
};

type AdminPreviewQuizOptionInput = {
  asset?: AdminPreviewQuizAssetInput | null;
  content: string;
  sortOrder: number;
};

type AdminPreviewQuizItemInput = {
  options: AdminPreviewQuizOptionInput[];
  prompt: string;
  promptAsset?: AdminPreviewQuizAssetInput | null;
  sortOrder: number;
};

type AdminPreviewQuizRecordInput = {
  closesAt: Date | null;
  description: string | null;
  items: AdminPreviewQuizItemInput[];
  opensAt: Date | null;
  slug: string;
  subtest: {
    code: string;
    name: string;
  };
  title: string;
};

type AdminPreviewQuizBanner = {
  description: string;
  title: string;
};

const PREVIEW_QUIZ_FORBIDDEN_KEYS = [
  "answer",
  "author",
  "correct",
  "explanation",
  "hidden",
  "id",
  "learner",
  "policy",
  "points",
  "progress",
  "random",
  "result",
  "revision",
  "rubric",
  "score",
  "seed",
  "scoring",
  "source",
  "state",
  "status",
  "submit",
  "attempt",
  "participation",
  "published",
  "weight",
  "write",
] as const;

const PREVIEW_QUIZ_ALLOWED_KEYS = new Set([
  "alt",
  "availability",
  "choices",
  "closesAt",
  "code",
  "description",
  "displayOrder",
  "key",
  "kind",
  "label",
  "media",
  "name",
  "opensAt",
  "questionCount",
  "questions",
  "quizzes",
  "prompt",
  "slug",
  "subject",
  "text",
  "title",
  "track",
  "url",
]);

function getAdminPreviewQuizSubjectByCode(code: string) {
  return ADMIN_PREVIEW_QUIZ_SUBJECTS.find((subject) => subject.code === code) ?? null;
}

function getAdminPreviewQuizSubjectBySlug(slug: string) {
  return ADMIN_PREVIEW_QUIZ_SUBJECTS.find((subject) => subject.slug === slug) ?? null;
}

function getAdminPreviewQuizAvailability(
  opensAt: Date | null,
  closesAt: Date | null,
  now = new Date(),
): AdminPreviewQuizAvailability {
  const opensAtIso = opensAt?.toISOString() ?? null;
  const closesAtIso = closesAt?.toISOString() ?? null;

  if (opensAt && opensAt.getTime() > now.getTime()) {
    return {
      closesAt: closesAtIso,
      kind: "upcoming",
      label: "Akan dibuka",
      opensAt: opensAtIso,
    };
  }

  if (closesAt && closesAt.getTime() <= now.getTime()) {
    return {
      closesAt: closesAtIso,
      kind: "closed",
      label: "Sudah ditutup",
      opensAt: opensAtIso,
    };
  }

  if (!opensAt && !closesAt) {
    return {
      closesAt: null,
      kind: "always",
      label: "Selalu tersedia",
      opensAt: null,
    };
  }

  return {
    closesAt: closesAtIso,
    kind: "open",
    label: "Sedang tersedia",
    opensAt: opensAtIso,
  };
}

function toPreviewQuizMedia(asset: AdminPreviewQuizAssetInput | null | undefined): AdminPreviewQuizMedia | null {
  if (
    !asset
    || asset.libraryScope !== "kapten"
    || asset.state !== "ready"
    || asset.trashedAt
    || !asset.mimeType?.toLowerCase().startsWith("image/")
  ) {
    return null;
  }

  const url = sanitizePreviewImageUrl(asset.url);
  return url ? { alt: "Media soal", kind: "image", url } : null;
}

function toAdminPreviewQuizQuestion(item: AdminPreviewQuizItemInput): AdminPreviewQuizQuestion {
  const choices: AdminPreviewQuizChoice[] = [];
  const sorted = [...item.options].sort((left, right) => left.sortOrder - right.sortOrder);
  for (const choice of sorted) {
    const text = sanitizePreviewText(choice.content);
    if (text.length > 0) {
      choices.push({
        key: String.fromCharCode(65 + choices.length),
        media: toPreviewQuizMedia(choice.asset),
        text,
      });
    }
  }

  return {
    choices,
    displayOrder: item.sortOrder,
    key: `question-${item.sortOrder}`,
    media: toPreviewQuizMedia(item.promptAsset),
    prompt: sanitizePreviewText(item.prompt) || "Pertanyaan tanpa teks",
  };
}

function toAdminPreviewQuizSummary(
  record: AdminPreviewQuizRecordInput,
  now = new Date(),
): AdminPreviewQuizSummary | null {
  const metadata = getAdminPreviewQuizSubjectByCode(record.subtest.code);
  if (!metadata) return null;

  return {
    availability: getAdminPreviewQuizAvailability(record.opensAt, record.closesAt, now),
    description: sanitizePreviewText(record.description) || null,
    questionCount: record.items.length,
    slug: sanitizePreviewText(record.slug),
    subject: {
      code: metadata.code,
      description: metadata.description,
      name: sanitizePreviewText(record.subtest.name) || metadata.name,
      slug: metadata.slug,
      track: metadata.track,
    },
    title: sanitizePreviewText(record.title) || "Kuis tanpa judul",
  };
}

function toAdminPreviewQuizDetail(
  record: AdminPreviewQuizRecordInput,
  now = new Date(),
): AdminPreviewQuizDetail | null {
  const summary = toAdminPreviewQuizSummary(record, now);
  if (!summary) return null;

  const questions = [...record.items]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(toAdminPreviewQuizQuestion);

  return {
    ...summary,
    questionCount: questions.length,
    questions,
  };
}

function sanitizeAdminPreviewQuizBanner(input: {
  description?: string | null;
  title?: string | null;
}): AdminPreviewQuizBanner {
  return {
    description: sanitizePreviewText(input.description) || "Kuis terbit yang dapat dibaca tanpa memulai percobaan.",
    title: sanitizePreviewText(input.title) || "Kuis",
  };
}

function assertAdminPreviewQuizPayloadSafe(value: unknown): asserts value is AdminPreviewQuizDetail | AdminPreviewQuizSummary | AdminPreviewQuizSubjectWithQuizzes {
  const visit = (candidate: unknown, path: string) => {
    if (candidate === null || typeof candidate !== "object") return;

    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }

    for (const [key, entry] of Object.entries(candidate)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
      if (PREVIEW_QUIZ_FORBIDDEN_KEYS.some((forbiddenKey) => normalizedKey.includes(forbiddenKey))) {
        throw new Error(`Forbidden student-preview quiz field at ${path}.${key}`);
      }
      if (!PREVIEW_QUIZ_ALLOWED_KEYS.has(key)) {
        throw new Error(`Unexpected student-preview quiz field at ${path}.${key}`);
      }
      visit(entry, `${path}.${key}`);
    }
  };

  visit(value, "quiz");
}

export {
  ADMIN_PREVIEW_QUIZ_SUBJECTS,
  PREVIEW_QUIZ_FORBIDDEN_KEYS,
  assertAdminPreviewQuizPayloadSafe,
  getAdminPreviewQuizAvailability,
  getAdminPreviewQuizSubjectByCode,
  getAdminPreviewQuizSubjectBySlug,
  sanitizeAdminPreviewQuizBanner,
  toAdminPreviewQuizDetail,
  toAdminPreviewQuizQuestion,
  toAdminPreviewQuizSummary,
  toPreviewQuizMedia,
};

export type {
  AdminPreviewQuizAssetInput,
  AdminPreviewQuizAvailability,
  AdminPreviewQuizAvailabilityKind,
  AdminPreviewQuizBanner,
  AdminPreviewQuizChoice,
  AdminPreviewQuizDetail,
  AdminPreviewQuizItemInput,
  AdminPreviewQuizMedia,
  AdminPreviewQuizQuestion,
  AdminPreviewQuizRecordInput,
  AdminPreviewQuizSubject,
  AdminPreviewQuizSubjectWithQuizzes,
  AdminPreviewQuizSummary,
  AdminPreviewQuizTrack,
};

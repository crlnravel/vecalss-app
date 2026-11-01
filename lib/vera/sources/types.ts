import type { Prisma } from "@/generated/prisma/client";

/** A place in PTN Pro that a Vera answer can point to. Every link is a page the student can open. */
export type VeraSource = {
  type: "materi" | "kuis" | "tryout";
  id: string;
  label: string;
  href: string;
};

export type VeraToolError = { error: "not_found" | "under_review" | "not_available" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Ids from the model are checked before any lookup, so a malformed id is simply not found. */
export function isUuid(value: string) {
  return UUID.test(value);
}

/** Subtest filters take the code or the name, in any letter case, as the result pages label them. */
export function subtestMatches(subtest: { code: string; name: string }, query: string) {
  const needle = query.trim().toLowerCase();
  return subtest.code.toLowerCase() === needle || subtest.name.toLowerCase() === needle;
}

export function subtestWhere(query: string): Prisma.SubtestWhereInput {
  const value = query.trim();
  return {
    OR: [
      { code: { equals: value, mode: "insensitive" } },
      { name: { equals: value, mode: "insensitive" } },
    ],
  };
}

export function kuisResultHref(subjectSlug: string | undefined, quizSlug: string, attemptId: string) {
  return subjectSlug
    ? `/quiz/${encodeURIComponent(subjectSlug)}/${encodeURIComponent(quizSlug)}/result?attemptId=${encodeURIComponent(attemptId)}`
    : "/quiz";
}

export function tryoutResultHref(attemptId: string) {
  return `/tryout/attempt/${encodeURIComponent(attemptId)}/result`;
}

/** Topic codes look like `materi:<course slug>:section-<n>`. The course slug is the middle part. */
export function courseSlugOf(topicCode: string) {
  return topicCode.split(":")[1] ?? "";
}

/** A lesson page is `/courses/<course slug>/<module code>`. */
export function materiHref(topicCode: string, moduleCode: string) {
  return `/courses/${encodeURIComponent(courseSlugOf(topicCode))}/${encodeURIComponent(moduleCode)}`;
}

export type ReviewStatus = "correct" | "wrong" | "unanswered" | "unknown";

export type ReviewOption = { id: string; text: string; correct: boolean | undefined };

export type ReviewItem = {
  number: number;
  subtest?: string;
  prompt: string;
  status: ReviewStatus;
  yourAnswer: string | null;
  correctAnswer: string | null;
  explanation: string | null;
};

const TEXT_CHARS = 600;
const ANSWER_CHARS = 300;

/** One question shaped like the student's result page, with each text bounded for the model. */
export function reviewItem({
  number,
  subtest,
  prompt,
  explanation,
  options,
  selectedOptionIds,
}: {
  number: number;
  subtest?: string;
  prompt: string;
  explanation: string | null | undefined;
  options: ReviewOption[];
  selectedOptionIds: string[];
}): ReviewItem {
  const status = gradeReview(options, selectedOptionIds);
  const answers = (ids: string[]) => {
    const texts = options.filter((option) => ids.includes(option.id)).map((option) => clip(option.text, ANSWER_CHARS));
    return texts.length > 0 ? texts.join("; ") : null;
  };
  return {
    number,
    ...(subtest ? { subtest } : {}),
    prompt: clip(prompt, TEXT_CHARS),
    status,
    yourAnswer: answers(selectedOptionIds),
    correctAnswer: status === "wrong" ? answers(options.filter((option) => option.correct).map((option) => option.id)) : null,
    explanation: explanation?.trim() ? clip(explanation.trim(), TEXT_CHARS) : null,
  };
}

/** Graded from the option flags the student's own page shows. Without those flags the answer is unknown, never guessed. */
export function gradeReview(options: ReviewOption[], selectedOptionIds: string[]): ReviewStatus {
  if (selectedOptionIds.length === 0) return "unanswered";
  if (options.some((option) => option.correct === undefined)) return "unknown";
  const correct = options.filter((option) => option.correct).map((option) => option.id).sort();
  const selected = [...new Set(selectedOptionIds)].sort();
  const same = correct.length === selected.length && correct.every((id, index) => id === selected[index]);
  return same ? "correct" : "wrong";
}

export function clip(text: string, limit: number) {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Collects every source object from a tool output, so the answer can list them without the model choosing. */
export function collectSources(value: unknown, found: VeraSource[] = []): VeraSource[] {
  if (Array.isArray(value)) {
    for (const item of value) collectSources(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (isVeraSource(record.source)) found.push(record.source);
    for (const [key, nested] of Object.entries(record)) {
      if (key !== "source") collectSources(nested, found);
    }
  }
  return found;
}

function isVeraSource(value: unknown): value is VeraSource {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as VeraSource).id === "string" &&
    typeof (value as VeraSource).href === "string" &&
    ["materi", "kuis", "tryout"].includes((value as VeraSource).type)
  );
}

/** Unique by type and id, keeping the first label seen. */
export function uniqueSources(sources: VeraSource[]): VeraSource[] {
  const seen = new Map<string, VeraSource>();
  for (const source of sources) {
    const key = `${source.type}:${source.id}`;
    if (!seen.has(key)) seen.set(key, source);
  }
  return [...seen.values()];
}

import "server-only";

import { prisma } from "@/lib/prisma";
import { VERA_LIMITS } from "../config";
import { releasedKuisAttemptWhere, releasedTryoutAttemptWhere } from "./authorization";
import { getKuisAttemptReview, kuisSource, type KuisAttemptReview } from "./kuis";
import { readMateri, recentMateri, searchMateri } from "./materi";
import { getTryoutResultReview } from "./tryout";
import { newestFirst } from "./result-time";
import { getStudioDocument } from "../studio-documents";
import {
  clip,
  isUuid,
  studioDocumentHref,
  tryoutResultHref,
  type PinnedBlock,
  type ReviewItem,
  type ResolvedMention,
  type VeraMentionType,
  type VeraSource,
} from "./types";

const GROUP_LIMIT = 6;
const RECENT_KUIS = 3;
const RECENT_TRYOUT = 3;
const RECENT_STUDIO = 3;
const SUMMARY_ITEMS = 5;
const ITEM_CHARS = 200;
const LABEL_CHARS = 200;
const MIN_BODY_CHARS = 200;
/** The same rough rate the prompt's history window uses, so the budget and the window agree. */
const CHARS_PER_TOKEN = 4;
const TRUNCATED_NOTE = "\n[Isi dipangkas karena batas konteks Vera.]";

const TYPE_LABELS: Record<VeraMentionType, string> = { materi: "Materi", kuis: "Kuis", tryout: "Tryout", studio: "Studio" };
const STATUS_LABELS: Record<ReviewItem["status"], string> = {
  correct: "benar",
  wrong: "salah",
  unanswered: "tidak dijawab",
  unknown: "belum diketahui",
};

/** A pin as the client sent it. The label is what the student's menu showed, and only a refused pin ever falls back to it. */
export type MentionRef = { type: VeraMentionType; id: string; label?: string };

export type MentionCandidate = {
  type: VeraMentionType;
  id: string;
  label: string;
  detail: string | null;
  source: VeraSource;
};

export type MentionGroups = Record<VeraMentionType, MentionCandidate[]>;

/**
 * Candidates for the `@` menu, grouped by type. Each group only holds what the student could open on their own pages, because
 * the same owner and release predicates the readers use scope every query.
 */
export async function searchMentions({
  studentId,
  query,
  now = new Date(),
}: {
  studentId: string;
  query: string;
  now?: Date;
}): Promise<MentionGroups> {
  const term = query.trim();
  const [materi, kuis, tryout, studio] = await Promise.all([
    materiCandidates(studentId, term, now),
    kuisCandidates(studentId, term, now),
    tryoutCandidates(studentId, term, now),
    studioCandidates(studentId, term),
  ]);
  return { materi, kuis, tryout, studio };
}

async function materiCandidates(studentId: string, term: string, now: Date): Promise<MentionCandidate[]> {
  if (!term) {
    const recent = await recentMateri({ studentId, now });
    return recent
      ? [{ type: "materi", id: recent.moduleId, label: recent.title, detail: `${recent.subtest} · ${recent.topic}`, source: recent.source }]
      : [];
  }
  const hits = await searchMateri({ query: term, now });
  return hits.slice(0, GROUP_LIMIT).map((hit) => ({
    type: "materi",
    id: hit.moduleId,
    label: hit.title,
    detail: `${hit.subtest} · ${hit.topic}`,
    source: hit.source,
  }));
}

async function kuisCandidates(studentId: string, term: string, now: Date): Promise<MentionCandidate[]> {
  const base = releasedKuisAttemptWhere(studentId, now);
  const rows = newestFirst(
    await prisma.standaloneQuizAttempt.findMany({
      where: term
        ? { ...base, participation: { studentId, quiz: { status: "published", title: { contains: term, mode: "insensitive" } } } }
        : base,
      select: {
        id: true,
        score: true,
        releaseAt: true,
        submittedAt: true,
        createdAt: true,
        participation: { select: { quiz: { select: { slug: true, title: true, subtest: { select: { code: true } } } } } },
      },
    }),
  ).slice(0, term ? GROUP_LIMIT : RECENT_KUIS);
  return rows.map((row): MentionCandidate => ({
    type: "kuis",
    id: row.id,
    label: row.participation.quiz.title,
    detail: row.score === null ? null : `Skor ${row.score}`,
    source: kuisSource(row.id, row.participation.quiz),
  }));
}

async function tryoutCandidates(studentId: string, term: string, now: Date): Promise<MentionCandidate[]> {
  const base = releasedTryoutAttemptWhere(studentId, now);
  const rows = newestFirst(
    await prisma.tryoutAttempt.findMany({
      where: term
        ? { ...base, tryout: { status: "published", publishedAt: { lte: now }, title: { contains: term, mode: "insensitive" } } }
        : base,
      select: { id: true, score: true, releaseAt: true, submittedAt: true, createdAt: true, tryout: { select: { title: true } } },
    }),
  ).slice(0, term ? GROUP_LIMIT : RECENT_TRYOUT);
  return rows.map((row): MentionCandidate => ({
    type: "tryout",
    id: row.id,
    label: row.tryout.title,
    detail: row.score === null ? null : `Skor ${Number(row.score)}`,
    source: { type: "tryout", id: row.id, label: row.tryout.title, href: tryoutResultHref(row.id) },
  }));
}

/** The student's own Studio documents: the recent ones, or the ones whose title matches the search. */
async function studioCandidates(studentId: string, term: string): Promise<MentionCandidate[]> {
  const rows = await prisma.veraStudioDocument.findMany({
    where: term ? { studentId, title: { contains: term, mode: "insensitive" } } : { studentId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: term ? GROUP_LIMIT : RECENT_STUDIO,
    select: { id: true, title: true },
  });
  return rows.map((row): MentionCandidate => ({
    type: "studio",
    id: row.id,
    label: row.title,
    detail: "Dokumen Studio",
    source: { type: "studio", id: row.id, label: row.title, href: studioDocumentHref(row.id) },
  }));
}

/**
 * Pins the `@` sources of one message. Each source is read again with the readers the student's own pages use, so a forged,
 * hidden or missing id is refused. Accepted sources become pinned blocks inside the token budget. The rest come back as rejected.
 */
export async function resolveMentions({
  studentId,
  mentions,
  now = new Date(),
}: {
  studentId: string;
  mentions: MentionRef[];
  now?: Date;
}) {
  let budget = VERA_LIMITS.maxPinnedTokens * CHARS_PER_TOKEN;
  const pinned: PinnedBlock[] = [];
  const accepted: ResolvedMention[] = [];
  const rejected: ResolvedMention[] = [];
  for (const mention of distinct(mentions)) {
    const read = await readMention(studentId, mention, now);
    if (!read || budget < MIN_BODY_CHARS) {
      rejected.push({ type: mention.type, id: mention.id, label: clientLabel(mention), status: "rejected", source: null });
      continue;
    }
    const body = fitBody(read.body, budget);
    budget -= body.length;
    pinned.push({ type: mention.type, id: mention.id, title: read.title, body });
    accepted.push({ type: mention.type, id: mention.id, label: read.title, status: "accepted", source: read.source });
  }
  return { pinned, accepted, rejected };
}

type PinnedRead = { title: string; body: string; source: VeraSource };

async function readMention(studentId: string, mention: MentionRef, now: Date): Promise<PinnedRead | null> {
  if (!isUuid(mention.id)) return null;
  if (mention.type === "materi") {
    const read = await readMateri({ moduleId: mention.id, part: 1, now });
    if ("error" in read) return null;
    const more =
      read.totalParts > 1 ? `\n[Bagian 1 dari ${read.totalParts}. Bagian lain bisa dibaca dengan read_materi.]` : "";
    return { title: read.title, body: `${read.text}${more}`, source: read.source };
  }
  if (mention.type === "kuis") {
    const review = await getKuisAttemptReview({ studentId, attemptId: mention.id, onlyWrong: true, now });
    if ("error" in review) return null;
    return { title: review.title, body: summarizeKuis(review), source: review.source };
  }
  if (mention.type === "studio") {
    // Only the student's own document. Its markdown is what the pin carries, cut to the budget like any other source.
    const document = await getStudioDocument({ studentId, id: mention.id });
    if (!document) return null;
    return {
      title: document.title,
      body: document.markdown,
      source: { type: "studio", id: document.id, label: document.title, href: studioDocumentHref(document.id) },
    };
  }
  const review = await getTryoutResultReview({ studentId, attemptId: mention.id, onlyWrong: true, now });
  if ("error" in review) return null;
  return { title: review.title, body: summarizeTryout(review), source: review.source };
}

function summarizeKuis(review: KuisAttemptReview) {
  const lines = [`Skor ${review.score ?? "-"}. Benar ${review.correct}, salah ${review.wrong}, tidak dijawab ${review.unanswered}.`];
  if (review.limitation) lines.push(review.limitation);
  return [...lines, ...review.items.slice(0, SUMMARY_ITEMS).map(itemLine)].join("\n");
}

function summarizeTryout(review: {
  finalScore?: number;
  subtests: Array<{ subtest: string; score: number | null }>;
  items: ReviewItem[];
}) {
  const scores = review.subtests.map((row) => `${row.subtest}: ${row.score ?? "-"}`);
  return [`Skor akhir ${review.finalScore ?? "-"}.`, ...scores, ...review.items.slice(0, SUMMARY_ITEMS).map(itemLine)].join("\n");
}

function itemLine(item: ReviewItem) {
  return `Soal ${item.number} (${STATUS_LABELS[item.status]}): ${clip(item.prompt, ITEM_CHARS)}`;
}

/** Cuts a body to the budget and says so, so the model knows the rest exists and can ask for it. */
function fitBody(body: string, budget: number) {
  return body.length <= budget ? body : `${body.slice(0, budget - TRUNCATED_NOTE.length)}${TRUNCATED_NOTE}`;
}

/**
 * The label the student's menu showed for a pin. A refused pin keeps this and nothing the server looked up, so a forged id can
 * never surface another student's title.
 */
function clientLabel(mention: MentionRef) {
  return clip(mention.label?.trim() || TYPE_LABELS[mention.type], LABEL_CHARS);
}

function distinct(mentions: MentionRef[]) {
  const seen = new Set<string>();
  return mentions.filter((mention) => {
    const key = `${mention.type}:${mention.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

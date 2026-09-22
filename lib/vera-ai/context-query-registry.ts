import {
  createContextToolResult,
  parseRetrieveReleasedLearningContextArgs,
  type ContextToolSource,
  type RetrieveReleasedLearningContextArgs,
  type VeraContextKind,
  VERA_CONTEXT_REGISTRY_VERSION,
} from "./context-tool-contracts";
import { normalizeText, sha256Hex, VeraContractError } from "./contracts";
import { resolveCompletedKuis, resolveCompletedTryout, resolvePublishedMateri } from "./context-resolvers";

export const VERA_CONTEXT_REGISTRY_MAX_SOURCES = 4 as const;
export const VERA_CONTEXT_REGISTRY_MAX_TERMS = 8 as const;
export const VERA_CONTEXT_REGISTRY_TIMEOUT_MS = 1_500 as const;

export type ContextRegistryAuthorization = {
  ownerStudentId?: string | null;
  published: boolean;
  released: boolean;
  scored?: boolean;
  reviewAvailable?: boolean;
  correctAnswersVisible?: boolean;
  ready?: boolean;
  releaseBindingValid?: boolean;
  visibleToStudent?: boolean;
};

/** Server-only candidate. `stableSourceId` is never serialized into a result. */
export type ContextRegistryCandidate = {
  kind: VeraContextKind;
  stableSourceId: string;
  title: string;
  topic?: string | null;
  releaseAt: Date;
  sourceVersionDigest: string;
  evidenceSegments: string[];
  limitations?: string[];
  authorization: ContextRegistryAuthorization;
};

export type ContextRegistrySource = {
  listMateri(input: { studentId: string; now: Date }): Promise<readonly ContextRegistryCandidate[]>;
  listKuis(input: { studentId: string; now: Date }): Promise<readonly ContextRegistryCandidate[]>;
  listTryout(input: { studentId: string; now: Date }): Promise<readonly ContextRegistryCandidate[]>;
};

export type RankedContextCandidate = {
  candidate: ContextRegistryCandidate;
  exactTitle: boolean;
  titlePrefix: boolean;
  topicTermScore: number;
  metadataTermScore: number;
};

export type ContextRegistryExecution = {
  args: RetrieveReleasedLearningContextArgs;
  terms: string[];
  ranked: RankedContextCandidate[];
  result: ReturnType<typeof createContextToolResult>;
};

export class ContextRegistryError extends Error {
  readonly code: "timeout" | "unavailable" | "invalid_projection";

  constructor(code: ContextRegistryError["code"], message: string) {
    super(message);
    this.name = "ContextRegistryError";
    this.code = code;
  }
}

function normalizeTerm(value: string): string {
  return normalizeText(value)
    .toLocaleLowerCase("id-ID")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function tokenizeContextQuery(query: string): string[] {
  const normalized = normalizeTerm(query);
  const terms: string[] = [];
  for (const term of normalized.split(/\s+/u)) {
    if (term && !terms.includes(term)) terms.push(term);
    if (terms.length === VERA_CONTEXT_REGISTRY_MAX_TERMS) break;
  }
  return terms;
}

function sanitizedEvidence(value: string): string {
  return normalizeText(value)
    .replace(/<[^>]*>/gu, "")
    .replace(/(?:javascript:|data:|https?:\/\/)[^\s]+/giu, "[tautan dihapus]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .trim();
}

function candidateMetadata(candidate: ContextRegistryCandidate): string {
  return [candidate.title, candidate.topic ?? "", ...candidate.evidenceSegments].map(normalizeTerm).join(" ");
}

function authorizationAllows(candidate: ContextRegistryCandidate, studentId: string, now: Date): boolean {
  const authority = candidate.authorization;
  if (candidate.kind !== "materi" && authority.ownerStudentId !== studentId) return false;
  if (!authority.published || !authority.released) return false;
  if (candidate.kind !== "materi" && authority.scored !== true) return false;
  if (authority.visibleToStudent !== true) return false;
  if (candidate.releaseAt.getTime() > now.getTime()) return false;
  if (candidate.kind === "kuis" && (authority.reviewAvailable !== true || authority.correctAnswersVisible !== true)) return false;
  if (candidate.kind === "tryout" && (authority.ready !== true || authority.releaseBindingValid !== true)) return false;
  return true;
}

function compareRanked(left: RankedContextCandidate, right: RankedContextCandidate): number {
  const leftId = left.candidate.stableSourceId;
  const rightId = right.candidate.stableSourceId;
  const stableIdOrder = leftId === rightId ? 0 : leftId < rightId ? -1 : 1;
  return Number(right.exactTitle) - Number(left.exactTitle)
    || Number(right.titlePrefix) - Number(left.titlePrefix)
    || right.topicTermScore - left.topicTermScore
    || right.metadataTermScore - left.metadataTermScore
    || right.candidate.releaseAt.getTime() - left.candidate.releaseAt.getTime()
    || stableIdOrder;
}

/**
 * Deterministically rank a fixed database snapshot. This function performs no
 * authorization widening and does not mutate candidates.
 */
export function rankContextCandidates(
  candidates: readonly ContextRegistryCandidate[],
  query: string,
  now = new Date(),
): RankedContextCandidate[] {
  void now;
  const normalizedQuery = normalizeTerm(query);
  const terms = tokenizeContextQuery(query);
  return candidates
    .map((candidate) => {
      const title = normalizeTerm(candidate.title);
      const topic = normalizeTerm(candidate.topic ?? "");
      const metadata = candidateMetadata(candidate);
      const metadataTerms = new Set(metadata.split(/\s+/u).filter(Boolean));
      const exactTitle = title === normalizedQuery;
      const titlePrefix = !exactTitle && Boolean(normalizedQuery) && title.startsWith(normalizedQuery);
      const topicTermScore = terms.reduce((score, term) => score + Number(topic.split(/\s+/u).includes(term)), 0);
      const metadataTermScore = terms.reduce((score, term) => score + Number(metadataTerms.has(term)), 0);
      return { candidate, exactTitle, titlePrefix, topicTermScore, metadataTermScore };
    })
    .filter((entry) => entry.exactTitle || entry.titlePrefix || entry.topicTermScore > 0 || entry.metadataTermScore > 0)
    .sort(compareRanked);
}

function projectCandidate(candidate: ContextRegistryCandidate, maxBytes: number): { source: ContextToolSource; truncated: boolean } {
  if (!candidate.stableSourceId || !candidate.title || !(candidate.releaseAt instanceof Date) || Number.isNaN(candidate.releaseAt.getTime())) {
    throw new ContextRegistryError("invalid_projection", "Registry projection is incomplete.");
  }
  // Keep the model-visible citation deterministic without exposing the raw
  // database identifier. The request-source row retains the real identity.
  const citationKey = `${candidate.kind}_${sha256Hex(`${candidate.kind}:${candidate.stableSourceId}`).slice(0, 16)}`;
  const title = sanitizedEvidence(candidate.title);
  if (!title) throw new ContextRegistryError("invalid_projection", "Registry projection title is empty.");
  const source: ContextToolSource = {
    citationKey,
    kind: candidate.kind,
    title,
    releaseMetadata: {
      releasedAt: candidate.releaseAt.toISOString(),
      versionDigest: candidate.sourceVersionDigest,
    },
    evidenceSegments: [],
    limitations: [...(candidate.limitations ?? [])].map(sanitizedEvidence).filter(Boolean),
  };
  let usedBytes = 0;
  let truncated = false;
  for (const rawSegment of candidate.evidenceSegments) {
    const segment = sanitizedEvidence(rawSegment);
    if (!segment) continue;
    const bytes = Buffer.byteLength(segment, "utf8");
    if (usedBytes + bytes > maxBytes) {
      truncated = true;
      break;
    }
    source.evidenceSegments.push(segment);
    usedBytes += bytes;
  }
  if (source.evidenceSegments.length === 0) {
    source.limitations = [...source.limitations, "Bukti teks yang dirilis tidak tersedia."];
  }
  return { source, truncated };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ContextRegistryError("timeout", "Registry context lookup timed out.")), timeoutMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error: unknown) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export async function executeContextRegistry(input: {
  studentId: string;
  toolArguments: unknown;
  source: ContextRegistrySource;
  now?: Date;
  timeoutMs?: number;
  maxSourceBytes?: number;
}): Promise<ContextRegistryExecution> {
  if (!input.studentId.trim()) throw new VeraContractError("context_release_unavailable", "Otoritas siswa tidak tersedia.", 403);
  const args = parseRetrieveReleasedLearningContextArgs(input.toolArguments);
  const now = input.now ?? new Date();
  const timeoutMs = input.timeoutMs ?? VERA_CONTEXT_REGISTRY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new VeraContractError("context_release_unavailable", "Batas waktu registry tidak valid.", 422);
  const maxSourceBytes = input.maxSourceBytes ?? 6_000;
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1 || maxSourceBytes > 6_000) throw new VeraContractError("context_release_unavailable", "Batas byte sumber tidak valid.", 422);
  const loaders: Record<VeraContextKind, () => Promise<readonly ContextRegistryCandidate[]>> = {
    materi: () => input.source.listMateri({ studentId: input.studentId, now }),
    kuis: () => input.source.listKuis({ studentId: input.studentId, now }),
    tryout: () => input.source.listTryout({ studentId: input.studentId, now }),
  };
  const loaded = await withTimeout(Promise.all(args.kinds.map((kind) => loaders[kind]())), timeoutMs);
  const candidates = loaded.flat();
  const authorized = candidates.filter((candidate) => authorizationAllows(candidate, input.studentId, now));
  const terms = tokenizeContextQuery(args.query);
  const ranked = rankContextCandidates(authorized, args.query, now).slice(0, Math.min(args.maxSources, VERA_CONTEXT_REGISTRY_MAX_SOURCES));
  const sources: ContextToolSource[] = [];
  let truncationCount = 0;
  for (const entry of ranked) {
    const projected = projectCandidate(entry.candidate, maxSourceBytes);
    if (projected.truncated) truncationCount += 1;
    sources.push(projected.source);
  }
  const limitations = sources.length === 0
    ? ["Tidak ada bukti belajar yang dirilis dan dapat kamu akses untuk permintaan ini."]
    : [];
  return {
    args,
    terms,
    ranked,
    result: createContextToolResult({
      registryVersion: VERA_CONTEXT_REGISTRY_VERSION,
      sources,
      limitations,
      truncationCount,
    }),
  };
}

type LooseQueryClient = {
  module: { findMany(args: unknown): Promise<readonly unknown[]> };
  standaloneQuizAttempt: { findMany(args: unknown): Promise<readonly unknown[]> };
  tryoutAttempt: { findMany(args: unknown): Promise<readonly unknown[]> };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  return null;
}

function digestValue(value: unknown): string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value) ? value : sha256Hex(String(value ?? "missing"));
}

/**
 * Prisma-backed source adapter. The query remains a closed projection: it
 * selects only release metadata and fields needed for learner-visible result
 * summaries, never answer keys, ranking rows, or arbitrary table filters.
 */
export function createPrismaContextRegistry(db: unknown): ContextRegistrySource {
  const client = db as LooseQueryClient;
  return {
    async listMateri({ now }) {
      const rows = await client.module.findMany({
        where: { status: "published", publishedAt: { lte: now }, assets: { some: { bodyText: { not: null } } } },
        select: { id: true, title: true, summary: true, publishedAt: true, topic: { select: { name: true } }, assets: { where: { bodyText: { not: null } }, orderBy: { sortOrder: "asc" }, select: { title: true, bodyText: true } } },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      });
      return rows.flatMap((raw) => {
        const row = record(raw);
        const id = stringValue(row.id);
        const title = stringValue(row.title);
        const publishedAt = dateValue(row.publishedAt);
        if (!id || !title || !publishedAt) return [];
        const topic = stringValue(record(row.topic).name);
        const assets = Array.isArray(row.assets) ? row.assets.map(record) : [];
        const segments = [stringValue(row.summary), ...assets.map((asset) => {
          const body = stringValue(asset.bodyText);
          const heading = stringValue(asset.title);
          return body ? [heading, body].filter((part): part is string => Boolean(part)).join("\n") : null;
        })].filter((part): part is string => Boolean(part));
        try {
          resolvePublishedMateri({ sourceId: id, title, topic: topic ?? "", bodyExcerpt: segments.join("\n"), published: true, visibleToStudent: true });
        } catch {
          return [];
        }
        return [{ kind: "materi" as const, stableSourceId: id, title, topic, releaseAt: publishedAt, sourceVersionDigest: sha256Hex(JSON.stringify({ id, publishedAt: publishedAt.toISOString(), segments })), evidenceSegments: segments, authorization: { published: true, released: true, scored: true, visibleToStudent: true } }];
      });
    },
    async listKuis({ studentId, now }) {
      const rows = await client.standaloneQuizAttempt.findMany({
        where: { participation: { studentId }, status: "scored", scoringState: "scored", releaseState: "released" },
        select: {
          id: true,
          score: true,
          correctCount: true,
          wrongCount: true,
          unansweredCount: true,
          releaseAt: true,
          policySnapshot: true,
          participation: {
            select: {
              studentId: true,
              quiz: {
                select: {
                  title: true,
                  description: true,
                  reviewTiming: true,
                  correctAnswerVisibility: true,
                  closesAt: true,
                  items: {
                    orderBy: { sortOrder: "asc" },
                    select: { sourceQuestion: { select: { topic: { select: { name: true } } } } },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ releaseAt: "desc" }, { id: "asc" }],
      });
      return rows.flatMap((raw) => {
        const row = record(raw);
        const participation = record(row.participation);
        const quiz = record(participation.quiz);
        const id = stringValue(row.id);
        const title = stringValue(quiz.title);
        const releaseAt = dateValue(row.releaseAt);
        const owner = stringValue(participation.studentId);
        if (!id || !title || !releaseAt || !owner) return [];
        const snapshot = record(row.policySnapshot);
        const reviewTiming = stringValue(snapshot.reviewTiming) ?? stringValue(quiz.reviewTiming) ?? "never";
        const correctVisibility = stringValue(snapshot.correctAnswerVisibility) ?? stringValue(quiz.correctAnswerVisibility) ?? "hide";
        const closeAt = dateValue(snapshot.closesAt) ?? dateValue(quiz.closesAt);
        const reviewAvailable = reviewTiming === "immediate" || (reviewTiming === "after_close" && Boolean(closeAt && closeAt <= now));
        const correctnessVisible = reviewAvailable && correctVisibility === "show";
        const topics = Array.isArray(quiz.items) ? quiz.items.map((item) => stringValue(record(record(item).sourceQuestion).topic && record(record(record(item).sourceQuestion).topic).name)).filter((value): value is string => Boolean(value)) : [];
        const score = row.score === null || row.score === undefined ? "Skor dirilis." : `Skor yang dirilis: ${String(row.score)}`;
        const summary = [score, row.correctCount === null || row.correctCount === undefined ? null : `Jawaban benar: ${String(row.correctCount)}`, row.wrongCount === null || row.wrongCount === undefined ? null : `Jawaban salah: ${String(row.wrongCount)}`, row.unansweredCount === null || row.unansweredCount === undefined ? null : `Tidak terjawab: ${String(row.unansweredCount)}`].filter((part): part is string => Boolean(part));
        try {
          resolveCompletedKuis({ sourceId: id, studentId: owner, title, reviewAvailable, releaseState: "released", scoringState: "scored", correctAnswerVisibility: correctnessVisible ? "show" : "hide", resultSummary: summary.join("; "), wrongCorrectPattern: summary.join("; "), questionTopicIdentity: topics, releasedExplanations: [] }, owner);
        } catch {
          return [];
        }
        return [{ kind: "kuis" as const, stableSourceId: id, title, topic: topics.join(", "), releaseAt, sourceVersionDigest: sha256Hex(JSON.stringify({ id, releaseAt: releaseAt.toISOString(), score: row.score, reviewAvailable, correctnessVisible })), evidenceSegments: [...summary, stringValue(quiz.description)].filter((part): part is string => Boolean(part)), limitations: correctnessVisible ? [] : ["Kunci jawaban atau ulasan lengkap belum dirilis."], authorization: { ownerStudentId: owner, published: true, released: true, scored: true, reviewAvailable, correctAnswersVisible: correctnessVisible, visibleToStudent: true } }];
      });
    },
    async listTryout({ studentId }) {
      const rows = await client.tryoutAttempt.findMany({
        where: { studentId, status: "scored", scoringState: "scored", releaseState: "released" },
        select: { id: true, score: true, wrongCount: true, unansweredCount: true, releaseAt: true, assessmentReleaseId: true, assessmentReleaseNumber: true, assessmentReleaseDigest: true, deliverySession: { select: { assessmentReleaseId: true, releaseState: true, releasedAt: true, rankingRule: true } }, assessmentRelease: { select: { id: true, releaseNumber: true, contentDigest: true, publishedAt: true } }, tryout: { select: { title: true } }, runs: { select: { assessmentReleaseId: true, assessmentReleaseNumber: true, assessmentReleaseDigest: true, status: true, scoringState: true, calculationReleaseable: true, wrongCount: true, unansweredCount: true } }, scoreBreakdowns: { select: { subtestId: true, normalizedScore: true, wrongCount: true, unansweredCount: true } } },
        orderBy: [{ releaseAt: "desc" }, { id: "asc" }],
      });
      return rows.flatMap((raw) => {
        const row = record(raw);
        const id = stringValue(row.id);
        const title = stringValue(record(row.tryout).title);
        const releaseAt = dateValue(row.releaseAt) ?? dateValue(record(row.deliverySession).releasedAt);
        const release = record(row.assessmentRelease);
        const session = record(row.deliverySession);
        const bindingValid = Boolean(stringValue(row.assessmentReleaseId) && stringValue(row.assessmentReleaseDigest) && Number.isInteger(row.assessmentReleaseNumber) && stringValue(session.assessmentReleaseId) === row.assessmentReleaseId && stringValue(release.id) === row.assessmentReleaseId && stringValue(release.contentDigest) === row.assessmentReleaseDigest && release.releaseNumber === row.assessmentReleaseNumber);
        const runs = Array.isArray(row.runs) ? row.runs.map(record) : [];
        const breakdowns = Array.isArray(row.scoreBreakdowns) ? row.scoreBreakdowns.map(record) : [];
        const ready = row.score !== null && row.score !== undefined
          && bindingValid
          && runs.length > 0
          && breakdowns.length > 0
          && runs.every((run) => (run.status === "sealed" || run.status === "expired") && run.scoringState === "scored" && run.calculationReleaseable === true && run.assessmentReleaseId === row.assessmentReleaseId && run.assessmentReleaseNumber === row.assessmentReleaseNumber && run.assessmentReleaseDigest === row.assessmentReleaseDigest);
        if (!id || !title || !releaseAt) return [];
        const score = row.score === null || row.score === undefined ? "Hasil Tryout dirilis." : `Skor akhir yang dirilis: ${String(row.score)}`;
        const summary = [score, row.wrongCount === null || row.wrongCount === undefined ? null : `Jawaban salah: ${String(row.wrongCount)}`, row.unansweredCount === null || row.unansweredCount === undefined ? null : `Tidak terjawab: ${String(row.unansweredCount)}`, `Subtes dirilis: ${String(breakdowns.length)}`].filter((part): part is string => Boolean(part));
        try {
          resolveCompletedTryout({ sourceId: id, studentId, title, scoreVisible: row.score !== null && row.score !== undefined, releaseState: session.releaseState === "released" ? "released" : "unreleased", scoringState: "scored", readiness: ready ? "ready" : "pending", subtestScores: breakdowns.map((breakdown) => String(breakdown.normalizedScore ?? "")), releasedBreakdown: summary, timingSummary: "Waktu pengerjaan yang dirilis.", wrongAnswerReferences: [], releaseBindingValid: bindingValid }, studentId);
        } catch {
          return [];
        }
        return [{ kind: "tryout" as const, stableSourceId: id, title, releaseAt, sourceVersionDigest: digestValue(row.assessmentReleaseDigest), evidenceSegments: summary, limitations: ["Peringkat peserta dan data peserta lain tidak tersedia."], authorization: { ownerStudentId: studentId, published: true, released: session.releaseState === "released", scored: true, ready, releaseBindingValid: bindingValid, visibleToStudent: true } }];
      });
    },
  };
}

import {
  createContextToolResult,
  parseRetrieveReleasedLearningContextArgs,
  type ContextToolSource,
  type RetrieveReleasedLearningContextArgs,
  type VeraContextKind,
  VERA_CONTEXT_REGISTRY_VERSION,
} from "./context-tool-contracts";
import { canonicalJson, normalizeText, sha256Hex, VeraContractError } from "./contracts";
import { resolveAutomaticKuis, resolveAutomaticTryout, resolvePublishedMateri } from "./context-resolvers";
import { hasCanonicalSevenBreakdownSet, hasCanonicalSevenRunSet } from "@/lib/tryout/result-repository";
import { isMateriReady, readMateriResources } from "@/lib/materi/contract";

export const VERA_CONTEXT_REGISTRY_MAX_SOURCES = 4 as const;
export const VERA_CONTEXT_REGISTRY_MAX_TERMS = 8 as const;
export const VERA_CONTEXT_REGISTRY_TIMEOUT_MS = 1_500 as const;

export type ContextRegistryAuthorization = {
  ownerStudentId?: string | null;
  published: boolean;
  released: boolean;
  scored?: boolean;
  scoreFactsOnly?: boolean;
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
  /** Internal optimistic release handle used to revalidate a phase-one row. */
  releaseVersionHandle?: string;
  evidenceSegments: string[];
  limitations?: string[];
  authorization: ContextRegistryAuthorization;
};

export type ContextRegistrySource = {
  listMateri(input: { studentId: string; now: Date; sourceIds?: readonly string[] }): Promise<readonly ContextRegistryCandidate[]>;
  listKuis(input: { studentId: string; now: Date; sourceIds?: readonly string[] }): Promise<readonly ContextRegistryCandidate[]>;
  listTryout(input: { studentId: string; now: Date; sourceIds?: readonly string[] }): Promise<readonly ContextRegistryCandidate[]>;
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
  const seenTerms = new Set<string>();
  for (const term of normalized.split(/\s+/u)) {
    if (term && !seenTerms.has(term)) {
      seenTerms.add(term);
      terms.push(term);
    }
    if (terms.length === VERA_CONTEXT_REGISTRY_MAX_TERMS) break;
  }
  return terms;
}

function sanitizedEvidence(value: string): string {
  return normalizeText(value)
    .replace(/<[^>]*>/gu, "")
    .replace(/(?:javascript:|data:|https?:\/\/)[^\s]+/giu, "[tautan dihapus]")
    .replace(/(?:sk|pk|api)[_-][a-z0-9_-]{12,}/giu, "[redacted]")
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
  if (candidate.kind === "kuis" && authority.scoreFactsOnly !== true
    && (authority.reviewAvailable !== true || authority.correctAnswersVisible !== true)) return false;
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
      const topicTerms = new Set(topic.split(/\s+/u));
      const metadata = candidateMetadata(candidate);
      const metadataTerms = new Set(metadata.split(/\s+/u).filter(Boolean));
      const exactTitle = title === normalizedQuery;
      const titlePrefix = !exactTitle && Boolean(normalizedQuery) && title.startsWith(normalizedQuery);
      const topicTermScore = terms.reduce((score, term) => score + Number(topicTerms.has(term)), 0);
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

/** Project an already reauthorized phase-two candidate without ranking or
 * widening the set. Local Respan decisions supply the selected order. */
export function projectLocalContextCandidate(
  candidate: ContextRegistryCandidate,
  maxBytes = 6_000,
): { source: ContextToolSource; truncated: boolean } {
  return projectCandidate(candidate, maxBytes);
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

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

type CanonicalRunSetInput = Parameters<typeof hasCanonicalSevenRunSet>[0];
type CanonicalBreakdownSetInput = Parameters<typeof hasCanonicalSevenBreakdownSet>[0];
type CanonicalRun = CanonicalRunSetInput["runs"][number];
type CanonicalBreakdown = CanonicalBreakdownSetInput["breakdowns"][number];

function canonicalSections(value: unknown): CanonicalRunSetInput["tryout"]["sections"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const section = record(entry);
    const id = stringValue(section.id);
    const subtestId = stringValue(section.subtestId);
    const sequenceNo = integerValue(section.sequenceNo);
    return id && subtestId && sequenceNo !== null ? [{ id, sequenceNo, subtestId }] : [];
  });
}

function canonicalRuns(value: unknown): CanonicalRun[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const run = record(entry);
    const section = record(run.section);
    const id = stringValue(section.id);
    const tryoutId = stringValue(section.tryoutId);
    const subtestId = stringValue(section.subtestId);
    const sequenceNo = integerValue(run.sequenceNo);
    const sectionSequenceNo = integerValue(section.sequenceNo);
    const tryoutSectionId = stringValue(run.tryoutSectionId);
    return id && tryoutId && subtestId && sequenceNo !== null && sectionSequenceNo !== null && tryoutSectionId
      ? [{ sequenceNo, tryoutSectionId, section: { id, sequenceNo: sectionSequenceNo, subtestId, tryoutId } }]
      : [];
  });
}

function canonicalBreakdowns(value: unknown): CanonicalBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const breakdown = record(entry);
    const subtestId = stringValue(breakdown.subtestId);
    const scoringProvenance = stringValue(breakdown.scoringProvenance);
    if (!subtestId || !scoringProvenance) return [];
    return [{
      normalizedScore: breakdown.normalizedScore === null || breakdown.normalizedScore === undefined
        ? null
        : breakdown.normalizedScore as CanonicalBreakdown["normalizedScore"],
      rawScore: breakdown.rawScore === null || breakdown.rawScore === undefined
        ? null
        : breakdown.rawScore as CanonicalBreakdown["rawScore"],
      scaledScore: breakdown.scaledScore === null || breakdown.scaledScore === undefined
        ? null
        : breakdown.scaledScore as CanonicalBreakdown["scaledScore"],
      scoringProvenance: scoringProvenance as CanonicalBreakdown["scoringProvenance"],
      scoringVersion: stringValue(breakdown.scoringVersion),
      subtestId,
    }];
  });
}

/**
 * Prisma-backed source adapter. The query remains a closed projection: it
 * selects only release metadata and fields needed for learner-visible result
 * summaries, never answer keys, ranking rows, or arbitrary table filters.
 */
export function createPrismaContextRegistry(db: unknown): ContextRegistrySource {
  const client = db as LooseQueryClient;
  return {
    async listMateri({ now, sourceIds }) {
      const rows = await client.module.findMany({
        where: { status: "published", publishedAt: { lte: now }, ...(sourceIds ? { id: { in: [...sourceIds] } } : {}), assets: { some: { assetType: "attachment", mimeType: "application/pdf" } } },
        select: { id: true, title: true, summary: true, publishedAt: true, updatedAt: true, topic: { select: { name: true, code: true, isActive: true, parentTopicId: true, subtest: { select: { code: true, isActive: true } } } }, assets: { orderBy: { sortOrder: "asc" }, select: { id: true, assetType: true, sourceKind: true, managedAssetId: true, title: true, bodyText: true, mediaUrl: true, mimeType: true, originalName: true, durationSeconds: true, createdAt: true, managedAsset: { select: { libraryScope: true, state: true, trashedAt: true, mimeType: true, objectKey: true, originalName: true } } } } },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        ...(sourceIds ? { take: sourceIds.length } : {}),
      });
      return rows.flatMap((raw) => {
        const row = record(raw);
        const id = stringValue(row.id);
        const title = stringValue(row.title);
        const publishedAt = dateValue(row.publishedAt);
        if (!id || !title || !publishedAt) return [];
        const topicRow = record(row.topic);
        const topic = stringValue(topicRow.name);
        const assets = Array.isArray(row.assets) ? row.assets.map(record) : [];
        const resources = assets.map((asset) => ({
          assetType: stringValue(asset.assetType) ?? "",
          sourceKind: stringValue(asset.sourceKind),
          managedAssetId: stringValue(asset.managedAssetId),
          mediaUrl: stringValue(asset.mediaUrl),
          mimeType: stringValue(asset.mimeType),
          originalName: stringValue(asset.originalName),
          durationSeconds: integerValue(asset.durationSeconds),
          managedAsset: record(asset.managedAsset),
        }));
        if (!isMateriReady(title, readMateriResources(resources))) return [];
        const subtest = record(topicRow.subtest);
        const topicCode = stringValue(topicRow.code);
        if (topicRow.isActive !== true || topicRow.parentTopicId !== null || subtest.isActive !== true
          || !/^materi:[a-z0-9-]+:section-[123]$/u.test(topicCode ?? "")) return [];
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
        const updatedAt = dateValue(row.updatedAt);
        return [{ kind: "materi" as const, stableSourceId: id, title, topic, releaseAt: publishedAt, sourceVersionDigest: sha256Hex(JSON.stringify({ id, publishedAt: publishedAt.toISOString(), segments })), releaseVersionHandle: updatedAt?.toISOString(), evidenceSegments: segments, authorization: { published: true, released: true, scored: true, visibleToStudent: true } }];
      });
    },
    async listKuis({ studentId, now, sourceIds }) {
      const rows = await client.standaloneQuizAttempt.findMany({
        where: {
          participation: { studentId, quiz: { status: "published" } },
          status: "scored",
          scoringState: "scored",
          releaseState: "released",
          releaseAt: { lte: now },
          ...(sourceIds ? { id: { in: [...sourceIds] } } : {}),
        },
        select: {
          id: true,
          status: true,
          scoringState: true,
          releaseState: true,
          score: true,
          correctCount: true,
          wrongCount: true,
          unansweredCount: true,
          releaseAt: true,
          updatedAt: true,
          policySnapshot: true,
          participation: {
            select: {
              studentId: true,
              quiz: {
                select: {
                  status: true,
                  title: true,
                  updatedAt: true,
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
        ...(sourceIds ? { take: sourceIds.length } : {}),
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
        const quizPublished = quiz.status === "published";
        const released = row.releaseState === "released";
        const scored = row.status === "scored" && row.scoringState === "scored";
        const snapshot = record(row.policySnapshot);
        const reviewTiming = stringValue(snapshot.reviewTiming) ?? stringValue(quiz.reviewTiming) ?? "never";
        const correctVisibility = stringValue(snapshot.correctAnswerVisibility) ?? stringValue(quiz.correctAnswerVisibility) ?? "hide";
        const closeAt = dateValue(snapshot.closesAt) ?? dateValue(quiz.closesAt);
        const reviewAvailable = reviewTiming === "immediate" || (reviewTiming === "after_close" && Boolean(closeAt && closeAt <= now));
        const correctnessVisible = reviewAvailable && correctVisibility === "show";
        const topics = Array.isArray(quiz.items) ? quiz.items.map((item) => stringValue(record(record(item).sourceQuestion).topic && record(record(record(item).sourceQuestion).topic).name)).filter((value): value is string => Boolean(value)) : [];
        const score = row.score === null || row.score === undefined ? "Skor dirilis." : `Skor yang dirilis: ${String(row.score)}`;
        const summary = [score, row.correctCount === null || row.correctCount === undefined ? null : `Jawaban benar: ${String(row.correctCount)}`, row.wrongCount === null || row.wrongCount === undefined ? null : `Jawaban salah: ${String(row.wrongCount)}`, row.unansweredCount === null || row.unansweredCount === undefined ? null : `Tidak terjawab: ${String(row.unansweredCount)}`].filter((part): part is string => Boolean(part));
        const evidenceSegments = [...summary, ...(correctnessVisible ? [stringValue(quiz.description)] : [])].filter((part): part is string => Boolean(part));
        try {
          if (correctnessVisible) {
            resolveAutomaticKuis({ sourceId: id, studentId: owner, title, reviewAvailable, releaseState: released ? "released" : "unreleased", scoringState: scored ? "scored" : "pending", correctAnswerVisibility: "show", resultSummary: summary.join("; "), wrongCorrectPattern: summary.join("; "), questionTopicIdentity: topics, releasedExplanations: [] }, owner);
          }
        } catch {
          return [];
        }
        const limitations = correctnessVisible ? [] : ["Kunci jawaban atau ulasan lengkap belum dirilis."];
        const sourceVersionDigest = sha256Hex(canonicalJson({
          attempt: {
            id,
            releaseAt: releaseAt.toISOString(),
            releaseState: row.releaseState ?? null,
            scoringState: row.scoringState ?? null,
            status: row.status ?? null,
            score: row.score === null || row.score === undefined ? null : String(row.score),
            correctCount: row.correctCount ?? null,
            wrongCount: row.wrongCount ?? null,
            unansweredCount: row.unansweredCount ?? null,
          },
          quiz: {
            status: quiz.status ?? null,
            title,
            description: stringValue(quiz.description),
            reviewTiming,
            correctAnswerVisibility: correctVisibility,
            closesAt: closeAt?.toISOString() ?? null,
            topics,
          },
          reviewAvailable,
          correctnessVisible,
          evidenceSegments,
          limitations,
        }));
        const updatedAt = dateValue(row.updatedAt);
        const quizUpdatedAt = dateValue(quiz.updatedAt);
        const releaseVersionHandle = updatedAt && quizUpdatedAt ? new Date(Math.max(updatedAt.getTime(), quizUpdatedAt.getTime())).toISOString() : updatedAt?.toISOString();
        return [{ kind: "kuis" as const, stableSourceId: id, title, topic: topics.join(", "), releaseAt, sourceVersionDigest, releaseVersionHandle, evidenceSegments, limitations, authorization: { ownerStudentId: owner, published: quizPublished, released, scored, reviewAvailable, correctAnswersVisible: correctnessVisible, scoreFactsOnly: !correctnessVisible, visibleToStudent: true } }];
      });
    },
    async listTryout({ studentId, now, sourceIds }) {
      const rows = await client.tryoutAttempt.findMany({
        where: {
          studentId,
          status: "scored",
          scoringState: "scored",
          releaseState: "released",
          tryout: { status: "published", publishedAt: { lte: now } },
          deliverySession: {
            status: { in: ["active", "closed", "archived"] },
            releaseState: "released",
            assessmentReleaseId: { not: null },
            assignments: { some: { status: "active", admission: { status: "active", studentId } } },
          },
          assessmentRelease: { is: { publishedAt: { lte: now } } },
          ...(sourceIds ? { id: { in: [...sourceIds] } } : {}),
        },
        select: {
          id: true,
          tryoutId: true,
          deliverySessionId: true,
          admissionId: true,
          status: true,
          attemptState: true,
          scoringState: true,
          releaseState: true,
          score: true,
          wrongCount: true,
          unansweredCount: true,
          releaseAt: true,
          updatedAt: true,
          assessmentReleaseId: true,
          assessmentReleaseNumber: true,
          assessmentReleaseDigest: true,
          deliverySession: {
            select: {
              id: true,
              tryoutId: true,
              status: true,
              assessmentReleaseId: true,
              releaseState: true,
              releasedAt: true,
              rankingRule: true,
              assignments: {
                where: { status: "active", admission: { status: "active", studentId } },
                select: { id: true, admissionId: true, status: true, admission: { select: { studentId: true, status: true } } },
              },
            },
          },
          assessmentRelease: { select: { id: true, tryoutId: true, releaseNumber: true, contentDigest: true, publishedAt: true } },
          tryout: {
            select: {
              id: true,
              title: true,
              status: true,
              updatedAt: true,
              publishedAt: true,
              sections: { orderBy: { sequenceNo: "asc" }, select: { id: true, sequenceNo: true, subtestId: true } },
            },
          },
          runs: {
            select: {
              tryoutSectionId: true,
              sequenceNo: true,
              assessmentReleaseId: true,
              assessmentReleaseNumber: true,
              assessmentReleaseDigest: true,
              status: true,
              scoringState: true,
              calculationReleaseable: true,
              normalizedScore: true,
              section: { select: { id: true, sequenceNo: true, subtestId: true, tryoutId: true } },
            },
          },
          scoreBreakdowns: { select: { subtestId: true, normalizedScore: true, rawScore: true, scaledScore: true, scoringVersion: true, scoringProvenance: true, wrongCount: true, unansweredCount: true } },
        },
        orderBy: [{ releaseAt: "desc" }, { id: "asc" }],
        ...(sourceIds ? { take: sourceIds.length } : {}),
      });
      return rows.flatMap((raw) => {
        const row = record(raw);
        const id = stringValue(row.id);
        const tryout = record(row.tryout);
        const session = record(row.deliverySession);
        const release = record(row.assessmentRelease);
        const title = stringValue(tryout.title);
        const releaseAt = dateValue(row.releaseAt) ?? dateValue(session.releasedAt);
        const tryoutId = stringValue(row.tryoutId);
        const sessionId = stringValue(row.deliverySessionId);
        const admissionId = stringValue(row.admissionId);
        const tryoutPublishedAt = dateValue(tryout.publishedAt);
        const releasePublishedAt = dateValue(release.publishedAt);
        const packagePublished = tryout.status === "published" && Boolean(tryoutPublishedAt && tryoutPublishedAt <= now);
        const released = row.releaseState === "released" && session.releaseState === "released";
        const scored = row.status === "scored" && row.scoringState === "scored";
        const sessionStatus = stringValue(session.status);
        const sessionAvailable = sessionStatus === "active" || sessionStatus === "closed" || sessionStatus === "archived";
        const assignments = Array.isArray(session.assignments) ? session.assignments.map(record) : [];
        const participantValid = assignments.some((assignment) => {
          const admission = record(assignment.admission);
          return assignment.status === "active"
            && stringValue(assignment.admissionId) === admissionId
            && admission.status === "active"
            && admission.studentId === studentId;
        });
        const attemptReleaseId = stringValue(row.assessmentReleaseId);
        const attemptReleaseDigest = stringValue(row.assessmentReleaseDigest);
        const attemptReleaseNumber = integerValue(row.assessmentReleaseNumber);
        const bindingValid = Boolean(
          tryoutId
          && sessionId
          && packagePublished
          && sessionAvailable
          && released
          && participantValid
          && releasePublishedAt
          && releasePublishedAt <= now
          && attemptReleaseId
          && attemptReleaseDigest
          && attemptReleaseNumber !== null
          && stringValue(session.id) === sessionId
          && stringValue(session.tryoutId) === tryoutId
          && stringValue(session.assessmentReleaseId) === attemptReleaseId
          && stringValue(release.id) === attemptReleaseId
          && stringValue(release.tryoutId) === tryoutId
          && stringValue(release.contentDigest) === attemptReleaseDigest
          && release.releaseNumber === attemptReleaseNumber,
        );
        const runs = Array.isArray(row.runs) ? row.runs.map(record) : [];
        const breakdowns = Array.isArray(row.scoreBreakdowns) ? row.scoreBreakdowns.map(record) : [];
        const sections = canonicalSections(tryout.sections);
        const canonicalRunProjection = canonicalRuns(runs);
        const canonicalBreakdownProjection = canonicalBreakdowns(breakdowns);
        const canonicalRunSet = tryoutId ? hasCanonicalSevenRunSet({ tryoutId, tryout: { sections }, runs: canonicalRunProjection }) : false;
        const canonicalBreakdownSet = hasCanonicalSevenBreakdownSet({ tryout: { sections }, breakdowns: canonicalBreakdownProjection });
        const runsReleaseable = runs.every((run) => {
          const normalizedScore = run.normalizedScore;
          return (run.status === "sealed" || run.status === "expired")
            && run.scoringState === "scored"
            && run.calculationReleaseable === true
            && normalizedScore !== null
            && normalizedScore !== undefined
            && stringValue(run.assessmentReleaseId) === attemptReleaseId
            && integerValue(run.assessmentReleaseNumber) === attemptReleaseNumber
            && stringValue(run.assessmentReleaseDigest) === attemptReleaseDigest;
        });
        const ready = row.score !== null && row.score !== undefined
          && scored
          && bindingValid
          && canonicalRunSet
          && canonicalBreakdownSet
          && runsReleaseable;
        if (!id || !title || !releaseAt) return [];
        const score = row.score === null || row.score === undefined ? "Hasil Tryout dirilis." : `Skor akhir yang dirilis: ${String(row.score)}`;
        const breakdownSummary = breakdowns.map((breakdown) => {
          const subtestId = stringValue(breakdown.subtestId) ?? "unknown";
          const normalizedScore = breakdown.normalizedScore === null || breakdown.normalizedScore === undefined ? "n/a" : String(breakdown.normalizedScore);
          return `Subtes ${subtestId}: skor ${normalizedScore}`;
        });
        const summary = [score, row.wrongCount === null || row.wrongCount === undefined ? null : `Jawaban salah: ${String(row.wrongCount)}`, row.unansweredCount === null || row.unansweredCount === undefined ? null : `Tidak terjawab: ${String(row.unansweredCount)}`, ...breakdownSummary].filter((part): part is string => Boolean(part));
        try {
          if (!ready) return [];
          resolveAutomaticTryout({ sourceId: id, studentId, title, scoreVisible: true, releaseState: released ? "released" : "unreleased", scoringState: scored ? "scored" : "pending", readiness: "ready", subtestScores: breakdowns.map((breakdown) => String(breakdown.normalizedScore ?? "")), releasedBreakdown: summary, timingSummary: "Waktu pengerjaan yang dirilis.", wrongAnswerReferences: [], releaseBindingValid: true }, studentId);
        } catch {
          return [];
        }
        const limitations = ["Peringkat peserta dan data peserta lain tidak tersedia."];
        const sourceVersionDigest = sha256Hex(canonicalJson({
          attempt: {
            id,
            tryoutId,
            deliverySessionId: sessionId,
            admissionId,
            status: row.status ?? null,
            scoringState: row.scoringState ?? null,
            releaseState: row.releaseState ?? null,
            score: row.score === null || row.score === undefined ? null : String(row.score),
            releaseAt: releaseAt.toISOString(),
          },
          tryout: {
            id: tryout.id ?? null,
            title,
            status: tryout.status ?? null,
            publishedAt: tryoutPublishedAt?.toISOString() ?? null,
            sections,
          },
          session: {
            id: session.id ?? null,
            status: session.status ?? null,
            releaseState: session.releaseState ?? null,
            releasedAt: dateValue(session.releasedAt)?.toISOString() ?? null,
            assessmentReleaseId: session.assessmentReleaseId ?? null,
          },
          assessmentRelease: {
            id: release.id ?? null,
            tryoutId: release.tryoutId ?? null,
            releaseNumber: release.releaseNumber ?? null,
            contentDigest: release.contentDigest ?? null,
            publishedAt: releasePublishedAt?.toISOString() ?? null,
          },
          runs: runs.map((run) => ({
            tryoutSectionId: run.tryoutSectionId ?? null,
            sequenceNo: run.sequenceNo ?? null,
            status: run.status ?? null,
            scoringState: run.scoringState ?? null,
            calculationReleaseable: run.calculationReleaseable ?? null,
            normalizedScore: run.normalizedScore === null || run.normalizedScore === undefined ? null : String(run.normalizedScore),
            assessmentReleaseId: run.assessmentReleaseId ?? null,
            assessmentReleaseNumber: run.assessmentReleaseNumber ?? null,
            assessmentReleaseDigest: run.assessmentReleaseDigest ?? null,
          })),
          breakdowns: breakdowns.map((breakdown) => ({
            subtestId: breakdown.subtestId ?? null,
            normalizedScore: breakdown.normalizedScore === null || breakdown.normalizedScore === undefined ? null : String(breakdown.normalizedScore),
            rawScore: breakdown.rawScore === null || breakdown.rawScore === undefined ? null : String(breakdown.rawScore),
            scaledScore: breakdown.scaledScore === null || breakdown.scaledScore === undefined ? null : String(breakdown.scaledScore),
            scoringVersion: breakdown.scoringVersion ?? null,
            scoringProvenance: breakdown.scoringProvenance ?? null,
            wrongCount: breakdown.wrongCount ?? null,
            unansweredCount: breakdown.unansweredCount ?? null,
          })),
          evidenceSegments: summary,
          limitations,
        }));
        const updatedAt = dateValue(row.updatedAt);
        const tryoutUpdatedAt = dateValue(tryout.updatedAt);
        const releaseVersionHandle = updatedAt && tryoutUpdatedAt ? new Date(Math.max(updatedAt.getTime(), tryoutUpdatedAt.getTime())).toISOString() : updatedAt?.toISOString();
        return [{ kind: "tryout" as const, stableSourceId: id, title, releaseAt, sourceVersionDigest, releaseVersionHandle, evidenceSegments: summary, limitations, authorization: { ownerStudentId: studentId, published: packagePublished, released, scored, ready, releaseBindingValid: bindingValid, visibleToStudent: true } }];
      });
    },
  };
}

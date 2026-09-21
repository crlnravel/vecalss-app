import "server-only";

import { AiConversationType } from "@/generated/prisma/client";

import {
  assertMvpFeatureEnabled,
  canonicalJson,
  sha256Hex,
  VeraContractError,
} from "./contracts";
import { VeraOutputValidationError } from "./output-validator";
import type { VeraStudioIdentityAuthority } from "./studio-authority";

export const VERA_STUDIO_TOOL_IDS = ["analysis", "route", "review"] as const;
export const VERA_DEFERRED_STUDIO_TOOL_IDS = ["ptn", "summary", "drill"] as const;
export type VeraMvpStudioToolId = (typeof VERA_STUDIO_TOOL_IDS)[number];
/** Compatibility input type. Deferred values are rejected by the server gate. */
export type VeraStudioToolId = VeraMvpStudioToolId | (typeof VERA_DEFERRED_STUDIO_TOOL_IDS)[number];

export type VeraStudioFeatureContract = {
  toolId: VeraStudioToolId;
  requestType: AiConversationType;
  featureKey: string;
  behaviorVersion: "1";
  outputSchemaVersion: "1" | "2";
  contextPackVersion: "1";
  contextMode: "chat_review" | "analysis_route";
  schemaId: string;
  schemaHash: string;
};

const featureSeed = (
  toolId: VeraMvpStudioToolId,
  requestType: AiConversationType,
  schemaId: VeraStudioFeatureContract["schemaId"],
  outputSchemaVersion: VeraStudioFeatureContract["outputSchemaVersion"],
  contextMode: VeraStudioFeatureContract["contextMode"],
): VeraStudioFeatureContract => ({
  toolId,
  requestType,
  featureKey: `vera.${toolId}`,
  behaviorVersion: "1",
  outputSchemaVersion,
  contextPackVersion: "1",
  contextMode,
  schemaId,
  schemaHash: sha256Hex(`strict-json-schema:${schemaId}`),
});

/** The only provider-backed Studio registry in the MVP. */
export const VERA_MVP_STUDIO_FEATURES: Readonly<Record<VeraMvpStudioToolId, VeraStudioFeatureContract>> = {
  analysis: featureSeed("analysis", AiConversationType.weakness_analysis, "vera.analysis.v1", "1", "analysis_route"),
  route: featureSeed("route", AiConversationType.vera_chat, "vera.route.v1", "1", "analysis_route"),
  review: featureSeed("review", AiConversationType.vera_chat, "vera.review.v2", "2", "chat_review"),
};

/**
 * Compatibility export for older callers and persisted payload tooling. This
 * is not a provider/query/durable allow-list: deferred entries are gated by
 * getVeraFeatureContract/validateStudioOutput before they can be used.
 */
export const VERA_STUDIO_FEATURES: Readonly<Record<VeraStudioToolId, VeraStudioFeatureContract>> = {
  ...VERA_MVP_STUDIO_FEATURES,
  ptn: {
    toolId: "ptn",
    requestType: AiConversationType.ptn_strategy,
    featureKey: "vera.ptn",
    behaviorVersion: "1",
    outputSchemaVersion: "1",
    contextPackVersion: "1",
    contextMode: "analysis_route",
    schemaId: "vera.ptn.schema.v1",
    schemaHash: sha256Hex("strict-json-schema:vera.ptn.schema.v1"),
  },
  summary: {
    toolId: "summary",
    requestType: AiConversationType.vera_chat,
    featureKey: "vera.summary",
    behaviorVersion: "1",
    outputSchemaVersion: "1",
    contextPackVersion: "1",
    contextMode: "chat_review",
    schemaId: "vera.summary.schema.v1",
    schemaHash: sha256Hex("strict-json-schema:vera.summary.schema.v1"),
  },
  drill: {
    toolId: "drill",
    requestType: AiConversationType.smart_drill,
    featureKey: "vera.drill",
    behaviorVersion: "1",
    outputSchemaVersion: "1",
    contextPackVersion: "1",
    contextMode: "analysis_route",
    schemaId: "vera.drill.schema.v1",
    schemaHash: sha256Hex("strict-json-schema:vera.drill.schema.v1"),
  },
};

const chatContract = {
  toolId: null,
  requestType: AiConversationType.vera_chat,
  featureKey: "vera.chat" as const,
  behaviorVersion: "1" as const,
  outputSchemaVersion: "freeform-1" as const,
  contextPackVersion: "1" as const,
  contextMode: "chat_review" as const,
  schemaId: "vera.chat.freeform.v1" as const,
  schemaHash: sha256Hex("vera.chat.freeform.v1"),
};

export function isVeraStudioToolId(value: unknown): value is VeraMvpStudioToolId {
  return typeof value === "string" && (VERA_STUDIO_TOOL_IDS as readonly string[]).includes(value);
}

function disabled(operation: string, surface: string): never {
  assertMvpFeatureEnabled(operation, surface);
  throw new VeraContractError("feature_disabled", "Fitur Vera belum tersedia di MVP.", 410, { operation, surface });
}

export function getVeraFeatureContract(kind: "chat" | "studio", toolId: string | null | undefined) {
  if (kind === "chat") {
    if (toolId !== null && toolId !== undefined) return disabled(toolId, "studio-contract");
    assertMvpFeatureEnabled("chat", "studio-contract");
    return chatContract;
  }
  if (!isVeraStudioToolId(toolId)) return disabled(typeof toolId === "string" ? toolId : "unmapped", "studio-contract");
  assertMvpFeatureEnabled(toolId, "studio-contract");
  return VERA_MVP_STUDIO_FEATURES[toolId];
}

type JsonRecord = Record<string, unknown>;

/**
 * Kept as a compatibility type for old persisted route rows. New MVP route
 * output never contains a save projection and all apply/materialize commands
 * are feature-gated.
 */
export type VeraRouteSaveProjection = {
  sourceActivityOrdinal: number;
  targetKind: "topic" | "module";
  targetId: string;
  topicId: string | null;
  moduleId: string | null;
  priority: number;
  rationale: string;
  rationaleDigest: string;
};

export type NormalizedStudioPayload = {
  toolId: VeraStudioToolId;
  schemaId: string;
  schemaHash: string;
  title: string;
  markdown: string;
  citationKeys: string[];
  payload: JsonRecord;
  saveProjection: VeraRouteSaveProjection | null;
  digest: string;
};

function fail(message: string): never {
  throw new VeraOutputValidationError(message);
}

function record(value: unknown, allowed: readonly string[], label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  const candidate = value as JsonRecord;
  const allowedSet = new Set(allowed);
  if (Object.keys(candidate).some((key) => !allowedSet.has(key))) fail(`${label} contains an unknown field.`);
  return candidate;
}

function text(value: unknown, label: string, maxBytes: number, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string") fail(`${label} must be text.`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || Buffer.byteLength(normalized, "utf8") > maxBytes) fail(`${label} is outside bounds.`);
  if (/<\/?[^>]+>|!\[[^\]]*\]\([^)]*\)|(?:javascript|data|vbscript):|https?:\/\//iu.test(normalized)) fail(`${label} contains unsafe Markdown.`);
  return normalized;
}

function uuid(value: unknown, label: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) fail(`${label} must be a UUID.`);
  return value.toLowerCase();
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) fail(`${label} is outside bounds.`);
  return value as number;
}

function decimal(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(`${label} is outside bounds.`);
  return value;
}

function list<T>(value: unknown, label: string, min: number, max: number, parser: (item: unknown, index: number) => T): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label} count is outside bounds.`);
  return value.map(parser);
}

function citationList(value: unknown, allowed: Set<string>, label: string, min = 0, max = 8): string[] {
  const citations = list(value, label, min, max, (item) => {
    if (typeof item !== "string" || !/^(?:src|materi|kuis|tryout)_[A-Za-z0-9_-]{1,120}$/u.test(item) || !allowed.has(item)) fail(`${label} contains an unauthorized citation.`);
    return item;
  });
  if (new Set(citations).size !== citations.length) fail(`${label} contains duplicate citations.`);
  return [...citations].sort();
}

function withDigest(input: Omit<NormalizedStudioPayload, "digest">): NormalizedStudioPayload {
  return { ...input, digest: sha256Hex(canonicalJson(input)) };
}

export function assertNormalizedStudioPayload(value: unknown): NormalizedStudioPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Normalized Studio result is missing.");
  const candidate = value as Partial<NormalizedStudioPayload>;
  if (!isVeraStudioToolId(candidate.toolId)) fail("Normalized Studio tool is disabled or invalid.");
  const contract = VERA_STUDIO_FEATURES[candidate.toolId];
  if (candidate.schemaId !== contract.schemaId || candidate.schemaHash !== contract.schemaHash) fail("Normalized Studio schema identity drifted.");
  if (typeof candidate.title !== "string" || typeof candidate.markdown !== "string" || !Array.isArray(candidate.citationKeys)
    || !candidate.payload || typeof candidate.payload !== "object" || Array.isArray(candidate.payload)
    || typeof candidate.digest !== "string") fail("Normalized Studio result is malformed.");
  const { digest, ...withoutDigest } = candidate as NormalizedStudioPayload;
  if (sha256Hex(canonicalJson(withoutDigest)) !== digest) fail("Normalized Studio digest mismatch.");
  return candidate as NormalizedStudioPayload;
}

export function validateStudioOutput(input: {
  toolId: VeraStudioToolId;
  structured: unknown;
  allowedCitationKeys: Iterable<string>;
  identityAuthority: VeraStudioIdentityAuthority;
}): NormalizedStudioPayload {
  if (!isVeraStudioToolId(input.toolId)) return disabled(input.toolId, "studio-output");
  assertMvpFeatureEnabled(input.toolId, "studio-output");
  const allowed = new Set(input.allowedCitationKeys);
  const contract = VERA_MVP_STUDIO_FEATURES[input.toolId];
  const finalize = (payload: NormalizedStudioPayload) => {
    assertStudioPayloadAuthority(payload, input.identityAuthority);
    return payload;
  };

  switch (input.toolId) {
    case "analysis": {
      const root = record(input.structured, ["title", "summaryMarkdown", "topics"], "analysis");
      const title = text(root.title, "analysis.title", 180)!;
      const summaryMarkdown = text(root.summaryMarkdown, "analysis.summaryMarkdown", 4_000)!;
      const topics = list(root.topics, "analysis.topics", 1, 12, (item, index) => {
        const row = record(item, ["topicId", "moduleId", "rank", "weaknessScore", "confidence", "evidenceCitationKeys", "limitations", "nextStep"], `analysis.topics[${index}]`);
        const rank = integer(row.rank, "analysis.rank", 1, 12);
        if (rank !== index + 1) fail("Analysis ranks must be contiguous.");
        return {
          topicId: uuid(row.topicId, "analysis.topicId")!,
          moduleId: row.moduleId === undefined ? null : uuid(row.moduleId, "analysis.moduleId", true),
          rank,
          weaknessScore: decimal(row.weaknessScore, "analysis.weaknessScore", 0, 100),
          confidence: decimal(row.confidence, "analysis.confidence", 0, 1),
          evidenceCitationKeys: citationList(row.evidenceCitationKeys, allowed, "analysis.evidenceCitationKeys", 1, 4),
          limitations: text(row.limitations, "analysis.limitations", 600)!,
          nextStep: text(row.nextStep, "analysis.nextStep", 600)!,
        };
      });
      if (new Set(topics.map((topic) => topic.topicId)).size !== topics.length) fail("Analysis topics must be unique.");
      const citationKeys = [...new Set(topics.flatMap((topic) => topic.evidenceCitationKeys))].sort();
      const payload = { title, summaryMarkdown, topics };
      return finalize(withDigest({ toolId: input.toolId, schemaId: contract.schemaId, schemaHash: contract.schemaHash, title, markdown: summaryMarkdown, citationKeys, payload, saveProjection: null }));
    }
    case "route": {
      const root = record(input.structured, ["schema", "activities", "limitations"], "route");
      if (root.schema !== "vera.route.v1") fail("route.schema is invalid.");
      const activities = list(root.activities, "route.activities", 0, 3, (item, index) => {
        const row = record(item, ["startDay", "endDay", "title", "rationale", "sourceKeys"], `route.activities[${index}]`);
        const startDay = integer(row.startDay, "route.startDay", 1, 7);
        const endDay = integer(row.endDay, "route.endDay", startDay, 7);
        return {
          startDay,
          endDay,
          title: text(row.title, "route.title", 160)!,
          rationale: text(row.rationale, "route.rationale", 500)!,
          sourceKeys: citationList(row.sourceKeys, allowed, "route.sourceKeys", 0, 4),
        };
      });
      const ordered = [...activities].sort((left, right) => left.startDay - right.startDay || left.endDay - right.endDay);
      if (canonicalJson(ordered) !== canonicalJson(activities)) fail("Route activities must be sorted by day span.");
      const limitations = list(root.limitations, "route.limitations", 0, 3, (item) => text(item, "route.limitation", 240)!);
      const citationKeys = [...new Set(activities.flatMap((activity) => activity.sourceKeys))].sort();
      const title = "Rute belajar 7 hari";
      const markdown = activities.length
        ? activities.map((activity) => `Hari ${activity.startDay}-${activity.endDay}: ${activity.title}\n${activity.rationale}`).join("\n\n")
        : limitations.join("\n\n");
      const payload = { schema: "vera.route.v1" as const, activities, limitations };
      return finalize(withDigest({ toolId: input.toolId, schemaId: contract.schemaId, schemaHash: contract.schemaHash, title, markdown, citationKeys, payload, saveProjection: null }));
    }
    case "review": {
      if (!input.structured || typeof input.structured !== "object" || Array.isArray(input.structured)) fail("review must be an object.");
      const base = input.structured as JsonRecord;
      if (base.schema !== "vera.review.v2") fail("review.schema is invalid.");
      if (base.variant === "full") {
        const root = record(input.structured, ["schema", "variant", "questionId", "questionRevisionId", "misconception", "explanationSteps", "citations"], "review.full");
        const questionId = uuid(root.questionId, "review.questionId")!;
        const questionRevisionId = uuid(root.questionRevisionId, "review.questionRevisionId")!;
        const misconception = text(root.misconception, "review.misconception", 1_000)!;
        const explanationSteps = list(root.explanationSteps, "review.explanationSteps", 1, 5, (item, index) => {
          const step = record(item, ["title", "body"], `review.explanationSteps[${index}]`);
          return { title: text(step.title, "review.explanationStep.title", 120)!, body: text(step.body, "review.explanationStep.body", 1_000)! };
        });
        const citations = list(root.citations, "review.citations", 1, 8, (item, index) => {
          const citation = record(item, ["citationKey", "title"], `review.citations[${index}]`);
          const citationKey = citationList([citation.citationKey], allowed, "review.citationKey", 1, 1)[0]!;
          return { citationKey, title: text(citation.title, "review.citation.title", 240)! };
        });
        if (new Set(citations.map((citation) => citation.citationKey)).size !== citations.length) fail("review.citations contains duplicate citations.");
        const citationKeys = citations.map((citation) => citation.citationKey).sort();
        const payload = { schema: "vera.review.v2" as const, variant: "full" as const, questionId, questionRevisionId, misconception, explanationSteps, citations };
        const markdown = [misconception, ...explanationSteps.map((step, index) => `${index + 1}. ${step.title}: ${step.body}`)].join("\n\n");
        return finalize(withDigest({ toolId: input.toolId, schemaId: contract.schemaId, schemaHash: contract.schemaHash, title: "Bahas soal", markdown, citationKeys, payload, saveProjection: null }));
      }
      if (base.variant !== "evidence_limited") fail("review.variant is invalid.");
      const root = record(input.structured, ["schema", "variant", "limitations", "releasedEvidence", "safeNextStep"], "review.evidence_limited");
      const limitations = list(root.limitations, "review.limitations", 1, 3, (item) => text(item, "review.limitation", 240)!);
      const releasedEvidence = list(root.releasedEvidence, "review.releasedEvidence", 1, 4, (item, index) => {
        const evidence = record(item, ["citationKey", "title", "kind", "description", "score", "digest"], `review.releasedEvidence[${index}]`);
        const citationKey = citationList([evidence.citationKey], allowed, "review.releasedEvidence.citationKey", 1, 1)[0]!;
        if (evidence.kind !== "materi" && evidence.kind !== "quiz" && evidence.kind !== "tryout") fail("review.releasedEvidence.kind is invalid.");
        const description = evidence.description === null ? null : text(evidence.description, "review.releasedEvidence.description", 1_000, true);
        const score = evidence.score === null ? null : decimal(evidence.score, "review.releasedEvidence.score", -1_000_000, 1_000_000);
        const digest = evidence.digest === null ? null : text(evidence.digest, "review.releasedEvidence.digest", 128, true);
        if (description === null && digest === null) fail("review.releasedEvidence needs description or digest.");
        return { citationKey, title: text(evidence.title, "review.releasedEvidence.title", 240)!, kind: evidence.kind, description, score, digest };
      });
      const safeNextStep = text(root.safeNextStep, "review.safeNextStep", 500)!;
      const citationKeys = releasedEvidence.map((evidence) => evidence.citationKey).sort();
      const payload = { schema: "vera.review.v2" as const, variant: "evidence_limited" as const, limitations, releasedEvidence, safeNextStep };
      const markdown = ["Bukti terbatas.", ...limitations, safeNextStep].join("\n\n");
      return finalize(withDigest({ toolId: input.toolId, schemaId: contract.schemaId, schemaHash: contract.schemaHash, title: "Bukti terbatas", markdown, citationKeys, payload, saveProjection: null }));
    }
  }
}

export function assertStudioPayloadAuthority(
  normalized: NormalizedStudioPayload,
  authority: VeraStudioIdentityAuthority,
): void {
  const payload = normalized.payload;
  const allowedTopics = new Set(authority.topicIds);
  const allowedModules = new Set(authority.moduleIds);
  const allowedQuestions = new Set(authority.questions.map((question) => `${question.questionId}:${question.questionRevisionId}`));
  const requireAllowed = (value: unknown, allowed: Set<string>, label: string) => {
    if (typeof value !== "string" || !allowed.has(value)) fail(`${label} is not authorized for this request.`);
  };
  const requireQuestion = (questionId: unknown, questionRevisionId: unknown, label: string) => {
    if (typeof questionId !== "string" || typeof questionRevisionId !== "string"
      || !allowedQuestions.has(`${questionId}:${questionRevisionId}`)) fail(`${label} is not authorized for this request.`);
  };

  switch (normalized.toolId) {
    case "analysis":
      for (const entry of payload.topics as Array<Record<string, unknown>>) {
        requireAllowed(entry.topicId, allowedTopics, "analysis.topicId");
        if (entry.moduleId !== null) requireAllowed(entry.moduleId, allowedModules, "analysis.moduleId");
      }
      break;
    case "route":
      // Route source keys have already been checked against the released
      // citation set before this authority pass. The route schema intentionally
      // carries no mutable topic/module IDs or save target.
      break;
    case "review":
      if (payload.variant === "full") requireQuestion(payload.questionId, payload.questionRevisionId, "review.questionRevisionId");
      break;
  }
}

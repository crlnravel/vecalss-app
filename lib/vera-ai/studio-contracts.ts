import "server-only";

import { AiConversationType } from "@/generated/prisma/client";

import { canonicalJson, sha256Hex } from "./contracts";
import { VeraOutputValidationError } from "./output-validator";
import type { VeraStudioIdentityAuthority } from "./studio-authority";

export const VERA_STUDIO_TOOL_IDS = ["analysis", "route", "review", "ptn", "summary", "drill"] as const;
export type VeraStudioToolId = (typeof VERA_STUDIO_TOOL_IDS)[number];

export type VeraStudioFeatureContract = {
  toolId: VeraStudioToolId;
  requestType: AiConversationType;
  featureKey: `vera.${VeraStudioToolId}`;
  behaviorVersion: "1";
  outputSchemaVersion: "1";
  contextPackVersion: "1";
  schemaId: `vera.${VeraStudioToolId}.schema.v1`;
  schemaHash: string;
};

const featureSeed = (toolId: VeraStudioToolId, requestType: AiConversationType): VeraStudioFeatureContract => {
  const schemaId = `vera.${toolId}.schema.v1` as const;
  return {
    toolId,
    requestType,
    featureKey: `vera.${toolId}`,
    behaviorVersion: "1",
    outputSchemaVersion: "1",
    contextPackVersion: "1",
    schemaId,
    schemaHash: sha256Hex(`strict-json-schema:${schemaId}`),
  };
};

export const VERA_STUDIO_FEATURES: Readonly<Record<VeraStudioToolId, VeraStudioFeatureContract>> = {
  analysis: featureSeed("analysis", AiConversationType.weakness_analysis),
  route: featureSeed("route", AiConversationType.vera_chat),
  review: featureSeed("review", AiConversationType.vera_chat),
  ptn: featureSeed("ptn", AiConversationType.ptn_strategy),
  summary: featureSeed("summary", AiConversationType.vera_chat),
  drill: featureSeed("drill", AiConversationType.smart_drill),
};

export function isVeraStudioToolId(value: unknown): value is VeraStudioToolId {
  return typeof value === "string" && (VERA_STUDIO_TOOL_IDS as readonly string[]).includes(value);
}

export function getVeraFeatureContract(kind: "chat" | "studio", toolId: string | null | undefined) {
  if (kind === "chat") {
    if (toolId !== null && toolId !== undefined) throw new VeraOutputValidationError("Chat cannot select a Studio tool.");
    return {
      toolId: null,
      requestType: AiConversationType.vera_chat,
      featureKey: "vera.chat" as const,
      behaviorVersion: "1" as const,
      outputSchemaVersion: "freeform-1" as const,
      contextPackVersion: "1" as const,
      schemaId: "vera.chat.freeform.v1" as const,
      schemaHash: sha256Hex("vera.chat.freeform.v1"),
    };
  }
  if (!isVeraStudioToolId(toolId)) throw new VeraOutputValidationError("Unknown Studio tool.");
  return VERA_STUDIO_FEATURES[toolId];
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, allowed: readonly string[], label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  const candidate = value as JsonRecord;
  if (Object.keys(candidate).some((key) => !allowed.includes(key))) fail(`${label} contains an unknown field.`);
  return candidate;
}

function text(value: unknown, label: string, max = 2_000, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string") fail(`${label} must be text.`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || Buffer.byteLength(normalized, "utf8") > max * 4) fail(`${label} is outside bounds.`);
  if (/<\/?[a-z][^>]*>|!\[[^\]]*\]\([^)]*\)|(?:javascript|data|vbscript):|https?:\/\//iu.test(normalized)) fail(`${label} contains unsafe Markdown.`);
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

function citationList(value: unknown, allowed: Set<string>, label: string, min = 0): string[] {
  const citations = list(value, label, min, 12, (item) => {
    if (typeof item !== "string" || !/^(?:src|materi|kuis|tryout)_[A-Za-z0-9_-]{1,72}$/.test(item) || !allowed.has(item)) fail(`${label} contains an unauthorized citation.`);
    return item;
  });
  if (new Set(citations).size !== citations.length) fail(`${label} contains duplicate citations.`);
  return [...citations].sort();
}

function fail(message: string): never {
  throw new VeraOutputValidationError(message);
}

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

export function assertNormalizedStudioPayload(value: unknown): NormalizedStudioPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Normalized Studio result is missing.");
  const candidate = value as Partial<NormalizedStudioPayload>;
  if (!isVeraStudioToolId(candidate.toolId)) fail("Normalized Studio tool is invalid.");
  const contract = VERA_STUDIO_FEATURES[candidate.toolId];
  if (candidate.schemaId !== contract.schemaId || candidate.schemaHash !== contract.schemaHash) fail("Normalized Studio schema identity drifted.");
  if (typeof candidate.title !== "string" || typeof candidate.markdown !== "string" || !Array.isArray(candidate.citationKeys)
    || !candidate.payload || typeof candidate.payload !== "object" || Array.isArray(candidate.payload)
    || typeof candidate.digest !== "string") fail("Normalized Studio result is malformed.");
  const { digest, ...withoutDigest } = candidate as NormalizedStudioPayload;
  if (sha256Hex(canonicalJson(withoutDigest)) !== digest) fail("Normalized Studio digest mismatch.");
  return candidate as NormalizedStudioPayload;
}

function withDigest(input: Omit<NormalizedStudioPayload, "digest">): NormalizedStudioPayload {
  return { ...input, digest: sha256Hex(canonicalJson(input)) };
}

export function validateStudioOutput(input: {
  toolId: VeraStudioToolId;
  structured: unknown;
  allowedCitationKeys: Iterable<string>;
  identityAuthority: VeraStudioIdentityAuthority;
}): NormalizedStudioPayload {
  const allowed = new Set(input.allowedCitationKeys);
  const contract = VERA_STUDIO_FEATURES[input.toolId];
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
          evidenceCitationKeys: citationList(row.evidenceCitationKeys, allowed, "analysis.evidenceCitationKeys", 1),
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
      const root = record(input.structured, ["title", "goal", "activities", "saveProjection"], "route");
      const title = text(root.title, "route.title", 180)!;
      const goal = text(root.goal, "route.goal", 1_000)!;
      const activities = list(root.activities, "route.activities", 1, 20, (item, index) => {
        const row = record(item, ["ordinal", "action", "estimatedMinutes", "topicIds", "moduleIds", "sourceIds", "citationKeys"], `route.activities[${index}]`);
        const ordinal = integer(row.ordinal, "route.ordinal", 1, 20);
        if (ordinal !== index + 1) fail("Route ordinals must be contiguous.");
        const ids = (value: unknown, label: string) => list(value, label, 0, 12, (entry) => uuid(entry, label)!).filter((entry, pos, all) => all.indexOf(entry) === pos).sort();
        return {
          ordinal,
          action: text(row.action, "route.action", 800)!,
          estimatedMinutes: integer(row.estimatedMinutes, "route.estimatedMinutes", 1, 480),
          topicIds: ids(row.topicIds, "route.topicIds"),
          moduleIds: ids(row.moduleIds, "route.moduleIds"),
          sourceIds: ids(row.sourceIds, "route.sourceIds"),
          citationKeys: citationList(row.citationKeys, allowed, "route.citationKeys"),
        };
      });
      let saveProjection: VeraRouteSaveProjection | null = null;
      if (root.saveProjection !== null) {
        const save = record(root.saveProjection, ["sourceActivityOrdinal", "targetKind", "targetId", "priority", "rationale"], "route.saveProjection");
        const sourceActivityOrdinal = integer(save.sourceActivityOrdinal, "route.saveProjection.sourceActivityOrdinal", 1, activities.length);
        if (save.targetKind !== "topic" && save.targetKind !== "module") fail("Route save target kind is invalid.");
        const targetId = uuid(save.targetId, "route.saveProjection.targetId")!;
        const activity = activities[sourceActivityOrdinal - 1]!;
        const candidates = save.targetKind === "topic" ? activity.topicIds : activity.moduleIds;
        if (!candidates.includes(targetId)) fail("Route save target is not present on the selected activity.");
        const rationale = text(save.rationale, "route.saveProjection.rationale", 1_200)!;
        saveProjection = {
          sourceActivityOrdinal,
          targetKind: save.targetKind,
          targetId,
          topicId: save.targetKind === "topic" ? targetId : null,
          moduleId: save.targetKind === "module" ? targetId : null,
          priority: integer(save.priority, "route.saveProjection.priority", 0, 100),
          rationale,
          rationaleDigest: sha256Hex(rationale),
        };
      }
      const citationKeys = [...new Set(activities.flatMap((activity) => activity.citationKeys))].sort();
      const markdown = [goal, ...activities.map((activity) => `${activity.ordinal}. ${activity.action} (${activity.estimatedMinutes} menit)`)].join("\n\n");
      const payload = { title, goal, activities, saveProjection };
      return finalize(withDigest({ toolId: input.toolId, schemaId: contract.schemaId, schemaHash: contract.schemaHash, title, markdown, citationKeys, payload, saveProjection }));
    }
    case "review": {
      const root = record(input.structured, ["title", "questionId", "questionRevisionId", "misconception", "explanationSteps", "citationKeys"], "review");
      const title = text(root.title, "review.title", 180)!;
      const payload = {
        title,
        questionId: uuid(root.questionId, "review.questionId")!,
        questionRevisionId: uuid(root.questionRevisionId, "review.questionRevisionId")!,
        misconception: text(root.misconception, "review.misconception", 1_000)!,
        explanationSteps: list(root.explanationSteps, "review.explanationSteps", 1, 12, (item) => text(item, "review.explanationStep", 800)!),
        citationKeys: citationList(root.citationKeys, allowed, "review.citationKeys", 1),
      };
      const markdown = [payload.misconception, ...payload.explanationSteps.map((step, index) => `${index + 1}. ${step}`)].join("\n\n");
      return finalize(withDigest({ toolId: input.toolId, schemaId: contract.schemaId, schemaHash: contract.schemaHash, title, markdown, citationKeys: payload.citationKeys, payload, saveProjection: null }));
    }
    case "ptn": {
      const root = record(input.structured, ["title", "universityId", "majorId", "scoreEvidence", "assumptions", "actions", "disclaimer", "citationKeys"], "ptn");
      const title = text(root.title, "ptn.title", 180)!;
      const payload = {
        title,
        universityId: root.universityId === undefined ? null : uuid(root.universityId, "ptn.universityId", true),
        majorId: root.majorId === undefined ? null : uuid(root.majorId, "ptn.majorId", true),
        scoreEvidence: decimal(root.scoreEvidence, "ptn.scoreEvidence", 0, 1_000),
        assumptions: list(root.assumptions, "ptn.assumptions", 1, 10, (item) => text(item, "ptn.assumption", 600)!),
        actions: list(root.actions, "ptn.actions", 1, 12, (item) => text(item, "ptn.action", 700)!),
        disclaimer: text(root.disclaimer, "ptn.disclaimer", 1_000)!,
        citationKeys: citationList(root.citationKeys, allowed, "ptn.citationKeys"),
      };
      const markdown = [...payload.actions.map((action, index) => `${index + 1}. ${action}`), payload.disclaimer].join("\n\n");
      return finalize(withDigest({ toolId: input.toolId, schemaId: contract.schemaId, schemaHash: contract.schemaHash, title, markdown, citationKeys: payload.citationKeys, payload, saveProjection: null }));
    }
    case "summary": {
      const root = record(input.structured, ["title", "focus", "decisions", "nextActions", "limitations", "citationKeys"], "summary");
      const title = text(root.title, "summary.title", 180)!;
      const payload = {
        title,
        focus: text(root.focus, "summary.focus", 1_200)!,
        decisions: list(root.decisions, "summary.decisions", 1, 12, (item) => text(item, "summary.decision", 700)!),
        nextActions: list(root.nextActions, "summary.nextActions", 1, 12, (item) => text(item, "summary.nextAction", 700)!),
        limitations: text(root.limitations, "summary.limitations", 800)!,
        citationKeys: citationList(root.citationKeys, allowed, "summary.citationKeys"),
      };
      const markdown = [payload.focus, ...payload.decisions.map((value) => `- ${value}`), ...payload.nextActions.map((value) => `- ${value}`), payload.limitations].join("\n\n");
      return finalize(withDigest({ toolId: input.toolId, schemaId: contract.schemaId, schemaHash: contract.schemaHash, title, markdown, citationKeys: payload.citationKeys, payload, saveProjection: null }));
    }
    case "drill": {
      const root = record(input.structured, ["title", "topicId", "items"], "drill");
      const title = text(root.title, "drill.title", 180)!;
      const topicId = uuid(root.topicId, "drill.topicId")!;
      const items = list(root.items, "drill.items", 1, 20, (item, index) => {
        const row = record(item, ["ordinal", "questionId", "questionRevisionId", "topicId", "difficulty", "explanationPlan"], `drill.items[${index}]`);
        const ordinal = integer(row.ordinal, "drill.ordinal", 1, 20);
        if (ordinal !== index + 1) fail("Drill ordinals must be contiguous.");
        if (!(["easy", "medium", "hard"] as unknown[]).includes(row.difficulty)) fail("Drill difficulty is invalid.");
        return {
          ordinal,
          questionId: uuid(row.questionId, "drill.questionId")!,
          questionRevisionId: uuid(row.questionRevisionId, "drill.questionRevisionId")!,
          topicId: uuid(row.topicId, "drill.item.topicId")!,
          difficulty: row.difficulty as "easy" | "medium" | "hard",
          explanationPlan: text(row.explanationPlan, "drill.explanationPlan", 800)!,
        };
      });
      if (new Set(items.map((item) => item.questionRevisionId)).size !== items.length) fail("Drill revisions must be unique.");
      if (items.some((item) => item.topicId !== topicId)) fail("Drill items must use the session topic.");
      const payload = { title, topicId, items };
      const markdown = `Drill siap dengan ${items.length} soal yang telah dirilis.`;
      return finalize(withDigest({ toolId: input.toolId, schemaId: contract.schemaId, schemaHash: contract.schemaHash, title, markdown, citationKeys: [], payload, saveProjection: null }));
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
  const allowedSources = new Set(authority.sourceIds);
  const allowedUniversities = new Set(authority.universityIds);
  const allowedMajors = new Set(authority.majorIds);
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
      for (const activity of payload.activities as Array<Record<string, unknown>>) {
        for (const topicId of activity.topicIds as unknown[]) requireAllowed(topicId, allowedTopics, "route.topicId");
        for (const moduleId of activity.moduleIds as unknown[]) requireAllowed(moduleId, allowedModules, "route.moduleId");
        for (const sourceId of activity.sourceIds as unknown[]) requireAllowed(sourceId, allowedSources, "route.sourceId");
      }
      if (normalized.saveProjection?.topicId) requireAllowed(normalized.saveProjection.topicId, allowedTopics, "route.saveProjection.topicId");
      if (normalized.saveProjection?.moduleId) requireAllowed(normalized.saveProjection.moduleId, allowedModules, "route.saveProjection.moduleId");
      break;
    case "review":
      requireQuestion(payload.questionId, payload.questionRevisionId, "review.questionRevisionId");
      break;
    case "ptn":
      if (payload.universityId !== null) requireAllowed(payload.universityId, allowedUniversities, "ptn.universityId");
      if (payload.majorId !== null) requireAllowed(payload.majorId, allowedMajors, "ptn.majorId");
      break;
    case "drill":
      requireAllowed(payload.topicId, allowedTopics, "drill.topicId");
      for (const item of payload.items as Array<Record<string, unknown>>) {
        requireQuestion(item.questionId, item.questionRevisionId, "drill.questionRevisionId");
        requireAllowed(item.topicId, allowedTopics, "drill.topicId");
      }
      break;
    case "summary":
      break;
  }
}

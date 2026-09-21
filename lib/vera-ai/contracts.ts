import "server-only";

import { createHmac, createHash } from "node:crypto";

import {
  AiIdempotencyOperation,
  AiIdempotencyState,
  AiRequestLifecycleState,
} from "@/generated/prisma/client";

export const VERA_POLICY_BUNDLE_VERSION = "vera-policy-bundle-v1-2026-08-24";
export const VERA_QUOTA_POLICY_VERSION = "vera-quota-v1-2026-08-24";
export const VERA_POLICY_EFFECTIVE_AT = "2026-09-01T00:00:00+07:00";
export const VERA_FINGERPRINT_KEY_VERSION = "vera-hmac-v1";
export const VERA_CONTEXT_PACK_VERSION = "1";
export const VERA_MAX_CONTEXT_SOURCES = 4;
export const VERA_MAX_CONTEXT_BLOCK_BYTES = 6_000;
export const VERA_MAX_HISTORY_PAIRS = 3;
export const VERA_MAX_HISTORY_MESSAGES = VERA_MAX_HISTORY_PAIRS * 2;
export const VERA_MAX_HISTORY_MESSAGE_BYTES = 1_500;
export const VERA_MAX_HISTORY_BYTES = 9_000;
export const VERA_MAX_CONVERSATION_PAGE_SIZE = 50;
export const VERA_MAX_PROVIDER_ATTEMPTS = 2;

export const VERA_INPUT_CERTIFIER_ID = "openrouter-utf8-byte-upper-bound-v1";
export const VERA_INPUT_SERIALIZER_ID = "vera-openrouter-chat-input-v1";
export const VERA_FIXED_FRAMING_TOKEN_BOUND = 512;

export const VERA_CONTEXT_MODE_BUDGETS = {
  chat_review: {
    maxSources: VERA_MAX_CONTEXT_SOURCES,
    maxBlockBytes: VERA_MAX_CONTEXT_BLOCK_BYTES,
    maxFinalInputBytes: 5_488,
    inputTokenCap: 6_000,
    outputTokenCap: 800,
  },
  analysis_route: {
    maxSources: VERA_MAX_CONTEXT_SOURCES,
    maxBlockBytes: VERA_MAX_CONTEXT_BLOCK_BYTES,
    maxFinalInputBytes: 9_488,
    inputTokenCap: 10_000,
    outputTokenCap: 1_200,
  },
} as const;

export type VeraContextMode = keyof typeof VERA_CONTEXT_MODE_BUDGETS;

export type VeraMvpFeature = "chat" | "review" | "analysis" | "route";

/**
 * The MVP allow-list is deliberately server-only and operation-based.  A
 * caller may pass a legacy/deferred operation here to get the same typed
 * 410 rejection at every boundary instead of relying on UI visibility.
 */
export function assertMvpFeatureEnabled(
  operation: string,
  surface: string,
): asserts operation is VeraMvpFeature {
  if (!(Object.keys(VERA_MVP_FEATURES) as string[]).includes(operation)) {
    throw new VeraContractError(
      "feature_disabled",
      `Fitur Vera ${operation || "tidak dikenal"} belum tersedia di MVP.`,
      410,
      { operation, surface },
    );
  }
}

export const VERA_MVP_FEATURES: Readonly<Record<VeraMvpFeature, {
  conversationType: "vera_chat" | "weakness_analysis";
  contextMode: VeraContextMode;
}>> = {
  chat: { conversationType: "vera_chat", contextMode: "chat_review" },
  review: { conversationType: "vera_chat", contextMode: "chat_review" },
  analysis: { conversationType: "weakness_analysis", contextMode: "analysis_route" },
  route: { conversationType: "vera_chat", contextMode: "analysis_route" },
};

export function mvpFeatureForConversationType(value: unknown): VeraMvpFeature | null {
  if (value === "vera_chat") return "chat";
  if (value === "weakness_analysis") return "analysis";
  return null;
}

export function mvpFeatureForToolId(value: unknown): VeraMvpFeature | null {
  if (value === "analysis" || value === "route" || value === "review") return value;
  return null;
}

export function contextModeForFeatureKey(featureKey: string): VeraContextMode {
  if (featureKey === "vera.analysis" || featureKey === "vera.route") return "analysis_route";
  return "chat_review";
}

export type VeraOperation =
  | "conversation_create"
  | "ai_request"
  | "artifact_apply"
  | "learning_recommendation_create"
  | "export_create"
  | "conversation_delete"
  | "artifact_delete";

export type VeraRequestState =
  | "pending"
  | "staged"
  | "succeeded"
  | "fallback"
  | "failed";

export type VeraTokenUsageState = "known" | "unknown" | "not_applicable";

export type VeraRejectionClass = "transient" | "terminal";

export type VeraIdempotencyState = "rejected" | "accepted" | "expired";

export type VeraContextSourceType = "practice" | "material" | "document";

export type VeraContextSelection = {
  sourceType: VeraContextSourceType;
  sourceId: string;
};

export type VeraErrorCode =
  | "feature_disabled"
  | "idempotency_conflict"
  | "conversation_version_conflict"
  | "context_version_conflict"
  | "context_limit_exceeded"
  | "context_release_unavailable"
  | "document_phase_disabled"
  | "document_sources_disabled"
  | "idempotency_key_expired"
  | "legacy_context_rejected"
  | "unsupported_target"
  | "target_unavailable"
  | "artifact_unavailable"
  | "vera_not_active";

export class VeraContractError extends Error {
  readonly code: VeraErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: VeraErrorCode,
    message: string,
    status = 409,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VeraContractError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n");
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [normalizeText(key), sortObject(nested)]),
    );
  }

  return typeof value === "string" ? normalizeText(value) : value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function normalizeSourceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) unique.add(trimmed);
    }
  }

  return [...unique].sort((left, right) => left.localeCompare(right));
}

/**
 * The replay matrix deliberately selects operation-owned fields. Arbitrary
 * browser fields can therefore never change or alias a server target.
 */
export function canonicalOperationPayload(
  operation: VeraOperation,
  payload: Record<string, unknown>,
): string {
  const selected: Record<string, unknown> = {};

  switch (operation) {
    case "conversation_create":
      selected.conversationType = payload.conversationType ?? null;
      selected.title = payload.title ?? null;
      break;
    case "ai_request":
      selected.conversationId = payload.conversationId ?? null;
      selected.kind = payload.kind ?? null;
      selected.toolId = payload.toolId ?? null;
      selected.text = payload.text ?? null;
      selected.sourceIds = normalizeSourceIds(payload.sourceIds);
      selected.options = payload.options ?? {};
      selected.retryOfRequestId = payload.retryOfRequestId ?? null;
      break;
    case "artifact_apply":
      selected.artifactRevisionId = payload.artifactRevisionId ?? null;
      selected.targetEntityType = payload.targetEntityType ?? null;
      selected.targetEntityId = payload.targetEntityId ?? null;
      selected.expectedTargetRevision = payload.expectedTargetRevision ?? null;
      break;
    case "learning_recommendation_create":
      selected.artifactRevisionId = payload.artifactRevisionId ?? null;
      selected.expectedArtifactRevision = payload.expectedArtifactRevision ?? null;
      selected.materializationSchemaVersion = payload.materializationSchemaVersion ?? "1";
      break;
    case "export_create":
      selected.format = payload.format ?? "json";
      selected.scope = payload.scope ?? null;
      selected.conversationId = payload.conversationId ?? null;
      selected.requestedPolicyVersion = payload.requestedPolicyVersion ?? null;
      selected.exportVersion = payload.exportVersion ?? "1";
      break;
    case "conversation_delete":
      selected.conversationId = payload.conversationId ?? null;
      selected.expectedVersion = payload.expectedVersion ?? null;
      selected.deleteMode = payload.deleteMode ?? "account_retention";
      break;
    case "artifact_delete":
      selected.artifactRevisionId = payload.artifactRevisionId ?? null;
      selected.expectedLifecycleRevision = payload.expectedLifecycleRevision ?? null;
      selected.deleteMode = payload.deleteMode ?? "retention";
      break;
  }

  return canonicalJson(selected);
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacFingerprint(
  operation: VeraOperation,
  payload: Record<string, unknown>,
  secret: string,
): string {
  if (!secret.trim()) throw new Error("VERA_IDEMPOTENCY_HMAC_SECRET is required");

  const canonical = canonicalOperationPayload(operation, payload);
  return createHmac("sha256", secret).update(`${operation}:${canonical}`).digest("hex");
}

export function selectionDigest(selection: VeraContextSelection[]): string {
  const normalized: Array<{ sourceId: string; sourceType: VeraContextSourceType }> = [];
  for (const { sourceType, sourceId } of selection) {
    const trimmed = sourceId.trim();
    if (trimmed) {
      normalized.push({ sourceId: trimmed, sourceType });
    }
  }
  normalized.sort((left, right) => `${left.sourceType}:${left.sourceId}`.localeCompare(`${right.sourceType}:${right.sourceId}`));
  const deduped = normalized.filter((entry, index, entries) => index === 0 || JSON.stringify(entry) !== JSON.stringify(entries[index - 1]));
  return sha256Hex(JSON.stringify(deduped));
}

export function normalizeSelection(selection: VeraContextSelection[]): VeraContextSelection[] {
  const normalized: VeraContextSelection[] = [];
  for (const { sourceType, sourceId } of selection) {
    const trimmed = sourceId.trim();
    if (trimmed && sourceType !== "document") {
      normalized.push({ sourceType, sourceId: trimmed });
    }
  }

  if (selection.some(({ sourceType }) => sourceType === "document")) {
    throw new VeraContractError(
      "document_sources_disabled",
      "Dokumen belum tersedia sebagai sumber Vera.",
      410,
    );
  }

  const deduped = normalized.filter((entry, index, entries) => entries.findIndex(
    (candidate) => candidate.sourceType === entry.sourceType && candidate.sourceId === entry.sourceId,
  ) === index);

  if (deduped.length > VERA_MAX_CONTEXT_SOURCES) {
    throw new VeraContractError(
      "context_release_unavailable",
      `Vera mendukung maksimal ${VERA_MAX_CONTEXT_SOURCES} sumber konteks.`,
      422,
      { reason: "source_cap", maxSources: VERA_MAX_CONTEXT_SOURCES },
    );
  }

  return deduped;
}

export function isTerminalRequestState(state: VeraRequestState | AiRequestLifecycleState): boolean {
  return state === "succeeded" || state === "fallback" || state === "failed";
}

export function mapIdempotencyState(state: AiIdempotencyState): VeraIdempotencyState {
  return state;
}

export function mapOperation(operation: VeraOperation): AiIdempotencyOperation {
  return operation as AiIdempotencyOperation;
}

export function describeReplayTarget(
  operation: VeraOperation,
  state: VeraIdempotencyState,
  resultId: string | null,
): { operation: VeraOperation; state: VeraIdempotencyState; resultId: string | null } {
  return { operation, state, resultId };
}

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
export const VERA_MAX_CONTEXT_SOURCES = 6;
export const VERA_MAX_CONVERSATION_PAGE_SIZE = 50;
export const VERA_MAX_PROVIDER_ATTEMPTS = 2;

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
  | "idempotency_conflict"
  | "conversation_version_conflict"
  | "context_version_conflict"
  | "context_release_unavailable"
  | "document_phase_disabled"
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

  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
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
  const canonical = JSON.stringify(selection
    .map(({ sourceType, sourceId }) => ({ sourceId: sourceId.trim(), sourceType }))
    .filter(({ sourceId }) => sourceId)
    .sort((left, right) => `${left.sourceType}:${left.sourceId}`.localeCompare(`${right.sourceType}:${right.sourceId}`))
    .filter((entry, index, entries) => index === 0 || JSON.stringify(entry) !== JSON.stringify(entries[index - 1])));

  return sha256Hex(canonical);
}

export function normalizeSelection(selection: VeraContextSelection[]): VeraContextSelection[] {
  const normalized = selection
    .map(({ sourceType, sourceId }) => ({ sourceType, sourceId: sourceId.trim() }))
    .filter(({ sourceType, sourceId }) => sourceId && sourceType !== "document");

  if (selection.some(({ sourceType }) => sourceType === "document")) {
    throw new VeraContractError(
      "document_phase_disabled",
      "Dokumen belum tersedia sebagai sumber Vera.",
      409,
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

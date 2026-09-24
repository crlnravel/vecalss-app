import "server-only";

import { createHmac, createHash } from "node:crypto";

import type {
  AiAdminCommandOperation,
  AiCapabilityName,
  AiPolicyPreviewMode,
  AiPolicyState,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import type { VeraAutomaticContextPromotionEvidence } from "@/lib/vera-ai/automatic-context-operations";

export const AI_POLICY_SCHEMA_VERSION = "vera-policy-v1";
export const AI_POLICY_FINGERPRINT_KEY_VERSION = "vera-policy-hmac-v1";
export const AI_POLICY_TERMINAL_TTL_DAYS = 90;
export const AI_POLICY_TRANSIENT_TTL_HOURS = 24;
export const AI_POLICY_MIN_GROUP_SIZE = 5;
export const AI_POLICY_PROVIDER_GATE_STATE = "open_blocked" as const;

export const AI_POLICY_CAPABILITIES = [
  "canManageAiPolicy",
  "canManageAiGovernance",
] as const satisfies readonly AiCapabilityName[];

export type AiPolicyCapability = (typeof AI_POLICY_CAPABILITIES)[number];
export type PolicySection = "quota" | "settlement" | "report" | "retention";

export const POLICY_SECTIONS = ["quota", "settlement", "report", "retention"] as const;

export type AiPolicyMode = {
  inputBound: number;
  hardOutputCap: number;
  reservationBound: number;
};

export type AiPolicyQuotaConfig = {
  defaultDailyLimit: number;
  quotaVersion: string;
  maxProviderAttempts: 2;
  modes: Record<string, AiPolicyMode>;
};

export type AiPolicySettlementConfig = {
  maxPendingAgeMinutes: number;
};

export type AiPolicyReportConfig = {
  unitLimit: number;
  requestLimit: number;
  minimumGroupSize: number;
  maxRangeDays: number;
  /** Optional content-free automatic-context promotion evidence. */
  automaticContextPromotion?: VeraAutomaticContextPromotionEvidence;
};

export type AiPolicyRetentionConfig = {
  stageTtlHours: number;
  contextEvidenceTtlDays: number;
  acceptedKeyTtlDays: number;
  rejectedKeyTtlHours: number;
  tombstoneTtlDays: number;
  admissionTelemetryTtlDays: number;
  operationalMetadataTtlDays: number;
  activeArtifactEvidenceTtlDays?: number;
};

export type AiPolicyConfig = {
  bundleVersion: string;
  configSchemaVersion: string;
  effectiveAt: Date;
  quotaConfig: AiPolicyQuotaConfig;
  settlementConfig: AiPolicySettlementConfig;
  reportConfig: AiPolicyReportConfig;
  retentionConfig: AiPolicyRetentionConfig;
  providerGateState: typeof AI_POLICY_PROVIDER_GATE_STATE;
  changeReason: string | null;
};

export type AiPolicyBundleDto = {
  id: string;
  bundleVersion: string;
  configSchemaVersion: string;
  state: AiPolicyState;
  effectiveAt: string;
  providerGateState: typeof AI_POLICY_PROVIDER_GATE_STATE;
  validationDigest: string;
  changeReason: string | null;
  revision: number;
  editorActorIds: string[];
  requiredCapabilityUnion: AiPolicyCapability[];
  approvedBy: { id: string; display: string } | null;
  approvedAt: string | null;
  activatedAt: string | null;
  quotaConfig: AiPolicyConfig["quotaConfig"];
  settlementConfig: AiPolicyConfig["settlementConfig"];
  reportConfig: AiPolicyConfig["reportConfig"];
  retentionConfig: AiPolicyConfig["retentionConfig"];
};

export type AiPolicyChangedSections = Partial<Record<PolicySection, true>>;

export type AiPolicyValidationResult = {
  digest: string;
  changedSections: PolicySection[];
  requiredCapabilityUnion: AiPolicyCapability[];
  editorActorIds: string[];
};

export type AiPolicyImpactCell = {
  state: "unchanged" | "forward_only" | "coarsened" | "suppressed" | "unavailable";
  aggregate?: {
    affectedFutureRows: number;
    category: "quota" | "report_budget" | "content_evidence";
  };
};

export type AiPolicyImpactCategory = "quota" | "report_budget" | "content_evidence";

export type AiPolicyImpactPreviewDto = {
  state: "ready" | "coarsened" | "partial_unavailable" | "suppressed" | "unavailable";
  candidateBundleVersion: string;
  activeBundleVersion: string;
  effectiveAt: string;
  asOf: string;
  nonRetroactive: true;
  effects: {
    futureAdmissions: AiPolicyImpactCell;
    futureReportReservations: AiPolicyImpactCell;
    futureContentEvidence: AiPolicyImpactCell;
  };
  validationDigest: string;
  mode: AiPolicyPreviewMode;
  costUnits: 0 | 3;
  reservationId?: string;
};

export type AiPolicyMetadataDto = {
  active: {
    bundleVersion: string;
    effectiveAt: string;
    providerGateState: typeof AI_POLICY_PROVIDER_GATE_STATE;
    validationDigest: string;
    lastApprover: { id: string; display: string } | null;
  } | null;
  scheduled: { bundleVersion: string; effectiveAt: string; validationDigest: string } | null;
  history: Array<{
    id: string;
    bundleVersion: string;
    state: AiPolicyState;
    effectiveAt: string;
    validationDigest: string;
    reason: string | null;
    lastAction: string | null;
  }>;
  capabilities: AiPolicyCapability[];
  canMutate: boolean;
};

export type AiPolicyCommandResult = {
  commandId: string;
  replayed: boolean;
  operation: AiAdminCommandOperation;
  resultKind: string;
  result: unknown;
};

/** The exact local-calendar range captured by an aggregate preview reservation.
 * It is persisted/audited as request metadata; no preview may silently fall
 * back to a fabricated UTC day.
 */
export type PreviewReservationRange = {
  from: string;
  to: string;
  timezone: string;
};

export class AiPolicyError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status = 409, details?: Record<string, unknown>) {
    super(message);
    this.name = "AiPolicyError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function policyCapabilityForSection(section: PolicySection): AiPolicyCapability {
  return section === "settlement" || section === "retention"
    ? "canManageAiGovernance"
    : "canManageAiPolicy";
}

export function capabilitiesForSections(sections: readonly PolicySection[]): AiPolicyCapability[] {
  return [...new Set(sections.map(policyCapabilityForSection))].sort() as AiPolicyCapability[];
}

export function sectionsForPatch(patch: Record<string, unknown>): PolicySection[] {
  return POLICY_SECTIONS.filter((section) => Object.prototype.hasOwnProperty.call(patch, `${section}Config`));
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "state")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key.normalize("NFC"), normalize(nested)]),
    );
  }
  return typeof value === "string" ? value.normalize("NFC").replace(/\r\n?/g, "\n") : value;
}

export function canonicalPolicyJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function policyValidationDigest(input: AiPolicyConfig): string {
  return createHash("sha256").update(canonicalPolicyJson({
    bundleVersion: input.bundleVersion,
    configSchemaVersion: input.configSchemaVersion,
    effectiveAt: input.effectiveAt,
    quotaConfig: input.quotaConfig,
    settlementConfig: input.settlementConfig,
    reportConfig: input.reportConfig,
    retentionConfig: input.retentionConfig,
    providerGateState: input.providerGateState,
    changeReason: input.changeReason,
  })).digest("hex");
}

export function policySnapshotDigest(input: {
  bundleId: string;
  bundleRevision: number;
  editorActorIds: readonly string[];
  requiredCapabilityUnion: readonly AiPolicyCapability[];
}): string {
  return createHash("sha256").update(canonicalPolicyJson({
    bundleId: input.bundleId,
    bundleRevision: input.bundleRevision,
    editorActorIds: [...input.editorActorIds].sort(),
    requiredCapabilityUnion: [...input.requiredCapabilityUnion].sort(),
    snapshotVersion: "vera-policy-approval-v1",
  })).digest("hex");
}

export function adminCommandFingerprint(input: {
  operation: AiAdminCommandOperation | string;
  payload: unknown;
  secret: string;
}): string {
  if (!input.secret.trim()) throw new AiPolicyError("policy_fingerprint_unavailable", "Policy command fingerprint is unavailable.", 503);
  return createHmac("sha256", input.secret)
    .update(`${input.operation}:${canonicalPolicyJson(input.payload)}`)
    .digest("hex");
}

export function assertClientRequestId(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > 120) {
    throw new AiPolicyError("invalid_client_request_id", "ID permintaan kebijakan tidak valid.", 400);
  }
}

export function assertReason(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > 500) {
    throw new AiPolicyError("invalid_reason", "Alasan perubahan wajib diisi dan dibatasi.", 400);
  }
}

export function assertPositiveRevision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new AiPolicyError("invalid_revision", "Revisi kebijakan tidak valid.", 400);
  }
}

export function defaultPreviewCell(category: AiPolicyImpactCategory, changed: boolean): AiPolicyImpactCell {
  return { state: changed ? "forward_only" : "unchanged", ...(changed ? { aggregate: { affectedFutureRows: 0, category } } : {}) };
}

export type PreviewReservationAdapter = {
  reserveAggregate(input: {
    principalId: string;
    clientRequestId: string;
    requestFingerprint: string;
    policyBundleVersion: string;
    costUnits: 3;
    asOf: Date;
    range: PreviewReservationRange;
    commandId: string;
    transaction?: Prisma.TransactionClient;
  }): Promise<{ reservationId: string }>;
  completeAggregate(input: {
    reservationId: string;
    result: AiPolicyImpactPreviewDto;
    resultDigest: string;
    transaction?: Prisma.TransactionClient;
  }): Promise<void>;
};

import "server-only";

import { VERA_V1_QUOTA_CONFIG, VERA_V1_REPORT_CONFIG, VERA_V1_RETENTION_CONFIG, VERA_V1_SETTLEMENT_CONFIG } from "@/lib/vera-ai/policy";
import { parseVeraAutomaticContextPromotionEvidence } from "@/lib/vera-ai/automatic-context-operations";

import {
  AI_POLICY_MIN_GROUP_SIZE,
  AI_POLICY_PROVIDER_GATE_STATE,
  AI_POLICY_SCHEMA_VERSION,
  AiPolicyError,
  type AiPolicyConfig,
  type AiPolicyMode,
  type AiPolicyQuotaConfig,
  type AiPolicyReportConfig,
  type AiPolicyRetentionConfig,
  type AiPolicySettlementConfig,
  type PolicySection,
} from "./contracts";

const MODE_KEYS = Object.keys(VERA_V1_QUOTA_CONFIG.modes).sort();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new AiPolicyError("invalid_policy", `${label} harus berupa objek lengkap.`, 422);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const expected = new Set(keys);
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unknown.length || missing.length) {
    throw new AiPolicyError("invalid_policy", `${label} memiliki kunci yang tidak lengkap atau tidak dikenal.`, 422, { unknown, missing });
  }
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AiPolicyError("invalid_policy", `${label} harus berupa angka hingga.`, 422, { field: label });
  }
  return value;
}

function integerInRange(value: unknown, min: number, max: number, label: string): number {
  const number = finiteNumber(value, label);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new AiPolicyError("policy_guardrail_violation", `${label} berada di luar pagar kebijakan.`, 422, { field: label, min, max });
  }
  return number;
}

function stringValue(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new AiPolicyError("invalid_policy", `${label} harus berupa teks terbatas.`, 422, { field: label });
  }
  return value.normalize("NFC").replace(/\r\n?/g, "\n");
}

function parseMode(value: unknown, label: string): AiPolicyMode {
  assertObject(value, label);
  assertExactKeys(value, ["inputBound", "hardOutputCap", "reservationBound"], label);
  const inputBound = integerInRange(value.inputBound, 1_000, 12_000, `${label}.inputBound`);
  const hardOutputCap = integerInRange(value.hardOutputCap, 256, 4_000, `${label}.hardOutputCap`);
  const reservationBound = integerInRange(value.reservationBound, inputBound + hardOutputCap, 20_000, `${label}.reservationBound`);
  return { inputBound, hardOutputCap, reservationBound };
}

export function parseQuotaConfig(value: unknown): AiPolicyQuotaConfig {
  assertObject(value, "quotaConfig");
  assertExactKeys(value, ["defaultDailyLimit", "quotaVersion", "maxProviderAttempts", "modes"], "quotaConfig");
  const defaultDailyLimit = integerInRange(value.defaultDailyLimit, 1_000, 50_000, "quotaConfig.defaultDailyLimit");
  const quotaVersion = stringValue(value.quotaVersion, "quotaConfig.quotaVersion", 80);
  if (value.maxProviderAttempts !== 2) {
    throw new AiPolicyError("immutable_safety_floor", "Batas provider selalu tepat dua percobaan.", 422);
  }
  assertObject(value.modes, "quotaConfig.modes");
  const modeKeys = Object.keys(value.modes).sort();
  if (JSON.stringify(modeKeys) !== JSON.stringify(MODE_KEYS)) {
    throw new AiPolicyError("policy_guardrail_violation", "Profil mode harus cocok dengan kontrak adapter tersertifikasi.", 422, { expected: MODE_KEYS, received: modeKeys });
  }
  const modeValues = value.modes as Record<string, unknown>;
  const modes = Object.fromEntries(MODE_KEYS.map((key) => [key, parseMode(modeValues[key], `quotaConfig.modes.${key}`)]));
  return { defaultDailyLimit, quotaVersion, maxProviderAttempts: 2, modes };
}

export function parseSettlementConfig(value: unknown): AiPolicySettlementConfig {
  assertObject(value, "settlementConfig");
  assertExactKeys(value, ["maxPendingAgeMinutes"], "settlementConfig");
  return { maxPendingAgeMinutes: integerInRange(value.maxPendingAgeMinutes, 30, 360, "settlementConfig.maxPendingAgeMinutes") };
}

export function parseReportConfig(value: unknown): AiPolicyReportConfig {
  assertObject(value, "reportConfig");
  const requiredKeys = ["unitLimit", "requestLimit", "minimumGroupSize", "maxRangeDays"] as const;
  const allowedKeys = [...requiredKeys, "automaticContextPromotion"] as const;
  const unknown = Object.keys(value).filter((key) => !allowedKeys.includes(key as (typeof allowedKeys)[number]));
  const missing = requiredKeys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unknown.length || missing.length) {
    throw new AiPolicyError("invalid_policy", "reportConfig memiliki kunci yang tidak lengkap atau tidak dikenal.", 422, { unknown, missing });
  }
  const minimumGroupSize = integerInRange(value.minimumGroupSize, AI_POLICY_MIN_GROUP_SIZE, 100, "reportConfig.minimumGroupSize");
  const maxRangeDays = integerInRange(value.maxRangeDays, 1, 31, "reportConfig.maxRangeDays");
  if (minimumGroupSize < AI_POLICY_MIN_GROUP_SIZE || maxRangeDays > 31) {
    throw new AiPolicyError("immutable_privacy_floor", "Pagar privasi laporan tidak dapat diturunkan.", 422);
  }
  const parsed: AiPolicyReportConfig = {
    unitLimit: integerInRange(value.unitLimit, 12, 240, "reportConfig.unitLimit"),
    requestLimit: integerInRange(value.requestLimit, 1, 60, "reportConfig.requestLimit"),
    minimumGroupSize,
    maxRangeDays,
  };
  if (Object.prototype.hasOwnProperty.call(value, "automaticContextPromotion")) {
    const promotion = parseVeraAutomaticContextPromotionEvidence(value.automaticContextPromotion);
    if (!promotion) throw new AiPolicyError("invalid_policy", "Bukti persetujuan untuk mengaktifkan konteks otomatis tidak valid.", 422);
    parsed.automaticContextPromotion = promotion;
  }
  return parsed;
}

export function parseRetentionConfig(value: unknown): AiPolicyRetentionConfig {
  assertObject(value, "retentionConfig");
  const allowedKeys = [
    "stageTtlHours",
    "contextEvidenceTtlDays",
    "acceptedKeyTtlDays",
    "rejectedKeyTtlHours",
    "tombstoneTtlDays",
    "admissionTelemetryTtlDays",
    "operationalMetadataTtlDays",
    "activeArtifactEvidenceTtlDays",
  ] as const;
  const presentKeys = allowedKeys.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  assertExactKeys(value, presentKeys, "retentionConfig");
  const parsed: AiPolicyRetentionConfig = {
    stageTtlHours: integerInRange(value.stageTtlHours, 7, 72, "retentionConfig.stageTtlHours"),
    contextEvidenceTtlDays: integerInRange(value.contextEvidenceTtlDays, 7, 90, "retentionConfig.contextEvidenceTtlDays"),
    acceptedKeyTtlDays: integerInRange(value.acceptedKeyTtlDays, 30, 180, "retentionConfig.acceptedKeyTtlDays"),
    rejectedKeyTtlHours: integerInRange(value.rejectedKeyTtlHours, 1, 72, "retentionConfig.rejectedKeyTtlHours"),
    tombstoneTtlDays: integerInRange(value.tombstoneTtlDays, 30, 180, "retentionConfig.tombstoneTtlDays"),
    admissionTelemetryTtlDays: integerInRange(value.admissionTelemetryTtlDays, 30, 365, "retentionConfig.admissionTelemetryTtlDays"),
    operationalMetadataTtlDays: integerInRange(value.operationalMetadataTtlDays, 90, 730, "retentionConfig.operationalMetadataTtlDays"),
  };
  if (Object.prototype.hasOwnProperty.call(value, "activeArtifactEvidenceTtlDays")) {
    parsed.activeArtifactEvidenceTtlDays = integerInRange(value.activeArtifactEvidenceTtlDays, 7, 90, "retentionConfig.activeArtifactEvidenceTtlDays");
  }
  if (parsed.activeArtifactEvidenceTtlDays !== undefined && parsed.activeArtifactEvidenceTtlDays > 90) {
    throw new AiPolicyError("immutable_retention_ceiling", "Bukti artefak aktif tidak boleh melewati 90 hari.", 422);
  }
  return parsed;
}

export function parseCompletePolicyConfig(input: {
  bundleVersion: unknown;
  configSchemaVersion: unknown;
  effectiveAt: unknown;
  quotaConfig: unknown;
  settlementConfig: unknown;
  reportConfig: unknown;
  retentionConfig: unknown;
  providerGateState?: unknown;
  changeReason?: unknown;
}): AiPolicyConfig {
  const bundleVersion = stringValue(input.bundleVersion, "bundleVersion", 120);
  const configSchemaVersion = stringValue(input.configSchemaVersion, "configSchemaVersion", 40);
  if (configSchemaVersion !== AI_POLICY_SCHEMA_VERSION) {
    throw new AiPolicyError("unsupported_policy_schema", "Versi skema kebijakan tidak didukung.", 422);
  }
  const effectiveAt = input.effectiveAt instanceof Date ? new Date(input.effectiveAt) : new Date(String(input.effectiveAt));
  if (Number.isNaN(effectiveAt.getTime())) throw new AiPolicyError("invalid_policy", "Waktu efektif kebijakan tidak valid.", 422);
  const providerGateState = input.providerGateState ?? AI_POLICY_PROVIDER_GATE_STATE;
  if (providerGateState !== AI_POLICY_PROVIDER_GATE_STATE) {
    throw new AiPolicyError("provider_gate_blocked", "Rilis provider masih diblokir oleh gate pemilik.", 422);
  }
  const changeReason = input.changeReason === null || input.changeReason === undefined
    ? null
    : stringValue(input.changeReason, "changeReason", 500);
  const quotaConfig = parseQuotaConfig(input.quotaConfig);
  const settlementConfig = parseSettlementConfig(input.settlementConfig);
  const reportConfig = parseReportConfig(input.reportConfig);
  const retentionConfig = parseRetentionConfig(input.retentionConfig);
  if (retentionConfig.stageTtlHours * 60 < settlementConfig.maxPendingAgeMinutes + 30) {
    throw new AiPolicyError("policy_guardrail_violation", "Stage TTL terlalu pendek untuk settlement dan pemulihan.", 422);
  }
  return {
    bundleVersion,
    configSchemaVersion,
    effectiveAt,
    quotaConfig,
    settlementConfig,
    reportConfig,
    retentionConfig,
    providerGateState: AI_POLICY_PROVIDER_GATE_STATE,
    changeReason,
  };
}

export function defaultCompletePolicyConfig(bundleVersion: string, effectiveAt: Date): AiPolicyConfig {
  return parseCompletePolicyConfig({
    bundleVersion,
    configSchemaVersion: AI_POLICY_SCHEMA_VERSION,
    effectiveAt,
    quotaConfig: VERA_V1_QUOTA_CONFIG,
    settlementConfig: VERA_V1_SETTLEMENT_CONFIG,
    reportConfig: VERA_V1_REPORT_CONFIG,
    retentionConfig: VERA_V1_RETENTION_CONFIG,
    providerGateState: AI_POLICY_PROVIDER_GATE_STATE,
    changeReason: null,
  });
}

export function sectionsChanged(source: AiPolicyConfig, candidate: AiPolicyConfig): PolicySection[] {
  const sections: PolicySection[] = [];
  if (JSON.stringify(source.quotaConfig) !== JSON.stringify(candidate.quotaConfig)) sections.push("quota");
  if (JSON.stringify(source.settlementConfig) !== JSON.stringify(candidate.settlementConfig)) sections.push("settlement");
  if (JSON.stringify(source.reportConfig) !== JSON.stringify(candidate.reportConfig)) sections.push("report");
  if (JSON.stringify(source.retentionConfig) !== JSON.stringify(candidate.retentionConfig)) sections.push("retention");
  return sections;
}

export function assertPreviewRange(range: unknown): asserts range is { from: string; to: string; timezone: string } {
  assertObject(range, "range");
  assertExactKeys(range, ["from", "to", "timezone"], "range");
  if (typeof range.from !== "string" || typeof range.to !== "string" || typeof range.timezone !== "string") {
    throw new AiPolicyError("invalid_preview_range", "Rentang preview tidak valid.", 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to) || range.from >= range.to) {
    throw new AiPolicyError("invalid_preview_range", "Rentang preview harus berupa tanggal lokal half-open.", 400);
  }
  const days = (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(days) || days > 31) throw new AiPolicyError("invalid_preview_range", "Preview dibatasi maksimal 31 hari lokal.", 400);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: range.timezone }).format();
  } catch {
    throw new AiPolicyError("invalid_preview_range", "Zona waktu preview tidak valid.", 400);
  }
}

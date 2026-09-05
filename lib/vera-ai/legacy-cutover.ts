import "server-only";

import { VERA_POLICY_EFFECTIVE_AT, VeraContractError, canonicalJson, sha256Hex } from "./contracts";
import {
  assertT11MigrationInventoryComplete,
  VERA_T11_LEGACY_INVENTORY_FIELDS,
  type MigrationInventoryEntry,
} from "./provenance";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export const VERA_LEGACY_CUTOVER_AT = new Date(VERA_POLICY_EFFECTIVE_AT);
export const VERA_LEGACY_VALIDATION_DAYS = 30;
export const VERA_LEGACY_VALIDATION_END_AT = new Date("2026-10-01T00:00:00+07:00");
export const VERA_LEGACY_RETIREMENT_RUNBOOK_VERSION = "vera-legacy-cutover-v1";
export const VERA_LEGACY_INVENTORY_MIGRATION_VERSION = "20260827100000";

export type LegacyCutoverEvidenceState = "pending" | "passed" | "failed";

export type LegacyCutoverDayEvidence = {
  validationDate: string;
  state: LegacyCutoverEvidenceState;
  evidenceDigest: string;
  checkedAt: Date;
  failureCode?: string;
};

export type LegacyCutoverRunbook = {
  version: string;
  effectiveAt: Date;
  validationEndsAt: Date;
  validationDays: number;
  providerGateState: "open_blocked";
  providerMode: "mock-only";
  retirementMigration: "post-validation-only";
};

export const VERA_LEGACY_CUTOVER_RUNBOOK: LegacyCutoverRunbook = {
  version: VERA_LEGACY_RETIREMENT_RUNBOOK_VERSION,
  effectiveAt: new Date(VERA_LEGACY_CUTOVER_AT),
  validationEndsAt: new Date(VERA_LEGACY_VALIDATION_END_AT),
  validationDays: VERA_LEGACY_VALIDATION_DAYS,
  providerGateState: "open_blocked",
  providerMode: "mock-only",
  retirementMigration: "post-validation-only",
};

export type VeraLegacyField =
  | "ai_messages.content_markdown"
  | "ai_requests.prompt_template"
  | "ai_conversations.context_entity"
  | "learning_recommendations.reason"
  | "ai_requests.raw_tokens";

export function legacyInventoryFields(): readonly typeof VERA_T11_LEGACY_INVENTORY_FIELDS[number][] {
  return VERA_T11_LEGACY_INVENTORY_FIELDS;
}

export function assertLegacyPreflight(entries: MigrationInventoryEntry[]): void {
  assertT11MigrationInventoryComplete(entries);
  if (entries.some((entry) => entry.rowCount < 0 || entry.unclassifiedPlaintext > 0)) {
    throw new VeraContractError(
      "legacy_context_rejected",
      "Legacy AI inventory contains invalid or unclassified evidence.",
      409,
    );
  }
}

export function isWithinLegacyValidationWindow(now = new Date()): boolean {
  return now.getTime() >= VERA_LEGACY_CUTOVER_AT.getTime()
    && now.getTime() < VERA_LEGACY_VALIDATION_END_AT.getTime();
}

const JAKARTA_CALENDAR_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function jakartaCalendarDate(value: Date): string {
  const parts = JAKARTA_CALENDAR_DATE_FORMATTER.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Unable to derive the Asia/Jakarta validation date.");
  return `${year}-${month}-${day}`;
}

export function validationDateForInstant(now: Date): string {
  if (!isWithinLegacyValidationWindow(now)) {
    throw new VeraContractError(
      "legacy_context_rejected",
      "The legacy validation instant is outside the fixed Asia/Jakarta window.",
      409,
      { effectiveAt: VERA_POLICY_EFFECTIVE_AT },
    );
  }
  const day = Math.floor((now.getTime() - VERA_LEGACY_CUTOVER_AT.getTime()) / (24 * 60 * 60 * 1000));
  const date = new Date(VERA_LEGACY_CUTOVER_AT.getTime() + day * 24 * 60 * 60 * 1000);
  return jakartaCalendarDate(date);
}

export function recordLegacyValidationDay(input: {
  now: Date;
  evidence: Record<string, unknown>;
  state?: LegacyCutoverEvidenceState;
  failureCode?: string;
}): LegacyCutoverDayEvidence {
  const validationDate = validationDateForInstant(input.now);
  const state = input.state ?? "passed";
  if (state === "failed" && !input.failureCode) throw new Error("A failed validation day requires a bounded failure code.");
  return {
    validationDate,
    state,
    evidenceDigest: sha256Hex(canonicalJson({
      runbook: VERA_LEGACY_RETIREMENT_RUNBOOK_VERSION,
      validationDate,
      evidence: input.evidence,
    })),
    checkedAt: new Date(input.now),
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
  };
}

export function assertLegacyValidationWindowComplete(days: readonly LegacyCutoverDayEvidence[]): void {
  const expected = new Set(Array.from({ length: VERA_LEGACY_VALIDATION_DAYS }, (_, index) => {
    const date = new Date(VERA_LEGACY_CUTOVER_AT.getTime() + index * 24 * 60 * 60 * 1000);
    return jakartaCalendarDate(date);
  }));
  const actual = new Map(days.map((day) => [day.validationDate, day]));
  const missing = [...expected].filter((date) => !actual.has(date));
  const failed = [...actual.values()].filter((day) => day.state === "failed");
  if (missing.length || failed.length || actual.size !== expected.size) {
    throw new VeraContractError(
      "vera_not_active",
      "Vera admissions remain blocked until all 30 legacy validation days pass.",
      409,
      { missing, failed: failed.map((day) => ({ date: day.validationDate, code: day.failureCode })) },
    );
  }
}

export function isVeraAdmissionsEnabled(input: {
  now?: Date;
  validationDays: readonly LegacyCutoverDayEvidence[];
}): boolean {
  const now = input.now ?? new Date();
  if (now.getTime() < VERA_LEGACY_CUTOVER_AT.getTime()) return false;
  if (input.validationDays.some((day) => day.state === "failed")) return false;
  try {
    assertLegacyValidationWindowComplete(input.validationDays);
  } catch {
    return false;
  }
  return true;
}

export function assertLegacyScalarIsNotAuthority(field: VeraLegacyField): never {
  return assertLegacyFieldReadOnly(field);
}

/** DB-facing inventory adapter. It only records row counts/digests and never
 * copies legacy plaintext into the audit table. */
export class PrismaLegacyCutoverService {
  constructor(private readonly db: Pick<PrismaClient, "$transaction">) {}

  async inventory(now = new Date()): Promise<MigrationInventoryEntry[]> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ source_table: string; source_field: string; row_count: bigint }>>`
        SELECT 'ai_messages'::text AS source_table, 'content_markdown'::text AS source_field,
          COUNT(*) FILTER (WHERE content_markdown IS NOT NULL)::bigint AS row_count FROM ai_messages
        UNION ALL SELECT 'ai_messages', 'metadata', COUNT(*) FILTER (WHERE metadata IS NOT NULL)::bigint FROM ai_messages
        UNION ALL SELECT 'ai_conversations', 'context_entity_type', COUNT(*) FILTER (WHERE context_entity_type IS NOT NULL)::bigint FROM ai_conversations
        UNION ALL SELECT 'ai_conversations', 'context_entity_id', COUNT(*) FILTER (WHERE context_entity_id IS NOT NULL)::bigint FROM ai_conversations
        UNION ALL SELECT 'weakness_analyses', 'summary_markdown', COUNT(*) FILTER (WHERE summary_markdown IS NOT NULL)::bigint FROM weakness_analyses
        UNION ALL SELECT 'weakness_analysis_topics', 'recommendation_text', COUNT(*) FILTER (WHERE recommendation_text IS NOT NULL)::bigint FROM weakness_analysis_topics
        UNION ALL SELECT 'learning_recommendations', 'reason', COUNT(*) FILTER (WHERE reason IS NOT NULL)::bigint FROM learning_recommendations
        UNION ALL SELECT 'adaptive_practice_answers', 'answer_text', COUNT(*) FILTER (WHERE answer_text IS NOT NULL)::bigint FROM adaptive_practice_answers
        UNION ALL SELECT 'adaptive_practice_answers', 'generated_item_ref', COUNT(*) FILTER (WHERE generated_item_ref IS NOT NULL)::bigint FROM adaptive_practice_answers
        UNION ALL SELECT 'ai_requests', 'prompt_template', COUNT(*) FILTER (WHERE prompt_template IS NOT NULL)::bigint FROM ai_requests
        UNION ALL SELECT 'ai_requests', 'model', COUNT(*) FILTER (WHERE model IS NOT NULL)::bigint FROM ai_requests
        UNION ALL SELECT 'ai_requests', 'input_tokens', COUNT(*) FILTER (WHERE input_tokens IS NOT NULL)::bigint FROM ai_requests
        UNION ALL SELECT 'ai_requests', 'output_tokens', COUNT(*) FILTER (WHERE output_tokens IS NOT NULL)::bigint FROM ai_requests
        UNION ALL SELECT 'ai_usage_daily', 'prompt_tokens', COUNT(*) FILTER (WHERE prompt_tokens IS NOT NULL)::bigint FROM ai_usage_daily
        UNION ALL SELECT 'ai_usage_daily', 'completion_tokens', COUNT(*) FILTER (WHERE completion_tokens IS NOT NULL)::bigint FROM ai_usage_daily
      `;
      const byKey = new Map(rows.map((row) => [`${row.source_table}:${row.source_field}`, Number(row.row_count)]));
      const entries = VERA_T11_LEGACY_INVENTORY_FIELDS.map((field) => ({
        sourceTable: field.sourceTable,
        sourceField: field.sourceField,
        contentClass: field.contentClass,
        rowCount: byKey.get(`${field.sourceTable}:${field.sourceField}`) ?? 0,
        unclassifiedPlaintext: field.contentClass === "content_free" ? 0 : (byKey.get(`${field.sourceTable}:${field.sourceField}`) ?? 0),
      }));
      const auditNow = now;
      await Promise.all(
        entries.map(async (entry) => {
          const status = entry.rowCount === 0 ? "validated" : entry.contentClass === "content_free" ? "discovered" : "blocked";
          const classification = entry.rowCount === 0 ? "zero_rows" : entry.contentClass === "content_free" ? "digest_only" : "review_required";
          const action = entry.contentClass === "content_free" ? "preserve_read_only" : "backfill_envelope";
          const existing = await tx.aiContentMigrationAudit.findFirst({
            where: { sourceTable: entry.sourceTable, sourceField: entry.sourceField, sourceObjectId: null, migrationVersion: VERA_LEGACY_INVENTORY_MIGRATION_VERSION },
            select: { id: true },
          });
          const data = {
            sourceTable: entry.sourceTable,
            sourceField: entry.sourceField,
            sourceObjectId: null,
            contentClass: entry.contentClass,
            sourceDigest: sha256Hex(`${entry.sourceTable}:${entry.sourceField}:${entry.rowCount}`),
            migrationVersion: VERA_LEGACY_INVENTORY_MIGRATION_VERSION,
            state: entry.rowCount === 0 ? "zero_rows" as const : entry.contentClass === "content_free" ? "pending" as const : "blocked" as const,
            details: { inventory: true, rowCount: entry.rowCount, runbook: VERA_LEGACY_RETIREMENT_RUNBOOK_VERSION },
            tableName: entry.sourceTable,
            columnName: entry.sourceField,
            rowCount: entry.rowCount,
            classification,
            action,
            status,
            rollbackBoundary: "pre-retirement",
            updatedAt: auditNow,
          } satisfies Prisma.AiContentMigrationAuditUncheckedCreateInput;
          // Migration evidence is append-only. A repeated inventory run never
          // mutates the original audit row; callers can compare the returned
          // count/digest and append a new migration-version row if it changes.
          if (!existing) await tx.aiContentMigrationAudit.create({ data: { ...data, createdAt: auditNow } });
        }),
      );
      return entries;
    });
  }
}

/**
 * Legacy values are migration evidence only. The new request/context paths
 * must never use them as authority, even before the policy effective time.
 */
export function assertLegacyFieldReadOnly(field: VeraLegacyField, now = new Date()): never {
  const phase = now < VERA_LEGACY_CUTOVER_AT ? "pre-cutover" : "post-cutover";
  throw new VeraContractError(
    "legacy_context_rejected",
    `Legacy Vera field ${field} is read-only migration evidence (${phase}).`,
    409,
    { field, phase },
  );
}

export function assertLegacyInventoryReady(entries: MigrationInventoryEntry[]): void {
  const unclassified = entries.filter((entry) => entry.unclassifiedPlaintext > 0);
  if (unclassified.length > 0) {
    throw new VeraContractError(
      "legacy_context_rejected",
      "Vera remains disabled while legacy AI content is unclassified.",
      409,
      { unclassified: unclassified.map(({ sourceTable, sourceField }) => `${sourceTable}:${sourceField}`) },
    );
  }
}

export function assertUnknownRawUsageIsNullable(input: {
  tokenUsageState: "known" | "unknown" | "not_applicable";
  inputTokens: number | null;
  outputTokens: number | null;
}): void {
  if (input.tokenUsageState === "unknown" && (input.inputTokens !== null || input.outputTokens !== null)) {
    throw new VeraContractError(
      "legacy_context_rejected",
      "Unknown provider usage cannot be represented as numeric zero.",
      409,
    );
  }
}

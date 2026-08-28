import "server-only";

import { VeraContractError, sha256Hex } from "./contracts";

export type PurgeMarker = {
  packId: string;
  state: "available" | "purging" | "purged";
  provenanceState: "reconstructable" | "unavailable";
  sourceIds: string[];
  reason: string;
  startedAt: Date | null;
  completedAt: Date | null;
  purgeDigest: string | null;
};

export type MigrationInventoryEntry = {
  sourceTable: string;
  sourceField: string;
  contentClass: "learner_visible" | "hidden_system" | "content_free";
  rowCount: number;
  unclassifiedPlaintext: number;
};

export const VERA_LEGACY_CONTENT_FIELDS = [
  { sourceTable: "ai_messages", sourceField: "content_markdown", contentClass: "learner_visible" as const },
  { sourceTable: "ai_messages", sourceField: "role=system", contentClass: "hidden_system" as const },
  { sourceTable: "ai_messages", sourceField: "metadata", contentClass: "learner_visible" as const },
  { sourceTable: "ai_messages", sourceField: "metadata:role=system", contentClass: "hidden_system" as const },
  { sourceTable: "ai_messages", sourceField: "metadata:role=tool", contentClass: "hidden_system" as const },
  { sourceTable: "ai_conversations", sourceField: "context_entity", contentClass: "content_free" as const },
  { sourceTable: "weakness_analyses", sourceField: "summary_markdown", contentClass: "learner_visible" as const },
  { sourceTable: "weakness_analysis_topics", sourceField: "recommendation_text", contentClass: "learner_visible" as const },
  { sourceTable: "learning_recommendations", sourceField: "reason", contentClass: "learner_visible" as const },
  { sourceTable: "adaptive_practice_answers", sourceField: "answer_text", contentClass: "learner_visible" as const },
  { sourceTable: "ai_requests", sourceField: "prompt_template", contentClass: "content_free" as const },
  { sourceTable: "adaptive_practice_items", sourceField: "prompt_snapshot_ciphertext", contentClass: "learner_visible" as const },
  { sourceTable: "adaptive_practice_items", sourceField: "option_snapshot_ciphertext", contentClass: "learner_visible" as const },
  { sourceTable: "adaptive_practice_items", sourceField: "scoring_snapshot_ciphertext", contentClass: "hidden_system" as const },
];

/** Sprint 5 inventory adds every legacy scalar/token source named by the
 * cutover contract. The older list above remains stable for Sprint 1-4
 * callers; T11 workers use this complete list. */
export const VERA_T11_LEGACY_INVENTORY_FIELDS = [
  ...VERA_LEGACY_CONTENT_FIELDS,
  { sourceTable: "ai_messages", sourceField: "content_markdown:role=system", contentClass: "hidden_system" as const },
  { sourceTable: "ai_conversations", sourceField: "context_entity_type", contentClass: "content_free" as const },
  { sourceTable: "ai_conversations", sourceField: "context_entity_id", contentClass: "content_free" as const },
  { sourceTable: "adaptive_practice_answers", sourceField: "generated_item_ref", contentClass: "content_free" as const },
  { sourceTable: "ai_requests", sourceField: "model", contentClass: "content_free" as const },
  { sourceTable: "ai_requests", sourceField: "input_tokens", contentClass: "content_free" as const },
  { sourceTable: "ai_requests", sourceField: "output_tokens", contentClass: "content_free" as const },
  { sourceTable: "ai_usage_daily", sourceField: "prompt_tokens", contentClass: "content_free" as const },
  { sourceTable: "ai_usage_daily", sourceField: "completion_tokens", contentClass: "content_free" as const },
];

export function assertT11MigrationInventoryComplete(entries: MigrationInventoryEntry[]): void {
  const expected = new Map(VERA_T11_LEGACY_INVENTORY_FIELDS.map((field) => [
    `${field.sourceTable}:${field.sourceField}`,
    field.contentClass,
  ]));
  const actual = new Map(entries.map((entry) => [
    `${entry.sourceTable}:${entry.sourceField}`,
    entry,
  ]));
  const missing = [...expected.keys()].filter((key) => !actual.has(key));
  const wrongClass = [...actual.values()]
    .filter((entry) => expected.has(`${entry.sourceTable}:${entry.sourceField}`))
    .filter((entry) => expected.get(`${entry.sourceTable}:${entry.sourceField}`) !== entry.contentClass)
    .map((entry) => `${entry.sourceTable}:${entry.sourceField}`);
  const unclassified = [...actual.values()]
    .filter((entry) => expected.has(`${entry.sourceTable}:${entry.sourceField}`) && entry.unclassifiedPlaintext > 0)
    .map((entry) => `${entry.sourceTable}:${entry.sourceField}`);
  if (missing.length || wrongClass.length || unclassified.length) {
    throw new VeraContractError(
      "legacy_context_rejected",
      "The complete T11 legacy inventory is not classified.",
      409,
      { missing, wrongClass, unclassified },
    );
  }
}

export function assertMigrationInventoryComplete(entries: MigrationInventoryEntry[]): void {
  const expected = new Map(VERA_LEGACY_CONTENT_FIELDS.map((field) => [
    `${field.sourceTable}:${field.sourceField}`,
    field.contentClass,
  ]));
  const actual = new Set(entries.map((entry) => `${entry.sourceTable}:${entry.sourceField}`));
  const missing = [...expected.keys()].filter((key) => !actual.has(key));
  const wrongClass = entries
    .filter((entry) => expected.has(`${entry.sourceTable}:${entry.sourceField}`))
    .filter((entry) => expected.get(`${entry.sourceTable}:${entry.sourceField}`) !== entry.contentClass)
    .map((entry) => `${entry.sourceTable}:${entry.sourceField}`);
  const unclassified = entries.filter((entry) => entry.unclassifiedPlaintext > 0);
  if (missing.length || wrongClass.length || unclassified.length) {
    throw new VeraContractError(
      "legacy_context_rejected",
      "Legacy AI content inventory is not complete.",
      409,
      { missing, wrongClass, unclassified },
    );
  }
}

export function contentFreeMigrationAudit(input: {
  sourceTable: string;
  sourceField: string;
  migrationVersion: string;
  rowCount: number;
}): MigrationInventoryEntry {
  return {
    sourceTable: input.sourceTable,
    sourceField: input.sourceField,
    contentClass: "content_free",
    rowCount: input.rowCount,
    unclassifiedPlaintext: 0,
  };
}

export class InMemoryPurgeMarkerStore {
  private readonly markers = new Map<string, PurgeMarker>();

  create(packId: string, sourceIds: string[], reason: string, now = new Date()): PurgeMarker {
    const existing = this.markers.get(packId);
    if (existing) return { ...existing, sourceIds: [...existing.sourceIds] };
    const marker: PurgeMarker = {
      packId,
      state: "available",
      provenanceState: "reconstructable",
      sourceIds: [...new Set(sourceIds)],
      reason,
      startedAt: null,
      completedAt: null,
      purgeDigest: null,
    };
    this.markers.set(packId, marker);
    void now;
    return { ...marker, sourceIds: [...marker.sourceIds] };
  }

  markPurging(packId: string, reason: string, now = new Date()): PurgeMarker {
    const marker = this.getRequired(packId);
    if (marker.state === "purged") return { ...marker, sourceIds: [...marker.sourceIds] };
    marker.state = "purging";
    marker.provenanceState = "unavailable";
    marker.reason = reason;
    marker.startedAt ??= now;
    this.markers.set(packId, marker);
    return { ...marker, sourceIds: [...marker.sourceIds] };
  }

  markPurged(packId: string, contentDigests: string[], now = new Date()): PurgeMarker {
    const marker = this.getRequired(packId);
    if (marker.state === "purged") return { ...marker, sourceIds: [...marker.sourceIds] };
    if (marker.state !== "purging") throw new Error("A purge must be marked unavailable before content destruction.");
    marker.state = "purged";
    marker.provenanceState = "unavailable";
    marker.completedAt = now;
    marker.purgeDigest = sha256Hex([...contentDigests].sort().join("\n"));
    this.markers.set(packId, marker);
    return { ...marker, sourceIds: [...marker.sourceIds] };
  }

  get(packId: string): PurgeMarker | null {
    const marker = this.markers.get(packId);
    return marker ? { ...marker, sourceIds: [...marker.sourceIds] } : null;
  }

  private getRequired(packId: string): PurgeMarker {
    const marker = this.markers.get(packId);
    if (!marker) throw new Error(`Unknown context pack ${packId}`);
    return marker;
  }
}

import "server-only";

import { VERA_POLICY_EFFECTIVE_AT, VeraContractError } from "./contracts";
import type { MigrationInventoryEntry } from "./provenance";

export const VERA_LEGACY_CUTOVER_AT = new Date(VERA_POLICY_EFFECTIVE_AT);

export type VeraLegacyField =
  | "ai_messages.content_markdown"
  | "ai_requests.prompt_template"
  | "ai_conversations.context_entity"
  | "learning_recommendations.reason"
  | "ai_requests.raw_tokens";

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

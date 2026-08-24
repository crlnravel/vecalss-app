import "server-only";

import { VeraContractError } from "./contracts";

export type VeraApplyTargetName =
  | "learning_recommendation"
  | "adaptive_practice_session"
  | "ptn_strategy_session";

export type VeraApplyTargetContract = {
  table: string;
  revisionColumn: "revision";
  lifecycleColumn: "lifecycleState";
  lockedRevisionSource: "row_for_update.revision";
};

/** Closed v1 registry. Domain commands must select one of these rows rather
 * than accepting a client-supplied table/column/polymorphic registry key. */
export const VERA_APPLY_TARGET_REGISTRY: Readonly<Record<VeraApplyTargetName, VeraApplyTargetContract>> = {
  learning_recommendation: {
    table: "learning_recommendations",
    revisionColumn: "revision",
    lifecycleColumn: "lifecycleState",
    lockedRevisionSource: "row_for_update.revision",
  },
  adaptive_practice_session: {
    table: "adaptive_practice_sessions",
    revisionColumn: "revision",
    lifecycleColumn: "lifecycleState",
    lockedRevisionSource: "row_for_update.revision",
  },
  ptn_strategy_session: {
    table: "ptn_strategy_sessions",
    revisionColumn: "revision",
    lifecycleColumn: "lifecycleState",
    lockedRevisionSource: "row_for_update.revision",
  },
};

export function getApplyTargetContract(target: string): VeraApplyTargetContract {
  const contract = VERA_APPLY_TARGET_REGISTRY[target as VeraApplyTargetName];
  if (!contract) throw new VeraContractError("unsupported_target", "Target Apply Vera tidak didukung.", 422);
  return contract;
}

export function assertApplyRevision(expectedRevision: number, currentRevision: number): void {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || expectedRevision !== currentRevision) {
    throw new VeraContractError("target_unavailable", "Revisi target berubah atau tidak tersedia.", 409, {
      expectedRevision,
      currentRevision,
    });
  }
}

const EDIT_LEASE_RESOURCE_TYPES = [
  "materi",
  "quiz",
  "question_bank",
  "question_package",
  "tryout",
  "media_asset",
  "media_folder",
] as const;

type EditLeaseResourceType = (typeof EDIT_LEASE_RESOURCE_TYPES)[number];

type EditLeaseState = "acquiring" | "owned" | "locked" | "uncertain" | "lost";

type EditLeaseProof = {
  generation: number;
  token: string;
};

type EditLeaseServerStatus = {
  generation?: number;
  holderEmail?: string;
  holderName?: string;
  holderUserId?: string;
  remainingMs: number;
  serverNow: string;
  state: "locked" | "owned";
};

type EditLeaseCommandErrorCode =
  | "forbidden_origin"
  | "invalid_proof"
  | "json_media_type_required"
  | "lease_expired"
  | "lease_superseded"
  | "proof_too_large"
  | "resource_busy_retry"
  | "resource_inaccessible"
  | "resource_locked"
  | "unauthenticated";

const EDIT_LEASE_TTL_MS = 2 * 60 * 1000;
const EDIT_LEASE_HEARTBEAT_MS = 30 * 1000;
const EDIT_LEASE_SAFETY_MARGIN_MS = 5 * 1000;

export {
  EDIT_LEASE_HEARTBEAT_MS,
  EDIT_LEASE_RESOURCE_TYPES,
  EDIT_LEASE_SAFETY_MARGIN_MS,
  EDIT_LEASE_TTL_MS,
};

export type {
  EditLeaseCommandErrorCode,
  EditLeaseProof,
  EditLeaseResourceType,
  EditLeaseServerStatus,
  EditLeaseState,
};

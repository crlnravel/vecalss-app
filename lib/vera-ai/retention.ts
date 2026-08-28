import "server-only";

import { createHash } from "node:crypto";

import { canonicalJson, sha256Hex } from "./contracts";

export const VERA_RETENTION_POLICY_VERSION = "vera-retention-v1-2026-08-24";
export const VERA_RETENTION = {
  resultStageDays: 1,
  settlementHours: 2,
  recoveryGraceHours: 24,
  contextEvidenceDays: 30,
  evidenceHardCapDays: 90,
  acceptedIdempotencyDays: 90,
  transientRejectedIdempotencyHours: 24,
  terminalIdempotencyDays: 90,
  admissionTelemetryDays: 90,
  operationalMetadataDays: 400,
  holdAuditDays: 400,
  applyTombstoneDays: 90,
  exportDownloadDays: 7,
  exportPartialPackageHours: 24,
  exportTerminalMetadataDays: 90,
} as const;

export const VERA_EXPORT_FORMAT = "json_v1" as const;
export const VERA_EXPORT_SCHEMA = "vera.export.canonical-json.v1" as const;
export const VERA_EXPORT_PART_BYTES = 256 * 1024;
export const VERA_EXPORT_MAX_BYTES = 10 * 1024 * 1024;
export const VERA_EXPORT_MAX_PARTS = 256;
export const VERA_MATERIALIZATION_LEASE_MS = 2 * 60 * 1000;
export const VERA_EXPORT_GRANT_LEASE_MS = 2 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type RetentionEvaluation = {
  normalDeadline: Date;
  effectiveDeadline: Date | null;
  suspendedByHold: boolean;
  policyVersion: string;
};

export type RetentionDeadlineInput = {
  baseDeadline: Date;
  existingDeadline?: Date | null;
  requestCreatedAt?: Date;
  eligibleRetainedArtifactOrTypedResult?: boolean;
  approvedExtensionMs?: number;
  activeHold?: boolean;
  policyVersion?: string;
};

function copyDate(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error("A valid UTC date is required.");
  return new Date(value.getTime());
}

function maxDate(...values: Array<Date | null | undefined>): Date {
  const candidates = values.filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
  if (candidates.length === 0) throw new Error("At least one retention deadline is required.");
  return new Date(Math.max(...candidates.map((value) => value.getTime())));
}

function addMs(value: Date, amount: number): Date {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Retention extension must be a non-negative finite duration.");
  return new Date(value.getTime() + amount);
}

export function calculateRetentionDeadline(input: RetentionDeadlineInput): RetentionEvaluation {
  const baseDeadline = copyDate(input.baseDeadline);
  let normalDeadline = maxDate(input.existingDeadline, baseDeadline);

  if (input.eligibleRetainedArtifactOrTypedResult) {
    if (!input.requestCreatedAt) throw new Error("Eligible evidence retention requires requestCreatedAt.");
    const extensionMs = input.approvedExtensionMs ?? 0;
    const extended = addMs(normalDeadline, extensionMs);
    const hardCap = addMs(copyDate(input.requestCreatedAt), VERA_RETENTION.evidenceHardCapDays * DAY_MS);
    normalDeadline = new Date(Math.min(extended.getTime(), hardCap.getTime()));
  }

  return {
    normalDeadline,
    effectiveDeadline: input.activeHold ? null : copyDate(normalDeadline),
    suspendedByHold: input.activeHold === true,
    policyVersion: input.policyVersion ?? VERA_RETENTION_POLICY_VERSION,
  };
}

export function settlementDeadline(acceptedAt: Date): Date {
  return addMs(copyDate(acceptedAt), VERA_RETENTION.settlementHours * HOUR_MS);
}

export function resultStagePurgeDeadline(input: {
  stagedAt: Date;
  storedExpiresAt?: Date | null;
  settlementDeadlineAt?: Date | null;
}): Date {
  const settlement = input.settlementDeadlineAt ?? settlementDeadline(input.stagedAt);
  return maxDate(
    input.storedExpiresAt,
    addMs(settlement, VERA_RETENTION.recoveryGraceHours * HOUR_MS),
    addMs(copyDate(input.stagedAt), VERA_RETENTION.resultStageDays * DAY_MS),
  );
}

export function contextEvidenceDeadline(input: {
  requestCreatedAt: Date;
  existingDeadline?: Date | null;
  eligibleRetainedArtifactOrTypedResult?: boolean;
  approvedExtensionMs?: number;
  activeHold?: boolean;
}): RetentionEvaluation {
  return calculateRetentionDeadline({
    baseDeadline: addMs(copyDate(input.requestCreatedAt), VERA_RETENTION.contextEvidenceDays * DAY_MS),
    existingDeadline: input.existingDeadline,
    requestCreatedAt: input.requestCreatedAt,
    eligibleRetainedArtifactOrTypedResult: input.eligibleRetainedArtifactOrTypedResult,
    approvedExtensionMs: input.approvedExtensionMs,
    activeHold: input.activeHold,
  });
}

export function idempotencyDeadline(input: {
  occurredAt: Date;
  state: "accepted" | "transient_rejected" | "terminal_rejected";
}): Date {
  const occurredAt = copyDate(input.occurredAt);
  switch (input.state) {
    case "accepted":
      return addMs(occurredAt, VERA_RETENTION.acceptedIdempotencyDays * DAY_MS);
    case "transient_rejected":
      return addMs(occurredAt, VERA_RETENTION.transientRejectedIdempotencyHours * HOUR_MS);
    case "terminal_rejected":
      return addMs(occurredAt, VERA_RETENTION.terminalIdempotencyDays * DAY_MS);
  }
}

export function exportDownloadDeadline(downloadReadyAt: Date): Date {
  return addMs(copyDate(downloadReadyAt), VERA_RETENTION.exportDownloadDays * DAY_MS);
}

export function preReadyExportDeadlines(terminalAt: Date): {
  partialPackagePurgeAt: Date;
  terminalRetentionExpiresAt: Date;
} {
  const authoritative = copyDate(terminalAt);
  return {
    partialPackagePurgeAt: addMs(authoritative, VERA_RETENTION.exportPartialPackageHours * HOUR_MS),
    terminalRetentionExpiresAt: addMs(authoritative, VERA_RETENTION.exportTerminalMetadataDays * DAY_MS),
  };
}

export function assertDeadlineNeverShortened(previous: Date | null | undefined, next: Date): void {
  if (previous && copyDate(next).getTime() < copyDate(previous).getTime()) {
    throw new Error("Retention deadlines may only move later.");
  }
}

export type CapabilityDecision = "allow" | "deny";

export type CapabilityDecisionSnapshot = {
  operation: string;
  subjectId: string;
  operatorId: string;
  requiredCapabilityUnion: string[];
  grantedCapabilitySetDigest: string;
  capabilityPolicyVersion: string;
  decision: CapabilityDecision;
  evaluatedAt: Date;
  capabilityDecisionId: string;
  snapshotDigest: string;
};

export function capabilitySnapshotDigest(input: Omit<CapabilityDecisionSnapshot, "snapshotDigest">): string {
  return sha256Hex(canonicalJson({
    ...input,
    evaluatedAt: input.evaluatedAt.toISOString(),
    requiredCapabilityUnion: [...input.requiredCapabilityUnion].sort(),
  }));
}

export function withCapabilitySnapshotDigest(
  input: Omit<CapabilityDecisionSnapshot, "snapshotDigest">,
): CapabilityDecisionSnapshot {
  return { ...input, snapshotDigest: capabilitySnapshotDigest(input) };
}

export function assertDualCapabilityApproval(
  snapshots: readonly CapabilityDecisionSnapshot[],
  requiredCapabilities: readonly string[] = [],
): void {
  if (snapshots.length !== 2) throw new Error("Exactly two capability decisions are required.");
  const [first, second] = snapshots;
  if (!first || !second || first.operatorId === second.operatorId) throw new Error("Dual-control operators must be distinct.");
  for (const snapshot of snapshots) {
    if (snapshot.decision !== "allow") throw new Error("A denied capability decision cannot approve an irreversible action.");
    if (snapshot.snapshotDigest !== capabilitySnapshotDigest({ ...snapshot, snapshotDigest: undefined } as Omit<CapabilityDecisionSnapshot, "snapshotDigest">)) {
      throw new Error("Capability decision snapshot digest mismatch.");
    }
    if (requiredCapabilities.some((capability) => !snapshot.requiredCapabilityUnion.includes(capability))) {
      throw new Error("Required capability is absent from the decision snapshot.");
    }
  }
}

export type StateFirstMarker = {
  objectType: string;
  objectId: string;
  state: "available" | "purging" | "purged";
  provenanceState: "reconstructable" | "unavailable";
  keyLineageDigest: string | null;
  purgeReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  purgeDigest: string | null;
};

export type KeyDestroyer = {
  destroy(keyLineageDigest: string): Promise<{ resultDigest: string }>;
};

/**
 * Small deterministic state machine used by workers and focused tests. The
 * database implementation follows these same boundaries: marker first,
 * durable key destruction second, final purged marker last.
 */
export class InMemoryStateFirstPurgeStore {
  private readonly markers = new Map<string, StateFirstMarker>();

  create(input: {
    objectType: string;
    objectId: string;
    keyLineageDigest?: string | null;
    now?: Date;
  }): StateFirstMarker {
    const key = `${input.objectType}:${input.objectId}`;
    const existing = this.markers.get(key);
    if (existing) return { ...existing, startedAt: existing.startedAt && new Date(existing.startedAt), completedAt: existing.completedAt && new Date(existing.completedAt) };
    const marker: StateFirstMarker = {
      objectType: input.objectType,
      objectId: input.objectId,
      state: "available",
      provenanceState: "reconstructable",
      keyLineageDigest: input.keyLineageDigest ?? null,
      purgeReason: null,
      startedAt: null,
      completedAt: null,
      purgeDigest: null,
    };
    this.markers.set(key, marker);
    void input.now;
    return { ...marker };
  }

  markPurging(objectType: string, objectId: string, reason: string, now = new Date()): StateFirstMarker {
    const marker = this.required(objectType, objectId);
    if (marker.state === "purged") return { ...marker };
    marker.state = "purging";
    marker.provenanceState = "unavailable";
    marker.purgeReason = reason;
    marker.startedAt ??= new Date(now);
    this.markers.set(`${objectType}:${objectId}`, marker);
    return { ...marker };
  }

  async destroyAndFinalize(input: {
    objectType: string;
    objectId: string;
    keyDestroyer: KeyDestroyer;
    now?: Date;
  }): Promise<StateFirstMarker> {
    const marker = this.required(input.objectType, input.objectId);
    if (marker.state === "purged") return { ...marker };
    if (marker.state !== "purging") throw new Error("State-first purge requires an unavailable marker.");
    if (!marker.keyLineageDigest) throw new Error("Key lineage is unavailable; object remains purging.");
    const result = await input.keyDestroyer.destroy(marker.keyLineageDigest);
    marker.state = "purged";
    marker.provenanceState = "unavailable";
    marker.completedAt = new Date(input.now ?? new Date());
    marker.purgeDigest = createHash("sha256").update(`${marker.keyLineageDigest}:${result.resultDigest}`).digest("hex");
    this.markers.set(`${input.objectType}:${input.objectId}`, marker);
    return { ...marker };
  }

  get(objectType: string, objectId: string): StateFirstMarker | null {
    const marker = this.markers.get(`${objectType}:${objectId}`);
    return marker ? { ...marker } : null;
  }

  private required(objectType: string, objectId: string): StateFirstMarker {
    const marker = this.markers.get(`${objectType}:${objectId}`);
    if (!marker) throw new Error(`Unknown purge object ${objectType}:${objectId}`);
    return marker;
  }
}

function normalizedExportValue(value: unknown): unknown {
  if (value instanceof Date) return formatExportInstant(value);
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Export JSON cannot contain non-finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalizedExportValue);
  if (value && typeof value === "object") {
    const entries: Array<[string, unknown]> = Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => [key.normalize("NFC"), normalizedExportValue(nested)])
      ;
    entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return Object.fromEntries(entries);
  }
  return value;
}

export function formatExportInstant(value: Date): string {
  const iso = copyDate(value).toISOString();
  return `${iso.slice(0, 19)}.${iso.slice(20, 23)}000Z`;
}

export function canonicalExportJson(value: unknown): string {
  return JSON.stringify(normalizedExportValue(value));
}

export function exportSnapshotDigest(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

export function splitExportParts(bytes: Uint8Array, maxBytes = VERA_EXPORT_PART_BYTES): Uint8Array[] {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("Export part size must be positive.");
  if (bytes.byteLength > VERA_EXPORT_MAX_BYTES) throw new Error("Export package exceeds the canonical 10 MiB limit.");
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; ) {
    let end = Math.min(offset + maxBytes, bytes.byteLength);
    while (end > offset && end < bytes.byteLength && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end === offset) throw new Error("Unable to split export at a UTF-8 boundary.");
    parts.push(bytes.slice(offset, end));
    offset = end;
  }
  if (parts.length === 0) parts.push(new Uint8Array());
  if (parts.length > VERA_EXPORT_MAX_PARTS) throw new Error("Export package exceeds the part-count limit.");
  return parts;
}

import "server-only";

import { randomUUID } from "node:crypto";

import {
  hmacFingerprint,
  mapOperation,
  VERA_FINGERPRINT_KEY_VERSION,
  type VeraIdempotencyState,
  type VeraOperation,
} from "./contracts";

export type IdempotencyResultKind =
  | "none"
  | "request"
  | "conversation"
  | "artifact_apply"
  | "learning_recommendation"
  | "export_job"
  | "conversation_delete"
  | "artifact_delete";

export type IdempotencyRecord = {
  id: string;
  studentId: string;
  operation: VeraOperation;
  clientRequestId: string;
  requestFingerprint: string;
  fingerprintKeyVersion: string;
  state: VeraIdempotencyState;
  rejectionClass?: "transient" | "terminal";
  rejectionCode?: string;
  tombstoneCode?: string;
  resultKind: IdempotencyResultKind;
  resultId: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  acceptedAt: Date | null;
  terminalAt: Date | null;
  settlementDeadlineAt: Date | null;
  expiresAt: Date;
};

export type IdempotencyBeginResult =
  | { kind: "new"; record: IdempotencyRecord }
  | { kind: "retry_rejected"; record: IdempotencyRecord }
  | { kind: "replay"; record: IdempotencyRecord }
  | { kind: "conflict"; record: IdempotencyRecord }
  | { kind: "expired"; record: IdempotencyRecord };

export interface IdempotencyStore {
  get(studentId: string, operation: VeraOperation, clientRequestId: string): Promise<IdempotencyRecord | null>;
  insert(record: IdempotencyRecord): Promise<IdempotencyRecord>;
  update(record: IdempotencyRecord): Promise<IdempotencyRecord>;
}

function clone(record: IdempotencyRecord): IdempotencyRecord {
  return {
    ...record,
    firstSeenAt: new Date(record.firstSeenAt),
    lastSeenAt: new Date(record.lastSeenAt),
    acceptedAt: record.acceptedAt ? new Date(record.acceptedAt) : null,
    terminalAt: record.terminalAt ? new Date(record.terminalAt) : null,
    settlementDeadlineAt: record.settlementDeadlineAt ? new Date(record.settlementDeadlineAt) : null,
    expiresAt: new Date(record.expiresAt),
  };
}

function createRecord(input: {
  id: string;
  studentId: string;
  operation: VeraOperation;
  clientRequestId: string;
  requestFingerprint: string;
  fingerprintKeyVersion: string;
  now: Date;
  expiresAt: Date;
}): IdempotencyRecord {
  return {
    ...input,
    state: "rejected",
    resultKind: "none",
    resultId: null,
    firstSeenAt: input.now,
    lastSeenAt: input.now,
    acceptedAt: null,
    terminalAt: null,
    settlementDeadlineAt: null,
    expiresAt: input.expiresAt,
  };
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async get(studentId: string, operation: VeraOperation, clientRequestId: string): Promise<IdempotencyRecord | null> {
    const record = this.records.get(`${studentId}:${operation}:${clientRequestId}`);
    return record ? clone(record) : null;
  }

  async insert(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    const key = `${record.studentId}:${record.operation}:${record.clientRequestId}`;
    const existing = this.records.get(key);
    if (existing) throw new IdempotencyUniqueWinnerError(clone(existing));
    this.records.set(key, clone(record));
    return clone(record);
  }

  async update(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    this.records.set(`${record.studentId}:${record.operation}:${record.clientRequestId}`, clone(record));
    return clone(record);
  }
}

export class IdempotencyUniqueWinnerError extends Error {
  readonly winner: IdempotencyRecord;

  constructor(winner: IdempotencyRecord) {
    super("Another transaction won the idempotency key.");
    this.name = "IdempotencyUniqueWinnerError";
    this.winner = winner;
  }
}

export class IdempotencyService {
  constructor(
    private readonly store: IdempotencyStore,
    private readonly options: {
      hmacSecret: string;
      fingerprintKeyVersion?: string;
      acceptedTtlMs?: number;
      rejectedTtlMs?: number;
      terminalRejectedTtlMs?: number;
    },
  ) {}

  fingerprint(operation: VeraOperation, payload: Record<string, unknown>): string {
    return hmacFingerprint(operation, payload, this.options.hmacSecret);
  }

  async lookup(input: {
    studentId: string;
    operation: VeraOperation;
    clientRequestId: string;
  }): Promise<IdempotencyRecord | null> {
    return this.store.get(input.studentId, input.operation, input.clientRequestId);
  }

  async begin(input: {
    studentId: string;
    operation: VeraOperation;
    clientRequestId: string;
    payload: Record<string, unknown>;
    now?: Date;
  }): Promise<IdempotencyBeginResult> {
    const now = input.now ?? new Date();
    const fingerprintKeyVersion = this.options.fingerprintKeyVersion ?? VERA_FINGERPRINT_KEY_VERSION;
    const fingerprint = this.fingerprint(input.operation, input.payload);
    const existing = await this.store.get(input.studentId, input.operation, input.clientRequestId);

    if (existing) {
      const next = clone(existing);
      next.lastSeenAt = now;
      await this.store.update(next);
      if (next.state === "expired" || now >= next.expiresAt) {
        if (next.state !== "expired") {
          next.state = "expired";
          next.tombstoneCode = "idempotency_key_expired";
          next.terminalAt ??= now;
          await this.store.update(next);
        }
        return { kind: "expired", record: next };
      }
      if (next.requestFingerprint !== fingerprint) return { kind: "conflict", record: next };
      if (next.state === "accepted") return { kind: "replay", record: next };
      if (next.rejectionClass === "terminal") return { kind: "replay", record: next };
      return { kind: "retry_rejected", record: next };
    }

    const record = createRecord({
      id: randomUUID(),
      studentId: input.studentId,
      operation: input.operation,
      clientRequestId: input.clientRequestId,
      requestFingerprint: fingerprint,
      fingerprintKeyVersion,
      now,
      expiresAt: new Date(now.getTime() + (this.options.rejectedTtlMs ?? 24 * 60 * 60 * 1000)),
    });

    try {
      await this.store.insert(record);
      return { kind: "new", record };
    } catch (error) {
      if (!(error instanceof IdempotencyUniqueWinnerError)) throw error;
      const winner = error.winner;
      if (winner.state === "expired" || now >= winner.expiresAt) {
        const tombstone = clone(winner);
        if (tombstone.state !== "expired") {
          tombstone.state = "expired";
          tombstone.tombstoneCode = "idempotency_key_expired";
          tombstone.terminalAt ??= now;
          tombstone.lastSeenAt = now;
          await this.store.update(tombstone);
        }
        return { kind: "expired", record: tombstone };
      }
      if (winner.requestFingerprint !== fingerprint) return { kind: "conflict", record: winner };
      if (winner.state === "accepted" || winner.rejectionClass === "terminal") {
        return { kind: "replay", record: winner };
      }
      return { kind: "retry_rejected", record: winner };
    }
  }

  async accept(
    record: IdempotencyRecord,
    result: { kind: IdempotencyResultKind; id: string },
    now = new Date(),
    settlementDeadlineAt: Date | null = null,
  ): Promise<IdempotencyRecord> {
    const current = await this.store.get(record.studentId, record.operation, record.clientRequestId);
    const next = clone(current ?? record);
    if (next.state === "accepted") return next;
    if (next.state === "expired" || next.rejectionClass === "terminal") {
      throw new Error("A terminal or expired idempotency key cannot be accepted.");
    }
    next.state = "accepted";
    next.rejectionClass = undefined;
    next.rejectionCode = undefined;
    next.resultKind = result.kind;
    next.resultId = result.id;
    next.acceptedAt = now;
    next.settlementDeadlineAt = settlementDeadlineAt;
    next.expiresAt = new Date(now.getTime() + (this.options.acceptedTtlMs ?? 90 * 24 * 60 * 60 * 1000));
    return this.store.update(next);
  }

  async reject(
    record: IdempotencyRecord,
    rejection: { code: string; classification: "transient" | "terminal" },
    now = new Date(),
  ): Promise<IdempotencyRecord> {
    const current = await this.store.get(record.studentId, record.operation, record.clientRequestId);
    if (current?.state === "accepted") return current;
    const next = clone(current ?? record);
    next.state = "rejected";
    next.rejectionClass = rejection.classification;
    next.rejectionCode = rejection.code;
    next.lastSeenAt = now;
    next.terminalAt = rejection.classification === "terminal" ? now : null;
    if (rejection.classification === "terminal") {
      next.expiresAt = new Date(now.getTime() + (this.options.terminalRejectedTtlMs ?? this.options.acceptedTtlMs ?? 90 * 24 * 60 * 60 * 1000));
    }
    return this.store.update(next);
  }

  async expire(record: IdempotencyRecord, tombstoneCode = "idempotency_key_expired", now = new Date()): Promise<IdempotencyRecord> {
    const next = clone(record);
    next.state = "expired";
    next.tombstoneCode = tombstoneCode;
    next.terminalAt = now;
    next.lastSeenAt = now;
    return this.store.update(next);
  }
}

export function idempotencyOperationName(operation: VeraOperation): string {
  return mapOperation(operation);
}

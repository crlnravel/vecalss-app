import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  LOCK_LEVEL,
  acquireDomainMutex,
  acquirePrincipalRuntimeKey,
  lockOrderedRows,
  setTransactionLockTimeout,
  tryoutMutexKey,
} from "@/lib/serialization/locks";

type TryoutTransaction = Prisma.TransactionClient;

type TryoutIdentityKind =
  | "tryout"
  | "session"
  | "admission"
  | "assignment"
  | "attempt"
  | "run";

type TryoutIdentity = {
  id: string;
  kind: TryoutIdentityKind;
};

type ResolvedTryoutIdentity = {
  attemptId?: string;
  assignmentId?: string;
  admissionId?: string;
  runId?: string;
  sessionId?: string;
  studentId?: string;
  tryoutId: string;
  tryoutSectionId?: string;
};

class TryoutIdentityChangedError extends Error {
  readonly code = "tryout_identity_changed" as const;

  constructor() {
    super("Tryout identity changed while the operation was starting. Retry the operation.");
    this.name = "TryoutIdentityChangedError";
  }
}

async function resolveTryoutIdentity(
  tx: TryoutTransaction,
  identity: TryoutIdentity,
): Promise<ResolvedTryoutIdentity | null> {
  switch (identity.kind) {
    case "tryout": {
      const row = await tx.tryoutPackage.findUnique({ where: { id: identity.id }, select: { id: true } });
      return row ? { tryoutId: row.id } : null;
    }
    case "session": {
      const row = await tx.tryoutDeliverySession.findUnique({ where: { id: identity.id }, select: { id: true, tryoutId: true } });
      return row ? { sessionId: row.id, tryoutId: row.tryoutId } : null;
    }
    case "admission": {
      const row = await tx.tryoutAdmission.findUnique({ where: { id: identity.id }, select: { id: true, studentId: true, tryoutId: true } });
      return row ? { admissionId: row.id, studentId: row.studentId, tryoutId: row.tryoutId } : null;
    }
    case "assignment": {
      const row = await tx.tryoutDeliveryAssignment.findUnique({
        where: { id: identity.id },
        select: {
          id: true,
          admission: { select: { id: true, studentId: true, tryoutId: true } },
          deliverySession: { select: { id: true, tryoutId: true } },
        },
      });
      if (!row || row.admission.tryoutId !== row.deliverySession.tryoutId) return null;
      return {
        assignmentId: row.id,
        admissionId: row.admission.id,
        sessionId: row.deliverySession.id,
        studentId: row.admission.studentId,
        tryoutId: row.admission.tryoutId,
      };
    }
    case "attempt": {
      const row = await tx.tryoutAttempt.findUnique({
        where: { id: identity.id },
        select: {
          id: true,
          admissionId: true,
          deliverySessionId: true,
          studentId: true,
          tryoutId: true,
          admission: { select: { tryoutId: true } },
          deliverySession: { select: { tryoutId: true } },
        },
      });
      if (!row || row.tryoutId !== row.admission.tryoutId || row.tryoutId !== row.deliverySession.tryoutId) return null;
      const assignment = await tx.tryoutDeliveryAssignment.findUnique({
        where: { admissionId_deliverySessionId: { admissionId: row.admissionId, deliverySessionId: row.deliverySessionId } },
        select: { id: true },
      });
      return {
        assignmentId: assignment?.id,
        attemptId: row.id,
        admissionId: row.admissionId,
        sessionId: row.deliverySessionId,
        studentId: row.studentId,
        tryoutId: row.tryoutId,
      };
    }
    case "run": {
      const row = await tx.tryoutAttemptTestRun.findUnique({
        where: { id: identity.id },
        select: {
          id: true,
          attemptId: true,
          tryoutSectionId: true,
          attempt: {
            select: {
              admissionId: true,
              deliverySessionId: true,
              studentId: true,
              tryoutId: true,
              admission: { select: { tryoutId: true } },
              deliverySession: { select: { tryoutId: true } },
            },
          },
          section: { select: { tryoutId: true } },
        },
      });
      if (
        !row
        || row.attempt.tryoutId !== row.attempt.admission.tryoutId
        || row.attempt.tryoutId !== row.attempt.deliverySession.tryoutId
        || row.attempt.tryoutId !== row.section.tryoutId
      ) return null;
      const assignment = await tx.tryoutDeliveryAssignment.findUnique({
        where: { admissionId_deliverySessionId: { admissionId: row.attempt.admissionId, deliverySessionId: row.attempt.deliverySessionId } },
        select: { id: true },
      });
      return {
        assignmentId: assignment?.id,
        attemptId: row.attemptId,
        admissionId: row.attempt.admissionId,
        runId: row.id,
        sessionId: row.attempt.deliverySessionId,
        studentId: row.attempt.studentId,
        tryoutId: row.attempt.tryoutId,
        tryoutSectionId: row.tryoutSectionId,
      };
    }
  }
}

async function acquireTryoutMutex(tx: TryoutTransaction, tryoutId: string) {
  await acquireDomainMutex(tx, tryoutMutexKey(tryoutId));
}

async function lockTryoutAggregate(tx: TryoutTransaction, tryoutId: string) {
  await lockOrderedRows(tx, LOCK_LEVEL.aggregate, [tryoutId], async (client, key) => {
    await client.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${key}::uuid FOR UPDATE`;
  });
}

async function lockTryoutSessions(tx: TryoutTransaction, sessionIds: readonly string[]) {
  await lockOrderedRows(tx, LOCK_LEVEL.session, sessionIds.map((id) => `session:${id}`), async (client, key) => {
    await client.$queryRaw`SELECT id FROM tryout_delivery_sessions WHERE id = ${key.slice("session:".length)}::uuid FOR UPDATE`;
  });
}

async function lockTryoutAdmissions(tx: TryoutTransaction, admissionIds: readonly string[]) {
  await lockOrderedRows(tx, LOCK_LEVEL.runtime, admissionIds.map((id) => `admission:${id}`), async (client, key) => {
    await client.$queryRaw`SELECT id FROM tryout_admissions WHERE id = ${key.slice("admission:".length)}::uuid FOR UPDATE`;
  });
}

async function lockTryoutAssignments(tx: TryoutTransaction, assignmentIds: readonly string[]) {
  await lockOrderedRows(tx, LOCK_LEVEL.runtime, assignmentIds.map((id) => `assignment:${id}`), async (client, key) => {
    await client.$queryRaw`SELECT id FROM tryout_delivery_assignments WHERE id = ${key.slice("assignment:".length)}::uuid FOR UPDATE`;
  });
}

async function lockTryoutAttempts(tx: TryoutTransaction, attemptIds: readonly string[]) {
  await lockOrderedRows(tx, LOCK_LEVEL.runtime, attemptIds.map((id) => `attempt:${id}`), async (client, key) => {
    await client.$queryRaw`SELECT id FROM tryout_attempts WHERE id = ${key.slice("attempt:".length)}::uuid FOR UPDATE`;
  });
}

async function lockTryoutRuns(tx: TryoutTransaction, runIds: readonly string[]) {
  await lockOrderedRows(tx, LOCK_LEVEL.runtime, runIds.map((id) => `run:${id}`), async (client, key) => {
    await client.$queryRaw`SELECT id FROM tryout_attempt_test_runs WHERE id = ${key.slice("run:".length)}::uuid FOR UPDATE`;
  });
}

async function lockTryoutStudents(tx: TryoutTransaction, studentIds: readonly string[]) {
  for (const studentId of [...new Set(studentIds)].sort()) {
    // react-doctor-disable-next-line async-await-in-loop -- acquire participant locks in stable sorted order to avoid deadlocks.
    await acquirePrincipalRuntimeKey(tx, `tryout:student:${studentId}`);
  }
}

async function lockTryoutRuntimeKeys(tx: TryoutTransaction, keys: readonly string[]) {
  for (const key of [...new Set(keys)].sort()) {
    // react-doctor-disable-next-line async-await-in-loop -- acquire runtime locks in stable sorted order to avoid deadlocks.
    await acquirePrincipalRuntimeKey(tx, key);
  }
}

async function lockTryoutIdentity(
  tx: TryoutTransaction,
  identity: TryoutIdentity,
) {
  const afterMutex = await acquireTryoutIdentityMutex(tx, identity);
  if (!afterMutex) return null;
  await lockTryoutAggregate(tx, afterMutex.tryoutId);
  return assertTryoutIdentityStable(tx, identity, afterMutex.tryoutId);
}

async function acquireTryoutIdentityMutex(
  tx: TryoutTransaction,
  identity: TryoutIdentity,
) {
  const preliminary = await resolveTryoutIdentity(tx, identity);
  if (!preliminary) return null;
  await acquireTryoutMutex(tx, preliminary.tryoutId);
  const afterMutex = await resolveTryoutIdentity(tx, identity);
  const mappingChanged = afterMutex && (
    afterMutex.tryoutId !== preliminary.tryoutId
    || afterMutex.sessionId !== preliminary.sessionId
    || afterMutex.admissionId !== preliminary.admissionId
    || afterMutex.assignmentId !== preliminary.assignmentId
    || afterMutex.attemptId !== preliminary.attemptId
    || afterMutex.runId !== preliminary.runId
    || afterMutex.studentId !== preliminary.studentId
    || afterMutex.tryoutSectionId !== preliminary.tryoutSectionId
  );
  if (!afterMutex || mappingChanged) {
    throw new TryoutIdentityChangedError();
  }
  return afterMutex;
}

async function assertTryoutIdentityStable(
  tx: TryoutTransaction,
  identity: TryoutIdentity,
  expectedTryoutId: string,
) {
  const current = await resolveTryoutIdentity(tx, identity);
  if (!current || current.tryoutId !== expectedTryoutId) {
    throw new TryoutIdentityChangedError();
  }
  return current;
}

async function prepareTryoutTransaction(tx: TryoutTransaction) {
  await setTransactionLockTimeout(tx);
}

export {
  TryoutIdentityChangedError,
  acquireTryoutMutex,
  acquireTryoutIdentityMutex,
  assertTryoutIdentityStable,
  lockTryoutAggregate,
  lockTryoutAdmissions,
  lockTryoutAssignments,
  lockTryoutAttempts,
  lockTryoutIdentity,
  lockTryoutRuns,
  lockTryoutSessions,
  lockTryoutStudents,
  lockTryoutRuntimeKeys,
  prepareTryoutTransaction,
  resolveTryoutIdentity,
};

export type { ResolvedTryoutIdentity, TryoutIdentity, TryoutIdentityKind, TryoutTransaction };

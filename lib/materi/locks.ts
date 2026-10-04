import "server-only";

import { Prisma } from "@/generated/prisma/client";

const MATERI_SUBJECT_LOCK_PREFIX = "vecalss:materi:subject:";

/**
 * Serialize learner progression with mentor writes that can change the
 * subject-wide module order. The transaction-scoped advisory lock is shared
 * by every Materi writer/reader and is acquired before topic row locks.
 */
async function lockMateriSubjectScope(
  tx: Prisma.TransactionClient,
  subjectCode: string,
) {
  // pg_advisory_xact_lock returns PostgreSQL `void`; executeRaw consumes the
  // command result without asking Prisma to deserialize that value.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${MATERI_SUBJECT_LOCK_PREFIX}${subjectCode}`}, 0))`;
}

async function lockMateriSubjectScopes(
  tx: Prisma.TransactionClient,
  subjectCodes: readonly string[],
) {
  const orderedLockKeys = [...new Set(subjectCodes)].sort().map((subjectCode) => `${MATERI_SUBJECT_LOCK_PREFIX}${subjectCode}`);
  if (orderedLockKeys.length === 0) return;

  // Keep the same deterministic order as the former loop, but let PostgreSQL
  // acquire the whole ordered set in one transaction command. This preserves
  // the deadlock boundary without awaiting one lock statement at a time. Keys
  // must match lockMateriSubjectScope exactly or the two never conflict.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(scope.lock_key, 0))
      FROM unnest(ARRAY[${Prisma.join(orderedLockKeys)}]::text[])
        WITH ORDINALITY AS scope(lock_key, lock_order)
     ORDER BY scope.lock_order
  `;
}

async function lockMateriProgressScope(
  tx: Prisma.TransactionClient,
  studentId: string,
  subjectCode: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`vecalss:materi:progress:${studentId}:${subjectCode}`}, 0))`;
}

export { lockMateriProgressScope, lockMateriSubjectScope, lockMateriSubjectScopes };

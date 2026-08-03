import "server-only";

import type { Prisma } from "@/generated/prisma/client";

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
  for (const subjectCode of [...new Set(subjectCodes)].sort()) {
    await lockMateriSubjectScope(tx, subjectCode);
  }
}

async function lockMateriProgressScope(
  tx: Prisma.TransactionClient,
  studentId: string,
  subjectCode: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`vecalss:materi:progress:${studentId}:${subjectCode}`}, 0))`;
}

export { lockMateriProgressScope, lockMateriSubjectScope, lockMateriSubjectScopes };

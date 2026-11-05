/**
 * When a Kuis or Tryout result is listed and compared. A scheduled release shows at its release time. An immediate release has no
 * release time, so it shows at its submit time, and an attempt with neither falls back to when it started.
 */
export function resultTime(row: { releaseAt: Date | null; submittedAt: Date | null; createdAt: Date }): Date {
  return row.releaseAt ?? row.submittedAt ?? row.createdAt;
}

/**
 * Newest first by result time, then by id. Prisma cannot order by this fallback, and Postgres puts NULL release times first in a
 * descending sort, so the rows are sorted here.
 */
export function newestFirst<T extends { id: string; releaseAt: Date | null; submittedAt: Date | null; createdAt: Date }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const later = resultTime(right).getTime() - resultTime(left).getTime();
    if (later !== 0) return later;
    if (left.id === right.id) return 0;
    return left.id < right.id ? -1 : 1;
  });
}

/** The newest of several results. Dates are compared as instants, never as text. */
export function newestResultOf<T extends { date: string }>(results: T[]): T | null {
  return results.reduce<T | null>(
    (newest, result) => (newest === null || Date.parse(result.date) > Date.parse(newest.date) ? result : newest),
    null,
  );
}

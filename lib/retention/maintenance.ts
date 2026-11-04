import "server-only";

import { prisma } from "@/lib/prisma";

type Db = Pick<typeof prisma, "$queryRaw">;

/** Batches per kind in one daily run; each batch is bounded by the SQL function's own limit. */
const MAX_BATCHES = 10;
const SCRUB_BATCH = 200;
const DELETE_BATCH = 100;

type ClassSummary = {
  caseSkipped?: number;
  class: string;
  complete: boolean;
  counts: Record<string, number>;
  heldSkipped?: number;
};

type RetentionMaintenanceResult = {
  /** Rows the delete path could not remove, by class. A non-zero value is a failure to investigate. */
  failedRows: number;
  /** False when a batch cap was reached; the rest waits for the next run. */
  complete: boolean;
  delete: ClassSummary[];
  scrub: ClassSummary[];
};

type ScrubResult = { busy?: true } & Partial<ClassSummary> & { examined?: number; registerVersion?: number };
type DeleteResult = { busy?: true; classes?: ClassSummary[]; registerVersion?: number };

function merge(into: ClassSummary[], next: ClassSummary[]) {
  for (const entry of next) {
    const existing = into.find((item) => item.class === entry.class);
    if (!existing) {
      into.push({ ...entry, counts: { ...entry.counts } });
      continue;
    }
    for (const [key, value] of Object.entries(entry.counts)) existing.counts[key] = (existing.counts[key] ?? 0) + value;
    existing.complete = entry.complete;
    existing.heldSkipped = entry.heldSkipped;
    existing.caseSkipped = entry.caseSkipped;
  }
}

/**
 * The daily retention step: scrub IP and device evidence past its period, then
 * delete what is past its period and not held. Both go through the SQL
 * functions owned by the maintenance role, which read the register and the holds
 * themselves and write the run log; this code only calls them, in bounded
 * batches, until a batch has nothing more to do. Safe to run twice.
 */
async function runRetentionMaintenance(db: Db = prisma): Promise<RetentionMaintenanceResult> {
  const scrub: ClassSummary[] = [];
  const del: ClassSummary[] = [];
  let complete = true;

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const [{ result }] = await db.$queryRaw<Array<{ result: ScrubResult }>>`SELECT retention_run_scrub(${SCRUB_BATCH}::int) AS result`;
    if (result.busy) break;
    merge(scrub, [{ class: result.class ?? "buyer_ip_device", complete: result.complete ?? true, counts: result.counts ?? {}, caseSkipped: result.caseSkipped, heldSkipped: result.heldSkipped }]);
    if (result.complete !== false) break;
    if (batch === MAX_BATCHES - 1) complete = false;
  }

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const [{ result }] = await db.$queryRaw<Array<{ result: DeleteResult }>>`SELECT retention_run_delete(${DELETE_BATCH}::int) AS result`;
    if (result.busy) break;
    const classes = result.classes ?? [];
    merge(del, classes);
    if (classes.every((entry) => entry.complete)) break;
    if (batch === MAX_BATCHES - 1) complete = false;
  }

  const failedRows = del.reduce((sum, entry) => sum + (entry.counts.failed ?? 0), 0);
  return { complete, delete: del, failedRows, scrub };
}

type RoleCheck = { findings: string[]; ok: boolean; role: string };

/** Asks the database whether the connected role could alter the schema or delete evidence. */
async function checkRuntimeRole(db: Db = prisma): Promise<RoleCheck> {
  const [{ result }] = await db.$queryRaw<Array<{ result: RoleCheck }>>`SELECT retention_role_check() AS result`;
  return result;
}

export { checkRuntimeRole, runRetentionMaintenance };
export type { ClassSummary, RetentionMaintenanceResult, RoleCheck };

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../prisma/migrations/20260726100000_add_scheduled_tryout_result_release/migration.sql", import.meta.url), "utf8");
const resultRepository = await readFile(new URL("../lib/tryout/result-repository.ts", import.meta.url), "utf8");
const attemptRepository = await readFile(new URL("../lib/tryout/attempt-repository.ts", import.meta.url), "utf8");

assert.match(migration, /ADD VALUE IF NOT EXISTS 'scheduled'/);
assert.match(migration, /ADD COLUMN scheduled_release_at timestamptz/);
assert.match(migration, /scheduled_release_at >= available_until/);
assert.match(migration, /default_release_not_scheduled_check/);

assert.match(attemptRepository, /scheduledReleaseAt: session\.scheduledReleaseAt\?\.toISOString\(\) \?\? null/);

assert.match(resultRepository, /policy === "scheduled" && !scheduledReleaseAt/);
assert.match(resultRepository, /synchronizeAttemptReleaseState/);
assert.match(resultRepository, /releaseState === AssessmentResultReleaseState\.released/);

console.log("Tryout scheduled and manual release invariants passed.");

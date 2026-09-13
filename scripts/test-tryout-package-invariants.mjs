import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [schema, repository, attemptRepository, release, assemblyRepository, migration] = await Promise.all([
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/attempt-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assessment-release.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assembly-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260725100000_enforce_ready_package_version_immutability/migration.sql", import.meta.url), "utf8"),
]);

assert.doesNotMatch(schema, /cat_pool|TryoutCatRunState|TwoPlQuestionCalibration|TryoutCatResolutionAudit|cat_item_count|cat_model_version|cat_state|cat_snapshot|cat_failure_reason|assembly_cat_calibration/u);
assert.doesNotMatch(repository, /cat_pool|catModelVersion|catReady|calibration|testType === "cat"/u);
assert.doesNotMatch(attemptRepository, /cat_pool|catModelVersion|catReady|catState|catSnapshot|catFailureReason|TRYOUT_CAT|calibration|testType === "cat"/u);
assert.doesNotMatch(release, /cat_pool|catModelVersion|catReady|catState|catSnapshot|catFailureReason|TRYOUT_CAT|calibration|testType === "cat"/u);
assert.doesNotMatch(assemblyRepository, /cat_pool|catModelVersion|catReady|calibration|testType === "cat"/u);
assert.match(repository, /readAndValidateDirectSources/u);
assert.match(attemptRepository, /TRYOUT_CBT_SCORING_VERSION/u);
assert.match(release, /assertTryoutReleaseEligibility/u);
assert.match(migration, /reusable_question_package_versions_ready_immutable/u);

console.log("Tryout CBT-only package invariants passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const repository = await readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../prisma/migrations/20260725100000_enforce_ready_package_version_immutability/migration.sql", import.meta.url), "utf8");
const scoredMigration = await readFile(new URL("../prisma/migrations/20260725150000_make_reusable_packages_one_bank_scored/migration.sql", import.meta.url), "utf8");
const attemptRepository = await readFile(new URL("../lib/tryout/attempt-repository.ts", import.meta.url), "utf8");
const deliveryRepository = await readFile(new URL("../lib/tryout/delivery-repository.ts", import.meta.url), "utf8");
const calibrationRepository = await readFile(new URL("../lib/tryout/calibration-repository.ts", import.meta.url), "utf8");
const catProfile = await readFile(new URL("../lib/tryout/cat-profile.ts", import.meta.url), "utf8");

// Negative save-time membership coverage: source IDs cannot reach item writes
// without the authoritative reread and every readiness condition.
assert.match(repository, /async function readAndValidatePackageSources/);
assert.match(repository, /FOR SHARE OF q, b/);
assert.match(repository, /sources\.length !== sourceQuestionIds\.length/);
assert.match(repository, /source\.questionBank\?\.status !== ContentStatus\.published/);
assert.match(repository, /source\.status !== ContentStatus\.published/);
assert.match(repository, /source\.subtest\?\.code !== subtest/);
assert.match(repository, /source\.options\.length < 2/);
assert.match(repository, /source\.options\.filter\(\(option\) => option\.isCorrect\)\.length !== 1/);
assert.match(repository, /!isReadyAsset\(source\.promptAsset\)/);
assert.match(repository, /source\.questionBankId !== sourceBankId/);
assert.match(repository, /!Number\.isFinite\(item\.pointValue\) \|\| item\.pointValue <= 0/);
assert.match(repository, /await readAndValidatePackageSources\(tx, input\.items\.map\(\(item\) => item\.sourceQuestionId\), input\.subtest, input\.sourceBankId\)/);
assert.match(repository, /points: snapshot\.pointValue/);
assert.match(scoredMigration, /source_bank_id uuid NOT NULL/);
assert.match(scoredMigration, /point_value numeric\(6,2\) NOT NULL CHECK \(point_value > 0\)/);
assert.match(scoredMigration, /question_bank IS DISTINCT FROM source_bank/);
assert.match(attemptRepository, /const score = correctAnswers\.reduce/);
assert.match(attemptRepository, /calculationVersion: "cbt-frozen-item-points-v1"/);
assert.match(attemptRepository, /calculationVersion: "2pl-map-v1"/);

// CAT has one server-owned 2PL profile. Authoring supplies only the item
// count; publish, delivery opening, and attempt creation must all bind and
// verify the same profile before any adaptive item can be served.
assert.match(catProfile, /CANONICAL_2PL_MODEL_VERSION = "2pl-canonical-v1"/);
assert.doesNotMatch(repository, /type TestInput = \{[^}]*catModelVersion/);
assert.match(repository, /catModelVersion: sectionInput\.testType === "cat" \? CANONICAL_2PL_MODEL_VERSION : null/);
assert.match(repository, /modelVersion: CANONICAL_2PL_MODEL_VERSION/);
assert.match(deliveryRepository, /section\.catModelVersion !== CANONICAL_2PL_MODEL_VERSION/);
assert.match(deliveryRepository, /modelVersion: CANONICAL_2PL_MODEL_VERSION/);
assert.match(attemptRepository, /section\.catModelVersion !== CANONICAL_2PL_MODEL_VERSION/);
assert.match(attemptRepository, /modelVersion: CANONICAL_2PL_MODEL_VERSION/);
assert.match(calibrationRepository, /modelVersion: CANONICAL_2PL_MODEL_VERSION/);

// Negative direct-SQL coverage: once status is published, mutation/deletion of
// the version and all snapshot rows has a database trigger boundary.
assert.match(migration, /IF OLD\.status = 'published'/);
assert.match(migration, /reusable_question_package_versions_ready_immutable[\s\S]*BEFORE UPDATE OR DELETE/);
assert.match(migration, /reusable_question_package_version_items_ready_immutable[\s\S]*BEFORE INSERT OR UPDATE OR DELETE/);
assert.match(migration, /reusable_question_package_version_item_options_ready_immutable[\s\S]*BEFORE INSERT OR UPDATE OR DELETE/);
const snapshotWrite = repository.lastIndexOf("reusableQuestionPackageVersionItemOption.createMany");
const publishTransition = repository.indexOf("await tx.reusableQuestionPackageVersion.update", snapshotWrite);
assert.ok(publishTransition > snapshotWrite, "a version must publish only after snapshot children are written");

console.log("Tryout package membership and ready-version immutability invariants passed.");

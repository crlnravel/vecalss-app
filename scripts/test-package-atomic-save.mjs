import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const repository = await readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8");
const actions = await readFile(new URL("../modules/mentor/tryout-actions.ts", import.meta.url), "utf8");

assert.match(repository, /type PackageSaveIntent = "draft" \| "ready"/u);
assert.match(repository, /completionIntent\?: PackageSaveIntent/u);
assert.match(repository, /expectedRevision\?: number/u);
assert.match(repository, /type SaveReusableQuestionPackageResult = PackageDto & \{ package: PackageDto; releasedVersion\?: ReleasedPackageVersion \}/u);
assert.match(repository, /class PackageConflictError extends TryoutValidationError/u);
assert.match(repository, /readonly code: PackageConflictCode = "package_conflict"/u);
assert.match(repository, /current\.revision !== input\.expectedRevision/u);

const saveBody = repository.slice(repository.indexOf("async function saveReusableQuestionPackage"), repository.indexOf("async function saveReusableQuestionPackageMetadata"));
assert.match(saveBody, /await tx\.\$queryRaw`SELECT id FROM reusable_question_packages WHERE id = \$\{id\}:?:uuid FOR UPDATE`/u);
assert.match(saveBody, /completionIntent === "draft"/u);
assert.match(saveBody, /completionIntent === "ready"/u);
assert.match(saveBody, /commitPackageReadyVersion\(tx, id, actorId/u);
assert.match(saveBody, /assertPackageItemRevisions\(input\.items, sources, completionIntent === "ready"\)/u, "Ready must require submitted source revision identities");
assert.match(saveBody, /return packageSaveResult\(toPackageDto\(saved/u);
assert.match(saveBody, /expectedRevision !== undefined/u);

const readyBody = repository.slice(repository.indexOf("async function commitPackageReadyVersion"), repository.indexOf("type PackageDto"));
assert.match(readyBody, /SELECT id FROM reusable_question_packages[\s\S]*FOR UPDATE/u, "Ready must lock the package aggregate");
assert.match(readyBody, /readAndValidatePackageSources\(tx/u, "Ready must retain source and Bank share locks");
assert.match(readyBody, /reusableQuestionPackageVersion\.aggregate\(\{ where: \{ packageId \}, _max: \{ versionNo: true \} \}\)/u, "version allocation must use max(versionNo) under the package lock");
assert.match(readyBody, /reusableQuestionPackageVersionItem\.create\(/u, "Ready must write immutable snapshot items");
assert.match(readyBody, /reusableQuestionPackageVersionItemOption\.createMany\(/u, "Ready must write immutable snapshot options");
assert.ok(readyBody.indexOf("reusableQuestionPackageVersionItemOption.createMany") < readyBody.indexOf("reusableQuestionPackageVersion.update"), "snapshot children must exist before publishing the version");
assert.match(readyBody, /reusableQuestionPackage\.update\(/u, "Ready must transition the package in the same transaction");

const wrapperBody = repository.slice(repository.indexOf("async function readyReusableQuestionPackageVersion"), repository.indexOf("async function listTryouts"));
assert.match(wrapperBody, /prisma\.\$transaction\(\(tx\) => commitPackageReadyVersion\(tx, packageId, actorId\)\)/u, "compatibility Ready action must use the shared commit helper");

assert.match(actions, /managementSession\("tryout\.delivery\.configure"\)/u, "package actions must retain the existing capability boundary");
assert.match(actions, /revalidatePath\("\/mentor\/packages"\)/u);
assert.match(actions, /revalidatePath\("\/mentor\/tryout"\)/u);
assert.match(actions, /error instanceof PackageConflictError/u);
assert.match(actions, /code: error\.code/u);

console.log("Atomic package save/release shape contracts passed; run test:package-atomic-save-db for transactional behavior.");

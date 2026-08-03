import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [locksSource, progressSource, repositorySource] = await Promise.all([
  readFile(resolve(root, "lib/materi/locks.ts"), "utf8"),
  readFile(resolve(root, "lib/materi/progress.ts"), "utf8"),
  readFile(resolve(root, "lib/materi/repository.ts"), "utf8"),
]);

assert.match(locksSource, /vecalss:materi:subject:/, "Materi ordering needs one shared subject lock namespace");
assert.match(locksSource, /\.sort\(\)/, "multi-subject lock acquisition must be deterministic");
assert.match(locksSource, /pg_advisory_xact_lock/, "the subject lock must be transaction scoped");
assert.equal((locksSource.match(/\$executeRaw/g) ?? []).length, 2, "void advisory locks must use Prisma executeRaw");
assert.equal(
  progressSource.match(/lockMateriSubjectScope\(tx, subject\.code\)/g)?.length,
  4,
  "all four server progression transactions must share the subject lock",
);
assert.match(repositorySource, /lockMateriSubjectScope\(tx, subject\.code\)/, "single-subject mentor writes must share the subject lock");
const saveStart = repositorySource.indexOf("async function saveMateriLesson");
const lifecycleStart = repositorySource.indexOf("async function readLockedMateriLifecycleRecord");
const publishStart = repositorySource.indexOf("async function publishMateriLesson");
assert.ok(saveStart >= 0 && lifecycleStart > saveStart, "save and lifecycle helpers must remain separately auditable");
const saveSource = repositorySource.slice(saveStart, lifecycleStart);
assert.match(saveSource, /lockMateriSubjectScopes\(tx, materiSubjectCodes\)/, "save must lock every canonical subject before discovering its source");
const saveLockIndex = saveSource.indexOf("lockMateriSubjectScopes(tx, materiSubjectCodes)");
const saveCurrentIndex = saveSource.indexOf("const current");
assert.ok(
  saveLockIndex >= 0 && saveCurrentIndex > saveLockIndex,
  "save must not derive current/source before its subject boundary",
);
const lifecycleSource = repositorySource.slice(lifecycleStart, publishStart);
assert.match(lifecycleSource, /lockMateriSubjectScopes\(tx, materiSubjectCodes\)/, "individual lifecycle reads must lock all canonical subjects first");
assert.match(lifecycleSource, /module_assets WHERE id = ANY/, "individual lifecycle must lock canonical resource rows");
assert.match(lifecycleSource, /assets WHERE id = ANY/, "individual lifecycle must lock referenced managed assets");
assert.ok(
  lifecycleSource.indexOf("const identity") > lifecycleSource.indexOf("lockMateriSubjectScopes"),
  "individual lifecycle must discover the module only after its subject boundary",
);
assert.ok(
  lifecycleSource.indexOf("const lesson = await tx.module.findUnique") > lifecycleSource.indexOf("managedAssetIds.length"),
  "individual lifecycle must re-read the module/resources after row locks",
);
assert.equal(
  repositorySource.match(/readLockedMateriLifecycleRecord\(tx, code\)/g)?.length,
  4,
  "all individual lifecycle operations must revalidate under the locked transaction",
);
assert.match(repositorySource, /assets: documentWhere/, "publish must condition its status update on the revalidated document resource");
assert.match(repositorySource, /managedAsset: \{[\s\S]*?state: MediaAssetState\.ready/, "publish must fail closed when a managed PDF is trashed/replaced");

console.log("Materi progress/reorder/lifecycle lock boundary checks passed.");

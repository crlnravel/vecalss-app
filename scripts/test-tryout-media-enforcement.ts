import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function sourceForFunction(source: string, name: string, siblingNames: readonly string[]) {
  const candidates = [`const ${name} =`, `async function ${name}(`];
  const start = candidates
    .map((declaration) => source.indexOf(declaration))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  assert.ok(start >= 0, `${name} must remain an explicit mutator`);
  const end = Math.min(
    ...siblingNames
      .filter((sibling) => sibling !== name)
      .flatMap((sibling) => [`const ${sibling} =`, `async function ${sibling}(`])
      .map((declaration) => source.indexOf(declaration, start + 1))
      .filter((index) => index >= 0),
    source.length,
  );
  return source.slice(start, end);
}

const tryout = readSource("lib/tryout/repository.ts");
const media = readSource("lib/media/repository.ts");
const mediaRoute = readSource("app/api/media/[scope]/route.ts");

assert.match(tryout, /type SaveTryoutInput = .*editLease\?: AuthoringEditLease/u);
assert.match(tryout, /type PackageInput = .*editLease\?: AuthoringEditLease/u);
assert.match(tryout, /assertAuthoringEditLease\(tx, \{ resourceId: tryoutId, resourceType: "tryout" \}/u);
assert.match(tryout, /assertAuthoringEditLease\(tx, \{ resourceId: id, resourceType: "question_package" \}/u);
assert.match(tryout, /lockTryoutCreateIdentity/u, "new Tryout saves must use the create-only branch");
assert.match(tryout, /lockQuestionPackageAggregate/u, "Paket writes must lock their aggregate row");
assert.match(tryout, /const mainSessionForLock[\s\S]*lockTryoutSessions/u, "unpublish must lock the main session before its write");

const mediaMutators = [
  "createMediaFolder",
  "renameMediaFolder",
  "moveMediaFolder",
  "trashMediaFolder",
  "renameMediaAsset",
  "moveMediaAsset",
  "trashMediaAsset",
  "requestMediaUpload",
  "finalizeMediaUpload",
] as const;
for (const name of mediaMutators) {
  const functionSource = sourceForFunction(media, name, mediaMutators);
  const globalLock = functionSource.indexOf("acquireBannerMediaMutationLock");
  assert.ok(globalLock >= 0, `${name} must take the global Media mutex`);
  const firstGuardedMutation = Math.min(
    ...["readActiveFolderAncestry", "assertAsset", "tx.asset.findUnique", "tx.mediaFolder.findUnique", "tx.asset.create"]
      .map((needle) => functionSource.indexOf(needle))
      .filter((index) => index >= 0),
  );
  assert.ok(firstGuardedMutation >= 0 && globalLock < firstGuardedMutation, `${name} must lock before guarded reads`);
}
assert.match(media, /lockMediaLeaseRows/u);
assert.match(media, /resource_type::text, resource_id[\s\S]*FOR UPDATE/u);
assert.match(media, /assertNoActiveDescendantMediaLeases/u);
assert.match(mediaRoute, /editLease = .*body\.editLease/u);
assert.match(mediaRoute, /trashMediaFolder\(scope, body\.folderId, session\.user\.id, editLease\)/u);
assert.match(mediaRoute, /instanceof EditLeaseServiceError/u);

console.log("Tryout and Media authoring enforcement contracts passed.");

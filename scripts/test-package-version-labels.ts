import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { packageReleaseLabel, packageReleaseTitle } from "../lib/tryout/version-label";

assert.equal(packageReleaseLabel(1), "Rilis 1");
assert.equal(packageReleaseTitle("Paket UTBK", 2), "Paket UTBK · Rilis 2");

const projectRoot = resolve(import.meta.dirname, "..");
const surfaces = [
  "app/mentor/packages/[packageId]/versions/[versionNo]/page.tsx",
  "lib/tryout/repository.ts",
  "modules/mentor/KaptenPackageBuilderPageModule.tsx",
  "modules/mentor/KaptenPackageVersionDetailModule.tsx",
  "modules/mentor/KaptenPackageVersionHubModule.tsx",
  "modules/mentor/KaptenQuizBuilderPageModule.tsx",
];

for (const surface of surfaces) {
  const source = readFileSync(resolve(projectRoot, surface), "utf8");
  assert.match(source, /packageRelease(Label|Title)/u, `${surface} must use the shared release label`);
  assert.doesNotMatch(source, /v\$\{|· v|Paket v|>v\d/u, `${surface} must not expose developer-style version labels`);
}

console.log("Package release labels passed.");

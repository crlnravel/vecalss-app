import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [repository, builder, createRoute, editRoute, actions, assessmentRelease] = await Promise.all([
  readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutBuilderPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/create/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/[tryoutId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/tryout-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assessment-release.ts", import.meta.url), "utf8"),
]);

assert.doesNotMatch(repository, /resolveReusableQuestionPackageHandoff|getReusableQuestionPackageUseContext/u, "Tryout must not expose a Paket Soal handoff resolver");
assert.doesNotMatch(builder, /initialPackageHandoff|seedPackageHandoff/u, "Tryout authoring state must not seed an active Paket Soal handoff");
assert.match(builder, /const packageBound = Boolean\(activeSection\.packageVersionId\);/u, "Historical package-bound Tryout sections must remain identifiable");
assert.match(builder, /const canEditQuestions = !readOnly && !draft\.locked && !packageBound;/u, "Historical package-bound Tryout sections must remain protected from direct-question edits");
assert.doesNotMatch(createRoute, /packageId|packageVersionId|resolveReusableQuestionPackageHandoff|listReadyPackageVersions/u, "Tryout creation must not accept or load Paket Soal handoffs");
assert.doesNotMatch(editRoute, /packageId|packageVersionId|resolveReusableQuestionPackageHandoff|listReadyPackageVersions/u, "Tryout editing must not accept or load Paket Soal handoffs");
assert.match(repository, /if \(legacySection\.packageVersionId\) throw new TryoutValidationError\("Paket Soal ini sudah diarsipkan/u, "the server save boundary must reject forged legacy package bindings");
assert.match(repository, /packageVersionId: null/u, "new Tryout sections and items must persist direct-only provenance");
assert.match(repository, /function hasArchivedPackageBinding\(record: TryoutPackageBindingRecord\)/u, "legacy package-bound Tryouts must be identified before direct-only hydration");
assert.match(repository, /record\.status !== ContentStatus\.archived && hasArchivedPackageBinding\(record\)[\s\S]*?return \[\];[\s\S]*?return \[toTryoutCatalogueDto\(record\)\];/u, "legacy package-bound Tryouts must be omitted from the active authoring catalogue");
assert.match(repository, /record && record\.status !== ContentStatus\.archived && !hasArchivedPackageBinding\(record\) \? toTryoutDto\(record\) : null/u, "legacy package-bound Tryout edit routes must fail closed instead of hydrating empty Sections");
assert.match(repository, /if \(hasArchivedPackageBinding\(current\)\) throw new TryoutValidationError\("Paket Soal yang digunakan sudah diarsipkan\. Buat Tryout baru/u, "direct-only save and metadata paths must reject legacy package-bound Tryouts");
assert.match(actions, /Paket Soal sedang diarsipkan/u, "legacy package mutation actions must fail closed");
assert.match(assessmentRelease, /hasArchivedPackageBinding/u, "new AssessmentRelease creation must detect archived package-bound Tryouts");
assert.match(assessmentRelease, /Tryout berbasis Paket Soal sudah diarsipkan dan tidak dapat membuat rilis baru/u, "archived package-bound Tryouts must not create new releases");
assert.match(assessmentRelease, /latestReleaseMatchesIntent\(tryout, publicationIntentKey\)/u, "historical package-bound Tryouts may only reuse an already-pinned release");

console.log("Tryout Paket Soal legacy handoff removal contract passed.");

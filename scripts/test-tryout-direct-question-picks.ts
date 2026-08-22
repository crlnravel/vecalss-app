import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [builder, repository, sourceRepository, createRoute, editRoute, catalogue] = await Promise.all([
  readFile(new URL("../modules/mentor/KaptenTryoutBuilderPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/question-bank/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/create/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/[tryoutId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutCataloguePageModule.tsx", import.meta.url), "utf8"),
]);

assert.match(builder, /Pilih soal langsung/u, "Tryout Questions must expose direct selection");
assert.match(builder, /Gunakan Set Soal siap/u, "Tryout Questions must expose optional saved Set selection");
assert.match(builder, /listQuestionBankSourcePageAction/u, "direct selection must browse source Banks through the server action");
assert.match(builder, /listQuestionBankSourceQuestionsAction/u, "direct selection must load Ready questions through the server action");
assert.match(builder, /directQuestions/u, "the draft must carry direct question selections");
assert.match(builder, /subjectCoverage: \[activeSection\.subtest\]/u, "source Banks must be filtered by the active Section subject");
assert.match(builder, /subjectCode: activeSection\.subtest/u, "source questions must be filtered by the active Section subject");

assert.match(repository, /type DirectQuestionInput/u, "the save boundary must define direct question inputs");
assert.match(repository, /async function readAndValidateDirectSources/u, "direct source IDs must be re-read on the server");
assert.match(repository, /sourceQuestionRevisionId && selection\.sourceQuestionRevisionId !== revision\.id/u, "stale direct revisions must be rejected");
assert.match(repository, /sourceContentDigest && selection\.sourceContentDigest !== revision\.contentDigest/u, "stale direct content digests must be rejected");
assert.match(repository, /FOR SHARE OF q, b/u, "direct source reads must share-lock Question and Bank rows");
assert.match(repository, /packageCode: version\?\.package\.code \?\? "direct"/u, "direct snapshots must not require a saved package");
assert.match(repository, /questionCount: version\?\.items\.length \?\? directSources\.length/u, "direct selections must determine the Section question count");
assert.match(repository, /sourceQuestionRevision: \{ select: \{ calibrations/u, "direct readback must expose CAT calibration readiness");
assert.match(repository, /Set dan pilihan langsung sekaligus/u, "a Section must not mix a saved Set with direct picks");

assert.match(sourceRepository, /catReady\?: boolean/u, "source question DTOs must expose CAT readiness for authoring review");
assert.match(sourceRepository, /CANONICAL_2PL_MODEL_VERSION/u, "CAT readiness must use the canonical calibration profile");
assert.match(createRoute, /listQuestionBankSourcePage/u, "create route must seed the direct source catalogue");
assert.match(editRoute, /listQuestionBankSourcePage/u, "edit route must seed the direct source catalogue");
assert.match(catalogue, /section\.packageVersionId \|\| section\.directQuestions\?\.length/u, "Tryout catalogue readiness must count direct selections");

console.log("Tryout direct question pick contract passed.");

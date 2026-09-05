import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildAssessmentReleasePayload } from "../lib/tryout/assessment-release-canonical.mjs";

const CANONICAL_MODEL = "2pl-canonical-v1";
const RESOLVER_VERSION = "cat-pool-release-pin-v1";
const candidateIds = ["q-1", "q-2"];

const items = candidateIds.map((sourceQuestionId, index) => ({
  catCalibration: {
    calibrationDigest: `calibration-digest-${sourceQuestionId}`,
    calibrationId: `calibration-${sourceQuestionId}`,
    difficulty: index - 0.5,
    discrimination: 1.25 + index,
    sourceRevisionProvenance: "authored",
  },
  difficulty: "medium",
  explanation: `Explanation ${sourceQuestionId}`,
  explanationAssetId: null,
  id: `physical-item-${sourceQuestionId}`,
  options: [
    {
      assetId: null,
      choiceKey: "A",
      content: `Option ${sourceQuestionId}`,
      id: `physical-option-${sourceQuestionId}`,
      isCorrect: true,
      sortOrder: 0,
      sourceQuestionOptionId: null,
      sourceQuestionRevisionOptionId: `revision-option-${sourceQuestionId}`,
    },
    {
      assetId: null,
      choiceKey: "B",
      content: `Distractor ${sourceQuestionId}`,
      id: `physical-option-${sourceQuestionId}-b`,
      isCorrect: false,
      sortOrder: 1,
      sourceQuestionOptionId: null,
      sourceQuestionRevisionOptionId: `revision-option-${sourceQuestionId}-b`,
    },
  ],
  packageCode: "cat-pool",
  points: 1,
  prompt: `Prompt ${sourceQuestionId}`,
  promptAssetId: null,
  sortOrder: index + 1,
  sourceContentDigest: `digest-${sourceQuestionId}`,
  sourceQuestionId,
  sourceQuestionRevisionId: `revision-${sourceQuestionId}`,
  sourceRevisionProvenance: "authored",
  subtestId: "subtest-1",
}));

const catCalibration = items.map((item) => ({
  ...item.catCalibration,
  approvalState: "approved",
  modelVersion: CANONICAL_MODEL,
  sourceContentDigest: item.sourceContentDigest,
  sourceQuestionId: item.sourceQuestionId,
  sourceQuestionRevisionId: item.sourceQuestionRevisionId,
}));
const assembly = {
  availability: {
    candidateCount: items.length,
    eligibleCandidateCount: items.length,
    invalidSourceIds: [],
    modelVersion: CANONICAL_MODEL,
  },
  candidateCount: items.length,
  catCalibration,
  mode: "cat_pool" as const,
  packageId: "package-1",
  packageVersionId: "version-1",
  requestedCount: items.length,
  resolvedRevisionDigests: items.map((item) => item.sourceContentDigest),
  resolvedSourceIds: items.map((item) => item.sourceQuestionId),
  resolverVersion: RESOLVER_VERSION,
  scopeSummary: { bankIds: ["bank-1"], candidateCount: items.length, subtestId: "subtest-1" },
};

const payload = buildAssessmentReleasePayload({
  tryoutId: "tryout-1",
  tryoutRevision: 4,
  sections: [{
    assembly,
    catItemCount: items.length,
    catModelVersion: CANONICAL_MODEL,
    durationSeconds: 60,
    id: "section-1",
    instructions: null,
    items,
    packageVersionId: "version-1",
    scoringConfig: null,
    sequenceNo: 1,
    shuffleItems: false,
    subtestCode: "verbal",
    subtestId: "subtest-1",
    subtestName: "Verbal",
    testType: "cat",
    title: "CAT Pool",
  }],
});

const [section] = payload.sections;
assert.equal(section.assembly.mode, "cat_pool");
assert.equal(section.assembly.candidateCount, items.length);
assert.equal(section.assembly.requestedCount, items.length, "exact-size CAT pools are valid");
assert.equal(section.assembly.resolverVersion, RESOLVER_VERSION);
assert.deepEqual(section.assembly.resolvedSourceIds, candidateIds);
assert.deepEqual(section.assembly.catCalibration, catCalibration);
assert.equal(section.items.length, items.length, "the release owns every CAT candidate snapshot");
assert.equal(section.items[0]?.prompt, items[0]?.prompt);
assert.equal(section.items[0]?.options.length, 2);
assert.equal(section.cat.parameters.length, items.length);
assert.equal(section.cat.parameters[0]?.calibrationId, "calibration-q-1");
assert.equal(section.cat.parameters[0]?.sourceContentDigest, "digest-q-1");
assert.equal(section.cat.parameters[1]?.sourceQuestionRevisionId, "revision-q-2");

const [release, canonical, attempt, migration] = await Promise.all([
  readFile(new URL("../lib/tryout/assessment-release.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assessment-release-canonical.mjs", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/attempt-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260822130000_add_random_assembly_schema/migration.sql", import.meta.url), "utf8"),
]);

// Every explicit candidate is checked against the locked Ready source and its
// complete canonical calibration identity before a release is written.
assert.match(release, /lockReadyAssemblyVersions/u);
assert.match(release, /lockAndReadReleaseSources/u);
assert.match(release, /lockAndReadCatCalibrations/u);
assert.match(release, /ORDER BY question_revision_id, id[\s\S]*FOR SHARE/u);
assert.match(release, /FROM subtests s[\s\S]*ORDER BY s\.id[\s\S]*FOR SHARE OF s/u);
assert.match(release, /revision\.id !== identity\.sourceQuestionRevisionId/u);
assert.match(release, /revision\.contentDigest !== identity\.sourceContentDigest/u);
assert.match(release, /bank\?\.status !== ContentStatus\.published/u);
assert.match(release, /!source\.subtest\?\.isActive/u);
assert.match(release, /revision\.options\.length < 2/u);
assert.match(release, /!revision\.stem\.trim\(\)/u);
assert.match(release, /!mediaReady/u);
assert.match(release, /calibration\.approvalState === "approved"/u);
assert.match(release, /calibration\.modelVersion === CANONICAL_2PL_MODEL_VERSION/u);
assert.match(release, /calibration\.questionId === item\.sourceQuestionId/u);
assert.match(release, /calibration\.calibrationDigest === item\.sourceContentDigest/u);
assert.match(release, /calibration\.sourceRevisionProvenance === revision\?\.provenance/u);
assert.match(release, /calibration\.sourceRevisionProvenance !== QuestionRevisionProvenance\.legacy_unknown/u);
assert.match(release, /calibration\.discrimination > 0/u);
assert.match(release, /if \(version\.items\.length < deliveredCount\)/u);
assert.doesNotMatch(release, /version\.items\.length <= deliveredCount/u);
assert.match(release, /catCalibration,/u);
assert.match(release, /assemblyCatCalibration: assembly\.catCalibration/u);

// Existing pinned CAT Pool releases stay usable after source/calibration drift,
// while a mixed Tryout still preserves the direct-CAT gate.
assert.match(release, /const hasUnpinnedCat/u);
assert.match(release, /if \(hasCatPool[\s\S]*!hasUnpinnedCat[\s\S]*latestReleasePayload/u);
assert.match(release, /Existing CAT Pool releases are immutable/u);
const eligibilitySource = release.slice(release.indexOf("async function assertTryoutReleaseEligibility"));
const mutableCatGate = eligibilitySource.slice(eligibilitySource.indexOf("const catItems"), eligibilitySource.indexOf("const revisionIds"));
assert.match(
  mutableCatGate,
  /section\.testType !== "cat" \|\| section\.packageVersion\?\.mode === ReusableQuestionPackageMode\.cat_pool/u,
  "mixed CAT Pool + direct-CAT releases must revalidate only the direct-CAT candidates",
);

// Runtime reads release-owned parameters only; it keeps the acknowledged
// answer write before a calculation failure can mark the run failed.
assert.match(attempt, /section\.catParameters\.length !== section\.items\.length/u);
assert.match(attempt, /function nextCatItem/u);
assert.doesNotMatch(attempt, /twoPlQuestionCalibration/u);
const answerWrite = attempt.indexOf("tx.tryoutAnswer.upsert");
const catFailure = attempt.indexOf("await failCatRun(tx, runId", answerWrite);
assert.ok(answerWrite >= 0 && catFailure > answerWrite, "CAT calculation failure must preserve the acknowledged answer");

// The database boundary accepts candidateCount == requestedCount and rejects
// shortages or incomplete calibration/source arrays.
assert.match(migration, /ELSIF version_mode = 'cat_pool'/u);
assert.match(migration, /NEW\.assembly_candidate_count < NEW\.assembly_requested_count/u);
assert.match(migration, /jsonb_array_length\(NEW\.assembly_cat_calibration\) <> NEW\.assembly_candidate_count/u);

assert.match(canonical, /calibrationId: calibration\.calibrationId/u);
assert.match(canonical, /sourceQuestionRevisionId: item\.sourceQuestionRevisionId/u);

console.log("CAT Pool AssessmentRelease pinning contract passed.");

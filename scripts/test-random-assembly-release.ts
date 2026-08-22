import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ASSEMBLY_RESOLVER_VERSION,
  AssemblyResolutionError,
  resolveBlueprintCandidates,
  resolvePoolCandidates,
} from "../lib/tryout/assembly-validation";
import { buildAssessmentReleasePayload } from "../lib/tryout/assessment-release-canonical.mjs";

type Candidate = {
  difficulty?: "easy" | "medium" | "hard";
  sortOrder?: number;
  sourceContentDigest: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId: string;
};

const candidate = (id: string, difficulty: Candidate["difficulty"], sortOrder: number): Candidate => ({
  difficulty,
  sortOrder,
  sourceContentDigest: `digest-${id}`,
  sourceQuestionId: id,
  sourceQuestionRevisionId: `revision-${id}`,
});

const poolCandidates = Array.from({ length: 12 }, (_, index) => candidate(
  `q-${String(index + 1).padStart(2, "0")}`,
  index % 3 === 0 ? "easy" : index % 3 === 1 ? "medium" : "hard",
  index + 1,
));
const poolDraw = resolvePoolCandidates(poolCandidates, 5, "release-seed");
assert.deepEqual(
  poolDraw,
  resolvePoolCandidates([...poolCandidates].reverse(), 5, "release-seed"),
  "Pool resolution must be independent of query order when the seed is unchanged",
);
assert.deepEqual(
  poolDraw,
  resolvePoolCandidates(poolCandidates, 5, "release-seed"),
  "Pool resolution must be replayable",
);
assert.notDeepEqual(
  poolDraw.map((value) => value.sourceQuestionId),
  resolvePoolCandidates(poolCandidates, 5, "another-release-seed").map((value) => value.sourceQuestionId),
  "Different publication seeds should produce a different deterministic draw",
);
assert.equal(new Set(poolDraw.map((value) => value.sourceQuestionId)).size, poolDraw.length);

assert.throws(
  () => resolvePoolCandidates(poolCandidates.slice(0, 2), 3, "release-seed"),
  (error: unknown) => error instanceof AssemblyResolutionError && error.code === "shortage",
);
assert.throws(
  () => resolvePoolCandidates([
    poolCandidates[0],
    { ...poolCandidates[1], sourceQuestionId: poolCandidates[0].sourceQuestionId },
  ], 1, "release-seed"),
  (error: unknown) => error instanceof AssemblyResolutionError && error.code === "duplicate_source",
);

const blueprintCandidates = [
  candidate("easy-1", "easy", 1),
  candidate("easy-2", "easy", 2),
  candidate("easy-3", "easy", 3),
  candidate("medium-1", "medium", 4),
  candidate("medium-2", "medium", 5),
  candidate("hard-1", "hard", 6),
  candidate("hard-2", "hard", 7),
];
const blueprintQuotas = { easyCount: 2, hardCount: 1, mediumCount: 1, requestedCount: 4 };
const blueprintDraw = resolveBlueprintCandidates(blueprintCandidates, blueprintQuotas, "blueprint-seed");
assert.equal(blueprintDraw.length, blueprintQuotas.requestedCount);
assert.deepEqual(
  blueprintDraw,
  resolveBlueprintCandidates([...blueprintCandidates].reverse(), blueprintQuotas, "blueprint-seed"),
  "Blueprint resolution must be independent of query order when the seed is unchanged",
);
assert.deepEqual(
  blueprintDraw.reduce<Record<string, number>>((counts, value) => {
    counts[value.difficulty ?? "missing"] = (counts[value.difficulty ?? "missing"] ?? 0) + 1;
    return counts;
  }, {}),
  { easy: 2, hard: 1, medium: 1 },
  "Blueprint resolution must satisfy every difficulty quota exactly",
);
assert.throws(
  () => resolveBlueprintCandidates(blueprintCandidates, { ...blueprintQuotas, easyCount: 4, requestedCount: 6 }, "blueprint-seed"),
  (error: unknown) => error instanceof AssemblyResolutionError && error.code === "shortage",
  "Blueprint shortage must block instead of falling back to another difficulty",
);

const metadata = {
  availability: {
    availableByDifficulty: { easy: 3, hard: 2, medium: 2 },
    candidateCount: 7,
    eligibleCandidateCount: 7,
  },
  candidateCount: 7,
  mode: "blueprint" as const,
  packageId: "package-1",
  packageVersionId: "version-1",
  publicationIntentKey: "publish-intent-1",
  quotas: blueprintQuotas,
  requestedCount: 4,
  resolvedRevisionDigests: blueprintDraw.map((value) => value.sourceContentDigest),
  resolvedSourceIds: blueprintDraw.map((value) => value.sourceQuestionId),
  resolverVersion: ASSEMBLY_RESOLVER_VERSION,
  scopeSummary: { bankIds: ["bank-1"], categoryIds: ["category-1"], folderIds: ["folder-1"], subtestId: "subtest-1" },
  seed: "blueprint-seed",
};
const releaseSection = {
  catItemCount: null,
  catModelVersion: null,
  durationSeconds: 60,
  id: "section-1",
  instructions: null,
  items: [],
  packageVersionId: "version-1",
  scoringConfig: null,
  sequenceNo: 1,
  shuffleItems: false,
  subtestCode: "verbal",
  subtestId: "subtest-1",
  subtestName: "Verbal",
  testType: "cbt",
  title: "Blueprint",
};
const payload = buildAssessmentReleasePayload({
  tryoutId: "tryout-1",
  tryoutRevision: 4,
  sections: [{
    ...releaseSection,
    assembly: metadata,
  }],
});
assert.equal(payload.sections[0].assembly.mode, "blueprint");
assert.equal(payload.sections[0].assembly.resolverVersion, ASSEMBLY_RESOLVER_VERSION);
assert.deepEqual(payload.sections[0].assembly.resolvedSourceIds, metadata.resolvedSourceIds);
assert.deepEqual(payload.sections[0].assembly.resolvedRevisionDigests, metadata.resolvedRevisionDigests);
const fixedPayload = buildAssessmentReleasePayload({
  tryoutId: "tryout-1",
  tryoutRevision: 4,
  sections: [releaseSection],
});
const directPayload = buildAssessmentReleasePayload({
  tryoutId: "tryout-1",
  tryoutRevision: 4,
  sections: [{ ...releaseSection, packageVersionId: null }],
});
assert.equal(fixedPayload.sections[0].assembly.mode, "fixed_set");
assert.equal(directPayload.sections[0].assembly.mode, "direct");

const [release, repository, canonical] = await Promise.all([
  readFile(new URL("../lib/tryout/assessment-release.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assessment-release-canonical.mjs", import.meta.url), "utf8"),
]);
assert.match(release, /ASSEMBLY_RESOLVER_VERSION/u);
assert.match(release, /resolvePoolCandidates/u);
assert.match(release, /resolveBlueprintCandidates/u);
assert.match(release, /FOR UPDATE/u);
assert.match(release, /FOR SHARE OF q, b, r/u);
assert.match(release, /assemblyResolvedSourceIds/u);
assert.match(release, /assemblyResolvedRevisionDigests/u);
assert.match(release, /sourceRevisionProvenance/u);
assert.match(release, /tryoutItem\.create/u);
assert.match(release, /tryoutItemOption\.createMany/u);
assert.match(release, /publicationIntentKey/u);
assert.match(release, /ReusableQuestionPackageMode\.blueprint/u);
assert.doesNotMatch(release, /ORDER BY random\(\)/u);
assert.match(repository, /publicationIntentKey/u);
assert.match(canonical, /assembly: section\.assembly \?\?/u);

console.log("Random and Blueprint AssessmentRelease resolution contract passed.");

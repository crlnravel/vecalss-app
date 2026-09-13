import assert from "node:assert/strict";

import { buildAssessmentReleasePayload } from "../lib/tryout/assessment-release-canonical.mjs";
import {
  assertSeedDirectSnapshotMarker,
  assertSeedFreshSessionReleaseBindings,
  assertSeedHistoricalAttemptsClosed,
  assertSeedHistoricalRunSnapshotMatchesRelease,
  assertSeedPhysicalSnapshotMatchesRelease,
  assertSeedReleasePayloadIdentity,
  assertSeedRequiredReleaseMetadata,
  assertSeedSnapshotMatchesRelease,
  assertSeedTryoutRebuildAllowed,
  seedExistingReleaseSnapshotMetadata,
  seedReleaseSnapshotMetadata,
} from "../prisma/seed-assessment.mjs";

const section = {
  durationSeconds: 600,
  id: "section-physical",
  instructions: "Pilih jawaban yang paling tepat.",
  items: [{
    difficulty: "easy",
    explanation: "Penjelasan soal.",
    explanationAssetId: null,
    id: "item-physical",
    options: [{
      assetId: null,
      choiceKey: "A",
      content: "Pilihan benar",
      id: "option-physical",
      isCorrect: true,
      sortOrder: 1,
      sourceQuestionOptionId: "question-option-1",
      sourceQuestionRevisionOptionId: "revision-option-1",
    }],
    packageCode: "direct",
    points: 1,
    prompt: "Pertanyaan demo?",
    promptAssetId: null,
    sortOrder: 1,
    sourceContentDigest: "source-digest-1",
    sourceQuestionId: "question-1",
    sourceQuestionRevisionId: "revision-1",
    sourceRevisionProvenance: "authored",
    subtestId: "subtest-1",
  }],
  packageVersionId: null,
  scoringConfig: { method: "sum_item_points", wrongAnswerPoints: 0 },
  sequenceNo: 1,
  shuffleItems: false,
  subtestCode: "PU",
  subtestId: "subtest-1",
  subtestName: "Penalaran Umum",
  testType: "cbt",
  title: "Penalaran Umum",
};

const releasePayload = buildAssessmentReleasePayload({
  tryoutId: "tryout-1",
  tryoutRevision: 1,
  sections: [section],
});

assert.deepEqual(
  seedReleaseSnapshotMetadata({ contentDigest: "digest-1", id: "release-1", releaseNumber: 1 }),
  { digest: "digest-1", id: "release-1", number: 1 },
  "seeded attempt/run snapshots must use the runtime AssessmentRelease metadata shape",
);
const legacyReleaseMetadata = { contentDigest: "digest-1", id: "release-1", releaseNumber: 1, historical: true };
assert.deepEqual(
  seedExistingReleaseSnapshotMetadata({ assessmentRelease: legacyReleaseMetadata }, { contentDigest: "digest-1", id: "release-1", releaseNumber: 1 }),
  legacyReleaseMetadata,
  "seeded legacy attempt/run snapshots must preserve their historical AssessmentRelease metadata shape",
);

assert.doesNotThrow(() => assertSeedFreshSessionReleaseBindings([
  { assessment_release_id: "release-1" },
  { assessment_release_id: "release-1" },
]));
assert.throws(
  () => assertSeedFreshSessionReleaseBindings([
    { assessment_release_id: "release-1" },
    { assessment_release_id: null },
  ]),
  /without an AssessmentRelease binding/u,
  "fresh direct verification must reject an unpinned delivery session",
);

function physicalSnapshot() {
  return {
    id: section.id,
    package_version_id: null,
    sequence_no: section.sequenceNo,
    subtest_code: section.subtestCode,
    subtest_id: section.subtestId,
    subtest_name: section.subtestName,
    title: section.title,
    content: {
      durationSeconds: section.durationSeconds,
      instructions: section.instructions,
      items: section.items.map((item) => ({
        ...item,
        packageVersionId: null,
      })),
      packageVersionId: null,
      scoringConfig: section.scoringConfig,
      sectionId: section.id,
      sequenceNo: section.sequenceNo,
      shuffleItems: section.shuffleItems,
      subtestCode: section.subtestCode,
      subtestId: section.subtestId,
      subtestName: section.subtestName,
      testType: section.testType,
      title: section.title,
    },
  };
}

assertSeedPhysicalSnapshotMatchesRelease(physicalSnapshot(), releasePayload, "direct fixture");
assert.equal(
  assertSeedHistoricalAttemptsClosed({ packageSectionCount: 1, packageItemCount: 3, attemptCount: 2, closedAttemptCount: 2 }),
  true,
);
assert.throws(
  () => assertSeedHistoricalAttemptsClosed({ packageSectionCount: 1, packageItemCount: 3, attemptCount: 2, closedAttemptCount: 1 }),
  /not every historical attempt/u,
  "mixed active/closed legacy history must fail closed",
);
assert.throws(
  () => assertSeedDirectSnapshotMarker({ packageVersionId: null, packageCode: "legacy" }, "wrong-marker fixture"),
  /without the direct package marker/u,
);
assert.throws(
  () => assertSeedTryoutRebuildAllowed({ attemptCount: 0, assessmentReleaseCount: 1, releaseBoundSessionCount: 0 }),
  /refusing to rebuild/u,
  "a no-attempt Tryout with an immutable release must not be rebuilt",
);
assert.throws(
  () => assertSeedTryoutRebuildAllowed({ attemptCount: 0, assessmentReleaseCount: 0, releaseBoundSessionCount: 1 }),
  /refusing to rebuild/u,
  "a no-attempt Tryout with a release-bound session must not be rebuilt",
);
assert.doesNotThrow(() => assertSeedTryoutRebuildAllowed({ attemptCount: 0, assessmentReleaseCount: 0, releaseBoundSessionCount: 0 }));

for (const [field, value] of [["title", "Changed title"], ["subtestId", "subtest-2"]]) {
  const changed = physicalSnapshot();
  changed.content[field] = value;
  assert.throws(
    () => assertSeedSnapshotMatchesRelease(changed.content, releasePayload, `changed ${field}`),
    /immutable section bridge/u,
    `changed section ${field} must fail the release bridge check`,
  );
}
const changedSubject = physicalSnapshot();
changedSubject.subtest_code = "PPU";
assert.throws(
  () => assertSeedPhysicalSnapshotMatchesRelease(changedSubject, releasePayload, "changed subject"),
  /complete physical Section identity/u,
  "changed section subject must fail the physical release bridge check",
);

const oldReleasePayload = buildAssessmentReleasePayload({
  tryoutId: "tryout-1",
  tryoutRevision: 1,
  sections: [section],
});
assert.doesNotThrow(() => assertSeedReleasePayloadIdentity(
  { id: "tryout-1", revision: 2 },
  oldReleasePayload,
  "older pinned",
  { requireRevision: false },
));
assert.throws(
  () => assertSeedReleasePayloadIdentity({ id: "tryout-1", revision: 2 }, oldReleasePayload, "latest"),
  /different Tryout revision/u,
);
const oldRunSnapshot = { ...physicalSnapshot().content, assessmentRelease: { id: "release-old", number: 1, digest: "digest-old" } };
assert.equal(
  assertSeedRequiredReleaseMetadata(oldRunSnapshot, { id: "release-old", releaseNumber: 1, contentDigest: "digest-old" }, "older pinned run"),
  "runtime",
);
assertSeedSnapshotMatchesRelease(oldRunSnapshot, oldReleasePayload, "older pinned run");
const legacyRunWithoutShuffle = { ...oldRunSnapshot };
delete legacyRunWithoutShuffle.shuffleItems;
assert.deepEqual(
  assertSeedHistoricalRunSnapshotMatchesRelease(legacyRunWithoutShuffle, physicalSnapshot(), oldReleasePayload, "legacy run without shuffle metadata"),
  ["shuffleItems"],
  "historical run compatibility must classify and bridge only the known missing shuffle field",
);
assert.equal(
  assertSeedRequiredReleaseMetadata(
    { ...physicalSnapshot().content, assessmentRelease: { contentDigest: "digest-old", id: "release-old", releaseNumber: 1 } },
    { id: "release-old", releaseNumber: 1, contentDigest: "digest-old" },
    "historical pinned run",
  ),
  "historical-legacy",
);

console.log("Tryout seed release guards and behavioral regressions passed.");

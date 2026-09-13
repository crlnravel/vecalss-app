import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  canonicalAssessmentReleaseJson,
  digestAssessmentReleasePayload,
} from "../lib/tryout/assessment-release-canonical.mjs";

const [schema, migration, canonical, release, delivery, attempt, result, seed, participant, repository, preview, operationsView, mentorTryoutPage] = await Promise.all([
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260822120000_add_assessment_release_boundary/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assessment-release-canonical.mjs", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assessment-release.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/delivery-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/attempt-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/result-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../prisma/seed-assessment.mjs", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/participant-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/admin/student-preview-tryout.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/operations-view.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/[tryoutId]/page.tsx", import.meta.url), "utf8"),
]);

assert.match(schema, /model AssessmentRelease/);
for (const field of ["assessmentReleaseId", "assessmentReleaseNumber", "assessmentReleaseDigest"]) {
  assert.match(schema, new RegExp(field));
}
assert.match(migration, /CREATE TABLE "assessment_releases"/);
assert.match(migration, /assessment_releases_append_only/);
assert.match(migration, /assessment_release_session_rebinding_forbidden/);
assert.match(migration, /assessment_release_metadata_mismatch/);
assert.match(migration, /assessment_release_attempt_session_mismatch/);
assert.match(migration, /assessment_release_run_attempt_mismatch/);
assert.match(migration, /assessment_release_attempt_metadata_required/);
assert.match(migration, /assessment_release_run_metadata_required/);
assert.match(migration, /assessment_release_session_children_unbound/);
assert.match(migration, /CREATE CONSTRAINT TRIGGER/);
assert.match(migration, /nullable|NULL/i);

assert.match(canonical, /Object\.entries\(value\)/);
assert.match(canonical, /sections\.map/);
assert.match(canonical, /physicalId/);
assert.match(canonical, /path\[0\] === "tryout"/);
assert.match(release, /buildCanonicalAssessmentReleasePayload/);
assert.match(release, /FOR UPDATE/);
assert.doesNotMatch(release, /CAT|cat_pool|calibration/u, "release assembly must not retain CAT compatibility");
assert.match(release, /assertTryoutReleaseEligibility/);
assert.match(delivery, /assessmentReleaseId: release\.id/);
assert.match(delivery, /assertTryoutOwnership/);
assert.match(delivery, /lockOverlappingDeliverySessions/);
assert.match(delivery, /assertTryoutReleaseEligibility/);
assert.match(attempt, /releaseMetadataFields\(release\)/);
assert.match(attempt, /Attempt Tryout yang sudah ada tidak cocok/);
assert.match(attempt, /releasePayload\.tryout\?\.revision/);
assert.match(attempt, /legacyRead/);
assert.match(attempt, /releaseItemId/);
assert.match(attempt, /assertCompleteFrozenRun/);
assert.doesNotMatch(attempt, /catParameters|catSnapshot|cat_state|cat_snapshot/u);
assert.doesNotMatch(attempt, /catRunSnapshot\(tx/);
assert.doesNotMatch(attempt, /candidate\.sortOrder === item\.sortOrder/);
assert.doesNotMatch(attempt, /candidate\.choiceKey === option\.choiceKey/);
assert.match(result, /Rilis diblokir: attempt tidak cocok/);
assert.match(result, /toParticipantAssessmentReleaseMetadata/);
assert.match(result, /frozenRunFields/);
assert.match(result, /snapshot section\/scoring belum lengkap/);
assert.match(seed, /prompt_asset_id/);
assert.match(seed, /explanation_asset_id/);
assert.match(seed, /asset_id/);
assert.match(seed, /explanationAssetId/);
assert.match(seed, /promptAssetId/);
assert.match(seed, /tryoutRevision: releasePayload\?\.tryout\?\.revision/);
assert.match(seed, /assessment-release-canonical\.mjs/);
assert.match(seed, /assessment_release_id/);
assert.match(seed, /COALESCE\(tryout_delivery_sessions\.assessment_release_id/);
assert.match(seed, /assessmentRelease/);
assert.match(seed, /mergeReleaseMediaIntoSnapshot/);
assert.doesNotMatch(seed, /two_pl_question_calibrations|seedCatSnapshot|cat_snapshot|cat_state/u);
assert.match(seed, /completeSeedContentSnapshot/);
assert.match(seed, /session\.status === "active" && session\.assessment_release_id !== null/);
assert.match(seed, /ORDER BY id[\s\S]*FOR UPDATE/);
assert.match(seed, /lockSeedTryoutSessions/);
assert.match(seed, /sectionSnapshot\.sectionId !== run\.tryout_section_id/);
assert.match(seed, /non-bijective item bridge/);
assert.match(seed, /non-bijective option bridge/);
assert.match(seed, /sourceQuestionRevisionId/);
assert.match(seed, /assertSeedSnapshotMatchesRelease/);
assert.match(seed, /assertSeedFrozenRunComplete/);
assert.doesNotMatch(seed, /candidate\.sequence_no === run\.sequence_no/);
assert.match(seed, /subtestCode: section\.subtest_code/);
assert.match(release, /section\.scoring\?\.testType/);
assert.match(participant, /subtestCode: section\.subtestCode/);
assert.match(participant, /subtestName: section\.subtestName/);
assert.doesNotMatch(participant, /current\?\.subtest/);
assert.match(repository, /TryoutDeliverySessionStatus\.active/);
assert.match(repository, /assessmentReleaseId: \{ not: null \}/);
assert.match(repository, /Tutup atau arsipkan sesi/);
assert.match(preview, /assertTryoutReleaseEligibility/);
assert.match(attempt, /findAssessmentReleaseSectionForRun/);
assert.match(attempt, /releaseSection\.subtestCode/);
assert.match(result, /findAssessmentReleaseSectionForRun/);
assert.match(result, /releaseSection\.subtestName/);
assert.match(delivery, /createdByUserId: actorId/);
assert.match(operationsView, /getTryoutDeliveryOperations\(tryoutId, actorId\)/);
assert.match(mentorTryoutPage, /getOwnedTryoutOperationsView/);
assert.doesNotMatch(mentorTryoutPage, /getTryoutDeliveryOperations/);

const left = { z: { b: 2, a: 1 }, a: [{ z: 1, a: 2 }] };
const right = { a: [{ a: 2, z: 1 }], z: { a: 1, b: 2 } };
assert.equal(canonicalAssessmentReleaseJson(left), canonicalAssessmentReleaseJson(right));
assert.equal(digestAssessmentReleasePayload(left), digestAssessmentReleasePayload(right));
assert.equal(
  digestAssessmentReleasePayload({ tryout: { id: "t", revision: 1 }, sections: [{ id: "logical", physicalId: "old" }] }),
  digestAssessmentReleasePayload({ tryout: { id: "t", revision: 2 }, sections: [{ id: "logical", physicalId: "new" }] }),
);
assert.equal(
  digestAssessmentReleasePayload({ sections: [{ assembly: { packageVersionId: "old-version" }, id: "logical" }] }),
  digestAssessmentReleasePayload({ sections: [{ assembly: { packageVersionId: "new-version" }, id: "logical" }] }),
);
assert.notEqual(
  canonicalAssessmentReleaseJson({ sections: [{ sequenceNo: 1 }, { sequenceNo: 2 }] }),
  canonicalAssessmentReleaseJson({ sections: [{ sequenceNo: 2 }, { sequenceNo: 1 }] }),
);

console.log("AS-09 AssessmentRelease invariants passed.");

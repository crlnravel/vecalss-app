import { createHash } from "node:crypto";

/**
 * Assessment release payloads are intentionally plain JSON.  The runtime and
 * the PostgreSQL seed both call this module so the byte representation used
 * for a release digest cannot diverge between environments.
 */
function canonicalizeAssessmentReleaseValue(value, path = []) {
  if (Array.isArray(value)) {
    return value.map((nested, index) => canonicalizeAssessmentReleaseValue(nested, [...path, index]));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        // Physical database IDs and the mutable authoring revision remain in
        // the stored payload for bridge/provenance reads, but are not part of
        // semantic content identity. Equivalent recreated rows must reuse the
        // same release digest.
        .filter(([key]) => key !== "physicalId"
          && !(path[0] === "tryout" && key === "revision")
          && !(path[path.length - 1] === "assembly" && key === "packageVersionId"))
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [
          key,
          canonicalizeAssessmentReleaseValue(nested, [...path, key]),
        ]),
    );
  }
  return value;
}

function canonicalAssessmentReleaseJson(payload) {
  return JSON.stringify(canonicalizeAssessmentReleaseValue(payload));
}

function digestAssessmentReleasePayload(payload) {
  return createHash("sha256")
    .update(canonicalAssessmentReleaseJson(payload), "utf8")
    .digest("hex");
}

function buildAssessmentReleasePayload({
  cbtVersion = "cbt-frozen-item-points-v1",
  aggregationVersion = "normalized-test-mean-v1",
  logicalRevisionVersion = 1,
  schemaVersion = "assessment-release-v2",
  tryoutId,
  tryoutRevision,
  sections,
}) {
  const stableSectionIdentity = (section) =>
    section.subtestId
      ? `subtest:${section.subtestId}:sequence:${section.sequenceNo}`
      : section.id;
  const stableItemIdentity = (item) =>
    item.snapshotId
      ? item.snapshotId
      : item.sourceQuestionId && item.sourceQuestionRevisionId && item.sourceContentDigest
      ? `question:${item.sourceQuestionId}:revision:${item.sourceQuestionRevisionId}:digest:${item.sourceContentDigest}`
      : item.sourceQuestionId
        ? `question:${item.sourceQuestionId}`
        : item.id;
  const stableOptionIdentity = (option) =>
    option.snapshotOptionId
      ? option.snapshotOptionId
      : option.sourceQuestionRevisionOptionId
      ? `revision-option:${option.sourceQuestionRevisionOptionId}`
      : option.sourceQuestionOptionId
        ? `question-option:${option.sourceQuestionOptionId}`
        : `choice:${option.choiceKey}:order:${option.sortOrder}`;

  return {
    assessmentRevision: {
      kind: "logical",
      version: logicalRevisionVersion,
    },
    schemaVersion,
    scoring: {
      aggregationVersion,
      cbtVersion,
    },
    sections: sections.map((section) => ({
      assembly: section.assembly ?? {
        mode: section.packageVersionId ? "fixed_set" : "direct",
        packageVersionId: section.packageVersionId ?? null,
      },
      durationSeconds: section.durationSeconds,
      id: stableSectionIdentity(section),
      instructions: section.instructions ?? null,
      physicalId: section.id,
      items: section.items.map((item) => ({
        difficulty: item.difficulty,
        explanation: item.explanation ?? null,
        explanationAssetId: item.explanationAssetId ?? null,
        id: stableItemIdentity(item),
        ...(item.snapshotId ? { snapshotId: item.snapshotId } : {}),
        physicalId: item.id,
        options: item.options.map((option) => ({
          assetId: option.assetId ?? null,
          choiceKey: option.choiceKey,
          content: option.content,
          id: stableOptionIdentity(option),
          ...(option.snapshotOptionId ? { snapshotOptionId: option.snapshotOptionId } : {}),
          isCorrect: option.isCorrect,
          physicalId: option.id,
          sortOrder: option.sortOrder,
          ...(!item.snapshotId ? {
            sourceQuestionOptionId: option.sourceQuestionOptionId ?? null,
            sourceQuestionRevisionOptionId:
              option.sourceQuestionRevisionOptionId ?? null,
          } : {}),
        })),
        packageCode: item.packageCode,
        points: String(item.points),
        prompt: item.prompt,
        promptAssetId: item.promptAssetId ?? null,
        questionType: item.questionType ?? "single_choice",
        sortOrder: item.sortOrder,
        ...(!item.snapshotId ? {
          sourceContentDigest: item.sourceContentDigest ?? null,
          sourceQuestionId: item.sourceQuestionId ?? null,
          sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? null,
          sourceRevisionProvenance: item.sourceRevisionProvenance ?? null,
        } : {}),
        subtestId: item.subtestId,
      })),
      randomization: {
        shuffleItems: Boolean(section.shuffleItems),
      },
      scoring: {
        config: section.scoringConfig ?? null,
        modelVersion: cbtVersion,
        testType: section.testType,
      },
      sequenceNo: section.sequenceNo,
      subtestId: section.subtestId,
      // Taxonomy labels are part of the participant-visible release. Keep
      // them beside the immutable subject identity so a later catalogue edit
      // cannot relabel an already-pinned session.
      subtestCode: section.subtestCode ?? null,
      subtestName: section.subtestName ?? null,
      title: section.title,
    })),
    tryout: {
      id: tryoutId,
      revision: tryoutRevision,
    },
  };
}

export {
  buildAssessmentReleasePayload,
  canonicalAssessmentReleaseJson,
  canonicalizeAssessmentReleaseValue,
  digestAssessmentReleasePayload,
};

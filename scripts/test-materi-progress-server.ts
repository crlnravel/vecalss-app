import assert from "node:assert/strict";

import { ProgressStatus } from "@/generated/prisma/client";
import { safeDownloadFileName } from "@/lib/media/domain";
import {
  buildCourseProgressSnapshot,
  ensureInitialProgressStatuses,
  getProgressionStatus,
  isProgressStatusAdmitted,
  ProgressionTransitionError,
  transitionComplete,
  transitionSkip,
  type ProgressionModule,
  type ProgressionRow,
} from "@/lib/materi/progress-state";
import { getCourseProgressState } from "@/modules/courses/data";

const modules: ProgressionModule[] = [
  { code: "PU-1", id: "module-1", sequenceNo: 1 },
  { code: "PU-2", id: "module-2", sequenceNo: 2 },
  { code: "PU-3", id: "module-3", sequenceNo: 3 },
];

const empty: ProgressionRow[] = [];
const firstAdmission = ensureInitialProgressStatuses(modules, empty);
assert.equal(getProgressionStatus(firstAdmission, "module-1"), ProgressStatus.in_progress, "first published unit is atomically admitted");
assert.equal(getProgressionStatus(firstAdmission, "module-2"), ProgressStatus.locked, "later units remain locked on first admission");
assert.equal(isProgressStatusAdmitted(ProgressStatus.locked), false, "locked direct delivery is denied");
assert.equal(isProgressStatusAdmitted(ProgressStatus.in_progress), true, "admitted unit is deliverable");

const skipped = transitionSkip(modules, firstAdmission, "module-3");
assert.equal(getProgressionStatus(skipped.rows, "module-1"), ProgressStatus.skipped, "skip does not complete the skipped unit");
assert.equal(getProgressionStatus(skipped.rows, "module-2"), ProgressStatus.skipped, "earlier incomplete units remain explicitly skipped");
assert.equal(getProgressionStatus(skipped.rows, "module-3"), ProgressStatus.in_progress, "skip admits only the selected target");
assert.deepEqual(skipped.snapshot, { completedLessonIds: [], skippedToLessonId: "PU-3" });

const completedSkippedTarget = transitionComplete(modules, skipped.rows, "module-3");
assert.equal(getProgressionStatus(completedSkippedTarget.rows, "module-3"), ProgressStatus.completed);
assert.equal(getProgressionStatus(completedSkippedTarget.rows, "module-1"), ProgressStatus.in_progress, "completion promotes the earliest incomplete skipped unit");
assert.equal(getProgressionStatus(completedSkippedTarget.rows, "module-2"), ProgressStatus.skipped);
assert.equal(completedSkippedTarget.snapshot.completedLessonIds.length, 1);

const completedFirst = transitionComplete(modules, completedSkippedTarget.rows, "module-1");
const completedSecond = transitionComplete(modules, completedFirst.rows, "module-2");
assert.equal(completedSecond.snapshot.completedLessonIds.length, 3);
assert.equal(
  getCourseProgressState(
    {
      code: "PU",
      description: "PU",
      difficulty: "Dasar",
      icon: "brain",
      lessons: modules.map((module) => ({ document: { managedAssetId: null, mimeType: "application/pdf", originalName: "bacaan.pdf", sourceKind: "hosted" as const, url: "https://cdn.example.test/bacaan.pdf" }, id: module.code, optionalVideo: null, title: module.code })),
      palette: "",
      progress: 0,
      slug: "pu",
      status: "Belum mulai",
      title: "PU",
    },
    completedSecond.snapshot,
  ).completionPercentage,
  100,
  "all-done is only reported at 100 percent",
);

const idempotent = transitionComplete(modules, completedSecond.rows, "module-3");
assert.deepEqual(idempotent.snapshot, completedSecond.snapshot, "completion is idempotent");
assert.throws(
  () => transitionComplete(modules, firstAdmission, "module-2"),
  (error: unknown) => error instanceof ProgressionTransitionError && error.code === "locked",
  "locked completion is denied",
);
assert.throws(
  () => transitionSkip(modules, firstAdmission, "unknown"),
  (error: unknown) => error instanceof ProgressionTransitionError && error.code === "invalid",
  "unknown server progression IDs are rejected",
);

const otherSubject = [{ code: "PPU-1", id: "other-module-1", sequenceNo: 1 }];
assert.deepEqual(
  buildCourseProgressSnapshot(otherSubject, []),
  { completedLessonIds: [] },
  "subject progress starts independently",
);

assert.equal(safeDownloadFileName("../Materi \"utama\"\n.pdf"), "..-Materi -utama-.pdf");
assert.equal(safeDownloadFileName("bacaan"), "bacaan.pdf");

console.log("Materi server progression contract checks passed.");

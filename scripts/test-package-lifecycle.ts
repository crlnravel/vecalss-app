import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  distinctTryoutUsageCounts,
  normalizedDecimalPoint,
  summarizePackageLifecycle,
} from "../lib/tryout/package-lifecycle";

const item = (overrides: Partial<{
  pointValue: number | string;
  sortOrder: number;
  sourceContentDigest: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId: string;
}> = {}) => ({
  pointValue: 1,
  sortOrder: 1,
  sourceContentDigest: "digest-1",
  sourceQuestionId: "question-1",
  sourceQuestionRevisionId: "revision-1",
  ...overrides,
});

const published = {
  id: "version-1",
  items: [item()],
  versionNo: 1,
};

assert.deepEqual(summarizePackageLifecycle({ draftItems: [item()] }), {
  active: null,
  availability: "draft",
  draft: { itemCount: 1, totalPoints: 1 },
  hasDraftChanges: false,
  usageCount: 0,
});

assert.equal(normalizedDecimalPoint("001.000"), "1");
assert.equal(normalizedDecimalPoint("1e-2"), "0.01");
assert.equal(normalizedDecimalPoint("-0.00"), "0");
assert.equal(
  summarizePackageLifecycle({
    draftItems: [item({ pointValue: "1.00" })],
    latestPublishedVersion: { ...published, items: [item({ pointValue: "1.0" })] },
  }).hasDraftChanges,
  false,
  "decimal formatting differences must not create draft changes",
);

const exact = summarizePackageLifecycle({ draftItems: [item()], latestPublishedVersion: published, usageCount: 2 });
assert.equal(exact.availability, "ready");
assert.equal(exact.hasDraftChanges, false);
assert.deepEqual(exact.active, { itemCount: 1, totalPoints: 1, versionId: "version-1", versionNo: 1 });
assert.deepEqual(exact.draft, { itemCount: 1, totalPoints: 1 });
assert.equal(exact.usageCount, 2);

for (const changed of [
  [item(), item({ sourceQuestionId: "question-2" })],
  [item(), item({ sourceQuestionRevisionId: "revision-2" })],
  [item(), item({ sourceContentDigest: "digest-2" })],
  [item({ sortOrder: 2 }), item()],
  [item({ pointValue: 2 }), item()],
] as const) {
  const [draftItem, activeItem] = changed;
  assert.equal(
    summarizePackageLifecycle({ draftItems: [draftItem], latestPublishedVersion: { ...published, items: [activeItem] } }).hasDraftChanges,
    true,
  );
}

assert.deepEqual(
  summarizePackageLifecycle({
    draftItems: [item({ pointValue: 2 }), item({ pointValue: "0.50", sortOrder: 2, sourceQuestionId: "question-2" })],
    latestPublishedVersion: published,
  }),
  {
    active: { itemCount: 1, totalPoints: 1, versionId: "version-1", versionNo: 1 },
    availability: "ready",
    draft: { itemCount: 2, totalPoints: 2.5 },
    hasDraftChanges: true,
    usageCount: 0,
  },
);

assert.deepEqual(
  distinctTryoutUsageCounts([
    { packageId: "package-1", tryoutId: "tryout-1" },
    { packageId: "package-1", tryoutId: "tryout-1" },
    { packageId: "package-1", tryoutId: "tryout-2" },
    { packageId: "package-2", tryoutId: "tryout-1" },
  ]),
  new Map([["package-1", 2], ["package-2", 1]]),
);

const repository = await readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8");
assert.match(repository, /package-lifecycle/u, "repository reads must use the pure lifecycle helper");
assert.match(repository, /versions: \{[\s\S]*status: ContentStatus\.published[\s\S]*items: \{ select: \{[\s\S]*sourceContentDigest/u, "package reads must include immutable latest-version items");
assert.match(repository, /options\.status === "ready" \? \{ versions: \{ some: \{ status: ContentStatus\.published \} \} \}/u, "ready filtering must mean a published version exists");
assert.match(repository, /options\.status === "draft" \? \{ versions: \{ none: \{ status: ContentStatus\.published \} \} \}/u, "draft filtering must mean no published version exists");
assert.match(repository, /async function readPackageUsageCounts\(packageIds/u);
assert.match(repository, /packageVersion: \{[\s\S]*status: ContentStatus\.published/u, "usage must traverse published package versions");
assert.match(repository, /distinctTryoutUsageCounts\(/u, "usage must be deduplicated per package and Tryout");

console.log("Package lifecycle projection and repository read contracts passed.");

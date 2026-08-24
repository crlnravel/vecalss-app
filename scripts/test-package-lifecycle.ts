import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ContentStatus } from "../generated/prisma/client";
import { listReusableQuestionPackages } from "../lib/tryout/repository";
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

type RepositoryClient = NonNullable<Parameters<typeof listReusableQuestionPackages>[2]>;
type AvailabilityWhere = { versions?: { none?: unknown; some?: unknown } };
type UsageQuery = { where?: { packageVersion?: { is?: { packageId?: { in?: string[] }; status?: unknown } } } };

function packageRecord(input: { id: string; legacyStatus: ContentStatus; published?: boolean }) {
  const itemRecord = {
    pointValue: "1.00",
    sortOrder: 1,
    sourceContentDigest: "digest-1",
    sourceQuestionId: "question-1",
    sourceQuestionRevisionId: "revision-1",
  };
  return {
    description: null,
    id: input.id,
    items: input.published ? [{ ...itemRecord }] : [],
    revision: 1,
    sourceBank: { id: "bank-1", name: "Bank Soal" },
    status: input.legacyStatus,
    subtest: { code: "PU", id: "subtest-1", name: "Penalaran Umum" },
    title: input.id,
    updatedAt: new Date("2026-08-24T00:00:00.000Z"),
    versions: input.published ? [{ id: "version-1", items: [{ ...itemRecord }], versionNo: 1 }] : [],
  };
}

const legacyPackage = packageRecord({ id: "legacy-package", legacyStatus: ContentStatus.published });
const readyPackage = packageRecord({ id: "ready-package", legacyStatus: ContentStatus.draft, published: true });
const availabilityQueries: unknown[] = [];
const usageQueries: UsageQuery[] = [];
const usageRows = [
  { packageId: "ready-package", sectionId: "section-a1", tryoutId: "tryout-a", versionId: "version-1" },
  { packageId: "ready-package", sectionId: "section-a2", tryoutId: "tryout-a", versionId: "version-2" },
  { packageId: "ready-package", sectionId: "section-b1", tryoutId: "tryout-b", versionId: "version-1" },
  { packageId: "ready-package", sectionId: "section-b2", tryoutId: "tryout-b", versionId: "version-1" },
];

const mockRepositoryClient = {
  reusableQuestionPackage: {
    count: async (args: unknown) => {
      availabilityQueries.push(args);
      const where = (args as { where?: AvailabilityWhere }).where;
      assert.deepEqual(where?.versions, {
        [where?.versions?.some ? "some" : "none"]: { status: ContentStatus.published },
      }, "catalogue status must be expressed through published-version relation filters");
      return 1;
    },
    findMany: async (args: unknown) => {
      const where = (args as { where?: AvailabilityWhere }).where;
      assert.ok(where?.versions, "catalogue reads must carry an availability relation filter");
      return where.versions.some ? [readyPackage] : [legacyPackage];
    },
  },
  reusableQuestionPackageVersion: { findMany: async () => [] },
  tryoutSection: {
    findMany: async (args: unknown) => {
      const query = args as UsageQuery;
      usageQueries.push(query);
      assert.equal(query.where?.packageVersion?.is?.status, ContentStatus.published, "usage must only traverse published package versions");
      const packageIds = query.where?.packageVersion?.is?.packageId?.in ?? [];
      return usageRows
        .filter((row) => packageIds.includes(row.packageId))
        .map((row) => ({ packageVersion: { packageId: row.packageId }, tryoutId: row.tryoutId }));
    },
  },
} as unknown as RepositoryClient;

const draftCatalogue = await listReusableQuestionPackages("mentor-1", { status: "draft" }, mockRepositoryClient);
assert.equal(draftCatalogue.items[0]?.status, "draft", "a legacy published package with no published version must remain Draf");
assert.deepEqual((availabilityQueries[0] as { where: AvailabilityWhere }).where.versions, { none: { status: ContentStatus.published } });

const readyCatalogue = await listReusableQuestionPackages("mentor-1", { status: "ready" }, mockRepositoryClient);
assert.equal(readyCatalogue.items[0]?.status, "ready", "a package with a published version must be Ready regardless of legacy package status");
assert.equal(readyCatalogue.items[0]?.usageCount, 2, "one Tryout using multiple versions/sections must count once, while multiple Tryouts count distinctly");
assert.deepEqual((availabilityQueries[1] as { where: AvailabilityWhere }).where.versions, { some: { status: ContentStatus.published } });
assert.equal(usageQueries.length, 2, "each paginated catalogue read should use one batched usage query");

const repository = await readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8");
assert.match(repository, /package-lifecycle/u, "repository reads must use the pure lifecycle helper");
assert.match(repository, /versions: \{[\s\S]*status: ContentStatus\.published[\s\S]*items: \{ select: \{[\s\S]*sourceContentDigest/u, "package reads must include immutable latest-version items");
assert.match(repository, /options\.status === "ready" \? \{ versions: \{ some: \{ status: ContentStatus\.published \} \} \}/u, "ready filtering must mean a published version exists");
assert.match(repository, /options\.status === "draft" \? \{ versions: \{ none: \{ status: ContentStatus\.published \} \} \}/u, "draft filtering must mean no published version exists");
assert.match(repository, /async function readPackageUsageCounts\(packageIds/u);
assert.match(repository, /packageVersion: \{[\s\S]*status: ContentStatus\.published/u, "usage must traverse published package versions");
assert.match(repository, /distinctTryoutUsageCounts\(/u, "usage must be deduplicated per package and Tryout");
const hubRead = repository.slice(repository.indexOf("async function getReusableQuestionPackageVersionHub"), repository.indexOf("async function getReusableQuestionPackageVersionDetail"));
assert.match(hubRead, /include: packageLifecycleInclude/u, "the package overview must use its narrow lifecycle include");
assert.doesNotMatch(hubRead, /include: packageInclude/u, "the package overview must not use the editor's rich source-question include");
assert.match(repository, /const packageLifecycleInclude = \{[\s\S]*items: \{ select: \{[\s\S]*sourceContentDigest/u);

console.log("Package lifecycle projection and repository read contracts passed.");

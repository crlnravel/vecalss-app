import assert from "node:assert/strict";

import { ContentStatus, ReusableQuestionPackageMode, TryoutDeliverySessionStatus, TryoutTestType } from "../generated/prisma/client";
import { getReusableQuestionPackageUseContext } from "../lib/tryout/repository";

type RepositoryClient = NonNullable<Parameters<typeof getReusableQuestionPackageUseContext>[2]>;

const packageQueries: unknown[] = [];
const targetQueries: unknown[] = [];
let activePackageId = "";

const mockRepositoryClient = {
  reusableQuestionPackage: {
    findFirst: async (args: unknown) => {
      packageQueries.push(args);
      const input = args as { select?: { versions?: { select?: { rule?: unknown } } }; where?: { createdByUserId?: string; id?: string; status?: unknown; versions?: unknown } };
      assert.equal(input.where?.createdByUserId, "mentor-1", "package handoff reads must scope ownership");
      assert.ok(input.where?.id === "package-1" || input.where?.id === "package-cat", "package handoff reads must use the requested package");
      assert.deepEqual(input.where?.status, { not: ContentStatus.archived }, "archived packages must not be handoff sources");
      assert.deepEqual(input.where?.versions, { some: { status: ContentStatus.published } }, "handoff sources must have a published version");
      assert.deepEqual(input.select?.versions?.select?.rule, { select: { requestedCount: true } }, "CAT handoff reads must include the immutable delivery rule");
      activePackageId = input.where.id;
      if (activePackageId === "package-cat") {
        return {
          description: "CAT source",
          id: "package-cat",
          sourceBank: { name: "Bank Soal CAT" },
          subtest: { code: "PU", id: "subtest-pu" },
          title: "Paket CAT PU",
          versions: [{ id: "version-cat", items: Array.from({ length: 5 }, (_, index) => ({ id: `cat-item-${index}` })), mode: ReusableQuestionPackageMode.cat_pool, rule: { requestedCount: 3 }, versionNo: 1 }],
        };
      }
      return {
        description: "Immutable source",
        id: "package-1",
        sourceBank: { name: "Bank Soal" },
        subtest: { code: "PU", id: "subtest-pu" },
        title: "Paket PU",
        versions: [
          { id: "version-latest", items: [{ id: "item-1" }, { id: "item-2" }], mode: ReusableQuestionPackageMode.fixed_set, rule: null, versionNo: 3 },
          { id: "version-old", items: [{ id: "item-old" }], mode: ReusableQuestionPackageMode.fixed_set, rule: null, versionNo: 2 },
        ],
      };
    },
  },
  tryoutPackage: {
    findMany: async (args: unknown) => {
      targetQueries.push(args);
      const input = args as { where?: { attempts?: unknown; createdByUserId?: string; deliverySessions?: unknown; status?: unknown } };
      assert.equal(input.where?.createdByUserId, "mentor-1", "Tryout handoff targets must scope ownership");
      assert.deepEqual(input.where?.status, ContentStatus.draft, "published Tryouts must not be handoff targets");
      assert.deepEqual(input.where?.attempts, { none: {} }, "Tryouts with attempts must not be handoff targets");
      assert.deepEqual(input.where?.deliverySessions, { none: { assessmentReleaseId: { not: null }, status: TryoutDeliverySessionStatus.active } }, "participant-accessible Tryouts must not be handoff targets");
      if (activePackageId === "package-cat") return [{ id: "tryout-cat", title: "Draf CAT", sections: [{ catItemCount: null, id: "section-cat", items: [], packageVersionId: null, testType: TryoutTestType.cat }] }];
      return [
        { id: "tryout-unbound", title: "Draf tanpa sumber", sections: [{ catItemCount: null, id: "section-unbound", items: [], packageVersionId: null, testType: TryoutTestType.cbt }] },
        { id: "tryout-same", title: "Draf versi sama", sections: [{ catItemCount: null, id: "section-same", items: [], packageVersionId: "version-latest", testType: TryoutTestType.cbt }] },
        { id: "tryout-conflict", title: "Draf sumber lain", sections: [{ catItemCount: null, id: "section-conflict", items: [], packageVersionId: "version-other", testType: TryoutTestType.cbt }] },
        { id: "tryout-direct", title: "Draf soal langsung", sections: [{ catItemCount: null, id: "section-direct", items: [{ id: "item-direct" }], packageVersionId: null, testType: TryoutTestType.cbt }] },
      ];
    },
  },
} as unknown as RepositoryClient;

const context = await getReusableQuestionPackageUseContext("package-1", "mentor-1", mockRepositoryClient);
assert.ok(context, "an owned package with a published version should produce a handoff context");
assert.equal(context.version.id, "version-latest", "handoff must resolve the latest published version");
assert.equal(context.version.versionNo, 3);
assert.equal(context.version.itemCount, 2);
assert.equal(context.version.testType, "cbt");
assert.equal(context.targets.find((target) => target.id === "tryout-unbound")?.eligible, true, "an unbound matching Section should be eligible");
assert.equal(context.targets.find((target) => target.id === "tryout-same")?.eligible, true, "a Section already using the same version should be eligible");
assert.equal(context.targets.find((target) => target.id === "tryout-conflict")?.eligible, false, "a different package source should be disabled");
assert.match(context.targets.find((target) => target.id === "tryout-conflict")?.disabledReason ?? "", /Sumber yang sedang dipakai/u);
assert.equal(context.targets.find((target) => target.id === "tryout-direct")?.eligible, false, "direct source content should be treated as a conflicting source");
assert.match(context.targets.find((target) => target.id === "tryout-direct")?.disabledReason ?? "", /soal langsung/u);
assert.equal(packageQueries.length, 1, "handoff context must use one owner-scoped package read");
assert.equal(targetQueries.length, 1, "handoff context must use one owner-scoped target read");

const catContext = await getReusableQuestionPackageUseContext("package-cat", "mentor-1", mockRepositoryClient);
assert.ok(catContext, "an owned CAT package with a published version should produce a handoff context");
assert.equal(catContext.version.itemCount, 5, "CAT context should retain the larger candidate-pool size");
assert.equal(catContext.version.catItemCount, 3, "CAT context must use the Ready rule requested count");
assert.equal(catContext.version.testType, "cat");
assert.equal(catContext.targets[0]?.eligible, true, "an unbound CAT Section should remain eligible");
assert.equal(packageQueries.length, 2, "CAT handoff should use the same owner-scoped package read");
assert.equal(targetQueries.length, 2, "CAT handoff should use the same owner-scoped target read");

console.log("Tryout package handoff repository contract passed.");

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { getPreviewTryoutScheduleStatus } from "@/lib/admin/student-preview-tryout-contract";
import { buildAdminStudentPreviewTryoutRoute } from "@/lib/student/preview-routes";

const root = process.cwd();
const now = new Date("2026-01-15T00:00:00.000Z");
const tryoutId = "22222222-2222-4222-8222-222222222222";
const window = (from: string, until: string, status: "active" | "archived" | "closed" | "draft") => ({
  availableFrom: new Date(from),
  availableUntil: new Date(until),
  status,
});

assert.equal(getPreviewTryoutScheduleStatus(window("2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "active"), now), "active");
assert.equal(getPreviewTryoutScheduleStatus(window("2026-01-01T00:00:00.000Z", "2026-01-10T00:00:00.000Z", "active"), now), "closed");
assert.equal(getPreviewTryoutScheduleStatus(window("2026-01-20T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "active"), now), "future");
assert.equal(getPreviewTryoutScheduleStatus(window("2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "closed"), now), "closed");
assert.equal(getPreviewTryoutScheduleStatus(window("2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "archived"), now), "archived");
assert.equal(getPreviewTryoutScheduleStatus(window("2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "draft"), now), "draft");

assert.equal(buildAdminStudentPreviewTryoutRoute(), "/admin/student-preview/tryout");
assert.equal(buildAdminStudentPreviewTryoutRoute(tryoutId), `/admin/student-preview/tryout/${tryoutId}`);
assert.throws(() => buildAdminStudentPreviewTryoutRoute("../admin"), /Unsafe admin student preview route/u);

const [readsSource, routeSource, surfacesSource, attemptSource] = await Promise.all([
  readFile(resolve(root, "lib/admin/student-preview-tryout-reads.ts"), "utf8"),
  readFile(resolve(root, "app/admin/student-preview/[[...slug]]/page.tsx"), "utf8"),
  readFile(resolve(root, "modules/student/components/admin-student-preview-surfaces.tsx"), "utf8"),
  readFile(resolve(root, "lib/tryout/attempt-repository.ts"), "utf8"),
]);

assert.match(readsSource, /PreviewReadBoundary\.run/u);
assert.match(readsSource, /ContentStatus\.published/u);
assert.match(readsSource, /satisfies Prisma\.TryoutPackageSelect/u);
assert.doesNotMatch(readsSource, /(?:create|createMany|update|updateMany|delete|deleteMany|upsert|\$transaction|\$executeRaw|\$queryRaw)\s*\(/u);
assert.doesNotMatch(readsSource, /(?:TryoutAttempt|AttemptAnswer|notification|enqueue|learnerProgress)/u);

assert.match(routeSource, /getAdminPreviewTryoutCatalogue/u);
assert.match(routeSource, /getAdminPreviewTryoutDetail/u);
assert.match(routeSource, /kind: "tryout-catalogue"/u);
assert.match(routeSource, /kind: "tryout-detail"/u);
assert.match(attemptSource, /isManagedPreviewPurpose/u);
assert.match(attemptSource, /Sesi pratinjau tidak dapat dikerjakan lewat halaman siswa\./u);

// A Tryout has one session, so the preview has no way to restart it into a new one.
for (const removed of ["lib/admin/student-preview-tryout.ts", "modules/admin/student-preview-actions.ts", "modules/student/components/admin-student-preview-tryout-restart.tsx"]) {
  await assert.rejects(access(resolve(root, removed)), `${removed} must stay removed`);
}
assert.doesNotMatch(surfacesSource, /Restart|mulai ulang|pengerjaan ulang/iu);
assert.doesNotMatch(readsSource, /restart|retake/iu);

console.log("Admin student preview Tryout contract checks passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [page, service, consoleModule, consoleError, shell, studentPage, kaptenPage, actions] = await Promise.all([
  readFile(resolve(root, "app/admin/page.tsx"), "utf8"),
  readFile(resolve(root, "lib/admin/operations/service.ts"), "utf8"),
  readFile(resolve(root, "modules/admin/OperationsConsoleModule.tsx"), "utf8"),
  readFile(resolve(root, "app/admin/error.tsx"), "utf8"),
  readFile(resolve(root, "modules/portal/components/admin-portal-nav.tsx"), "utf8"),
  readFile(resolve(root, "app/admin/enrollment/page.tsx"), "utf8"),
  readFile(resolve(root, "app/admin/kapten/page.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/actions.ts"), "utf8"),
]);

assert.match(page, /requireAdminSession/);
assert.match(page, /getAdminOperationsSnapshot/);
assert.match(page, /dynamic = "force-dynamic"/);
assert.match(service, /import "server-only"/);
assert.match(service, /prisma\.user\.count/);
assert.match(service, /prisma\.enrollmentHandoff\.count/);
assert.match(service, /prisma\.enrollmentImport\.count/);
assert.match(service, /prisma\.auditLog\.findMany/);
assert.match(service, /prisma\.auditLog\.findMany[\s\S]*take: 10/);
assert.match(service, /prisma\.\$queryRaw/);
assert.match(service, /CURRENT_TIMESTAMP/);
assert.match(service, /snapshotAt\.toISOString\(\)/);
assert.doesNotMatch(service, /lastUpdatedAt:\s*new Date/);
for (const status of ["draft", "queued", "processing", "completed", "partial", "failed"]) {
  assert.match(service, new RegExp(`EnrollmentImportStatus\\.${status}`));
}
assert.doesNotMatch(service, /seed|fixture|demo/i);
for (const label of ["Add student", "Add Kapten", "Import roster", "Review exceptions"]) {
  assert.match(consoleModule, new RegExp(label.replace(" ", "\\s+")));
}
assert.match(consoleModule, /SheetContent/);
assert.match(consoleModule, /lastTrigger/);
assert.match(consoleModule, /MobileAttentionQueue/);
assert.match(consoleModule, /h-\[100dvh\]/);
assert.match(consoleModule, /triggerRef/);
assert.match(consoleModule, /wasOpen/);
assert.match(consoleModule, /See more/);
assert.match(consoleModule, /href="\/admin\/audit-logs"/);
assert.match(consoleModule, /Quick actions/);
assert.doesNotMatch(consoleModule, /Selected:/);
assert.doesNotMatch(consoleModule, /Recent imports/);
assert.doesNotMatch(consoleModule, /Directories/);
assert.doesNotMatch(consoleModule, /Enrollment at a glance/);
assert.doesNotMatch(consoleModule, /Live PostgreSQL snapshot/);
assert.doesNotMatch(consoleModule, /SnapshotStatusBar|MetricCard|SNAPSHOT_STALE_AFTER_MS/);
assert.doesNotMatch(consoleModule, /uppercase[^>]*>Selected operation/);
assert.doesNotMatch(consoleModule, /uppercase[^>]*>Control matrix/);
assert.doesNotMatch(consoleModule, /uppercase[^>]*>Signal log/);
assert.doesNotMatch(consoleModule, /uppercase[^>]*>People directories/);
assert.match(shell, /Dashboard/);
assert.match(shell, /Students/);
assert.match(shell, /Kapten/);
assert.doesNotMatch(shell, /Imports/);
assert.match(shell, /Media/);
assert.match(studentPage, /contains: search/);
assert.match(studentPage, /skip: \(page - 1\) \* pageSize/);
assert.match(kaptenPage, /contains: search/);
assert.match(kaptenPage, /skip: \(page - 1\) \* pageSize/);
assert.match(actions, /directoryQuery/);
assert.match(actions, /revalidatePath\("\/admin"\)/);
assert.match(consoleError, /role="alert"/);
assert.match(consoleError, /Try again/);

console.log("admin operations contract checks passed");

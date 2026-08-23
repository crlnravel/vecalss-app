import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_DIRECTORY_PAGE,
  MAX_DIRECTORY_QUERY_LENGTH,
  DEFAULT_DIRECTORY_PAGE_SIZE,
  DIRECTORY_SORT_KEYS,
  DIRECTORY_PAGE_SIZE_OPTIONS,
  buildDirectoryQuery,
  isUuid,
  parseDirectoryParams,
  parseDirectoryQuery,
  parseUuid,
} from "@/lib/admin/operations/validation";
import {
  removeResolvedAttentionItems,
  replaceReissuedAttentionItems,
} from "@/lib/admin/operations/attention";
import {
  ImportRetryError,
  isRetryBodyShape,
  parseRetrySelection,
  retryEnrollmentImport,
} from "@/lib/admin/imports/processing";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [route, validation, actions, operationsService, handoffService, consoleModule, focusRestorer, focusTarget, loading, handoffControls, deliveryNotice, studentModule, kaptenModule, importsPage, cancelRoute, retryRoute, sheet, nav, access, studentPreview, dbContract, createStudentForm, createKaptenForm, studentDirectoryTable] = await Promise.all([
  readFile(resolve(root, "app/api/admin/handoffs/[handoffId]/reissue/route.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/operations/validation.ts"), "utf8"),
  readFile(resolve(root, "modules/admin/actions.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/operations/service.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/handoffs/service.ts"), "utf8"),
  readFile(resolve(root, "modules/admin/OperationsConsoleModule.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/components/focus-restorer.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/components/focus-target.ts"), "utf8"),
  readFile(resolve(root, "app/admin/loading.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/components/handoff-controls.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/components/handoff-delivery-notice.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/EnrollmentPageModule.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/KaptenPageModule.tsx"), "utf8"),
  readFile(resolve(root, "app/admin/imports/[importId]/page.tsx"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/cancel/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/retry/route.ts"), "utf8"),
  readFile(resolve(root, "components/ui/sheet.tsx"), "utf8"),
  readFile(resolve(root, "modules/portal/components/admin-portal-nav.tsx"), "utf8"),
  readFile(resolve(root, "lib/auth/access.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/student-preview.ts"), "utf8"),
  readFile(resolve(root, "scripts/test-admin-import-processing-db.ts"), "utf8"),
  readFile(resolve(root, "modules/admin/components/create-student-form.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/components/create-kapten-form.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/components/student-directory-table.tsx"), "utf8"),
]);
const kaptenDirectoryModule = await readFile(resolve(root, "modules/admin/components/kapten-directory-table.tsx"), "utf8");

const validId = "550e8400-e29b-41d4-a716-446655440000";
assert.equal(isUuid(validId), true);
assert.equal(parseUuid(` ${validId} `), validId);
assert.equal(parseUuid("not-a-uuid"), null);
assert.equal(isRetryBodyShape({}), true);
assert.equal(isRetryBodyShape({ expectedGeneration: 2 }), true);
assert.equal(isRetryBodyShape({ unexpected: true }), false);
assert.equal(isRetryBodyShape({ rowIds: [], unexpected: true }), false);
assert.equal(isRetryBodyShape([]), false);
assert.deepEqual(parseRetrySelection({ rowIds: [` ${validId} `], rowNumbers: [1] }), {
  rowIds: [validId],
  rowNumbers: [1],
});
assert.deepEqual(parseRetrySelection({}), { rowIds: [], rowNumbers: [] });
assert.equal(parseRetrySelection({ rowIds: [] }), null);
assert.equal(parseRetrySelection({ rowNumbers: [] }), null);
assert.equal(parseRetrySelection({ rowIds: [], rowNumbers: [] }), null);
assert.equal(parseRetrySelection({ rowIds: [validId], rowNumbers: [] }), null);
assert.equal(parseRetrySelection({ rowIds: ["not-a-uuid"] }), null);
assert.equal(parseRetrySelection({ rowNumbers: [0] }), null);
assert.equal(parseRetrySelection({ rowNumbers: [501] }), null);
assert.equal(parseRetrySelection({ rowNumbers: [1.5] }), null);
assert.equal(parseRetrySelection({
  rowIds: Array.from({ length: 500 }, (_, index) => `550e8400-e29b-41d4-a716-${index.toString(16).padStart(12, "0")}`),
  rowNumbers: [1],
}), null);
await assert.rejects(
  retryEnrollmentImport({
    actorUserId: validId,
    importId: validId,
    rowIds: ["not-a-uuid"],
  }),
  (error: unknown) => error instanceof ImportRetryError && error.code === "row_selection_invalid",
);
await assert.rejects(
  retryEnrollmentImport({
    actorUserId: validId,
    importId: validId,
    rowIds: [],
  }),
  (error: unknown) => error instanceof ImportRetryError && error.code === "row_selection_invalid",
);

const originalHandoff = {
  createdAt: "2026-08-08T00:00:00.000Z",
  detail: "Student · invite link · sailor@example.test",
  href: `/admin/enrollment?focus=${validId}`,
  id: validId,
  kind: "handoff" as const,
  label: "Handoff",
  sourceImportId: null,
  sourceImportRowId: null,
  status: "pending",
  statusLabel: "Awaiting release",
  title: "Sailor",
};
const replacementHandoffId = "550e8400-e29b-41d4-a716-446655440001";
const replacementAttention = replaceReissuedAttentionItems([originalHandoff], originalHandoff.id, replacementHandoffId);
assert.equal(replacementAttention[0]?.id, replacementHandoffId);
assert.equal(replacementAttention[0]?.status, "released");
assert.equal(replacementAttention[0]?.statusLabel, "Awaiting acknowledgement");
assert.deepEqual(removeResolvedAttentionItems(replacementAttention, new Set()), replacementAttention);
assert.deepEqual(removeResolvedAttentionItems(replacementAttention, new Set([replacementHandoffId])), []);
assert.equal(MAX_DIRECTORY_QUERY_LENGTH, 120);
assert.equal(MAX_DIRECTORY_PAGE, 1_000);
assert.equal(DEFAULT_DIRECTORY_PAGE_SIZE, 20);
assert.deepEqual(DIRECTORY_SORT_KEYS, ["student", "email", "added", "status"]);
assert.deepEqual(DIRECTORY_PAGE_SIZE_OPTIONS, [10, 20, 50]);

const safeDirectory = parseDirectoryParams({
  focus: validId,
  page: "4",
  q: "  sailor@example.test ",
  status: "active",
});
assert.deepEqual(safeDirectory, {
  addedFrom: null,
  addedTo: null,
  focus: validId,
  invalid: false,
  page: 4,
  pageSize: DEFAULT_DIRECTORY_PAGE_SIZE,
  search: "sailor@example.test",
  sort: null,
  direction: "asc",
  status: "active",
  statuses: ["active"],
});
assert.equal(parseDirectoryParams({ q: "x".repeat(MAX_DIRECTORY_QUERY_LENGTH + 1) }).invalid, true);
assert.equal(parseDirectoryParams({ page: "9007199254740992" }).invalid, true);
assert.equal(parseDirectoryParams({ page: "1001" }).page, MAX_DIRECTORY_PAGE);
assert.equal(parseDirectoryParams({ pageSize: "50" }).pageSize, 50);
assert.equal(parseDirectoryParams({ pageSize: "25" }).invalid, true);
assert.equal(parseDirectoryParams({ focus: "not-a-uuid" }).invalid, true);
assert.equal(parseDirectoryParams({ status: "not-a-status" }).invalid, true);
assert.deepEqual(parseDirectoryQuery("?sort=email&direction=desc&page=2"), {
  addedFrom: null,
  addedTo: null,
  direction: "desc",
  focus: null,
  invalid: false,
  page: 2,
  pageSize: DEFAULT_DIRECTORY_PAGE_SIZE,
  search: "",
  sort: "email",
  status: "all",
  statuses: [],
});
assert.equal(parseDirectoryParams({ direction: "desc" }).invalid, true);
assert.equal(parseDirectoryQuery(`?q=${encodeURIComponent("sailor")}&status=active&page=2&focus=${validId}`).page, 2);
assert.equal(parseDirectoryQuery("?pageSize=10").pageSize, 10);
assert.deepEqual(parseDirectoryQuery("?status=active&status=disabled").statuses, ["active", "disabled"]);
assert.equal(parseDirectoryQuery("?addedFrom=2026-08-09&addedTo=2026-08-10").invalid, false);
assert.equal(parseDirectoryQuery("?q=one&q=two").invalid, true);
assert.equal(parseDirectoryQuery(`?q=${"x".repeat(321)}`).invalid, true);
assert.equal(
  buildDirectoryQuery(safeDirectory),
  `?q=sailor%40example.test&status=active&page=4&focus=${validId}`,
);
assert.equal(
  buildDirectoryQuery(parseDirectoryQuery("?status=active&status=disabled&addedFrom=2026-08-09&addedTo=2026-08-10")),
  "?status=active&status=disabled&addedFrom=2026-08-09&addedTo=2026-08-10",
);
assert.equal(
  buildDirectoryQuery(parseDirectoryQuery("?sort=email&direction=desc&page=2")),
  "?sort=email&direction=desc&page=2",
);
assert.equal(
  buildDirectoryQuery({ ...safeDirectory, pageSize: 50 }),
  `?q=sailor%40example.test&status=active&pageSize=50&page=4&focus=${validId}`,
);

assert.match(validation, /MAX_DIRECTORY_QUERY_LENGTH/);
assert.match(validation, /MAX_DIRECTORY_PAGE/);
assert.match(validation, /parseDirectoryQuery/);
assert.match(validation, /parseUuid/);
assert.match(route, /headers\.get\("origin"\)\?\.trim\(\)/);
assert.match(route, /if \(!origin\)/);
assert.match(route, /origin === getTrustedAppBaseUrl\(\)/);
assert.match(route, /isUuid\(handoffId\)/);
assert.match(route, /readRequestBytesAtMost/);
assert.match(route, /MAX_HANDOFF_REQUEST_BYTES/);
assert.match(route, /request_too_large/);
assert.match(route, /Object\.keys\(body\)/);
assert.match(actions, /parseUuid/);
assert.match(actions, /parseDirectoryQuery/);
assert.match(actions, /invalid-user/);
assert.match(actions, /isHandoffConfirmed/);
assert.match(actions, /revalidatePath\("\/admin"\)/);
assert.match(operationsService, /attentionTotal: awaitingHandoff \+ importsNeedingReview/);
assert.match(operationsService, /slice\(0, 16\)/);
assert.match(operationsService, /dispatchGeneration: true/);
assert.match(operationsService, /parseDirectoryParams/);
assert.match(
  operationsService,
  /prisma\.enrollmentHandoff\.count\(\{[\s\S]*?acknowledgedAt: null,[\s\S]*?user: \{[\s\S]*?previewPurpose: null,/u,
);
assert.match(
  operationsService,
  /prisma\.enrollmentHandoff\.findMany\(\{[\s\S]*?acknowledgedAt: null,[\s\S]*?user: \{[\s\S]*?previewPurpose: null,/u,
);
for (const status of ["draft", "queued", "processing", "completed", "partial", "failed"]) {
  assert.match(operationsService, new RegExp(`EnrollmentImportStatus\\.${status}`));
}
assert.match(handoffService, /handoff_import_recovery_required/);
assert.match(handoffService, /if \(existing\.source_import_row_id\)/);
assert.match(consoleModule, /useActionState/);
assert.match(consoleModule, /ImportAttentionAction/);
assert.match(consoleModule, /router\.refresh\(\)/);
assert.match(consoleModule, /\/api\/admin\/imports/);
assert.match(consoleModule, /Acknowledge handoff/);
assert.match(consoleModule, /Reissue handoff/);
assert.match(consoleModule, /sourceImportRowId/);
assert.match(consoleModule, /resolvedAttentionIds/);
assert.match(consoleModule, /attentionQueueSummary/);
assert.match(consoleModule, /Showing \$\{displayedCount\} of \$\{total\}/);
assert.match(consoleModule, /min-h-11/);
assert.match(consoleModule, /No attention items right now/);
assert.match(consoleModule, /Quick actions/);
assert.doesNotMatch(consoleModule, /grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4/);
assert.match(consoleModule, /data-attention-row/);
assert.match(consoleModule, /firstVisibleFocusTarget/);
assert.match(consoleModule, /replaceReissuedHandoff/);
assert.match(consoleModule, /reissuedAttentionState/);
assert.match(consoleModule, /setSelectedItem\(\(current\)/);
assert.match(consoleModule, /No more items in this slice/);
assert.match(consoleModule, /data-attention-queue-announcement/);
assert.match(consoleModule, /aria-live="polite"/);
assert.match(consoleModule, /focus:outline-2/);
assert.match(consoleModule, /router\.refresh\(\)/);
assert.match(consoleModule, /onAcknowledged=\{\(\) => acknowledgeAndRefresh\(state\.handoffId/);
assert.doesNotMatch(consoleModule, /onReissued=\{\(\) => onResolved/);
assert.match(focusRestorer, /selected row is no longer available/);
assert.match(focusRestorer, /noticeId/);
assert.match(focusRestorer, /findVisibleFocusTarget/);
assert.match(focusTarget, /getComputedStyle/);
assert.match(focusTarget, /getClientRects/);
assert.match(focusTarget, /rowSelector/);
assert.match(focusTarget, /triggerSelector/);
assert.match(focusTarget, /preferNotice/);
assert.match(loading, /AdminPortalNav activeSection="overview"/);
assert.match(loading, /SidebarProvider/);
assert.doesNotMatch(loading, /bg-primary-700/);
assert.doesNotMatch(loading, /grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4/);
assert.doesNotMatch(loading, /xl:grid-cols-4/);
assert.doesNotMatch(loading, /size-5 rounded-full/);
assert.match(loading, /bg-primary-50/);
assert.match(handoffControls, /sourceImportRowId/);
assert.match(handoffControls, /Reissue is paused/);
assert.match(handoffControls, /confirmation/);
assert.match(handoffControls, /className="min-h-11"/);
assert.match(deliveryNotice, /confirmation/);
assert.match(deliveryNotice, /className="min-h-11"/);
assert.match(studentModule, /directoryQuery/);
assert.match(studentModule, /pageSize/);
assert.match(studentDirectoryTable, /data-directory-row/);
assert.match(kaptenModule, /KaptenDirectoryTable/);
assert.match(kaptenDirectoryModule, /data-directory-row/);
assert.match(kaptenDirectoryModule, /directoryQuery/);
assert.match(kaptenDirectoryModule, /SheetContent/);
assert.match(importsPage, /ImportDetailModule/);
assert.match(cancelRoute, /cancelEnrollmentImport/);
assert.match(cancelRoute, /revalidatePath\("\/admin"\)/);
assert.match(retryRoute, /retryEnrollmentImport/);
assert.match(retryRoute, /isRetryBodyShape/);
assert.match(retryRoute, /parseRetrySelection/);
assert.match(retryRoute, /Object\.prototype\.hasOwnProperty\.call\(candidate, "rowIds"\)/u);
assert.match(retryRoute, /Object\.prototype\.hasOwnProperty\.call\(candidate, "rowNumbers"\)/u);
assert.match(retryRoute, /revalidatePath\("\/admin"\)/);
assert.match(sheet, /size="icon"/);
assert.match(nav, /Sidebar/);
assert.match(nav, /collapsible="icon"/);
assert.doesNotMatch(nav, /Student banners/);
assert.doesNotMatch(nav, /Documentation/);
assert.doesNotMatch(nav, /adminContentNavigation/);
assert.doesNotMatch(nav, /adminSupportNavigation/);
assert.doesNotMatch(createStudentForm, /UC-18 Enrollment/);
assert.doesNotMatch(createStudentForm, /<select/u);
assert.match(createStudentForm, /DropdownMenuRadioGroup/u);
assert.match(createStudentForm, /mt-1 w-full/u);
assert.doesNotMatch(createKaptenForm, /Kapten enrollment/);
assert.match(access, /Permission contract: an authenticated non-admin returns to their authorized home/);
assert.match(access, /redirect\(getDefaultHomePath\(session\.user\)\)/);
assert.match(access, /const session = await requireAdminReadOnlySession\(\)/);
assert.match(studentPreview, /fixture\.id !== ADMIN_STUDENT_PREVIEW_FIXTURE_ID/);
assert.match(studentPreview, /fixture\.email !== ADMIN_STUDENT_PREVIEW_FIXTURE_EMAIL/);
assert.match(dbContract, /handoff_import_recovery_required/);
assert.match(dbContract, /preservedImportHandoff/);

console.log("admin operations fixup contract checks passed");

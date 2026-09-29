import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canConfirmImport,
  classifyImportSessionRecovery,
  getBoundedKaptenBioPreview,
  getHandoffDeliveryState,
  getImportLoginRecoveryHref,
  getHandoffSelectionState,
  getImportPollLifecycleDecision,
  getImportPollDelayMs,
  getImportProgressSnapshot,
  getImportWorkerHealthNoticeState,
  isImportPriorityRefreshSource,
  isImportPollingStatus,
  isPendingHandoffRow,
  isTerminalImportStatus,
  resetImportFileSelection,
} from "@/modules/admin/imports/import-ui-contract";
import { getImportTemplateDefinition } from "@/lib/admin/imports/contracts";
import { getSafeAdminReturnPath } from "@/lib/auth/paths";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [importsPage, intakeModule, detailModule, detailPage, loadingSource, intakeLoadingSource, statusRoute, previewRoute, skipRoute, confirmRoute, cancelRoute, retryRoute, handoffRoute, acknowledgeRoute, reissueRoute, service, handoffFile, handoffService, processingSource, authActions, authPaths, loginPage] = await Promise.all([
  readFile(resolve(root, "app/admin/imports/[importId]/page.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/imports/ImportsIntakeModule.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/imports/ImportDetailModule.tsx"), "utf8"),
  readFile(resolve(root, "app/admin/imports/[importId]/page.tsx"), "utf8"),
  readFile(resolve(root, "app/admin/imports/[importId]/loading.tsx"), "utf8"),
  readFile(resolve(root, "app/admin/kapten/loading.tsx"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/preview/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/rows/skip/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/confirm/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/cancel/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/retry/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/handoff-file/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/handoff-file/acknowledge/route.ts"), "utf8"),
  readFile(resolve(root, "app/api/admin/imports/[importId]/handoff-file/reissue/route.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/imports/service.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/imports/handoff-file.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/handoffs/service.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/imports/processing.ts"), "utf8"),
  readFile(resolve(root, "modules/auth/actions.ts"), "utf8"),
  readFile(resolve(root, "lib/auth/paths.ts"), "utf8"),
  readFile(resolve(root, "app/login/page.tsx"), "utf8"),
]);
const kaptenDialog = await readFile(resolve(root, "modules/admin/components/add-kapten-dialog.tsx"), "utf8");

assert.equal(getImportTemplateDefinition("students.v1")?.fileName, "daftar-siswa.csv");
assert.equal(getImportTemplateDefinition("kapten.v1")?.fileName, "daftar-kapten.csv");
assert.deepEqual(getImportTemplateDefinition("students.v1")?.headers, ["email", "full_name", "target_exam"]);
assert.deepEqual(getImportTemplateDefinition("kapten.v1")?.headers, ["email", "full_name", "phone", "headline", "bio"]);

const counts = {
  created: 0,
  failed: 0,
  invalid: 1,
  pending: 2,
  processing: 0,
  skipped: 0,
  total: 3,
  updated: 0,
};
assert.equal(canConfirmImport("draft", 3, counts), false);
assert.equal(canConfirmImport("draft", 3, { ...counts, invalid: 0, pending: 3, skipped: 0 }), true);
assert.equal(canConfirmImport("draft", 3, { ...counts, invalid: 0, pending: 2, skipped: 1 }), false);
assert.equal(canConfirmImport("queued", 3, { ...counts, invalid: 0, pending: 3, skipped: 0 }), false);
assert.deepEqual(
  [0, 1, 2, 3, 4, 5].map((attempt) => getImportPollDelayMs(attempt)),
  [2_000, 4_000, 8_000, 16_000, 30_000, 30_000],
);
assert.equal(getImportPollDelayMs(0, true), 4_000);
assert.equal(isImportPriorityRefreshSource("resume"), true);
assert.equal(isImportPriorityRefreshSource("manual"), true);
assert.equal(isImportPriorityRefreshSource("poll"), false);
assert.equal(getImportPollLifecycleDecision({ pageVisible: true, priorityRefreshPending: true }), "wait_for_priority_refresh");
assert.equal(getImportPollLifecycleDecision({ pageVisible: true, priorityRefreshPending: false }), "schedule_poll");
assert.equal(getImportPollLifecycleDecision({ pageVisible: false, priorityRefreshPending: true }), "pause_hidden");
assert.equal(getImportWorkerHealthNoticeState({ heartbeatStale: false, queueUnavailable: false, statusReadStale: true }), "status_read_stale");
assert.equal(getImportWorkerHealthNoticeState({ heartbeatStale: true, queueUnavailable: false, statusReadStale: false }), "worker_stale");
assert.equal(getImportWorkerHealthNoticeState({ heartbeatStale: true, queueUnavailable: true, statusReadStale: true }), "status_and_worker_stale");
assert.equal(getImportWorkerHealthNoticeState({ heartbeatStale: false, queueUnavailable: false, statusReadStale: false }), "none");
assert.deepEqual(
  getImportProgressSnapshot({ created: 2, failed: 1, invalid: 0, pending: 3, processing: 1, skipped: 1, total: 8, updated: 0 }),
  { pending: 3, percent: 50, processed: 4, processing: 1, remaining: 4, total: 8 },
);
assert.equal(classifyImportSessionRecovery({ status: 401 }), "expired");
assert.equal(classifyImportSessionRecovery({ status: 403 }), "forbidden");
assert.equal(classifyImportSessionRecovery({ errorCode: "invalid_origin", status: 403 }), null);
assert.equal(classifyImportSessionRecovery({ redirectPath: "/login", status: 200 }), "expired");
assert.equal(classifyImportSessionRecovery({ redirectPath: "/dashboard", status: 200 }), "forbidden");
assert.equal(getSafeAdminReturnPath("/admin/imports/550e8400-e29b-41d4-a716-446655440000"), "/admin/imports/550e8400-e29b-41d4-a716-446655440000");
assert.equal(getSafeAdminReturnPath("https://evil.example/"), null);
assert.equal(getSafeAdminReturnPath("/dashboard"), null);
assert.match(getImportLoginRecoveryHref("/admin/imports"), /returnTo=%2Fadmin%2Fimports/u);
const fileInput = { value: "wrong-role.csv" };
resetImportFileSelection(fileInput);
assert.equal(fileInput.value, "");
const longBio = "A".repeat(200);
const boundedBio = getBoundedKaptenBioPreview(longBio);
assert.ok(boundedBio.length <= 140);
assert.equal(boundedBio.endsWith("…"), true);
assert.equal(isImportPollingStatus("queued"), true);
assert.equal(isImportPollingStatus("processing"), true);
assert.equal(isImportPollingStatus("completed"), false);
assert.equal(isTerminalImportStatus("completed"), true);
assert.equal(isTerminalImportStatus("partial"), true);
assert.equal(isTerminalImportStatus("failed"), true);
assert.equal(isTerminalImportStatus("cancelled"), true);
assert.equal(isTerminalImportStatus("queued"), false);

const pendingHandoff = {
  handoffAcknowledgedAt: null,
  handoffExpiresAt: "2099-01-01T00:00:00.000Z",
  handoffId: "550e8400-e29b-41d4-a716-446655440000",
  handoffStatus: "pending",
  operation: "create",
  status: "created",
};
assert.equal(getHandoffSelectionState(pendingHandoff, Date.parse("2026-01-01T00:00:00.000Z")), "pending");
assert.equal(isPendingHandoffRow(pendingHandoff, Date.parse("2026-01-01T00:00:00.000Z")), true);
assert.equal(getHandoffSelectionState({ ...pendingHandoff, handoffExpiresAt: "2020-01-01T00:00:00.000Z" }, Date.parse("2026-01-01T00:00:00.000Z")), "expired");
assert.equal(getHandoffSelectionState({ ...pendingHandoff, handoffStatus: "released" }, Date.parse("2026-01-01T00:00:00.000Z")), "already_released");
assert.equal(getHandoffSelectionState({ ...pendingHandoff, handoffStatus: "released", handoffAcknowledgedAt: "2026-01-02T00:00:00.000Z" }, Date.parse("2026-01-01T00:00:00.000Z")), "acknowledged");
assert.equal(getHandoffDeliveryState([{ ...pendingHandoff, handoffStatus: "released", handoffAcknowledgedAt: "2026-01-02T00:00:00.000Z" }]), "all_acknowledged");
assert.equal(getHandoffSelectionState({ ...pendingHandoff, handoffStatus: "completed" }), "closed");
assert.equal(getHandoffSelectionState({ ...pendingHandoff, handoffStatus: "revoked" }), "closed");
assert.equal(getHandoffDeliveryState([{ ...pendingHandoff, handoffStatus: "completed" }]), "terminal");
assert.equal(getHandoffDeliveryState([{ ...pendingHandoff, handoffStatus: "revoked" }]), "terminal");
assert.equal(getHandoffDeliveryState([
  { ...pendingHandoff, handoffStatus: "released", handoffAcknowledgedAt: "2026-01-02T00:00:00.000Z" },
  { ...pendingHandoff, handoffId: "550e8400-e29b-41d4-a716-446655440001", handoffStatus: "revoked" },
]), "terminal");
assert.equal(getHandoffDeliveryState([
  { ...pendingHandoff, handoffStatus: "released", handoffAcknowledgedAt: "2026-01-02T00:00:00.000Z" },
  { ...pendingHandoff, handoffId: "550e8400-e29b-41d4-a716-446655440001", handoffStatus: "pending" },
]), "action_needed");

assert.match(statusRoute, /requireAdminReadOnlySession/u);
assert.match(statusRoute, /Cache-Control.*no-store/u);
for (const source of [previewRoute, skipRoute, confirmRoute, cancelRoute, retryRoute, handoffRoute, acknowledgeRoute, reissueRoute]) {
  assert.match(source, /requireAdmin(?:ReadOnly)?Session/u);
  assert.match(source, /no-store/u);
  assert.match(source, /sameOrigin/u);
}
assert.match(detailPage, /requireAdminSession/u);
assert.match(detailPage, /getEnrollmentImportStatus/u);
assert.match(detailPage, /returnTo=/u);
assert.match(loadingSource, /Memuat pratinjau data impor/u);
assert.match(loadingSource, /LoadingRow/u);
assert.match(intakeLoadingSource, /Memuat daftar Kapten/u);
assert.match(intakeLoadingSource, /activeSection="kapten"/u);
assert.match(intakeLoadingSource, /SidebarProvider/u);
assert.match(intakeLoadingSource, /SidebarInset/u);
assert.match(intakeLoadingSource, /Memuat daftar Kapten/u);
assert.doesNotMatch(importsPage, /createdByUserId: session\.user\.id/u);
assert.doesNotMatch(importsPage, /Your recent imports/u);
assert.match(intakeModule, /FormData/u);
assert.match(intakeModule, /\/api\/admin\/imports\/preview/u);
assert.match(intakeModule, /students\.v1/u);
assert.match(intakeModule, /kapten\.v1/u);
assert.match(intakeModule, /Belum ada akun yang diubah/u);
assert.match(intakeModule, /resetImportFileSelection/u);
assert.match(intakeModule, /value=\{role\}/u);
assert.match(intakeModule, /ReferenceSelect/u);
assert.match(intakeModule, /1\. Pilih jenis akun/u);
assert.match(intakeModule, /2\. Unduh templat daftar/u);
assert.match(intakeModule, /3\. Unggah file/u);
assert.match(intakeModule, /Tambah akun dari CSV/u);
assert.doesNotMatch(intakeModule, /Start a roster import/u);
assert.doesNotMatch(intakeModule, /Choose a role, download the matching columns/u);
assert.doesNotMatch(intakeModule, /One role per file/u);
assert.match(intakeModule, /Unduh templat/u);
assert.match(intakeModule, /FileUploadSlot/u);
assert.match(intakeModule, /disabled=\{busy \|\| !file\}/u);
assert.match(intakeModule, /\? "Mengunggah…" : "Unggah"/u);
assert.doesNotMatch(intakeModule, /Columns: \{role === "student"/u);
assert.match(intakeModule, /sessionIssue/u);
assert.match(kaptenDialog, /ImportsIntakeModule/u);
assert.match(kaptenDialog, /aria-label="Pilih cara menambahkan Kapten"/u);
assert.match(kaptenDialog, /bulk-kapten-import-panel/u);
assert.match(kaptenDialog, /initialRole="tutor"/u);
assert.match(kaptenDialog, /showRoleSelect=\{false\}/u);
assert.match(detailModule, /\/confirm/u);
assert.match(detailModule, /\/cancel/u);
assert.match(detailModule, /\/retry/u);
assert.match(detailModule, /\/handoff-file/u);
assert.match(detailModule, /\/handoff-file\/acknowledge/u);
assert.match(detailModule, /\/handoff-file\/reissue/u);
assert.match(detailModule, /getImportPollDelayMs/u);
assert.match(detailModule, /isImportPollingStatus/u);
assert.match(detailModule, /queued/u);
assert.match(detailModule, /processing/u);
assert.match(detailModule, /Progres impor/u);
assert.match(detailModule, /role="progressbar"/u);
assert.match(detailModule, /Diproses \{progress\.processed\} dari \{progress\.total\}/u);
assert.match(detailModule, /AbortController/u);
assert.match(detailModule, /getImportPollLifecycleDecision/u);
assert.match(detailModule, /waitForPriorityRefresh/u);
assert.match(detailModule, /priorityRefreshRef/u);
assert.match(detailModule, /pagehide/u);
assert.match(detailModule, /pageshow/u);
assert.match(detailModule, /visibilitychange/u);
assert.match(detailModule, /signal: controller\.signal/u);
assert.match(detailModule, /sequence !== pollSequenceRef\.current/u);
assert.match(detailModule, /succeeded && !heartbeatIsStale/u);
assert.match(detailModule, /pageVisibleRef\.current = false/u);
assert.match(detailModule, /pollAttemptRef\.current = 0/u);
assert.match(detailModule, /Sesi admin sudah berakhir/u);
assert.match(detailModule, /getImportLoginRecoveryHref/u);
assert.match(detailModule, /Semua akses sudah dikonfirmasi/u);
assert.match(detailModule, /Tidak ada akses yang perlu dibagikan/u);
assert.match(detailModule, /Lihat bio lengkap/u);
assert.match(detailModule, /transferConfirmed/u);
assert.match(detailModule, /Gagal <strong/u);
for (const terminal of ["completed", "partial", "failed", "cancelled"]) assert.match(detailModule, new RegExp(terminal, "u"));
assert.doesNotMatch(detailModule, /Select invalid rows/u);
assert.doesNotMatch(detailModule, /Skip selected/u);
assert.match(detailModule, /Impor massal tidak dapat dilanjutkan/u);
assert.match(detailModule, /Tidak ada baris yang akan diimpor/u);
assert.match(detailModule, /toast\.error/u);
assert.match(detailModule, /components\/ui\/sonner/u);
assert.match(detailModule, /Coba ulang pilihan/u);
assert.match(detailModule, /Coba ulang seluruh baris yang gagal/u);
assert.match(detailModule, /statusReadStale/u);
assert.match(detailModule, /heartbeatStale/u);
assert.match(detailModule, /proses belum dikonfirmasi berhasil/u);
assert.match(detailModule, /URL\.createObjectURL/u);
assert.match(detailModule, /URL\.revokeObjectURL/u);
assert.match(detailModule, /Kredensial hanya ditampilkan sekali/u);
assert.match(detailModule, /email tidak dikirim otomatis/u);
assert.doesNotMatch(detailModule, /localStorage/u);
assert.doesNotMatch(detailModule, /sessionStorage/u);
assert.doesNotMatch(detailModule, /sendBeacon/u);
assert.doesNotMatch(detailModule, /console\./u);
assert.doesNotMatch(handoffRoute, /temporaryPassword|inviteUrl|secret/u);
assert.doesNotMatch(acknowledgeRoute, /temporaryPassword|inviteUrl|secret/u);
assert.doesNotMatch(reissueRoute, /temporaryPassword|inviteUrl|secret/u);
assert.match(reissueRoute, /allowImportRecovery: true/u);
assert.match(reissueRoute, /recoverableByImportFile/u);
assert.match(handoffService, /input\.allowImportRecovery/u);
assert.match(handoffService, /!existing\.source_import_row_id/u);
assert.match(handoffService, /rows: \{ some: \{ id: existing\.source_import_row_id \} \}/u);
assert.match(service, /lastHeartbeatAt/u);
assert.match(service, /handoffStatus/u);
assert.match(service, /handoffAcknowledgedAt/u);
assert.match(service, /counts\.invalid > 0 \|\| counts\.skipped > 0/u);
assert.doesNotMatch(service.slice(service.indexOf("function buildStatusDto"), service.indexOf("type StatusTransaction")), /secretEnvelope|tokenHash/u);
assert.match(handoffFile, /secretEnvelope: Prisma\.DbNull/u);
assert.match(handoffRoute, /Cache-Control/u);
assert.match(cancelRoute, /readRequestBytesAtMost/u);
assert.match(cancelRoute, /request_too_large/u);
assert.match(cancelRoute, /invalid_request/u);
assert.match(cancelRoute, /bodyBytes\.byteLength > 0/u);
assert.match(service, /const selected = await tx\.enrollmentImportRow\.findMany/u);
assert.match(service, /updated\.count !== selected\.length/u);
assert.match(service, /selected\.some\(\(row\) => row\.status !== EnrollmentImportRowStatus\.invalid\)/u);
assert.match(skipRoute, /row_selection_invalid/u);
assert.match(skipRoute, /bodyKeys/u);
assert.match(processingSource, /new Set\(normalizedRowIds\)/u);
assert.match(processingSource, /new Set\(rowNumbersInput as number\[\]\)/u);
assert.match(processingSource, /rowIdsProvided/u);
assert.match(processingSource, /rowNumbersProvided/u);
assert.match(processingSource, /rowIdsProvided && rowIdsInput\.length === 0/u);
assert.match(processingSource, /selected\.length !== rowIds\.length \+ rowNumbers\.length/u);
assert.match(processingSource, /selected\.some\(\(row\) => row\.status !== EnrollmentImportRowStatus\.failed\)/u);
assert.match(retryRoute, /row_selection_invalid/u);
assert.match(authActions, /getSafeAdminReturnPath/u);
assert.match(authActions, /formData\.get\("returnTo"\)/u);
assert.match(authPaths, /getSafeAdminReturnPath/u);
assert.match(loginPage, /returnTo/u);

console.log("admin import UI contract and runtime checks passed");

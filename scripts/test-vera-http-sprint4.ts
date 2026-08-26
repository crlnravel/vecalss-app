import { readFileSync } from "node:fs";

const routeFiles = [
  "app/api/admin/ai-policy/route.ts",
  "app/api/admin/ai-policy/drafts/route.ts",
  "app/api/admin/ai-policy/drafts/[bundleId]/route.ts",
  "app/api/admin/ai-policy/drafts/[bundleId]/validate/route.ts",
  "app/api/admin/ai-policy/drafts/[bundleId]/preview/route.ts",
  "app/api/admin/ai-policy/drafts/[bundleId]/approve/route.ts",
  "app/api/admin/ai-policy/drafts/[bundleId]/schedule/route.ts",
  "app/api/admin/ai-policy/drafts/[bundleId]/activate/route.ts",
  "app/api/admin/ai-policy/[bundleId]/rollback/route.ts",
  "app/api/admin/ai-policy/retention-extension-requests/route.ts",
];
let checks = 0;
function check(condition: boolean, message: string) {
  checks += 1;
  if (!condition) throw new Error(`FAIL vera-http-sprint4: ${message}`);
}

for (const file of routeFiles) {
  const source = readFileSync(file, "utf8");
  check(source.includes("requireAdminSession"), `${file} has route-level admin auth`);
  check(source.includes("responseForPolicyError"), `${file} returns typed policy errors`);
}
const page = readFileSync("app/admin/ai-policy/page.tsx", "utf8");
const uiModule = readFileSync("modules/admin/AiPolicyPageModule.tsx", "utf8");
const usageUi = readFileSync("modules/admin/AiUsagePageModule.tsx", "utf8");
check(page.includes("requireAdminSession"), "policy page is admin guarded");
check(uiModule.includes("open_blocked"), "UI exposes the closed provider gate");
check(uiModule.includes("pending") && uiModule.includes("T11"), "UI explains pending retention handoff");
check(!uiModule.includes("textarea") || uiModule.includes("Alasan perubahan"), "UI textarea is bounded reason input, not a JSON editor");
check(!uiModule.includes("providerUrl") && !uiModule.includes("apiKey") && !uiModule.includes("liveProvider"), "UI exposes no provider control");
for (const marker of ["validateDraft", "previewDraft", "approveDraft", "scheduleDraft", "activateDraft", "rollbackBundle", "datetime-local", "policy-lifecycle-controls"]) {
  check(uiModule.includes(marker), `policy UI exposes ${marker}`);
}
for (const marker of ["comparison", "Tanggal akhir eksklusif", "sm:grid-cols", "disembunyikan", "Mock / disabled"] as const) {
  check(usageUi.toLowerCase().includes(marker.toLowerCase()), `usage UI includes ${marker}`);
}
check(!routeFiles.some((file) => readFileSync(file, "utf8").includes("AiReportReservation")), "routes do not duplicate T9 reservation ownership");
console.log(`PASS vera-http-sprint4: ${checks} checks`);

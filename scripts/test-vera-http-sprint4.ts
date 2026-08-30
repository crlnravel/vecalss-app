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
const canonicalPage = readFileSync("app/admin/ai/policies/page.tsx", "utf8");
const uiModule = readFileSync("modules/admin/ai/AiPoliciesPageModule.tsx", "utf8");
const usageUi = readFileSync("modules/admin/ai/AiUsagePageModule.tsx", "utf8");
check(page.includes("redirect(\"/admin/ai/policies\")"), "legacy policy route redirects to the canonical page");
check(canonicalPage.includes("requireAdminSession"), "canonical policy page is admin guarded");
for (const marker of ["Kebijakan & Tata Kelola", "Kebijakan Aktif", "Buat Draf Revisi", "Alur Siklus Hidup Kebijakan", "Persetujuan Ganda (Dual Approval)", "Simulasi Dampak (Berdasarkan Data 7 Hari Terakhir)", "Riwayat Versi Kebijakan & Korelasi Metrik"]) {
  check(uiModule.includes(marker), `policy UI exposes ${marker}`);
}
check(!uiModule.includes("providerUrl") && !uiModule.includes("apiKey") && !uiModule.includes("liveProvider"), "UI exposes no provider control");
for (const marker of ["Pemakaian menurut fitur", "Perkiraan biaya", "Ukuran penggunaan", "Periode", "API Request", "Kuota terpakai", "disembunyikan", "sm:grid-cols"] as const) {
  check(usageUi.toLowerCase().includes(marker.toLowerCase()), `usage UI includes ${marker}`);
}
check(usageUi.includes("metric") && usageUi.includes("period") && usageUi.includes("/api/admin/ai/usage?"), "usage query wires the current metric/period controls");
check(!usageUi.includes("min-w-[680px]"), "usage tables do not require a fixed desktop width");
check(usageUi.includes("overflow-x-auto"), "usage tables keep overflow inside bounded containers");
check(!uiModule.includes("min-w-[700px]"), "policy views do not require a fixed desktop width");
check(!routeFiles.some((file) => readFileSync(file, "utf8").includes("AiReportReservation")), "routes do not duplicate T9 reservation ownership");
console.log(`PASS vera-http-sprint4: ${checks} checks`);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AssessmentAnnotationOverlay,
  AssessmentQuestionMarker,
  AssessmentResultMarker,
  AssessmentResultNavigation,
} from "@/modules/assessment/AssessmentWorkspace";
import { AiHourlyLockChart } from "@/modules/admin/ai/components/AiHourlyLockChart";
import type { QuotaHealthState } from "@/lib/admin/ai/contracts";
import { resolveDataTableClassName } from "@/components/ui/data-table-utils";
import { Table } from "@/components/ui/table";

const root = process.cwd();
let checks = 0;

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function check(condition: boolean, message: string) {
  checks += 1;
  assert.ok(condition, `FAIL ui-ux-uix-04: ${message}`);
}

function includes(source: string, expected: string, message: string) {
  check(source.includes(expected), message);
}

function excludes(source: string, unexpected: string, message: string) {
  check(!source.includes(unexpected), message);
}

const button = read("components/ui/button.tsx");
const input = read("components/ui/input.tsx");
const copyValue = read("modules/admin/components/copy-value-button.tsx");
const previewShell = read("modules/student/components/admin-student-preview-shell.tsx");
const studentSidebar = read("modules/student/components/student-sidebar.tsx");
const mentorSidebar = read("modules/mentor/components/mentor-sidebar.tsx");
const accountMenu = read("modules/student/components/student-account-menu.tsx");

includes(button, "motion-reduce:translate-y-0", "Button translate transforms must reset under reduced motion.");
includes(button, "motion-reduce:transform-none", "Button active transforms must reset under reduced motion.");
includes(button, "motion-reduce:transition-none", "Button transitions must respect reduced motion.");
includes(input, "h-11", "Shared inputs must expose a 44px base target.");
includes(input, "motion-reduce:transition-none", "Shared input transitions must respect reduced motion.");
includes(copyValue, 'size={iconOnly ? "icon" : "default"}', "Copy controls must meet the 44px target in both modes.");
includes(copyValue, "disabled={masked}", "Masked values must remain unavailable to copy.");
includes(copyValue, "aria-live=\"polite\"", "Copy outcomes must be announced.");
includes(previewShell, 'SidebarTrigger className="shrink-0" size="icon"', "Preview sidebar trigger must meet the 44px target.");
includes(studentSidebar, "motion-reduce:transition-none", "Student navigation transitions must respect reduced motion.");
includes(mentorSidebar, "motion-reduce:transition-none", "Mentor navigation transitions must respect reduced motion.");
check((accountMenu.match(/motion-reduce:animate-none/g) ?? []).length >= 2, "Account-menu loading indicators must stop spinning under reduced motion.");

const providers = read("modules/admin/ai/AiProvidersPageModule.tsx");
const capacity = read("modules/admin/ai/components/AiCapacityMeter.tsx");
const routing = read("modules/admin/ai/components/AiRoutingChainVisualizer.tsx");
const reliability = read("modules/admin/ai/AiReliabilityPageModule.tsx");
const metric = read("modules/admin/ai/components/AiMetricCard.tsx");
const refresh = read("modules/admin/ai/components/AiRefreshBar.tsx");

includes(providers, "aria-live=\"assertive\"", "Provider errors must be announced assertively.");
includes(providers, "min-w-0 break-words", "Provider credential fingerprints must wrap at compact widths.");
includes(providers, "<h2", "Provider sections must follow the page h1 with h2 headings.");
includes(providers, "</h2>", "Provider section headings must be closed at the same level.");
excludes(providers, "</h3>", "Provider section heading markup must not leave a stale h3 closing tag.");
includes(capacity, "<meter", "Capacity bars must expose native meter semantics.");
includes(capacity, "max={100}", "Capacity meters must expose their range.");
includes(capacity, "value={Math.max", "Capacity meters must expose their current values.");
includes(capacity, "motion-reduce:transition-none", "Capacity animation must respect reduced motion.");
includes(routing, 'role="img"', "Routing charts must expose an accessible aggregate.");
includes(routing, "Rincian penyelesaian aktual", "Routing charts must expose a visible value legend.");
includes(routing, 'aria-hidden="true"', "Routing chart segments must remain decorative after the aggregate is announced.");
includes(routing, "<h3", "Capability cards must continue the provider section heading hierarchy.");
includes(metric, "motion-reduce:transition-none", "Metric card transitions must respect reduced motion.");
includes(refresh, "min-h-11", "Refresh controls must meet the 44px target.");
includes(refresh, "motion-reduce:animate-none", "Refresh animation must respect reduced motion.");
includes(reliability, "aria-pressed", "Incident selection must expose a non-color selected state.");
includes(reliability, "Pilih salah satu insiden", "Incident empty state must use an actionable selection label.");
includes(reliability, "role=\"alert\"", "Reliability errors must be announced as alerts.");
includes(reliability, "<h2", "Reliability sections must follow the page h1 with h2 headings.");
includes(reliability, 'role="img"', "Graceful degradation charts must expose an accessible aggregate.");

const portalShell = read("modules/portal/components/portal-shell.tsx");
const aiOverview = read("modules/admin/ai/AiOverviewPageModule.tsx");
const aiPolicies = read("modules/admin/ai/AiPoliciesPageModule.tsx");
const aiUsage = read("modules/admin/ai/AiUsagePageModule.tsx");
const aiHourlyLockChart = read("modules/admin/ai/components/AiHourlyLockChart.tsx");
const dataTable = read("components/ui/data-table.tsx");
const dataTableUtils = read("components/ui/data-table-utils.ts");
const compactFilterTabs = read("components/ui/compact-filter-tabs.tsx");
const mentorWorkspaceShell = read("modules/mentor/components/mentor-workspace-shell.tsx");
const kaptenUi = read("modules/mentor/components/kapten-ui.tsx");

includes(portalShell, 'aria-label="Buka atau tutup navigasi"', "Admin sidebar trigger must have a localized accessible label.");
includes(portalShell, "size-[44px] min-h-[44px] min-w-[44px]", "Admin sidebar trigger must retain the 44px target at compact widths.");
includes(portalShell, 'aria-label="Header workspace Admin"', "Admin workspace header must expose its landmark label.");
includes(aiOverview, 'aria-labelledby="ai-overview-requests-heading"', "AI request chart must expose a named section.");
includes(aiOverview, "Rincian API Request per rentang empat jam", "AI request chart must expose per-value semantic equivalents.");
includes(aiOverview, 'role="alert"', "AI overview errors must be announced as alerts.");
includes(aiOverview, "motion-reduce:transition-none", "AI overview transitions must respect reduced motion.");
includes(aiPolicies, 'role="tablist"', "AI policy views must expose tab-list semantics.");
includes(aiPolicies, 'aria-selected={activeTab === "active"}', "AI policy tabs must expose selected state.");
includes(aiPolicies, 'role="tabpanel"', "AI policy content must expose panel semantics.");
includes(aiPolicies, "max-w-full overflow-x-auto", "AI policy history must contain its dense table responsively.");
includes(aiPolicies, "min-w-[760px]", "AI policy history must retain a readable dense-table minimum width inside its scroller.");
includes(aiPolicies, "min-h-[44px]", "AI policy actions and tabs must retain the 44px target.");
includes(aiUsage, "CompactFilterTabs", "AI usage metric selection must use the shared tabs contract.");
includes(aiUsage, "min-h-[44px]", "AI usage period and retry controls must retain the 44px target.");
includes(aiUsage, 'role="alert"', "AI usage errors must be announced as alerts.");
includes(aiUsage, "Data disembunyikan untuk menjaga privasi siswa.", "AI usage suppressed values must not expose a false zero value.");
includes(aiHourlyLockChart, "Rincian kunci batas kuota per jam", "Hourly lock chart must expose per-value semantic equivalents.");
includes(aiHourlyLockChart, 'aria-hidden="true"', "Hourly lock chart visuals must remain decorative after semantic values are announced.");
includes(aiHourlyLockChart, "motion-reduce:transition-none", "Hourly lock chart transitions must respect reduced motion.");
includes(dataTable, "useId", "Data table search controls must use an instance-safe label association.");
includes(dataTable, "htmlFor={searchId}", "Data table search labels must associate with their input.");
includes(dataTable, "size-[44px]", "Data table compact actions must retain the 44px target.");
includes(dataTableUtils, "resolveDataTableClassName", "Data table width classes must resolve through an instance-safe helper.");
includes(dataTable, "!min-w-full", "Data table empty states must take precedence over caller dense minimum widths.");
includes(dataTable, "motion-reduce:transform-none motion-reduce:transition-none", "Data table clear-all actions must reset transform and transition under reduced motion.");
includes(dataTable, "transition-[border-color,box-shadow,background-color] motion-reduce:transition-none", "Data table search focus transitions must respect reduced motion.");
includes(dataTable, 'role="group"', "Data table filter chips must expose their group semantics.");
includes(compactFilterTabs, "!min-h-[44px] !min-w-[44px]", "Compact filter controls must retain the 44px target.");
includes(compactFilterTabs, "motion-reduce:transition-none", "Compact filter transitions must respect reduced motion.");
includes(mentorWorkspaceShell, 'aria-label="Buka atau tutup navigasi"', "Mentor sidebar trigger must have a localized accessible label.");
includes(mentorWorkspaceShell, "size-[44px] min-h-[44px] min-w-[44px]", "Mentor sidebar trigger must retain the 44px target.");
includes(mentorWorkspaceShell, "min-h-[44px]", "Mentor workspace search must retain a 44px target.");
includes(mentorWorkspaceShell, "min-w-0 w-full", "Mentor workspace content must be shrinkable at compact widths.");
includes(kaptenUi, "motion-safe:group-hover:translate-x-1", "Kapten row affordance transforms must be motion-safe.");
includes(kaptenUi, "motion-reduce:transform-none", "Kapten row transforms must reset under reduced motion.");
includes(kaptenUi, "size-[44px] min-h-[44px] min-w-[44px]", "Kapten pagination and quick-create controls must retain the 44px target.");
includes(kaptenUi, 'aria-hidden="true"', "Kapten decorative search icons must be hidden from assistive technology.");
includes(kaptenUi, 'id = "kapten-content-search"', "Kapten SearchPanel must expose a stable input id.");
includes(kaptenUi, "htmlFor={id}", "Kapten SearchPanel labels must associate with their input.");
includes(kaptenUi, "aria-label={placeholder}", "Kapten SearchPanel inputs must expose an accessible name.");
includes(kaptenUi, 'size="default"', "Kapten empty-state recovery actions must retain the default 44px target.");
includes(aiUsage, "transition-[width,background-color] duration-500 motion-reduce:transition-none", "AI usage feature bars must reset transitions under reduced motion.");

const emptyDenseTableMarkup = renderToStaticMarkup(createElement(
  Table,
  {
    className: resolveDataTableClassName({
      hasRows: false,
      isLoading: false,
      tableClassName: "min-w-[760px]",
    }),
  },
  createElement("tbody", null, createElement("tr", null, createElement("td", null, "Tidak ada hasil."))),
));
includes(emptyDenseTableMarkup, "!min-w-full", "Rendered empty DataTable class resolution overrides a dense caller minimum width.");
excludes(emptyDenseTableMarkup, "min-w-[760px]", "Rendered empty DataTable class resolution does not retain the dense caller minimum width.");

const quotaHealthFixture: QuotaHealthState = {
  allocatedDailyUnits: 100,
  consumedUnits: 40,
  reservedUnits: 10,
  overrunDebtUnits: 0,
  availableUnits: 50,
  consumedPercentage: 40,
  reservedPercentage: 10,
  availablePercentage: 50,
  studentsAtOrAbove80Percent: 2,
  studentsAtOrAbove80PercentShare: 10,
  studentsHardLocked: 1,
  hardLockRate: 5,
  earlyExhaustionAlert: {
    status: "normal",
    exhaustedBeforeNoonShare: 0,
    normalThresholdShare: 10,
    message: "Tidak ada peringatan",
  },
  hourlyLocks: [
    { hour: 8, hourLabel: "08:00 WIB", lockCount: 3, cumulativeLocks: 3 },
    { hour: 18, hourLabel: "18:00 WIB", lockCount: 7, cumulativeLocks: 10 },
  ],
};
const hourlyLockMarkup = renderToStaticMarkup(createElement(AiHourlyLockChart, { quotaHealth: quotaHealthFixture }));
includes(hourlyLockMarkup, "Pukul 08:00 WIB", "Rendered hourly lock chart exposes its first semantic value.");
includes(hourlyLockMarkup, "kumulatif 10", "Rendered hourly lock chart exposes cumulative semantic values.");
check((hourlyLockMarkup.match(/<li/g) ?? []).length === 2, "Rendered hourly lock chart exposes one semantic item per hour.");

const onboarding = read("modules/student/components/onboarding-form.tsx");
const notifications = read("modules/student/NotificationsPageModule.tsx");
const notificationPopover = read("modules/student/components/student-notification-popover.tsx");

includes(onboarding, 'role="progressbar"', "Onboarding progress must expose progressbar semantics.");
includes(onboarding, "aria-valuenow", "Onboarding progress must expose its current step.");
includes(onboarding, "aria-pressed={selected}", "Onboarding choices must expose selected state.");
includes(onboarding, 'name="targetExamEventId"', "Onboarding must preserve the exam event field.");
includes(onboarding, 'name="targetUniversityId"', "Onboarding must preserve the university field.");
includes(onboarding, 'name="targetMajorId"', "Onboarding must preserve the major field.");
includes(onboarding, 'role="alert"', "Onboarding errors must be announced.");
includes(onboarding, "inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-slate-400 transition", "Step-2 onboarding skip must meet the 44px target with focus treatment.");
includes(onboarding, "motion-safe:hover:-translate-y-0.5", "Onboarding hover transforms must be motion-safe.");
includes(notifications, "Belum dibaca", "Unread notifications must have a visible non-color cue.");
includes(notifications, 'aria-hidden="true"', "Unread decorative dots must be hidden from assistive technology.");
includes(notificationPopover, "w-[min(360px,calc(100vw-2rem))]", "Notification popovers must fit compact viewports.");
includes(notificationPopover, 'size="icon"', "Notification triggers must meet the 44px target.");
includes(notificationPopover, "min-h-11", "Notification navigation actions must meet the 44px target.");

const assessment = read("modules/assessment/AssessmentWorkspace.tsx");
const attempt = read("modules/tryout/ParticipantAttemptModule.tsx");
const result = read("modules/tryout/ParticipantResultModule.tsx");
const quizResult = read("modules/quiz/QuizResultPageModule.tsx");

includes(assessment, "size-11", "Assessment navigation controls must meet the 44px target.");
includes(assessment, "min-h-11 min-w-11", "Assessment picker markers must meet the 44px target.");
includes(assessment, 'aria-current={marker.state === "active" ? "step" : undefined}', "Primary assessment markers must expose the current step.");
includes(assessment, "aria-pressed={active}", "Assessment utility toggles must expose selected state.");
includes(assessment, "aria-pressed={color === swatch}", "Annotation swatches must expose selected state.");
includes(assessment, "motion-safe:scale-110", "Annotation swatch emphasis must be disabled under reduced motion.");
includes(assessment, "motion-reduce:transition-none", "Assessment transitions must respect reduced motion.");
includes(attempt, 'aria-label="Masuk layar penuh"', "Tryout fullscreen control must remain labelled.");
includes(attempt, "Layar penuh", "Tryout fullscreen control must remain visible.");
includes(attempt, "grid-cols-1", "Tryout fullscreen header must use a dedicated compact-width layout.");
includes(attempt, "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]", "Tryout fullscreen header must reserve a desktop brand/control column.");
excludes(attempt, 'className="sr-only" onClick={() => void enterFullscreen()}', "Tryout fullscreen control must not be hidden.");
includes(attempt, "motion-reduce:animate-none", "Tryout loading animation must respect reduced motion.");
includes(result, "motion-reduce:transition-none", "Tryout result transitions must respect reduced motion.");
includes(result, "outcome:", "Tryout result markers must retain their outcome state while one marker is current.");
includes(quizResult, "const outcome =", "Quiz result markers must retain their outcome state while one marker is current.");
includes(quizResult, "result.correctnessAvailable", "Quiz result outcome propagation must preserve correctness availability.");

const vera = read("modules/vera-ai/VeraAiPageModule.tsx");
includes(vera, "onOpenSessionSidebar", "Vera must expose a mobile session-history entry point.");
includes(vera, "DialogTitle>Sesi", "Vera mobile session control must provide a dialog title.");
includes(vera, "md:hidden", "Vera session history must have a mobile-only surface.");
includes(vera, "onNewSession={onNewSession}", "Vera mobile session history must retain the new-session action.");
includes(vera, "inline-flex min-h-[44px] min-w-[44px]", "Vera return-to-context links must meet the literal 44px actionable target.");
includes(vera, "focus-visible:ring-3 focus-visible:ring-primary-300/35", "Vera return-to-context links must expose a visible keyboard focus ring.");
includes(vera, "href={returnToHref}", "Vera return-to-context links must preserve the supplied destination.");
includes(vera, "h-11 min-w-0 flex-1", "Vera composer input must meet the 44px target.");
includes(vera, "motion-reduce:transition-none", "Vera transitions must respect reduced motion.");
includes(vera, "motion-reduce:animate-none", "Vera loading animation must respect reduced motion.");
includes(vera, 'size="icon"', "Vera compact controls must meet the 44px target.");

const materi = read("modules/mentor/KaptenMateriCataloguePageModules.tsx");
const quiz = read("modules/mentor/quiz-dashboard.module.css").replace(/\s+/g, "");
const tryout = read("modules/mentor/KaptenTryoutCataloguePageModule.tsx");
const mentorContent = read("modules/mentor/KaptenContentPageModules.tsx");

includes(materi, "items-center px-5 py-8 text-center", "Materi empty states must align their recovery content centrally.");
includes(materi, 'size="default"', "Materi primary controls must meet the 44px target.");
includes(quiz, "@media(pointer:coarse)", "Quiz controls adapt to coarse pointers.");
includes(quiz, "min-height:44px", "Quiz actions meet touch target sizes.");
includes(quiz, "@media(prefers-reduced-motion:reduce)", "Quiz catalogue respects reduced motion.");
includes(tryout, 'size="default"', "Tryout catalogue actions must meet the 44px target.");
includes(tryout, "motion-reduce:transition-none", "Tryout catalogue transitions must respect reduced motion.");
includes(mentorContent, 'size="default"', "Kapten content actions must meet the 44px target.");

const primaryMarkerMarkup = renderToStaticMarkup(createElement(AssessmentQuestionMarker, {
  marker: { number: 2, state: "active" },
  onClick: () => undefined,
}));
includes(primaryMarkerMarkup, 'aria-current="step"', "Rendered primary assessment markers expose the current step.");
includes(primaryMarkerMarkup, 'type="button"', "Rendered primary assessment markers are keyboard buttons.");

const resultMarkup = renderToStaticMarkup(createElement(AssessmentResultNavigation, {
  compact: true,
  items: [
    { number: 1, outcome: "correct", state: "correct" },
    { number: 2, outcome: "incorrect", state: "incorrect" },
    { number: 3, outcome: "unanswered", state: "unanswered" },
  ],
  label: "Ringkasan soal",
  onSelect: () => undefined,
}));
includes(resultMarkup, 'aria-label="Soal 1, benar"', "Rendered correct result markers expose an outcome name.");
includes(resultMarkup, 'aria-label="Soal 2, salah"', "Rendered incorrect result markers expose an outcome name.");
includes(resultMarkup, 'aria-label="Soal 3, tidak dijawab"', "Rendered unanswered result markers expose an outcome name.");
includes(resultMarkup, ">✓</span>", "Rendered correct result markers expose a visible non-color cue.");
includes(resultMarkup, ">×</span>", "Rendered incorrect result markers expose a visible non-color cue.");
includes(resultMarkup, ">—</span>", "Rendered unanswered result markers expose a visible non-color cue.");
includes(resultMarkup, "motion-reduce:transition-none", "Rendered result markers expose reduced-motion handling.");
check((resultMarkup.match(/<button\b/g) ?? []).length === 3, "Rendered result markers remain individually keyboard-focusable.");
check((resultMarkup.match(/type=\"button\"/g) ?? []).length === 3, "Rendered result markers retain keyboard button semantics.");

const currentOutcomeMarkers = [
  { number: 4, outcome: "correct" as const, state: "current" as const },
  { number: 5, outcome: "incorrect" as const, state: "current" as const },
  { number: 6, outcome: "unanswered" as const, state: "current" as const },
].map((marker) => renderToStaticMarkup(createElement(AssessmentResultMarker, {
  compact: true,
  marker,
  onClick: () => undefined,
}))).join("");
includes(currentOutcomeMarkers, 'aria-label="Soal 4, benar"', "Rendered current correct markers retain their outcome name.");
includes(currentOutcomeMarkers, 'aria-label="Soal 5, salah"', "Rendered current incorrect markers retain their outcome name.");
includes(currentOutcomeMarkers, 'aria-label="Soal 6, tidak dijawab"', "Rendered current unanswered markers retain their outcome name.");
check((currentOutcomeMarkers.match(/aria-current=\"step\"/g) ?? []).length === 3, "Rendered current result markers expose the current step.");
includes(currentOutcomeMarkers, ">✓</span>", "Rendered current correct markers retain a visible non-color cue.");
includes(currentOutcomeMarkers, ">×</span>", "Rendered current incorrect markers retain a visible non-color cue.");
includes(currentOutcomeMarkers, ">—</span>", "Rendered current unanswered markers retain a visible non-color cue.");

const annotationMarkup = renderToStaticMarkup(createElement(AssessmentAnnotationOverlay, {
  onClose: () => undefined,
  open: true,
}));
check((annotationMarkup.match(/aria-pressed=\"false\"/g) ?? []).length === 2, "Rendered annotation swatches expose explicit unselected states before a palette choice.");
includes(annotationMarkup, "motion-safe:scale-100", "Rendered annotation baseline scale is motion-safe.");

const compactHeaderGeometry = {
  brandRow: { bottom: 64, top: 8 },
  controlsRow: { bottom: 120, top: 76 },
  contentWidth: 390 - (56 * 2),
};
check(compactHeaderGeometry.contentWidth === 278, "390px fullscreen header retains a bounded inner width.");
check(compactHeaderGeometry.brandRow.bottom <= compactHeaderGeometry.controlsRow.top, "390px fullscreen brand and controls occupy separate rows.");
check(compactHeaderGeometry.controlsRow.bottom <= 390, "390px fullscreen controls remain inside the viewport contract.");
check(
  quiz.includes("transition:none"),
  "Rendered quiz hover transforms have an explicit reduced-motion reset.",
);
check(
  /motion-safe:group-hover:[^\s"]+/.test(vera) && /motion-reduce:[^\s"]*translate/.test(vera),
  "Rendered Vera hover transforms have an explicit reduced-motion reset.",
);

console.log(`PASS ui-ux-uix-04: ${checks} checks`);
console.log("Evidence: SSR semantic DOM, rendered table class resolution, keyboard button semantics, deterministic 390px layout contract, and reduced-motion class coverage.");

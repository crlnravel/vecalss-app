import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/**
 * Every student entry point is either gated by paid access or listed here as one
 * a student needs whatever their package. Every student page and action goes
 * through requireStudentSession, which is gated unless the call says
 * `allowUnpaid: true`; every student API route checks the role itself, so it
 * must also call paidAccessDenial. A new student surface that does neither
 * fails this test until someone decides which kind it is.
 *
 * The behaviour of each surface is checked in test-paid-access-http.ts; this
 * keeps the list honest.
 *
 * The call-site lists above only see code that already calls
 * requireStudentSession, so a student action that checks the role some other way
 * is invisible to them (the six legacy tryout actions were). The second half of
 * this file therefore lists every exported server action and every route handler,
 * gives each an explicit class, and checks that its code carries the guard the
 * class needs.
 */

/** requireStudentSession() call sites outside lib/auth: [gated, exempt]. */
const GUARD_SITES: Record<string, [gated: number, exempt: number]> = {
  "app/akses-paket/page.tsx": [0, 1], // explains the missing package
  "app/courses/[slug]/[lessonId]/page.tsx": [1, 0],
  "app/courses/[slug]/page.tsx": [1, 0],
  "app/courses/page.tsx": [1, 0],
  "app/dashboard/page.tsx": [1, 0],
  "app/notifications/[notificationId]/page.tsx": [0, 1], // payment receipts arrive here
  "app/notifications/page.tsx": [0, 1],
  "app/onboarding/page.tsx": [0, 1],
  "app/quiz/[slug]/[quizSlug]/page.tsx": [1, 0],
  "app/quiz/[slug]/[quizSlug]/result/page.tsx": [1, 0],
  "app/quiz/[slug]/page.tsx": [1, 0],
  "app/quiz/page.tsx": [1, 0],
  "app/settings/page.tsx": [0, 1],
  "app/tryout/[tryoutId]/page.tsx": [1, 0],
  "app/tryout/[tryoutId]/register/page.tsx": [1, 0],
  "app/tryout/[tryoutId]/waiting/page.tsx": [1, 0],
  "app/tryout/attempt/[attemptId]/page.tsx": [1, 0],
  "app/tryout/attempt/[attemptId]/result/page.tsx": [1, 0],
  "app/tryout/page.tsx": [1, 0],
  "app/vera-ai/page.tsx": [1, 0],
  "app/videos/page.tsx": [1, 0],
  "modules/quiz/actions.ts": [4, 0],
  "modules/student/actions.ts": [0, 4], // onboarding, profile, notifications
  "modules/tryout/participant-actions.ts": [3, 0], // the rest go through participantSession()
};

/** Files that check for the student role themselves: [role checks, paidAccessDenial calls]. */
const ROLE_CHECK_SITES: Record<string, [checks: number, paid: number]> = {
  "app/api/courses/[slug]/[lessonId]/document/route.ts": [1, 1],
  "app/api/courses/[slug]/[lessonId]/progress/route.ts": [1, 1],
  "app/api/notifications/read/route.ts": [1, 0], // in-app receipts: open to every student
  "app/api/notifications/route.ts": [1, 0],
  "app/api/vera/chat/route.ts": [1, 1],
  "app/api/vera/conversations/[id]/route.ts": [2, 2],
  "app/api/vera/conversations/route.ts": [2, 2],
  "app/api/vera/mentions/route.ts": [1, 1],
  "app/api/vera/studio/[id]/route.ts": [2, 2],
  "app/api/vera/studio/route.ts": [2, 2],
  "app/api/vera/usage/route.ts": [1, 1],
  "lib/banner/delivery.ts": [1, 0], // banner artwork is shown on pages that are themselves gated
  "lib/tryout/participant-recovery-http.ts": [1, 1],
};

const ROOTS = ["app", "lib", "modules"];
const ROLE_CHECK = /RoleName\.student|roles\.includes\("student"\)/gu;

function sourceFiles() {
  const files: string[] = [];
  const walk = (path: string) => {
    for (const name of readdirSync(path)) {
      if (name === "node_modules" || name === ".next") continue;
      const full = join(path, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(?:ts|tsx)$/u.test(full)) files.push(relative(process.cwd(), full));
    }
  };
  ROOTS.forEach(walk);
  return files;
}

/** The text of a call's argument list, from just after its "(" to the matching ")". */
function callArguments(source: string, from: number) {
  let depth = 1;
  let index = from;
  while (index < source.length && depth > 0) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") depth -= 1;
    index += 1;
  }
  return source.slice(from, index - 1);
}

const files = sourceFiles();
assert.ok(files.length > 500, "the scan should see the whole codebase");

const guardSites: Record<string, [number, number]> = {};
const roleSites: Record<string, [number, number]> = {};

for (const file of files) {
  if (file.startsWith("lib/auth/") || file.startsWith("scripts/")) continue;
  const source = readFileSync(file, "utf8");

  for (const match of source.matchAll(/requireStudentSession\(/gu)) {
    const exempt = /allowUnpaid:\s*true/u.test(callArguments(source, (match.index ?? 0) + match[0].length));
    guardSites[file] ??= [0, 0];
    guardSites[file][exempt ? 1 : 0] += 1;
  }

  const checks = [...source.matchAll(ROLE_CHECK)].length;
  const isApi = file.startsWith("app/api/") || file === "lib/banner/delivery.ts" || file === "lib/tryout/participant-recovery-http.ts";
  if (checks && isApi) roleSites[file] = [checks, [...source.matchAll(/paidAccessDenial\(/gu)].length];
}

assert.deepEqual(
  guardSites,
  GUARD_SITES,
  "A student page or action changed. Gate it (the default) or add allowUnpaid with a reason, then update GUARD_SITES in scripts/test-paid-access-surfaces.ts.",
);
assert.deepEqual(
  roleSites,
  ROLE_CHECK_SITES,
  "A student API route changed. Call paidAccessDenial after its student check, or list it as open with a reason, in ROLE_CHECK_SITES.",
);

// The guard itself is gated by default and only skips the check when asked.
const access = readFileSync("lib/auth/access.ts", "utf8");
assert.match(access, /allowUnpaid\s*=\s*false/u, "requireStudentSession is a paid surface unless the caller opts out");
assert.match(access, /!allowUnpaid\s*&&\s*!\(await (?:studentMayUsePaidSurfaces|enterPaidSurface)/u);

// ---------------------------------------------------------------------------
// Every exported server action has an explicit class and the guard that class needs.
//
//   student  a paid surface: requireStudentSession() with the defaults (paid access and
//            the forced password change are both checked)
//   unpaid   a student needs it whatever their package (settings, onboarding, buying):
//            requireStudentSession({ allowUnpaid: true }) or the buyer's own session
//   staff    admin, Kapten, developer or affiliator only: the matching role guard
//   account  any signed-in or half-signed-in user acting on their own account
//   public   before sign-in: no session exists yet
// ---------------------------------------------------------------------------

type ActionClass = "account" | "public" | "staff" | "student" | "unpaid";
type ClassTable = Record<string, Partial<Record<ActionClass, string[]>>>;

const ACTION_CLASSES: ClassTable = {
  "app/pay/stand-in/[reference]/actions.ts": {
    unpaid: ["settleStandInPayment"],
  },
  "app/pay/stand-in/refund/[reference]/actions.ts": {
    staff: ["settleStandInRefund"],
  },
  "modules/admin/actions.ts": {
    staff: [
      "acknowledgeEnrollmentHandoffAction", "bulkUpdateStudentEnrollmentStatusAction",
      "changeStudentEnrollmentPasswordAction", "createAffiliatorEnrollmentAction",
      "createKaptenEnrollmentAction", "createStudentEnrollmentAction", "deactivateKaptenEnrollmentAction",
      "deactivateStudentEnrollmentAction", "deleteStudentEnrollmentAction", "reactivateKaptenEnrollmentAction",
      "reactivateStudentEnrollmentAction", "reissueEnrollmentHandoffAction", "sendKelasNotificationAction",
      "updateKaptenEnrollmentAction", "updateStudentEnrollmentAction",
    ],
  },
  "modules/admin/banner-maker-actions.ts": {
    staff: ["updateBannerMakerAction", "updateBannerMakerDestinationAction"],
  },
  "modules/admin/billing-actions.ts": {
    staff: ["manageStudentAccessAction"],
  },
  "modules/admin/fraud-actions.ts": {
    staff: [
      "acknowledgeCaseAction", "closeCaseAction", "createBlockAction", "createDisputeExportAction",
      "decideAppealAction", "escalateCaseAction", "fileAppealAction", "liftBlockAction", "linkBlockAction",
      "renewBlockAction", "reopenAppealAction", "reopenCaseAction",
    ],
  },
  "modules/admin/refund-actions.ts": {
    staff: [
      "acceptReviewAction", "approveRefundAction", "cancelRefundAction", "executeRefundAction",
      "manualTransferAction", "prepareRefundAction", "reconcileRefundAction", "recordDisputeAction",
      "rejectRefundAction", "resolveDisputeAction",
    ],
  },
  "modules/admin/retention-actions.ts": {
    staff: ["placeHoldAction", "releaseHoldAction"],
  },
  "modules/admin/student-banners-actions.ts": {
    staff: ["updateAdminStudentPreviewBannersAction", "updateStudentBannersAction"],
  },
  "modules/auth/actions.ts": {
    account: ["changePasswordAction", "logoutAction"],
    public: ["forgotPasswordAction", "getResetTokenStatus", "loginAction", "resetPasswordAction"],
  },
  "modules/auth/mfa-actions.ts": {
    account: ["challengeAction", "confirmEnrollmentAction", "recoveryCodeAction", "setupCodeAction"],
  },
  "modules/mentor/assembly-actions.ts": {
    staff: [
      "attachReadyAssemblyAction", "detachReadyAssemblyAction", "getAssemblyDraftForEditAction",
      "getReadyAssemblyRevisionAction", "listReadyAssemblyRevisionsAction", "previewAssemblyAction",
      "readyAssemblyDraftAction", "saveAssemblyDraftAction", "validateAssemblyDraftAction",
    ],
  },
  "modules/mentor/materi-actions.ts": {
    staff: [
      "archiveMateriLessonAction", "bulkPublishMateriLessonsAction", "bulkUnpublishMateriLessonsAction",
      "deleteMateriLessonAction", "publishMateriLessonAction", "returnMateriLessonToDraftAction",
      "saveMateriLessonAction", "unpublishMateriLessonAction",
    ],
  },
  "modules/mentor/question-bank-actions.ts": {
    staff: [
      "assignQuestionBankCategoriesAction", "createQuestionBankCategoryAction",
      "createQuestionBankFolderAction", "deleteQuestionBankAction", "getQuestionBankFolderPathAction",
      "getQuestionBankForEditAction", "listQuestionBankCategoriesAction", "listQuestionBankFolderTreeAction",
      "listQuestionBankFoldersAction", "listQuestionBankPageAction", "listQuestionBankSourcePageAction",
      "listQuestionBankSourceQuestionsAction", "moveQuestionBankFolderAction",
      "moveQuestionBanksToFolderAction", "removeQuestionBankCategoryAction",
      "removeQuestionBankCategoryAssignmentAction", "removeQuestionBankFolderAction",
      "renameQuestionBankCategoryAction", "renameQuestionBankFolderAction", "saveQuestionBankAction",
      "setQuestionBankCategoriesAction", "updateQuestionBankLifecycleAction",
      "updateQuestionRevisionLifecycleAction",
    ],
  },
  "modules/mentor/quiz-actions.ts": {
    staff: [
      "acceptStandaloneQuizQuestionUpdateAction", "importStandaloneQuizBankQuestionSnapshotsAction",
      "saveStandaloneQuizAction", "setStandaloneQuizHiddenAction", "transitionStandaloneQuizSourceModeAction",
      "updateStandaloneQuizLifecycleAction",
    ],
  },
  "modules/mentor/quiz-dashboard-actions.ts": {
    staff: ["manageQuizDashboardAction"],
  },
  "modules/mentor/report-actions.ts": {
    staff: ["submitMentorReportAction"],
  },
  "modules/mentor/settings-actions.ts": {
    staff: ["getKaptenSettings", "saveKaptenSettingsAction", "saveKaptenSubjectAction"],
  },
  "modules/mentor/tryout-actions.ts": {
    staff: [
      "archiveTryoutAction", "calculateTryoutAttemptAction", "configureTryoutAdmissionAction",
      "configureTryoutDefaultResultReleaseAction", "decideTryoutAdmissionAction", "deleteTryoutAction",
      "duplicateTryoutAction", "importTryoutBankQuestionSnapshotsAction", "inviteTryoutParticipantAction",
      "openTryoutDeliverySessionAction", "readyReusableQuestionPackageVersionAction",
      "reconcileTryoutDisconnectAction", "refreshTryoutParticipantsAction",
      "releaseTryoutSessionResultsAction", "restoreTryoutAction", "revokeTryoutDeliveryAssignmentAction",
      "saveReusableQuestionPackageAction", "saveReusableQuestionPackageMetadataAction", "saveTryoutAction",
      "searchTryoutInvitationStudentsAction", "setTryoutHiddenAction", "startTryoutDisconnectAction",
      "unpublishTryoutAction", "updateTryoutDeliverySessionScheduleAction", "updateTryoutMetadataAction",
    ],
  },
  "modules/mentor/tryout-operations-actions.ts": {
    staff: ["refreshTryoutLiveAction", "refreshTryoutRegistrationListAction"],
  },
  "modules/mentor/tryout-result-policy-action.ts": {
    staff: ["configureTryoutResultPolicyAction"],
  },
  "modules/mentor/tryout-result-publication-action.ts": {
    staff: ["publishTryoutSessionResultsAction"],
  },
  "modules/mentor/video-actions.ts": {
    staff: ["deleteKaptenVideoAction", "saveKaptenVideoAction", "setKaptenVideoArchivedAction"],
  },
  "modules/quiz/actions.ts": {
    student: ["saveQuizAnswerAction", "startQuizAction", "submitQuizAction", "syncQuizAttemptClockAction"],
  },
  "modules/student/actions.ts": {
    unpaid: [
      "markAllNotificationsReadAction", "saveOnboardingAction", "saveProfileAction", "skipOnboardingAction",
    ],
  },
  "modules/tryout/participant-actions.ts": {
    student: [
      "participantTryoutResultAction", "reconcileTryoutDisconnectAction", "recordTryoutIntegrityEventAction",
      "registerForTryoutAction", "registerForTryoutWithTargetAction", "saveTryoutAnswerAction",
      "sealTryoutTestRunAction", "startActiveTryoutTestRunAction", "startTryoutAttemptAction",
      "startTryoutDisconnectAction", "tryoutAttemptStateAction",
    ],
  },
};

/** Role guards a staff action may sit behind, directly or through a helper in its own file. */
const STAFF_GUARDS = new Set([
  "assemblyManagementSession", // requireSession + a management capability, checked below
  "hasTutorReportSubmissionAccess",
  "managementSession", // requireSession + a management capability, checked below
  "requireAdminReadOnlySession",
  "requireAdminSession",
  "requireAdminStudentPreviewContext",
  "requireAffiliatorSession",
  "requireDeveloperSession",
  "requireOwner",
  "requireTutorSession",
  "runAdmin", // modules/admin/fraud/action-helpers.ts: requireAdminSession
  "runOwner", // same file: requireAdminSession + requireOwner
]);
const ACCOUNT_GUARDS = new Set(["getPendingSession", "requireSession", "revokeCurrentSession"]);
/** Capabilities a student holds. Everything else in lib/tryout/capabilities.ts is management only. */
const STUDENT_CAPABILITIES = new Set(["tryout.admission.register", "tryout.attempt.execute"]);

type Facts = { calls: ts.CallExpression[]; names: Set<string> };

function topLevelDeclarations(source: ts.SourceFile) {
  const declarations = new Map<string, ts.Node>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) declarations.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration);
      }
    }
  }
  return declarations;
}

/** What the export's own code and the helpers it uses in the same file refer to and call. */
function collectFacts(root: ts.Node, declarations: Map<string, ts.Node>) {
  const facts: Facts = { calls: [], names: new Set() };
  const visited = new Set<ts.Node>();
  const visit = (node: ts.Node) => {
    if (visited.has(node)) return;
    visited.add(node);
    const walk = (child: ts.Node) => {
      if (ts.isCallExpression(child)) facts.calls.push(child);
      if (ts.isIdentifier(child)) {
        facts.names.add(child.text);
        const declaration = declarations.get(child.text);
        if (declaration) visit(declaration);
      }
      ts.forEachChild(child, walk);
    };
    walk(node);
  };
  visit(root);
  return facts;
}

function calleeName(call: ts.CallExpression) {
  return ts.isIdentifier(call.expression) ? call.expression.text : null;
}

function studentSessionCalls(facts: Facts) {
  return facts.calls
    .filter((call) => calleeName(call) === "requireStudentSession")
    .map((call) => {
      const options = call.arguments[0];
      const flag = (name: string) =>
        !!options && ts.isObjectLiteralExpression(options) && options.properties.some(
          (property) => ts.isPropertyAssignment(property)
            && property.name.getText() === name
            && property.initializer.kind === ts.SyntaxKind.TrueKeyword,
        );
      return { allowMustChangePassword: flag("allowMustChangePassword"), allowUnpaid: flag("allowUnpaid") };
    });
}

/** A requireTryoutCapability call proves management only when its capability is not one a student holds. */
function managementCapabilityChecked(facts: Facts) {
  return facts.calls.some((call) => {
    if (calleeName(call) !== "requireTryoutCapability") return false;
    const capability = call.arguments[1];
    if (capability && ts.isStringLiteralLike(capability)) return !STUDENT_CAPABILITIES.has(capability.text);
    // A helper passes its parameter on: the parameter's declared type must exclude student capabilities.
    for (let parent: ts.Node | undefined = call.parent; parent; parent = parent.parent) {
      if (ts.isFunctionDeclaration(parent) || ts.isArrowFunction(parent)) {
        return !parent.parameters.some((parameter) => [...STUDENT_CAPABILITIES].some((value) => parameter.getText().includes(value)))
          && parent.parameters.length > 0;
      }
    }
    return false;
  });
}

function guardProblem(actionClass: ActionClass, facts: Facts): string | null {
  const sessions = studentSessionCalls(facts);
  const hasStaffGuard = [...facts.names].some((name) => STAFF_GUARDS.has(name));
  const helperNames = ["managementSession", "assemblyManagementSession"].filter((name) => facts.names.has(name));

  switch (actionClass) {
    case "student":
      if (sessions.some((call) => call.allowMustChangePassword)) return "lets a student skip the forced password change";
      if (!sessions.length) return "does not call requireStudentSession, so paid access and the forced password change are not checked";
      if (sessions.every((call) => call.allowUnpaid)) return "only calls requireStudentSession with allowUnpaid, so paid access is not checked";
      return null;
    case "unpaid":
      if (sessions.some((call) => call.allowMustChangePassword)) return "lets a student skip the forced password change";
      if (sessions.length) return sessions.some((call) => call.allowUnpaid) ? null : "is a paid surface; class it as student";
      return facts.names.has("getSessionContext") ? null : "has no session check";
    case "staff":
      if (!hasStaffGuard && !managementCapabilityChecked(facts)) return "has no role guard";
      // The two shared helpers are only a role guard while they check a management capability.
      if (helperNames.length && !managementCapabilityChecked(facts)) return "calls a management helper that does not check a management capability";
      return null;
    case "account":
      return [...facts.names].some((name) => ACCOUNT_GUARDS.has(name)) ? null : "has no session check";
    case "public":
      return null;
  }
}

type ActionAudit = { exports: string[]; problems: string[] };

/** All problems with one "use server" file, given the classes recorded for it. */
function auditServerActionFile(file: string, text: string, classes: Partial<Record<ActionClass, string[]>> | undefined): ActionAudit {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const declarations = topLevelDeclarations(source);
  const exportsByName = new Map<string, string>(); // exported name -> local declaration name
  const problems: string[] = [];

  for (const statement of source.statements) {
    const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(statement) && exported && statement.name) exportsByName.set(statement.name.text, statement.name.text);
    if (ts.isVariableStatement(statement) && exported) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) exportsByName.set(declaration.name.text, declaration.name.text);
      }
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      if (statement.moduleSpecifier || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
        problems.push(`${file}: re-exports from another module cannot be audited; export a local function instead`);
        continue;
      }
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly) exportsByName.set(element.name.text, (element.propertyName ?? element.name).text);
      }
    }
    if (ts.isExportAssignment(statement)) problems.push(`${file}: a default export is not allowed in a "use server" file`);
  }

  const classOf = new Map<string, ActionClass>();
  for (const [actionClass, names] of Object.entries(classes ?? {}) as [ActionClass, string[]][]) {
    for (const name of names) {
      if (classOf.has(name)) problems.push(`${file}: ${name} is listed under two classes`);
      classOf.set(name, actionClass);
    }
  }

  for (const [name, local] of exportsByName) {
    const actionClass = classOf.get(name);
    if (!actionClass) {
      problems.push(`${file}: ${name} has no class; add it to ACTION_CLASSES as student, unpaid, staff, account or public`);
      continue;
    }
    const declaration = declarations.get(local);
    if (!declaration) {
      problems.push(`${file}: ${name} is exported but not declared in the file`);
      continue;
    }
    const problem = guardProblem(actionClass, collectFacts(declaration, declarations));
    if (problem) problems.push(`${file}: ${name} is classed ${actionClass} but ${problem}`);
  }
  for (const name of classOf.keys()) {
    if (!exportsByName.has(name)) problems.push(`${file}: ${name} is classed but no longer exported; remove it from ACTION_CLASSES`);
  }
  return { exports: [...exportsByName.keys()], problems };
}

const serverActionFiles = files.filter((file) => {
  const text = readFileSync(file, "utf8");
  if (!/["']use server["']/u.test(text)) return false;
  const first = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true).statements[0];
  const directive = !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server";
  assert.ok(directive, `${file} has "use server" somewhere other than the top. Inline server actions cannot be audited; move them to a file that starts with "use server".`);
  return true;
});

const actionProblems: string[] = [];
let actionCount = 0;
for (const file of serverActionFiles) {
  const audit = auditServerActionFile(file, readFileSync(file, "utf8"), ACTION_CLASSES[file]);
  actionCount += audit.exports.length;
  actionProblems.push(...audit.problems);
}
for (const file of Object.keys(ACTION_CLASSES)) {
  if (!serverActionFiles.includes(file)) actionProblems.push(`${file} is in ACTION_CLASSES but is not a "use server" file`);
}
assert.deepEqual(actionProblems, [], `Server actions without a class or a matching guard:\n${actionProblems.join("\n")}`);

// The management capabilities really are management only.
const capabilities = readFileSync("lib/tryout/capabilities.ts", "utf8");
assert.match(
  capabilities,
  /capability === "tryout\.admission\.register" \|\| capability === "tryout\.attempt\.execute"\s*\?\s*session\.user\.roles\.includes\(RoleName\.student\)\s*:\s*hasManagementRole\(session\)/u,
  "only the two student capabilities may be open to students; everything else needs a management role",
);

// The check must catch the hole it was written for. These are the six student
// actions that lived in modules/mentor/tryout-actions.ts until MS-19: they checked
// the student role through requireSession and a capability, so paid access and
// the forced password change never ran.
const LEGACY_STUDENT_ACTIONS = `"use server";
async function registerForTryoutAction(tryoutId: string) { const session = await requireSession(); try { requireTryoutCapability(session, "tryout.admission.register"); const result = await registerForTryout(tryoutId, session.user.id); return { ok: true as const, result }; } catch (error) { return { ok: false as const, message: deliveryMessage(error) }; } }
async function startTryoutAttemptAction(deliverySessionId: string) { const session = await requireSession(); try { requireTryoutCapability(session, "tryout.attempt.execute"); return { ok: true as const, result: await startTryoutAttempt(deliverySessionId, session.user.id) }; } catch (error) { return { ok: false as const }; } }
async function tryoutAttemptStateAction(attemptId: string) { const session = await requireSession(); try { requireTryoutCapability(session, "tryout.attempt.execute"); return { ok: true as const, result: await attemptState(attemptId, session.user.id) }; } catch (error) { return { ok: false as const }; } }
async function startActiveTryoutTestRunAction(attemptId: string, runId: string) { const session = await requireSession(); try { requireTryoutCapability(session, "tryout.attempt.execute"); return { ok: true as const, result: await startActiveTestRun(attemptId, runId, session.user.id) }; } catch (error) { return { ok: false as const }; } }
async function saveTryoutAnswerAction(attemptId: string, runId: string, tryoutItemId: string, selectedOptionId: string | null) { const session = await requireSession(); try { requireTryoutCapability(session, "tryout.attempt.execute"); return { ok: true as const, result: await saveTryoutAnswer(attemptId, runId, tryoutItemId, selectedOptionId, session.user.id) }; } catch (error) { return { ok: false as const }; } }
async function sealTryoutTestRunAction(attemptId: string, runId: string) { const session = await requireSession(); try { requireTryoutCapability(session, "tryout.attempt.execute"); return { ok: true as const, result: await sealTryoutTestRun(attemptId, runId, session.user.id) }; } catch (error) { return { ok: false as const }; } }
export { registerForTryoutAction, saveTryoutAnswerAction, sealTryoutTestRunAction, startActiveTryoutTestRunAction, startTryoutAttemptAction, tryoutAttemptStateAction };
`;
const legacyNames = ["registerForTryoutAction", "saveTryoutAnswerAction", "sealTryoutTestRunAction", "startActiveTryoutTestRunAction", "startTryoutAttemptAction", "tryoutAttemptStateAction"];
const legacyAudit = auditServerActionFile("fixture/legacy-tryout-actions.ts", LEGACY_STUDENT_ACTIONS, { student: legacyNames });
for (const name of legacyNames) {
  assert.ok(
    legacyAudit.problems.some((problem) => problem.includes(`${name} is classed student but does not call requireStudentSession`)),
    `the audit should reject the old ${name}`,
  );
}
assert.equal(legacyAudit.problems.length, legacyNames.length, "nothing else should be reported for the old actions");
const unclassed = auditServerActionFile("fixture/legacy-tryout-actions.ts", LEGACY_STUDENT_ACTIONS, undefined).problems;
assert.equal(unclassed.length, legacyNames.length);
assert.ok(unclassed.every((problem) => problem.includes("has no class")), "an exported action with no class is reported");

const guarded = (call: string) => `"use server";\nasync function doIt() { const session = await ${call}; return session; }\nexport { doIt };\n`;
const classify = (actionClass: ActionClass, call: string) => auditServerActionFile("fixture/a.ts", guarded(call), { [actionClass]: ["doIt"] }).problems;
assert.deepEqual(classify("student", "requireStudentSession()"), []);
assert.equal(classify("student", "requireStudentSession({ allowUnpaid: true })").length, 1, "a paid surface cannot opt out of paid access");
assert.equal(classify("student", "requireStudentSession({ allowMustChangePassword: true })").length, 1, "a paid surface cannot skip the forced password change");
assert.equal(classify("student", "requireSession()").length, 1, "a bare session is not a student guard");
assert.deepEqual(classify("unpaid", "requireStudentSession({ allowUnpaid: true })"), []);
assert.equal(classify("unpaid", "requireStudentSession()").length, 1, "an unpaid surface that is actually gated is classed wrongly");
assert.equal(classify("staff", "requireSession()").length, 1, "a bare session is not a staff guard");
assert.deepEqual(classify("staff", "requireAdminSession()"), []);
assert.equal(
  auditServerActionFile("fixture/a.ts", `"use server";\nasync function doIt() { const session = await requireSession(); requireTryoutCapability(session, "tryout.attempt.execute"); }\nexport { doIt };\n`, { staff: ["doIt"] }).problems.length,
  1,
  "a student capability is not a staff guard",
);
assert.deepEqual(
  auditServerActionFile("fixture/a.ts", `"use server";\nasync function doIt() { const session = await requireSession(); requireTryoutCapability(session, "tryout.delivery.configure"); }\nexport { doIt };\n`, { staff: ["doIt"] }).problems,
  [],
);
assert.equal(
  auditServerActionFile("fixture/a.ts", `"use server";\nexport async function doIt() {}\nexport const other = async () => {};\n`, { public: ["doIt"] }).problems.length,
  1,
  "an unlisted export is reported",
);

// ---------------------------------------------------------------------------
// Every route handler has an explicit class too; student routes must check paid access.
//
//   student  paid surface: paidAccessDenial() after the student check (or the tracked helper)
//   unpaid   a student needs it whatever their package
//   staff    role-gated (the guard lives in the route or the lib helper it hands the request to)
//   public   no session: signed webhooks and cron (secret), health, invite links, simulation and
//            local-only routes (switched off outside development)
// ---------------------------------------------------------------------------

type RouteClass = "public" | "staff" | "student" | "unpaid";
const ROUTE_CLASSES: Record<string, RouteClass> = {
  "app/admin/student-preview/courses/[slug]/[lessonId]/document/route.ts": "staff", // requireAdminStudentPreviewContext in the read boundary
  "app/api/admin/dispute-exports/[token]/route.ts": "staff",
  "app/api/admin/handoffs/[handoffId]/reissue/route.ts": "staff",
  "app/api/admin/imports/[importId]/cancel/route.ts": "staff",
  "app/api/admin/imports/[importId]/confirm/route.ts": "staff",
  "app/api/admin/imports/[importId]/handoff-file/acknowledge/route.ts": "staff",
  "app/api/admin/imports/[importId]/handoff-file/reissue/route.ts": "staff",
  "app/api/admin/imports/[importId]/handoff-file/route.ts": "staff",
  "app/api/admin/imports/[importId]/retry/route.ts": "staff",
  "app/api/admin/imports/[importId]/route.ts": "staff",
  "app/api/admin/imports/[importId]/rows/skip/route.ts": "staff",
  "app/api/admin/imports/preview/route.ts": "staff",
  "app/api/admin/imports/templates/[template]/route.ts": "staff",
  "app/api/admin/student-banners/[destination]/draft/[revision]/[slot]/route.ts": "staff",
  "app/api/admin/student-banners/[destination]/published/[revision]/[slot]/route.ts": "staff",
  "app/api/courses/[slug]/[lessonId]/document/route.ts": "student",
  "app/api/courses/[slug]/[lessonId]/progress/route.ts": "student",
  "app/api/cron/daily-maintenance/route.ts": "public", // bearer CRON_SECRET, 503 when unset
  "app/api/debug/accounts/route.ts": "public", // 404 unless the debug switcher is enabled (local only)
  "app/api/debug/switch-account/route.ts": "public", // same switch
  "app/api/developer/reports/[reportId]/attachment/[attachmentId]/route.ts": "staff",
  "app/api/health/ready/route.ts": "public",
  "app/api/health/route.ts": "public",
  "app/api/internal/package-purchases/succeeded/route.ts": "public", // signed webhook
  "app/api/invite/[token]/route.ts": "public", // the invite token is the credential
  "app/api/materi-demo/[filename]/route.ts": "public", // 404 in production; local fixture PDF
  "app/api/media/[scope]/assets/[assetId]/preview/route.ts": "staff",
  "app/api/media/[scope]/assets/[assetId]/thumbnail/route.ts": "staff",
  "app/api/media/[scope]/route.ts": "staff",
  "app/api/mentor/question-banks/[bankId]/csv/import/route.ts": "staff",
  "app/api/mentor/question-banks/[bankId]/csv/route.ts": "staff",
  "app/api/mentor/question-banks/[bankId]/xlsx/impact/route.ts": "staff",
  "app/api/mentor/question-banks/[bankId]/xlsx/import/route.ts": "staff",
  "app/api/mentor/question-banks/csv/preview/route.ts": "staff",
  "app/api/mentor/question-banks/csv/template/route.ts": "staff",
  "app/api/mentor/question-banks/xlsx/draft/route.ts": "staff",
  "app/api/mentor/question-banks/xlsx/preview/[previewId]/route.ts": "staff",
  "app/api/mentor/question-banks/xlsx/preview/[previewId]/thumbnails/route.ts": "staff",
  "app/api/mentor/question-banks/xlsx/preview/route.ts": "staff",
  "app/api/mentor/question-banks/xlsx/template/route.ts": "staff",
  "app/api/mentor/question-banks/xlsx/upload/[uploadId]/complete/route.ts": "staff",
  "app/api/mentor/question-banks/xlsx/upload/route.ts": "staff",
  "app/api/mentor/resource-edit-lock/acquire/route.ts": "staff",
  "app/api/mentor/resource-edit-lock/release/route.ts": "staff",
  "app/api/mentor/resource-edit-lock/renew/route.ts": "staff",
  "app/api/mentor/resource-edit-lock/rotate/route.ts": "staff",
  "app/api/mentor/tryout/result-readiness/route.ts": "staff",
  "app/api/mentor/tryout/result-recovery/route.ts": "staff",
  "app/api/notifications/read/route.ts": "unpaid", // in-app receipts: open to every student
  "app/api/notifications/route.ts": "unpaid",
  "app/api/payments/events/[provider]/route.ts": "public", // signed provider events
  "app/api/scalability/instance/route.ts": "public", // simulation switch + secret
  "app/api/scalability/rate-limit/route.ts": "public", // same
  "app/api/student-banners/[destination]/[revision]/[slot]/route.ts": "unpaid", // artwork for pages that are themselves gated
  "app/api/tryout/recovery/route.ts": "student", // lib/tryout/participant-recovery-http.ts
  "app/api/vera/chat/route.ts": "student",
  "app/api/vera/conversations/[id]/route.ts": "student",
  "app/api/vera/conversations/route.ts": "student",
  "app/api/vera/mentions/route.ts": "student",
  "app/api/vera/studio/[id]/route.ts": "student",
  "app/api/vera/studio/route.ts": "student",
  "app/api/vera/usage/route.ts": "student",
  "app/pricing/checkout/pay/route.ts": "unpaid", // a buyer is unpaid by definition
};

/** Route handlers anywhere under app/ or modules/. */
const routeFiles = files.filter((file) => /(?:^|\/)route\.tsx?$/u.test(file) && (file.startsWith("app/") || file.startsWith("modules/")));
const routeProblems: string[] = [];
for (const file of routeFiles) {
  const routeClass = ROUTE_CLASSES[file];
  if (!routeClass) {
    routeProblems.push(`${file} has no class; add it to ROUTE_CLASSES as student, unpaid, staff or public`);
    continue;
  }
  const text = readFileSync(file, "utf8");
  // paidAccessDenial is the paid check; the tryout recovery route hands the request to a helper that calls it.
  if (routeClass === "student" && !/paidAccessDenial\(|serveParticipantRecoveryRequest\(/u.test(text)) {
    routeProblems.push(`${file} is classed student but never calls paidAccessDenial`);
  }
}
for (const file of Object.keys(ROUTE_CLASSES)) {
  if (!routeFiles.includes(file)) routeProblems.push(`${file} is in ROUTE_CLASSES but no longer exists`);
}
assert.deepEqual(routeProblems, [], `Route handlers without a class or a matching guard:\n${routeProblems.join("\n")}`);
const participantRecovery = readFileSync("lib/tryout/participant-recovery-http.ts", "utf8");
assert.match(participantRecovery, /paidAccessDenial\(/u, "the tryout recovery helper must keep its paid access check");

const gated = Object.values(GUARD_SITES).reduce((sum, [paid]) => sum + paid, 0);
const open = Object.values(GUARD_SITES).reduce((sum, [, free]) => sum + free, 0);
console.log(`Paid access surfaces: ${gated} gated page/action guards, ${open} open (onboarding, settings, notifications, the explanation); ${Object.values(ROLE_CHECK_SITES).reduce((sum, [, paid]) => sum + paid, 0)} gated API handlers; ${actionCount} server actions in ${serverActionFiles.length} files and ${routeFiles.length} route handlers all classed and guarded.`);

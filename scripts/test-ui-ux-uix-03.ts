import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildAdminAiAliasTarget,
  buildMentorMateriCreateHref,
  buildMentorMateriDetailHref,
  buildMentorMateriSubjectHref,
  buildMentorQuizCreateHref,
  buildMentorQuizEditorHref,
  buildMentorTryoutAttemptHref,
  buildMentorTryoutOperationsHref,
  buildQuestionBankHref,
  buildStudentAttemptHref,
  buildStudentTryoutHref,
  buildStudentTryoutSubrouteHref,
  canonicalQueryEquals,
  getStudentEntryPath,
  parseMentorTryoutAttemptContext,
  parseMentorTryoutContext,
  parseQuestionBankQuery,
  parseStudentContext,
  parseStudentTryoutContext,
} from "@/lib/navigation/canonical-context";

let checks = 0;
function check(condition: boolean, message: string) {
  checks += 1;
  assert.ok(condition, message);
}

const materiSubjectQuery = new URLSearchParams({
  status: "published",
  sort: "title",
  direction: "asc",
  page: "1",
  q: "",
});
const materiSubjectHref = buildMentorMateriSubjectHref("penalaran-umum", {
  direction: "asc",
  page: 1,
  q: "",
  sort: "title",
  status: "published",
});
check(materiSubjectHref.includes("status=published"), "Materi status survives canonical build");
check(materiSubjectHref.includes("sort=title"), "Materi sort survives canonical build");
check(materiSubjectHref.includes("direction=asc"), "Materi direction survives canonical build");
check(materiSubjectHref.includes("page=1"), "Materi page survives canonical build");
check(materiSubjectHref.endsWith("q="), "Materi empty search survives canonical build");
check(canonicalQueryEquals(materiSubjectQuery, materiSubjectHref), "Materi query is already canonical");

const materiReturnTo = buildMentorMateriSubjectHref("penalaran-umum", {
  direction: "desc",
  page: 2,
  q: "limit",
  sort: "status",
  status: "draft",
});
check(
  buildMentorMateriCreateHref("penalaran-umum", materiReturnTo).includes(`returnTo=${encodeURIComponent(materiReturnTo)}`),
  "Materi create preserves the complete returnTo query",
);
check(
  buildMentorMateriDetailHref("demo:materi:penalaran-umum:unit-1", { preview: true, returnTo: materiReturnTo }).includes("preview=1"),
  "Materi preview flag survives detail transition",
);
check(
  buildMentorMateriDetailHref("demo:materi:penalaran-umum:unit-1", { preview: true, returnTo: materiReturnTo }).includes(`returnTo=${encodeURIComponent(materiReturnTo)}`),
  "Materi detail preserves the complete returnTo query",
);

const validBankQuery = new URLSearchParams({
  purpose: "tryout",
  subtest: "PU",
  category: "d6d03066-06f2-46d8-b72a-a3bc4da2dd0e",
  folder: "unfiled",
  status: "published",
  page: "1",
  q: "",
  sort: "name",
});
const parsedBank = parseQuestionBankQuery(validBankQuery);
check(parsedBank.issues.length === 0, "Valid Bank Soal context has no issues");
check(parsedBank.purpose === "tryout", "Bank Soal purpose is preserved");
check(parsedBank.subtest[0] === "PU", "Bank Soal subtest is preserved");
check(parsedBank.categories[0] === "d6d03066-06f2-46d8-b72a-a3bc4da2dd0e", "Bank Soal category is preserved");
check(parsedBank.folder === "unfiled", "Bank Soal folder is preserved");
check(canonicalQueryEquals(validBankQuery, buildQuestionBankHref(parsedBank)), "Bank Soal query is already canonical");

const invalidBank = parseQuestionBankQuery(new URLSearchParams({ purpose: "invalid" }));
check(invalidBank.purpose === null, "Invalid Bank Soal purpose remains unavailable");
check(invalidBank.issues.some((item) => item.field === "purpose"), "Invalid Bank Soal purpose is typed");
check(buildMentorQuizCreateHref("PU") === "/mentor/quiz/create?subject=PU", "Kuis create keeps subject in URL");
check(buildMentorQuizEditorHref("quiz-1", "LBI") === "/mentor/quiz/quiz-1/editor?subject=LBI", "Kuis result keeps subject in URL");

const tryoutId = "1aec64bc-89fb-405d-b5d6-a2d6f369f463";
const sessionId = "eff1337a-5b6a-4436-8054-49641d64bd58";
const attemptId = "c119a161-b2b6-4b5c-a068-fabe605a4ec8";
const participantId = "bcc842d7-f63d-4ca2-8886-2a1e58293756";
const tryoutContext = parseMentorTryoutContext(new URLSearchParams({
  workspace: "delivery",
  delivery: "sessions",
  session: sessionId,
  parent: tryoutId,
  returnTo: `/mentor/tryout/${tryoutId}?workspace=schedule&delivery=sessions&session=${sessionId}`,
}));
check(tryoutContext.issues.length === 0, "Valid Tryout context has no issues");
check(tryoutContext.workspace === "schedule", "Tryout delivery alias canonicalizes to Schedule");
check(tryoutContext.delivery === "sessions", "Tryout delivery is preserved");
check(tryoutContext.session === sessionId, "Tryout session is preserved");
check(tryoutContext.parent === tryoutId, "Tryout parent is preserved");
const operationsHref = buildMentorTryoutOperationsHref(tryoutId, tryoutContext);
check(operationsHref.includes("workspace=schedule"), "Tryout operations keeps workspace");
check(operationsHref.includes("delivery=sessions"), "Tryout operations keeps delivery");
check(operationsHref.includes(`session=${sessionId}`), "Tryout operations keeps session");
check(operationsHref.includes(`returnTo=${encodeURIComponent(tryoutContext.returnTo ?? "")}`), "Tryout operations keeps returnTo");
check(buildMentorTryoutOperationsHref(tryoutId, { delivery: "sessions", session: sessionId }).includes("workspace=schedule"), "Tryout operations supplies the schedule default when workspace is omitted");

const invalidTryout = parseMentorTryoutContext({ workspace: "legacy-area" });
check(invalidTryout.workspace === null, "Invalid Tryout workspace remains unavailable");
check(invalidTryout.issues.some((item) => item.field === "workspace"), "Invalid Tryout workspace is typed");
const duplicateTryout = parseMentorTryoutContext(new URLSearchParams("workspace=schedule&workspace=attempts&delivery=sessions&delivery=participants"));
check(duplicateTryout.issues.some((item) => item.field === "workspace"), "Duplicate Tryout workspace is rejected");
check(duplicateTryout.issues.some((item) => item.field === "delivery"), "Duplicate Tryout delivery is rejected");
const duplicateStudentSession = parseStudentTryoutContext({ session: [sessionId, sessionId] });
check(duplicateStudentSession.issues.some((item) => item.field === "session"), "Duplicate student Tryout session is rejected");
const attemptContext = parseMentorTryoutAttemptContext({
  workspace: "schedule",
  delivery: "sessions",
  session: sessionId,
  participant: participantId,
});
check(attemptContext.issues.length === 0, "Valid attempt context has no issues");
const attemptHref = buildMentorTryoutAttemptHref(tryoutId, attemptId, { ...attemptContext, participant: participantId });
check(attemptHref.includes(`participant=${participantId}`), "Attempts drilldown keeps participant");
check(attemptHref.includes(`session=${sessionId}`), "Attempts drilldown keeps session");

const studentReturnTo = `/tryout/${tryoutId}?session=${sessionId}`;
const studentContext = parseStudentContext({ tool: "review", artifact: "analysis", returnTo: studentReturnTo });
check(studentContext.issues.length === 0, "Valid student context has no issues");
check(studentContext.tool === "analysis", "Student artifact context is preserved");
check(studentContext.returnTo === studentReturnTo, "Student returnTo is preserved");
const invalidStudent = parseStudentContext({ tool: "not-a-tool" });
check(invalidStudent.issues.some((item) => item.field === "tool"), "Invalid student tool is typed");
check(buildStudentTryoutHref(tryoutId, { session: sessionId, returnTo: studentReturnTo }).includes(`session=${sessionId}`), "Student Tryout detail keeps session");
check(buildStudentTryoutSubrouteHref(tryoutId, "waiting", { session: sessionId, returnTo: studentReturnTo }).includes("/waiting?"), "Student waiting transition is canonical");
check(buildStudentAttemptHref(attemptId, { result: true, session: sessionId, returnTo: studentReturnTo }).includes("/result?"), "Student result transition is canonical");
check(getStudentEntryPath({ mustChangePassword: true }) === "/change-password", "Incomplete student enters change-password safely");
check(getStudentEntryPath({ mustChangePassword: false, onboardingStatus: "completed" }) === "/dashboard", "Returning student enters dashboard");

const [adminNav, materiModule, quizEditor, attemptsModule, veraModule, onboardingPage, createPage, enrollmentPanel, attemptRoute, resultRoute, attemptModule, resultModule, builderModule, waitingRoute, detailRoute, participantUtils, participantActions, deliveryRepository] = await Promise.all([
  readFile(new URL("../modules/admin/ai/components/AiControlPlaneNav.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenMateriCataloguePageModules.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenQuizEditorPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutAttemptsPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/vera-ai/VeraAiPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/create/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutEnrollmentPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/tryout/attempt/[attemptId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/tryout/attempt/[attemptId]/result/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantAttemptModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantResultModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutBuilderPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/tryout/[tryoutId]/waiting/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/tryout/[tryoutId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutWorkspaceUtils.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/participant-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/delivery-repository.ts", import.meta.url), "utf8"),
]);
check(adminNav.includes('href: "/admin/ai/providers"'), "Admin AI providers sibling is discoverable");
check(adminNav.includes('href: "/admin/ai/reliability"'), "Admin AI reliability sibling is discoverable");
check(adminNav.includes('href: "/admin/ai/policies"'), "Admin AI policies sibling is discoverable");
check(buildAdminAiAliasTarget("policies", { reason: "audit" }) === "/admin/ai/policies?reason=audit", "Admin AI alias preserves query");
check(materiModule.includes("buildCanonicalMateriCreateHref"), "Materi create uses canonical builder");
check(materiModule.includes("const returnTo = buildMateriSubjectHref"), "Materi context carries full returnTo");
check(quizEditor.includes("initialSubjectCode"), "Kuis editor reads subject context");
check(quizEditor.includes("subjectCode: form.subjectCode"), "Kuis editor propagates subject to request");
check(attemptsModule.includes("buildMentorTryoutAttemptHref"), "Attempts rows expose canonical detail links");
check(veraModule.includes("returnToHref"), "Vera workspace exposes return context");
check(onboardingPage.includes("redirectIfOnboardingAlreadyComplete"), "Onboarding guards returning students");
check(createPage.includes("initialDeliveryArea={parsedQuery.delivery ?? undefined}"), "Tryout create preserves delivery area");
check(enrollmentPanel.includes("buildStudentTryoutSubrouteHref(tryoutId, \"waiting\""), "Enrollment waiting transition is canonical");
check(!enrollmentPanel.includes("response.result.assignmentId"), "Enrollment does not treat assignment id as delivery session");
check(enrollmentPanel.includes("registerForTryoutWithTargetAction(tryoutId, {"), "Enrollment uses the participant registration action");
check(enrollmentPanel.includes("}, sessionId)"), "Enrollment forwards the requested session to registration");
check(enrollmentPanel.includes("const destinationSessionId = response.result.deliverySessionId"), "Enrollment uses the server delivery-session id");
check(detailRoute.includes("canEnterParticipantWaitingRoom(tryout, selectedSessionId)"), "Tryout detail gates eligibility for the selected session");
check(!detailRoute.includes("tryout.sessions[0]?.id"), "Tryout detail leaves no-query registration on the server default session");
check(waitingRoute.includes("canEnterParticipantWaitingRoom(tryout, parsedQuery.session)"), "Waiting route gates eligibility for the selected session");
check(participantUtils.includes("selectedSessionId?: string | null"), "Participant eligibility accepts an optional selected session");
check(participantUtils.includes("tryout.assignments.find"), "Participant eligibility resolves the selected assignment");
check(participantActions.includes("registerForTryout(tryoutId, session.user.id, target, selectedSessionId)"), "Participant action forwards the selected session");
check(deliveryRepository.includes("selectedSessionId?: string | null"), "Delivery registration accepts the selected session");
check(deliveryRepository.includes("findSelectedSession(tx, tryoutId, selectedSessionId, now)"), "Delivery registration validates the selected session server-side");
check(deliveryRepository.includes("deliverySessionId: lockedRegistrationSession!.id"), "Delivery registration returns the canonical assigned session id");
check(deliveryRepository.includes("deliverySessionId: existingAssignment?.deliverySessionId ?? null"), "Existing registration returns its canonical assigned session id");
check(deliveryRepository.includes("if (selectedSessionId !== undefined && selectedSessionId !== null)"), "Selected registration never falls back to another assignment");
check(attemptRoute.includes("parseStudentTryoutContext"), "Attempt route parses student context");
check(resultRoute.includes("parseStudentTryoutContext"), "Result route parses student context");
check(attemptModule.includes("buildStudentAttemptHref"), "Attempt result transition preserves context");
check(resultModule.includes("safeReturnHref"), "Result exits preserve context");
check(builderModule.includes('buildQuestionBankHref({ purpose: "tryout" })'), "Tryout builder empty source CTA preserves purpose");

console.log(`UIX-03 PASS: ${checks} checks`);

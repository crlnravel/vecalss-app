import assert from "node:assert/strict";

import {
  normalizeSelectedSessionId,
  normalizeTryoutWorkflowStep,
  projectTryoutWorkflow,
} from "../lib/tryout/workflow-projection";

const draftOverview = projectTryoutWorkflow({
  status: "draft",
  title: "Simulasi UTBK",
  requestedStep: "results",
});
assert.deepEqual(draftOverview.allowedSteps, ["overview", "configure_sections"]);
assert.equal(draftOverview.currentStep, "configure_sections", "a saved Overview unlocks Configure Sections but not Readiness");
assert.equal(draftOverview.mode, "draft");
assert.equal(draftOverview.operationsAvailable, false);
assert.equal(draftOverview.blockers.delivery[0]?.code, "not_published");
assert.equal(projectTryoutWorkflow({ status: "draft", title: "Draft", sessions: [{ id: "draft-session", status: "active" }] }).operationsAvailable, false, "drafts must not expose operational availability");

const draftReadyForReview = projectTryoutWorkflow({
  status: "draft",
  title: "Simulasi UTBK",
  sectionsReady: true,
  readinessPublishReady: false,
  requestedStep: "publish",
});
assert.deepEqual(draftReadyForReview.allowedSteps, ["overview", "configure_sections", "readiness_publish"]);
assert.equal(draftReadyForReview.currentStep, "readiness_publish");
assert.equal(draftReadyForReview.blockers.readiness_publish[0]?.code, "readiness_incomplete");

const activeSession = { id: "session-active", status: "active", assessmentReleaseId: "release-1", attempts: [] } as const;
const closedEmptySession = { id: "session-closed", status: "closed", attempts: [] } as const;
const published = projectTryoutWorkflow({
  basePath: "/mentor/tryout/tryout-1",
  status: "published",
  requestedSessionId: "stale-session",
  requestedStep: "results",
  sessions: [activeSession, closedEmptySession],
});
assert.deepEqual(published.allowedSteps, ["delivery", "operations", "results"]);
assert.deepEqual(published.liveEligibleSessionIds, ["session-active"]);
assert.deepEqual(published.resultEligibleSessionIds, ["session-closed"], "a closed zero-activity session unlocks Results");
assert.equal(published.operationsAvailable, true);
assert.equal(published.resultsAvailable, true);
assert.equal(published.selectedSessionId, "session-closed", "stale ?session falls back to an eligible result session");
assert.equal(published.selectedSessionRuntimeEligible, false);
assert.equal(published.normalizedQuery.selectedSessionWasNormalized, true);
assert.match(published.recommendedNextAction?.href ?? "", /workspace=results&session=session-closed/u);

const activeSelection = projectTryoutWorkflow({
  mode: "published",
  requestedSessionId: "session-active",
  sessions: [activeSession, closedEmptySession],
});
assert.equal(activeSelection.selectedSessionId, "session-active");
assert.equal(activeSelection.liveAvailable, true);

const attemptSession = projectTryoutWorkflow({
  status: "published",
  sessions: [{
    id: "session-attempt",
    status: "active",
    attempts: [{ attemptState: "in_progress", scoringState: "pending" }],
  }],
});
assert.equal(attemptSession.operationsAvailable, true, "attempt history keeps Operations available without a release id");
assert.equal(attemptSession.resultsAvailable, false, "an in-progress attempt does not unlock Results");

const terminalSession = projectTryoutWorkflow({
  status: "published",
  sessions: [{
    id: "session-terminal",
    status: "active",
    attempts: [{ attemptState: "submitted", scoringState: "pending" }],
  }],
});
assert.deepEqual(terminalSession.resultEligibleSessionIds, ["session-terminal"]);

assert.equal(normalizeTryoutWorkflowStep("questions"), "configure_sections");
assert.equal(normalizeTryoutWorkflowStep("operations"), "operations");
assert.equal(normalizeTryoutWorkflowStep("unknown"), null);
assert.equal(normalizeSelectedSessionId("stale", [activeSession, closedEmptySession], ["session-closed"]), "session-closed");

assert.equal("payload" in published, false, "workflow projection must not expose immutable release payloads");

console.log("Tryout workflow projection contracts passed.");

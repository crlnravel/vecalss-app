import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isVeraAutomaticContextEnabled,
  readVeraAutomaticContextProgress,
  readVeraContextAuthority,
  readVeraRequestEvidenceState,
  readVeraRequestSources,
} from "../modules/vera-ai/automatic-context";
import { createVeraConversationResolver } from "../modules/vera-ai/conversation-session";

const automaticAuthority = readVeraContextAuthority({
  contextMode: "automatic",
  automaticContext: {
    enabled: true,
    state: "cohort",
    policyVersion: "vera-auto-v1",
  },
});

assert.equal(automaticAuthority.contextMode, "automatic");
assert.equal(automaticAuthority.automaticContext.state, "cohort");
assert.equal(isVeraAutomaticContextEnabled(automaticAuthority), true);

for (const value of [
  null,
  {},
  { contextMode: "automatic" },
  {
    contextMode: "automatic",
    automaticContext: { enabled: "true", state: "cohort" },
  },
  {
    contextMode: "automatic",
    automaticContext: { enabled: true, state: "off" },
  },
  {
    contextMode: "automatic",
    automaticContext: { enabled: true, state: "unknown" },
  },
]) {
  const authority = readVeraContextAuthority(value);
  assert.equal(authority.contextMode, "legacy");
  assert.equal(isVeraAutomaticContextEnabled(authority), false);
}

const canonicalSources = readVeraRequestSources({
  requestSources: [
    {
      citationKey: "materi-01",
      kind: "materi",
      title: "Persamaan linear",
      sourceId: "must-not-render",
      releaseMetadata: { releasedAt: "2026-09-20T00:00:00.000Z" },
      limitations: ["Ringkasan singkat"],
    },
  ],
});
assert.deepEqual(canonicalSources, [
  {
    citationKey: "materi-01",
    kind: "materi",
    title: "Persamaan linear",
    releasedAt: "2026-09-20T00:00:00.000Z",
    limitations: ["Ringkasan singkat"],
  },
]);
assert.equal(JSON.stringify(canonicalSources).includes("sourceId"), false);

assert.equal(
  readVeraRequestSources({
    sources: [{ citationKey: "quiz-01", kind: "kuis", titleSnapshot: "Kuis rasio" }],
  })[0]?.title,
  "Kuis rasio",
);
assert.deepEqual(
  readVeraRequestSources({
    requestSources: [
      {
        sourceType: "material",
        citationKey: "material-01",
        title: "Ringkasan aljabar",
        citationLabel: "Materi aljabar",
        snapshotState: "released",
      },
    ],
  }),
  [
    {
      citationKey: "material-01",
      kind: "materi",
      title: "Ringkasan aljabar",
      releasedAt: null,
      limitations: [],
    },
  ],
);
assert.deepEqual(
  readVeraRequestSources({ sources: [{ sourceType: "material", sourceId: "legacy-01" }] }),
  [],
);

assert.equal(
  readVeraRequestEvidenceState({ evidenceState: "limited" }),
  "evidence_limited",
);
assert.equal(
  readVeraRequestEvidenceState({ contextState: "empty" }),
  "no_match",
);
assert.deepEqual(
  readVeraAutomaticContextProgress({ phase: "retrieving", progress: 115 }),
  { phase: "retrieving", progress: 100 },
);

const resolveConversationId = createVeraConversationResolver();
let conversationCreations = 0;
let resolveCreatedConversation: (conversationId: string | null) => void = () => undefined;
const createConversation = () => {
  conversationCreations += 1;
  return new Promise<string | null>((resolve) => {
    resolveCreatedConversation = resolve;
  });
};
const firstConversationRequest = resolveConversationId(null, createConversation);
const overlappingConversationRequest = resolveConversationId(null, createConversation);
await Promise.resolve();
assert.equal(conversationCreations, 1, "overlapping first sends share one session creation");
resolveCreatedConversation("new-conversation");
assert.deepEqual(
  await Promise.all([firstConversationRequest, overlappingConversationRequest]),
  ["new-conversation", "new-conversation"],
);
assert.equal(
  await resolveConversationId("existing-conversation", createConversation),
  "existing-conversation",
  "an existing active session is reused without creating another one",
);
assert.equal(conversationCreations, 1);

const uiSource = readFileSync(
  resolve(process.cwd(), "modules/vera-ai/VeraAiPageModule.tsx"),
  "utf8",
);
const globalStyles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
assert.match(uiSource, /function buildVeraRequestPayload/);
assert.match(uiSource, /\? \{ \.\.\.base, contextMode: "automatic"/);
assert.match(uiSource, /: \{ \.\.\.base, sources \}/);
assert.match(uiSource, /automaticProgressFromEvent/);
assert.match(uiSource, /Sumber yang dipakai/);
assert.match(uiSource, /loadConversation\(conversationId, automaticContext, finalStatus\)/);
assert.match(uiSource, /isCommittedVeraMessage/);
assert.match(uiSource, /!isVeraAutomaticContextEnabled\(automaticContext\)/);
assert.match(uiSource, /\/api\/vera-ai\/sources\?limit=50/);
assert.match(uiSource, /function StreamingAnswerText\(\{ content \}: \{ content: string \}\)/);
assert.match(uiSource, /<StreamingAnswerText content=\{body\} \/>/);
assert.match(uiSource, /vera-stream-caret/);
assert.match(globalStyles, /@keyframes vera-stream-word-arrive/);
assert.match(globalStyles, /@keyframes vera-stream-caret-pulse/);
assert.match(
  globalStyles,
  /\.vera-ai-motion \.vera-stream-word,[\s\S]*?animation: none;[\s\S]*?opacity: 1;/,
  "the streaming reveal must remain readable when reduced motion is requested",
);

const streamRequestStart = uiSource.indexOf("async function streamRequest(");
assert.notEqual(streamRequestStart, -1);
const resolveSessionBeforeSend = uiSource.indexOf(
  "conversationResolverRef.current(",
  streamRequestStart,
);
const requestLockAcquire = uiSource.indexOf(
  "requestInFlightRef.current = true",
  streamRequestStart,
);
const sendRequestDispatch = uiSource.indexOf(
  "/api/vera-ai/conversations/${conversationId}/requests",
  streamRequestStart,
);
const requestLockRelease = uiSource.indexOf(
  "requestInFlightRef.current = false",
  sendRequestDispatch,
);
assert.ok(
  requestLockAcquire >= 0 &&
    resolveSessionBeforeSend > requestLockAcquire &&
    sendRequestDispatch > resolveSessionBeforeSend &&
    requestLockRelease > sendRequestDispatch,
  "a first message should create its conversation before dispatching the request",
);
assert.doesNotMatch(
  uiSource.slice(streamRequestStart, sendRequestDispatch),
  /Buat sesi baru sebelum mengirim permintaan/,
  "an empty conversation list must not block the learner's first message",
);
assert.match(
  uiSource.slice(streamRequestStart, sendRequestDispatch),
  /conversationResolverRef\.current\(\s*activeSession\.id\s*\|\|\s*null,\s*createBackendConversation\s*,?\s*\)/,
  "the request path resolves the active ID or creates a session before sending",
);
assert.match(
  uiSource.slice(streamRequestStart, sendRequestDispatch),
  /requestInFlightRef\.current/,
  "rapid duplicate submits are ignored while the first request is starting",
);

console.log("Vera automatic-context UI checks passed.");

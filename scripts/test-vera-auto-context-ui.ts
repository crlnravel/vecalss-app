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

const uiSource = readFileSync(
  resolve(process.cwd(), "modules/vera-ai/VeraAiPageModule.tsx"),
  "utf8",
);
assert.match(uiSource, /function buildVeraRequestPayload/);
assert.match(uiSource, /\? \{ \.\.\.base, contextMode: "automatic"/);
assert.match(uiSource, /: \{ \.\.\.base, sources \}/);
assert.match(uiSource, /automaticProgressFromEvent/);
assert.match(uiSource, /Sumber yang dipakai/);
assert.match(uiSource, /loadConversation\(conversationId, automaticContext, finalStatus\)/);
assert.match(uiSource, /isCommittedVeraMessage/);
assert.match(uiSource, /!isVeraAutomaticContextEnabled\(automaticContext\)/);
assert.match(uiSource, /\/api\/vera-ai\/sources\?limit=50/);

console.log("Vera automatic-context UI checks passed.");

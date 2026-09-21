import "server-only";

import assert from "node:assert/strict";

import {
  assertMvpFeatureEnabled,
  canonicalJson,
  sha256Hex,
  VERA_CONTEXT_MODE_BUDGETS,
  VERA_MAX_CONTEXT_SOURCES,
  VeraContractError,
} from "@/lib/vera-ai/contracts";
import {
  prepareContextPack,
  selectRecentCompletedHistory,
} from "@/lib/vera-ai/context-pack";
import { VERA_APPLY_REGISTRY_KEYS } from "@/lib/vera-ai/artifact-commands";
import { VERA_DURABLE_CALLBACK_REGISTRY } from "@/lib/vera-ai/durable-results";
import { parseVeraRequestBody } from "@/lib/vera-ai/http";
import {
  VERA_STUDIO_TOOL_IDS,
  validateStudioOutput,
} from "@/lib/vera-ai/studio-contracts";
import type { VeraStudioIdentityAuthority } from "@/lib/vera-ai/studio-authority";

const uuid = "00000000-0000-4000-8000-000000000001";

function expectFeatureDisabled(action: () => unknown) {
  assert.throws(action, (error: unknown) => error instanceof VeraContractError
    && error.code === "feature_disabled"
    && error.status === 410);
}

function emptyAuthority(studentId = "student-1"): VeraStudioIdentityAuthority {
  const seed = {
    version: "vera-studio-authority-v1" as const,
    studentId,
    sourceIds: [],
    topicIds: [],
    moduleIds: [],
    questions: [],
    universityIds: [],
    majorIds: [],
  };
  return { ...seed, digest: sha256Hex(canonicalJson(seed)) };
}

async function main() {
  assert.equal(VERA_MAX_CONTEXT_SOURCES, 4);
  assert.deepEqual(VERA_CONTEXT_MODE_BUDGETS.chat_review, {
    maxSources: 4,
    maxBlockBytes: 6_000,
    maxFinalInputBytes: 5_488,
    inputTokenCap: 6_000,
    outputTokenCap: 800,
  });
  assert.deepEqual(VERA_CONTEXT_MODE_BUDGETS.analysis_route, {
    maxSources: 4,
    maxBlockBytes: 6_000,
    maxFinalInputBytes: 9_488,
    inputTokenCap: 10_000,
    outputTokenCap: 1_200,
  });
  assert.doesNotThrow(() => assertMvpFeatureEnabled("chat", "test"));
  expectFeatureDisabled(() => assertMvpFeatureEnabled("summary", "test"));
  expectFeatureDisabled(() => assertMvpFeatureEnabled("drill", "test"));
  expectFeatureDisabled(() => assertMvpFeatureEnabled("ptn", "test"));

  const history = selectRecentCompletedHistory([
    { role: "user", text: "old user", sequence: 1 },
    { role: "assistant", text: "old assistant", sequence: 2 },
    { role: "user", text: "second user", sequence: 3 },
    { role: "assistant", text: "second assistant", sequence: 4 },
    { role: "user", text: "third user", sequence: 5 },
    { role: "assistant", text: "third assistant", sequence: 6 },
    { role: "user", text: "new user", sequence: 7 },
    { role: "assistant", text: "new assistant", sequence: 8 },
  ]);
  assert.equal(history.length, 6);
  assert.equal(history[0]?.text, "second user");
  assert.equal(history.at(-1)?.role, "assistant");
  assert.ok(history.every((message) => Buffer.byteLength(message.text, "utf8") <= 1_500));

  const pack = await prepareContextPack({
    selection: [
      { sourceType: "material", sourceId: "m-1" },
      { sourceType: "material", sourceId: "m-2" },
      { sourceType: "practice", sourceId: "p-1" },
      { sourceType: "practice", sourceId: "p-2" },
    ],
    userText: "Buat ringkasan rute.",
    priorMessages: history,
    mode: "analysis_route",
    policyVersion: "policy-test",
    promptTemplateHash: "prompt-test",
    toolSchemaHash: "schema-test",
    systemPolicyHash: "system-test",
  }, {
    async resolve(selection) {
      return {
        ...selection,
        sourceType: selection.sourceType as "material" | "practice",
        title: selection.sourceId,
        citationLabel: selection.sourceId,
        citationKey: `${selection.sourceType === "material" ? "materi" : "src"}_${selection.sourceId}`,
        content: `Konten ${selection.sourceId}`,
      };
    },
  });
  const task = JSON.parse(Buffer.from(pack.canonicalTaskBytes).toString("utf8")) as Record<string, unknown>;
  assert.equal(pack.blocks.length, 4);
  assert.equal(pack.contextMode, "analysis_route");
  assert.equal(pack.inputCertification.certified, true);
  assert.equal(pack.inputCertification.certifiedTokenUpperBound, pack.byteCount + 512);
  assert.ok(Array.isArray(task.history));
  assert.equal("messageManifest" in task, false);
  assert.equal("digest" in (task.history as Array<Record<string, unknown>>)[0]!, false);

  const route = validateStudioOutput({
    toolId: "route",
    structured: {
      schema: "vera.route.v1",
      activities: [{ startDay: 1, endDay: 2, title: "Baca modul", rationale: "Mulai dari konsep inti.", sourceKeys: ["materi_001"] }],
      limitations: ["Data latihan terbatas."],
    },
    allowedCitationKeys: ["materi_001"],
    identityAuthority: emptyAuthority(),
  });
  assert.equal(route.payload.schema, "vera.route.v1");
  assert.equal((route.payload.activities as unknown[]).length, 1);
  assert.throws(() => validateStudioOutput({
    toolId: "route",
    structured: { schema: "vera.route.v1", activities: [{ startDay: 1, endDay: 8, title: "Tidak valid", rationale: "Alasan", sourceKeys: [] }], limitations: [] },
    allowedCitationKeys: [],
    identityAuthority: emptyAuthority(),
  }));
  assert.throws(() => validateStudioOutput({
    toolId: "route",
    structured: { schema: "vera.route.v1", activities: [], limitations: [], hidden: true },
    allowedCitationKeys: [],
    identityAuthority: emptyAuthority(),
  }));

  const limitedReview = validateStudioOutput({
    toolId: "review",
    structured: {
      schema: "vera.review.v2",
      variant: "evidence_limited",
      limitations: ["Jawaban lengkap tidak tersedia."],
      releasedEvidence: [{ citationKey: "materi_001", title: "Materi rujukan", kind: "materi", description: "Definisi dasar.", score: null, digest: null }],
      safeNextStep: "Tinjau definisi dasar lalu coba lagi.",
    },
    allowedCitationKeys: ["materi_001"],
    identityAuthority: emptyAuthority(),
  });
  assert.equal(limitedReview.payload.variant, "evidence_limited");
  assert.throws(() => validateStudioOutput({
    toolId: "review",
    structured: { schema: "vera.review.v2", variant: "evidence_limited", limitations: ["x"], releasedEvidence: [{ citationKey: "materi_001", title: "x", kind: "materi", description: "x", score: null, digest: null }], safeNextStep: "x", questionId: uuid },
    allowedCitationKeys: ["materi_001"],
    identityAuthority: emptyAuthority(),
  }));
  expectFeatureDisabled(() => validateStudioOutput({
    toolId: "drill",
    structured: {},
    allowedCitationKeys: [],
    identityAuthority: emptyAuthority(),
  }));

  const callbackToolIds = [...VERA_DURABLE_CALLBACK_REGISTRY.values()].map((entry) => entry.toolId).filter((value) => value !== null);
  assert.deepEqual(callbackToolIds.sort(), [...VERA_STUDIO_TOOL_IDS].sort());
  assert.equal(VERA_APPLY_REGISTRY_KEYS.length, 0);
  expectFeatureDisabled(() => parseVeraRequestBody({ clientRequestId: "req", kind: "studio", toolId: "drill", text: "x" }));

  console.log("vera-mvp-contracts: ok");
}

void main();

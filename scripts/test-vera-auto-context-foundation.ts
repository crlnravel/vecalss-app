import nodeAssert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  canonicalContextToolArguments,
  contextToolArgumentsDigest,
  createContextToolResult,
  parseContextToolResult,
  parseRetrieveReleasedLearningContextArgs,
  serializeContextToolResult,
  VERA_CONTEXT_TOOL_SCHEMA,
  type ContextToolSource,
} from "@/lib/vera-ai/context-tool-contracts";
import {
  executeContextRegistry,
  rankContextCandidates,
  type ContextRegistryCandidate,
  type ContextRegistrySource,
} from "@/lib/vera-ai/context-query-registry";
import {
  assertPackInvariant,
  prepareAutomaticContextPack,
  type AutomaticContextPackSource,
} from "@/lib/vera-ai/context-pack";
import {
  canonicalOperationPayload,
  VERA_AUTOMATIC_CONTEXT_BUDGETS,
  sha256Hex,
} from "@/lib/vera-ai/contracts";
import { InMemoryEnvelopeKeyRegistry, EnvelopeService } from "@/lib/vera-ai/envelope";
import {
  contextToolResultManifestDigest,
  encryptContextToolInvocation,
  verifyContextToolInvocationDigests,
} from "@/lib/vera-ai/context-tool-invocation";
import { assert, expectReject, runChecks } from "./vera-test-support";

const digest = (seed: string): string => sha256Hex(seed);
const releasedAt = new Date("2026-09-20T00:00:00.000Z");
const now = new Date("2026-09-22T00:00:00.000Z");

function source(input: Partial<ContextToolSource> & Pick<ContextToolSource, "citationKey" | "kind" | "title">): ContextToolSource {
  return {
    citationKey: input.citationKey,
    kind: input.kind,
    title: input.title,
    releaseMetadata: input.releaseMetadata ?? { releasedAt: releasedAt.toISOString(), versionDigest: digest(input.citationKey) },
    evidenceSegments: input.evidenceSegments ?? ["Bukti belajar yang dirilis."],
    limitations: input.limitations ?? [],
  };
}

const toolResult = createContextToolResult({
  sources: [
    source({ citationKey: "materi_m1", kind: "materi", title: "Persamaan Linear", evidenceSegments: ["Konsep dasar persamaan.", "Langkah penyelesaian."] }),
    source({ citationKey: "kuis_k1", kind: "kuis", title: "Kuis Persamaan", evidenceSegments: ["Skor yang dirilis.", "Ulasan yang dirilis."] }),
  ],
});

function candidate(
  kind: ContextRegistryCandidate["kind"],
  stableSourceId: string,
  overrides: Partial<ContextRegistryCandidate["authorization"]> = {},
): ContextRegistryCandidate {
  return {
    kind,
    stableSourceId,
    title: `${kind} Math ${stableSourceId}`,
    topic: "Matematika",
    releaseAt: releasedAt,
    sourceVersionDigest: digest(stableSourceId),
    evidenceSegments: [`Bukti ${stableSourceId}`],
    authorization: {
      ownerStudentId: kind === "materi" ? undefined : "student-1",
      published: true,
      released: true,
      scored: true,
      reviewAvailable: kind === "kuis" ? true : undefined,
      correctAnswersVisible: kind === "kuis" ? true : undefined,
      ready: kind === "tryout" ? true : undefined,
      releaseBindingValid: kind === "tryout" ? true : undefined,
      visibleToStudent: true,
      ...overrides,
    },
  };
}

const registrySource: ContextRegistrySource = {
  async listMateri() {
    return [
      candidate("materi", "m-allowed"),
      candidate("materi", "m-future", { published: true, released: true }),
      { ...candidate("materi", "m-unpublished"), authorization: { ...candidate("materi", "m-unpublished").authorization, published: false } },
    ].map((entry) => entry.stableSourceId === "m-future" ? { ...entry, releaseAt: new Date("2026-10-01T00:00:00.000Z") } : entry);
  },
  async listKuis() {
    return [
      candidate("kuis", "k-allowed"),
      candidate("kuis", "k-no-review", { reviewAvailable: false }),
      candidate("kuis", "k-hidden-answer", { correctAnswersVisible: false }),
      candidate("kuis", "k-other-student", { ownerStudentId: "student-2" }),
    ];
  },
  async listTryout() {
    return [
      candidate("tryout", "t-allowed"),
      candidate("tryout", "t-not-ready", { ready: false }),
      candidate("tryout", "t-invalid-binding", { releaseBindingValid: false }),
      candidate("tryout", "t-other-student", { ownerStudentId: "student-2" }),
    ];
  },
};

await runChecks("vera-auto-context-foundation", [
  {
    name: "strict tool schema and canonical argument contract",
    run: () => {
      assert(VERA_CONTEXT_TOOL_SCHEMA.function.parameters.additionalProperties === false, "tool schema is not strict");
      const parsed = parseRetrieveReleasedLearningContextArgs({ query: "  Persamaan\nlinear ", kinds: ["tryout", "materi"], maxSources: 4 });
      assert(parsed.query === "Persamaan linear", "query normalization changed unexpectedly");
      assert(parsed.kinds.join(",") === "materi,tryout", "kind order is not deterministic");
      assert(canonicalContextToolArguments({ query: "Persamaan linear", kinds: ["materi", "tryout"], maxSources: 4 }) === canonicalContextToolArguments(parsed), "canonical arguments are unstable");
      assert(/^[a-f0-9]{64}$/u.test(contextToolArgumentsDigest(parsed)), "argument digest is not SHA-256");
      return expectReject(() => parseRetrieveReleasedLearningContextArgs({ query: "x", kinds: ["materi", "materi"], maxSources: 1 }), "duplicate kinds accepted");
    },
  },
  {
    name: "strict result schema rejects unknown fields and digest tampering",
    run: () => {
      const parsed = parseContextToolResult(toolResult);
      assert(parsed.resultDigest === toolResult.resultDigest, "result digest changed during parse");
      assert(Buffer.from(serializeContextToolResult(parsed)).equals(Buffer.from(serializeContextToolResult(toolResult))), "result serialization is not canonical");
      assert(contextToolResultManifestDigest(parsed).length === 64, "result manifest digest missing");
      return Promise.all([
        expectReject(() => parseContextToolResult({ ...toolResult, extra: true }), "unknown result field accepted"),
        expectReject(() => parseContextToolResult({ ...toolResult, resultDigest: digest("tampered") }), "tampered result digest accepted"),
        expectReject(() => parseContextToolResult({ ...toolResult, sources: [{ ...toolResult.sources[0], title: "<script>alert(1)</script>" }] }), "unsafe source title accepted"),
      ]);
    },
  },
  {
    name: "closed registry authorization matrix for Materi, Kuis, and Tryout",
    run: async () => {
      const execution = await executeContextRegistry({
        studentId: "student-1",
        toolArguments: { query: "Math", kinds: ["tryout", "kuis", "materi"], maxSources: 4 },
        source: registrySource,
        now,
      });
      const ids = execution.ranked.map(({ candidate: item }) => item.stableSourceId);
      nodeAssert.deepEqual(ids.sort(), ["k-allowed", "m-allowed", "t-allowed"].sort(), "registry admitted a gated source");
      assert(execution.result.sources.every((item) => !ids.some((id) => item.citationKey.includes(id))), "registry citation exposed a database identifier");
      assert(execution.result.sources.every((item) => /^[a-z]+_[a-f0-9]{16}$/u.test(item.citationKey)), "registry citation key is not deterministic");
      assert(execution.result.sources.every((item) => item.evidenceSegments.every((segment) => !segment.includes("http"))), "registry did not sanitize evidence");
    },
  },
  {
    name: "unknown and URL-like queries return bounded no-match results and timeout fails closed",
    run: async () => {
      const noMatch = await executeContextRegistry({
        studentId: "student-1",
        toolArguments: { query: "https://external.example/secret", kinds: ["materi"], maxSources: 1 },
        source: registrySource,
        now,
      });
      assert(noMatch.result.sources.length === 0, "URL-like query retrieved a source");
      assert(noMatch.result.limitations.length > 0, "no-match limitation is missing");
      const slow: ContextRegistrySource = {
        listMateri: () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
        listKuis: async () => [],
        listTryout: async () => [],
      };
      return expectReject(() => executeContextRegistry({
        studentId: "student-1",
        toolArguments: { query: "unknown", kinds: ["materi"], maxSources: 1 },
        source: slow,
        now,
        timeoutMs: 1,
      }), "registry timeout did not fail closed");
    },
  },
  {
    name: "ranking is deterministic under ties and reordered registry rows",
    run: () => {
      const tied = [candidate("materi", "z"), candidate("materi", "a")];
      const first = rankContextCandidates(tied, "Math", now).map(({ candidate: item }) => item.stableSourceId);
      const second = rankContextCandidates([...tied].reverse(), "Math", now).map(({ candidate: item }) => item.stableSourceId);
      nodeAssert.deepEqual(first, ["a", "z"], "stable identifier tie-breaker is missing");
      nodeAssert.deepEqual(first, second, "row order changed deterministic ranking");
    },
  },
  {
    name: "automatic v2 pack uses exact byte caps, history bounds, and deterministic truncation",
    run: () => {
      const longSources: AutomaticContextPackSource[] = [
        source({ citationKey: "materi_long", kind: "materi", title: "Long A", evidenceSegments: ["A".repeat(1_600), "B".repeat(1_600), "C".repeat(1_600), "D".repeat(1_600)] }),
        source({ citationKey: "kuis_long", kind: "kuis", title: "Long B", evidenceSegments: ["E".repeat(1_600), "F".repeat(1_600), "G".repeat(1_600), "H".repeat(1_600)] }),
      ];
      const longResult = createContextToolResult({ sources: longSources });
      const args = { query: "long", kinds: ["materi", "kuis"] as const, maxSources: 2 };
      const first = prepareAutomaticContextPack({
        feature: "chat",
        userText: "Apa yang perlu saya ulangi?",
        priorMessages: Array.from({ length: 5 }, (_, index) => ({ role: index % 2 === 0 ? "user" as const : "assistant" as const, text: `history-${index}` })),
        policyVersion: "policy-v2",
        promptTemplateHash: digest("prompt"),
        toolSchemaHash: digest("schema"),
        systemPolicyHash: digest("system"),
        toolCallDigest: contextToolArgumentsDigest(args),
        toolResult: longResult,
        registryVersion: longResult.registryVersion,
        resolverVersion: "vera-context-resolver-v1",
        sources: longSources,
      });
      const second = prepareAutomaticContextPack({
        feature: "chat",
        userText: "Apa yang perlu saya ulangi?",
        priorMessages: Array.from({ length: 5 }, (_, index) => ({ role: index % 2 === 0 ? "user" as const : "assistant" as const, text: `history-${index}` })),
        policyVersion: "policy-v2",
        promptTemplateHash: digest("prompt"),
        toolSchemaHash: digest("schema"),
        systemPolicyHash: digest("system"),
        toolCallDigest: contextToolArgumentsDigest(args),
        toolResult: longResult,
        registryVersion: longResult.registryVersion,
        resolverVersion: "vera-context-resolver-v1",
        sources: longSources,
      });
      const budget = VERA_AUTOMATIC_CONTEXT_BUDGETS.chat_review;
      assert(first.byteCount <= budget.exactFinalSerializedInputByteCap, "automatic pack exceeded exact byte cap");
      assert(first.inputCertification.certified, "automatic pack is not certified");
      assert(first.inputCertification.serializerId === "vera-openrouter-chat-input-v2", "automatic pack did not use the v2 serializer");
      assert(first.history.length <= budget.completedHistoryPairs * 2, "history pair cap was not enforced");
      assert(first.truncation.truncatedOrdinals.length > 0, "large source set did not record truncation");
      assert(first.blocks.every((block) => Buffer.byteLength(block.content, "utf8") <= budget.maxSourceBytes), "per-source byte cap was not enforced");
      assert(Buffer.from(first.canonicalTaskBytes).equals(Buffer.from(second.canonicalTaskBytes)), "automatic pack is not deterministic");
      assert(first.packDigest === second.packDigest, "automatic pack digest is not deterministic");
      assertPackInvariant(first);
    },
  },
  {
    name: "encrypted invocation verifies digests and fail-closed purge markers",
    run: () => {
      const envelope = new EnvelopeService(new InMemoryEnvelopeKeyRegistry());
      const invocation = encryptContextToolInvocation({
        toolArguments: { query: "Math", kinds: ["materi"], maxSources: 1 },
        result: toolResult,
        envelope,
        objectId: "invocation-1",
      });
      verifyContextToolInvocationDigests({
        toolArguments: { query: "Math", kinds: ["materi"], maxSources: 1 },
        result: toolResult,
        argumentsDigest: invocation.argumentsDigest,
        resultDigest: invocation.resultDigest,
        resultManifestDigest: invocation.resultManifestDigest,
      });
      assert(envelope.decryptText(invocation.canonicalArgumentsCiphertext) === '{"kinds":["materi"],"maxSources":1,"query":"Math"}', "encrypted arguments did not round-trip");
      assert(invocation.resultManifestCiphertext, "encrypted result manifest missing");
      envelope.purge(invocation.canonicalArgumentsCiphertext);
      envelope.purge(invocation.resultManifestCiphertext);
      return Promise.all([
        expectReject(() => envelope.decrypt(invocation.canonicalArgumentsCiphertext), "purged invocation arguments remained readable"),
        expectReject(() => envelope.decrypt(invocation.resultManifestCiphertext!), "purged invocation result remained readable"),
        expectReject(() => verifyContextToolInvocationDigests({
          toolArguments: { query: "changed", kinds: ["materi"], maxSources: 1 },
          result: toolResult,
          argumentsDigest: invocation.argumentsDigest,
          resultDigest: invocation.resultDigest,
        }), "tampered invocation arguments passed digest verification"),
      ]);
    },
  },
  {
    name: "migration contract is additive and includes invocation purge invariants",
    run: async () => {
      const migration = await readFile(resolve(process.cwd(), "prisma/migrations/20260922120000_add_vera_auto_context_foundation/migration.sql"), "utf8");
      for (const required of [
        "CREATE TABLE \"ai_context_tool_invocations\"",
        "stage_purpose",
        "canonical_arguments_ciphertext",
        "result_manifest_ciphertext",
        "result_manifest_digest",
        "purge_state",
        "content_key_lineage_digest",
        "\"selected_source_count\" >= 0 AND \"selected_source_count\" <= 4",
        "FOREIGN KEY (\"request_id\")",
      ]) assert(migration.includes(required), `migration contract missing ${required}`);
      assert(!migration.includes("DROP TABLE \"ai_context_packs\""), "migration deleted legacy context packs");
      assert(!migration.includes("DROP COLUMN"), "migration deleted a legacy column");
    },
  },
  {
    name: "automatic idempotency payload excludes browser source identifiers",
    run: () => {
      const automaticA = canonicalOperationPayload("ai_request", { contextMode: "automatic", sourceIds: ["m1"], text: "same" });
      const automaticB = canonicalOperationPayload("ai_request", { contextMode: "automatic", sourceIds: ["m2"], text: "same" });
      const automaticV2 = canonicalOperationPayload("ai_request", { contextMode: "automatic_v2", sourceIds: ["m3"], text: "same" });
      const manual = canonicalOperationPayload("ai_request", { contextMode: "manual", sourceIds: ["m1"], text: "same" });
      assert(automaticA === automaticB, "automatic fingerprint includes browser source IDs");
      assert(automaticA !== automaticV2, "automatic behavior versions unexpectedly alias");
      assert(automaticA !== manual, "manual and automatic fingerprints unexpectedly alias");
    },
  },
]);

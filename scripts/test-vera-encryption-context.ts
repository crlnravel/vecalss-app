import { InMemoryEnvelopeKeyRegistry, EnvelopeError, EnvelopeService } from "@/lib/vera-ai/envelope";
import { assertPackInvariant, prepareContextPack } from "@/lib/vera-ai/context-pack";
import { normalizeSelection, selectionDigest } from "@/lib/vera-ai/contracts";
import { resolveCompletedKuis, resolveCompletedTryout, resolvePublishedMateri } from "@/lib/vera-ai/context-resolvers";
import { assert, expectReject, runChecks } from "./vera-test-support";

const registry = new InMemoryEnvelopeKeyRegistry();
const envelope = new EnvelopeService(registry);

const resolver = {
  calls: 0,
  async resolve(selection: { sourceType: "practice" | "material" | "document"; sourceId: string }) {
    this.calls += 1;
    if (selection.sourceType === "document") throw new Error("document disabled");
    return {
      sourceType: selection.sourceType,
      sourceId: selection.sourceId,
      title: `Source ${selection.sourceId}`,
      citationLabel: `Citation ${selection.sourceId}`,
      citationKey: `src_${selection.sourceId}`,
      content: selection.sourceId === "sensitive"
        ? "<b>Bounded</b> content sk_secret_123456789012"
        : `Bounded content for ${selection.sourceId}`,
    };
  },
};

await runChecks("vera-encryption-context", [
  {
    name: "envelope round-trip, tamper failure, unknown version, and lifecycle fail-closed",
    run: async () => {
      const payload = envelope.encrypt("rahasia", "test-object");
      assert(envelope.decryptText(payload) === "rahasia", "round-trip failed");
      const tampered = {
        ...payload,
        ciphertext: `${payload.ciphertext[0] === "A" ? "B" : "A"}${payload.ciphertext.slice(1)}`,
      };
      return expectReject(() => envelope.decrypt(tampered), "tampered ciphertext decrypted");
    },
  },
  {
    name: "envelope destruction is isolated to one sibling envelope",
    run: async () => {
      const first = envelope.encrypt("first-default-envelope");
      const second = envelope.encrypt("second-default-envelope");
      envelope.purge(first);
      await expectReject(() => envelope.decrypt(first), "purged envelope remained readable");
      assert(envelope.decryptText(second) === "second-default-envelope", "purging one default envelope destroyed its sibling");
    },
  },
  {
    name: "wrong wrapped key, unknown cipher version, and non-available lifecycle fail closed",
    run: async () => {
      const payload = envelope.encrypt("lifecycle", "lifecycle-object");
      const wrongKey = { ...payload, wrappedDek: `${payload.wrappedDek[0] === "A" ? "B" : "A"}${payload.wrappedDek.slice(1)}` };
      await expectReject(() => envelope.decrypt(wrongKey), "wrong wrapped key decrypted");
      await expectReject(() => envelope.decrypt({ ...payload, cipherVersion: "future" as "aes-256-gcm-v1" }), "unknown cipher version accepted");
      await expectReject(() => envelope.decrypt(payload, "purging"), "purging content reconstructed");
    },
  },
  {
    name: "key rotation preserves plaintext and destruction blocks backup ciphertext",
    run: async () => {
      const payload = envelope.encrypt("rotate-me", "rotate-object");
      const rotated = envelope.rotate(payload);
      assert(envelope.decryptText(rotated) === "rotate-me", "rotation changed plaintext");
      envelope.purge(rotated);
      await expectReject(() => envelope.decrypt(rotated), "destroyed key still decrypted");
      return expectReject(() => envelope.decrypt(payload), "backup ciphertext remained readable after object purge");
    },
  },
  {
    name: "selection normalization caps sources and rejects document phase",
    run: () => {
      const normalized = normalizeSelection([
        { sourceType: "practice", sourceId: "a" },
        { sourceType: "practice", sourceId: "a" },
      ]);
      assert(normalized.length === 1, "duplicates were not removed");
      return expectReject(() => normalizeSelection([{ sourceType: "document", sourceId: "doc-1" }]), "document source accepted");
    },
  },
  {
    name: "Kuis/Tryout/Materi projections enforce ownership and release boundaries",
    run: async () => {
      const kuis = {
        sourceId: "kuis-1",
        studentId: "student-1",
        title: "Kuis",
        reviewAvailable: true,
        releaseState: "released" as const,
        scoringState: "scored" as const,
        resultSummary: "summary",
        wrongCorrectPattern: "pattern",
        questionTopicIdentity: ["topic"],
        releasedExplanations: ["released explanation"],
      };
      assert(resolveCompletedKuis(kuis, "student-1").sourceType === "practice", "released Kuis projection missing");
      await expectReject(() => Promise.resolve(resolveCompletedKuis({ ...kuis, studentId: "student-2" }, "student-1")), "cross-student Kuis source accepted");
      await expectReject(() => Promise.resolve(resolveCompletedKuis({ ...kuis, reviewAvailable: false }, "student-1")), "review-blocked Kuis source accepted");
      await expectReject(() => Promise.resolve(resolveCompletedKuis({ ...kuis, answerKey: "hidden" }, "student-1")), "Kuis answer key entered context projection");
      await expectReject(() => Promise.resolve(resolveCompletedKuis({ ...kuis, explanation: "hidden" }, "student-1")), "Kuis hidden explanation entered context projection");

      const tryout = {
        sourceId: "tryout-1",
        studentId: "student-1",
        title: "Tryout",
        scoreVisible: true,
        releaseState: "released" as const,
        scoringState: "scored" as const,
        readiness: "ready" as const,
        subtestScores: ["score"],
        releasedBreakdown: ["breakdown"],
        timingSummary: "timing",
        wrongAnswerReferences: ["question-ref"],
      };
      assert(resolveCompletedTryout(tryout, "student-1").sourceType === "practice", "released Tryout projection missing");
      await expectReject(() => Promise.resolve(resolveCompletedTryout({ ...tryout, scoreVisible: false }, "student-1")), "score-hidden Tryout source accepted");
      await expectReject(() => Promise.resolve(resolveCompletedTryout({ ...tryout, ranking: ["other-student"] }, "student-1")), "ranking payload entered Tryout projection");
      await expectReject(() => Promise.resolve(resolveCompletedTryout({ ...tryout, explanation: "hidden" }, "student-1")), "Tryout hidden explanation entered context projection");

      const materi = { sourceId: "materi-1", title: "Materi", topic: "Topic", bodyExcerpt: "Published excerpt", published: true, visibleToStudent: true };
      assert(resolvePublishedMateri(materi).sourceType === "material", "published Materi projection missing");
      await expectReject(() => Promise.resolve(resolvePublishedMateri({ ...materi, published: false })), "unpublished Materi source accepted");
    },
  },
  {
    name: "reorder changes display selection only, not selection digest",
    run: () => {
      const first = selectionDigest([
        { sourceType: "practice", sourceId: "a" },
        { sourceType: "material", sourceId: "b" },
      ]);
      const second = selectionDigest([
        { sourceType: "material", sourceId: "b" },
        { sourceType: "practice", sourceId: "a" },
      ]);
      assert(first === second, "display reorder changed provider selection digest");
    },
  },
  {
    name: "deterministic server pack and invariants",
    run: async () => {
      const input = {
        selection: [
          { sourceType: "material" as const, sourceId: "b" },
          { sourceType: "practice" as const, sourceId: "a" },
        ],
        userText: "Pertanyaan\r\nbermakna  dengan spasi",
        policyVersion: "policy-v1",
        promptTemplateHash: "prompt",
        toolSchemaHash: "tool",
        systemPolicyHash: "system",
      };
      const first = await prepareContextPack(input, resolver);
      const second = await prepareContextPack(input, resolver);
      const reordered = await prepareContextPack({ ...input, selection: [...input.selection].reverse() }, resolver);
      assert(Buffer.from(first.canonicalTaskBytes).equals(Buffer.from(second.canonicalTaskBytes)), "pack bytes differ");
      assert(first.packDigest === second.packDigest && first.contextTaskDigest === second.contextTaskDigest, "pack digest differs");
      assert(Buffer.from(first.canonicalTaskBytes).equals(Buffer.from(reordered.canonicalTaskBytes)), "display reorder changed provider task bytes");
      assertPackInvariant(first);
      assert(resolver.calls === 6, "resolver did not recheck sources on each pack");
    },
  },
  {
    name: "bounded pack records redaction and UTF-8 truncation metadata",
    run: async () => {
      const pack = await prepareContextPack({
        selection: [{ sourceType: "practice", sourceId: "sensitive" }],
        userText: "safe",
        policyVersion: "policy-v1",
        promptTemplateHash: "prompt",
        toolSchemaHash: "tool",
        systemPolicyHash: "system",
        maxBlockBytes: 16,
      }, resolver);
      assert(pack.blocks[0]?.redacted && pack.blocks[0]?.truncated, "redaction/truncation evidence missing");
      assert(pack.truncation.truncatedOrdinals.includes(1), "truncation ordinal missing");
      assert(!pack.blocks[0]?.content.includes("sk_secret"), "secret-like content survived redaction");
    },
  },
  {
    name: "task byte cap rejects rather than emitting malformed canonical JSON",
    run: async () => expectReject(() => prepareContextPack({
      selection: [{ sourceType: "practice", sourceId: "safe" }],
      userText: "safe",
      policyVersion: "policy-v1",
      promptTemplateHash: "prompt",
      toolSchemaHash: "tool",
      systemPolicyHash: "system",
      maxTaskBytes: 1,
    }, resolver), "oversized task emitted malformed bytes"),
  },
  {
    name: "context preparation is side-effect free until admission",
    run: async () => {
      const before = resolver.calls;
      const pack = await prepareContextPack({
        selection: [{ sourceType: "practice", sourceId: "safe" }],
        userText: "safe",
        policyVersion: "policy-v1",
        promptTemplateHash: "prompt",
        toolSchemaHash: "tool",
        systemPolicyHash: "system",
      }, resolver);
      assert(pack.blocks.length === 1 && resolver.calls === before + 1, "resolver side effect accounting failed");
      assert(!("requestId" in pack), "context preparation claimed a durable request");
    },
  },
  {
    name: "resolver cannot substitute a different server source",
    run: async () => expectReject(() => prepareContextPack({
      selection: [{ sourceType: "practice", sourceId: "safe" }],
      userText: "safe",
      policyVersion: "policy-v1",
      promptTemplateHash: "prompt",
      toolSchemaHash: "tool",
      systemPolicyHash: "system",
    }, { resolve: async () => ({
      sourceType: "practice" as const,
      sourceId: "different",
      title: "Different",
      citationLabel: "Different",
      citationKey: "different",
      content: "wrong source",
    }) }), "resolver source substitution was accepted"),
  },
]);

void EnvelopeError;

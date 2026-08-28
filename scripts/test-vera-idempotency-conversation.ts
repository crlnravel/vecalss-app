import { ConversationService, InMemoryConversationStore, InMemorySourceCatalog } from "@/lib/vera-ai/conversation-service";
import { InMemoryIdempotencyStore, IdempotencyService } from "@/lib/vera-ai/idempotency";
import { canonicalOperationPayload, hmacFingerprint } from "@/lib/vera-ai/contracts";
import { assertEditedSend, assertRetryReference } from "@/lib/vera-ai/retry";
import { assert, expectReject, runChecks } from "./vera-test-support";

const idempotencyStore = new InMemoryIdempotencyStore();
const idempotency = new IdempotencyService(idempotencyStore, { hmacSecret: "test-secret" });
const conversationStore = new InMemoryConversationStore();
const sourceCatalog = new InMemorySourceCatalog([
  { sourceType: "practice", sourceId: "practice-1", title: "Latihan 1", publicationState: "released", ownerStudentId: "student-1" },
  { sourceType: "material", sourceId: "material-1", title: "Materi 1", publicationState: "published", contentDigest: "digest" },
]);
const conversations = new ConversationService(conversationStore, sourceCatalog, idempotency);

await runChecks("vera-idempotency-conversation", [
  {
    name: "canonical fingerprint normalizes NFC/line endings and source order without trimming meaningful spaces",
    run: () => {
      const first = canonicalOperationPayload("ai_request", { text: "e\u0301  x\r\n", sourceIds: ["b", "a", "a"] });
      const second = canonicalOperationPayload("ai_request", { text: "é  x\n", sourceIds: ["a", "b"] });
      assert(first === second, "canonical payload is not stable");
      assert(first.includes("  x"), "meaningful spaces were trimmed");
      assert(hmacFingerprint("ai_request", { text: "one" }, "secret") !== hmacFingerprint("conversation_create", { text: "one" }, "secret"), "operation namespace omitted");
    },
  },
  {
    name: "conversation creation replay returns same target after rename/context update",
    run: async () => {
      const first = await conversations.create({ studentId: "student-1", clientRequestId: "create-1", conversationType: "vera_chat", title: "Awal" });
      await conversations.rename({ studentId: "student-1", conversationId: first.conversation.id, title: "Baru", expectedVersion: 0 });
      await conversations.replaceContext({ studentId: "student-1", conversationId: first.conversation.id, expectedContextVersion: 0, selection: [{ sourceType: "practice", sourceId: "practice-1" }] });
      const replay = await conversations.create({ studentId: "student-1", clientRequestId: "create-1", conversationType: "vera_chat", title: "Awal" });
      assert(replay.replayed && replay.conversation.id === first.conversation.id, "replay created a second shell");
      assert(replay.conversation.version === 1 && replay.conversation.contextVersion === 1, "replay did not return authoritative versions");
    },
  },
  {
    name: "same key changed payload conflicts and does not cross operation targets",
    run: async () => {
      await expectReject(
        () => conversations.create({ studentId: "student-1", clientRequestId: "create-1", conversationType: "smart_drill", title: "different" }),
        "changed payload did not conflict",
      );
      const begin = await idempotency.begin({ studentId: "student-1", operation: "artifact_apply", clientRequestId: "create-1", payload: { artifactRevisionId: "x" } });
      assert(begin.kind === "new", "operation namespaces are not independent");
      await idempotency.reject(begin.record, { code: "target_revision_conflict", classification: "terminal" });
      const terminal = await idempotency.begin({ studentId: "student-1", operation: "artifact_apply", clientRequestId: "create-1", payload: { artifactRevisionId: "x" } });
      assert(terminal.kind === "replay" && terminal.record.rejectionClass === "terminal" && terminal.record.rejectionCode === "target_revision_conflict", "terminal rejection did not replay typed evidence");
    },
  },
  {
    name: "operation target mismatch is fail-closed and concurrent unique winner is re-read",
    run: async () => {
      const mismatchStore = new InMemoryIdempotencyStore();
      const mismatchIdempotency = new IdempotencyService(mismatchStore, { hmacSecret: "mismatch-secret" });
      const mismatchBegin = await mismatchIdempotency.begin({
        studentId: "student-mismatch",
        operation: "conversation_create",
        clientRequestId: "same-target",
        payload: { conversationType: "vera_chat", title: "same" },
      });
      assert(mismatchBegin.kind === "new", "mismatch fixture did not start new");
      await mismatchIdempotency.accept(mismatchBegin.record, { kind: "artifact_apply", id: "artifact-target" });
      const mismatchService = new ConversationService(
        new InMemoryConversationStore(),
        new InMemorySourceCatalog([]),
        mismatchIdempotency,
      );
      await expectReject(
        () => mismatchService.create({ studentId: "student-mismatch", clientRequestId: "same-target", conversationType: "vera_chat", title: "same" }),
        "operation target mismatch was replayed as a conversation",
      );

      const raceIdempotency = new IdempotencyService(new InMemoryIdempotencyStore(), { hmacSecret: "race-secret" });
      const raceResults = await Promise.all([
        raceIdempotency.begin({ studentId: "student-race", operation: "export_create", clientRequestId: "race-1", payload: { format: "json" } }),
        raceIdempotency.begin({ studentId: "student-race", operation: "export_create", clientRequestId: "race-1", payload: { format: "json" } }),
      ]);
      assert(raceResults.filter((result) => result.kind === "new").length === 1, "concurrent insert produced two winners");
      assert(raceResults.some((result) => result.kind === "retry_rejected" || result.kind === "replay"), "concurrent loser did not re-read winner");
    },
  },
  {
    name: "transient rejection, terminal retention, and expired-key precedence",
    run: async () => {
      const begin = await idempotency.begin({ studentId: "student-1", operation: "export_create", clientRequestId: "transient-1", payload: { format: "json" } });
      assert(begin.kind === "new", "new key missing");
      const rejected = await idempotency.reject(begin.record, { code: "redis_unavailable", classification: "transient" });
      const retry = await idempotency.begin({ studentId: "student-1", operation: "export_create", clientRequestId: "transient-1", payload: { format: "json" } });
      assert(retry.kind === "retry_rejected", "transient rejection was not retryable");
      await idempotency.accept(rejected, { kind: "export_job", id: "job-1" });
      const replay = await idempotency.begin({ studentId: "student-1", operation: "export_create", clientRequestId: "transient-1", payload: { format: "json" } });
      assert(replay.kind === "replay" && replay.record.resultId === "job-1", "accepted winner did not replay");
      const expired = await idempotency.expire(replay.record);
      const afterExpiry = await idempotency.begin({ studentId: "student-1", operation: "export_create", clientRequestId: "transient-1", payload: { format: "json" } });
      assert(afterExpiry.kind === "expired" && expired.state === "expired", "expired tombstone became reusable");
      const changedAfterExpiry = await idempotency.begin({ studentId: "student-1", operation: "export_create", clientRequestId: "transient-1", payload: { format: "csv" } });
      assert(changedAfterExpiry.kind === "expired" && changedAfterExpiry.record.tombstoneCode === "idempotency_key_expired", "changed fingerprint bypassed expired tombstone precedence");

      const retention = new IdempotencyService(new InMemoryIdempotencyStore(), {
        hmacSecret: "retention-secret",
        rejectedTtlMs: 10,
        terminalRejectedTtlMs: 100,
      });
      const terminalBegin = await retention.begin({
        studentId: "student-retention",
        operation: "artifact_apply",
        clientRequestId: "terminal-retention",
        payload: { artifactRevisionId: "artifact-1" },
        now: new Date(0),
      });
      assert(terminalBegin.kind === "new", "terminal retention fixture did not start new");
      const terminalRejected = await retention.reject(terminalBegin.record, { code: "target_revision_conflict", classification: "terminal" }, new Date(1));
      const retainedReplay = await retention.begin({
        studentId: "student-retention",
        operation: "artifact_apply",
        clientRequestId: "terminal-retention",
        payload: { artifactRevisionId: "artifact-1" },
        now: new Date(50),
      });
      assert(retainedReplay.kind === "replay" && terminalRejected.expiresAt.getTime() === 101, "terminal rejection used transient retention");
    },
  },
  {
    name: "CAS title/context conflicts and source catalog hides client uploads/documents",
    run: async () => {
      const created = await conversations.create({ studentId: "student-1", clientRequestId: "create-cas", conversationType: "vera_chat" });
      await expectReject(() => conversations.rename({ studentId: "student-1", conversationId: created.conversation.id, title: "stale", expectedVersion: 9 }), "stale title CAS passed");
      await expectReject(() => conversations.replaceContext({ studentId: "student-1", conversationId: created.conversation.id, expectedContextVersion: 9, selection: [] }), "stale context CAS passed");
      await expectReject(() => conversations.replaceContext({ studentId: "student-1", conversationId: created.conversation.id, expectedContextVersion: 0, selection: [{ sourceType: "practice", sourceId: "uploaded-client" }] }), "client upload ID accepted");
      const catalog = await conversations.sourceCatalogRead("student-1");
      assert(catalog.documentPhase === "disabled" && catalog.sources.length >= 0, "document phase is exposed");
    },
  },
  {
    name: "retry identity reuses one user message while edited Send creates a new one",
    run: async () => {
      const original = {
        id: "request-1",
        studentId: "student-1",
        conversationId: "conversation-1",
        featureKey: "vera.chat",
        status: "failed" as const,
        userMessageId: "message-1",
        assistantMessageId: null,
      };
      assertRetryReference(original, {
        ...original,
        id: "request-2",
        status: "pending",
      });
      await expectReject(() => Promise.resolve(assertRetryReference(original, {
        ...original,
        id: "request-cross-student",
        studentId: "student-2",
      })), "cross-student retry accepted");
      await expectReject(() => Promise.resolve(assertRetryReference({ ...original, status: "succeeded" }, {
        ...original,
        id: "request-success-retry",
      })), "successful request retry accepted");
      assertEditedSend(original, {
        ...original,
        id: "request-edited",
        status: "pending",
        userMessageId: "message-2",
      });
      await expectReject(() => Promise.resolve(assertEditedSend(original, {
        ...original,
        id: "request-edited-reused",
        status: "pending",
      })), "edited Send reused the original user message");
    },
  },
]);

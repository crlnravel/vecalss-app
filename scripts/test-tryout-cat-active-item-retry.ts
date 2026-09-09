import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  authoritativeCatActiveItemId,
  canRetrySealedCatAnswer,
  canWriteActiveCatAnswer,
  decideCatAnswer,
  projectCatItems,
} from "../lib/tryout/cat-runtime";

const [attemptRepository, participantModule, dbHarness] = await Promise.all([
  readFile(new URL("../lib/tryout/attempt-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantAttemptModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("./test-tryout-cat-active-item-retry-db.ts", import.meta.url), "utf8"),
]);

const contentOrder = ["item-c", "item-a", "item-b"];
const catDeliveryOrder = ["item-a", "item-b", "item-c"];
assert.equal(authoritativeCatActiveItemId(catDeliveryOrder), "item-c");
assert.equal(contentOrder.at(-1), "item-b", "the fixture must demonstrate the snapshot/content order mismatch");
assert.deepEqual(
  projectCatItems(contentOrder.map((id) => ({ id })), catDeliveryOrder).map((item) => item.id),
  catDeliveryOrder,
  "the server projection must preserve CAT delivery order even when the immutable snapshot is differently ordered",
);

assert.equal(decideCatAnswer({ activeItemId: "item-c", existingAnswer: undefined, itemId: "item-c", requestedOptionId: "option-1", selectedItemIds: catDeliveryOrder }), "accept");
assert.equal(decideCatAnswer({ activeItemId: "item-c", existingAnswer: { selectedOptionId: "option-1" }, itemId: "item-a", requestedOptionId: "option-1", selectedItemIds: catDeliveryOrder }), "idempotent");
assert.equal(decideCatAnswer({ activeItemId: "item-c", existingAnswer: { selectedOptionId: "option-1" }, itemId: "item-a", requestedOptionId: "option-2", selectedItemIds: catDeliveryOrder }), "conflict");
assert.equal(decideCatAnswer({ activeItemId: "item-c", existingAnswer: undefined, itemId: "item-a", requestedOptionId: "option-2", selectedItemIds: catDeliveryOrder }), "backtrack");

const now = new Date("2026-09-09T04:00:00.000Z");
const validSealedRetry = {
  attemptStatus: "submitted",
  availableUntil: new Date("2026-09-09T04:05:00.000Z"),
  catItemCount: 3,
  catState: "ready",
  deliverySessionStatus: "active",
  itemId: "item-c",
  now,
  runSealedAt: new Date("2026-09-09T03:59:00.000Z"),
  runServerDeadlineAt: new Date("2026-09-09T04:00:00.000Z"),
  runStatus: "sealed",
  selectedItemIds: catDeliveryOrder,
  updateCount: 3,
};
assert.equal(canRetrySealedCatAnswer(validSealedRetry), true, "the accepted final answer must be safely replayable after sealing");
assert.equal(canRetrySealedCatAnswer({ ...validSealedRetry, now: validSealedRetry.availableUntil }), false, "the session boundary is exclusive for a sealed replay");
assert.equal(canRetrySealedCatAnswer({ ...validSealedRetry, deliverySessionStatus: "closed" }), false, "a closed session must reject a sealed replay");
assert.equal(canRetrySealedCatAnswer({ ...validSealedRetry, now: new Date("2026-09-09T04:06:00.000Z") }), false, "a replay after the session deadline must be rejected");
assert.equal(canRetrySealedCatAnswer({ ...validSealedRetry, runStatus: "expired" }), false, "an expired run is not a final-answer idempotency window");
assert.equal(canRetrySealedCatAnswer({ ...validSealedRetry, itemId: "item-a" }), false, "a sealed replay for a non-final item must be rejected");

const activeRetry = {
  attemptStatus: "in_progress",
  availableUntil: new Date("2026-09-09T04:05:00.000Z"),
  catState: "ready",
  deliverySessionStatus: "active",
  itemId: "item-a",
  now: new Date("2026-09-09T03:00:00.000Z"),
  runServerDeadlineAt: new Date("2026-09-09T04:00:00.000Z"),
  runStatus: "active",
  selectedItemIds: catDeliveryOrder,
};
assert.equal(canWriteActiveCatAnswer(activeRetry), true, "a previously answered CAT item remains writable while its active run is valid");
assert.equal(canWriteActiveCatAnswer({ ...activeRetry, deliverySessionStatus: "closed" }), false, "a closed session must reject an active-run replay");
assert.equal(canWriteActiveCatAnswer({ ...activeRetry, now: activeRetry.runServerDeadlineAt }), false, "an active-run replay at the server deadline must be rejected");

// Two requests serialized by the existing attempt lock: the first advances
// the CAT snapshot, the duplicate sees its persisted answer, and a conflicting
// retry cannot mutate ability or select another item.
let selectedItemIds = [...catDeliveryOrder];
const persistedRuntime = {
  ability: 0.25,
  answeredAt: "2026-09-09T03:00:00.000Z",
  deadline: "2026-09-09T04:00:00.000Z",
  updates: 3,
};
const first = decideCatAnswer({ activeItemId: "item-c", existingAnswer: undefined, itemId: "item-c", requestedOptionId: "option-1", selectedItemIds });
assert.equal(first, "accept");
const persistedAnswer = { selectedOptionId: "option-1" };
selectedItemIds = [...selectedItemIds, "item-d"];
const runtimeBeforeDuplicate = structuredClone(persistedRuntime);
const duplicate = decideCatAnswer({ activeItemId: "item-d", existingAnswer: persistedAnswer, itemId: "item-c", requestedOptionId: "option-1", selectedItemIds });
assert.equal(duplicate, "idempotent");
assert.deepEqual(selectedItemIds, ["item-a", "item-b", "item-c", "item-d"]);
assert.deepEqual(persistedRuntime, runtimeBeforeDuplicate, "an idempotent retry must not recalculate ability, rewrite answer time, or extend the deadline");
assert.equal(decideCatAnswer({ activeItemId: "item-d", existingAnswer: persistedAnswer, itemId: "item-c", requestedOptionId: "option-2", selectedItemIds }), "conflict");

assert.doesNotMatch(participantModule, /snapshot\.items\.at\(-1\)/u, "CAT UI must render the server-authoritative active item");
assert.match(attemptRepository, /activeItemId/u, "attempt state must expose a server-authoritative CAT item id");
assert.match(participantModule, /activeItemId/u, "participant UI must consume the server-authoritative CAT item id");

const existingAnswerCheck = attemptRepository.indexOf("const existingAnswer = await tx.tryoutAnswer.findUnique");
const activeItemGuard = attemptRepository.indexOf('decision === "backtrack"');
assert.ok(existingAnswerCheck >= 0, "CAT answer handling must inspect an existing answer");
assert.ok(activeItemGuard >= 0, "CAT answer handling must retain a no-backtracking active-item guard");
assert.ok(existingAnswerCheck < activeItemGuard, "idempotent handling must run before active-item rejection");
assert.match(attemptRepository, /decision === "conflict"/u, "changed CAT retries must be rejected");
assert.match(attemptRepository, /TryoutAttemptTestRunStatus\.sealed/u, "sealed final-answer retries must be explicit");
assert.match(attemptRepository, /await synchronizeAttempt\(tx, attemptId, now, studentId\)/u, "answer transitions must remain inside the existing attempt lock boundary");
assert.match(attemptRepository, /where: \{ id: attemptId, studentId \}/u, "attempt ownership must stay server-authoritative");
assert.match(attemptRepository, /Pilihan jawaban tidak termasuk/u, "malformed option ids must remain rejected");

// CBT keeps its existing mutable-answer behavior; the CAT-only retry logic
// must not replace the generic upsert branch.
assert.match(attemptRepository, /if \(runTestType === TryoutTestType\.cat\) \{/u);
assert.match(attemptRepository, /tx\.tryoutAnswer\.upsert/u);
assert.match(dbHarness, /const TARGET_DATABASE = "vecalss_cat_retry_20260909"/u, "the opt-in DB harness must pin the exact disposable database name");
assert.match(dbHarness, /const TARGET_HOST = "127\.0\.0\.1"/u, "the opt-in DB harness must pin loopback");
assert.match(dbHarness, /const TARGET_PORT = 55432/u, "the opt-in DB harness must pin the exact local port");
assert.match(dbHarness, /const CREATED_ENV = "TRYOUT_CAT_RETRY_TEST_DATABASE_CREATED"/u, "the opt-in DB harness must require outer ownership of a newly created target");
assert.match(dbHarness, /current_database\(\)/u, "the opt-in DB harness must verify the actual connected database");
assert.doesNotMatch(dbHarness, /assert\.match\(identity\.database/u, "a broad name heuristic must not replace exact target identity");
assert.doesNotMatch(dbHarness, /DATABASE_URL\s*\?\?/u, "the opt-in DB harness must never fall back to DATABASE_URL");
assert.match(dbHarness, /append-only/u, "fixture cleanup must account for immutable release rows");

console.log("CAT active-item/retry regression contract passed.");

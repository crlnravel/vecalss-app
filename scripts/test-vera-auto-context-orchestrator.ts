import {
  assembleOpenRouterToolCallStream,
  MockProviderAdapter,
  serializeVeraAutomaticFinal,
  serializeVeraAutomaticSelector,
  type VeraFunctionToolCall,
} from "@/lib/vera-ai/provider";
import {
  createContextToolResult,
  parseRetrieveReleasedLearningContextArgs,
  type ContextToolResult,
} from "@/lib/vera-ai/context-tool-contracts";
import {
  InMemoryVeraAutomaticStateStore,
  VeraAutomaticContextStateMachine,
  runVeraAutomaticContext,
} from "@/lib/vera-ai/automatic-context-orchestrator";
import { finalAutomaticOutputQuotaUnits } from "@/lib/vera-ai/prisma-chat-orchestrator";
import { parseVeraRequestBody } from "@/lib/vera-ai/http";
import { selectVeraChatProvider, veraAutomaticContextEnabledForServer, veraAutomaticContextGateForStudent } from "@/lib/vera-ai/route-support";
import { canonicalJson, sha256Hex, VERA_AUTOMATIC_CONTEXT_BUDGETS } from "@/lib/vera-ai/contracts";
import { assert, expectReject, runChecks } from "./vera-test-support";

const textDecoder = new TextDecoder();
const usage = {
  inputTokens: 24,
  outputTokens: 12,
  quotaUnitsConsumed: 36,
  tokenUsageState: "known" as const,
};
const toolCall: VeraFunctionToolCall = {
  id: "call_context_1",
  name: "retrieve_released_learning_context",
  arguments: JSON.stringify({ query: "persamaan linear", kinds: ["materi"], maxSources: 1 }),
};
const toolResult: ContextToolResult = createContextToolResult({
  sources: [{
    citationKey: "materi_linear",
    kind: "materi",
    title: "Persamaan linear",
    releaseMetadata: { releasedAt: "2026-09-20T00:00:00.000Z", versionDigest: sha256Hex("release") },
    evidenceSegments: ["Bukti yang dirilis."],
    limitations: [],
  }],
});

function decode(value: Uint8Array): Record<string, unknown> {
  return JSON.parse(textDecoder.decode(value)) as Record<string, unknown>;
}

function selectorOutcome() {
  return { toolCall, usage };
}

function registryOutcome() {
  return { result: toolResult, sourceManifestDigest: sha256Hex("source-manifest") };
}

await runChecks("vera-auto-context-orchestrator", [
  {
    name: "selector/final serializers pin the tool boundary and disable final tools",
    run: async () => {
      const selector = decode(serializeVeraAutomaticSelector({ systemPolicy: "Use only frozen evidence.", userText: "Jelaskan persamaan." }));
      assert(selector.stage === "context_selection", "selector stage missing");
      assert(Array.isArray(selector.tools) && selector.tool_choice === "auto", "selector tool capability missing");
      const final = decode(serializeVeraAutomaticFinal({ systemPolicy: "Use only frozen evidence.", userText: "Jelaskan persamaan.", toolCall, toolResult }));
      assert(final.stage === "answer", "final stage missing");
      assert(!("tools" in final) && !("tool_choice" in final), "final turn re-enabled tools");
      assert(!textDecoder.decode(serializeVeraAutomaticFinal({ systemPolicy: "Use only frozen evidence.", userText: "Jelaskan persamaan.", toolCall, toolResult })).includes("sourceId"), "final payload leaked internal source identity");
      await expectReject(() => Promise.resolve(serializeVeraAutomaticFinal({
        systemPolicy: "Use only frozen evidence.",
        userText: "Jelaskan persamaan.",
        toolCall,
        toolResult,
        maxBytes: 32,
      })), "final serializer exceeded its exact byte cap");
    },
  },
  {
    name: "automatic serializer caps and provider stage attempts are exact",
    run: async () => {
      await expectReject(() => Promise.resolve(serializeVeraAutomaticSelector({ systemPolicy: "policy", userText: "question", maxSerializedBytes: 1 })), "selector byte cap was bypassed");
      await expectReject(() => Promise.resolve(serializeVeraAutomaticFinal({ systemPolicy: "policy", userText: "question", toolCall, toolResult, maxSerializedBytes: 1 })), "final byte cap was bypassed");
      const mock = new MockProviderAdapter();
      const selectorPrepared = await mock.prepare({ featureKey: "vera.chat", behaviorVersion: "1", taskBytes: new Uint8Array([1]), contextTaskDigest: "selector", hardOutputQuotaUnits: 256, stagePurpose: "context_selection", attemptNo: 1 });
      const finalPrepared = await mock.prepare({ featureKey: "vera.chat", behaviorVersion: "1", taskBytes: new Uint8Array([1]), contextTaskDigest: "final", hardOutputQuotaUnits: 800, stagePurpose: "answer", attemptNo: 2 });
      const selectorResult = await mock.run(selectorPrepared);
      const finalResult = await mock.run(finalPrepared);
      assert(selectorResult.attempts[0]?.attemptNo === 1 && finalResult.attempts[0]?.attemptNo === 2, "automatic stage attempt numbers collided");
      assert(mock.automaticContextCapable === false, "mock provider advertised automatic capability");
    },
  },
  {
    name: "concurrent runner ownership prevents duplicate selector, registry, and answer callbacks",
    run: async () => {
      const store = new InMemoryVeraAutomaticStateStore();
      const requestId = "77777777-7777-4777-8777-777777777777";
      let selectorCalls = 0;
      let registryCalls = 0;
      let answerCalls = 0;
      let selectorEntered!: () => void;
      let releaseSelector!: () => void;
      const entered = new Promise<void>((resolve) => { selectorEntered = resolve; });
      const hold = new Promise<void>((resolve) => { releaseSelector = resolve; });
      const run = () => runVeraAutomaticContext({
        requestId,
        store,
        selector: async () => { selectorCalls += 1; selectorEntered(); await hold; return selectorOutcome(); },
        registry: async () => { registryCalls += 1; return registryOutcome(); },
        answer: async () => { answerCalls += 1; return { text: "Jawaban [^materi_linear]", usage }; },
      });
      const first = run();
      await entered;
      const replay = await run();
      assert(replay.state.stages.context_selection.state === "dispatching" && selectorCalls === 1 && registryCalls === 0 && answerCalls === 0, "concurrent replay stole selector ownership");
      releaseSelector();
      const completed = await first;
      assert(completed.state.settlement === "known" && `${selectorCalls},${registryCalls},${answerCalls}` === "1,1,1", "concurrent runner duplicated a stage callback");
    },
  },
  {
    name: "fragmented tool calls assemble exactly one canonical function call",
    run: async () => {
      const assembled = assembleOpenRouterToolCallStream([
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: "call_context_1",
                type: "function",
                function: { name: "retrieve_released_learning_context", arguments: '{"query":"persamaan ' },
              }],
            },
          }],
        },
        {
          choices: [{
            delta: {
              tool_calls: [{ index: 0, function: { arguments: 'linear","kinds":["materi"],"maxSources":1}' } }],
            },
          }],
        },
      ]);
      assert(assembled.arguments === canonicalJson(parseRetrieveReleasedLearningContextArgs(JSON.parse(toolCall.arguments))), "fragmented arguments were not canonicalized");
      await expectReject(() => assembleOpenRouterToolCallStream([{
        choices: [{
          delta: {
            tool_calls: [
              { index: 0, id: "a", type: "function", function: { name: "retrieve_released_learning_context", arguments: toolCall.arguments } },
              { index: 1, id: "b", type: "function", function: { name: "retrieve_released_learning_context", arguments: toolCall.arguments } },
            ],
          },
        }],
      }]), "parallel tool calls were accepted");
    },
  },
  {
    name: "automatic HTTP requests reject supplied sources while legacy remains valid",
    run: async () => {
      await expectReject(() => parseVeraRequestBody({ clientRequestId: "auto-1", text: "context", contextMode: "automatic", sources: [] }), "automatic request accepted a supplied sources key");
      const legacy = parseVeraRequestBody({ clientRequestId: "legacy-1", text: "context", sources: [] });
      assert(legacy.contextMode === "legacy" && legacy.sources.length === 0, "legacy parser gate changed");
    },
  },
  {
    name: "state machine persists each dispatch once and settles both stages",
    run: async () => {
      const store = new InMemoryVeraAutomaticStateStore();
      const machine = new VeraAutomaticContextStateMachine(store, "11111111-1111-4111-8111-111111111111");
      assert(machine.plan().requestId === machine.plan().requestId, "plan is not idempotent");
      const first = machine.persistDispatchIntent("context_selection", "selector-intent");
      assert(!first.replayed && first.state.dispatchCount === 1, "selector intent was not persisted");
      assert(machine.persistDispatchIntent("context_selection", "selector-intent").replayed, "duplicate selector intent was not idempotent");
      machine.completeSelectorToolCall(toolCall, "known");
      machine.completeToolExecution(registryOutcome());
      machine.freezeContext(registryOutcome().sourceManifestDigest);
      machine.persistDispatchIntent("answer", "answer-intent");
      const completed = machine.completeAnswer(sha256Hex("answer"), "known");
      assert(completed.dispatchCount === 2 && completed.settlement === "known", "both stage usage did not settle as known");
      assert(completed.invocation.state === "completed" && completed.frozen, "frozen invocation state was not retained");
      assert(machine.completeAnswer(completed.finalResultDigest!, "known").version === completed.version, "answer replay was not idempotent");
      await expectReject(() => Promise.resolve(machine.persistDispatchIntent("answer", "answer-retry")), "answer retry was accepted");
    },
  },
  {
    name: "runner does not retry an ambiguous dispatch and reconnect resumes registry only",
    run: async () => {
      const ambiguousStore = new InMemoryVeraAutomaticStateStore();
      let selectorCalls = 0;
      const first = await runVeraAutomaticContext({
        requestId: "22222222-2222-4222-8222-222222222222",
        store: ambiguousStore,
        selector: async () => { selectorCalls += 1; throw Object.assign(new Error("network"), { ambiguousPostSend: true }); },
        registry: async () => registryOutcome(),
        answer: async () => ({ text: "unused", usage }),
      });
      assert(first.state.settlement === "unknown" && selectorCalls === 1, "ambiguous selector did not become unknown");
      const replay = await runVeraAutomaticContext({
        requestId: "22222222-2222-4222-8222-222222222222",
        store: ambiguousStore,
        selector: async () => { selectorCalls += 1; return selectorOutcome(); },
        registry: async () => registryOutcome(),
        answer: async () => ({ text: "unexpected", usage }),
      });
      assert(replay.state.settlement === "unknown" && selectorCalls === 1, "unknown selector stage was retried");

      const reconnectStore = new InMemoryVeraAutomaticStateStore();
      const reconnectMachine = new VeraAutomaticContextStateMachine(reconnectStore, "33333333-3333-4333-8333-333333333333");
      reconnectMachine.plan();
      reconnectMachine.persistDispatchIntent("context_selection", "selector-intent");
      reconnectMachine.completeSelectorToolCall(toolCall, "known");
      let reconnectSelectorCalls = 0;
      let reconnectRegistryCalls = 0;
      let reconnectAnswerCalls = 0;
      const resumed = await runVeraAutomaticContext({
        requestId: "33333333-3333-4333-8333-333333333333",
        store: reconnectStore,
        selector: async () => { reconnectSelectorCalls += 1; return selectorOutcome(); },
        replayToolArguments: JSON.parse(toolCall.arguments),
        registry: async () => { reconnectRegistryCalls += 1; return registryOutcome(); },
        answer: async () => { reconnectAnswerCalls += 1; return { text: "Jawaban [^materi_linear]", usage }; },
      });
      assert(resumed.state.settlement === "known" && reconnectSelectorCalls === 0 && reconnectRegistryCalls === 1 && reconnectAnswerCalls === 1, "reconnect retried selector or skipped final stage");
    },
  },
  {
    name: "selector text/no-call, final citations, duplicate intents, and output validation fail closed",
    run: async () => {
      const textOnly = await runVeraAutomaticContext({
        requestId: "44444444-4444-4444-8444-444444444444",
        selector: async () => ({ text: "I chose sources in prose.", usage }),
        registry: async () => registryOutcome(),
        answer: async () => ({ text: "unused", usage }),
      });
      assert(textOnly.state.stages.context_selection.state === "failed", "selector text/no-call was accepted");
      const invalidCitation = await runVeraAutomaticContext({
        requestId: "55555555-5555-4555-8555-555555555555",
        selector: async () => selectorOutcome(),
        registry: async () => registryOutcome(),
        answer: async () => ({ text: "Jawaban [^not_allowed]", usage }),
      });
      assert(invalidCitation.state.stages.answer.state === "failed", "unknown citation was accepted");
      const store = new InMemoryVeraAutomaticStateStore();
      const machine = new VeraAutomaticContextStateMachine(store, "66666666-6666-4666-8666-666666666666");
      machine.plan();
      machine.persistDispatchIntent("context_selection", "one");
      await expectReject(() => Promise.resolve(machine.persistDispatchIntent("context_selection", "two")), "parallel selector intent was accepted");
    },
  },
  {
    name: "final output cap uses policy cap independently from selector cap",
    run: () => {
      assert(VERA_AUTOMATIC_CONTEXT_BUDGETS.chat_review.selectorOutputTokenCap === 256, "selector cap drifted");
      assert(finalAutomaticOutputQuotaUnits(800, "chat_review") === 800, "chat final policy cap was truncated");
      assert(finalAutomaticOutputQuotaUnits(2_000, "analysis_route") === 1_200, "analysis final ceiling drifted");
    },
  },
  {
    name: "development and free/mock routes cannot enable automatic paid routing",
    run: () => {
      const development: NodeJS.ProcessEnv = { NODE_ENV: "development", VERA_LIVE_PROVIDER_ENABLED: "true", VERA_AUTOMATIC_CONTEXT_ENABLED: "true", VERA_MOCK_PROVIDER_ENABLED: "true" };
      const provider = selectVeraChatProvider(development);
      assert(provider.constructor.name === "MockProviderAdapter", "development selected a paid provider");
      assert(provider.automaticContextCapable === false, "mock advertised automatic-context capability");
      assert(!veraAutomaticContextEnabledForServer(development), "development automatic gate opened");
      const productionMock: NodeJS.ProcessEnv = {
        NODE_ENV: "production",
        VERA_LIVE_PROVIDER_ENABLED: "false",
        VERA_MOCK_PROVIDER_ENABLED: "true",
        VERA_AUTOMATIC_CONTEXT_ENABLED: "true",
        VERA_AUTOMATIC_CONTEXT_STATE: "on",
        VERA_AUTOMATIC_CONTEXT_PROVIDER_CAPABILITY_READY: "true",
        VERA_AUTOMATIC_CONTEXT_CANARY_VERIFIED_AT: "2026-09-20T00:00:00.000Z",
        VERA_AUTOMATIC_CONTEXT_CANARY_EXPIRES_AT: "2026-10-20T00:00:00.000Z",
      };
      assert(!veraAutomaticContextGateForStudent("student-1", productionMock, new Date("2026-09-23T00:00:00.000Z")).enabled, "mock provider opened the automatic paid gate");
    },
  },
]);

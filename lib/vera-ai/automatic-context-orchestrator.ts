import "server-only";

import {
  parseContextToolResult,
  parseRetrieveReleasedLearningContextArgs,
  type ContextToolResult,
  type RetrieveReleasedLearningContextArgs,
} from "./context-tool-contracts";
import { canonicalJson, sha256Hex } from "./contracts";
import {
  type NormalizedVeraResult,
  validateVeraResult,
} from "./output-validator";
import type { VeraFunctionToolCall } from "./provider";

export const VERA_AUTOMATIC_STAGE_PURPOSES = ["context_selection", "answer"] as const;
export type VeraAutomaticStagePurpose = (typeof VERA_AUTOMATIC_STAGE_PURPOSES)[number];
export type VeraAutomaticStageState = "planned" | "dispatching" | "completed" | "failed" | "unknown";
export type VeraAutomaticInvocationState = "planned" | "executing" | "completed" | "failed" | "unavailable";
export type VeraAutomaticUsageState = "pending" | "known" | "unknown";

export type VeraAutomaticStageRecord = {
  purpose: VeraAutomaticStagePurpose;
  state: VeraAutomaticStageState;
  dispatchCount: number;
  dispatchIntentDigest: string | null;
  errorCode: string | null;
};

export type VeraAutomaticDurableState = {
  requestId: string;
  version: number;
  dispatchCount: number;
  stageUsage: Record<VeraAutomaticStagePurpose, VeraAutomaticUsageState>;
  invocation: {
    state: VeraAutomaticInvocationState;
    argumentsDigest: string | null;
    resultDigest: string | null;
    sourceManifestDigest: string | null;
    selectedSourceCount: number;
    errorCode: string | null;
  };
  stages: Record<VeraAutomaticStagePurpose, VeraAutomaticStageRecord>;
  frozen: boolean;
  settlement: "pending" | "known" | "unknown";
  finalResultDigest: string | null;
};

export class VeraAutomaticStateError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "VeraAutomaticStateError";
    this.code = code;
  }
}

function initialState(requestId: string): VeraAutomaticDurableState {
  return {
    requestId,
    version: 0,
    dispatchCount: 0,
    stageUsage: { context_selection: "pending", answer: "pending" },
    invocation: {
      state: "planned",
      argumentsDigest: null,
      resultDigest: null,
      sourceManifestDigest: null,
      selectedSourceCount: 0,
      errorCode: null,
    },
    stages: {
      context_selection: { purpose: "context_selection", state: "planned", dispatchCount: 0, dispatchIntentDigest: null, errorCode: null },
      answer: { purpose: "answer", state: "planned", dispatchCount: 0, dispatchIntentDigest: null, errorCode: null },
    },
    frozen: false,
    settlement: "pending",
    finalResultDigest: null,
  };
}

export interface VeraAutomaticStateStore {
  create(requestId: string): VeraAutomaticDurableState;
  read(requestId: string): VeraAutomaticDurableState | null;
  write(requestId: string, expectedVersion: number, state: VeraAutomaticDurableState): VeraAutomaticDurableState;
}

/** A deterministic store used by unit tests and disposable development POCs.
 * The production adapter can implement the same CAS methods with Prisma. */
export class InMemoryVeraAutomaticStateStore implements VeraAutomaticStateStore {
  private readonly states = new Map<string, VeraAutomaticDurableState>();

  create(requestId: string): VeraAutomaticDurableState {
    if (this.states.has(requestId)) throw new VeraAutomaticStateError("automatic_request_exists");
    const state = initialState(requestId);
    this.states.set(requestId, state);
    return structuredClone(state);
  }

  read(requestId: string): VeraAutomaticDurableState | null {
    const state = this.states.get(requestId);
    return state ? structuredClone(state) : null;
  }

  write(requestId: string, expectedVersion: number, state: VeraAutomaticDurableState): VeraAutomaticDurableState {
    const current = this.states.get(requestId);
    if (!current) throw new VeraAutomaticStateError("automatic_request_missing");
    if (current.version !== expectedVersion) throw new VeraAutomaticStateError("automatic_state_cas_conflict");
    const next = structuredClone(state);
    next.version = expectedVersion + 1;
    this.states.set(requestId, next);
    return structuredClone(next);
  }
}

function cloneState(state: VeraAutomaticDurableState): VeraAutomaticDurableState {
  return structuredClone(state);
}

function stateFor(store: VeraAutomaticStateStore, requestId: string): VeraAutomaticDurableState {
  const state = store.read(requestId);
  if (!state) throw new VeraAutomaticStateError("automatic_request_missing");
  return state;
}

/** Durable state transitions. Every dispatch intent is written before its
 * caller may invoke transport, and an unknown/dispatching stage is never
 * returned to planned, so retries cannot duplicate provider or tool work. */
export class VeraAutomaticContextStateMachine {
  constructor(private readonly store: VeraAutomaticStateStore, readonly requestId: string) {}

  plan(): VeraAutomaticDurableState {
    const existing = this.store.read(this.requestId);
    return existing ?? this.store.create(this.requestId);
  }

  snapshot(): VeraAutomaticDurableState {
    return stateFor(this.store, this.requestId);
  }

  persistDispatchIntent(purpose: VeraAutomaticStagePurpose, intentDigest: string): { state: VeraAutomaticDurableState; replayed: boolean } {
    const current = stateFor(this.store, this.requestId);
    const stage = current.stages[purpose];
    if (stage.state === "dispatching") {
      if (stage.dispatchIntentDigest !== intentDigest) throw new VeraAutomaticStateError("automatic_dispatch_conflict");
      return { state: current, replayed: true };
    }
    if (stage.state !== "planned") throw new VeraAutomaticStateError("automatic_stage_retry_forbidden");
    if (current.dispatchCount >= 2) throw new VeraAutomaticStateError("automatic_dispatch_budget_exceeded");
    const next = cloneState(current);
    next.dispatchCount += 1;
    next.stages[purpose] = {
      ...stage,
      state: "dispatching",
      dispatchCount: 1,
      dispatchIntentDigest: intentDigest,
    };
    return { state: this.store.write(this.requestId, current.version, next), replayed: false };
  }

  completeSelectorToolCall(toolCall: VeraFunctionToolCall, usageState: VeraAutomaticUsageState = "unknown"): { state: VeraAutomaticDurableState; replayed: boolean } {
    const args = parseRetrieveReleasedLearningContextArgs(JSON.parse(toolCall.arguments) as unknown);
    const argumentsDigest = sha256Hex(canonicalJson(args));
    const current = stateFor(this.store, this.requestId);
    if (current.invocation.state === "executing" || current.invocation.state === "completed") {
      if (current.invocation.argumentsDigest !== argumentsDigest) throw new VeraAutomaticStateError("automatic_tool_call_conflict");
      return { state: current, replayed: true };
    }
    if (current.invocation.state !== "planned") throw new VeraAutomaticStateError("automatic_tool_execution_forbidden");
    if (current.stages.context_selection.state !== "dispatching") throw new VeraAutomaticStateError("automatic_selector_not_dispatching");
    const next = cloneState(current);
    next.invocation = { ...next.invocation, state: "executing", argumentsDigest };
    next.stageUsage.context_selection = usageState;
    return { state: this.store.write(this.requestId, current.version, next), replayed: false };
  }

  completeToolExecution(input: { result: ContextToolResult; sourceManifestDigest: string }): VeraAutomaticDurableState {
    const result = parseContextToolResult(input.result);
    const current = stateFor(this.store, this.requestId);
    if (current.invocation.state === "completed") {
      if (current.invocation.resultDigest !== result.resultDigest || current.invocation.sourceManifestDigest !== input.sourceManifestDigest) {
        throw new VeraAutomaticStateError("automatic_tool_result_conflict");
      }
      return current;
    }
    if (current.invocation.state !== "executing") throw new VeraAutomaticStateError("automatic_tool_not_executing");
    const next = cloneState(current);
    next.stages.context_selection = { ...next.stages.context_selection, state: "completed" };
    next.invocation = {
      ...next.invocation,
      state: "completed",
      resultDigest: result.resultDigest,
      sourceManifestDigest: input.sourceManifestDigest,
      selectedSourceCount: result.sources.length,
    };
    return this.store.write(this.requestId, current.version, next);
  }

  freezeContext(sourceManifestDigest: string): VeraAutomaticDurableState {
    const current = stateFor(this.store, this.requestId);
    if (current.frozen) {
      if (current.invocation.sourceManifestDigest !== sourceManifestDigest) throw new VeraAutomaticStateError("automatic_freeze_conflict");
      return current;
    }
    if (current.invocation.state !== "completed" || current.invocation.sourceManifestDigest !== sourceManifestDigest) {
      throw new VeraAutomaticStateError("automatic_context_not_complete");
    }
    const next = cloneState(current);
    next.frozen = true;
    return this.store.write(this.requestId, current.version, next);
  }

  completeAnswer(resultDigest: string, usageState: VeraAutomaticUsageState = "unknown"): VeraAutomaticDurableState {
    const current = stateFor(this.store, this.requestId);
    if (current.finalResultDigest === resultDigest && current.settlement === "known") return current;
    if (current.stages.answer.state !== "dispatching") throw new VeraAutomaticStateError("automatic_answer_not_dispatching");
    const next = cloneState(current);
    next.stages.answer = { ...next.stages.answer, state: "completed" };
    next.stageUsage.answer = usageState;
    next.finalResultDigest = resultDigest;
    next.settlement = next.stageUsage.context_selection === "known" && next.stageUsage.answer === "known" ? "known" : "unknown";
    return this.store.write(this.requestId, current.version, next);
  }

  fail(purpose: VeraAutomaticStagePurpose, errorCode: string): VeraAutomaticDurableState {
    const current = stateFor(this.store, this.requestId);
    const stage = current.stages[purpose];
    if (stage.state === "failed" && stage.errorCode === errorCode) return current;
    if (stage.state !== "dispatching" && stage.state !== "planned") throw new VeraAutomaticStateError("automatic_terminal_stage");
    const next = cloneState(current);
    next.stages[purpose] = { ...stage, state: "failed", errorCode };
    if (purpose === "context_selection") next.invocation = { ...next.invocation, state: "failed", errorCode };
    next.stageUsage[purpose] = next.stageUsage[purpose] === "pending" ? "unknown" : next.stageUsage[purpose];
    next.settlement = next.stageUsage[purpose] === "unknown" ? "unknown" : next.settlement;
    return this.store.write(this.requestId, current.version, next);
  }

  markUnknown(purpose: VeraAutomaticStagePurpose, errorCode: string): VeraAutomaticDurableState {
    const current = stateFor(this.store, this.requestId);
    const stage = current.stages[purpose];
    if (stage.state === "unknown" && stage.errorCode === errorCode) return current;
    if (stage.state !== "dispatching") throw new VeraAutomaticStateError("automatic_unknown_transition_forbidden");
    const next = cloneState(current);
    next.stages[purpose] = { ...stage, state: "unknown", errorCode };
    next.stageUsage[purpose] = "unknown";
    if (purpose === "context_selection") next.invocation = { ...next.invocation, state: "unavailable", errorCode };
    next.settlement = "unknown";
    return this.store.write(this.requestId, current.version, next);
  }
}

export type VeraAutomaticSelectorOutcome = {
  text?: string | null;
  toolCall?: VeraFunctionToolCall;
  usage?: NormalizedVeraResult["usage"];
};

export type VeraAutomaticAnswerOutcome = {
  text: string | null;
  structured?: unknown | null;
  usage: NormalizedVeraResult["usage"];
  finishReason?: string | null;
};

export type VeraAutomaticRunInput = {
  requestId: string;
  intentDigest?: string;
  answerIntentDigest?: string;
  selector: () => Promise<VeraAutomaticSelectorOutcome>;
  registry: (args: RetrieveReleasedLearningContextArgs) => Promise<{ result: ContextToolResult; sourceManifestDigest: string }>;
  answer: () => Promise<VeraAutomaticAnswerOutcome>;
  store?: VeraAutomaticStateStore;
  /** Recovered from the encrypted invocation row by a reconnect worker. */
  replayToolArguments?: unknown;
  replayToolResult?: ContextToolResult;
};

export type VeraAutomaticRunOutput = {
  state: VeraAutomaticDurableState;
  result: NormalizedVeraResult | null;
  toolResult: ContextToolResult | null;
};

const CITATION_PATTERN = /\[\^([A-Za-z0-9_-]{1,64})\]/g;

function assertCitationSubset(text: string | null, allowed: Set<string>): void {
  if (!text) return;
  for (const match of text.matchAll(CITATION_PATTERN)) {
    if (!allowed.has(match[1] ?? "")) throw new VeraAutomaticStateError("context_citation_invalid");
  }
}

function isAmbiguousFailure(error: unknown): boolean {
  return error instanceof VeraAutomaticStateError
    ? error.code === "automatic_dispatch_ambiguous"
    : Boolean(error && typeof error === "object" && "ambiguousPostSend" in error && (error as { ambiguousPostSend?: unknown }).ambiguousPostSend === true);
}

/** Execute both stages against a durable CAS state machine. The callbacks are
 * deliberately invoked only after their stage intent has been persisted. */
export async function runVeraAutomaticContext(input: VeraAutomaticRunInput): Promise<VeraAutomaticRunOutput> {
  const store = input.store ?? new InMemoryVeraAutomaticStateStore();
  const machine = new VeraAutomaticContextStateMachine(store, input.requestId);
  // A production caller creates the request and invocation in one admission
  // transaction. The in-memory runner creates that same boundary once.
  let state = store.read(input.requestId);
  if (!state) state = machine.plan();
  if (state.settlement !== "pending") return { state, result: null, toolResult: null };

  let frozenResult: ContextToolResult | null = null;
  let selectorStartedHere = false;
  if (state.invocation.state === "planned") {
    if (state.stages.context_selection.state !== "planned") {
      // A persisted dispatch with no tool-call boundary is provider-exposed;
      // it is ambiguous after reconnect and must not be retried.
      state = machine.markUnknown("context_selection", "context_selection_unknown");
      return { state, result: null, toolResult: null };
    }
    const selectorIntent = input.intentDigest ?? sha256Hex(`selector:${input.requestId}`);
    machine.persistDispatchIntent("context_selection", selectorIntent);
    selectorStartedHere = true;
  }

  if (selectorStartedHere) {
    let selector: VeraAutomaticSelectorOutcome;
    try {
      selector = await input.selector();
    } catch (error) {
      state = isAmbiguousFailure(error)
        ? machine.markUnknown("context_selection", "context_selection_unknown")
        : machine.fail("context_selection", "context_selection_failed");
      return { state, result: null, toolResult: null };
    }
    if (selector.text?.trim() || !selector.toolCall) {
      state = machine.fail("context_selection", "context_selection_failed");
      return { state, result: null, toolResult: null };
    }
    let args: RetrieveReleasedLearningContextArgs;
    try {
      args = parseRetrieveReleasedLearningContextArgs(JSON.parse(selector.toolCall.arguments) as unknown);
      machine.completeSelectorToolCall(selector.toolCall, selector.usage?.tokenUsageState === "known" ? "known" : "unknown");
    } catch {
      state = machine.fail("context_selection", "context_tool_invalid");
      return { state, result: null, toolResult: null };
    }
    try {
      const registryResult = await input.registry(args);
      frozenResult = parseContextToolResult(registryResult.result);
      machine.completeToolExecution({ result: frozenResult, sourceManifestDigest: registryResult.sourceManifestDigest });
      machine.freezeContext(registryResult.sourceManifestDigest);
    } catch {
      state = machine.fail("context_selection", "context_registry_unavailable");
      return { state, result: null, toolResult: null };
    }
  } else if (state.invocation.state === "executing" && input.replayToolArguments !== undefined) {
    // The tool call itself is durably recorded. It is safe to resume only the
    // server registry execution; the selector provider call is forbidden.
    const args = parseRetrieveReleasedLearningContextArgs(input.replayToolArguments);
    try {
      const registryResult = await input.registry(args);
      frozenResult = parseContextToolResult(registryResult.result);
      machine.completeToolExecution({ result: frozenResult, sourceManifestDigest: registryResult.sourceManifestDigest });
      machine.freezeContext(registryResult.sourceManifestDigest);
    } catch {
      state = machine.fail("context_selection", "context_registry_unavailable");
      return { state, result: null, toolResult: null };
    }
  } else if (state.invocation.state === "executing") {
    return { state, result: null, toolResult: null };
  } else if (state.invocation.state === "completed" && !input.replayToolResult) {
    // A reconnect must supply the encrypted/frozen result from the durable
    // request row before it can issue the final dispatch.
    return { state, result: null, toolResult: null };
  } else if (state.invocation.state === "completed" && input.replayToolResult) {
    frozenResult = parseContextToolResult(input.replayToolResult);
    if (frozenResult.resultDigest !== state.invocation.resultDigest) throw new VeraAutomaticStateError("automatic_tool_result_conflict");
  }
  if (!frozenResult) return { state: machine.snapshot(), result: null, toolResult: null };

  state = machine.snapshot();
  let answerStartedHere = false;
  if (state.stages.answer.state === "planned") {
    const answerIntent = input.answerIntentDigest ?? sha256Hex(`answer:${input.requestId}:${state.invocation.resultDigest}`);
    machine.persistDispatchIntent("answer", answerIntent);
    answerStartedHere = true;
  } else if (state.stages.answer.state === "dispatching") {
    state = machine.markUnknown("answer", "answer_unknown");
    return { state, result: null, toolResult: frozenResult };
  }
  if (!answerStartedHere) return { state: machine.snapshot(), result: null, toolResult: frozenResult };
  let answer: VeraAutomaticAnswerOutcome;
  try {
    answer = await input.answer();
  } catch (error) {
    state = isAmbiguousFailure(error) ? machine.markUnknown("answer", "answer_unknown") : machine.fail("answer", "answer_failed");
    return { state, result: null, toolResult: frozenResult };
  }
  try {
    const allowed = new Set(frozenResult.sources.map((source) => source.citationKey));
    assertCitationSubset(answer.text, allowed);
    const normalized = validateVeraResult({
      text: answer.text,
      structured: answer.structured ?? null,
      usage: answer.usage,
      finishReason: answer.finishReason ?? null,
      allowedCitationKeys: allowed,
    });
    state = machine.completeAnswer(normalized.digest, answer.usage.tokenUsageState === "known" ? "known" : "unknown");
    return { state, result: normalized, toolResult: frozenResult };
  } catch (error) {
    const code = error instanceof VeraAutomaticStateError ? error.code : "malformed_output";
    state = machine.fail("answer", code);
    return { state, result: null, toolResult: frozenResult };
  }
}

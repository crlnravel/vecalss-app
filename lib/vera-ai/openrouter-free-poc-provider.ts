import "server-only";

import {
  VERA_OPENROUTER_FREE_POC_MAX_INPUT_CHARS,
  VERA_OPENROUTER_FREE_POC_MAX_OUTPUT_TOKENS,
  VERA_OPENROUTER_FREE_POC_MODEL,
  VeraOpenRouterFreePocAdapter,
  VeraOpenRouterFreePocError,
  type VeraOpenRouterFreePocOptions,
} from "./openrouter-free-poc";
import {
  OPENROUTER_FREE_POC_ENDPOINT_METADATA_DIGEST,
  OPENROUTER_FREE_POC_ROUTING_POLICY_VERSION,
  OPENROUTER_FREE_POC_UPSTREAM_PROVIDER,
  OPENROUTER_FREE_POC_UPSTREAM_PROVIDER_SLUG,
  ProviderExecutionError,
  ProviderSafetyError,
  certifyVeraProviderTask,
  type PreparedProviderTask,
  type ProviderResult,
  type ProviderRoutingOptions,
  type ProviderTask,
  type ProviderUsage,
  type ProviderDelta,
  type VeraProviderAdapter,
} from "./provider";
import { sha256Hex } from "./contracts";

const POC_NOT_A_RELEASE_DIGEST = "poc-not-a-release";
const MAX_PROVIDER_IDENTITY_CHARS = 160;
const MAX_MODEL_CHARS = 120;

export type VeraOpenRouterFreePocProviderOptions = VeraOpenRouterFreePocOptions;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim() && value.length <= maxLength ? value.trim() : null;
}

function promptFromTask(task: ProviderTask): string {
  if (!(task.taskBytes instanceof Uint8Array) || task.taskBytes.byteLength < 1) {
    throw new ProviderSafetyError("The POC provider task has no certified input bytes.");
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(task.taskBytes);
  } catch {
    throw new ProviderSafetyError("The POC provider task is not valid UTF-8.");
  }

  // Context packs are canonical JSON. Send only the server-normalized user
  // text to the dev POC; source snapshots and authority metadata stay inside
  // the existing durable context path and are never copied to this request.
  let prompt = decoded;
  try {
    const parsed = record(JSON.parse(decoded) as unknown);
    const userText = boundedString(parsed?.userText, VERA_OPENROUTER_FREE_POC_MAX_INPUT_CHARS);
    if (userText) prompt = userText;
  } catch {
    // Opaque task bytes remain a valid bounded task only when they are already
    // within the POC's explicit input limit.
  }
  if (!prompt.trim() || prompt.length > VERA_OPENROUTER_FREE_POC_MAX_INPUT_CHARS) {
    throw new ProviderSafetyError("The POC provider task exceeds the bounded input contract.");
  }
  return prompt;
}

function maxOutputTokensFor(task: ProviderTask): number {
  if (!Number.isSafeInteger(task.hardOutputQuotaUnits) || task.hardOutputQuotaUnits < 1) {
    throw new ProviderSafetyError("The POC provider hard output quota is invalid.");
  }
  return Math.min(task.hardOutputQuotaUnits, VERA_OPENROUTER_FREE_POC_MAX_OUTPUT_TOKENS);
}

function mapUsage(result: Awaited<ReturnType<VeraOpenRouterFreePocAdapter["run"]>>): ProviderUsage {
  const inputTokens = result.usage.promptTokens;
  const outputTokens = result.usage.completionTokens;
  const totalTokens = result.usage.totalTokens
    ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  return {
    inputTokens,
    outputTokens,
    quotaUnitsConsumed: totalTokens,
    tokenUsageState: totalTokens === null ? "unknown" : "known",
  };
}

function mapPocError(error: unknown): ProviderExecutionError {
  if (error instanceof ProviderExecutionError) return error;
  if (error instanceof VeraOpenRouterFreePocError) {
    return new ProviderExecutionError({
      code: `openrouter_free_poc_${error.code}`,
      retryableBeforeAcceptance: error.retryable && !error.ambiguousPostSend,
      ambiguousPostSend: error.ambiguousPostSend,
      message: "The dev OpenRouter POC request failed.",
    });
  }
  return new ProviderExecutionError({
    code: "openrouter_free_poc_network_error",
    retryableBeforeAcceptance: true,
    ambiguousPostSend: false,
    message: "The dev OpenRouter POC request failed.",
  });
}

const POC_ROUTING_OPTIONS: Extract<ProviderRoutingOptions, { kind: "openrouter_free_poc" }> = {
  kind: "openrouter_free_poc",
  provider: {
    allow_fallbacks: false,
    data_collection: "allow",
  },
};

/**
 * Adapter bridge for the dev-only free-router POC. It intentionally conforms
 * to the same provider interface as the durable Vera admission/orchestrator;
 * selecting it therefore exercises normal quota, settlement, retry, SSE, and
 * status paths. It is never a release-manifest provider.
 */
export class VeraOpenRouterFreePocProviderAdapter implements VeraProviderAdapter {
  readonly enabled: boolean;
  readonly disabledReason?: string;

  private readonly poc: VeraOpenRouterFreePocAdapter;

  constructor(options: VeraOpenRouterFreePocProviderOptions = {}) {
    this.poc = new VeraOpenRouterFreePocAdapter(options);
    this.enabled = this.poc.enabled;
    this.disabledReason = this.poc.disabledReason;
  }

  async prepare(task: ProviderTask): Promise<PreparedProviderTask> {
    if (!this.enabled) throw new ProviderSafetyError(this.disabledReason ?? "The dev OpenRouter POC is disabled.");
    const certifiedEstimate = certifyVeraProviderTask(task);
    promptFromTask(task);
    maxOutputTokensFor(task);
    const providerTaskDigest = sha256Hex(`${OPENROUTER_FREE_POC_ENDPOINT_METADATA_DIGEST}:${task.contextTaskDigest}:${task.featureKey}:${task.behaviorVersion}`);
    return {
      gateway: "openrouter",
      upstreamProvider: OPENROUTER_FREE_POC_UPSTREAM_PROVIDER,
      upstreamProviderSlug: OPENROUTER_FREE_POC_UPSTREAM_PROVIDER_SLUG,
      model: VERA_OPENROUTER_FREE_POC_MODEL,
      routingPolicyVersion: OPENROUTER_FREE_POC_ROUTING_POLICY_VERSION,
      endpointMetadataDigest: OPENROUTER_FREE_POC_ENDPOINT_METADATA_DIGEST,
      providerTaskDigest,
      inputQuotaUnitsUpperBound: certifiedEstimate.inputUpperBound,
      outputQuotaUnitsUpperBound: certifiedEstimate.outputUpperBound,
      quotaPolicyVersion: "openrouter-free-poc-quota-v1",
      hardOutputQuotaUnits: task.hardOutputQuotaUnits,
      maxProviderAttempts: 2,
      preparedTask: task,
      certifiedEstimate,
      manifestDigest: POC_NOT_A_RELEASE_DIGEST,
      routingOptions: POC_ROUTING_OPTIONS,
    };
  }

  async run(prepared: PreparedProviderTask, emit?: (delta: ProviderDelta) => void): Promise<ProviderResult> {
    if (!this.enabled) throw new ProviderSafetyError(this.disabledReason ?? "The dev OpenRouter POC is disabled.");
    if (prepared.routingOptions.kind !== "openrouter_free_poc"
      || prepared.upstreamProvider !== OPENROUTER_FREE_POC_UPSTREAM_PROVIDER
      || prepared.upstreamProviderSlug !== OPENROUTER_FREE_POC_UPSTREAM_PROVIDER_SLUG
      || prepared.model !== VERA_OPENROUTER_FREE_POC_MODEL) {
      throw new ProviderSafetyError("The POC provider task routing tuple drifted.");
    }
    const task = prepared.preparedTask;
    const prompt = promptFromTask(task);
    const maxOutputTokens = maxOutputTokensFor(task);
    let result: Awaited<ReturnType<VeraOpenRouterFreePocAdapter["run"]>>;
    try {
      result = await this.poc.run(
        { prompt, maxOutputTokens },
        (delta) => emit?.({ text: delta.text, provisional: true }),
      );
    } catch (error) {
      throw mapPocError(error);
    }

    const selectedModel = boundedString(result.selectedModel, MAX_MODEL_CHARS);
    const providerIdentity = boundedString(result.providerIdentity, MAX_PROVIDER_IDENTITY_CHARS);
    if (!selectedModel || !providerIdentity) {
      throw new ProviderExecutionError({
        code: "openrouter_free_poc_invalid_response",
        retryableBeforeAcceptance: false,
        ambiguousPostSend: false,
        message: "The dev OpenRouter POC response identity was malformed.",
      });
    }
    const usage = mapUsage(result);
    return {
      kind: "text",
      text: result.text,
      structured: null,
      usage,
      finishReason: result.finishReason,
      attempts: [{
        attemptNo: 1,
        state: "completed",
        providerRequestRef: null,
        observedUpstreamProviderSlug: providerIdentity,
        errorCode: null,
        usage,
      }],
      providerMetadata: {
        kind: "openrouter_free_poc",
        gateway: "openrouter",
        upstreamProvider: OPENROUTER_FREE_POC_UPSTREAM_PROVIDER,
        requestedModel: VERA_OPENROUTER_FREE_POC_MODEL,
        selectedModel,
        providerIdentity,
        dataCollection: "allow",
        zdr: false,
      },
    };
  }
}

export function createVeraOpenRouterFreePocProviderAdapter(
  options: VeraOpenRouterFreePocProviderOptions = {},
): VeraOpenRouterFreePocProviderAdapter {
  return new VeraOpenRouterFreePocProviderAdapter(options);
}

import "server-only";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  VERA_AUTOMATIC_CONTEXT_BUDGETS,
  VERA_FIXED_FRAMING_TOKEN_BOUND,
  VERA_MAX_PROVIDER_ATTEMPTS,
  canonicalJson,
  sha256Hex,
} from "./contracts";
import {
  VERA_CONTEXT_TOOL_NAME,
  VERA_CONTEXT_TOOL_SCHEMA,
  canonicalContextToolArguments,
  createContextToolResult,
  parseRetrieveReleasedLearningContextArgs,
  parseContextToolResult,
  serializeContextToolResult,
  type ContextToolResult,
} from "./context-tool-contracts";

export const OPENROUTER_GATEWAY = "openrouter";
export const APPROVED_UPSTREAM_PROVIDER = "relace" as const;
export const APPROVED_UPSTREAM_PROVIDER_SLUG = "relace" as const;
export const APPROVED_MODEL = "deepseek/deepseek-v4-flash-0731" as const;
export const APPROVED_ROUTING_POLICY_VERSION = "openrouter-routing-v1";
export const VERA_CERTIFIED_ESTIMATOR_VERSION = "universal-byte-bound-v1";
export const VERA_PAID_CERTIFIER_ID = "openrouter-utf8-byte-upper-bound-v1";
export const VERA_PAID_CERTIFIER_VERSION = "1";
export const VERA_PAID_SERIALIZER_ID = "vera-openrouter-chat-input-v1";
export const VERA_AUTOMATIC_SELECTOR_SERIALIZER_ID = "vera-openrouter-auto-selector-v1";
export const VERA_AUTOMATIC_FINAL_SERIALIZER_ID = "vera-openrouter-auto-final-v1";
export const VERA_AUTOMATIC_SERIALIZER_VERSION = "1";
export const VERA_CONTEXT_TOOL_SCHEMA_HASH = sha256Hex(canonicalJson(VERA_CONTEXT_TOOL_SCHEMA));
/** Hashes bind the exact automatic input builders to the release capability
 * evidence. They intentionally include the closed tool schema for the
 * selector and the no-tools final turn separately. */
export const VERA_AUTOMATIC_SELECTOR_INPUT_BUILDER_HASH = sha256Hex(canonicalJson({
  serializerId: VERA_AUTOMATIC_SELECTOR_SERIALIZER_ID,
  serializerVersion: VERA_AUTOMATIC_SERIALIZER_VERSION,
  stage: "context_selection",
  toolSchemaHash: VERA_CONTEXT_TOOL_SCHEMA_HASH,
  tools: true,
}));
export const VERA_AUTOMATIC_FINAL_INPUT_BUILDER_HASH = sha256Hex(canonicalJson({
  serializerId: VERA_AUTOMATIC_FINAL_SERIALIZER_ID,
  serializerVersion: VERA_AUTOMATIC_SERIALIZER_VERSION,
  stage: "answer",
  toolSchemaHash: VERA_CONTEXT_TOOL_SCHEMA_HASH,
  tools: false,
}));
export const VERA_PAID_PRICE_POLICY_VERSION = "vera-openrouter-price-v1";
export const VERA_CERTIFIER_EVIDENCE_REFERENCE = "certifiers/deepseek-v4-flash-0731/utf8-byte-bound-v1.json" as const;
export const OPENROUTER_MAX_PRICE = {
  prompt: "0.10",
  completion: "0.30",
  request: "0",
  image: "0",
} as const;
export const OPENROUTER_FREE_POC_UPSTREAM_PROVIDER = "openrouter-free-poc";
export const OPENROUTER_FREE_POC_UPSTREAM_PROVIDER_SLUG = "openrouter-free";
export const OPENROUTER_FREE_POC_ROUTING_POLICY_VERSION = "openrouter-free-poc-v1";
export const OPENROUTER_FREE_POC_ENDPOINT_METADATA_DIGEST = "openrouter-free-poc-endpoint-v1";

const VERA_ESTIMATOR_OVERHEAD = {
  inputProtocolOverheadUnits: 80,
  systemOverheadUnits: 120,
  toolOverheadUnits: 40,
  contextOverheadUnits: 80,
  retryOverheadUnits: 60,
} as const;

export type ProductionProviderRoutingOptions = {
  kind?: "production";
  provider: {
    only: [string];
    order: [string];
    allow_fallbacks: false;
    require_parameters: true;
    zdr: true;
    data_collection: "deny";
    max_price: typeof OPENROUTER_MAX_PRICE;
  };
};

/**
 * The free-router POC is deliberately a different routing contract. It is
 * never valid as a release manifest: the absence of `zdr` is intentional and
 * makes accidental production/privacy-tuple substitution type-visible.
 */
export type VeraOpenRouterFreePocRoutingOptions = {
  kind: "openrouter_free_poc";
  provider: {
    allow_fallbacks: false;
    data_collection: "allow";
  };
};

export type ProviderRoutingOptions = ProductionProviderRoutingOptions | VeraOpenRouterFreePocRoutingOptions;

export type OpenRouterMaxPrice = {
  prompt: string;
  completion: string;
  request: string;
  image: string;
};

export type ProviderCacheWriteAccountingMode = "included_in_uncached_prompt" | "explicit" | "unsupported";

export type ProviderPriceSnapshot = {
  currency: "USD";
  promptPriceUsdPerM: string;
  completionPriceUsdPerM: string;
  requestPriceUsdPerM: string;
  imagePriceUsdPerM: string;
  audioPriceUsdPerM: string;
  cacheReadPriceUsdPerM: string;
  cacheWritePriceUsdPerM: string;
  cacheWriteAccountingMode: ProviderCacheWriteAccountingMode;
  reasoningTokenTreatment: "included_in_completion";
  serverToolTreatment: "disabled";
};

export type VeraToolCallingCapability = {
  applicationFunctions: true;
  toolChoiceAuto: true;
  plugins: false;
  serverTools: false;
  schemaHash: string;
  selectorInputBuilderHash: string;
  finalInputBuilderHash: string;
  evidenceDigest: string;
  signature: string;
};

type UnsignedVeraToolCallingCapability = Omit<VeraToolCallingCapability, "evidenceDigest" | "signature">;

/** The capability evidence is a signed release input, not a free-form flag.
 * Keeping this digest helper public lets release fixtures and deployment
 * tooling produce exactly the same canonical evidence payload. */
export function automaticToolCallingCapabilityEvidenceDigest(input: UnsignedVeraToolCallingCapability): string {
  return sha256Hex(canonicalJson(input));
}

export type ProviderCertifierEvidence = {
  tokenizerRevision: string;
  tokenizerHash: string;
  chatTemplateHash: string;
  byteFallbackProofReference: string;
  fixedFramingTokenBound: 512;
  serializerId: typeof VERA_PAID_SERIALIZER_ID;
  serializerVersion: string;
  model: typeof APPROVED_MODEL;
  upstreamProviderSlug: typeof APPROVED_UPSTREAM_PROVIDER_SLUG;
  producer: string;
  artifactHash: string;
  signature: string;
  verifiedAt: string;
  expiresAt: string;
};

export type ProviderReleaseManifest = {
  manifestVersion: string;
  gateway: "openrouter";
  upstreamProvider: typeof APPROVED_UPSTREAM_PROVIDER;
  upstreamProviderSlug: typeof APPROVED_UPSTREAM_PROVIDER_SLUG;
  model: typeof APPROVED_MODEL;
  endpointMetadataDigest: string;
  endpointDescriptorHash: string;
  routingPolicyVersion: string;
  routingOptions: ProductionProviderRoutingOptions;
  maxPrice: OpenRouterMaxPrice;
  priceSnapshot: ProviderPriceSnapshot;
  pricePolicyVersion: typeof VERA_PAID_PRICE_POLICY_VERSION;
  sourceUrl: string;
  maxPriceSchemaEvidenceReference: string;
  maxPriceSchemaEvidenceDigest: string;
  canaryEvidenceReference: string;
  canaryEvidenceDigest: string;
  inputCertifierId: typeof VERA_PAID_CERTIFIER_ID;
  inputCertifierVersion: typeof VERA_PAID_CERTIFIER_VERSION;
  finalInputBuilderHash: string;
  certifierEvidenceReference: typeof VERA_CERTIFIER_EVIDENCE_REFERENCE;
  certifierEvidence: ProviderCertifierEvidence;
  aliasTableVersion: string;
  providerAliasTable?: Record<string, typeof APPROVED_UPSTREAM_PROVIDER_SLUG>;
  termsEvidenceReference: string;
  termsEvidenceDigest: string;
  privacyEvidenceReference: string;
  privacyEvidenceDigest: string;
  noTraining: true;
  noContentLogging: true;
  residencyDisclosure: string;
  verifiedAt: string;
  expiresAt: string;
  approver: string;
  releaseState: "approved" | "revoked" | "pending";
  /** Optional until the separately recertified automatic-context release is
   * approved. Plugins and server tools are never accepted in any release. */
  toolCallingCapability?: VeraToolCallingCapability;
  manifestDigest: string;
};

export type ProviderTask = {
  featureKey: string;
  behaviorVersion: string;
  taskBytes: Uint8Array;
  contextTaskDigest: string;
  hardOutputQuotaUnits: number;
  /** Automatic context uses one immutable dispatch per purpose. */
  stagePurpose?: "context_selection" | "answer";
  certifiedEstimate?: CertifiedQuotaEstimate;
  /** Optional durable identity supplied by a write-ahead caller. */
  requestId?: string;
  attemptNo?: number;
  providerRequestKey?: string;
  finalPayloadHash?: string;
  dispatchDeadlineAt?: Date | string;
};

export type CertifiedQuotaEstimate = {
  inputUpperBound: number;
  outputUpperBound: number;
  reservationBound: number;
  certified: true;
  basis: "universal-byte-bound";
  certificationMethod: typeof VERA_CERTIFIED_ESTIMATOR_VERSION;
  maxProviderAttempts: 2;
};

export type PreparedProviderTask = {
  gateway: "openrouter";
  upstreamProvider: typeof APPROVED_UPSTREAM_PROVIDER | typeof OPENROUTER_FREE_POC_UPSTREAM_PROVIDER;
  upstreamProviderSlug: string;
  model: string;
  routingPolicyVersion: string;
  endpointMetadataDigest: string;
  providerTaskDigest: string;
  inputQuotaUnitsUpperBound: number;
  outputQuotaUnitsUpperBound: number;
  quotaPolicyVersion: string;
  hardOutputQuotaUnits: number;
  maxProviderAttempts: 2;
  preparedTask: ProviderTask;
  stagePurpose?: "context_selection" | "answer";
  certifiedEstimate: CertifiedQuotaEstimate;
  manifestDigest: string;
  priceSnapshot?: ProviderPriceSnapshot;
  pricePolicyVersion?: string;
  certifierId?: string;
  certifierVersion?: string;
  routingOptions: ProviderRoutingOptions;
  providerRequestKey?: string;
  finalPayloadHash?: string;
  dispatchDeadlineAt?: string;
};

export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  quotaUnitsConsumed: number | null;
  tokenUsageState: "known" | "unknown" | "not_applicable";
  cachedTokens?: number | null;
  cacheWriteTokens?: number | null;
  reasoningTokens?: number | null;
  serverToolCost?: string | null;
  rawReportedCostDecimal?: string | null;
  canonicalReportedCostDecimal?: string | null;
  reportedCostMicros?: string | null;
  recomputedCostMicros?: string | null;
};

export type ProviderAttemptEvidence = {
  attemptNo: number;
  state: "prepared" | "reserved" | "dispatching" | "sent" | "accepted" | "completed" | "unknown" | "overrun" | "ambiguous" | "released" | "failed";
  providerRequestRef: string | null;
  observedUpstreamProviderSlug: string | null;
  errorCode: string | null;
  usage: ProviderUsage;
  providerRequestKey?: string | null;
  generationId?: string | null;
  upstreamId?: string | null;
  providerRequestId?: string | null;
  finalPayloadHash?: string | null;
  dispatchDeadlineAt?: string | null;
  rawReportedCostDecimal?: string | null;
  canonicalReportedCostDecimal?: string | null;
  reportedCostMicros?: string | null;
  recomputedCostMicros?: string | null;
  selectedEndpointJsonPointer?: string | null;
  evidenceObservedAt?: string | null;
};

export type ProviderResult = {
  kind: "text" | "structured" | "fallback" | "discarded";
  text: string | null;
  structured: unknown | null;
  /** Present only for the selector stage. The result is identity-free. */
  toolCall?: VeraFunctionToolCall;
  usage: ProviderUsage;
  finishReason: string | null;
  attempts: ProviderAttemptEvidence[];
  providerMetadata?: ProviderResultMetadata;
};

export type VeraFunctionToolCall = {
  id: string;
  name: typeof VERA_CONTEXT_TOOL_NAME;
  arguments: string;
};

export type VeraAutomaticHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type VeraAutomaticSelectorSerializationInput = {
  systemPolicy: string;
  history?: readonly VeraAutomaticHistoryMessage[];
  userText: string;
  /** Exact UTF-8 cap for the provider-visible canonical request. */
  maxSerializedBytes?: number;
  /** @deprecated compatibility alias for existing contract tests. */
  maxBytes?: number;
};

export type VeraAutomaticFinalSerializationInput = {
  systemPolicy: string;
  history?: readonly VeraAutomaticHistoryMessage[];
  userText: string;
  toolCall: VeraFunctionToolCall;
  toolResult: ContextToolResult;
  /** Exact UTF-8 cap for the provider-visible canonical request. */
  maxSerializedBytes?: number;
  /** @deprecated compatibility alias for existing contract tests. */
  maxBytes?: number;
};

type VeraSerializedMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: typeof VERA_CONTEXT_TOOL_NAME; arguments: string };
  }>;
  tool_call_id?: string;
};

type VeraAutomaticSerializedRequest = {
  serializerId: typeof VERA_AUTOMATIC_SELECTOR_SERIALIZER_ID | typeof VERA_AUTOMATIC_FINAL_SERIALIZER_ID;
  serializerVersion: typeof VERA_AUTOMATIC_SERIALIZER_VERSION;
  stage: "context_selection" | "answer";
  messages: VeraSerializedMessage[];
  tools?: [typeof VERA_CONTEXT_TOOL_SCHEMA];
  tool_choice?: "auto";
};

function boundedAutomaticText(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 40_000 || Buffer.byteLength(value, "utf8") > 40_000) {
    throw new ProviderSafetyError(`Automatic ${field} is outside the bounded serializer contract.`);
  }
  return value.normalize("NFC").replace(/\r\n?/gu, "\n");
}

function automaticHistoryMessages(history: readonly VeraAutomaticHistoryMessage[] | undefined): VeraSerializedMessage[] {
  if (!history) return [];
  if (history.length > 6) throw new ProviderSafetyError("Automatic history exceeds the completed-pair cap.");
  return history.map((message) => ({
    role: message.role,
    content: boundedAutomaticText(message.text, "history message"),
  }));
}

function selectorSystemPolicy(value: string): string {
  const policy = boundedAutomaticText(value, "system policy");
  if (policy.length > 16_000) throw new ProviderSafetyError("Automatic selector policy is too large.");
  return policy;
}

function assertToolCallIdentity(toolCall: VeraFunctionToolCall): void {
  if (!toolCall || typeof toolCall !== "object"
    || typeof toolCall.id !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/u.test(toolCall.id)
    || toolCall.name !== VERA_CONTEXT_TOOL_NAME
    || typeof toolCall.arguments !== "string" || Buffer.byteLength(toolCall.arguments, "utf8") > 8_192) {
    throw new ProviderSafetyError("Automatic tool-call identity is invalid.");
  }
  // Canonical parsing is deliberately performed before a final serializer can
  // place the call in a provider message.
  parseRetrieveReleasedLearningContextArgs(JSON.parse(toolCall.arguments) as unknown);
}

function encodeAutomaticRequest(request: VeraAutomaticSerializedRequest, maxSerializedBytes: number | undefined): Uint8Array {
  const bytes = new TextEncoder().encode(canonicalJson(request));
  if (maxSerializedBytes !== undefined
    && (!Number.isSafeInteger(maxSerializedBytes) || maxSerializedBytes < 1 || bytes.byteLength > maxSerializedBytes)) {
    throw new ProviderSafetyError("Automatic serialized input exceeds the exact stage byte cap.");
  }
  return bytes;
}

/** Canonical selector request bytes. The only provider tool is the closed,
 * application-executed function; no server tools or plugin fields exist. */
export function serializeVeraAutomaticSelector(input: VeraAutomaticSelectorSerializationInput): Uint8Array {
  const request: VeraAutomaticSerializedRequest = {
    serializerId: VERA_AUTOMATIC_SELECTOR_SERIALIZER_ID,
    serializerVersion: VERA_AUTOMATIC_SERIALIZER_VERSION,
    stage: "context_selection",
    messages: [
      { role: "system", content: selectorSystemPolicy(input.systemPolicy) },
      ...automaticHistoryMessages(input.history),
      { role: "user", content: boundedAutomaticText(input.userText, "user text") },
    ],
    tools: [VERA_CONTEXT_TOOL_SCHEMA],
    tool_choice: "auto",
  };
  return encodeAutomaticRequest(
    request,
    input.maxSerializedBytes ?? input.maxBytes ?? VERA_AUTOMATIC_CONTEXT_BUDGETS.chat_review.selectorInputTokenCap - VERA_FIXED_FRAMING_TOKEN_BOUND,
  );
}

/** Canonical final request bytes. Tools are intentionally absent from this
 * turn, so retrieved content cannot initiate another provider call. */
export function serializeVeraAutomaticFinal(input: VeraAutomaticFinalSerializationInput): Uint8Array {
  assertToolCallIdentity(input.toolCall);
  const result = parseContextToolResult(input.toolResult);
  const request: VeraAutomaticSerializedRequest = {
    serializerId: VERA_AUTOMATIC_FINAL_SERIALIZER_ID,
    serializerVersion: VERA_AUTOMATIC_SERIALIZER_VERSION,
    stage: "answer",
    messages: [
      { role: "system", content: selectorSystemPolicy(input.systemPolicy) },
      ...automaticHistoryMessages(input.history),
      { role: "user", content: boundedAutomaticText(input.userText, "user text") },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: input.toolCall.id, type: "function", function: { name: VERA_CONTEXT_TOOL_NAME, arguments: canonicalContextToolArguments(JSON.parse(input.toolCall.arguments) as unknown) } }],
      },
      { role: "tool", content: new TextDecoder().decode(serializeContextToolResult(result)), tool_call_id: input.toolCall.id },
    ],
  };
  return encodeAutomaticRequest(
    request,
    input.maxSerializedBytes ?? input.maxBytes ?? VERA_AUTOMATIC_CONTEXT_BUDGETS.chat_review.exactFinalSerializedInputByteCap,
  );
}

export const serializeAutomaticSelector = serializeVeraAutomaticSelector;
export const serializeAutomaticFinal = serializeVeraAutomaticFinal;

export type ProviderResultMetadata = {
  kind: "openrouter_free_poc";
  gateway: "openrouter";
  upstreamProvider: typeof OPENROUTER_FREE_POC_UPSTREAM_PROVIDER;
  requestedModel: "openrouter/free";
  selectedModel: string;
  providerIdentity: string;
  dataCollection: "allow";
  zdr: false;
} | {
  kind: "openrouter_paid";
  gateway: "openrouter";
  upstreamProvider: typeof APPROVED_UPSTREAM_PROVIDER;
  requestedModel: typeof APPROVED_MODEL;
  selectedModel: typeof APPROVED_MODEL;
  providerIdentity: typeof APPROVED_UPSTREAM_PROVIDER_SLUG;
  dataCollection: "deny";
  zdr: true;
  strategy: "direct";
  selectedEndpointJsonPointer: string;
  generationId: string;
  upstreamId: string;
  providerRequestId: string;
};

export type ProviderDelta = { text: string; provisional: true };

export type ProviderDispatchIntent = {
  attemptNo: number;
  providerRequestKey: string;
  finalPayloadHash: string;
  dispatchDeadlineAt: string;
  gateway: typeof OPENROUTER_GATEWAY;
  upstreamProviderSlug: typeof APPROVED_UPSTREAM_PROVIDER_SLUG;
  model: typeof APPROVED_MODEL;
};

export type ProviderDispatchEvidence = ProviderDispatchIntent & {
  state: "sent" | "unknown" | "failed";
  generationId: string | null;
  providerRequestId: string | null;
  upstreamId: string | null;
  observedUpstreamProviderSlug: string | null;
  observedAt: string;
  reason?: string;
};

export type ProviderDispatchHooks = {
  onDispatchIntent?: (intent: ProviderDispatchIntent) => void | Promise<void>;
  onDispatchEvidence?: (evidence: ProviderDispatchEvidence) => void | Promise<void>;
};

export type ProviderFailureEvidence = {
  state: "unknown" | "overrun";
  settlementOutcome?: "known" | "unknown";
  reason: string;
  generationId: string | null;
  providerRequestId: string | null;
  upstreamId: string | null;
  providerName: string | null;
  reportedCostMicros: string | null;
  recomputedCostMicros: string | null;
  rawReportedCostDecimal: string | null;
  canonicalReportedCostDecimal: string | null;
};

export class ProviderSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderSafetyError";
  }
}

export class ProviderExecutionError extends Error {
  readonly retryableBeforeAcceptance: boolean;
  readonly ambiguousPostSend: boolean;
  readonly code: string;
  readonly evidence?: ProviderFailureEvidence;

  constructor(input: { code: string; retryableBeforeAcceptance?: boolean; ambiguousPostSend?: boolean; message?: string; evidence?: ProviderFailureEvidence }) {
    super(input.message ?? input.code);
    this.name = "ProviderExecutionError";
    this.code = input.code;
    this.retryableBeforeAcceptance = input.retryableBeforeAcceptance ?? false;
    this.ambiguousPostSend = input.ambiguousPostSend ?? false;
    this.evidence = input.evidence;
  }
}

export interface VeraProviderAdapter {
  readonly enabled: boolean;
  /** Only the certified paid application-function release may participate in
   * automatic context; the mock adapter is test-only for this path. */
  readonly automaticContextCapable?: boolean;
  readonly disabledReason?: string;
  prepare(task: ProviderTask): Promise<PreparedProviderTask>;
  run(prepared: PreparedProviderTask, emit?: (delta: ProviderDelta) => void): Promise<ProviderResult>;
}

function isPlaceholder(value: string): boolean {
  return !value.trim() || /^(todo|placeholder|changeme|unknown|pending|example)/i.test(value.trim());
}

const JSON_NUMBER_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/** A JSON number kept as its original lexeme so billing never crosses a
 * JavaScript floating-point boundary. */
export class LosslessJsonNumber {
  readonly raw: string;

  constructor(raw: string) {
    this.raw = raw;
  }
}

export type LosslessJsonValue = null | boolean | string | LosslessJsonNumber | LosslessJsonValue[] | { [key: string]: LosslessJsonValue };

class LosslessJsonParser {
  private readonly input: string;
  private position = 0;

  constructor(input: string) {
    this.input = input;
  }

  parse(): LosslessJsonValue {
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.position !== this.input.length) throw new ProviderSafetyError("The provider JSON response contains trailing data.");
    return value;
  }

  private parseValue(depth: number): LosslessJsonValue {
    if (depth > 80) throw new ProviderSafetyError("The provider JSON response is too deeply nested.");
    this.skipWhitespace();
    const char = this.input[this.position];
    if (char === "{") return this.parseObject(depth + 1);
    if (char === "[") return this.parseArray(depth + 1);
    if (char === '"') return this.parseString();
    if (this.input.startsWith("true", this.position)) {
      this.position += 4;
      return true;
    }
    if (this.input.startsWith("false", this.position)) {
      this.position += 5;
      return false;
    }
    if (this.input.startsWith("null", this.position)) {
      this.position += 4;
      return null;
    }
    JSON_NUMBER_RE.lastIndex = this.position;
    const match = JSON_NUMBER_RE.exec(this.input);
    if (match?.[0]) {
      this.position += match[0].length;
      return new LosslessJsonNumber(match[0]);
    }
    throw new ProviderSafetyError("The provider JSON response contains invalid JSON.");
  }

  private parseObject(depth: number): { [key: string]: LosslessJsonValue } {
    this.position += 1;
    const result: { [key: string]: LosslessJsonValue } = {};
    const seen = new Set<string>();
    this.skipWhitespace();
    if (this.input[this.position] === "}") {
      this.position += 1;
      return result;
    }
    while (this.position < this.input.length) {
      this.skipWhitespace();
      if (this.input[this.position] !== '"') throw new ProviderSafetyError("The provider JSON object has an invalid key.");
      const key = this.parseString();
      if (seen.has(key)) throw new ProviderSafetyError(`The provider JSON object contains duplicate key ${key}.`);
      seen.add(key);
      this.skipWhitespace();
      if (this.input[this.position] !== ":") throw new ProviderSafetyError("The provider JSON object is missing a colon.");
      this.position += 1;
      result[key] = this.parseValue(depth);
      this.skipWhitespace();
      if (this.input[this.position] === "}") {
        this.position += 1;
        return result;
      }
      if (this.input[this.position] !== ",") throw new ProviderSafetyError("The provider JSON object is missing a comma.");
      this.position += 1;
    }
    throw new ProviderSafetyError("The provider JSON object is unterminated.");
  }

  private parseArray(depth: number): LosslessJsonValue[] {
    this.position += 1;
    const result: LosslessJsonValue[] = [];
    this.skipWhitespace();
    if (this.input[this.position] === "]") {
      this.position += 1;
      return result;
    }
    while (this.position < this.input.length) {
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      if (this.input[this.position] === "]") {
        this.position += 1;
        return result;
      }
      if (this.input[this.position] !== ",") throw new ProviderSafetyError("The provider JSON array is missing a comma.");
      this.position += 1;
    }
    throw new ProviderSafetyError("The provider JSON array is unterminated.");
  }

  private parseString(): string {
    const start = this.position;
    this.position += 1;
    let escaped = false;
    while (this.position < this.input.length) {
      const char = this.input[this.position];
      if (!escaped && char === '"') {
        const raw = this.input.slice(start, this.position + 1);
        this.position += 1;
        try {
          return JSON.parse(raw) as string;
        } catch {
          throw new ProviderSafetyError("The provider JSON response contains an invalid string.");
        }
      }
      if (!escaped && char.charCodeAt(0) < 0x20) throw new ProviderSafetyError("The provider JSON response contains a control character.");
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      this.position += 1;
    }
    throw new ProviderSafetyError("The provider JSON string is unterminated.");
  }

  private skipWhitespace(): void {
    while (/\s/u.test(this.input[this.position] ?? "")) this.position += 1;
  }
}

export function parseLosslessJson(input: string): LosslessJsonValue {
  if (typeof input !== "string" || input.length === 0 || input.length > 4_194_304) {
    throw new ProviderSafetyError("The provider JSON response is outside the bounded response contract.");
  }
  return new LosslessJsonParser(input).parse();
}

export function isLosslessJsonNumber(value: unknown): value is LosslessJsonNumber {
  return value instanceof LosslessJsonNumber;
}

function losslessRecord(value: unknown): Record<string, LosslessJsonValue> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof LosslessJsonNumber)
    ? value as Record<string, LosslessJsonValue>
    : null;
}

function losslessString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function losslessNumberLexeme(value: unknown): string | null {
  if (value instanceof LosslessJsonNumber) return value.raw;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  return null;
}

export type ParsedDecimal = {
  raw: string;
  coefficient: bigint;
  scale: number;
  canonical: string;
  micros: bigint;
};

/** Parse an unsigned JSON decimal lexeme without floating-point arithmetic. */
export function parseLosslessDecimal(raw: string, options: { maxFractionDigits?: number } = {}): ParsedDecimal {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 128 || !/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(raw)) {
    throw new ProviderSafetyError("The provider cost is not a valid non-negative JSON decimal.");
  }
  if (raw.startsWith("-")) throw new ProviderSafetyError("Negative provider costs are not allowed.");
  const exponentMarker = raw.search(/[eE]/u);
  const base = exponentMarker === -1 ? raw : raw.slice(0, exponentMarker);
  const exponent = exponentMarker === -1 ? 0 : Number(raw.slice(exponentMarker + 1));
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 18) throw new ProviderSafetyError("The provider cost exponent is outside the bounded range.");
  const dot = base.indexOf(".");
  const integerPart = dot === -1 ? base : base.slice(0, dot);
  const fractionPart = dot === -1 ? "" : base.slice(dot + 1);
  if (options.maxFractionDigits !== undefined && fractionPart.length > options.maxFractionDigits) {
    throw new ProviderSafetyError("The provider price has too many fractional USD digits.");
  }
  const digits = `${integerPart}${fractionPart}`;
  const nonZeroDigits = digits.replace(/^0+/u, "");
  if (nonZeroDigits.length > 38) throw new ProviderSafetyError("The provider cost coefficient is too large.");
  const coefficient = nonZeroDigits ? BigInt(nonZeroDigits) : BigInt(0);
  if (coefficient === BigInt(0) && raw.startsWith("-")) throw new ProviderSafetyError("Negative zero provider costs are not allowed.");
  const scale = fractionPart.length - exponent;
  const normalizedCoefficient = scale < 0 ? coefficient * (BigInt(10) ** BigInt(-scale)) : coefficient;
  const normalizedScale = Math.max(scale, 0);
  let canonical = normalizedCoefficient.toString();
  if (normalizedCoefficient === BigInt(0)) canonical = "0";
  else if (normalizedScale > 0) {
    canonical = canonical.padStart(normalizedScale + 1, "0");
    const split = canonical.length - normalizedScale;
    canonical = `${canonical.slice(0, split)}.${canonical.slice(split)}`.replace(/0+$/u, "").replace(/\.$/u, "");
  }
  const microsScale = normalizedScale - 6;
  const numerator = normalizedCoefficient;
  let micros: bigint;
  if (microsScale <= 0) micros = numerator * (BigInt(10) ** BigInt(-microsScale));
  else {
    const denominator = BigInt(10) ** BigInt(microsScale);
    micros = numerator / denominator + (numerator % denominator === BigInt(0) ? BigInt(0) : BigInt(1));
  }
  return { raw, coefficient: normalizedCoefficient, scale: normalizedScale, canonical, micros };
}

export function decimalMicros(raw: string, options: { maxFractionDigits?: number } = {}): bigint {
  return parseLosslessDecimal(raw, options).micros;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  const raw = losslessNumberLexeme(value);
  if (!raw || !/^(?:0|[1-9]\d*)$/u.test(raw)) throw new ProviderSafetyError(`${field} is missing or invalid.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new ProviderSafetyError(`${field} is outside the safe integer range.`);
  return parsed;
}

function asString(value: unknown, field: string): string {
  const parsed = losslessString(value);
  if (!parsed?.trim()) throw new ProviderSafetyError(`${field} is missing.`);
  return parsed;
}

function exactMaxPrice(value: unknown): OpenRouterMaxPrice {
  const object = value as Record<string, unknown> | null;
  if (!object || Object.keys(object).sort().join(",") !== "completion,image,prompt,request") {
    throw new ProviderSafetyError("OpenRouter max_price must contain only prompt, completion, request, and image.");
  }
  const result = {
    prompt: asString(object.prompt, "max_price.prompt"),
    completion: asString(object.completion, "max_price.completion"),
    request: asString(object.request, "max_price.request"),
    image: asString(object.image, "max_price.image"),
  };
  for (const [key, price] of Object.entries(result)) {
    parseLosslessDecimal(price, { maxFractionDigits: 6 });
    if (key === "request" || key === "image") {
      if (price !== "0") throw new ProviderSafetyError(`max_price.${key} must be exactly zero for this release.`);
    }
  }
  if (result.prompt !== OPENROUTER_MAX_PRICE.prompt || result.completion !== OPENROUTER_MAX_PRICE.completion) {
    throw new ProviderSafetyError("OpenRouter max_price drifted from the approved paid release.");
  }
  return result;
}

const BUILTIN_PROVIDER_ALIASES: Record<string, typeof APPROVED_UPSTREAM_PROVIDER_SLUG> = {
  relace: APPROVED_UPSTREAM_PROVIDER_SLUG,
  "relace ai": APPROVED_UPSTREAM_PROVIDER_SLUG,
  "relace (zdr)": APPROVED_UPSTREAM_PROVIDER_SLUG,
};

export function normalizeOpenRouterProviderAlias(value: unknown, manifest?: ProviderReleaseManifest): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const alias = value.trim().toLowerCase();
  const table = manifest?.providerAliasTable ? { ...BUILTIN_PROVIDER_ALIASES, ...manifest.providerAliasTable } : BUILTIN_PROVIDER_ALIASES;
  const normalized = table[alias];
  return normalized === APPROVED_UPSTREAM_PROVIDER_SLUG ? normalized : null;
}

export type OpenRouterDirectMetadata = {
  strategy: "direct";
  pipeline: unknown;
  selectedEndpointJsonPointer: string;
  selectedProvider: typeof APPROVED_UPSTREAM_PROVIDER_SLUG;
  selectedModel: typeof APPROVED_MODEL;
};

function metadataRoot(value: unknown): Record<string, unknown> | null {
  const root = losslessRecord(value);
  if (!root) return null;
  const nested = losslessRecord(root.openrouter_metadata);
  return nested ?? root as Record<string, unknown>;
}

function endpointProvider(value: Record<string, LosslessJsonValue>): unknown {
  return value.provider ?? value.provider_slug ?? value.providerSlug ?? value.provider_name ?? value.upstream_provider ?? value.upstreamProvider ?? value.tag ?? value.slug ?? value.name;
}

function endpointModel(value: Record<string, LosslessJsonValue>): unknown {
  return value.model ?? value.model_slug ?? value.modelSlug ?? value.model_id ?? value.modelId ?? value.requested_model ?? value.requestedModel;
}

/** Validate the post-response direct routing proof. Gateway metadata alone is
 * not accepted as proof of the selected Relace endpoint. */
export function validateOpenRouterDirectMetadata(value: unknown, manifest?: ProviderReleaseManifest): OpenRouterDirectMetadata {
  const root = metadataRoot(value);
  if (!root || root.strategy !== "direct") throw new ProviderSafetyError("OpenRouter response metadata is not a direct route proof.");
  if (root.pipeline !== undefined && !(Array.isArray(root.pipeline) && root.pipeline.length === 0) && root.pipeline !== "") {
    throw new ProviderSafetyError("OpenRouter response metadata contains a disallowed pipeline stage.");
  }
  for (const key of [
    "guardrail",
    "guardrails",
    "plugin",
    "plugins",
    "server_tools",
    "serverTools",
    "response_healing",
    "responseHealing",
    "context_compression",
    "contextCompression",
  ]) {
    const stage = root[key];
    if (stage !== undefined && stage !== null && stage !== false && stage !== "" && !(Array.isArray(stage) && stage.length === 0)) {
      throw new ProviderSafetyError(`OpenRouter response metadata contains a disallowed ${key} stage.`);
    }
  }
  const endpoints = losslessRecord(root.endpoints);
  const available = endpoints?.available;
  if (!Array.isArray(available)) throw new ProviderSafetyError("OpenRouter selected endpoint metadata is missing.");
  const selected = available.filter((entry) => losslessRecord(entry)?.selected === true);
  if (selected.length !== 1) throw new ProviderSafetyError("OpenRouter metadata must identify exactly one selected endpoint.");
  const selectedEntry = losslessRecord(selected[0]);
  if (!selectedEntry) throw new ProviderSafetyError("OpenRouter selected endpoint metadata is malformed.");
  const provider = normalizeOpenRouterProviderAlias(endpointProvider(selectedEntry), manifest);
  const model = endpointModel(selectedEntry);
  if (provider !== APPROVED_UPSTREAM_PROVIDER_SLUG || model !== APPROVED_MODEL) {
    throw new ProviderSafetyError("OpenRouter selected endpoint does not match the approved model/provider pair.");
  }
  const attempts = root.attempts;
  if (!Array.isArray(attempts) || attempts.length === 0) throw new ProviderSafetyError("OpenRouter response attempt metadata is missing.");
  for (const entry of attempts) {
    const attempt = losslessRecord(entry);
    if (!attempt) throw new ProviderSafetyError("OpenRouter response attempt metadata is malformed.");
    const failed = attempt.success === false || attempt.status === "failed" || attempt.state === "failed" || attempt.error !== undefined;
    if (failed) continue;
    const attemptProvider = normalizeOpenRouterProviderAlias(endpointProvider(attempt), manifest);
    const attemptModel = endpointModel(attempt);
    if (attemptProvider !== APPROVED_UPSTREAM_PROVIDER_SLUG || attemptModel !== APPROVED_MODEL) {
      throw new ProviderSafetyError("OpenRouter successful attempt metadata drifted from the approved pair.");
    }
  }
  const selectedIndex = available.indexOf(selected[0]);
  return {
    strategy: "direct",
    pipeline: root.pipeline,
    selectedEndpointJsonPointer: `/openrouter_metadata/endpoints/available/${selectedIndex}`,
    selectedProvider: APPROVED_UPSTREAM_PROVIDER_SLUG,
    selectedModel: APPROVED_MODEL,
  };
}

export function manifestDigest(manifest: Omit<ProviderReleaseManifest, "manifestDigest">): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

export function validateProviderReleaseManifest(
  manifest: ProviderReleaseManifest | null,
  input: { now?: Date; expectedUpstreamProviderSlug?: string; expectedEndpointMetadataDigest?: string; requireToolCalling?: boolean } = {},
): ProviderReleaseManifest {
  if (!manifest) throw new ProviderSafetyError("Provider release manifest is missing.");
  const now = input.now ?? new Date();
  const requiredText = [
    manifest.manifestVersion,
    manifest.upstreamProviderSlug,
    manifest.endpointMetadataDigest,
    manifest.endpointDescriptorHash,
    manifest.sourceUrl,
    manifest.maxPriceSchemaEvidenceReference,
    manifest.maxPriceSchemaEvidenceDigest,
    manifest.canaryEvidenceReference,
    manifest.canaryEvidenceDigest,
    manifest.pricePolicyVersion,
    manifest.inputCertifierId,
    manifest.inputCertifierVersion,
    manifest.finalInputBuilderHash,
    manifest.certifierEvidenceReference,
    manifest.aliasTableVersion,
    manifest.termsEvidenceReference,
    manifest.termsEvidenceDigest,
    manifest.privacyEvidenceReference,
    manifest.privacyEvidenceDigest,
    manifest.residencyDisclosure,
    manifest.approver,
    manifest.manifestDigest,
  ];
  if (requiredText.some((value) => typeof value !== "string" || isPlaceholder(value))) {
    throw new ProviderSafetyError("Provider release evidence is missing or placeholder.");
  }
  if (manifest.releaseState !== "approved") throw new ProviderSafetyError("Provider release is not approved.");
  if (manifest.gateway !== OPENROUTER_GATEWAY || manifest.upstreamProvider !== APPROVED_UPSTREAM_PROVIDER || manifest.model !== APPROVED_MODEL) {
    throw new ProviderSafetyError("Provider gateway/upstream/model tuple is not approved.");
  }
  if (manifest.routingPolicyVersion !== APPROVED_ROUTING_POLICY_VERSION) throw new ProviderSafetyError("Provider routing policy drifted.");
  if ((manifest.routingOptions.kind && manifest.routingOptions.kind !== "production")
    || manifest.routingOptions.provider.only.length !== 1
    || manifest.routingOptions.provider.order.length !== 1
    || manifest.routingOptions.provider.allow_fallbacks !== false
    || manifest.routingOptions.provider.require_parameters !== true
    || manifest.routingOptions.provider.zdr !== true
    || manifest.routingOptions.provider.data_collection !== "deny"
    || manifest.routingOptions.provider.only[0] !== APPROVED_UPSTREAM_PROVIDER_SLUG
    || manifest.routingOptions.provider.order[0] !== APPROVED_UPSTREAM_PROVIDER_SLUG) {
    throw new ProviderSafetyError("Provider routing/privacy controls are not pinned.");
  }
  const maxPrice = exactMaxPrice(manifest.maxPrice);
  if (canonicalJson(manifest.routingOptions.provider.max_price) !== canonicalJson(maxPrice)) {
    throw new ProviderSafetyError("Provider routing max_price does not match the release manifest.");
  }
  if (manifest.pricePolicyVersion !== VERA_PAID_PRICE_POLICY_VERSION) throw new ProviderSafetyError("Provider price policy drifted.");
  const prices = manifest.priceSnapshot;
  if (!prices || prices.currency !== "USD" || prices.cacheWriteAccountingMode !== "included_in_uncached_prompt"
    || prices.reasoningTokenTreatment !== "included_in_completion" || prices.serverToolTreatment !== "disabled") {
    throw new ProviderSafetyError("Provider billable-dimension policy is not pinned.");
  }
  const priceEntries: Array<[string, string]> = [
    ["prompt", prices.promptPriceUsdPerM],
    ["completion", prices.completionPriceUsdPerM],
    ["request", prices.requestPriceUsdPerM],
    ["image", prices.imagePriceUsdPerM],
    ["audio", prices.audioPriceUsdPerM],
    ["cacheRead", prices.cacheReadPriceUsdPerM],
    ["cacheWrite", prices.cacheWritePriceUsdPerM],
  ];
  const parsedPrices = new Map<string, bigint>();
  for (const [name, value] of priceEntries) {
    if (typeof value !== "string" || isPlaceholder(value)) throw new ProviderSafetyError(`Provider ${name} price is missing.`);
    parsedPrices.set(name, decimalMicros(value, { maxFractionDigits: 6 }));
  }
  if (parsedPrices.get("request") !== BigInt(0) || parsedPrices.get("image") !== BigInt(0) || parsedPrices.get("audio") !== BigInt(0)) {
    throw new ProviderSafetyError("Request, image, and audio billing must be disabled for this release.");
  }
  const promptPrice = parsedPrices.get("prompt")!;
  if (parsedPrices.get("cacheRead")! > promptPrice || parsedPrices.get("cacheWrite")! > promptPrice) {
    throw new ProviderSafetyError("Cache prices cannot exceed the prompt price ceiling.");
  }
  if (manifest.inputCertifierId !== VERA_PAID_CERTIFIER_ID || manifest.inputCertifierVersion !== VERA_PAID_CERTIFIER_VERSION) {
    throw new ProviderSafetyError("Provider input certifier is not approved.");
  }
  if (manifest.certifierEvidenceReference !== VERA_CERTIFIER_EVIDENCE_REFERENCE) {
    throw new ProviderSafetyError("Provider certifier evidence reference is not the approved release artifact.");
  }
  const evidence = manifest.certifierEvidence;
  if (!evidence || evidence.fixedFramingTokenBound !== 512 || evidence.serializerId !== VERA_PAID_SERIALIZER_ID
    || evidence.model !== APPROVED_MODEL || evidence.upstreamProviderSlug !== APPROVED_UPSTREAM_PROVIDER_SLUG) {
    throw new ProviderSafetyError("Provider certifier evidence does not identify the exact release tuple.");
  }
  for (const value of [
    evidence.tokenizerRevision,
    evidence.tokenizerHash,
    evidence.chatTemplateHash,
    evidence.byteFallbackProofReference,
    evidence.serializerVersion,
    evidence.producer,
    evidence.artifactHash,
    evidence.signature,
  ]) {
    if (typeof value !== "string" || isPlaceholder(value)) throw new ProviderSafetyError("Provider certifier evidence is missing or placeholder.");
  }
  if (manifest.noTraining !== true || manifest.noContentLogging !== true) throw new ProviderSafetyError("Provider privacy evidence is insufficient.");
  const capability = manifest.toolCallingCapability;
  if (capability && (capability.applicationFunctions !== true
    || capability.toolChoiceAuto !== true
    || capability.plugins !== false
    || capability.serverTools !== false
    || capability.schemaHash !== VERA_CONTEXT_TOOL_SCHEMA_HASH
    || capability.selectorInputBuilderHash !== VERA_AUTOMATIC_SELECTOR_INPUT_BUILDER_HASH
    || capability.finalInputBuilderHash !== VERA_AUTOMATIC_FINAL_INPUT_BUILDER_HASH
    || typeof capability.schemaHash !== "string" || isPlaceholder(capability.schemaHash)
    || typeof capability.selectorInputBuilderHash !== "string" || isPlaceholder(capability.selectorInputBuilderHash)
    || typeof capability.finalInputBuilderHash !== "string" || isPlaceholder(capability.finalInputBuilderHash)
    || typeof capability.evidenceDigest !== "string" || isPlaceholder(capability.evidenceDigest)
    || capability.evidenceDigest !== automaticToolCallingCapabilityEvidenceDigest({
      applicationFunctions: capability.applicationFunctions,
      toolChoiceAuto: capability.toolChoiceAuto,
      plugins: capability.plugins,
      serverTools: capability.serverTools,
      schemaHash: capability.schemaHash,
      selectorInputBuilderHash: capability.selectorInputBuilderHash,
      finalInputBuilderHash: capability.finalInputBuilderHash,
    })
    || typeof capability.signature !== "string"
    || isPlaceholder(capability.signature)
    || capability.signature !== `ed25519:${capability.evidenceDigest}`)) {
    throw new ProviderSafetyError("Provider function-tool capability evidence is invalid.");
  }
  if (input.requireToolCalling && (!capability || capability.applicationFunctions !== true || capability.toolChoiceAuto !== true)) {
    throw new ProviderSafetyError("Provider release does not include the approved application function-tool capability.");
  }

  let artifact: Record<string, LosslessJsonValue> | null;
  try {
    artifact = losslessRecord(parseLosslessJson(readFileSync(resolve(process.cwd(), VERA_CERTIFIER_EVIDENCE_REFERENCE), "utf8")));
  } catch {
    throw new ProviderSafetyError("Provider certifier evidence artifact is missing or malformed.");
  }
  if (!artifact || losslessString(artifact.schema) !== "vera.certifier.evidence.v1"
    || losslessString(artifact.certifierId) !== VERA_PAID_CERTIFIER_ID
    || losslessString(artifact.certifierVersion) !== VERA_PAID_CERTIFIER_VERSION
    || losslessString(artifact.tokenizerRevision) !== evidence.tokenizerRevision
    || losslessString(artifact.tokenizerHash) !== evidence.tokenizerHash
    || losslessString(artifact.chatTemplateHash) !== evidence.chatTemplateHash
    || losslessString(artifact.byteFallbackProofReference) !== evidence.byteFallbackProofReference
    || requireNonNegativeInteger(artifact.fixedFramingTokenBound, "certifier.fixedFramingTokenBound") !== evidence.fixedFramingTokenBound
    || losslessString(artifact.serializerId) !== evidence.serializerId
    || losslessString(artifact.serializerVersion) !== evidence.serializerVersion
    || losslessString(artifact.model) !== evidence.model
    || losslessString(artifact.upstreamProviderSlug) !== evidence.upstreamProviderSlug
    || losslessString(artifact.producer) !== evidence.producer
    || losslessString(artifact.artifactHash) !== evidence.artifactHash
    || losslessString(artifact.signature) !== evidence.signature
    || losslessString(artifact.verifiedAt) !== evidence.verifiedAt
    || losslessString(artifact.expiresAt) !== evidence.expiresAt) {
    throw new ProviderSafetyError("Provider certifier evidence artifact does not match the release manifest.");
  }
  const { artifactHash: claimedArtifactHash, signature: artifactSignature, ...artifactPayload } = artifact;
  if (losslessString(artifactSignature) !== evidence.signature
    || losslessString(claimedArtifactHash) !== `sha256:${sha256Hex(canonicalJson(plainJson(artifactPayload as LosslessJsonValue)))}`) {
    throw new ProviderSafetyError("Provider certifier evidence artifact hash or signature is invalid.");
  }
  const verifiedAt = new Date(manifest.verifiedAt);
  const expiresAt = new Date(manifest.expiresAt);
  if (Number.isNaN(verifiedAt.getTime()) || Number.isNaN(expiresAt.getTime())
    || expiresAt <= verifiedAt || expiresAt <= now || verifiedAt > now) {
    throw new ProviderSafetyError("Provider release evidence is expired, future-dated, or invalid.");
  }
  const certifierVerifiedAt = new Date(evidence.verifiedAt);
  const certifierExpiresAt = new Date(evidence.expiresAt);
  if (Number.isNaN(certifierVerifiedAt.getTime()) || Number.isNaN(certifierExpiresAt.getTime())
    || certifierExpiresAt <= certifierVerifiedAt || certifierExpiresAt <= now || certifierVerifiedAt > now) {
    throw new ProviderSafetyError("Provider certifier evidence is expired, future-dated, or invalid.");
  }
  if (input.expectedUpstreamProviderSlug && manifest.upstreamProviderSlug !== input.expectedUpstreamProviderSlug) throw new ProviderSafetyError("Upstream provider slug drifted.");
  if (input.expectedEndpointMetadataDigest && manifest.endpointMetadataDigest !== input.expectedEndpointMetadataDigest) throw new ProviderSafetyError("Endpoint metadata drifted.");

  const { manifestDigest: suppliedDigest, ...withoutDigest } = manifest;
  if (manifestDigest(withoutDigest) !== suppliedDigest) throw new ProviderSafetyError("Provider release manifest digest mismatch.");
  return manifest;
}

export type ProviderManifestActivationEvidence = {
  manifestDigest: string;
  endpointDescriptorHash: string;
  responseSchemaHash: string;
  generationId: string;
  /** Present for automatic-context releases after the required no-tools
   * second canary turn. */
  finalGenerationId?: string;
  selectedEndpointJsonPointer: string;
  verifiedAt: string;
};

/** Optional operational activation check. Route construction is intentionally
 * network-free; deployment tooling calls this function before marking a paid
 * manifest active. */
export async function verifyProviderReleaseManifestLive(input: {
  manifest: ProviderReleaseManifest;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  generationPollDelaysMs?: number[];
  sleepImpl?: (milliseconds: number) => Promise<void>;
}): Promise<ProviderManifestActivationEvidence> {
  const manifest = validateProviderReleaseManifest(input.manifest);
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = (input.baseUrl ?? "https://openrouter.ai").replace(/\/$/u, "");
  const headers = { authorization: `Bearer ${input.apiKey}`, accept: "application/json" };
  const schemaResponse = await fetchImpl(`${baseUrl}/openapi.yaml`, { method: "GET", headers });
  if (!schemaResponse.ok) throw new ProviderSafetyError("OpenRouter schema activation evidence is unavailable.");
  const schemaText = await schemaResponse.text();
  if (!/max_price/u.test(schemaText) || !/require_parameters/u.test(schemaText)) {
    throw new ProviderSafetyError("OpenRouter schema does not support the approved provider policy.");
  }
  const endpointResponse = await fetchImpl(`${baseUrl}/api/v1/models/${encodeURIComponent(manifest.model)}/endpoints?providers=${encodeURIComponent(manifest.upstreamProviderSlug)}&zdr=true`, { method: "GET", headers });
  if (!endpointResponse.ok) throw new ProviderSafetyError("OpenRouter endpoint activation evidence is unavailable.");
  const endpointText = await endpointResponse.text();
  if (sha256Hex(endpointText) !== manifest.endpointDescriptorHash) throw new ProviderSafetyError("OpenRouter endpoint descriptor drifted from the manifest.");
  const endpointJson = parseLosslessJson(endpointText);
  const endpointRoot = losslessRecord(endpointJson);
  const endpointValues = [endpointRoot?.data, endpointRoot?.endpoints, endpointRoot?.available].flatMap((value) => Array.isArray(value) ? value : []);
  if (!endpointValues.some((value) => normalizeOpenRouterProviderAlias(endpointProvider(losslessRecord(value) ?? {}), manifest) === APPROVED_UPSTREAM_PROVIDER_SLUG)) {
    throw new ProviderSafetyError("The approved Relace endpoint is missing from live activation evidence.");
  }
  const canaryProvider = {
    only: [APPROVED_UPSTREAM_PROVIDER_SLUG],
    order: [APPROVED_UPSTREAM_PROVIDER_SLUG],
    allow_fallbacks: false,
    require_parameters: true,
    data_collection: "deny",
    zdr: true,
    max_price: { ...OPENROUTER_MAX_PRICE },
  };
  const canaryBody = {
    model: APPROVED_MODEL,
    messages: [{ role: "user", content: manifest.toolCallingCapability
      ? "Vera release canary. Call the retrieval function with a bounded synthetic query."
      : "Vera release canary. Reply with one token." }],
    stream: false,
    max_completion_tokens: manifest.toolCallingCapability ? 256 : 1,
    ...(manifest.toolCallingCapability ? { tools: [VERA_CONTEXT_TOOL_SCHEMA], tool_choice: "auto" } : {}),
    provider: canaryProvider,
  };
  const canaryResponse = await fetchImpl(`${baseUrl}/api/v1/chat/completions`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
      "x-openrouter-metadata": "enabled",
      "x-openrouter-cache": "false",
    },
    body: JSON.stringify(canaryBody),
  });
  if (!canaryResponse.ok) throw new ProviderSafetyError("OpenRouter paid canary was rejected.");
  const canaryText = await canaryResponse.text();
  const canaryJson = parseLosslessJson(canaryText);
  let finalGenerationId: string | undefined;
  let finalResponseSchemaHash: string | undefined;
  if (manifest.toolCallingCapability) {
    const canaryToolCall = assembleOpenRouterToolCallStream([plainJson(canaryJson)]);
    if (canaryToolCall.name !== VERA_CONTEXT_TOOL_NAME) throw new ProviderSafetyError("OpenRouter function-tool canary returned an unknown function.");
    const canaryArgs = parseRetrieveReleasedLearningContextArgs(JSON.parse(canaryToolCall.arguments) as unknown);
    const syntheticResult = createContextToolResult({ sources: [], limitations: ["synthetic activation canary"] });
    const finalEnvelope = JSON.parse(new TextDecoder().decode(serializeVeraAutomaticFinal({
      systemPolicy: "Synthetic activation canary. Use only the supplied frozen result.",
      userText: "Return one short canary answer.",
      toolCall: canaryToolCall,
      toolResult: syntheticResult,
      maxSerializedBytes: VERA_AUTOMATIC_CONTEXT_BUDGETS.chat_review.exactFinalSerializedInputByteCap,
    }))) as { messages: VeraSerializedMessage[]; tools?: unknown; tool_choice?: unknown };
    if (finalEnvelope.tools !== undefined || finalEnvelope.tool_choice !== undefined) {
      throw new ProviderSafetyError("Automatic final canary serializer re-enabled tools.");
    }
    // Keep the parsed arguments in the activation trace so a malformed
    // provider function response cannot pass merely by naming the function.
    void canaryArgs;
    const finalResponse = await fetchImpl(`${baseUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "x-openrouter-metadata": "enabled",
        "x-openrouter-cache": "false",
      },
      body: JSON.stringify({
        model: APPROVED_MODEL,
        messages: finalEnvelope.messages,
        stream: false,
        max_completion_tokens: 1,
        provider: canaryProvider,
      }),
    });
    if (!finalResponse.ok) throw new ProviderSafetyError("OpenRouter paid final canary was rejected.");
    const finalText = await finalResponse.text();
    const finalJson = parseLosslessJson(finalText);
    const finalRoot = losslessRecord(finalJson);
    const finalChoices = finalRoot?.choices;
    const finalChoice = Array.isArray(finalChoices) ? losslessRecord(finalChoices[0]) : null;
    const finalMessage = losslessRecord(finalChoice?.message);
    if (!finalChoice || finalMessage?.tool_calls !== undefined || typeof losslessString(finalMessage?.content) !== "string") {
      throw new ProviderSafetyError("OpenRouter final canary did not complete a no-tools answer turn.");
    }
    validateOpenRouterDirectMetadata(finalJson, manifest);
    finalResponseSchemaHash = sha256Hex(finalText);
    finalGenerationId = finalResponse.headers.get("x-generation-id")?.trim() || undefined;
    if (!finalGenerationId) throw new ProviderSafetyError("OpenRouter final canary did not return a Generation API identifier.");
    const finalGeneration = await fetchGenerationEvidence({
      generationId: finalGenerationId,
      baseUrl,
      apiKey: input.apiKey,
      fetchImpl,
      pollDelaysMs: input.generationPollDelaysMs ?? [0, 1_000, 2_000, 4_000, 8_000],
      sleepImpl: input.sleepImpl ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))),
      maxResponseBytes: 4_194_304,
    });
    if (!finalGeneration) throw new ProviderSafetyError("OpenRouter final canary generation evidence is unresolved.");
    const finalUsage = usageFromValue(losslessRecord(finalJson)?.usage);
    const finalReconciliation = reconcileOpenRouterGeneration({ generation: finalGeneration, usage: finalUsage, manifest, generationId: finalGenerationId });
    if (finalReconciliation.state !== "known") throw new ProviderSafetyError(`OpenRouter final canary settlement is ${finalReconciliation.state}.`);
  }
  const metadata = validateOpenRouterDirectMetadata(canaryJson, manifest);
  const generationId = canaryResponse.headers.get("x-generation-id")?.trim();
  if (!generationId) throw new ProviderSafetyError("OpenRouter paid canary did not return a Generation API identifier.");
  const generation = await fetchGenerationEvidence({
    generationId,
    baseUrl,
    apiKey: input.apiKey,
    fetchImpl,
    pollDelaysMs: input.generationPollDelaysMs ?? [0, 1_000, 2_000, 4_000, 8_000],
    sleepImpl: input.sleepImpl ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))),
    maxResponseBytes: 4_194_304,
  });
  if (!generation) throw new ProviderSafetyError("OpenRouter paid canary generation evidence is unresolved.");
  const usage = usageFromValue(losslessRecord(canaryJson)?.usage);
  const reconciliation = reconcileOpenRouterGeneration({ generation, usage, manifest, generationId });
  if (reconciliation.state !== "known") throw new ProviderSafetyError(`OpenRouter paid canary settlement is ${reconciliation.state}.`);
  return {
    manifestDigest: manifest.manifestDigest,
    endpointDescriptorHash: sha256Hex(endpointText),
    responseSchemaHash: sha256Hex(canaryText),
    generationId: reconciliation.generationId ?? generationId,
    ...(finalGenerationId ? { finalGenerationId, finalResponseSchemaHash } : {}),
    selectedEndpointJsonPointer: metadata.selectedEndpointJsonPointer,
    verifiedAt: new Date().toISOString(),
  };
}

export type OpenRouterUsageDetails = {
  prompt_tokens: unknown;
  completion_tokens: unknown;
  prompt_tokens_details?: unknown;
  cost?: unknown;
  cost_details?: unknown;
  usage_is_estimated?: unknown;
};

export type OpenRouterUsageCost = {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  uncachedOrWriteTokens: number;
  reasoningTokens: number;
  recomputedCostMicros: bigint;
};

function priceSnapshotFor(manifestOrSnapshot: ProviderReleaseManifest | ProviderPriceSnapshot): ProviderPriceSnapshot {
  return "priceSnapshot" in manifestOrSnapshot ? manifestOrSnapshot.priceSnapshot : manifestOrSnapshot;
}

/** Compute the exact release price using Relace's non-additive cache-write
 * accounting. The one upward rounding is deliberately performed after all
 * token dimensions have been summed. */
export function calculateOpenRouterUsageCostMicros(input: {
  usage: OpenRouterUsageDetails;
  manifest: ProviderReleaseManifest | ProviderPriceSnapshot;
}): OpenRouterUsageCost {
  const prices = priceSnapshotFor(input.manifest);
  const promptTokens = requireNonNegativeInteger(input.usage.prompt_tokens, "usage.prompt_tokens");
  const completionTokens = requireNonNegativeInteger(input.usage.completion_tokens, "usage.completion_tokens");
  const details = losslessRecord(input.usage.prompt_tokens_details);
  if (!details) throw new ProviderSafetyError("usage.prompt_tokens_details is missing.");
  const cachedTokens = requireNonNegativeInteger(details.cached_tokens, "usage.prompt_tokens_details.cached_tokens");
  if (cachedTokens > promptTokens) throw new ProviderSafetyError("Cached prompt tokens exceed prompt tokens.");
  const cacheWriteRaw = details.cache_write_tokens;
  const cacheWriteTokens = cacheWriteRaw === undefined
    ? 0
    : requireNonNegativeInteger(cacheWriteRaw, "usage.prompt_tokens_details.cache_write_tokens");
  const explicitUncachedRaw = details.uncached_tokens ?? details.uncached_prompt_tokens;
  const reasoningTokens = details.reasoning_tokens === undefined
    ? 0
    : requireNonNegativeInteger(details.reasoning_tokens, "usage.prompt_tokens_details.reasoning_tokens");
  let uncachedOrWriteTokens = promptTokens - cachedTokens;
  if (prices.cacheWriteAccountingMode === "explicit") {
    uncachedOrWriteTokens = explicitUncachedRaw === undefined
      ? promptTokens - cachedTokens - cacheWriteTokens
      : requireNonNegativeInteger(explicitUncachedRaw, "usage.prompt_tokens_details.uncached_tokens");
    if (promptTokens !== uncachedOrWriteTokens + cachedTokens + cacheWriteTokens) {
      throw new ProviderSafetyError("Explicit cache-write accounting does not reconcile prompt tokens.");
    }
  } else if (prices.cacheWriteAccountingMode === "included_in_uncached_prompt") {
    if (cacheWriteTokens > uncachedOrWriteTokens) throw new ProviderSafetyError("Cache-write tokens exceed the uncached prompt quantity.");
  } else if (cachedTokens > 0 || cacheWriteTokens > 0) {
    throw new ProviderSafetyError("The provider reported unsupported cache tokens.");
  }
  const promptPriceMicros = decimalMicros(prices.promptPriceUsdPerM, { maxFractionDigits: 6 });
  const completionPriceMicros = decimalMicros(prices.completionPriceUsdPerM, { maxFractionDigits: 6 });
  const cacheReadPriceMicros = decimalMicros(prices.cacheReadPriceUsdPerM, { maxFractionDigits: 6 });
  const cacheWritePriceMicros = decimalMicros(prices.cacheWritePriceUsdPerM, { maxFractionDigits: 6 });
  let numerator = BigInt(uncachedOrWriteTokens) * promptPriceMicros
    + BigInt(cachedTokens) * cacheReadPriceMicros
    + BigInt(completionTokens) * completionPriceMicros;
  if (prices.cacheWriteAccountingMode === "explicit") numerator += BigInt(cacheWriteTokens) * cacheWritePriceMicros;
  const recomputedCostMicros = (numerator + BigInt(999_999)) / BigInt(1_000_000);
  return { promptTokens, completionTokens, cachedTokens, cacheWriteTokens, uncachedOrWriteTokens, reasoningTokens, recomputedCostMicros };
}

export type OpenRouterGenerationReconciliation = {
  state: "known" | "unknown" | "overrun";
  reason?: string;
  generationId: string | null;
  providerRequestId: string | null;
  upstreamId: string | null;
  providerName: string | null;
  reportedCostMicros: bigint | null;
  recomputedCostMicros: bigint | null;
  rawReportedCostDecimal: string | null;
  canonicalReportedCostDecimal: string | null;
  usage: OpenRouterUsageCost | null;
};

function generationDataRoot(value: unknown): Record<string, LosslessJsonValue> | null {
  const root = losslessRecord(value);
  const data = root ? losslessRecord(root.data) : null;
  return data ?? root;
}

function directCostLexemes(usage: OpenRouterUsageDetails): string[] {
  const values: string[] = [];
  const direct = losslessNumberLexeme(usage.cost);
  if (direct !== null) values.push(direct);
  const details = losslessRecord(usage.cost_details);
  if (details) {
    for (const key of ["total_cost", "total", "cost"]) {
      const candidate = losslessNumberLexeme(details[key]);
      if (candidate !== null) values.push(candidate);
    }
  }
  return values;
}

/** Reconcile a Generation API record against the direct usage object. Missing
 * evidence remains unknown; a cost mismatch is an explicit pricing overrun. */
export function reconcileOpenRouterGeneration(input: {
  generation: unknown;
  usage: OpenRouterUsageDetails | null;
  manifest: ProviderReleaseManifest;
  generationId?: string | null;
}): OpenRouterGenerationReconciliation {
  const data = generationDataRoot(input.generation);
  const generationId = losslessString(data?.id) ?? null;
  const providerName = losslessString(data?.provider_name);
  const upstreamId = losslessString(data?.upstream_id);
  const providerRequestId = losslessString(data?.request_id);
  if (!data || !generationId || !providerName || !upstreamId || !providerRequestId) {
    return { state: "unknown", reason: "generation_identity_missing", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: null, recomputedCostMicros: null, rawReportedCostDecimal: null, canonicalReportedCostDecimal: null, usage: null };
  }
  if (input.generationId && generationId !== input.generationId) {
    return { state: "unknown", reason: "generation_id_mismatch", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: null, recomputedCostMicros: null, rawReportedCostDecimal: null, canonicalReportedCostDecimal: null, usage: null };
  }
  const generationTokenFields = [
    "tokens_prompt",
    "tokens_completion",
    "native_tokens_prompt",
    "native_tokens_completion",
    "native_tokens_reasoning",
  ] as const;
  let generationTokens: Record<typeof generationTokenFields[number], number>;
  try {
    generationTokens = Object.fromEntries(generationTokenFields.map((field) => [field, requireNonNegativeInteger(data[field], `generation.${field}`)])) as Record<typeof generationTokenFields[number], number>;
  } catch {
    return { state: "unknown", reason: "generation_usage_fields_missing", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: null, recomputedCostMicros: null, rawReportedCostDecimal: null, canonicalReportedCostDecimal: null, usage: null };
  }
  const generationModel = losslessString(data.model) ?? losslessString(data.model_name);
  if (generationModel !== null && generationModel !== APPROVED_MODEL) {
    return { state: "overrun", reason: "generation_model_mismatch", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: null, recomputedCostMicros: null, rawReportedCostDecimal: null, canonicalReportedCostDecimal: null, usage: null };
  }
  if (normalizeOpenRouterProviderAlias(providerName, input.manifest) !== APPROVED_UPSTREAM_PROVIDER_SLUG) {
    return { state: "overrun", reason: "provider_identity_mismatch", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: null, recomputedCostMicros: null, rawReportedCostDecimal: null, canonicalReportedCostDecimal: null, usage: null };
  }
  const rawCost = losslessNumberLexeme(data.total_cost);
  if (!rawCost) {
    return { state: "unknown", reason: "generation_total_cost_missing", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: null, recomputedCostMicros: null, rawReportedCostDecimal: null, canonicalReportedCostDecimal: null, usage: null };
  }
  let reported: ParsedDecimal;
  try {
    reported = parseLosslessDecimal(rawCost);
  } catch {
    return { state: "overrun", reason: "generation_total_cost_invalid", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: null, recomputedCostMicros: null, rawReportedCostDecimal: rawCost, canonicalReportedCostDecimal: null, usage: null };
  }
  if (!input.usage) {
    return { state: "unknown", reason: "direct_usage_missing", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: reported.micros, recomputedCostMicros: null, rawReportedCostDecimal: rawCost, canonicalReportedCostDecimal: reported.canonical, usage: null };
  }
  let usage: OpenRouterUsageCost;
  try {
    usage = calculateOpenRouterUsageCostMicros({ usage: input.usage, manifest: input.manifest });
  } catch {
    return { state: "overrun", reason: "usage_pricing_violation", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: reported.micros, recomputedCostMicros: null, rawReportedCostDecimal: rawCost, canonicalReportedCostDecimal: reported.canonical, usage: null };
  }
  usage = { ...usage, reasoningTokens: generationTokens.native_tokens_reasoning };
  if (usage.promptTokens !== generationTokens.tokens_prompt || usage.completionTokens !== generationTokens.tokens_completion) {
    return { state: "overrun", reason: "generation_usage_mismatch", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: reported.micros, recomputedCostMicros: usage.recomputedCostMicros, rawReportedCostDecimal: rawCost, canonicalReportedCostDecimal: reported.canonical, usage };
  }
  if (input.usage.usage_is_estimated === true) {
    return { state: "unknown", reason: "usage_estimated", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: reported.micros, recomputedCostMicros: usage.recomputedCostMicros, rawReportedCostDecimal: rawCost, canonicalReportedCostDecimal: reported.canonical, usage };
  }
  const directCostMismatch = directCostLexemes(input.usage).some((lexeme) => {
    try {
      return parseLosslessDecimal(lexeme).micros !== reported.micros;
    } catch {
      return true;
    }
  });
  if (directCostMismatch || usage.recomputedCostMicros !== reported.micros) {
    return { state: "overrun", reason: "pricing_violation", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: reported.micros, recomputedCostMicros: usage.recomputedCostMicros, rawReportedCostDecimal: rawCost, canonicalReportedCostDecimal: reported.canonical, usage };
  }
  return { state: "known", generationId, providerRequestId, upstreamId, providerName, reportedCostMicros: reported.micros, recomputedCostMicros: usage.recomputedCostMicros, rawReportedCostDecimal: rawCost, canonicalReportedCostDecimal: reported.canonical, usage };
}

export const calculateProviderUsageCostMicros = calculateOpenRouterUsageCostMicros;
export const parseOpenRouterGenerationEvidence = reconcileOpenRouterGeneration;

export function estimateVeraQuotaUnits(input: {
  taskBytes: Uint8Array;
  inputProtocolOverheadUnits: number;
  systemOverheadUnits: number;
  toolOverheadUnits: number;
  contextOverheadUnits: number;
  retryOverheadUnits: number;
  hardOutputQuotaUnits: number;
  maxProviderAttempts?: number;
}): CertifiedQuotaEstimate {
  const attempts = input.maxProviderAttempts ?? VERA_MAX_PROVIDER_ATTEMPTS;
  if (attempts !== VERA_MAX_PROVIDER_ATTEMPTS) throw new ProviderSafetyError("Provider attempt budget is not certified.");
  if (!(input.taskBytes instanceof Uint8Array)) throw new ProviderSafetyError("Provider task bytes are not a certified byte sequence.");
  if (!Number.isInteger(input.hardOutputQuotaUnits) || input.hardOutputQuotaUnits < 1) {
    throw new ProviderSafetyError("Provider hard output quota is invalid.");
  }
  for (const overhead of [
    input.inputProtocolOverheadUnits,
    input.systemOverheadUnits,
    input.toolOverheadUnits,
    input.contextOverheadUnits,
    input.retryOverheadUnits,
  ]) {
    if (!Number.isInteger(overhead) || overhead < 0) throw new ProviderSafetyError("Provider estimator overhead is invalid.");
  }
  // One UTF-8 byte is the certified universal upper bound for one tokenizer
  // unit. Never divide bytes or trust a caller-supplied tokenizer label.
  const byteBound = input.taskBytes.byteLength;
  const inputUpperBound = byteBound
    + input.inputProtocolOverheadUnits
    + input.systemOverheadUnits
    + input.toolOverheadUnits
    + input.contextOverheadUnits
    + input.retryOverheadUnits;
  const outputUpperBound = input.hardOutputQuotaUnits;
  return {
    inputUpperBound,
    outputUpperBound,
    reservationBound: inputUpperBound + outputUpperBound,
    certified: true,
    basis: "universal-byte-bound",
    certificationMethod: VERA_CERTIFIED_ESTIMATOR_VERSION,
    maxProviderAttempts: 2,
  };
}

function deriveCertifiedEstimate(task: ProviderTask): CertifiedQuotaEstimate {
  const derived = estimateVeraQuotaUnits({
    taskBytes: task.taskBytes,
    ...VERA_ESTIMATOR_OVERHEAD,
    hardOutputQuotaUnits: task.hardOutputQuotaUnits,
  });
  if (task.certifiedEstimate && JSON.stringify(task.certifiedEstimate) !== JSON.stringify(derived)) {
    throw new ProviderSafetyError("Caller provider quota evidence does not match the certified adapter bound.");
  }
  return derived;
}

/** The certified estimator is shared by every provider adapter, including the
 * explicitly non-production free-router POC bridge. */
export function certifyVeraProviderTask(task: ProviderTask): CertifiedQuotaEstimate {
  return deriveCertifiedEstimate(task);
}

export type OpenRouterPaidTransportOptions = {
  apiKey: string;
  manifest: ProviderReleaseManifest;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  generationPollDelaysMs?: number[];
  sleepImpl?: (milliseconds: number) => Promise<void>;
  dispatchHooks?: ProviderDispatchHooks;
};

type OpenRouterTransportResponse = {
  text: string;
  structured: unknown | null;
  toolCall?: VeraFunctionToolCall;
  finishReason: string | null;
  usage: OpenRouterUsageDetails | null;
  body: LosslessJsonValue | null;
  responseId: string | null;
};

function plainJson(value: LosslessJsonValue): unknown {
  if (value instanceof LosslessJsonNumber) return Number(value.raw);
  if (Array.isArray(value)) return value.map((item) => plainJson(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plainJson(item)]));
  }
  return value;
}

type DecodedProviderTaskPayload = {
  prompt: string;
  automaticRequest: VeraAutomaticSerializedRequest | null;
};

function decodeProviderTaskPayload(task: ProviderTask): DecodedProviderTaskPayload {
  if (!(task.taskBytes instanceof Uint8Array) || task.taskBytes.byteLength < 1) {
    throw new ProviderSafetyError("The paid provider task has no certified input bytes.");
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(task.taskBytes);
  } catch {
    throw new ProviderSafetyError("The paid provider task is not valid UTF-8.");
  }
  try {
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ProviderSafetyError("The paid provider task envelope is not an object.");
    const stage = parsed.stage;
    const automatic = stage === "context_selection" || stage === "answer";
    const prohibitedKeys = new Set([
      "audio",
      "audio_url",
      "audioUrl",
      "image",
      "images",
      "image_url",
      "imageUrl",
      "input_audio",
      "input_image",
      "toolChoice",
      "server_tools",
      "serverTools",
      "plugins",
      "plugin",
      "request_fee",
      "requestFee",
      "request_price",
      "requestPrice",
    ]);
    const scanForProhibitedInput = (value: unknown, depth = 0, root = false): void => {
      if (depth > 8 || value === null || typeof value !== "object") return;
      if (Array.isArray(value)) {
        for (const item of value) scanForProhibitedInput(item, depth + 1, false);
        return;
      }
      for (const [key, nested] of Object.entries(value)) {
        if (key === "tools" || key === "tool_choice") {
          if (!automatic || !root || (key === "tools" && stage !== "context_selection") || (key === "tool_choice" && stage !== "context_selection")) {
            throw new ProviderSafetyError(`The paid provider task contains unsupported ${key} input.`);
          }
          continue;
        }
        if (prohibitedKeys.has(key)) throw new ProviderSafetyError(`The paid provider task contains unsupported ${key} input.`);
        if (key === "type" && typeof nested === "string" && /^(?:image|audio|input_image|input_audio|image_url|audio_url)$/u.test(nested)) {
          throw new ProviderSafetyError(`The paid provider task contains unsupported ${nested} input.`);
        }
        scanForProhibitedInput(nested, depth + 1, false);
      }
    };
    scanForProhibitedInput(parsed, 0, true);
    if (automatic) {
      if (parsed.serializerId !== VERA_AUTOMATIC_SELECTOR_SERIALIZER_ID && parsed.serializerId !== VERA_AUTOMATIC_FINAL_SERIALIZER_ID) {
        throw new ProviderSafetyError("Automatic provider serializer identity is not approved.");
      }
      if (parsed.serializerVersion !== VERA_AUTOMATIC_SERIALIZER_VERSION) throw new ProviderSafetyError("Automatic provider serializer version drifted.");
      const messages = parsed.messages;
      if (!Array.isArray(messages) || messages.length < 2) throw new ProviderSafetyError("Automatic provider messages are missing.");
      if (stage === "answer" && ("tools" in parsed || "tool_choice" in parsed)) throw new ProviderSafetyError("Final automatic provider input must disable tools.");
      if (stage === "context_selection") {
        if (canonicalJson(parsed.tools) !== canonicalJson([VERA_CONTEXT_TOOL_SCHEMA]) || parsed.tool_choice !== "auto") {
          throw new ProviderSafetyError("Automatic selector tool capability drifted.");
        }
      }
      return { prompt: "", automaticRequest: parsed as unknown as VeraAutomaticSerializedRequest };
    }
    if (typeof parsed.userText === "string" && parsed.userText.trim()) return { prompt: parsed.userText, automaticRequest: null };
  } catch (error) {
    if (error instanceof ProviderSafetyError) throw error;
    if (/^\s*\{[\s\S]*"stage"\s*:\s*"(?:context_selection|answer)"/u.test(decoded)) {
      throw new ProviderSafetyError("Automatic provider task envelope is malformed.");
    }
    // Opaque task bytes are retained for a direct task caller. Context-pack
    // callers use the normalized userText property above.
  }
  if (!decoded.trim()) throw new ProviderSafetyError("The paid provider task is empty.");
  return { prompt: decoded, automaticRequest: null };
}

function positiveOutputLimit(task: ProviderTask): number {
  if (!Number.isSafeInteger(task.hardOutputQuotaUnits) || task.hardOutputQuotaUnits < 1) {
    throw new ProviderSafetyError("The paid provider output cap is invalid.");
  }
  return task.hardOutputQuotaUnits;
}

function providerRequestKeyFor(prepared: PreparedProviderTask): string {
  const task = prepared.preparedTask;
  if (task.providerRequestKey?.trim()) return task.providerRequestKey.trim();
  const requestIdentity = task.requestId?.trim() || prepared.providerTaskDigest;
  const attemptNo = task.attemptNo ?? 1;
  if (!Number.isSafeInteger(attemptNo) || attemptNo < 1 || attemptNo > VERA_MAX_PROVIDER_ATTEMPTS) {
    throw new ProviderSafetyError("The paid provider attempt number is invalid.");
  }
  return sha256Hex(`vera-provider-request-key-v1:${requestIdentity}:${attemptNo}`);
}

function dispatchDeadlineFor(prepared: PreparedProviderTask, now = new Date()): string {
  const fromTask = prepared.dispatchDeadlineAt ?? prepared.preparedTask.dispatchDeadlineAt;
  if (!fromTask) throw new ProviderExecutionError({ code: "dispatch_deadline_missing" });
  const parsed = new Date(fromTask);
  if (Number.isNaN(parsed.getTime())) {
    throw new ProviderExecutionError({ code: "dispatch_deadline_invalid" });
  }
  if (parsed <= now) {
    throw new ProviderExecutionError({ code: "dispatch_deadline_expired" });
  }
  return parsed.toISOString();
}

export function buildOpenRouterPaidRequest(input: {
  prepared: PreparedProviderTask;
  providerRequestKey: string;
}): Record<string, unknown> {
  if (input.prepared.routingOptions.kind === "openrouter_free_poc"
    || input.prepared.upstreamProvider !== APPROVED_UPSTREAM_PROVIDER
    || input.prepared.upstreamProviderSlug !== APPROVED_UPSTREAM_PROVIDER_SLUG
    || input.prepared.model !== APPROVED_MODEL) {
    throw new ProviderSafetyError("The paid provider request routing tuple drifted.");
  }
  const provider = (input.prepared.routingOptions as ProductionProviderRoutingOptions).provider;
  const decoded = decodeProviderTaskPayload(input.prepared.preparedTask);
  const stagePurpose = input.prepared.stagePurpose ?? input.prepared.preparedTask.stagePurpose;
  const automaticRequest = decoded.automaticRequest;
  if (automaticRequest && stagePurpose !== automaticRequest.stage) {
    throw new ProviderSafetyError("Automatic provider stage purpose does not match the serialized request.");
  }
  const body: Record<string, unknown> = {
    model: APPROVED_MODEL,
    messages: automaticRequest?.messages ?? [{ role: "user", content: decoded.prompt }],
    stream: true,
    max_completion_tokens: positiveOutputLimit(input.prepared.preparedTask),
    stream_options: { include_usage: true },
    provider: {
      only: [APPROVED_UPSTREAM_PROVIDER_SLUG],
      order: [APPROVED_UPSTREAM_PROVIDER_SLUG],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
      max_price: { ...OPENROUTER_MAX_PRICE },
    },
    metadata: { vera_provider_request_key: input.providerRequestKey },
  };
  if (automaticRequest?.stage === "context_selection") {
    body.tools = automaticRequest.tools;
    body.tool_choice = automaticRequest.tool_choice;
  } else if (automaticRequest?.stage === "answer") {
    // Explicitly omit both fields from the final turn. A hidden provider-side
    // tool capability must never widen the server-owned protocol.
    delete body.tools;
    delete body.tool_choice;
  }
  if (provider.max_price && canonicalJson(provider.max_price) !== canonicalJson(OPENROUTER_MAX_PRICE)) {
    throw new ProviderSafetyError("The paid provider request max_price drifted from the approved object.");
  }
  return body;
}

/**
 * Return the exact UTF-8 request body sent by the paid transport. Keeping this
 * byte construction next to buildOpenRouterPaidRequest prevents the durable
 * write-ahead hash from drifting from the bytes handed to fetch().
 */
export function buildOpenRouterPaidRequestBytes(input: {
  prepared: PreparedProviderTask;
  providerRequestKey: string;
}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(buildOpenRouterPaidRequest(input)));
}

function appendBoundedChunk(buffer: string, chunk: string, maxBytes: number): string {
  const next = `${buffer}${chunk}`;
  if (new TextEncoder().encode(next).byteLength > maxBytes) throw new ProviderExecutionError({ code: "provider_response_too_large" });
  return next;
}

function usageFromValue(value: unknown): OpenRouterUsageDetails | null {
  const usage = losslessRecord(value);
  if (!usage) return null;
  return usage as unknown as OpenRouterUsageDetails;
}

export type VeraStreamingToolCallDelta = {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

/** Assemble OpenRouter's fragmented function deltas without accepting a
 * parallel call, a second index, or a different function. */
export function assembleVeraStreamingToolCall(deltas: readonly VeraStreamingToolCallDelta[]): VeraFunctionToolCall {
  if (!Array.isArray(deltas) || deltas.length === 0) throw new ProviderSafetyError("The selector emitted no tool call.");
  const byIndex = new Map<number, { id: string; name: string; arguments: string }>();
  for (const delta of deltas) {
    const index = delta.index ?? 0;
    if (!Number.isSafeInteger(index) || index !== 0) throw new ProviderSafetyError("Parallel automatic tool calls are not supported.");
    const current = byIndex.get(index) ?? { id: "", name: "", arguments: "" };
    if (typeof delta.id === "string" && delta.id) {
      if (current.id && current.id !== delta.id) throw new ProviderSafetyError("Automatic tool-call identity changed mid-stream.");
      current.id = delta.id;
    }
    if (delta.type !== undefined && delta.type !== "function") throw new ProviderSafetyError("Automatic selector emitted a non-function tool call.");
    const functionDelta = delta.function ?? {};
    if (typeof functionDelta.name === "string" && functionDelta.name) {
      if (current.name && current.name !== functionDelta.name) throw new ProviderSafetyError("Automatic tool name changed mid-stream.");
      current.name = functionDelta.name;
    }
    if (functionDelta.arguments !== undefined) {
      if (typeof functionDelta.arguments !== "string") throw new ProviderSafetyError("Automatic tool arguments are not text.");
      current.arguments = appendBoundedChunk(current.arguments, functionDelta.arguments, 8_192);
    }
    byIndex.set(index, current);
    if (byIndex.size > 1) throw new ProviderSafetyError("Parallel automatic tool calls are not supported.");
  }
  const assembled = byIndex.get(0);
  if (!assembled || !assembled.id || assembled.name !== VERA_CONTEXT_TOOL_NAME || !assembled.arguments) {
    throw new ProviderSafetyError("The selector tool call is incomplete or unknown.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(assembled.arguments) as unknown;
  } catch {
    throw new ProviderSafetyError("The selector tool arguments are malformed JSON.");
  }
  const args = parseRetrieveReleasedLearningContextArgs(parsed);
  return { id: assembled.id, name: VERA_CONTEXT_TOOL_NAME, arguments: canonicalContextToolArguments(args) };
}

export function assembleOpenRouterToolCallStream(frames: readonly unknown[]): VeraFunctionToolCall {
  const deltas: VeraStreamingToolCallDelta[] = [];
  for (const frame of frames) {
    const root = frame && typeof frame === "object" ? frame as Record<string, unknown> : {};
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const choice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
    const delta = choice.delta && typeof choice.delta === "object" ? choice.delta as Record<string, unknown> : {};
    const message = choice.message && typeof choice.message === "object" ? choice.message as Record<string, unknown> : {};
    const toolCalls = Array.isArray(delta.tool_calls)
      ? delta.tool_calls
      : Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const value of toolCalls) {
      const call = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const fn = call.function && typeof call.function === "object" ? call.function as Record<string, unknown> : undefined;
      deltas.push({
        index: typeof call.index === "number" ? call.index : undefined,
        id: typeof call.id === "string" ? call.id : undefined,
        type: typeof call.type === "string" ? call.type : undefined,
        function: fn ? {
          name: typeof fn.name === "string" ? fn.name : undefined,
          arguments: typeof fn.arguments === "string" ? fn.arguments : undefined,
        } : undefined,
      });
    }
  }
  return assembleVeraStreamingToolCall(deltas);
}

export const assembleFragmentedToolCall = assembleVeraStreamingToolCall;

async function readOpenRouterResponse(
  response: Response,
  input: { emit?: (delta: ProviderDelta) => void; maxResponseBytes: number; stagePurpose?: "context_selection" | "answer" },
): Promise<OpenRouterTransportResponse> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  let fullText = "";
  let accumulatedText = "";
  let usage: OpenRouterUsageDetails | null = null;
  let body: LosslessJsonValue | null = null;
  let responseMetadata: LosslessJsonValue | undefined;
  let responseId: string | null = null;
  let finishReason: string | null = null;
  const toolCallDeltas: VeraStreamingToolCallDelta[] = [];
  const handleJson = (json: string): void => {
    if (json === "[DONE]") return;
    const value = parseLosslessJson(json);
    const object = losslessRecord(value);
    if (!object) throw new ProviderSafetyError("The OpenRouter response frame is not an object.");
    if (object.error !== undefined) throw new ProviderExecutionError({ code: "provider_error", ambiguousPostSend: true });
    body = value;
    if (object.openrouter_metadata !== undefined) responseMetadata = object.openrouter_metadata;
    responseId = losslessString(object.id) ?? responseId;
    usage = usageFromValue(object.usage) ?? usage;
    const choices = object.choices;
    if (Array.isArray(choices)) {
      const choice = losslessRecord(choices[0]);
      const delta = losslessRecord(choice?.delta);
      const message = losslessRecord(choice?.message);
      const content = losslessString(delta?.content) ?? losslessString(choice?.content) ?? losslessString(message?.content);
      if (content) {
        accumulatedText += content;
        input.emit?.({ text: content, provisional: true });
      }
      const toolCalls = delta?.tool_calls ?? message?.tool_calls;
      if (Array.isArray(toolCalls)) {
        for (const value of toolCalls) {
          const call = losslessRecord(value);
          const fn = losslessRecord(call?.function);
          toolCallDeltas.push({
            index: losslessNumberLexeme(call?.index) === null ? undefined : Number(losslessNumberLexeme(call?.index)),
            id: losslessString(call?.id) ?? undefined,
            type: losslessString(call?.type) ?? undefined,
            function: fn ? { name: losslessString(fn.name) ?? undefined, arguments: losslessString(fn.arguments) ?? undefined } : undefined,
          });
        }
      }
      finishReason = losslessString(choice?.finish_reason) ?? finishReason;
    }
  };

  if (contentType.includes("text/event-stream") && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let sawDone = false;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = decoder.decode(next.value, { stream: true });
      fullText = appendBoundedChunk(fullText, chunk, input.maxResponseBytes);
      pending += chunk;
      const frames = pending.split(/\r?\n\r?\n/u);
      pending = frames.pop() ?? "";
      for (const frame of frames) {
        const dataLines = frame.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
        if (!dataLines.length) continue;
        const data = dataLines.join("\n").trim();
        if (data === "[DONE]") {
          sawDone = true;
          continue;
        }
        handleJson(data);
      }
    }
    const tail = `${pending}${decoder.decode()}`;
    if (tail.trim()) {
      const dataLines = tail.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
      if (dataLines.length) {
        const data = dataLines.join("\n").trim();
        if (data === "[DONE]") sawDone = true;
        else handleJson(data);
      }
    }
    // A body frame is not an acceptance/settlement boundary. OpenRouter SSE
    // streams are complete only after their explicit sentinel; otherwise a
    // socket close can be mistaken for a successful paid generation.
    if (!sawDone) throw new ProviderExecutionError({ code: "provider_stream_incomplete", ambiguousPostSend: true });
  } else {
    fullText = await response.text();
    if (new TextEncoder().encode(fullText).byteLength > input.maxResponseBytes) throw new ProviderExecutionError({ code: "provider_response_too_large" });
    handleJson(fullText);
  }
  if (responseMetadata !== undefined && losslessRecord(body)) {
    body = { ...losslessRecord(body), openrouter_metadata: responseMetadata } as LosslessJsonValue;
  }
  let toolCall: VeraFunctionToolCall | undefined;
  if (toolCallDeltas.length > 0) {
    toolCall = assembleVeraStreamingToolCall(toolCallDeltas);
    if (input.stagePurpose === "answer") throw new ProviderExecutionError({ code: "context_final_tool_violation", ambiguousPostSend: false });
    if (input.stagePurpose === "context_selection" && accumulatedText.trim()) throw new ProviderExecutionError({ code: "context_selection_failed", ambiguousPostSend: false });
  } else if (input.stagePurpose === "context_selection") {
    throw new ProviderExecutionError({ code: "context_selection_failed", ambiguousPostSend: false });
  }
  return { text: accumulatedText, structured: toolCall ?? null, finishReason, usage, body, responseId, toolCall };
}

async function fetchGenerationEvidence(input: {
  generationId: string;
  baseUrl: string;
  apiKey: string;
  fetchImpl: typeof fetch;
  pollDelaysMs: number[];
  sleepImpl: (milliseconds: number) => Promise<void>;
  maxResponseBytes: number;
}): Promise<LosslessJsonValue | null> {
  for (const delay of input.pollDelaysMs) {
    if (delay > 0) await input.sleepImpl(delay);
    let response: Response;
    try {
      response = await input.fetchImpl(`${input.baseUrl}/api/v1/generation?id=${encodeURIComponent(input.generationId)}`, {
        method: "GET",
        headers: { authorization: `Bearer ${input.apiKey}`, accept: "application/json" },
      });
    } catch {
      continue;
    }
    if (response.status === 404 || response.status === 429 || response.status >= 500) continue;
    if (!response.ok) return null;
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > input.maxResponseBytes) return null;
    try {
      return parseLosslessJson(text);
    } catch {
      return null;
    }
  }
  return null;
}

async function emitDispatchEvidence(options: OpenRouterPaidTransportOptions, evidence: ProviderDispatchEvidence): Promise<void> {
  try {
    await options.dispatchHooks?.onDispatchEvidence?.(evidence);
  } catch {
    // Evidence sinks are best-effort hooks and cannot alter transport outcome.
  }
}

export async function executeOpenRouterPaidTransport(
  prepared: PreparedProviderTask,
  options: OpenRouterPaidTransportOptions,
  emit?: (delta: ProviderDelta) => void,
): Promise<ProviderResult> {
  if (!options.apiKey?.trim()) throw new ProviderSafetyError("OpenRouter API key is missing.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://openrouter.ai").replace(/\/$/u, "");
  const maxResponseBytes = options.maxResponseBytes ?? 4_194_304;
  const pollDelaysMs = options.generationPollDelaysMs ?? [1_000, 2_000, 4_000, 8_000];
  const sleepImpl = options.sleepImpl ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const providerRequestKey = providerRequestKeyFor(prepared);
  const requestBodyBytes = buildOpenRouterPaidRequestBytes({ prepared, providerRequestKey });
  const exactPayloadHash = sha256Hex(requestBodyBytes);
  const finalPayloadHash = prepared.finalPayloadHash ?? prepared.preparedTask.finalPayloadHash ?? exactPayloadHash;
  if (finalPayloadHash !== exactPayloadHash) {
    throw new ProviderSafetyError("The paid provider payload digest is not bound to the exact request bytes.");
  }
  const dispatchDeadlineAt = dispatchDeadlineFor(prepared);
  const intent: ProviderDispatchIntent = {
    attemptNo: prepared.preparedTask.attemptNo ?? 1,
    providerRequestKey,
    finalPayloadHash,
    dispatchDeadlineAt,
    gateway: OPENROUTER_GATEWAY,
    upstreamProviderSlug: APPROVED_UPSTREAM_PROVIDER_SLUG,
    model: APPROVED_MODEL,
  };
  try {
    await options.dispatchHooks?.onDispatchIntent?.(intent);
  } catch {
    throw new ProviderExecutionError({ code: "provider_dispatch_intent_failed", retryableBeforeAcceptance: true });
  }
  const headers = {
    authorization: `Bearer ${options.apiKey}`,
    "content-type": "application/json",
    accept: "text/event-stream",
    "x-openrouter-metadata": "enabled",
    "x-openrouter-cache": "false",
    "x-vera-provider-request-key": providerRequestKey,
  };
  // The durable intent hook can take time. Recheck the unchanged persisted
  // deadline immediately before the network call; never mint a new window.
  dispatchDeadlineFor(prepared);
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers,
      body: new TextDecoder().decode(requestBodyBytes),
      signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
    });
  } catch {
    await emitDispatchEvidence(options, { ...intent, state: "unknown", generationId: null, providerRequestId: null, upstreamId: null, observedUpstreamProviderSlug: null, observedAt: new Date().toISOString(), reason: "network_error" });
    throw new ProviderExecutionError({ code: "provider_network_error", ambiguousPostSend: true });
  }
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
    await emitDispatchEvidence(options, { ...intent, state: retryable ? "unknown" : "failed", generationId: null, providerRequestId: null, upstreamId: null, observedUpstreamProviderSlug: null, observedAt: new Date().toISOString(), reason: `http_${response.status}` });
    throw new ProviderExecutionError({ code: `provider_http_${response.status}`, retryableBeforeAcceptance: !retryable, ambiguousPostSend: retryable });
  }
  let parsed: OpenRouterTransportResponse;
  try {
    parsed = await readOpenRouterResponse(response, {
      emit,
      maxResponseBytes,
      stagePurpose: prepared.preparedTask.stagePurpose ?? prepared.stagePurpose,
    });
  } catch (error) {
    await emitDispatchEvidence(options, { ...intent, state: "unknown", generationId: response.headers.get("x-generation-id"), providerRequestId: parsedRequestId(error), upstreamId: null, observedUpstreamProviderSlug: null, observedAt: new Date().toISOString(), reason: "malformed_response" });
    if (error instanceof ProviderExecutionError) throw error;
    throw new ProviderExecutionError({ code: "provider_malformed_response", ambiguousPostSend: true });
  }
  const generationId = response.headers.get("x-generation-id")?.trim() || null;
  if (!generationId) {
    await emitDispatchEvidence(options, { ...intent, state: "unknown", generationId: null, providerRequestId: parsed.responseId, upstreamId: null, observedUpstreamProviderSlug: null, observedAt: new Date().toISOString(), reason: "generation_id_missing" });
    throw new ProviderExecutionError({ code: "provider_generation_id_missing", ambiguousPostSend: true });
  }
  let directMetadata: OpenRouterDirectMetadata;
  try {
    directMetadata = validateOpenRouterDirectMetadata(parsed.body, options.manifest);
  } catch {
    await emitDispatchEvidence(options, { ...intent, state: "unknown", generationId, providerRequestId: parsed.responseId, upstreamId: null, observedUpstreamProviderSlug: null, observedAt: new Date().toISOString(), reason: "metadata_invalid" });
    throw new ProviderExecutionError({ code: "provider_metadata_invalid", ambiguousPostSend: true });
  }
  const generation = await fetchGenerationEvidence({ generationId, baseUrl, apiKey: options.apiKey, fetchImpl, pollDelaysMs, sleepImpl, maxResponseBytes });
  if (!generation) {
    await emitDispatchEvidence(options, { ...intent, state: "unknown", generationId, providerRequestId: parsed.responseId, upstreamId: null, observedUpstreamProviderSlug: directMetadata.selectedProvider, observedAt: new Date().toISOString(), reason: "generation_unresolved" });
    throw new ProviderExecutionError({ code: "provider_generation_unresolved", ambiguousPostSend: true });
  }
  const reconciliation = reconcileOpenRouterGeneration({ generation, usage: parsed.usage, manifest: options.manifest, generationId });
  await emitDispatchEvidence(options, {
    ...intent,
    state: reconciliation.state === "known" ? "sent" : reconciliation.state === "overrun" ? "failed" : "unknown",
    generationId,
    providerRequestId: reconciliation.providerRequestId ?? parsed.responseId,
    upstreamId: reconciliation.upstreamId,
    observedUpstreamProviderSlug: directMetadata.selectedProvider,
    observedAt: new Date().toISOString(),
    reason: reconciliation.reason,
  });
  const failureEvidence: ProviderFailureEvidence = {
    state: reconciliation.state === "overrun" ? "overrun" : "unknown",
    reason: reconciliation.reason ?? "generation_unknown",
    generationId: reconciliation.generationId,
    providerRequestId: reconciliation.providerRequestId,
    upstreamId: reconciliation.upstreamId,
    providerName: reconciliation.providerName,
    reportedCostMicros: reconciliation.reportedCostMicros?.toString() ?? null,
    recomputedCostMicros: reconciliation.recomputedCostMicros?.toString() ?? null,
    rawReportedCostDecimal: reconciliation.rawReportedCostDecimal,
    canonicalReportedCostDecimal: reconciliation.canonicalReportedCostDecimal,
  };
  if (reconciliation.state === "overrun") {
    throw new ProviderExecutionError({ code: "provider_pricing_violation", ambiguousPostSend: false, evidence: failureEvidence });
  }
  if (reconciliation.state !== "known") {
    throw new ProviderExecutionError({ code: `provider_${reconciliation.reason ?? "generation_unknown"}`, ambiguousPostSend: true, evidence: failureEvidence });
  }
  return {
    kind: "text",
    text: parsed.text,
    structured: parsed.structured,
    toolCall: parsed.toolCall,
    usage: reconciliation.usage ? {
      inputTokens: reconciliation.usage.promptTokens,
      outputTokens: reconciliation.usage.completionTokens,
      quotaUnitsConsumed: reconciliation.usage.promptTokens + reconciliation.usage.completionTokens,
      tokenUsageState: reconciliation.state === "known" ? "known" : "unknown",
      cachedTokens: reconciliation.usage.cachedTokens,
      cacheWriteTokens: reconciliation.usage.cacheWriteTokens,
      reasoningTokens: reconciliation.usage.reasoningTokens,
      rawReportedCostDecimal: reconciliation.rawReportedCostDecimal,
      canonicalReportedCostDecimal: reconciliation.canonicalReportedCostDecimal,
      reportedCostMicros: reconciliation.reportedCostMicros?.toString() ?? null,
      recomputedCostMicros: reconciliation.recomputedCostMicros?.toString() ?? null,
    } : { inputTokens: null, outputTokens: null, quotaUnitsConsumed: null, tokenUsageState: "unknown" },
    finishReason: parsed.finishReason,
    attempts: [{
      attemptNo: intent.attemptNo,
      state: reconciliation.state === "known" ? "completed" : reconciliation.state,
      providerRequestRef: reconciliation.providerRequestId ?? parsed.responseId,
      observedUpstreamProviderSlug: directMetadata.selectedProvider,
      errorCode: reconciliation.reason ?? null,
      usage: reconciliation.usage ? {
        inputTokens: reconciliation.usage.promptTokens,
        outputTokens: reconciliation.usage.completionTokens,
        quotaUnitsConsumed: reconciliation.usage.promptTokens + reconciliation.usage.completionTokens,
        tokenUsageState: reconciliation.state === "known" ? "known" : "unknown",
        cachedTokens: reconciliation.usage.cachedTokens,
        cacheWriteTokens: reconciliation.usage.cacheWriteTokens,
        reasoningTokens: reconciliation.usage.reasoningTokens,
        rawReportedCostDecimal: reconciliation.rawReportedCostDecimal,
        canonicalReportedCostDecimal: reconciliation.canonicalReportedCostDecimal,
        reportedCostMicros: reconciliation.reportedCostMicros?.toString() ?? null,
        recomputedCostMicros: reconciliation.recomputedCostMicros?.toString() ?? null,
      } : { inputTokens: null, outputTokens: null, quotaUnitsConsumed: null, tokenUsageState: "unknown" },
      providerRequestKey,
      generationId,
      upstreamId: reconciliation.upstreamId,
      providerRequestId: reconciliation.providerRequestId,
      finalPayloadHash,
      dispatchDeadlineAt,
      rawReportedCostDecimal: reconciliation.rawReportedCostDecimal,
      canonicalReportedCostDecimal: reconciliation.canonicalReportedCostDecimal,
      reportedCostMicros: reconciliation.reportedCostMicros?.toString() ?? null,
      recomputedCostMicros: reconciliation.recomputedCostMicros?.toString() ?? null,
      selectedEndpointJsonPointer: directMetadata.selectedEndpointJsonPointer,
      evidenceObservedAt: new Date().toISOString(),
    }],
    providerMetadata: {
      kind: "openrouter_paid",
      gateway: OPENROUTER_GATEWAY,
      upstreamProvider: APPROVED_UPSTREAM_PROVIDER,
      requestedModel: APPROVED_MODEL,
      selectedModel: directMetadata.selectedModel,
      providerIdentity: directMetadata.selectedProvider,
      dataCollection: "deny",
      zdr: true,
      strategy: "direct",
      selectedEndpointJsonPointer: directMetadata.selectedEndpointJsonPointer,
      generationId,
      upstreamId: reconciliation.upstreamId ?? "unknown",
      providerRequestId: reconciliation.providerRequestId ?? parsed.responseId ?? "unknown",
    },
  };
}

function parsedRequestId(error: unknown): string | null {
  return error instanceof ProviderExecutionError ? null : null;
}

export class OpenRouterDecartAdapter implements VeraProviderAdapter {
  readonly enabled: boolean;
  readonly automaticContextCapable: boolean;
  readonly disabledReason?: string;
  private readonly transport?: (prepared: PreparedProviderTask, emit?: (delta: ProviderDelta) => void) => Promise<ProviderResult>;

  constructor(
    private readonly input: {
      manifest: ProviderReleaseManifest | null;
      quotaPolicyVersion: string;
      expectedUpstreamProviderSlug?: string;
      expectedEndpointMetadataDigest?: string;
      liveEnabled?: boolean;
      transport?: (prepared: PreparedProviderTask, emit?: (delta: ProviderDelta) => void) => Promise<ProviderResult>;
      apiKey?: string;
      baseUrl?: string;
      fetchImpl?: typeof fetch;
      timeoutMs?: number;
      maxResponseBytes?: number;
      generationPollDelaysMs?: number[];
      sleepImpl?: (milliseconds: number) => Promise<void>;
      dispatchHooks?: ProviderDispatchHooks;
    },
  ) {
    this.transport = input.transport ?? (input.apiKey && input.manifest
      ? (prepared, emit) => executeOpenRouterPaidTransport(prepared, {
        apiKey: input.apiKey!,
        manifest: input.manifest!,
        baseUrl: input.baseUrl,
        fetchImpl: input.fetchImpl,
        timeoutMs: input.timeoutMs,
        maxResponseBytes: input.maxResponseBytes,
        generationPollDelaysMs: input.generationPollDelaysMs,
        sleepImpl: input.sleepImpl,
        dispatchHooks: input.dispatchHooks,
      }, emit)
      : undefined);
    try {
      validateProviderReleaseManifest(input.manifest, {
        expectedUpstreamProviderSlug: input.expectedUpstreamProviderSlug,
        expectedEndpointMetadataDigest: input.expectedEndpointMetadataDigest,
      });
      this.enabled = input.liveEnabled === true && Boolean(this.transport);
      this.automaticContextCapable = this.enabled && input.manifest?.toolCallingCapability?.applicationFunctions === true && input.manifest.toolCallingCapability.toolChoiceAuto === true;
      this.disabledReason = this.enabled ? undefined : "Live provider enablement is disabled by the release gate.";
    } catch (error) {
      this.enabled = false;
      this.automaticContextCapable = false;
      this.disabledReason = error instanceof Error ? error.message : "Provider release gate failed.";
    }
  }

  async prepare(task: ProviderTask): Promise<PreparedProviderTask> {
    const manifest = validateProviderReleaseManifest(this.input.manifest, {
      expectedUpstreamProviderSlug: this.input.expectedUpstreamProviderSlug,
      expectedEndpointMetadataDigest: this.input.expectedEndpointMetadataDigest,
      requireToolCalling: task.stagePurpose !== undefined,
    });
    const certifiedEstimate = deriveCertifiedEstimate(task);
    const endpointDigest = manifest.endpointMetadataDigest;
    const providerTaskDigest = sha256Hex(`${endpointDigest}:${task.contextTaskDigest}:${task.featureKey}:${task.behaviorVersion}`);
    const preparedWithoutPayloadHash: PreparedProviderTask = {
      gateway: OPENROUTER_GATEWAY,
      upstreamProvider: APPROVED_UPSTREAM_PROVIDER,
      upstreamProviderSlug: manifest.upstreamProviderSlug,
      model: manifest.model,
      routingPolicyVersion: manifest.routingPolicyVersion,
      endpointMetadataDigest: endpointDigest,
      providerTaskDigest,
      inputQuotaUnitsUpperBound: certifiedEstimate.inputUpperBound,
      outputQuotaUnitsUpperBound: certifiedEstimate.outputUpperBound,
      quotaPolicyVersion: this.input.quotaPolicyVersion,
      hardOutputQuotaUnits: task.hardOutputQuotaUnits,
      maxProviderAttempts: 2,
      preparedTask: task,
      stagePurpose: task.stagePurpose,
      certifiedEstimate,
      manifestDigest: manifest.manifestDigest,
      priceSnapshot: manifest.priceSnapshot,
      pricePolicyVersion: manifest.pricePolicyVersion,
      certifierId: manifest.inputCertifierId,
      certifierVersion: manifest.inputCertifierVersion,
      routingOptions: manifest.routingOptions,
      providerRequestKey: task.providerRequestKey,
      finalPayloadHash: undefined,
      dispatchDeadlineAt: task.dispatchDeadlineAt ? new Date(task.dispatchDeadlineAt).toISOString() : undefined,
    };
    const providerRequestKey = providerRequestKeyFor(preparedWithoutPayloadHash);
    const finalPayloadHash = task.stagePurpose
      ? sha256Hex(buildOpenRouterPaidRequestBytes({ prepared: preparedWithoutPayloadHash, providerRequestKey }))
      : task.finalPayloadHash;
    return {
      ...preparedWithoutPayloadHash,
      finalPayloadHash,
    };
  }

  async run(prepared: PreparedProviderTask, emit?: (delta: ProviderDelta) => void): Promise<ProviderResult> {
    if (!this.enabled || !this.transport) throw new ProviderSafetyError(this.disabledReason ?? "Provider is disabled.");
    const result = await this.transport(prepared, emit);
    if (result.attempts.length === 0 || result.attempts.length > VERA_MAX_PROVIDER_ATTEMPTS) {
      throw new ProviderSafetyError("Provider attempt ceiling exceeded.");
    }
    if (result.attempts.some((attempt, index, attempts) =>
      attempt.attemptNo < 1
      || attempt.attemptNo > VERA_MAX_PROVIDER_ATTEMPTS
      || attempts.some((other, otherIndex) => otherIndex !== index && other.attemptNo === attempt.attemptNo))) {
      throw new ProviderSafetyError("Provider attempt evidence is invalid.");
    }
    if (result.attempts.some((attempt, index) => attempt.state === "ambiguous" && index < result.attempts.length - 1)) {
      throw new ProviderSafetyError("Ambiguous post-send provider attempts cannot be retried.");
    }
    for (const attempt of result.attempts) {
      if (attempt.observedUpstreamProviderSlug === OPENROUTER_GATEWAY) {
        throw new ProviderSafetyError("Gateway identity cannot stand in for observed upstream provider.");
      }
      if (!attempt.observedUpstreamProviderSlug || attempt.observedUpstreamProviderSlug !== prepared.upstreamProviderSlug) {
        throw new ProviderSafetyError("Observed upstream provider drifted from the release manifest.");
      }
    }
    return result;
  }
}

/** Name used by the paid release while retaining the historical class export
 * for callers and dev-only contract tests. */
export const OpenRouterPaidProviderAdapter = OpenRouterDecartAdapter;
export const VeraOpenRouterPaidProviderAdapter = OpenRouterDecartAdapter;

export type MockProviderFault = "outage" | "malformed" | "partial_usage" | "cancelled" | "pre_send_retry" | "ambiguous_timeout";

export class MockProviderAdapter implements VeraProviderAdapter {
  readonly enabled = true;
  /** Mock/free development traffic is never an automatic paid-context
   * capability. The route gate must remain closed even when test env flags
   * request a mock provider. */
  // Tests may still exercise serializer/stage contracts explicitly, but route
  // authority must require the paid, certified release.
  readonly automaticContextCapable = false;
  readonly disabledReason = undefined;
  readonly calls: PreparedProviderTask[] = [];

  constructor(
    private readonly fault: MockProviderFault | null = null,
    private readonly automaticToolArguments: unknown = { query: "Matematika", kinds: ["materi"], maxSources: 2 },
  ) {}

  async prepare(task: ProviderTask): Promise<PreparedProviderTask> {
    const certifiedEstimate = deriveCertifiedEstimate(task);
    return {
      gateway: OPENROUTER_GATEWAY,
      upstreamProvider: APPROVED_UPSTREAM_PROVIDER,
      upstreamProviderSlug: "mock-decart",
      model: APPROVED_MODEL,
      routingPolicyVersion: APPROVED_ROUTING_POLICY_VERSION,
      endpointMetadataDigest: "mock-endpoint",
      providerTaskDigest: sha256Hex(Buffer.from(task.taskBytes)),
      inputQuotaUnitsUpperBound: certifiedEstimate.inputUpperBound,
      outputQuotaUnitsUpperBound: certifiedEstimate.outputUpperBound,
      quotaPolicyVersion: "mock-quota-v1",
      hardOutputQuotaUnits: task.hardOutputQuotaUnits,
      maxProviderAttempts: 2,
      preparedTask: task,
      stagePurpose: task.stagePurpose,
      certifiedEstimate,
      manifestDigest: "mock-release",
      routingOptions: {
        provider: {
          only: ["mock-decart"],
          order: ["mock-decart"],
          allow_fallbacks: false,
          require_parameters: true,
          zdr: true,
          data_collection: "deny",
          max_price: { ...OPENROUTER_MAX_PRICE },
        },
      },
    };
  }

  async run(prepared: PreparedProviderTask, emit?: (delta: ProviderDelta) => void): Promise<ProviderResult> {
    this.calls.push(prepared);
    const automaticStageAttemptNo = prepared.preparedTask.stagePurpose === "answer"
      ? 2
      : prepared.preparedTask.stagePurpose === "context_selection"
        ? 1
        : 1;
    const attemptNo = prepared.preparedTask.stagePurpose ? automaticStageAttemptNo : 1;
    const attempt = (attemptNo: number, state: ProviderAttemptEvidence["state"], errorCode: string | null = null): ProviderAttemptEvidence => ({
      attemptNo,
      state,
      providerRequestRef: `mock-${attemptNo}`,
      observedUpstreamProviderSlug: "mock-decart",
      errorCode,
      usage: { inputTokens: null, outputTokens: null, quotaUnitsConsumed: null, tokenUsageState: "unknown" },
    });
    if (this.fault === "ambiguous_timeout") {
      return { kind: "discarded", text: null, structured: null, usage: { inputTokens: null, outputTokens: null, quotaUnitsConsumed: null, tokenUsageState: "unknown" }, finishReason: "ambiguous_timeout", attempts: [attempt(attemptNo, "ambiguous", "ambiguous_timeout")] };
    }
    if (this.fault === "outage") throw new ProviderExecutionError({ code: "provider_outage", retryableBeforeAcceptance: true });
    if (this.fault === "cancelled") throw new ProviderExecutionError({ code: "cancelled" });
    if (this.fault === "malformed") return { kind: "discarded", text: null, structured: { invalid: true }, usage: { inputTokens: 12, outputTokens: null, quotaUnitsConsumed: 40, tokenUsageState: "unknown" }, finishReason: "malformed", attempts: [attempt(attemptNo, "completed", "malformed_output")] };

    const usage: ProviderUsage = this.fault === "partial_usage"
      ? { inputTokens: null, outputTokens: 4, quotaUnitsConsumed: 200, tokenUsageState: "unknown" }
      : { inputTokens: 12, outputTokens: 16, quotaUnitsConsumed: 40, tokenUsageState: "known" };
    const fixtureJson = process.env.VERA_MOCK_STUDIO_FIXTURE_JSON;
    if (fixtureJson && prepared.preparedTask.featureKey !== "vera.chat") {
      try {
        const fixtures = JSON.parse(fixtureJson) as Record<string, unknown>;
        const structured = fixtures[prepared.preparedTask.featureKey];
        if (structured) {
          const attempts = this.fault === "pre_send_retry" && !prepared.preparedTask.stagePurpose
            ? [attempt(1, "failed", "pre_send_transport"), { ...attempt(2, "completed"), usage }]
            : [{ ...attempt(attemptNo, "completed"), usage }];
          return { kind: "structured", text: null, structured, usage, finishReason: "stop", attempts };
        }
      } catch {
        return { kind: "discarded", text: null, structured: null, usage, finishReason: "malformed_mock_fixture", attempts: [{ ...attempt(attemptNo, "completed", "malformed_mock_fixture"), usage }] };
      }
    }
    if (prepared.preparedTask.stagePurpose === "context_selection") {
      const argumentsJson = canonicalContextToolArguments(this.automaticToolArguments);
      const toolCall: VeraFunctionToolCall = { id: "mock-context-call-1", name: VERA_CONTEXT_TOOL_NAME, arguments: argumentsJson };
      return {
        kind: "structured",
        text: null,
        structured: null,
        toolCall,
        usage,
        finishReason: "tool_calls",
        attempts: this.fault === "pre_send_retry" && !prepared.preparedTask.stagePurpose
          ? [attempt(1, "failed", "pre_send_transport"), { ...attempt(2, "completed"), usage }]
          : [{ ...attempt(attemptNo, "completed"), usage }],
      };
    }
    const text = "Mock Vera response.";
    emit?.({ text, provisional: true });
    const attempts = this.fault === "pre_send_retry" && !prepared.preparedTask.stagePurpose
      ? [attempt(1, "failed", "pre_send_transport"), { ...attempt(2, "completed"), usage }]
      : [{ ...attempt(attemptNo, "completed"), usage }];
    return { kind: "text", text, structured: null, usage, finishReason: "stop", attempts };
  }
}

export class DisabledProviderAdapter implements VeraProviderAdapter {
  readonly enabled = false;
  readonly automaticContextCapable = false;
  readonly disabledReason = "Live provider is disabled until the release manifest gate passes.";

  async prepare(): Promise<PreparedProviderTask> {
    throw new ProviderSafetyError(this.disabledReason);
  }

  async run(): Promise<ProviderResult> {
    throw new ProviderSafetyError(this.disabledReason);
  }
}

export function parseProviderReleaseManifest(raw: string | undefined): ProviderReleaseManifest | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as ProviderReleaseManifest;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function createDefaultProviderAdapter(env: NodeJS.ProcessEnv = process.env): VeraProviderAdapter {
  if (env.VERA_LIVE_PROVIDER_ENABLED !== "true") return new DisabledProviderAdapter();
  const manifest = parseProviderReleaseManifest(env.VERA_PROVIDER_RELEASE_MANIFEST);
  return new OpenRouterPaidProviderAdapter({
    manifest,
    quotaPolicyVersion: env.VERA_QUOTA_POLICY_VERSION?.trim() || "vera-openrouter-paid-v1",
    expectedUpstreamProviderSlug: APPROVED_UPSTREAM_PROVIDER_SLUG,
    liveEnabled: true,
    apiKey: env.OPENROUTER_API_KEY,
    baseUrl: env.OPENROUTER_BASE_URL,
  });
}

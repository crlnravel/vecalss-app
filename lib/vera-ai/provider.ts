import "server-only";

import { createHash } from "node:crypto";

import { VERA_MAX_PROVIDER_ATTEMPTS, canonicalJson, sha256Hex } from "./contracts";

export const OPENROUTER_GATEWAY = "openrouter";
export const APPROVED_UPSTREAM_PROVIDER = "decart";
export const APPROVED_MODEL = "z-ai/glm-5.2:free";
export const APPROVED_ROUTING_POLICY_VERSION = "openrouter-routing-v1";
export const VERA_CERTIFIED_ESTIMATOR_VERSION = "universal-byte-bound-v1";
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

export type ProviderReleaseManifest = {
  manifestVersion: string;
  gateway: "openrouter";
  upstreamProvider: "decart";
  upstreamProviderSlug: string;
  model: string;
  endpointMetadataDigest: string;
  routingPolicyVersion: string;
  routingOptions: ProductionProviderRoutingOptions;
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
  manifestDigest: string;
};

export type ProviderTask = {
  featureKey: string;
  behaviorVersion: string;
  taskBytes: Uint8Array;
  contextTaskDigest: string;
  hardOutputQuotaUnits: number;
  certifiedEstimate?: CertifiedQuotaEstimate;
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
  certifiedEstimate: CertifiedQuotaEstimate;
  manifestDigest: string;
  routingOptions: ProviderRoutingOptions;
};

export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  quotaUnitsConsumed: number | null;
  tokenUsageState: "known" | "unknown" | "not_applicable";
};

export type ProviderAttemptEvidence = {
  attemptNo: number;
  state: "prepared" | "sent" | "accepted" | "completed" | "ambiguous" | "failed";
  providerRequestRef: string | null;
  observedUpstreamProviderSlug: string | null;
  errorCode: string | null;
  usage: ProviderUsage;
};

export type ProviderResult = {
  kind: "text" | "structured" | "fallback" | "discarded";
  text: string | null;
  structured: unknown | null;
  usage: ProviderUsage;
  finishReason: string | null;
  attempts: ProviderAttemptEvidence[];
  providerMetadata?: ProviderResultMetadata;
};

export type ProviderResultMetadata = {
  kind: "openrouter_free_poc";
  gateway: "openrouter";
  upstreamProvider: typeof OPENROUTER_FREE_POC_UPSTREAM_PROVIDER;
  requestedModel: "openrouter/free";
  selectedModel: string;
  providerIdentity: string;
  dataCollection: "allow";
  zdr: false;
};

export type ProviderDelta = { text: string; provisional: true };

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

  constructor(input: { code: string; retryableBeforeAcceptance?: boolean; ambiguousPostSend?: boolean; message?: string }) {
    super(input.message ?? input.code);
    this.name = "ProviderExecutionError";
    this.code = input.code;
    this.retryableBeforeAcceptance = input.retryableBeforeAcceptance ?? false;
    this.ambiguousPostSend = input.ambiguousPostSend ?? false;
  }
}

export interface VeraProviderAdapter {
  readonly enabled: boolean;
  readonly disabledReason?: string;
  prepare(task: ProviderTask): Promise<PreparedProviderTask>;
  run(prepared: PreparedProviderTask, emit?: (delta: ProviderDelta) => void): Promise<ProviderResult>;
}

function isPlaceholder(value: string): boolean {
  return !value.trim() || /^(todo|placeholder|changeme|unknown|pending|example)/i.test(value.trim());
}

export function manifestDigest(manifest: Omit<ProviderReleaseManifest, "manifestDigest">): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

export function validateProviderReleaseManifest(
  manifest: ProviderReleaseManifest | null,
  input: { now?: Date; expectedUpstreamProviderSlug?: string; expectedEndpointMetadataDigest?: string } = {},
): ProviderReleaseManifest {
  if (!manifest) throw new ProviderSafetyError("Provider release manifest is missing.");
  const now = input.now ?? new Date();
  const requiredText = [
    manifest.manifestVersion,
    manifest.upstreamProviderSlug,
    manifest.endpointMetadataDigest,
    manifest.termsEvidenceReference,
    manifest.termsEvidenceDigest,
    manifest.privacyEvidenceReference,
    manifest.privacyEvidenceDigest,
    manifest.residencyDisclosure,
    manifest.approver,
    manifest.manifestDigest,
  ];
  if (requiredText.some(isPlaceholder)) throw new ProviderSafetyError("Provider release evidence is missing or placeholder.");
  if (manifest.releaseState !== "approved") throw new ProviderSafetyError("Provider release is not approved.");
  if (manifest.gateway !== OPENROUTER_GATEWAY || manifest.upstreamProvider !== APPROVED_UPSTREAM_PROVIDER || manifest.model !== APPROVED_MODEL) {
    throw new ProviderSafetyError("Provider gateway/upstream/model tuple is not approved.");
  }
  if (manifest.routingPolicyVersion !== APPROVED_ROUTING_POLICY_VERSION) throw new ProviderSafetyError("Provider routing policy drifted.");
  if (manifest.routingOptions.provider.allow_fallbacks !== false
    || manifest.routingOptions.provider.require_parameters !== true
    || manifest.routingOptions.provider.zdr !== true
    || manifest.routingOptions.provider.data_collection !== "deny"
    || manifest.routingOptions.provider.only[0] !== manifest.upstreamProviderSlug
    || manifest.routingOptions.provider.order[0] !== manifest.upstreamProviderSlug) {
    throw new ProviderSafetyError("Provider routing/privacy controls are not pinned.");
  }
  if (manifest.noTraining !== true || manifest.noContentLogging !== true) throw new ProviderSafetyError("Provider privacy evidence is insufficient.");
  const verifiedAt = new Date(manifest.verifiedAt);
  const expiresAt = new Date(manifest.expiresAt);
  if (Number.isNaN(verifiedAt.getTime()) || Number.isNaN(expiresAt.getTime())
    || expiresAt <= verifiedAt || expiresAt <= now || verifiedAt > now) {
    throw new ProviderSafetyError("Provider release evidence is expired, future-dated, or invalid.");
  }
  if (input.expectedUpstreamProviderSlug && manifest.upstreamProviderSlug !== input.expectedUpstreamProviderSlug) throw new ProviderSafetyError("Upstream provider slug drifted.");
  if (input.expectedEndpointMetadataDigest && manifest.endpointMetadataDigest !== input.expectedEndpointMetadataDigest) throw new ProviderSafetyError("Endpoint metadata drifted.");

  const { manifestDigest: suppliedDigest, ...withoutDigest } = manifest;
  if (manifestDigest(withoutDigest) !== suppliedDigest) throw new ProviderSafetyError("Provider release manifest digest mismatch.");
  return manifest;
}

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

export class OpenRouterDecartAdapter implements VeraProviderAdapter {
  readonly enabled: boolean;
  readonly disabledReason?: string;

  constructor(
    private readonly input: {
      manifest: ProviderReleaseManifest | null;
      quotaPolicyVersion: string;
      expectedUpstreamProviderSlug?: string;
      expectedEndpointMetadataDigest?: string;
      liveEnabled?: boolean;
      transport?: (prepared: PreparedProviderTask, emit?: (delta: ProviderDelta) => void) => Promise<ProviderResult>;
    },
  ) {
    try {
      validateProviderReleaseManifest(input.manifest, {
        expectedUpstreamProviderSlug: input.expectedUpstreamProviderSlug,
        expectedEndpointMetadataDigest: input.expectedEndpointMetadataDigest,
      });
      this.enabled = input.liveEnabled === true && Boolean(input.transport);
      this.disabledReason = this.enabled ? undefined : "Live provider enablement is disabled by the release gate.";
    } catch (error) {
      this.enabled = false;
      this.disabledReason = error instanceof Error ? error.message : "Provider release gate failed.";
    }
  }

  async prepare(task: ProviderTask): Promise<PreparedProviderTask> {
    const manifest = validateProviderReleaseManifest(this.input.manifest, {
      expectedUpstreamProviderSlug: this.input.expectedUpstreamProviderSlug,
      expectedEndpointMetadataDigest: this.input.expectedEndpointMetadataDigest,
    });
    const certifiedEstimate = deriveCertifiedEstimate(task);
    const endpointDigest = manifest.endpointMetadataDigest;
    const providerTaskDigest = sha256Hex(`${endpointDigest}:${task.contextTaskDigest}:${task.featureKey}:${task.behaviorVersion}`);
    return {
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
      certifiedEstimate,
      manifestDigest: manifest.manifestDigest,
      routingOptions: manifest.routingOptions,
    };
  }

  async run(prepared: PreparedProviderTask, emit?: (delta: ProviderDelta) => void): Promise<ProviderResult> {
    if (!this.enabled || !this.input.transport) throw new ProviderSafetyError(this.disabledReason ?? "Provider is disabled.");
    const result = await this.input.transport(prepared, emit);
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

export type MockProviderFault = "outage" | "malformed" | "partial_usage" | "cancelled" | "pre_send_retry" | "ambiguous_timeout";

export class MockProviderAdapter implements VeraProviderAdapter {
  readonly enabled = true;
  readonly disabledReason = undefined;
  readonly calls: PreparedProviderTask[] = [];

  constructor(private readonly fault: MockProviderFault | null = null) {}

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
        },
      },
    };
  }

  async run(prepared: PreparedProviderTask, emit?: (delta: ProviderDelta) => void): Promise<ProviderResult> {
    this.calls.push(prepared);
    const attempt = (attemptNo: number, state: ProviderAttemptEvidence["state"], errorCode: string | null = null): ProviderAttemptEvidence => ({
      attemptNo,
      state,
      providerRequestRef: `mock-${attemptNo}`,
      observedUpstreamProviderSlug: "mock-decart",
      errorCode,
      usage: { inputTokens: null, outputTokens: null, quotaUnitsConsumed: null, tokenUsageState: "unknown" },
    });
    if (this.fault === "ambiguous_timeout") {
      return { kind: "discarded", text: null, structured: null, usage: { inputTokens: null, outputTokens: null, quotaUnitsConsumed: null, tokenUsageState: "unknown" }, finishReason: "ambiguous_timeout", attempts: [attempt(1, "ambiguous", "ambiguous_timeout")] };
    }
    if (this.fault === "outage") throw new ProviderExecutionError({ code: "provider_outage", retryableBeforeAcceptance: true });
    if (this.fault === "cancelled") throw new ProviderExecutionError({ code: "cancelled" });
    if (this.fault === "malformed") return { kind: "discarded", text: null, structured: { invalid: true }, usage: { inputTokens: 12, outputTokens: null, quotaUnitsConsumed: 40, tokenUsageState: "unknown" }, finishReason: "malformed", attempts: [attempt(1, "completed", "malformed_output")] };

    const usage: ProviderUsage = this.fault === "partial_usage"
      ? { inputTokens: null, outputTokens: 4, quotaUnitsConsumed: 200, tokenUsageState: "unknown" }
      : { inputTokens: 12, outputTokens: 16, quotaUnitsConsumed: 40, tokenUsageState: "known" };
    const fixtureJson = process.env.VERA_MOCK_STUDIO_FIXTURE_JSON;
    if (fixtureJson && prepared.preparedTask.featureKey !== "vera.chat") {
      try {
        const fixtures = JSON.parse(fixtureJson) as Record<string, unknown>;
        const structured = fixtures[prepared.preparedTask.featureKey];
        if (structured) {
          const attempts = this.fault === "pre_send_retry" ? [attempt(1, "failed", "pre_send_transport"), { ...attempt(2, "completed"), usage }] : [{ ...attempt(1, "completed"), usage }];
          return { kind: "structured", text: null, structured, usage, finishReason: "stop", attempts };
        }
      } catch {
        return { kind: "discarded", text: null, structured: null, usage, finishReason: "malformed_mock_fixture", attempts: [{ ...attempt(1, "completed", "malformed_mock_fixture"), usage }] };
      }
    }
    const text = "Mock Vera response.";
    emit?.({ text, provisional: true });
    const attempts = this.fault === "pre_send_retry" ? [attempt(1, "failed", "pre_send_transport"), { ...attempt(2, "completed"), usage }] : [{ ...attempt(1, "completed"), usage }];
    return { kind: "text", text, structured: null, usage, finishReason: "stop", attempts };
  }
}

export class DisabledProviderAdapter implements VeraProviderAdapter {
  readonly enabled = false;
  readonly disabledReason = "Live provider is disabled until the release manifest gate passes.";

  async prepare(): Promise<PreparedProviderTask> {
    throw new ProviderSafetyError(this.disabledReason);
  }

  async run(): Promise<ProviderResult> {
    throw new ProviderSafetyError(this.disabledReason);
  }
}

export function createDefaultProviderAdapter(env: NodeJS.ProcessEnv = process.env): VeraProviderAdapter {
  if (env.VERA_LIVE_PROVIDER_ENABLED !== "true") return new DisabledProviderAdapter();
  return new OpenRouterDecartAdapter({ manifest: null, quotaPolicyVersion: "disabled", liveEnabled: false });
}

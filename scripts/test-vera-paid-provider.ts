import {
  APPROVED_MODEL,
  APPROVED_ROUTING_POLICY_VERSION,
  APPROVED_UPSTREAM_PROVIDER,
  APPROVED_UPSTREAM_PROVIDER_SLUG,
  OPENROUTER_MAX_PRICE,
  OpenRouterPaidProviderAdapter,
  ProviderSafetyError,
  VERA_PAID_CERTIFIER_ID,
  VERA_PAID_CERTIFIER_VERSION,
  VERA_PAID_PRICE_POLICY_VERSION,
  VERA_PAID_SERIALIZER_ID,
  VERA_CONTEXT_TOOL_SCHEMA_HASH,
  calculateOpenRouterUsageCostMicros,
  createDefaultProviderAdapter,
  decimalMicros,
  estimateVeraQuotaUnits,
  manifestDigest,
  parseLosslessDecimal,
  validateOpenRouterDirectMetadata,
  validateProviderReleaseManifest,
  type ProviderCertifierEvidence,
  type ProviderReleaseManifest,
} from "@/lib/vera-ai/provider";
import { assert, expectReject, runChecks } from "./vera-test-support";

const certifierEvidence: ProviderCertifierEvidence = {
  tokenizerRevision: "deepseek-tokenizer-0731",
  tokenizerHash: "sha256-tokenizer",
  chatTemplateHash: "sha256-chat-template",
  byteFallbackProofReference: "evidence://deepseek-byte-fallback",
  fixedFramingTokenBound: 512 as const,
  serializerId: VERA_PAID_SERIALIZER_ID,
  serializerVersion: "1",
  model: APPROVED_MODEL,
  upstreamProviderSlug: APPROVED_UPSTREAM_PROVIDER_SLUG,
  producer: "vera-release-certifier",
  artifactHash: "sha256:13d78f2617dbafcba4319bfadcf9f2f338beeced4e6d8af91f96bbfcf51f44ec",
  signature: "sig://vera-certifier/utf8-byte-bound-v1",
  verifiedAt: "2026-09-01T00:00:00Z",
  expiresAt: "2027-09-01T00:00:00Z",
};

const manifestWithoutDigest: Omit<ProviderReleaseManifest, "manifestDigest"> = {
  manifestVersion: "openrouter-relace-paid-release-v1",
  gateway: "openrouter",
  upstreamProvider: APPROVED_UPSTREAM_PROVIDER,
  upstreamProviderSlug: APPROVED_UPSTREAM_PROVIDER_SLUG,
  model: APPROVED_MODEL,
  endpointMetadataDigest: "endpoint-digest-v2",
  endpointDescriptorHash: "endpoint-descriptor-sha256",
  routingPolicyVersion: APPROVED_ROUTING_POLICY_VERSION,
  routingOptions: {
    kind: "production",
    provider: {
      only: [APPROVED_UPSTREAM_PROVIDER_SLUG],
      order: [APPROVED_UPSTREAM_PROVIDER_SLUG],
      allow_fallbacks: false,
      require_parameters: true,
      zdr: true,
      data_collection: "deny",
      max_price: { ...OPENROUTER_MAX_PRICE },
    },
  },
  maxPrice: { ...OPENROUTER_MAX_PRICE },
  priceSnapshot: {
    currency: "USD",
    promptPriceUsdPerM: "0.04",
    completionPriceUsdPerM: "0.16",
    requestPriceUsdPerM: "0",
    imagePriceUsdPerM: "0",
    audioPriceUsdPerM: "0",
    cacheReadPriceUsdPerM: "0.016",
    cacheWritePriceUsdPerM: "0.04",
    cacheWriteAccountingMode: "included_in_uncached_prompt",
    reasoningTokenTreatment: "included_in_completion",
    serverToolTreatment: "disabled",
  },
  pricePolicyVersion: VERA_PAID_PRICE_POLICY_VERSION,
  sourceUrl: "https://openrouter.ai/deepseek/deepseek-v4-flash-0731",
  maxPriceSchemaEvidenceReference: "evidence://openrouter-max-price-schema",
  maxPriceSchemaEvidenceDigest: "sha256-max-price-schema",
  canaryEvidenceReference: "evidence://openrouter-relace-canary",
  canaryEvidenceDigest: "sha256-relace-canary",
  inputCertifierId: VERA_PAID_CERTIFIER_ID,
  inputCertifierVersion: VERA_PAID_CERTIFIER_VERSION,
  finalInputBuilderHash: "sha256-input-builder",
  certifierEvidenceReference: "certifiers/deepseek-v4-flash-0731/utf8-byte-bound-v1.json",
  certifierEvidence,
  aliasTableVersion: "relace-aliases-v1",
  providerAliasTable: { relace: APPROVED_UPSTREAM_PROVIDER_SLUG },
  termsEvidenceReference: "evidence://relace-terms",
  termsEvidenceDigest: "sha256-relace-terms",
  privacyEvidenceReference: "evidence://relace-zdr",
  privacyEvidenceDigest: "sha256-relace-zdr",
  noTraining: true,
  noContentLogging: true,
  residencyDisclosure: "Provider residency is not guaranteed; Indonesia is the initial market.",
  verifiedAt: "2026-09-01T00:00:00Z",
  expiresAt: "2027-09-01T00:00:00Z",
  approver: "release-approver",
  releaseState: "approved",
};
const manifest: ProviderReleaseManifest = { ...manifestWithoutDigest, manifestDigest: manifestDigest(manifestWithoutDigest) };
const toolCallingManifestWithoutDigest = {
  ...manifestWithoutDigest,
  toolCallingCapability: {
    applicationFunctions: true,
    toolChoiceAuto: true,
    plugins: false,
    serverTools: false,
    schemaHash: VERA_CONTEXT_TOOL_SCHEMA_HASH,
    evidenceDigest: "sha256-tool-calling-evidence",
  } as const,
};
const toolCallingManifest: ProviderReleaseManifest = {
  ...toolCallingManifestWithoutDigest,
  manifestDigest: manifestDigest(toolCallingManifestWithoutDigest),
};

const task = {
  featureKey: "vera.chat",
  behaviorVersion: "1",
  taskBytes: new TextEncoder().encode(JSON.stringify({ userText: "Jelaskan fotosintesis." })),
  contextTaskDigest: "context-digest",
  hardOutputQuotaUnits: 32,
  requestId: "request-123",
  attemptNo: 1,
};

function metadata(): Record<string, unknown> {
  return {
    openrouter_metadata: {
      strategy: "direct",
      pipeline: [],
      endpoints: {
        available: [{ selected: true, provider: APPROVED_UPSTREAM_PROVIDER_SLUG, model: APPROVED_MODEL }],
      },
      attempts: [{ status: "success", provider: APPROVED_UPSTREAM_PROVIDER_SLUG, model: APPROVED_MODEL }],
    },
  };
}

function paidSuccessResponse(): Response {
  const frames = [
    { ...metadata(), id: "resp-123", choices: [{ delta: { content: "Fotosintesis " }, finish_reason: null }] },
    { ...metadata(), id: "resp-123", choices: [{ delta: { content: "mengubah energi." }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 25 } } },
  ];
  const body = `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", "x-generation-id": "gen-123" } });
}

function generationSuccessResponse(): Response {
  return new Response(JSON.stringify({ data: {
    id: "gen-123",
    total_cost: 0.000005,
    tokens_prompt: 100,
    tokens_completion: 10,
    native_tokens_prompt: 100,
    native_tokens_completion: 10,
    native_tokens_reasoning: 0,
    model: "deepseek/deepseek-v4-flash-0731",
    provider_name: "relace",
    upstream_id: "upstream-123",
    request_id: "req-123",
  } }), { status: 200, headers: { "content-type": "application/json" } });
}

await runChecks("vera-provider", [
  {
    name: "production constants pin DeepSeek V4 Flash 0731 and Relace",
    run: () => {
      assert(APPROVED_MODEL === "deepseek/deepseek-v4-flash-0731", "paid model drifted");
      assert(APPROVED_UPSTREAM_PROVIDER === "relace" && APPROVED_UPSTREAM_PROVIDER_SLUG === "relace", "paid provider drifted");
      assert(JSON.stringify(OPENROUTER_MAX_PRICE) === JSON.stringify({ prompt: "0.10", completion: "0.30", request: "0", image: "0" }), "max_price shape drifted");
    },
  },
  {
    name: "manifest validation pins privacy, singleton routing, pricing, and certifier evidence",
    run: async () => {
      const validated = validateProviderReleaseManifest(manifest, { expectedUpstreamProviderSlug: "relace", expectedEndpointMetadataDigest: "endpoint-digest-v2" });
      assert(validated.manifestDigest === manifest.manifestDigest, "manifest digest changed");
      await expectReject(() => validateProviderReleaseManifest({ ...manifest, routingOptions: { ...manifest.routingOptions, provider: { ...manifest.routingOptions.provider, only: ["relace", "other"] } } } as unknown as ProviderReleaseManifest), "provider.only fallback list accepted");
      await expectReject(() => validateProviderReleaseManifest({ ...manifest, maxPrice: { ...manifest.maxPrice, audio: "0" } as never }), "max_price.audio accepted");
      await expectReject(() => validateProviderReleaseManifest({ ...manifest, certifierEvidence: { ...manifest.certifierEvidence, expiresAt: "2020-01-01T00:00:00Z" } }), "expired certifier evidence accepted");
      await expectReject(() => validateProviderReleaseManifest({ ...manifest, certifierEvidenceReference: "certifiers/missing.json" } as unknown as ProviderReleaseManifest), "missing certifier artifact reference accepted");
      await expectReject(() => validateProviderReleaseManifest({ ...manifest, certifierEvidence: { ...manifest.certifierEvidence, artifactHash: "sha256-different-artifact" } }), "mismatched certifier artifact identity accepted");
      await expectReject(() => validateProviderReleaseManifest({ ...manifest, routingOptions: { ...manifest.routingOptions, provider: { ...manifest.routingOptions.provider, data_collection: "allow" } } } as unknown as ProviderReleaseManifest), "data collection allow accepted");
      const wrongSchemaWithoutDigest = { ...toolCallingManifestWithoutDigest, toolCallingCapability: { ...toolCallingManifestWithoutDigest.toolCallingCapability, schemaHash: "sha256-wrong-context-tool-schema" } };
      await expectReject(() => validateProviderReleaseManifest({ ...wrongSchemaWithoutDigest, manifestDigest: manifestDigest(wrongSchemaWithoutDigest) }), "context tool schema hash drift accepted");
      const capabilityValidated = validateProviderReleaseManifest(toolCallingManifest, { requireToolCalling: true });
      assert(capabilityValidated.toolCallingCapability?.schemaHash === VERA_CONTEXT_TOOL_SCHEMA_HASH, "function-tool capability schema hash is not canonical");
    },
  },
  {
    name: "lossless decimal parsing and included-in-uncached-prompt cache accounting are exact",
    run: () => {
      assert(decimalMicros("0.0000004") === BigInt(1), "sub-micro cost was not rounded upward");
      assert(parseLosslessDecimal("4e-7").canonical === "0.0000004", "exponent canonicalization changed");
      for (const invalid of ["01", "-0", "1e999999", "NaN", "Infinity", "-1"]) {
        try {
          parseLosslessDecimal(invalid);
        } catch {
          continue;
        }
        throw new Error(`invalid decimal ${invalid} was accepted`);
      }
      const cost = calculateOpenRouterUsageCostMicros({
        manifest,
        usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 25 } },
      });
      assert(cost.cachedTokens === 25 && cost.uncachedOrWriteTokens === 75 && cost.cacheWriteTokens === 0, "cache accounting quantities changed");
      assert(cost.recomputedCostMicros === BigInt(5), "lossless cache cost recomputation changed");
    },
  },
  {
    name: "direct response metadata requires one selected Relace endpoint and matching attempts",
    run: async () => {
      const checked = validateOpenRouterDirectMetadata(metadata(), manifest);
      assert(checked.selectedEndpointJsonPointer === "/openrouter_metadata/endpoints/available/0", "selected endpoint pointer changed");
      await expectReject(() => validateOpenRouterDirectMetadata({ openrouter_metadata: { ...metadata().openrouter_metadata as Record<string, unknown>, endpoints: { available: [{ selected: true, provider: "relace", model: APPROVED_MODEL }, { selected: true, provider: "relace", model: APPROVED_MODEL }] } } }, manifest), "multiple selected endpoints accepted");
      await expectReject(() => validateOpenRouterDirectMetadata({ openrouter_metadata: { ...metadata().openrouter_metadata as Record<string, unknown>, pipeline: ["guardrail"] } }, manifest), "metadata pipeline stage accepted");
    },
  },
  {
    name: "automatic paid preparation fails closed without a function-tool capability manifest",
    run: async () => {
      const adapter = new OpenRouterPaidProviderAdapter({ manifest, quotaPolicyVersion: "quota-v2", liveEnabled: true, apiKey: "paid-test-key" });
      await expectReject(() => adapter.prepare({ ...task, stagePurpose: "context_selection" }), "automatic paid preparation accepted a manifest without function tools");
      const capable = new OpenRouterPaidProviderAdapter({ manifest: toolCallingManifest, quotaPolicyVersion: "quota-v2", liveEnabled: true, apiKey: "paid-test-key" });
      const prepared = await capable.prepare({ ...task, stagePurpose: "context_selection" });
      assert(prepared.stagePurpose === "context_selection", "capable automatic task did not preserve stage purpose");
    },
  },
  {
    name: "paid transport sends the exact request and records dispatch/generation evidence",
    run: async () => {
      const calls: Array<{ input: string; init?: RequestInit }> = [];
      const hookEvents: string[] = [];
      const adapter = new OpenRouterPaidProviderAdapter({
        manifest,
        quotaPolicyVersion: "quota-v2",
        liveEnabled: true,
        apiKey: "paid-test-key",
        baseUrl: "https://router.test",
        generationPollDelaysMs: [0],
        sleepImpl: async () => undefined,
        dispatchHooks: {
          onDispatchIntent: () => { hookEvents.push("intent"); },
          onDispatchEvidence: (evidence) => { hookEvents.push(evidence.state); },
        },
        fetchImpl: async (input, init) => {
          calls.push({ input: String(input), init });
          return calls.length === 1 ? paidSuccessResponse() : generationSuccessResponse();
        },
      });
      assert(adapter.enabled, "paid adapter did not open with a valid manifest/transport");
      const prepared = await adapter.prepare(task);
      const deltas: string[] = [];
      const result = await adapter.run(prepared, (delta) => deltas.push(delta.text));
      const request = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
      const provider = request.provider as Record<string, unknown>;
      const headers = new Headers(calls[0]?.init?.headers);
      assert(request.model === APPROVED_MODEL && request.max_completion_tokens === 32 && request.max_tokens === undefined, "paid request output/model fields drifted");
      assert(JSON.stringify(provider) === JSON.stringify({ only: ["relace"], order: ["relace"], allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true, max_price: OPENROUTER_MAX_PRICE }), "paid provider routing policy drifted");
      assert(headers.get("x-openrouter-metadata") === "enabled" && headers.get("x-openrouter-cache") === "false", "paid metadata/cache headers are missing");
      assert(result.text === "Fotosintesis mengubah energi." && deltas.join("") === result.text, "paid SSE text was not mapped");
      assert(result.usage.tokenUsageState === "known" && result.usage.reportedCostMicros === "5", "paid generation cost was not reconciled");
      assert(result.attempts[0]?.providerRequestKey && result.attempts[0]?.generationId === "gen-123", "dispatch/generation evidence was not retained");
      assert(hookEvents[0] === "intent" && hookEvents.includes("sent"), "dispatch hooks did not record write-ahead/sent evidence");
    },
  },
  {
    name: "default provider is disabled and no live transport is reachable without a manifest",
    run: async () => {
      const disabled = createDefaultProviderAdapter({ VERA_LIVE_PROVIDER_ENABLED: "false", NODE_ENV: "test" });
      assert(!disabled.enabled, "default provider enabled");
      await expectReject(() => disabled.prepare({ featureKey: "vera.chat", behaviorVersion: "1", taskBytes: new Uint8Array(), contextTaskDigest: "x", hardOutputQuotaUnits: 10 }), "disabled adapter prepared a task");
      const gated = new OpenRouterPaidProviderAdapter({ manifest: null, quotaPolicyVersion: "quota-v1", liveEnabled: false });
      assert(!gated.enabled && gated.disabledReason, "release gate did not block live provider");
      void ProviderSafetyError;
      void estimateVeraQuotaUnits;
    },
  },
]);

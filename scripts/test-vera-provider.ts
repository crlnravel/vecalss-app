import {
  APPROVED_MODEL,
  APPROVED_ROUTING_POLICY_VERSION,
  APPROVED_UPSTREAM_PROVIDER,
  OpenRouterDecartAdapter,
  MockProviderAdapter,
  ProviderSafetyError,
  createDefaultProviderAdapter,
  estimateVeraQuotaUnits,
  manifestDigest,
  validateProviderReleaseManifest,
  type ProviderReleaseManifest,
} from "@/lib/vera-ai/provider";
import { assert, expectReject, runChecks } from "./vera-test-support";

const manifestWithoutDigest: Omit<ProviderReleaseManifest, "manifestDigest"> = {
  manifestVersion: "openrouter-decart-release-v1",
  gateway: "openrouter",
  upstreamProvider: "decart",
  upstreamProviderSlug: "decart-approved-1",
  model: APPROVED_MODEL,
  endpointMetadataDigest: "endpoint-digest-v1",
  routingPolicyVersion: APPROVED_ROUTING_POLICY_VERSION,
  routingOptions: {
    provider: {
      only: ["decart-approved-1"],
      order: ["decart-approved-1"],
      allow_fallbacks: false,
      require_parameters: true,
      zdr: true,
      data_collection: "deny",
    },
  },
  termsEvidenceReference: "terms://approved",
  termsEvidenceDigest: "terms-digest",
  privacyEvidenceReference: "privacy://approved",
  privacyEvidenceDigest: "privacy-digest",
  noTraining: true,
  noContentLogging: true,
  residencyDisclosure: "Provider residency is not guaranteed; Indonesia is the initial market.",
  verifiedAt: "2026-08-23T00:00:00Z",
  expiresAt: "2027-08-23T00:00:00Z",
  approver: "release-approver",
  releaseState: "approved",
};
const manifest: ProviderReleaseManifest = { ...manifestWithoutDigest, manifestDigest: manifestDigest(manifestWithoutDigest) };

await runChecks("vera-provider", [
  {
    name: "exact gateway/upstream/model/privacy tuple and release digest validate",
    run: () => {
      const validated = validateProviderReleaseManifest(manifest, { expectedUpstreamProviderSlug: "decart-approved-1", expectedEndpointMetadataDigest: "endpoint-digest-v1" });
      assert(validated.manifestDigest === manifest.manifestDigest, "manifest digest changed");
    },
  },
  {
    name: "missing/placeholder/expired/drifted manifest evidence fails closed",
    run: async () => {
      await expectReject(() => validateProviderReleaseManifest(null), "missing manifest accepted");
      await expectReject(() => validateProviderReleaseManifest({ ...manifest, upstreamProviderSlug: "placeholder" }), "placeholder slug accepted");
      await expectReject(() => validateProviderReleaseManifest({ ...manifest, expiresAt: "2020-01-01T00:00:00Z" }), "expired manifest accepted");
      await expectReject(() => validateProviderReleaseManifest(manifest, { expectedUpstreamProviderSlug: "different" }), "slug drift accepted");
      const driftedFallbackManifest = {
        ...manifest,
        routingOptions: {
          ...manifest.routingOptions,
          provider: { ...manifest.routingOptions.provider, allow_fallbacks: true },
        },
      } as unknown as ProviderReleaseManifest;
      await expectReject(() => validateProviderReleaseManifest(driftedFallbackManifest), "fallback drift accepted");
    },
  },
  {
    name: "certified estimator includes protocol/context/retry overhead and hard output cap",
    run: () => {
      const estimate = estimateVeraQuotaUnits({ taskBytes: new TextEncoder().encode("x".repeat(1000)), inputProtocolOverheadUnits: 100, systemOverheadUnits: 100, toolOverheadUnits: 100, contextOverheadUnits: 100, retryOverheadUnits: 100, hardOutputQuotaUnits: 1500 });
      assert(estimate.certified && estimate.basis === "universal-byte-bound" && estimate.certificationMethod === "universal-byte-bound-v1", "universal estimator not certified");
      assert(estimate.inputUpperBound >= 1400 && estimate.outputUpperBound === 1500, "full-byte bound/overhead/output cap omitted");
      assert(estimate.reservationBound === estimate.inputUpperBound + estimate.outputUpperBound, "reservation bound incorrect");
      return expectReject(() => estimateVeraQuotaUnits({ taskBytes: new Uint8Array(1), inputProtocolOverheadUnits: 0, systemOverheadUnits: 0, toolOverheadUnits: 0, contextOverheadUnits: 0, retryOverheadUnits: 0, hardOutputQuotaUnits: 1, maxProviderAttempts: 3 }), "uncertified attempt budget accepted");
    },
  },
  {
    name: "prepare is network-free, mock deltas are provisional, ambiguous timeout is not retried",
    run: async () => {
      const mock = new MockProviderAdapter("ambiguous_timeout");
      const prepared = await mock.prepare({ featureKey: "vera.chat", behaviorVersion: "1", taskBytes: new Uint8Array([1, 2]), contextTaskDigest: "digest", hardOutputQuotaUnits: 100 });
      const result = await mock.run(prepared);
      assert(result.attempts.length === 1 && result.attempts[0]?.state === "ambiguous", "ambiguous timeout retried");
      const success = new MockProviderAdapter();
      const successPrepared = await success.prepare(prepared.preparedTask);
      let provisional = false;
      await success.run(successPrepared, (delta) => { provisional = delta.provisional; });
      assert(provisional, "mock delta was not provisional");
    },
  },
  {
    name: "mock fault matrix and observed upstream identity are normalized without retry ambiguity",
    run: async () => {
      const task = { featureKey: "vera.chat", behaviorVersion: "1", taskBytes: new Uint8Array([1]), contextTaskDigest: "digest", hardOutputQuotaUnits: 100 };
      for (const fault of ["malformed", "partial_usage", "pre_send_retry"] as const) {
        const adapter = new MockProviderAdapter(fault);
        const result = await adapter.run(await adapter.prepare(task));
        assert(result.attempts.length >= 1, `${fault} produced no attempt evidence`);
      }
      for (const fault of ["outage", "cancelled"] as const) {
        const adapter = new MockProviderAdapter(fault);
        const prepared = await adapter.prepare(task);
        await expectReject(() => adapter.run(prepared), `${fault} did not fail`);
      }

      const observedMismatch = new OpenRouterDecartAdapter({
        manifest,
        quotaPolicyVersion: "quota-v1",
        liveEnabled: true,
        transport: async () => ({
          kind: "text",
          text: "unexpected",
          structured: null,
          usage: { inputTokens: 1, outputTokens: 1, quotaUnitsConsumed: 2, tokenUsageState: "known" as const },
          finishReason: "stop",
          attempts: [{
            attemptNo: 1,
            state: "completed" as const,
            providerRequestRef: "gateway-ref",
            observedUpstreamProviderSlug: "openrouter",
            errorCode: null,
            usage: { inputTokens: 1, outputTokens: 1, quotaUnitsConsumed: 2, tokenUsageState: "known" as const },
          }],
        }),
      });
      const prepared = await observedMismatch.prepare(task);
      await expectReject(() => observedMismatch.run(prepared), "gateway identity was accepted as upstream identity");

      const observedMissing = new OpenRouterDecartAdapter({
        manifest,
        quotaPolicyVersion: "quota-v1",
        liveEnabled: true,
        transport: async () => ({
          kind: "text" as const,
          text: "unexpected",
          structured: null,
          usage: { inputTokens: 1, outputTokens: 1, quotaUnitsConsumed: 2, tokenUsageState: "known" as const },
          finishReason: "stop",
          attempts: [{
            attemptNo: 1,
            state: "completed" as const,
            providerRequestRef: "missing-ref",
            observedUpstreamProviderSlug: null,
            errorCode: null,
            usage: { inputTokens: 1, outputTokens: 1, quotaUnitsConsumed: 2, tokenUsageState: "known" as const },
          }],
        }),
      });
      const missingPrepared = await observedMissing.prepare(task);
      await expectReject(() => observedMissing.run(missingPrepared), "missing observed upstream identity was accepted");

      await expectReject(() => new MockProviderAdapter().prepare({
        ...task,
        certifiedEstimate: {
          inputUpperBound: 1,
          outputUpperBound: 100,
          reservationBound: 101,
          certified: true,
          basis: "universal-byte-bound",
          certificationMethod: "universal-byte-bound-v1",
          maxProviderAttempts: 2,
        },
      }), "uncertified caller estimate was trusted");

      const tooManyAttempts = new OpenRouterDecartAdapter({
        manifest,
        quotaPolicyVersion: "quota-v1",
        liveEnabled: true,
        transport: async () => ({
          kind: "text" as const,
          text: "unexpected",
          structured: null,
          usage: { inputTokens: 1, outputTokens: 1, quotaUnitsConsumed: 2, tokenUsageState: "known" as const },
          finishReason: "stop",
          attempts: [1, 2, 3].map((attemptNo) => ({
            attemptNo,
            state: "completed" as const,
            providerRequestRef: `ref-${attemptNo}`,
            observedUpstreamProviderSlug: manifest.upstreamProviderSlug,
            errorCode: null,
            usage: { inputTokens: 1, outputTokens: 1, quotaUnitsConsumed: 2, tokenUsageState: "known" as const },
          })),
        }),
      });
      const tooManyPrepared = await tooManyAttempts.prepare(task);
      await expectReject(() => tooManyAttempts.run(tooManyPrepared), "provider attempt ceiling was exceeded");
    },
  },
  {
    name: "default provider is disabled and no live transport is reachable",
    run: async () => {
      const disabled = createDefaultProviderAdapter({ VERA_LIVE_PROVIDER_ENABLED: "false", NODE_ENV: "test" });
      assert(!disabled.enabled, "default provider enabled");
      await expectReject(() => disabled.prepare({ featureKey: "vera.chat", behaviorVersion: "1", taskBytes: new Uint8Array(), contextTaskDigest: "x", hardOutputQuotaUnits: 10 }), "disabled adapter prepared a task");
      const gated = new OpenRouterDecartAdapter({ manifest, quotaPolicyVersion: "quota-v1", liveEnabled: false });
      assert(!gated.enabled && gated.disabledReason, "release gate did not block live provider");
      void ProviderSafetyError;
      void APPROVED_UPSTREAM_PROVIDER;
    },
  },
]);

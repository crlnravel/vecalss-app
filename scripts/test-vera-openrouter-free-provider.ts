import {
  VERA_OPENROUTER_FREE_POC_MODEL,
} from "@/lib/vera-ai/openrouter-free-poc";
import {
  VeraOpenRouterFreePocProviderAdapter,
} from "@/lib/vera-ai/openrouter-free-poc-provider";
import {
  MockProviderAdapter,
  ProviderExecutionError,
  type ProviderTask,
} from "@/lib/vera-ai/provider";
import {
  selectVeraChatProvider,
  veraProviderAvailable,
} from "@/lib/vera-ai/route-support";
import { assert, expectReject, runChecks } from "./vera-test-support";

const baseEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DEBUG: "true",
  VERA_POC_OPENROUTER: "true",
  VERA_POC_ZDR: "false",
  OPENROUTER_API_KEY: "local-test-key",
  OPENROUTER_BASE_URL: "http://127.0.0.1:5999",
};

const task: ProviderTask = {
  featureKey: "vera.chat",
  behaviorVersion: "1",
  taskBytes: new TextEncoder().encode(JSON.stringify({
    userText: "Sebutkan satu langkah belajar.",
    blocks: [{ content: "Jangan kirim sumber ini ke POC." }],
  })),
  contextTaskDigest: "context-digest",
  hardOutputQuotaUnits: 100,
};

function successResponse(): Response {
  return new Response(JSON.stringify({
    model: "resolved/free-model",
    provider: "synthetic-provider",
    choices: [{ message: { content: "Mulai dari satu konsep." }, finish_reason: "stop" }],
    usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

await runChecks("vera-openrouter-free-provider", [
  {
    name: "prepare implements the durable provider contract with certified bounds and POC routing metadata",
    run: async () => {
      const adapter = new VeraOpenRouterFreePocProviderAdapter({
        env: baseEnvironment,
        fetchImpl: async () => successResponse(),
      });
      const prepared = await adapter.prepare(task);
      assert(prepared.gateway === "openrouter", "POC gateway was not preserved");
      assert(prepared.upstreamProvider === "openrouter-free-poc", "POC upstream identity was replaced by the production provider");
      assert(prepared.model === VERA_OPENROUTER_FREE_POC_MODEL, "POC requested model is not openrouter/free");
      assert(prepared.certifiedEstimate.certified && prepared.certifiedEstimate.reservationBound > 0, "certified estimate was not derived");
      assert(prepared.hardOutputQuotaUnits === task.hardOutputQuotaUnits, "hard output quota was not preserved");
      assert(prepared.routingOptions.kind === "openrouter_free_poc", "POC routing discriminant is missing");
      assert(prepared.routingOptions.provider.data_collection === "allow" && prepared.routingOptions.provider.allow_fallbacks === false, "POC routing privacy controls are inaccurate");
      assert(!Object.prototype.hasOwnProperty.call(prepared.routingOptions.provider, "zdr"), "POC routing metadata fabricated a ZDR field");
    },
  },
  {
    name: "run maps selected model/provider and known or unknown usage without leaking context blocks",
    run: async () => {
      let requestBody: unknown = null;
      const adapter = new VeraOpenRouterFreePocProviderAdapter({
        env: baseEnvironment,
        fetchImpl: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return successResponse();
        },
      });
      const prepared = await adapter.prepare(task);
      const result = await adapter.run(prepared);
      assert(result.kind === "text" && result.text === "Mulai dari satu konsep.", "POC response was not mapped to a text ProviderResult");
      assert(result.providerMetadata?.kind === "openrouter_free_poc", "POC result metadata is not discriminated");
      assert(result.providerMetadata?.selectedModel === "resolved/free-model", "resolved model was not mapped");
      assert(result.providerMetadata?.providerIdentity === "synthetic-provider", "resolved provider was not mapped");
      assert(result.providerMetadata?.dataCollection === "allow" && result.providerMetadata.zdr === false, "non-ZDR POC metadata is inaccurate");
      assert(result.usage.tokenUsageState === "known" && result.usage.quotaUnitsConsumed === 13, "known POC usage was not mapped");
      assert(result.attempts[0]?.observedUpstreamProviderSlug === "synthetic-provider", "observed upstream identity was not preserved");
      const messages = (requestBody as Record<string, unknown> | null)?.messages as Array<Record<string, unknown>> | undefined;
      assert(messages?.[0]?.content === "Sebutkan satu langkah belajar.", "POC received the full context pack instead of normalized user text");
      assert(!String(messages?.[0]?.content).includes("Jangan kirim sumber ini"), "POC request leaked a source block");

      const unknownUsage = new VeraOpenRouterFreePocProviderAdapter({
        env: baseEnvironment,
        fetchImpl: async () => new Response(JSON.stringify({
          model: "resolved/free-model",
          provider: "synthetic-provider",
          choices: [{ message: { content: "Jawaban tanpa telemetry." }, finish_reason: "stop" }],
        }), { status: 200 }),
      });
      const unknown = await unknownUsage.run(await unknownUsage.prepare(task));
      assert(unknown.usage.tokenUsageState === "unknown" && unknown.usage.quotaUnitsConsumed === null, "missing usage was coerced to zero/known");
    },
  },
  {
    name: "POC transport failures retain typed retryability for the durable orchestrator",
    run: async () => {
      const retryable = new VeraOpenRouterFreePocProviderAdapter({
        env: baseEnvironment,
        fetchImpl: async () => new Response("busy", { status: 503 }),
      });
      await expectReject(async () => {
        try {
          await retryable.run(await retryable.prepare(task));
        } catch (error) {
          assert(error instanceof ProviderExecutionError, "POC fault did not map to ProviderExecutionError");
          assert(error.code === "openrouter_free_poc_http_error" && error.retryableBeforeAcceptance, "retryable POC fault lost its typed retryability");
          throw error;
        }
      }, "retryable POC fault was accepted");

      const terminal = new VeraOpenRouterFreePocProviderAdapter({
        env: baseEnvironment,
        fetchImpl: async () => new Response("invalid", { status: 400 }),
      });
      await expectReject(async () => {
        try {
          await terminal.run(await terminal.prepare(task));
        } catch (error) {
          assert(error instanceof ProviderExecutionError, "terminal POC fault did not map to ProviderExecutionError");
          assert(error.code === "openrouter_free_poc_http_error" && !error.retryableBeforeAcceptance, "terminal POC fault was marked retryable");
          throw error;
        }
      }, "terminal POC fault was accepted");
    },
  },
  {
    name: "route selection chooses the POC only under its explicit gate and preserves mock/default fallback",
    run: () => {
      const poc = selectVeraChatProvider(baseEnvironment);
      assert(poc instanceof VeraOpenRouterFreePocProviderAdapter && poc.enabled, "explicit POC gate did not select the bridge");
      assert(veraProviderAvailable(baseEnvironment), "usage availability did not expose an enabled POC");

      const mockEnvironment = { ...baseEnvironment, VERA_POC_OPENROUTER: "false", VERA_MOCK_PROVIDER_ENABLED: "true" };
      const mock = selectVeraChatProvider(mockEnvironment);
      assert(mock instanceof MockProviderAdapter && mock.enabled, "mock fallback was not preserved when POC opt-in was closed");
      assert(veraProviderAvailable(mockEnvironment) === false, "mock fallback was incorrectly reported as a released provider");

      const disabledEnvironment = { ...mockEnvironment, VERA_MOCK_PROVIDER_ENABLED: "false" };
      const disabled = selectVeraChatProvider(disabledEnvironment);
      assert(!disabled.enabled, "default provider was enabled without the release gate");
      assert(!veraProviderAvailable({ ...baseEnvironment, NODE_ENV: "staging" } as unknown as NodeJS.ProcessEnv), "staging POC availability did not fail closed");
    },
  },
]);

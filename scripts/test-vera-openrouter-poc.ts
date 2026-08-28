import {
  VERA_OPENROUTER_FREE_POC_MAX_INPUT_CHARS,
  VERA_OPENROUTER_FREE_POC_MAX_OUTPUT_CHARS,
  VeraOpenRouterFreePocAdapter,
  VeraOpenRouterFreePocError,
  createVeraOpenRouterFreePocAdapter,
  evaluateVeraOpenRouterFreePocGate,
} from "@/lib/vera-ai/openrouter-free-poc";
import { assert, expectReject, runChecks } from "./vera-test-support";

const syntheticPrompt = "VERA_OPENROUTER_FREE_POC_SYNTHETIC_SENTINEL_V1: reply with the word ready.";
const baseEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DEBUG: "true",
  VERA_POC_OPENROUTER: "true",
  VERA_POC_ZDR: "false",
  OPENROUTER_API_KEY: "local-test-key",
  OPENROUTER_BASE_URL: "http://127.0.0.1:5999",
};

function successResponse(): Response {
  return new Response(JSON.stringify({
    model: "openrouter/free",
    provider: "synthetic-provider",
    choices: [{ message: { content: "ready" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 9, completion_tokens: 1, total_tokens: 10 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

await runChecks("vera-openrouter-free-poc", [
  {
    name: "all explicit gates are required and production always fails closed",
    run: async () => {
      const cases: Array<[keyof NodeJS.ProcessEnv, string | undefined, string]> = [
        ["DEBUG", "false", "debug_required"],
        ["VERA_POC_OPENROUTER", "false", "poc_opt_in_required"],
        ["VERA_POC_ZDR", "true", "zdr_must_be_false"],
        ["OPENROUTER_API_KEY", "", "api_key_required"],
        ["OPENROUTER_BASE_URL", "", "base_url_required"],
        ["OPENROUTER_BASE_URL", "not-a-url", "base_url_invalid"],
      ];
      for (const [key, value, reason] of cases) {
        const env = { ...baseEnvironment, [key]: value };
        assert(!evaluateVeraOpenRouterFreePocGate(env).enabled, `${key} gate unexpectedly enabled`);
        assert(evaluateVeraOpenRouterFreePocGate(env).reason === reason, `${key} gate returned the wrong reason`);
      }
      const production = evaluateVeraOpenRouterFreePocGate({ ...baseEnvironment, NODE_ENV: "production" });
      assert(!production.enabled && production.reason === "production_environment", "production gate did not fail closed");
      const debugOnly = evaluateVeraOpenRouterFreePocGate({ ...baseEnvironment, VERA_POC_OPENROUTER: undefined });
      assert(!debugOnly.enabled && debugOnly.reason === "poc_opt_in_required", "DEBUG alone enabled the POC");
    },
  },
  {
    name: "factory exposes an enabled isolated adapter without changing the production adapter",
    run: async () => {
      let calls = 0;
      const adapter = createVeraOpenRouterFreePocAdapter({
        env: baseEnvironment,
        fetchImpl: async () => {
          calls += 1;
          return successResponse();
        },
      });
      assert(adapter.enabled && !adapter.disabledReason, "explicit POC gates did not enable the adapter");
      const result = await adapter.complete({ prompt: syntheticPrompt });
      assert(calls === 1, "the synthetic POC transport was not called exactly once");
      assert(result.kind === "openrouter_free_poc", "POC result kind is not typed");
      assert(result.selectedModel === "openrouter/free" && result.providerIdentity === "synthetic-provider", "selected provider identity was not resolved");
      assert(result.finishReason === "stop" && result.usage.totalTokens === 10, "finish/usage evidence was not resolved");
    },
  },
  {
    name: "request body pins the free router and omits the provider ZDR property",
    run: async () => {
      let requestUrl = "";
      let requestInit: RequestInit | undefined;
      const adapter = new VeraOpenRouterFreePocAdapter({
        env: baseEnvironment,
        fetchImpl: async (input, init) => {
          requestUrl = String(input);
          requestInit = init;
          return successResponse();
        },
      });
      await adapter.run({ prompt: syntheticPrompt, maxOutputTokens: 32 });
      assert(requestUrl.endsWith("/api/v1/chat/completions"), "POC did not use the OpenAI-compatible chat endpoint");
      assert(requestInit?.headers && new Headers(requestInit.headers).get("authorization") === "Bearer local-test-key", "POC bearer authorization is missing");
      const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
      assert(body.model === "openrouter/free", "POC model is not openrouter/free");
      assert(body.max_tokens === 32 && body.stream === false, "POC output bounds are not pinned");
      const provider = body.provider as Record<string, unknown>;
      assert(provider.allow_fallbacks === false && provider.data_collection === "allow", "POC provider controls are not pinned");
      assert(!Object.prototype.hasOwnProperty.call(provider, "zdr"), "POC request included provider.zdr");
      const messages = body.messages as Array<Record<string, unknown>>;
      assert(messages.length === 1 && messages[0]?.content === syntheticPrompt, "POC prompt was not bounded/synthetic");
    },
  },
  {
    name: "input, output, response, timeout, and HTTP failures are typed and bounded",
    run: async () => {
      const adapter = new VeraOpenRouterFreePocAdapter({
        env: baseEnvironment,
        fetchImpl: async () => successResponse(),
      });
      await expectReject(() => adapter.run({ prompt: "" }), "empty POC input was accepted");
      await expectReject(() => adapter.run({ prompt: "x".repeat(VERA_OPENROUTER_FREE_POC_MAX_INPUT_CHARS + 1) }), "overlong POC input was accepted");
      await expectReject(() => adapter.run({ prompt: syntheticPrompt, maxOutputTokens: 0 }), "unbounded POC output was accepted");

      const malformed = new VeraOpenRouterFreePocAdapter({
        env: baseEnvironment,
        fetchImpl: async () => new Response("{}", { status: 200 }),
      });
      await expectReject(async () => {
        try {
          await malformed.run({ prompt: syntheticPrompt });
        } catch (error) {
          assert(error instanceof VeraOpenRouterFreePocError && error.code === "invalid_response", "malformed response error was not typed");
          throw error;
        }
      }, "malformed response was accepted");

      const tooLarge = new VeraOpenRouterFreePocAdapter({
        env: baseEnvironment,
        maxResponseBytes: 32,
        fetchImpl: async () => new Response("x".repeat(64), { status: 200 }),
      });
      await expectReject(async () => {
        try {
          await tooLarge.run({ prompt: syntheticPrompt });
        } catch (error) {
          assert(error instanceof VeraOpenRouterFreePocError && error.code === "response_too_large", "oversized response error was not typed");
          throw error;
        }
      }, "oversized response was accepted");

      const timeout = new VeraOpenRouterFreePocAdapter({
        env: baseEnvironment,
        timeoutMs: 1,
        fetchImpl: (_input, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
      });
      await expectReject(async () => {
        try {
          await timeout.run({ prompt: syntheticPrompt });
        } catch (error) {
          assert(error instanceof VeraOpenRouterFreePocError && error.code === "timeout", "timeout error was not typed");
          throw error;
        }
      }, "timed out request was accepted");

      const httpFailure = new VeraOpenRouterFreePocAdapter({
        env: baseEnvironment,
        fetchImpl: async () => new Response("upstream failure", { status: 503 }),
      });
      await expectReject(async () => {
        try {
          await httpFailure.run({ prompt: syntheticPrompt });
        } catch (error) {
          assert(error instanceof VeraOpenRouterFreePocError && error.code === "http_error" && error.status === 503 && error.retryable, "HTTP failure error was not typed/retryable");
          throw error;
        }
      }, "HTTP failure was accepted");
      assert(syntheticPrompt.length < VERA_OPENROUTER_FREE_POC_MAX_INPUT_CHARS && VERA_OPENROUTER_FREE_POC_MAX_OUTPUT_CHARS > 0, "synthetic bounds are invalid");
    },
  },
]);

const realSmokeRequested = process.env.VERA_POC_RUN_REAL_SMOKE === "true";
if (!realSmokeRequested) {
  console.log("SKIP vera-openrouter-free-poc: real smoke requires VERA_POC_RUN_REAL_SMOKE=true and all explicit POC gates.");
} else {
  const gate = evaluateVeraOpenRouterFreePocGate(process.env);
  if (!gate.enabled) {
    throw new Error(`Requested real smoke but the explicit POC gate is closed: ${gate.reason ?? "unknown"}`);
  }
  const result = await createVeraOpenRouterFreePocAdapter().run({ prompt: syntheticPrompt });
  console.log(`PASS vera-openrouter-free-poc: real synthetic smoke model=${result.selectedModel} provider=${result.providerIdentity} finish=${result.finishReason ?? "unknown"} usage=${JSON.stringify(result.usage)}`);
}

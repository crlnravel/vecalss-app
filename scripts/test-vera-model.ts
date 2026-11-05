import "dotenv/config";
import assert from "node:assert/strict";

import { generateText, type LanguageModelUsage } from "ai";

import { VERA_EFFORTS, VERA_LIMITS } from "../lib/vera/config";
import { VERA_DEFAULT_PRICES } from "../lib/vera/credits-shared";
import { getVeraModel, isVeraDevModelEnabled, setVeraModelForTests } from "../lib/vera/model";
import { finalStepControl } from "../lib/vera/usage-tracker";

// The local stand-in is honored only outside production, and only with VERA_MOCK_MODEL set to exactly 1.
const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;
assert.equal(isVeraDevModelEnabled(env({ NODE_ENV: "development", VERA_MOCK_MODEL: "1" })), true);
assert.equal(isVeraDevModelEnabled(env({ NODE_ENV: "test", VERA_MOCK_MODEL: "1" })), true);
assert.equal(isVeraDevModelEnabled(env({ NODE_ENV: "production", VERA_MOCK_MODEL: "1" })), false, "Production ignores the flag");
assert.equal(isVeraDevModelEnabled(env({ NODE_ENV: "development", VERA_MOCK_MODEL: "true" })), false, "Only the value 1 counts");
assert.equal(isVeraDevModelEnabled(env({ NODE_ENV: "development" })), false, "The flag is off unless set");

// The same object as process.env, typed so the test can set NODE_ENV, which Next types as read-only.
const writableEnv: Record<string, string | undefined> = process.env;
const saved = {
  NODE_ENV: process.env.NODE_ENV,
  VERA_MOCK_MODEL: process.env.VERA_MOCK_MODEL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};
const realFetch = globalThis.fetch;
try {
  setVeraModelForTests(undefined);
  delete process.env.OPENAI_API_KEY;
  writableEnv.VERA_MOCK_MODEL = "1";

  writableEnv.NODE_ENV = "production";
  assert.equal(getVeraModel(), null, "In production the flag is ignored, so with no key there is no model");

  writableEnv.NODE_ENV = "development";
  const model = getVeraModel();
  assert.ok(model, "Outside production the flag gives the local stand-in");

  // The stand-in answers without the network: any request would throw here.
  globalThis.fetch = async () => {
    throw new Error("The local stand-in must not reach the network.");
  };
  const { text } = await generateText({ model, prompt: "Beri judul" });
  assert.equal(text, "Percakapan uji lokal");
} finally {
  globalThis.fetch = realFetch;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else writableEnv[key] = value;
  }
}

// The step control. Only each step's token usage matters here, so a step is described by its input and output tokens alone.
const step = (inputTokens: number, outputTokens: number) => ({
  usage: { inputTokens, outputTokens } as unknown as LanguageModelUsage,
});
const small = step(2_000, 500);
const heavy = step(20_000, 5_000);
const repeat = (count: number, item: ReturnType<typeof step>) => Array.from({ length: count }, () => item);
const control = (maxSteps: number) =>
  finalStepControl({ maxSteps, effort: VERA_EFFORTS.mendalam, prices: VERA_DEFAULT_PRICES });

assert.equal(
  control(VERA_LIMITS.studioMaxSteps).prepareStep({ stepNumber: 0, steps: [] }).toolChoice,
  undefined,
  "The first step keeps its tools",
);
assert.equal(
  control(VERA_LIMITS.studioMaxSteps).prepareStep({ stepNumber: 4, steps: repeat(4, small) }).toolChoice,
  undefined,
  "A cheap run keeps its tools on an early step",
);

// The last allowed step runs with no tools: the chat's fifth step and the Studio's eighth.
const chatLast = control(VERA_LIMITS.maxSteps).prepareStep({
  stepNumber: VERA_LIMITS.maxSteps - 1,
  steps: repeat(VERA_LIMITS.maxSteps - 1, small),
});
assert.equal(chatLast.toolChoice, "none", "The chat's last step runs without tools");
assert.deepEqual(chatLast.activeTools, [], "No tool is active on the chat's last step");
const studioLast = control(VERA_LIMITS.studioMaxSteps).prepareStep({
  stepNumber: VERA_LIMITS.studioMaxSteps - 1,
  steps: repeat(VERA_LIMITS.studioMaxSteps - 1, small),
});
assert.equal(studioLast.toolChoice, "none", "The Studio's last step runs without tools");

// Near the ceiling: a step runs without tools when another step after it might not fit, and the run stops after that step.
const nearCeiling = [heavy, heavy, heavy, heavy, small];
const nearCeilingRun = control(VERA_LIMITS.studioMaxSteps);
assert.equal(
  nearCeilingRun.prepareStep({ stepNumber: 5, steps: nearCeiling }).toolChoice,
  "none",
  "A step near the ceiling runs without tools",
);
assert.equal(nearCeilingRun.stopWhen({ steps: [...nearCeiling, small] }), true, "The run stops once that final step is done");
assert.equal(
  control(VERA_LIMITS.studioMaxSteps).stopWhen({ steps: nearCeiling }),
  false,
  "A run keeps going while its final step still fits",
);

// When not even one more worst-case step fits, the run stops rather than start a step it cannot finish.
assert.equal(control(VERA_LIMITS.studioMaxSteps).stopWhen({ steps: repeat(4, heavy) }), true, "A run stops when no step fits");
assert.equal(control(VERA_LIMITS.studioMaxSteps).stopWhen({ steps: repeat(4, small) }), false, "A cheap run keeps going");

console.log("Vera model checks passed.");

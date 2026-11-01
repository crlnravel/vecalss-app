import "dotenv/config";
import assert from "node:assert/strict";

import { generateText } from "ai";

import { getVeraModel, isVeraDevModelEnabled, setVeraModelForTests } from "../lib/vera/model";

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

console.log("Vera model checks passed.");

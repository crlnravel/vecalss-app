import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { createVeraDevModel } from "./dev-model";

/** `undefined` means no override. Tests pass a mock model, or `null` to simulate a missing provider. */
let testModel: LanguageModel | null | undefined;
let devModel: LanguageModel | undefined;

export function setVeraModelForTests(model: LanguageModel | null | undefined) {
  testModel = model;
}

export function getVeraModelId() {
  return process.env.VERA_OPENAI_MODEL?.trim() || "gpt-6-luna";
}

/**
 * The local stand-in runs only with VERA_MOCK_MODEL=1 outside production, so the browser smoke test can run on a dev server without an
 * API key. Production never reads the flag.
 */
export function isVeraDevModelEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && env.VERA_MOCK_MODEL === "1";
}

/** Returns null when no API key is configured, so the caller can answer 503 before doing any work. */
export function getVeraModel(): LanguageModel | null {
  if (testModel !== undefined) return testModel;
  if (isVeraDevModelEnabled()) {
    devModel ??= createVeraDevModel();
    return devModel;
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return createOpenAI({ apiKey }).responses(getVeraModelId());
}

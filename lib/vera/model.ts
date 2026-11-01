import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/** `undefined` means no override. Tests pass a mock model, or `null` to simulate a missing provider. */
let testModel: LanguageModel | null | undefined;

export function setVeraModelForTests(model: LanguageModel | null | undefined) {
  testModel = model;
}

export function getVeraModelId() {
  return process.env.VERA_OPENAI_MODEL?.trim() || "gpt-6-luna";
}

/** Returns null when no API key is configured, so the caller can answer 503 before doing any work. */
export function getVeraModel(): LanguageModel | null {
  if (testModel !== undefined) return testModel;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return createOpenAI({ apiKey }).responses(getVeraModelId());
}

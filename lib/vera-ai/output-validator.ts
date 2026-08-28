import "server-only";

import { sha256Hex, normalizeText } from "./contracts";

export class VeraOutputValidationError extends Error {
  readonly code = "malformed_output" as const;

  constructor(message: string) {
    super(message);
    this.name = "VeraOutputValidationError";
  }
}

export type NormalizedVeraResult = {
  text: string | null;
  structured: unknown | null;
  citationKeys: string[];
  digest: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    quotaUnitsConsumed: number | null;
    tokenUsageState: "known" | "unknown" | "not_applicable";
  };
  kind: "success" | "fallback" | "discarded";
  finishReason: string | null;
};

const CITATION_PATTERN = /\[\^([A-Za-z0-9_-]{1,64})\]/g;
const RAW_HTML_PATTERN = /<\/?[a-z][^>]*>/iu;
const IMAGE_PATTERN = /!\[[^\]]*\]\([^)]*\)/u;
const EXECUTABLE_URL_PATTERN = /(?:javascript|data|vbscript):/iu;

/**
 * The validator is shared by Chat and later typed features. It accepts only
 * server-provided citation keys and turns unknown citation markers into plain
 * text instead of allowing model-authored authority to leak into a result.
 */
export function validateVeraResult(input: {
  text: string | null;
  structured?: unknown | null;
  kind?: "success" | "fallback" | "discarded";
  finishReason?: string | null;
  usage: NormalizedVeraResult["usage"];
  allowedCitationKeys: Iterable<string>;
}): NormalizedVeraResult {
  const originalText = input.text === null ? null : normalizeText(input.text);
  if (originalText !== null && RAW_HTML_PATTERN.test(originalText)) {
    throw new VeraOutputValidationError("Raw HTML is not allowed in durable Vera output.");
  }
  if (originalText !== null && IMAGE_PATTERN.test(originalText)) {
    throw new VeraOutputValidationError("Images are not allowed in durable Vera output.");
  }
  if (originalText !== null && EXECUTABLE_URL_PATTERN.test(originalText)) {
    throw new VeraOutputValidationError("Executable URL schemes are not allowed in durable Vera output.");
  }

  const allowed = new Set([...input.allowedCitationKeys]);
  const citationKeys = new Set<string>();
  let text = originalText;
  if (text !== null) {
    text = text.replace(CITATION_PATTERN, (marker, key: string) => {
      if (!allowed.has(key)) return "";
      citationKeys.add(key);
      return marker;
    });
    for (const match of text.matchAll(CITATION_PATTERN)) {
      const key = match[1];
      if (!key) continue;
      citationKeys.add(key);
    }
  }

  const payload = {
    text,
    structured: input.structured ?? null,
    citationKeys: [...citationKeys].sort(),
    kind: input.kind ?? "success",
    finishReason: input.finishReason ?? null,
    usage: input.usage,
  };
  return {
    text,
    structured: input.structured ?? null,
    citationKeys: payload.citationKeys,
    digest: sha256Hex(JSON.stringify(payload)),
    usage: input.usage,
    kind: payload.kind,
    finishReason: payload.finishReason,
  };
}

/** Provisional SSE deltas are escaped plaintext, never Markdown. */
export function inertVeraDelta(value: string): string {
  return normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u0000/g, "");
}

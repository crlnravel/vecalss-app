import {
  canonicalJson,
  normalizeText,
  sha256Hex,
  VeraContractError,
} from "./contracts";

/** The only model-visible automatic-context function in v1. */
export const VERA_CONTEXT_TOOL_NAME = "retrieve_released_learning_context" as const;
export const VERA_CONTEXT_TOOL_SCHEMA_ID = "vera.context-tool.v1" as const;
export const VERA_CONTEXT_TOOL_RESULT_SCHEMA_ID = "vera.context-tool-result.v1" as const;
export const VERA_CONTEXT_REGISTRY_VERSION = "vera-context-registry-v1" as const;
export const VERA_CONTEXT_RESOLVER_VERSION = "vera-context-resolver-v1" as const;

export const VERA_CONTEXT_KINDS = ["materi", "kuis", "tryout"] as const;
export type VeraContextKind = (typeof VERA_CONTEXT_KINDS)[number];

const KIND_ORDER: readonly VeraContextKind[] = VERA_CONTEXT_KINDS;

/**
 * Keep this object literal stable. It is hashed into the provider release
 * evidence and intentionally has no browser-, database-, or provider-owned
 * parameters.
 */
export const VERA_CONTEXT_TOOL_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: VERA_CONTEXT_TOOL_NAME,
    description: "Find relevant released Vecalss learning evidence the authenticated learner may access.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query", "kinds", "maxSources"],
      properties: {
        query: { type: "string", minLength: 1, maxLength: 240 },
        kinds: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          uniqueItems: true,
          items: { enum: [...VERA_CONTEXT_KINDS] },
        },
        maxSources: { type: "integer", minimum: 1, maximum: 4 },
      },
    },
  },
} as const);

export type RetrieveReleasedLearningContextArgs = {
  query: string;
  kinds: VeraContextKind[];
  maxSources: number;
};

export type ContextToolReleaseMetadata = {
  releasedAt: string;
  versionDigest: string;
};

export type ContextToolSource = {
  citationKey: string;
  kind: VeraContextKind;
  title: string;
  releaseMetadata: ContextToolReleaseMetadata;
  evidenceSegments: string[];
  limitations: string[];
};

export type ContextToolResult = {
  schema: typeof VERA_CONTEXT_TOOL_RESULT_SCHEMA_ID;
  registryVersion: string;
  sources: ContextToolSource[];
  limitations: string[];
  truncationCount: number;
  resultDigest: string;
};

const TOOL_ARGUMENT_KEYS = new Set(["query", "kinds", "maxSources"]);
const TOOL_RESULT_KEYS = new Set(["schema", "registryVersion", "sources", "limitations", "truncationCount", "resultDigest"]);
const SOURCE_KEYS = new Set(["citationKey", "kind", "title", "releaseMetadata", "evidenceSegments", "limitations"]);
const RELEASE_KEYS = new Set(["releasedAt", "versionDigest"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new VeraContractError(
      "context_release_unavailable",
      `Struktur ${label} tidak dikenal.`,
      422,
      { reason: "unknown_fields", label, fields: unknown.sort() },
    );
  }
}

function normalizeBoundedText(value: unknown, label: string, maxLength: number, rejectUnsafeContent = false): string {
  if (typeof value !== "string") {
    throw new VeraContractError("context_release_unavailable", `${label} harus berupa teks.`, 422);
  }
  const normalized = normalizeText(value).trim().replace(/[\t\r\n ]+/gu, " ");
  const unsafeExternalContent = /<\/?[^>]*>|(?:^|[\s(])(?:[a-z][a-z0-9+.-]*):(?:\/\/|[^\s<>]+)|(?:^|[\s(])(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#][^\s<>]*)?/iu;
  if (!normalized || Array.from(normalized).length > maxLength || /[\u0000-\u001f\u007f]/u.test(normalized)
    || (rejectUnsafeContent && unsafeExternalContent.test(normalized))) {
    throw new VeraContractError("context_release_unavailable", `${label} tidak memenuhi batas kontrak.`, 422);
  }
  return normalized;
}

function normalizeKind(value: unknown): VeraContextKind {
  if (typeof value !== "string" || !VERA_CONTEXT_KINDS.includes(value as VeraContextKind)) {
    throw new VeraContractError("context_release_unavailable", "Jenis sumber konteks tidak didukung.", 422, { reason: "unknown_kind" });
  }
  return value as VeraContextKind;
}

function normalizeKinds(value: unknown): VeraContextKind[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new VeraContractError("context_release_unavailable", "Jenis sumber konteks tidak valid.", 422, { reason: "kind_count" });
  }
  const kinds = value.map(normalizeKind);
  if (new Set(kinds).size !== kinds.length) {
    throw new VeraContractError("context_release_unavailable", "Jenis sumber konteks tidak boleh berulang.", 422, { reason: "duplicate_kind" });
  }
  return [...kinds].sort((left, right) => KIND_ORDER.indexOf(left) - KIND_ORDER.indexOf(right));
}

function normalizeMaxSources(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 4) {
    throw new VeraContractError("context_release_unavailable", "Jumlah sumber konteks tidak valid.", 422, { reason: "source_cap" });
  }
  return value;
}

export function parseRetrieveReleasedLearningContextArgs(value: unknown): RetrieveReleasedLearningContextArgs {
  if (!isRecord(value)) {
    throw new VeraContractError("context_release_unavailable", "Argumen tool Vera harus berupa objek.", 422);
  }
  rejectUnknownKeys(value, TOOL_ARGUMENT_KEYS, "argumen tool");
  if (!("query" in value) || !("kinds" in value) || !("maxSources" in value)) {
    throw new VeraContractError("context_release_unavailable", "Argumen tool Vera belum lengkap.", 422, { reason: "required_field" });
  }
  return {
    query: normalizeBoundedText(value.query, "query", 240, true),
    kinds: normalizeKinds(value.kinds),
    maxSources: normalizeMaxSources(value.maxSources),
  };
}

export function canonicalContextToolArguments(value: unknown): string {
  return canonicalJson(parseRetrieveReleasedLearningContextArgs(value));
}

export function contextToolArgumentsDigest(value: unknown): string {
  return sha256Hex(canonicalContextToolArguments(value));
}

function normalizeCitationKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new VeraContractError("context_release_unavailable", "Kunci sitasi tidak valid.", 422);
  }
  const normalized = normalizeText(value).trim();
  if (!/^[a-z][a-z0-9_-]{1,79}$/u.test(normalized)) {
    throw new VeraContractError("context_release_unavailable", "Kunci sitasi tidak valid.", 422);
  }
  return normalized;
}

function normalizeDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new VeraContractError("context_release_unavailable", `${label} tidak valid.`, 422);
  }
  return value;
}

function normalizeReleaseMetadata(value: unknown): ContextToolReleaseMetadata {
  if (!isRecord(value)) throw new VeraContractError("context_release_unavailable", "Metadata rilis tidak valid.", 422);
  rejectUnknownKeys(value, RELEASE_KEYS, "metadata rilis");
  if (typeof value.releasedAt !== "string" || Number.isNaN(Date.parse(value.releasedAt))) {
    throw new VeraContractError("context_release_unavailable", "Waktu rilis tidak valid.", 422);
  }
  return {
    releasedAt: new Date(value.releasedAt).toISOString(),
    versionDigest: normalizeDigest(value.versionDigest, "Digest versi"),
  };
}

function normalizeTextList(value: unknown, label: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new VeraContractError("context_release_unavailable", `${label} tidak valid.`, 422);
  }
  return value.map((entry) => normalizeBoundedText(entry, label, maxLength, true));
}

function normalizedResultPayload(result: Omit<ContextToolResult, "resultDigest">): Omit<ContextToolResult, "resultDigest"> {
  return {
    schema: result.schema,
    registryVersion: normalizeBoundedText(result.registryVersion, "registryVersion", 120),
    sources: result.sources.map((source) => ({
      citationKey: normalizeCitationKey(source.citationKey),
      kind: normalizeKind(source.kind),
      title: normalizeBoundedText(source.title, "title", 220, true),
      releaseMetadata: normalizeReleaseMetadata(source.releaseMetadata),
      evidenceSegments: normalizeTextList(source.evidenceSegments, "evidenceSegments", 32, 6_000),
      limitations: normalizeTextList(source.limitations, "limitations", 8, 240),
    })),
    limitations: normalizeTextList(result.limitations, "limitations", 8, 240),
    truncationCount: Number.isSafeInteger(result.truncationCount) && result.truncationCount >= 0 ? result.truncationCount : -1,
  };
}

export function contextToolResultDigest(result: Omit<ContextToolResult, "resultDigest">): string {
  return sha256Hex(canonicalJson(normalizedResultPayload(result)));
}

export function createContextToolResult(input: {
  registryVersion?: string;
  sources: readonly ContextToolSource[];
  limitations?: readonly string[];
  truncationCount?: number;
}): ContextToolResult {
  const payload = normalizedResultPayload({
    schema: VERA_CONTEXT_TOOL_RESULT_SCHEMA_ID,
    registryVersion: input.registryVersion ?? VERA_CONTEXT_REGISTRY_VERSION,
    sources: [...input.sources],
    limitations: [...(input.limitations ?? [])],
    truncationCount: input.truncationCount ?? 0,
  });
  if (payload.sources.length > 4 || new Set(payload.sources.map((source) => source.citationKey)).size !== payload.sources.length) {
    throw new VeraContractError("context_release_unavailable", "Hasil tool Vera melebihi batas sumber atau memiliki sitasi ganda.", 422);
  }
  if (payload.truncationCount < 0) throw new VeraContractError("context_release_unavailable", "Jumlah truncation tidak valid.", 422);
  return { ...payload, resultDigest: contextToolResultDigest(payload) };
}

export function parseContextToolResult(value: unknown): ContextToolResult {
  if (!isRecord(value)) throw new VeraContractError("context_release_unavailable", "Hasil tool Vera harus berupa objek.", 422);
  rejectUnknownKeys(value, TOOL_RESULT_KEYS, "hasil tool");
  if (value.schema !== VERA_CONTEXT_TOOL_RESULT_SCHEMA_ID || !Array.isArray(value.sources)) {
    throw new VeraContractError("context_release_unavailable", "Versi hasil tool Vera tidak didukung.", 422);
  }
  if (value.sources.length > 4) throw new VeraContractError("context_release_unavailable", "Hasil tool Vera melebihi batas sumber.", 422);
  if (typeof value.registryVersion !== "string" || !Array.isArray(value.limitations)
    || typeof value.truncationCount !== "number" || !Number.isSafeInteger(value.truncationCount)) {
    throw new VeraContractError("context_release_unavailable", "Hasil tool Vera belum memenuhi struktur wajib.", 422);
  }
  const sources = value.sources.map((candidate) => {
    if (!isRecord(candidate)) throw new VeraContractError("context_release_unavailable", "Sumber hasil tool tidak valid.", 422);
    rejectUnknownKeys(candidate, SOURCE_KEYS, "sumber hasil tool");
    if (!("releaseMetadata" in candidate) || !("evidenceSegments" in candidate) || !("limitations" in candidate)) {
      throw new VeraContractError("context_release_unavailable", "Sumber hasil tool belum lengkap.", 422);
    }
    return {
      citationKey: normalizeCitationKey(candidate.citationKey),
      kind: normalizeKind(candidate.kind),
      title: normalizeBoundedText(candidate.title, "title", 220, true),
      releaseMetadata: normalizeReleaseMetadata(candidate.releaseMetadata),
      evidenceSegments: normalizeTextList(candidate.evidenceSegments, "evidenceSegments", 32, 6_000),
      limitations: normalizeTextList(candidate.limitations, "limitations", 8, 240),
    } satisfies ContextToolSource;
  });
  const payload = normalizedResultPayload({
    schema: VERA_CONTEXT_TOOL_RESULT_SCHEMA_ID,
    registryVersion: value.registryVersion,
    sources,
    limitations: value.limitations,
    truncationCount: value.truncationCount,
  });
  if (new Set(sources.map((source) => source.citationKey)).size !== sources.length) {
    throw new VeraContractError("context_release_unavailable", "Hasil tool Vera memiliki sitasi ganda.", 422);
  }
  if (typeof value.resultDigest !== "string" || value.resultDigest !== contextToolResultDigest(payload)) {
    throw new VeraContractError("context_release_unavailable", "Digest hasil tool Vera tidak cocok.", 422, { reason: "result_digest_mismatch" });
  }
  return { ...payload, resultDigest: value.resultDigest };
}

export function serializeContextToolResult(result: ContextToolResult): Uint8Array {
  return Buffer.from(canonicalJson(parseContextToolResult(result)), "utf8");
}

export function assertContextToolCall(value: unknown): RetrieveReleasedLearningContextArgs {
  if (!isRecord(value) || value.name !== VERA_CONTEXT_TOOL_NAME || !isRecord(value.arguments)) {
    throw new VeraContractError("context_release_unavailable", "Tool call Vera tidak valid.", 422, { reason: "tool_call_shape" });
  }
  rejectUnknownKeys(value, new Set(["name", "arguments"]), "tool call");
  return parseRetrieveReleasedLearningContextArgs(value.arguments);
}

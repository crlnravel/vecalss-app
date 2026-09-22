import "server-only";

import { EnvelopeService, type AiEncryptedPayload } from "./envelope";
import {
  VERA_CONTEXT_MODE_BUDGETS,
  VERA_AUTOMATIC_CONTEXT_BUDGETS,
  VERA_CONTEXT_PACK_VERSION,
  VERA_LEGACY_CONTEXT_PACK_VERSION,
  VERA_FIXED_FRAMING_TOKEN_BOUND,
  VERA_INPUT_CERTIFIER_ID,
  VERA_INPUT_SERIALIZER_ID,
  VERA_LEGACY_INPUT_SERIALIZER_ID,
  VERA_MAX_HISTORY_BYTES,
  VERA_MAX_HISTORY_MESSAGE_BYTES,
  VERA_MAX_HISTORY_MESSAGES,
  VERA_MAX_HISTORY_PAIRS,
  VERA_MAX_CONTEXT_SOURCES,
  VeraContractError,
  normalizeSelection,
  normalizeText,
  selectionDigest,
  sha256Hex,
  type VeraContextMode,
  type VeraContextSelection,
  type VeraContextSourceType,
} from "./contracts";
import { parseContextToolResult, type ContextToolResult, type ContextToolSource } from "./context-tool-contracts";

export type ResolvedContextBlock = {
  sourceType: Exclude<VeraContextSourceType, "document">;
  sourceId: string;
  title: string;
  citationLabel: string;
  citationKey: string;
  content: string;
  contentDigest?: string;
  sourceVersionId?: string;
};

export interface VeraContextResolver {
  resolve(selection: VeraContextSelection, authority?: { studentId: string }): Promise<ResolvedContextBlock>;
}

export type PreparedContextBlock = {
  ordinal: number;
  sourceType: Exclude<VeraContextSourceType, "document">;
  sourceId: string;
  citationKey: string;
  titleSnapshot: string;
  citationLabel: string;
  contentDigest: string;
  content: string;
  redacted: boolean;
  truncated: boolean;
};

export type PreparedContextPack = {
  contextPackVersion: string;
  selectionDigest: string;
  blocks: PreparedContextBlock[];
  messageManifest: Array<{ ordinal: number; digest: string }>;
  history: Array<{ ordinal: number; role: "user" | "assistant"; text: string; digest: string }>;
  canonicalTaskBytes: Uint8Array;
  packDigest: string;
  contextTaskDigest: string;
  byteCount: number;
  truncation: { maxBlockBytes: number; truncatedOrdinals: number[] };
  redactionPolicyVersion: string;
  systemPolicyHash: string;
  promptTemplateHash: string;
  toolSchemaHash: string;
  contextMode: VeraContextMode;
  inputCertification: VeraInputCertification;
  toolCallDigest?: string;
  toolResultDigest?: string;
  registryVersion?: string;
  resolverVersion?: string;
  sourceManifestDigest?: string;
};

export type VeraPriorMessage = {
  role: "user" | "assistant";
  text: string;
  /** A monotonic request/message sequence when the caller has one. */
  sequence?: number;
};

export type VeraInputCertification = {
  certifierId: typeof VERA_INPUT_CERTIFIER_ID;
  serializerId: typeof VERA_INPUT_SERIALIZER_ID | typeof VERA_LEGACY_INPUT_SERIALIZER_ID;
  fixedFramingTokenBound: typeof VERA_FIXED_FRAMING_TOKEN_BOUND;
  measuredBytes: number;
  certifiedTokenUpperBound: number;
  inputTokenCap: number;
  certified: true;
};

export type ContextPackInput = {
  studentId?: string;
  selection: VeraContextSelection[];
  userText: string;
  priorMessages?: VeraPriorMessage[];
  mode?: VeraContextMode;
  policyVersion: string;
  promptTemplateHash: string;
  toolSchemaHash: string;
  systemPolicyHash: string;
  taskAuthority?: Record<string, unknown>;
  maxBlockBytes?: number;
  maxTaskBytes?: number;
};

const DEFAULT_MODE: VeraContextMode = "chat_review";

function boundedUtf8(value: string, maxBytes: number): string {
  const normalized = normalizeText(value);
  const bytes = Buffer.from(normalized, "utf8");
  if (bytes.byteLength <= maxBytes) return normalized;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}

/**
 * Keep only complete user/assistant pairs. The caller is expected to provide
 * messages in monotonic sequence order; a sequence field is used as a stable
 * tie-breaker when a caller has loaded rows from more than one source.
 */
export function selectRecentCompletedHistory(messages: readonly VeraPriorMessage[]): VeraPriorMessage[] {
  const ordered = messages
    .map((message, index) => ({ ...message, index }))
    .filter((message) => message.role === "user" || message.role === "assistant")
    .sort((left, right) => (left.sequence ?? left.index) - (right.sequence ?? right.index) || left.index - right.index);
  const pairs: VeraPriorMessage[][] = [];
  for (let index = 0; index + 1 < ordered.length; index += 1) {
    const user = ordered[index];
    const assistant = ordered[index + 1];
    if (user?.role !== "user" || assistant?.role !== "assistant") continue;
    pairs.push([
      { role: "user", text: boundedUtf8(user.text, VERA_MAX_HISTORY_MESSAGE_BYTES), sequence: user.sequence },
      { role: "assistant", text: boundedUtf8(assistant.text, VERA_MAX_HISTORY_MESSAGE_BYTES), sequence: assistant.sequence },
    ]);
    index += 1;
  }
  const recent = pairs.slice(-VERA_MAX_HISTORY_PAIRS).flat();
  let bytes = 0;
  const bounded: VeraPriorMessage[] = [];
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index]!;
    const messageBytes = Buffer.byteLength(message.text, "utf8");
    const framedBytes = messageBytes + Buffer.byteLength(message.role, "utf8") + 8;
    if (bytes + framedBytes > VERA_MAX_HISTORY_BYTES) break;
    bytes += framedBytes;
    bounded.unshift(message);
  }
  return bounded.slice(-VERA_MAX_HISTORY_MESSAGES);
}

export function certifyFinalSerializedInput(
  bytes: Uint8Array,
  mode: VeraContextMode,
  serializerId: VeraInputCertification["serializerId"] = VERA_INPUT_SERIALIZER_ID,
): VeraInputCertification {
  const budget = VERA_CONTEXT_MODE_BUDGETS[mode];
  if (!(bytes instanceof Uint8Array) || !Number.isInteger(bytes.byteLength) || bytes.byteLength < 0) {
    throw new VeraContractError("context_limit_exceeded", "Input Vera tidak dapat disertifikasi.", 422);
  }
  const certifiedTokenUpperBound = bytes.byteLength + VERA_FIXED_FRAMING_TOKEN_BOUND;
  if (certifiedTokenUpperBound > budget.inputTokenCap) {
    throw new VeraContractError(
      "context_limit_exceeded",
      "Input Vera melebihi batas mode.",
      422,
      { measuredBytes: bytes.byteLength, certifiedTokenUpperBound, inputTokenCap: budget.inputTokenCap },
    );
  }
  return {
    certifierId: VERA_INPUT_CERTIFIER_ID,
    serializerId,
    fixedFramingTokenBound: VERA_FIXED_FRAMING_TOKEN_BOUND,
    measuredBytes: bytes.byteLength,
    certifiedTokenUpperBound,
    inputTokenCap: budget.inputTokenCap,
    certified: true,
  };
}

function redact(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  const value = normalizeText(text)
    .replace(/<\/?[^>]+>/g, () => {
      redacted = true;
      return "";
    })
    .replace(/(?:sk|pk|api)[_-][a-z0-9_-]{12,}/gi, () => {
      redacted = true;
      return "[redacted]";
    });
  return { text: value, redacted };
}

function truncateUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) return { text: value, truncated: false };

  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return { text: bytes.subarray(0, end).toString("utf8"), truncated: true };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(typeof value === "string" ? normalizeText(value) : value);
}

/**
 * Resolve and pack only server-known sources. This function is deliberately
 * side-effect free; persistence belongs to the later admission transaction.
 */
export async function prepareContextPack(
  input: ContextPackInput,
  resolver: VeraContextResolver,
): Promise<PreparedContextPack> {
  const mode = input.mode ?? DEFAULT_MODE;
  const budget = VERA_CONTEXT_MODE_BUDGETS[mode];
  const selection = normalizeSelection(input.selection);
  if (selection.length > budget.maxSources || selection.length > VERA_MAX_CONTEXT_SOURCES) {
    throw new VeraContractError("context_release_unavailable", "Sumber konteks terlalu banyak.", 422);
  }

  const serverOrder = [...selection].sort((left, right) =>
    `${left.sourceType}:${left.sourceId}`.localeCompare(`${right.sourceType}:${right.sourceId}`));
  const authority = input.studentId ? { studentId: input.studentId } : undefined;
  const resolved = await Promise.all(serverOrder.map((source) => resolver.resolve(source, authority)));
  const maxBlockBytes = input.maxBlockBytes === undefined
    ? budget.maxBlockBytes
    : Math.min(input.maxBlockBytes, budget.maxBlockBytes);
  const maxTaskBytes = input.maxTaskBytes === undefined
    ? budget.maxFinalInputBytes
    : Math.min(input.maxTaskBytes, budget.maxFinalInputBytes);
  if (!Number.isInteger(maxBlockBytes) || maxBlockBytes < 1
    || !Number.isInteger(maxTaskBytes) || maxTaskBytes < 1) {
    throw new VeraContractError("context_release_unavailable", "Batas byte konteks tidak valid.", 422);
  }
  const blocks: PreparedContextBlock[] = [];
  const truncatedOrdinals: number[] = [];

  resolved.forEach((block, index) => {
    const requested = serverOrder[index];
    if (!requested || block.sourceType !== requested.sourceType || block.sourceId !== requested.sourceId) {
      throw new VeraContractError("context_release_unavailable", "Resolver konteks mengembalikan sumber yang berbeda.", 410);
    }
    const redacted = redact(block.content);
    const bounded = truncateUtf8(redacted.text, maxBlockBytes);
    const ordinal = index + 1;
    if (bounded.truncated) truncatedOrdinals.push(ordinal);
    blocks.push({
      ordinal,
      sourceType: block.sourceType,
      sourceId: block.sourceId,
      citationKey: block.citationKey,
      titleSnapshot: normalizeText(block.title),
      citationLabel: normalizeText(block.citationLabel),
      contentDigest: block.contentDigest ?? sha256Hex(bounded.text),
      content: bounded.text,
      redacted: redacted.redacted,
      truncated: bounded.truncated,
    });
  });

  const priorMessages = selectRecentCompletedHistory(input.priorMessages ?? []);
  const history = priorMessages.map((message, index) => ({
    ordinal: index + 1,
    role: message.role,
    text: message.text,
    digest: sha256Hex(`${message.role}:${normalizeText(message.text)}`),
  }));
  const buildTask = (boundedHistory: typeof history) => ({
    contextPackVersion: VERA_LEGACY_CONTEXT_PACK_VERSION,
    policyVersion: input.policyVersion,
    userText: normalizeText(input.userText),
    // Provider input carries the bounded role/text pairs only. The digest
    // manifest is returned separately and persisted as audit metadata.
    history: boundedHistory.map(({ ordinal, role, text }) => ({ ordinal, role, text })),
    blocks: blocks.map(({ content, ...manifest }) => ({ ...manifest, content })),
    ...(input.taskAuthority ? { authority: input.taskAuthority } : {}),
  });
  let boundedHistory = history;
  let initialBytes = Buffer.from(canonicalJson(buildTask(boundedHistory)), "utf8");
  while (initialBytes.byteLength > maxTaskBytes && boundedHistory.length >= 2) {
    boundedHistory = boundedHistory.slice(2);
    initialBytes = Buffer.from(canonicalJson(buildTask(boundedHistory)), "utf8");
  }
  if (initialBytes.byteLength > maxTaskBytes) {
    throw new VeraContractError(
      "context_limit_exceeded",
      "Konteks melebihi batas byte yang diizinkan.",
      422,
      { reason: "final_input_byte_cap", maxTaskBytes, mode },
    );
  }
  const canonicalTaskBytes = initialBytes;
  const inputCertification = certifyFinalSerializedInput(canonicalTaskBytes, mode, VERA_LEGACY_INPUT_SERIALIZER_ID);
  const packDigest = sha256Hex(canonicalTaskBytes);
  const contextTaskDigest = sha256Hex(`${packDigest}:${input.promptTemplateHash}:${input.toolSchemaHash}:${inputCertification.certifierId}:${inputCertification.serializerId}`);

  return {
    contextPackVersion: VERA_LEGACY_CONTEXT_PACK_VERSION,
    selectionDigest: selectionDigest(selection),
    blocks,
    messageManifest: boundedHistory.map(({ ordinal, digest }) => ({ ordinal, digest })),
    history: boundedHistory,
    canonicalTaskBytes,
    packDigest,
    contextTaskDigest,
    byteCount: canonicalTaskBytes.byteLength,
    truncation: { maxBlockBytes, truncatedOrdinals },
    redactionPolicyVersion: "vera-redaction-v1",
    systemPolicyHash: input.systemPolicyHash,
    promptTemplateHash: input.promptTemplateHash,
    toolSchemaHash: input.toolSchemaHash,
    contextMode: mode,
    inputCertification,
  };
}

export type AutomaticContextPackSource = ContextToolSource & {
  /** Internal UUID persisted in AiRequestSource; never included in provider task/result. */
  sourceId: string;
  sourceVersionId?: string;
};

export type AutomaticContextPackInput = {
  feature: "chat" | "review" | "analysis" | "route";
  userText: string;
  priorMessages?: VeraPriorMessage[];
  mode?: VeraContextMode;
  policyVersion: string;
  promptTemplateHash: string;
  toolSchemaHash: string;
  systemPolicyHash: string;
  toolCallDigest: string;
  toolResult: ContextToolResult;
  registryVersion: string;
  resolverVersion: string;
  /** Internal identity-bearing manifest required for persistence. */
  sources: readonly AutomaticContextPackSource[];
  taskAuthority?: Record<string, unknown>;
  maxSourceBytes?: number;
  maxTaskBytes?: number;
};

export type AutomaticContextSourceAllocation = {
  citationKey: string;
  evidenceSegments: string[];
  truncated: boolean;
};

function isSha256Digest(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

/**
 * Allocate whole, already-delimited evidence segments in ranked order. A
 * round-robin pass keeps one verbose source from consuming the entire budget;
 * ties are resolved by the input order frozen by the registry.
 */
export function allocateAutomaticContextSourceBytes(
  sources: readonly AutomaticContextPackSource[],
  buildTask: (allocation: readonly AutomaticContextSourceAllocation[]) => Uint8Array,
  maxTaskBytes: number,
  maxSourceBytes = 6_000,
): { allocation: AutomaticContextSourceAllocation[]; truncatedOrdinals: number[]; bytes: Uint8Array } {
  const allocation: AutomaticContextSourceAllocation[] = sources.map((source) => ({
    citationKey: source.citationKey,
    evidenceSegments: [],
    truncated: false,
  }));
  const cursors = sources.map(() => 0);
  const sourceBytes = sources.map(() => 0);
  const boundedSegments = sources.map((source) => source.evidenceSegments.map((segment) => {
    const redacted = redact(segment);
    const bounded = boundedUtf8(redacted.text, maxSourceBytes);
    return { text: bounded, truncated: bounded !== redacted.text };
  }));
  let bytes = buildTask(allocation);
  const truncatedOrdinals = new Set<number>();
  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    for (let index = 0; index < sources.length; index += 1) {
      const nextEntry = boundedSegments[index]?.[cursors[index] ?? 0];
      if (nextEntry === undefined) continue;
      cursors[index] = (cursors[index] ?? 0) + 1;
      const candidate = allocation[index];
      if (!candidate || !nextEntry.text) continue;
      if (nextEntry.truncated) {
        candidate.truncated = true;
        truncatedOrdinals.add(index + 1);
      }
      const next = nextEntry.text;
      const nextByteCount = Buffer.byteLength(next, "utf8");
      const separatorBytes = candidate.evidenceSegments.length > 0 ? 2 : 0;
      if ((sourceBytes[index] ?? 0) + separatorBytes + nextByteCount > maxSourceBytes) {
        candidate.truncated = true;
        truncatedOrdinals.add(index + 1);
        continue;
      }
      const nextAllocation = allocation.map((entry, candidateIndex) => candidateIndex === index
        ? { ...entry, evidenceSegments: [...entry.evidenceSegments, next] }
        : { ...entry, evidenceSegments: [...entry.evidenceSegments] });
      const nextBytes = buildTask(nextAllocation);
      if (nextBytes.byteLength <= maxTaskBytes) {
        candidate.evidenceSegments.push(next);
        sourceBytes[index] = (sourceBytes[index] ?? 0) + separatorBytes + nextByteCount;
        bytes = nextBytes;
        madeProgress = true;
      } else {
        candidate.truncated = true;
        truncatedOrdinals.add(index + 1);
      }
    }
  }
  return { allocation, truncatedOrdinals: [...truncatedOrdinals].sort((left, right) => left - right), bytes };
}

/**
 * v2 automatic-context packer. The exact final serialized bytes are built
 * before dispatch; no provider tokenizer estimate is used for admission.
 */
export function prepareAutomaticContextPack(input: AutomaticContextPackInput): PreparedContextPack {
  const mode = input.mode ?? "chat_review";
  const budget = VERA_AUTOMATIC_CONTEXT_BUDGETS[mode];
  const parsedResult = parseContextToolResult(input.toolResult);
  if (!isSha256Digest(input.toolCallDigest) || parsedResult.resultDigest !== input.toolResult.resultDigest) {
    throw new VeraContractError("context_tool_invalid", "Digest tool otomatis tidak valid.", 422);
  }
  if (input.registryVersion !== parsedResult.registryVersion || !input.resolverVersion.trim()) {
    throw new VeraContractError("context_tool_invalid", "Versi registry/resolver tidak cocok.", 422);
  }
  const maxSourceBytes = input.maxSourceBytes === undefined ? budget.maxSourceBytes : Math.min(input.maxSourceBytes, budget.maxSourceBytes);
  const maxTaskBytes = input.maxTaskBytes === undefined ? budget.exactFinalSerializedInputByteCap : Math.min(input.maxTaskBytes, budget.exactFinalSerializedInputByteCap);
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1 || !Number.isSafeInteger(maxTaskBytes) || maxTaskBytes < 1) {
    throw new VeraContractError("context_limit_exceeded", "Batas byte context pack otomatis tidak valid.", 422);
  }
  if (!Array.isArray(input.sources)) {
    throw new VeraContractError("context_tool_invalid", "Manifest internal sumber otomatis wajib tersedia.", 422);
  }
  const sources: AutomaticContextPackSource[] = [...input.sources];
  if (sources.some((source) => !isUuid(source.sourceId))) {
    throw new VeraContractError("context_tool_invalid", "Identitas internal sumber otomatis harus berupa UUID.", 422);
  }
  if (new Set(sources.map((source) => source.sourceId)).size !== sources.length) {
    throw new VeraContractError("context_tool_invalid", "Identitas internal sumber otomatis tidak boleh berulang.", 422);
  }
  const sourceManifestMatches = sources.length === parsedResult.sources.length && sources.every((source, index) => {
    const parsedSource = parsedResult.sources[index];
    if (!parsedSource) return false;
    return source.citationKey === parsedSource.citationKey
      && source.kind === parsedSource.kind
      && source.title === parsedSource.title
      && source.releaseMetadata.releasedAt === parsedSource.releaseMetadata.releasedAt
      && source.releaseMetadata.versionDigest === parsedSource.releaseMetadata.versionDigest
      && canonicalJson(source.evidenceSegments) === canonicalJson(parsedSource.evidenceSegments)
      && canonicalJson(source.limitations) === canonicalJson(parsedSource.limitations);
  });
  if (!sourceManifestMatches) {
    throw new VeraContractError("context_tool_invalid", "Manifest sumber tidak cocok dengan hasil tool.", 422);
  }
  const priorMessages = selectRecentCompletedHistory(input.priorMessages ?? []);
  const history = priorMessages.map((message, index) => ({
    ordinal: index + 1,
    role: message.role,
    text: message.text,
    digest: sha256Hex(`${message.role}:${normalizeText(message.text)}`),
  }));
  const normalizedSources = sources.map((source) => ({
    ...source,
    title: normalizeText(source.title),
    evidenceSegments: source.evidenceSegments.map((segment) => normalizeText(segment)),
    limitations: source.limitations.map((limitation) => normalizeText(limitation)),
  }));
  const sourceManifest = normalizedSources.map((source) => ({
    citationKey: source.citationKey,
    kind: source.kind,
    title: source.title,
    releaseMetadata: source.releaseMetadata,
    limitations: source.limitations,
  }));
  const internalSourceManifest = normalizedSources.map((source) => ({
    sourceId: source.sourceId,
    ...(source.sourceVersionId ? { sourceVersionId: source.sourceVersionId } : {}),
    citationKey: source.citationKey,
    kind: source.kind,
    title: source.title,
    releaseMetadata: source.releaseMetadata,
    evidenceSegments: source.evidenceSegments,
    limitations: source.limitations,
  }));
  const buildTask = (boundedHistory: typeof history, allocation: readonly AutomaticContextSourceAllocation[]) => ({
    contextPackVersion: VERA_CONTEXT_PACK_VERSION,
    feature: input.feature,
    policyVersion: normalizeText(input.policyVersion),
    userText: normalizeText(input.userText),
    history: boundedHistory.map(({ ordinal, role, text }) => ({ ordinal, role, text })),
    toolCallDigest: input.toolCallDigest,
    toolResultDigest: parsedResult.resultDigest,
    registryVersion: input.registryVersion,
    resolverVersion: input.resolverVersion,
    toolResult: {
      schema: parsedResult.schema,
      registryVersion: parsedResult.registryVersion,
      sources: sourceManifest.map((manifest, index) => ({
        ...manifest,
        evidenceSegments: allocation[index]?.evidenceSegments ?? [],
      })),
      limitations: parsedResult.limitations,
      truncationCount: parsedResult.truncationCount,
    },
    promptTemplateHash: input.promptTemplateHash,
    systemPolicyHash: input.systemPolicyHash,
    toolSchemaHash: input.toolSchemaHash,
    ...(input.taskAuthority ? { authority: input.taskAuthority } : {}),
  });
  const emptyAllocation = normalizedSources.map((source) => ({ citationKey: source.citationKey, evidenceSegments: [], truncated: false }));
  let boundedHistory = history;
  let baseBytes = Buffer.from(canonicalJson(buildTask(boundedHistory, emptyAllocation)), "utf8");
  while (baseBytes.byteLength > maxTaskBytes && boundedHistory.length >= 2) {
    boundedHistory = boundedHistory.slice(2);
    baseBytes = Buffer.from(canonicalJson(buildTask(boundedHistory, emptyAllocation)), "utf8");
  }
  if (baseBytes.byteLength > maxTaskBytes) {
    throw new VeraContractError("context_limit_exceeded", "Intent dan kebijakan melebihi batas input otomatis.", 422, { maxTaskBytes, mode });
  }
  const allocationResult = allocateAutomaticContextSourceBytes(
    normalizedSources,
    (allocation) => Buffer.from(canonicalJson(buildTask(boundedHistory, allocation)), "utf8"),
    maxTaskBytes,
    maxSourceBytes,
  );
  const canonicalTaskBytes = allocationResult.bytes;
  const inputCertification = certifyFinalSerializedInput(canonicalTaskBytes, mode);
  const sourceManifestDigest = sha256Hex(canonicalJson(internalSourceManifest));
  const packDigest = sha256Hex(canonicalJson({
    canonicalTask: Buffer.from(canonicalTaskBytes).toString("base64url"),
    inputCertification,
    sourceManifestDigest,
    toolCallDigest: input.toolCallDigest,
    toolResultDigest: parsedResult.resultDigest,
  }));
  const blocks: PreparedContextBlock[] = normalizedSources.map((source, index) => {
    const sourceAllocation = allocationResult.allocation[index] ?? { citationKey: source.citationKey, evidenceSegments: [], truncated: true };
    const sourceType: Exclude<VeraContextSourceType, "document"> = source.kind === "materi" ? "material" : "practice";
    const content = sourceAllocation.evidenceSegments.join("\n\n");
    return {
      ordinal: index + 1,
      sourceType,
      sourceId: source.sourceId,
      citationKey: source.citationKey,
      titleSnapshot: source.title,
      citationLabel: source.title,
      contentDigest: source.releaseMetadata.versionDigest,
      content,
      redacted: content !== source.evidenceSegments.join("\n\n"),
      truncated: sourceAllocation.truncated || allocationResult.truncatedOrdinals.includes(index + 1),
    };
  });
  const contextTaskDigest = sha256Hex(canonicalJson({
    packDigest,
    promptTemplateHash: input.promptTemplateHash,
    toolSchemaHash: input.toolSchemaHash,
    systemPolicyHash: input.systemPolicyHash,
    toolCallDigest: input.toolCallDigest,
    toolResultDigest: parsedResult.resultDigest,
    registryVersion: input.registryVersion,
    resolverVersion: input.resolverVersion,
    certifier: inputCertification,
  }));
  return {
    contextPackVersion: VERA_CONTEXT_PACK_VERSION,
    selectionDigest: sourceManifestDigest,
    blocks,
    messageManifest: boundedHistory.map(({ ordinal, digest }) => ({ ordinal, digest })),
    history: boundedHistory,
    canonicalTaskBytes,
    packDigest,
    contextTaskDigest,
    byteCount: canonicalTaskBytes.byteLength,
    truncation: { maxBlockBytes: maxSourceBytes, truncatedOrdinals: allocationResult.truncatedOrdinals },
    redactionPolicyVersion: "vera-redaction-v1",
    systemPolicyHash: input.systemPolicyHash,
    promptTemplateHash: input.promptTemplateHash,
    toolSchemaHash: input.toolSchemaHash,
    contextMode: mode,
    inputCertification,
    toolCallDigest: input.toolCallDigest,
    toolResultDigest: parsedResult.resultDigest,
    registryVersion: input.registryVersion,
    resolverVersion: input.resolverVersion,
    sourceManifestDigest,
  };
}

export const prepareV2ContextPack = prepareAutomaticContextPack;

export function encryptPreparedContextPack(
  pack: PreparedContextPack,
  envelope: EnvelopeService,
  objectId: string,
): { normalizedTaskCiphertext: AiEncryptedPayload; canonicalBytesCiphertext: AiEncryptedPayload; sourceSnapshots: Array<AiEncryptedPayload> } {
  const canonicalBytesCiphertext = envelope.encrypt(pack.canonicalTaskBytes, `${objectId}:task`);
  return {
    normalizedTaskCiphertext: canonicalBytesCiphertext,
    // Both columns are projections of the same canonical task bytes. Keep an
    // explicit alias so callers cannot accidentally substitute an unrelated
    // payload when a final-stage pack replaces the selector pack.
    canonicalBytesCiphertext,
    sourceSnapshots: pack.blocks.map((block) => envelope.encrypt(
      JSON.stringify({
        sourceType: block.sourceType,
        sourceId: block.sourceId,
        citationKey: block.citationKey,
        content: block.content,
      }),
      `${objectId}:source:${block.ordinal}`,
    )),
  };
}

export async function encryptPreparedContextPackAsync(
  pack: PreparedContextPack,
  envelope: EnvelopeService,
  objectId: string,
): Promise<{ normalizedTaskCiphertext: AiEncryptedPayload; canonicalBytesCiphertext: AiEncryptedPayload; sourceSnapshots: Array<AiEncryptedPayload> }> {
  const [normalizedTaskCiphertext, sourceSnapshots] = await Promise.all([
    envelope.encryptAsync(pack.canonicalTaskBytes, `${objectId}:task`),
    Promise.all(pack.blocks.map((block) => envelope.encryptAsync(
      JSON.stringify({
        sourceType: block.sourceType,
        sourceId: block.sourceId,
        citationKey: block.citationKey,
        content: block.content,
      }),
      `${objectId}:source:${block.ordinal}`,
    ))),
  ]);
  return { normalizedTaskCiphertext, canonicalBytesCiphertext: normalizedTaskCiphertext, sourceSnapshots };
}

export function assertPackInvariant(
  pack: PreparedContextPack,
  sourceOrdinals: number[] = pack.blocks.map((block) => block.ordinal),
): void {
  const ordinals = pack.blocks.map((block) => block.ordinal);
  if (new Set(ordinals).size !== ordinals.length) throw new Error("Context pack ordinals must be unique.");
  const sourceOrdinalsSet = new Set(sourceOrdinals);
  if (sourceOrdinalsSet.size !== sourceOrdinals.length) throw new Error("Request sources must be unique.");
  if (ordinals.some((ordinal) => !sourceOrdinalsSet.has(ordinal))) {
    throw new Error("Every context manifest block must have a request-source row.");
  }
  if (pack.canonicalTaskBytes.byteLength !== pack.byteCount) throw new Error("Context pack byte count mismatch.");
  if (pack.inputCertification.measuredBytes !== pack.byteCount
    || pack.inputCertification.certifierId !== VERA_INPUT_CERTIFIER_ID
    || ![VERA_INPUT_SERIALIZER_ID, VERA_LEGACY_INPUT_SERIALIZER_ID].includes(pack.inputCertification.serializerId)
    || pack.inputCertification.certifiedTokenUpperBound
      !== pack.byteCount + VERA_FIXED_FRAMING_TOKEN_BOUND) {
    throw new Error("Context pack input certification mismatch.");
  }
}

export function assertReconstructable(state: "reconstructable" | "unavailable", snapshots: Array<"available" | "purging" | "purged">): void {
  if (state !== "reconstructable" || snapshots.some((snapshot) => snapshot !== "available")) {
    throw new VeraContractError("context_release_unavailable", "Konteks historis tidak lagi tersedia.", 410);
  }
}

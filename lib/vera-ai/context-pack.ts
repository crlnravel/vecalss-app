import "server-only";

import { EnvelopeService, type AiEncryptedPayload } from "./envelope";
import {
  VERA_CONTEXT_MODE_BUDGETS,
  VERA_CONTEXT_PACK_VERSION,
  VERA_FIXED_FRAMING_TOKEN_BOUND,
  VERA_INPUT_CERTIFIER_ID,
  VERA_INPUT_SERIALIZER_ID,
  VERA_MAX_HISTORY_BYTES,
  VERA_MAX_HISTORY_MESSAGE_BYTES,
  VERA_MAX_HISTORY_MESSAGES,
  VERA_MAX_HISTORY_PAIRS,
  VERA_MAX_CONTEXT_BLOCK_BYTES,
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
};

export type VeraPriorMessage = {
  role: "user" | "assistant";
  text: string;
  /** A monotonic request/message sequence when the caller has one. */
  sequence?: number;
};

export type VeraInputCertification = {
  certifierId: typeof VERA_INPUT_CERTIFIER_ID;
  serializerId: typeof VERA_INPUT_SERIALIZER_ID;
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
    serializerId: VERA_INPUT_SERIALIZER_ID,
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
    contextPackVersion: VERA_CONTEXT_PACK_VERSION,
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
  const inputCertification = certifyFinalSerializedInput(canonicalTaskBytes, mode);
  const packDigest = sha256Hex(canonicalTaskBytes);
  const contextTaskDigest = sha256Hex(`${packDigest}:${input.promptTemplateHash}:${input.toolSchemaHash}:${inputCertification.certifierId}:${inputCertification.serializerId}`);

  return {
    contextPackVersion: VERA_CONTEXT_PACK_VERSION,
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

export function encryptPreparedContextPack(
  pack: PreparedContextPack,
  envelope: EnvelopeService,
  objectId: string,
): { normalizedTaskCiphertext: AiEncryptedPayload; sourceSnapshots: Array<AiEncryptedPayload> } {
  return {
    normalizedTaskCiphertext: envelope.encrypt(pack.canonicalTaskBytes, `${objectId}:task`),
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
): Promise<{ normalizedTaskCiphertext: AiEncryptedPayload; sourceSnapshots: Array<AiEncryptedPayload> }> {
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
  return { normalizedTaskCiphertext, sourceSnapshots };
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
    || pack.inputCertification.serializerId !== VERA_INPUT_SERIALIZER_ID
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

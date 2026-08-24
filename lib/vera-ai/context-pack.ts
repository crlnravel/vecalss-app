import "server-only";

import { EnvelopeService, type AiEncryptedPayload } from "./envelope";
import {
  VERA_CONTEXT_PACK_VERSION,
  VERA_MAX_CONTEXT_SOURCES,
  VeraContractError,
  normalizeSelection,
  normalizeText,
  selectionDigest,
  sha256Hex,
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
  resolve(selection: VeraContextSelection): Promise<ResolvedContextBlock>;
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
  canonicalTaskBytes: Uint8Array;
  packDigest: string;
  contextTaskDigest: string;
  byteCount: number;
  truncation: { maxBlockBytes: number; truncatedOrdinals: number[] };
  redactionPolicyVersion: string;
  systemPolicyHash: string;
  promptTemplateHash: string;
  toolSchemaHash: string;
};

export type ContextPackInput = {
  selection: VeraContextSelection[];
  userText: string;
  priorMessages?: Array<{ role: "user" | "assistant"; text: string }>;
  policyVersion: string;
  promptTemplateHash: string;
  toolSchemaHash: string;
  systemPolicyHash: string;
  maxBlockBytes?: number;
  maxTaskBytes?: number;
};

const DEFAULT_BLOCK_BYTES = 8_000;
const DEFAULT_TASK_BYTES = 40_000;

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
  const selection = normalizeSelection(input.selection);
  if (selection.length > VERA_MAX_CONTEXT_SOURCES) {
    throw new VeraContractError("context_release_unavailable", "Sumber konteks terlalu banyak.", 422);
  }

  const serverOrder = [...selection].sort((left, right) =>
    `${left.sourceType}:${left.sourceId}`.localeCompare(`${right.sourceType}:${right.sourceId}`));
  const resolved = await Promise.all(serverOrder.map((source) => resolver.resolve(source)));
  const maxBlockBytes = input.maxBlockBytes ?? DEFAULT_BLOCK_BYTES;
  const maxTaskBytes = input.maxTaskBytes ?? DEFAULT_TASK_BYTES;
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

  const messageManifest = (input.priorMessages ?? []).map((message, index) => ({
    ordinal: index + 1,
    digest: sha256Hex(`${message.role}:${normalizeText(message.text)}`),
  }));
  const task = {
    contextPackVersion: VERA_CONTEXT_PACK_VERSION,
    policyVersion: input.policyVersion,
    userText: normalizeText(input.userText),
    messageManifest,
    blocks: blocks.map(({ content, ...manifest }) => ({ ...manifest, content })),
  };
  const initialBytes = Buffer.from(canonicalJson(task), "utf8");
  if (initialBytes.byteLength > maxTaskBytes) {
    throw new VeraContractError(
      "context_release_unavailable",
      "Konteks melebihi batas byte yang diizinkan.",
      422,
      { reason: "task_byte_cap", maxTaskBytes },
    );
  }
  const canonicalTaskBytes = initialBytes;
  const packDigest = sha256Hex(canonicalTaskBytes);
  const contextTaskDigest = sha256Hex(`${packDigest}:${input.promptTemplateHash}:${input.toolSchemaHash}`);

  return {
    contextPackVersion: VERA_CONTEXT_PACK_VERSION,
    selectionDigest: selectionDigest(selection),
    blocks,
    messageManifest,
    canonicalTaskBytes,
    packDigest,
    contextTaskDigest,
    byteCount: canonicalTaskBytes.byteLength,
    truncation: { maxBlockBytes, truncatedOrdinals },
    redactionPolicyVersion: "vera-redaction-v1",
    systemPolicyHash: input.systemPolicyHash,
    promptTemplateHash: input.promptTemplateHash,
    toolSchemaHash: input.toolSchemaHash,
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
  const normalizedTaskCiphertext = await envelope.encryptAsync(pack.canonicalTaskBytes, `${objectId}:task`);
  const sourceSnapshots = await Promise.all(pack.blocks.map((block) => envelope.encryptAsync(
    JSON.stringify({
      sourceType: block.sourceType,
      sourceId: block.sourceId,
      citationKey: block.citationKey,
      content: block.content,
    }),
    `${objectId}:source:${block.ordinal}`,
  )));
  return { normalizedTaskCiphertext, sourceSnapshots };
}

export function assertPackInvariant(
  pack: PreparedContextPack,
  sourceOrdinals: number[] = pack.blocks.map((block) => block.ordinal),
): void {
  const ordinals = pack.blocks.map((block) => block.ordinal);
  if (new Set(ordinals).size !== ordinals.length) throw new Error("Context pack ordinals must be unique.");
  if (new Set(sourceOrdinals).size !== sourceOrdinals.length) throw new Error("Request sources must be unique.");
  if (ordinals.some((ordinal) => !sourceOrdinals.includes(ordinal))) {
    throw new Error("Every context manifest block must have a request-source row.");
  }
  if (pack.canonicalTaskBytes.byteLength !== pack.byteCount) throw new Error("Context pack byte count mismatch.");
}

export function assertReconstructable(state: "reconstructable" | "unavailable", snapshots: Array<"available" | "purging" | "purged">): void {
  if (state !== "reconstructable" || snapshots.some((snapshot) => snapshot !== "available")) {
    throw new VeraContractError("context_release_unavailable", "Konteks historis tidak lagi tersedia.", 410);
  }
}

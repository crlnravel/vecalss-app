import { canonicalJson, sha256Hex } from "./contracts";
import { EnvelopeService, type AiEncryptedPayload } from "./envelope";
import {
  canonicalContextToolArguments,
  contextToolArgumentsDigest,
  parseContextToolResult,
  serializeContextToolResult,
  type ContextToolResult,
} from "./context-tool-contracts";

export type EncryptedContextToolInvocation = {
  canonicalArgumentsCiphertext: AiEncryptedPayload;
  resultManifestCiphertext: AiEncryptedPayload | null;
  argumentsDigest: string;
  resultDigest: string | null;
  resultManifestDigest: string | null;
};

export type ContextToolInvocationPurgeState = "available" | "purging" | "purged";

export function canonicalContextToolResultManifest(result: ContextToolResult): string {
  return Buffer.from(serializeContextToolResult(parseContextToolResult(result))).toString("utf8");
}

export function contextToolResultManifestDigest(result: ContextToolResult): string {
  return sha256Hex(canonicalContextToolResultManifest(result));
}

export function encryptContextToolInvocation(
  input: { toolArguments: unknown; result?: ContextToolResult | null; envelope: EnvelopeService; objectId: string },
): EncryptedContextToolInvocation {
  const canonicalArguments = canonicalContextToolArguments(input.toolArguments);
  const argumentsDigest = contextToolArgumentsDigest(input.toolArguments);
  const result = input.result ? parseContextToolResult(input.result) : null;
  const resultManifest = result ? canonicalContextToolResultManifest(result) : null;
  return {
    canonicalArgumentsCiphertext: input.envelope.encrypt(canonicalArguments, `${input.objectId}:arguments`),
    resultManifestCiphertext: resultManifest === null ? null : input.envelope.encrypt(resultManifest, `${input.objectId}:result`),
    argumentsDigest,
    resultDigest: result?.resultDigest ?? null,
    resultManifestDigest: resultManifest === null ? null : sha256Hex(resultManifest),
  };
}

export async function encryptContextToolInvocationAsync(
  input: { toolArguments: unknown; result?: ContextToolResult | null; envelope: EnvelopeService; objectId: string },
): Promise<EncryptedContextToolInvocation> {
  const canonicalArguments = canonicalContextToolArguments(input.toolArguments);
  const argumentsDigest = contextToolArgumentsDigest(input.toolArguments);
  const result = input.result ? parseContextToolResult(input.result) : null;
  const resultManifest = result ? canonicalContextToolResultManifest(result) : null;
  const [canonicalArgumentsCiphertext, resultManifestCiphertext] = await Promise.all([
    input.envelope.encryptAsync(canonicalArguments, `${input.objectId}:arguments`),
    resultManifest === null ? Promise.resolve(null) : input.envelope.encryptAsync(resultManifest, `${input.objectId}:result`),
  ]);
  return {
    canonicalArgumentsCiphertext,
    resultManifestCiphertext,
    argumentsDigest,
    resultDigest: result?.resultDigest ?? null,
    resultManifestDigest: resultManifest === null ? null : sha256Hex(resultManifest),
  };
}

export function verifyContextToolInvocationDigests(input: {
  toolArguments: unknown;
  result?: ContextToolResult | null;
  argumentsDigest: string;
  resultDigest?: string | null;
  resultManifestDigest?: string | null;
}): void {
  if (contextToolArgumentsDigest(input.toolArguments) !== input.argumentsDigest) throw new Error("Context tool arguments digest mismatch.");
  const result = input.result ? parseContextToolResult(input.result) : null;
  if ((result?.resultDigest ?? null) !== (input.resultDigest ?? null)) throw new Error("Context tool result digest mismatch.");
  if (result) {
    if (!input.resultManifestDigest || contextToolResultManifestDigest(result) !== input.resultManifestDigest) {
      throw new Error("Context tool manifest digest mismatch.");
    }
  } else if (input.resultManifestDigest) {
    throw new Error("Context tool manifest digest is present without a result.");
  }
}

export function contextToolInvocationDigest(input: {
  toolName: string;
  toolSchemaVersion: string;
  registryVersion: string;
  resolverVersion: string;
  argumentsDigest: string;
  resultDigest?: string | null;
}): string {
  return sha256Hex(canonicalJson({
    toolName: input.toolName,
    toolSchemaVersion: input.toolSchemaVersion,
    registryVersion: input.registryVersion,
    resolverVersion: input.resolverVersion,
    argumentsDigest: input.argumentsDigest,
    resultDigest: input.resultDigest ?? null,
  }));
}

import "server-only";

import { isUuid } from "@/lib/admin/operations/validation";

export { isUuid } from "@/lib/admin/operations/validation";

export const VERA_HTTP_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export async function readJsonBody(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const advertised = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(advertised) && advertised > maxBytes) throw new VeraHttpError("request_too_large", 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new VeraHttpError("request_too_large", 413);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new VeraHttpError("invalid_request", 400);
  }
}

export class VeraHttpError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "VeraHttpError";
  }
}

export function isSafeClientRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function isSafeText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 40_000 && Buffer.byteLength(value, "utf8") <= 40_000;
}

export function parseVeraRequestBody(value: unknown): {
  clientRequestId: string;
  kind: "chat";
  text: string;
  sourceIds: string[];
  options: Record<string, unknown>;
  toolId: string | null;
  retryOfRequestId: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VeraHttpError("invalid_request", 400);
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const allowed = new Set(["clientRequestId", "kind", "text", "sourceIds", "options", "toolId", "retryOfRequestId"]);
  if (keys.some((key) => !allowed.has(key))) throw new VeraHttpError("invalid_request", 400);
  if (!isSafeClientRequestId(candidate.clientRequestId) || !isSafeText(candidate.text)) throw new VeraHttpError("invalid_request", 400);
  if (candidate.kind !== undefined && candidate.kind !== "chat") throw new VeraHttpError("invalid_request", 400);
  const sourceIds = candidate.sourceIds === undefined
    ? []
    : Array.isArray(candidate.sourceIds)
      && candidate.sourceIds.length <= 6
      && candidate.sourceIds.every((sourceId) => typeof sourceId === "string" && isUuid(sourceId))
      ? [...new Set(candidate.sourceIds)] as string[]
      : null;
  if (!sourceIds) throw new VeraHttpError("invalid_request", 400);
  const options = candidate.options === undefined
    ? {}
    : typeof candidate.options === "object" && candidate.options !== null && !Array.isArray(candidate.options)
      ? candidate.options as Record<string, unknown>
      : null;
  if (!options || Object.keys(options).length > 12) throw new VeraHttpError("invalid_request", 400);
  const toolId = candidate.toolId === undefined || candidate.toolId === null
    ? null
    : typeof candidate.toolId === "string" && candidate.toolId.length <= 80 ? candidate.toolId : null;
  if (candidate.toolId !== undefined && toolId === null) throw new VeraHttpError("invalid_request", 400);
  const retryOfRequestId = candidate.retryOfRequestId === undefined || candidate.retryOfRequestId === null
    ? null
    : typeof candidate.retryOfRequestId === "string" && isUuid(candidate.retryOfRequestId) ? candidate.retryOfRequestId : null;
  if (candidate.retryOfRequestId !== undefined && retryOfRequestId === null) throw new VeraHttpError("invalid_request", 400);
  return { clientRequestId: candidate.clientRequestId, kind: "chat", text: candidate.text, sourceIds, options, toolId, retryOfRequestId };
}

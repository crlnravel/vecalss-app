import "server-only";

import type { SessionContext } from "@/lib/auth/types";

import { AiPolicyError, assertClientRequestId } from "./contracts";
import type { AiPolicyActor } from "./service";

export const AI_POLICY_HTTP_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

const MAX_BODY_BYTES = 128 * 1024;

export function actorFromSession(session: SessionContext): AiPolicyActor {
  return { id: session.user.id, roles: session.user.roles };
}

export async function readPolicyBody(request: Request): Promise<Record<string, unknown>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new AiPolicyError("request_too_large", "Permintaan kebijakan terlalu besar.", 413);
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) {
    throw new AiPolicyError("request_too_large", "Permintaan kebijakan terlalu besar.", 413);
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AiPolicyError("invalid_request", "Bentuk permintaan kebijakan tidak valid.", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiPolicyError("invalid_request", "Bentuk permintaan kebijakan tidak valid.", 400);
  }
  return value as Record<string, unknown>;
}

export function exactKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[] = allowed): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unknown.length || missing.length) {
    throw new AiPolicyError("invalid_request", "Field permintaan kebijakan tidak lengkap atau tidak dikenal.", 400, { unknown, missing });
  }
}

export function requiredString(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new AiPolicyError("invalid_request", `${field} tidak valid.`, 400);
  }
  return value;
}

export function invalidRequest(message: string, details?: Record<string, unknown>): never {
  throw new AiPolicyError("invalid_request", message, 400, details);
}

export function optionalString(value: unknown, field: string, maxLength = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredString(value, field, maxLength);
}

export function requestId(value: unknown): string {
  assertClientRequestId(value);
  return value;
}

export function requiredRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 2_147_483_647) {
    throw new AiPolicyError("invalid_revision", "Revisi kebijakan tidak valid.", 400);
  }
  return value as number;
}

export function responseForPolicyError(error: unknown): Response {
  if (error instanceof AiPolicyError) {
    return Response.json({ error: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }, {
      headers: AI_POLICY_HTTP_HEADERS,
      status: error.status,
    });
  }
  return Response.json({ error: "policy_unavailable", message: "Konsol kebijakan tidak tersedia." }, {
    headers: AI_POLICY_HTTP_HEADERS,
    status: 503,
  });
}

export function responseForPolicyResult(result: unknown, status = 200): Response {
  return Response.json(result, { headers: AI_POLICY_HTTP_HEADERS, status });
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

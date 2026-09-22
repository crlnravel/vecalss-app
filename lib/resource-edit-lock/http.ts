import "server-only";

import { RoleName } from "@/generated/prisma/client";
import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";

import {
  InvalidResourceKeyError,
  isLeaseInstanceToken,
  isPositiveGeneration,
} from "./canonical";
import {
  EditLeaseServiceError,
  acquireEditLease,
  releaseEditLease,
  renewEditLease,
  rotateEditLease,
} from "./service";
import type { EditLeaseResourceType, EditLeaseServerStatus } from "./types";
import { EDIT_LEASE_RESOURCE_TYPES } from "./types";

const MAX_EDIT_LEASE_BODY_BYTES = 4 * 1024;

const EDIT_LEASE_HTTP_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;

type EditLeaseHttpErrorCode =
  | "forbidden_origin"
  | "invalid_proof"
  | "json_media_type_required"
  | "proof_too_large";

class EditLeaseHttpError extends Error {
  readonly status: 403 | 413 | 415 | 422;

  constructor(
    readonly code: EditLeaseHttpErrorCode,
    status: 403 | 413 | 415 | 422,
  ) {
    super(code);
    this.name = "EditLeaseHttpError";
    this.status = status;
  }
}

function editLeaseError(code: EditLeaseHttpErrorCode): EditLeaseHttpError {
  const status = code === "forbidden_origin"
    ? 403
    : code === "proof_too_large"
      ? 413
      : code === "json_media_type_required"
        ? 415
        : 422;
  return new EditLeaseHttpError(code, status);
}

function isTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return origin === getTrustedAppBaseUrl();
  } catch {
    return false;
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
  if (contentType !== "application/json; charset=utf-8") {
    throw editLeaseError("json_media_type_required");
  }

  const advertisedLength = request.headers.get("content-length");
  if (advertisedLength !== null) {
    const normalizedLength = advertisedLength.trim();
    const parsedLength = Number(normalizedLength);
    if (!/^\d+$/u.test(normalizedLength) || !Number.isSafeInteger(parsedLength)) {
      throw editLeaseError("invalid_proof");
    }
    if (parsedLength > MAX_EDIT_LEASE_BODY_BYTES) {
      throw editLeaseError("proof_too_large");
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw editLeaseError("invalid_proof");

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_EDIT_LEASE_BODY_BYTES) {
        await reader.cancel();
        throw editLeaseError("proof_too_large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw editLeaseError("invalid_proof");
  }
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw editLeaseError("invalid_proof");
  }
  const object = value as Record<string, unknown>;
  const actualKeys = Object.keys(object).sort();
  const expectedKeys = [...keys].sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw editLeaseError("invalid_proof");
  }
  return object;
}

function parseResourceFields(value: Record<string, unknown>) {
  const resourceType = value.resourceType;
  const resourceId = value.resourceId;
  if (typeof resourceType !== "string"
    || !(EDIT_LEASE_RESOURCE_TYPES as readonly string[]).includes(resourceType)
    || typeof resourceId !== "string") {
    throw editLeaseError("invalid_proof");
  }
  return { resourceId, resourceType: resourceType as EditLeaseResourceType };
}

function parseToken(value: unknown) {
  if (!isLeaseInstanceToken(value)) throw editLeaseError("invalid_proof");
  return value;
}

function parseGeneration(value: unknown) {
  if (!isPositiveGeneration(value)) throw editLeaseError("invalid_proof");
  return value;
}

function parseAcquireBody(value: unknown) {
  const object = exactObject(value, ["newToken", "resourceId", "resourceType"]);
  return {
    ...parseResourceFields(object),
    newToken: parseToken(object.newToken),
  };
}

function parseRotateBody(value: unknown) {
  const object = exactObject(value, [
    "newToken",
    "previousGeneration",
    "previousToken",
    "resourceId",
    "resourceType",
  ]);
  return {
    ...parseResourceFields(object),
    newToken: parseToken(object.newToken),
    previousGeneration: parseGeneration(object.previousGeneration),
    previousToken: parseToken(object.previousToken),
  };
}

function parseProofBody(value: unknown) {
  const object = exactObject(value, ["generation", "resourceId", "resourceType", "token"]);
  return {
    ...parseResourceFields(object),
    generation: parseGeneration(object.generation),
    token: parseToken(object.token),
  };
}

function unauthorizedResponse() {
  return Response.json(
    { error: "unauthenticated" },
    { headers: EDIT_LEASE_HTTP_HEADERS, status: 401 },
  );
}

function errorResponse(error: unknown) {
  if (error instanceof EditLeaseHttpError) {
    return Response.json(
      { error: error.code },
      { headers: EDIT_LEASE_HTTP_HEADERS, status: error.status },
    );
  }
  if (error instanceof InvalidResourceKeyError) {
    return Response.json(
      { error: "invalid_proof" },
      { headers: EDIT_LEASE_HTTP_HEADERS, status: 422 },
    );
  }
  if (error instanceof EditLeaseServiceError) {
    return Response.json(
      { error: error.code },
      { headers: EDIT_LEASE_HTTP_HEADERS, status: error.status },
    );
  }
  if (error && typeof error === "object" && "code" in error
    && (error as { code?: unknown }).code === "resource_busy_retry") {
    return Response.json(
      { error: "resource_busy_retry" },
      { headers: EDIT_LEASE_HTTP_HEADERS, status: 409 },
    );
  }
  return Response.json(
    { error: "resource_busy_retry" },
    { headers: EDIT_LEASE_HTTP_HEADERS, status: 409 },
  );
}

async function authenticateTutor(request: Request) {
  if (!isTrustedOrigin(request)) {
    throw editLeaseError("forbidden_origin");
  }
  const session = await getReadOnlySessionContext();
  if (!session) return null;
  if (!hasRole(session, RoleName.tutor)) {
    throw new EditLeaseServiceError("resource_inaccessible", 403);
  }
  return session;
}

type LeaseCommandResult = EditLeaseServerStatus | { ok: true };

async function handleEditLeaseCommand(
  request: Request,
  command: "acquire" | "release" | "renew" | "rotate",
): Promise<Response> {
  try {
    const session = await authenticateTutor(request);
    if (!session) return unauthorizedResponse();

    const body = await readBoundedJson(request);
    let result: LeaseCommandResult;
    if (command === "acquire") {
      const parsed = parseAcquireBody(body);
      result = await acquireEditLease({ ...parsed, holderUserId: session.user.id });
    } else if (command === "rotate") {
      const parsed = parseRotateBody(body);
      result = await rotateEditLease({ ...parsed, holderUserId: session.user.id });
    } else if (command === "renew") {
      const parsed = parseProofBody(body);
      result = await renewEditLease({ ...parsed, holderUserId: session.user.id });
    } else {
      const parsed = parseProofBody(body);
      await releaseEditLease({ ...parsed, holderUserId: session.user.id });
      result = { ok: true };
    }

    if (command === "acquire" && "state" in result && result.state === "locked") {
      return Response.json(
        { error: "resource_locked", ...result },
        { headers: EDIT_LEASE_HTTP_HEADERS, status: 409 },
      );
    }
    return Response.json(result, { headers: EDIT_LEASE_HTTP_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export {
  EDIT_LEASE_HTTP_HEADERS,
  EditLeaseHttpError,
  MAX_EDIT_LEASE_BODY_BYTES,
  errorResponse,
  handleEditLeaseCommand,
  isTrustedOrigin,
  parseAcquireBody,
  parseProofBody,
  parseRotateBody,
  readBoundedJson,
};
export type { LeaseCommandResult };

import "server-only";

export type ServerLogLevel = "debug" | "info" | "warn" | "error" | "off";

export type ServerLogContext = {
  area?: string;
  code?: string;
  durationMs?: number;
  operation?: string;
  recordCount?: number;
  status?: number;
};

const LEVEL_ORDER: Record<Exclude<ServerLogLevel, "off">, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const ALLOWED_CONTEXT_KEYS = new Set<keyof ServerLogContext>([
  "area",
  "code",
  "durationMs",
  "operation",
  "recordCount",
  "status",
]);

const MAX_LOG_TEXT_LENGTH = 2_000;
const SENSITIVE_ASSIGNMENT_KEYS = [
  "password",
  "passphrase",
  "secret",
  "token",
  "api[_-]?key",
  "private[_-]?key",
  "key[_-]?ring",
  "cookie",
  "authorization",
  "database[_-]?url",
  "connection[_-]?string",
  "name",
  "email",
  "phone",
  "mobile",
  "address",
  "birthdate",
  "date[_-]?of[_-]?birth",
  "(?:student|user|account|record)[_-]?id",
  "payload",
  "body",
  "form[_-]?data",
  "request[_-]?body",
].join("|");
const SENSITIVE_ASSIGNMENT = new RegExp(
  String.raw`(["']?[\w-]*(?:${SENSITIVE_ASSIGNMENT_KEYS})[\w-]*["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[\s\S]+)`,
  "giu",
);
const DATABASE_URL = /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/giu;
const HTTP_URL = /\bhttps?:\/\/[^\s"'<>]+/giu;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const PHONE_NUMBER = /(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)/gu;
const UUID = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/giu;
const BEARER_TOKEN = /\bBearer\s+[^\s,;]+/giu;

/**
 * APP_LOG_LEVEL controls server log verbosity: debug, info, warn, error, off.
 * Defaults to debug outside production and error in production.
 */
function getServerLogLevel(): ServerLogLevel {
  const configured = process.env.APP_LOG_LEVEL?.trim().toLowerCase();
  if (
    configured === "debug"
    || configured === "info"
    || configured === "warn"
    || configured === "error"
    || configured === "off"
  ) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "error" : "debug";
}

function sanitizeText(value: string) {
  return value
    .replace(BEARER_TOKEN, "Bearer <REDACTED>")
    .replace(SENSITIVE_ASSIGNMENT, "$1<REDACTED>")
    .replace(DATABASE_URL, "$1://<REDACTED>")
    .replace(HTTP_URL, (url) => {
      return url.includes("?") ? "<REDACTED_URL>?<REDACTED_QUERY>" : "<REDACTED_URL>";
    })
    .replace(EMAIL_ADDRESS, "<REDACTED_EMAIL>")
    .replace(UUID, "<REDACTED_ID>")
    .replace(PHONE_NUMBER, "<REDACTED_PHONE>")
    .replace(/[\r\n\t]+/gu, " ")
    .slice(0, MAX_LOG_TEXT_LENGTH);
}

function safeContext(context?: ServerLogContext) {
  if (!context) return {};

  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key as keyof ServerLogContext)) continue;

    if (typeof value === "string") {
      result[key] = sanitizeText(value);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    }
  }
  return result;
}

function addStructuredErrorDetails(summary: Record<string, unknown>, value: object) {
  const details = value as {
    code?: unknown;
    constraint?: unknown;
    kind?: unknown;
    originalCode?: unknown;
  };
  const code = typeof details.originalCode === "string"
    ? details.originalCode
    : details.code;
  if (typeof code === "string") summary.code = sanitizeText(code);
  if (typeof details.kind === "string") summary.kind = sanitizeText(details.kind);

  if (typeof details.constraint === "string") {
    summary.constraint = sanitizeText(details.constraint);
  } else if (details.constraint && typeof details.constraint === "object") {
    const constraint = details.constraint as { fields?: unknown; index?: unknown };
    if (typeof constraint.index === "string") summary.constraintIndex = sanitizeText(constraint.index);
    if (Array.isArray(constraint.fields)) {
      const fields = constraint.fields
        .filter((field): field is string => typeof field === "string")
        .slice(0, 32)
        .map(sanitizeText);
      if (fields.length > 0) summary.constraintFields = fields;
    }
  }
}

function summarizeCause(
  cause: unknown,
  includeStack: boolean,
  seen: WeakSet<object>,
  depth: number,
): Record<string, unknown> {
  if (cause instanceof Error) return summarizeErrorUnsafe(cause, includeStack, seen, depth);
  if (typeof cause === "string") {
    return { name: "NonErrorCause", message: sanitizeText(cause) };
  }

  const summary: Record<string, unknown> = {
    name: "NonErrorCause",
    type: cause === null ? "null" : typeof cause,
  };
  if (cause && typeof cause === "object") {
    if (seen.has(cause)) return { ...summary, message: "[cyclic cause]" };
    seen.add(cause);
    addStructuredErrorDetails(summary, cause);

    const wrapped = cause as { cause?: unknown; meta?: unknown };
    const metadataCause = wrapped.meta && typeof wrapped.meta === "object"
      ? (wrapped.meta as { cause?: unknown }).cause
      : undefined;
    const nestedCause = wrapped.cause ?? metadataCause;
    if (nestedCause !== undefined && depth < 4) {
      summary.cause = summarizeCause(nestedCause, includeStack, seen, depth + 1);
    }
  }
  return summary;
}

function summarizeErrorUnsafe(
  error: unknown,
  includeStack: boolean,
  seen = new WeakSet<object>(),
  depth = 0,
): Record<string, unknown> {
  if (!(error instanceof Error)) {
    const summary: Record<string, unknown> = {
      name: "NonErrorThrown",
      type: error === null ? "null" : typeof error,
    };
    if (error && typeof error === "object") addStructuredErrorDetails(summary, error);
    return summary;
  }

  if (seen.has(error)) {
    return { name: sanitizeText(error.name || "Error"), message: "[cyclic cause]" };
  }
  seen.add(error);

  const summary: Record<string, unknown> = {
    name: sanitizeText(error.name || "Error"),
    message: sanitizeText(error.message),
  };
  addStructuredErrorDetails(summary, error);

  const directCause = (error as Error & { cause?: unknown }).cause;
  const meta = (error as Error & { meta?: unknown }).meta;
  const metadataCause = meta && typeof meta === "object"
    ? (meta as { cause?: unknown }).cause
    : undefined;
  const cause = directCause ?? metadataCause;
  if (cause !== undefined && depth < 4) {
    summary.cause = summarizeCause(cause, includeStack, seen, depth + 1);
  }

  if (includeStack && error.stack) {
    summary.stack = sanitizeText(error.stack);
  }

  return summary;
}

function summarizeError(
  error: unknown,
  includeStack: boolean,
): Record<string, unknown> {
  try {
    return summarizeErrorUnsafe(error, includeStack);
  } catch {
    return { name: "ErrorSummaryUnavailable" };
  }
}

function writeLog(
  level: Exclude<ServerLogLevel, "off">,
  event: string,
  context?: ServerLogContext,
  error?: unknown,
) {
  const threshold = getServerLogLevel();
  if (threshold === "off" || LEVEL_ORDER[level] < LEVEL_ORDER[threshold]) return;

  const record = {
    timestamp: new Date().toISOString(),
    level,
    event: sanitizeText(event),
    ...safeContext(context),
    ...(level === "error" ? { error: summarizeError(error, threshold === "debug") } : {}),
  };
  const line = JSON.stringify(record);

  if (level === "debug") console.debug(line);
  else if (level === "info") console.info(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
}

const serverLogger = {
  debug(event: string, context?: ServerLogContext) {
    writeLog("debug", event, context);
  },
  info(event: string, context?: ServerLogContext) {
    writeLog("info", event, context);
  },
  warn(event: string, context?: ServerLogContext) {
    writeLog("warn", event, context);
  },
  error(event: string, error: unknown, context?: ServerLogContext) {
    writeLog("error", event, context, error);
  },
};

export { getServerLogLevel, serverLogger };

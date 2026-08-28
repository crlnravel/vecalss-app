import "server-only";

const POC_MODEL = "openrouter/free" as const;
const POC_ENDPOINT_PATH = "/api/v1/chat/completions";

export const VERA_OPENROUTER_FREE_POC_MODEL = POC_MODEL;
export const VERA_OPENROUTER_FREE_POC_MAX_INPUT_CHARS = 2_000;
export const VERA_OPENROUTER_FREE_POC_MAX_OUTPUT_CHARS = 8_000;
export const VERA_OPENROUTER_FREE_POC_MAX_OUTPUT_TOKENS = 1_024;
export const VERA_OPENROUTER_FREE_POC_MAX_RESPONSE_BYTES = 1_048_576;
export const VERA_OPENROUTER_FREE_POC_TIMEOUT_MS = 10_000;

export type VeraOpenRouterFreePocGateReason =
  | "development_or_test_environment_required"
  | "debug_required"
  | "poc_opt_in_required"
  | "zdr_must_be_false"
  | "api_key_required"
  | "base_url_required"
  | "base_url_invalid";

export type VeraOpenRouterFreePocGate = {
  enabled: boolean;
  reason?: VeraOpenRouterFreePocGateReason;
};

export type VeraOpenRouterFreePocConfig = {
  nodeEnv: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type VeraOpenRouterFreePocOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type VeraOpenRouterFreePocTask = {
  prompt: string;
  maxOutputTokens?: number;
};

export type VeraOpenRouterFreePocRequestBody = {
  model: typeof POC_MODEL;
  messages: [{ role: "user"; content: string }];
  provider: {
    allow_fallbacks: false;
    data_collection: "allow";
  };
  max_tokens: number;
  stream: false;
};

export type VeraOpenRouterFreePocUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type VeraOpenRouterFreePocResult = {
  kind: "openrouter_free_poc";
  model: string;
  selectedModel: string;
  provider: string;
  providerIdentity: string;
  finishReason: string | null;
  text: string;
  usage: VeraOpenRouterFreePocUsage;
};

export type VeraOpenRouterFreePocErrorCode =
  | "poc_disabled"
  | "invalid_input"
  | "timeout"
  | "network_error"
  | "response_too_large"
  | "http_error"
  | "invalid_response";

export class VeraOpenRouterFreePocError extends Error {
  readonly code: VeraOpenRouterFreePocErrorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(input: {
    code: VeraOpenRouterFreePocErrorCode;
    message: string;
    status?: number;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "VeraOpenRouterFreePocError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable ?? false;
  }
}

function isTrue(value: string | undefined): boolean {
  return value === "true";
}

function normalizeBaseUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.search || parsed.hash || parsed.username || parsed.password) return null;
    if (parsed.pathname !== "" && parsed.pathname !== "/") return null;
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

export function evaluateVeraOpenRouterFreePocGate(
  env: NodeJS.ProcessEnv = process.env,
): VeraOpenRouterFreePocGate {
  const nodeEnv = env.NODE_ENV?.toLowerCase();
  if (nodeEnv !== "development" && nodeEnv !== "test") return { enabled: false, reason: "development_or_test_environment_required" };
  if (!isTrue(env.DEBUG)) return { enabled: false, reason: "debug_required" };
  if (!isTrue(env.VERA_POC_OPENROUTER)) return { enabled: false, reason: "poc_opt_in_required" };
  if (env.VERA_POC_ZDR !== "false") return { enabled: false, reason: "zdr_must_be_false" };
  if (!env.OPENROUTER_API_KEY?.trim()) return { enabled: false, reason: "api_key_required" };
  if (!env.OPENROUTER_BASE_URL?.trim()) return { enabled: false, reason: "base_url_required" };
  if (!normalizeBaseUrl(env.OPENROUTER_BASE_URL)) return { enabled: false, reason: "base_url_invalid" };
  return { enabled: true };
}

export const getVeraOpenRouterFreePocGate = evaluateVeraOpenRouterFreePocGate;

function readPositiveBound(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) return fallback;
  return value;
}

function configFromEnvironment(
  env: NodeJS.ProcessEnv,
  options: VeraOpenRouterFreePocOptions,
): VeraOpenRouterFreePocConfig | null {
  const baseUrl = env.OPENROUTER_BASE_URL ? normalizeBaseUrl(env.OPENROUTER_BASE_URL) : null;
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    apiKey,
    baseUrl,
    timeoutMs: readPositiveBound(options.timeoutMs, VERA_OPENROUTER_FREE_POC_TIMEOUT_MS, 30_000),
    maxResponseBytes: readPositiveBound(options.maxResponseBytes, VERA_OPENROUTER_FREE_POC_MAX_RESPONSE_BYTES, 4_194_304),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoundedInteger(value: unknown): number | null {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 10_000_000) return null;
  return value as number;
}

function readUsage(value: unknown): VeraOpenRouterFreePocUsage {
  const usage = asRecord(value);
  return {
    promptTokens: readBoundedInteger(usage?.prompt_tokens),
    completionTokens: readBoundedInteger(usage?.completion_tokens),
    totalTokens: readBoundedInteger(usage?.total_tokens),
  };
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const advertisedLength = response.headers.get("content-length");
  if (advertisedLength && Number.isSafeInteger(Number(advertisedLength)) && Number(advertisedLength) > maxBytes) {
    throw new VeraOpenRouterFreePocError({
      code: "response_too_large",
      message: "OpenRouter POC response exceeded the bounded response size.",
      retryable: false,
    });
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new VeraOpenRouterFreePocError({
        code: "response_too_large",
        message: "OpenRouter POC response exceeded the bounded response size.",
        retryable: false,
      });
    }
    return new TextDecoder().decode(bytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value) continue;
      totalBytes += next.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new VeraOpenRouterFreePocError({
          code: "response_too_large",
          message: "OpenRouter POC response exceeded the bounded response size.",
          retryable: false,
        });
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseResult(body: string, maxOutputChars: number): VeraOpenRouterFreePocResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new VeraOpenRouterFreePocError({
      code: "invalid_response",
      message: "OpenRouter POC returned invalid JSON.",
      retryable: false,
    });
  }

  const response = asRecord(parsed);
  const choices = response?.choices;
  const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
  const message = asRecord(firstChoice?.message);
  const text = readString(message?.content);
  const model = readString(response?.model);
  const provider = readString(response?.provider)
    ?? readString(firstChoice?.provider)
    ?? readString(response?.provider_name);
  if (!model || !provider || !text) {
    throw new VeraOpenRouterFreePocError({
      code: "invalid_response",
      message: "OpenRouter POC response omitted required result fields.",
      retryable: false,
    });
  }
  if (text.length > maxOutputChars) {
    throw new VeraOpenRouterFreePocError({
      code: "response_too_large",
      message: "OpenRouter POC output exceeded the bounded output size.",
      retryable: false,
    });
  }

  const finishReason = firstChoice && (firstChoice.finish_reason === null
    ? null
    : readString(firstChoice.finish_reason));
  if (firstChoice && firstChoice.finish_reason !== null && finishReason === null) {
    throw new VeraOpenRouterFreePocError({
      code: "invalid_response",
      message: "OpenRouter POC finish reason was malformed.",
      retryable: false,
    });
  }

  return {
    kind: "openrouter_free_poc",
    model,
    selectedModel: model,
    provider,
    providerIdentity: provider,
    finishReason,
    text,
    usage: readUsage(response?.usage),
  };
}

export class VeraOpenRouterFreePocAdapter {
  readonly enabled: boolean;
  readonly disabledReason?: VeraOpenRouterFreePocGateReason;

  private readonly config: VeraOpenRouterFreePocConfig | null;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: VeraOpenRouterFreePocOptions = {}) {
    const env = options.env ?? process.env;
    const gate = evaluateVeraOpenRouterFreePocGate(env);
    this.enabled = gate.enabled;
    this.disabledReason = gate.reason;
    this.config = gate.enabled ? configFromEnvironment(env, options) : null;
    this.fetchImpl = options.fetchImpl ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
  }

  async run(task: VeraOpenRouterFreePocTask): Promise<VeraOpenRouterFreePocResult> {
    if (!this.enabled || !this.config) {
      throw new VeraOpenRouterFreePocError({
        code: "poc_disabled",
        message: `OpenRouter POC is disabled (${this.disabledReason ?? "gate_failed"}).`,
        retryable: false,
      });
    }
    if (!this.fetchImpl) {
      throw new VeraOpenRouterFreePocError({
        code: "network_error",
        message: "OpenRouter POC transport is unavailable.",
        retryable: true,
      });
    }
    if (!task || typeof task.prompt !== "string" || !task.prompt.trim() || task.prompt.length > VERA_OPENROUTER_FREE_POC_MAX_INPUT_CHARS) {
      throw new VeraOpenRouterFreePocError({
        code: "invalid_input",
        message: "OpenRouter POC input is empty or exceeds the bounded task size.",
        retryable: false,
      });
    }
    const maxOutputTokens = task.maxOutputTokens ?? VERA_OPENROUTER_FREE_POC_MAX_OUTPUT_TOKENS;
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > VERA_OPENROUTER_FREE_POC_MAX_OUTPUT_TOKENS) {
      throw new VeraOpenRouterFreePocError({
        code: "invalid_input",
        message: "OpenRouter POC output limit is outside the bounded range.",
        retryable: false,
      });
    }

    const requestBody: VeraOpenRouterFreePocRequestBody = {
      model: POC_MODEL,
      messages: [{ role: "user", content: task.prompt }],
      provider: { allow_fallbacks: false, data_collection: "allow" },
      max_tokens: maxOutputTokens,
      stream: false,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}${POC_ENDPOINT_PATH}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const responseBody = await readBoundedBody(response, this.config.maxResponseBytes);
      if (!response.ok) {
        throw new VeraOpenRouterFreePocError({
          code: "http_error",
          message: "OpenRouter POC returned a non-success response.",
          status: response.status,
          retryable: response.status >= 500 || response.status === 429,
        });
      }
      return parseResult(responseBody, VERA_OPENROUTER_FREE_POC_MAX_OUTPUT_CHARS);
    } catch (error) {
      if (error instanceof VeraOpenRouterFreePocError) throw error;
      if (controller.signal.aborted) {
        throw new VeraOpenRouterFreePocError({
          code: "timeout",
          message: "OpenRouter POC request timed out.",
          retryable: true,
        });
      }
      throw new VeraOpenRouterFreePocError({
        code: "network_error",
        message: "OpenRouter POC request failed.",
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async complete(task: VeraOpenRouterFreePocTask): Promise<VeraOpenRouterFreePocResult> {
    return this.run(task);
  }
}

export function createVeraOpenRouterFreePocAdapter(
  options: VeraOpenRouterFreePocOptions = {},
): VeraOpenRouterFreePocAdapter {
  return new VeraOpenRouterFreePocAdapter(options);
}

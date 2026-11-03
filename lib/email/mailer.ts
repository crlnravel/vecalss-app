import "server-only";

import { serverLogger } from "@/lib/server-logger";

type EmailEnv = Partial<Record<string, string | undefined>>;

type EmailMessage = {
  html: string;
  /** One value per message. A retry of the same message must reuse it, so Resend sends it once. */
  idempotencyKey: string;
  subject: string;
  text: string;
  to: string;
};

type MailFailureReason =
  | "not_configured"
  | "dev_redirect_required"
  | "timeout"
  | "network"
  | "rejected"
  | "bad_response";

type MailResult =
  | { id: string; ok: true; redirected: boolean }
  | { code?: string; ok: false; reason: MailFailureReason; status?: number };

type SendOptions = {
  env?: EmailEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** A reset email is sent after the response, so this only bounds how long the function stays alive. */
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

function readEnv(env: EmailEnv, key: string) {
  const value = env[key]?.trim();
  return value ? value : null;
}

function isProductionEnv(env: EmailEnv) {
  return env.NODE_ENV === "production";
}

/**
 * Production sends to the real recipient. Anywhere else a message goes only to
 * EMAIL_DEV_REDIRECT, so a seeded or imported address can never receive mail
 * from a developer machine; with no redirect configured nothing is sent.
 */
function resolveRecipient(to: string, env: EmailEnv) {
  if (isProductionEnv(env)) return { redirected: false, to };

  const redirect = readEnv(env, "EMAIL_DEV_REDIRECT");
  return redirect ? { redirected: true, to: redirect } : null;
}

function fail(
  reason: MailFailureReason,
  details: { code?: string; status?: number } = {},
): MailResult {
  return { ok: false, reason, ...details };
}

/**
 * Sends one email through Resend's REST API. Never throws and never logs the
 * message: failures are reported with a reason, an HTTP status and Resend's
 * error name only, because the body of a reset email contains the reset link.
 */
async function sendEmail(message: EmailMessage, options: SendOptions = {}): Promise<MailResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const production = isProductionEnv(env);

  const apiKey = readEnv(env, "RESEND_API_KEY");
  const from = readEnv(env, "EMAIL_FROM");
  if (!apiKey || !from) {
    const code = !apiKey ? "missing_api_key" : "missing_from";
    // In production an unset sender or key is a configuration error worth an alert.
    if (production) {
      serverLogger.error("email.not_configured", new Error("Email delivery is not configured."), {
        area: "email",
        code,
      });
    } else {
      serverLogger.info("email.skipped.not_configured", { area: "email", code });
    }
    return fail("not_configured", { code });
  }

  const recipient = resolveRecipient(message.to, env);
  if (!recipient) {
    serverLogger.info("email.skipped.dev_redirect_required", { area: "email" });
    return fail("dev_redirect_required");
  }

  const replyTo = readEnv(env, "EMAIL_REPLY_TO");
  const subject = recipient.redirected ? `[Uji untuk ${message.to}] ${message.subject}` : message.subject;

  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      body: JSON.stringify({
        from,
        html: message.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        text: message.text,
        to: [recipient.to],
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH),
      },
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { name?: unknown } | null;
      const code = typeof body?.name === "string" ? body.name : undefined;
      serverLogger.error("email.send.rejected", new Error("The email provider rejected the message."), {
        area: "email",
        ...(code ? { code } : {}),
        status: response.status,
      });
      return fail("rejected", { ...(code ? { code } : {}), status: response.status });
    }

    const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
    if (typeof body?.id !== "string" || !body.id) {
      serverLogger.error("email.send.bad_response", new Error("The email provider sent an unexpected reply."), {
        area: "email",
        status: response.status,
      });
      return fail("bad_response", { status: response.status });
    }

    return { id: body.id, ok: true, redirected: recipient.redirected };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    serverLogger.error(
      timedOut ? "email.send.timeout" : "email.send.network_error",
      new Error(timedOut ? "The email provider did not answer in time." : "The email provider could not be reached."),
      { area: "email" },
    );
    return fail(timedOut ? "timeout" : "network");
  }
}

export { DEFAULT_TIMEOUT_MS, RESEND_ENDPOINT, sendEmail };
export type { EmailEnv, EmailMessage, MailFailureReason, MailResult, SendOptions };

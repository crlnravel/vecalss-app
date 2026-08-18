import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import {
  consumeInviteRateLimit,
  getTrustedInviteIdentity,
} from "@/lib/admin/handoffs/rate-limit";
import { completeEnrollmentInvite } from "@/lib/auth/service";
import { hashToken } from "@/lib/auth/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_INVITE_RESPONSE = {
  error: "invalid_invite",
};

function inviteHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function invalidInviteResponse(status = 400) {
  return Response.json(INVALID_INVITE_RESPONSE, {
    headers: inviteHeaders(),
    status,
  });
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return origin === getTrustedAppBaseUrl();
  } catch {
    return false;
  }
}

async function readBodyAtMost(request: Request, maxBytes: number) {
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  if (!token || !isSameOrigin(request)) {
    return invalidInviteResponse();
  }

  const tokenHash = hashToken(token);
  if (!(await consumeInviteRateLimit({
    identity: getTrustedInviteIdentity(),
    tokenHash,
  }))) {
    return invalidInviteResponse(429);
  }

  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 64 * 1024) {
      return invalidInviteResponse();
    }

    const bodyText = await readBodyAtMost(request, 64 * 1024);
    if (bodyText === null) {
      return invalidInviteResponse();
    }

    const body: unknown = JSON.parse(bodyText);
    if (
      typeof body !== "object"
      || body === null
      || !("password" in body)
      || !("confirmPassword" in body)
      || typeof body.password !== "string"
      || typeof body.confirmPassword !== "string"
      || body.password !== body.confirmPassword
    ) {
      return invalidInviteResponse();
    }

    const result = await completeEnrollmentInvite(token, body.password);
    return Response.json(
      { loginAudience: result.loginAudience, ok: true },
      { headers: inviteHeaders() },
    );
  } catch {
    // Invalid, expired, disabled, and already-consumed invites deliberately
    // share one response shape and never include bearer-token diagnostics.
    return invalidInviteResponse();
  }
}

export async function GET() {
  return invalidInviteResponse();
}

import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { recordSuccessfulPackagePurchase } from "@/lib/affiliator/service";
import {
  parsePurchaseSucceededWebhookPayload,
  verifyPurchaseWebhookSignature,
} from "@/lib/affiliator/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_REQUEST_BYTES = 32 * 1024;
const WEBHOOK_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function jsonError(error: string, status: number) {
  return Response.json({ error }, { headers: WEBHOOK_HEADERS, status });
}

export async function POST(request: Request) {
  const secret = process.env.AFFILIATOR_PURCHASE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return jsonError("purchase_webhook_not_configured", 503);
  }

  const bodyBytes = await readRequestBytesAtMost(request, MAX_WEBHOOK_REQUEST_BYTES);
  if (bodyBytes === null) {
    return jsonError("request_too_large", 413);
  }

  if (!verifyPurchaseWebhookSignature({
    body: bodyBytes,
    secret,
    signature: request.headers.get("x-vecalss-purchase-signature"),
  })) {
    return jsonError("invalid_signature", 401);
  }

  let payload: ReturnType<typeof parsePurchaseSucceededWebhookPayload>;
  try {
    payload = parsePurchaseSucceededWebhookPayload(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes)),
    );
  } catch {
    return jsonError("invalid_payload", 400);
  }

  try {
    const purchase = await recordSuccessfulPackagePurchase(payload);
    return Response.json(
      { purchaseId: purchase.id, recorded: true },
      { headers: WEBHOOK_HEADERS, status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("providerReference is already attached")) {
      return jsonError("provider_reference_conflict", 409);
    }

    if (error instanceof Error && (
      error.message.includes("could not be found")
      || error.message.includes("must be an active student")
      || error.message.includes("referralCode is not active")
      || error.message.includes("referralCode is invalid")
    )) {
      return jsonError("purchase_event_rejected", 422);
    }

    return jsonError("purchase_event_unavailable", 503);
  }
}

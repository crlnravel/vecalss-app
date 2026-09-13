import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  normalizeReferralCode,
  requirePurchaseText,
  requirePurchaseUuid,
} from "../lib/affiliator/contracts";
import {
  parsePurchaseSucceededWebhookPayload,
  verifyPurchaseWebhookSignature,
} from "../lib/affiliator/webhook";

assert.equal(normalizeReferralCode(" salsa-2027 "), "SALSA-2027");
assert.equal(normalizeReferralCode("ab"), null);
assert.equal(normalizeReferralCode("not valid"), null);
assert.equal(normalizeReferralCode("A".repeat(41)), null);
assert.equal(requirePurchaseText("  SNBT-01  ", "packageCode", 80), "SNBT-01");
assert.equal(
  requirePurchaseUuid("  00000000-0000-4000-8000-000000000001  ", "studentId"),
  "00000000-0000-4000-8000-000000000001",
);
assert.throws(
  () => requirePurchaseText("", "packageName", 220),
  /packageName must be between/u,
);
assert.throws(
  () => requirePurchaseUuid("student-001", "studentId"),
  /studentId must be a UUID/u,
);

const webhookBody = new TextEncoder().encode(JSON.stringify({
  completedAt: "2026-09-12T08:00:00.000Z",
  event: "package.purchase.succeeded",
  packageCode: "SNBT-01",
  providerReference: "provider-001",
  referralCode: "salsa-2027",
  studentId: "00000000-0000-4000-8000-000000000001",
}));
const webhookSecret = "test-webhook-secret";
const webhookSignature = createHmac("sha256", webhookSecret)
  .update(webhookBody)
  .digest("hex");

assert.equal(
  verifyPurchaseWebhookSignature({
    body: webhookBody,
    secret: webhookSecret,
    signature: `sha256=${webhookSignature}`,
  }),
  true,
);
assert.equal(
  verifyPurchaseWebhookSignature({
    body: webhookBody,
    secret: webhookSecret,
    signature: "sha256=not-a-signature",
  }),
  false,
);

const parsedEvent = parsePurchaseSucceededWebhookPayload(JSON.parse(new TextDecoder().decode(webhookBody)));
assert.equal(parsedEvent.packageCode, "SNBT-01");
assert.equal(parsedEvent.referralCode, "SALSA-2027");
assert.equal(parsedEvent.completedAt?.toISOString(), "2026-09-12T08:00:00.000Z");
assert.throws(
  () => parsePurchaseSucceededWebhookPayload({
    event: "package.purchase.succeeded",
    packageCode: "SNBT-01",
    providerReference: "provider-001",
    studentId: "student-001",
    unexpected: true,
  }),
  /unsupported fields/u,
);

console.log("Affiliator attribution contract tests passed.");

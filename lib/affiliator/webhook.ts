import { createHmac, timingSafeEqual } from "node:crypto";

import {
  normalizeReferralCode,
  requirePurchaseText,
  requirePurchaseUuid,
} from "./contracts";

const PURCHASE_EVENT_NAME = "package.purchase.succeeded";
const SIGNATURE_PREFIX = "sha256=";

type PurchaseSucceededWebhookPayload = {
  completedAt?: Date;
  packageCode: string;
  providerReference: string;
  referralCode: string | null;
  studentId: string;
};

function verifyPurchaseWebhookSignature({
  body,
  secret,
  signature,
}: {
  body: Uint8Array;
  secret: string;
  signature: string | null;
}) {
  if (!secret || !signature?.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const suppliedHex = signature.slice(SIGNATURE_PREFIX.length).trim();
  if (!/^[a-f0-9]{64}$/iu.test(suppliedHex)) {
    return false;
  }

  const supplied = Buffer.from(suppliedHex, "hex");
  const expected = createHmac("sha256", secret).update(body).digest();

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function parsePurchaseSucceededWebhookPayload(value: unknown): PurchaseSucceededWebhookPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Webhook payload must be an object.");
  }

  const payload = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "completedAt",
    "event",
    "packageCode",
    "providerReference",
    "referralCode",
    "studentId",
  ]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
    throw new Error("Webhook payload contains unsupported fields.");
  }

  if (payload.event !== PURCHASE_EVENT_NAME) {
    throw new Error("Webhook event is not a successful package purchase.");
  }

  const packageCode = requirePurchaseText(payload.packageCode, "packageCode", 80);
  const providerReference = requirePurchaseText(payload.providerReference, "providerReference", 160);
  const studentId = requirePurchaseUuid(payload.studentId, "studentId");

  let referralCode: string | null = null;
  if (payload.referralCode !== undefined && payload.referralCode !== null) {
    referralCode = normalizeReferralCode(payload.referralCode);
    if (!referralCode) {
      throw new Error("referralCode is invalid.");
    }
  }

  let completedAt: Date | undefined;
  if (payload.completedAt !== undefined && payload.completedAt !== null) {
    const rawCompletedAt = requirePurchaseText(payload.completedAt, "completedAt", 80);
    completedAt = new Date(rawCompletedAt);
    if (Number.isNaN(completedAt.getTime())) {
      throw new Error("completedAt must be a valid date.");
    }
  }

  return {
    completedAt,
    packageCode,
    providerReference,
    referralCode,
    studentId,
  };
}

export {
  parsePurchaseSucceededWebhookPayload,
  verifyPurchaseWebhookSignature,
};
export type { PurchaseSucceededWebhookPayload };

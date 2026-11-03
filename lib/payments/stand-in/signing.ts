import { createHmac, timingSafeEqual } from "node:crypto";

import { EVENT_FRESHNESS_SECONDS } from "../constants";

const TIMESTAMP_HEADER = "x-stand-in-timestamp";
const SIGNATURE_HEADER = "x-stand-in-signature";
const SIGNATURE_PREFIX = "v1=";

/** HMAC-SHA256 over `<unix seconds>.<raw body>`, so a captured body cannot be replayed later. */
function computeSignature(secret: string, timestamp: string, rawBody: Uint8Array) {
  return createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(rawBody)
    .digest("hex");
}

/** Headers for a stand-in event, signed over exactly these body bytes. */
function signStandInEvent(secret: string, rawBody: Uint8Array, at: Date) {
  const timestamp = String(Math.floor(at.getTime() / 1000));
  return {
    [SIGNATURE_HEADER]: `${SIGNATURE_PREFIX}${computeSignature(secret, timestamp, rawBody)}`,
    [TIMESTAMP_HEADER]: timestamp,
  };
}

type SignatureCheck = "ok" | "bad_signature" | "stale";

function checkStandInSignature(
  secret: string,
  headers: Headers,
  rawBody: Uint8Array,
  now: Date,
): SignatureCheck {
  const timestamp = headers.get(TIMESTAMP_HEADER)?.trim() ?? "";
  const presented = headers.get(SIGNATURE_HEADER)?.trim() ?? "";
  if (!/^\d{1,12}$/u.test(timestamp) || !presented.startsWith(SIGNATURE_PREFIX)) return "bad_signature";

  const expected = Buffer.from(computeSignature(secret, timestamp, rawBody), "hex");
  const received = Buffer.from(presented.slice(SIGNATURE_PREFIX.length), "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return "bad_signature";

  const ageSeconds = Math.abs(now.getTime() / 1000 - Number(timestamp));
  return ageSeconds > EVENT_FRESHNESS_SECONDS ? "stale" : "ok";
}

export { SIGNATURE_HEADER, TIMESTAMP_HEADER, checkStandInSignature, signStandInEvent };

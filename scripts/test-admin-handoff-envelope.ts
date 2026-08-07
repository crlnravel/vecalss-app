import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { EnrollmentHandoffMethod } from "@/generated/prisma/client";
import {
  EnrollmentHandoffCryptoError,
  openEnrollmentHandoffSecret,
  rewrapEnrollmentHandoffSecret,
  sealEnrollmentHandoffSecret,
  validateEnrollmentHandoffKeyRing,
} from "@/lib/admin/handoffs/envelope";

const context = {
  handoffId: "00000000-0000-0000-0000-000000000001",
  method: EnrollmentHandoffMethod.invite_link,
  userId: "00000000-0000-0000-0000-000000000002",
};

const oldKey = randomBytes(32).toString("base64");
const activeKey = randomBytes(32).toString("base64");
const oldRing = validateEnrollmentHandoffKeyRing({ old: oldKey }, "old");
const ring = validateEnrollmentHandoffKeyRing({ old: oldKey, active: activeKey }, "active");
const envelope = sealEnrollmentHandoffSecret("temporary-secret", context, ring);

assert.equal(openEnrollmentHandoffSecret(envelope, context, ring), "temporary-secret");

assert.throws(
  () => openEnrollmentHandoffSecret(envelope, { ...context, userId: "00000000-0000-0000-0000-000000000003" }, ring),
  (error: unknown) => error instanceof EnrollmentHandoffCryptoError && error.code === "authentication_failed",
);

const oldEnvelope = sealEnrollmentHandoffSecret("temporary-secret", context, oldRing);
const rewrapped = rewrapEnrollmentHandoffSecret(oldEnvelope, context, ring);
assert.equal(rewrapped.keyId, "active");
assert.equal(openEnrollmentHandoffSecret(rewrapped, context, ring), "temporary-secret");

assert.throws(
  () => openEnrollmentHandoffSecret(envelope, context, validateEnrollmentHandoffKeyRing({ other: activeKey }, "other")),
  (error: unknown) => error instanceof EnrollmentHandoffCryptoError && error.code === "unknown_key_id",
);

console.log("admin handoff envelope checks passed");

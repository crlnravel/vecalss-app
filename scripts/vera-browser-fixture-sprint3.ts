import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
if (!connectionString || process.env.VERA_DISPOSABLE_DB_ACK !== "1") throw new Error("Disposable database acknowledgement is required.");
const parsed = new URL(connectionString);
assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
assert.equal(parsed.pathname.replace(/\/$/u, ""), "/vera_test");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const studentId = "7c525d4a-7663-4f2e-8e18-1f3712d7b301";
const conversationId = "7c525d4a-7663-4f2e-8e18-1f3712d7b302";
const token = "vera-sprint3-browser-session";
const mode = process.argv[2] ?? "setup";

try {
  if (mode === "cleanup") {
    const requestIds = (await db.aiRequest.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id);
    const envelopeObjectIds = [
      ...(await db.aiMessage.findMany({ where: { conversationId }, select: { id: true } })).map((row) => row.id),
      ...(await db.aiContextPack.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } })).map((row) => row.id),
      ...(await db.aiRequestResultStage.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } })).map((row) => row.id),
      ...(await db.aiArtifact.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id),
    ];
    await db.authSession.deleteMany({ where: { userId: studentId } });
    await db.roleAssignment.deleteMany({ where: { userId: studentId } });
    await db.aiArtifactLifecycle.deleteMany({ where: { artifact: { studentId } } });
    await db.aiArtifact.deleteMany({ where: { studentId } });
    await db.aiRequestResultStage.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.aiRequestSource.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.aiContextPack.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.aiRequest.deleteMany({ where: { studentId } });
    await db.aiMessage.deleteMany({ where: { conversationId } });
    await db.aiConversation.deleteMany({ where: { studentId } });
    await db.aiAdmissionEvent.deleteMany({ where: { studentId } });
    await db.aiUsageDaily.deleteMany({ where: { studentId } });
    await db.aiIdempotencyKey.deleteMany({ where: { studentId } });
    if (envelopeObjectIds.length) {
      await db.aiEnvelopeKey.deleteMany({ where: { OR: envelopeObjectIds.map((objectId) => ({ objectId: { contains: objectId } })) } });
    }
    await db.billingAccount.deleteMany({ where: { studentId } });
    await db.studentProfile.deleteMany({ where: { userId: studentId } });
    await db.user.deleteMany({ where: { id: studentId } });
    console.log("PASS vera-browser-fixture: cleanup");
  } else {
    const policy = await db.aiPolicyBundle.findFirst({ where: { bundleVersion: "vera-policy-bundle-v1-2026-08-24" } });
    if (!policy) throw new Error("Policy seed missing.");
    await db.aiPolicyBundle.update({ where: { id: policy.id }, data: { state: "active", effectiveAt: new Date(Date.now() - 60_000) } });
    await db.user.upsert({ where: { id: studentId }, update: {}, create: { id: studentId, email: "vera-sprint3-browser@example.test", fullName: "Vera Browser", passwordHash: "fixture" } });
    await db.studentProfile.upsert({ where: { userId: studentId }, update: { timezone: "Asia/Jakarta", onboardingStatus: "completed" }, create: { userId: studentId, timezone: "Asia/Jakarta", onboardingStatus: "completed" } });
    const role = await db.roleAssignment.findFirst({ where: { userId: studentId, role: "student", revokedAt: null } });
    if (!role) await db.roleAssignment.create({ data: { userId: studentId, role: "student" } });
    await db.billingAccount.upsert({ where: { studentId }, update: { planCode: "pro", status: "trial" }, create: { studentId, planCode: "pro", status: "trial" } });
    await db.aiConversation.upsert({ where: { id: conversationId }, update: {}, create: { id: conversationId, studentId, conversationType: "vera_chat", title: "Ruang belajar Vera" } });
    await db.authSession.deleteMany({ where: { userId: studentId } });
    await db.authSession.create({ data: { userId: studentId, refreshTokenHash: createHash("sha256").update(token).digest("hex"), status: "active", expiresAt: new Date(Date.now() + 3_600_000), lastSeenAt: new Date() } });
    console.log(`PASS vera-browser-fixture: setup student=${studentId} conversation=${conversationId} token=${token}`);
  }
} finally {
  await db.$disconnect();
}

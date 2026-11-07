import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { generateSecret } from "otplib";

import { RoleName } from "../generated/prisma/client";
import { createOpaqueToken, hashToken } from "../lib/auth/crypto";
import { sealMfaSecret } from "../lib/auth/mfa/secret-envelope.mjs";
import { getSessionContextForToken } from "../lib/auth/session";
import { withMediaStorageTestOverrides } from "../lib/media/r2";
import { hasAdminReportAccess, hasTutorReportSubmissionAccess } from "../lib/reports/access";
import { serveAdminReportAttachment } from "../lib/reports/attachment-route";
import { AdminReportAccessError, getAdminReportById, listAdminReports } from "../lib/reports/queries";
import { createMentorReport } from "../lib/reports/service";
import { validateMentorReportSubmission } from "../lib/reports/validation";
import { prisma } from "../lib/prisma";

/**
 * MS-23: Laporan belongs to admins. A mentor files a report with an attachment, a verified admin
 * opens the list, the detail and the attachment bytes, and nobody else can: not an anonymous
 * visitor, a mentor, a student, an admin who has not passed the second factor, or an admin who
 * still has a temporary password. Runs against the local dev database only.
 */
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:admin-reports only runs against the local dev database on 127.0.0.1:55432.");
}

const runId = randomUUID().slice(0, 8);
const userIds: string[] = [];
const reportIds: string[] = [];

async function makeUser(label: string, roles: RoleName[], mustChangePassword = false) {
  const user = await prisma.user.create({
    data: {
      email: `admin-reports-${label}-${runId}@vecalss.local`,
      fullName: `Reports ${label}`,
      mustChangePassword,
      passwordHash: "not-a-real-hash",
      roleAssignments: { create: roles.map((role) => ({ role })) },
      ...(roles.includes(RoleName.student) ? { studentProfile: { create: { displayName: label, onboardingStatus: "completed" } } } : {}),
    },
    select: { id: true },
  });
  // Granted long ago on database time, so the verification below counts.
  await prisma.$executeRaw`UPDATE role_assignments SET assigned_at = now() - make_interval(days => 30) WHERE user_id = ${user.id}::uuid`;
  userIds.push(user.id);
  return user.id;
}

async function contextFor(userId: string, verified: boolean) {
  const token = createOpaqueToken();
  const row = await prisma.authSession.create({
    data: { expiresAt: new Date(Date.now() + 3_600_000), refreshTokenHash: hashToken(token), userId },
    select: { id: true },
  });
  if (verified) {
    const factorId = randomUUID();
    await prisma.userMfaFactor.create({
      data: { confirmedAt: new Date(), id: factorId, secretEnvelope: sealMfaSecret(generateSecret(), { factorId, userId }), userId },
    });
    await prisma.$executeRaw`
      UPDATE auth_sessions SET mfa_verified_at = now() - make_interval(secs => 30), mfa_factor_id = ${factorId}::uuid
      WHERE id = ${row.id}::uuid
    `;
  }
  const context = await getSessionContextForToken(token);
  assert.ok(context, "the session resolves");
  return context;
}

async function main() {
  const tutorId = await makeUser("tutor", [RoleName.tutor]);
  const adminId = await makeUser("admin", [RoleName.admin]);
  const unverifiedAdminId = await makeUser("unverified", [RoleName.admin]);
  const tempPasswordAdminId = await makeUser("temp", [RoleName.admin], true);
  const studentId = await makeUser("student", [RoleName.student]);

  const tutor = await contextFor(tutorId, false);
  const admin = await contextFor(adminId, true);
  const unverifiedAdmin = await contextFor(unverifiedAdminId, false);
  const tempPasswordAdmin = await contextFor(tempPasswordAdminId, true);
  const student = await contextFor(studentId, false);
  assert.ok(admin.user.roles.includes(RoleName.admin), "a verified admin carries the admin role");
  assert.deepEqual(unverifiedAdmin.user.roles, [], "an unverified admin carries no role");

  // A mentor files a report with an attachment. Only a Kapten may file one; an admin is not a Kapten.
  assert.equal(hasTutorReportSubmissionAccess(tutor.user.roles, tutor.user.mustChangePassword), true);
  assert.equal(hasTutorReportSubmissionAccess(admin.user.roles, admin.user.mustChangePassword), false);

  const pdfBytes = new TextEncoder().encode("%PDF-1.7\nlaporan mentor");
  const form = new FormData();
  form.set("title", `Tombol simpan macet ${runId}`);
  form.set("feature", "materi");
  form.set("url", "/mentor/materi");
  form.set("description", "Tombol simpan tidak memberi respons setelah dipilih.");
  form.append("attachment", new File([pdfBytes.buffer.slice(0) as ArrayBuffer], "bukti.pdf", { type: "application/pdf" }));
  const validation = await validateMentorReportSubmission(form);
  if (!validation.ok) throw new Error(validation.message);

  const storage = new Map<string, Uint8Array>();
  await withMediaStorageTestOverrides({
    putPrivateReportAttachment: async (key, bytes) => {
      storage.set(key, bytes);
    },
    readPrivateReportAttachment: async (key) => {
      const bytes = storage.get(key);
      if (!bytes) throw new Error("missing object");
      return bytes;
    },
    deletePrivateReportAttachment: async (key) => {
      storage.delete(key);
    },
  }, async () => {
    const { id: reportId } = await createMentorReport(tutorId, validation.value);
    reportIds.push(reportId);
    assert.equal(storage.size, 1, "the attachment was stored");

    // The admin sees it in the list and in the detail, and the attachment links point under /api/admin.
    const list = await listAdminReports(admin);
    const listed = list.find((item) => item.id === reportId);
    assert.ok(listed, "the report is in the admin list");
    assert.equal(listed.authorName, "Reports tutor");

    const detail = await getAdminReportById(reportId, admin);
    assert.ok(detail, "the admin can open the report");
    assert.equal(detail.attachments.length, 1);
    const [attachment] = detail.attachments;
    assert.equal(attachment.previewUrl, `/api/admin/reports/${reportId}/attachment/${attachment.id}?mode=preview`);
    assert.equal(attachment.downloadUrl, `/api/admin/reports/${reportId}/attachment/${attachment.id}?mode=download`);

    const open = (session: typeof admin | null, mode: string | null = "preview", ids = { attachmentId: attachment.id, reportId }) =>
      serveAdminReportAttachment({ ...ids, mode, session });

    // ... and the admin gets the file itself.
    const served = await open(admin);
    assert.equal(served.status, 200);
    assert.deepEqual(new Uint8Array(await served.arrayBuffer()), pdfBytes);
    assert.match(served.headers.get("content-disposition") ?? "", /^inline;/u);
    assert.match((await open(admin, "download")).headers.get("content-disposition") ?? "", /^attachment;/u);
    assert.equal((await open(admin, null)).status, 400, "a mode is required");
    assert.equal((await open(admin, "preview", { attachmentId: randomUUID(), reportId })).status, 404);
    assert.equal((await open(admin, "preview", { attachmentId: attachment.id, reportId: randomUUID() })).status, 404, "an attachment only opens under its own report");

    // Nobody else gets in.
    assert.equal((await open(null)).status, 401, "anonymous");
    for (const [label, session] of [
      ["a mentor", tutor],
      ["a student", student],
      ["an admin without the second factor", unverifiedAdmin],
      ["an admin on a temporary password", tempPasswordAdmin],
    ] as const) {
      assert.equal((await open(session)).status, 403, `${label} cannot open the attachment`);
      await assert.rejects(listAdminReports(session), AdminReportAccessError, `${label} cannot list reports`);
      await assert.rejects(getAdminReportById(reportId, session), AdminReportAccessError, `${label} cannot open a report`);
      assert.equal(hasAdminReportAccess(session.user.roles, session.user.mustChangePassword), false);
    }
    await assert.rejects(listAdminReports(null), AdminReportAccessError, "anonymous cannot list reports");
  });
  console.log("Admin Laporan checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.mentorReport.deleteMany({ where: { id: { in: reportIds } } }).catch(() => undefined);
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.userMfaFactor.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.studentProfile.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

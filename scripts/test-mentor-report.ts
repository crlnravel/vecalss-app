import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { MentorReportFeature, RoleName } from "@/generated/prisma/client";
import { withMediaStorageTestOverrides } from "@/lib/media/r2";
import {
  hasDeveloperReportAccess,
  hasTutorReportSubmissionAccess,
} from "@/lib/reports/access";
import { createMentorReport } from "@/lib/reports/service";
import {
  REPORT_ATTACHMENT_MAX_SIZE_BYTES,
  validateMentorReportSubmission,
} from "@/lib/reports/validation";
import { prisma } from "@/lib/prisma";

function createReportForm({
  feature = "materi",
  url = "/mentor/materi",
  attachment,
}: {
  feature?: string;
  url?: string;
  attachment?: File;
} = {}) {
  const formData = new FormData();
  formData.set("title", "Tombol simpan tidak merespons");
  formData.set("feature", feature);
  formData.set("url", url);
  formData.set("description", "Tombol simpan tidak memberi respons setelah dipilih.");
  if (attachment) formData.set("attachment", attachment);
  return formData;
}

function createFile(name: string, contentType: string, bytes: Uint8Array) {
  const fileBytes = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new File([fileBytes], name, { type: contentType });
}

async function run() {
  const validInputResult = await validateMentorReportSubmission(createReportForm());
  if (!validInputResult.ok) throw new Error(validInputResult.message);
  assert.equal(validInputResult.ok, true, "valid report form is accepted");
  assert.equal(validInputResult.value.feature, MentorReportFeature.materi);
  assert.equal(validInputResult.value.attachment, null);

  const invalidFeature = await validateMentorReportSubmission(
    createReportForm({ feature: "admin" }),
  );
  assert.equal(invalidFeature.ok, false, "unknown feature values are rejected");

  const unsafeUrl = await validateMentorReportSubmission(
    createReportForm({ url: "javascript:alert(1)" }),
  );
  assert.equal(unsafeUrl.ok, false, "non-web URL schemes are rejected");

  const wrongContent = await validateMentorReportSubmission(createReportForm({
    attachment: createFile(
      "payload.png",
      "image/png",
      new TextEncoder().encode("<script>alert(1)</script>"),
    ),
  }));
  assert.equal(wrongContent.ok, false, "spoofed image MIME with non-image bytes is rejected");

  const mislabeledPdf = await validateMentorReportSubmission(createReportForm({
    attachment: createFile(
      "evidence.png",
      "image/png",
      new TextEncoder().encode("%PDF-1.7\nreport evidence"),
    ),
  }));
  assert.equal(mislabeledPdf.ok, true, "file content, not the browser MIME label, determines type");
  if (mislabeledPdf.ok) {
    assert.equal(mislabeledPdf.value.attachment?.contentType, "application/pdf");
    assert.equal(mislabeledPdf.value.attachment?.fileName, "evidence.pdf");
  }

  const oversizedAttachment = await validateMentorReportSubmission(createReportForm({
    attachment: createFile(
      "large.png",
      "image/png",
      new Uint8Array(REPORT_ATTACHMENT_MAX_SIZE_BYTES + 1),
    ),
  }));
  assert.equal(oversizedAttachment.ok, false, "attachments over the size limit are rejected");

  assert.equal(hasDeveloperReportAccess(null), false, "anonymous requests cannot access reports");
  assert.equal(hasDeveloperReportAccess([RoleName.tutor]), false, "mentor role cannot access reports");
  assert.equal(hasDeveloperReportAccess([RoleName.developer]), true, "developer role can access reports");
  assert.equal(
    hasDeveloperReportAccess([RoleName.developer], true),
    false,
    "developers must change their password before accessing reports",
  );
  assert.equal(hasTutorReportSubmissionAccess([RoleName.tutor]), true, "mentors can submit reports");
  assert.equal(
    hasTutorReportSubmissionAccess([RoleName.tutor], true),
    false,
    "mentors must change their password before submitting reports",
  );

  const testUser = await prisma.user.create({
    data: {
      email: `mentor-report-test-${randomUUID()}@example.test`,
      fullName: "Report persistence test",
      passwordHash: "not-a-login-credential",
    },
    select: { id: true },
  });
  const createdReportIds: string[] = [];

  try {
    const { id: plainReportId } = await createMentorReport(testUser.id, validInputResult.value);
    createdReportIds.push(plainReportId);
    const plainReport = await prisma.mentorReport.findUnique({ where: { id: plainReportId } });
    assert.equal(plainReport?.authorId, testUser.id, "report is persisted with its author");
    assert.equal(plainReport?.feature, MentorReportFeature.materi);
    assert.equal(plainReport?.attachmentKey, null);

    assert.equal(mislabeledPdf.ok, true);

    const uploadedKeys = new Set<string>();
    const deletedKeys = new Set<string>();
    await withMediaStorageTestOverrides({
      putPrivateReportAttachment: async (key) => {
        uploadedKeys.add(key);
      },
      deletePrivateReportAttachment: async (key) => {
        deletedKeys.add(key);
      },
    }, async () => {
      const { id: attachedReportId } = await createMentorReport(testUser.id, mislabeledPdf.value);
      createdReportIds.push(attachedReportId);
      const attachedReport = await prisma.mentorReport.findUnique({ where: { id: attachedReportId } });
      assert.equal(attachedReport?.attachmentContentType, "application/pdf");
      assert.equal(attachedReport?.attachmentFileName, "evidence.pdf");
      assert.equal(uploadedKeys.has(attachedReport?.attachmentKey ?? ""), true);

      let invalidAuthorFailed = false;
      try {
        await createMentorReport(randomUUID(), mislabeledPdf.value);
      } catch {
        invalidAuthorFailed = true;
      }
      assert.equal(invalidAuthorFailed, true, "database rejects a report with a missing author");
      assert.equal(uploadedKeys.size, 2, "the report attachment was uploaded before report creation");
      assert.equal(deletedKeys.size, 1, "the orphaned attachment is removed when database creation fails");
      for (const key of deletedKeys) assert.equal(uploadedKeys.has(key), true);
    });
  } finally {
    if (createdReportIds.length > 0) {
      await prisma.mentorReport.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    await prisma.user.delete({ where: { id: testUser.id } });
  }
}

run()
  .then(async () => {
    await prisma.$disconnect();
    process.stdout.write("Mentor report validation and persistence checks passed.\n");
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });

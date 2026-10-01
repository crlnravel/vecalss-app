import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { MentorReportFeature, RoleName } from "@/generated/prisma/client";
import { withMediaStorageTestOverrides } from "@/lib/media/r2";
import { createReportAttachmentResponse } from "@/lib/reports/attachment-http";
import {
  hasDeveloperReportAccess,
  hasTutorReportSubmissionAccess,
} from "@/lib/reports/access";
import { createMentorReport } from "@/lib/reports/service";
import {
  REPORT_ATTACHMENT_MAX_COUNT,
  REPORT_ATTACHMENT_MAX_SIZE_BYTES,
  REPORT_ATTACHMENT_MAX_TOTAL_SIZE_BYTES,
  validateMentorReportSubmission,
} from "@/lib/reports/validation";
import { prisma } from "@/lib/prisma";

function createReportForm({
  feature = "materi",
  url = "/mentor/materi",
  attachments = [],
}: {
  attachments?: File[];
  feature?: string;
  url?: string;
} = {}) {
  const formData = new FormData();
  formData.set("title", "Tombol simpan tidak merespons");
  formData.set("feature", feature);
  formData.set("url", url);
  formData.set("description", "Tombol simpan tidak memberi respons setelah dipilih.");
  for (const attachment of attachments) formData.append("attachment", attachment);
  return formData;
}

function createFile(name: string, contentType: string, bytes: Uint8Array) {
  const fileBytes = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new File([fileBytes], name, { type: contentType });
}

function createPdf(name = "evidence.pdf") {
  return createFile(name, "application/pdf", new TextEncoder().encode("%PDF-1.7\nreport evidence"));
}

async function run() {
  const zeroAttachmentResult = await validateMentorReportSubmission(createReportForm());
  if (!zeroAttachmentResult.ok) throw new Error(zeroAttachmentResult.message);
  assert.equal(zeroAttachmentResult.value.feature, MentorReportFeature.materi);
  assert.equal(zeroAttachmentResult.value.attachments.length, 0, "zero attachments are accepted");

  const invalidFeature = await validateMentorReportSubmission(
    createReportForm({ feature: "admin" }),
  );
  assert.equal(invalidFeature.ok, false, "unknown feature values are rejected");

  const unsafeUrl = await validateMentorReportSubmission(
    createReportForm({ url: "javascript:alert(1)" }),
  );
  assert.equal(unsafeUrl.ok, false, "non-web URL schemes are rejected");

  const wrongContent = await validateMentorReportSubmission(createReportForm({
    attachments: [createFile(
      "payload.png",
      "image/png",
      new TextEncoder().encode("<script>alert(1)</script>"),
    )],
  }));
  assert.equal(wrongContent.ok, false, "spoofed image MIME with non-image bytes is rejected");

  const singleAttachmentResult = await validateMentorReportSubmission(createReportForm({
    attachments: [createPdf("evidence.png")],
  }));
  if (!singleAttachmentResult.ok) throw new Error(singleAttachmentResult.message);
  assert.equal(singleAttachmentResult.value.attachments.length, 1, "one attachment is accepted");
  assert.equal(singleAttachmentResult.value.attachments[0]?.contentType, "application/pdf");
  assert.equal(singleAttachmentResult.value.attachments[0]?.fileName, "evidence.pdf");

  const multipleAttachmentResult = await validateMentorReportSubmission(createReportForm({
    attachments: [
      createPdf("first.pdf"),
      createFile("second.png", "image/png", new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ])),
    ],
  }));
  if (!multipleAttachmentResult.ok) throw new Error(multipleAttachmentResult.message);
  assert.equal(multipleAttachmentResult.value.attachments.length, 2, "repeated FormData files are accepted");
  assert.equal(multipleAttachmentResult.value.attachments[1]?.contentType, "image/png");

  const tooManyAttachments = await validateMentorReportSubmission(createReportForm({
    attachments: Array.from({ length: REPORT_ATTACHMENT_MAX_COUNT + 1 }, (_, index) => (
      createPdf(`evidence-${index}.pdf`)
    )),
  }));
  assert.equal(tooManyAttachments.ok, false, "more than 10 attachments are rejected");

  const oversizedAttachment = await validateMentorReportSubmission(createReportForm({
    attachments: [createFile(
      "large.pdf",
      "application/pdf",
      new Uint8Array(REPORT_ATTACHMENT_MAX_SIZE_BYTES + 1),
    )],
  }));
  assert.equal(oversizedAttachment.ok, false, "an attachment over 10 MiB is rejected");

  const overAggregateLimit = await validateMentorReportSubmission(createReportForm({
    attachments: Array.from({ length: 6 }, (_, index) => (
      createFile(`large-${index}.pdf`, "application/pdf", new Uint8Array(9 * 1024 * 1024))
    )),
  }));
  assert.equal(overAggregateLimit.ok, false, "aggregate attachment bytes over 50 MiB are rejected");
  assert.equal(REPORT_ATTACHMENT_MAX_TOTAL_SIZE_BYTES, 50 * 1024 * 1024);

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

  const bytes = new TextEncoder().encode("%PDF-1.7\npreview test");
  const metadata = { contentType: "application/pdf", fileName: "bukti.pdf" };
  const previewResponse = createReportAttachmentResponse(bytes, metadata, "preview");
  const downloadResponse = createReportAttachmentResponse(bytes, metadata, "download");
  assert.match(previewResponse.headers.get("Content-Disposition") ?? "", /^inline;/u);
  assert.match(downloadResponse.headers.get("Content-Disposition") ?? "", /^attachment;/u);
  assert.equal(previewResponse.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(previewResponse.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(previewResponse.headers.get("Content-Type"), "application/pdf");
  assert.equal(previewResponse.headers.get("X-Frame-Options"), "SAMEORIGIN");

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
    const { id: emptyReportId } = await createMentorReport(testUser.id, zeroAttachmentResult.value);
    createdReportIds.push(emptyReportId);
    const emptyReport = await prisma.mentorReport.findUnique({
      where: { id: emptyReportId },
      include: { attachments: true },
    });
    assert.equal(emptyReport?.authorId, testUser.id, "report is persisted with its author");
    assert.equal(emptyReport?.attachments.length, 0, "zero-attachment reports persist cleanly");

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
      const { id: singleReportId } = await createMentorReport(testUser.id, singleAttachmentResult.value);
      createdReportIds.push(singleReportId);
      const singleReport = await prisma.mentorReport.findUnique({
        where: { id: singleReportId },
        include: { attachments: true },
      });
      assert.equal(singleReport?.attachments.length, 1, "single attachments persist as child rows");
      assert.equal(singleReport?.attachments[0]?.contentType, "application/pdf");
      assert.equal(uploadedKeys.has(singleReport?.attachments[0]?.storageKey ?? ""), true);

      const { id: multipleReportId } = await createMentorReport(testUser.id, multipleAttachmentResult.value);
      createdReportIds.push(multipleReportId);
      const multipleReport = await prisma.mentorReport.findUnique({
        where: { id: multipleReportId },
        include: { attachments: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
      });
      assert.equal(multipleReport?.attachments.length, 2, "multiple attachments persist as child rows");
      assert.deepEqual(
        multipleReport?.attachments.map(({ fileName }) => fileName),
        ["first.pdf", "second.png"],
      );

      const failedUploadKeys: string[] = [];
      const cleanedPartialUploadKeys = new Set<string>();
      let uploadCount = 0;
      await withMediaStorageTestOverrides({
        putPrivateReportAttachment: async (key) => {
          failedUploadKeys.push(key);
          uploadCount += 1;
          if (uploadCount === 2) throw new Error("simulated partial storage failure");
        },
        deletePrivateReportAttachment: async (key) => {
          cleanedPartialUploadKeys.add(key);
        },
      }, async () => {
        await assert.rejects(
          createMentorReport(testUser.id, multipleAttachmentResult.value),
          /simulated partial storage failure/u,
        );
      });
      assert.equal(failedUploadKeys.length, 2);
      assert.deepEqual(new Set(failedUploadKeys), cleanedPartialUploadKeys);

      const databaseFailureUploadedKeys = new Set<string>();
      const databaseFailureDeletedKeys = new Set<string>();
      await withMediaStorageTestOverrides({
        putPrivateReportAttachment: async (key) => {
          databaseFailureUploadedKeys.add(key);
        },
        deletePrivateReportAttachment: async (key) => {
          databaseFailureDeletedKeys.add(key);
        },
      }, async () => {
        await assert.rejects(
          createMentorReport(randomUUID(), multipleAttachmentResult.value),
        );
      });
      assert.equal(databaseFailureUploadedKeys.size, 2);
      assert.deepEqual(databaseFailureUploadedKeys, databaseFailureDeletedKeys);
      assert.equal(deletedKeys.size, 0, "successful report attachments are retained");
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
    process.stdout.write("Mentor report attachment checks passed.\n");
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });

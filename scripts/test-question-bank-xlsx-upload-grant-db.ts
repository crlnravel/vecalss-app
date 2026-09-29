import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.QUESTION_BANK_XLSX_TEST_DATABASE_URL;
assert.ok(databaseUrl, "QUESTION_BANK_XLSX_TEST_DATABASE_URL is required.");
const database = new URL(databaseUrl);
assert.ok(["postgres:", "postgresql:"].includes(database.protocol));
assert.ok(["localhost", "127.0.0.1", "::1"].includes(database.hostname));
assert.match(database.pathname, /(?:vecalss_dev|test|fixture)/u);
process.env.DATABASE_URL = databaseUrl;

const [{ prisma }, { withMediaStorageTestOverrides }, { createQuestionBankXlsxUploadGrant }] = await Promise.all([
  import("../lib/prisma"),
  import("../lib/media/r2"),
  import("../lib/question-bank/xlsx-import-repository"),
]);

const ownerId = randomUUID();
try {
  await prisma.user.create({
    data: {
      email: `xlsx-grant-${ownerId}@example.test`,
      fullName: "XLSX Upload Grant Test",
      id: ownerId,
      passwordHash: "fixture-hash",
    },
  });

  await withMediaStorageTestOverrides({
    createPrivateStagingMultipartUpload: async () => "fixture-upload-id",
    createPrivateStagingUploadPartUrl: async () => ({
      expiresInSeconds: 60,
      uploadUrl: "https://example.test/upload-part",
    }),
  }, async () => {
    const grant = await createQuestionBankXlsxUploadGrant(ownerId, "questions.xlsx", 1_024);
    const attempt = await prisma.questionBankXlsxImportAttempt.findUnique({ where: { id: grant.uploadId } });

    assert.ok(attempt, "The upload grant must identify the persisted attempt.");
    assert.equal(attempt.ownerUserId, ownerId);
    assert.equal(attempt.stagingPrefix, `question-bank-xlsx-staging/${grant.uploadId}/`);
    assert.equal(attempt.uploadObjectKey, `${attempt.stagingPrefix}workbook.xlsx`);
    assert.equal(attempt.multipartUploadId, "fixture-upload-id");
    assert.equal(attempt.state, "multipart_uploading");
    assert.equal(grant.parts.length, 1);
  });

  console.log("Question Bank XLSX upload grant DB contract passed.");
} finally {
  await prisma.questionBankXlsxImportAttempt.deleteMany({ where: { ownerUserId: ownerId } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
}

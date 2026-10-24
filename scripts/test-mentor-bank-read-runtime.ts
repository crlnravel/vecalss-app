import assert from "node:assert/strict";
import { config } from "dotenv";

// Match Next's local datasource without falling back to the staging CLI env.
// This smoke check only reads existing seeded records; it never creates fixtures.
config({ path: ".env.local", override: true, quiet: true });
config({ path: ".env", quiet: true });
const target = new URL(process.env.DATABASE_URL!);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/vecalss_dev");
const { prisma } = await import("../lib/prisma");
const { getMentorStandaloneQuiz } = await import("../lib/quiz/repository");
const { listQuestionBankPage } = await import("../lib/question-bank/repository");
const { listQuestionBankFolderTree, listQuestionBankCategories } = await import("../lib/question-bank/organization");
try {
  const record = await prisma.standaloneQuiz.findFirstOrThrow({
    where: {
      ...(process.env.MENTOR_QA_QUIZ_ID ? { id: process.env.MENTOR_QA_QUIZ_ID } : {}),
      assemblyPackageVersionId: null,
      sourceBankId: { not: null },
      sourceBank: { purpose: "quiz", deletedAt: null, status: "published" },
    },
    include: { sourceBank: true },
    orderBy: { id: "asc" },
  });
  assert.equal(record.sourceBank?.createdByUserId, record.createdByUserId);
  const result = await getMentorStandaloneQuiz(record.id, record.createdByUserId);
  assert.equal(result?.quiz.sourceMode, "bank");
  assert.equal(result?.quiz.sourceBankId, record.sourceBankId);
  assert.equal(result?.quiz.sourceBank, record.sourceBank?.name, "the editor must return the real source bank name");
  console.log(`Read-only editor projection: bank mode, correct title/id, ${result?.questions.length} saved questions.`);
  for (const purpose of ["quiz", "tryout"] as const) {
    // These real repository queries fail on an incompatible loaded Prisma
    // model, including the recorded Unknown argument deletedAt failure.
    const page = await listQuestionBankPage({ purpose, folderId: null, page: 1, pageSize: 20 });
    const folders = await listQuestionBankFolderTree(purpose);
    const categories = await listQuestionBankCategories(purpose);
    console.log(`Read-only ${purpose} catalogue/folders/category-count paths passed (${page.total} unfiled banks; ${folders.length} folders; ${categories.length} categories).`);
  }
} finally { await prisma.$disconnect(); }

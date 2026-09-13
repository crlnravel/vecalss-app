import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isQuestionBankMateri,
  normalizeQuestionBankMateri,
  questionBankMateriOptions,
  QUESTION_BANK_MATERI_OPTIONS,
} from "../lib/question-bank/materi";

const materiDigestMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260913100000_fix_question_revision_materi_digest/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

assert.match(materiDigestMigration, /question-revision-digest-v2/u);
assert.match(
  materiDigestMigration,
  /NEW\.difficulty::text[\s\S]*NEW\.materi[\s\S]*NEW\.explanation/u,
  "the database readiness digest must include Materi in the same position as the application digest",
);
assert.match(
  materiDigestMigration,
  /NEW\.materi IS DISTINCT FROM OLD\.materi/u,
  "Ready QuestionRevision Materi must be immutable",
);

const expectedCounts = {
  LBE: 15,
  LBI: 15,
  PBM: 14,
  PK: 15,
  PM: 15,
  PPU: 15,
  PU: 15,
} as const;

for (const [subjectCode, count] of Object.entries(expectedCounts)) {
  const options = questionBankMateriOptions(subjectCode);
  assert.equal(options.length, count, `${subjectCode} Materi option count`);
  assert.equal(new Set(options).size, options.length, `${subjectCode} Materi options must be unique`);
  assert.deepEqual(options, QUESTION_BANK_MATERI_OPTIONS[subjectCode as keyof typeof QUESTION_BANK_MATERI_OPTIONS]);
}

assert.equal(
  questionBankMateriOptions("PU")[0],
  "Deret Angka & Pola Bilangan",
);
assert.equal(
  questionBankMateriOptions("LBE").at(-1),
  "Comparing Two Passages",
);
assert.equal(
  questionBankMateriOptions("unknown").length,
  0,
  "unknown subjects do not receive another subject's Materi options",
);
assert.equal(
  isQuestionBankMateri("PU", "Deret Angka & Pola Bilangan"),
  true,
);
assert.equal(isQuestionBankMateri("PU", "Vocabulary in Context"), false);
assert.equal(isQuestionBankMateri("PU", "  "), true);
assert.equal(
  normalizeQuestionBankMateri("PU", "  Deret Angka & Pola Bilangan  "),
  "Deret Angka & Pola Bilangan",
);
assert.equal(normalizeQuestionBankMateri("PU", "not a Materi"), null);

console.log("Question-bank Materi taxonomy contracts passed.");

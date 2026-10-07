import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [bankBoundary, quizBoundary] = await Promise.all([
  readFile(new URL("../app/mentor/quiz/question-bank/error.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/quiz/error.tsx", import.meta.url), "utf8"),
]);
assert.match(bankBoundary, /^"use client"/u, "Bank Soal must have its own client error boundary");
assert.match(bankBoundary, /Bank Soal belum dapat dimuat/u);
assert.match(bankBoundary, /onClick=\{reset\}/u, "retry must use the framework reset action");
assert.match(bankBoundary, /searchParams\.getAll\("purpose"\)/u);
assert.match(bankBoundary, /purposes\.length === 1 && isQuestionBankPurpose\(purposes\[0\]\)/u, "only one valid purpose may select a recovery destination");
assert.match(bankBoundary, /purpose \? \[purpose\] : \["quiz", "tryout"\]/u, "missing or ambiguous context must offer both Bank Soal workspaces");
assert.match(bankBoundary, /href=\{`\/mentor\/quiz\/question-bank\?purpose=\$\{bankPurpose\}`\}/u);
assert.match(bankBoundary, /<Suspense fallback=\{<QuestionBankRecovery reset=\{reset\} \/>\}>/u, "recovery remains available while purpose context suspends");
assert.doesNotMatch(bankBoundary, /href="\/mentor\/quiz"|Kembali ke daftar kuis/u);
assert.match(quizBoundary, /Kuis belum dapat dimuat/u);
assert.match(quizBoundary, /href="\/mentor\/quiz"/u, "Kuis retains its own recovery destination");
console.log("Bank Soal error recovery contract passed.");

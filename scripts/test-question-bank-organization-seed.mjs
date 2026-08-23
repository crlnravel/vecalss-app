import assert from "node:assert/strict";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_FOLDERS,
  categoryNamesForQuestionBank,
  folderKeyForQuestionBank,
  normalizeClassificationText,
} from "../prisma/question-bank-organization-seed.mjs";

assert.deepEqual(DEFAULT_FOLDERS.map(({ name }) => name), ["UTBK", "Latihan", "Bank Umum"]);
assert.deepEqual(DEFAULT_CATEGORIES.map(({ name }) => name), ["UTBK", "Evaluasi", "Latihan", "Campuran"]);
assert.equal(normalizeClassificationText("  Bank Soal UTBK  "), "bank soal utbk");
const assessmentBank = {
  code: "seed:assessment:mixed-subject-bank:v1",
  name: "Bank Soal Evaluasi UTBK",
  description: "Kumpulan soal yang telah ditinjau untuk latihan, penyusunan paket, dan simulasi tujuh subtes UTBK.",
};
assert.equal(folderKeyForQuestionBank(assessmentBank), "utbk");
assert.equal(folderKeyForQuestionBank({ code: "latihan:pu:v1", name: "Latihan Penalaran Umum" }), "latihan");
assert.equal(folderKeyForQuestionBank({ code: "bank:umum:v1", name: "Bank Campuran" }), "umum");
assert.deepEqual(categoryNamesForQuestionBank(assessmentBank), ["UTBK", "Evaluasi", "Latihan"]);
assert.deepEqual(categoryNamesForQuestionBank({ code: "bank:umum:v1", name: "Bank Campuran" }), ["Campuran"]);

console.log("Question-bank organization seed contract passed.");

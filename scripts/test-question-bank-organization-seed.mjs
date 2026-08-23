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
assert.equal(folderKeyForQuestionBank({ code: "seed:assessment:mixed-subject-bank:v1", name: "Bank Soal Evaluasi UTBK" }), "utbk");
assert.equal(folderKeyForQuestionBank({ code: "latihan:pu:v1", name: "Latihan Penalaran Umum" }), "latihan");
assert.equal(folderKeyForQuestionBank({ code: "bank:umum:v1", name: "Bank Campuran" }), "umum");
assert.deepEqual(categoryNamesForQuestionBank({ code: "seed:assessment:mixed-subject-bank:v1", name: "Bank Soal Evaluasi UTBK" }), ["UTBK", "Evaluasi"]);
assert.deepEqual(categoryNamesForQuestionBank({ code: "bank:umum:v1", name: "Bank Campuran" }), ["Campuran"]);

console.log("Question-bank organization seed contract passed.");

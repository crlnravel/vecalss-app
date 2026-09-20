import assert from "node:assert/strict";

import {
  QUESTION_BANK_CSV_HEADER,
  QUESTION_BANK_CSV_MAX_BYTES,
  QUESTION_BANK_CSV_MAX_ROWS,
  decodeSpreadsheetFormula,
  encodeSpreadsheetFormula,
  parseQuestionBankCsv,
  serializeQuestionBankCsv,
  toQuestionBankCsvDraftPayload,
} from "../lib/question-bank/csv";

const id = "11111111-1111-4111-8111-111111111111";
const promptMedia = "22222222-2222-4222-8222-222222222222";

function row(questionId = id) {
  return [
    questionId,
    "PU",
    "Deret Angka & Pola Bilangan",
    "easy",
    "single_choice",
    "'=SUM(A1)",
    promptMedia,
    "Satu",
    "",
    "Dua, dengan koma",
    "",
    'Tiga "kutip"',
    "",
    "",
    "",
    "",
    "",
    "B",
    "Penjelasan\nbaris dua",
    "",
  ];
}

function csv(rows: string[][], ending = "\r\n") {
  return `${QUESTION_BANK_CSV_HEADER.join(",")}${ending}${rows.map((values) => values.map((value) => {
    if (/[",\n]/u.test(value)) return `"${value.replace(/"/gu, '""')}"`;
    return value;
  }).join(",")).join(ending)}${ending}`;
}

const parsed = parseQuestionBankCsv(csv([row()]));
assert.equal(parsed.structuralErrors.length, 0);
assert.equal(parsed.rowErrors.length, 0);
assert.equal(parsed.summary.acceptedRows, 1);
assert.equal(parsed.normalizedRows[0]?.prompt, "=SUM(A1)");
assert.equal(parsed.normalizedRows[0]?.options[1]?.content, "Dua, dengan koma");
assert.equal(parsed.normalizedRows[0]?.options[2]?.content, 'Tiga "kutip"');
assert.equal(parsed.normalizedRows[0]?.explanation, "Penjelasan\nbaris dua");
const draft = toQuestionBankCsvDraftPayload(parsed, "bank-fixture");
assert.equal(draft.questions.length, 1);
assert.equal(draft.questions[0]?.bankId, "bank-fixture");
assert.equal(draft.questions[0]?.choices[0]?.id, "csv-row-1-A");
assert.equal(draft.questions[0]?.correctChoiceId, "csv-row-1-B");
assert.deepEqual(draft.summary, parsed.summary);

const roundTrip = serializeQuestionBankCsv(parsed.normalizedRows);
assert.equal(roundTrip, csv([row()]));
assert.equal(roundTrip, serializeQuestionBankCsv(parseQuestionBankCsv(roundTrip).normalizedRows));
const bomBytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(roundTrip)]);
assert.equal(parseQuestionBankCsv(bomBytes).summary.acceptedRows, 1);

const invalidHeaders = [
  QUESTION_BANK_CSV_HEADER.map((name, index) => index === 0 ? "unknown" : name),
  QUESTION_BANK_CSV_HEADER.map((name, index) => index === 0 ? QUESTION_BANK_CSV_HEADER[1] : name),
  [...QUESTION_BANK_CSV_HEADER].reverse(),
];
for (const header of invalidHeaders) {
  assert.equal(parseQuestionBankCsv(csv([row()], "\r\n").replace(QUESTION_BANK_CSV_HEADER.join(","), header.join(","))).structuralErrors[0]?.code, "header_invalid");
}

for (const value of ["'hello", "=A1", "+A1", "-12", "@user", "\tlead", "\nlead", "plain"]) {
  assert.equal(decodeSpreadsheetFormula(encodeSpreadsheetFormula(value)), value.replace(/\r\n?/gu, "\n"));
}
assert.equal(decodeSpreadsheetFormula("'ordinary"), "'ordinary");

const invalidUtf8 = parseQuestionBankCsv(new Uint8Array([0xff, 0xfe]));
assert.equal(invalidUtf8.structuralErrors[0]?.code, "invalid_utf8");

const malformed = parseQuestionBankCsv(`${QUESTION_BANK_CSV_HEADER.join(",")}\r\n"unterminated`);
assert.equal(malformed.structuralErrors[0]?.code, "malformed_quotes");
const forbiddenControl = row();
forbiddenControl[5] = "has\u0000nul";
assert.ok(parseQuestionBankCsv(csv([forbiddenControl])).rowErrors.some((error) => error.code === "control_character"));
const allowedTab = row();
allowedTab[5] = "\tleading tab";
assert.equal(parseQuestionBankCsv(csv([allowedTab])).summary.acceptedRows, 1);

const rowWithErrors = row();
rowWithErrors[1] = "BAD";
rowWithErrors[7] = "";
rowWithErrors[17] = "A|A";
const invalidRow = parseQuestionBankCsv(csv([rowWithErrors]));
assert.equal(invalidRow.structuralErrors.length, 0);
assert.ok(invalidRow.rowErrors.some((error) => error.code === "invalid_subject_code"));
assert.ok(invalidRow.rowErrors.some((error) => error.code === "option_sequence_invalid"));
assert.ok(invalidRow.rowErrors.some((error) => error.code === "invalid_correct_options"));

const rows500 = Array.from({ length: QUESTION_BANK_CSV_MAX_ROWS }, (_, index) => row(`${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`));
assert.equal(parseQuestionBankCsv(csv(rows500)).summary.acceptedRows, QUESTION_BANK_CSV_MAX_ROWS);
const rows501 = [...rows500, row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")];
assert.equal(parseQuestionBankCsv(csv(rows501)).structuralErrors[0]?.code, "row_limit_exceeded");
assert.equal(parseQuestionBankCsv(QUESTION_BANK_CSV_HEADER.join(",") + "\r\n").structuralErrors[0]?.code, "header_only");

const oversized = new Uint8Array(QUESTION_BANK_CSV_MAX_BYTES + 1);
assert.equal(parseQuestionBankCsv(oversized).structuralErrors[0]?.code, "csv_too_large");

console.log("Question Bank CSV pure contract passed.");

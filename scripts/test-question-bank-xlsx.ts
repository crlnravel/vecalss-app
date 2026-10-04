import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseQuestionBankXlsxWorkbook } from "../lib/question-bank/xlsx";

async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("PU");
  sheet.addRow(["No Soal", "Materi", "Level", "Pertanyaan / Soal", "Opsi A", "Opsi B", "Kunci Jawaban", "Pembahasan"]);
  sheet.addRow(["PU-M01-001", "Deret Angka & Pola Bilangan", "Mudah", "Berapa suku berikutnya?", { richText: [{ text: "A. " }, { text: "12", font: { bold: true } }] }, "B. 14", "A", "Tambahkan dua."]);
  const result = await parseQuestionBankXlsxWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(result.issues, [], "formatted option text should remain importable");
  assert.equal(result.normalizedRows[0]?.options[0]?.content, "12");
  assert.equal(result.summary.acceptedRows, 1);
  assert.ok(result.manifest);
  console.log("Question-bank XLSX regression passed.");
}

void main();

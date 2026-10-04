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
  const fraction = sheet.addRow(["PU-M01-002", "Deret Angka & Pola Bilangan", "Mudah", "Pilih pecahan.", new Date("2026-03-05T00:00:00Z"), "1/2", "A", "Nilainya 3/5."]);
  fraction.getCell(5).numFmt = "d/m";
  const fractionResult = await parseQuestionBankXlsxWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(fractionResult.issues, [], "Excel-converted fraction options should be restored");
  assert.equal(fractionResult.normalizedRows[1]?.options[0]?.content, "3/5");
  const time = sheet.addRow(["PU-M01-003", "Deret Angka & Pola Bilangan", "Mudah", "Pilih waktunya.", new Date("1899-12-30T07:45:00Z"), "08:15", "A", "Waktunya 07:45."]);
  time.getCell(5).numFmt = "hh:mm";
  const history = workbook.addWorksheet("PPU");
  history.addRow(sheet.getRow(1).values as ExcelJS.CellValue[]);
  const date = history.addRow(["PPU-M12-001", "Pengetahuan Sejarah & Kewarganegaraan", "Mudah", "Pilih tanggalnya.", new Date("1945-11-10T00:00:00Z"), "1 Juni 1945", "A", "10 November 1945."]);
  date.getCell(5).numFmt = "d mmmm yyyy";
  const datesResult = await parseQuestionBankXlsxWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(datesResult.issues, []);
  assert.equal(datesResult.normalizedRows[2]?.options[0]?.content, "07:45");
  assert.equal(datesResult.normalizedRows[3]?.options[0]?.content, "10 November 1945");
  console.log("Question-bank XLSX regression passed.");
}

void main();

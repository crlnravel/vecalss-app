import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import sharp from "sharp";
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
  const tuple = sheet.addRow(["PU-M01-004", "Deret Angka & Pola Bilangan", "Mudah", "Pilih tiga bilangannya.", new Date("2006-03-04T00:00:00Z"), "5, 12, 13", "A", "3, 4, 6."]);
  tuple.getCell(5).numFmt = "m, d, yyyy";
  const tupleResult = await parseQuestionBankXlsxWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(tupleResult.issues, [], "Excel-converted comma-separated math options should be restored");
  assert.equal(tupleResult.normalizedRows[3]?.options[0]?.content, "3, 4, 6");
  tuple.getCell(4).value = new Date("2026-03-05T00:00:00Z");
  tuple.getCell(4).numFmt = "m/d";
  tuple.getCell(8).value = new Date("2006-03-04T00:00:00Z");
  tuple.getCell(8).numFmt = "m, d, yy";
  const bodyDates = await parseQuestionBankXlsxWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));
  for (const field of ["prompt", "explanation"]) {
    assert.ok(bodyDates.issues.some((issue) => issue.code === "xlsx_cell_value_invalid" && issue.field === field), "math date recovery must be limited to answer options");
  }
  assert.equal(bodyDates.manifest, null);

  const pbm = new ExcelJS.Workbook();
  const pbmSheet = pbm.addWorksheet("PBM");
  pbmSheet.addRow(sheet.getRow(1).values as ExcelJS.CellValue[]);
  pbmSheet.addRow(["PBM-04-R-01", "Makna & Relas Makna", "Mudah", "Pilih makna katanya.", "leksikal", "gramatikal", "A", "Makna kamus."]);
  pbmSheet.addRow(["PBM-04-S-16", "Makna & Relasi Makna", "Sedang", "Pilih makna katanya.", "leksikal", "gramatikal", "A", "Makna kamus."]);
  pbmSheet.addRow(["", "", "", "Pertanyaan/Soal", "Opsi A", "Opsi B", "Kunci Jawaban", "Pembahasan"]);
  const aliasResult = await parseQuestionBankXlsxWorkbook(new Uint8Array(await pbm.xlsx.writeBuffer()));
  assert.deepEqual(aliasResult.issues, [], "known topic aliases and repeated table headings should import");
  assert.equal(aliasResult.normalizedRows[0]?.materi, "Semantik: Makna dan Relasi Makna");
  assert.equal(aliasResult.summary.acceptedRows, 2);

  const illustrated = new ExcelJS.Workbook();
  const illustratedSheet = illustrated.addWorksheet("LBI");
  illustratedSheet.addRow(["No Soal", "Materi", "Level", "", "Pertanyaan / Soal", "Opsi A", "Opsi B", "Kunci Jawaban", "Pembahasan"]);
  illustratedSheet.addRow(["LBI-15-R-01", "Teks Multimodal (Data & Grafik)", "Ringan", "", "Bacalah gambar ini.", "Satu", "Dua", "A", "Ada satu."]);
  const imageBytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  const imageId = illustrated.addImage({ base64: imageBytes.toString("base64"), extension: "png" });
  illustratedSheet.addImage(imageId, { tl: { col: 3, row: 1 }, ext: { width: 20, height: 20 } });
  const imageResult = await parseQuestionBankXlsxWorkbook(new Uint8Array(await illustrated.xlsx.writeBuffer()));
  assert.deepEqual(imageResult.issues, [], "images in a blank column beside the prompt should import");
  assert.equal(imageResult.summary.imagePlacementCount, 1);
  assert.equal(imageResult.manifest?.imageSlots[0]?.field, "prompt_image");
  // Formulas, unknown topics, and incomplete questions must still block import.
  pbmSheet.getCell("B2").value = "Topik yang tidak dikenal";
  const unknownTopic = await parseQuestionBankXlsxWorkbook(new Uint8Array(await pbm.xlsx.writeBuffer()));
  assert.ok(unknownTopic.issues.some((issue) => issue.code === "xlsx_invalid_materi"));
  assert.equal(unknownTopic.manifest, null);
  pbmSheet.getCell("B2").value = "Makna & Relas Makna";
  pbmSheet.getCell("D2").value = { formula: '"Pilih makna katanya."', result: "Pilih makna katanya." };
  const formula = await parseQuestionBankXlsxWorkbook(new Uint8Array(await pbm.xlsx.writeBuffer()));
  assert.ok(formula.issues.some((issue) => issue.code === "xlsx_formula_disallowed"));
  assert.equal(formula.manifest, null);
  pbmSheet.getCell("D2").value = "Pertanyaan/Soal";
  pbmSheet.getCell("G2").value = "";
  const incomplete = await parseQuestionBankXlsxWorkbook(new Uint8Array(await pbm.xlsx.writeBuffer()));
  assert.ok(incomplete.issues.some((issue) => issue.code === "xlsx_invalid_correct_options"));
  assert.equal(incomplete.manifest, null);
  console.log("Question-bank XLSX regression passed.");
}

void main();

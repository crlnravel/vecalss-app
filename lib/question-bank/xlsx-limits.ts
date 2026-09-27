const MIB = 1024 * 1024;

const QUESTION_BANK_XLSX_LIMITS = Object.freeze({
  completedAttemptRetentionMs: 24 * 60 * 60 * 1_000,
  dataRows: 1_000,
  externalImageUrls: 250,
  imageBytes: 15 * MIB,
  imageMaxDimension: 12_000,
  imagePixelCount: 40_000_000,
  imagePlacements: 1_000,
  imageUrlMaxChars: 4_096,
  maxConcurrentImageOperations: 8,
  maxRedirects: 3,
  physicalWorksheetRows: 10_000,
  worksheetColumns: 64,
  worksheets: 64,
  multipartPartBytes: 8 * MIB,
  operationLeaseMs: 6 * 60 * 1_000,
  previewExpiresMs: 15 * 60 * 1_000,
  thumbnailBytes: 128 * 1024,
  thumbnailHeight: 360,
  thumbnailPageSize: 20,
  thumbnailWidth: 480,
  totalExpandedZipBytes: 96 * MIB,
  totalRawImageSourceBytes: 32 * MIB,
  totalUniqueImageBytes: 32 * MIB,
  uploadGrantExpiresSeconds: 60 * 60,
  workbookBytes: 24 * MIB,
  xmlPartBytes: 12 * MIB,
  zipEntries: 2_000,
  zipEntryCompressionRatio: 200,
  zipImagePayloads: 500,
  zipImagePartBytes: 15 * MIB,
  urlFetchBudgetMs: 45_000,
  urlRequestTimeoutMs: 8_000,
});

const QUESTION_BANK_XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export { QUESTION_BANK_XLSX_LIMITS, QUESTION_BANK_XLSX_MIME_TYPE };

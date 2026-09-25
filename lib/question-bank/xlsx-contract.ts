import type {
  QuestionBankCsvRow,
  QuestionBankCsvSummary,
} from "@/lib/question-bank/csv";

type QuestionBankXlsxIssue = {
  code: string;
  field?: string;
  kind: "row" | "structural";
  reason?: string;
  row?: number;
};

type QuestionBankXlsxImagePlacement = {
  field: string;
  row: number;
};

type QuestionBankXlsxPreviewImageIndex = {
  contentSha256: string;
  height: number;
  mimeType: string;
  objectKey: string;
  placements: QuestionBankXlsxImagePlacement[];
  sizeBytes: number;
  width: number;
};

type QuestionBankXlsxPreviewImagePayload = QuestionBankXlsxPreviewImageIndex & {
  bytes: Uint8Array;
  sourceUrlFingerprints: string[];
};

type QuestionBankXlsxPreviewImageSlot = QuestionBankXlsxImagePlacement & {
  contentSha256: string;
};

type QuestionBankXlsxPreviewManifest = {
  imageSlots: QuestionBankXlsxPreviewImageSlot[];
  images: Array<QuestionBankXlsxPreviewImageIndex & { sourceUrlFingerprints: string[] }>;
  normalizedRows: QuestionBankCsvRow[];
  schemaVersion: 1;
  summary: QuestionBankXlsxPreviewSummary;
};

type QuestionBankXlsxPreviewSummary = QuestionBankCsvSummary & {
  externalImageUrlCount: number;
  imageCount: number;
  imagePlacementCount: number;
};

type QuestionBankXlsxThumbnail = QuestionBankXlsxPreviewImageIndex & {
  thumbnailBase64: string;
};

export type {
  QuestionBankXlsxImagePlacement,
  QuestionBankXlsxIssue,
  QuestionBankXlsxPreviewImageIndex,
  QuestionBankXlsxPreviewImagePayload,
  QuestionBankXlsxPreviewImageSlot,
  QuestionBankXlsxPreviewManifest,
  QuestionBankXlsxPreviewSummary,
  QuestionBankXlsxThumbnail,
};

import { isQuestionBankMateri } from "@/lib/question-bank/materi";

const QUESTION_BANK_CSV_HEADER = [
  "question_id",
  "subject_code",
  "materi",
  "difficulty",
  "question_type",
  "prompt",
  "prompt_media_asset_id",
  "option_a",
  "option_a_media_asset_id",
  "option_b",
  "option_b_media_asset_id",
  "option_c",
  "option_c_media_asset_id",
  "option_d",
  "option_d_media_asset_id",
  "option_e",
  "option_e_media_asset_id",
  "correct_options",
  "explanation",
  "explanation_media_asset_id",
] as const;

const QUESTION_BANK_CSV_MAX_BYTES = 2 * 1024 * 1024;
const QUESTION_BANK_CSV_MAX_ROWS = 500;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SUBJECT_CODES = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const QUESTION_TYPES = ["single_choice", "multiple_choice"] as const;
const FORMULA_PREFIXES = new Set(["'", "=", "+", "-", "@", "\t", "\r", "\n"]);

type QuestionBankCsvStructuralCode =
  | "csv_too_large"
  | "empty_file"
  | "header_only"
  | "header_invalid"
  | "invalid_record_ending"
  | "invalid_utf8"
  | "malformed_quotes"
  | "row_limit_exceeded"
  | "row_width_invalid";

type QuestionBankCsvRowCode =
  | "control_character"
  | "field_too_long"
  | "invalid_correct_options"
  | "invalid_difficulty"
  | "invalid_materi"
  | "invalid_media_asset_id"
  | "invalid_question_id"
  | "invalid_question_type"
  | "invalid_subject_code"
  | "option_sequence_invalid"
  | "required_field";

type QuestionBankCsvIssue = {
  code: QuestionBankCsvStructuralCode | QuestionBankCsvRowCode;
  column?: string;
  kind: "row" | "structural";
  reason?: "duplicate" | "missing" | "reordered" | "unknown";
  row?: number;
};

type QuestionBankCsvOption = {
  assetId: string | null;
  content: string;
  isCorrect: boolean;
  label: "A" | "B" | "C" | "D" | "E";
  sortOrder: number;
};

type QuestionBankCsvRow = {
  correctOptions: string[];
  difficulty: (typeof DIFFICULTIES)[number];
  explanation: string | null;
  explanationMediaAssetId: string | null;
  materi: string | null;
  optionA: string;
  optionAMediaAssetId: string | null;
  optionB: string;
  optionBMediaAssetId: string | null;
  optionC: string;
  optionCMediaAssetId: string | null;
  optionD: string;
  optionDMediaAssetId: string | null;
  optionE: string;
  optionEMediaAssetId: string | null;
  options: QuestionBankCsvOption[];
  prompt: string;
  promptMediaAssetId: string | null;
  questionId: string | null;
  questionType: (typeof QUESTION_TYPES)[number];
  subjectCode: (typeof SUBJECT_CODES)[number];
};

type QuestionBankCsvSummary = {
  acceptedRows: number;
  dataRowCount: number;
  rejectedRows: number;
  structuralErrorCount: number;
  rowErrorCount: number;
};

type QuestionBankCsvParseResult = {
  byteLength: number;
  normalizedRows: QuestionBankCsvRow[];
  rowErrors: QuestionBankCsvIssue[];
  structuralErrors: QuestionBankCsvIssue[];
  summary: QuestionBankCsvSummary;
};

type QuestionBankCsvSerializableRow = {
  correctOptions?: readonly string[];
  difficulty: string;
  explanation?: string | null;
  explanationMediaAssetId?: string | null;
  materi?: string | null;
  options?: readonly QuestionBankCsvOption[];
  optionA?: string;
  optionAMediaAssetId?: string | null;
  optionB?: string;
  optionBMediaAssetId?: string | null;
  optionC?: string;
  optionCMediaAssetId?: string | null;
  optionD?: string;
  optionDMediaAssetId?: string | null;
  optionE?: string;
  optionEMediaAssetId?: string | null;
  prompt: string;
  promptMediaAssetId?: string | null;
  questionId?: string | null;
  questionType: string;
  subjectCode: string;
};

type QuestionBankCsvDraftChoice = {
  id: string;
  mediaAssetId?: string;
  text: string;
};

type QuestionBankCsvDraftQuestion = {
  bankId: string;
  choices: QuestionBankCsvDraftChoice[];
  correctChoiceId: string;
  correctChoiceIds: string[];
  difficulty: (typeof DIFFICULTIES)[number];
  explanation: string;
  explanationMediaAssetId?: string;
  id: string;
  materi?: string;
  prompt: string;
  promptMediaAssetId?: string;
  questionType: (typeof QUESTION_TYPES)[number];
  subjectCode: (typeof SUBJECT_CODES)[number];
  tags: string[];
};

type QuestionBankCsvDraftPayload = {
  questions: QuestionBankCsvDraftQuestion[];
  summary: QuestionBankCsvSummary;
};

function normalizeNewlines(value: string) {
  return value.replace(/\r\n?/gu, "\n");
}

function encodeSpreadsheetFormula(value: string) {
  const normalized = normalizeNewlines(value);
  return normalized && FORMULA_PREFIXES.has(normalized[0]!)
    ? `'${normalized}`
    : normalized;
}

function decodeSpreadsheetFormula(value: string) {
  const normalized = normalizeNewlines(value);
  return normalized.length >= 2
    && normalized[0] === "'"
    && FORMULA_PREFIXES.has(normalized[1]!)
    ? normalized.slice(1)
    : normalized;
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function issue(
  kind: QuestionBankCsvIssue["kind"],
  code: QuestionBankCsvIssue["code"],
  row?: number,
  column?: string,
): QuestionBankCsvIssue {
  return { code, column, kind, row };
}

function parseCsvRecords(text: string) {
  const records: string[][] = [];
  const structuralErrors: QuestionBankCsvIssue[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  let afterClosingQuote = false;
  let recordNumber = 1;

  const pushField = () => {
    fields.push(field);
    field = "";
    fieldStarted = false;
    afterClosingQuote = false;
  };

  const endRecord = () => {
    pushField();
    records.push(fields);
    fields = [];
    recordNumber += 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    const next = text[index + 1];

    if (inQuotes) {
      if (character === '"') {
        if (next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
        }
      } else if (character === "\n") {
        field += "\n";
      } else if (character === "\r") {
        if (next !== "\n") {
          structuralErrors.push(issue("structural", "invalid_record_ending", recordNumber));
          return { records: [], structuralErrors };
        }
        field += "\n";
        index += 1;
      } else {
        field += character;
      }
      continue;
    }

    if (afterClosingQuote) {
      if (character === ",") {
        pushField();
      } else if (character === "\n") {
        endRecord();
      } else if (character === "\r") {
        if (next !== "\n") {
          structuralErrors.push(issue("structural", "invalid_record_ending", recordNumber));
          return { records: [], structuralErrors };
        }
        endRecord();
        index += 1;
      } else {
        structuralErrors.push(issue("structural", "malformed_quotes", recordNumber));
        return { records: [], structuralErrors };
      }
      continue;
    }

    if (character === '"') {
      if (fieldStarted) {
        structuralErrors.push(issue("structural", "malformed_quotes", recordNumber));
        return { records: [], structuralErrors };
      }
      inQuotes = true;
      fieldStarted = true;
    } else if (character === ",") {
      pushField();
    } else if (character === "\n") {
      endRecord();
    } else if (character === "\r") {
      if (next !== "\n") {
        structuralErrors.push(issue("structural", "invalid_record_ending", recordNumber));
        return { records: [], structuralErrors };
      }
      endRecord();
      index += 1;
    } else {
      field += character;
      fieldStarted = true;
    }
  }

  if (inQuotes) {
    structuralErrors.push(issue("structural", "malformed_quotes", recordNumber));
    return { records: [], structuralErrors };
  }

  if (fields.length || field.length || fieldStarted || afterClosingQuote) {
    pushField();
    records.push(fields);
  }

  return { records, structuralErrors };
}

function decodeCsvInput(input: Uint8Array | ArrayBuffer | string) {
  if (typeof input === "string") {
    const text = input.startsWith("\uFEFF") ? input.slice(1) : input;
    const bytes = new TextEncoder().encode(input);
    return { bytes, text };
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const payload = hasBom ? bytes.subarray(3) : bytes;
  try {
    return {
      bytes,
      text: new TextDecoder("utf-8", { fatal: true }).decode(payload),
    };
  } catch {
    return { bytes, text: null };
  }
}

function validateHeader(header: readonly string[]) {
  if (header.length !== QUESTION_BANK_CSV_HEADER.length) {
    return issue("structural", "header_invalid");
  }
  const expected = [...QUESTION_BANK_CSV_HEADER];
  const expectedSet = new Set<string>(expected);
  const headerSet = new Set(header);
  const seen = new Set<string>();
  const reason = header.some((name) => {
    if (seen.has(name)) return true;
    seen.add(name);
    return false;
  })
    ? "duplicate"
    : header.some((name) => !expectedSet.has(name))
      ? "unknown"
      : expected.some((name) => !headerSet.has(name))
        ? "missing"
        : header.some((name, index) => name !== expected[index])
          ? "reordered"
          : null;
  if (reason) return { ...issue("structural", "header_invalid"), reason: reason as NonNullable<QuestionBankCsvIssue["reason"]> };
  return null;
}

function hasForbiddenControl(value: string) {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function codePointLength(value: string) {
  return [...value].length;
}

function normalizeOptionalMediaId(value: string, row: number, column: string, errors: QuestionBankCsvIssue[]) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!isUuid(normalized)) errors.push(issue("row", "invalid_media_asset_id", row, column));
  return normalized.toLowerCase();
}

function validateRow(
  values: readonly string[],
  rowNumber: number,
  decodeCsvSpreadsheetEscapes = true,
): { errors: QuestionBankCsvIssue[]; row: QuestionBankCsvRow | null } {
  const errors: QuestionBankCsvIssue[] = [];
  const raw = Object.fromEntries(QUESTION_BANK_CSV_HEADER.map((header, index) => [header, values[index] ?? ""]));
  for (const column of QUESTION_BANK_CSV_HEADER) {
    const value = raw[column]!;
    if (hasForbiddenControl(value)) errors.push(issue("row", "control_character", rowNumber, column));
  }

  const questionId = raw.question_id!.trim();
  if (questionId && !isUuid(questionId)) errors.push(issue("row", "invalid_question_id", rowNumber, "question_id"));
  const subjectCode = raw.subject_code!.trim();
  if (!(SUBJECT_CODES as readonly string[]).includes(subjectCode)) errors.push(issue("row", "invalid_subject_code", rowNumber, "subject_code"));
  const decodeValue = (value: string) => decodeCsvSpreadsheetEscapes
    ? decodeSpreadsheetFormula(value)
    : normalizeNewlines(value);
  const materi = decodeValue(raw.materi!).trim() || null;
  if (materi && codePointLength(materi) > 200) errors.push(issue("row", "field_too_long", rowNumber, "materi"));
  if (subjectCode && !(SUBJECT_CODES as readonly string[]).includes(subjectCode)) {
    // The subject error above is the stable public result; taxonomy validation
    // is intentionally skipped until the subject itself is known.
  } else if (!isQuestionBankMateri(subjectCode, materi)) {
    errors.push(issue("row", "invalid_materi", rowNumber, "materi"));
  }

  const difficulty = raw.difficulty!.trim();
  if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) errors.push(issue("row", "invalid_difficulty", rowNumber, "difficulty"));
  const questionType = raw.question_type!.trim();
  if (!(QUESTION_TYPES as readonly string[]).includes(questionType)) errors.push(issue("row", "invalid_question_type", rowNumber, "question_type"));

  const prompt = decodeValue(raw.prompt!);
  if (!prompt.trim()) errors.push(issue("row", "required_field", rowNumber, "prompt"));
  if (codePointLength(prompt) > 20_000) errors.push(issue("row", "field_too_long", rowNumber, "prompt"));

  const optionsRaw = [
    ["A", decodeValue(raw.option_a!), raw.option_a_media_asset_id!] as const,
    ["B", decodeValue(raw.option_b!), raw.option_b_media_asset_id!] as const,
    ["C", decodeValue(raw.option_c!), raw.option_c_media_asset_id!] as const,
    ["D", decodeValue(raw.option_d!), raw.option_d_media_asset_id!] as const,
    ["E", decodeValue(raw.option_e!), raw.option_e_media_asset_id!] as const,
  ];
  const firstEmptyOption = optionsRaw.findIndex(([, content]) => !content.trim());
  if (firstEmptyOption >= 0 && firstEmptyOption < 2) {
    errors.push(issue("row", "option_sequence_invalid", rowNumber));
  } else if (firstEmptyOption >= 0 && optionsRaw.slice(firstEmptyOption + 1).some(([, content]) => content.trim())) {
    errors.push(issue("row", "option_sequence_invalid", rowNumber));
  }
  for (const [label, content] of optionsRaw) {
    if (codePointLength(content) > 6_000) errors.push(issue("row", "field_too_long", rowNumber, `option_${label.toLowerCase()}`));
  }
  const optionCount = optionsRaw.filter(([, content]) => content.trim()).length;

  const correctOptions = raw.correct_options!.trim().split("|").map((token) => token.trim().toUpperCase());
  const correctOptionSet = new Set(correctOptions);
  if (!raw.correct_options!.trim()
    || correctOptions.some((token) => !/^[A-E]$/u.test(token))
    || new Set(correctOptions).size !== correctOptions.length
    || correctOptions.some((token) => !optionsRaw.slice(0, optionCount).some(([label]) => label === token))
    || (questionType === "single_choice" && correctOptions.length !== 1)
    || (questionType === "multiple_choice" && correctOptions.length < 1)) {
    errors.push(issue("row", "invalid_correct_options", rowNumber, "correct_options"));
  }

  const explanation = decodeValue(raw.explanation!);
  if (codePointLength(explanation) > 20_000) errors.push(issue("row", "field_too_long", rowNumber, "explanation"));

  const media = {
    explanationMediaAssetId: normalizeOptionalMediaId(raw.explanation_media_asset_id!, rowNumber, "explanation_media_asset_id", errors),
    promptMediaAssetId: normalizeOptionalMediaId(raw.prompt_media_asset_id!, rowNumber, "prompt_media_asset_id", errors),
    optionAMediaAssetId: normalizeOptionalMediaId(raw.option_a_media_asset_id!, rowNumber, "option_a_media_asset_id", errors),
    optionBMediaAssetId: normalizeOptionalMediaId(raw.option_b_media_asset_id!, rowNumber, "option_b_media_asset_id", errors),
    optionCMediaAssetId: normalizeOptionalMediaId(raw.option_c_media_asset_id!, rowNumber, "option_c_media_asset_id", errors),
    optionDMediaAssetId: normalizeOptionalMediaId(raw.option_d_media_asset_id!, rowNumber, "option_d_media_asset_id", errors),
    optionEMediaAssetId: normalizeOptionalMediaId(raw.option_e_media_asset_id!, rowNumber, "option_e_media_asset_id", errors),
  };

  if (errors.length) return { errors, row: null };
  const normalizedOptions: QuestionBankCsvOption[] = optionsRaw.slice(0, optionCount).map(([label, content], index) => ({
    assetId: media[`option${label}MediaAssetId` as keyof typeof media] ?? null,
    content,
    isCorrect: correctOptionSet.has(label),
    label: label as QuestionBankCsvOption["label"],
    sortOrder: index,
  }));
  const row: QuestionBankCsvRow = {
    correctOptions,
    difficulty: difficulty as QuestionBankCsvRow["difficulty"],
    explanation: explanation.trim() ? explanation : null,
    explanationMediaAssetId: media.explanationMediaAssetId,
    materi,
    optionA: optionsRaw[0]![1],
    optionAMediaAssetId: media.optionAMediaAssetId,
    optionB: optionsRaw[1]![1],
    optionBMediaAssetId: media.optionBMediaAssetId,
    optionC: optionsRaw[2]![1],
    optionCMediaAssetId: media.optionCMediaAssetId,
    optionD: optionsRaw[3]![1],
    optionDMediaAssetId: media.optionDMediaAssetId,
    optionE: optionsRaw[4]![1],
    optionEMediaAssetId: media.optionEMediaAssetId,
    options: normalizedOptions,
    prompt,
    promptMediaAssetId: media.promptMediaAssetId,
    questionId: questionId ? questionId.toLowerCase() : null,
    questionType: questionType as QuestionBankCsvRow["questionType"],
    subjectCode: subjectCode as QuestionBankCsvRow["subjectCode"],
  };
  return { errors, row };
}

function validateQuestionBankCsvRecords(
  records: readonly (readonly string[])[],
  byteLength = 0,
  initialStructuralErrors: readonly QuestionBankCsvIssue[] = [],
  decodeCsvSpreadsheetEscapes = true,
  maxRows = QUESTION_BANK_CSV_MAX_ROWS,
): QuestionBankCsvParseResult {
  const structuralErrors = [...initialStructuralErrors];
  const rowErrors: QuestionBankCsvIssue[] = [];
  if (structuralErrors.length) {
    return {
      byteLength,
      normalizedRows: [],
      rowErrors,
      structuralErrors,
      summary: { acceptedRows: 0, dataRowCount: 0, rejectedRows: 0, rowErrorCount: 0, structuralErrorCount: structuralErrors.length },
    };
  }
  if (!records.length) {
    structuralErrors.push(issue("structural", "empty_file"));
  } else {
    const headerError = validateHeader(records[0]!);
    if (headerError) structuralErrors.push(headerError);
  }

  const dataRecords = records.slice(1);
  if (!dataRecords.length && !structuralErrors.length) structuralErrors.push(issue("structural", "header_only", 1));
  if (dataRecords.length > maxRows) structuralErrors.push(issue("structural", "row_limit_exceeded", maxRows + 2));
  if (structuralErrors.length) {
    return {
      byteLength,
      normalizedRows: [],
      rowErrors,
      structuralErrors,
      summary: { acceptedRows: 0, dataRowCount: dataRecords.length, rejectedRows: dataRecords.length, rowErrorCount: 0, structuralErrorCount: structuralErrors.length },
    };
  }

  const normalizedRows: QuestionBankCsvRow[] = [];
  for (const [index, values] of dataRecords.entries()) {
    const rowNumber = index + 2;
    if (values.length !== QUESTION_BANK_CSV_HEADER.length) {
      structuralErrors.push(issue("structural", "row_width_invalid", rowNumber));
      continue;
    }
    const result = validateRow(values, rowNumber, decodeCsvSpreadsheetEscapes);
    rowErrors.push(...result.errors);
    if (result.row) normalizedRows.push(result.row);
  }
  return {
    byteLength,
    normalizedRows,
    rowErrors,
    structuralErrors,
    summary: {
      acceptedRows: normalizedRows.length,
      dataRowCount: dataRecords.length,
      rejectedRows: dataRecords.length - normalizedRows.length,
      rowErrorCount: rowErrors.length,
      structuralErrorCount: structuralErrors.length,
    },
  };
}

function parseQuestionBankCsv(input: Uint8Array | ArrayBuffer | string): QuestionBankCsvParseResult {
  const decoded = decodeCsvInput(input);
  const byteLength = decoded.bytes.byteLength;
  const structuralErrors: QuestionBankCsvIssue[] = [];
  if (byteLength > QUESTION_BANK_CSV_MAX_BYTES) structuralErrors.push(issue("structural", "csv_too_large"));
  if (decoded.text === null) structuralErrors.push(issue("structural", "invalid_utf8"));
  if (structuralErrors.length) {
    return validateQuestionBankCsvRecords([], byteLength, structuralErrors);
  }

  const parsed = parseCsvRecords(decoded.text!);
  return validateQuestionBankCsvRecords(parsed.records, byteLength, parsed.structuralErrors);
}

function csvCell(value: string | null | undefined, formulaSafe = false) {
  const normalized = formulaSafe ? encodeSpreadsheetFormula(value ?? "") : normalizeNewlines(value ?? "");
  return /[",\n]/u.test(normalized) ? `"${normalized.replace(/"/gu, '""')}"` : normalized;
}

function optionsFromSerializableRow(row: QuestionBankCsvSerializableRow): QuestionBankCsvOption[] {
  if (row.options?.length) return [...row.options].sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));
  const values = [
    ["A", row.optionA ?? "", row.optionAMediaAssetId ?? null],
    ["B", row.optionB ?? "", row.optionBMediaAssetId ?? null],
    ["C", row.optionC ?? "", row.optionCMediaAssetId ?? null],
    ["D", row.optionD ?? "", row.optionDMediaAssetId ?? null],
    ["E", row.optionE ?? "", row.optionEMediaAssetId ?? null],
  ] as const;
  const correctOptions = new Set(row.correctOptions ?? []);
  return values
    .filter(([, content]) => content.trim())
    .map(([label, content, assetId], sortOrder) => ({
      assetId,
      content,
      isCorrect: correctOptions.has(label),
      label: label as QuestionBankCsvOption["label"],
      sortOrder,
    }));
}

function serializeQuestionBankCsv(rows: readonly QuestionBankCsvSerializableRow[]) {
  const lines = [QUESTION_BANK_CSV_HEADER.join(",")];
  for (const row of rows) {
    const options = optionsFromSerializableRow(row);
    const byLabel = new Map(options.map((option) => [option.label, option]));
    const correctOptions = row.correctOptions?.length
      ? [...row.correctOptions].map((label) => label.toUpperCase()).join("|")
      : options.filter((option) => option.isCorrect).map((option) => option.label).join("|");
    lines.push([
      csvCell(row.questionId),
      csvCell(row.subjectCode),
      csvCell(row.materi, true),
      csvCell(row.difficulty),
      csvCell(row.questionType),
      csvCell(row.prompt, true),
      csvCell(row.promptMediaAssetId),
      csvCell(byLabel.get("A")?.content, true),
      csvCell(byLabel.get("A")?.assetId),
      csvCell(byLabel.get("B")?.content, true),
      csvCell(byLabel.get("B")?.assetId),
      csvCell(byLabel.get("C")?.content, true),
      csvCell(byLabel.get("C")?.assetId),
      csvCell(byLabel.get("D")?.content, true),
      csvCell(byLabel.get("D")?.assetId),
      csvCell(byLabel.get("E")?.content, true),
      csvCell(byLabel.get("E")?.assetId),
      csvCell(correctOptions),
      csvCell(row.explanation, true),
      csvCell(row.explanationMediaAssetId),
    ].join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function serializeQuestionBankCsvBytes(rows: readonly QuestionBankCsvSerializableRow[]) {
  return new TextEncoder().encode(serializeQuestionBankCsv(rows));
}

function toQuestionBankCsvDraftPayload(
  parseResult: Pick<QuestionBankCsvParseResult, "normalizedRows" | "summary">,
  bankId: string,
): QuestionBankCsvDraftPayload {
  const questions = parseResult.normalizedRows.map((row, rowIndex) => {
    const choices = row.options.map((option) => ({
      id: `csv-row-${rowIndex + 1}-${option.label}`,
      ...(option.assetId ? { mediaAssetId: option.assetId } : {}),
      text: option.content,
    }));
    const correctChoiceIds = row.correctOptions.map((label) => `csv-row-${rowIndex + 1}-${label}`);
    return {
      bankId,
      choices,
      correctChoiceId: correctChoiceIds[0]!,
      correctChoiceIds,
      difficulty: row.difficulty,
      explanation: row.explanation ?? "",
      ...(row.explanationMediaAssetId ? { explanationMediaAssetId: row.explanationMediaAssetId } : {}),
      id: row.questionId ?? `csv-row-${rowIndex + 1}`,
      ...(row.materi ? { materi: row.materi } : {}),
      prompt: row.prompt,
      ...(row.promptMediaAssetId ? { promptMediaAssetId: row.promptMediaAssetId } : {}),
      questionType: row.questionType,
      subjectCode: row.subjectCode,
      tags: [],
    } satisfies QuestionBankCsvDraftQuestion;
  });
  return { questions, summary: parseResult.summary };
}

const parseBankSoalCsv = parseQuestionBankCsv;
const serializeBankSoalCsv = serializeQuestionBankCsv;
const encodeCsvFormula = encodeSpreadsheetFormula;
const decodeCsvFormula = decodeSpreadsheetFormula;
const createQuestionBankCsvDraftPayload = toQuestionBankCsvDraftPayload;

export {
  QUESTION_BANK_CSV_HEADER,
  QUESTION_BANK_CSV_MAX_BYTES,
  QUESTION_BANK_CSV_MAX_ROWS,
  createQuestionBankCsvDraftPayload,
  decodeCsvFormula,
  decodeSpreadsheetFormula,
  encodeCsvFormula,
  encodeSpreadsheetFormula,
  normalizeNewlines,
  parseBankSoalCsv,
  parseQuestionBankCsv,
  serializeBankSoalCsv,
  serializeQuestionBankCsv,
  serializeQuestionBankCsvBytes,
  toQuestionBankCsvDraftPayload,
  validateQuestionBankCsvRecords,
};

export type {
  QuestionBankCsvDraftChoice,
  QuestionBankCsvDraftPayload,
  QuestionBankCsvDraftQuestion,
  QuestionBankCsvIssue,
  QuestionBankCsvOption,
  QuestionBankCsvParseResult,
  QuestionBankCsvRow,
  QuestionBankCsvRowCode,
  QuestionBankCsvSerializableRow,
  QuestionBankCsvStructuralCode,
  QuestionBankCsvSummary,
};

import { createHash } from "node:crypto";

import { EnrollmentImportRole } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/auth/crypto";

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_DATA_ROWS = 500;
const MAX_FILENAME_LENGTH = 120;
const MAX_ERROR_MESSAGE_LENGTH = 240;
// StudentProfile.displayName is VARCHAR(120), while User.fullName and the
// tutor template may safely accept the broader 160-character name bound.
const STUDENT_DISPLAY_NAME_MAX = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const FIELD_LIMITS = {
  email: 254,
  full_name: 160,
  target_exam: 160,
  phone: 40,
  headline: 160,
  bio: 2_000,
} as const;

type ImportTemplateVersion = "students.v1" | "kapten.v1";

type ImportTemplateDefinition = {
  fileName: string;
  headers: readonly string[];
  role: EnrollmentImportRole;
  version: ImportTemplateVersion;
};

const TEMPLATE_DEFINITIONS: Readonly<Record<ImportTemplateVersion, ImportTemplateDefinition>> = {
  "students.v1": {
    fileName: "students.v1.csv",
    headers: ["email", "full_name", "target_exam"],
    role: EnrollmentImportRole.student,
    version: "students.v1",
  },
  "kapten.v1": {
    fileName: "kapten.v1.csv",
    headers: ["email", "full_name", "phone", "headline", "bio"],
    role: EnrollmentImportRole.tutor,
    version: "kapten.v1",
  },
};

type CsvRowErrorCode =
  | "column_count_mismatch"
  | "field_contains_control_character"
  | "field_too_long"
  | "invalid_email"
  | "missing_required_field";

type ParsedCsvRecord = {
  input: NormalizedImportInput;
  rowNumber: number;
  validationError: CsvRowErrorCode | null;
};

type NormalizedStudentInput = {
  email: string;
  full_name: string;
  target_exam: string | null;
};

type NormalizedKaptenInput = {
  email: string;
  full_name: string;
  phone: string | null;
  headline: string | null;
  bio: string | null;
};

type NormalizedImportInput = NormalizedStudentInput | NormalizedKaptenInput;

class CsvContractError extends Error {
  readonly code: "csv_empty_file" | "csv_header_mismatch" | "csv_invalid_utf8" | "csv_malformed" | "csv_request_too_large" | "csv_row_limit";

  constructor(
    code: CsvContractError["code"],
    message: string,
  ) {
    super(message);
    this.name = "CsvContractError";
    this.code = code;
  }
}

function getImportTemplateDefinition(value: unknown): ImportTemplateDefinition | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/\.csv$/u, "");
  return TEMPLATE_DEFINITIONS[normalized as ImportTemplateVersion] ?? null;
}

function normalizeImportRoleLabel(value: unknown): EnrollmentImportRole | null {
  if (typeof value !== "string") {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case "student":
    case "students":
    case "students.v1":
      return EnrollmentImportRole.student;
    case "tutor":
    case "tutors":
    case "tutor.v1":
    case "kapten":
    case "kapten.v1":
      return EnrollmentImportRole.tutor;
    default:
      return null;
  }
}

function truncateCodePoints(value: string, limit: number) {
  return Array.from(value).slice(0, limit).join("");
}

function isImportIdUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function safeImportFilename(value: string | null | undefined) {
  const basename = (value ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.normalize("NFKC") ?? "";
  const sanitized = basename
    .replace(/[\u0000-\u001f\u007f]/gu, "_")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/^[. ]+|[. ]+$/gu, "");
  const bounded = truncateCodePoints(sanitized, MAX_FILENAME_LENGTH);

  if (!bounded || bounded === "." || bounded === "..") {
    return "import.csv";
  }

  return bounded;
}

function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function templateCsv(definition: ImportTemplateDefinition) {
  return `${definition.headers.join(",")}\n`;
}

function sanitizeControlCharacters(value: string, allowNewlines: boolean) {
  let hadForbidden = false;
  let sanitized = "";

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const forbidden = codePoint === 0x7f
      || (codePoint <= 0x1f && !(allowNewlines && codePoint === 0x0a));

    if (forbidden) {
      hadForbidden = true;
      continue;
    }

    sanitized += character;
  }

  return { hadForbidden, value: sanitized };
}

function normalizeTextField(
  value: string,
  field: keyof typeof FIELD_LIMITS,
  options: { allowNewlines?: boolean; maxLength?: number; required?: boolean } = {},
) {
  const normalized = value
    .replace(/\r\n?/gu, "\n")
    .normalize("NFKC")
    .trim();

  const sanitized = sanitizeControlCharacters(normalized, options.allowNewlines === true);

  if (!sanitized.value) {
    if (sanitized.hadForbidden) {
      return { value: "", error: "field_contains_control_character" as const };
    }
    if (options.required) {
      return { value: "", error: "missing_required_field" as const };
    }
    return { value: null, error: null };
  }

  const maxLength = options.maxLength ?? FIELD_LIMITS[field];

  if (sanitized.hadForbidden) {
    return {
      value: truncateCodePoints(sanitized.value, maxLength),
      error: "field_contains_control_character" as const,
    };
  }

  if (Array.from(sanitized.value).length > maxLength) {
    return { value: truncateCodePoints(sanitized.value, maxLength), error: "field_too_long" as const };
  }

  return { value: sanitized.value, error: null };
}

function normalizeCsvRecord(
  values: readonly string[],
  definition: ImportTemplateDefinition,
  rowNumber: number,
): ParsedCsvRecord {
  if (values.length !== definition.headers.length) {
    return {
      input: definition.role === EnrollmentImportRole.student
        ? { email: "", full_name: "", target_exam: null }
        : { email: "", full_name: "", phone: null, headline: null, bio: null },
      rowNumber,
      validationError: "column_count_mismatch",
    };
  }

  const rawEmail = values[0] ?? "";
  const sanitizedEmail = sanitizeControlCharacters(rawEmail.normalize("NFKC"), false);
  const rawEmailValue = normalizeEmail(sanitizedEmail.value);
  const emailValue = truncateCodePoints(rawEmailValue, FIELD_LIMITS.email);
  const emailError = sanitizedEmail.hadForbidden
    ? "field_contains_control_character"
    : !rawEmailValue || rawEmailValue.length > FIELD_LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(rawEmailValue)
      ? "invalid_email"
      : null;
  const fullName = normalizeTextField(
    values[1] ?? "",
    "full_name",
    {
      maxLength: definition.role === EnrollmentImportRole.student
        ? STUDENT_DISPLAY_NAME_MAX
        : undefined,
      required: true,
    },
  );

  if (definition.role === EnrollmentImportRole.student) {
    const targetExam = normalizeTextField(values[2] ?? "", "target_exam");
    return {
      input: {
        email: emailValue,
        full_name: fullName.value ?? "",
        target_exam: targetExam.value,
      },
      rowNumber,
      validationError: emailError ?? fullName.error ?? targetExam.error,
    };
  }

  const phone = normalizeTextField(values[2] ?? "", "phone");
  const headline = normalizeTextField(values[3] ?? "", "headline");
  const bio = normalizeTextField(values[4] ?? "", "bio", { allowNewlines: true });

  return {
    input: {
      email: emailValue,
      full_name: fullName.value ?? "",
      phone: phone.value,
      headline: headline.value,
      bio: bio.value,
    },
    rowNumber,
    validationError: emailError ?? fullName.error ?? phone.error ?? headline.error ?? bio.error,
  };
}

/**
 * Parse RFC-4180-style CSV without a regex split. The state machine keeps
 * quoted commas/newlines intact and rejects quote characters in unquoted data.
 */
function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterClosingQuote = false;
  let sawAnyInput = false;
  let index = 0;

  const pushField = () => {
    row.push(field);
    field = "";
    afterClosingQuote = false;
  };

  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    if (rows.length > MAX_DATA_ROWS + 1) {
      throw new CsvContractError("csv_row_limit", "The CSV contains more than 500 data rows.");
    }
  };

  while (index < text.length) {
    sawAnyInput = true;
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        quoted = false;
        afterClosingQuote = true;
        index += 1;
        continue;
      }

      if (character === "\r") {
        field += "\n";
        index += text[index + 1] === "\n" ? 2 : 1;
        continue;
      }

      field += character;
      index += 1;
      continue;
    }

    if (afterClosingQuote) {
      if (character === ",") {
        pushField();
        index += 1;
        continue;
      }
      if (character === "\n") {
        pushRow();
        index += 1;
        continue;
      }
      if (character === "\r") {
        pushRow();
        index += text[index + 1] === "\n" ? 2 : 1;
        continue;
      }

      throw new CsvContractError("csv_malformed", "The CSV contains malformed quoted data.");
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new CsvContractError("csv_malformed", "The CSV contains malformed quoted data.");
      }
      quoted = true;
      index += 1;
      continue;
    }
    if (character === ",") {
      pushField();
      index += 1;
      continue;
    }
    if (character === "\n") {
      pushRow();
      index += 1;
      continue;
    }
    if (character === "\r") {
      pushRow();
      index += text[index + 1] === "\n" ? 2 : 1;
      continue;
    }

    field += character;
    index += 1;
  }

  if (quoted) {
    throw new CsvContractError("csv_malformed", "The CSV contains an unterminated quoted field.");
  }

  if (sawAnyInput && (field.length > 0 || row.length > 0 || afterClosingQuote)) {
    pushRow();
  }

  if (!rows.length || rows[0].every((value) => value === "")) {
    throw new CsvContractError("csv_empty_file", "The CSV must include a header and at least one data row.");
  }

  return rows;
}

function parseBoundedCsv(bytes: Uint8Array, definition: ImportTemplateDefinition) {
  if (bytes.byteLength > MAX_REQUEST_BYTES) {
    throw new CsvContractError("csv_request_too_large", "The CSV request is too large.");
  }

  const parser = new StreamingCsvParser(definition);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (let offset = 0; offset < bytes.byteLength; offset += 64 * 1024) {
      parser.push(decoder.decode(bytes.subarray(offset, offset + 64 * 1024), { stream: true }));
    }
    parser.push(decoder.decode());
  } catch (error) {
    if (error instanceof CsvContractError) {
      throw error;
    }
    throw new CsvContractError("csv_invalid_utf8", "The CSV must be valid UTF-8.");
  }

  return parser.finish();

}

const MAX_RAW_FIELD_CHARACTERS = Math.max(...Object.values(FIELD_LIMITS)) + 1;

/**
 * Incremental RFC-4180 parser used by the multipart upload path. It retains
 * only the current field/row plus the bounded normalized result rows; the
 * request body and a full string[][] matrix are never materialized.
 */
class StreamingCsvParser {
  private afterClosingQuote = false;
  private field = "";
  private fieldCharacters = 0;
  private quoted = false;
  private row: string[] = [];
  private sawAnyInput = false;
  private skipNextLf = false;
  private headerSeen = false;
  private readonly parsedRows: ParsedCsvRecord[] = [];

  constructor(private readonly definition: ImportTemplateDefinition) {}

  private appendFieldCharacter(character: string) {
    this.fieldCharacters += 1;
    if (this.fieldCharacters <= MAX_RAW_FIELD_CHARACTERS) {
      this.field += character;
    }
  }

  private pushField() {
    this.row.push(this.field);
    this.field = "";
    this.fieldCharacters = 0;
    this.afterClosingQuote = false;
  }

  private pushRow() {
    this.pushField();
    const values = this.row;
    this.row = [];

    if (!this.headerSeen) {
      const header = [...values];
      if (header[0]?.startsWith("\ufeff")) {
        header[0] = header[0].slice(1);
      }
      if (!header.length || header.every((value) => value === "")) {
        throw new CsvContractError("csv_empty_file", "The CSV must include a header and at least one data row.");
      }
      if (header.length !== this.definition.headers.length || header.some((value, index) => value !== this.definition.headers[index])) {
        throw new CsvContractError("csv_header_mismatch", "The CSV header does not match the selected template.");
      }
      this.headerSeen = true;
      return;
    }

    if (this.parsedRows.length >= MAX_DATA_ROWS) {
      throw new CsvContractError("csv_row_limit", "The CSV contains more than 500 data rows.");
    }

    this.parsedRows.push(normalizeCsvRecord(values, this.definition, this.parsedRows.length + 1));
  }

  push(text: string) {
    for (const character of text) {
      this.sawAnyInput = true;

      if (this.skipNextLf) {
        this.skipNextLf = false;
        if (character === "\n") {
          continue;
        }
      }

      if (this.quoted) {
        if (character === '"') {
          this.quoted = false;
          this.afterClosingQuote = true;
          continue;
        }
        if (character === "\r") {
          this.appendFieldCharacter("\n");
          this.skipNextLf = true;
          continue;
        }
        this.appendFieldCharacter(character);
        continue;
      }

      if (this.afterClosingQuote) {
        if (character === '"') {
          this.fieldCharacters += 1;
          if (this.fieldCharacters <= MAX_RAW_FIELD_CHARACTERS) {
            this.field += '"';
          }
          this.quoted = true;
          this.afterClosingQuote = false;
          continue;
        }
        if (character === ",") {
          this.pushField();
          continue;
        }
        if (character === "\n") {
          this.pushRow();
          continue;
        }
        if (character === "\r") {
          this.pushRow();
          this.skipNextLf = true;
          continue;
        }
        throw new CsvContractError("csv_malformed", "The CSV contains malformed quoted data.");
      }

      if (character === '"') {
        if (this.fieldCharacters > 0) {
          throw new CsvContractError("csv_malformed", "The CSV contains malformed quoted data.");
        }
        this.quoted = true;
        continue;
      }
      if (character === ",") {
        this.pushField();
        continue;
      }
      if (character === "\n") {
        this.pushRow();
        continue;
      }
      if (character === "\r") {
        this.pushRow();
        this.skipNextLf = true;
        continue;
      }

      this.appendFieldCharacter(character);
    }
  }

  finish() {
    if (this.quoted) {
      throw new CsvContractError("csv_malformed", "The CSV contains an unterminated quoted field.");
    }

    if (this.sawAnyInput && (this.fieldCharacters > 0 || this.row.length > 0 || this.afterClosingQuote)) {
      this.pushRow();
    }

    if (!this.headerSeen || this.parsedRows.length === 0) {
      throw new CsvContractError("csv_empty_file", "The CSV must include a header and at least one data row.");
    }

    return this.parsedRows;
  }
}

async function parseBoundedCsvStream(
  chunks: AsyncIterable<Uint8Array>,
  definition: ImportTemplateDefinition,
) {
  const parser = new StreamingCsvParser(definition);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;

  try {
    for await (const chunk of chunks) {
      byteLength += chunk.byteLength;
      if (byteLength > MAX_REQUEST_BYTES) {
        throw new CsvContractError("csv_request_too_large", "The CSV request is too large.");
      }
      parser.push(decoder.decode(chunk, { stream: true }));
    }
    parser.push(decoder.decode());
  } catch (error) {
    if (error instanceof CsvContractError) {
      throw error;
    }
    throw new CsvContractError("csv_invalid_utf8", "The CSV must be valid UTF-8.");
  }

  return parser.finish();
}

function parseCsvText(text: string, definition: ImportTemplateDefinition) {
  return parseBoundedCsv(new TextEncoder().encode(text), definition);
}

export {
  CsvContractError,
  FIELD_LIMITS,
  MAX_DATA_ROWS,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_FILENAME_LENGTH,
  MAX_REQUEST_BYTES,
  STUDENT_DISPLAY_NAME_MAX,
  getImportTemplateDefinition,
  isImportIdUuid,
  normalizeImportRoleLabel,
  parseBoundedCsv,
  parseBoundedCsvStream,
  parseCsvText,
  parseCsvRows,
  safeImportFilename,
  sha256Hex,
  truncateCodePoints,
  templateCsv,
};

export type {
  CsvRowErrorCode,
  ImportTemplateDefinition,
  ImportTemplateVersion,
  NormalizedImportInput,
  NormalizedKaptenInput,
  NormalizedStudentInput,
  ParsedCsvRecord,
};

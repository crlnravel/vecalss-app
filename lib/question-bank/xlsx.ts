import "server-only";

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { inflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";
import sharp from "sharp";

import {
  QUESTION_BANK_CSV_HEADER,
  validateQuestionBankCsvRecords,
  type QuestionBankCsvParseResult,
} from "@/lib/question-bank/csv";
import { QUESTION_BANK_MATERI_OPTIONS } from "@/lib/question-bank/materi";
import {
  OoxmlParseError,
  parseXmlDocument,
  xmlAttribute,
  xmlChildren,
  xmlDescendants,
  type XmlElement,
} from "./ooxml";
import {
  QUESTION_BANK_XLSX_LIMITS,
} from "./xlsx-limits";
import type {
  QuestionBankXlsxImagePlacement,
  QuestionBankXlsxIssue,
  QuestionBankXlsxPreviewImagePayload,
  QuestionBankXlsxPreviewManifest,
  QuestionBankXlsxPreviewSummary,
  QuestionBankXlsxThumbnail,
  QuestionBankXlsxWorksheetRowRef,
} from "./xlsx-contract";

const IMAGE_FIELDS = [
  "prompt_image",
  "option_a_image",
  "option_b_image",
  "option_c_image",
  "option_d_image",
  "option_e_image",
  "explanation_image",
] as const;

const QUESTION_BANK_XLSX_HEADER = [
  "question_id",
  "subject_code",
  "materi",
  "difficulty",
  "question_type",
  "prompt",
  "prompt_image",
  "option_a",
  "option_a_image",
  "option_b",
  "option_b_image",
  "option_c",
  "option_c_image",
  "option_d",
  "option_d_image",
  "option_e",
  "option_e_image",
  "correct_options",
  "explanation",
  "explanation_image",
] as const;

const XLSX_XML_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XLSX_REL_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const DRAWING_MAIN_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/main";
const MAX_XML_NAME_BYTES = 65_535;
const MAX_IP_FETCH_ADDRESS_COUNT = 16;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

type ZipEntry = {
  bytes: Buffer;
  compressedBytes: number;
  crc32: number;
  flags: number;
  method: number;
  name: string;
  localOffset: number;
  endOffset: number;
};

type ZipPackage = Map<string, ZipEntry> & {
  rawImageSourceBytes: number;
  rawImageSourceBytesExceeded: boolean;
};

type Relationship = {
  id: string;
  target: string;
  targetMode: string | null;
  type: string;
};

type SheetPart = {
  name: string;
  part: string;
  relationships: Map<string, Relationship>;
};

type ImageSource = {
  bytes: Buffer;
  mimeType: string;
  placements: QuestionBankXlsxImagePlacement[];
  sourceUrlFingerprints: string[];
};

type ParsedDrawing = {
  placements: Map<string, string[]>;
  issues: QuestionBankXlsxIssue[];
};

type WorkbookRead = {
  formulaCells: Array<{ column: number; row: number }>;
  maxRow: number;
  populatedRows: Set<number>;
};

type XlsxQuestionSheetLayout = {
  columns: Map<string, number>;
  fieldByColumn: Map<number, string>;
  headerRow: number;
  imageFieldByColumn: Map<number, string>;
  imageUrlFieldByField: Map<string, number>;
  importFieldColumns: Map<number, string>;
  kind: "legacy" | "stakeholder";
  sheetName: string;
};

type XlsxPackageStructure = {
  packageParts: ZipPackage;
  preflightBySheet: Map<string, WorkbookRead>;
  sheetParts: Map<string, Buffer>;
  sheets: SheetPart[];
};

type FetchImageResult = {
  bytes: Buffer;
  contentType: string;
};

type ImageSourceByteBudget = {
  exceeded: boolean;
  reserve(bytes: number): void;
  usedBytes: number;
};

function structureIssue(
  code: string,
  row?: number,
  field?: string,
  sheetName?: string,
): QuestionBankXlsxIssue {
  return { code, field, kind: row === undefined ? "structural" : "row", row, sheetName };
}

function csvFieldToXlsxField(field: string | undefined) {
  if (!field) return undefined;
  return field.replace(/_media_asset_id$/u, "_image");
}

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function zipU16(bytes: Buffer, offset: number) {
  if (offset < 0 || offset + 2 > bytes.length) throw new OoxmlParseError();
  return bytes.readUInt16LE(offset);
}

function zipU32(bytes: Buffer, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) throw new OoxmlParseError();
  return bytes.readUInt32LE(offset);
}

function decodeZipName(bytes: Buffer) {
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new OoxmlParseError();
  }
  if (!value || value.length > MAX_XML_NAME_BYTES || /[\u0000-\u001f\u007f\\]/u.test(value)) {
    throw new OoxmlParseError();
  }
  const isDirectory = value.endsWith("/");
  const segments = value.split("/");
  if (
    value.startsWith("/")
    || /^[a-z]:/iu.test(value)
    || segments.some((segment, index) =>
      segment === ".."
      || segment === "."
      || (!segment && index !== segments.length - 1)
      || (isDirectory && index === segments.length - 1 && segment !== "")
    )
  ) {
    throw new OoxmlParseError();
  }
  return value;
}

function parseExtraFields(extra: Buffer) {
  let offset = 0;
  const fields = new Map<number, Buffer>();
  while (offset < extra.length) {
    if (offset + 4 > extra.length) throw new OoxmlParseError();
    const id = zipU16(extra, offset);
    const length = zipU16(extra, offset + 2);
    offset += 4;
    if (offset + length > extra.length || fields.has(id)) throw new OoxmlParseError();
    fields.set(id, extra.subarray(offset, offset + length));
    offset += length;
  }
  if (fields.has(0x0001)) throw new OoxmlParseError();
  return fields;
}

function parseZipPackage(input: Uint8Array, signal?: AbortSignal): ZipPackage {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (signal?.aborted) throw signal.reason ?? new ImageSourceError("attempt_cancelled");
  if (bytes.byteLength < 22 || bytes.byteLength > QUESTION_BANK_XLSX_LIMITS.workbookBytes) {
    throw new OoxmlParseError(bytes.byteLength > QUESTION_BANK_XLSX_LIMITS.workbookBytes ? "xlsx_too_large" : undefined);
  }
  const eocdMinimum = Math.max(0, bytes.length - 22 - 65_535);
  let eocdOffset = -1;
  for (let offset = bytes.length - 22; offset >= eocdMinimum; offset -= 1) {
    if (zipU32(bytes, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new OoxmlParseError();

  const diskNumber = zipU16(bytes, eocdOffset + 4);
  const centralDiskNumber = zipU16(bytes, eocdOffset + 6);
  const entriesOnDisk = zipU16(bytes, eocdOffset + 8);
  const entryCount = zipU16(bytes, eocdOffset + 10);
  const centralSize = zipU32(bytes, eocdOffset + 12);
  const centralOffset = zipU32(bytes, eocdOffset + 16);
  const commentLength = zipU16(bytes, eocdOffset + 20);
  if (
    diskNumber !== 0
    || centralDiskNumber !== 0
    || entriesOnDisk !== entryCount
    || entryCount === 0
    || entryCount > QUESTION_BANK_XLSX_LIMITS.zipEntries
    || eocdOffset + 22 + commentLength !== bytes.length
    || centralOffset + centralSize !== eocdOffset
  ) {
    throw new OoxmlParseError();
  }

  let preflightCursor = centralOffset;
  let rawImageSourceBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (signal?.aborted) throw signal.reason ?? new ImageSourceError("attempt_cancelled");
    if (zipU32(bytes, preflightCursor) !== 0x02014b50) throw new OoxmlParseError();
    const nameLength = zipU16(bytes, preflightCursor + 28);
    const extraLength = zipU16(bytes, preflightCursor + 30);
    const commentLength = zipU16(bytes, preflightCursor + 32);
    const uncompressedBytes = zipU32(bytes, preflightCursor + 24);
    const recordSize = 46 + nameLength + extraLength + commentLength;
    if (!nameLength || preflightCursor + recordSize > eocdOffset) throw new OoxmlParseError();
    const name = decodeZipName(bytes.subarray(preflightCursor + 46, preflightCursor + 46 + nameLength));
    if (name.toLowerCase().startsWith("xl/media/")) rawImageSourceBytes += uncompressedBytes;
    preflightCursor += recordSize;
  }
  if (preflightCursor !== eocdOffset) throw new OoxmlParseError();
  const rawImageSourceBytesExceeded = rawImageSourceBytes > QUESTION_BANK_XLSX_LIMITS.totalRawImageSourceBytes;

  const entries = new Map<string, ZipEntry>() as ZipPackage;
  entries.rawImageSourceBytes = rawImageSourceBytes;
  entries.rawImageSourceBytesExceeded = rawImageSourceBytesExceeded;
  const localOffsets = new Set<number>();
  const localRecords: ZipEntry[] = [];
  let centralCursor = centralOffset;
  let expandedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (signal?.aborted) throw signal.reason ?? new ImageSourceError("attempt_cancelled");
    if (zipU32(bytes, centralCursor) !== 0x02014b50) throw new OoxmlParseError();
    const madeBy = zipU16(bytes, centralCursor + 4);
    const flags = zipU16(bytes, centralCursor + 8);
    const method = zipU16(bytes, centralCursor + 10);
    const expectedCrc32 = zipU32(bytes, centralCursor + 16);
    const compressedBytes = zipU32(bytes, centralCursor + 20);
    const uncompressedBytes = zipU32(bytes, centralCursor + 24);
    const nameLength = zipU16(bytes, centralCursor + 28);
    const extraLength = zipU16(bytes, centralCursor + 30);
    const entryCommentLength = zipU16(bytes, centralCursor + 32);
    const diskStart = zipU16(bytes, centralCursor + 34);
    const externalAttributes = zipU32(bytes, centralCursor + 38);
    const localOffset = zipU32(bytes, centralCursor + 42);
    const recordSize = 46 + nameLength + extraLength + entryCommentLength;
    if (
      centralCursor + recordSize > eocdOffset
      || nameLength === 0
      || diskStart !== 0
      || compressedBytes === 0xffffffff
      || uncompressedBytes === 0xffffffff
      || localOffset === 0xffffffff
      || localOffsets.has(localOffset)
      || (flags & ~0x080e) !== 0
      || (method !== 0 && method !== 8)
      || ((madeBy >>> 8) === 3 && ((externalAttributes >>> 16) & 0xf000) === 0xa000)
    ) {
      throw new OoxmlParseError();
    }
    const name = decodeZipName(bytes.subarray(centralCursor + 46, centralCursor + 46 + nameLength));
    const extraStart = centralCursor + 46 + nameLength;
    parseExtraFields(bytes.subarray(extraStart, extraStart + extraLength));
    if (entries.has(name)) throw new OoxmlParseError();
    if (compressedBytes === 0 && uncompressedBytes > 0) throw new OoxmlParseError();
    if (
      compressedBytes > 0
      && uncompressedBytes / compressedBytes > QUESTION_BANK_XLSX_LIMITS.zipEntryCompressionRatio
    ) {
      throw new OoxmlParseError();
    }
    const lowerName = name.toLowerCase();
    if (
      /(?:^|\/)(?:vbaProject\.bin|externalLinks|embeddings|activeX|customUI)(?:\/|$)/iu.test(lowerName)
      || lowerName.endsWith(".xlsm")
    ) {
      throw new OoxmlParseError();
    }
    const isXmlPart = lowerName.endsWith(".xml") || lowerName.endsWith(".rels");
    const isImagePart = lowerName.startsWith("xl/media/");
    const partLimit = isXmlPart
      ? QUESTION_BANK_XLSX_LIMITS.xmlPartBytes
      : isImagePart
        ? QUESTION_BANK_XLSX_LIMITS.zipImagePartBytes
        : QUESTION_BANK_XLSX_LIMITS.totalExpandedZipBytes;
    if (uncompressedBytes > partLimit && !(isImagePart && rawImageSourceBytesExceeded)) {
      throw new OoxmlParseError();
    }
    if (!(isImagePart && rawImageSourceBytesExceeded)) expandedBytes += uncompressedBytes;
    if (expandedBytes > QUESTION_BANK_XLSX_LIMITS.totalExpandedZipBytes) throw new OoxmlParseError();

    const localOffsetValue = localOffset;
    if (zipU32(bytes, localOffsetValue) !== 0x04034b50) throw new OoxmlParseError();
    const localFlags = zipU16(bytes, localOffsetValue + 6);
    const localMethod = zipU16(bytes, localOffsetValue + 8);
    const localCrc32 = zipU32(bytes, localOffsetValue + 14);
    const localCompressedBytes = zipU32(bytes, localOffsetValue + 18);
    const localUncompressedBytes = zipU32(bytes, localOffsetValue + 22);
    const localNameLength = zipU16(bytes, localOffsetValue + 26);
    const localExtraLength = zipU16(bytes, localOffsetValue + 28);
    const localNameStart = localOffsetValue + 30;
    const localDataStart = localNameStart + localNameLength + localExtraLength;
    if (
      localFlags !== flags
      || localMethod !== method
      || localNameLength !== nameLength
      || decodeZipName(bytes.subarray(localNameStart, localNameStart + localNameLength)) !== name
      || localDataStart + compressedBytes > centralOffset
      || (!(flags & 0x0008) && (localCrc32 !== expectedCrc32 || localCompressedBytes !== compressedBytes || localUncompressedBytes !== uncompressedBytes))
    ) {
      throw new OoxmlParseError();
    }
    parseExtraFields(bytes.subarray(localNameStart + localNameLength, localDataStart));

    const compressed = bytes.subarray(localDataStart, localDataStart + compressedBytes);
    let contents: Buffer;
    if (isImagePart && rawImageSourceBytesExceeded) {
      // The workbook is rejected for its advertised aggregate media size. Keep
      // no expanded image payloads while parsing drawing metadata for issues.
      contents = Buffer.alloc(0);
    } else {
      try {
        contents = method === 0
          ? Buffer.from(compressed)
          : inflateRawSync(compressed, { maxOutputLength: Math.min(partLimit, uncompressedBytes + 1) });
      } catch {
        throw new OoxmlParseError();
      }
      if (contents.byteLength !== uncompressedBytes || crc32(contents) !== expectedCrc32) {
        throw new OoxmlParseError();
      }
    }
    let endOffset = localDataStart + compressedBytes;
    if (flags & 0x0008) {
      if (zipU32(bytes, endOffset) === 0x08074b50) endOffset += 4;
      if (
        zipU32(bytes, endOffset) !== expectedCrc32
        || zipU32(bytes, endOffset + 4) !== compressedBytes
        || zipU32(bytes, endOffset + 8) !== uncompressedBytes
      ) {
        throw new OoxmlParseError();
      }
      endOffset += 12;
    }
    localOffsets.add(localOffsetValue);
    const entry = {
      bytes: contents,
      compressedBytes,
      crc32: expectedCrc32,
      endOffset,
      flags,
      localOffset: localOffsetValue,
      method,
      name,
    } satisfies ZipEntry;
    entries.set(name, entry);
    localRecords.push(entry);
    centralCursor += recordSize;
  }
  if ([...entries.keys()].filter((name) => name.toLowerCase().startsWith("xl/media/")).length > QUESTION_BANK_XLSX_LIMITS.zipImagePayloads) {
    throw new OoxmlParseError();
  }
  if (centralCursor !== eocdOffset) throw new OoxmlParseError();
  localRecords.sort((left, right) => left.localOffset - right.localOffset);
  for (let index = 0; index < localRecords.length; index += 1) {
    const current = localRecords[index]!;
    const next = localRecords[index + 1];
    if ((!index && current.localOffset !== 0) || (next && current.endOffset !== next.localOffset)) {
      throw new OoxmlParseError();
    }
  }
  if (localRecords.at(-1)?.endOffset !== centralOffset) throw new OoxmlParseError();
  return entries;
}

function parseRelationships(bytes: Buffer, signal?: AbortSignal) {
  const root = parseXmlDocument(bytes, signal);
  if (root.localName !== "Relationships" || root.namespaceUri !== PACKAGE_REL_NAMESPACE) {
    throw new OoxmlParseError();
  }
  if (root.children.some((child) => child.localName !== "Relationship" || child.namespaceUri !== PACKAGE_REL_NAMESPACE)) {
    throw new OoxmlParseError();
  }
  const relationships = new Map<string, Relationship>();
  for (const element of xmlChildren(root, "Relationship", PACKAGE_REL_NAMESPACE)) {
    const id = xmlAttribute(element, "Id");
    const target = xmlAttribute(element, "Target");
    const type = xmlAttribute(element, "Type");
    const targetMode = xmlAttribute(element, "TargetMode");
    if (
      !id
      || !target
      || !type
      || relationships.has(id)
      || (targetMode !== null && targetMode !== "Internal" && targetMode !== "External")
      || targetMode === "External"
    ) {
      throw new OoxmlParseError();
    }
    relationships.set(id, { id, target, targetMode, type });
  }
  if (relationships.size !== xmlChildren(root, "Relationship", PACKAGE_REL_NAMESPACE).length) {
    throw new OoxmlParseError();
  }
  return relationships;
}

function resolveRelationshipPart(sourcePart: string, target: string) {
  if (
    !target
    || target.startsWith("//")
    || target.includes("\\")
    || /[?#\u0000-\u001f]/u.test(target)
    || /^[a-z][a-z0-9+.-]*:/iu.test(target)
  ) {
    throw new OoxmlParseError();
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    throw new OoxmlParseError();
  }
  if (/[?#\u0000-\u001f\\]/u.test(decoded)) throw new OoxmlParseError();
  const rooted = decoded.startsWith("/");
  const baseSegments = rooted || !sourcePart ? [] : sourcePart.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!baseSegments.length) throw new OoxmlParseError();
      baseSegments.pop();
    } else {
      baseSegments.push(segment);
    }
  }
  const resolved = baseSegments.join("/");
  if (!resolved || !/^[a-z0-9_./ -]+$/iu.test(resolved) || resolved.split("/").includes("..")) {
    throw new OoxmlParseError();
  }
  return resolved;
}

function relationshipsPartName(sourcePart: string) {
  if (!sourcePart) return "_rels/.rels";
  const lastSlash = sourcePart.lastIndexOf("/");
  const directory = lastSlash === -1 ? "" : sourcePart.slice(0, lastSlash + 1);
  const baseName = lastSlash === -1 ? sourcePart : sourcePart.slice(lastSlash + 1);
  return `${directory}_rels/${baseName}.rels`;
}

function getRelationships(packageParts: ZipPackage, sourcePart: string, signal?: AbortSignal) {
  const relPart = relationshipsPartName(sourcePart);
  const entry = packageParts.get(relPart);
  if (!entry) return new Map<string, Relationship>();
  return parseRelationships(entry.bytes, signal);
}

function parsePackageSheets(packageParts: ZipPackage, signal?: AbortSignal) {
  const rootRels = getRelationships(packageParts, "", signal);
  const officeDocument = [...rootRels.values()].find((relationship) => relationship.type.endsWith("/officeDocument"));
  if (!officeDocument) throw new OoxmlParseError();
  const workbookPart = resolveRelationshipPart("", officeDocument.target);
  const workbookEntry = packageParts.get(workbookPart);
  if (!workbookEntry) throw new OoxmlParseError();
  const workbookRoot = parseXmlDocument(workbookEntry.bytes, signal);
  if (workbookRoot.localName !== "workbook" || workbookRoot.namespaceUri !== XLSX_XML_NAMESPACE) {
    throw new OoxmlParseError();
  }
  const workbookRelationships = getRelationships(packageParts, workbookPart, signal);
  const sheetElements = xmlDescendants(workbookRoot, "sheet", XLSX_XML_NAMESPACE);
  if (!sheetElements.length || sheetElements.length > QUESTION_BANK_XLSX_LIMITS.worksheets) throw new OoxmlParseError();
  const sheets: SheetPart[] = [];
  const names = new Set<string>();
  for (const sheet of sheetElements) {
    const name = xmlAttribute(sheet, "name");
    const relationshipId = xmlAttribute(sheet, "id", XLSX_REL_NAMESPACE);
    const relationship = relationshipId ? workbookRelationships.get(relationshipId) : null;
    if (
      !name
      || name.length > 31
      || /[\\/*?:\[\]\u0000-\u001f]/u.test(name)
      || name.startsWith("'")
      || name.endsWith("'")
      || names.has(name)
      || !relationship
      || !relationship.type.endsWith("/worksheet")
    ) {
      throw new OoxmlParseError();
    }
    const part = resolveRelationshipPart(workbookPart, relationship.target);
    if (!packageParts.has(part)) throw new OoxmlParseError();
    names.add(name);
    sheets.push({ name, part, relationships: getRelationships(packageParts, part, signal) });
  }
  return sheets;
}

class WorkbookIssueError extends Error {
  constructor(readonly issues: QuestionBankXlsxIssue[]) {
    super("xlsx_structure_invalid");
    this.name = "WorkbookIssueError";
  }
}

function parseCellReference(reference: string) {
  const match = /^([A-Z]{1,3})([1-9]\d*)$/u.exec(reference.toUpperCase());
  if (!match) throw new OoxmlParseError();
  let column = 0;
  for (const character of match[1]!) column = column * 26 + character.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (!Number.isSafeInteger(row)) throw new OoxmlParseError();
  return { column, row };
}

function columnNumberToName(column: number) {
  let result = "";
  let current = column;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function preflightWorksheet(bytes: Buffer, sheetName: string, signal?: AbortSignal): WorkbookRead {
  const root = parseXmlDocument(bytes, signal);
  if (root.localName !== "worksheet" || root.namespaceUri !== XLSX_XML_NAMESPACE) throw new OoxmlParseError();
  const dimensions = xmlChildren(root, "dimension", XLSX_XML_NAMESPACE);
  if (dimensions.length > 1) throw new OoxmlParseError();
  const dimension = dimensions[0] ? xmlAttribute(dimensions[0], "ref") : null;
  if (dimension) {
    const references = dimension.split(":");
    if (references.length > 2) throw new OoxmlParseError();
    const endpoints = references.map((reference) => parseCellReference(reference.replace(/\$/gu, "")));
    if (endpoints.some((endpoint) => endpoint.row > QUESTION_BANK_XLSX_LIMITS.physicalWorksheetRows)) {
      throw new WorkbookIssueError([structureIssue("xlsx_row_index_limit_exceeded", undefined, undefined, sheetName)]);
    }
    if (endpoints.some((endpoint) => endpoint.column > QUESTION_BANK_XLSX_LIMITS.worksheetColumns)) {
      throw new WorkbookIssueError([structureIssue("xlsx_column_limit_exceeded", undefined, undefined, sheetName)]);
    }
  }
  const formulaCells: Array<{ column: number; row: number }> = [];
  const rows = xmlDescendants(root, "row", XLSX_XML_NAMESPACE);
  let maxRow = 0;
  const populatedRows = new Set<number>();
  const seenRows = new Set<number>();
  for (const rowElement of rows) {
    if (signal?.aborted) throw signal.reason ?? new ImageSourceError("attempt_cancelled");
    const rowText = xmlAttribute(rowElement, "r");
    if (!rowText || !/^\d+$/u.test(rowText)) throw new OoxmlParseError();
    const row = Number(rowText);
    if (!Number.isSafeInteger(row) || row < 1 || seenRows.has(row)) {
      throw new OoxmlParseError();
    }
    if (row > QUESTION_BANK_XLSX_LIMITS.physicalWorksheetRows) {
      throw new WorkbookIssueError([structureIssue("xlsx_row_index_limit_exceeded", row, undefined, sheetName)]);
    }
    seenRows.add(row);
    maxRow = Math.max(maxRow, row);
    const cells = xmlChildren(rowElement, "c", XLSX_XML_NAMESPACE);
    const seenCells = new Set<string>();
    for (const cell of cells) {
      const reference = xmlAttribute(cell, "r");
      if (!reference) throw new OoxmlParseError();
      const coordinate = parseCellReference(reference);
      if (
        coordinate.row !== row
        || coordinate.column < 1
        || seenCells.has(reference.toUpperCase())
      ) {
        throw new OoxmlParseError();
      }
      if (coordinate.column > QUESTION_BANK_XLSX_LIMITS.worksheetColumns) {
        throw new WorkbookIssueError([structureIssue("xlsx_column_limit_exceeded", row, undefined, sheetName)]);
      }
      seenCells.add(reference.toUpperCase());
      if (xmlChildren(cell, "f", XLSX_XML_NAMESPACE).length) {
        formulaCells.push({ column: coordinate.column, row });
      }
      if (
        xmlChildren(cell, "v", XLSX_XML_NAMESPACE).length
        || xmlChildren(cell, "is", XLSX_XML_NAMESPACE).length
        || xmlChildren(cell, "f", XLSX_XML_NAMESPACE).length
      ) {
        populatedRows.add(row);
      }
    }
  }
  return { formulaCells, maxRow, populatedRows };
}

function parseXmlRelationshipsInPackage(packageParts: ZipPackage, signal?: AbortSignal) {
  for (const entry of packageParts.values()) {
    if (signal?.aborted) throw signal.reason ?? new ImageSourceError("attempt_cancelled");
    if (!entry.name.endsWith(".rels")) continue;
    const match = /^(?:(.*)\/)?_rels\/([^/]*)\.rels$/u.exec(entry.name);
    if (!match || (match[1] && !match[2])) throw new OoxmlParseError();
    const sourcePart = match[1] ? `${match[1]}/${match[2]}` : match[2] === "." ? "" : match[2]!;
    const relationships = parseRelationships(entry.bytes, signal);
    for (const relationship of relationships.values()) {
      const targetPart = resolveRelationshipPart(sourcePart, relationship.target);
      if (!packageParts.has(targetPart)) throw new OoxmlParseError();
    }
  }
}

function parseContentTypes(packageParts: ZipPackage, signal?: AbortSignal) {
  const entry = packageParts.get("[Content_Types].xml");
  if (!entry) throw new OoxmlParseError();
  const root = parseXmlDocument(entry.bytes, signal);
  if (root.localName !== "Types" || root.namespaceUri !== "http://schemas.openxmlformats.org/package/2006/content-types") {
    throw new OoxmlParseError();
  }
  for (const override of xmlChildren(root, "Override", root.namespaceUri)) {
    const contentType = xmlAttribute(override, "ContentType")?.toLowerCase() ?? "";
    const partName = xmlAttribute(override, "PartName")?.toLowerCase() ?? "";
    if (
      contentType.includes("macroenabled")
      || contentType.includes("vba")
      || partName.includes("external")
      || partName.includes("vbaproject")
    ) {
      throw new OoxmlParseError();
    }
  }
  for (const type of xmlChildren(root, "Default", root.namespaceUri)) {
    const contentType = xmlAttribute(type, "ContentType")?.toLowerCase() ?? "";
    if (contentType.includes("macroenabled") || contentType.includes("vba")) throw new OoxmlParseError();
  }
}

function parseAnchorCoordinate(anchor: XmlElement, name: "from" | "to") {
  const coordinateElements = xmlChildren(anchor, name, DRAWING_NAMESPACE);
  const coordinate = coordinateElements[0];
  if (coordinateElements.length !== 1 || !coordinate) throw new OoxmlParseError();
  const childText = (childName: string) => {
    const children = xmlChildren(coordinate, childName, DRAWING_NAMESPACE);
    if (children.length !== 1) throw new OoxmlParseError();
    const child = children[0];
    return child?.text.join("").trim() ?? null;
  };
  const rowText = childText("row");
  const columnText = childText("col");
  const rowOffset = childText("rowOff");
  const columnOffset = childText("colOff");
  if (
    !rowText
    || !columnText
    || !/^\d+$/u.test(rowText)
    || !/^\d+$/u.test(columnText)
    || rowOffset === null
    || !/^\d+$/u.test(rowOffset)
    || !Number.isSafeInteger(Number(rowOffset))
    || Number(rowOffset) > 10_000_000
    || columnOffset === null
    || !/^\d+$/u.test(columnOffset)
    || !Number.isSafeInteger(Number(columnOffset))
    || Number(columnOffset) > 10_000_000
  ) {
    throw new OoxmlParseError();
  }
  return { column: Number(columnText), row: Number(rowText) };
}

function readPictureMediaRelationship(anchor: XmlElement, drawingRelationships: Map<string, Relationship>) {
  const pictures = xmlDescendants(anchor, "pic", DRAWING_NAMESPACE);
  if (pictures.length !== 1) throw new OoxmlParseError();
  const blips = xmlDescendants(pictures[0]!, "blip", DRAWING_MAIN_NAMESPACE);
  if (blips.length !== 1 || xmlAttribute(blips[0]!, "link", XLSX_REL_NAMESPACE)) throw new OoxmlParseError();
  const embeddedRelationshipId = xmlAttribute(blips[0]!, "embed", XLSX_REL_NAMESPACE);
  if (!embeddedRelationshipId) throw new OoxmlParseError();
  const relation = drawingRelationships.get(embeddedRelationshipId);
  if (!relation || !relation.type.endsWith("/image")) throw new OoxmlParseError();
  return relation.target;
}

function placementKey(sheetName: string, row: number, field: string) {
  return `${sheetName}\u0000${row}\u0000${field}`;
}

function parseSheetDrawings(
  packageParts: ZipPackage,
  sheet: SheetPart,
  layout: XlsxQuestionSheetLayout,
  signal?: AbortSignal,
): ParsedDrawing {
  const placements = new Map<string, string[]>();
  const issues: QuestionBankXlsxIssue[] = [];
  const drawingRelationships = sheet.relationships;
  const drawingLinks = [...drawingRelationships.values()].filter((relationship) => relationship.type.endsWith("/drawing"));
  let pictureCount = 0;
  for (const drawingLink of drawingLinks) {
    if (signal?.aborted) throw signal.reason ?? new ImageSourceError("attempt_cancelled");
    const drawingPart = resolveRelationshipPart(sheet.part, drawingLink.target);
    const drawingEntry = packageParts.get(drawingPart);
    if (!drawingEntry) throw new OoxmlParseError();
    const drawingRoot = parseXmlDocument(drawingEntry.bytes, signal);
    if (drawingRoot.localName !== "wsDr" || drawingRoot.namespaceUri !== DRAWING_NAMESPACE) throw new OoxmlParseError();
    const relationships = getRelationships(packageParts, drawingPart, signal);
    const anchors = drawingRoot.children.filter((child) =>
      child.namespaceUri === DRAWING_NAMESPACE
      && ["oneCellAnchor", "twoCellAnchor", "absoluteAnchor"].includes(child.localName),
    );
    for (const anchor of anchors) {
      const pics = xmlChildren(anchor, "pic", DRAWING_NAMESPACE);
      // The stakeholder workbook has decorative shape anchors. Ignore those;
      // only picture anchors become question images.
      if (!pics.length) continue;
      pictureCount += 1;
      if (pictureCount > QUESTION_BANK_XLSX_LIMITS.imagePlacements) {
        throw new WorkbookIssueError([structureIssue("xlsx_image_placement_limit_exceeded", undefined, undefined, sheet.name)]);
      }
      if (anchor.localName === "absoluteAnchor") {
        issues.push(structureIssue("xlsx_image_anchor_invalid", undefined, undefined, sheet.name));
        continue;
      }
      if (pics.length !== 1
        || xmlChildren(anchor, "clientData", DRAWING_NAMESPACE).length > 1
        || (anchor.localName === "oneCellAnchor" && xmlChildren(anchor, "to", DRAWING_NAMESPACE).length > 0)) {
        throw new OoxmlParseError();
      }
      const from = parseAnchorCoordinate(anchor, "from");
      let to: { column: number; row: number } | null = null;
      if (anchor.localName === "twoCellAnchor") {
        if (xmlChildren(anchor, "ext", DRAWING_NAMESPACE).length) throw new OoxmlParseError();
        to = parseAnchorCoordinate(anchor, "to");
        if (to.row < from.row || (to.row === from.row && to.column <= from.column)) throw new OoxmlParseError();
      } else {
        const extElements = xmlChildren(anchor, "ext", DRAWING_NAMESPACE);
        if (extElements.length !== 1) throw new OoxmlParseError();
        const cx = xmlAttribute(extElements[0]!, "cx");
        const cy = xmlAttribute(extElements[0]!, "cy");
        if (
          !cx
          || !cy
          || !/^\d+$/u.test(cx)
          || !/^\d+$/u.test(cy)
          || !Number.isSafeInteger(Number(cx))
          || !Number.isSafeInteger(Number(cy))
          || Number(cx) <= 0
          || Number(cy) <= 0
        ) {
          throw new OoxmlParseError();
        }
      }
      const otherAnchorChildren = anchor.children.filter((child) =>
        child.namespaceUri !== DRAWING_NAMESPACE
        || !["from", "to", "ext", "pic", "clientData", "extLst"].includes(child.localName),
      );
      if (otherAnchorChildren.length) throw new OoxmlParseError();
      const imageTarget = readPictureMediaRelationship(anchor, relationships);
      const imagePart = resolveRelationshipPart(drawingPart, imageTarget);
      const mediaEntry = packageParts.get(imagePart);
      if (!mediaEntry || !imagePart.toLowerCase().startsWith("xl/media/")) throw new OoxmlParseError();
      if (
        from.row < 1
        || from.row >= QUESTION_BANK_XLSX_LIMITS.physicalWorksheetRows
        || from.column < 0
        || from.column >= QUESTION_BANK_XLSX_LIMITS.worksheetColumns
        || (to && (to.row > QUESTION_BANK_XLSX_LIMITS.physicalWorksheetRows || to.column > QUESTION_BANK_XLSX_LIMITS.worksheetColumns))
      ) {
        const row = from.row + 1;
        issues.push(structureIssue("xlsx_image_anchor_invalid", row, undefined, sheet.name));
        continue;
      }
      const field = layout.imageFieldByColumn.get(from.column);
      if (!field || from.row + 1 <= layout.headerRow) {
        issues.push(structureIssue("xlsx_image_anchor_invalid", from.row + 1, undefined, sheet.name));
        continue;
      }
      const row = from.row + 1;
      const key = placementKey(sheet.name, row, field);
      const existing = placements.get(key) ?? [];
      existing.push(imagePart);
      placements.set(key, existing);
    }
  }
  for (const [key, imageParts] of placements) {
    if (imageParts.length > 1) {
      const [sheetName, rowPart, fieldName] = key.split("\u0000");
      issues.push(structureIssue("xlsx_multiple_images_in_slot", Number(rowPart), fieldName, sheetName));
    }
  }
  return { issues, placements };
}

function parseXlsxPackageStructure(input: Uint8Array, signal?: AbortSignal): XlsxPackageStructure {
  const packageParts = parseZipPackage(input, signal);
  parseContentTypes(packageParts, signal);
  parseXmlRelationshipsInPackage(packageParts, signal);
  const sheets = parsePackageSheets(packageParts, signal);
  if (sheets.length > QUESTION_BANK_XLSX_LIMITS.worksheets) {
    throw new WorkbookIssueError([structureIssue("xlsx_worksheet_limit_exceeded")]);
  }
  const sheetParts = new Map<string, Buffer>();
  const preflightBySheet = new Map<string, WorkbookRead>();
  for (const sheet of sheets) {
    if (signal?.aborted) throw signal.reason ?? new ImageSourceError("attempt_cancelled");
    const entry = packageParts.get(sheet.part);
    if (!entry) throw new OoxmlParseError();
    sheetParts.set(sheet.name, entry.bytes);
    const preflight = preflightWorksheet(entry.bytes, sheet.name, signal);
    preflightBySheet.set(sheet.name, preflight);
  }

  return { packageParts, preflightBySheet, sheetParts, sheets };
}

function parseXlsxQuestionWorkbookStructure(
  packageStructure: XlsxPackageStructure,
  layouts: readonly XlsxQuestionSheetLayout[],
  signal?: AbortSignal,
) {
  const { packageParts, preflightBySheet, sheets } = packageStructure;
  const issues: QuestionBankXlsxIssue[] = [];
  const embeddedMedia = new Map<string, Buffer>();
  const drawingPlacements = new Map<string, string[]>();
  const questionRowsBySheet = new Map<string, number[]>();
  const sheetByName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  for (const layout of layouts) {
    if (signal?.aborted) throw signal.reason ?? new ImageSourceError("attempt_cancelled");
    const sheet = sheetByName.get(layout.sheetName);
    const preflight = preflightBySheet.get(layout.sheetName);
    if (!sheet || !preflight) throw new OoxmlParseError();
    for (const formula of preflight.formulaCells) {
      const field = layout.importFieldColumns.get(formula.column);
      if (formula.row > layout.headerRow && field) {
        issues.push(structureIssue("xlsx_formula_disallowed", formula.row, field, layout.sheetName));
      }
    }
    questionRowsBySheet.set(layout.sheetName, [...preflight.populatedRows]
      .filter((row) => row > layout.headerRow)
      .sort((left, right) => left - right));
    const parsed = parseSheetDrawings(packageParts, sheet, layout, signal);
    issues.push(...parsed.issues);
    for (const [slot, imageParts] of parsed.placements) {
      drawingPlacements.set(slot, [...(drawingPlacements.get(slot) ?? []), ...imageParts]);
    }
  }
  if (packageParts.rawImageSourceBytesExceeded) {
    for (const [slot, imageParts] of drawingPlacements) {
      if (!imageParts.length) continue;
      const [sheetName, rowText, field] = slot.split("\u0000");
      issues.push(structureIssue("xlsx_total_image_source_bytes_exceeded", Number(rowText), field, sheetName));
    }
    if (!issues.some((issue) => issue.code === "xlsx_total_image_source_bytes_exceeded")) {
      issues.push(structureIssue("xlsx_total_image_source_bytes_exceeded", undefined, "image"));
    }
  } else {
    for (const imageParts of drawingPlacements.values()) {
      for (const imagePart of imageParts) {
        const bytes = packageParts.get(imagePart)?.bytes;
        if (!bytes) throw new OoxmlParseError();
        embeddedMedia.set(imagePart, bytes);
      }
    }
  }
  for (const key of drawingPlacements.keys()) {
    const [sheetName, rowText] = key.split("\u0000");
    const row = Number(rowText);
    if (!Number.isSafeInteger(row) || !sheetName) continue;
    const rows = questionRowsBySheet.get(sheetName) ?? [];
    if (!rows.includes(row)) rows.push(row);
    rows.sort((left, right) => left - right);
    questionRowsBySheet.set(sheetName, rows);
  }
  return {
    drawingPlacements,
    embeddedMedia,
    issues,
    questionRowsBySheet,
    rawImageSourceBytes: packageParts.rawImageSourceBytes,
    rawImageSourceBytesExceeded: packageParts.rawImageSourceBytesExceeded,
  };
}

function textFromExcelCell(value: ExcelJS.CellValue | undefined | null): { text: string; invalid: boolean } {
  if (value === null || value === undefined) return { invalid: false, text: "" };
  if (typeof value === "string") return { invalid: false, text: value };
  if (typeof value === "number" && Number.isFinite(value)) return { invalid: false, text: String(value) };
  if (typeof value === "boolean") return { invalid: true, text: "" };
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return { invalid: false, text: value.richText.map((run) => run.text).join("") };
  }
  return { invalid: true, text: "" };
}

function normalizeQuestionSheetHeader(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("id-ID");
}

const STAKEHOLDER_HEADER_FIELDS = new Map<string, string>([
  ["no soal", "source_question_id"],
  ["no. soal", "source_question_id"],
  ["nomor soal", "source_question_id"],
  ["materi", "materi"],
  ["komponen", "component"],
  ["level", "difficulty"],
  ["pertanyaan / soal", "prompt"],
  ["pertanyaan/soal", "prompt"],
  ["opsi a", "option_a"],
  ["opsi b", "option_b"],
  ["opsi c", "option_c"],
  ["opsi d", "option_d"],
  ["opsi e", "option_e"],
  ["kunci jawaban", "correct_options"],
  ["pembahasan", "explanation"],
  ["status", "status"],
  ["pic", "pic"],
  ["catatan", "notes"],
]);

function buildQuestionSheetLayout(
  worksheet: ExcelJS.Worksheet,
  headerRow: number,
  kind: XlsxQuestionSheetLayout["kind"],
  headerValues: readonly string[],
) {
  const columns = new Map<string, number>();
  const fieldByColumn = new Map<number, string>();
  const imageFieldByColumn = new Map<number, string>();
  const imageUrlFieldByField = new Map<string, number>();
  const importFieldColumns = new Map<number, string>();
  for (const [index, header] of headerValues.entries()) {
    const column = index + 1;
    if (!header) continue;
    const normalized = normalizeQuestionSheetHeader(header);
    const field = kind === "legacy"
      ? QUESTION_BANK_XLSX_HEADER.find((value) => value === normalized)
      : STAKEHOLDER_HEADER_FIELDS.get(normalized);
    if (!field) continue;
    columns.set(field, column);
    fieldByColumn.set(column, field);
    if (kind === "legacy" && QUESTION_BANK_CSV_HEADER.includes(field as (typeof QUESTION_BANK_CSV_HEADER)[number])) {
      importFieldColumns.set(column, field);
    } else if (kind === "legacy" && IMAGE_FIELDS.includes(field as (typeof IMAGE_FIELDS)[number])) {
      importFieldColumns.set(column, field);
      imageFieldByColumn.set(column - 1, field);
      imageUrlFieldByField.set(field, column);
    } else if (kind === "stakeholder" && !["source_question_id", "component", "status", "pic", "notes"].includes(field)) {
      importFieldColumns.set(column, field);
      if (field === "prompt") imageFieldByColumn.set(column - 1, "prompt_image");
      if (/^option_[a-e]$/u.test(field)) imageFieldByColumn.set(column - 1, `${field}_image`);
    }
  }
  return {
    columns,
    fieldByColumn,
    headerRow,
    imageFieldByColumn,
    imageUrlFieldByField,
    importFieldColumns,
    kind,
    sheetName: worksheet.name,
  } satisfies XlsxQuestionSheetLayout;
}

function detectQuestionSheetLayouts(workbook: ExcelJS.Workbook) {
  const layouts: XlsxQuestionSheetLayout[] = [];
  const issues: QuestionBankXlsxIssue[] = [];
  for (const worksheet of workbook.worksheets) {
    let candidate: { headerRow: number; values: string[]; kind: "legacy" | "stakeholder" } | null = null;
    let malformedCandidateRow: number | null = null;
    const scanLimit = Math.min(20, Math.max(worksheet.rowCount, 1));
    for (let rowNumber = 1; rowNumber <= scanLimit; rowNumber += 1) {
      const values = Array.from({ length: QUESTION_BANK_XLSX_LIMITS.worksheetColumns }, (_, index) => {
        const parsed = textFromExcelCell(worksheet.getCell(rowNumber, index + 1).value);
        return parsed.invalid ? "" : parsed.text.trim();
      });
      if (values.length >= QUESTION_BANK_XLSX_HEADER.length
        && QUESTION_BANK_XLSX_HEADER.every((field, index) => values[index] === field)) {
        candidate = { headerRow: rowNumber, kind: "legacy", values };
        break;
      }

      const headers = new Set(values.map(normalizeQuestionSheetHeader));
      const hasSourceQuestionNumber = headers.has("no soal")
        || headers.has("no. soal")
        || headers.has("nomor soal");
      const hasPrompt = headers.has("pertanyaan / soal") || headers.has("pertanyaan/soal");
      const hasOptionA = headers.has("opsi a");
      const looksLikeQuestionSheet = (hasPrompt && (hasOptionA || headers.has("level") || headers.has("kunci jawaban")))
        || (hasSourceQuestionNumber && (hasPrompt || hasOptionA));
      if (looksLikeQuestionSheet) {
        const mappedFields = values.map((value) => STAKEHOLDER_HEADER_FIELDS.get(normalizeQuestionSheetHeader(value)) ?? "");
        const mapped = new Set(mappedFields);
        const recognized = mappedFields.filter(Boolean);
        const hasDuplicateMappedHeader = new Set(recognized).size !== recognized.length;
        if (
          hasSourceQuestionNumber
          && hasPrompt
          && hasOptionA
          && mapped.has("difficulty")
          && mapped.has("option_b")
          && mapped.has("correct_options")
          && !hasDuplicateMappedHeader
        ) {
          candidate = { headerRow: rowNumber, kind: "stakeholder", values };
        } else {
          malformedCandidateRow = rowNumber;
        }
        break;
      }
    }
    if (candidate) {
      layouts.push(buildQuestionSheetLayout(worksheet, candidate.headerRow, candidate.kind, candidate.values));
    } else if (malformedCandidateRow !== null || worksheet.name === "Soal") {
      issues.push(structureIssue("xlsx_header_invalid", malformedCandidateRow ?? undefined, undefined, worksheet.name));
    }
  }
  if (!layouts.length && !issues.length) issues.push(structureIssue("xlsx_question_sheet_missing"));
  return { issues, layouts };
}

function subjectCodeForMateri(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  for (const [subjectCode, options] of Object.entries(QUESTION_BANK_MATERI_OPTIONS)) {
    if ((options as readonly string[]).includes(normalized)) return subjectCode;
  }
  return null;
}

function subjectCodeForSourceLabel(value: string) {
  const match = /^([A-Z]{2,3})[-_]/u.exec(value.trim().toUpperCase());
  const candidate = match?.[1];
  return candidate && candidate in QUESTION_BANK_MATERI_OPTIONS ? candidate : null;
}

function subjectCodeForSheetName(value: string) {
  const names = Object.keys(QUESTION_BANK_MATERI_OPTIONS).sort((left, right) => right.length - left.length);
  for (const subjectCode of names) {
    if (new RegExp(`(?:^|[^A-Z])${subjectCode}(?=$|[^A-Z])`, "u").test(value.toUpperCase())) return subjectCode;
  }
  return null;
}

function inferWorkbookSubjectCode(
  workbook: ExcelJS.Workbook,
  layouts: readonly XlsxQuestionSheetLayout[],
  questionRowsBySheet: Map<string, number[]>,
) {
  const candidates = new Set<string>();
  for (const layout of layouts) {
    const sheetCode = subjectCodeForSheetName(layout.sheetName);
    if (sheetCode) candidates.add(sheetCode);
    const worksheet = workbook.getWorksheet(layout.sheetName);
    if (!worksheet) continue;
    for (const row of questionRowsBySheet.get(layout.sheetName) ?? []) {
      const sourceColumn = layout.columns.get("source_question_id");
      const sourceText = sourceColumn === undefined ? "" : textFromExcelCell(worksheet.getCell(row, sourceColumn).value).text;
      const sourceCode = subjectCodeForSourceLabel(sourceText);
      if (sourceCode) candidates.add(sourceCode);
      const materiColumn = layout.columns.get("materi");
      const materiText = materiColumn === undefined ? "" : textFromExcelCell(worksheet.getCell(row, materiColumn).value).text;
      const materiCode = subjectCodeForMateri(materiText);
      if (materiCode) candidates.add(materiCode);
    }
  }
  return candidates.size === 1 ? [...candidates][0]! : null;
}

function normalizeStakeholderDifficulty(value: string) {
  switch (normalizeQuestionSheetHeader(value)) {
    case "ringan":
    case "mudah":
    case "easy":
      return "easy";
    case "sedang":
    case "menengah":
    case "medium":
      return "medium";
    case "sulit":
    case "berat":
    case "hard":
      return "hard";
    default:
      return value.trim();
  }
}

function normalizeStakeholderAnswerKey(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return { correctOptions: "", questionType: "" };
  const tokens = normalized.split(/[\s,;/|+&]+/u).filter(Boolean);
  const answers = tokens.length === 1 && /^[A-E]{2,5}$/u.test(tokens[0]!)
    ? [...tokens[0]!]
    : tokens;
  if (!answers.length || answers.some((answer) => !/^[A-E]$/u.test(answer))) {
    return { correctOptions: value, questionType: answers.length > 1 ? "multiple_choice" : "single_choice" };
  }
  return {
    correctOptions: answers.join("|"),
    questionType: answers.length > 1 ? "multiple_choice" : "single_choice",
  };
}

function csvFieldToQuestionSheetField(field: string) {
  if (field.endsWith("_media_asset_id")) return field.replace(/_media_asset_id$/u, "_image");
  return field;
}

function normalizeXlsxOptionText(value: string) {
  return value.replace(/^\s*[A-E]\s*[.)]\s*/iu, "").trimStart();
}

function isXlsxOptionField(field: string) {
  return /^option_[a-e]$/u.test(field);
}

function xlsxToCsvRecords(
  worksheet: ExcelJS.Worksheet,
  layout: XlsxQuestionSheetLayout,
  rowNumbers: readonly number[],
  placements: Map<string, string[]>,
  workbookSubjectCode: string | null,
  signal?: AbortSignal,
) {
  const issues: QuestionBankXlsxIssue[] = [];
  const records: string[][] = [[...QUESTION_BANK_CSV_HEADER]];
  const recordRows = new Map<number, QuestionBankXlsxWorksheetRowRef>();
  let imageUrlCount = 0;
  const imageSlotsForSheet = new Set([...placements.keys()].filter((key) => key.startsWith(`${layout.sheetName}\u0000`)));
  for (const row of rowNumbers) {
    throwIfRequestAborted(signal);
    if (row <= layout.headerRow) continue;
    if (layout.kind === "stakeholder") {
      const sourceQuestionIdColumn = layout.columns.get("source_question_id");
      if (sourceQuestionIdColumn && worksheet.getCell(row, sourceQuestionIdColumn).isMerged) continue;
    }
    const rawFields = new Map<string, string>();
    for (const [field, column] of layout.columns) {
      if (!layout.importFieldColumns.has(column) && field !== "source_question_id") continue;
      const parsed = textFromExcelCell(worksheet.getCell(row, column).value);
      if (parsed.invalid && layout.importFieldColumns.has(column)) {
        issues.push(structureIssue("xlsx_cell_value_invalid", row, field, layout.sheetName));
      }
      rawFields.set(field, parsed.text);
    }

    const values = Array.from({ length: QUESTION_BANK_CSV_HEADER.length }, () => "");
    if (layout.kind === "legacy") {
      for (const csvField of QUESTION_BANK_CSV_HEADER) {
        const xlsxField = csvFieldToQuestionSheetField(csvField);
        if (IMAGE_FIELDS.includes(xlsxField as (typeof IMAGE_FIELDS)[number])) continue;
        const csvIndex = QUESTION_BANK_CSV_HEADER.indexOf(csvField);
        const value = rawFields.get(xlsxField) ?? "";
        values[csvIndex] = isXlsxOptionField(xlsxField)
          ? normalizeXlsxOptionText(value)
          : value;
      }
    } else {
      const sourceLabel = rawFields.get("source_question_id") ?? "";
      const materi = rawFields.get("materi") ?? "";
      const rowSubjectCode = subjectCodeForSourceLabel(sourceLabel)
        ?? subjectCodeForMateri(materi)
        ?? subjectCodeForSheetName(layout.sheetName)
        ?? workbookSubjectCode
        ?? "";
      const answer = normalizeStakeholderAnswerKey(rawFields.get("correct_options") ?? "");
      const mappedFields: Record<string, string> = {
        subject_code: rowSubjectCode,
        materi,
        difficulty: normalizeStakeholderDifficulty(rawFields.get("difficulty") ?? ""),
        question_type: answer.questionType,
        prompt: rawFields.get("prompt") ?? "",
        option_a: normalizeXlsxOptionText(rawFields.get("option_a") ?? ""),
        option_b: normalizeXlsxOptionText(rawFields.get("option_b") ?? ""),
        option_c: normalizeXlsxOptionText(rawFields.get("option_c") ?? ""),
        option_d: normalizeXlsxOptionText(rawFields.get("option_d") ?? ""),
        option_e: normalizeXlsxOptionText(rawFields.get("option_e") ?? ""),
        correct_options: answer.correctOptions,
        explanation: rawFields.get("explanation") ?? "",
      };
      for (const [field, value] of Object.entries(mappedFields)) {
        const index = QUESTION_BANK_CSV_HEADER.indexOf(field as (typeof QUESTION_BANK_CSV_HEADER)[number]);
        if (index >= 0) values[index] = value;
      }
    }

    let rowHasImageUrl = false;
    for (const [imageField, column] of layout.imageUrlFieldByField) {
      const urlValue = rawFields.get(imageField)?.trim() ?? "";
      const key = placementKey(layout.sheetName, row, imageField);
      const imageParts = placements.get(key) ?? [];
      if (imageParts.length > 1) continue;
      if (urlValue && imageParts.length) {
        issues.push(structureIssue("xlsx_image_slot_conflict", row, imageField, layout.sheetName));
        continue;
      }
      if (!urlValue) continue;
      rowHasImageUrl = true;
      if (urlValue.length > QUESTION_BANK_XLSX_LIMITS.imageUrlMaxChars) {
        issues.push(structureIssue("xlsx_image_url_too_long", row, imageField, layout.sheetName));
        continue;
      }
      if (/\s/u.test(urlValue) || /[\u0000-\u001f\u007f]/u.test(worksheet.getCell(row, column).text)) {
        issues.push(structureIssue("xlsx_image_url_invalid", row, imageField, layout.sheetName));
        continue;
      }
      let url: URL;
      try {
        url = new URL(urlValue);
      } catch {
        issues.push(structureIssue("xlsx_image_url_invalid", row, imageField, layout.sheetName));
        continue;
      }
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash || (url.port && url.port !== "443")) {
        issues.push(structureIssue("xlsx_image_url_unsafe", row, imageField, layout.sheetName));
        continue;
      }
      imageUrlCount += 1;
    }

    const rowHasPlacement = [...layout.imageFieldByColumn.values()].some((field) =>
      imageSlotsForSheet.has(placementKey(layout.sheetName, row, field)),
    );
    const hasQuestionContent = layout.kind === "stakeholder"
      ? ["prompt", "option_a", "option_b", "option_c", "option_d", "option_e", "correct_options", "explanation"]
        .some((field) => (rawFields.get(field) ?? "").trim())
      : [...rawFields.values()].some((value) => value.trim());
    if (!hasQuestionContent && !rowHasImageUrl && !rowHasPlacement) continue;

    // Asset IDs are represented only by the frozen image manifest, never by
    // worksheet cell values.
    for (const imageField of IMAGE_FIELDS) {
      const csvMediaField = imageField.replace(/_image$/u, "_media_asset_id");
      const index = QUESTION_BANK_CSV_HEADER.indexOf(csvMediaField as (typeof QUESTION_BANK_CSV_HEADER)[number]);
      if (index >= 0) values[index] = "";
    }
    recordRows.set(records.length + 1, { row, sheetName: layout.sheetName });
    records.push(values);
  }
  if (imageUrlCount > QUESTION_BANK_XLSX_LIMITS.externalImageUrls) {
    issues.push(structureIssue("xlsx_image_url_limit_exceeded", undefined, undefined, layout.sheetName));
  }
  return { imageUrlCount, issues, recordRows, records };
}

function isIpv4AddressPublic(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts as [number, number, number, number];
  return !(
    a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
  );
}

function parseIpv6BigInt(address: string) {
  const normalized = address.toLowerCase().split("%")[0]!;
  let parts: string[];
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    if (lastColon < 0) return null;
    const v4 = normalized.slice(lastColon + 1).split(".").map(Number);
    if (v4.length !== 4 || v4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    const hi = ((v4[0]! << 8) | v4[1]!).toString(16);
    const lo = ((v4[2]! << 8) | v4[3]!).toString(16);
    const replacement = `${hi}:${lo}`;
    return parseIpv6BigInt(`${normalized.slice(0, lastColon)}:${replacement}`);
  }
  if (normalized.includes("::")) {
    const split = normalized.split("::");
    if (split.length !== 2) return null;
    const before = split[0] ? split[0]!.split(":") : [];
    const after = split[1] ? split[1]!.split(":") : [];
    const missing = 8 - before.length - after.length;
    if (missing < 1) return null;
    parts = [...before, ...Array.from({ length: missing }, () => "0"), ...after];
  } else {
    parts = normalized.split(":");
  }
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/u.test(part))) return null;
  return parts.reduce((value, part) => (value << 16n) | BigInt(Number.parseInt(part, 16)), 0n);
}

function ipv6PrefixMatches(value: bigint, prefix: bigint, bits: number) {
  const shift = 128n - BigInt(bits);
  return (value >> shift) === (prefix >> shift);
}

function isIpv6AddressPublic(address: string) {
  const value = parseIpv6BigInt(address);
  if (value === null) return false;
  const globalUnicast = ipv6PrefixMatches(value, 0x20000000000000000000000000000000n, 3);
  const protocolSpecial = ipv6PrefixMatches(value, 0x20010000000000000000000000000000n, 23);
  const documentationV6 = ipv6PrefixMatches(value, 0x20010db8000000000000000000000000n, 32);
  const transition = ipv6PrefixMatches(value, 0x20020000000000000000000000000000n, 16);
  const documentation = ipv6PrefixMatches(value, 0x3fff0000000000000000000000000000n, 20);
  const mappedV4 = ipv6PrefixMatches(value, 0x00000000000000000000ffff00000000n, 96);
  return globalUnicast && !protocolSpecial && !documentationV6 && !transition && !documentation && !mappedV4;
}

function isPublicAddress(address: string, family: number) {
  return family === 4 ? isIpv4AddressPublic(address) : family === 6 && isIpv6AddressPublic(address);
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new ImageSourceError("attempt_cancelled"));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason instanceof Error ? signal.reason : new ImageSourceError("attempt_cancelled"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    }, (error: unknown) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

async function resolvePublicHttpsAddress(hostname: string, signal: AbortSignal) {
  const normalizedHostname = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const ipFamily = isIP(normalizedHostname);
  let addresses: Array<{ address: string; family: number }>;
  if (ipFamily) {
    addresses = [{ address: normalizedHostname, family: ipFamily }];
  } else {
    try {
      addresses = await raceWithAbort(
        lookup(normalizedHostname, { all: true, verbatim: true }),
        signal,
      );
    } catch (error) {
      if (signal.aborted) throw new ImageSourceError("xlsx_image_fetch_timeout");
      if (error instanceof ImageSourceError) throw error;
      throw new ImageSourceError("xlsx_image_fetch_failed");
    }
  }
  if (
    !addresses.length
    || addresses.length > MAX_IP_FETCH_ADDRESS_COUNT
    || addresses.some(({ address, family }) => !isPublicAddress(address, family))
  ) {
    throw new ImageSourceError("xlsx_image_url_unsafe");
  }
  return addresses[0]!;
}

class ImageSourceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ImageSourceError";
  }
}

function createImageSourceByteBudget(initialBytes: number, abort: (reason: Error) => void): ImageSourceByteBudget {
  const budget: ImageSourceByteBudget = {
    exceeded: initialBytes > QUESTION_BANK_XLSX_LIMITS.totalRawImageSourceBytes,
    usedBytes: initialBytes,
    reserve(bytes) {
      if (
        !Number.isSafeInteger(bytes)
        || bytes < 0
        || bytes > QUESTION_BANK_XLSX_LIMITS.totalRawImageSourceBytes - budget.usedBytes
      ) {
        const error = new ImageSourceError("xlsx_total_image_source_bytes_exceeded");
        budget.exceeded = true;
        abort(error);
        throw error;
      }
      budget.usedBytes += bytes;
    },
  };
  return budget;
}

function throwIfRequestAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new ImageSourceError("attempt_cancelled");
}

function fetchHttpsImage(
  url: URL,
  deadlineSignal: AbortSignal,
  sourceBudget: ImageSourceByteBudget,
): Promise<FetchImageResult> {
  return new Promise((resolve, reject) => {
    void (async () => {
      const { request: httpsRequest } = await import("node:https");
      let currentUrl = new URL(url);
      for (let redirectCount = 0; redirectCount <= QUESTION_BANK_XLSX_LIMITS.maxRedirects; redirectCount += 1) {
        throwIfRequestAborted(deadlineSignal);
        const hopController = new AbortController();
        const relayTotalAbort = () => hopController.abort(deadlineSignal.reason ?? new ImageSourceError("attempt_cancelled"));
        deadlineSignal.addEventListener("abort", relayTotalAbort, { once: true });
        const hopTimeout = setTimeout(() => hopController.abort(new ImageSourceError("xlsx_image_fetch_timeout")), QUESTION_BANK_XLSX_LIMITS.urlRequestTimeoutMs);
        let response: {
          headers: import("node:http").IncomingHttpHeaders;
          statusCode: number;
          body: Buffer;
        };
        try {
          const address = await resolvePublicHttpsAddress(currentUrl.hostname, hopController.signal);
          response = await new Promise<{
            headers: import("node:http").IncomingHttpHeaders;
            statusCode: number;
            body: Buffer;
          }>((innerResolve, innerReject) => {
          const request = httpsRequest({
            agent: false,
            family: address.family,
            headers: { Accept: "image/jpeg,image/png,image/webp,image/gif", Host: currentUrl.host },
            // Dial the vetted numeric address directly so the socket cannot
            // resolve the original hostname again after the DNS check.
            hostname: address.address,
            method: "GET",
            path: `${currentUrl.pathname}${currentUrl.search}`,
            port: 443,
            servername: isIP(currentUrl.hostname.replace(/^\[|\]$/gu, "")) ? undefined : currentUrl.hostname,
            signal: hopController.signal,
          }, (incoming) => {
            const statusCode = incoming.statusCode ?? 0;
            if (statusCode >= 300 && statusCode < 400 && incoming.headers.location) {
              incoming.destroy();
              innerResolve({ body: Buffer.alloc(0), headers: incoming.headers, statusCode });
              return;
            }
            if (statusCode < 200 || statusCode >= 300) {
              incoming.destroy();
              innerResolve({ body: Buffer.alloc(0), headers: incoming.headers, statusCode });
              return;
            }
            const contentLength = Number(incoming.headers["content-length"]);
            if (Number.isFinite(contentLength) && contentLength > QUESTION_BANK_XLSX_LIMITS.imageBytes) {
              const error = new ImageSourceError("xlsx_image_too_large");
              incoming.destroy(error);
              innerReject(error);
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            incoming.on("data", (chunk: Buffer | Uint8Array) => {
              const chunkLength = chunk.byteLength;
              try {
                // Event callbacks execute serially on this thread, so reserve
                // before copying/retaining each concurrent response chunk.
                sourceBudget.reserve(chunkLength);
              } catch (error) {
                incoming.destroy(error instanceof Error ? error : new ImageSourceError("xlsx_total_image_source_bytes_exceeded"));
                innerReject(error);
                return;
              }
              size += chunkLength;
              if (size > QUESTION_BANK_XLSX_LIMITS.imageBytes) {
                const error = new ImageSourceError("xlsx_image_too_large");
                incoming.destroy(error);
                innerReject(error);
                return;
              }
              chunks.push(Buffer.from(chunk));
            });
            incoming.on("end", () => innerResolve({
              body: Buffer.concat(chunks, size),
              headers: incoming.headers,
              statusCode,
            }));
            incoming.on("error", innerReject);
          });
          request.setTimeout(QUESTION_BANK_XLSX_LIMITS.urlRequestTimeoutMs, () => request.destroy(new ImageSourceError("xlsx_image_fetch_timeout")));
          request.on("error", innerReject);
          request.end();
          });
        } catch (error) {
          if (deadlineSignal.aborted) {
            throw deadlineSignal.reason instanceof Error ? deadlineSignal.reason : new ImageSourceError("attempt_cancelled");
          }
          if (hopController.signal.aborted) {
            throw hopController.signal.reason instanceof Error ? hopController.signal.reason : new ImageSourceError("xlsx_image_fetch_timeout");
          }
          throw error;
        } finally {
          clearTimeout(hopTimeout);
          deadlineSignal.removeEventListener("abort", relayTotalAbort);
        }
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          if (redirectCount === QUESTION_BANK_XLSX_LIMITS.maxRedirects) {
            throw new ImageSourceError("xlsx_image_redirect_limit");
          }
          const redirected = new URL(response.headers.location, currentUrl);
          if (
            redirected.protocol !== "https:"
            || redirected.username
            || redirected.password
            || redirected.hash
            || (redirected.port && redirected.port !== "443")
          ) {
            throw new ImageSourceError("xlsx_image_url_unsafe");
          }
          currentUrl = redirected;
          continue;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw new ImageSourceError("xlsx_image_fetch_failed");
        }
        const contentTypeValue = response.headers["content-type"];
        if (Array.isArray(contentTypeValue)) throw new ImageSourceError("xlsx_image_type_mismatch");
        return {
          bytes: response.body,
          contentType: (contentTypeValue ?? "").split(";")[0]!.trim().toLowerCase(),
        };
      }
      throw new ImageSourceError("xlsx_image_redirect_limit");
    })().then(resolve, reject);
  });
}

function contentTypeForImageBytes(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (
    bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "image/webp";
  return null;
}

async function validateAndThumbnailImage(bytes: Buffer, signal?: AbortSignal) {
  throwIfRequestAborted(signal);
  if (bytes.byteLength === 0 || bytes.byteLength > QUESTION_BANK_XLSX_LIMITS.imageBytes) {
    throw new ImageSourceError("xlsx_image_too_large");
  }
  const mimeType = contentTypeForImageBytes(bytes);
  if (!mimeType) throw new ImageSourceError("xlsx_image_type_unsupported");
  try {
    const image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: QUESTION_BANK_XLSX_LIMITS.imagePixelCount,
    });
    const metadata = await image.metadata();
    throwIfRequestAborted(signal);
    if (
      !metadata.width
      || !metadata.height
      || metadata.width > QUESTION_BANK_XLSX_LIMITS.imageMaxDimension
      || metadata.height > QUESTION_BANK_XLSX_LIMITS.imageMaxDimension
      || metadata.width * metadata.height > QUESTION_BANK_XLSX_LIMITS.imagePixelCount
      || !["jpeg", "png", "webp", "gif"].includes(metadata.format ?? "")
      || ({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" } as Record<string, string>)[metadata.format ?? ""] !== mimeType
    ) {
      throw new ImageSourceError("xlsx_image_dimensions_invalid");
    }
    const rendered = await sharp(bytes, {
      failOn: "warning",
      limitInputPixels: QUESTION_BANK_XLSX_LIMITS.imagePixelCount,
    })
      .rotate()
      .resize({
        fit: "inside",
        height: QUESTION_BANK_XLSX_LIMITS.thumbnailHeight,
        withoutEnlargement: true,
        width: QUESTION_BANK_XLSX_LIMITS.thumbnailWidth,
      })
      .webp({ quality: 72, effort: 3 })
      .toBuffer();
    throwIfRequestAborted(signal);
    if (rendered.byteLength > QUESTION_BANK_XLSX_LIMITS.thumbnailBytes) {
      throw new ImageSourceError("xlsx_thumbnail_too_large");
    }
    return { height: metadata.height, mimeType, thumbnail: rendered, width: metadata.width };
  } catch (error) {
    if (signal?.aborted) throw new ImageSourceError("attempt_cancelled");
    if (error instanceof ImageSourceError) throw error;
    throw new ImageSourceError("xlsx_image_invalid");
  }
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  limit: number,
  task: (value: T, index: number) => Promise<R>,
  signal?: AbortSignal,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  let firstError: unknown;
  let workerFailed = false;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      if (signal?.aborted || workerFailed) return;
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      try {
        results[index] = await task(values[index]!, index);
      } catch (error) {
        if (!workerFailed) firstError = error;
        workerFailed = true;
        return;
      }
    }
  });
  await Promise.all(workers);
  if (workerFailed) throw firstError;
  return results;
}

function fingerprint(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function createImageSources(
  workbook: ExcelJS.Workbook,
  layouts: readonly XlsxQuestionSheetLayout[],
  questionRowsBySheet: ReadonlyMap<string, readonly number[]>,
  embeddedMedia: ReadonlyMap<string, Buffer>,
  drawingPlacements: Map<string, string[]>,
  imageUrlCount: number,
  initialIssues: QuestionBankXlsxIssue[],
  signal?: AbortSignal,
) {
  const sources = new Map<string, ImageSource & { url?: URL }>();
  const allImageSlots: QuestionBankXlsxImagePlacement[] = [];
  for (const [key, mediaParts] of drawingPlacements) {
    throwIfRequestAborted(signal);
    if (mediaParts.length !== 1) continue;
    const [sheetName, rowText, field] = key.split("\u0000");
    const row = Number(rowText);
    const mediaPart = mediaParts[0]!;
    const bytes = embeddedMedia.get(mediaPart);
    if (!bytes) continue;
    const sourceKey = `part:${mediaPart}`;
    const source = sources.get(sourceKey) ?? {
      bytes,
      mimeType: "",
      placements: [],
      sourceUrlFingerprints: [],
    };
    source.placements.push({ field: field!, row, sheetName: sheetName! });
    sources.set(sourceKey, source);
    allImageSlots.push({ field: field!, row, sheetName: sheetName! });
  }

  let urlPlacements = 0;
  for (const layout of layouts) {
    if (layout.kind !== "legacy") continue;
    const worksheet = workbook.getWorksheet(layout.sheetName);
    if (!worksheet) throw new OoxmlParseError();
    for (const row of questionRowsBySheet.get(layout.sheetName) ?? []) {
      throwIfRequestAborted(signal);
      if (row <= layout.headerRow) continue;
      for (const [field, column] of layout.imageUrlFieldByField) {
        const cell = worksheet.getCell(row, column);
        const parsed = textFromExcelCell(cell.value);
        const value = parsed.text.trim();
        if (!value) continue;
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          continue;
        }
        if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) continue;
        urlPlacements += 1;
        const key = placementKey(layout.sheetName, row, field);
        if (drawingPlacements.has(key)) continue;
        // Each URL cell is a raw source even when another cell contains the
        // same address; content hashing deduplicates only after bounded reads.
        const sourceKey = `url:${layout.sheetName}:${row}:${field}`;
        const source = sources.get(sourceKey) ?? {
          bytes: Buffer.alloc(0),
          mimeType: "",
          placements: [],
          sourceUrlFingerprints: [fingerprint(url.href)],
          url,
        };
        source.placements.push({ field, row, sheetName: layout.sheetName });
        sources.set(sourceKey, source);
        allImageSlots.push({ field, row, sheetName: layout.sheetName });
      }
    }
  }
  if (urlPlacements !== imageUrlCount) {
    initialIssues.push(structureIssue("xlsx_image_source_invalid"));
  }
  return { allImageSlots, sources: [...sources.entries()] };
}

async function materializeImageSources(
  sourceEntries: Array<[string, ImageSource & { url?: URL }]>,
  externalImageUrlCount: number,
  initialEmbeddedBytes: number,
  requestSignal?: AbortSignal,
) {
  const deadlineController = new AbortController();
  const aggregateAbortController = new AbortController();
  const processingSignal = requestSignal
    ? AbortSignal.any([requestSignal, aggregateAbortController.signal])
    : aggregateAbortController.signal;
  const fetchSignal = AbortSignal.any([processingSignal, deadlineController.signal]);
  const sourceBudget = createImageSourceByteBudget(
    initialEmbeddedBytes,
    (reason) => aggregateAbortController.abort(reason),
  );
  const timer = sourceEntries.some(([, source]) => source.url)
    ? setTimeout(
      () => deadlineController.abort(new ImageSourceError("xlsx_image_fetch_timeout")),
      QUESTION_BANK_XLSX_LIMITS.urlFetchBudgetMs,
    )
    : null;
  const issues: QuestionBankXlsxIssue[] = [];
  const valid: Array<{ key: string; payload: QuestionBankXlsxPreviewImagePayload; thumbnail: Buffer }> = [];
  try {
    const outcomes = await mapConcurrent(sourceEntries, QUESTION_BANK_XLSX_LIMITS.maxConcurrentImageOperations, async ([key, source]) => {
      try {
        throwIfRequestAborted(processingSignal);
        if (sourceBudget.exceeded) throw new ImageSourceError("xlsx_total_image_source_bytes_exceeded");
        let bytes = source.bytes;
        if (source.url) {
          throwIfRequestAborted(fetchSignal);
          const response = await fetchHttpsImage(source.url, fetchSignal, sourceBudget);
          const sniffedMimeType = contentTypeForImageBytes(response.bytes);
          if (!sniffedMimeType || expectedMimeTypeForContentType(response.contentType) !== sniffedMimeType) {
            throw new ImageSourceError("xlsx_image_type_mismatch");
          }
          bytes = response.bytes;
        }
        if (sourceBudget.exceeded) throw new ImageSourceError("xlsx_total_image_source_bytes_exceeded");
        const processed = await validateAndThumbnailImage(bytes, processingSignal);
        throwIfRequestAborted(processingSignal);
        return {
          key,
          payload: {
            contentSha256: fingerprint(bytes),
            height: processed.height,
            mimeType: processed.mimeType,
            objectKey: "",
            placements: source.placements,
            sizeBytes: bytes.byteLength,
            sourceUrlFingerprints: source.sourceUrlFingerprints,
            width: processed.width,
            bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
          } satisfies QuestionBankXlsxPreviewImagePayload,
          thumbnail: processed.thumbnail,
        };
      } catch (error) {
        const code = error instanceof ImageSourceError
          ? error.code
          : fetchSignal.aborted && fetchSignal.reason instanceof ImageSourceError
            ? fetchSignal.reason.code
            : requestSignal?.aborted
              ? "attempt_cancelled"
            : source.url
              ? "xlsx_image_fetch_failed"
              : "xlsx_image_invalid";
        for (const placement of source.placements) {
          issues.push(structureIssue(code, placement.row, placement.field, placement.sheetName));
        }
        return null;
      }
    }, processingSignal);
    throwIfRequestAborted(requestSignal);
    if (sourceBudget.exceeded) {
      issues.length = 0;
      for (const [, source] of sourceEntries) {
        for (const placement of source.placements) {
          issues.push(structureIssue(
            "xlsx_total_image_source_bytes_exceeded",
            placement.row,
            placement.field,
            placement.sheetName,
          ));
        }
      }
      return {
        imagePayloads: [],
        issues,
        thumbnailByContentSha256: new Map<string, Buffer>(),
      };
    }
    if (fetchSignal.aborted && fetchSignal.reason instanceof ImageSourceError) {
      const abortedCode = fetchSignal.reason.code;
      for (let index = 0; index < outcomes.length; index += 1) {
        if (outcomes[index]) continue;
        const source = sourceEntries[index]?.[1];
        if (!source) continue;
        for (const placement of source.placements) {
          const hasIssue = issues.some((issue) =>
            issue.sheetName === placement.sheetName && issue.row === placement.row && issue.field === placement.field,
          );
          if (!hasIssue) issues.push(structureIssue(abortedCode, placement.row, placement.field, placement.sheetName));
        }
      }
    }
    for (const outcome of outcomes) if (outcome) valid.push(outcome);

    const byHash = new Map<string, typeof valid[number]>();
    for (const item of valid) {
      const previous = byHash.get(item.payload.contentSha256);
      if (previous) {
        previous.payload.placements.push(...item.payload.placements);
        previous.payload.sourceUrlFingerprints.push(...item.payload.sourceUrlFingerprints);
      } else {
        byHash.set(item.payload.contentSha256, item);
      }
    }
    const unique = [...byHash.values()];
    const totalPlacements = unique.reduce((sum, item) => sum + item.payload.placements.length, 0);
    const totalBytes = unique.reduce((sum, item) => sum + item.payload.sizeBytes, 0);
    if (unique.length > QUESTION_BANK_XLSX_LIMITS.zipImagePayloads) {
      issues.push(structureIssue("xlsx_unique_image_limit_exceeded"));
    }
    if (totalPlacements > QUESTION_BANK_XLSX_LIMITS.imagePlacements) {
      issues.push(structureIssue("xlsx_image_placement_limit_exceeded"));
    }
    if (totalBytes > QUESTION_BANK_XLSX_LIMITS.totalUniqueImageBytes) {
      issues.push(structureIssue("xlsx_total_image_bytes_exceeded"));
    }
    if (externalImageUrlCount > QUESTION_BANK_XLSX_LIMITS.externalImageUrls) {
      issues.push(structureIssue("xlsx_image_url_limit_exceeded"));
    }
    return {
      imagePayloads: unique.slice(0, QUESTION_BANK_XLSX_LIMITS.zipImagePayloads).map((item) => item.payload),
      issues,
      thumbnailByContentSha256: new Map(unique.map((item) => [item.payload.contentSha256, item.thumbnail])),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function expectedMimeTypeForContentType(contentType: string) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType) ? contentType : null;
}

function mapSharedCsvIssues(
  result: QuestionBankCsvParseResult,
  recordRows: Map<number, QuestionBankXlsxWorksheetRowRef>,
) {
  const structuralIssues: QuestionBankXlsxIssue[] = result.structuralErrors.map((issue) => {
    const reference = issue.row ? recordRows.get(issue.row) : undefined;
    return {
      code: `xlsx_${issue.code}`,
      field: csvFieldToXlsxField(issue.column),
      kind: "structural",
      reason: issue.reason,
      row: reference?.row,
      sheetName: reference?.sheetName,
    };
  });
  const rowIssues: QuestionBankXlsxIssue[] = result.rowErrors.map((issue) => {
    const reference = issue.row ? recordRows.get(issue.row) : undefined;
    return {
      code: `xlsx_${issue.code}`,
      field: csvFieldToXlsxField(issue.column),
      kind: "row",
      row: reference?.row,
      sheetName: reference?.sheetName,
    };
  });
  return { rowIssues, structuralIssues };
}

function summarizeWorkbook(
  semantic: QuestionBankCsvParseResult,
  rowIssues: readonly QuestionBankXlsxIssue[],
  structuralIssues: readonly QuestionBankXlsxIssue[],
  imageUrlCount: number,
  imageCount: number,
  imagePlacementCount: number,
  questionSheetCount: number,
): QuestionBankXlsxPreviewSummary {
  return {
    ...semantic.summary,
    externalImageUrlCount: imageUrlCount,
    imageCount,
    imagePlacementCount,
    questionSheetCount,
    rowErrorCount: rowIssues.length,
    structuralErrorCount: structuralIssues.length,
  };
}

function emptyWorkbookSummary(structuralErrorCount: number, questionSheetCount = 0): QuestionBankXlsxPreviewSummary {
  return {
    acceptedRows: 0,
    dataRowCount: 0,
    externalImageUrlCount: 0,
    imageCount: 0,
    imagePlacementCount: 0,
    questionSheetCount,
    rejectedRows: 0,
    rowErrorCount: 0,
    structuralErrorCount,
  };
}

async function parseQuestionBankXlsxWorkbook(input: Uint8Array, signal?: AbortSignal) {
  throwIfRequestAborted(signal);
  if (input.byteLength > QUESTION_BANK_XLSX_LIMITS.workbookBytes) {
    return {
      imagePayloads: [],
      issues: [structureIssue("xlsx_too_large")],
      manifest: null,
      normalizedRows: [],
      summary: emptyWorkbookSummary(1),
      thumbnails: [],
    };
  }

  let packageStructure: XlsxPackageStructure;
  let excelWorkbook: ExcelJS.Workbook;
  try {
    packageStructure = parseXlsxPackageStructure(input, signal);
    throwIfRequestAborted(signal);
    if (packageStructure.packageParts.rawImageSourceBytesExceeded) {
      const issues = [structureIssue("xlsx_total_image_source_bytes_exceeded", undefined, "image")];
      return {
        imagePayloads: [],
        issues,
        manifest: null,
        normalizedRows: [],
        summary: emptyWorkbookSummary(1),
        thumbnails: [],
      };
    }
    excelWorkbook = new ExcelJS.Workbook();
    const workbookArrayBuffer = new ArrayBuffer(input.byteLength);
    new Uint8Array(workbookArrayBuffer).set(input);
    // ExcelJS load has no cancellation hook. Await the actual promise instead
    // of racing it, so callers and the preview CPU permit remain held until its
    // parser work truly settles; the following check prevents later phases.
    await excelWorkbook.xlsx.load(workbookArrayBuffer);
    throwIfRequestAborted(signal);
  } catch (error) {
    if (signal?.aborted) throw new ImageSourceError("attempt_cancelled");
    if (error instanceof ImageSourceError && error.code === "attempt_cancelled") throw error;
    const issues = error instanceof WorkbookIssueError
      ? error.issues
      : [structureIssue(error instanceof OoxmlParseError && error.code === "xlsx_too_large" ? "xlsx_too_large" : "xlsx_structure_invalid")];
    return {
      imagePayloads: [],
      issues,
      manifest: null,
      normalizedRows: [],
      summary: emptyWorkbookSummary(issues.length),
      thumbnails: [],
    };
  }

  const detected = detectQuestionSheetLayouts(excelWorkbook);
  if (detected.issues.length || !detected.layouts.length) {
    const issues = detected.issues.length ? detected.issues : [structureIssue("xlsx_question_sheet_missing")];
    return {
      imagePayloads: [],
      issues,
      manifest: null,
      normalizedRows: [],
      summary: emptyWorkbookSummary(issues.length, detected.layouts.length),
      thumbnails: [],
    };
  }

  const questionStructure = parseXlsxQuestionWorkbookStructure(packageStructure, detected.layouts, signal);
  const layouts = detected.layouts;
  const questionSheetCount = layouts.length;
  const issues: QuestionBankXlsxIssue[] = [...questionStructure.issues];
  const drawingPlacements = questionStructure.drawingPlacements;
  const workbookSubjectCode = inferWorkbookSubjectCode(excelWorkbook, layouts, questionStructure.questionRowsBySheet);
  const combinedRecords: string[][] = [[...QUESTION_BANK_CSV_HEADER]];
  const recordRows = new Map<number, QuestionBankXlsxWorksheetRowRef>();
  let imageUrlCount = 0;
  throwIfRequestAborted(signal);
  for (const layout of layouts) {
    const worksheet = excelWorkbook.getWorksheet(layout.sheetName);
    if (!worksheet) throw new OoxmlParseError();
    const converted = xlsxToCsvRecords(
      worksheet,
      layout,
      questionStructure.questionRowsBySheet.get(layout.sheetName) ?? [],
      drawingPlacements,
      workbookSubjectCode,
      signal,
    );
    issues.push(...converted.issues);
    imageUrlCount += converted.imageUrlCount;
    for (let localCsvRow = 2; localCsvRow <= converted.records.length; localCsvRow += 1) {
      const reference = converted.recordRows.get(localCsvRow);
      if (!reference) throw new ImageSourceError("attempt_unavailable");
      const combinedCsvRow = combinedRecords.length + 1;
      combinedRecords.push(converted.records[localCsvRow - 1]!);
      recordRows.set(combinedCsvRow, reference);
    }
  }
  const csvResult = validateQuestionBankCsvRecords(
    combinedRecords,
    input.byteLength,
    [],
    false,
    QUESTION_BANK_XLSX_LIMITS.dataRows,
  );
  const semanticIssues = mapSharedCsvIssues(csvResult, recordRows);
  issues.push(...semanticIssues.structuralIssues, ...semanticIssues.rowIssues);
  const imageSources = createImageSources(
    excelWorkbook,
    layouts,
    questionStructure.questionRowsBySheet,
    questionStructure.embeddedMedia,
    drawingPlacements,
    imageUrlCount,
    issues,
    signal,
  );
  if (
    imageUrlCount > QUESTION_BANK_XLSX_LIMITS.externalImageUrls
    || imageSources.allImageSlots.length > QUESTION_BANK_XLSX_LIMITS.imagePlacements
  ) {
    if (imageSources.allImageSlots.length > QUESTION_BANK_XLSX_LIMITS.imagePlacements) {
      issues.push(structureIssue("xlsx_image_placement_limit_exceeded"));
    }
    const semanticRowIssues = issues.filter((issue) => issue.kind === "row");
    const structuralIssues = issues.filter((issue) => issue.kind === "structural");
    return {
      imagePayloads: [],
      issues,
      manifest: null,
      normalizedRows: [],
      summary: summarizeWorkbook(
        csvResult,
        semanticRowIssues,
        structuralIssues,
        imageUrlCount,
        0,
        imageSources.allImageSlots.length,
        questionSheetCount,
      ),
      thumbnails: [],
    };
  }
  const materialized = await materializeImageSources(
    imageSources.sources,
    imageUrlCount,
    questionStructure.rawImageSourceBytes,
    signal,
  );
  issues.push(...materialized.issues);
  const uniqueImages = materialized.imagePayloads;
  const placementToHash = new Map<string, string>();
  for (const image of uniqueImages) {
    for (const placement of image.placements) {
      placementToHash.set(placementKey(placement.sheetName, placement.row, placement.field), image.contentSha256);
    }
  }
  const imageSlots = imageSources.allImageSlots.map((slot) => ({
    ...slot,
    contentSha256: placementToHash.get(placementKey(slot.sheetName, slot.row, slot.field)) ?? "",
  }));
  const semanticRowIssues = issues.filter((issue) => issue.kind === "row");
  const structuralIssues = issues.filter((issue) => issue.kind === "structural");
  const summary = summarizeWorkbook(
    csvResult,
    semanticRowIssues,
    structuralIssues,
    imageUrlCount,
    uniqueImages.length,
    imageSources.allImageSlots.length,
    questionSheetCount,
  );
  if (issues.length) {
    return {
      imagePayloads: [],
      issues,
      manifest: null,
      normalizedRows: [],
      summary,
      thumbnails: [],
    };
  }

  const normalizedRowWorksheetRefs = csvResult.normalizedRows.map((_, index) => {
    const worksheetRef = recordRows.get(index + 2);
    if (!worksheetRef) throw new ImageSourceError("attempt_unavailable");
    return worksheetRef;
  });
  if (normalizedRowWorksheetRefs.length !== recordRows.size) {
    throw new ImageSourceError("attempt_unavailable");
  }

  const manifest: QuestionBankXlsxPreviewManifest = {
    imageSlots,
    images: [],
    normalizedRows: csvResult.normalizedRows,
    normalizedRowWorksheetRefs,
    schemaVersion: 3,
    summary,
  };
  const thumbnails: QuestionBankXlsxThumbnail[] = uniqueImages
    .slice(0, QUESTION_BANK_XLSX_LIMITS.thumbnailPageSize)
    .map((image) => ({
      ...image,
      objectKey: "",
      thumbnailBase64: materialized.thumbnailByContentSha256.get(image.contentSha256)?.toString("base64") ?? "",
    }));
  return {
    imagePayloads: uniqueImages,
    issues,
    manifest,
    normalizedRows: csvResult.normalizedRows,
    summary,
    thumbnails,
  };
}

async function readQuestionBankXlsxThumbnail(
  bytes: Uint8Array,
  image: { contentSha256: string; height: number; mimeType: string; placements: QuestionBankXlsxImagePlacement[]; sizeBytes: number; width: number },
  signal?: AbortSignal,
) {
  throwIfRequestAborted(signal);
  const buffer = Buffer.from(bytes);
  if (
    buffer.byteLength !== image.sizeBytes
    || !SHA256_PATTERN.test(image.contentSha256)
    || fingerprint(buffer) !== image.contentSha256
    || contentTypeForImageBytes(buffer) !== image.mimeType
  ) {
    throw new ImageSourceError("attempt_unavailable");
  }
  const result = await validateAndThumbnailImage(buffer, signal);
  if (result.width !== image.width || result.height !== image.height || result.mimeType !== image.mimeType) {
    throw new ImageSourceError("attempt_unavailable");
  }
  return {
    contentSha256: image.contentSha256,
    height: image.height,
    mimeType: image.mimeType,
    placements: image.placements,
    sizeBytes: image.sizeBytes,
    thumbnailBase64: result.thumbnail.toString("base64"),
    width: image.width,
  } satisfies Omit<QuestionBankXlsxThumbnail, "objectKey">;
}

function createQuestionBankXlsxTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Vecalss";
  workbook.subject = "Templat pengisian Bank Soal";
  workbook.title = "Templat Bank Soal";
  workbook.company = "Vecalss";
  workbook.created = new Date();
  workbook.modified = new Date();

  const guide = workbook.addWorksheet("Panduan");
  guide.columns = [
    { key: "topic", width: 28 },
    { key: "instruction", width: 104 },
  ];
  guide.addRow(["Panduan pengisian Bank Soal", ""]);
  guide.addRow(["Langkah", "Isi satu soal pada setiap baris di lembar Soal. Jangan mengubah atau mengurutkan ulang judul kolom."]);
  guide.addRow(["Pilihan jawaban", "Isi pilihan A dan B. Pilihan C, D, dan E boleh dikosongkan, tetapi tidak boleh melompati pilihan sebelumnya."]);
  guide.addRow(["Kunci jawaban", "Gunakan huruf pilihan yang benar. Pisahkan beberapa huruf dengan tanda garis tegak (|), tanpa spasi wajib."]);
  guide.addRow(["Gambar", "Sel bergambar boleh dikosongkan, diisi tautan HTTPS langsung, atau diberi satu gambar tepat pada sel tersebut. Gunakan salah satu cara untuk setiap sel."]);
  guide.addRow(["Tautan gambar", "Pilih tautan gambar yang dapat dibuka tanpa masuk akun. Sistem akan memeriksa alamat dan isi gambar saat pratinjau."]);
  guide.addRow(["Jenis berkas", "Simpan lembar kerja sebagai XLSX. Rumus, gambar tertaut, dan gambar yang ditempatkan di luar kolom bergambar tidak dapat digunakan."]);
  guide.addRow(["Contoh alamat", "https://contoh.id/gambar.jpg"]);
  guide.getRow(1).height = 28;
  guide.getColumn(1).font = { bold: true };
  guide.getRow(1).font = { bold: true, size: 14 };
  guide.views = [{ state: "frozen", ySplit: 1 }];
  guide.eachRow((row, rowNumber) => {
    if (rowNumber === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F7" } };
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber > 1) row.height = 34;
  });

  const questions = workbook.addWorksheet("Soal");
  questions.addRow([...QUESTION_BANK_XLSX_HEADER]);
  questions.views = [{ state: "frozen", ySplit: 1 }];
  questions.autoFilter = `A1:${columnNumberToName(QUESTION_BANK_XLSX_HEADER.length)}1`;
  questions.getRow(1).height = 38;
  questions.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  questions.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF243B53" } };
  questions.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  questions.columns = QUESTION_BANK_XLSX_HEADER.map((field) => ({
    header: field,
    key: field,
    width: IMAGE_FIELDS.includes(field as (typeof IMAGE_FIELDS)[number]) ? 24 : field === "prompt" || field === "explanation" ? 38 : 19,
  }));
  // Keep the data area clear and legible when the Kapten starts typing, without
  // adding an example row that could accidentally be imported.
  questions.properties.defaultRowHeight = 60;
  questions.eachRow((row) => row.alignment = { vertical: "top", wrapText: true });

  return workbook.xlsx.writeBuffer().then((result) => Buffer.from(result));
}

export {
  IMAGE_FIELDS,
  QUESTION_BANK_XLSX_HEADER,
  createQuestionBankXlsxTemplate,
  expectedMimeTypeForContentType,
  mapConcurrent,
  parseQuestionBankXlsxWorkbook,
  readQuestionBankXlsxThumbnail,
};

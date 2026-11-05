import "server-only";

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";

import type { Prisma } from "@/generated/prisma/client";
import { getPublishedLesson } from "@/lib/materi/repository";
import { readMediaObject } from "@/lib/media/r2";
import { prisma } from "@/lib/prisma";
import { publishedMateriWhere } from "./authorization";
import { courseSlugOf, isUuid, materiHref, subtestWhere, type VeraSource, type VeraToolError } from "./types";

const PART_CHARS = 8_000;
const TEXT_CHAR_CAP = 60_000;
const SEARCH_LIMIT = 8;
/** Candidates are checked against the catalogue one by one, so the pool stays small. */
const SEARCH_CANDIDATES = 24;
const SEARCH_TOKEN_LIMIT = 8;
/** Recent lessons are checked against the catalogue one by one, the first visible one wins. */
const RECENT_CANDIDATES = 8;
/** Bump when the extraction changes, so cached text is read again. */
const EXTRACTOR_VERSION = "pdfjs-legacy-5.4";
const SECTION_TOPIC_CODE = /^materi:[a-z0-9-]+:section-[123]$/u;
/** A PDF over this size is not read, so one large upload cannot hold a model call. */
const PDF_MAX_BYTES = 25 * 1024 * 1024;
/** Pages read from one PDF. Reading also stops as soon as the text reaches TEXT_CHAR_CAP. */
const PDF_MAX_PAGES = 200;
/** Reading and extracting one PDF gets this long. After that the lesson reports that it is not available. */
const PDF_TIMEOUT_MS = 20_000;

type ReadPdf = (objectKey: string) => Promise<Uint8Array>;

/** Published Materi the catalogue shows: an active subtest and a section topic, with a PDF attachment. */
function visibleMateriWhere(now: Date) {
  return {
    ...publishedMateriWhere(now),
    topic: { isActive: true, parentTopicId: null, subtest: { isActive: true } },
  };
}

/**
 * The assets a search can read: text in the lesson's body, or a PDF attachment stored in the library. The query leaves out empty bodies,
 * and hasReadableText drops blank ones after it. Doing this in the query keeps the candidate cap for readable lessons only.
 */
const READABLE_ASSET_WHERE: Prisma.ModuleAssetWhereInput = {
  OR: [
    { bodyText: { not: "" } },
    { assetType: "attachment", mimeType: "application/pdf", managedAsset: { objectKey: { not: null } } },
  ],
};

function tokensOf(query: string) {
  const tokens = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2);
  return [...new Set(tokens)].slice(0, SEARCH_TOKEN_LIMIT);
}

/** The asset fields that decide whether a lesson has text the reader can use. */
const READABLE_ASSET_SELECT = {
  assetType: true,
  bodyText: true,
  mimeType: true,
  managedAsset: { select: { objectKey: true } },
} as const;

type ReadableAsset = {
  assetType: string;
  bodyText: string | null;
  mimeType: string | null;
  managedAsset: { objectKey: string | null } | null;
};

/**
 * A lesson can be pinned only when it has text: a body, or a PDF attachment stored as a managed asset. The reader uses the same rule,
 * so the `@` menu never offers a lesson that would be refused.
 */
export function hasReadableText(assets: ReadableAsset[]) {
  return assets.some(
    (asset) =>
      Boolean(asset.bodyText?.trim()) ||
      (asset.assetType === "attachment" && asset.mimeType === "application/pdf" && Boolean(asset.managedAsset?.objectKey)),
  );
}

/** The fields a search hit or a recent lesson is built from, with the assets that decide whether it can be read. */
const LESSON_SELECT = {
  id: true,
  code: true,
  title: true,
  summary: true,
  topic: { select: { code: true, name: true, subtest: { select: { code: true, name: true } } } },
  assets: { select: READABLE_ASSET_SELECT },
} as const;

type LessonRow = {
  id: string;
  code: string;
  title: string;
  summary: string | null;
  topic: { code: string; name: string; subtest: { code: string; name: string } };
  assets: ReadableAsset[];
};

/**
 * Readable Materi that match the words, by their title, topic, summary or subtest. A subtest narrows the search to its lessons,
 * and a subtest with no words lists them, newest first.
 */
export async function searchMateri({
  query = "",
  subtest = "",
  now = new Date(),
}: {
  query?: string;
  subtest?: string;
  now?: Date;
}) {
  const tokens = tokensOf(query);
  const subtestQuery = subtest.trim();
  if (tokens.length === 0 && !subtestQuery) return [];
  const candidates = await prisma.module.findMany({
    where: {
      ...visibleMateriWhere(now),
      AND: [
        { assets: { some: READABLE_ASSET_WHERE } },
        ...(subtestQuery ? [{ topic: { subtest: subtestWhere(subtestQuery) } }] : []),
      ],
      ...(tokens.length > 0
        ? {
            OR: tokens.flatMap((token) => [
              { title: { contains: token, mode: "insensitive" as const } },
              { summary: { contains: token, mode: "insensitive" as const } },
              { topic: { name: { contains: token, mode: "insensitive" as const } } },
              { topic: { subtest: { code: { contains: token, mode: "insensitive" as const } } } },
              { topic: { subtest: { name: { contains: token, mode: "insensitive" as const } } } },
            ]),
          }
        : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: SEARCH_CANDIDATES,
    select: LESSON_SELECT,
  });
  const ranked = candidates
    .filter((lesson) => SECTION_TOPIC_CODE.test(lesson.topic.code))
    .filter((lesson) => hasReadableText(lesson.assets))
    .map((lesson) => ({ lesson, score: tokens.length > 0 ? relevance(lesson, tokens) : 0 }))
    .filter((hit) => tokens.length === 0 || hit.score > 0)
    .sort((left, right) => right.score - left.score);

  // The catalogue is checked one lesson at a time, and the check stops at the limit, so a keystroke costs a few lookups.
  const hits: ReturnType<typeof hitOf>[] = [];
  for (const { lesson } of ranked) {
    if (hits.length >= SEARCH_LIMIT) break;
    if (await isCatalogueLesson(lesson)) hits.push(hitOf(lesson));
  }
  return hits;
}

function hitOf(lesson: LessonRow) {
  return {
    moduleId: lesson.id,
    title: lesson.title,
    subtest: lesson.topic.subtest.name,
    topic: lesson.topic.name,
    snippet: (lesson.summary ?? "").slice(0, 200),
    source: {
      type: "materi",
      id: lesson.id,
      label: lesson.title,
      href: materiHref(lesson.topic.code, lesson.code),
    } satisfies VeraSource,
  };
}

/** The Materi the student opened last, or else the newest published one. Only lessons the catalogue shows are offered. */
export async function recentMateri({ studentId, now = new Date() }: { studentId: string; now?: Date }) {
  const opened = await prisma.moduleProgress.findMany({
    where: { studentId, lastOpenedAt: { not: null }, module: visibleMateriWhere(now) },
    orderBy: { lastOpenedAt: "desc" },
    take: RECENT_CANDIDATES,
    select: { module: { select: LESSON_SELECT } },
  });
  const published = await prisma.module.findMany({
    where: visibleMateriWhere(now),
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: RECENT_CANDIDATES,
    select: LESSON_SELECT,
  });
  for (const lesson of [...opened.map((row) => row.module), ...published]) {
    if (SECTION_TOPIC_CODE.test(lesson.topic.code) && hasReadableText(lesson.assets) && (await isCatalogueLesson(lesson))) {
      return hitOf(lesson);
    }
  }
  return null;
}

/**
 * The student's own catalogue decides visibility. This is the same lookup that opens the lesson page, so a lesson the page
 * would refuse, such as one whose PDF is not a ready library document, is refused here too.
 */
async function isCatalogueLesson(lesson: { code: string; topic: { code: string } }) {
  return Boolean(await getPublishedLesson(courseSlugOf(lesson.topic.code), lesson.code));
}

/** A title match counts most, then the topic, then the summary. The subtest's code or name counts least. */
function relevance(
  lesson: { title: string; summary: string | null; topic: { name: string; subtest: { code: string; name: string } } },
  tokens: string[],
) {
  const title = lesson.title.toLowerCase();
  const topic = lesson.topic.name.toLowerCase();
  const summary = (lesson.summary ?? "").toLowerCase();
  const subtest = [lesson.topic.subtest.code, lesson.topic.subtest.name].join(" ").toLowerCase();
  return tokens.reduce(
    (sum, token) =>
      sum +
      (title.includes(token) ? 3 : 0) +
      (topic.includes(token) ? 2 : 0) +
      (summary.includes(token) ? 1 : 0) +
      (subtest.includes(token) ? 1 : 0),
    0,
  );
}

/**
 * One part of a published Materi. Text comes from the lesson's body when it has one; otherwise from the PDF, which is read
 * from storage once and cached per asset and digest.
 */
export async function readMateri({
  moduleId,
  part = 1,
  now = new Date(),
  readPdf = readMediaObject,
}: {
  moduleId: string;
  part?: number;
  now?: Date;
  readPdf?: ReadPdf;
}) {
  if (!isUuid(moduleId)) return { error: "not_found" } satisfies VeraToolError;
  const lesson = await prisma.module.findFirst({
    where: { id: moduleId, ...visibleMateriWhere(now) },
    select: {
      id: true,
      code: true,
      title: true,
      topic: { select: { code: true } },
      assets: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          assetType: true,
          bodyText: true,
          mimeType: true,
          managedAsset: { select: { objectKey: true, checksum: true, sizeBytes: true } },
        },
      },
    },
  });
  if (!lesson || !SECTION_TOPIC_CODE.test(lesson.topic.code) || !(await isCatalogueLesson(lesson))) {
    return { error: "not_found" } satisfies VeraToolError;
  }

  const text = await lessonText({ moduleId: lesson.id, assets: lesson.assets, readPdf });
  if (text === null) return { error: "not_available" } satisfies VeraToolError;

  const totalParts = Math.max(1, Math.ceil(text.length / PART_CHARS));
  const current = Math.min(Math.max(part, 1), totalParts);
  return {
    moduleId: lesson.id,
    title: lesson.title,
    part: current,
    totalParts,
    text: text.slice((current - 1) * PART_CHARS, current * PART_CHARS),
    source: {
      type: "materi",
      id: lesson.id,
      label: lesson.title,
      href: materiHref(lesson.topic.code, lesson.code),
    } satisfies VeraSource,
  };
}

type LessonAsset = {
  id: string;
  assetType: string;
  bodyText: string | null;
  mimeType: string | null;
  managedAsset: { objectKey: string | null; checksum: string | null; sizeBytes: number } | null;
};

async function lessonText({
  moduleId,
  assets,
  readPdf,
}: {
  moduleId: string;
  assets: LessonAsset[];
  readPdf: ReadPdf;
}): Promise<string | null> {
  const body = assets.find((asset) => asset.bodyText?.trim());
  if (body?.bodyText) return body.bodyText;

  const pdf = assets.find(
    (asset) => asset.assetType === "attachment" && asset.mimeType === "application/pdf" && asset.managedAsset?.objectKey,
  );
  const file = pdf?.managedAsset;
  if (!pdf || !file?.objectKey) return null;
  // A file over the size limit is not read at all.
  if (!pdfWithinLimits(file.sizeBytes)) return null;
  const text = await pdfText({
    moduleId,
    assetId: pdf.id,
    file: { objectKey: file.objectKey, checksum: file.checksum, sizeBytes: file.sizeBytes },
    readPdf,
  });
  return text.trim() ? text : null;
}

/** Whether a stored PDF is small enough to read inside a model call. */
export function pdfWithinLimits(sizeBytes: number) {
  return Number.isFinite(sizeBytes) && sizeBytes <= PDF_MAX_BYTES;
}

/** Resolves with the work's value, or with null when the time runs out first. The work itself is not cancelled. */
export async function withTimeout<T>(work: Promise<T>, milliseconds: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), milliseconds);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** The extracted text is keyed by the stored file's identity, so a replaced PDF is read again and an unchanged one is not. */
async function pdfText({
  moduleId,
  assetId,
  file,
  readPdf,
}: {
  moduleId: string;
  assetId: string;
  file: { objectKey: string; checksum: string | null; sizeBytes: number };
  readPdf: ReadPdf;
}) {
  const digest = createHash("sha256")
    .update([EXTRACTOR_VERSION, file.objectKey, file.checksum ?? "", file.sizeBytes].join(":"))
    .digest("hex");
  const cached = await prisma.veraMateriText.findUnique({
    where: { moduleAssetId: assetId },
    select: { digest: true, text: true },
  });
  if (cached?.digest === digest) return cached.text;

  // A PDF that takes too long is reported as not available, and nothing is cached, so a later request can try again.
  const extracted = await withTimeout(readPdf(file.objectKey).then(extractPdfText), PDF_TIMEOUT_MS);
  if (extracted === null) return "";
  const text = extracted.slice(0, TEXT_CHAR_CAP);
  await prisma.veraMateriText.upsert({
    where: { moduleAssetId: assetId },
    create: { moduleAssetId: assetId, moduleId, digest, text },
    update: { digest, text, extractedAt: new Date() },
  });
  return text;
}

/** Node reads pdf.js's standard font and CMap files from disk, so their folders are resolved from the installed package. */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const assets = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  const document = await getDocument({
    data: bytes,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    standardFontDataUrl: `${join(assets, "standard_fonts")}${sep}`,
    cMapUrl: `${join(assets, "cmaps")}${sep}`,
    cMapPacked: true,
  }).promise;
  const pages: string[] = [];
  let chars = 0;
  try {
    // Pages are read in order. Reading stops at the page cap, or once the text reaches the character cap.
    const last = Math.min(document.numPages, PDF_MAX_PAGES);
    for (let number = 1; number <= last && chars < TEXT_CHAR_CAP; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pages.push(text);
      chars += text.length;
    }
  } finally {
    await document.destroy();
  }
  return pages.join("\n\n");
}

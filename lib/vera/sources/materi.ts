import "server-only";

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";

import { getPublishedLesson } from "@/lib/materi/repository";
import { readMediaObject } from "@/lib/media/r2";
import { prisma } from "@/lib/prisma";
import { publishedMateriWhere } from "./authorization";
import { courseSlugOf, isUuid, materiHref, subtestMatches, type VeraSource, type VeraToolError } from "./types";

const PART_CHARS = 8_000;
const TEXT_CHAR_CAP = 60_000;
const SEARCH_LIMIT = 8;
/** Candidates are checked against the catalogue one by one, so the pool stays small. */
const SEARCH_CANDIDATES = 24;
const SEARCH_TOKEN_LIMIT = 8;
/** Bump when the extraction changes, so cached text is read again. */
const EXTRACTOR_VERSION = "pdfjs-legacy-5.4";
const SECTION_TOPIC_CODE = /^materi:[a-z0-9-]+:section-[123]$/u;

type ReadPdf = (objectKey: string) => Promise<Uint8Array>;

/** Published Materi the catalogue shows: an active subtest and a section topic, with a PDF attachment. */
function visibleMateriWhere(now: Date) {
  return {
    ...publishedMateriWhere(now),
    topic: { isActive: true, parentTopicId: null, subtest: { isActive: true } },
  };
}

function tokensOf(query: string) {
  const tokens = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2);
  return [...new Set(tokens)].slice(0, SEARCH_TOKEN_LIMIT);
}

export async function searchMateri({
  query,
  subtest,
  now = new Date(),
}: {
  query: string;
  subtest?: string;
  now?: Date;
}) {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return [];
  const candidates = await prisma.module.findMany({
    where: {
      ...visibleMateriWhere(now),
      OR: tokens.flatMap((token) => [
        { title: { contains: token, mode: "insensitive" as const } },
        { summary: { contains: token, mode: "insensitive" as const } },
        { topic: { name: { contains: token, mode: "insensitive" as const } } },
      ]),
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: SEARCH_CANDIDATES,
    select: {
      id: true,
      code: true,
      title: true,
      summary: true,
      topic: { select: { code: true, name: true, subtest: { select: { code: true, name: true } } } },
    },
  });
  const ranked = candidates
    .filter((lesson) => SECTION_TOPIC_CODE.test(lesson.topic.code))
    .filter((lesson) => !subtest?.trim() || subtestMatches(lesson.topic.subtest, subtest))
    .map((lesson) => ({ lesson, score: relevance(lesson, tokens) }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score);
  const visible = await Promise.all(ranked.map(({ lesson }) => isCatalogueLesson(lesson)));
  return ranked
    .filter((_, index) => visible[index])
    .slice(0, SEARCH_LIMIT)
    .map(({ lesson }) => ({
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
    }));
}

/**
 * The student's own catalogue decides visibility. This is the same lookup that opens the lesson page, so a lesson the page
 * would refuse, such as one whose PDF is not a ready library document, is refused here too.
 */
async function isCatalogueLesson(lesson: { code: string; topic: { code: string } }) {
  return Boolean(await getPublishedLesson(courseSlugOf(lesson.topic.code), lesson.code));
}

/** A title match counts most, then the topic, then the summary. */
function relevance(
  lesson: { title: string; summary: string | null; topic: { name: string } },
  tokens: string[],
) {
  const title = lesson.title.toLowerCase();
  const topic = lesson.topic.name.toLowerCase();
  const summary = (lesson.summary ?? "").toLowerCase();
  return tokens.reduce(
    (sum, token) =>
      sum + (title.includes(token) ? 3 : 0) + (topic.includes(token) ? 2 : 0) + (summary.includes(token) ? 1 : 0),
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
  const text = await pdfText({
    moduleId,
    assetId: pdf.id,
    file: { objectKey: file.objectKey, checksum: file.checksum, sizeBytes: file.sizeBytes },
    readPdf,
  });
  return text.trim() ? text : null;
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

  const text = (await extractPdfText(await readPdf(file.objectKey))).slice(0, TEXT_CHAR_CAP);
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
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await document.destroy();
  return pages.join("\n\n");
}

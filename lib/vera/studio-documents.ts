import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isUuid, type VeraSource } from "./sources/types";
import type { StudioToolId } from "./studio";

/** How many saved documents the Studio lists. */
export const STUDIO_LIST_LIMIT = 50;

export type StudioDocumentSummary = {
  id: string;
  tool: StudioToolId;
  title: string;
  createdAt: string;
  credits: number;
};

export type StudioDocument = StudioDocumentSummary & {
  markdown: string;
  sources: VeraSource[];
};

/** Saved documents, newest first. Only the student's own documents are listed. */
export async function listStudioDocuments({ studentId }: { studentId: string }): Promise<StudioDocumentSummary[]> {
  const rows = await prisma.veraStudioDocument.findMany({
    where: { studentId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: STUDIO_LIST_LIMIT,
    select: { id: true, tool: true, title: true, createdAt: true, credits: true },
  });
  return rows.map((row) => ({
    id: row.id,
    tool: row.tool,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    credits: Number(row.credits),
  }));
}

/** One document the student owns. Another student's id, or a malformed one, reads as missing. */
export async function getStudioDocument({ studentId, id }: { studentId: string; id: string }): Promise<StudioDocument | null> {
  if (!isUuid(id)) return null;
  const row = await prisma.veraStudioDocument.findFirst({
    where: { id, studentId },
    select: { id: true, tool: true, title: true, markdown: true, sources: true, createdAt: true, credits: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    tool: row.tool,
    title: row.title,
    markdown: row.markdown,
    sources: (row.sources as VeraSource[] | null) ?? [],
    createdAt: row.createdAt.toISOString(),
    credits: Number(row.credits),
  };
}

/** Deletes one document the student owns. Usage events keep their record of what it cost. */
export async function deleteStudioDocument({ studentId, id }: { studentId: string; id: string }) {
  const result = await prisma.veraStudioDocument.deleteMany({ where: { id, studentId } });
  return result.count === 1;
}

export async function saveStudioDocument({
  id,
  studentId,
  tool,
  title,
  markdown,
  sources,
  input,
  credits,
}: {
  id: string;
  studentId: string;
  tool: StudioToolId;
  title: string;
  markdown: string;
  sources: VeraSource[];
  input: unknown;
  credits: number;
}) {
  await prisma.veraStudioDocument.create({
    data: {
      id,
      studentId,
      tool,
      title,
      markdown,
      sources: sources as unknown as Prisma.InputJsonValue,
      input: input as Prisma.InputJsonValue,
      credits,
    },
  });
}

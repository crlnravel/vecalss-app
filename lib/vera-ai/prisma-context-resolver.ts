import "server-only";

import { prisma as defaultPrisma } from "@/lib/prisma";

import { VeraContractError } from "./contracts";
import { resolvePublishedMateri } from "./context-resolvers";
import type { VeraContextResolver, ResolvedContextBlock } from "./context-pack";

type VeraContextDb = typeof defaultPrisma;

function unavailable(reason: string): never {
  throw new VeraContractError(
    "context_release_unavailable",
    "Sumber konteks Vera tidak tersedia.",
    410,
    { reason },
  );
}

/**
 * Server-owned release projection for the first production Vera source type.
 * The client supplies only a module id; publication, visibility, and payload
 * selection are resolved from the database and never from browser content.
 */
export function createPrismaVeraContextResolver(db: VeraContextDb = defaultPrisma): VeraContextResolver {
  return {
    async resolve(selection, authority): Promise<ResolvedContextBlock> {
      const nowRows = await db.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const now = nowRows[0]?.now;
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) unavailable("db_clock_unavailable");

      if (selection.sourceType === "practice") {
        if (!authority?.studentId) unavailable("student_authority_missing");
        const attempt = await db.standaloneQuizAttempt.findFirst({
          where: {
            id: selection.sourceId,
            status: "scored",
            scoringState: "scored",
            releaseState: "released",
            participation: { studentId: authority.studentId },
          },
          include: { participation: { include: { quiz: { select: { title: true, description: true } } } } },
        });
        if (attempt) {
          const quiz = attempt.participation.quiz;
          return {
            sourceType: "practice",
            sourceId: attempt.id,
            title: quiz.title,
            citationLabel: `Latihan: ${quiz.title}`,
            citationKey: `src_${attempt.id.replaceAll("-", "")}`,
            content: [quiz.description, attempt.score === null ? null : `Skor yang dirilis: ${attempt.score}`].filter(Boolean).join("\n\n"),
            contentDigest: undefined,
            sourceVersionId: attempt.id,
          };
        }
        const tryout = await db.tryoutAttempt.findFirst({
          where: {
            id: selection.sourceId,
            studentId: authority.studentId,
            status: "scored",
            scoringState: "scored",
            releaseState: "released",
            assessmentReleaseId: { not: null },
            assessmentReleaseDigest: { not: null },
          },
          select: { id: true, score: true, assessmentReleaseDigest: true, tryout: { select: { title: true } } },
        });
        if (!tryout || !tryout.assessmentReleaseDigest) unavailable("practice_not_released");
        return {
          sourceType: "practice",
          sourceId: tryout.id,
          title: tryout.tryout.title,
          citationLabel: `Tryout: ${tryout.tryout.title}`,
          citationKey: `src_${tryout.id.replaceAll("-", "")}`,
          content: tryout.score === null ? "Hasil Tryout telah dirilis." : `Skor Tryout yang dirilis: ${tryout.score}`,
          contentDigest: tryout.assessmentReleaseDigest,
          sourceVersionId: tryout.assessmentReleaseDigest,
        };
      }
      if (selection.sourceType !== "material") unavailable("unsupported_source_type");

      const publishedModule = await db.module.findFirst({
        where: {
          id: selection.sourceId,
          status: "published",
          publishedAt: { lte: now },
        },
        select: {
          id: true,
          title: true,
          summary: true,
          topic: { select: { name: true } },
          assets: {
            where: { bodyText: { not: null } },
            orderBy: { sortOrder: "asc" },
            select: { title: true, bodyText: true },
          },
        },
      });
      if (!publishedModule) unavailable("not_published");

      const bodyExcerpt = [
        publishedModule.summary,
        ...publishedModule.assets.map((asset) => asset.bodyText ? `${asset.title ?? ""}\n${asset.bodyText}` : ""),
      ].filter((part): part is string => Boolean(part?.trim())).join("\n\n");
      if (!bodyExcerpt.trim()) unavailable("empty_release_projection");
      return resolvePublishedMateri({
        sourceId: publishedModule.id,
        title: publishedModule.title,
        topic: publishedModule.topic.name,
        bodyExcerpt,
        published: true,
        visibleToStudent: true,
      });
    },
  };
}

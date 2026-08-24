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
    async resolve(selection): Promise<ResolvedContextBlock> {
      if (selection.sourceType !== "material") unavailable("unsupported_source_type");
      const nowRows = await db.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const now = nowRows[0]?.now;
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) unavailable("db_clock_unavailable");

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

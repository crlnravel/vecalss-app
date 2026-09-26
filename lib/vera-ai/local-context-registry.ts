import "server-only";

import { createPrismaContextRegistry, tokenizeContextQuery, type ContextRegistryCandidate, type ContextRegistrySource } from "./context-query-registry";
import { canonicalJson, sha256Hex } from "./contracts";
import type { VeraContextKind } from "./context-tool-contracts";
import type { LocalContextCandidate } from "./local-context-decision";
import { isMateriReady, readMateriResources } from "@/lib/materi/contract";

type LocalRegistryClient = {
  module: { findMany(args: unknown): Promise<readonly unknown[]> };
  standaloneQuizAttempt: { findMany(args: unknown): Promise<readonly unknown[]> };
  tryoutAttempt: { findMany(args: unknown): Promise<readonly unknown[]> };
  aiRequestSource: { findMany(args: unknown): Promise<readonly unknown[]> };
};

export type LocalContextRegistrySource = {
  listMetadata(input: { studentId: string; conversationId: string; query: string; now: Date }): Promise<LocalContextCandidate[]>;
  loadSelected(input: {
    studentId: string;
    now: Date;
    selected: readonly LocalContextCandidate[];
    /** Transaction client used by the freeze-time release recheck. */
    db?: unknown;
  }): Promise<ContextRegistryCandidate[]>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  return null;
}

function metadataVersion(input: { id: string; updatedAt: Date; releaseAt: Date; title: string; topic: string | null }): string {
  return sha256Hex(canonicalJson({
    id: input.id,
    updatedAt: input.updatedAt.toISOString(),
    releaseAt: input.releaseAt.toISOString(),
    title: input.title,
    topic: input.topic,
  }));
}

function metadataCandidate(input: {
  kind: VeraContextKind;
  id: unknown;
  title: unknown;
  topic?: unknown;
  releaseAt: unknown;
  updatedAt: unknown;
}): LocalContextCandidate | null {
  const id = stringValue(input.id);
  const title = stringValue(input.title);
  const topic = stringValue(input.topic);
  const releaseAt = dateValue(input.releaseAt);
  const updatedAt = dateValue(input.updatedAt);
  if (!id || !title || !releaseAt || !updatedAt) return null;
  return {
    key: "",
    kind: input.kind,
    stableSourceId: id,
    title,
    topic,
    teaser: input.kind === "materi"
      ? "Materi yang telah diterbitkan."
      : input.kind === "kuis"
        ? "Ringkasan hasil kuis yang telah dirilis."
        : "Ringkasan hasil tryout yang telah dirilis.",
    releasedAt: releaseAt.toISOString(),
    versionDigest: metadataVersion({ id, updatedAt, releaseAt, title, topic }),
    releaseVersionHandle: updatedAt.toISOString(),
  };
}

function priorHint(value: unknown): { citationKey: string; ordinal: number } | null {
  const row = record(value);
  const citationKey = stringValue(row.citationKey);
  const ordinal = typeof row.ordinal === "number" && Number.isSafeInteger(row.ordinal) ? row.ordinal : null;
  return citationKey && ordinal !== null && ordinal >= 1 && ordinal <= 4 ? { citationKey, ordinal } : null;
}

type LocalPriorHintRecord = {
  kind: VeraContextKind;
  id: string;
  hint: { citationKey: string; ordinal: number };
};

function lexicalWhere(terms: string[], titleField = "title", topicField = "topic") {
  if (terms.length === 0) return { id: "__no_lexical_match__" };
  return {
    OR: terms.flatMap((term) => [
      { [titleField]: { contains: term, mode: "insensitive" } },
      { [topicField]: { name: { contains: term, mode: "insensitive" } } },
    ]),
  };
}

function lexicalTitleWhere(terms: string[]) {
  if (terms.length === 0) return { id: "__no_lexical_match__" };
  return { OR: terms.map((term) => ({ title: { contains: term, mode: "insensitive" } })) };
}

function withoutIds(ids: readonly string[]) {
  return ids.length ? { id: { notIn: [...ids] } } : {};
}

const MATERI_SUBTEST_CODES = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
const MATERI_TOPIC_CODES = [
  "materi:penalaran-umum:section-1", "materi:penalaran-umum:section-2", "materi:penalaran-umum:section-3",
  "materi:pengetahuan-pemahaman-umum:section-1", "materi:pengetahuan-pemahaman-umum:section-2", "materi:pengetahuan-pemahaman-umum:section-3",
  "materi:pemahaman-bacaan-menulis:section-1", "materi:pemahaman-bacaan-menulis:section-2", "materi:pemahaman-bacaan-menulis:section-3",
  "materi:pengetahuan-kuantitatif:section-1", "materi:pengetahuan-kuantitatif:section-2", "materi:pengetahuan-kuantitatif:section-3",
  "materi:literasi-bahasa-indonesia:section-1", "materi:literasi-bahasa-indonesia:section-2", "materi:literasi-bahasa-indonesia:section-3",
  "materi:literasi-bahasa-inggris:section-1", "materi:literasi-bahasa-inggris:section-2", "materi:literasi-bahasa-inggris:section-3",
  "materi:penalaran-matematika:section-1", "materi:penalaran-matematika:section-2", "materi:penalaran-matematika:section-3",
] as const;

function materiMetadataWhere(now: Date) {
  return {
    status: "published",
    publishedAt: { lte: now },
    topic: {
      isActive: true,
      parentTopicId: null,
      code: { in: [...MATERI_TOPIC_CODES] },
      subtest: { isActive: true, code: { in: [...MATERI_SUBTEST_CODES] } },
    },
    assets: {
      some: {
        assetType: "attachment",
        mimeType: "application/pdf",
        OR: [
          { sourceKind: "hosted", mediaUrl: { startsWith: "http" } },
          { sourceKind: "managed", managedAsset: { is: { libraryScope: "kapten", state: "ready", trashedAt: null, mimeType: "application/pdf", objectKey: { not: null } } } },
        ],
      },
    },
  };
}

function quizMetadataWhere(studentId: string, now: Date) {
  return {
    participation: { studentId, quiz: { status: "published", subtest: { isActive: true } } },
    status: "scored",
    scoringState: "scored",
    releaseState: "released",
    releaseAt: { lte: now },
  };
}

function tryoutMetadataWhere(studentId: string, now: Date) {
  return {
    studentId,
    status: "scored",
    scoringState: "scored",
    releaseState: "released",
    tryout: { status: "published", publishedAt: { lte: now } },
    deliverySession: {
      status: { in: ["active", "closed", "archived"] },
      releaseState: "released",
      assessmentReleaseId: { not: null },
      assignments: { some: { status: "active", admission: { status: "active", studentId } } },
    },
    assessmentRelease: { is: { publishedAt: { lte: now } } },
  };
}

/**
 * Local dev protocol: phase one only projects metadata and applies fixed SQL
 * limits (three lexical rows and one recent row per kind). The follow-up
 * phase can fetch full projections only for the persisted selected IDs.
 */
export function createPrismaLocalContextRegistry(db: unknown): LocalContextRegistrySource {
  const client = db as LocalRegistryClient;

  async function listMateri(_studentId: string, terms: string[], now: Date, sourceIds?: readonly string[]): Promise<LocalContextCandidate[]> {
    const base = materiMetadataWhere(now);
    const projection = {
      id: true,
      title: true,
      publishedAt: true,
      updatedAt: true,
      topic: { select: { name: true } },
      assets: {
        orderBy: { sortOrder: "asc" },
        select: {
          assetType: true,
          sourceKind: true,
          managedAssetId: true,
          mediaUrl: true,
          mimeType: true,
          originalName: true,
          durationSeconds: true,
          managedAsset: { select: { libraryScope: true, state: true, trashedAt: true, mimeType: true, objectKey: true, originalName: true } },
        },
      },
    };
    const lexical = sourceIds !== undefined
      ? sourceIds.length ? await client.module.findMany({ where: { ...base, id: { in: [...sourceIds] } }, select: projection, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take: sourceIds.length }) : []
      : terms.length
        ? await client.module.findMany({ where: { ...base, ...lexicalWhere(terms) }, select: projection, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take: 3 })
        : [];
    const lexicalIds = lexical.map((raw) => stringValue(record(raw).id)).filter((id): id is string => Boolean(id));
    const recent = sourceIds !== undefined ? [] : await client.module.findMany({ where: { ...base, ...withoutIds(lexicalIds) }, select: projection, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take: 1 });
    return [...lexical, ...recent].flatMap((raw) => {
      const row = record(raw);
      const resources = Array.isArray(row.assets) ? row.assets.map((assetValue) => {
        const asset = record(assetValue);
        const managedAsset = record(asset.managedAsset);
        return {
          assetType: stringValue(asset.assetType) ?? "",
          sourceKind: stringValue(asset.sourceKind),
          managedAssetId: stringValue(asset.managedAssetId),
          mediaUrl: stringValue(asset.mediaUrl),
          mimeType: stringValue(asset.mimeType),
          originalName: stringValue(asset.originalName),
          durationSeconds: typeof asset.durationSeconds === "number" ? asset.durationSeconds : null,
          managedAsset: {
            libraryScope: stringValue(managedAsset.libraryScope),
            state: stringValue(managedAsset.state),
            trashedAt: dateValue(managedAsset.trashedAt),
            mimeType: stringValue(managedAsset.mimeType),
            objectKey: stringValue(managedAsset.objectKey),
            originalName: stringValue(managedAsset.originalName),
          },
        };
      }) : [];
      if (!isMateriReady(stringValue(row.title) ?? "", readMateriResources(resources))) return [];
      const candidate = metadataCandidate({ kind: "materi", id: row.id, title: row.title, topic: record(row.topic).name, releaseAt: row.publishedAt, updatedAt: row.updatedAt });
      return candidate ? [candidate] : [];
    });
  }

  async function listKuis(studentId: string, terms: string[], now: Date, sourceIds?: readonly string[]): Promise<LocalContextCandidate[]> {
    const base = quizMetadataWhere(studentId, now);
    const projection = { id: true, releaseAt: true, updatedAt: true, participation: { select: { quiz: { select: { title: true, updatedAt: true, subtest: { select: { name: true } } } } } } };
    const where = sourceIds
      ? { ...base, id: { in: [...sourceIds] } }
      : terms.length
        ? { ...base, participation: { ...base.participation, quiz: { ...base.participation.quiz, ...lexicalWhere(terms, "title", "subtest") } } }
        : { ...base, id: "__no_lexical_match__" };
    const lexical = sourceIds !== undefined
      ? sourceIds.length ? await client.standaloneQuizAttempt.findMany({ where, select: projection, orderBy: [{ releaseAt: "desc" }, { id: "asc" }], take: sourceIds.length }) : []
      : terms.length ? await client.standaloneQuizAttempt.findMany({ where, select: projection, orderBy: [{ releaseAt: "desc" }, { id: "asc" }], take: 3 }) : [];
    const lexicalIds = lexical.map((raw) => stringValue(record(raw).id)).filter((id): id is string => Boolean(id));
    const recent = sourceIds !== undefined ? [] : await client.standaloneQuizAttempt.findMany({ where: { ...base, ...withoutIds(lexicalIds) }, select: projection, orderBy: [{ releaseAt: "desc" }, { id: "asc" }], take: 1 });
    return [...lexical, ...recent].flatMap((raw) => {
      const row = record(raw);
      const quiz = record(record(row.participation).quiz);
      const quizUpdated = dateValue(quiz.updatedAt);
      const attemptUpdated = dateValue(row.updatedAt);
      const releaseAt = dateValue(row.releaseAt);
      const id = stringValue(row.id);
      const title = stringValue(quiz.title);
      const topic = stringValue(record(quiz.subtest).name);
      if (!id || !title || !releaseAt || !attemptUpdated || !quizUpdated) return [];
      const combinedUpdatedAt = new Date(Math.max(attemptUpdated.getTime(), quizUpdated.getTime()));
      const candidate = metadataCandidate({ kind: "kuis", id, title, topic, releaseAt, updatedAt: combinedUpdatedAt });
      return candidate ? [candidate] : [];
    });
  }

  async function listTryout(studentId: string, terms: string[], now: Date, sourceIds?: readonly string[]): Promise<LocalContextCandidate[]> {
    const base = tryoutMetadataWhere(studentId, now);
    const projection = { id: true, releaseAt: true, updatedAt: true, assessmentReleaseDigest: true, tryout: { select: { title: true, updatedAt: true } } };
    const where = sourceIds
      ? { ...base, id: { in: [...sourceIds] } }
      : terms.length
        ? { ...base, tryout: { ...base.tryout, ...lexicalTitleWhere(terms) } }
        : { ...base, id: "__no_lexical_match__" };
    const lexical = sourceIds !== undefined
      ? sourceIds.length ? await client.tryoutAttempt.findMany({ where, select: projection, orderBy: [{ releaseAt: "desc" }, { id: "asc" }], take: sourceIds.length }) : []
      : terms.length ? await client.tryoutAttempt.findMany({ where, select: projection, orderBy: [{ releaseAt: "desc" }, { id: "asc" }], take: 3 }) : [];
    const lexicalIds = lexical.map((raw) => stringValue(record(raw).id)).filter((id): id is string => Boolean(id));
    const recent = sourceIds !== undefined ? [] : await client.tryoutAttempt.findMany({ where: { ...base, ...withoutIds(lexicalIds) }, select: projection, orderBy: [{ releaseAt: "desc" }, { id: "asc" }], take: 1 });
    return [...lexical, ...recent].flatMap((raw) => {
      const row = record(raw);
      const attemptUpdated = dateValue(row.updatedAt);
      const tryout = record(row.tryout);
      const tryoutUpdated = dateValue(tryout.updatedAt);
      const releaseAt = dateValue(row.releaseAt);
      const id = stringValue(row.id);
      const title = stringValue(tryout.title);
      if (!id || !title || !releaseAt || !attemptUpdated || !tryoutUpdated) return [];
      const combinedUpdatedAt = new Date(Math.max(attemptUpdated.getTime(), tryoutUpdated.getTime()));
      const candidate = metadataCandidate({ kind: "tryout", id, title, releaseAt, updatedAt: combinedUpdatedAt });
      return candidate ? [candidate] : [];
    });
  }

  return {
    async listMetadata({ studentId, conversationId, query, now }) {
      const terms = tokenizeContextQuery(query);
      const [materi, kuis, tryout, priorSourceRows] = await Promise.all([
        listMateri(studentId, terms, now),
        listKuis(studentId, terms, now),
        listTryout(studentId, terms, now),
        client.aiRequestSource.findMany({
          where: {
            request: { studentId, conversationId, status: { in: ["succeeded", "fallback"] } },
            snapshotState: "available",
          },
          orderBy: [{ request: { createdAt: "desc" } }, { ordinal: "asc" }],
          take: 4,
          select: { sourceType: true, sourceId: true, citationKey: true, ordinal: true },
        }),
      ]);
      const hints = priorSourceRows.flatMap((sourceValue): LocalPriorHintRecord[] => {
        const source = record(sourceValue);
        const id = stringValue(source.sourceId);
        const hint = priorHint(source);
        if (!id || !hint) return [];
        if (source.sourceType === "material") return [{ kind: "materi" as const, id, hint }];
        if (source.sourceType === "practice" && hint.citationKey.startsWith("kuis_")) return [{ kind: "kuis" as const, id, hint }];
        if (source.sourceType === "practice" && hint.citationKey.startsWith("tryout_")) return [{ kind: "tryout" as const, id, hint }];
        return [];
      });
      const idsFor = (kind: VeraContextKind) => [...new Set(hints.filter((hint) => hint.kind === kind).map((hint) => hint.id))];
      const [priorMateri, priorKuis, priorTryout] = await Promise.all([
        listMateri(studentId, [], now, idsFor("materi")),
        listKuis(studentId, [], now, idsFor("kuis")),
        listTryout(studentId, [], now, idsFor("tryout")),
      ]);
      const addHints = (kind: VeraContextKind, rows: LocalContextCandidate[]) => rows.flatMap((candidate) => {
        const candidateHints = hints.filter((hint) => hint.kind === kind && hint.id === candidate.stableSourceId).map((hint) => hint.hint);
        return candidateHints.length ? [{ ...candidate, priorHints: candidateHints }] : [];
      });
      return [...materi, ...kuis, ...tryout, ...addHints("materi", priorMateri), ...addHints("kuis", priorKuis), ...addHints("tryout", priorTryout)]
        .map((candidate, index) => ({ ...candidate, key: `raw_${index}` }));
    },
    async loadSelected({ studentId, now, selected, db: transactionDb }) {
      if (selected.length > 4) throw new Error("local_context_selected_source_cap");
      const selectedReader: ContextRegistrySource = createPrismaContextRegistry(transactionDb ?? db);
      const idsByKind = new Map<VeraContextKind, string[]>();
      for (const candidate of selected) idsByKind.set(candidate.kind, [...(idsByKind.get(candidate.kind) ?? []), candidate.stableSourceId]);
      const [materi, kuis, tryout] = await Promise.all([
        idsByKind.get("materi")?.length ? selectedReader.listMateri({ studentId, now, sourceIds: idsByKind.get("materi") }) : [],
        idsByKind.get("kuis")?.length ? selectedReader.listKuis({ studentId, now, sourceIds: idsByKind.get("kuis") }) : [],
        idsByKind.get("tryout")?.length ? selectedReader.listTryout({ studentId, now, sourceIds: idsByKind.get("tryout") }) : [],
      ]);
      const byIdentity = new Map([...materi, ...kuis, ...tryout].map((candidate) => [`${candidate.kind}:${candidate.stableSourceId}`, candidate]));
      return selected.map((metadata) => {
        const candidate = byIdentity.get(`${metadata.kind}:${metadata.stableSourceId}`);
        if (!candidate || candidate.title !== metadata.title
          || candidate.releaseAt.toISOString() !== metadata.releasedAt
          || candidate.releaseVersionHandle !== metadata.releaseVersionHandle) {
          throw new Error("local_context_release_changed");
        }
        return candidate;
      });
    },
  };
}

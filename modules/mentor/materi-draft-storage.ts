"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  getCanonicalMateriSection,
  getCanonicalMateriSections,
  getMateriReadiness,
  isMentorSubjectSlug,
  isValidHttpUrl,
  type MentorSubjectSlug,
} from "@/modules/mentor/materi-model";
import {
  materi as seededMateri,
  type KaptenMateri,
} from "@/modules/mentor/mock-data";
import type { MateriBuilderSection } from "@/modules/mentor/materi-builder-types";

const storageKey = "vecalss.kapten.materi-drafts.v2";
const legacyStorageKey = "vecalss.kapten.materi-drafts.v1";
const changeEvent = "vecalss-materi-drafts-change";
const serverStorageSnapshot = "__vecalss_server_storage_snapshot__";

type StoredMateriDraftV2 = {
  legacy?: {
    migrationState: "needs-review";
    sections: MateriBuilderSection[];
  };
  /** Transitional top-level section payload used by the current builder. */
  sections?: MateriBuilderSection[];
  materi: KaptenMateri;
  savedAt: number;
  version: 2;
};

/** Kept as the public compatibility name used by the builder and dashboard. */
type StoredMateriDraft = StoredMateriDraftV2 & {
  sections: MateriBuilderSection[];
};

type LegacyMateriDraft = {
  materi: Record<string, unknown>;
  savedAt: number;
  sections: unknown[];
};

type MateriStorageSnapshot = {
  legacy: LegacyMateriDraft[];
  v2: StoredMateriDraftV2[];
};

const lifecycleStatuses = ["draft", "scheduled", "published", "archived"] as const;
const sectionKinds = ["video", "notes", "attachment", "practice"] as const;

const subjectAliases: Record<
  string,
  { code: string; name: string; slug: MentorSubjectSlug }
> = {
  "penalaran-umum": {
    code: "PU",
    name: "Penalaran Umum",
    slug: "penalaran-umum",
  },
  pu: { code: "PU", name: "Penalaran Umum", slug: "penalaran-umum" },
  "penalaran umum": {
    code: "PU",
    name: "Penalaran Umum",
    slug: "penalaran-umum",
  },
  "pengetahuan-pemahaman-umum": {
    code: "PPU",
    name: "Pengetahuan dan Pemahaman Umum",
    slug: "pengetahuan-pemahaman-umum",
  },
  ppu: {
    code: "PPU",
    name: "Pengetahuan dan Pemahaman Umum",
    slug: "pengetahuan-pemahaman-umum",
  },
  "pengetahuan dan pemahaman umum": {
    code: "PPU",
    name: "Pengetahuan dan Pemahaman Umum",
    slug: "pengetahuan-pemahaman-umum",
  },
  "pemahaman-bacaan-menulis": {
    code: "PBM",
    name: "Pemahaman Bacaan dan Menulis",
    slug: "pemahaman-bacaan-menulis",
  },
  pbm: {
    code: "PBM",
    name: "Pemahaman Bacaan dan Menulis",
    slug: "pemahaman-bacaan-menulis",
  },
  "pemahaman bacaan dan menulis": {
    code: "PBM",
    name: "Pemahaman Bacaan dan Menulis",
    slug: "pemahaman-bacaan-menulis",
  },
  "pengetahuan-kuantitatif": {
    code: "PK",
    name: "Pengetahuan Kuantitatif",
    slug: "pengetahuan-kuantitatif",
  },
  pk: {
    code: "PK",
    name: "Pengetahuan Kuantitatif",
    slug: "pengetahuan-kuantitatif",
  },
  "pengetahuan kuantitatif": {
    code: "PK",
    name: "Pengetahuan Kuantitatif",
    slug: "pengetahuan-kuantitatif",
  },
  "literasi-bahasa-indonesia": {
    code: "LBI",
    name: "Literasi Bahasa Indonesia",
    slug: "literasi-bahasa-indonesia",
  },
  lbi: {
    code: "LBI",
    name: "Literasi Bahasa Indonesia",
    slug: "literasi-bahasa-indonesia",
  },
  "literasi bahasa indonesia": {
    code: "LBI",
    name: "Literasi Bahasa Indonesia",
    slug: "literasi-bahasa-indonesia",
  },
  "literasi-bahasa-inggris": {
    code: "LBE",
    name: "Literasi Bahasa Inggris",
    slug: "literasi-bahasa-inggris",
  },
  lbe: {
    code: "LBE",
    name: "Literasi Bahasa Inggris",
    slug: "literasi-bahasa-inggris",
  },
  "literasi bahasa inggris": {
    code: "LBE",
    name: "Literasi Bahasa Inggris",
    slug: "literasi-bahasa-inggris",
  },
  "penalaran-matematika": {
    code: "PM",
    name: "Penalaran Matematika",
    slug: "penalaran-matematika",
  },
  pm: {
    code: "PM",
    name: "Penalaran Matematika",
    slug: "penalaran-matematika",
  },
  "penalaran matematika": {
    code: "PM",
    name: "Penalaran Matematika",
    slug: "penalaran-matematika",
  },
};

const genericSectionAliases: Record<string, number> = {
  pengenalan: 0,
  konsep: 1,
  "konsep dasar": 1,
  "konsep inti": 1,
  "contoh terpandu": 1,
  "checklist baca": 1,
  "contoh soal": 1,
  "contoh revisi": 1,
  "contoh grafik": 1,
  latihan: 2,
  "latihan ringkas": 2,
  "latihan mandiri": 2,
  "latihan rasio": 2,
  "case study": 2,
  "guided exercise": 2,
};

const subjectSectionAliases: Record<
  string,
  { index: number; subjectSlug: MentorSubjectSlug }
> = {
  "pengenalan pu": { index: 0, subjectSlug: "penalaran-umum" },
  "pengenalan ppu": { index: 0, subjectSlug: "pengetahuan-pemahaman-umum" },
  "pengenalan pbm": { index: 0, subjectSlug: "pemahaman-bacaan-menulis" },
  "pengenalan pk": { index: 0, subjectSlug: "pengetahuan-kuantitatif" },
  "pengenalan lbi": { index: 0, subjectSlug: "literasi-bahasa-indonesia" },
  "reading setup": { index: 0, subjectSlug: "literasi-bahasa-inggris" },
  "pengenalan pm": { index: 0, subjectSlug: "penalaran-matematika" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeLabel(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMateriBuilderSection(value: unknown): value is MateriBuilderSection {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id.trim().length > 0
    && typeof value.title === "string"
    && typeof value.body === "string"
    && sectionKinds.includes(value.kind as (typeof sectionKinds)[number])
    && (value.assetId === undefined || typeof value.assetId === "string")
    && (value.prompt === undefined || typeof value.prompt === "string")
    && (value.videoUrl === undefined || typeof value.videoUrl === "string");
}

function normalizeLegacySections(value: unknown): MateriBuilderSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isMateriBuilderSection);
}

function isKaptenMateri(value: unknown): value is KaptenMateri {
  if (!isRecord(value) || !isMentorSubjectSlug(String(value.subjectSlug ?? ""))) {
    return false;
  }

  const subjectSlug = value.subjectSlug as string;
  const sectionId = value.sectionId;

  return typeof value.id === "string"
    && value.id.trim().length > 0
    && typeof value.description === "string"
    && typeof value.href === "string"
    && typeof value.primaryMetric === "string"
    && isFiniteNumber(value.progress)
    && value.progress >= 0
    && value.progress <= 100
    && value.resourceType === "materi"
    // Older v2 records did not require duration. Keep them recoverable and
    // normalize them to an incomplete canonical record during parsing.
    && (value.duration === undefined || typeof value.duration === "string")
    && (value.migrationState === undefined || value.migrationState === "canonical" || value.migrationState === "needs-review")
    && Number.isInteger(value.position)
    && (value.position as number) >= 0
    && (value.resourceCount === undefined || (Number.isInteger(value.resourceCount) && (value.resourceCount as number) >= 0))
    && (value.sections === undefined || (Array.isArray(value.sections) && value.sections.every((section) => typeof section === "string")))
    && (sectionId === null || (typeof sectionId === "string" && Boolean(getCanonicalMateriSection(subjectSlug, sectionId))))
    && (value.sectionTitle === null || typeof value.sectionTitle === "string")
    && typeof value.subjectCode === "string"
    && typeof value.subjectName === "string"
    && typeof value.title === "string"
    && typeof value.updatedAt === "string"
    && typeof value.videoUrl === "string"
    && (value.scheduledFor === undefined || typeof value.scheduledFor === "string")
    && lifecycleStatuses.includes(value.status as (typeof lifecycleStatuses)[number])
    && (value.readiness === "ready" || value.readiness === "incomplete")
    && (sectionId === null || value.sectionTitle === getCanonicalMateriSection(subjectSlug, sectionId)?.title);
}

function isStoredMateriDraft(value: unknown): value is StoredMateriDraftV2 {
  if (!isRecord(value) || value.version !== 2 || !isKaptenMateri(value.materi) || !isFiniteNumber(value.savedAt)) {
    return false;
  }

  if (value.legacy === undefined) {
    return value.sections === undefined || (Array.isArray(value.sections) && value.sections.every(isMateriBuilderSection));
  }

  return (value.sections === undefined || (Array.isArray(value.sections) && value.sections.every(isMateriBuilderSection)))
    && isRecord(value.legacy)
    && value.legacy.migrationState === "needs-review"
    && Array.isArray(value.legacy.sections)
    && value.legacy.sections.every(isMateriBuilderSection);
}

function normalizeV2Draft(draft: StoredMateriDraftV2): StoredMateriDraftV2 {
  return {
    ...draft,
    materi: {
      ...draft.materi,
      duration: draft.materi.duration ?? "",
      readiness: getMateriReadiness({
        duration: draft.materi.duration ?? "",
        sectionId: draft.materi.sectionId,
        subjectSlug: draft.materi.subjectSlug,
        title: draft.materi.title,
        videoUrl: draft.materi.videoUrl,
      }),
      resourceCount: draft.materi.resourceCount ?? 0,
      sections: draft.materi.sections ?? [],
    },
  };
}

function parseV2Drafts(value: string | null): StoredMateriDraftV2[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const byId = new Map<string, StoredMateriDraftV2>();
    for (const candidate of parsed) {
      if (!isStoredMateriDraft(candidate)) {
        continue;
      }

      const normalized = normalizeV2Draft(candidate);
      const previous = byId.get(normalized.materi.id);
      if (!previous || normalized.savedAt >= previous.savedAt) {
        byId.set(normalized.materi.id, normalized);
      }
    }

    return [...byId.values()];
  } catch {
    return [];
  }
}

function parseLegacyDrafts(value: string | null): LegacyMateriDraft[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((candidate): LegacyMateriDraft[] => {
      if (!isRecord(candidate) || !isFiniteNumber(candidate.savedAt) || !isRecord(candidate.materi)) {
        return [];
      }

      const id = typeof candidate.materi.id === "string" ? candidate.materi.id.trim() : "";
      const hasSubject = typeof candidate.materi.subjectSlug === "string"
        || typeof candidate.materi.subjectCode === "string";
      if (id.length === 0 || !hasSubject) {
        return [];
      }

      return [{
        materi: candidate.materi,
        savedAt: candidate.savedAt,
        sections: Array.isArray(candidate.sections) ? candidate.sections : [],
      }];
    });
  } catch {
    return [];
  }
}

function readStorageValue(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readSnapshot(): MateriStorageSnapshot {
  return {
    legacy: parseLegacyDrafts(readStorageValue(legacyStorageKey)),
    v2: parseV2Drafts(readStorageValue(storageKey)),
  };
}

function legacySubject(value: unknown) {
  const key = normalizeLabel(value);
  return subjectAliases[key];
}

function getLegacyLabels(draft: LegacyMateriDraft) {
  const materiValue = draft.materi;
  const labels: string[] = [];
  for (const value of [materiValue.sectionTitle, ...(Array.isArray(materiValue.sections) ? materiValue.sections : [])]) {
    if (typeof value === "string" && value.trim()) {
      labels.push(value);
    }
  }

  for (const section of draft.sections) {
    if (isRecord(section) && typeof section.title === "string" && section.title.trim()) {
      labels.push(section.title);
    }
  }

  return labels;
}

function getLegacySectionIndex(subjectSlug: MentorSubjectSlug, labels: string[]) {
  const canonicalLabels = new Map(
    getCanonicalMateriSections(subjectSlug).map((section) => [normalizeLabel(section.title), section.index]),
  );
  const candidates = labels.map((label) => {
    const normalized = normalizeLabel(label);
    if (normalized === "number sense" && subjectSlug !== "pengetahuan-kuantitatif") {
      return undefined;
    }

    const canonicalIndex = canonicalLabels.get(normalized);
    if (canonicalIndex !== undefined) {
      return canonicalIndex;
    }

    const subjectAlias = subjectSectionAliases[normalized];
    if (subjectAlias) {
      return subjectAlias.subjectSlug === subjectSlug ? subjectAlias.index : undefined;
    }

    return genericSectionAliases[normalized];
  });
  if (candidates.some((index) => !Number.isInteger(index))) {
    return null;
  }

  const uniqueCandidates = [...new Set(candidates)];

  return uniqueCandidates.length === 1 && typeof uniqueCandidates[0] === "number"
    ? uniqueCandidates[0]
    : null;
}

function getLegacyVideoUrls(draft: LegacyMateriDraft) {
  const urls: string[] = [];
  const scalarUrl = draft.materi.videoUrl;
  if (typeof scalarUrl === "string" && isValidHttpUrl(scalarUrl)) {
    urls.push(scalarUrl.trim());
  }

  for (const section of draft.sections) {
    if (!isRecord(section) || typeof section.videoUrl !== "string" || !isValidHttpUrl(section.videoUrl)) {
      continue;
    }

    urls.push(section.videoUrl.trim());
  }

  return [...new Set(urls)];
}

function getPositionKey(subjectSlug: string, sectionId: string | null) {
  return `${subjectSlug}:${sectionId ?? "recovery"}`;
}

function allocateLegacyPositions(
  records: Array<StoredMateriDraftV2 & { sourceId: string }>,
  baseMateri: readonly KaptenMateri[],
) {
  const seedById = new Map(baseMateri.map((item) => [item.id, item]));
  const maxPositions = new Map<string, number>();
  const usedPositions = new Map<string, Set<number>>();

  for (const item of baseMateri) {
    const key = getPositionKey(item.subjectSlug, item.sectionId);
    maxPositions.set(key, Math.max(maxPositions.get(key) ?? -1, item.position));
    const positions = usedPositions.get(key) ?? new Set<number>();
    positions.add(item.position);
    usedPositions.set(key, positions);
  }

  for (const record of [...records].sort((a, b) => a.savedAt - b.savedAt || a.sourceId.localeCompare(b.sourceId))) {
    const seed = seedById.get(record.materi.id);
    if (seed) {
      record.materi.position = seed.position;
      continue;
    }

    const key = getPositionKey(record.materi.subjectSlug, record.materi.sectionId);
    const positions = usedPositions.get(key) ?? new Set<number>();
    let position = (maxPositions.get(key) ?? -1) + 1;
    while (positions.has(position)) {
      position += 1;
    }

    record.materi.position = position;
    positions.add(position);
    maxPositions.set(key, position);
    usedPositions.set(key, positions);
  }

  return records;
}

function adaptLegacyDrafts(
  legacyDrafts: readonly LegacyMateriDraft[],
  baseMateri: readonly KaptenMateri[] = seededMateri,
): StoredMateriDraftV2[] {
  const adaptedCandidates = legacyDrafts
    .map((draft) => {
      const sourceMateri = draft.materi;
      const subject = legacySubject(sourceMateri.subjectSlug) ?? legacySubject(sourceMateri.subjectCode);
      if (!subject) {
        return null;
      }

      const id = String(sourceMateri.id).trim();
      const sectionIndex = getLegacySectionIndex(subject.slug, getLegacyLabels(draft));
      const canonicalSection = sectionIndex === null
        ? undefined
        : getCanonicalMateriSections(subject.slug)[sectionIndex];
      const videoUrls = getLegacyVideoUrls(draft);
      const videoUrl = videoUrls[0] ?? "";
      const normalizedSections = normalizeLegacySections(draft.sections);
      const title = typeof sourceMateri.title === "string" && sourceMateri.title.trim()
        ? sourceMateri.title
        : id;
      const sectionId = canonicalSection?.sectionId ?? null;
      const migrationState = sectionId && videoUrls.length <= 1 ? "canonical" : "needs-review";
      const materi: KaptenMateri = {
        description: typeof sourceMateri.description === "string" ? sourceMateri.description : "",
        duration: typeof sourceMateri.duration === "string" ? sourceMateri.duration : "",
        href: typeof sourceMateri.href === "string" ? sourceMateri.href : `/mentor/materi/${id}`,
        id,
        migrationState,
        position: 0,
        primaryMetric: typeof sourceMateri.primaryMetric === "string" ? sourceMateri.primaryMetric : "Video belum siap",
        progress: isFiniteNumber(sourceMateri.progress) ? sourceMateri.progress : 0,
        readiness: getMateriReadiness({
          duration: typeof sourceMateri.duration === "string" ? sourceMateri.duration : "",
          sectionId,
          subjectSlug: subject.slug,
          title,
          videoUrl,
        }),
        resourceCount: Number.isInteger(sourceMateri.resourceCount) ? Number(sourceMateri.resourceCount) : normalizedSections.length,
        resourceType: "materi",
        sections: Array.isArray(sourceMateri.sections)
          ? sourceMateri.sections.filter((item): item is string => typeof item === "string")
          : normalizedSections.map((section) => section.title),
        sectionId,
        sectionTitle: canonicalSection?.title ?? null,
        scheduledFor: typeof sourceMateri.scheduledFor === "string" ? sourceMateri.scheduledFor : undefined,
        status: lifecycleStatuses.includes(sourceMateri.status as (typeof lifecycleStatuses)[number])
          ? sourceMateri.status as KaptenMateri["status"]
          : "draft",
        subjectCode: subject.code,
        subjectName: subject.name,
        subjectSlug: subject.slug,
        title,
        updatedAt: typeof sourceMateri.updatedAt === "string" ? sourceMateri.updatedAt : "Diedit sebelumnya",
        videoUrl,
      };

      return {
        legacy: { migrationState: "needs-review" as const, sections: normalizedSections },
        materi,
        sections: normalizedSections,
        savedAt: draft.savedAt,
        sourceId: id,
        version: 2 as const,
      };
    })
    .filter((draft) => draft !== null);
  const adapted = adaptedCandidates as Array<StoredMateriDraftV2 & { sourceId: string }>;

  const deduped = new Map<string, StoredMateriDraftV2 & { sourceId: string }>();
  for (const draft of adapted) {
    const previous = deduped.get(draft.materi.id);
    if (!previous || draft.savedAt >= previous.savedAt) {
      deduped.set(draft.materi.id, draft);
    }
  }

  return allocateLegacyPositions([...deduped.values()], baseMateri);
}

function getPersistedDrafts(baseMateri: readonly KaptenMateri[] = seededMateri) {
  const snapshot = readSnapshot();
  const adapted = adaptLegacyDrafts(snapshot.legacy, baseMateri);
  const byId = new Map<string, StoredMateriDraftV2>();

  for (const draft of adapted) {
    byId.set(draft.materi.id, draft);
  }
  for (const draft of snapshot.v2) {
    byId.set(draft.materi.id, draft);
  }

  return [...byId.values()];
}

function toCompatDraft(draft: StoredMateriDraftV2): StoredMateriDraft {
  return {
    ...draft,
    sections: draft.sections ?? draft.legacy?.sections ?? [],
  };
}

function writeDrafts(drafts: readonly StoredMateriDraftV2[]) {
  if (typeof window === "undefined") {
    throw new Error("Materi drafts can only be saved in a browser.");
  }

  const previousValue = readStorageValue(storageKey);

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(drafts));
    window.dispatchEvent(new Event(changeEvent));
  } catch {
    // A storage shim can throw after accepting a write. Restore the exact
    // catalogue snapshot and never emit the success event in that case.
    try {
      if (previousValue === null) {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, previousValue);
      }
    } catch {
      // The caller still receives the original failure; storage recovery is
      // best-effort when the browser has disabled localStorage entirely.
    }
    throw new Error("Materi draft could not be saved. Your changes remain unsaved.");
  }
}

function getStoredMateriDraft(id: string | undefined) {
  if (!id) {
    return null;
  }

  const draft = getPersistedDrafts().find((candidate) => candidate.materi.id === id);
  return draft ? toCompatDraft(draft) : null;
}

function getExternalStoreSnapshot() {
  const v1 = readStorageValue(legacyStorageKey) ?? "";
  const v2 = readStorageValue(storageKey) ?? "";
  return `${v1}\u0000${v2}`;
}

function useStoredMateriDraft(id: string) {
  const serializedDrafts = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      window.addEventListener(changeEvent, callback);
      return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener(changeEvent, callback);
      };
    },
    getExternalStoreSnapshot,
    () => serverStorageSnapshot,
  );

  return useMemo(() => {
    if (serializedDrafts === serverStorageSnapshot) {
      return undefined;
    }

    const [legacyValue, v2Value] = serializedDrafts.split("\u0000");
    const draft = getPersistedDraftsFromValues(legacyValue || null, v2Value || null).find(
      (draft) => draft.materi.id === id,
    );
    return draft ? toCompatDraft(draft) : null;
  }, [id, serializedDrafts]);
}

function getPersistedDraftsFromValues(legacyValue: string | null, v2Value: string | null) {
  const adapted = adaptLegacyDrafts(parseLegacyDrafts(legacyValue));
  const byId = new Map(adapted.map((draft) => [draft.materi.id, draft]));
  for (const draft of parseV2Drafts(v2Value)) {
    byId.set(draft.materi.id, draft);
  }
  return [...byId.values()];
}

type MateriPlacementOptions = {
  /** Learner-facing, one-based position. Omit to retain/move-to-append. */
  requestedPosition?: number;
};

function hasActivePlacement(materi: KaptenMateri) {
  return materi.status !== "archived"
    && materi.migrationState !== "needs-review"
    && Boolean(getCanonicalMateriSection(materi.subjectSlug, materi.sectionId));
}

function getPlacementGroupKey(materi: KaptenMateri) {
  return getPositionKey(materi.subjectSlug, materi.sectionId);
}

function comparePlacement(a: KaptenMateri, b: KaptenMateri) {
  return a.position - b.position || a.id.localeCompare(b.id);
}

function clampRequestedPosition(requestedPosition: number | undefined, maximum: number) {
  if (requestedPosition === undefined || !Number.isFinite(requestedPosition)) {
    return undefined;
  }

  return Math.min(Math.max(Math.trunc(requestedPosition), 1), maximum);
}

/**
 * Save the edited record and every affected active sibling as one v2
 * catalogue snapshot. The v1 key is only read: legacy sibling reindexes are
 * represented as v2 overrides, never by mutating v1 source data.
 */
function saveMateriDraft(
  draft: Omit<StoredMateriDraft, "savedAt" | "version">,
  placement: MateriPlacementOptions = {},
) {
  const candidate = normalizeV2Draft({
    ...draft,
    materi: { ...draft.materi },
    savedAt: Date.now(),
    version: 2,
  });

  if (!isStoredMateriDraft(candidate)) {
    throw new Error("Materi draft is not structurally valid.");
  }

  const catalogue = mergeMateriSources(seededMateri);
  const existing = catalogue.find((item) => item.id === candidate.materi.id);
  const sourceKey = existing && hasActivePlacement(existing)
    ? getPlacementGroupKey(existing)
    : undefined;
  const targetKey = hasActivePlacement(candidate.materi)
    ? getPlacementGroupKey(candidate.materi)
    : undefined;
  const affectedKeys = new Set([sourceKey, targetKey].filter((key): key is string => Boolean(key)));
  const withoutCandidate = catalogue
    .filter((item) => item.id !== candidate.materi.id)
    .map((item) => ({ ...item }));
  const updates = new Map<string, KaptenMateri>();

  for (const groupKey of affectedKeys) {
    const siblings = withoutCandidate
      .filter((item) => hasActivePlacement(item) && getPlacementGroupKey(item) === groupKey)
      .sort(comparePlacement);
    const isTargetGroup = groupKey === targetKey;

    if (isTargetGroup) {
      const retainedPosition = sourceKey === targetKey && existing
        ? [...siblings, existing].sort(comparePlacement).findIndex(
          (item) => item.id === candidate.materi.id,
        ) + 1
        : undefined;
      const requestedPosition = clampRequestedPosition(
        placement.requestedPosition ?? retainedPosition,
        siblings.length + 1,
      );
      const insertionIndex = (requestedPosition ?? siblings.length + 1) - 1;
      siblings.splice(insertionIndex, 0, candidate.materi);
    }

    siblings.forEach((item, position) => {
      updates.set(item.id, { ...item, position });
    });
  }

  // Archived and recovery records remain outside active ordering, but their
  // explicit edit is still persisted in the same successful snapshot.
  if (!updates.has(candidate.materi.id)) {
    updates.set(candidate.materi.id, candidate.materi);
  }

  const persistedById = new Map(
    getPersistedDrafts().map((item) => [item.materi.id, toCompatDraft(item)]),
  );
  const nextDrafts = parseV2Drafts(readStorageValue(storageKey)).filter(
    (item) => !updates.has(item.materi.id),
  );

  for (const materi of updates.values()) {
    const previous = materi.id === candidate.materi.id
      ? candidate
      : persistedById.get(materi.id);
    const nextDraft = normalizeV2Draft({
      legacy: previous?.legacy,
      materi,
      sections: previous?.sections ?? [],
      savedAt: candidate.savedAt,
      version: 2,
    });

    if (!isStoredMateriDraft(nextDraft)) {
      throw new Error("Materi catalogue could not be reindexed safely.");
    }

    nextDrafts.push(nextDraft);
    if (materi.id === candidate.materi.id) {
      candidate.materi = materi;
    }
  }

  writeDrafts(nextDrafts);
  return candidate;
}

function mergeMateriSources(baseMateri: readonly KaptenMateri[]) {
  const persisted = getPersistedDrafts(baseMateri);
  const byId = new Map<string, KaptenMateri>(baseMateri.map((item) => [item.id, item]));
  for (const draft of persisted) {
    byId.set(draft.materi.id, draft.materi);
  }

  return [...byId.values()];
}

function getMateriWithStoredDrafts(baseMateri: KaptenMateri[]) {
  return mergeMateriSources(baseMateri);
}

function getRecentlyEditedMateri(baseResources: KaptenMateri[]) {
  const persisted = getPersistedDrafts(baseResources).sort((a, b) => b.savedAt - a.savedAt);
  const savedIds = new Set(persisted.map((draft) => draft.materi.id));
  return [
    ...persisted.map((draft) => draft.materi),
    ...baseResources.filter((item) => !savedIds.has(item.id)),
  ];
}

function getStoredMateriDrafts() {
  return getPersistedDrafts().sort((a, b) => b.savedAt - a.savedAt).map(toCompatDraft);
}

export {
  adaptLegacyDrafts,
  getMateriWithStoredDrafts,
  getRecentlyEditedMateri,
  getStoredMateriDrafts,
  getStoredMateriDraft,
  parseLegacyDrafts,
  parseV2Drafts,
  saveMateriDraft,
  useStoredMateriDraft,
};

export type {
  LegacyMateriDraft,
  MateriPlacementOptions,
  StoredMateriDraft,
  StoredMateriDraftV2,
};

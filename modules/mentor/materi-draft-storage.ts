"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { KaptenMateri } from "@/modules/mentor/mock-data";
import type { MateriBuilderSection } from "@/modules/mentor/materi-builder-types";

const storageKey = "vecalss.kapten.materi-drafts.v1";
const serverStorageSnapshot = "__vecalss_server_storage_snapshot__";

type StoredMateriDraft = {
  materi: KaptenMateri;
  savedAt: number;
  sections: MateriBuilderSection[];
};

function readDrafts(): StoredMateriDraft[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(storageKey);
    const parsed = value ? (JSON.parse(value) as unknown) : [];

    return Array.isArray(parsed) ? (parsed as StoredMateriDraft[]) : [];
  } catch {
    return [];
  }
}

function parseDrafts(value: string | null): StoredMateriDraft[] {
  try {
    const parsed = value ? (JSON.parse(value) as unknown) : [];

    return Array.isArray(parsed) ? (parsed as StoredMateriDraft[]) : [];
  } catch {
    return [];
  }
}

function writeDrafts(drafts: StoredMateriDraft[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(drafts));
}

function getStoredMateriDraft(id: string | undefined) {
  if (!id) {
    return null;
  }

  return readDrafts().find((draft) => draft.materi.id === id) ?? null;
}

function useStoredMateriDraft(id: string) {
  const serializedDrafts = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => window.localStorage.getItem(storageKey),
    () => serverStorageSnapshot,
  );

  return useMemo(() => {
    if (serializedDrafts === serverStorageSnapshot) {
      return undefined;
    }

    return parseDrafts(serializedDrafts).find((draft) => draft.materi.id === id) ?? null;
  }, [id, serializedDrafts]);
}

function saveMateriDraft(draft: Omit<StoredMateriDraft, "savedAt">) {
  const drafts = readDrafts();
  const savedDraft: StoredMateriDraft = { ...draft, savedAt: Date.now() };
  const index = drafts.findIndex((item) => item.materi.id === draft.materi.id);

  if (index >= 0) {
    drafts[index] = savedDraft;
  } else {
    drafts.push(savedDraft);
  }

  writeDrafts(drafts);
  return savedDraft;
}

function getMateriWithStoredDrafts(baseMateri: KaptenMateri[]) {
  const drafts = readDrafts().sort((a, b) => b.savedAt - a.savedAt);
  const existingIds = new Set(baseMateri.map((item) => item.id));
  const newDrafts = drafts
    .filter((draft) => !existingIds.has(draft.materi.id))
    .map((draft) => draft.materi);
  const updatedMateri = baseMateri.map(
    (item) => drafts.find((draft) => draft.materi.id === item.id)?.materi ?? item,
  );

  return [...newDrafts, ...updatedMateri];
}

function getRecentlyEditedMateri(baseResources: KaptenMateri[]) {
  const saved = readDrafts()
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((draft) => draft.materi);
  const savedIds = new Set(saved.map((item) => item.id));

  return [...saved, ...baseResources.filter((item) => !savedIds.has(item.id))];
}

export {
  getMateriWithStoredDrafts,
  getRecentlyEditedMateri,
  getStoredMateriDraft,
  saveMateriDraft,
  useStoredMateriDraft,
};

export type { StoredMateriDraft };

"use client";

import { useMemo, useSyncExternalStore } from "react";

import { canonicalDashboardHref, isUuidLike } from "@/modules/mentor/dashboard-types";
import type { KaptenQuiz, KaptenResource } from "@/modules/mentor/mock-data";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

const storageKeyPrefix = "vecalss-kapten-quiz-drafts";
const changeEvent = "vecalss-quiz-drafts-change";
const serverStorageSnapshot = "__vecalss_server_storage_snapshot__";

type StoredQuizDraft = {
  quiz: StoredQuiz;
  questions: QuizQuestionSnapshot[];
  savedAt: number;
  scopeId: string;
  sourceBankId: string;
};

type StoredQuiz = KaptenQuiz & { resourceType: "quiz" };

type StoredQuizDraftInput = Omit<StoredQuizDraft, "savedAt" | "scopeId">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isQuizQuestionSnapshot(value: unknown): value is QuizQuestionSnapshot {
  if (!isRecord(value) || !Array.isArray(value.choices)) return false;

  return (
    typeof value.id === "string"
    && (value.origin === "bank" || value.origin === "local")
    && typeof value.prompt === "string"
    && (value.promptMediaAssetId === undefined || (typeof value.promptMediaAssetId === "string" && value.promptMediaAssetId.trim().length > 0))
    && typeof value.correctChoiceId === "string"
    && typeof value.explanation === "string"
    && (value.explanationMediaAssetId === undefined || (typeof value.explanationMediaAssetId === "string" && value.explanationMediaAssetId.trim().length > 0))
    && (value.sourceQuestionId === undefined || typeof value.sourceQuestionId === "string")
    && (value.isReady === undefined || typeof value.isReady === "boolean")
    && value.choices.every(
      (choice) =>
        isRecord(choice)
        && typeof choice.id === "string"
        && (choice.mediaAssetId === undefined || (typeof choice.mediaAssetId === "string" && choice.mediaAssetId.trim().length > 0))
        && typeof choice.text === "string",
    )
  );
}

function isKaptenQuiz(value: unknown): value is StoredQuiz {
  if (!isRecord(value)) return false;

  return (
    isUuidLike(value.id)
    && typeof value.title === "string"
    && typeof value.description === "string"
    && typeof value.href === "string"
    && typeof value.primaryMetric === "string"
    && typeof value.progress === "number"
    && Number.isFinite(value.progress)
    && value.progress >= 0
    && value.progress <= 100
    && value.resourceType === "quiz"
    && typeof value.questionCount === "number"
    && Number.isFinite(value.questionCount)
    && typeof value.sourceBank === "string"
    && (value.sourceBankId === undefined || typeof value.sourceBankId === "string")
    && (value.opensAt === undefined || typeof value.opensAt === "string")
    && (value.closesAt === undefined || typeof value.closesAt === "string")
    && ["draft", "scheduled", "published", "archived"].includes(value.status as string)
    && (value.subjectCode === undefined || typeof value.subjectCode === "string")
    && (value.subjectName === undefined || typeof value.subjectName === "string")
    && (value.scheduledFor === undefined || typeof value.scheduledFor === "string")
    && typeof value.updatedAt === "string"
  );
}

function isStoredQuizDraft(value: unknown, scopeId?: string): value is StoredQuizDraft {
  if (!isRecord(value) || !isUuidLike(value.scopeId)) return false;
  if (scopeId !== undefined && value.scopeId !== scopeId) return false;

  return (
    isKaptenQuiz(value.quiz)
    && Array.isArray(value.questions)
    && value.questions.every(isQuizQuestionSnapshot)
    && typeof value.sourceBankId === "string"
    && typeof value.savedAt === "number"
    && Number.isFinite(value.savedAt)
  );
}

function storageKeyForTutor(tutorId: string) {
  return isUuidLike(tutorId)
    ? `${storageKeyPrefix}:${encodeURIComponent(tutorId)}`
    : null;
}

function parseDrafts(value: string | null, scopeId: string): StoredQuizDraft[] {
  if (!value || !storageKeyForTutor(scopeId)) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((draft): draft is StoredQuizDraft => isStoredQuizDraft(draft, scopeId))
      : [];
  } catch {
    return [];
  }
}

function readDrafts(tutorId: string) {
  if (typeof window === "undefined") return [];

  const key = storageKeyForTutor(tutorId);
  if (!key) return [];

  return parseDrafts(window.localStorage.getItem(key), tutorId);
}

function writeDrafts(tutorId: string, drafts: StoredQuizDraft[]) {
  const key = storageKeyForTutor(tutorId);
  if (!key) return false;

  window.localStorage.setItem(key, JSON.stringify(drafts));
  window.dispatchEvent(new Event(changeEvent));
  return true;
}

function getStoredQuizDraft(tutorId: string, id: string | undefined) {
  if (!id || !isUuidLike(id)) return null;

  return readDrafts(tutorId).find((draft) => draft.quiz.id === id) ?? null;
}

function subscribeToDraftChanges(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(changeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(changeEvent, onStoreChange);
  };
}

function useStoredQuizDraft(tutorId: string, id: string) {
  const storageKey = storageKeyForTutor(tutorId);
  const serializedDrafts = useSyncExternalStore(
    subscribeToDraftChanges,
    () => storageKey ? window.localStorage.getItem(storageKey) ?? serverStorageSnapshot : serverStorageSnapshot,
    () => serverStorageSnapshot,
  );

  return useMemo(() => {
    if (serializedDrafts === serverStorageSnapshot) return undefined;
    return getStoredQuizDraftFromSerialized(serializedDrafts, tutorId, id);
  }, [id, serializedDrafts, tutorId]);
}

function useStoredQuizDrafts(tutorId: string) {
  const storageKey = storageKeyForTutor(tutorId);
  const serializedDrafts = useSyncExternalStore(
    subscribeToDraftChanges,
    () => storageKey ? window.localStorage.getItem(storageKey) ?? serverStorageSnapshot : serverStorageSnapshot,
    () => serverStorageSnapshot,
  );

  return useMemo(
    () => serializedDrafts === serverStorageSnapshot ? undefined : parseDrafts(serializedDrafts, tutorId).sort(compareSavedAt),
    [serializedDrafts, tutorId],
  );
}

function getStoredQuizDraftFromSerialized(serializedDrafts: string, tutorId: string, id: string) {
  if (!isUuidLike(id)) return null;
  return parseDrafts(serializedDrafts, tutorId).find((draft) => draft.quiz.id === id) ?? null;
}

function compareSavedAt(left: StoredQuizDraft, right: StoredQuizDraft) {
  return right.savedAt - left.savedAt || left.quiz.id.localeCompare(right.quiz.id);
}

function saveQuizDraft(tutorId: string, draft: StoredQuizDraftInput) {
  if (!storageKeyForTutor(tutorId)) {
    throw new Error("Quiz draft scope must be a valid tutor identifier.");
  }

  const savedDraft: StoredQuizDraft = {
    ...draft,
    savedAt: Date.now(),
    scopeId: tutorId,
  };
  if (!isStoredQuizDraft(savedDraft, tutorId)) {
    throw new Error("Quiz draft payload is invalid.");
  }

  const drafts = readDrafts(tutorId);
  const existingIndex = drafts.findIndex((item) => item.quiz.id === savedDraft.quiz.id);
  if (existingIndex >= 0) drafts[existingIndex] = savedDraft;
  else drafts.push(savedDraft);

  writeDrafts(tutorId, drafts);
  return savedDraft;
}

function overlayQuizDraft(baseQuiz: KaptenQuiz, draft: StoredQuizDraft) {
  const href = canonicalDashboardHref("quiz", baseQuiz.id);
  if (!href) return baseQuiz;

  return {
    ...baseQuiz,
    // The persisted row remains the identity and title authority. Local
    // content can indicate the latest editing state, but cannot redirect or
    // rename another tutor's server resource.
    description: draft.quiz.description,
    href,
    primaryMetric: draft.quiz.primaryMetric,
    progress: draft.quiz.progress,
    title: baseQuiz.title,
    updatedAt: new Date(draft.savedAt).toISOString(),
  };
}

function getQuizWithStoredDrafts(tutorId: string, baseQuizzes: KaptenQuiz[]) {
  const drafts = readDrafts(tutorId).sort(compareSavedAt);
  const storedById = new Map(drafts.map((draft) => [draft.quiz.id, draft]));

  return baseQuizzes.map((quiz) => {
    const draft = storedById.get(quiz.id);
    return draft ? overlayQuizDraft(quiz, draft) : quiz;
  });
}

function getRecentlyEditedQuizzes(tutorId: string, baseQuizzes: KaptenQuiz[]): KaptenResource[] {
  const drafts = readDrafts(tutorId).sort(compareSavedAt);
  const baseById = new Map(baseQuizzes.map((quiz) => [quiz.id, quiz]));

  return drafts.flatMap((draft) => {
    const baseQuiz = baseById.get(draft.quiz.id);
    return baseQuiz ? [overlayQuizDraft(baseQuiz, draft)] : [];
  });
}

function getStoredQuizDrafts(tutorId: string) {
  return readDrafts(tutorId).sort(compareSavedAt);
}

export {
  getQuizWithStoredDrafts,
  getRecentlyEditedQuizzes,
  getStoredQuizDrafts,
  getStoredQuizDraft,
  isStoredQuizDraft,
  parseDrafts,
  saveQuizDraft,
  storageKeyForTutor,
  useStoredQuizDraft,
  useStoredQuizDrafts,
};

export type { StoredQuizDraft, StoredQuizDraftInput };

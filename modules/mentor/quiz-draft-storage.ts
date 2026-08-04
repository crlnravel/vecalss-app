"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { KaptenQuiz, KaptenResource } from "@/modules/mentor/mock-data";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

const storageKey = "vecalss-kapten-quiz-drafts";
const changeEvent = "vecalss-quiz-drafts-change";
const serverStorageSnapshot = "__vecalss_server_storage_snapshot__";

type StoredQuizDraft = {
  quiz: KaptenQuiz;
  questions: QuizQuestionSnapshot[];
  savedAt: number;
  sourceBankId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isQuizQuestionSnapshot(value: unknown): value is QuizQuestionSnapshot {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return false;
  }

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

function isKaptenQuiz(value: unknown): value is KaptenQuiz {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.description === "string"
    && typeof value.href === "string"
    && typeof value.primaryMetric === "string"
    && typeof value.progress === "number"
    && Number.isFinite(value.progress)
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

function isStoredQuizDraft(value: unknown): value is StoredQuizDraft {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isKaptenQuiz(value.quiz)
    && Array.isArray(value.questions)
    && value.questions.every(isQuizQuestionSnapshot)
    && typeof value.sourceBankId === "string"
    && typeof value.savedAt === "number"
    && Number.isFinite(value.savedAt)
  );
}

function parseDrafts(value: string | null): StoredQuizDraft[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isStoredQuizDraft) : [];
  } catch {
    return [];
  }
}

function readDrafts() {
  if (typeof window === "undefined") {
    return [];
  }

  return parseDrafts(window.localStorage.getItem(storageKey));
}

function writeDrafts(drafts: StoredQuizDraft[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(drafts));
  window.dispatchEvent(new Event(changeEvent));
}

function getStoredQuizDraft(id: string | undefined) {
  if (!id) {
    return null;
  }

  return readDrafts().find((draft) => draft.quiz.id === id) ?? null;
}

function useStoredQuizDraft(id: string) {
  const serializedDrafts = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener(changeEvent, onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(changeEvent, onStoreChange);
      };
    },
    () => window.localStorage.getItem(storageKey) ?? serverStorageSnapshot,
    () => serverStorageSnapshot,
  );

  return useMemo(() => {
    if (serializedDrafts === serverStorageSnapshot) {
      return undefined;
    }

    return parseDrafts(serializedDrafts).find((draft) => draft.quiz.id === id) ?? null;
  }, [id, serializedDrafts]);
}

function useStoredQuizDrafts() {
  const serializedDrafts = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener(changeEvent, onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(changeEvent, onStoreChange);
      };
    },
    () => window.localStorage.getItem(storageKey) ?? serverStorageSnapshot,
    () => serverStorageSnapshot,
  );

  return useMemo(() => serializedDrafts === serverStorageSnapshot ? undefined : parseDrafts(serializedDrafts), [serializedDrafts]);
}

function saveQuizDraft(draft: Omit<StoredQuizDraft, "savedAt">) {
  const drafts = readDrafts();
  const savedDraft: StoredQuizDraft = { ...draft, savedAt: Date.now() };
  const existingIndex = drafts.findIndex((item) => item.quiz.id === draft.quiz.id);

  if (existingIndex >= 0) {
    drafts[existingIndex] = savedDraft;
  } else {
    drafts.push(savedDraft);
  }

  writeDrafts(drafts);
  return savedDraft;
}

function getQuizWithStoredDrafts(baseQuizzes: KaptenQuiz[]) {
  const drafts = readDrafts().sort((a, b) => b.savedAt - a.savedAt);
  const storedById = new Map(drafts.map((draft) => [draft.quiz.id, draft.quiz]));
  const existingIds = new Set(baseQuizzes.map((quiz) => quiz.id));
  const newDrafts = drafts.reduce<KaptenQuiz[]>((quizzes, draft) => {
    if (!existingIds.has(draft.quiz.id)) quizzes.push(draft.quiz);
    return quizzes;
  }, []);

  return [
    ...newDrafts,
    ...baseQuizzes.map((quiz) => storedById.get(quiz.id) ?? quiz),
  ];
}

function getRecentlyEditedQuizzes(baseQuizzes: KaptenQuiz[]): KaptenResource[] {
  const saved = getQuizWithStoredDrafts(baseQuizzes);
  const storedIds = new Set(readDrafts().map((draft) => draft.quiz.id));

  return saved.filter((quiz) => storedIds.has(quiz.id));
}

function getStoredQuizDrafts() {
  return readDrafts().sort((a, b) => b.savedAt - a.savedAt);
}

export {
  getQuizWithStoredDrafts,
  getRecentlyEditedQuizzes,
  getStoredQuizDrafts,
  getStoredQuizDraft,
  saveQuizDraft,
  useStoredQuizDraft,
  useStoredQuizDrafts,
};

export type { StoredQuizDraft };

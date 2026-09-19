"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  kaptenSubjects,
  type BankQuestion,
  type KaptenQuestionBank,
} from "@/modules/mentor/mock-data";

const storageKey = "vecalss.kapten.question-bank-drafts.v2";
const legacyStorageKey = "vecalss.kapten.question-bank-drafts.v1";
const changeEvent = "vecalss-question-bank-drafts-change";
const serverStorageSnapshot = "__vecalss_server_question_bank_storage_snapshot__";
const subjectCodes = new Set(kaptenSubjects.map((subject) => subject.code));

type StoredQuestionBankDraft = {
  bank: KaptenQuestionBank;
  questions: BankQuestion[];
  savedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isQuestionChoice(value: unknown): value is { id: string; text: string } {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id.trim().length > 0
    && (value.mediaAssetId === undefined || (typeof value.mediaAssetId === "string" && value.mediaAssetId.trim().length > 0))
    && typeof value.text === "string";
}

function isBankQuestion(value: unknown): value is BankQuestion {
  if (!isRecord(value) || !Array.isArray(value.choices) || !Array.isArray(value.tags)) {
    return false;
  }

  const answerMode = value.questionType === undefined ? "single_choice" : value.questionType;
  const rawCorrectChoiceIds = value.correctChoiceIds;
  const correctChoiceIds: string[] | null = rawCorrectChoiceIds === undefined
    ? [typeof value.correctChoiceId === "string" ? value.correctChoiceId : ""]
    : Array.isArray(rawCorrectChoiceIds) && rawCorrectChoiceIds.every((id): id is string => typeof id === "string")
      ? rawCorrectChoiceIds
      : null;
  const choiceIds = new Set(value.choices.filter(isQuestionChoice).map((choice) => choice.id));
  const validCorrectChoiceIds = Boolean(correctChoiceIds
    && correctChoiceIds.length > 0
    && new Set(correctChoiceIds).size === correctChoiceIds.length
    && correctChoiceIds.every((id) => choiceIds.has(id))
    && (answerMode === "multiple_choice" || (answerMode === "single_choice" && correctChoiceIds.length === 1)));

  return (
    typeof value.bankId === "string"
    && value.bankId.trim().length > 0
    && typeof value.id === "string"
    && value.id.trim().length > 0
    && typeof value.prompt === "string"
    && (value.promptMediaAssetId === undefined || (typeof value.promptMediaAssetId === "string" && value.promptMediaAssetId.trim().length > 0))
    && typeof value.correctChoiceId === "string"
    && (answerMode === "single_choice" || answerMode === "multiple_choice")
    && typeof value.explanation === "string"
    && (value.explanationMediaAssetId === undefined || (typeof value.explanationMediaAssetId === "string" && value.explanationMediaAssetId.trim().length > 0))
    && ["easy", "medium", "hard"].includes(value.difficulty as string)
    && typeof value.subjectCode === "string"
    && value.choices.length >= 2
    && value.choices.length <= 5
    && value.choices.every(isQuestionChoice)
    && new Set(value.choices.map((choice) => choice.id)).size === value.choices.length
    && validCorrectChoiceIds
    && value.tags.every((tag) => typeof tag === "string")
  );
}

function isKaptenQuestionBank(value: unknown): value is KaptenQuestionBank {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string"
    && value.id.trim().length > 0
    && typeof value.title === "string"
    && typeof value.description === "string"
    && typeof value.href === "string"
    && typeof value.primaryMetric === "string"
    && typeof value.progress === "number"
    && Number.isFinite(value.progress)
    && value.progress >= 0
    && value.progress <= 100
    && value.resourceType === "question-bank"
    && typeof value.questionCount === "number"
    && Number.isInteger(value.questionCount)
    && value.questionCount >= 0
    && typeof value.difficultyMix === "string"
    && Array.isArray(value.reusableIn)
    && value.reusableIn.every((item) => typeof item === "string")
    && ["draft", "scheduled", "published", "archived"].includes(value.status as string)
    && (value.subjectCode === undefined || typeof value.subjectCode === "string")
    && (value.subjectName === undefined || typeof value.subjectName === "string")
    && (value.topic === undefined || typeof value.topic === "string")
    && (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")))
    && (value.scheduledFor === undefined || typeof value.scheduledFor === "string")
    && typeof value.updatedAt === "string"
  );
}

function isStoredQuestionBankDraft(value: unknown): value is StoredQuestionBankDraft {
  if (!isRecord(value) || !isKaptenQuestionBank(value.bank) || !Array.isArray(value.questions)) {
    return false;
  }

  const questions = value.questions;
  const bank = value.bank;
  const ids = new Set<string>();

  return (
    typeof value.savedAt === "number"
    && Number.isFinite(value.savedAt)
    && bank.questionCount === questions.length
    && questions.every((question) => {
      if (
        !isBankQuestion(question)
        || question.bankId !== bank.id
        || ids.has(question.id)
      ) {
        return false;
      }

      ids.add(question.id);
      return true;
    })
  );
}

function parseDrafts(value: string | null): StoredQuestionBankDraft[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const validDrafts = parsed.filter(isStoredQuestionBankDraft);
    const counts = new Map<string, number>();
    for (const draft of validDrafts) {
      counts.set(draft.bank.id, (counts.get(draft.bank.id) ?? 0) + 1);
    }

    return validDrafts.reduce<StoredQuestionBankDraft[]>((drafts, draft) => {
      if (counts.get(draft.bank.id) === 1) drafts.push(sanitizeDraft(draft));
      return drafts;
    }, []);
  } catch {
    return [];
  }
}

function sanitizeDraft(draft: StoredQuestionBankDraft): StoredQuestionBankDraft {
  const questions = draft.questions.map((question) => ({
    ...question,
    subjectCode: subjectCodes.has(question.subjectCode) ? question.subjectCode : subjectCodes.has(draft.bank.subjectCode ?? "") ? draft.bank.subjectCode! : "PU",
    // Free-form question tags were a prototype-only field. Subtest is now the
    // complete question classification shown to Kapten.
    tags: [],
    topic: undefined,
  }));
  const originalTags = draft.bank.tags;
  const validTags = originalTags?.filter((tag) => subjectCodes.has(tag)) ?? [];
  const containsLegacyTag = Boolean(originalTags?.some((tag) => !subjectCodes.has(tag))) || (!originalTags && Boolean(draft.bank.topic));
  const derivedTags = [...new Set(questions.map((question) => question.subjectCode))];

  return {
    ...draft,
    bank: {
      ...draft.bank,
      status: draft.bank.status === "archived" ? "archived" : "published",
      tags: containsLegacyTag || originalTags === undefined ? derivedTags : [...new Set(validTags)],
    },
    questions,
  };
}

function readDrafts() {
  if (typeof window === "undefined") {
    return [];
  }

  const current = parseDrafts(window.localStorage.getItem(storageKey));
  if (current.length || !window.localStorage.getItem(legacyStorageKey)) return current;

  // The v1 prototype treated bank.subjectCode as authoritative. Keep the
  // draft readable, but move its classification onto every question instead.
  const migrated = parseDrafts(window.localStorage.getItem(legacyStorageKey)).map((draft) => sanitizeDraft({
    ...draft,
    bank: { ...draft.bank, tags: draft.bank.tags ?? (draft.bank.topic ? [draft.bank.topic] : []) },
    questions: draft.questions.map((question) => ({
      ...question,
      subjectCode: question.subjectCode || draft.bank.subjectCode || "PU",
    })),
  }));
  if (migrated.length) writeDrafts(migrated);
  return migrated;
}

function writeDrafts(drafts: StoredQuestionBankDraft[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(drafts));
  window.dispatchEvent(new Event(changeEvent));
}

function getStoredQuestionBankDraft(id: string | undefined) {
  if (!id) {
    return null;
  }

  return readDrafts().find((draft) => draft.bank.id === id) ?? null;
}

function useStoredQuestionBankDraft(id: string) {
  const serializedDrafts = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener(changeEvent, onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(changeEvent, onStoreChange);
      };
    },
    () => window.localStorage.getItem(storageKey) ?? "[]",
    () => serverStorageSnapshot,
  );

  return useMemo(() => {
    if (serializedDrafts === serverStorageSnapshot) {
      return undefined;
    }

    return parseDrafts(serializedDrafts).find((draft) => draft.bank.id === id) ?? null;
  }, [id, serializedDrafts]);
}

function saveQuestionBankDraft(draft: Omit<StoredQuestionBankDraft, "savedAt">) {
  const sanitizedDraft = sanitizeDraft({ ...draft, savedAt: 0 });
  if (!isStoredQuestionBankDraft(sanitizedDraft)) {
    throw new Error("Question Bank draft is not structurally valid");
  }

  const drafts = readDrafts();
  const savedDraft: StoredQuestionBankDraft = { ...sanitizedDraft, savedAt: Date.now() };
  const existingIndex = drafts.findIndex((item) => item.bank.id === sanitizedDraft.bank.id);

  if (existingIndex >= 0) {
    drafts[existingIndex] = savedDraft;
  } else {
    drafts.push(savedDraft);
  }

  writeDrafts(drafts);
  return savedDraft;
}

function getQuestionBankCatalog() {
  const drafts = readDrafts().sort((a, b) => b.savedAt - a.savedAt);
  return drafts.map((draft) => ({ bank: draft.bank, questions: draft.questions }));
}

function getQuestionBankSourceCatalog() {
  return getQuestionBankCatalog().reduce<Array<{ bank: KaptenQuestionBank; questions: BankQuestion[] }>>((sources, { bank, questions }) => {
    const readyQuestions = bank.status !== "archived" ? questions.filter(isReadyBankQuestion) : [];
    if (readyQuestions.length > 0) sources.push({ bank, questions: readyQuestions });
    return sources;
  }, []);
}

function updateQuestionBankLifecycle(
  ids: string[],
  operation: "archive" | "restore",
) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) throw new Error("Pilih minimal satu bank soal.");

  const catalog = getQuestionBankCatalog();
  const uniqueIdSet = new Set(uniqueIds);
  const selected = catalog.filter(({ bank }) => uniqueIdSet.has(bank.id));
  if (selected.length !== uniqueIds.length) {
    throw new Error("Sebagian bank soal tidak ditemukan. Muat ulang halaman lalu coba lagi.");
  }

  const requiredStatus = operation === "archive" ? "published" : "archived";
  if (selected.some(({ bank }) => bank.status !== requiredStatus)) {
    throw new Error(
      operation === "archive"
        ? "Pilih hanya bank soal yang belum diarsipkan."
        : "Pilih hanya bank soal yang sudah diarsipkan.",
    );
  }

  const nextStatus = operation === "archive" ? "archived" : "published";
  const stored = readDrafts();
  const byId = new Map(stored.map((draft) => [draft.bank.id, draft]));
  for (const { bank, questions } of selected) {
    byId.set(bank.id, {
      bank: { ...bank, status: nextStatus, updatedAt: "Diedit baru saja" },
      questions,
      savedAt: Date.now(),
    });
  }
  writeDrafts([...byId.values()]);
  return { banks: selected.map(({ bank }) => ({ ...bank, status: nextStatus, updatedAt: "Diedit baru saja" })), status: nextStatus };
}

function isReadyBankQuestion(question: BankQuestion) {
  const correctChoiceIds = question.correctChoiceIds ?? [question.correctChoiceId];
  const answerMode = question.questionType ?? "single_choice";
  return (
    question.prompt.trim().length > 0
    && question.choices.length >= 2
    && question.choices.length <= 5
    && question.choices.every((choice) => choice.text.trim().length > 0)
    && correctChoiceIds.length > 0
    && new Set(correctChoiceIds).size === correctChoiceIds.length
    && correctChoiceIds.every((id) => question.choices.some((choice) => choice.id === id))
    && (answerMode === "multiple_choice" || (answerMode === "single_choice" && correctChoiceIds.length === 1))
  );
}

function getRecentlyEditedQuestionBanks() {
  return readDrafts().sort((a, b) => b.savedAt - a.savedAt).map((draft) => draft.bank);
}

function getSubjectName(subjectCode: string) {
  return kaptenSubjects.find((subject) => subject.code === subjectCode)?.name ?? subjectCode;
}

export {
  getQuestionBankCatalog,
  getQuestionBankSourceCatalog,
  getRecentlyEditedQuestionBanks,
  getStoredQuestionBankDraft,
  getSubjectName,
  isReadyBankQuestion,
  saveQuestionBankDraft,
  updateQuestionBankLifecycle,
  useStoredQuestionBankDraft,
};

export type { StoredQuestionBankDraft };

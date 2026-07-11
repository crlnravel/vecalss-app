"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  bankQuestions,
  kaptenSubjects,
  questionBanks,
  type BankQuestion,
  type KaptenQuestionBank,
} from "@/modules/mentor/mock-data";

const storageKey = "vecalss.kapten.question-bank-drafts.v1";
const changeEvent = "vecalss-question-bank-drafts-change";
const serverStorageSnapshot = "__vecalss_server_question_bank_storage_snapshot__";

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
    && typeof value.text === "string";
}

function isBankQuestion(value: unknown): value is BankQuestion {
  if (!isRecord(value) || !Array.isArray(value.choices) || !Array.isArray(value.tags)) {
    return false;
  }

  return (
    typeof value.bankId === "string"
    && value.bankId.trim().length > 0
    && typeof value.id === "string"
    && value.id.trim().length > 0
    && typeof value.prompt === "string"
    && typeof value.correctChoiceId === "string"
    && typeof value.explanation === "string"
    && ["easy", "medium", "hard"].includes(value.difficulty as string)
    && typeof value.subjectCode === "string"
    && value.choices.length === 4
    && value.choices.every(isQuestionChoice)
    && new Set(value.choices.map((choice) => choice.id)).size === value.choices.length
    && value.choices.filter((choice) => choice.id === value.correctChoiceId).length === 1
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
    && typeof value.subjectCode === "string"
    && (value.subjectName === undefined || typeof value.subjectName === "string")
    && (value.topic === undefined || typeof value.topic === "string")
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
        || question.subjectCode !== bank.subjectCode
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

    return validDrafts.filter((draft) => counts.get(draft.bank.id) === 1);
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
  if (!isStoredQuestionBankDraft({ ...draft, savedAt: 0 })) {
    throw new Error("Question Bank draft is not structurally valid");
  }

  const drafts = readDrafts();
  const savedDraft: StoredQuestionBankDraft = { ...draft, savedAt: Date.now() };
  const existingIndex = drafts.findIndex((item) => item.bank.id === draft.bank.id);

  if (existingIndex >= 0) {
    drafts[existingIndex] = savedDraft;
  } else {
    drafts.push(savedDraft);
  }

  writeDrafts(drafts);
  return savedDraft;
}

function getQuestionBankCatalog(
  baseBanks: KaptenQuestionBank[] = questionBanks,
  baseQuestions: BankQuestion[] = bankQuestions,
) {
  const drafts = readDrafts().sort((a, b) => b.savedAt - a.savedAt);
  const storedById = new Map(drafts.map((draft) => [draft.bank.id, draft]));
  const seedByBankId = new Map(baseQuestions.map((question) => [question.bankId, [] as BankQuestion[]]));

  for (const question of baseQuestions) {
    seedByBankId.get(question.bankId)?.push(question);
  }

  const composed = baseBanks.map((bank) => {
    const override = storedById.get(bank.id);
    return {
      bank: override?.bank ?? bank,
      questions: override?.questions ?? seedByBankId.get(bank.id) ?? [],
    };
  });
  const seedIds = new Set(baseBanks.map((bank) => bank.id));

  for (const draft of drafts) {
    if (!seedIds.has(draft.bank.id)) {
      composed.unshift({ bank: draft.bank, questions: draft.questions });
    }
  }

  return composed;
}

function getQuestionBankSourceCatalog() {
  return getQuestionBankCatalog().map(({ bank, questions }) => ({
    bank,
    questions: questions.filter(isReadyBankQuestion),
  }));
}

function isReadyBankQuestion(question: BankQuestion) {
  return (
    question.prompt.trim().length > 0
    && question.choices.length === 4
    && question.choices.every((choice) => choice.text.trim().length > 0)
    && question.choices.some((choice) => choice.id === question.correctChoiceId)
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
  useStoredQuestionBankDraft,
};

export type { StoredQuestionBankDraft };

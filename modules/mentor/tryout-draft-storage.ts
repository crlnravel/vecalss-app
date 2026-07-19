"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

const storageKey = "vecalss.kapten.tryout-drafts.v1";
const changeEvent = "vecalss-tryout-drafts-change";
const serverSnapshot = "__vecalss_tryout_server_snapshot__";

export type TryoutSection = { durationMinutes: number; id: string; questionIds: string[]; subtest: string };
export type TryoutDraft = { description: string; id: string; locked: boolean; questions: QuizQuestionSnapshot[]; sections: TryoutSection[]; status: "draft" | "published"; title: string; updatedAt: number };

function valid(value: unknown): value is TryoutDraft {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TryoutDraft>;
  return typeof item.id === "string" && typeof item.title === "string" && typeof item.description === "string" && (item.status === "draft" || item.status === "published") && typeof item.locked === "boolean" && Array.isArray(item.sections) && Array.isArray(item.questions);
}
function parse(value: string | null) { try { const parsed: unknown = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter(valid) : []; } catch { return []; } }
function read() { return typeof window === "undefined" ? [] : parse(window.localStorage.getItem(storageKey)); }
function write(next: TryoutDraft[]) { window.localStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new Event(changeEvent)); }
function saveTryoutDraft(draft: TryoutDraft) { const all = read(); const index = all.findIndex((item) => item.id === draft.id); if (index >= 0) all[index] = draft; else all.unshift(draft); write(all); return draft; }
function getTryoutDraft(id: string) { return read().find((item) => item.id === id) ?? null; }
function useTryoutDraft(id: string) {
  const value = useSyncExternalStore((onChange) => { window.addEventListener("storage", onChange); window.addEventListener(changeEvent, onChange); return () => { window.removeEventListener("storage", onChange); window.removeEventListener(changeEvent, onChange); }; }, () => window.localStorage.getItem(storageKey) ?? "[]", () => serverSnapshot);
  return useMemo(() => value === serverSnapshot ? undefined : parse(value).find((item) => item.id === id) ?? null, [id, value]);
}

export { getTryoutDraft, read as getTryoutDrafts, saveTryoutDraft, useTryoutDraft };

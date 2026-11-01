"use client";

import { useState } from "react";

import type { VeraSessionSummary } from "@/lib/vera/conversations";

export type SessionView = "active" | "archived";

/**
 * The sidebar's two lists. The active list starts from the server. The archive loads the first time it is opened. Every change
 * goes through a handler, so nothing here needs an effect.
 */
export function useVeraSessions(initial: VeraSessionSummary[]) {
  const [view, setView] = useState<SessionView>("active");
  const [active, setActive] = useState(initial);
  const [archived, setArchived] = useState<VeraSessionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(target: SessionView) {
    setLoading(true);
    try {
      const response = await fetch(`/api/vera/conversations?archived=${target === "archived" ? "1" : "0"}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Session list failed with ${response.status}`);
      const { conversations } = (await response.json()) as { conversations: VeraSessionSummary[] };
      setError(null);
      if (target === "active") setActive(conversations);
      else setArchived(conversations);
    } catch {
      setError("Daftar sesi belum bisa dimuat. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  function changeView(next: SessionView) {
    setView(next);
    void load(next);
  }

  /** Reloads the lists that are on screen, so a new session or a fresh title shows up. */
  function refresh() {
    void load("active");
    if (archived !== null) void load("archived");
  }

  async function send(id: string, method: "PATCH" | "DELETE", body?: { title?: string; archived?: boolean }) {
    try {
      const response = await fetch(`/api/vera/conversations/${encodeURIComponent(id)}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Session change failed with ${response.status}`);
      return true;
    } catch {
      setError("Sesi belum bisa diubah. Coba lagi.");
      return false;
    }
  }

  async function rename(id: string, title: string) {
    if (!(await send(id, "PATCH", { title }))) return;
    const retitle = (list: VeraSessionSummary[]) => list.map((session) => (session.id === id ? { ...session, title } : session));
    setActive((list) => retitle(list));
    setArchived((list) => (list ? retitle(list) : list));
  }

  /** Archiving moves the session to the archive, and restoring moves it back. The list it joins reloads, so its order stays right. */
  async function archive(id: string, toArchive: boolean) {
    if (!(await send(id, "PATCH", { archived: toArchive }))) return;
    if (toArchive) setActive((list) => list.filter((session) => session.id !== id));
    else setArchived((list) => (list ? list.filter((session) => session.id !== id) : list));
    void load(toArchive ? "archived" : "active");
  }

  async function remove(id: string) {
    if (!(await send(id, "DELETE"))) return;
    setActive((list) => list.filter((session) => session.id !== id));
    setArchived((list) => (list ? list.filter((session) => session.id !== id) : list));
  }

  return {
    view,
    sessions: view === "active" ? active : (archived ?? []),
    loading,
    error,
    changeView,
    refresh,
    rename,
    archive,
    remove,
  };
}

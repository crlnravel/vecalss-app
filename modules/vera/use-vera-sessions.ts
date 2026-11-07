"use client";

import { useState } from "react";

import type { VeraSessionSummary } from "@/lib/vera/conversations";

/**
 * The sidebar's list of active sessions. It starts from the server, and every change goes through a handler, so nothing here needs an
 * effect. The archive has no list in the UI any more. The archive API and its data are left as they are.
 */
export function useVeraSessions(initial: VeraSessionSummary[]) {
  const [active, setActive] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/vera/conversations?archived=0", { cache: "no-store" });
      if (!response.ok) throw new Error(`Session list failed with ${response.status}`);
      const { conversations } = (await response.json()) as { conversations: VeraSessionSummary[] };
      setError(null);
      setActive(conversations);
    } catch {
      setError("Daftar sesi belum bisa dimuat. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  /** Reloads the list, so a new session or a fresh title shows up. */
  function refresh() {
    void load();
  }

  async function send(id: string, method: "PATCH" | "DELETE", body?: { title: string }) {
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
    setActive((list) => list.map((session) => (session.id === id ? { ...session, title } : session)));
  }

  async function remove(id: string) {
    if (!(await send(id, "DELETE"))) return;
    setActive((list) => list.filter((session) => session.id !== id));
  }

  return {
    sessions: active,
    loading,
    error,
    refresh,
    rename,
    remove,
  };
}

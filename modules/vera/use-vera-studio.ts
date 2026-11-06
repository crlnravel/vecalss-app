"use client";

import { useState } from "react";

import type { StudioDocumentSummary } from "@/lib/vera/studio-documents";

/**
 * The saved Studio documents. The list starts from the server, and every change goes through a handler, so nothing needs an effect.
 */
export function useVeraStudioDocs(initial: StudioDocumentSummary[]) {
  const [documents, setDocuments] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/api/vera/studio", { cache: "no-store" });
      if (!response.ok) throw new Error(`Studio list failed with ${response.status}`);
      const { documents: next } = (await response.json()) as { documents: StudioDocumentSummary[] };
      setDocuments(next);
      setError(null);
    } catch {
      setError("Dokumen belum bisa dimuat. Coba lagi.");
    }
  }

  async function remove(id: string) {
    try {
      const response = await fetch(`/api/vera/studio/${encodeURIComponent(id)}`, { method: "DELETE", cache: "no-store" });
      if (!response.ok) throw new Error(`Studio delete failed with ${response.status}`);
      setDocuments((list) => list.filter((document) => document.id !== id));
      setError(null);
      return true;
    } catch {
      setError("Dokumen belum bisa dihapus. Coba lagi.");
      return false;
    }
  }

  return { documents, error, refresh, remove };
}

export type VeraStudioDocsState = ReturnType<typeof useVeraStudioDocs>;

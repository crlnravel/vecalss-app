"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { Sources } from "@/components/ai-elements/sources";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VERA_TIME_ZONE } from "@/lib/vera/config";
import { formatCredits } from "@/lib/vera/credits-shared";
import { STUDIO_TOOLS } from "@/lib/vera/studio";
import type { StudioDocument, StudioDocumentSummary } from "@/lib/vera/studio-documents";

const DATE_TIME = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: VERA_TIME_ZONE });

function summaryLine(doc: StudioDocumentSummary) {
  return `${STUDIO_TOOLS[doc.tool].label} · ${DATE_TIME.format(new Date(doc.createdAt))} · ${formatCredits(doc.credits)} kredit`;
}

/** Saved documents, newest first. Each card opens the document. */
export function VeraStudioDocCards({
  documents,
  onOpen,
}: {
  documents: StudioDocumentSummary[];
  onOpen: (id: string) => void;
}) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada dokumen. Buat satu dari pilihan di atas.</p>;
  }
  return (
    <ul aria-label="Dokumen tersimpan" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => (
        <li key={doc.id}>
          <button
            className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40"
            onClick={() => onOpen(doc.id)}
            type="button"
          >
            <span className="text-xs text-muted-foreground">{STUDIO_TOOLS[doc.tool].label}</span>
            <span className="text-sm font-semibold text-secondary-950">{doc.title}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {DATE_TIME.format(new Date(doc.createdAt))} · {formatCredits(doc.credits)} kredit
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One document in a fullscreen dialog, with its sources and the two actions: ask Vera about it, or delete it after confirming. */
export function VeraStudioDocDialog({
  doc,
  onClose,
  onAsk,
  onDelete,
}: {
  doc: StudioDocument | null;
  onClose: () => void;
  onAsk: (doc: StudioDocument) => void;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Dialog
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        open={doc !== null}
      >
        <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-4 overflow-hidden rounded-none p-4 sm:p-6">
          {doc ? (
            <>
              <DialogHeader>
                <DialogTitle>{doc.title}</DialogTitle>
                <DialogDescription>{summaryLine(doc)}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-3 break-words text-sm leading-relaxed">
                  <ReactMarkdown
                    rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false }]]}
                    remarkPlugins={[remarkGfm, remarkMath]}
                  >
                    {doc.markdown}
                  </ReactMarkdown>
                  <Sources sources={doc.sources} />
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => setConfirming(true)} type="button" variant="outline">
                  Hapus
                </Button>
                <Button onClick={() => onAsk(doc)} type="button">
                  Tanya Vera soal ini
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus dokumen ini?</AlertDialogTitle>
            <AlertDialogDescription>Dokumen ini akan dihapus permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (doc) onDelete(doc.id);
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

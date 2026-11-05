"use client";

import { useState } from "react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VERA_TIME_ZONE } from "@/lib/vera/config";
import { formatCredits } from "@/lib/vera/credits-shared";
import { STUDIO_TOOLS } from "@/lib/vera/studio";
import type { StudioDocument, StudioDocumentSummary } from "@/lib/vera/studio-documents";
import { VeraMarkdown } from "@/modules/vera/VeraMarkdown";

const DATE_TIME = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: VERA_TIME_ZONE });

/** The date and the credit charge, as the cards and the dialog both show them. */
function metaLine(doc: StudioDocumentSummary) {
  return `${DATE_TIME.format(new Date(doc.createdAt))} · ${formatCredits(doc.credits)} kredit`;
}

/** Saved documents, newest first. Each card names the tool, then shows its date and charge. */
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
    <ul aria-label="Dokumen tersimpan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {documents.map((doc) => {
        const label = STUDIO_TOOLS[doc.tool].label;
        const date = DATE_TIME.format(new Date(doc.createdAt));
        return (
          <li key={doc.id}>
            <button
              aria-label={`${label}, ${date}${doc.complete ? "" : ", belum selesai"}`}
              className="flex h-full w-full min-w-0 flex-col gap-3 rounded-card border border-primary-100 bg-white p-5 text-left shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] transition-[border-color] hover:border-primary-200 focus-visible:border-voyage-leaf focus-visible:ring-3 focus-visible:ring-voyage-leaf/35 focus-visible:outline-none motion-reduce:transition-none"
              onClick={() => onOpen(doc.id)}
              type="button"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-base font-extrabold tracking-[-0.02em] text-voyage-ink">{label}</span>
                {doc.complete ? null : (
                  <Badge size="xs" tone="attention">
                    Belum selesai
                  </Badge>
                )}
              </span>
              <span className="mt-auto text-xs text-muted-foreground tabular-nums">{metaLine(doc)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One document in a centred panel. Its header names the tool, with the Belum selesai badge when the run stopped early. Two actions:
 * ask Vera about it, or delete it after confirming in a second dialog.
 */
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
        <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[52rem] flex-col gap-4 overflow-hidden rounded-panel p-5 sm:max-w-[52rem] sm:p-6">
          {doc ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <DialogTitle>{STUDIO_TOOLS[doc.tool].label}</DialogTitle>
                  {doc.complete ? null : (
                    <Badge size="xs" tone="attention">
                      Belum selesai
                    </Badge>
                  )}
                </div>
                <DialogDescription>{metaLine(doc)}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {doc.complete ? null : (
                  <p className="mb-3 text-sm text-muted-foreground">Dokumen ini terhenti sebelum selesai.</p>
                )}
                <div className="max-w-[68ch] text-base leading-[1.7]">
                  <VeraMarkdown>{doc.markdown}</VeraMarkdown>
                </div>
                {doc.sources.length > 0 ? (
                  <div className="mt-4 max-w-[68ch]">
                    <Sources sources={doc.sources} />
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => setConfirming(true)} type="button" variant="destructive">
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
              variant="destructive"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

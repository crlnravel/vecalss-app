"use client";

import Image from "next/image";
import { useState } from "react";

import { SunkenTabButton } from "@/components/ui/sunken-tabs";
import type { VeraEffortId } from "@/lib/vera/config";
import type { VeraPrices } from "@/lib/vera/credits-shared";
import type { StudioToolId } from "@/lib/vera/studio";
import type { StudioDocument } from "@/lib/vera/studio-documents";
import type { MentionChip } from "@/modules/vera/mention-model";
import { VeraComposer } from "@/modules/vera/VeraComposer";
import { VeraStudioDocCards, VeraStudioDocDialog } from "@/modules/vera/VeraStudioDocs";
import { VeraStudioPreview } from "@/modules/vera/VeraStudioPreview";
import { VeraStudioToolChips, VeraStudioToolDialog } from "@/modules/vera/VeraStudioTools";
import type { VeraStudioDocsState } from "@/modules/vera/use-vera-studio";
import type { VeraStudioRun } from "@/modules/vera/use-vera-studio-run";
import { VERA_STARTER_PROMPTS } from "@/modules/vera/vera-prompts";

const MASCOT_SRC = "/brand/mascot-vecalss-2.png";

type DocFilter = "semua" | "analisis" | "rute" | "bahas";

const DOC_FILTERS: ReadonlyArray<{ value: DocFilter; label: string; tool: StudioToolId | null }> = [
  { value: "semua", label: "Semua", tool: null },
  { value: "analisis", label: "Analisis", tool: "weakness_analysis" },
  { value: "rute", label: "Rute", tool: "study_route" },
  { value: "bahas", label: "Bahas", tool: "wrong_answer_review" },
];

/**
 * The home page: the mascot and the heading, the composer with the three Studio tools inside it, then the Studio preview and the saved
 * documents. The page never scrolls; the documents list scrolls inside its own area.
 */
export function VeraHome({
  blocked,
  docs,
  effort,
  firstName,
  onAsk,
  onChangeEffort,
  onCloseDocument,
  onDeleteDocument,
  onOpenDocument,
  onSend,
  openDocument,
  prices,
  studio,
}: {
  blocked: string | null;
  docs: VeraStudioDocsState;
  effort: VeraEffortId;
  firstName: string | null;
  openDocument: StudioDocument | null;
  prices: VeraPrices;
  studio: VeraStudioRun;
  onAsk: (doc: StudioDocument) => void;
  onChangeEffort: (effort: VeraEffortId) => void;
  onCloseDocument: () => void;
  onDeleteDocument: (id: string) => void;
  onOpenDocument: (id: string) => void;
  onSend: (text: string, chips: MentionChip[]) => void;
}) {
  const [filter, setFilter] = useState<DocFilter>("semua");
  const [layout, setLayout] = useState<"gallery" | "list">("gallery");
  const [pickedTool, setPickedTool] = useState<StudioToolId | null>(null);
  const activeFilter = DOC_FILTERS.find((item) => item.value === filter) ?? DOC_FILTERS[0];
  const visibleDocs = activeFilter.tool
    ? docs.documents.filter((doc) => doc.tool === activeFilter.tool)
    : docs.documents;
  const previewSaved = docs.documents.some((doc) => doc.id === studio.previewDocumentId);
  const title = firstName ? `Mau belajar apa hari ini, ${firstName}?` : "Mau belajar apa hari ini?";
  const emptyText =
    docs.documents.length === 0
      ? "Belum ada dokumen. Pilih salah satu alat di atas untuk membuatnya."
      : "Belum ada dokumen untuk pilihan ini.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="shrink-0 px-4 pt-10 md:px-8 md:pt-24">
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
            <span aria-hidden="true" className="relative size-[104px] shrink-0">
              <Image alt="" className="object-contain" fill sizes="104px" src={MASCOT_SRC} />
            </span>
            <h1 className="font-heading text-center text-[2.25rem] leading-[1.25] font-extrabold tracking-[-0.04em] text-balance text-voyage-ink md:text-[3rem] sm:text-left">
              {title}
            </h1>
          </div>
          <div className="flex w-full flex-col gap-2">
            {blocked ? (
              <p
                className="rounded-card border border-student-status-attention-border bg-student-status-attention-bg px-4 py-3 text-sm text-student-status-attention-fg"
                role="status"
              >
                {blocked}
              </p>
            ) : null}
            <VeraComposer
              blocked={blocked}
              effort={effort}
              examples={VERA_STARTER_PROMPTS}
              historyChars={0}
              leading={<VeraStudioToolChips busy={studio.busy} onPick={setPickedTool} />}
              onEffortChange={onChangeEffort}
              onSend={({ text, chips }) => onSend(text, chips)}
              onStop={() => undefined}
              prices={prices}
              status="ready"
            />
            <p className="text-center text-xs text-muted-foreground">Vera bisa salah. Cek lagi jawabannya.</p>
          </div>
        </div>
      </section>

      {studio.busy || studio.preview ? (
        <div className="mx-auto w-full max-w-[78rem] shrink-0 px-4 pt-6 md:px-8">
          <VeraStudioPreview
            busy={studio.busy}
            className="max-h-[min(36dvh,16rem)] md:max-h-[min(40dvh,22rem)]"
            onStop={() => void studio.stop()}
            preview={studio.preview}
            previewSaved={previewSaved}
          />
        </div>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[78rem] flex-1 flex-col gap-6 overflow-y-auto px-4 pt-10 pb-6 md:px-8">
        <section aria-labelledby="vera-home-docs" className="flex flex-col gap-3">
          <h2
            className="font-heading text-[1.25rem] leading-[1.2] font-extrabold tracking-[-0.035em] text-voyage-ink"
            id="vera-home-docs"
          >
            Dokumen
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div aria-label="Filter dokumen" className="flex flex-wrap gap-1.5" role="group">
              {DOC_FILTERS.map((item) => (
                <SunkenTabButton
                  aria-pressed={filter === item.value}
                  key={item.value}
                  onClick={() => setFilter(item.value)}
                  selected={filter === item.value}
                  type="button"
                >
                  {item.label}
                </SunkenTabButton>
              ))}
            </div>
            <div aria-label="Tampilan dokumen" className="flex gap-1.5" role="group">
              <SunkenTabButton
                aria-pressed={layout === "gallery"}
                onClick={() => setLayout("gallery")}
                selected={layout === "gallery"}
                type="button"
              >
                Galeri
              </SunkenTabButton>
              <SunkenTabButton
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
                selected={layout === "list"}
                type="button"
              >
                Daftar
              </SunkenTabButton>
            </div>
          </div>
          {docs.error ? (
            <p className="text-sm text-muted-foreground" role="alert">
              {docs.error}
            </p>
          ) : null}
          <VeraStudioDocCards
            documents={visibleDocs}
            emptyText={emptyText}
            layout={layout}
            onOpen={onOpenDocument}
          />
        </section>
      </div>

      <VeraStudioToolDialog
        busy={studio.busy}
        onClose={() => setPickedTool(null)}
        onRun={(request) => {
          setPickedTool(null);
          studio.run(request);
        }}
        prices={prices}
        tool={pickedTool}
      />
      <VeraStudioDocDialog
        doc={openDocument}
        onAsk={onAsk}
        onClose={onCloseDocument}
        onDelete={onDeleteDocument}
      />
    </div>
  );
}

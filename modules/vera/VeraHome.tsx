"use client";

import Image from "next/image";
import { useState } from "react";

import type { VeraEffortId } from "@/lib/vera/config";
import type { VeraPrices } from "@/lib/vera/credits-shared";
import type { StudioToolId } from "@/lib/vera/studio";
import type { StudioDocument } from "@/lib/vera/studio-documents";
import type { MentionChip } from "@/modules/vera/mention-model";
import { VeraComposer } from "@/modules/vera/VeraComposer";
import { VeraStudioDocDialog } from "@/modules/vera/VeraStudioDocs";
import { VeraStudioPreview } from "@/modules/vera/VeraStudioPreview";
import { VeraStudioToolChips, VeraStudioToolDialog } from "@/modules/vera/VeraStudioTools";
import type { VeraStudioRun } from "@/modules/vera/use-vera-studio-run";
import { VERA_STARTER_PROMPTS } from "@/modules/vera/vera-prompts";

const MASCOT_SRC = "/brand/mascot-vecalss-2.png";

/**
 * The home page: the mascot and the heading, the composer with the three Studio tools inside it, then the Studio preview. A saved
 * document opens from that preview or from its dialog. Older documents are found through the `@` menu.
 */
export function VeraHome({
  blocked,
  effort,
  firstName,
  onAsk,
  onAskDocumentById,
  onChangeEffort,
  onCloseDocument,
  onDeleteDocument,
  onOpenDocument,
  onSend,
  openDocument,
  prices,
  savedDocumentId,
  studio,
}: {
  blocked: string | null;
  effort: VeraEffortId;
  firstName: string | null;
  openDocument: StudioDocument | null;
  prices: VeraPrices;
  savedDocumentId: string | null;
  studio: VeraStudioRun;
  onAsk: (doc: StudioDocument) => void;
  onAskDocumentById: (id: string) => void;
  onChangeEffort: (effort: VeraEffortId) => void;
  onCloseDocument: () => void;
  onDeleteDocument: (id: string) => void;
  onOpenDocument: (id: string) => void;
  onSend: (text: string, chips: MentionChip[]) => void;
}) {
  const [pickedTool, setPickedTool] = useState<StudioToolId | null>(null);
  const title = firstName ? `Mau belajar apa hari ini, ${firstName}?` : "Mau belajar apa hari ini?";

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
            onAsk={onAskDocumentById}
            onOpen={onOpenDocument}
            onStop={() => void studio.stop()}
            preview={studio.preview}
            savedDocumentId={savedDocumentId}
          />
        </div>
      ) : null}

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

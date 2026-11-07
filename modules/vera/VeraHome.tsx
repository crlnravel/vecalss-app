"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { CircleHelp } from "@/lib/icons";
import type { VeraEffortId } from "@/lib/vera/config";
import type { VeraPrices } from "@/lib/vera/credits-shared";
import type { StudioToolId } from "@/lib/vera/studio";
import type { StudioDocument } from "@/lib/vera/studio-documents";
import type { MentionChip } from "@/modules/vera/mention-model";
import { VeraComposer } from "@/modules/vera/VeraComposer";
import { VeraStudioDocDialog } from "@/modules/vera/VeraStudioDocs";
import { VeraStudioPreview } from "@/modules/vera/VeraStudioPreview";
import { VeraStudioMenu } from "@/modules/vera/VeraStudioTools";
import type { VeraStudioRun } from "@/modules/vera/use-vera-studio-run";
import { VERA_STARTER_PROMPTS } from "@/modules/vera/vera-prompts";

const MASCOT_SRC = "/brand/mascot-vecalss-2.png";

/**
 * The start screen, in Aily's layout: the mascot above the heading, the composer card with its toolbar, the disclaimer, and the starter
 * questions in a 2×2 grid. A Studio run's preview card sits under the composer. A saved document opens from that card or from its dialog.
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
  onPickTool,
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
  onPickTool: (tool: StudioToolId) => void;
  onSend: (text: string, chips: MentionChip[]) => void;
}) {
  const title = firstName ? `Mau belajar apa hari ini, ${firstName}?` : "Mau belajar apa hari ini?";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <section className="mx-auto flex w-full max-w-181 flex-1 flex-col items-center justify-center gap-6 px-4 py-6 md:px-0">
        <span aria-hidden="true" className="relative size-20 shrink-0">
          <Image alt="" className="object-contain" fill sizes="80px" src={MASCOT_SRC} />
        </span>
        <h2 className="font-heading text-center text-[clamp(1.5rem,2.4vw,1.875rem)] leading-[1.25] font-extrabold tracking-[-0.04em] text-balance text-voyage-ink">
          {title}
        </h2>
        <div className="flex w-full flex-col gap-3">
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
            leading={<VeraStudioMenu busy={studio.busy} onPick={onPickTool} />}
            onEffortChange={onChangeEffort}
            onSend={({ text, chips }) => onSend(text, chips)}
            onStop={() => undefined}
            prices={prices}
            status="ready"
          />
          <p className="text-center text-xs text-muted-foreground">Vera bisa salah. Cek lagi jawabannya.</p>
          {studio.busy || studio.preview ? (
            <VeraStudioPreview
              busy={studio.busy}
              className="max-h-[min(36dvh,16rem)] md:max-h-[min(40dvh,22rem)]"
              onAsk={onAskDocumentById}
              onOpen={onOpenDocument}
              onStop={() => void studio.stop()}
              preview={studio.preview}
              savedDocumentId={savedDocumentId}
            />
          ) : null}
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-2">
          {VERA_STARTER_PROMPTS.map((prompt) => (
            <Button
              className="h-11 justify-start rounded-pill text-left"
              disabled={blocked !== null}
              key={prompt}
              onClick={() => onSend(prompt, [])}
              type="button"
              variant="outline"
            >
              <CircleHelp />
              {prompt}
            </Button>
          ))}
        </div>
      </section>

      <VeraStudioDocDialog doc={openDocument} onAsk={onAsk} onClose={onCloseDocument} onDelete={onDeleteDocument} />
    </div>
  );
}

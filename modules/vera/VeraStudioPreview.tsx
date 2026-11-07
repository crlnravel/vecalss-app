"use client";

import { isToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef } from "react";

import { ToolStep } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VeraMarkdown } from "@/modules/vera/VeraMarkdown";

/**
 * The document being written: the tool rows and the streamed text, with Stop while the run is busy. When the run saves its document,
 * the card says so and offers to open it or to ask Vera about it. The card follows the newest text, so a long document stays readable.
 */
export function VeraStudioPreview({
  busy,
  className,
  onAsk,
  onOpen,
  onStop,
  preview,
  savedDocumentId,
}: {
  busy: boolean;
  className?: string;
  onAsk: (id: string) => void;
  onOpen: (id: string) => void;
  onStop: () => void;
  preview: UIMessage | null;
  savedDocumentId: string | null;
}) {
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const card = cardRef.current;
    if (card) card.scrollTop = card.scrollHeight;
  }, [preview, busy, savedDocumentId]);

  return (
    <section
      aria-label="Pratinjau dokumen"
      className={cn(
        "overflow-y-auto rounded-card border border-primary-100 bg-white p-5 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)]",
        className,
      )}
      ref={cardRef}
    >
      <p className="mb-3 text-xs text-muted-foreground" role="status">
        {busy ? "Vera sedang menyusun dokumen…" : savedDocumentId ? "Dokumen tersimpan." : null}
      </p>
      <div className="max-w-[68ch] space-y-3 text-base leading-[1.7]">
        {(preview?.parts ?? []).map((part, index) => {
          if (isToolUIPart(part)) {
            return (
              <ToolStep key={index} output={part.output} state={part.state} toolName={part.type.slice("tool-".length)} />
            );
          }
          if (part.type === "text") {
            return <VeraMarkdown key={index}>{part.text}</VeraMarkdown>;
          }
          return null;
        })}
      </div>
      {busy ? (
        <Button className="mt-4" onClick={onStop} size="sm" type="button" variant="outline">
          Hentikan
        </Button>
      ) : null}
      {!busy && savedDocumentId ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => onOpen(savedDocumentId)} size="sm" type="button" variant="outline">
            Buka dokumen
          </Button>
          <Button onClick={() => onAsk(savedDocumentId)} size="sm" type="button">
            Tanya Vera soal ini
          </Button>
        </div>
      ) : null}
    </section>
  );
}

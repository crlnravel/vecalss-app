"use client";

import { isToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef } from "react";

import { ToolStep } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VeraMarkdown } from "@/modules/vera/VeraMarkdown";

/**
 * The document being written: the tool rows and the streamed text, with Stop while the run is busy. The card follows the newest text,
 * so a long document stays readable while it streams.
 */
export function VeraStudioPreview({
  busy,
  className,
  onStop,
  preview,
  previewSaved,
}: {
  busy: boolean;
  className?: string;
  onStop: () => void;
  preview: UIMessage | null;
  previewSaved: boolean;
}) {
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const card = cardRef.current;
    if (card) card.scrollTop = card.scrollHeight;
  }, [preview]);

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
        {busy ? "Vera sedang menyusun dokumen…" : previewSaved ? "Dokumen tersimpan. Lihat di daftar di bawah." : null}
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
    </section>
  );
}

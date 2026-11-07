"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { CircleHelp } from "@/lib/icons";
import type { VeraEffortId } from "@/lib/vera/config";
import type { StudioToolId } from "@/lib/vera/studio";
import type { MentionChip } from "@/modules/vera/mention-model";
import { VeraComposer } from "@/modules/vera/VeraComposer";
import { VeraStudioCards } from "@/modules/vera/VeraStudioTools";
import { VERA_STARTER_PROMPTS } from "@/modules/vera/vera-prompts";

const MASCOT_SRC = "/brand/mascot-vecalss-2.png";

/**
 * The start screen, in Aily's layout: the mascot above the heading, the composer card with its toolbar, the disclaimer, the three Studio
 * cards, and the starter questions in a 2×2 grid. A Studio card opens its options, and the request then goes to the chat.
 */
export function VeraHome({
  blocked,
  effort,
  firstName,
  onChangeEffort,
  onPickTool,
  onSend,
}: {
  blocked: string | null;
  effort: VeraEffortId;
  firstName: string | null;
  onChangeEffort: (effort: VeraEffortId) => void;
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
            onEffortChange={onChangeEffort}
            onSend={({ text, chips }) => onSend(text, chips)}
            onStop={() => undefined}
            status="ready"
          />
          <p className="text-center text-xs text-muted-foreground">Vera bisa salah. Cek lagi jawabannya.</p>
          <VeraStudioCards busy={blocked !== null} onPick={onPickTool} />
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
    </div>
  );
}

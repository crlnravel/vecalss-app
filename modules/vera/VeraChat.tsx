"use client";

import { isToolUIPart, type UIMessage } from "ai";
import Image from "next/image";
import Link from "next/link";

import { ChatThread, ChatTurn } from "@/components/ai-elements/chat";
import type { PromptInputStatus } from "@/components/ai-elements/prompt-input";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Sources } from "@/components/ai-elements/sources";
import { ToolStep } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import type { VeraEffortId } from "@/lib/vera/config";
import { formatCredits, type VeraPrices } from "@/lib/vera/credits-shared";
import { cn } from "@/lib/utils";
import { collectSources, uniqueSources, type ResolvedMention, type VeraSource } from "@/lib/vera/sources/types";
import { type MentionChip } from "@/modules/vera/mention-model";
import { VeraComposer } from "@/modules/vera/VeraComposer";
import { VeraMarkdown } from "@/modules/vera/VeraMarkdown";
import { VERA_STARTER_PROMPTS } from "@/modules/vera/vera-prompts";

const MASCOT_SRC = "/brand/mascot-vecalss-2.png";

/**
 * The chat view: the thread, the suggested questions on an empty thread, and the composer pinned under the thread. The page owns the
 * messages and the requests; this view only shows them and hands the student's actions back.
 */
export function VeraChat({
  blocked,
  busy,
  composerKey,
  effort,
  historyChars,
  initialChips,
  messages,
  onBack,
  onChangeEffort,
  onSend,
  onStop,
  prices,
  restoredIds,
  status,
  stoppedMessageId,
}: {
  blocked: string | null;
  busy: boolean;
  composerKey: number;
  effort: VeraEffortId;
  historyChars: number;
  initialChips: MentionChip[];
  messages: UIMessage[];
  prices: VeraPrices;
  restoredIds: Set<string>;
  status: PromptInputStatus;
  stoppedMessageId: string | null;
  onBack: () => void;
  onChangeEffort: (effort: VeraEffortId) => void;
  onSend: (text: string, chips: MentionChip[]) => void;
  onStop: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[78rem] flex-1 flex-col px-4 md:px-8">
      <div className="shrink-0 pt-14">
        <Button aria-label="Kembali ke Vera AI" onClick={onBack} type="button" variant="outline">
          Kembali
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col pt-4">
        {messages.length > 0 ? (
          <ChatThread className="w-full" contentClassName="flex flex-col gap-4 px-0 py-6">
            {messages.map((message) => (
              <ChatTurn fromUser={message.role === "user"} key={message.id} messageId={message.id}>
                <ThreadMessage
                  fresh={!restoredIds.has(message.id)}
                  message={message}
                  stopping={message.id === stoppedMessageId}
                />
              </ChatTurn>
            ))}
          </ChatThread>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-[760px] shrink-0 flex-col gap-3 pt-3 pb-4">
        {messages.length === 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {VERA_STARTER_PROMPTS.map((prompt) => (
              <Button
                disabled={blocked !== null || busy}
                key={prompt}
                onClick={() => onSend(prompt, [])}
                type="button"
                variant="outline"
              >
                {prompt}
              </Button>
            ))}
          </div>
        ) : null}
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
          historyChars={historyChars}
          initialChips={initialChips}
          key={composerKey}
          onEffortChange={onChangeEffort}
          onSend={({ text, chips }) => onSend(text, chips)}
          onStop={onStop}
          prices={prices}
          status={status}
        />
        <p className="text-center text-xs text-muted-foreground">Vera bisa salah. Cek lagi jawabannya.</p>
      </div>
    </div>
  );
}

/**
 * The `@` sources a student pinned. The chips wrap inside the message and a long label ends in an ellipsis. A source the server could
 * not open says so instead of linking.
 */
function MentionLinks({ mentions }: { mentions: ResolvedMention[] }) {
  return (
    <div className="flex max-w-full min-w-0 flex-wrap justify-end gap-2">
      {mentions.map((mention) =>
        mention.status === "accepted" && mention.source ? (
          <Link className="min-w-0 max-w-full" href={mention.source.href} key={`${mention.type}:${mention.id}`}>
            <Badge className="max-w-full min-w-0 shrink" size="sm" tone="info">
              <span className="min-w-0 truncate">{mention.label}</span>
            </Badge>
          </Link>
        ) : (
          <Badge className="max-w-full min-w-0 shrink" key={`${mention.type}:${mention.id}`} size="sm" tone="attention">
            <span className="min-w-0 truncate">{`${mention.label}: tidak bisa dibuka`}</span>
          </Badge>
        ),
      )}
    </div>
  );
}

function ThreadMessage({
  message,
  stopping = false,
  fresh = false,
}: {
  message: UIMessage;
  stopping?: boolean;
  fresh?: boolean;
}) {
  // A turn that arrives during the session eases in. Under reduced motion it appears at once.
  const enter = fresh
    ? "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none"
    : undefined;

  if (message.role === "user") {
    const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
    const mentions = (message.metadata as { mentions?: ResolvedMention[] } | undefined)?.mentions ?? [];
    return (
      <Message align="end" className={enter}>
        <MessageContent className="flex flex-col items-end gap-2">
          <div className="max-w-[70%] rounded-card bg-accent px-4 py-2.5 text-base leading-[1.6] whitespace-pre-wrap text-voyage-deep">
            {text}
          </div>
          {mentions.length > 0 ? <MentionLinks mentions={mentions} /> : null}
        </MessageContent>
      </Message>
    );
  }

  const stopped =
    stopping ||
    message.parts.some(
      (part) => part.type === "data-vera-status" && (part.data as { stopped?: boolean } | undefined)?.stopped === true,
    );
  const credits = (message.metadata as { credits?: number } | undefined)?.credits;
  // Links come from the pinned sources the server accepted and from the tool results the answer used. Both only point at pages
  // the student could open.
  const pinnedSources = (message.metadata as { sources?: VeraSource[] } | undefined)?.sources ?? [];
  const toolOutputs = message.parts.flatMap((part) => (isToolUIPart(part) ? [part.output] : []));
  const sources = uniqueSources([...pinnedSources, ...collectSources(toolOutputs)]);
  return (
    <Message align="start" className={cn("gap-3", enter)}>
      <span aria-hidden="true" className="relative mt-0.5 size-10 shrink-0 overflow-hidden">
        <Image alt="" className="object-contain" fill sizes="40px" src={MASCOT_SRC} />
      </span>
      <MessageContent className="min-w-0 gap-3 text-base leading-[1.7] text-foreground">
        {message.parts.map((part, index) => {
          if (part.type === "reasoning") {
            return <Reasoning key={index} streaming={part.state === "streaming"} text={part.text} />;
          }
          if (isToolUIPart(part)) {
            return (
              <ToolStep
                key={index}
                output={part.output}
                state={part.state}
                toolName={part.type.slice("tool-".length)}
              />
            );
          }
          if (part.type === "text") {
            return (
              <VeraMarkdown className="max-w-[70ch]" key={index}>
                {part.text}
              </VeraMarkdown>
            );
          }
          return null;
        })}
        {sources.length > 0 ? <Sources sources={sources} /> : null}
        {stopped ? <p className="text-xs text-muted-foreground">Jawaban dihentikan.</p> : null}
        {typeof credits === "number" ? (
          <p className="text-xs text-muted-foreground tabular-nums">{formatCredits(credits)} kredit</p>
        ) : null}
      </MessageContent>
    </Message>
  );
}

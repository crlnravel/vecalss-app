"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { type ReactNode, useMemo, useState, useSyncExternalStore } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { ChatThread, ChatTurn } from "@/components/ai-elements/chat";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Sources } from "@/components/ai-elements/sources";
import { ToolStep } from "@/components/ai-elements/tool";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import { Sparkles } from "@/lib/icons";
import { VERA_EFFORT_IDS, type VeraEffortId } from "@/lib/vera/config";
import { estimateCreditRange, formatCredits, formatCreditRange } from "@/lib/vera/credits-shared";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import { collectSources, uniqueSources } from "@/lib/vera/sources/types";
import { cn } from "@/lib/utils";
import { VeraEffortMenu } from "@/modules/vera/VeraEffortMenu";
import { VeraUsagePopover } from "@/modules/vera/VeraUsagePopover";

const STARTER_PROMPTS = [
  "Kenapa skor PK-ku turun?",
  "Bahas soal salah Tryout terakhir",
  "Apa yang perlu aku latih minggu ini?",
  "Jelaskan konsep persentase bertingkat",
];

const DEFAULT_EFFORT: VeraEffortId = "seimbang";
const UNAVAILABLE_ANSWER = "Vera belum bisa menjawab sekarang. Coba kirim lagi.";

type VeraTab = "chat" | "studio";

function effortStorageKey(studentId: string) {
  return `vera:effort:${studentId}`;
}

/** Storage can be blocked or unavailable, so the choice falls back to the default. */
function readStoredEffort(studentId: string): VeraEffortId {
  try {
    const stored = window.localStorage.getItem(effortStorageKey(studentId));
    return VERA_EFFORT_IDS.find((id) => id === stored) ?? DEFAULT_EFFORT;
  } catch {
    return DEFAULT_EFFORT;
  }
}

function persistEffort(studentId: string, effort: VeraEffortId) {
  try {
    window.localStorage.setItem(effortStorageKey(studentId), effort);
  } catch {
    // The choice still applies to this visit.
  }
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** The first window at its hard limit explains why sending is blocked. */
function blockedMessage(usage: VeraUsageSnapshot): string | null {
  if (usage.day.used >= usage.day.hardLimit) {
    return "Kredit hari ini sudah habis. Coba lagi besok, mulai pukul 00.00 WIB.";
  }
  if (usage.week.used >= usage.week.hardLimit) {
    return "Kredit minggu ini sudah habis. Coba lagi minggu depan.";
  }
  if (usage.month.used >= usage.month.hardLimit) {
    return "Kredit bulan ini sudah habis. Coba lagi bulan depan.";
  }
  return null;
}

/** The server sends a JSON body with a friendly message for refusals. Anything else gets the generic line. */
function answerErrorMessage(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // Not a JSON body, so use the generic line.
  }
  return UNAVAILABLE_ANSWER;
}

export function VeraPageModule({
  studentId,
  conversationId: initialConversationId,
  initialMessages,
  initialUsage,
}: {
  studentId: string;
  conversationId: string | null;
  initialMessages: UIMessage[];
  initialUsage: VeraUsageSnapshot;
}) {
  const [tab, setTab] = useState<VeraTab>("chat");
  const [input, setInput] = useState("");
  // The server creates the conversation on the first send and returns its id in the answer metadata.
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [chatId] = useState(() => initialConversationId ?? crypto.randomUUID());
  const [usage, setUsage] = useState(initialUsage);

  const storedEffort = useSyncExternalStore(
    subscribeToStorage,
    () => readStoredEffort(studentId),
    () => DEFAULT_EFFORT,
  );
  const [effortOverride, setEffortOverride] = useState<VeraEffortId | null>(null);
  const effort = effortOverride ?? storedEffort;

  // Only the newest message travels in the request. The server loads the rest of the thread.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/vera/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...body, message: messages.at(-1) },
        }),
      }),
    [],
  );

  async function refreshUsage() {
    try {
      const response = await fetch("/api/vera/usage", { cache: "no-store" });
      if (response.ok) setUsage((await response.json()) as VeraUsageSnapshot);
    } catch {
      // Keep the numbers already on screen.
    }
  }

  const { messages, sendMessage, status, stop, error, regenerate } = useChat<UIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: ({ message }) => {
      const id = (message.metadata as { conversationId?: string } | undefined)?.conversationId;
      if (id) setConversationId(id);
      void refreshUsage();
    },
    onError: () => {
      void refreshUsage();
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const blocked = blockedMessage(usage);
  const canSend = input.trim().length > 0 && !busy && blocked === null;
  const historyChars = messages.reduce(
    (total, message) =>
      total + message.parts.reduce((sum, part) => sum + (part.type === "text" ? part.text.length : 0), 0),
    0,
  );
  // The prices come from the server with the usage snapshot, so the estimate and the charge use the same numbers.
  const estimate = formatCreditRange(estimateCreditRange({ effort, historyChars, mentionCount: 0 }, usage.prices));

  function send(text: string) {
    void sendMessage(
      { text: text.trim() },
      { body: { conversationId: conversationId ?? undefined, effort } },
    );
  }

  function changeEffort(next: VeraEffortId) {
    setEffortOverride(next);
    persistEffort(studentId, next);
  }

  return (
    <div className="flex min-h-[calc(100svh-8rem)] min-w-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h1 className="text-lg font-semibold text-secondary-950">Vera AI</h1>
        <div className="flex flex-wrap items-center gap-2">
          <VeraUsagePopover onOpen={() => void refreshUsage()} usage={usage} />
          <div role="tablist" aria-label="Bagian Vera" className="flex rounded-full bg-muted p-1">
            <TabButton selected={tab === "chat"} onClick={() => setTab("chat")}>
              Chat
            </TabButton>
            <TabButton selected={tab === "studio"} onClick={() => setTab("studio")}>
              Studio
            </TabButton>
          </div>
        </div>
      </header>

      {tab === "studio" ? (
        <section aria-labelledby="vera-studio-soon" className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
          <h2 id="vera-studio-soon" className="text-base font-semibold text-secondary-950">
            Segera hadir
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Analisis kelemahan, rute belajar, dan pembahasan soal salah akan tersedia di sini.
          </p>
        </section>
      ) : (
        <>
          {messages.length === 0 ? (
            <EmptyState onPick={(text) => blocked === null && !busy && send(text)} />
          ) : (
            <ChatThread className="mx-auto w-full max-w-3xl">
              {messages.map((message) => (
                <ChatTurn key={message.id} messageId={message.id} fromUser={message.role === "user"}>
                  <ThreadMessage message={message} />
                </ChatTurn>
              ))}
            </ChatThread>
          )}

          {error ? (
            <div
              role="alert"
              className="mx-auto mb-3 flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm"
            >
              <span>{answerErrorMessage(error)}</span>
              <Button onClick={() => regenerate()} size="sm" type="button" variant="outline">
                Coba lagi
              </Button>
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2">
            {blocked ? (
              <p role="status" className="mb-2 text-sm text-muted-foreground">
                {blocked}
              </p>
            ) : null}
            <PromptInput
              onSubmit={(event) => {
                event.preventDefault();
                if (!canSend) return;
                send(input);
                setInput("");
              }}
            >
              <PromptInputBody>
                <PromptInputTextarea
                  aria-label="Tulis pertanyaan untuk Vera"
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Tanya Vera…"
                  rows={1}
                  value={input}
                />
                <PromptInputFooter>
                  <VeraEffortMenu onChange={changeEffort} value={effort} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">{estimate}</span>
                    <PromptInputSubmit disabled={!canSend} onStop={() => void stop()} status={status} />
                  </div>
                </PromptInputFooter>
              </PromptInputBody>
            </PromptInput>
            <p className="mt-2 text-center text-xs text-muted-foreground">Vera bisa salah. Cek lagi jawabannya.</p>
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-selected={selected}
      className={cn(
        "min-h-11 rounded-full px-4 text-sm font-medium transition-colors motion-reduce:transition-none",
        selected ? "bg-card text-secondary-950 shadow-sm" : "text-muted-foreground hover:text-secondary-950",
      )}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full border border-border bg-card text-secondary-950">
        <Sparkles />
      </span>
      <div>
        <p className="text-lg font-semibold text-secondary-950">Halo, aku Vera.</p>
        <p className="mt-1 text-sm text-muted-foreground">Tanya apa saja soal belajarmu, aku bantu jelaskan pelan-pelan.</p>
      </div>
      <Suggestions className="w-full justify-center">
        {STARTER_PROMPTS.map((prompt) => (
          <Suggestion key={prompt} onClick={onPick} suggestion={prompt} />
        ))}
      </Suggestions>
    </div>
  );
}

function ThreadMessage({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted">
            <BubbleContent>{text}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }

  const stopped = message.parts.some(
    (part) => part.type === "data-vera-status" && (part.data as { stopped?: boolean } | undefined)?.stopped === true,
  );
  const credits = (message.metadata as { credits?: number } | undefined)?.credits;
  // The links come from the tool results the answer used, so they only ever point at pages the student could open.
  const sources = uniqueSources(collectSources(message.parts.flatMap((part) => (isToolUIPart(part) ? [part.output] : []))));
  return (
    <Message align="start">
      <MessageContent className="w-full min-w-0 space-y-3 text-sm leading-relaxed">
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
              <div className="min-w-0 space-y-2 break-words" key={index}>
                <ReactMarkdown
                  rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false }]]}
                  remarkPlugins={[remarkGfm, remarkMath]}
                >
                  {part.text}
                </ReactMarkdown>
              </div>
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

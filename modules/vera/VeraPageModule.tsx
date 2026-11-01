"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { type ReactNode, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ChatThread, ChatTurn } from "@/components/ai-elements/chat";
import { Reasoning } from "@/components/ai-elements/reasoning";
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
import { cn } from "@/lib/utils";

const STARTER_PROMPTS = [
  "Kenapa skor PK-ku turun?",
  "Bahas soal salah Tryout terakhir",
  "Apa yang perlu aku latih minggu ini?",
  "Jelaskan konsep persentase bertingkat",
];

type VeraTab = "chat" | "studio";

export function VeraPageModule({
  conversationId: initialConversationId,
  initialMessages,
}: {
  conversationId: string | null;
  initialMessages: UIMessage[];
}) {
  const [tab, setTab] = useState<VeraTab>("chat");
  const [input, setInput] = useState("");
  // The server creates the conversation on the first send and returns its id in the answer metadata.
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [chatId] = useState(() => initialConversationId ?? crypto.randomUUID());

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

  const { messages, sendMessage, status, stop, error, regenerate } = useChat<UIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: ({ message }) => {
      const id = (message.metadata as { conversationId?: string } | undefined)?.conversationId;
      if (id) setConversationId(id);
    },
  });

  const busy = status === "submitted" || status === "streaming";

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed }, { body: { conversationId: conversationId ?? undefined, effort: "seimbang" } });
  }

  return (
    <div className="flex min-h-[calc(100svh-8rem)] min-w-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h1 className="text-lg font-semibold text-secondary-950">Vera AI</h1>
        <div role="tablist" aria-label="Bagian Vera" className="flex rounded-full bg-muted p-1">
          <TabButton selected={tab === "chat"} onClick={() => setTab("chat")}>
            Chat
          </TabButton>
          <TabButton selected={tab === "studio"} onClick={() => setTab("studio")}>
            Studio
          </TabButton>
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
            <EmptyState onPick={send} />
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
              <span>Vera belum bisa menjawab sekarang. Coba kirim lagi.</span>
              <Button onClick={() => regenerate()} size="sm" type="button" variant="outline">
                Coba lagi
              </Button>
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2">
            <PromptInput
              onSubmit={(event) => {
                event.preventDefault();
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
                  <span className="text-xs text-muted-foreground">Vera bisa salah. Cek lagi jawabannya.</span>
                  <PromptInputSubmit disabled={!input.trim()} onStop={() => void stop()} status={status} />
                </PromptInputFooter>
              </PromptInputBody>
            </PromptInput>
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
  return (
    <Message align="start">
      <MessageContent className="w-full min-w-0 space-y-3 text-sm leading-relaxed">
        {message.parts.map((part, index) => {
          if (part.type === "reasoning") {
            return <Reasoning key={index} streaming={part.state === "streaming"} text={part.text} />;
          }
          if (part.type === "text") {
            return (
              <div className="min-w-0 space-y-2 break-words" key={index}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
              </div>
            );
          }
          return null;
        })}
        {stopped ? <p className="text-xs text-muted-foreground">Jawaban dihentikan.</p> : null}
      </MessageContent>
    </Message>
  );
}

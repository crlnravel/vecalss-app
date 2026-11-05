"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState, useSyncExternalStore } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { ChatThread, ChatTurn } from "@/components/ai-elements/chat";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Sources } from "@/components/ai-elements/sources";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { ToolStep } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Message, MessageContent } from "@/components/ui/message";
import { Menu, Sparkles } from "@/lib/icons";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import type { StudioDocument, StudioDocumentSummary } from "@/lib/vera/studio-documents";
import { VERA_EFFORT_IDS, type VeraEffortId } from "@/lib/vera/config";
import { formatCredits } from "@/lib/vera/credits-shared";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import { collectSources, studioDocumentHref, uniqueSources, type ResolvedMention, type VeraSource } from "@/lib/vera/sources/types";
import { cn } from "@/lib/utils";
import { type MentionChip } from "@/modules/vera/mention-model";
import { VeraComposer, type ComposerSubmit } from "@/modules/vera/VeraComposer";
import { VeraSessionsPanel } from "@/modules/vera/VeraSessionsPanel";
import { VeraStudioPanel } from "@/modules/vera/VeraStudioPanel";
import { VeraUsagePopover } from "@/modules/vera/VeraUsagePopover";
import { useVeraSessions } from "@/modules/vera/use-vera-sessions";

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
  initialSessions,
  initialTab,
  initialStudioDocs,
  initialStudioDocument,
  initialUsage,
}: {
  studentId: string;
  conversationId: string | null;
  initialMessages: UIMessage[];
  initialSessions: VeraSessionSummary[];
  initialTab: VeraTab;
  initialStudioDocs: StudioDocumentSummary[];
  initialStudioDocument: StudioDocument | null;
  initialUsage: VeraUsageSnapshot;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<VeraTab>(initialTab);
  // A Studio document the student asks Vera about is pinned when the composer mounts.
  const [composerSeed, setComposerSeed] = useState<{ key: number; chips: MentionChip[] } | null>(null);
  // The server creates the conversation on the first send and returns its id in the answer metadata.
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [chatId] = useState(() => initialConversationId ?? crypto.randomUUID());
  const [usage, setUsage] = useState(initialUsage);
  const sessions = useVeraSessions(initialSessions);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionsOpen, setSessionsOpen] = useState(false);

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

  const [stoppedMessageId, setStoppedMessageId] = useState<string | null>(null);
  const { messages, sendMessage, status, stop, error, regenerate } = useChat<UIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: ({ message }) => {
      const id = (message.metadata as { conversationId?: string } | undefined)?.conversationId;
      if (id) {
        setConversationId(id);
        // The URL follows the session without a navigation, so a reload restores it.
        window.history.replaceState(null, "", `/vera-ai?c=${id}`);
      }
      void refreshUsage();
      sessions.refresh();
      // The title is written after the response, and it can take several seconds. The list asks again shortly after, then twice more.
      window.setTimeout(() => sessions.refresh(), 2_500);
      window.setTimeout(() => sessions.refresh(), 6_000);
      window.setTimeout(() => sessions.refresh(), 10_000);
    },
    onError: () => {
      void refreshUsage();
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const blocked = blockedMessage(usage);
  const historyChars = messages.reduce(
    (total, message) =>
      total + message.parts.reduce((sum, part) => sum + (part.type === "text" ? part.text.length : 0), 0),
    0,
  );

  // The pinned sources travel twice: as metadata so the bubble can show them at once, and as ids for the server to re-read.
  function send(text: string, chips: MentionChip[] = []) {
    void sendMessage(
      {
        text: text.trim(),
        metadata: {
          mentions: chips.map((chip) => ({
            type: chip.type,
            id: chip.id,
            label: chip.label,
            status: "accepted",
            source: { type: chip.type, id: chip.id, label: chip.label, href: chip.href },
          })),
        },
      },
      {
        body: {
          conversationId: conversationId ?? undefined,
          effort,
          mentions: chips.map((chip) => ({ type: chip.type, id: chip.id, label: chip.label })),
        },
      },
    );
  }

  // "Tanya Vera soal ini" opens the chat with the document already pinned as a source.
  function askAboutDocument(doc: StudioDocument) {
    setComposerSeed({
      key: Date.now(),
      chips: [{ type: "studio", id: doc.id, label: doc.title, href: studioDocumentHref(doc.id) }],
    });
    setTab("chat");
  }

  function changeEffort(next: VeraEffortId) {
    setEffortOverride(next);
    persistEffort(studentId, next);
  }

  function submitComposer({ text, chips }: ComposerSubmit) {
    send(text, chips);
  }

  // Switching sessions goes through the URL, so the page loads that session's messages and the chat starts from them.
  function openSession(id: string) {
    setSessionsOpen(false);
    router.push(`/vera-ai?c=${id}`);
  }

  // The nonce gives the page a new key, so a new session never reuses the thread on screen, even when the URL already reads ?c=new.
  function newSession() {
    setSessionsOpen(false);
    router.push(`/vera-ai?c=new&n=${Date.now()}`);
  }

  function deleteSession(id: string) {
    void sessions.remove(id);
    if (id === conversationId) newSession();
  }

  const panel = {
    view: sessions.view,
    sessions: sessions.sessions,
    loading: sessions.loading,
    error: sessions.error,
    activeId: conversationId,
    onViewChange: sessions.changeView,
    onNew: newSession,
    onOpen: openSession,
    onRename: (id: string, title: string) => void sessions.rename(id, title),
    onArchive: (id: string, toArchive: boolean) => void sessions.archive(id, toArchive),
    onDelete: deleteSession,
  };

  return (
    <div className="flex min-h-[calc(100svh-8rem)] min-w-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h1 className="text-lg font-semibold text-secondary-950">Vera AI</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Dialog onOpenChange={setSessionsOpen} open={sessionsOpen}>
            <DialogTrigger render={<Button className="md:hidden" size="sm" type="button" variant="outline" />}>
              <Menu />
              Sesi
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sesi Vera</DialogTitle>
                <DialogDescription>Pilih sesi untuk dilanjutkan, atau mulai sesi baru.</DialogDescription>
              </DialogHeader>
              <VeraSessionsPanel {...panel} />
            </DialogContent>
          </Dialog>
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

      <div className="flex min-h-0 min-w-0 flex-1 gap-6 px-4">
        <aside className={cn("hidden shrink-0 md:block", sidebarOpen ? "w-64" : "w-10")}>
          <div className="flex items-start gap-2">
            {sidebarOpen ? (
              <div className="min-w-0 flex-1">
                <VeraSessionsPanel {...panel} />
              </div>
            ) : null}
            <Button
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? "Sembunyikan sesi" : "Tampilkan sesi"}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              size="icon-sm"
              type="button"
              variant="quiet"
            >
              <Menu />
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {tab === "studio" ? (
            <div className="mx-auto w-full max-w-5xl py-4">
              <VeraStudioPanel
                initialDocument={initialStudioDocument}
                initialDocuments={initialStudioDocs}
                onAsk={askAboutDocument}
                prices={usage.prices}
              />
            </div>
          ) : (
            <>
              {messages.length === 0 ? (
                <EmptyState onPick={(text) => blocked === null && !busy && send(text)} />
              ) : (
                <ChatThread className="mx-auto w-full max-w-3xl">
                  {messages.map((message) => (
                    <ChatTurn key={message.id} messageId={message.id} fromUser={message.role === "user"}>
                      <ThreadMessage message={message} stopping={message.id === stoppedMessageId} />
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

              <div className="mx-auto w-full max-w-3xl pb-4 pt-2">
                {blocked ? (
                  <p role="status" className="mb-2 text-sm text-muted-foreground">
                    {blocked}
                  </p>
                ) : null}
                <VeraComposer
                  blocked={blocked}
                  effort={effort}
                  initialChips={composerSeed?.chips ?? []}
                  key={composerSeed?.key ?? 0}
                  historyChars={historyChars}
                  onEffortChange={changeEffort}
                  onSend={submitComposer}
                  onStop={() => {
                    // The server saves a stopped answer with a marker. Marking it at once matches that, without waiting for a reload.
                    const streaming = messages.at(-1);
                    if (streaming?.role === "assistant") setStoppedMessageId(streaming.id);
                    void stop();
                  }}
                  prices={usage.prices}
                  status={status}
                />
                <p className="mt-2 text-center text-xs text-muted-foreground">Vera bisa salah. Cek lagi jawabannya.</p>
              </div>
            </>
          )}
        </div>
      </div>
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

/** The `@` sources a student pinned. A source the server could not open says so instead of linking. */
function MentionLinks({ mentions }: { mentions: ResolvedMention[] }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {mentions.map((mention) =>
        mention.status === "accepted" && mention.source ? (
          <Link className="max-w-full min-w-0" href={mention.source.href} key={`${mention.type}:${mention.id}`}>
            <Badge className="max-w-full min-w-0 truncate" size="sm" tone="info">
              {mention.label}
            </Badge>
          </Link>
        ) : (
          <Badge key={`${mention.type}:${mention.id}`} size="sm" tone="attention">
            {`${mention.label}: tidak bisa dibuka`}
          </Badge>
        ),
      )}
    </div>
  );
}

function ThreadMessage({ message, stopping = false }: { message: UIMessage; stopping?: boolean }) {
  if (message.role === "user") {
    const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
    const mentions = (message.metadata as { mentions?: ResolvedMention[] } | undefined)?.mentions ?? [];
    return (
      <Message align="end">
        <MessageContent className="flex flex-col items-end gap-2">
          <Bubble align="end" variant="muted">
            <BubbleContent>{text}</BubbleContent>
          </Bubble>
          {mentions.length > 0 ? <MentionLinks mentions={mentions} /> : null}
        </MessageContent>
      </Message>
    );
  }

  const stopped = stopping || message.parts.some(
    (part) => part.type === "data-vera-status" && (part.data as { stopped?: boolean } | undefined)?.stopped === true,
  );
  const credits = (message.metadata as { credits?: number } | undefined)?.credits;
  // Links come from the pinned sources the server accepted and from the tool results the answer used. Both only point at pages
  // the student could open.
  const pinnedSources = (message.metadata as { sources?: VeraSource[] } | undefined)?.sources ?? [];
  const toolOutputs = message.parts.flatMap((part) => (isToolUIPart(part) ? [part.output] : []));
  const sources = uniqueSources([...pinnedSources, ...collectSources(toolOutputs)]);
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

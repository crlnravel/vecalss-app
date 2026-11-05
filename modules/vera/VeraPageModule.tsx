"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { ChatThread, ChatTurn } from "@/components/ai-elements/chat";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Sources } from "@/components/ai-elements/sources";
import { ToolStep } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Message, MessageContent } from "@/components/ui/message";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { showToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { PanelLeftOpen, Plus } from "@/lib/icons";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import { VERA_EFFORT_IDS, type VeraEffortId } from "@/lib/vera/config";
import { formatCredits } from "@/lib/vera/credits-shared";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import type { StudioDocument, StudioDocumentSummary } from "@/lib/vera/studio-documents";
import {
  collectSources,
  studioDocumentHref,
  uniqueSources,
  type ResolvedMention,
  type VeraSource,
} from "@/lib/vera/sources/types";
import { cn } from "@/lib/utils";
import { type MentionChip } from "@/modules/vera/mention-model";
import { VeraComposer, type ComposerSubmit } from "@/modules/vera/VeraComposer";
import { VeraSessionsPanel } from "@/modules/vera/VeraSessionsPanel";
import { VeraStudioPanel } from "@/modules/vera/VeraStudioPanel";
import { VeraWorkspaceHeader } from "@/modules/vera/VeraWorkspaceHeader";
import { useVeraSessions } from "@/modules/vera/use-vera-sessions";

const STARTER_PROMPTS = [
  "Kenapa skor PK-ku turun?",
  "Bahas soal salah Tryout terakhir",
  "Apa yang perlu aku latih minggu ini?",
  "Jelaskan konsep persentase bertingkat",
];

const DEFAULT_EFFORT: VeraEffortId = "seimbang";
const UNAVAILABLE_ANSWER = "Vera belum bisa menjawab sekarang.";
const MASCOT_SRC = "/brand/mascot-vecalss-2.png";

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
  session,
  firstName,
  notificationFeed,
  returnHref,
  returnLabel,
  conversationId: initialConversationId,
  initialMessages,
  initialSessions,
  initialTab,
  initialStudioDocs,
  initialStudioDocument,
  initialUsage,
}: {
  studentId: string;
  session: SessionContext;
  firstName: string | null;
  notificationFeed: StudentNotificationFeed;
  returnHref: string;
  returnLabel: string;
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
  // Messages already on the page when it opens do not animate in again.
  const [restoredIds] = useState(() => new Set(initialMessages.map((message) => message.id)));
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
  const { messages, sendMessage, status, stop, regenerate } = useChat<UIMessage>({
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
    onError: (error) => {
      void refreshUsage();
      showToast(answerErrorMessage(error), {
        variant: "error",
        action: { label: "Coba lagi", onClick: () => void regenerate() },
      });
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
    <Tabs className="flex min-h-0 flex-1 flex-col gap-3" onValueChange={(value) => setTab(value as VeraTab)} value={tab}>
      <VeraWorkspaceHeader
        notificationFeed={notificationFeed}
        onOpenSessions={() => setSessionsOpen(true)}
        onRefreshUsage={() => void refreshUsage()}
        returnHref={returnHref}
        returnLabel={returnLabel}
        session={session}
        usage={usage}
      />

      <div className="flex min-h-0 flex-1 gap-3">
        {sidebarOpen ? (
          <aside
            aria-label="Sesi Vera"
            className="hidden w-[264px] shrink-0 flex-col rounded-panel border border-primary-100 bg-white p-3 md:flex"
          >
            <VeraSessionsPanel {...panel} onCollapse={() => setSidebarOpen(false)} />
          </aside>
        ) : (
          <aside
            aria-label="Sesi Vera"
            className="hidden w-14 shrink-0 flex-col items-center gap-2 rounded-panel border border-primary-100 bg-white p-2 md:flex"
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Tampilkan sesi"
                    onClick={() => setSidebarOpen(true)}
                    size="icon"
                    type="button"
                    variant="quiet"
                  />
                }
              >
                <PanelLeftOpen />
              </TooltipTrigger>
              <TooltipContent side="right">Tampilkan sesi</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={<Button aria-label="Sesi baru" onClick={newSession} size="icon" type="button" variant="outline" />}
              >
                <Plus />
              </TooltipTrigger>
              <TooltipContent side="right">Sesi baru</TooltipContent>
            </Tooltip>
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TabsContent className="flex min-h-0 flex-1 flex-col" value="chat">
            {messages.length === 0 ? (
              <EmptyState
                disabled={blocked !== null || busy}
                firstName={firstName}
                onPick={(text) => send(text)}
              />
            ) : (
              <ChatThread className="mx-auto w-full max-w-3xl">
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
            )}

            <div className="mx-auto w-full max-w-3xl px-1 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {blocked ? (
                <p
                  className="mb-2 rounded-card border border-student-status-attention-border bg-student-status-attention-bg px-4 py-3 text-sm text-student-status-attention-fg"
                  role="status"
                >
                  {blocked}
                </p>
              ) : null}
              <VeraComposer
                blocked={blocked}
                effort={effort}
                historyChars={historyChars}
                initialChips={composerSeed?.chips ?? []}
                key={composerSeed?.key ?? 0}
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
          </TabsContent>

          <TabsContent className="flex min-h-0 flex-1 flex-col overflow-y-auto" value="studio">
            <div className="mx-auto w-full max-w-[78rem] px-4 py-5 md:px-6 md:py-6">
              <VeraStudioPanel
                initialDocument={initialStudioDocument}
                initialDocuments={initialStudioDocs}
                onAsk={askAboutDocument}
                prices={usage.prices}
              />
            </div>
          </TabsContent>
        </div>
      </div>

      <Sheet onOpenChange={setSessionsOpen} open={sessionsOpen}>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Sesi Vera</SheetTitle>
            <SheetDescription>Pilih sesi untuk dilanjutkan, atau mulai sesi baru.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
            <VeraSessionsPanel {...panel} />
          </div>
        </SheetContent>
      </Sheet>
    </Tabs>
  );
}

function EmptyState({
  disabled,
  firstName,
  onPick,
}: {
  disabled: boolean;
  firstName: string | null;
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8">
      <Empty className="max-w-2xl gap-6 p-0">
        <EmptyMedia className="relative mb-0 size-[80px] overflow-hidden rounded-pill">
          <Image alt="" className="object-contain" fill sizes="80px" src={MASCOT_SRC} />
        </EmptyMedia>
        <EmptyHeader className="max-w-xl gap-2">
          <EmptyTitle className="text-[1.5rem] font-extrabold tracking-[-0.035em] text-voyage-ink">
            {firstName ? `Mau belajar apa hari ini, ${firstName}?` : "Mau belajar apa hari ini?"}
          </EmptyTitle>
          <EmptyDescription>Tanya apa saja soal belajarmu, aku bantu jelaskan pelan-pelan.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-2xl">
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            {STARTER_PROMPTS.map((prompt) => (
              <Button
                className="h-auto min-h-[44px] w-full justify-start py-2.5 text-left whitespace-normal"
                disabled={disabled}
                key={prompt}
                onClick={() => onPick(prompt)}
                type="button"
                variant="outline"
              >
                {prompt}
              </Button>
            ))}
          </div>
        </EmptyContent>
      </Empty>
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
          <Bubble align="end" variant="muted">
            <BubbleContent className="text-base leading-[1.6] whitespace-pre-wrap text-accent-foreground">
              {text}
            </BubbleContent>
          </Bubble>
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
      <span
        aria-hidden="true"
        className="relative mt-0.5 size-[32px] shrink-0 overflow-hidden rounded-pill border border-primary-100 bg-white"
      >
        <Image alt="" className="object-contain" fill sizes="32px" src={MASCOT_SRC} />
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
              <div
                className="min-w-0 max-w-[68ch] break-words [&_a]:font-semibold [&_a]:text-voyage-deep [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded-indicator [&_code]:bg-secondary-50 [&_code]:px-1 [&_h1]:font-heading [&_h1]:text-lg [&_h1]:font-extrabold [&_h2]:font-heading [&_h2]:font-extrabold [&_h3]:font-heading [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:bg-secondary-50 [&_pre]:p-3 [&_strong]:font-semibold [&_table]:block [&_table]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5"
                key={index}
              >
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

"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import { VERA_EFFORT_IDS, type VeraEffortId } from "@/lib/vera/config";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import type { StudioDocument } from "@/lib/vera/studio-documents";
import { studioDocumentHref } from "@/lib/vera/sources/types";
import { type MentionChip } from "@/modules/vera/mention-model";
import { VeraChat } from "@/modules/vera/VeraChat";
import { VeraHome } from "@/modules/vera/VeraHome";
import { VeraSessionsPanel } from "@/modules/vera/VeraSessionsPanel";
import { VeraWorkspaceHeader } from "@/modules/vera/VeraWorkspaceHeader";
import { useVeraSessions } from "@/modules/vera/use-vera-sessions";
import { useVeraStudioRun } from "@/modules/vera/use-vera-studio-run";

const DEFAULT_EFFORT: VeraEffortId = "seimbang";
const UNAVAILABLE_ANSWER = "Vera belum bisa menjawab sekarang.";

type VeraView = "home" | "chat";

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

/**
 * The Vera page: a slim top bar over either home or the chat. Sessions live in a right-side sheet opened from the bar.
 * Home has no active session, so going back to it starts nothing new; the session stays in the sheet.
 *
 * The chat hook lives here rather than in the chat view, so a message sent from home is sent from the click that sends it. Starting
 * a request from an effect would be cancelled by React's development double-run of effects.
 */
export function VeraPageModule({
  conversationId: initialConversationId,
  firstName,
  initialMessages,
  initialSessions,
  initialStudioDocument,
  initialUsage,
  notificationFeed,
  session,
  startInChat,
  studentId,
}: {
  conversationId: string | null;
  firstName: string | null;
  initialMessages: UIMessage[];
  initialSessions: VeraSessionSummary[];
  initialStudioDocument: StudioDocument | null;
  initialUsage: VeraUsageSnapshot;
  notificationFeed: StudentNotificationFeed;
  session: SessionContext;
  startInChat: boolean;
  studentId: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<VeraView>(startInChat ? "chat" : "home");
  // The server creates the conversation on the first send and returns its id in the answer metadata.
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [chatId] = useState(() => initialConversationId ?? crypto.randomUUID());
  // Messages already on the page when it opens do not animate in again.
  const [restoredIds] = useState(() => new Set(initialMessages.map((message) => message.id)));
  const [stoppedMessageId, setStoppedMessageId] = useState<string | null>(null);
  // A Studio document the student asks Vera about is pinned when the chat opens.
  const [composerSeed, setComposerSeed] = useState<{ key: number; chips: MentionChip[] } | null>(null);
  const [openDocument, setOpenDocument] = useState(initialStudioDocument);
  const [usage, setUsage] = useState(initialUsage);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [effortOverride, setEffortOverride] = useState<VeraEffortId | null>(null);
  // The document the student deleted from the dialog. The preview card stops offering it.
  const [deletedDocumentId, setDeletedDocumentId] = useState<string | null>(null);
  const sessions = useVeraSessions(initialSessions);
  const studio = useVeraStudioRun();
  const storedEffort = useSyncExternalStore(
    subscribeToStorage,
    () => readStoredEffort(studentId),
    () => DEFAULT_EFFORT,
  );
  const effort = effortOverride ?? storedEffort;
  const blocked = blockedMessage(usage);
  // A document the student deleted no longer offers its buttons on the preview card.
  const savedDocumentId =
    studio.previewDocumentId && studio.previewDocumentId !== deletedDocumentId ? studio.previewDocumentId : null;

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
  const { messages, sendMessage, setMessages, status, stop, regenerate } = useChat<UIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: ({ message }) => {
      const id = (message.metadata as { conversationId?: string } | undefined)?.conversationId;
      if (id) conversationCreated(id);
      afterAnswer();
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
  const historyChars = messages.reduce(
    (total, message) =>
      total + message.parts.reduce((sum, part) => sum + (part.type === "text" ? part.text.length : 0), 0),
    0,
  );

  async function refreshUsage() {
    try {
      const response = await fetch("/api/vera/usage", { cache: "no-store" });
      if (response.ok) setUsage((await response.json()) as VeraUsageSnapshot);
    } catch {
      // Keep the numbers already on screen.
    }
  }

  // Once an answer ends or fails, the usage meter and the session list are read again.
  function afterAnswer() {
    void refreshUsage();
    sessions.refresh();
    // The title is written after the response, and it can take several seconds. The list asks again shortly after, then twice more.
    window.setTimeout(() => sessions.refresh(), 2_500);
    window.setTimeout(() => sessions.refresh(), 6_000);
    window.setTimeout(() => sessions.refresh(), 10_000);
  }

  function conversationCreated(id: string) {
    setConversationId(id);
    // The URL follows the session without a navigation, so a reload restores it.
    window.history.replaceState(null, "", `/vera-ai?c=${id}`);
  }

  // The pinned sources travel twice: as metadata so the message can show them at once, and as ids for the server to re-read.
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

  function stopAnswer() {
    // The server saves a stopped answer with a marker. Marking it at once matches that, without waiting for a reload.
    const streaming = messages.at(-1);
    if (streaming?.role === "assistant") setStoppedMessageId(streaming.id);
    void stop();
  }

  function startChatFromHome(text: string, chips: MentionChip[]) {
    setView("chat");
    send(text, chips);
  }

  // "Tanya Vera soal ini" opens the chat with the document already pinned as a source.
  function askAboutDocument(doc: StudioDocument) {
    setComposerSeed({
      key: Date.now(),
      chips: [{ type: "studio", id: doc.id, label: doc.title, href: studioDocumentHref(doc.id) }],
    });
    setOpenDocument(null);
    setView("chat");
  }

  // Home starts clean: the thread is cleared and no session is active. The session itself stays in the sheet.
  function goHome() {
    if (busy) void stop();
    setMessages([]);
    setStoppedMessageId(null);
    setConversationId(null);
    setComposerSeed(null);
    setSessionsOpen(false);
    setView("home");
    window.history.replaceState(null, "", "/vera-ai");
  }

  // The preview knows a document only by its id, so the full document is read from the server before it opens or is asked about.
  async function loadDocument(id: string): Promise<StudioDocument | null> {
    try {
      const response = await fetch(`/api/vera/studio/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (response.ok) {
        const { document } = (await response.json()) as { document: StudioDocument };
        return document;
      }
    } catch {
      // Fall through to the message below.
    }
    showToast("Dokumen belum bisa dibuka. Coba lagi.", { variant: "error" });
    return null;
  }

  async function openDocumentById(id: string) {
    const document = await loadDocument(id);
    if (document) setOpenDocument(document);
  }

  async function askAboutDocumentById(id: string) {
    const document = await loadDocument(id);
    if (document) askAboutDocument(document);
  }

  // The dialog stays open when the delete fails, so the student can try again.
  async function deleteDocument(id: string) {
    try {
      const response = await fetch(`/api/vera/studio/${encodeURIComponent(id)}`, { method: "DELETE", cache: "no-store" });
      if (response.ok) {
        setOpenDocument(null);
        setDeletedDocumentId(id);
        return;
      }
    } catch {
      // Fall through to the message below.
    }
    showToast("Dokumen belum bisa dihapus. Coba lagi.", { variant: "error" });
  }

  function changeEffort(next: VeraEffortId) {
    setEffortOverride(next);
    persistEffort(studentId, next);
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
    <div className="flex min-h-0 flex-1 flex-col">
      <VeraWorkspaceHeader
        notificationFeed={notificationFeed}
        onOpenSessions={() => setSessionsOpen(true)}
        onRefreshUsage={() => void refreshUsage()}
        session={session}
        usage={usage}
      />

      {view === "home" ? (
        <VeraHome
          blocked={blocked}
          effort={effort}
          firstName={firstName}
          onAsk={askAboutDocument}
          onAskDocumentById={(id) => void askAboutDocumentById(id)}
          onChangeEffort={changeEffort}
          onCloseDocument={() => setOpenDocument(null)}
          onDeleteDocument={(id) => void deleteDocument(id)}
          onOpenDocument={(id) => void openDocumentById(id)}
          onSend={startChatFromHome}
          openDocument={openDocument}
          prices={usage.prices}
          savedDocumentId={savedDocumentId}
          studio={studio}
        />
      ) : (
        <VeraChat
          blocked={blocked}
          busy={busy}
          composerKey={composerSeed?.key ?? 0}
          effort={effort}
          historyChars={historyChars}
          initialChips={composerSeed?.chips ?? []}
          messages={messages}
          onBack={goHome}
          onChangeEffort={changeEffort}
          onSend={send}
          onStop={stopAnswer}
          prices={usage.prices}
          restoredIds={restoredIds}
          status={status}
          stoppedMessageId={stoppedMessageId}
        />
      )}

      <Sheet onOpenChange={setSessionsOpen} open={sessionsOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Percakapan</SheetTitle>
            <SheetDescription>Pilih percakapan untuk dilanjutkan, atau mulai sesi baru.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
            <VeraSessionsPanel {...panel} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

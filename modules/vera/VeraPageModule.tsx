"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "@/components/ui/sidebar";
import { showToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { History } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import { VERA_EFFORT_IDS, type VeraEffortId, type VeraReportReason } from "@/lib/vera/config";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import type { StudioOptions, StudioToolId } from "@/lib/vera/studio";
import type { StudioDocument } from "@/lib/vera/studio-documents";
import { studioDocumentHref, type ResolvedMention } from "@/lib/vera/sources/types";
import { studentSidebarSurfaceClassName } from "@/modules/student/components/student-sidebar";
import { type MentionChip } from "@/modules/vera/mention-model";
import { VeraChat } from "@/modules/vera/VeraChat";
import { VeraHome } from "@/modules/vera/VeraHome";
import { VeraSessionsPanel } from "@/modules/vera/VeraSessionsPanel";
import { VeraStudioDocDialog } from "@/modules/vera/VeraStudioDocs";
import { VeraStudioToolDialog } from "@/modules/vera/VeraStudioTools";
import { VeraUsagePopover } from "@/modules/vera/VeraUsagePopover";
import { useVeraSessions } from "@/modules/vera/use-vera-sessions";

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
 * The Vera page, in Aily's layout, inside the student shell: the centre column shows either home or the chat. From lg up a right panel
 * holds the conversation list and the usage block. Below lg a small row above the column holds the history button and the usage pill, and
 * the list opens from that button in a sheet. Starting a new session goes to home.
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
  startInChat,
  studentId,
}: {
  conversationId: string | null;
  firstName: string | null;
  initialMessages: UIMessage[];
  initialSessions: VeraSessionSummary[];
  initialStudioDocument: StudioDocument | null;
  initialUsage: VeraUsageSnapshot;
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
  // The Studio tool whose options dialog is open. The start screen picks it.
  const [pickedTool, setPickedTool] = useState<StudioToolId | null>(null);
  const [effortOverride, setEffortOverride] = useState<VeraEffortId | null>(null);
  // The document the student deleted from the dialog. Its buttons in the chat stop offering it.
  const [deletedDocumentId, setDeletedDocumentId] = useState<string | null>(null);
  const sessions = useVeraSessions(initialSessions);
  // Each read of the usage meter takes a number, and only the newest read may write. So a slow response cannot replace a newer one.
  const usageReads = useRef(0);
  const storedEffort = useSyncExternalStore(
    subscribeToStorage,
    () => readStoredEffort(studentId),
    () => DEFAULT_EFFORT,
  );
  const effort = effortOverride ?? storedEffort;
  const blocked = blockedMessage(usage);

  // Only the newest message travels in the request. The server loads the rest of the thread.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/vera/chat",
        // Ulangi names the answer it replaces. Every other request, including the retry after a failed answer, sends the newest message.
        prepareSendMessagesRequest: ({ messages, body, trigger, messageId }) =>
          trigger === "regenerate-message" && body?.action === "regenerate"
            ? { body: { ...body, assistantMessageId: messageId } }
            : { body: { ...body, message: messages.at(-1) } },
      }),
    [],
  );
  const { messages, sendMessage, status, stop, regenerate } = useChat<UIMessage>({
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
  async function refreshUsage() {
    const read = ++usageReads.current;
    try {
      const response = await fetch("/api/vera/usage", { cache: "no-store" });
      if (!response.ok) return;
      const snapshot = (await response.json()) as VeraUsageSnapshot;
      if (read === usageReads.current) setUsage(snapshot);
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

  // The pinned sources travel twice: as metadata so the message can show them at once, and as ids for the server to re-read. A Studio
  // request travels the same way: its options go in the body, and a flag on the message keeps its question from being edited.
  function send(text: string, chips: MentionChip[] = [], studioRequest: StudioOptions | null = null, sendEffort = effort) {
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
          studio: studioRequest ?? undefined,
        },
      },
      {
        body: {
          action: "send",
          conversationId: conversationId ?? undefined,
          effort: sendEffort,
          mentions: chips.map((chip) => ({ type: chip.type, id: chip.id, label: chip.label })),
          studio: studioRequest ?? undefined,
        },
      },
    );
  }

  // Ulangi answers the same question again. The server drops the answer it replaces once the new answer has its reservation.
  function regenerateAnswer(messageId: string) {
    if (!conversationId) return;
    void regenerate({ messageId, body: { action: "regenerate", conversationId, effort } });
  }

  // Edit sends the question again in place of the stored one. The page replaces the question and the answer after it, as the server does.
  function editQuestion(storedId: string, localId: string, text: string, mentions: ResolvedMention[]) {
    if (!conversationId) return;
    void sendMessage(
      { messageId: localId, text, metadata: { mentions } },
      {
        body: {
          action: "edit",
          conversationId,
          userMessageId: storedId,
          effort,
          mentions: mentions.map((mention) => ({ type: mention.type, id: mention.id, label: mention.label })),
        },
      },
    );
  }

  // Laporkan saves one report for one answer. The dialog closes only when the report has been saved.
  async function reportAnswer(messageId: string, reason: VeraReportReason, note: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/vera/messages/${encodeURIComponent(messageId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note: note || undefined }),
        cache: "no-store",
      });
      if (response.ok) {
        showToast("Terima kasih, laporanmu tersimpan.", { variant: "success" });
        return true;
      }
      const { message } = (await response.json().catch(() => ({}))) as { message?: string };
      showToast(message ?? "Laporanmu belum bisa disimpan. Coba lagi.", { variant: "error" });
    } catch {
      showToast("Laporanmu belum bisa disimpan. Coba lagi.", { variant: "error" });
    }
    return false;
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

  // A Studio request is sent as a chat message the student can read. It goes at Mendalam effort, which is the effort the dialog estimates.
  function startStudio(options: StudioOptions, bubble: string) {
    setView("chat");
    send(bubble, [], options, "mendalam");
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

  // "Sesi baru" opens the start screen on a new page instance. The nonce gives the page a new key, so no thread or draft carries over.
  function newSession() {
    setSessionsOpen(false);
    router.push(`/vera-ai?n=${Date.now()}`);
  }

  function deleteSession(id: string) {
    void sessions.remove(id);
    if (id === conversationId) newSession();
  }

  const panel = {
    sessions: sessions.sessions,
    loading: sessions.loading,
    error: sessions.error,
    activeId: conversationId,
    onNew: newSession,
    onOpen: openSession,
    onRename: (id: string, title: string) => void sessions.rename(id, title),
    onDelete: deleteSession,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Below lg the history button and the usage pill sit in a small row above the column. From lg up the right panel holds both. */}
          <div className="flex shrink-0 items-center justify-end gap-2 px-4 pt-3 lg:hidden">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Buka daftar sesi"
                    onClick={() => setSessionsOpen(true)}
                    size="icon"
                    type="button"
                    variant="quiet"
                  />
                }
              >
                <History />
              </TooltipTrigger>
              <TooltipContent>Daftar sesi</TooltipContent>
            </Tooltip>
            <VeraUsagePopover onOpen={() => void refreshUsage()} usage={usage} />
          </div>
          {view === "home" ? (
            <VeraHome
              blocked={blocked}
              effort={effort}
              firstName={firstName}
              onChangeEffort={changeEffort}
              onPickTool={setPickedTool}
              onSend={startChatFromHome}
            />
          ) : (
            <VeraChat
              blocked={blocked}
              busy={busy}
              composerKey={composerSeed?.key ?? 0}
              deletedDocumentId={deletedDocumentId}
              effort={effort}
              initialChips={composerSeed?.chips ?? []}
              messages={messages}
              onAskDocument={(id) => void askAboutDocumentById(id)}
              onChangeEffort={changeEffort}
              onEdit={editQuestion}
              onOpenDocument={(id) => void openDocumentById(id)}
              onRegenerate={regenerateAnswer}
              onReport={reportAnswer}
              onSend={send}
              onStop={stopAnswer}
              restoredIds={restoredIds}
              status={status}
              stoppedMessageId={stoppedMessageId}
            />
          )}
        </div>

        {/* From lg up, the conversation list and the usage block sit in a right panel beside the centre column. The panel is the dashboard sidebar's own component, in its surface, at the width of the dashboard's card, which is the sidebar width less its inset. */}
        <Sidebar
          aria-label="Percakapan"
          className={cn("hidden min-h-0 w-[calc(var(--sidebar-width)_-_1rem)] shrink-0 lg:flex", studentSidebarSurfaceClassName)}
          collapsible="none"
          role="complementary"
        >
          <VeraSessionsPanel {...panel} usage={usage} />
        </Sidebar>
      </div>

      {/* Below lg the same panel opens from the header, in a sheet. */}
      <Sheet onOpenChange={setSessionsOpen} open={sessionsOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Percakapan</SheetTitle>
            <SheetDescription>Pilih percakapan untuk dilanjutkan, atau mulai sesi baru.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-6">
            <VeraSessionsPanel {...panel} usage={usage} />
          </div>
        </SheetContent>
      </Sheet>

      <VeraStudioToolDialog
        busy={busy || blocked !== null}
        onClose={() => setPickedTool(null)}
        onRun={(options, bubble) => {
          setPickedTool(null);
          startStudio(options, bubble);
        }}
        prices={usage.prices}
        tool={pickedTool}
      />
      {/* The document dialog is shared by the start screen and the chat, so a saved document opens from either. */}
      <VeraStudioDocDialog
        doc={openDocument}
        onAsk={askAboutDocument}
        onClose={() => setOpenDocument(null)}
        onDelete={(id) => void deleteDocument(id)}
      />
    </div>
  );
}

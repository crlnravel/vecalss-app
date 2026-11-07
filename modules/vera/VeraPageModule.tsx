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
import { VERA_EFFORT_IDS, type VeraEffortId } from "@/lib/vera/config";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import type { StudioToolId } from "@/lib/vera/studio";
import type { StudioDocument } from "@/lib/vera/studio-documents";
import { studioDocumentHref } from "@/lib/vera/sources/types";
import { studentSidebarSurfaceClassName } from "@/modules/student/components/student-sidebar";
import { type MentionChip } from "@/modules/vera/mention-model";
import { VeraChat } from "@/modules/vera/VeraChat";
import { VeraHome } from "@/modules/vera/VeraHome";
import { VeraSessionsPanel } from "@/modules/vera/VeraSessionsPanel";
import { VeraStudioToolDialog } from "@/modules/vera/VeraStudioTools";
import { VeraUsagePopover } from "@/modules/vera/VeraUsagePopover";
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
  // The Studio tool whose options dialog is open. The toolbar of both the start screen and the chat picks it.
  const [pickedTool, setPickedTool] = useState<StudioToolId | null>(null);
  const [effortOverride, setEffortOverride] = useState<VeraEffortId | null>(null);
  // The document the student deleted from the dialog. The preview card stops offering it.
  const [deletedDocumentId, setDeletedDocumentId] = useState<string | null>(null);
  const sessions = useVeraSessions(initialSessions);
  // Each read of the usage meter takes a number, and only the newest read may write. So a slow response cannot replace a newer one.
  const usageReads = useRef(0);
  // A run that ends, stopped or not, has used credits, so the usage meter is read again.
  const studio = useVeraStudioRun(() => void refreshUsage());
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
              onAsk={askAboutDocument}
              onAskDocumentById={(id) => void askAboutDocumentById(id)}
              onChangeEffort={changeEffort}
              onCloseDocument={() => setOpenDocument(null)}
              onDeleteDocument={(id) => void deleteDocument(id)}
              onOpenDocument={(id) => void openDocumentById(id)}
              onPickTool={setPickedTool}
              onSend={startChatFromHome}
              openDocument={openDocument}
              savedDocumentId={savedDocumentId}
              studio={studio}
            />
          ) : (
            <VeraChat
              blocked={blocked}
              busy={busy}
              composerKey={composerSeed?.key ?? 0}
              effort={effort}
              initialChips={composerSeed?.chips ?? []}
              messages={messages}
              onChangeEffort={changeEffort}
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
        busy={studio.busy}
        onClose={() => setPickedTool(null)}
        onRun={(request) => {
          setPickedTool(null);
          studio.run(request);
        }}
        prices={usage.prices}
        tool={pickedTool}
      />
    </div>
  );
}

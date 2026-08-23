"use client";

import {
  useMemo,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown, { type Components } from "react-markdown";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  FileQuestion,
  FileText,
  Gauge,
  GraduationCap,
  House,
  LibraryBig,
  ListChecks,
  Maximize2,
  MessageCircleMore,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  SendHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
  type AppIcon,
} from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { StudentBadge } from "@/components/ui/student-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FullWidthLineTabsList,
  FullWidthLineTabsTrigger,
} from "@/components/ui/full-width-line-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { StudentNotificationPopover } from "@/modules/student/components/student-notification-popover";

import {
  veraContextSources,
  veraMaterialHistory,
  veraPracticeHistory,
  veraStudioTools,
  veraToolModes,
  type VeraContextSource,
  type VeraContextTypeId,
  type VeraMaterialHistory,
  type VeraPracticeHistory,
  type VeraStudioTool,
  type VeraToolId,
} from "./data";

type WorkspaceTab = "chat" | "context" | "studio";

function sourceForTitle(title: string) {
  return veraContextSources.find((source) => source.title === title);
}

type VeraMessage = {
  id: string;
  role: "vera" | "student";
  body: string;
  createdAt: string;
  citations?: string[];
};

type StudySession = {
  id: string;
  title: string;
  updatedAt: string;
  sourceIds: string[];
  generatedTools: VeraToolId[];
  messages: VeraMessage[];
};

const studioToolIds: VeraToolId[] = [
  "analysis",
  "route",
  "review",
  "summary",
  "drill",
];

const MAX_CONTEXTS_PER_SESSION = 6;
const CONTEXT_PAGE_SIZE = 3;
const DAILY_TOKEN_USAGE = 3200;
const DAILY_TOKEN_LIMIT = 10000;

const toolIcons: Record<VeraToolId, AppIcon> = {
  analysis: ChartNoAxesColumnIncreasing,
  route: ListChecks,
  drill: Dumbbell,
  review: FileQuestion,
  ptn: GraduationCap,
  summary: FileText,
};

const contextTypeIcons: Record<VeraContextTypeId, AppIcon> = {
  practice: ChartNoAxesColumnIncreasing,
  material: BookOpen,
  document: FileText,
};

const initialMessages: VeraMessage[] = [
  {
    id: "ratio-welcome",
    role: "vera",
    body: "Aku sudah membaca Tryout SNBT 04, Modul Rasio Dasar, dan catatan pribadimu. Dari ketiganya, pola yang paling dekat untuk kita bereskan adalah rasio dua langkah dan simpulan implisit.",
    createdAt: "Baru saja",
    citations: ["Tryout SNBT 04", "Modul Rasio Dasar", "Rangkuman PK Pribadi"],
  },
  {
    id: "ratio-next",
    role: "vera",
    body: "Kita bisa membahas satu soal pelan-pelan di sini, atau aku bisa menyusun analisis dan drill yang tersimpan rapi di Vera Studio. Kamu ingin mulai dari yang mana?",
    createdAt: "Baru saja",
  },
];

const initialSessions: StudySession[] = [
  {
    id: "ratio-review",
    title: "Review Rasio Hari Ini",
    updatedAt: "Baru saja",
    sourceIds: ["tryout-04", "module-ratio", "personal-summary"],
    generatedTools: ["analysis", "summary"],
    messages: initialMessages,
  },
  {
    id: "wrong-answer-review",
    title: "Review Jawaban Salah",
    updatedAt: "Kemarin",
    sourceIds: ["tryout-04", "quiz-pk-02"],
    generatedTools: ["review"],
    messages: [
      {
        id: "wrong-answer-welcome",
        role: "vera",
        body: "Aku sudah mengurutkan soal salah dari Tryout SNBT 04 dan Quiz PK Modul 02. Kita akan melihat pola berpikirmu, bukan sekadar mencari jawaban yang benar.",
        createdAt: "Kemarin",
        citations: ["Tryout SNBT 04", "Quiz PK Modul 02"],
      },
    ],
  },
  {
    id: "snbt-analysis",
    title: "Analisis SNBT 04",
    updatedAt: "4 Jul",
    sourceIds: ["tryout-04", "personal-summary"],
    generatedTools: ["analysis", "route"],
    messages: [
      {
        id: "snbt-welcome",
        role: "vera",
        body: "Skor 676 sudah memberi kita cukup data untuk memilih prioritas. Aku akan bantu memisahkan topik yang perlu dikejar dari topik yang cukup dipertahankan.",
        createdAt: "4 Jul",
        citations: ["Tryout SNBT 04", "Rangkuman PK Pribadi"],
      },
    ],
  },
  {
    id: "geometry-practice",
    title: "Latihan Geometri",
    updatedAt: "2 Jul",
    sourceIds: ["geometry-notes"],
    generatedTools: ["drill"],
    messages: [
      {
        id: "geometry-welcome",
        role: "vera",
        body: "Catatan geometri sudah terpasang. Kirim satu soal yang terasa membingungkan, lalu kita petakan konsep mana yang sebenarnya sedang diuji.",
        createdAt: "2 Jul",
        citations: ["Catatan Geometri UTBK"],
      },
    ],
  },
];

function createNewStudySession(): StudySession {
  return {
    id: `session-${Date.now()}`,
    title: "Sesi belajar baru",
    updatedAt: "Baru saja",
    sourceIds: [],
    generatedTools: [],
    messages: [
      {
        id: `new-session-${Date.now()}`,
        role: "vera",
        body: "Sesi baru sudah siap. Tambahkan hasil latihan, materi, atau dokumen supaya aku memahami apa yang sedang ingin kamu pelajari.",
        createdAt: "Baru saja",
      },
    ],
  };
}

const toolRequestLabels: Record<VeraToolId, string> = {
  analysis: "Analisis kelemahanku dari konteks sesi ini.",
  route: "Susun rute belajar dari konteks sesi ini.",
  drill: "Buat drill adaptif dari kelemahanku.",
  review: "Jelaskan jawaban salah yang paling penting.",
  ptn: "Bantu susun strategi PTN dari progresku.",
  summary: "Buat ringkasan sesi belajar ini.",
};

function isToolId(value: string | null): value is VeraToolId {
  return Boolean(
    value &&
      ["analysis", "route", "drill", "review", "ptn", "summary"].includes(
        value,
      ),
  );
}

function moveItemToFront<T extends string>(items: T[], nextItem: T) {
  return [nextItem, ...items.filter((item) => item !== nextItem)];
}

function buildGeneralReply(prompt: string, sourceTitles: string[]) {
  const sourceLine =
    sourceTitles.length > 0
      ? sourceTitles.join(", ")
      : "konteks belajar di sesi ini";
  const loweredPrompt = prompt.toLowerCase();

  if (loweredPrompt.includes("rasio")) {
    return `Dari ${sourceLine}, kesulitannya bukan di konsep perbandingan awal, tetapi saat basis hitung berubah pada langkah kedua. Coba tulis dulu apa yang dianggap 100%, baru ubah rasionya. Setelah itu kita cek satuannya bersama.`;
  }

  if (
    loweredPrompt.includes("salah") ||
    loweredPrompt.includes("jawaban")
  ) {
    return `Aku membaca ${sourceLine}. Pola kesalahan yang paling layak dibahas adalah memilih opsi yang benar secara umum tetapi tidak benar-benar didukung informasi pada soal. Kirim nomor soalnya, lalu kita bedah alasan setiap pilihan.`;
  }

  return `Aku menggunakan ${sourceLine} untuk menjawab ini. Kita bisa memecahnya menjadi satu konsep inti, satu contoh singkat, lalu satu latihan untuk memastikan caramu berpikir sudah konsisten.`;
}

type VeraAiWorkspaceProps = {
  activeArtifact: VeraStudioTool | null;
  activeSession: StudySession;
  contextDialogOpen: boolean;
  contextSources: VeraContextSource[];
  draft: string;
  fullscreenArtifact: VeraStudioTool | null;
  generatedArtifacts: VeraStudioTool[];
  notificationFeed: StudentNotificationFeed;
  onCloseArtifact: () => void;
  onCloseFullscreen: () => void;
  onDraftChange: (value: string) => void;
  onExpandArtifact: (toolId: VeraToolId) => void;
  onGenerateTool: (toolId: VeraToolId) => void;
  onNewSession: () => void;
  onOpenAddContext: () => void;
  onContextDialogOpenChange: (open: boolean) => void;
  onOpenArtifact: (toolId: VeraToolId) => void;
  onRemoveContexts: (sourceIds: string[]) => void;
  onRenameSession: (title: string) => void;
  onSaveContext: (nextSourceIds: string[], addedSources?: VeraContextSource[]) => void;
  onSend: () => void;
  onSelectSession: (sessionId: string) => void;
  onSessionSidebarCollapsedChange: (collapsed: boolean) => void;
  onSetWorkspaceTab: (tab: WorkspaceTab) => void;
  onToggleContext: (sourceId: string, active: boolean) => void;
  selectedSources: VeraContextSource[];
  session: SessionContext;
  sessionSidebarCollapsed: boolean;
  sessions: StudySession[];
  workspaceTab: WorkspaceTab;
};

function VeraAiWorkspace({
  activeArtifact,
  activeSession,
  contextDialogOpen,
  contextSources,
  draft,
  fullscreenArtifact,
  generatedArtifacts,
  notificationFeed,
  onCloseArtifact,
  onCloseFullscreen,
  onDraftChange,
  onExpandArtifact,
  onGenerateTool,
  onNewSession,
  onOpenAddContext,
  onContextDialogOpenChange,
  onOpenArtifact,
  onRemoveContexts,
  onRenameSession,
  onSaveContext,
  onSend,
  onSelectSession,
  onSessionSidebarCollapsedChange,
  onSetWorkspaceTab,
  onToggleContext,
  selectedSources,
  session,
  sessionSidebarCollapsed,
  sessions,
  workspaceTab,
}: VeraAiWorkspaceProps) {
  return (
    <div className="vera-ai-motion min-h-svh bg-primary-50 text-secondary-900 md:h-svh md:overflow-hidden">
      <div className="flex min-h-svh flex-col md:h-svh">
        <VeraTopBar notificationFeed={notificationFeed} session={session} />
        <h1 className="sr-only">
          Vera AI Workspace: {activeSession.title}
        </h1>

        <main className="min-h-0 flex-1 px-2 pb-2 md:px-3 md:pb-3">
          <div className="flex h-full min-h-0 min-w-0 gap-3">
            <aside
              className={cn(
                "sticky top-0 hidden h-full shrink-0 self-start transition-[width] duration-200 md:block",
                sessionSidebarCollapsed ? "w-16" : "w-72",
              )}
            >
              <SessionSidebar
                activeSessionId={activeSession.id}
                collapsed={sessionSidebarCollapsed}
                onNewSession={onNewSession}
                onSetCollapsed={onSessionSidebarCollapsedChange}
                onSelectSession={onSelectSession}
                sessions={sessions}
              />
            </aside>
            <Tabs
              className="min-h-0 min-w-0 flex-1 gap-0"
              onValueChange={(value) => onSetWorkspaceTab(value as WorkspaceTab)}
              value={workspaceTab}
            >
              <WorkspaceTabs onChange={onSetWorkspaceTab} />
              <TabsContent className="min-h-0 min-w-0 overflow-hidden" value="chat">
                <ChatWorkspace
                  activeSession={activeSession}
                  className="flex"
                  draft={draft}
                  onDraftChange={onDraftChange}
                  onRenameSession={onRenameSession}
                  onSend={onSend}
                />
              </TabsContent>
              <TabsContent className="min-h-0 min-w-0 overflow-hidden" value="context">
                <ContextWorkspace
                  activeSourceIds={activeSession.sourceIds}
                  className="flex"
                  key={`${activeSession.id}-${workspaceTab}`}
                  onOpenAddContext={onOpenAddContext}
                  onRemoveContexts={onRemoveContexts}
                  onToggleContext={onToggleContext}
                  sources={contextSources}
                />
              </TabsContent>
              <TabsContent className="min-h-0 min-w-0 overflow-hidden" value="studio">
                <StudioPanel
                  activeArtifact={activeArtifact}
                  className="flex"
                  generatedArtifacts={generatedArtifacts}
                  onCloseArtifact={onCloseArtifact}
                  onExpandArtifact={onExpandArtifact}
                  onGenerateTool={onGenerateTool}
                  onOpenArtifact={onOpenArtifact}
                  selectedSources={selectedSources}
                />
              </TabsContent>
            </Tabs>
          </div>

        </main>
      </div>

      {contextDialogOpen ? (
        <AddContextDialog
          onOpenChange={onContextDialogOpenChange}
          onSave={onSaveContext}
          open
          availableSources={contextSources}
          selectedSourceIds={activeSession.sourceIds}
        />
      ) : null}
      <FullscreenArtifactDialog
        onOpenChange={(open) => {
          if (!open) {
            onCloseFullscreen();
          }
        }}
        open={Boolean(fullscreenArtifact)}
        selectedSources={selectedSources}
        tool={fullscreenArtifact}
      />
    </div>
  );
}

function VeraAiPageModule({ notificationFeed, session }: { notificationFeed: StudentNotificationFeed; session: SessionContext }) {
  const searchParams = useSearchParams();
  const requestedArtifact = searchParams.get("artifact");
  const requestedToolParam = searchParams.get("tool");
  const requestedTool = isToolId(requestedArtifact)
    ? requestedArtifact
    : isToolId(requestedToolParam)
      ? requestedToolParam
      : null;

  const [sessions, setSessions] = useState<StudySession[]>(() =>
    requestedTool
      ? initialSessions.map((item, index) =>
          index === 0
            ? {
                ...item,
                generatedTools: moveItemToFront(
                  item.generatedTools,
                  requestedTool,
                ),
              }
            : item,
        )
      : initialSessions,
  );
  const [activeSessionId, setActiveSessionId] = useState(initialSessions[0].id);
  const [activeArtifactId, setActiveArtifactId] = useState<VeraToolId | null>(
    requestedTool,
  );
  const [contextSources, setContextSources] = useState<VeraContextSource[]>(
    () => {
      const addedSourceIds = new Set(
        initialSessions.flatMap((item) => item.sourceIds),
      );

      return veraContextSources.filter((source) =>
        addedSourceIds.has(source.id),
      );
    },
  );
  const [fullscreenArtifactId, setFullscreenArtifactId] =
    useState<VeraToolId | null>(null);
  const [draft, setDraft] = useState("");
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("chat");
  const [sessionSidebarCollapsed, setSessionSidebarCollapsed] =
    useState(true);

  const activeSession =
    sessions.find((item) => item.id === activeSessionId) ?? sessions[0];
  const activeSourceIdSet = useMemo(
    () => new Set(activeSession.sourceIds),
    [activeSession.sourceIds],
  );

  const selectedSources = useMemo(
    () =>
      contextSources.filter((source) =>
        activeSourceIdSet.has(source.id),
      ),
    [activeSourceIdSet, contextSources],
  );

  const generatedArtifacts = useMemo(
    () =>
      activeSession.generatedTools
        .map((toolId) => veraStudioTools.find((tool) => tool.id === toolId))
        .filter((tool): tool is VeraStudioTool => Boolean(tool)),
    [activeSession.generatedTools],
  );

  const activeArtifact =
    generatedArtifacts.find((tool) => tool.id === activeArtifactId) ?? null;
  const fullscreenArtifact =
    generatedArtifacts.find((tool) => tool.id === fullscreenArtifactId) ?? null;

  function updateActiveSession(
    update: (current: StudySession) => StudySession,
  ) {
    setSessions((current) =>
      current.map((item) =>
        item.id === activeSession.id ? update(item) : item,
      ),
    );
  }

  function handleSelectSession(nextSessionId: string) {
    setActiveSessionId(nextSessionId);
    setActiveArtifactId(null);
    setDraft("");
    setWorkspaceTab("chat");
  }

  function handleNewSession() {
    const nextSession = createNewStudySession();

    setSessions((current) => [nextSession, ...current]);
    setActiveSessionId(nextSession.id);
    setActiveArtifactId(null);
    setWorkspaceTab("chat");
  }

  function handleRenameSession(nextTitle: string) {
    const title = nextTitle.trim();

    if (!title || title === activeSession.title) {
      return;
    }

    updateActiveSession((current) => ({
      ...current,
      title,
      updatedAt: "Baru saja",
    }));
  }

  function handleSaveContext(
    nextSourceIds: string[],
    addedSources: VeraContextSource[] = [],
  ) {
    const limitedSourceIds = nextSourceIds.slice(
      0,
      MAX_CONTEXTS_PER_SESSION,
    );

    if (addedSources.length > 0) {
      setContextSources((current) => {
        const existingIds = new Set(current.map((source) => source.id));

        return [
          ...current,
          ...addedSources.filter((source) => !existingIds.has(source.id)),
        ];
      });
    }

    updateActiveSession((current) => ({
      ...current,
      sourceIds: limitedSourceIds,
      updatedAt: "Baru saja",
    }));
    setContextDialogOpen(false);
  }

  function handleRemoveContexts(sourceIds: string[]) {
    const removedSourceIds = new Set(sourceIds);

    setContextSources((current) =>
      current.filter((source) => !removedSourceIds.has(source.id)),
    );
    setSessions((current) =>
      current.map((item) => {
        const nextSourceIds = item.sourceIds.filter(
          (sourceId) => !removedSourceIds.has(sourceId),
        );

        return nextSourceIds.length === item.sourceIds.length
          ? item
          : {
              ...item,
              sourceIds: nextSourceIds,
              updatedAt: "Baru saja",
            };
      }),
    );
  }

  function handleToggleContext(sourceId: string, active: boolean) {
    updateActiveSession((current) => {
      if (!active) {
        return {
          ...current,
          sourceIds: current.sourceIds.filter((id) => id !== sourceId),
          updatedAt: "Baru saja",
        };
      }

      if (
        current.sourceIds.includes(sourceId) ||
        current.sourceIds.length >= MAX_CONTEXTS_PER_SESSION
      ) {
        return current;
      }

      return {
        ...current,
        sourceIds: [...current.sourceIds, sourceId],
        updatedAt: "Baru saja",
      };
    });
  }

  function handleSend() {
    const nextDraft = draft.trim();

    if (!nextDraft) {
      return;
    }

    const citations = selectedSources.slice(0, 3).map((source) => source.title);

    updateActiveSession((current) => ({
      ...current,
      updatedAt: "Baru saja",
      messages: [
        ...current.messages,
        {
          id: `student-${Date.now()}`,
          role: "student",
          body: nextDraft,
          createdAt: "Sekarang",
        },
        {
          id: `vera-${Date.now()}`,
          role: "vera",
          body: buildGeneralReply(nextDraft, citations),
          createdAt: "Sekarang",
          citations,
        },
      ],
    }));
    setDraft("");
  }

  function handleToolRequest(toolId: VeraToolId) {
    const tool = veraStudioTools.find((item) => item.id === toolId);

    if (!tool) {
      return;
    }

    const citations = selectedSources.slice(0, 3).map((source) => source.title);
    updateActiveSession((current) => ({
      ...current,
      generatedTools: moveItemToFront(current.generatedTools, toolId),
      updatedAt: "Baru saja",
      messages: [
        ...current.messages,
        {
          id: `student-tool-${Date.now()}`,
          role: "student",
          body: toolRequestLabels[toolId],
          createdAt: "Sekarang",
        },
        {
          id: `vera-tool-${Date.now()}`,
          role: "vera",
          body: `${tool.outputTitle} sudah aku siapkan di Vera Studio. Hasilnya tersimpan di sesi ini, jadi kamu bisa kembali membacanya kapan saja.`,
          createdAt: "Sekarang",
          citations,
        },
      ],
    }));
    setActiveArtifactId(toolId);
    setWorkspaceTab("studio");
  }

  function handleOpenArtifact(toolId: VeraToolId) {
    setActiveArtifactId(toolId);
    setWorkspaceTab("studio");
  }

  return (
    <VeraAiWorkspace
      activeArtifact={activeArtifact}
      activeSession={activeSession}
      contextDialogOpen={contextDialogOpen}
      contextSources={contextSources}
      draft={draft}
      fullscreenArtifact={fullscreenArtifact}
      generatedArtifacts={generatedArtifacts}
      notificationFeed={notificationFeed}
      onCloseArtifact={() => setActiveArtifactId(null)}
      onCloseFullscreen={() => setFullscreenArtifactId(null)}
      onContextDialogOpenChange={setContextDialogOpen}
      onDraftChange={setDraft}
      onExpandArtifact={setFullscreenArtifactId}
      onGenerateTool={handleToolRequest}
      onNewSession={handleNewSession}
      onOpenAddContext={() => setContextDialogOpen(true)}
      onOpenArtifact={handleOpenArtifact}
      onRemoveContexts={handleRemoveContexts}
      onRenameSession={handleRenameSession}
      onSaveContext={handleSaveContext}
      onSend={handleSend}
      onSelectSession={handleSelectSession}
      onSessionSidebarCollapsedChange={setSessionSidebarCollapsed}
      onSetWorkspaceTab={setWorkspaceTab}
      onToggleContext={handleToggleContext}
      selectedSources={selectedSources}
      session={session}
      sessionSidebarCollapsed={sessionSidebarCollapsed}
      sessions={sessions}
      workspaceTab={workspaceTab}
    />
  );
}

function VeraTopBar({
  notificationFeed,
  session,
}: {
  notificationFeed: StudentNotificationFeed;
  session: SessionContext;
}) {
  return (
    <header className="flex min-h-18 items-center gap-3 px-3 py-3 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          aria-label="Vecalss dashboard"
          className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-85"
          href="/dashboard"
        >
          <Image
            alt="Vecalss"
            className="h-7 w-auto object-contain md:h-8"
            height={42}
            priority
            src="/brand/logo-mark-cropped.png"
            width={52}
          />
          <span
            className="hidden text-[1.45rem] leading-none tracking-[0.04em] text-primary-800 sm:inline"
            style={{ fontFamily: "var(--font-sports-world)" }}
          >
            VECALSS
          </span>
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          aria-label="Ke dashboard"
          className="rounded-full border border-primary-100 bg-white shadow-sm"
          nativeButton={false}
          render={<Link href="/dashboard" />}
          size="icon-sm"
          variant="ghost"
        >
          <House />
        </Button>
        <div className="flex items-center gap-1.5 rounded-full border border-primary-100 bg-white px-1.5 py-1 shadow-sm">
          <VeraUsagePopover />
          <StudentNotificationPopover items={notificationFeed.items} unreadCount={notificationFeed.unreadCount} />
          <StudentAccountMenu extraItem="notifications" session={session} />
        </div>
      </div>
    </header>
  );
}

function VeraUsagePopover() {
  const usagePercent = Math.round(
    (DAILY_TOKEN_USAGE / DAILY_TOKEN_LIMIT) * 100,
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={`Penggunaan Vera ${usagePercent} persen`}
            className="rounded-full px-2.5"
            size="sm"
            variant="ghost"
          />
        }
      >
        <Gauge data-icon="inline-start" />
        <span className="hidden text-xs tabular-nums sm:inline">
          {usagePercent}%
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" sideOffset={10}>
        <PopoverHeader>
          <PopoverTitle>Penggunaan Vera</PopoverTitle>
          <PopoverDescription>
            Batas penggunaan diperbarui setiap hari.
          </PopoverDescription>
        </PopoverHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-secondary-800">Token hari ini</span>
            <span className="tabular-nums text-secondary-500">
              {DAILY_TOKEN_USAGE.toLocaleString("id-ID")} /{" "}
              {DAILY_TOKEN_LIMIT.toLocaleString("id-ID")}
            </span>
          </div>
          <Progress aria-label="Penggunaan token Vera" value={usagePercent} />
          <p className="text-xs text-secondary-400">Reset pukul 00.00 WIB</p>
        </div>

      </PopoverContent>
    </Popover>
  );
}

function WorkspaceTabs({
  onChange,
}: {
  onChange: (value: WorkspaceTab) => void;
}) {
  return (
    <div className="mb-2 md:mb-3">
      <FullWidthLineTabsList
        aria-label="Area kerja Vera"
      >
        <FullWidthLineTabsTrigger
          onClick={() => onChange("chat")}
          value="chat"
        >
          <MessageCircleMore data-icon="inline-start" />
          Percakapan
        </FullWidthLineTabsTrigger>
        <FullWidthLineTabsTrigger
          onClick={() => onChange("context")}
          value="context"
        >
          <LibraryBig data-icon="inline-start" />
          Konteks
        </FullWidthLineTabsTrigger>
        <FullWidthLineTabsTrigger
          onClick={() => onChange("studio")}
          value="studio"
        >
          <Sparkles data-icon="inline-start" />
          Studio
        </FullWidthLineTabsTrigger>
      </FullWidthLineTabsList>
    </div>
  );
}

function SessionSidebar({
  activeSessionId,
  collapsed,
  onNewSession,
  onSelectSession,
  onSetCollapsed,
  sessions,
}: {
  activeSessionId: string;
  collapsed: boolean;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onSetCollapsed: (collapsed: boolean) => void;
  sessions: StudySession[];
}) {
  if (!collapsed) {
    return (
      <SessionPanel
        activeSessionId={activeSessionId}
        className="flex"
        onCollapse={() => onSetCollapsed(true)}
        onNewSession={onNewSession}
        onSelectSession={onSelectSession}
        sessions={sessions}
      />
    );
  }

  return (
    <nav
      aria-label="Sidebar sesi Vera"
      className="flex h-full flex-col items-center rounded-[1.65rem] border border-primary-100 bg-white py-3 shadow-[0_18px_54px_-46px_rgba(1,76,56,0.42)]"
    >
      <button
        aria-label="Buka sidebar sesi"
        className="flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40"
        onClick={() => onSetCollapsed(false)}
        title="Buka sidebar sesi"
        type="button"
      >
        <PanelLeftOpen className="size-4" />
      </button>

      <div className="mt-7 flex flex-col items-center gap-2">
        <Button
          aria-label="Buat sesi belajar baru"
          className="rounded-xl"
          onClick={onNewSession}
          size="icon-sm"
          title="Sesi baru"
          variant="ghost"
        >
          <Plus />
        </Button>
        <Button
          aria-label="Buka percakapan"
          className="rounded-xl"
          onClick={() => onSetCollapsed(false)}
          size="icon-sm"
          title="Daftar percakapan"
          variant="ghost"
        >
          <MessageCircleMore />
        </Button>
      </div>
    </nav>
  );
}

function SessionPanel({
  activeSessionId,
  className,
  onCollapse,
  onNewSession,
  onSelectSession,
  sessions,
}: {
  activeSessionId: string;
  className?: string;
  onCollapse?: () => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  sessions: StudySession[];
}) {
  return (
    <WorkspacePanel className={className}>
      <PanelHeader
        action={
          <div className="flex items-center gap-1">
            <Button
              aria-label="Buat sesi belajar baru"
              className="rounded-full"
              onClick={onNewSession}
              size="icon-sm"
              variant="ghost"
            >
              <Plus />
            </Button>
            {onCollapse ? (
              <Button
                aria-label="Minimalkan sidebar sesi"
                className="rounded-full"
                onClick={onCollapse}
                size="icon-sm"
                variant="ghost"
              >
                <PanelLeftClose />
              </Button>
            ) : null}
          </div>
        }
        title="Sesi Belajar"
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <div className="flex flex-col gap-1.5">
          {sessions.map((item) => {
            const active = item.id === activeSessionId;

            return (
              <button
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40",
                  active
                    ? "border-primary-200 bg-primary-50 text-primary-950"
                    : "border-transparent bg-transparent hover:border-primary-100 hover:bg-white",
                )}
                key={item.id}
                onClick={() => onSelectSession(item.id)}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {item.title}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-secondary-400">
                  {item.updatedAt}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </WorkspacePanel>
  );
}

function ChatWorkspace({
  activeSession,
  className,
  draft,
  onDraftChange,
  onRenameSession,
  onSend,
}: {
  activeSession: StudySession;
  className?: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onRenameSession: (title: string) => void;
  onSend: () => void;
}) {
  return (
    <WorkspacePanel className={className}>
      <PanelHeader
        title={
          <EditableSessionTitle
            key={activeSession.id}
            onSave={onRenameSession}
            title={activeSession.title}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-7 px-4 py-7 md:px-5 md:py-8">
          {activeSession.messages.map((message, index) => (
            <MessageCard index={index} key={message.id} message={message} />
          ))}
        </div>
      </div>

      <ChatComposer
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={onSend}
      />
    </WorkspacePanel>
  );
}

const contextTypeLabels: Record<VeraContextTypeId, string> = {
  practice: "Hasil latihan",
  material: "Materi",
  document: "Dokumen",
};

function contextMetadataForSource(source: VeraContextSource) {
  if (source.type === "practice") {
    const practice = veraPracticeHistory.find(
      (item) => item.title === source.title,
    );

    return practice
      ? `${practice.meta.replace(/^Selesai\s*/, "")} • ${practice.result}`
      : "Riwayat latihan";
  }

  if (source.type === "material") {
    const material = veraMaterialHistory.find(
      (item) => item.title === source.title,
    );

    return material
      ? `${material.topic} • ${material.lastAccessed}`
      : "Materi belajar";
  }

  return source.id.startsWith("uploaded-")
    ? "Dokumen tambahan"
    : "Dokumen pribadi";
}

function ContextWorkspace({
  activeSourceIds,
  className,
  onOpenAddContext,
  onRemoveContexts,
  onToggleContext,
  sources,
}: {
  activeSourceIds: string[];
  className?: string;
  onOpenAddContext: () => void;
  onRemoveContexts: (sourceIds: string[]) => void;
  onToggleContext: (sourceId: string, active: boolean) => void;
  sources: VeraContextSource[];
}) {
  const [query, setQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingRemovalIds, setPendingRemovalIds] = useState<string[]>([]);
  const [initialActiveSourceIdSet] = useState(
    () => new Set(activeSourceIds),
  );
  const activeSourceIdSet = useMemo(
    () => new Set(activeSourceIds),
    [activeSourceIds],
  );
  const orderedSources = useMemo(
    () =>
      [...sources].sort(
        (first, second) =>
          Number(initialActiveSourceIdSet.has(second.id)) -
          Number(initialActiveSourceIdSet.has(first.id)),
      ),
    [initialActiveSourceIdSet, sources],
  );
  const filteredSources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return orderedSources;
    }

    return orderedSources
      .filter((source) =>
        [
          source.title,
          contextTypeLabels[source.type],
          contextMetadataForSource(source),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
  }, [orderedSources, query]);
  const activeCount = activeSourceIds.length;
  const limitReached = activeCount >= MAX_CONTEXTS_PER_SESSION;
  const selectedCount = selectedSourceIds.size;
  const visibleSourceIds = filteredSources.map((source) => source.id);
  const allVisibleSelected =
    visibleSourceIds.length > 0 &&
    visibleSourceIds.every((sourceId) => selectedSourceIds.has(sourceId));
  const someVisibleSelected = visibleSourceIds.some((sourceId) =>
    selectedSourceIds.has(sourceId),
  );

  function toggleSelection(sourceId: string, checked: boolean) {
    setSelectedSourceIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(sourceId);
      } else {
        next.delete(sourceId);
      }

      return next;
    });
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedSourceIds((current) => {
      const next = new Set(current);

      visibleSourceIds.forEach((sourceId) => {
        if (checked) {
          next.add(sourceId);
        } else {
          next.delete(sourceId);
        }
      });

      return next;
    });
  }

  function requestRemoval(sourceIds: string[]) {
    if (sourceIds.length > 0) {
      setPendingRemovalIds(sourceIds);
    }
  }

  function confirmRemoval() {
    onRemoveContexts(pendingRemovalIds);
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      pendingRemovalIds.forEach((sourceId) => next.delete(sourceId));
      return next;
    });
    setPendingRemovalIds([]);
  }

  return (
    <>
      <WorkspacePanel className={className}>
        <PanelHeader
          action={
            <div className="flex items-center gap-2">
              <Button
                aria-label={
                  selectionMode
                    ? "Batal memilih konteks"
                    : "Pilih konteks untuk dihapus"
                }
                className="rounded-full"
                onClick={() => {
                  setSelectionMode((current) => !current);
                  setSelectedSourceIds(new Set());
                }}
                size="sm"
                variant="brandOutline"
              >
                {selectionMode ? <X data-icon="inline-start" /> : <ListChecks data-icon="inline-start" />}
                <span className="hidden sm:inline">
                  {selectionMode ? "Batal" : "Pilih"}
                </span>
              </Button>
              <Button
                aria-label="Tambah konteks"
                className="rounded-full"
                onClick={onOpenAddContext}
                size="sm"
                variant="brand"
              >
                <Plus data-icon="inline-start" />
                <span className="hidden sm:inline">Tambah konteks</span>
              </Button>
            </div>
          }
          title="Konteks belajar"
        />

        <div className="min-h-0 flex-1 overflow-y-auto bg-primary-50/25">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:gap-6 md:p-6 lg:p-8">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-secondary-400"
              />
              <Input
                aria-label="Cari konteks belajar"
                className="h-11 rounded-2xl border-primary-100 bg-white pl-11 text-sm placeholder:text-secondary-400 focus-visible:border-primary-300 focus-visible:ring-primary-200/70"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari judul, tipe, atau topik konteks..."
                value={query}
              />
            </div>

            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-secondary-500">Maks. 6 konteks</p>
              {limitReached ? (
                <p className="text-xs font-medium text-primary-700">
                  Batas aktif tercapai. Nonaktifkan satu untuk mengganti.
                </p>
              ) : null}
            </div>

            {selectionMode ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary-100 bg-white px-3 py-2.5">
                <Checkbox
                  aria-label="Pilih semua konteks yang terlihat"
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected && !allVisibleSelected}
                  onCheckedChange={(checked) =>
                    toggleVisibleSelection(checked === true)
                  }
                />
                <span className="text-sm font-semibold text-secondary-800">
                  Semua yang terlihat
                </span>
                <span
                  aria-live="polite"
                  className="text-xs font-medium text-secondary-500"
                >
                  {selectedCount} dipilih
                </span>
                <Button
                  className="ml-auto rounded-full"
                  disabled={selectedCount === 0}
                  onClick={() => requestRemoval([...selectedSourceIds])}
                  size="sm"
                  variant="destructive"
                >
                  <Trash2 data-icon="inline-start" />
                  Hapus dipilih
                </Button>
              </div>
            ) : null}

            {filteredSources.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredSources.map((source) => {
                  const active = activeSourceIdSet.has(source.id);

                  return (
                    <ContextCard
                      active={active}
                      activationDisabled={limitReached && !active}
                      key={source.id}
                      onRemove={() => requestRemoval([source.id])}
                      onSelect={(checked) => toggleSelection(source.id, checked)}
                      onToggle={(nextActive) =>
                        onToggleContext(source.id, nextActive)
                      }
                      selectable={selectionMode}
                      selected={selectedSourceIds.has(source.id)}
                      source={source}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-primary-200 bg-white px-6 py-10 text-center">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                  <Search className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-3 text-sm font-semibold text-secondary-900">
                  Konteks tidak ditemukan
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-secondary-500">
                  Coba kata kunci lain atau tambahkan dokumen baru ke perpustakaan
                  konteksmu.
                </p>
              </div>
            )}
          </div>
        </div>
      </WorkspacePanel>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemovalIds([]);
          }
        }}
        open={pendingRemovalIds.length > 0}
      >
        <AlertDialogContent size="sm" variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger"><Trash2 /></AlertDialogMedia>
            <AlertDialogTitle>
              {pendingRemovalIds.length === 1
                ? "Hapus konteks ini?"
                : `Hapus ${pendingRemovalIds.length} konteks?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Konteks akan dihapus dari perpustakaan dan dilepas dari sesi belajar
              yang menggunakannya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setPendingRemovalIds([])}
            >
              Batal
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoval} variant="destructive">
              <Trash2 data-icon="inline-start" />
              Hapus konteks
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ContextCard({
  active,
  activationDisabled,
  onRemove,
  onSelect,
  onToggle,
  selectable,
  selected,
  source,
}: {
  active: boolean;
  activationDisabled: boolean;
  onRemove: () => void;
  onSelect: (checked: boolean) => void;
  onToggle: (active: boolean) => void;
  selectable: boolean;
  selected: boolean;
  source: VeraContextSource;
}) {
  const Icon = contextTypeIcons[source.type];

  return (
    <article
      className={cn(
        "flex min-h-20 items-center gap-3 rounded-2xl border bg-white p-3 transition-[border-color,background-color,box-shadow] duration-200 md:gap-3",
        active
          ? "border-primary-300 bg-primary-50/45 shadow-[0_14px_30px_-28px_rgba(1,76,56,0.75)]"
          : "border-primary-100 hover:border-primary-200 hover:bg-primary-50/20",
        activationDisabled && "opacity-65",
      )}
    >
      {selectable ? (
        <Checkbox
          aria-label={`Pilih ${source.title} untuk dihapus`}
          checked={selected}
          onCheckedChange={(checked) => onSelect(checked === true)}
        />
      ) : null}
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800 md:size-10">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-secondary-950 md:text-base">
            {source.title}
          </span>
          <StudentBadge size="xs" tone="category">
            {contextTypeLabels[source.type]}
          </StudentBadge>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Button
          aria-label={`Hapus ${source.title}`}
          className="text-secondary-400 hover:text-destructive"
          onClick={onRemove}
          size="icon-xs"
          title={`Hapus ${source.title}`}
          variant="ghost"
        >
          <Trash2 />
        </Button>
        <Switch
          aria-label={`${active ? "Nonaktifkan" : "Aktifkan"} ${source.title}`}
          checked={active}
          disabled={activationDisabled}
          onCheckedChange={onToggle}
        />
      </span>
    </article>
  );
}

function EditableSessionTitle({
  onSave,
  title,
}: {
  onSave: (title: string) => void;
  title: string;
}) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [editing, setEditing] = useState(false);

  function save() {
    onSave(draftTitle);
    setEditing(false);
  }

  if (editing) {
    return (
      <span
        className="flex min-w-0 items-center"
      >
        <Input
          aria-label="Judul sesi belajar"
          autoFocus
          className="h-8 min-w-40 px-2 text-sm font-semibold"
          onBlur={save}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          value={draftTitle}
        />
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate">{title}</span>
      <Button
        aria-label={`Ubah judul sesi ${title}`}
        className="shrink-0 rounded-full"
        onClick={() => setEditing(true)}
        size="icon-xs"
        variant="ghost"
      >
        <Pencil />
      </Button>
    </span>
  );
}

function MessageCard({
  index,
  message,
}: {
  index: number;
  message: VeraMessage;
}) {
  const isStudent = message.role === "student";

  if (isStudent) {
    return (
      <Bubble
        align="end"
        className="vera-message-in vera-message-in--student max-w-[84%]"
        style={{ animationDelay: `${Math.min(index, 4) * 70}ms` }}
      >
        <BubbleContent className="rounded-[1.35rem] rounded-br-md px-4 py-3 leading-6 shadow-[0_12px_28px_-22px_rgba(1,76,56,0.7)]">
          <p>{message.body}</p>
          <p className="mt-1.5 text-right text-[11px] text-white/60">
            {message.createdAt}
          </p>
        </BubbleContent>
      </Bubble>
    );
  }

  return (
    <article
      className="vera-message-in flex items-start gap-3.5"
      style={{ animationDelay: `${Math.min(index, 4) * 70}ms` }}
    >
      <span className="vera-avatar-arrive flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary-100 bg-white shadow-sm">
        <Image
          alt=""
          aria-hidden="true"
          className="size-10 object-contain"
          height={40}
          src="/brand/mascot-vecalss.png"
          width={40}
        />
      </span>
      <Bubble className="max-w-full flex-1 pt-0.5" variant="ghost">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-secondary-950">Vera</p>
          <p className="text-xs text-secondary-400">{message.createdAt}</p>
        </div>
        <BubbleContent className="mt-2 max-w-[68ch] text-[0.95rem] leading-7 text-secondary-700">
          <p>{message.body}</p>
        </BubbleContent>
        {message.citations && message.citations.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.citations.map((citation) => (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50/70 px-2.5 py-1 text-xs font-medium text-primary-800"
                key={citation}
              >
                <FileText className="size-3" aria-hidden="true" />
                {citation}
              </span>
            ))}
          </div>
        ) : null}
      </Bubble>
    </article>
  );
}

function ChatComposer({
  draft,
  onDraftChange,
  onSend,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="border-t border-primary-100 bg-white px-3 py-3 md:px-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <div className="flex items-center gap-2 rounded-[1.4rem] border border-primary-200 bg-white p-2 shadow-[0_12px_34px_-28px_rgba(1,76,56,0.65)] transition-shadow focus-within:shadow-[0_16px_38px_-28px_rgba(1,76,56,0.8)]">
          <Input
            aria-label="Tanyakan sesuatu kepada Vera"
            className="h-10 min-w-0 flex-1 border-transparent bg-transparent px-2 text-base text-secondary-900 placeholder:text-secondary-400 focus-visible:border-transparent focus-visible:ring-0"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Tanyakan konsep, soal, atau langkah belajarmu..."
            value={draft}
          />
          <Button
            aria-label="Kirim pertanyaan ke Vera"
            className="rounded-full"
            disabled={!draft.trim()}
            size="icon-sm"
            type="submit"
            variant="brand"
          >
            <SendHorizontal />
          </Button>
        </div>
      </form>
    </div>
  );
}

function StudioPanel({
  activeArtifact,
  className,
  generatedArtifacts,
  onCloseArtifact,
  onExpandArtifact,
  onGenerateTool,
  onOpenArtifact,
  selectedSources,
}: {
  activeArtifact: VeraStudioTool | null;
  className?: string;
  generatedArtifacts: VeraStudioTool[];
  onCloseArtifact: () => void;
  onExpandArtifact: (toolId: VeraToolId) => void;
  onGenerateTool: (toolId: VeraToolId) => void;
  onOpenArtifact: (toolId: VeraToolId) => void;
  selectedSources: VeraContextSource[];
}) {
  if (activeArtifact) {
    return (
      <WorkspacePanel className={className}>
        <PanelHeader
          action={
            <Button
              aria-label="Perbesar dokumen"
              className="rounded-full"
              onClick={() => onExpandArtifact(activeArtifact.id)}
              size="icon-sm"
              variant="ghost"
            >
              <Maximize2 />
            </Button>
          }
          backAction={onCloseArtifact}
          title="Vera Studio"
        />
        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-3">
          <StudioArtifactDocument
            compact
            key={activeArtifact.id}
            selectedSources={selectedSources}
            tool={activeArtifact}
          />
        </div>
      </WorkspacePanel>
    );
  }

  return (
    <WorkspacePanel className={className}>
      <PanelHeader title="Vera Studio" />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <section>
          <SectionLabel label="Alat belajar" />
          <div className="mt-2 flex flex-col gap-1.5">
            {studioToolIds.map((toolId) => {
              const tool = veraStudioTools.find((item) => item.id === toolId);

              if (!tool) {
                return null;
              }

              return (
                <StudioToolRow
                  key={tool.id}
                  onGenerate={() => onGenerateTool(tool.id)}
                  tool={tool}
                />
              );
            })}
          </div>
        </section>

        <section className="mt-6 border-t border-primary-100 pt-5">
          <div className="flex items-center justify-between gap-2 px-1">
            <SectionLabel label="Hasil terbaru" />
            <span className="text-[11px] text-secondary-400">
              {generatedArtifacts.length} tersimpan
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {generatedArtifacts.length > 0 ? (
              generatedArtifacts.map((tool, index) => (
                <StudioArtifactCard
                  index={index}
                  key={tool.id}
                  onOpen={() => onOpenArtifact(tool.id)}
                  tool={tool}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/50 p-4 text-center">
                <Sparkles className="mx-auto size-5 text-primary-600" />
                <p className="mt-2 text-sm font-semibold text-secondary-800">
                  Belum ada hasil
                </p>
                <p className="mt-1 text-xs leading-5 text-secondary-400">
                  Pilih alat belajar di atas. Hasilnya akan tersimpan di sesi ini.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </WorkspacePanel>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-1 text-[11px] font-semibold tracking-[0.13em] text-secondary-500 uppercase">
      {label}
    </p>
  );
}

function StudioToolRow({
  onGenerate,
  tool,
}: {
  onGenerate: () => void;
  tool: VeraStudioTool;
}) {
  const Icon = toolIcons[tool.id];

  return (
    <button
      className="group flex min-h-14 w-full items-center gap-3 rounded-2xl border border-transparent px-2.5 py-2 text-left transition-[border-color,background-color] duration-200 hover:border-primary-100 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40"
      onClick={onGenerate}
      type="button"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-white text-primary-700 transition-transform duration-200 group-hover:-translate-y-0.5">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-secondary-900">
          {tool.title}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-primary-400 transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}

function StudioArtifactCard({
  index,
  onOpen,
  tool,
}: {
  index: number;
  onOpen: () => void;
  tool: VeraStudioTool;
}) {
  const Icon = toolIcons[tool.id];

  return (
    <button
      className="vera-studio-card-in group w-full rounded-2xl border border-primary-100 bg-white p-3 text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_16px_34px_-28px_rgba(1,76,56,0.62)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40"
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index, 3) * 80}ms` }}
      type="button"
    >
      <span className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-5 text-secondary-900">
            {tool.outputTitle}
          </span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-secondary-500">
            {tool.outputBody}
          </span>
          <span className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary-700">
            Buka dokumen
            <ArrowUpRight className="size-3" />
          </span>
        </span>
      </span>
    </button>
  );
}

function StudioArtifactDocument({
  compact = false,
  selectedSources,
  tool,
}: {
  compact?: boolean;
  selectedSources: VeraContextSource[];
  tool: VeraStudioTool;
}) {
  const mode = veraToolModes[tool.id];
  const Icon = toolIcons[tool.id];
  const markdown = buildStudioArtifactMarkdown(tool, mode, selectedSources);

  return (
    <article
      className={cn(
        "vera-studio-document mx-auto min-h-full bg-white",
        compact
          ? "p-4"
          : "max-w-4xl py-2 md:py-4",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>

      <StudioArtifactMarkdown compact={compact} content={markdown} />
    </article>
  );
}

function buildStudioArtifactMarkdown(
  tool: VeraStudioTool,
  mode: (typeof veraToolModes)[VeraToolId],
  selectedSources: VeraContextSource[],
) {
  const metrics = mode.metrics
    .map((metric) => {
      const value =
        metric.label === "Sumber" && metric.value.includes("konteks")
          ? `${selectedSources.length} konteks`
          : metric.value;

      return `**${metric.label}:** ${value}`;
    })
    .join("  \n");
  const highlights = mode.highlights.map((highlight) => `- ${highlight}`).join("\n");
  const sources = selectedSources.length
    ? selectedSources.map((source) => `- ${source.title}`).join("\n")
    : "_Tanpa konteks terpasang_";

  return [
    `# ${tool.outputTitle}`,
    tool.outputBody,
    metrics,
    "## Apa yang Vera lihat",
    mode.description,
    "## Temuan utama",
    highlights,
    "## Konteks yang digunakan",
    sources,
  ].join("\n\n");
}

function StudioArtifactMarkdown({
  compact,
  content,
}: {
  compact: boolean;
  content: string;
}) {
  const components: Components = {
    h1: ({ children }) => (
      <h1
        className={cn(
          "mt-5 font-heading font-semibold tracking-[-0.025em] text-secondary-950",
          compact ? "text-xl leading-7" : "text-3xl leading-tight",
        )}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-8 text-[11px] font-semibold tracking-[0.12em] text-secondary-500 uppercase">
        {children}
      </h2>
    ),
    hr: () => <hr className="my-5 border-primary-100" />,
    li: ({ children }) => (
      <li className="leading-7 text-secondary-700">{children}</li>
    ),
    ol: ({ children }) => (
      <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-secondary-700">
        {children}
      </ol>
    ),
    p: ({ children }) => (
      <p
        className={cn(
          "mt-3 text-secondary-700",
          compact ? "text-sm leading-6" : "text-base leading-7",
        )}
      >
        {children}
      </p>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-secondary-900">{children}</strong>
    ),
    ul: ({ children }) => (
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-secondary-700">
        {children}
      </ul>
    ),
  };

  return (
    <ReactMarkdown components={components}>{content}</ReactMarkdown>
  );
}

function FullscreenArtifactDialog({
  onOpenChange,
  open,
  selectedSources,
  tool,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedSources: VeraContextSource[];
  tool: VeraStudioTool | null;
}) {
  if (!tool) {
    return null;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="inset-3 left-3 top-3 h-[calc(100svh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-[2rem] border border-primary-100 bg-white p-0 sm:max-w-none"
        showCloseButton={false}
        variant="info"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{tool.outputTitle}</DialogTitle>
          <DialogDescription>
            Dokumen belajar yang dihasilkan Vera Studio.
          </DialogDescription>
        </DialogHeader>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-primary-100 bg-white px-4 py-3 md:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-secondary-900">
                {tool.outputTitle}
              </p>
            </div>
            <Button
              aria-label="Tutup Vera Studio"
              className="rounded-full border-0"
              onClick={() => onOpenChange(false)}
              size="icon-sm"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-3 py-4 md:px-8 md:py-8">
            <StudioArtifactDocument
              selectedSources={selectedSources}
              tool={tool}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddContextDialog({
  availableSources,
  onOpenChange,
  onSave,
  open,
  selectedSourceIds,
}: {
  availableSources: VeraContextSource[];
  onOpenChange: (open: boolean) => void;
  onSave: (
    sourceIds: string[],
    addedSources?: VeraContextSource[],
  ) => void;
  open: boolean;
  selectedSourceIds: string[];
}) {
  const [draftSourceIds, setDraftSourceIds] = useState(selectedSourceIds);
  const [pendingAddedSourceIds, setPendingAddedSourceIds] = useState<
    Set<string>
  >(() => new Set());
  const [activeTab, setActiveTab] =
    useState<VeraContextTypeId>("practice");
  const [materialQuery, setMaterialQuery] = useState("");
  const [practicePage, setPracticePage] = useState(1);
  const [materialPage, setMaterialPage] = useState(1);
  const selectedSourceIdSet = useMemo(
    () => new Set(selectedSourceIds),
    [selectedSourceIds],
  );
  const existingUploadedSource = availableSources.find(
    (source) =>
      selectedSourceIdSet.has(source.id) &&
      (source.id === "external-notes" || source.id.startsWith("uploaded-")),
  );
  const [uploadedSource, setUploadedSource] =
    useState<VeraContextSource | null>(existingUploadedSource ?? null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(
    existingUploadedSource?.title ?? null,
  );
  const availableSourceIdSet = useMemo(
    () => new Set(availableSources.map((source) => source.id)),
    [availableSources],
  );
  const availablePracticeItems = useMemo(
    () =>
      veraPracticeHistory.filter((item) => {
        const source = sourceForTitle(item.title);
        return source && !availableSourceIdSet.has(source.id);
      }),
    [availableSourceIdSet],
  );

  const filteredMaterials = useMemo(() => {
    const query = materialQuery.trim().toLowerCase();
    const availableMaterials = veraMaterialHistory.filter((item) => {
      const source = sourceForTitle(item.title);
      return source && !availableSourceIdSet.has(source.id);
    });

    if (!query) {
      return availableMaterials;
    }

    return availableMaterials.filter((material) =>
      [material.title, material.kind, material.topic]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [availableSourceIdSet, materialQuery]);

  const practicePageCount = Math.max(
    1,
    Math.ceil(availablePracticeItems.length / CONTEXT_PAGE_SIZE),
  );
  const materialPageCount = Math.max(
    1,
    Math.ceil(filteredMaterials.length / CONTEXT_PAGE_SIZE),
  );
  const visiblePracticeItems = availablePracticeItems.slice(
    (practicePage - 1) * CONTEXT_PAGE_SIZE,
    practicePage * CONTEXT_PAGE_SIZE,
  );
  const visibleMaterialItems = filteredMaterials.slice(
    (materialPage - 1) * CONTEXT_PAGE_SIZE,
    materialPage * CONTEXT_PAGE_SIZE,
  );
  const limitReached = draftSourceIds.length >= MAX_CONTEXTS_PER_SESSION;
  const draftSourceIdSet = useMemo(
    () => new Set(draftSourceIds),
    [draftSourceIds],
  );
  const pendingAddedSourceIdSet = useMemo(
    () => new Set(pendingAddedSourceIds),
    [pendingAddedSourceIds],
  );
  const pendingInactiveCount = [...pendingAddedSourceIdSet].filter(
    (sourceId) => !draftSourceIdSet.has(sourceId),
  ).length;

  function toggleSource(sourceId: string) {
    const isAlreadyActive = draftSourceIdSet.has(sourceId);
    const isPendingAddition = pendingAddedSourceIdSet.has(sourceId);

    if (isAlreadyActive || isPendingAddition) {
      setPendingAddedSourceIds((current) => {
        const next = new Set(current);
        next.delete(sourceId);
        return next;
      });
      setDraftSourceIds((current) => {
        const next = current.filter((id) => id !== sourceId);
        const nextIdSet = new Set(next);
        const replacement = [...pendingAddedSourceIdSet].find(
          (id) => id !== sourceId && !nextIdSet.has(id),
        );

        return replacement && next.length < MAX_CONTEXTS_PER_SESSION
          ? [...next, replacement]
          : next;
      });
      return;
    }

    setPendingAddedSourceIds((current) => {
      const next = new Set(current);
      next.add(sourceId);
      return next;
    });
    setDraftSourceIds((current) =>
      current.length < MAX_CONTEXTS_PER_SESSION
        ? [...current, sourceId]
        : current,
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex h-[calc(100svh-1.5rem)] max-h-[720px] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden rounded-[1.5rem] border border-primary-200 bg-background p-0 shadow-[0_28px_72px_-38px_rgba(1,76,56,0.5)] sm:h-[calc(100svh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] md:rounded-[1.75rem] xl:max-w-[1120px]"
        showCloseButton={false}
        variant="default"
      >
        <div className="flex min-h-24 shrink-0 items-center bg-background px-5 py-5 pr-16 md:min-h-28 md:px-8 md:py-6">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-xl font-semibold tracking-tight text-secondary-950 md:text-2xl">
              Tambahkan konteks
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-xs leading-5 text-secondary-500 md:text-sm">
              Pilih sumber belajar yang ingin Vera gunakan untuk membantumu.
            </DialogDescription>
          </DialogHeader>
          <DialogClose
            render={
              <Button
                aria-label="Tutup dialog tambah konteks"
                className="absolute right-5 top-5 rounded-full shadow-sm md:right-6 md:top-6"
                size="icon-sm"
                variant="outline"
              />
            }
          >
            <X />
            <span className="sr-only">Tutup</span>
          </DialogClose>
        </div>

        <AddContextTabs
          activeTab={activeTab}
          draftSourceIds={draftSourceIds}
          filteredMaterials={filteredMaterials}
          materialPage={materialPage}
          materialPageCount={materialPageCount}
          materialQuery={materialQuery}
          onActiveTabChange={(value) => setActiveTab(value)}
          onMaterialPageChange={setMaterialPage}
          onMaterialQueryChange={(value) => {
            setMaterialQuery(value);
            setMaterialPage(1);
          }}
          onPracticePageChange={setPracticePage}
          onToggleSource={toggleSource}
          onUploadedSourceChange={setUploadedSource}
          onUploadedFileNameChange={setUploadedFileName}
          practicePage={practicePage}
          practicePageCount={practicePageCount}
          pendingAddedSourceIdSet={pendingAddedSourceIdSet}
          uploadedFileName={uploadedFileName}
          uploadedSource={uploadedSource}
          visibleMaterialItems={visibleMaterialItems}
          visiblePracticeItems={visiblePracticeItems}
        />

        <div className="flex shrink-0 flex-col gap-3 border-t border-primary-100 bg-background px-5 py-3 sm:flex-row sm:items-center sm:justify-between md:min-h-20 md:px-8 md:py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p
              className={cn(
                "text-xs tabular-nums text-secondary-500",
                limitReached && "font-medium",
              )}
            >
              <span className="font-semibold text-primary-700">
                {draftSourceIds.length} / {MAX_CONTEXTS_PER_SESSION}
              </span>{" "}
              konteks dipakai di sesi
            </p>
            {pendingInactiveCount > 0 ? (
              <p className="text-[11px] text-secondary-400">
                {pendingInactiveCount} konteks baru akan ditambahkan ke
                perpustakaan. Kamu bisa memakainya nanti dari tab Konteks.
              </p>
            ) : limitReached ? (
              <p className="text-[11px] text-secondary-400">
                Batas 6 yang dipakai tercapai. Konteks tambahan tetap bisa
                ditambahkan.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2 sm:gap-3">
            <Button
              className="flex-1 rounded-full sm:min-w-28 sm:flex-none"
              onClick={() => onOpenChange(false)}
              size="default"
              variant="outline"
            >
              Batal
            </Button>
            <Button
              className="flex-1 rounded-full sm:min-w-42 sm:flex-none"
              onClick={() => {
                const catalogSources = [
                  ...veraPracticeHistory,
                  ...veraMaterialHistory,
                ]
                  .map((item) => sourceForTitle(item.title))
                  .filter(
                    (source): source is VeraContextSource => Boolean(source),
                  );
                const addedSources = [
                  ...catalogSources,
                  ...(uploadedSource ? [uploadedSource] : []),
                ].filter(
                  (source, index, sources) =>
                    pendingAddedSourceIdSet.has(source.id) &&
                    !availableSourceIdSet.has(source.id) &&
                    sources.findIndex((item) => item.id === source.id) === index,
                );

                onSave(draftSourceIds, addedSources);
              }}
              size="default"
              variant="brand"
            >
              {pendingAddedSourceIdSet.size > 0
                ? `Tambahkan (${pendingAddedSourceIdSet.size})`
                : "Simpan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddContextTabs({
  activeTab,
  draftSourceIds,
  filteredMaterials,
  materialPage,
  materialPageCount,
  materialQuery,
  onActiveTabChange,
  onMaterialPageChange,
  onMaterialQueryChange,
  onPracticePageChange,
  onToggleSource,
  onUploadedSourceChange,
  onUploadedFileNameChange,
  practicePage,
  practicePageCount,
  pendingAddedSourceIdSet,
  uploadedFileName,
  uploadedSource,
  visibleMaterialItems,
  visiblePracticeItems,
}: {
  activeTab: VeraContextTypeId;
  draftSourceIds: string[];
  filteredMaterials: VeraMaterialHistory[];
  materialPage: number;
  materialPageCount: number;
  materialQuery: string;
  onActiveTabChange: (value: VeraContextTypeId) => void;
  onMaterialPageChange: (page: number) => void;
  onMaterialQueryChange: (query: string) => void;
  onPracticePageChange: (page: number) => void;
  onToggleSource: (sourceId: string) => void;
  onUploadedSourceChange: (source: VeraContextSource | null) => void;
  onUploadedFileNameChange: (name: string | null) => void;
  practicePage: number;
  practicePageCount: number;
  pendingAddedSourceIdSet: Set<string>;
  uploadedFileName: string | null;
  uploadedSource: VeraContextSource | null;
  visibleMaterialItems: VeraMaterialHistory[];
  visiblePracticeItems: VeraPracticeHistory[];
}) {
  return (
          <Tabs
            className="min-h-0 flex-1 gap-0"
            onValueChange={(value) =>
              onActiveTabChange(value as VeraContextTypeId)
            }
            value={activeTab}
          >
            <div className="shrink-0 border-b border-primary-100 bg-background px-4 md:px-10">
              <TabsList
                className="grid h-12 w-full grid-cols-3 justify-start gap-1 p-0 md:flex md:h-13 md:w-fit"
                variant="line"
              >
                <TabsTrigger
                  className="h-12 rounded-t-xl px-2 py-1.5 text-xs after:h-0.5 after:bg-primary-700 data-active:bg-primary-50 data-active:text-secondary-950 md:h-13 md:min-w-44 md:justify-start md:px-4 md:text-sm"
                  value="practice"
                >
                  <ListChecks data-icon="inline-start" />
                  Hasil Latihan
                </TabsTrigger>
                <TabsTrigger
                  className="h-12 rounded-t-xl px-2 py-1.5 text-xs after:h-0.5 after:bg-primary-700 data-active:bg-primary-50 data-active:text-secondary-950 md:h-13 md:min-w-34 md:justify-start md:px-4 md:text-sm"
                  value="material"
                >
                  <BookOpen data-icon="inline-start" />
                  Materi
                </TabsTrigger>
                <TabsTrigger
                  className="h-12 rounded-t-xl px-2 py-1.5 text-xs after:h-0.5 after:bg-primary-700 data-active:bg-primary-50 data-active:text-secondary-950 md:h-13 md:min-w-36 md:justify-start md:px-4 md:text-sm"
                  value="document"
                >
                  <FileText data-icon="inline-start" />
                  Dokumen
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent className="min-h-0 overflow-hidden" value="practice">
              <ScrollArea className="h-full">
                <div className="flex min-h-full flex-col bg-primary-50/25 px-4 py-4 md:px-8 md:py-5">
                  <div className="flex flex-col gap-3">
                    {visiblePracticeItems.length > 0 ? (
                      visiblePracticeItems.map((item) => {
                        const source = sourceForTitle(item.title);
                        const selected = Boolean(
                          source && pendingAddedSourceIdSet.has(source.id),
                        );

                        return (
                          <PracticeContextOption
                            item={item}
                            key={item.id}
                            onToggle={() => source && onToggleSource(source.id)}
                            selected={selected}
                          />
                        );
                      })
                    ) : (
                      <div className="rounded-3xl border border-dashed border-primary-200 bg-background p-6 text-center text-sm leading-6 text-secondary-500">
                        Semua hasil latihan sudah ditambahkan.
                      </div>
                    )}
                  </div>
                  <ContextPagination
                    className="mt-auto"
                    onPageChange={onPracticePageChange}
                    page={practicePage}
                    pageCount={practicePageCount}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent className="min-h-0 overflow-hidden" value="material">
              <ScrollArea className="h-full">
                <div className="flex min-h-full flex-col bg-primary-50/25 px-4 py-4 md:px-8 md:py-5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
                    <Input
                      aria-label="Cari materi Vecalss"
                      className="h-10 rounded-xl border-primary-100 bg-background pl-10 text-sm placeholder:text-secondary-400 focus-visible:border-primary-300 focus-visible:ring-primary-200/70"
                      onChange={(event) => {
                        onMaterialQueryChange(event.target.value);
                        onMaterialPageChange(1);
                      }}
                      placeholder="Cari materi Vecalss..."
                      value={materialQuery}
                    />
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    {filteredMaterials.length > 0 ? (
                      visibleMaterialItems.map((item) => {
                        const source = sourceForTitle(item.title);
                        const selected = Boolean(
                          source && pendingAddedSourceIdSet.has(source.id),
                        );

                        return (
                          <MaterialContextOption
                            item={item}
                            key={item.id}
                            onToggle={() => source && onToggleSource(source.id)}
                            selected={selected}
                          />
                        );
                      })
                    ) : (
                      <div className="rounded-3xl border border-dashed border-primary-200 bg-background p-6 text-center text-sm leading-6 text-secondary-500">
                        {materialQuery.trim()
                          ? "Materi tidak ditemukan."
                          : "Semua materi sudah ditambahkan."}
                      </div>
                    )}
                  </div>
                  {filteredMaterials.length > 0 ? (
                    <ContextPagination
                      className="mt-auto"
                      onPageChange={onMaterialPageChange}
                      page={materialPage}
                      pageCount={materialPageCount}
                    />
                  ) : null}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent className="min-h-0 overflow-hidden" value="document">
              <ScrollArea className="h-full">
                <div className="flex min-h-full flex-col bg-primary-50/25 px-4 py-4 md:px-8 md:py-5">
                  <label
                    className={cn(
                      "flex min-h-48 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-primary-300 bg-background p-5 text-center transition-colors",
                      "cursor-pointer hover:border-primary-500 hover:bg-primary-50/60",
                    )}
                  >
                    <input
                      accept=".pdf,.txt,text/plain,application/pdf"
                      className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];

                          if (file) {
                            const previousSourceId = uploadedSource?.id;
                            const nextSource: VeraContextSource = {
                              id: `uploaded-${Date.now()}`,
                              title: file.name,
                              type: "document",
                            };

                            if (previousSourceId) {
                              onToggleSource(previousSourceId);
                            }

                            onUploadedSourceChange(nextSource);
                            onUploadedFileNameChange(file.name);
                            onToggleSource(nextSource.id);
                          }
                        }}
                      type="file"
                    />
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary-50 text-primary-800">
                      <Upload className="size-4" />
                    </span>
                    <span className="mt-3 text-sm font-semibold text-secondary-950">
                      Upload dokumen belajar
                    </span>
                    <span className="mt-1.5 max-w-sm text-xs leading-5 text-secondary-500">
                      Seret file ke sini atau pilih dari perangkat. Mendukung PDF dan
                      TXT untuk catatan, rangkuman, dan materi eksternal.
                    </span>
                    <span className="mt-4 inline-flex rounded-full bg-primary-700 px-4 py-1.5 text-xs font-semibold text-white">
                      Pilih file
                    </span>
                  </label>
                  {uploadedSource ? (
                    <Attachment className="mt-3 w-full" state="done">
                      <AttachmentMedia>
                        <FileText />
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle>
                          {uploadedFileName ?? "Catatan UTBK Mingguan.pdf"}
                        </AttachmentTitle>
                        <AttachmentDescription>
                          {draftSourceIds.includes(uploadedSource.id)
                            ? "Dipakai di sesi ini"
                            : "Ditambahkan ke perpustakaan — pakai dari tab Konteks"}
                        </AttachmentDescription>
                      </AttachmentContent>
                      <AttachmentActions>
                        <AttachmentAction
                          aria-label="Lepas dokumen"
                          onClick={() => {
                            if (draftSourceIds.includes(uploadedSource.id)) {
                              onToggleSource(uploadedSource.id);
                            }
                            onUploadedSourceChange(null);
                            onUploadedFileNameChange(null);
                          }}
                        >
                          <X />
                        </AttachmentAction>
                      </AttachmentActions>
                    </Attachment>
                  ) : null}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
  );
}


function ContextPagination({
  className,
  onPageChange,
  page,
  pageCount,
}: {
  className?: string;
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <Pagination className={cn("pt-4 md:pt-5", className)}>
      <PaginationContent className="gap-2">
        <PaginationItem>
          <PaginationPrevious
            className="size-11 rounded-full border-0 bg-background p-0 shadow-sm hover:bg-primary-50"
            disabled={page === 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            text=""
          />
        </PaginationItem>
        <PaginationItem>
          <span className="flex h-9 min-w-16 items-center justify-center rounded-full bg-primary-50 px-3 text-xs font-medium tabular-nums text-secondary-800">
            {page} / {pageCount}
          </span>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            className="size-11 rounded-full border border-primary-100 bg-background p-0 shadow-sm hover:bg-primary-50"
            disabled={page === pageCount}
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            text=""
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function PracticeContextOption({
  item,
  onToggle,
  selected,
}: {
  item: VeraPracticeHistory;
  onToggle: () => void;
  selected: boolean;
}) {
  return (
    <ContextOption
      icon={ChartNoAxesColumnIncreasing}
      meta={`${item.meta.replace(/^Selesai\s*/, "")} • ${item.result}`}
      metaIcon={CalendarDays}
      onToggle={onToggle}
      selected={selected}
      tag={item.kind}
      title={item.title}
    />
  );
}

function MaterialContextOption({
  item,
  onToggle,
  selected,
}: {
  item: VeraMaterialHistory;
  onToggle: () => void;
  selected: boolean;
}) {
  return (
    <ContextOption
      icon={NotebookPen}
      meta={item.lastAccessed}
      onToggle={onToggle}
      selected={selected}
      tag={item.kind}
      title={item.title}
    />
  );
}

function ContextOption({
  disabled,
  icon: Icon,
  meta,
  metaIcon: MetaIcon,
  onToggle,
  selected,
  tag,
  title,
}: {
  disabled?: boolean;
  icon: AppIcon;
  meta: string;
  metaIcon?: AppIcon;
  onToggle: () => void;
  selected: boolean;
  tag: string;
  title: string;
}) {
  return (
    <Button
      aria-pressed={selected}
      className={cn(
        "group h-auto min-h-20 w-full justify-start gap-3 rounded-[1.25rem] p-3 text-left whitespace-normal shadow-[0_10px_28px_-26px_rgba(1,76,56,0.4)] md:min-h-24 md:gap-4 md:px-5",
        disabled && "cursor-not-allowed opacity-45",
      )}
      disabled={disabled}
      onClick={onToggle}
      variant={selected ? "contextSelected" : "context"}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800 md:size-12">
        <Icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-secondary-950 md:text-base">
            {title}
          </span>
          <StudentBadge tone="category">
            {tag}
          </StudentBadge>
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-xs font-normal leading-5 text-secondary-500">
          {MetaIcon ? <MetaIcon aria-hidden /> : null}
          <span>{meta}</span>
        </span>
      </span>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected
            ? "border-primary-700 bg-primary-700 text-white"
            : "border-primary-200 bg-white text-transparent group-hover:border-primary-400",
        )}
      >
        <Check />
      </span>
    </Button>
  );
}

function WorkspacePanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.65rem] border border-primary-100 bg-white shadow-[0_18px_54px_-46px_rgba(1,76,56,0.42)] md:h-full",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  action,
  backAction,
  title,
}: {
  action?: React.ReactNode;
  backAction?: () => void;
  title: React.ReactNode;
}) {
  return (
    <div className="flex min-h-17 items-center justify-between gap-3 border-b border-primary-100 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {backAction ? (
          <Button
            aria-label="Kembali ke daftar hasil"
            className="-ml-1 rounded-full border-0"
            onClick={backAction}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeft />
          </Button>
        ) : null}
        <h2 className="truncate text-sm font-semibold text-secondary-950">
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export { VeraAiPageModule };

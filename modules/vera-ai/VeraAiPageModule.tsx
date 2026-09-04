"use client";

import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  LoaderCircle,
  Maximize2,
  MessageCircleMore,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RotateCcw,
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
  type VeraContextSource as VeraContextSourceSeed,
  type VeraContextTypeId,
  type VeraMaterialHistory,
  type VeraPracticeHistory,
  type VeraStudioTool,
  type VeraToolId,
} from "./data";

type WorkspaceTab = "chat" | "context" | "studio";
type VeraDataState = "loading" | "live" | "unavailable";

type VeraContextSource = VeraContextSourceSeed & {
  releasedAt?: string;
  subtitle?: string;
};

type VeraBackendConversation = {
  id: string;
  conversationType: string;
  title: string | null;
  version: number;
  contextVersion: number;
  createdAt: string;
  updatedAt: string;
  messagePreview: {
    role: "user" | "assistant";
    text: string | null;
    createdAt: string;
  } | null;
};

type VeraBackendMessage = {
  id: string;
  role: "user" | "assistant";
  text: string | null;
  contentState: string;
  createdAt: string;
  request?: {
    id: string;
    status: string;
    errorCode: string | null;
  } | null;
};

type VeraBackendContextSource = {
  sourceType: "material" | "practice";
  sourceId: string;
  title: string | null;
  displayOrder: number;
  releasedAt?: string;
  subtitle?: string;
};

type VeraBackendContext = {
  contextVersion: number;
  selectionDigest?: string;
  sources: VeraBackendContextSource[];
  maxSources: number;
  documentPhase?: "disabled";
};

type VeraBackendSource = {
  sourceType: "material" | "practice";
  sourceId: string;
  title: string;
  subtitle: string;
  releasedAt: string;
};

type VeraBackendArtifactSummary = {
  id: string;
  artifactType: string;
  revision: number;
  title: string | null;
  createdAt: string;
  lifecycleState: string;
  resultState: string;
  contextState: string;
};

type VeraBackendArtifactTarget = {
  registryKey: string;
  id: string;
  revision: number;
  lifecycleState: string;
  deletionState: string;
  label: string;
};

type VeraBackendArtifactDetail = {
  id: string;
  artifactType: string;
  revision: number;
  title: string | null;
  markdown: string | null;
  payload: unknown;
  createdAt?: string;
  lifecycle: {
    state: string;
    revision: number;
    deletionState: string;
  };
  resultState: string;
  contextState: string;
  citations: Array<{ key: string; label: string | null }>;
  applyCapabilities: {
    materializeLearningRecommendation: boolean;
    registryKeys: string[];
    targets: VeraBackendArtifactTarget[];
  };
  sourceEntity?: {
    type: string;
    id: string;
    revision: number;
  } | null;
};

type VeraBackendUsage = {
  usageDate?: string;
  quotaTimezone?: string;
  quotaTimezonePolicyVersion?: string;
  policyBundleVersion?: string;
  quotaLimitUnits: number;
  usedQuotaUnits: number;
  reservedQuotaUnits: number;
  quotaDebtUnits: number;
  quotaOverrunLockUntil: string | null;
  rawTokenUsageState: string;
  providerAvailable: boolean;
  redisAvailable: boolean;
};

type VeraRequestStatus = {
  requestId: string;
  conversationId: string;
  clientRequestId: string;
  state: string;
  resultState: string;
  errorCode: string | null;
  result: { text: string | null; citationKeys: string[] } | null;
  artifact?: { id: string; artifactType: string; revision: number } | null;
  usage?: {
    quotaUnitsReserved: number;
    quotaUnitsConsumed: number;
    tokenUsageState: string;
    usageAccountingState: string;
  };
  sequence?: number;
};

type VeraRequestAttempt = {
  kind: "chat" | "studio";
  text: string;
  toolId: VeraToolId | null;
  requestId: string | null;
  clientRequestId: string;
  artifactId: string | null;
};

class VeraRequestError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "VeraRequestError";
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({ error: "invalid_response" }))) as { error?: string };
    throw new VeraRequestError(
      errorPayload.error ?? "request_failed",
      errorPayload as Record<string, unknown>,
    );
  }

  return response.json() as Promise<T>;
}

const RELATIVE_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});

function relativeTime(value: string) {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60_000),
  );

  if (minutes < 1) {
    return "Baru saja";
  }

  if (minutes < 60) {
    return `${minutes} menit lalu`;
  }

  if (minutes < 1_440) {
    return `${Math.round(minutes / 60)} jam lalu`;
  }

  return RELATIVE_DATE_FORMATTER.format(new Date(value));
}

const veraErrorLabels: Record<string, string> = {
  admission_unavailable: "Vera sedang menyiapkan layanan. Coba lagi sebentar.",
  already_materialized: "Hasil ini sudah disimpan sebelumnya.",
  artifact_commit_unavailable:
    "Hasil Vera belum dapat disimpan. Coba lagi sebentar.",
  cancelled: "Permintaan dibatalkan.",
  context_limit_reached: "Maksimal 6 sumber dapat dipakai dalam satu sesi.",
  context_release_unavailable: "Sumber ini sudah tidak tersedia untuk dipakai.",
  context_version_conflict:
    "Konteks berubah di perangkat lain. Pilihan terbaru sudah dimuat.",
  conversation_version_conflict:
    "Judul sesi berubah di perangkat lain. Versi terbaru sudah dimuat.",
  idempotency_config_missing:
    "Layanan Vera belum siap menerima permintaan aman. Coba lagi nanti.",
  idempotency_conflict: "Permintaan ini sudah dipakai untuk aksi lain.",
  idempotency_key_expired: "Permintaan Vera sudah kedaluwarsa. Coba lagi.",
  invalid_request: "Permintaan Vera belum lengkap. Periksa kembali lalu coba lagi.",
  malformed_output: "Vera menghasilkan jawaban yang belum dapat dipakai. Coba lagi.",
  provider_unavailable: "Penyedia AI sedang tidak tersedia. Coba lagi nanti.",
  provider_prepare_unavailable:
    "Vera belum dapat menyiapkan penyedia AI. Coba lagi nanti.",
  quota_exhausted: "Kuota Vera hari ini sudah habis.",
  request_cancelled: "Permintaan dibatalkan.",
  request_failed: "Vera belum berhasil menyelesaikan permintaan ini.",
  request_not_found: "Status permintaan belum ditemukan. Coba lagi.",
  request_pending: "Permintaan sebelumnya masih diproses.",
  settlement_deadline_expired:
    "Permintaan Vera melewati batas waktu. Coba lagi.",
  status_unavailable: "Status permintaan belum tersedia. Coba lagi.",
  target_unavailable: "Data Vera tidak lagi tersedia.",
  target_revision_conflict:
    "Data tujuan berubah di perangkat lain. Muat ulang lalu coba lagi.",
  unauthenticated: "Sesi login berakhir. Silakan masuk kembali.",
  usage_unavailable: "Penggunaan Vera belum dapat dimuat.",
  sources_unavailable: "Daftar sumber belajar Vera belum dapat dimuat.",
  vera_unavailable: "Vera sedang tidak tersedia. Coba lagi sebentar.",
};

function veraErrorMessage(error: unknown) {
  const code =
    error instanceof VeraRequestError
      ? error.code
      : error instanceof Error
        ? error.message
        : "vera_unavailable";

  return veraErrorLabels[code] ?? veraErrorLabels.vera_unavailable;
}

function mapBackendConversation(conversation: VeraBackendConversation): StudySession {
  return {
    id: conversation.id,
    title: conversation.title ?? "Sesi belajar baru",
    updatedAt: relativeTime(conversation.updatedAt),
    sourceIds: [],
    generatedTools: [],
    messages: [],
    provenance: { asOf: conversation.updatedAt, state: "live" },
    version: conversation.version,
    contextVersion: conversation.contextVersion,
  };
}

function mapBackendMessage(message: VeraBackendMessage): VeraMessage {
  return {
    id: message.id,
    role: message.role === "assistant" ? "vera" : "student",
    body: message.text ?? "Konten tidak tersedia.",
    contentState: message.contentState,
    createdAt: relativeTime(message.createdAt),
    requestErrorCode: message.request?.errorCode ?? null,
    requestState: message.request?.status ?? null,
  };
}

function mapBackendSource(source: VeraBackendSource): VeraContextSource {
  return {
    id: source.sourceId,
    releasedAt: source.releasedAt,
    subtitle: source.subtitle,
    title: source.title,
    type: source.sourceType,
  };
}

function isTerminalRequestState(state: string) {
  return ["succeeded", "fallback", "failed", "rejected", "expired"].includes(
    state,
  );
}

function sourceForTitle(title: string) {
  return veraContextSources.find((source) => source.title === title);
}

type VeraMessage = {
  id: string;
  role: "vera" | "student";
  body: string;
  contentState?: string;
  createdAt: string;
  citations?: string[];
  requestErrorCode?: string | null;
  requestState?: string | null;
};

type StudySession = {
  id: string;
  title: string;
  updatedAt: string;
  sourceIds: string[];
  generatedTools: VeraToolId[];
  messages: VeraMessage[];
  provenance?: {
    asOf?: string | null;
    state: "live" | "snapshot" | "cached" | "demo" | "unavailable";
  };
  version?: number;
  contextVersion?: number;
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

const emptyStudySession: StudySession = {
  id: "",
  title: "Sesi belajar baru",
  updatedAt: "",
  sourceIds: [],
  generatedTools: [],
  messages: [],
};

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
  activeArtifactDetail: VeraBackendArtifactDetail | null;
  activeSession: StudySession;
  busy: boolean;
  contextDialogOpen: boolean;
  contextSources: VeraContextSource[];
  draft: string;
  fullscreenArtifact: VeraStudioTool | null;
  fullscreenArtifactDetail: VeraBackendArtifactDetail | null;
  generatedArtifacts: VeraStudioTool[];
  generatedArtifactSummaries: VeraBackendArtifactSummary[];
  error: string | null;
  notice: string | null;
  progress: number | null;
  provisionalText: string | null;
  notificationFeed: StudentNotificationFeed;
  onCloseArtifact: () => void;
  onCloseFullscreen: () => void;
  onCancelRequest: () => void;
  onDraftChange: (value: string) => void;
  onExpandArtifact: (toolId: VeraToolId) => void;
  onGenerateTool: (toolId: VeraToolId) => void;
  onNewSession: () => void;
  onOpenAddContext: () => void;
  onContextDialogOpenChange: (open: boolean) => void;
  onOpenArtifact: (toolId: VeraToolId) => void;
  onRetry: () => void;
  onRemoveContexts: (sourceIds: string[]) => void;
  onRenameSession: (title: string) => void;
  onSaveContext: (nextSourceIds: string[], addedSources?: VeraContextSource[]) => void;
  onSend: () => void;
  onSelectSession: (sessionId: string) => void;
  onSessionSidebarCollapsedChange: (collapsed: boolean) => void;
  onSetWorkspaceTab: (tab: WorkspaceTab) => void;
  onToggleContext: (sourceId: string, active: boolean) => void;
  onMaterializeArtifact: () => void;
  onApplyArtifact: (target: VeraBackendArtifactTarget) => void;
  selectedSources: VeraContextSource[];
  session: SessionContext;
  sessionSidebarCollapsed: boolean;
  sessions: StudySession[];
  usage: VeraBackendUsage | null;
  backendMode: boolean;
  dataAsOf: string | null;
  dataState: VeraDataState;
  workspaceTab: WorkspaceTab;
};

function VeraAiWorkspace({
  activeArtifact,
  activeArtifactDetail,
  activeSession,
  backendMode,
  busy,
  contextDialogOpen,
  contextSources,
  draft,
  error,
  fullscreenArtifact,
  fullscreenArtifactDetail,
  generatedArtifacts,
  generatedArtifactSummaries,
  notice,
  notificationFeed,
  onCloseArtifact,
  onCloseFullscreen,
  onCancelRequest,
  onDraftChange,
  onExpandArtifact,
  onGenerateTool,
  onNewSession,
  onOpenAddContext,
  onContextDialogOpenChange,
  onOpenArtifact,
  onRetry,
  onRemoveContexts,
  onRenameSession,
  onSaveContext,
  onSend,
  onSelectSession,
  onSessionSidebarCollapsedChange,
  onSetWorkspaceTab,
  onToggleContext,
  onMaterializeArtifact,
  onApplyArtifact,
  progress,
  provisionalText,
  selectedSources,
  session,
  sessionSidebarCollapsed,
  sessions,
  usage,
  dataAsOf,
  dataState,
  workspaceTab,
}: VeraAiWorkspaceProps) {
  return (
    <div className="vera-ai-motion min-h-svh bg-primary-50 text-secondary-900 md:h-svh md:overflow-hidden">
      <div className="flex min-h-svh flex-col md:h-svh">
        <VeraTopBar
          notificationFeed={notificationFeed}
          session={session}
          usage={usage}
        />
        <h1 className="sr-only">
          Vera AI Workspace: {activeSession.title}
        </h1>

        <main className="min-h-0 flex-1 px-2 pb-2 md:px-3 md:pb-3">
          {dataState === "live" ? (
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
                <VeraProvenanceBanner dataAsOf={dataAsOf} session={activeSession} />
                <VeraStatusBanner
                  busy={busy}
                  error={error}
                  notice={notice}
                  onCancel={onCancelRequest}
                  onRetry={onRetry}
                  progress={progress}
                />
                <WorkspaceTabs onChange={onSetWorkspaceTab} />
                <TabsContent className="min-h-0 min-w-0 overflow-hidden" value="chat">
                  <ChatWorkspace
                    activeSession={activeSession}
                    busy={busy}
                    className="flex"
                    draft={draft}
                    onDraftChange={onDraftChange}
                    onCancel={onCancelRequest}
                    onRenameSession={onRenameSession}
                    onSend={onSend}
                    provisionalText={provisionalText}
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
                    activeArtifactDetail={activeArtifactDetail}
                    className="flex"
                    generatedArtifacts={generatedArtifacts}
                    generatedArtifactSummaries={generatedArtifactSummaries}
                    busy={busy}
                    onCloseArtifact={onCloseArtifact}
                    onExpandArtifact={onExpandArtifact}
                    onGenerateTool={onGenerateTool}
                    onOpenArtifact={onOpenArtifact}
                    onMaterializeArtifact={onMaterializeArtifact}
                    onApplyArtifact={onApplyArtifact}
                  />
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <VeraDataStatePanel
              dataState={dataState}
              error={error}
              onRetry={onRetry}
            />
          )}

        </main>
      </div>

      {contextDialogOpen && dataState === "live" ? (
        <AddContextDialog
          onOpenChange={onContextDialogOpenChange}
          onSave={onSaveContext}
          open
          availableSources={contextSources}
          backendMode={backendMode}
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
        backendArtifact={fullscreenArtifactDetail}
        tool={fullscreenArtifact}
      />
    </div>
  );
}

function useVeraAiFallbackState({ notificationFeed, session }: { notificationFeed: StudentNotificationFeed; session: SessionContext }): ComponentProps<typeof VeraAiWorkspace> {
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

  return {
    activeArtifact,
    activeArtifactDetail: null,
    activeSession,
    backendMode: false,
    busy: false,
    contextDialogOpen,
    contextSources,
    draft,
    error: null,
    fullscreenArtifact,
    fullscreenArtifactDetail: null,
    generatedArtifacts,
    generatedArtifactSummaries: [],
    notice: null,
    notificationFeed,
    onApplyArtifact: () => undefined,
    onCancelRequest: () => undefined,
    onCloseArtifact: () => setActiveArtifactId(null),
    onCloseFullscreen: () => setFullscreenArtifactId(null),
    onContextDialogOpenChange: setContextDialogOpen,
    onDraftChange: setDraft,
    onExpandArtifact: setFullscreenArtifactId,
    onGenerateTool: handleToolRequest,
    onMaterializeArtifact: () => undefined,
    onNewSession: handleNewSession,
    onOpenAddContext: () => setContextDialogOpen(true),
    onOpenArtifact: handleOpenArtifact,
    onRetry: () => undefined,
    onRemoveContexts: handleRemoveContexts,
    onRenameSession: handleRenameSession,
    onSaveContext: handleSaveContext,
    onSend: handleSend,
    onSelectSession: handleSelectSession,
    onSessionSidebarCollapsedChange: setSessionSidebarCollapsed,
    onSetWorkspaceTab: setWorkspaceTab,
    onToggleContext: handleToggleContext,
    progress: null,
    provisionalText: null,
    selectedSources,
    session,
    sessionSidebarCollapsed,
    sessions,
    usage: null,
    dataAsOf: null,
    dataState: "unavailable",
    workspaceTab,
  };
}

function VeraAiPageModuleFallback({ notificationFeed, session }: { notificationFeed: StudentNotificationFeed; session: SessionContext }) {
  const workspaceProps = useVeraAiFallbackState({ notificationFeed, session });
  return <VeraAiWorkspace {...workspaceProps} />;
}

function useVeraAiModuleState({ notificationFeed, session }: { notificationFeed: StudentNotificationFeed; session: SessionContext }): ComponentProps<typeof VeraAiWorkspace> {
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
  const [backendMode, setBackendMode] = useState(false);
  const [dataAsOf, setDataAsOf] = useState<string | null>(null);
  const [dataState, setDataState] = useState<VeraDataState>("loading");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendContext, setBackendContext] =
    useState<VeraBackendContext | null>(null);
  const [backendArtifacts, setBackendArtifacts] = useState<
    VeraBackendArtifactSummary[]
  >([]);
  const [activeArtifactDetail, setActiveArtifactDetail] =
    useState<VeraBackendArtifactDetail | null>(null);
  const [usage, setUsage] = useState<VeraBackendUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [provisionalText, setProvisionalText] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<VeraRequestAttempt | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  const activeSession =
    sessions.find((item) => item.id === activeSessionId) ??
    sessions[0] ??
    emptyStudySession;
  const activeSourceIdSet = useMemo(
    () => new Set(activeSession.sourceIds),
    [activeSession.sourceIds],
  );
  const selectedSources = useMemo(
    () =>
      contextSources.filter((source) => activeSourceIdSet.has(source.id)),
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
  const fullscreenArtifactDetail =
    activeArtifactDetail?.artifactType === fullscreenArtifactId
      ? activeArtifactDetail
      : null;

  const loadConversation = useCallback(async (conversationId: string) => {
    const [detail, messagePage, contextDto, artifactPage] = await Promise.all([
      requestJson<{ conversation: VeraBackendConversation }>(
        `/api/vera-ai/conversations/${conversationId}`,
      ),
      requestJson<{ messages: VeraBackendMessage[] }>(
        `/api/vera-ai/conversations/${conversationId}/messages?limit=50`,
      ),
      requestJson<VeraBackendContext>(
        `/api/vera-ai/conversations/${conversationId}/context`,
      ),
      requestJson<{ artifacts: VeraBackendArtifactSummary[] }>(
        `/api/vera-ai/conversations/${conversationId}/artifacts?limit=50`,
      ),
    ]);
    const generatedTools = artifactPage.artifacts.reduce<VeraToolId[]>((acc, artifact) => {
      if (isToolId(artifact.artifactType)) acc.push(artifact.artifactType);
      return acc;
    }, []);

    setBackendContext(contextDto);
    setBackendArtifacts(artifactPage.artifacts);
    setContextSources((current) => {
      const merged = new Map(current.map((source) => [source.id, source]));

      contextDto.sources.forEach((source) => {
        if (!merged.has(source.sourceId)) {
          merged.set(source.sourceId, {
            id: source.sourceId,
            title: source.title ?? "Sumber belajar",
            type: source.sourceType,
          });
        }
      });

      return [...merged.values()];
    });
    setSessions((current) =>
      current.map((item) =>
        item.id === conversationId
          ? {
              ...mapBackendConversation(detail.conversation),
              sourceIds: contextDto.sources.map((source) => source.sourceId),
              generatedTools,
              messages: messagePage.messages.map(mapBackendMessage),
            }
          : item,
      ),
    );
  }, []);

  const hydrate = useCallback(async () => {
    try {
      setDataState("loading");
      setBackendError(null);
      const [conversationResult, sourceResult, usageResult] = await Promise.allSettled([
        requestJson<{
          conversations: VeraBackendConversation[];
          defaultConversationId: string | null;
        }>("/api/vera-ai/conversations?limit=50"),
        requestJson<{ sources: VeraBackendSource[] }>(
          "/api/vera-ai/sources?limit=50",
        ),
        requestJson<VeraBackendUsage>("/api/vera-ai/usage"),
      ]);
      if (conversationResult.status === "rejected") {
        throw conversationResult.reason;
      }
      if (sourceResult.status === "rejected") {
        throw new VeraRequestError("sources_unavailable", {
          cause: sourceResult.reason,
        });
      }
      if (usageResult.status === "rejected") {
        throw new VeraRequestError("usage_unavailable", {
          cause: usageResult.reason,
        });
      }
      const conversationPage = conversationResult.value;
      const sourcePage = sourceResult.value;
      const usageDto = usageResult.value;
      const mappedSessions = conversationPage.conversations.map(
        mapBackendConversation,
      );
      const defaultConversationId =
        conversationPage.defaultConversationId ?? mappedSessions[0]?.id ?? "";

      setSessions(mappedSessions);
      setContextSources(sourcePage.sources.map(mapBackendSource));
      setUsage(usageDto);
      setActiveSessionId(defaultConversationId);

      if (defaultConversationId) {
        await loadConversation(defaultConversationId);
      } else {
        setBackendContext(null);
        setBackendArtifacts([]);
      }
      setDataAsOf(new Date().toISOString());
      setBackendMode(true);
      setDataState("live");
    } catch (caught) {
      setBackendMode(false);
      setDataState("unavailable");
      setDataAsOf(null);
      setSessions([]);
      setContextSources([]);
      setActiveSessionId("");
      setActiveArtifactId(null);
      setActiveArtifactDetail(null);
      setBackendContext(null);
      setBackendArtifacts([]);
      setUsage(null);
      setLastFailed(null);
      setBackendError(veraErrorMessage(caught));
    }
  }, [loadConversation]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void hydrate();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [hydrate]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotice(null);
    }, 4_500);

    return () => window.clearTimeout(timer);
  }, [notice]);

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
    if (dataState !== "live" || !backendMode) {
      return;
    }

    setActiveSessionId(nextSessionId);
    setActiveArtifactId(null);
    setActiveArtifactDetail(null);
    setBackendArtifacts([]);
    setDraft("");
    setWorkspaceTab("chat");

    setLastFailed(null);
    setBackendContext(null);
    setError(null);
    setNotice(null);
    void loadConversation(nextSessionId).catch((caught) => {
      setError(veraErrorMessage(caught));
    });
  }

  function handleNewSession() {
    if (busy || dataState !== "live" || !backendMode) {
      return;
    }

    void createBackendConversation();
  }

  function handleRenameSession(nextTitle: string) {
    const title = nextTitle.trim();

    if (!title || title === activeSession.title) {
      return;
    }

    if (dataState !== "live" || !backendMode) {
      return;
    }

    void renameBackendConversation(title);
  }

  function handleSaveContext(
    nextSourceIds: string[],
    addedSources: VeraContextSource[] = [],
  ) {
    const limitedSourceIds = nextSourceIds.slice(
      0,
      MAX_CONTEXTS_PER_SESSION,
    );

    if (dataState !== "live" || !backendMode) {
      return;
    }

    setContextDialogOpen(false);
    void replaceBackendContext(limitedSourceIds);
  }

  function handleRemoveContexts(sourceIds: string[]) {
    if (dataState !== "live" || !backendMode) {
      return;
    }

    const removedSourceIds = new Set(sourceIds);

    void replaceBackendContext(
      activeSession.sourceIds.filter((sourceId) => !removedSourceIds.has(sourceId)),
    );
  }

  function handleToggleContext(sourceId: string, active: boolean) {
    if (dataState !== "live" || !backendMode) {
      return;
    }

    if (active === activeSession.sourceIds.includes(sourceId)) {
      return;
    }

    const nextSourceIds = active
      ? [...activeSession.sourceIds, sourceId]
      : activeSession.sourceIds.filter((id) => id !== sourceId);

    if (
      active &&
      activeSession.sourceIds.length >= MAX_CONTEXTS_PER_SESSION
    ) {
      setError(veraErrorLabels.context_limit_reached);
      return;
    }

    void replaceBackendContext(nextSourceIds);
  }

  function handleSend() {
    const nextDraft = draft.trim();

    if (busy || dataState !== "live" || !backendMode || !nextDraft) {
      return;
    }

    void streamRequest("chat", nextDraft, null);
  }

  function handleToolRequest(toolId: VeraToolId) {
    const tool = veraStudioTools.find((item) => item.id === toolId);

    if (busy || dataState !== "live" || !backendMode || !tool) {
      return;
    }

    setWorkspaceTab("studio");
    void streamRequest("studio", toolRequestLabels[toolId], toolId);
  }

  function handleOpenArtifact(toolId: VeraToolId) {
    if (dataState !== "live" || !backendMode) {
      return;
    }

    setActiveArtifactId(toolId);
    setWorkspaceTab("studio");

    const summary = backendArtifacts.find(
      (artifact) => artifact.artifactType === toolId,
    );

    if (summary) {
      void openBackendArtifact(summary.id);
    }
  }

  async function createBackendConversation() {
    try {
      setBusy(true);
      setError(null);
      const result = await requestJson<{
        conversation: VeraBackendConversation;
      }>("/api/vera-ai/conversations", {
        method: "POST",
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          conversationType: "vera_chat",
          title: "Sesi belajar baru",
        }),
      });
      setSessions((current) => [
        mapBackendConversation(result.conversation),
        ...current,
      ]);
      setActiveSessionId(result.conversation.id);
      setActiveArtifactId(null);
      setActiveArtifactDetail(null);
      setBackendContext(null);
      setBackendArtifacts([]);
      setWorkspaceTab("chat");
      await loadConversation(result.conversation.id);
    } catch (caught) {
      setError(veraErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function renameBackendConversation(title: string) {
    if (!activeSession.id) {
      return;
    }

    try {
      setError(null);
      const updated = await requestJson<VeraBackendConversation>(
        `/api/vera-ai/conversations/${activeSession.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title,
            expectedVersion: activeSession.version ?? 0,
          }),
        },
      );
      setSessions((current) =>
        current.map((item) =>
          item.id === updated.id
            ? {
                ...mapBackendConversation(updated),
                sourceIds: item.sourceIds,
                generatedTools: item.generatedTools,
                messages: item.messages,
              }
            : item,
        ),
      );
    } catch (caught) {
      const authoritative =
        caught instanceof VeraRequestError &&
        caught.details.conversation &&
        typeof caught.details.conversation === "object"
          ? (caught.details.conversation as VeraBackendConversation)
          : null;

      if (authoritative) {
        setSessions((current) =>
          current.map((item) =>
            item.id === authoritative.id
              ? {
                  ...mapBackendConversation(authoritative),
                  sourceIds: item.sourceIds,
                  generatedTools: item.generatedTools,
                  messages: item.messages,
                }
              : item,
          ),
        );
        setNotice(
          "Judul berubah di perangkat lain. Versi terbaru sudah dimuat.",
        );
      }

      setError(veraErrorMessage(caught));
    }
  }

  async function replaceBackendContext(nextSourceIds: string[]) {
    if (!activeSession.id || !backendContext) {
      return;
    }

    const contextById = new Map(
      backendContext.sources.map((source) => [source.sourceId, source]),
    );
    const catalogById = new Map(
      contextSources.map((source) => [source.id, source]),
    );
    const sources = nextSourceIds
      .map((sourceId) => {
        const contextSource = contextById.get(sourceId);
        const catalogSource = catalogById.get(sourceId);
        const sourceType = contextSource?.sourceType ?? catalogSource?.type;

        return sourceType === "material" || sourceType === "practice"
          ? { sourceType, sourceId }
          : null;
      })
      .filter(
        (
          source,
        ): source is { sourceType: "material" | "practice"; sourceId: string } =>
          source !== null,
      )
      .slice(0, MAX_CONTEXTS_PER_SESSION);

    try {
      setError(null);
      const result = await requestJson<VeraBackendContext>(
        `/api/vera-ai/conversations/${activeSession.id}/context`,
        {
          method: "PUT",
          body: JSON.stringify({
            expectedContextVersion: backendContext.contextVersion,
            sources,
          }),
        },
      );
      setBackendContext(result);
      setSessions((current) =>
        current.map((item) =>
          item.id === activeSession.id
            ? {
                ...item,
                sourceIds: result.sources.map((source) => source.sourceId),
                contextVersion: result.contextVersion,
                updatedAt: "Baru saja",
              }
            : item,
        ),
      );
      await loadConversation(activeSession.id);
    } catch (caught) {
      const authoritative =
        caught instanceof VeraRequestError &&
        caught.details.context &&
        typeof caught.details.context === "object"
          ? (caught.details.context as VeraBackendContext)
          : null;

      if (authoritative) {
        setBackendContext(authoritative);
        setSessions((current) =>
          current.map((item) =>
            item.id === activeSession.id
              ? {
                  ...item,
                  sourceIds: authoritative.sources.map(
                    (source) => source.sourceId,
                  ),
                  contextVersion: authoritative.contextVersion,
                }
              : item,
          ),
        );
        setNotice(
          "Konteks berubah di perangkat lain. Pilihan terbaru sudah dimuat.",
        );
        await loadConversation(activeSession.id).catch(() => undefined);
      }

      setError(veraErrorMessage(caught));
    }
  }

  async function openBackendArtifact(artifactId: string) {
    try {
      setError(null);
      const detail = await requestJson<VeraBackendArtifactDetail>(
        `/api/vera-ai/artifacts/${artifactId}`,
      );
      setActiveArtifactDetail(detail);
      if (isToolId(detail.artifactType)) {
        setActiveArtifactId(detail.artifactType);
      }
    } catch (caught) {
      setError(veraErrorMessage(caught));
    }
  }

  async function streamRequest(
    kind: "chat" | "studio",
    text: string,
    toolId: VeraToolId | null,
    retryOfRequestId: string | null = null,
  ) {
    if (dataState !== "live" || !backendMode) {
      return;
    }

    const conversationId = activeSession.id;

    if (!conversationId) {
      setError("Buat sesi belajar baru sebelum mengirim permintaan.");
      return;
    }

    const clientRequestId = crypto.randomUUID();
    const controller = new AbortController();
    const attempt: VeraRequestAttempt = {
      kind,
      text,
      toolId,
      requestId: null,
      clientRequestId,
      artifactId: null,
    };
    const sources = (backendContext?.sources ?? [])
      .map(({ sourceType, sourceId }) => ({ sourceType, sourceId }))
      .slice(0, MAX_CONTEXTS_PER_SESSION);

    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setNotice(null);
    setLastFailed(null);
    setProvisionalText(kind === "chat" ? "" : null);
    setProgress(toolId ? 5 : null);
    updateActiveSession((current) => ({
      ...current,
      updatedAt: "Baru saja",
      messages: [
        ...current.messages,
        {
          id: `pending-${clientRequestId}`,
          role: "student",
          body: text,
          createdAt: "Sekarang",
        },
      ],
    }));

    let terminalSeen = false;
    let finalStatus: VeraRequestStatus | null = null;

    try {
      const response = await fetch(
        `/api/vera-ai/conversations/${conversationId}/requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientRequestId,
            kind,
            toolId,
            text,
            sources,
            options: {},
            retryOfRequestId,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const body = (await response
          .json()
          .catch(() => ({ error: "request_failed" }))) as {
          error?: string;
          errorCode?: string | null;
          [key: string]: unknown;
        };
        if (typeof body.requestId === "string") {
          attempt.requestId = body.requestId;
        }
        if (
          body.artifact &&
          typeof body.artifact === "object" &&
          typeof (body.artifact as { id?: unknown }).id === "string"
        ) {
          attempt.artifactId = (body.artifact as { id: string }).id;
        }
        throw new VeraRequestError(
          body.error ?? body.errorCode ?? "request_failed",
          body,
        );
      }

      if (
        response.headers.get("content-type")?.includes("text/event-stream") &&
        response.body
      ) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const part = await reader.read();
          if (part.done) {
            break;
          }

          buffer += decoder.decode(part.value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const lines = frame.split(/\r?\n/);
            const event = lines
              .find((line) => line.startsWith("event:"))
              ?.slice(6)
              .trim();
            const dataText = lines
              .find((line) => line.startsWith("data:"))
              ?.slice(5)
              .trim();

            if (!dataText) {
              continue;
            }

            let data: {
              requestId?: string;
              text?: string;
              code?: string;
              state?: string;
              progress?: number;
              artifactRevisionId?: string;
              artifactType?: string;
            };

            try {
              data = JSON.parse(dataText) as typeof data;
            } catch {
              throw new VeraRequestError("invalid_response");
            }

            if (event === "request.started" && data.requestId) {
              attempt.requestId = data.requestId;
            }
            if (
              event === "message.delta" &&
              typeof data.text === "string"
            ) {
              setProvisionalText((current) => `${current ?? ""}${data.text}`);
            }
            if (
              event === "message.generated" &&
              typeof data.text === "string"
            ) {
              setProvisionalText(data.text);
            }
            if (event === "message.committed") {
              setNotice("Jawaban sudah tersimpan di sesi ini.");
            }
            if (event === "artifact.ready") {
              setNotice("Hasil Studio sudah tersimpan di sesi ini.");
              attempt.artifactId = data.artifactRevisionId ?? null;
              const artifactType = data.artifactType ?? null;
              if (isToolId(artifactType)) {
                setActiveArtifactId(artifactType);
              }
            }
            if (
              event === "progress.updated" &&
              typeof data.progress === "number"
            ) {
              setProgress(data.progress);
            }
            if (event === "request.completed") {
              terminalSeen = true;
              if (data.state === "failed") {
                setError(
                  veraErrorMessage(new VeraRequestError("request_failed")),
                );
                setLastFailed(attempt);
              }
            }
            if (event === "request.failed") {
              terminalSeen = true;
              setError(
                veraErrorMessage(
                  new VeraRequestError(data.code ?? "request_failed"),
                ),
              );
              setLastFailed(attempt.requestId ? attempt : null);
            }
            if (event === "request.recovery_pending") {
              setNotice(
                "Permintaan masih dipulihkan. Vera sedang memeriksa hasil tersimpan.",
              );
            }
          }
        }
      } else {
        finalStatus = (await response.json()) as VeraRequestStatus;
        attempt.requestId = finalStatus.requestId;
        attempt.artifactId = finalStatus.artifact?.id ?? null;
        terminalSeen = isTerminalRequestState(finalStatus.state);
        if (["failed", "rejected", "expired"].includes(finalStatus.state)) {
          setError(
            veraErrorMessage(
              new VeraRequestError(finalStatus.errorCode ?? "request_failed"),
            ),
          );
          setLastFailed(attempt.requestId ? attempt : null);
        }
      }

      if (!terminalSeen) {
        for (let poll = 0; poll < 5; poll += 1) {
          finalStatus = await requestJson<VeraRequestStatus>(
            `/api/vera-ai/conversations/${conversationId}/requests?clientRequestId=${encodeURIComponent(clientRequestId)}`,
          );
          attempt.requestId = finalStatus.requestId;
          attempt.artifactId = finalStatus.artifact?.id ?? attempt.artifactId;

          if (isTerminalRequestState(finalStatus.state)) {
            break;
          }

          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }

        if (
          finalStatus &&
          ["failed", "rejected", "expired"].includes(finalStatus.state)
        ) {
          setError(
            veraErrorMessage(
              new VeraRequestError(finalStatus.errorCode ?? "request_failed"),
            ),
          );
          setLastFailed(attempt.requestId ? attempt : null);
        } else if (!finalStatus || !isTerminalRequestState(finalStatus.state)) {
          setNotice(
            "Permintaan masih dipulihkan. Coba periksa kembali beberapa saat lagi.",
          );
        }
      }

      setDraft("");
      await Promise.all([
        loadConversation(conversationId),
        requestJson<VeraBackendUsage>("/api/vera-ai/usage").then(setUsage),
      ]);

      if (kind === "studio" && attempt.artifactId) {
        setWorkspaceTab("studio");
        await openBackendArtifact(attempt.artifactId);
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        setError(veraErrorMessage(new VeraRequestError("request_cancelled")));
        setLastFailed(null);
      } else {
        setError(veraErrorMessage(caught));
        setLastFailed(attempt.requestId ? attempt : null);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
      setProvisionalText(null);
    }
  }

  function handleCancelRequest() {
    abortRef.current?.abort();
    setNotice("Permintaan dibatalkan.");
  }

  function handleRetry() {
    if (busy) {
      return;
    }

    if (dataState !== "live" || !backendMode || !lastFailed) {
      setLastFailed(null);
      setError(null);
      void hydrate();
      return;
    }

    void streamRequest(
      lastFailed.kind,
      lastFailed.text,
      lastFailed.toolId,
      lastFailed.requestId,
    );
  }

  async function handleMaterializeArtifact() {
    if (
      !activeArtifactDetail ||
      !activeArtifactDetail.applyCapabilities.materializeLearningRecommendation
    ) {
      return;
    }

    try {
      setBusy(true);
      setError(null);
      await requestJson(
        `/api/vera-ai/artifacts/${activeArtifactDetail.id}/materialize/learning-recommendation`,
        {
          method: "POST",
          body: JSON.stringify({
            clientRequestId: crypto.randomUUID(),
            expectedArtifactRevision: activeArtifactDetail.revision,
            materializationSchemaVersion: "1",
          }),
        },
      );
      setNotice("Rute berhasil disimpan sebagai rekomendasi belajar.");
    } catch (caught) {
      setError(veraErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyArtifact(target: VeraBackendArtifactTarget) {
    if (!activeArtifactDetail) {
      return;
    }

    try {
      setBusy(true);
      setError(null);
      await requestJson(`/api/vera-ai/artifacts/${activeArtifactDetail.id}/apply`, {
        method: "POST",
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          registryKey: target.registryKey,
          targetId: target.id,
          expectedTargetRevision: target.revision,
        }),
      });
      setNotice(`Hasil diterapkan ke ${target.label}.`);
      await openBackendArtifact(activeArtifactDetail.id);
    } catch (caught) {
      setError(veraErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return {
    activeArtifact,
    activeArtifactDetail,
    activeSession,
    backendMode,
    busy,
    contextDialogOpen,
    contextSources,
    draft,
    error: backendError ?? error,
    fullscreenArtifact,
    fullscreenArtifactDetail,
    generatedArtifacts,
    generatedArtifactSummaries: backendArtifacts,
    notice,
    notificationFeed,
    onApplyArtifact: handleApplyArtifact,
    onCancelRequest: handleCancelRequest,
    onCloseArtifact: () => {
      setActiveArtifactId(null);
      setActiveArtifactDetail(null);
    },
    onCloseFullscreen: () => setFullscreenArtifactId(null),
    onContextDialogOpenChange: setContextDialogOpen,
    onDraftChange: setDraft,
    onExpandArtifact: setFullscreenArtifactId,
    onGenerateTool: handleToolRequest,
    onMaterializeArtifact: handleMaterializeArtifact,
    onNewSession: handleNewSession,
    onOpenAddContext: () => setContextDialogOpen(true),
    onOpenArtifact: handleOpenArtifact,
    onRemoveContexts: handleRemoveContexts,
    onRenameSession: handleRenameSession,
    onRetry: handleRetry,
    onSaveContext: handleSaveContext,
    onSelectSession: handleSelectSession,
    onSend: handleSend,
    onSessionSidebarCollapsedChange: setSessionSidebarCollapsed,
    onSetWorkspaceTab: setWorkspaceTab,
    onToggleContext: handleToggleContext,
    progress,
    provisionalText,
    selectedSources,
    session,
    sessionSidebarCollapsed,
    sessions,
    usage,
    dataAsOf,
    dataState,
    workspaceTab,
  };
}

function VeraAiPageModule({ notificationFeed, session }: { notificationFeed: StudentNotificationFeed; session: SessionContext }) {
  const workspaceProps = useVeraAiModuleState({ notificationFeed, session });
  return <VeraAiWorkspace {...workspaceProps} />;
}

function VeraStatusBanner({
  busy,
  error,
  notice,
  onCancel,
  onRetry,
  progress,
}: {
  busy: boolean;
  error: string | null;
  notice: string | null;
  onCancel: () => void;
  onRetry: () => void;
  progress: number | null;
}) {
  if (!busy && !error && !notice) {
    return null;
  }

  const statusText = error ?? notice ?? (progress !== null
    ? `Vera sedang menyusun hasil… ${progress}%`
    : "Vera sedang menyusun jawaban…");

  return (
    <div
      aria-live={error ? "assertive" : "polite"}
      className={cn(
        "mb-2 flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-xs font-medium",
        error
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-primary-100 bg-primary-50 text-primary-800",
      )}
      role={error ? "alert" : "status"}
    >
      <span className="min-w-0 truncate">
        {statusText}
      </span>
      {busy ? (
        <Button
          className="shrink-0 rounded-full"
          onClick={onCancel}
          size="sm"
          variant="outline"
        >
          <X data-icon="inline-start" />
          Batalkan
        </Button>
      ) : error ? (
        <Button
          className="shrink-0 rounded-full"
          onClick={onRetry}
          size="sm"
          variant="outline"
        >
          <RotateCcw data-icon="inline-start" />
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}

const DATA_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function VeraProvenanceBanner({
  dataAsOf,
  session,
}: {
  dataAsOf: string | null;
  session: StudySession;
}) {
  const state = session.provenance?.state ?? "live";
  const asOf = dataAsOf ? new Date(dataAsOf) : null;
  const timestamp = asOf && !Number.isNaN(asOf.getTime())
    ? DATA_TIMESTAMP_FORMATTER.format(asOf)
    : "belum tersedia";

  return (
    <div
      aria-label="Status sumber data Vera"
      className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary-100 bg-primary-50/55 px-3 py-2 text-xs text-secondary-600"
      role="status"
    >
      <span className="font-semibold text-primary-900">Sumber data: {state}</span>
      <span>Dimuat {timestamp} · konteks dan hasil mengikuti status server</span>
    </div>
  );
}

function VeraDataStatePanel({
  dataState,
  error,
  onRetry,
}: {
  dataState: Exclude<VeraDataState, "live">;
  error: string | null;
  onRetry: () => void;
}) {
  const loading = dataState === "loading";

  return (
    <section
      aria-live={loading ? "polite" : "assertive"}
      className="mx-auto flex min-h-[min(32rem,calc(100svh-8rem))] w-full max-w-3xl flex-col items-center justify-center rounded-[2rem] border border-primary-100 bg-white px-6 py-12 text-center shadow-[0_18px_54px_-46px_rgba(1,76,56,0.42)]"
      role={loading ? "status" : "alert"}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
        {loading ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /> : <Gauge className="size-5" />}
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-secondary-950">
        {loading ? "Memuat ruang kerja Vera…" : "Data Vera belum tersedia"}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-secondary-600">
        {loading
          ? "Sesi, sumber belajar, dan penggunaan sedang dimuat dari server."
          : error ?? "Sesi, sumber belajar, dan penggunaan belum dapat dimuat dari server."}
      </p>
      {!loading ? (
        <Button className="mt-6 rounded-full" onClick={onRetry} variant="brand">
          <RotateCcw data-icon="inline-start" />
          Coba lagi
        </Button>
      ) : null}
    </section>
  );
}

function VeraTopBar({
  notificationFeed,
  session,
  usage,
}: {
  notificationFeed: StudentNotificationFeed;
  session: SessionContext;
  usage: VeraBackendUsage | null;
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
          <VeraUsagePopover usage={usage} />
          <StudentNotificationPopover items={notificationFeed.items} unreadCount={notificationFeed.unreadCount} />
          <StudentAccountMenu extraItem="notifications" session={session} />
        </div>
      </div>
    </header>
  );
}

function VeraUsagePopover({ usage }: { usage: VeraBackendUsage | null }) {
  const usedUnits = usage?.usedQuotaUnits ?? null;
  const limitUnits = usage?.quotaLimitUnits ?? null;
  const usagePercent = usage && limitUnits && limitUnits > 0
    ? Math.min(100, Math.round((usage.usedQuotaUnits / limitUnits) * 100))
    : null;
  const usageState = usage
    ? !usage.redisAvailable
      ? "Pembatas permintaan tidak tersedia"
      : !usage.providerAvailable
        ? "Penyedia AI tidak tersedia"
        : usage.quotaDebtUnits > 0
          ? `Overrun ${usage.quotaDebtUnits} unit`
          : usage.usedQuotaUnits + usage.reservedQuotaUnits >= usage.quotaLimitUnits
            ? "Kuota habis"
            : usage.reservedQuotaUnits > 0
              ? `${usage.reservedQuotaUnits} unit sedang diproses`
              : usage.rawTokenUsageState === "unknown"
                ? "Penggunaan token belum diketahui"
                : "Tersedia"
    : "Data penggunaan belum tersedia dari server.";

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={usagePercent === null
              ? "Penggunaan Vera belum tersedia"
              : `Penggunaan Vera ${usagePercent} persen`}
            className="rounded-full px-2.5"
            size="sm"
            variant="ghost"
          />
        }
      >
        <Gauge data-icon="inline-start" />
        <span className="hidden text-xs tabular-nums sm:inline">
          {usagePercent === null ? "—" : `${usagePercent}%`}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" sideOffset={10}>
        <PopoverHeader>
          <PopoverTitle>Penggunaan Vera</PopoverTitle>
          <PopoverDescription>
            {usageState}
          </PopoverDescription>
        </PopoverHeader>

        {usage && usagePercent !== null && usedUnits !== null && limitUnits !== null ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-secondary-800">Unit periode ini</span>
              <span className="tabular-nums text-secondary-500">
                {usedUnits.toLocaleString("id-ID")} / {limitUnits.toLocaleString("id-ID")}
              </span>
            </div>
            <Progress aria-label="Penggunaan token Vera" value={usagePercent} />
            <p className="text-xs leading-5 text-secondary-500">
              Periode {usage.usageDate ?? "belum tersedia"} · zona {usage.quotaTimezone ?? "belum tersedia"}
            </p>
          </div>
        ) : (
          <p className="text-sm leading-6 text-secondary-600">
            Angka kuota dan waktu reset tidak ditampilkan sampai sumber akun berhasil dibaca.
          </p>
        )}

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
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/50 px-3 py-5 text-center text-xs leading-5 text-secondary-500">
              Belum ada sesi belajar. Buat sesi baru untuk mulai berbicara
              dengan Vera.
            </div>
          ) : sessions.map((item) => {
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
  busy,
  className,
  draft,
  onDraftChange,
  onCancel,
  onRenameSession,
  onSend,
  provisionalText,
}: {
  activeSession: StudySession;
  busy: boolean;
  className?: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onRenameSession: (title: string) => void;
  onSend: () => void;
  provisionalText: string | null;
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
          {activeSession.messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
            />
          ))}
          {provisionalText !== null ? (
            <ProvisionalMessageCard body={provisionalText} />
          ) : null}
        </div>
      </div>

      <ChatComposer
        busy={busy}
        draft={draft}
        onDraftChange={onDraftChange}
        onCancel={onCancel}
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
  const backendMetadata = [
    source.subtitle,
    source.releasedAt
      ? `Dirilis ${DATA_TIMESTAMP_FORMATTER.format(new Date(source.releasedAt))}`
      : null,
  ].filter(Boolean);

  if (backendMetadata.length > 0) {
    return backendMetadata.join(" • ");
  }

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
        <span className="mt-1 block truncate text-xs text-secondary-500">
          {contextMetadataForSource(source)}
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
  message,
}: {
  message: VeraMessage;
}) {
  const isStudent = message.role === "student";
  const stateNotice = [
    message.contentState && message.contentState !== "encrypted"
      ? `Konten: ${message.contentState}`
      : null,
    message.requestState && message.requestState !== "succeeded"
      ? `Permintaan: ${message.requestState}`
      : null,
    message.requestErrorCode ? `Kode: ${message.requestErrorCode}` : null,
  ].filter(Boolean).join(" · ");

  if (isStudent) {
    return (
      <Bubble
        align="end"
        className="max-w-[84%]"
      >
        <BubbleContent className="rounded-[1.35rem] rounded-br-md px-4 py-3 leading-6 shadow-[0_12px_28px_-22px_rgba(1,76,56,0.7)]">
          <p>{message.body}</p>
          {stateNotice ? (
            <p className="mt-1.5 text-xs text-white/70">{stateNotice}</p>
          ) : null}
          <p className="mt-1.5 text-right text-[11px] text-white/60">
            {message.createdAt}
          </p>
        </BubbleContent>
      </Bubble>
    );
  }

  return (
    <article
      className="flex items-start gap-3.5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary-100 bg-white shadow-sm">
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
        {stateNotice ? (
          <p className="mt-1 text-xs text-secondary-500">{stateNotice}</p>
        ) : null}
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

function ProvisionalMessageCard({ body }: { body: string }) {
  return (
    <article className="flex items-start gap-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary-100 bg-white shadow-sm">
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
          <LoaderCircle className="size-3.5 animate-spin text-primary-600" />
        </div>
        <BubbleContent className="mt-2 max-w-[68ch] rounded-2xl border border-dashed border-primary-200 bg-primary-50/45 px-4 py-3 text-[0.95rem] leading-7 text-secondary-700">
          {body || "Vera sedang menyusun jawaban…"}
        </BubbleContent>
      </Bubble>
    </article>
  );
}

function ChatComposer({
  busy,
  draft,
  onDraftChange,
  onCancel,
  onSend,
}: {
  busy: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
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
            disabled={busy}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Tanyakan konsep, soal, atau langkah belajarmu..."
            value={draft}
          />
          {busy ? (
            <Button
              aria-label="Batalkan permintaan Vera"
              className="rounded-full"
              onClick={onCancel}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <X />
            </Button>
          ) : (
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
          )}
        </div>
      </form>
    </div>
  );
}

function StudioPanel({
  activeArtifact,
  activeArtifactDetail,
  busy,
  className,
  generatedArtifacts,
  generatedArtifactSummaries,
  onCloseArtifact,
  onExpandArtifact,
  onGenerateTool,
  onMaterializeArtifact,
  onApplyArtifact,
  onOpenArtifact,
}: {
  activeArtifact: VeraStudioTool | null;
  activeArtifactDetail: VeraBackendArtifactDetail | null;
  busy: boolean;
  className?: string;
  generatedArtifacts: VeraStudioTool[];
  generatedArtifactSummaries: VeraBackendArtifactSummary[];
  onCloseArtifact: () => void;
  onExpandArtifact: (toolId: VeraToolId) => void;
  onGenerateTool: (toolId: VeraToolId) => void;
  onMaterializeArtifact: () => void;
  onApplyArtifact: (target: VeraBackendArtifactTarget) => void;
  onOpenArtifact: (toolId: VeraToolId) => void;
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
            backendArtifact={activeArtifactDetail}
            tool={activeArtifact}
          />
          {activeArtifactDetail ? (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-4">
              {activeArtifactDetail.applyCapabilities
                .materializeLearningRecommendation ? (
                <Button
                  className="rounded-full"
                  disabled={busy}
                  onClick={onMaterializeArtifact}
                  variant="brand"
                >
                  Simpan sebagai rekomendasi belajar
                </Button>
              ) : null}
              {activeArtifactDetail.applyCapabilities.targets.length > 0 ? (
                <div className="border-t border-primary-100 pt-3">
                  <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-secondary-500 uppercase">
                    Terapkan ke target yang ada
                  </p>
                  <div className="flex flex-col gap-2">
                    {activeArtifactDetail.applyCapabilities.targets.map(
                      (target) => (
                        <Button
                          className="justify-between rounded-2xl"
                          disabled={busy}
                          key={`${target.registryKey}:${target.id}`}
                          onClick={() => onApplyArtifact(target)}
                          variant="outline"
                        >
                          <span className="truncate">{target.label}</span>
                          <span className="text-xs text-secondary-500">
                            Revisi {target.revision}
                          </span>
                        </Button>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
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
                  summary={generatedArtifactSummaries.find(
                    (artifact) => artifact.artifactType === tool.id,
                  )}
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
  summary,
  tool,
}: {
  index: number;
  onOpen: () => void;
  summary?: VeraBackendArtifactSummary;
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
            {summary?.title ?? tool.outputTitle}
          </span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-secondary-500">
            {summary
              ? `${summary.artifactType} · ${summary.lifecycleState} · hasil ${summary.resultState} · konteks ${summary.contextState} · ${relativeTime(summary.createdAt)}`
              : tool.outputBody}
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
  backendArtifact,
  compact = false,
  tool,
}: {
  backendArtifact?: VeraBackendArtifactDetail | null;
  compact?: boolean;
  tool: VeraStudioTool;
}) {
  const Icon = toolIcons[tool.id];
  const markdown = backendArtifact?.markdown;

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

      {backendArtifact ? (
        <dl className="mt-4 grid gap-2 rounded-2xl border border-primary-100 bg-primary-50/45 p-3 text-xs text-secondary-600 sm:grid-cols-3">
          <div>
            <dt className="font-semibold text-secondary-500">Siklus</dt>
            <dd className="mt-1 text-secondary-800">{backendArtifact.lifecycle.state}</dd>
          </div>
          <div>
            <dt className="font-semibold text-secondary-500">Hasil</dt>
            <dd className="mt-1 text-secondary-800">{backendArtifact.resultState}</dd>
          </div>
          <div>
            <dt className="font-semibold text-secondary-500">Konteks</dt>
            <dd className="mt-1 text-secondary-800">{backendArtifact.contextState}</dd>
          </div>
        </dl>
      ) : null}

      {markdown ? (
        <StudioArtifactMarkdown compact={compact} content={markdown} />
      ) : (
        <div
          aria-live="polite"
          className="mt-6 rounded-2xl border border-dashed border-primary-200 bg-primary-50/45 px-4 py-5 text-sm leading-6 text-secondary-600"
          role="status"
        >
          Dokumen hasil belum tersedia dari server.
        </div>
      )}
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
  backendArtifact,
  onOpenChange,
  open,
  tool,
}: {
  backendArtifact: VeraBackendArtifactDetail | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  tool: VeraStudioTool | null;
}) {
  if (!tool) {
    return null;
  }

  const artifactTitle = backendArtifact?.title ?? tool.outputTitle;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="inset-3 left-3 top-3 h-[calc(100svh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-[2rem] border border-primary-100 bg-white p-0 sm:max-w-none"
        showCloseButton={false}
        variant="info"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{artifactTitle}</DialogTitle>
          <DialogDescription>
            Dokumen belajar yang dihasilkan Vera Studio.
          </DialogDescription>
        </DialogHeader>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-primary-100 bg-white px-4 py-3 md:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-secondary-900">
                {artifactTitle}
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
              backendArtifact={backendArtifact}
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
  backendMode,
  onOpenChange,
  onSave,
  open,
  selectedSourceIds,
}: {
  availableSources: VeraContextSource[];
  backendMode: boolean;
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
  const backendCatalogSources = useMemo(
    () =>
      backendMode
        ? availableSources.filter(
            (source) => source.type === "practice" || source.type === "material",
          )
        : [],
    [availableSources, backendMode],
  );
  const backendMaterialSources = useMemo(() => {
    const query = materialQuery.trim().toLowerCase();

    return backendCatalogSources.filter(
      (source) =>
        source.type === "material" &&
        (!query || source.title.toLowerCase().includes(query)),
    );
  }, [backendCatalogSources, materialQuery]);
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
          backendMode={backendMode}
          backendCatalogSources={backendCatalogSources}
          backendMaterialSources={backendMaterialSources}
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

                onSave(draftSourceIds, backendMode ? [] : addedSources);
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

function AddContextPracticeTab({
  backendCatalogSources,
  backendMode,
  draftSourceIds,
  onPracticePageChange,
  onToggleSource,
  pendingAddedSourceIdSet,
  practicePage,
  practicePageCount,
  visiblePracticeItems,
}: {
  backendCatalogSources: VeraContextSource[];
  backendMode: boolean;
  draftSourceIds: string[];
  onPracticePageChange: (page: number) => void;
  onToggleSource: (sourceId: string) => void;
  pendingAddedSourceIdSet: Set<string>;
  practicePage: number;
  practicePageCount: number;
  visiblePracticeItems: VeraPracticeHistory[];
}) {
  const practiceSources = backendMode
    ? backendCatalogSources.filter((source) => source.type === "practice")
    : [];
  const draftSourceIdSet = new Set(draftSourceIds);

  return (
    <TabsContent className="min-h-0 overflow-hidden" value="practice">
      <ScrollArea className="h-full">
        <div className="flex min-h-full flex-col bg-primary-50/25 px-4 py-4 md:px-8 md:py-5">
          <div className="flex flex-col gap-3">
            {backendMode ? (
              practiceSources.length > 0 ? (
                practiceSources.map((source) => (
                  <BackendContextOption
                    key={source.id}
                    onToggle={() => onToggleSource(source.id)}
                    selected={draftSourceIdSet.has(source.id)}
                    source={source}
                  />
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-primary-200 bg-background p-6 text-center text-sm leading-6 text-secondary-500">
                  Belum ada hasil latihan yang tersedia.
                </div>
              )
            ) : visiblePracticeItems.length > 0 ? (
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
          {!backendMode ? (
            <ContextPagination
              className="mt-auto"
              onPageChange={onPracticePageChange}
              page={practicePage}
              pageCount={practicePageCount}
            />
          ) : null}
        </div>
      </ScrollArea>
    </TabsContent>
  );
}

function AddContextMaterialTab({
  backendMaterialSources,
  backendMode,
  draftSourceIds,
  filteredMaterials,
  materialPage,
  materialPageCount,
  materialQuery,
  onMaterialPageChange,
  onMaterialQueryChange,
  onToggleSource,
  pendingAddedSourceIdSet,
  visibleMaterialItems,
}: {
  backendMaterialSources: VeraContextSource[];
  backendMode: boolean;
  draftSourceIds: string[];
  filteredMaterials: VeraMaterialHistory[];
  materialPage: number;
  materialPageCount: number;
  materialQuery: string;
  onMaterialPageChange: (page: number) => void;
  onMaterialQueryChange: (query: string) => void;
  onToggleSource: (sourceId: string) => void;
  pendingAddedSourceIdSet: Set<string>;
  visibleMaterialItems: VeraMaterialHistory[];
}) {
  const draftSourceIdSet = new Set(draftSourceIds);

  return (
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
            {backendMode ? (
              backendMaterialSources.length > 0 ? (
                backendMaterialSources.map((source) => (
                  <BackendContextOption
                    key={source.id}
                    onToggle={() => onToggleSource(source.id)}
                    selected={draftSourceIdSet.has(source.id)}
                    source={source}
                  />
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-primary-200 bg-background p-6 text-center text-sm leading-6 text-secondary-500">
                  {materialQuery.trim()
                    ? "Materi tidak ditemukan."
                    : "Belum ada materi yang tersedia."}
                </div>
              )
            ) : filteredMaterials.length > 0 ? (
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
          {!backendMode && filteredMaterials.length > 0 ? (
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
  );
}

function AddContextDocumentTab({
  backendMode,
  draftSourceIds,
  onToggleSource,
  onUploadedFileNameChange,
  onUploadedSourceChange,
  uploadedFileName,
  uploadedSource,
}: {
  backendMode: boolean;
  draftSourceIds: string[];
  onToggleSource: (sourceId: string) => void;
  onUploadedFileNameChange: (name: string | null) => void;
  onUploadedSourceChange: (source: VeraContextSource | null) => void;
  uploadedFileName: string | null;
  uploadedSource: VeraContextSource | null;
}) {
  return (
    <TabsContent className="min-h-0 overflow-hidden" value="document">
      <ScrollArea className="h-full">
        <div className="flex min-h-full flex-col bg-primary-50/25 px-4 py-4 md:px-8 md:py-5">
          {backendMode ? (
            <div className="flex min-h-48 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-background p-6 text-center">
              <FileText className="size-6 text-secondary-400" />
              <p className="mt-3 text-sm font-semibold text-secondary-900">
                Dokumen belum tersedia
              </p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-secondary-500">
                Vera saat ini hanya dapat memakai materi dan hasil latihan
                yang sudah dirilis.
              </p>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </ScrollArea>
    </TabsContent>
  );
}

function AddContextTabs({
  activeTab,
  backendCatalogSources,
  backendMaterialSources,
  backendMode,
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
  backendCatalogSources: VeraContextSource[];
  backendMaterialSources: VeraContextSource[];
  backendMode: boolean;
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
        <FullWidthLineTabsList className="md:!h-12">
          <FullWidthLineTabsTrigger
            className="px-2 py-1.5 text-xs md:px-4 md:text-sm"
            value="practice"
          >
            <ListChecks data-icon="inline-start" />
            Hasil Latihan
          </FullWidthLineTabsTrigger>
          <FullWidthLineTabsTrigger
            className="px-2 py-1.5 text-xs md:px-4 md:text-sm"
            value="material"
          >
            <BookOpen data-icon="inline-start" />
            Materi
          </FullWidthLineTabsTrigger>
          <FullWidthLineTabsTrigger
            className="px-2 py-1.5 text-xs md:px-4 md:text-sm"
            disabled={backendMode}
            value="document"
          >
            <FileText data-icon="inline-start" />
            Dokumen
          </FullWidthLineTabsTrigger>
        </FullWidthLineTabsList>
      </div>

      <AddContextPracticeTab
        backendCatalogSources={backendCatalogSources}
        backendMode={backendMode}
        draftSourceIds={draftSourceIds}
        onPracticePageChange={onPracticePageChange}
        onToggleSource={onToggleSource}
        pendingAddedSourceIdSet={pendingAddedSourceIdSet}
        practicePage={practicePage}
        practicePageCount={practicePageCount}
        visiblePracticeItems={visiblePracticeItems}
      />

      <AddContextMaterialTab
        backendMaterialSources={backendMaterialSources}
        backendMode={backendMode}
        draftSourceIds={draftSourceIds}
        filteredMaterials={filteredMaterials}
        materialPage={materialPage}
        materialPageCount={materialPageCount}
        materialQuery={materialQuery}
        onMaterialPageChange={onMaterialPageChange}
        onMaterialQueryChange={onMaterialQueryChange}
        onToggleSource={onToggleSource}
        pendingAddedSourceIdSet={pendingAddedSourceIdSet}
        visibleMaterialItems={visibleMaterialItems}
      />

      <AddContextDocumentTab
        backendMode={backendMode}
        draftSourceIds={draftSourceIds}
        onToggleSource={onToggleSource}
        onUploadedFileNameChange={onUploadedFileNameChange}
        onUploadedSourceChange={onUploadedSourceChange}
        uploadedFileName={uploadedFileName}
        uploadedSource={uploadedSource}
      />
    </Tabs>
  );
}

function BackendContextOption({
  onToggle,
  selected,
  source,
}: {
  onToggle: () => void;
  selected: boolean;
  source: VeraContextSource;
}) {
  const Icon = contextTypeIcons[source.type];

  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex min-h-18 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40",
        selected
          ? "border-primary-300 bg-primary-50 shadow-[0_14px_30px_-28px_rgba(1,76,56,0.75)]"
          : "border-primary-100 bg-background hover:border-primary-200 hover:bg-primary-50/40",
      )}
      onClick={onToggle}
      type="button"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800 md:size-10">
        <Icon className="size-4" aria-hidden="true" />
      </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-secondary-950 md:text-base">
            {source.title}
          </span>
          <span className="block truncate text-xs text-secondary-500">
            {source.subtitle ?? contextTypeLabels[source.type]}
          </span>
          {source.releasedAt ? (
            <span className="block truncate text-[11px] text-secondary-400">
              Dirilis {DATA_TIMESTAMP_FORMATTER.format(new Date(source.releasedAt))}
            </span>
          ) : null}
        </span>
      {selected ? <Check className="shrink-0 text-primary-700" /> : null}
    </button>
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

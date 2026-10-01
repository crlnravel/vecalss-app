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
  Archive,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  FileQuestion,
  FileText,
  Gauge,
  House,
  ListChecks,
  LoaderCircle,
  Maximize2,
  MessageCircleMore,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Trash2,
  X,
  type AppIcon,
} from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
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
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  FullWidthTabsList,
  FullWidthTabsTrigger,
} from "@/components/ui/full-width-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { buildStudentReturnHref } from "@/lib/navigation/canonical-context";
import { cn } from "@/lib/utils";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { StudentNotificationPopover } from "@/modules/student/components/student-notification-popover";

import { veraStudioTools, type VeraStudioTool, type VeraToolId } from "./data";
import {
  isVeraAutomaticContextEnabled,
  readVeraAutomaticContextProgress,
  readVeraContextAuthority,
  readVeraRequestEvidenceState,
  readVeraRequestSources,
  type VeraAutomaticContextAuthority,
  type VeraAutomaticContextEvidenceState,
  type VeraAutomaticContextProgress,
  type VeraRequestSourceSummary,
} from "./automatic-context";
import { createVeraConversationResolver } from "./conversation-session";

type WorkspaceTab = "chat" | "studio";
type VeraDataState = "loading" | "live" | "unavailable";

type VeraBackendConversation = {
  id: string;
  conversationType: string;
  title: string | null;
  archivedAt: string | null;
  version: number;
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
  citationKeys?: string[];
  citations?: string[];
  contextMode?: unknown;
  contextState?: unknown;
  evidenceState?: unknown;
  sourceOutcome?: unknown;
  requestSources?: unknown[];
  sources?: unknown[];
  request?: {
    id: string;
    status: string;
    errorCode: string | null;
    contextMode?: unknown;
    citationKeys?: string[];
    contextState?: unknown;
    evidenceState?: unknown;
    sourceOutcome?: unknown;
    requestSources?: unknown[];
    sources?: unknown[];
    result?: {
      text?: string | null;
      citationKeys?: string[];
      contextMode?: unknown;
      contextState?: unknown;
      evidenceState?: unknown;
      sourceOutcome?: unknown;
      requestSources?: unknown[];
      sources?: unknown[];
    } | null;
  } | null;
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

type VeraUsageWindow = {
  periodKind: "day" | "iso_week" | "month";
  windowKey: string;
  windowStart: string;
  windowEnd: string;
  resetAt: string;
  creditLimit: number;
  consumedCredits: number;
  reservedCredits: number;
  remainingCredits: number;
  costLimitUsdMicros: string;
  reservedUsdMicros: string;
  settledUsdMicros: string;
  unknownUsdMicros: string;
  overrunUsdMicros: string;
  monetaryDebtState: "clear" | "debt";
};

type VeraProviderSpend = {
  costLimitUsdMicros: string;
  settledUsdMicros: string;
  reservedUsdMicros: string;
  unknownUsdMicros: string;
  overrunUsdMicros: string;
  exposureUsdMicros: string;
  remainingUsdMicros: string;
};

type VeraBackendUsage = {
  ledgerVersion?: string;
  quotaTimezone?: string;
  quotaTimezonePolicyVersion?: string;
  policyBundleVersion?: string;
  creditLimit?: number;
  consumedCredits?: number;
  reservedCredits?: number;
  remainingCredits?: number;
  monetaryDebtState?: "clear" | "debt";
  providerSpend?: VeraProviderSpend;
  windows?: VeraUsageWindow[];
  usageDate?: string;
  quotaLimitUnits?: number;
  usedQuotaUnits?: number;
  reservedQuotaUnits?: number;
  quotaDebtUnits?: number;
  quotaOverrunLockUntil?: string | null;
  rawTokenUsageState?: string;
  providerAvailable: boolean;
  redisAvailable: boolean;
};

type VeraBackendInitialLoad = {
  conversations: VeraBackendConversation[];
  defaultConversationId: string | null;
  contextMode?: unknown;
  automaticContext?: unknown;
};

type VeraRequestStatus = {
  requestId: string;
  conversationId: string;
  clientRequestId: string;
  state: string;
  resultState: string;
  errorCode: string | null;
  contextMode?: unknown;
  contextState?: unknown;
  evidenceState?: unknown;
  sourceOutcome?: unknown;
  requestSources?: unknown[];
  sources?: unknown[];
  result: {
    text: string | null;
    citationKeys: string[];
    contextMode?: unknown;
    contextState?: unknown;
    evidenceState?: unknown;
    sourceOutcome?: unknown;
    requestSources?: unknown[];
    sources?: unknown[];
  } | null;
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
    const errorPayload = (await response
      .json()
      .catch(() => ({ error: "invalid_response" }))) as { error?: string };
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
  context_limit_reached: "Maksimal 4 sumber dapat dipakai dalam satu sesi.",
  context_release_unavailable: "Sumber ini sudah tidak tersedia untuk dipakai.",
  context_version_conflict:
    "Konteks berubah di perangkat lain. Pilihan terbaru sudah dimuat.",
  conversation_version_conflict:
    "Judul sesi berubah di perangkat lain. Versi terbaru sudah dimuat.",
  idempotency_config_missing:
    "Layanan Vera belum siap menerima permintaan aman. Coba lagi nanti.",
  idempotency_conflict: "Permintaan ini sudah dipakai untuk aksi lain.",
  idempotency_key_expired: "Permintaan Vera sudah kedaluwarsa. Coba lagi.",
  invalid_request:
    "Permintaan Vera belum lengkap. Periksa kembali lalu coba lagi.",
  malformed_output:
    "Vera menghasilkan jawaban yang belum dapat dipakai. Coba lagi.",
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
  vera_unavailable: "Vera sedang tidak tersedia. Coba lagi sebentar.",
};

function formatVeraRequestErrorCode(code: string | null | undefined) {
  if (!code) return null;
  return veraErrorLabels[code] ?? "Terjadi kendala saat memproses permintaan.";
}

function veraErrorMessage(error: unknown) {
  const code =
    error instanceof VeraRequestError
      ? error.code
      : error instanceof Error
        ? error.message
        : "vera_unavailable";

  return veraErrorLabels[code] ?? veraErrorLabels.vera_unavailable;
}

function mapBackendConversation(
  conversation: VeraBackendConversation,
): StudySession {
  return {
    id: conversation.id,
    title: conversation.title ?? "Sesi baru",
    archivedAt: conversation.archivedAt ?? null,
    updatedAt: relativeTime(conversation.updatedAt),
    generatedTools: [],
    messages: [],
    version: conversation.version,
  };
}

function mapBackendMessage(message: VeraBackendMessage): VeraMessage {
  const request = message.request;
  const requestResult = request?.result;
  const requestSources =
    [
      readVeraRequestSources(request),
      readVeraRequestSources(requestResult),
      readVeraRequestSources(message),
    ].find((sources) => sources.length > 0) ?? [];
  const evidenceState =
    readVeraRequestEvidenceState(request) ??
    readVeraRequestEvidenceState(requestResult) ??
    readVeraRequestEvidenceState(message);
  const requestContextMode =
    request?.contextMode ?? requestResult?.contextMode ?? message.contextMode;

  return {
    id: message.id,
    role: message.role === "assistant" ? "vera" : "student",
    body: message.text ?? "Konten tidak tersedia.",
    contentState: message.contentState,
    createdAt: relativeTime(message.createdAt),
    citations:
      requestResult?.citationKeys ??
      request?.citationKeys ??
      message.citationKeys ??
      message.citations,
    requestContextMode:
      requestContextMode === "automatic"
        ? "automatic"
        : requestContextMode === "legacy"
          ? "legacy"
          : null,
    requestErrorCode: request?.errorCode ?? null,
    requestEvidenceState: evidenceState,
    requestSources,
    requestId: request?.id ?? null,
    requestState: request?.status ?? null,
  };
}

function isTerminalRequestState(state: string) {
  return ["succeeded", "fallback", "failed", "rejected", "expired"].includes(
    state,
  );
}

function buildVeraRequestPayload({
  authority,
  clientRequestId,
  kind,
  retryOfRequestId,
  text,
  toolId,
}: {
  authority: VeraAutomaticContextAuthority;
  clientRequestId: string;
  kind: "chat" | "studio";
  retryOfRequestId: string | null;
  text: string;
  toolId: VeraToolId | null;
}) {
  const automatic = isVeraAutomaticContextEnabled(authority);

  const base = {
    clientRequestId,
    kind,
    toolId,
    text,
    options: {},
    retryOfRequestId,
  };

  return automatic
    ? { ...base, contextMode: "automatic" as const }
    : { ...base, contextMode: "legacy" as const };
}

function automaticProgressFromEvent(
  event: string | undefined,
  value: unknown,
): VeraAutomaticContextProgress | null {
  const parsed = readVeraAutomaticContextProgress(value);
  if (parsed) return parsed;

  const normalizedEvent = event?.toLowerCase() ?? "";
  if (
    normalizedEvent.includes("selector") ||
    normalizedEvent.includes("selection")
  ) {
    return { phase: "selecting", progress: null };
  }
  if (
    normalizedEvent.includes("retriev") ||
    normalizedEvent.includes("registry")
  ) {
    return { phase: "retrieving", progress: null };
  }
  if (
    normalizedEvent.includes("answer") ||
    normalizedEvent.includes("final") ||
    normalizedEvent.includes("first_token")
  ) {
    return { phase: "answering", progress: null };
  }
  if (normalizedEvent.includes("committed")) {
    return { phase: "complete", progress: 100 };
  }

  switch (event) {
    case "context.selection.started":
    case "context.selection.updated":
      return { phase: "selecting", progress: null };
    case "context.retrieval.started":
    case "context.retrieval.updated":
      return { phase: "retrieving", progress: null };
    case "context.answer.started":
    case "message.delta":
    case "message.generated":
      return { phase: "answering", progress: null };
    case "message.committed":
      return { phase: "complete", progress: 100 };
    case "request.completed":
      return { phase: "complete", progress: 100 };
    default:
      return null;
  }
}

function automaticTerminalProgress(
  value: unknown,
): VeraAutomaticContextProgress | null {
  const status =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const result =
    status?.result &&
    typeof status.result === "object" &&
    !Array.isArray(status.result)
      ? status.result
      : null;

  const evidence =
    readVeraRequestEvidenceState(result) ?? readVeraRequestEvidenceState(value);
  if (evidence) {
    if (evidence === "no_match") return { phase: "no_match", progress: 100 };
    if (evidence === "evidence_limited") {
      return { phase: "evidence_limited", progress: 100 };
    }
    if (evidence === "unavailable" || evidence === "failed") {
      return { phase: "unavailable", progress: 100 };
    }
  }

  const resultState = readVeraAutomaticContextProgress({
    state: status?.resultState,
  });
  if (resultState && resultState.phase !== "complete") {
    return { ...resultState, progress: resultState.progress ?? 100 };
  }

  const parsed = readVeraAutomaticContextProgress(value);
  if (parsed) return parsed;
  if (
    status?.state === "failed" ||
    status?.state === "rejected" ||
    status?.state === "expired"
  ) {
    return { phase: "unavailable", progress: 100 };
  }
  if (status?.state === "succeeded" || status?.state === "fallback") {
    return { phase: "complete", progress: 100 };
  }
  return null;
}

type VeraMessage = {
  id: string;
  role: "vera" | "student";
  body: string;
  contentState?: string;
  createdAt: string;
  citations?: string[];
  requestContextMode?: "legacy" | "automatic" | null;
  requestErrorCode?: string | null;
  requestEvidenceState?: VeraAutomaticContextEvidenceState | null;
  requestId?: string | null;
  requestSources?: VeraRequestSourceSummary[];
  requestState?: string | null;
};

type StudySession = {
  id: string;
  title: string;
  archivedAt: string | null;
  updatedAt: string;
  generatedTools: VeraToolId[];
  messages: VeraMessage[];
  version?: number;
};

const studioToolIds: VeraToolId[] = ["analysis", "route", "review"];

const toolIcons: Record<VeraToolId, AppIcon> = {
  analysis: ChartNoAxesColumnIncreasing,
  route: ListChecks,
  review: FileQuestion,
};

const emptyStudySession: StudySession = {
  id: "",
  title: "Sesi baru",
  archivedAt: null,
  updatedAt: "",
  generatedTools: [],
  messages: [],
};

const legacyVeraContextAuthority = readVeraContextAuthority(null);

const toolRequestLabels: Record<VeraToolId, string> = {
  analysis: "Analisis kelemahanku dari konteks sesi ini.",
  route: "Susun rute belajar dari konteks sesi ini.",
  review: "Jelaskan jawaban salah yang paling penting.",
};

const VERA_ARTIFACT_TYPE_LABELS: Record<string, string> = {
  analysis: "Analisis kelemahan",
  drill: "Latihan adaptif",
  ptn: "Strategi PTN",
  review: "Tinjauan jawaban",
  route: "Rute belajar",
  summary: "Ringkasan belajar",
};

const VERA_STATE_LABELS: Record<string, string> = {
  active: "Aktif",
  available: "Tersedia",
  backend_visible: "Terlihat dari server",
  cancelled: "Dibatalkan",
  coarsened: "Disederhanakan",
  consumed: "Sudah digunakan",
  deleted: "Dihapus",
  encrypted: "Tersandi",
  expired: "Kedaluwarsa",
  failed: "Gagal",
  fallback: "Respons cadangan",
  legacy_plaintext: "Teks lama tanpa enkripsi",
  forward_only: "Hanya berlaku ke depan",
  live: "Live",
  materialized: "Disimpan",
  pending: "Menunggu",
  processing: "Diproses",
  purged: "Dihapus",
  purging: "Sedang dihapus",
  queued: "Dalam antrean",
  rejected: "Ditolak",
  released: "Dirilis",
  retired: "Dipensiunkan",
  staged: "Disiapkan",
  succeeded: "Berhasil",
  suppressed: "Disembunyikan",
  unavailable: "Tidak tersedia",
  unchanged: "Tidak berubah",
  visible: "Terlihat",
};

function humanizeVeraToken(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatVeraArtifactType(value: string) {
  return VERA_ARTIFACT_TYPE_LABELS[value] ?? humanizeVeraToken(value);
}

function formatVeraState(value: string | null | undefined) {
  if (!value) return "Belum tersedia";
  return VERA_STATE_LABELS[value] ?? humanizeVeraToken(value);
}

function isToolId(value: string | null): value is VeraToolId {
  return Boolean(value && ["analysis", "route", "review"].includes(value));
}

type VeraAiWorkspaceProps = {
  activeArtifact: VeraStudioTool | null;
  activeArtifactDetail: VeraBackendArtifactDetail | null;
  activeSession: StudySession;
  automaticContext: VeraAutomaticContextAuthority;
  automaticProgress: VeraAutomaticContextProgress | null;
  busy: boolean;
  requestCancelable: boolean;
  draft: string;
  fullscreenArtifact: VeraStudioTool | null;
  fullscreenArtifactDetail: VeraBackendArtifactDetail | null;
  generatedArtifacts: VeraStudioTool[];
  generatedArtifactSummaries: VeraBackendArtifactSummary[];
  error: string | null;
  recoveryStatus: string | null;
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
  onOpenArtifact: (toolId: VeraToolId) => void;
  onRetry: () => void;
  onArchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onRestoreSession: (sessionId: string) => void;
  onSend: () => void;
  onSelectSession: (sessionId: string) => void;
  onSessionSidebarCollapsedChange: (collapsed: boolean) => void;
  onSetWorkspaceTab: (tab: WorkspaceTab) => void;
  session: SessionContext;
  sessionSidebarCollapsed: boolean;
  sessions: StudySession[];
  usage: VeraBackendUsage | null;
  dataState: VeraDataState;
  workspaceTab: WorkspaceTab;
  returnToHref: string;
};

function VeraAiWorkspace({
  activeArtifact,
  activeArtifactDetail,
  activeSession,
  automaticContext,
  automaticProgress,
  busy,
  requestCancelable,
  draft,
  error,
  fullscreenArtifact,
  fullscreenArtifactDetail,
  generatedArtifacts,
  generatedArtifactSummaries,
  recoveryStatus,
  notificationFeed,
  onCloseArtifact,
  onCloseFullscreen,
  onCancelRequest,
  onDraftChange,
  onExpandArtifact,
  onGenerateTool,
  onNewSession,
  onOpenArtifact,
  onRetry,
  onArchiveSession,
  onDeleteSession,
  onRenameSession,
  onRestoreSession,
  onSend,
  onSelectSession,
  onSessionSidebarCollapsedChange,
  onSetWorkspaceTab,
  progress,
  provisionalText,
  session,
  sessionSidebarCollapsed,
  sessions,
  usage,
  dataState,
  workspaceTab,
  returnToHref,
}: VeraAiWorkspaceProps) {
  const [mobileSessionOpen, setMobileSessionOpen] = useState(false);
  const recoveryMessage = recoveryStatus ?? error;
  const noticeMessage = recoveryStatus
    ? "Memulihkan permintaan Vera…"
    : error
      ? "Jawaban Vera belum berhasil dibuat."
      : getVeraOperationStatusMessage(automaticProgress, progress);

  usePageStatusToast({
    active: busy || Boolean(recoveryMessage),
    action: !busy && recoveryMessage
      ? { label: error ? "Coba lagi" : "Periksa lagi", onClick: onRetry }
      : undefined,
    cancel: busy && requestCancelable
      ? { label: "Batalkan", onClick: onCancelRequest }
      : undefined,
    description: recoveryMessage ?? undefined,
    message: noticeMessage,
    variant: busy ? "info" : error ? "error" : "warning",
  });

  return (
    <div className="student-page-canvas vera-ai-motion min-h-svh text-secondary-900 md:h-svh md:overflow-hidden">
      <div className="flex min-h-svh flex-col md:h-svh">
        <VeraTopBar
          notificationFeed={notificationFeed}
          onOpenSessionSidebar={() => setMobileSessionOpen(true)}
          returnToHref={returnToHref}
          session={session}
          usage={usage}
        />
        <h1 className="sr-only">Vera AI Workspace: {activeSession.title}</h1>

        <main className="min-h-0 flex-1 px-2 pb-2 md:px-3 md:pb-3">
          {dataState === "live" ? (
            <div className="flex h-full min-h-0 min-w-0 gap-3">
              <aside
                className={cn(
                  "sticky top-0 hidden h-full shrink-0 self-start transition-[width] duration-200 motion-reduce:transition-none md:block",
                  sessionSidebarCollapsed ? "w-16" : "w-72",
                )}
              >
                <SessionSidebar
                  activeSessionId={activeSession.id}
                  collapsed={sessionSidebarCollapsed}
                  onArchiveSession={onArchiveSession}
                  onDeleteSession={onDeleteSession}
                  onNewSession={onNewSession}
                  onRenameSession={onRenameSession}
                  onRestoreSession={onRestoreSession}
                  onSetCollapsed={onSessionSidebarCollapsedChange}
                  onSelectSession={onSelectSession}
                  sessions={sessions}
                />
              </aside>
              <Tabs
                className="min-h-0 min-w-0 flex-1 gap-3"
                onValueChange={(value) =>
                  onSetWorkspaceTab(value as WorkspaceTab)
                }
                value={workspaceTab}
              >
                <VeraProgressIndicator automaticProgress={automaticProgress} progress={progress} />
                <WorkspaceTabs onChange={onSetWorkspaceTab} />
                <TabsContent
                  className="min-h-0 min-w-0 flex-1 overflow-hidden"
                  value="chat"
                >
                  <ChatWorkspace
                    activeSession={activeSession}
                    automaticProgress={automaticProgress}
                    automaticContextEnabled={isVeraAutomaticContextEnabled(
                      automaticContext,
                    )}
                    busy={busy}
                    className="flex h-full"
                    draft={draft}
                    onDraftChange={onDraftChange}
                    onCancel={onCancelRequest}
                    onSend={onSend}
                    provisionalText={provisionalText}
                  />
                </TabsContent>
                <TabsContent
                  className="min-h-0 min-w-0 flex-1 overflow-hidden"
                  value="studio"
                >
                  <StudioPanel
                    activeArtifact={activeArtifact}
                    activeArtifactDetail={activeArtifactDetail}
                    className="flex h-full"
                    generatedArtifacts={generatedArtifacts}
                    generatedArtifactSummaries={generatedArtifactSummaries}
                    onCloseArtifact={onCloseArtifact}
                    onExpandArtifact={onExpandArtifact}
                    onGenerateTool={onGenerateTool}
                    onOpenArtifact={onOpenArtifact}
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

      {dataState === "live" ? (
        <Dialog open={mobileSessionOpen} onOpenChange={setMobileSessionOpen}>
          <DialogContent
            className="flex h-[calc(100svh-2rem)] max-h-none w-[calc(100%-1rem)] max-w-md flex-col gap-3 overflow-hidden p-3 md:hidden"
            showCloseButton={false}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Sesi</DialogTitle>
              <DialogDescription>
                Pilih sesi atau buat sesi baru.
              </DialogDescription>
            </DialogHeader>
            <SessionPanel
              activeSessionId={activeSession.id}
              className="flex min-h-0 flex-1"
              onArchiveSession={onArchiveSession}
              onDeleteSession={onDeleteSession}
              onCollapse={() => setMobileSessionOpen(false)}
              onNewSession={onNewSession}
              onRenameSession={onRenameSession}
              onRestoreSession={onRestoreSession}
              onSelectSession={(sessionId) => {
                onSelectSession(sessionId);
                setMobileSessionOpen(false);
              }}
              sessions={sessions}
            />
          </DialogContent>
        </Dialog>
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

function useVeraAiModuleState({
  notificationFeed,
  returnToHref,
  session,
}: {
  notificationFeed: StudentNotificationFeed;
  returnToHref?: string;
  session: SessionContext;
}): ComponentProps<typeof VeraAiWorkspace> {
  const searchParams = useSearchParams();
  const requestedArtifact = searchParams.get("artifact");
  const requestedToolParam = searchParams.get("tool");
  const requestedTool = isToolId(requestedArtifact)
    ? requestedArtifact
    : isToolId(requestedToolParam)
      ? requestedToolParam
      : null;
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeArtifactId, setActiveArtifactId] = useState<VeraToolId | null>(
    requestedTool,
  );
  const [fullscreenArtifactId, setFullscreenArtifactId] =
    useState<VeraToolId | null>(null);
  const [draft, setDraft] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("chat");
  const [sessionSidebarCollapsed, setSessionSidebarCollapsed] = useState(true);
  const [automaticContext, setAutomaticContext] =
    useState<VeraAutomaticContextAuthority>(legacyVeraContextAuthority);
  const [backendMode, setBackendMode] = useState(false);
  const [dataState, setDataState] = useState<VeraDataState>("loading");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendArtifacts, setBackendArtifacts] = useState<
    VeraBackendArtifactSummary[]
  >([]);
  const [activeArtifactDetail, setActiveArtifactDetail] =
    useState<VeraBackendArtifactDetail | null>(null);
  const [usage, setUsage] = useState<VeraBackendUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestCancelable, setRequestCancelable] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [automaticProgress, setAutomaticProgress] =
    useState<VeraAutomaticContextProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);
  const [provisionalText, setProvisionalText] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<VeraRequestAttempt | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestInFlightRef = useRef(false);
  const [conversationResolver] = useState(() =>
    createVeraConversationResolver(),
  );

  const activeSession =
    sessions.find((item) => item.id === activeSessionId) ??
    sessions.find((item) => item.archivedAt === null) ??
    emptyStudySession;
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

  const loadConversation = useCallback(
    async (
      conversationId: string,
      committedStatus: VeraRequestStatus | null = null,
    ) => {
      const [detail, messagePage, artifactPage] = await Promise.all([
        requestJson<{ conversation: VeraBackendConversation }>(
          `/api/vera-ai/conversations/${conversationId}`,
        ),
        requestJson<{ messages: VeraBackendMessage[] }>(
          `/api/vera-ai/conversations/${conversationId}/messages?limit=50`,
        ),
        requestJson<{ artifacts: VeraBackendArtifactSummary[] }>(
          `/api/vera-ai/conversations/${conversationId}/artifacts?limit=50`,
        ),
      ]);
      const generatedTools = artifactPage.artifacts.reduce<VeraToolId[]>(
        (acc, artifact) => {
          if (isToolId(artifact.artifactType)) acc.push(artifact.artifactType);
          return acc;
        },
        [],
      );

      const mappedMessages = messagePage.messages.map(mapBackendMessage);
      if (committedStatus && isTerminalRequestState(committedStatus.state)) {
        const statusSources =
          [
            readVeraRequestSources(committedStatus),
            readVeraRequestSources(committedStatus.result),
          ].find((sources) => sources.length > 0) ?? [];
        const statusEvidence =
          readVeraRequestEvidenceState(committedStatus) ??
          readVeraRequestEvidenceState(committedStatus.result);
        const statusContextMode =
          committedStatus.contextMode ?? committedStatus.result?.contextMode;
        const messageIndex = mappedMessages.findIndex(
          (message) => message.requestId === committedStatus.requestId,
        );

        if (messageIndex >= 0) {
          mappedMessages[messageIndex] = {
            ...mappedMessages[messageIndex],
            requestContextMode:
              statusContextMode === "automatic"
                ? "automatic"
                : statusContextMode === "legacy"
                  ? "legacy"
                  : mappedMessages[messageIndex].requestContextMode,
            requestEvidenceState:
              statusEvidence ??
              mappedMessages[messageIndex].requestEvidenceState,
            requestSources:
              statusSources.length > 0
                ? statusSources
                : mappedMessages[messageIndex].requestSources,
          };
        }
      }

      setSessions((current) =>
        current.map((item) =>
          item.id === conversationId
            ? {
                ...mapBackendConversation(detail.conversation),
                generatedTools,
                messages: mappedMessages,
              }
            : item,
        ),
      );
    },
    [],
  );

  const hydrate = useCallback(async () => {
    try {
      setDataState("loading");
      setBackendError(null);
      const conversationPage = await requestJson<VeraBackendInitialLoad>(
        "/api/vera-ai/conversations?limit=50&includeArchived=true",
      );
      const authority = readVeraContextAuthority(conversationPage);
      const [usageResult] = await Promise.allSettled([
        requestJson<VeraBackendUsage>("/api/vera-ai/usage"),
      ]);
      if (usageResult.status === "rejected") {
        throw new VeraRequestError("usage_unavailable", {
          cause: usageResult.reason,
        });
      }
      const usageDto = usageResult.value;
      const mappedSessions = conversationPage.conversations.map(
        mapBackendConversation,
      );
      const defaultConversationId =
        conversationPage.defaultConversationId ??
        mappedSessions.find((item) => item.archivedAt === null)?.id ??
        "";

      setSessions(mappedSessions);
      setAutomaticContext(authority);
      setWorkspaceTab("chat");
      setUsage(usageDto);
      setActiveSessionId(defaultConversationId);
      setAutomaticProgress(null);

      if (defaultConversationId) {
        await loadConversation(defaultConversationId);
      } else {
        setBackendArtifacts([]);
      }
      setBackendMode(true);
      setDataState("live");
    } catch (caught) {
      setAutomaticContext(legacyVeraContextAuthority);
      setBackendMode(false);
      setDataState("unavailable");
      setSessions([]);
      setActiveSessionId("");
      setActiveArtifactId(null);
      setActiveArtifactDetail(null);
      setBackendArtifacts([]);
      setAutomaticProgress(null);
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

  function updateActiveSession(
    update: (current: StudySession) => StudySession,
    sessionId = activeSession.id,
  ) {
    setSessions((current) =>
      current.map((item) => (item.id === sessionId ? update(item) : item)),
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
    setError(null);
    setRecoveryStatus(null);
    void loadConversation(nextSessionId).catch((caught) => {
      setError(veraErrorMessage(caught));
    });
  }

  function handleSetWorkspaceTab(nextTab: WorkspaceTab) {
    setWorkspaceTab(nextTab);
  }

  function handleNewSession() {
    if (
      busy ||
      requestInFlightRef.current ||
      dataState !== "live" ||
      !backendMode
    ) {
      return;
    }

    void conversationResolver(null, createBackendConversation);
  }

  function handleRenameSession(sessionId: string, nextTitle: string) {
    const sessionToRename = sessions.find((item) => item.id === sessionId);
    const title = nextTitle.trim();

    if (!sessionToRename || !title || title === sessionToRename.title) {
      return;
    }

    if (dataState !== "live" || !backendMode) {
      return;
    }

    if (sessionId === activeSession.id) {
      void renameBackendConversation(title);
      return;
    }

    void renameBackendConversationForSession(sessionToRename, title);
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

  async function createBackendConversation(): Promise<string | null> {
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
          title: "Sesi baru",
        }),
      });
      setSessions((current) => [
        mapBackendConversation(result.conversation),
        ...current,
      ]);
      setActiveSessionId(result.conversation.id);
      setActiveArtifactId(null);
      setActiveArtifactDetail(null);
      setBackendArtifacts([]);
      setWorkspaceTab("chat");
      try {
        await loadConversation(result.conversation.id);
      } catch (caught) {
        setError(veraErrorMessage(caught));
      }
      return result.conversation.id;
    } catch (caught) {
      setError(veraErrorMessage(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function renameBackendConversationForSession(
    sessionToRename: StudySession,
    title: string,
  ) {
    try {
      setError(null);
      const updated = await requestJson<VeraBackendConversation>(
        `/api/vera-ai/conversations/${sessionToRename.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title,
            expectedVersion: sessionToRename.version ?? 0,
          }),
        },
      );
      setSessions((current) =>
        current.map((item) =>
          item.id === updated.id
            ? {
                ...mapBackendConversation(updated),
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
                  generatedTools: item.generatedTools,
                  messages: item.messages,
                }
              : item,
          ),
        );
        showToast("Judul berubah di perangkat lain. Versi terbaru sudah dimuat.", {
          variant: "info",
        });
      }

      setError(veraErrorMessage(caught));
    }
  }

  async function renameBackendConversation(title: string) {
    if (!activeSession.id) return;
    await renameBackendConversationForSession(activeSession, title);
  }

  function clearActiveSessionState() {
    setActiveSessionId("");
    setActiveArtifactId(null);
    setActiveArtifactDetail(null);
    setBackendArtifacts([]);
    setDraft("");
    setLastFailed(null);
    setProvisionalText(null);
    setError(null);
  }

  function selectNextActiveSession(nextSessions: StudySession[]) {
    const next = nextSessions.find((item) => item.archivedAt === null);
    if (next) {
      handleSelectSession(next.id);
    } else {
      clearActiveSessionState();
    }
  }

  async function archiveBackendConversation(sessionId: string) {
    if (busy) return;
    const target = sessions.find((item) => item.id === sessionId);
    if (!target || target.archivedAt !== null) return;

    try {
      setError(null);
      const updated = await requestJson<VeraBackendConversation>(
        `/api/vera-ai/conversations/${sessionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            archived: true,
            expectedVersion: target.version ?? 0,
          }),
        },
      );
      const nextSessions = sessions.map((item) =>
        item.id === updated.id
          ? {
              ...mapBackendConversation(updated),
              generatedTools: item.generatedTools,
              messages: item.messages,
            }
          : item,
      );
      setSessions(nextSessions);
      if (sessionId === activeSession.id) selectNextActiveSession(nextSessions);
      showToast("Sesi diarsipkan.", { variant: "success" });
    } catch (caught) {
      setError(veraErrorMessage(caught));
    }
  }

  async function restoreBackendConversation(sessionId: string) {
    const target = sessions.find((item) => item.id === sessionId);
    if (!target || target.archivedAt === null) return;

    try {
      setError(null);
      const updated = await requestJson<VeraBackendConversation>(
        `/api/vera-ai/conversations/${sessionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            archived: false,
            expectedVersion: target.version ?? 0,
          }),
        },
      );
      setSessions((current) =>
        current.map((item) =>
          item.id === updated.id
            ? {
                ...mapBackendConversation(updated),
                generatedTools: item.generatedTools,
                messages: item.messages,
              }
            : item,
        ),
      );
      showToast("Sesi dipulihkan.", { variant: "success" });
    } catch (caught) {
      setError(veraErrorMessage(caught));
    }
  }

  async function deleteBackendConversation(sessionId: string) {
    if (busy) return;
    const target = sessions.find((item) => item.id === sessionId);
    if (!target) return;

    try {
      setError(null);
      await requestJson<{ operationId: string }>(
        `/api/vera-ai/conversations/${sessionId}`,
        {
          method: "DELETE",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ expectedVersion: target.version ?? 0 }),
        },
      );
      const nextSessions = sessions.filter((item) => item.id !== sessionId);
      setSessions(nextSessions);
      if (sessionId === activeSession.id) selectNextActiveSession(nextSessions);
      showToast("Sesi dihapus.", { variant: "success" });
    } catch (caught) {
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

    if (requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    let conversationId: string | null;
    try {
      conversationId = await conversationResolver(
        activeSession.id || null,
        createBackendConversation,
      );
    } catch (caught) {
      requestInFlightRef.current = false;
      setError(veraErrorMessage(caught));
      return;
    }

    if (!conversationId) {
      requestInFlightRef.current = false;
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
    const automaticEnabled = isVeraAutomaticContextEnabled(automaticContext);

    abortRef.current = controller;
    setRequestCancelable(true);
    setBusy(true);
    setError(null);
    setRecoveryStatus(null);
    setLastFailed(null);
    setProvisionalText(kind === "chat" ? "" : null);
    setProgress(automaticEnabled ? null : toolId ? 5 : null);
    setAutomaticProgress(
      automaticEnabled ? { phase: "selecting", progress: 0 } : null,
    );
    updateActiveSession(
      (current) => ({
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
      }),
      conversationId,
    );

    let terminalSeen = false;
    let finalStatus: VeraRequestStatus | null = null;

    try {
      const response = await fetch(
        `/api/vera-ai/conversations/${conversationId}/requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildVeraRequestPayload({
              authority: automaticContext,
              clientRequestId,
              kind,
              retryOfRequestId,
              text,
              toolId,
            }),
          ),
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
              phase?: string;
              stage?: string;
              contextState?: string;
              evidenceState?: string;
              sourceOutcome?: string;
              contextProgress?: unknown;
              artifactRevisionId?: string;
              artifactType?: string;
            };

            try {
              data = JSON.parse(dataText) as typeof data;
            } catch {
              throw new VeraRequestError("invalid_response");
            }

            if (automaticEnabled) {
              const automaticProgressEvent = automaticProgressFromEvent(
                event,
                data.contextProgress ?? data,
              );
              if (automaticProgressEvent) {
                setAutomaticProgress(automaticProgressEvent);
              } else if (
                event === "progress.updated" &&
                typeof data.progress === "number"
              ) {
                setAutomaticProgress((current) => ({
                  phase: current?.phase ?? "answering",
                  progress: Math.max(
                    0,
                    Math.min(100, Math.round(data.progress ?? 0)),
                  ),
                }));
              }
            }

            if (event === "request.started" && data.requestId) {
              attempt.requestId = data.requestId;
            }
            if (event === "message.delta" && typeof data.text === "string") {
              setProvisionalText((current) => `${current ?? ""}${data.text}`);
            }
            if (
              event === "message.generated" &&
              typeof data.text === "string"
            ) {
              setProvisionalText(data.text);
            }
            if (event === "message.committed" && kind === "chat") {
              setRecoveryStatus(null);
              showToast("Jawaban sudah tersimpan di sesi ini.", {
                id: `vera-completion-${clientRequestId}`,
                variant: "success",
              });
            }
            if (event === "artifact.ready") {
              setRecoveryStatus(null);
              if (kind === "studio") {
                showToast("Hasil Studio sudah tersimpan di sesi ini.", {
                  id: `vera-completion-${clientRequestId}`,
                  variant: "success",
                });
              }
              attempt.artifactId = data.artifactRevisionId ?? null;
              const artifactType = data.artifactType ?? null;
              if (isToolId(artifactType)) {
                setActiveArtifactId(artifactType);
              }
            }
            if (
              event === "progress.updated" &&
              !automaticEnabled &&
              typeof data.progress === "number"
            ) {
              setProgress(data.progress);
            }
            if (event === "request.completed") {
              terminalSeen = true;
              setRecoveryStatus(null);
              if (data.state === "failed") {
                setError(
                  veraErrorMessage(new VeraRequestError("request_failed")),
                );
                setLastFailed(attempt);
              }
            }
            if (event === "request.failed") {
              terminalSeen = true;
              setRecoveryStatus(null);
              if (automaticEnabled) {
                setAutomaticProgress({ phase: "unavailable", progress: 100 });
              }
              setError(
                veraErrorMessage(
                  new VeraRequestError(data.code ?? "request_failed"),
                ),
              );
              setLastFailed(attempt.requestId ? attempt : null);
            }
            if (event === "request.recovery_pending") {
              setRecoveryStatus(
                "Permintaan masih dipulihkan. Vera sedang memeriksa hasil tersimpan.",
              );
            }
          }
        }
      } else {
        finalStatus = (await response.json()) as VeraRequestStatus;
        attempt.requestId = finalStatus.requestId;
        attempt.artifactId = finalStatus.artifact?.id ?? null;
        if (automaticEnabled) {
          const statusProgress = automaticTerminalProgress(finalStatus);
          if (statusProgress) setAutomaticProgress(statusProgress);
        }
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
          if (automaticEnabled) {
            const statusProgress = automaticTerminalProgress(finalStatus);
            if (statusProgress) setAutomaticProgress(statusProgress);
          }

          if (isTerminalRequestState(finalStatus.state)) {
            break;
          }

          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }

        if (finalStatus && isTerminalRequestState(finalStatus.state)) {
          setRecoveryStatus(null);
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
          setRecoveryStatus(
            "Permintaan masih dipulihkan. Coba periksa kembali beberapa saat lagi.",
          );
        }
      }

      setDraft("");
      await Promise.all([
        loadConversation(conversationId, finalStatus),
        requestJson<VeraBackendUsage>("/api/vera-ai/usage").then(setUsage),
      ]);

      if (kind === "studio" && attempt.artifactId) {
        setWorkspaceTab("studio");
        await openBackendArtifact(attempt.artifactId);
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        setError(null);
        setLastFailed(null);
      } else {
        setError(veraErrorMessage(caught));
        setLastFailed(attempt.requestId ? attempt : null);
      }
    } finally {
      abortRef.current = null;
      setRequestCancelable(false);
      setBusy(false);
      setProgress(null);
      setAutomaticProgress(null);
      setProvisionalText(null);
      requestInFlightRef.current = false;
    }
  }

  function handleCancelRequest() {
    abortRef.current?.abort();
    setRecoveryStatus(null);
    showToast("Permintaan dibatalkan.", { variant: "info" });
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

  return {
    activeArtifact,
    activeArtifactDetail,
    activeSession,
    automaticContext,
    automaticProgress,
    busy,
    requestCancelable,
    draft,
    error: backendError ?? error,
    fullscreenArtifact,
    fullscreenArtifactDetail,
    generatedArtifacts,
    generatedArtifactSummaries: backendArtifacts,
    recoveryStatus,
    notificationFeed,
    onCancelRequest: handleCancelRequest,
    onCloseArtifact: () => {
      setActiveArtifactId(null);
      setActiveArtifactDetail(null);
    },
    onCloseFullscreen: () => setFullscreenArtifactId(null),
    onDraftChange: setDraft,
    onExpandArtifact: setFullscreenArtifactId,
    onGenerateTool: handleToolRequest,
    onNewSession: handleNewSession,
    onOpenArtifact: handleOpenArtifact,
    onArchiveSession: archiveBackendConversation,
    onDeleteSession: deleteBackendConversation,
    onRenameSession: handleRenameSession,
    onRestoreSession: restoreBackendConversation,
    onRetry: handleRetry,
    onSelectSession: handleSelectSession,
    onSend: handleSend,
    onSessionSidebarCollapsedChange: setSessionSidebarCollapsed,
    onSetWorkspaceTab: handleSetWorkspaceTab,
    progress,
    provisionalText,
    session,
    sessionSidebarCollapsed,
    sessions,
    usage,
    dataState,
    workspaceTab,
    returnToHref: buildStudentReturnHref(returnToHref),
  };
}

function VeraAiPageModule({
  notificationFeed,
  returnToHref,
  session,
}: {
  notificationFeed: StudentNotificationFeed;
  returnToHref?: string;
  session: SessionContext;
}) {
  const workspaceProps = useVeraAiModuleState({
    notificationFeed,
    returnToHref,
    session,
  });
  return <VeraAiWorkspace {...workspaceProps} />;
}

function getVeraOperationStatusMessage(
  automaticProgress: VeraAutomaticContextProgress | null,
  progress: number | null,
) {
  switch (automaticProgress?.phase) {
    case "selecting":
    case "retrieving":
      return "Mencari sumber belajar…";
    case "answering":
      return "Menyusun jawaban Vera…";
    case "complete":
      return "Menyelesaikan jawaban Vera…";
    case "no_match":
    case "evidence_limited":
      return "Merampungkan jawaban Vera…";
    case "unavailable":
      return "Menyelesaikan permintaan Vera…";
    default:
      return progress !== null
        ? "Menyiapkan hasil Vera…"
        : "Vera sedang memproses permintaan…";
  }
}

function VeraProgressIndicator({
  automaticProgress,
  progress,
}: {
  automaticProgress: VeraAutomaticContextProgress | null;
  progress: number | null;
}) {
  const value = automaticProgress?.progress ?? progress;
  if (value === null) return null;

  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <Progress aria-label="Progres permintaan Vera" className="h-1.5 flex-1" value={value} />
      <span aria-hidden="true" className="shrink-0 text-xs tabular-nums text-secondary-600">{Math.round(value)}%</span>
    </div>
  );
}

const DATA_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

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
      className="mx-auto flex min-h-[min(32rem,calc(100svh-8rem))] w-full max-w-3xl flex-col items-center justify-center rounded-card border border-learning-card-border bg-white px-6 py-12 text-center shadow-[0_26px_80px_-46px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)]"
      role={loading ? "status" : "alert"}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-learning-hero-bg text-learning-hero-fg shadow-[0_18px_34px_-24px_color-mix(in_oklab,var(--voyage-deep)_70%,transparent)]">
        {loading ? (
          <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />
        ) : (
          <Gauge className="size-5" />
        )}
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-secondary-950">
        {loading ? "Memuat ruang kerja Vera…" : "Data Vera belum tersedia"}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-secondary-600">
        {loading
          ? "Sesi, sumber belajar, dan penggunaan sedang dimuat dari server."
          : (error ??
            "Sesi, sumber belajar, dan penggunaan belum dapat dimuat dari server.")}
      </p>
      {!loading ? (
        <Button className="mt-6 " onClick={onRetry} variant="default">
          <RotateCcw data-icon="inline-start" />
          Coba lagi
        </Button>
      ) : null}
    </section>
  );
}

function VeraTopBar({
  notificationFeed,
  onOpenSessionSidebar,
  returnToHref,
  session,
  usage,
}: {
  notificationFeed: StudentNotificationFeed;
  onOpenSessionSidebar: () => void;
  returnToHref: string;
  session: SessionContext;
  usage: VeraBackendUsage | null;
}) {
  return (
    <header className="mx-2 mt-2 flex min-h-18 items-center gap-3 px-3 py-3 text-secondary-900 md:mx-3 md:mt-3 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          aria-label="Kembali ke konteks sebelumnya"
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center gap-2.5 rounded-control focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-500/40"
          href={returnToHref}
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
            className="hidden text-2xl leading-none tracking-[0.04em] text-primary-700 sm:inline"
            style={{ fontFamily: "var(--font-sports-world)" }}
          >
            VECALSS
          </span>
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          aria-label="Buka sesi"
          className="md:hidden"
          onClick={onOpenSessionSidebar}
          size="icon"
          title="Sesi"
          type="button"
          variant="outline"
        >
          <MessageCircleMore aria-hidden="true" />
        </Button>
        <Button
          aria-label="Ke dashboard"
          nativeButton={false}
          render={<Link href="/dashboard" />}
          size="icon"
          variant="outline"
        >
          <House />
        </Button>
        <div className="flex items-center gap-1.5 rounded-full border border-primary-100 bg-white px-1.5 py-1 text-primary-900 shadow-sm">
          <VeraUsagePopover usage={usage} />
          <StudentNotificationPopover
            items={notificationFeed.items}
            unreadCount={notificationFeed.unreadCount}
          />
          <StudentAccountMenu extraItem="notifications" session={session} />
        </div>
      </div>
    </header>
  );
}

function getVeraUsageSummary(usage: VeraBackendUsage | null) {
  const consumedCredits =
    usage?.consumedCredits ?? usage?.usedQuotaUnits ?? null;
  const reservedCredits =
    usage?.reservedCredits ?? usage?.reservedQuotaUnits ?? 0;
  const creditLimit = usage?.creditLimit ?? usage?.quotaLimitUnits ?? null;
  const remainingCredits =
    usage?.remainingCredits ??
    (creditLimit !== null && consumedCredits !== null
      ? Math.max(0, creditLimit - consumedCredits - reservedCredits)
      : null);
  const committedCredits =
    consumedCredits === null ? null : consumedCredits + reservedCredits;
  const usagePercent =
    committedCredits !== null && creditLimit && creditLimit > 0
      ? Math.min(100, Math.round((committedCredits / creditLimit) * 100))
      : null;
  let usageState = "Data penggunaan belum tersedia dari server.";

  if (usage) {
    if (!usage.redisAvailable)
      usageState = "Pembatas permintaan tidak tersedia";
    else if (!usage.providerAvailable)
      usageState = "Penyedia AI tidak tersedia";
    else if (
      usage.monetaryDebtState === "debt" ||
      (usage.quotaDebtUnits ?? 0) > 0
    ) {
      usageState = "Batas biaya bulanan tercapai";
    } else if (remainingCredits === 0) {
      usageState = "Kredit habis";
    } else if (reservedCredits > 0) {
      usageState = `${reservedCredits} kredit sedang diproses`;
    } else if (usage.rawTokenUsageState === "unknown") {
      usageState = "Penggunaan provider belum diketahui";
    } else usageState = "Tersedia";
  }

  return {
    committedCredits,
    consumedCredits,
    creditLimit,
    remainingCredits,
    reservedCredits,
    usagePercent,
    usageState,
  };
}

const VERA_USAGE_WINDOW_LABELS: Record<VeraUsageWindow["periodKind"], string> =
  {
    day: "Hari ini",
    iso_week: "Minggu ini",
    month: "Bulan ini",
  };

const VERA_USD_FORMATTER = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 4,
  style: "currency",
});

function formatVeraUsdMicros(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return "—";
  const amount = Number(value) / 1_000_000;
  if (!Number.isFinite(amount)) return "—";
  return VERA_USD_FORMATTER.format(amount);
}

function formatVeraResetAt(
  value: string | undefined,
  timeZone: string | undefined,
) {
  if (!value) return "reset belum tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "reset belum tersedia";

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: timeZone || "Asia/Jakarta",
  }).format(date);
}

function VeraUsagePopover({ usage }: { usage: VeraBackendUsage | null }) {
  const {
    committedCredits,
    consumedCredits,
    creditLimit,
    remainingCredits,
    reservedCredits,
    usagePercent,
    usageState,
  } = getVeraUsageSummary(usage);
  const windows = usage?.windows ?? [];

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={
              usagePercent === null
                ? "Penggunaan Vera belum tersedia"
                : `Penggunaan Vera ${usagePercent} persen dari kredit bulanan`
            }
            className=" px-2.5"
            size="default"
            variant="outline"
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
          <PopoverDescription>{usageState}</PopoverDescription>
        </PopoverHeader>

        {usage &&
        usagePercent !== null &&
        consumedCredits !== null &&
        creditLimit !== null ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-secondary-800">
                Kredit bulan ini
              </span>
              <span className="tabular-nums text-secondary-500">
                {committedCredits?.toLocaleString("id-ID")} /{" "}
                {creditLimit.toLocaleString("id-ID")}
              </span>
            </div>
            <Progress
              aria-label="Penggunaan kredit Vera"
              value={usagePercent}
            />
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-secondary-400">Terpakai</p>
                <p className="mt-0.5 font-semibold tabular-nums text-secondary-800">
                  {consumedCredits.toLocaleString("id-ID")}
                </p>
              </div>
              <div>
                <p className="text-secondary-400">Diproses</p>
                <p className="mt-0.5 font-semibold tabular-nums text-secondary-800">
                  {reservedCredits.toLocaleString("id-ID")}
                </p>
              </div>
              <div>
                <p className="text-secondary-400">Tersisa</p>
                <p className="mt-0.5 font-semibold tabular-nums text-secondary-800">
                  {remainingCredits?.toLocaleString("id-ID") ?? "—"}
                </p>
              </div>
            </div>
            {windows.length > 0 ? (
              <div className="flex flex-col gap-2 border-t border-primary-100 pt-3">
                {windows.map((window) => (
                  <div
                    className="flex items-center justify-between gap-3 text-xs"
                    key={window.periodKind}
                  >
                    <span className="text-secondary-600">
                      {VERA_USAGE_WINDOW_LABELS[window.periodKind]}
                    </span>
                    <span className="text-right tabular-nums text-secondary-500">
                      {window.consumedCredits + window.reservedCredits} /{" "}
                      {window.creditLimit}
                      <span className="block text-xs text-secondary-400">
                        reset{" "}
                        {formatVeraResetAt(window.resetAt, usage.quotaTimezone)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {usage.providerSpend ? (
              <div className="border-t border-primary-100 pt-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-secondary-600">Biaya provider</span>
                  <span className="tabular-nums text-secondary-500">
                    {formatVeraUsdMicros(usage.providerSpend.exposureUsdMicros)}{" "}
                    /{" "}
                    {formatVeraUsdMicros(
                      usage.providerSpend.costLimitUsdMicros,
                    )}
                  </span>
                </div>
                {usage.providerSpend.unknownUsdMicros !== "0" ? (
                  <p className="mt-1 text-secondary-400">
                    {formatVeraUsdMicros(usage.providerSpend.unknownUsdMicros)}{" "}
                    masih menunggu rekonsiliasi.
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs leading-5 text-secondary-500">
              Zona {usage.quotaTimezone ?? "belum tersedia"}. Kredit analisis
              dan rute memakai 2 kredit; chat dan review 1 kredit.
            </p>
          </div>
        ) : (
          <p className="text-sm leading-6 text-secondary-600">
            Angka kuota dan waktu reset tidak ditampilkan sampai sumber akun
            berhasil dibaca.
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
    <div className="shrink-0">
      <FullWidthTabsList aria-label="Area kerja Vera">
        <FullWidthTabsTrigger onClick={() => onChange("chat")} value="chat">
          <MessageCircleMore data-icon="inline-start" />
          Percakapan
        </FullWidthTabsTrigger>
        <FullWidthTabsTrigger
          onClick={() => onChange("studio")}
          value="studio"
        >
          <Sparkles data-icon="inline-start" />
          Studio
        </FullWidthTabsTrigger>
      </FullWidthTabsList>
    </div>
  );
}

function SessionSidebar({
  activeSessionId,
  collapsed,
  onArchiveSession,
  onDeleteSession,
  onNewSession,
  onRenameSession,
  onRestoreSession,
  onSelectSession,
  onSetCollapsed,
  sessions,
}: {
  activeSessionId: string;
  collapsed: boolean;
  onArchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewSession: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onRestoreSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSetCollapsed: (collapsed: boolean) => void;
  sessions: StudySession[];
}) {
  if (!collapsed) {
    return (
      <SessionPanel
        activeSessionId={activeSessionId}
        className="flex"
        onArchiveSession={onArchiveSession}
        onDeleteSession={onDeleteSession}
        onCollapse={() => onSetCollapsed(true)}
        onNewSession={onNewSession}
        onRenameSession={onRenameSession}
        onRestoreSession={onRestoreSession}
        onSelectSession={onSelectSession}
        sessions={sessions}
      />
    );
  }

  return (
    <nav
      aria-label="Sidebar sesi Vera"
      className="flex h-full flex-col items-center rounded-[1.65rem] border border-primary-100 bg-white py-3 shadow-[0_18px_54px_-46px_color-mix(in_oklab,var(--voyage-deep)_42%,transparent)]"
    >
      <button
        aria-label="Buka sidebar sesi"
        className="flex size-11 items-center justify-center rounded-xl transition-colors motion-reduce:transition-none hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40"
        onClick={() => onSetCollapsed(false)}
        title="Buka sidebar sesi"
        type="button"
      >
        <PanelLeftOpen className="size-4" />
      </button>

      <div className="mt-7 flex flex-col items-center gap-2">
        <Button
          aria-label="Buat sesi baru"
          className=""
          onClick={onNewSession}
          size="icon"
          title="Sesi baru"
          variant="outline"
        >
          <Plus />
        </Button>
        <Button
          aria-label="Buka percakapan"
          className=""
          onClick={() => onSetCollapsed(false)}
          size="icon"
          title="Daftar percakapan"
          variant="outline"
        >
          <MessageCircleMore />
        </Button>
      </div>
    </nav>
  );
}

type SessionPendingAction = {
  kind: "archive" | "delete";
  session: StudySession;
} | null;

function SessionPanel({
  activeSessionId,
  className,
  onArchiveSession,
  onDeleteSession,
  onCollapse,
  onNewSession,
  onRenameSession,
  onRestoreSession,
  onSelectSession,
  sessions,
}: {
  activeSessionId: string;
  className?: string;
  onArchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCollapse?: () => void;
  onNewSession: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onRestoreSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  sessions: StudySession[];
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingAction, setPendingAction] = useState<SessionPendingAction>(null);
  const visibleSessions = sessions.filter((item) =>
    showArchived ? item.archivedAt !== null : item.archivedAt === null,
  );

  function beginRename(item: StudySession) {
    setEditingSessionId(item.id);
    setDraftTitle(item.title);
  }

  function finishRename(item: StudySession) {
    const title = draftTitle.trim();
    if (title && title !== item.title) onRenameSession(item.id, title);
    setEditingSessionId(null);
  }

  return (
    <>
      <WorkspacePanel className={className}>
        <PanelHeader
          action={
            <div className="flex items-center gap-1">
              <Button
                aria-label={
                  showArchived ? "Tampilkan sesi aktif" : "Buka arsip sesi"
                }
                className={cn("", showArchived && "bg-primary-50")}
                onClick={() => {
                  setShowArchived((current) => !current);
                  setEditingSessionId(null);
                }}
                size="icon"
                title={showArchived ? "Sesi aktif" : "Arsip sesi"}
                variant="outline"
              >
                <Archive />
              </Button>
              {!showArchived ? (
                <Button
                  aria-label="Buat sesi baru"
                  className=""
                  onClick={onNewSession}
                  size="icon"
                  title="Sesi baru"
                  variant="outline"
                >
                  <Plus />
                </Button>
              ) : null}
              {onCollapse ? (
                <Button
                  aria-label="Minimalkan sidebar sesi"
                  className=""
                  onClick={onCollapse}
                  size="icon"
                  variant="outline"
                >
                  <PanelLeftClose />
                </Button>
              ) : null}
            </div>
          }
          title={showArchived ? "Arsip" : "Sesi"}
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          <div className="flex flex-col gap-1.5">
            {visibleSessions.length === 0 ? (
              <div className="rounded-card border border-dashed border-primary-200 bg-primary-50/50 px-3 py-5 text-center text-xs leading-5 text-secondary-500">
                {showArchived
                  ? "Belum ada sesi yang diarsipkan."
                  : "Belum ada sesi. Buat sesi baru untuk mulai berbicara dengan Vera."}
              </div>
            ) : (
              visibleSessions.map((item) => (
                <SessionListItem
                  active={item.id === activeSessionId}
                  draftTitle={draftTitle}
                  editing={editingSessionId === item.id}
                  item={item}
                  key={item.id}
                  onArchive={() => setPendingAction({ kind: "archive", session: item })}
                  onBeginRename={() => beginRename(item)}
                  onDelete={() => setPendingAction({ kind: "delete", session: item })}
                  onDraftTitleChange={setDraftTitle}
                  onFinishRename={() => finishRename(item)}
                  onRestore={() => onRestoreSession(item.id)}
                  onSelect={() => onSelectSession(item.id)}
                  onStopRename={() => setEditingSessionId(null)}
                  showArchived={showArchived}
                />
              ))
            )}
          </div>
        </div>
      </WorkspacePanel>

      <SessionActionDialog
        onArchive={onArchiveSession}
        onDelete={onDeleteSession}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        onPendingActionChange={setPendingAction}
        pendingAction={pendingAction}
      />
    </>
  );
}

function SessionListItem({
  active,
  draftTitle,
  editing,
  item,
  onArchive,
  onBeginRename,
  onDelete,
  onDraftTitleChange,
  onFinishRename,
  onRestore,
  onSelect,
  onStopRename,
  showArchived,
}: {
  active: boolean;
  draftTitle: string;
  editing: boolean;
  item: StudySession;
  onArchive: () => void;
  onBeginRename: () => void;
  onDelete: () => void;
  onDraftTitleChange: (title: string) => void;
  onFinishRename: () => void;
  onRestore: () => void;
  onSelect: () => void;
  onStopRename: () => void;
  showArchived: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex min-h-14 w-full items-center gap-1 rounded-control border px-2 py-2 transition-all duration-200 motion-reduce:transition-none",
        active
          ? "border-primary-200 bg-primary-50 text-primary-950"
          : "border-transparent bg-transparent hover:border-primary-100 hover:bg-white",
        item.archivedAt !== null && "opacity-75",
      )}
    >
      {editing ? (
        <Input
          aria-label={`Judul sesi ${item.title}`}
          autoFocus
          className="min-w-0 flex-1"
          onBlur={onFinishRename}
          onChange={(event) => onDraftTitleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onFinishRename();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onStopRename();
            }
          }}
          value={draftTitle}
        />
      ) : (
        <button
          aria-current={active ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40"
          disabled={item.archivedAt !== null}
          onClick={onSelect}
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
      )}
      <SessionListItemActions
        item={item}
        onArchive={onArchive}
        onBeginRename={onBeginRename}
        onDelete={onDelete}
        onRestore={onRestore}
        showArchived={showArchived}
      />
    </div>
  );
}

function SessionListItemActions({
  item,
  onArchive,
  onBeginRename,
  onDelete,
  onRestore,
  showArchived,
}: {
  item: StudySession;
  onArchive: () => void;
  onBeginRename: () => void;
  onDelete: () => void;
  onRestore: () => void;
  showArchived: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {showArchived ? (
        <Button
          aria-label={`Pulihkan ${item.title}`}
          className=""
          onClick={onRestore}
          size="icon"
          title="Pulihkan sesi"
          variant="outline"
        >
          <Archive />
        </Button>
      ) : (
        <>
          <Button
            aria-label={`Ubah judul sesi ${item.title}`}
            className=""
            onClick={onBeginRename}
            size="icon"
            title="Ubah judul"
            variant="outline"
          >
            <Pencil />
          </Button>
          <Button
            aria-label={`Arsipkan ${item.title}`}
            className=""
            onClick={onArchive}
            size="icon"
            title="Arsipkan sesi"
            variant="outline"
          >
            <Archive />
          </Button>
        </>
      )}
      <Button
        aria-label={`Hapus ${item.title}`}
        className=" text-secondary-400 hover:text-destructive"
        onClick={onDelete}
        size="icon"
        title="Hapus sesi"
        variant="outline"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function SessionActionDialog({
  onArchive,
  onDelete,
  onOpenChange,
  onPendingActionChange,
  pendingAction,
}: {
  onArchive: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onOpenChange: (open: boolean) => void;
  onPendingActionChange: (action: SessionPendingAction) => void;
  pendingAction: SessionPendingAction;
}) {
  const isDelete = pendingAction?.kind === "delete";
  return (
    <AlertDialog onOpenChange={onOpenChange} open={pendingAction !== null}>
      <AlertDialogContent size="sm" variant={isDelete ? "danger" : "default"}>
        <AlertDialogHeader>
          <AlertDialogMedia variant={isDelete ? "danger" : "default"}>
            {isDelete ? <Trash2 /> : <Archive />}
          </AlertDialogMedia>
          <AlertDialogTitle>
            {isDelete ? "Hapus sesi ini?" : "Arsipkan sesi ini?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDelete
              ? "Sesi akan dihapus dan tidak dapat dipulihkan setelah proses penghapusan selesai."
              : "Sesi akan dipindahkan ke arsip. Kamu dapat memulihkannya kapan saja."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onPendingActionChange(null)}>
            Batal
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const action = pendingAction;
              onPendingActionChange(null);
              if (!action) return;
              if (action.kind === "delete") onDelete(action.session.id);
              else onArchive(action.session.id);
            }}
            variant={isDelete ? "destructive" : "default"}
          >
            {isDelete ? (
              <Trash2 data-icon="inline-start" />
            ) : (
              <Archive data-icon="inline-start" />
            )}
            {isDelete ? "Hapus sesi" : "Arsipkan sesi"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ChatWorkspace({
  activeSession,
  automaticContextEnabled,
  automaticProgress,
  busy,
  className,
  draft,
  onDraftChange,
  onCancel,
  onSend,
  provisionalText,
}: {
  activeSession: StudySession;
  automaticContextEnabled: boolean;
  automaticProgress: VeraAutomaticContextProgress | null;
  busy: boolean;
  className?: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSend: () => void;
  provisionalText: string | null;
}) {
  return (
    <WorkspacePanel className={className}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-7 px-4 py-7 md:px-5 md:py-8">
          {activeSession.messages.map((message) => (
            <MessageCard key={message.id} message={message} />
          ))}
          {provisionalText !== null ||
          (automaticContextEnabled && busy && automaticProgress !== null) ? (
            <ProvisionalMessageCard
              body={provisionalText ?? ""}
            />
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

function isCommittedVeraMessage(message: VeraMessage) {
  return (
    message.contentState === "committed" ||
    message.requestState === "succeeded" ||
    message.requestState === "fallback" ||
    message.requestState === "completed" ||
    message.requestState === "committed"
  );
}

function automaticEvidenceLabel(
  state: VeraAutomaticContextEvidenceState | null | undefined,
) {
  switch (state) {
    case "no_match":
      return "Tidak ada sumber belajar yang cocok untuk pertanyaan ini.";
    case "evidence_limited":
      return "Sumber belajar yang ditemukan terbatas; jawaban mungkin belum lengkap.";
    case "unavailable":
      return "Sumber belajar belum tersedia untuk permintaan ini.";
    case "failed":
      return "Sumber belajar gagal dimuat untuk permintaan ini.";
    default:
      return null;
  }
}

function automaticSourceKindLabel(kind: VeraRequestSourceSummary["kind"]) {
  return {
    materi: "Materi",
    kuis: "Kuis",
    tryout: "Tryout",
  }[kind];
}

function automaticSourceReleaseLabel(releasedAt: string | null) {
  if (!releasedAt) return null;
  const date = new Date(releasedAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Dirilis ${DATA_TIMESTAMP_FORMATTER.format(date)}`;
}

function StreamingAnswerText({ content }: { content: string }) {
  const tokens = Array.from(content.matchAll(/\s+|\S+/gu), (match) => ({
    start: match.index ?? 0,
    text: match[0],
  }));
  return (
    <span className="vera-streaming-text">
      {tokens.map(({ start, text }) => {
          if (/^\s+$/u.test(text)) {
            return <span key={`space-${start}`}>{text}</span>;
          }

          return (
            <span
              className="vera-stream-word motion-reduce:animate-none"
              key={`word-${start}`}
            >
              {text}
            </span>
          );
        })}
      <span aria-hidden="true" className="vera-stream-caret" />
    </span>
  );
}

function MessageCard({ message }: { message: VeraMessage }) {
  const isStudent = message.role === "student";
  const committedAutomaticRequest =
    !isStudent &&
    message.requestContextMode === "automatic" &&
    isCommittedVeraMessage(message);
  const evidenceLabel = committedAutomaticRequest
    ? automaticEvidenceLabel(message.requestEvidenceState)
    : null;
  const stateNotice = getVeraMessageStateNotice(message);

  if (isStudent) {
    return <VeraStudentMessage message={message} stateNotice={stateNotice} />;
  }

  return (
    <VeraAssistantMessage
      committedAutomaticRequest={committedAutomaticRequest}
      evidenceLabel={evidenceLabel}
      message={message}
      stateNotice={stateNotice}
    />
  );
}

function getVeraMessageStateNotice(message: VeraMessage) {
  return [
    message.contentState && message.contentState !== "encrypted"
      ? `Konten: ${formatVeraState(message.contentState)}`
      : null,
    message.requestState && message.requestState !== "succeeded"
      ? `Permintaan: ${formatVeraState(message.requestState)}`
      : null,
    message.requestErrorCode
      ? `Keterangan: ${formatVeraRequestErrorCode(message.requestErrorCode)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function VeraStudentMessage({
  message,
  stateNotice,
}: {
  message: VeraMessage;
  stateNotice: string;
}) {
  return (
    <Bubble align="end" className="max-w-[84%]">
      <BubbleContent className="rounded-[1.35rem] rounded-br-md px-4 py-3 leading-6 shadow-[0_12px_28px_-22px_color-mix(in_oklab,var(--voyage-deep)_70%,transparent)]">
        <p>{message.body}</p>
        {stateNotice ? (
          <p className="mt-1.5 text-xs text-white/70">{stateNotice}</p>
        ) : null}
        <p className="mt-1.5 text-right text-xs text-white/60">
          {message.createdAt}
        </p>
      </BubbleContent>
    </Bubble>
  );
}

function VeraAssistantMessage({
  committedAutomaticRequest,
  evidenceLabel,
  message,
  stateNotice,
}: {
  committedAutomaticRequest: boolean;
  evidenceLabel: string | null;
  message: VeraMessage;
  stateNotice: string;
}) {
  return (
    <article className="flex items-start gap-3.5">
      <VeraMascotAvatar />
      <Bubble className="max-w-full flex-1 pt-0.5" variant="ghost">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-secondary-950">Vera</p>
          <p className="text-xs text-secondary-400">{message.createdAt}</p>
        </div>
        {stateNotice ? (
          <p className="mt-1 text-xs text-secondary-500">{stateNotice}</p>
        ) : null}
        <BubbleContent className="mt-2 max-w-[68ch] text-base leading-7 text-secondary-700">
          <p>{message.body}</p>
        </BubbleContent>
        <VeraAutomaticMessageEvidence
          enabled={committedAutomaticRequest}
          evidenceLabel={evidenceLabel}
          sources={message.requestSources}
        />
        <VeraManualCitations
          citations={message.citations}
          requestContextMode={message.requestContextMode}
          requestSources={message.requestSources}
        />
      </Bubble>
    </article>
  );
}

function VeraMascotAvatar() {
  return (
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
  );
}

function VeraAutomaticMessageEvidence({
  enabled,
  evidenceLabel,
  sources,
}: {
  enabled: boolean;
  evidenceLabel: string | null;
  sources: VeraMessage["requestSources"];
}) {
  if (!enabled) return null;
  return (
    <>
      {evidenceLabel ? (
        <p className="mt-3 rounded-xl border border-primary-100 bg-primary-50/55 px-3 py-2 text-xs leading-5 text-primary-900">
          {evidenceLabel}
        </p>
      ) : null}
      <details className="mt-3 max-w-[68ch] rounded-card border border-primary-100 bg-primary-50/35 px-3 py-2">
        <summary className="cursor-pointer list-inside text-sm font-semibold text-primary-900 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40">
          Sumber yang dipakai
        </summary>
        {sources && sources.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2 border-t border-primary-100 pt-2">
            {sources.map((source) => (
              <VeraMessageSource key={source.citationKey} source={source} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 border-t border-primary-100 pt-2 text-xs leading-5 text-secondary-600">
            Ringkasan sumber belum tersedia untuk permintaan ini.
          </p>
        )}
      </details>
    </>
  );
}

function VeraMessageSource({
  source,
}: {
  source: NonNullable<VeraMessage["requestSources"]>[number];
}) {
  const releaseLabel = automaticSourceReleaseLabel(source.releasedAt);
  return (
    <li className="flex items-start gap-2 text-sm text-secondary-700">
      <FileText
        className="mt-0.5 size-3.5 shrink-0 text-primary-700"
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block font-medium text-secondary-900">
          {source.title}
        </span>
        <span className="mt-0.5 block text-xs text-secondary-500">
          {[automaticSourceKindLabel(source.kind), releaseLabel]
            .filter(Boolean)
            .join(" • ")}
        </span>
        {source.limitations.length > 0 ? (
          <span className="mt-0.5 block text-xs text-primary-800">
            Terbatas: {source.limitations.join(", ")}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function VeraManualCitations({
  citations,
  requestContextMode,
  requestSources,
}: {
  citations: VeraMessage["citations"];
  requestContextMode: VeraMessage["requestContextMode"];
  requestSources: VeraMessage["requestSources"];
}) {
  if (
    requestContextMode === "automatic" ||
    requestSources?.length ||
    !citations?.length
  ) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {citations.map((citation) => (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50/70 px-2.5 py-1 text-xs font-medium text-primary-800"
          key={citation}
        >
          <FileText className="size-3" aria-hidden="true" />
          {citation}
        </span>
      ))}
    </div>
  );
}

function ProvisionalMessageCard({
  body,
}: {
  body: string;
}) {
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
          <LoaderCircle aria-label="Vera sedang menyiapkan jawaban" className="size-3.5 animate-spin text-primary-600 motion-reduce:animate-none" role="img" />
        </div>
        {body ? (
          <BubbleContent
            aria-live="polite"
            className="mt-2 max-w-[68ch] rounded-card border border-dashed border-primary-200 bg-primary-50/45 px-4 py-3 text-base leading-7 text-secondary-700"
          >
            <StreamingAnswerText content={body} />
          </BubbleContent>
        ) : null}
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
        <div className="flex items-center gap-2 rounded-field border border-primary-200 bg-white p-2 shadow-[0_12px_34px_-28px_color-mix(in_oklab,var(--voyage-deep)_65%,transparent)] transition-shadow motion-reduce:transition-none focus-within:shadow-[0_16px_38px_-28px_color-mix(in_oklab,var(--voyage-deep)_80%,transparent)]">
          <Input
            aria-label="Tanyakan sesuatu kepada Vera"
            className="min-w-0 flex-1"
            disabled={busy}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Tanyakan konsep, soal, atau langkah belajarmu…"
            value={draft}
          />
          {busy ? (
            <Button
              aria-label="Batalkan permintaan Vera"
              className=""
              onClick={onCancel}
              size="icon"
              type="button"
              variant="outline"
            >
              <X />
            </Button>
          ) : (
            <Button
              aria-label="Kirim pertanyaan ke Vera"
              className=""
              disabled={!draft.trim()}
              size="icon"
              type="submit"
              variant="default"
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
  className,
  generatedArtifacts,
  generatedArtifactSummaries,
  onCloseArtifact,
  onExpandArtifact,
  onGenerateTool,
  onOpenArtifact,
}: {
  activeArtifact: VeraStudioTool | null;
  activeArtifactDetail: VeraBackendArtifactDetail | null;
  className?: string;
  generatedArtifacts: VeraStudioTool[];
  generatedArtifactSummaries: VeraBackendArtifactSummary[];
  onCloseArtifact: () => void;
  onExpandArtifact: (toolId: VeraToolId) => void;
  onGenerateTool: (toolId: VeraToolId) => void;
  onOpenArtifact: (toolId: VeraToolId) => void;
}) {
  if (activeArtifact) {
    return (
      <WorkspacePanel className={className}>
        <PanelHeader
          action={
            <Button
              aria-label="Perbesar dokumen"
              className=""
              onClick={() => onExpandArtifact(activeArtifact.id)}
              size="icon"
              variant="outline"
            >
              <Maximize2 />
            </Button>
          }
          closeAction={onCloseArtifact}
          title="Vera Studio"
        />
        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-3">
          <StudioArtifactDocument
            compact
            key={activeArtifact.id}
            backendArtifact={activeArtifactDetail}
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
            <span className="text-xs text-secondary-400">
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
              <div className="rounded-card border border-dashed border-primary-200 bg-primary-50/50 p-4 text-center">
                <Sparkles className="mx-auto size-5 text-primary-600" />
                <p className="mt-2 text-sm font-semibold text-secondary-800">
                  Belum ada hasil
                </p>
                <p className="mt-1 text-xs leading-5 text-secondary-400">
                  Pilih alat belajar di atas. Hasilnya akan tersimpan di sesi
                  ini.
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
    <p className="px-1 text-xs font-semibold tracking-[0.13em] text-secondary-500 uppercase">
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
      className="group flex min-h-14 w-full items-center gap-3 rounded-control border border-transparent px-2.5 py-2 text-left transition-[border-color,background-color] duration-200 motion-reduce:transition-none hover:border-primary-100 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40"
      onClick={onGenerate}
      type="button"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-white text-primary-700 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-reduce:translate-y-0 motion-reduce:transition-none">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-secondary-900">
          {tool.title}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-primary-400 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-reduce:translate-x-0 motion-reduce:transition-none" />
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
      className="vera-studio-card-in group w-full rounded-control border border-primary-100 bg-white p-3 text-left transition-[border-color,box-shadow] duration-200 hover:border-primary-200 hover:shadow-[0_16px_34px_-28px_color-mix(in_oklab,var(--voyage-deep)_62%,transparent)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40"
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
              ? `${formatVeraArtifactType(summary.artifactType)} · ${formatVeraState(summary.lifecycleState)} · hasil ${formatVeraState(summary.resultState)} · konteks ${formatVeraState(summary.contextState)} · ${relativeTime(summary.createdAt)}`
              : tool.outputBody}
          </span>
          <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary-700">
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
        compact ? "p-4" : "max-w-4xl py-2 md:py-4",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>

      {backendArtifact ? (
        <dl className="mt-4 grid gap-2 rounded-card border border-primary-100 bg-primary-50/45 p-3 text-xs text-secondary-600 sm:grid-cols-3">
          <div>
            <dt className="font-semibold text-secondary-500">Siklus</dt>
            <dd className="mt-1 text-secondary-800">
              {formatVeraState(backendArtifact.lifecycle.state)}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-secondary-500">Hasil</dt>
            <dd className="mt-1 text-secondary-800">
              {formatVeraState(backendArtifact.resultState)}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-secondary-500">Konteks</dt>
            <dd className="mt-1 text-secondary-800">
              {formatVeraState(backendArtifact.contextState)}
            </dd>
          </div>
        </dl>
      ) : null}

      {markdown ? (
        <StudioArtifactMarkdown compact={compact} content={markdown} />
      ) : (
        <div
          aria-live="polite"
          className="mt-6 rounded-card border border-dashed border-primary-200 bg-primary-50/45 px-4 py-5 text-sm leading-6 text-secondary-600"
          role="status"
        >
          Dokumen hasil belum tersedia dari server.
        </div>
      )}
    </article>
  );
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
      <h2 className="mt-8 text-xs font-semibold tracking-[0.12em] text-secondary-500 uppercase">
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

  return <ReactMarkdown components={components}>{content}</ReactMarkdown>;
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
        className="inset-3 left-3 top-3 h-[calc(100svh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-panel border border-primary-100 bg-white p-0 sm:max-w-none"
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
              onClick={() => onOpenChange(false)}
              size="icon"
              variant="quiet"
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
        "min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-learning-card-border bg-white shadow-[0_26px_80px_-46px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)] md:h-full",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  action,
  closeAction,
  title,
}: {
  action?: React.ReactNode;
  closeAction?: () => void;
  title: React.ReactNode;
}) {
  return (
    <div className="flex min-h-17 items-center justify-between gap-3 border-b border-learning-card-border bg-voyage-sea-glass-wash/55 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {closeAction ? (
          <Button
            aria-label="Tutup dokumen"
            className="-ml-1"
            onClick={closeAction}
            size="icon"
            title="Tutup dokumen"
            variant="quiet"
          >
            <X />
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

"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  ArrowLeft,
  ChartNoAxesColumnIncreasing,
  Check,
  Dumbbell,
  FileQuestion,
  FileText,
  Gauge,
  GraduationCap,
  House,
  ListChecks,
  LoaderCircle,
  Pencil,
  Plus,
  SendHorizontal,
  Sparkles,
  RotateCcw,
  X,
} from "@/lib/icons";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { StudentNotificationPopover } from "@/modules/student/components/student-notification-popover";

type Conversation = {
  id: string;
  conversationType: string;
  title: string | null;
  version: number;
  contextVersion: number;
  updatedAt: string;
  messagePreview: { text: string | null } | null;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string | null;
  contentState: string;
  createdAt: string;
};

type ContextSource = {
  sourceType: "material" | "practice";
  sourceId: string;
  title: string | null;
  displayOrder: number;
};

type SourceCatalogItem = {
  sourceType: "material" | "practice";
  sourceId: string;
  title: string;
  subtitle: string;
};

type ArtifactSummary = {
  id: string;
  artifactType: StudioToolId;
  revision: number;
  title: string | null;
  createdAt: string;
  lifecycleState: string;
  resultState: string;
  contextState: string;
};

type ArtifactDetail = {
  id: string;
  artifactType: StudioToolId;
  revision: number;
  title: string | null;
  markdown: string | null;
  payload: unknown;
  resultState: string;
  contextState: string;
  lifecycle: { state: string; revision: number; deletionState: string };
  citations: Array<{ key: string; label: string | null }>;
  applyCapabilities: {
    materializeLearningRecommendation: boolean;
    registryKeys: string[];
    targets: Array<{ registryKey: string; id: string; revision: number; lifecycleState: string; deletionState: string; label: string }>;
  };
};

type Usage = {
  quotaLimitUnits: number;
  usedQuotaUnits: number;
  reservedQuotaUnits: number;
  quotaDebtUnits: number;
  quotaOverrunLockUntil: string | null;
  rawTokenUsageState: string;
  providerAvailable: boolean;
  redisAvailable: boolean;
};

type RequestAttempt = { kind: "chat" | "studio"; text: string; toolId: StudioToolId | null; requestId: string | null; clientRequestId: string };

class VeraRequestError extends Error {
  constructor(readonly code: string, readonly details: Record<string, unknown>) {
    super(code);
  }
}

const studioTools = [
  { id: "analysis", label: "Analisis kelemahan", icon: ChartNoAxesColumnIncreasing, prompt: "Analisis kelemahan belajarku dari konteks yang dipilih." },
  { id: "route", label: "Rute belajar", icon: ListChecks, prompt: "Susun rute belajar yang konkret dari konteks yang dipilih." },
  { id: "review", label: "Ulas soal", icon: FileQuestion, prompt: "Ulas satu soal yang paling perlu kupahami dari konteks ini." },
  { id: "ptn", label: "Strategi PTN", icon: GraduationCap, prompt: "Susun strategi PTN berdasarkan bukti yang tersedia." },
  { id: "summary", label: "Ringkasan sesi", icon: FileText, prompt: "Ringkas fokus, keputusan, dan langkah berikutnya dari sesi ini." },
  { id: "drill", label: "Drill adaptif", icon: Dumbbell, prompt: "Siapkan drill dari soal yang sudah dirilis dan boleh digunakan kembali." },
] as const;

type StudioToolId = (typeof studioTools)[number]["id"];
type WorkspaceTab = "chat" | "context" | "studio";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const value = await response.json().catch(() => ({ error: "invalid_response" })) as T & { error?: string };
  if (!response.ok) throw new VeraRequestError(value.error ?? "request_failed", value as Record<string, unknown>);
  return value;
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)} jam lalu`;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(new Date(value));
}

function VeraAiPageModule({ notificationFeed, session }: { notificationFeed: StudentNotificationFeed; session: SessionContext }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [context, setContext] = useState<{ contextVersion: number; sources: ContextSource[]; maxSources: number } | null>(null);
  const [catalog, setCatalog] = useState<SourceCatalogItem[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [artifact, setArtifact] = useState<ArtifactDetail | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [draft, setDraft] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("chat");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [provisionalText, setProvisionalText] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<RequestAttempt | null>(null);
  const [learnerExportId, setLearnerExportId] = useState<string | null>(null);
  const [learnerExportOperationId, setLearnerExportOperationId] = useState<string | null>(null);
  const [learnerExportState, setLearnerExportState] = useState<string | null>(null);
  const [learnerExportDownloadState, setLearnerExportDownloadState] = useState<string | null>(null);
  const [learnerDeleteOperationId, setLearnerDeleteOperationId] = useState<string | null>(null);
  const [learnerDeleteState, setLearnerDeleteState] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [lifecycleExportReference, setLifecycleExportReference] = useState("");
  const [lifecycleGrant, setLifecycleGrant] = useState("");
  const [lifecycleGrantState, setLifecycleGrantState] = useState<string | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const operationId = new URLSearchParams(window.location.search).get("veraLifecycleOperation");
    if (!operationId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLearnerDeleteOperationId(operationId);
      setLearnerDeleteState(null);
      void requestJson<{ state: string; targetState?: string }>(`/api/vera-ai/lifecycle/${operationId}`)
        .then((status) => {
          if (!cancelled) setLearnerDeleteState(status.targetState ?? status.state);
        })
        .catch((caught) => {
          if (!cancelled) setError(caught instanceof VeraRequestError ? caught.code : "lifecycle_unavailable");
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? null;
  const selectedSourceIds = useMemo(() => new Set((context?.sources ?? []).map((source) => source.sourceId)), [context]);

  const loadConversation = useCallback(async (conversationId: string) => {
    const [detail, messagePage, contextDto, artifactPage] = await Promise.all([
      requestJson<{ conversation: Conversation }>(`/api/vera-ai/conversations/${conversationId}`),
      requestJson<{ messages: Message[] }>(`/api/vera-ai/conversations/${conversationId}/messages?limit=50`),
      requestJson<{ contextVersion: number; sources: ContextSource[]; maxSources: number }>(`/api/vera-ai/conversations/${conversationId}/context`),
      requestJson<{ artifacts: ArtifactSummary[] }>(`/api/vera-ai/conversations/${conversationId}/artifacts?limit=50`),
    ]);
    setMessages(messagePage.messages);
    setContext(contextDto);
    setArtifacts(artifactPage.artifacts);
    setConversations((current) => current.map((item) => item.id === conversationId ? detail.conversation : item));
    setTitleDraft(detail.conversation.title ?? "");
  }, []);

  const hydrate = useCallback(async () => {
    try {
      setError(null);
      const [list, sources, usageDto] = await Promise.all([
        requestJson<{ conversations: Conversation[]; defaultConversationId: string | null }>("/api/vera-ai/conversations?limit=50"),
        requestJson<{ sources: SourceCatalogItem[] }>("/api/vera-ai/sources?limit=50"),
        requestJson<Usage>("/api/vera-ai/usage"),
      ]);
      setConversations(list.conversations);
      setCatalog(sources.sources);
      setUsage(usageDto);
      setActiveConversationId((current) => current ?? list.defaultConversationId);
      if (list.defaultConversationId) await loadConversation(list.defaultConversationId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "vera_unavailable");
    }
  }, [loadConversation]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void hydrate(); }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrate]);

  async function selectConversation(id: string) {
    setActiveConversationId(id);
    setArtifact(null);
    setWorkspaceTab("chat");
    setError(null);
    setNotice(null);
    await loadConversation(id).catch((caught) => setError(caught instanceof Error ? caught.message : "vera_unavailable"));
  }

  async function createConversation() {
    try {
      setBusy(true);
      const result = await requestJson<{ conversation: Conversation }>("/api/vera-ai/conversations", { method: "POST", body: JSON.stringify({ clientRequestId: crypto.randomUUID(), conversationType: "vera_chat", title: "Sesi belajar baru" }) });
      setConversations((current) => [result.conversation, ...current]);
      await selectConversation(result.conversation.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "vera_unavailable");
    } finally { setBusy(false); }
  }

  async function saveTitle() {
    if (!activeConversation || !titleDraft.trim()) return;
    try {
      const updated = await requestJson<Conversation>(`/api/vera-ai/conversations/${activeConversation.id}`, { method: "PATCH", body: JSON.stringify({ title: titleDraft, expectedVersion: activeConversation.version }) });
      setConversations((current) => current.map((item) => item.id === updated.id ? updated : item));
      setRenaming(false);
    } catch (caught) {
      const authoritative = caught instanceof VeraRequestError ? caught.details.conversation as Conversation | undefined : undefined;
      if (authoritative) {
        setConversations((current) => current.map((item) => item.id === authoritative.id ? authoritative : item));
        setTitleDraft(authoritative.title ?? "");
        setNotice("Judul telah berubah di perangkat lain. Versi terbaru sudah dimuat.");
      }
      setError(caught instanceof Error ? caught.message : "vera_unavailable");
    }
  }

  async function toggleSource(source: SourceCatalogItem) {
    if (!activeConversation || !context) return;
    const selected = selectedSourceIds.has(source.sourceId);
    const next = selected
      ? context.sources.filter((item) => item.sourceId !== source.sourceId).map(({ sourceType, sourceId }) => ({ sourceType, sourceId }))
      : [...context.sources.map(({ sourceType, sourceId }) => ({ sourceType, sourceId })), { sourceType: source.sourceType, sourceId: source.sourceId }];
    if (next.length > context.maxSources) return setError("context_limit_reached");
    try {
      const result = await requestJson<typeof context>(`/api/vera-ai/conversations/${activeConversation.id}/context`, { method: "PUT", body: JSON.stringify({ expectedContextVersion: context.contextVersion, sources: next }) });
      setContext(result);
    } catch (caught) {
      const authoritative = caught instanceof VeraRequestError ? caught.details.context as typeof context | undefined : undefined;
      if (authoritative) {
        setContext(authoritative);
        setNotice("Konteks berubah di perangkat lain. Pilihan terbaru sudah dimuat.");
      }
      setError(caught instanceof Error ? caught.message : "vera_unavailable");
    }
  }

  async function streamRequest(kind: "chat" | "studio", text: string, toolId: StudioToolId | null, retryOfRequestId: string | null = null) {
    if (!activeConversation) return;
    const clientRequestId = crypto.randomUUID();
    const controller = new AbortController();
    abortRef.current = controller;
    const attempt: RequestAttempt = { kind, text, toolId, requestId: null, clientRequestId };
    setBusy(true);
    setError(null);
    setNotice(null);
    setLastFailed(null);
    setProvisionalText(kind === "chat" ? "" : null);
    setProgress(toolId ? 5 : null);
    let terminalSeen = false;
    try {
      const response = await fetch(`/api/vera-ai/conversations/${activeConversation.id}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientRequestId, kind, toolId, text, sources: (context?.sources ?? []).map(({ sourceType, sourceId }) => ({ sourceType, sourceId })), options: {}, retryOfRequestId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "request_failed" })) as { error?: string };
        throw new Error(body.error ?? "request_failed");
      }
      if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          buffer += decoder.decode(part.value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const event = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
            const dataText = frame.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
            if (!dataText) continue;
            const data = JSON.parse(dataText) as { progress?: number; code?: string; text?: string; requestId?: string; state?: string };
            if (event === "request.started" && data.requestId) attempt.requestId = data.requestId;
            if (event === "message.delta" && typeof data.text === "string") setProvisionalText((current) => `${current ?? ""}${data.text}`);
            if (event === "message.generated" && typeof data.text === "string") setProvisionalText(data.text);
            if (event === "message.committed" || event === "artifact.ready") setNotice(event === "artifact.ready" ? "Hasil Studio sudah tersimpan." : "Jawaban sudah tersimpan.");
            if (event === "progress.updated" && typeof data.progress === "number") setProgress(data.progress);
            if (event === "request.completed") terminalSeen = true;
            if (event === "request.failed") {
              terminalSeen = true;
              setError(data.code ?? "request_failed");
              setLastFailed(attempt.requestId ? attempt : null);
            }
            if (event === "request.recovery_pending") {
              setNotice("Permintaan masih dipulihkan. Vera sedang memeriksa hasil tersimpan.");
            }
          }
        }
      } else {
        const status = await response.json() as { requestId?: string; state?: string; errorCode?: string };
        attempt.requestId = status.requestId ?? null;
        terminalSeen = ["succeeded", "fallback", "failed"].includes(status.state ?? "");
        if (status.state === "failed" || status.state === "rejected" || status.state === "expired") {
          setError(status.errorCode ?? "request_failed");
          setLastFailed(attempt);
        }
      }
      if (!terminalSeen) {
        let status: { requestId?: string; state: string; errorCode: string | null } | null = null;
        for (let poll = 0; poll < 5; poll += 1) {
          status = await requestJson<{ requestId?: string; state: string; errorCode: string | null }>(`/api/vera-ai/conversations/${activeConversation.id}/requests?clientRequestId=${encodeURIComponent(clientRequestId)}`);
          attempt.requestId = status.requestId ?? attempt.requestId;
          if (["succeeded", "fallback", "failed"].includes(status.state)) break;
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
        if (status?.state === "failed") {
          setError(status.errorCode ?? "request_failed");
          setLastFailed(attempt.requestId ? attempt : null);
        } else if (!status || !["succeeded", "fallback"].includes(status.state)) {
          setNotice("Permintaan masih dipulihkan. Coba periksa statusnya beberapa saat lagi.");
          setLastFailed(null);
        }
      }
      setDraft("");
      await Promise.all([loadConversation(activeConversation.id), requestJson<Usage>("/api/vera-ai/usage").then(setUsage)]);
    } catch (caught) {
      const code = controller.signal.aborted ? "request_cancelled" : caught instanceof Error ? caught.message : "vera_unavailable";
      setError(code);
      setLastFailed(attempt.requestId ? attempt : null);
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
      setProvisionalText(null);
    }
  }

  function cancelRequest() {
    abortRef.current?.abort();
    setNotice("Permintaan dibatalkan. Status tersimpan dapat diperiksa kembali.");
  }

  async function openArtifact(id: string) {
    try {
      setArtifact(await requestJson<ArtifactDetail>(`/api/vera-ai/artifacts/${id}`));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "vera_unavailable"); }
  }

  async function materializeRoute() {
    if (!artifact || !artifact.applyCapabilities.materializeLearningRecommendation) return;
    try {
      setBusy(true);
      setError(null);
      await requestJson(`/api/vera-ai/artifacts/${artifact.id}/materialize/learning-recommendation`, {
        method: "POST",
        body: JSON.stringify({ clientRequestId: crypto.randomUUID(), expectedArtifactRevision: artifact.revision, materializationSchemaVersion: "1" }),
      });
      setNotice("Rute berhasil disimpan sebagai rekomendasi belajar.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "vera_unavailable");
    } finally { setBusy(false); }
  }

  async function applyToExisting(target: ArtifactDetail["applyCapabilities"]["targets"][number]) {
    if (!artifact) return;
    try {
      setBusy(true);
      setError(null);
      await requestJson(`/api/vera-ai/artifacts/${artifact.id}/apply`, {
        method: "POST",
        body: JSON.stringify({ clientRequestId: crypto.randomUUID(), registryKey: target.registryKey, targetId: target.id, expectedTargetRevision: target.revision }),
      });
      setNotice(`Hasil diterapkan ke ${target.label}.`);
      setArtifact(await requestJson<ArtifactDetail>(`/api/vera-ai/artifacts/${artifact.id}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "vera_unavailable");
    } finally { setBusy(false); }
  }

  async function createLearnerExport() {
    try {
      setLifecycleBusy(true);
      setError(null);
      const result = await requestJson<{ exportId: string; operationId: string; state: string }>("/api/vera-ai/exports", {
        method: "POST",
        headers: { "Idempotency-Key": `vera-learner-export-${crypto.randomUUID()}` },
        body: JSON.stringify({ format: "json_v1" }),
      });
      setLearnerExportId(result.exportId);
      setLearnerExportOperationId(result.operationId);
      setLearnerExportState(result.state);
      setLifecycleExportReference(result.exportId);
      setNotice("Ekspor data Vera sedang disiapkan. Kamu dapat memeriksa statusnya kapan saja.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "export_unavailable");
    } finally { setLifecycleBusy(false); }
  }

  async function refreshLearnerLifecycle() {
    try {
      setLifecycleBusy(true);
      setError(null);
      const exportId = lifecycleExportReference.trim() || learnerExportId;
      if (exportId) {
        const exportStatus = await requestJson<{ state: string }>(`/api/vera-ai/exports/${exportId}`);
        setLearnerExportId(exportId);
        setLearnerExportState(exportStatus.state);
      }
      if (learnerDeleteOperationId) {
        const deleteStatus = await requestJson<{ state: string; targetState?: string }>(`/api/vera-ai/lifecycle/${learnerDeleteOperationId}`);
        setLearnerDeleteState(deleteStatus.targetState ?? deleteStatus.state);
      }
      setNotice("Status tersimpan sudah diperbarui.");
    } catch (caught) {
      const code = caught instanceof VeraRequestError ? caught.code : "lifecycle_unavailable";
      if (lifecycleExportReference.trim()) setLearnerExportState(`error:${code}`);
      setError(code);
    } finally { setLifecycleBusy(false); }
  }

  async function downloadLearnerExport() {
    const exportId = lifecycleExportReference.trim() || learnerExportId;
    if (!exportId) return setError("export_required");
    try {
      setLifecycleBusy(true);
      setError(null);
      const response = await fetch(`/api/vera-ai/exports/${exportId}/download`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new VeraRequestError(body.error ?? "export_unavailable", body);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `vera-ai-${exportId}.json`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setLearnerExportId(exportId);
      setLearnerExportDownloadState("downloaded");
      setNotice("Ekspor Vera berhasil diunduh dan tetap tercatat sebagai akses satu kali.");
    } catch (caught) {
      const code = caught instanceof VeraRequestError ? caught.code : "export_unavailable";
      setLearnerExportDownloadState(`error:${code}`);
      setError(code);
    } finally { setLifecycleBusy(false); }
  }

  async function deleteActiveConversation() {
    if (!activeConversation) return;
    if (!deleteConfirmation) {
      setDeleteConfirmation(true);
      setNotice("Percakapan akan dihapus sesuai siklus hidup Vera. Konfirmasi untuk melanjutkan.");
      return;
    }
    try {
      setLifecycleBusy(true);
      setError(null);
      const result = await requestJson<{ operationId: string; state: string }>(`/api/vera-ai/conversations/${activeConversation.id}`, {
        method: "DELETE",
        headers: { "Idempotency-Key": `vera-learner-delete-${crypto.randomUUID()}` },
        body: JSON.stringify({ expectedVersion: activeConversation.version }),
      });
      setLearnerDeleteOperationId(result.operationId);
      setLearnerDeleteState(result.state);
      setDeleteConfirmation(false);
      setNotice("Penghapusan percakapan tercatat. Status dapat dipulihkan setelah koneksi terputus.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "deletion_pending");
    } finally { setLifecycleBusy(false); }
  }

  async function checkCleanupGrant() {
    const exportId = lifecycleExportReference.trim();
    const grant = lifecycleGrant.trim();
    if (!exportId || !grant) return setError("export_grant_required");
    try {
      setLifecycleBusy(true);
      setError(null);
      const result = await requestJson<{ accessMode: string; exportAccessGrantState: string }>(`/api/vera-ai/exports/${exportId}`, { headers: { "x-vera-export-grant": grant } });
      setLifecycleGrantState(`${result.accessMode}:${result.exportAccessGrantState}`);
      setNotice("Akses cleanup grant tervalidasi untuk sesi ini.");
    } catch (caught) {
      setLifecycleGrantState(null);
      setError(caught instanceof Error ? caught.message : "target_unavailable");
    } finally { setLifecycleBusy(false); }
  }

  const usagePercent = usage ? Math.min(100, Math.round(((usage.usedQuotaUnits + usage.reservedQuotaUnits) / Math.max(1, usage.quotaLimitUnits)) * 100)) : 0;
  const usageState = !usage ? "Memuat penggunaan…"
    : !usage.redisAvailable ? "Pembatas permintaan tidak tersedia"
      : !usage.providerAvailable ? "Penyedia AI tidak tersedia"
        : usage.quotaDebtUnits > 0 ? `Overrun ${usage.quotaDebtUnits} unit`
          : usage.usedQuotaUnits + usage.reservedQuotaUnits >= usage.quotaLimitUnits ? "Kuota habis"
            : usage.reservedQuotaUnits > 0 ? `${usage.reservedQuotaUnits} unit sedang diproses`
              : usage.rawTokenUsageState === "unknown" ? "Penggunaan token belum diketahui"
                : "Tersedia";

  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(circle_at_top_left,rgba(219,247,234,0.9),transparent_36%),linear-gradient(180deg,#f8fcfa_0%,#eef8f3_100%)] text-secondary-950">
      <header className="flex min-h-18 items-center gap-3 border-b border-primary-100/70 bg-white/85 px-3 py-3 backdrop-blur md:px-5">
        <Link className="flex items-center gap-2.5" href="/dashboard">
          <Image alt="Vecalss" className="h-8 w-auto" height={42} priority src="/brand/logo-mark-cropped.png" width={52} />
          <span className="hidden text-xl tracking-[0.04em] text-primary-800 sm:inline" style={{ fontFamily: "var(--font-sports-world)" }}>VECALSS</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden min-w-44 rounded-2xl border border-primary-100 bg-white px-3 py-2 sm:block">
            <div className="flex justify-between text-xs font-medium text-secondary-500"><span title={usageState}>Unit Vera hari ini</span><span>{usagePercent}%</span></div>
            <Progress className="mt-1.5 h-1.5" value={usagePercent} />
          </div>
          <Button aria-label="Ke dashboard" nativeButton={false} render={<Link href="/dashboard" />} size="icon-sm" variant="outline"><House /></Button>
          <StudentNotificationPopover items={notificationFeed.items} unreadCount={notificationFeed.unreadCount} />
          <StudentAccountMenu extraItem="notifications" session={session} />
        </div>
      </header>
      <div className="flex items-center gap-3 border-b border-primary-100 bg-white px-3 py-2 sm:hidden" role="status">
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-secondary-800">Unit Vera hari ini · {usagePercent}%</p><p className="truncate text-xs text-secondary-600">{usageState}</p></div>
        <Progress aria-label={`Penggunaan Vera ${usagePercent}%`} className="h-2 w-24" value={usagePercent} />
      </div>

      <main className="mx-auto grid w-full max-w-[1680px] flex-1 gap-3 overflow-hidden p-3 md:grid-cols-[260px_minmax(0,1fr)] md:p-4 xl:grid-cols-[280px_minmax(0,1.25fr)_minmax(330px,.75fr)]">
        <aside className="hidden min-h-0 overflow-hidden rounded-[1.5rem] border border-primary-100 bg-white shadow-sm md:flex md:flex-col">
          <div className="flex items-center justify-between border-b border-primary-100 p-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-primary-700">Percakapan</p><p className="mt-1 text-xs text-secondary-500">Riwayat tersimpan</p></div><Button aria-label="Percakapan baru" disabled={busy} onClick={() => void createConversation()} size="icon-sm"><Plus /></Button></div>
          <ScrollArea className="min-h-0 flex-1 p-2">
            {conversations.length ? conversations.map((conversation) => <button className={cn("mb-1 w-full rounded-2xl px-3 py-3 text-left transition", activeConversationId === conversation.id ? "bg-primary-50 ring-1 ring-primary-200" : "hover:bg-secondary-50")} key={conversation.id} onClick={() => void selectConversation(conversation.id)} type="button"><p className="truncate text-sm font-semibold">{conversation.title ?? "Percakapan tanpa judul"}</p><p className="mt-1 truncate text-xs text-secondary-500">{conversation.messagePreview?.text ?? "Belum ada pesan"}</p><p className="mt-2 text-xs text-secondary-400">{relativeTime(conversation.updatedAt)}</p></button>) : <EmptyCopy title="Belum ada percakapan" body="Buat sesi ketika kamu siap mulai." />}
          </ScrollArea>
        </aside>

        <section className="flex min-h-[68vh] min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-primary-100 bg-white shadow-sm md:min-h-0">
          <div className="flex min-h-17 items-center gap-3 border-b border-primary-100 px-4 py-3">
            <div className="min-w-0 flex-1">
              {renaming && activeConversation ? <div className="flex gap-2"><Input autoFocus maxLength={160} onChange={(event) => setTitleDraft(event.target.value)} value={titleDraft} /><Button onClick={() => void saveTitle()} size="sm"><Check /></Button></div> : <><h1 className="truncate text-base font-semibold">{activeConversation?.title ?? "Vera AI"}</h1><p className="text-xs text-secondary-500">{activeConversation ? `${context?.sources.length ?? 0} sumber aktif` : "Pilih atau buat percakapan"}</p></>}
            </div>
            {activeConversation && !renaming ? <Button aria-label="Ubah judul" onClick={() => setRenaming(true)} size="icon-sm" variant="ghost"><Pencil /></Button> : null}
          </div>
          {error ? <div aria-live="assertive" className="flex items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700" role="alert"><span>{error.replaceAll("_", " ")}</span>{lastFailed?.requestId ? <Button onClick={() => void streamRequest(lastFailed.kind, lastFailed.text, lastFailed.toolId, lastFailed.requestId)} size="sm" variant="outline"><RotateCcw />Coba lagi</Button> : null}</div> : null}
          {notice ? <div aria-live="polite" className="border-b border-primary-200 bg-primary-50 px-4 py-2 text-xs font-medium text-primary-800" role="status">{notice}</div> : null}
          <div className="flex items-center gap-2 border-b border-primary-100 px-3 py-2 md:hidden">
            <label className="sr-only" htmlFor="vera-mobile-conversation">Percakapan aktif</label>
            <select className="min-w-0 flex-1 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm" id="vera-mobile-conversation" onChange={(event) => void selectConversation(event.target.value)} value={activeConversationId ?? ""}>
              <option disabled value="">Pilih percakapan</option>
              {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title ?? "Percakapan tanpa judul"}</option>)}
            </select>
            <Button aria-label="Percakapan baru" disabled={busy} onClick={() => void createConversation()} size="icon-sm"><Plus /></Button>
          </div>
          <Tabs className="flex min-h-0 flex-1 flex-col" onValueChange={(value) => setWorkspaceTab(value as WorkspaceTab)} value={workspaceTab}>
            <TabsList className="mx-3 mt-3 grid grid-cols-3 xl:hidden"><TabsTrigger value="chat">Chat</TabsTrigger><TabsTrigger value="context">Konteks</TabsTrigger><TabsTrigger value="studio">Studio</TabsTrigger></TabsList>
            <TabsContent className="flex min-h-0 flex-1 flex-col" value="chat">
              <ScrollArea className="min-h-0 flex-1 px-4 py-5">
                {activeConversation ? messages.length || provisionalText !== null ? <div className="mx-auto flex max-w-3xl flex-col gap-4">{messages.map((message) => <div className={cn("max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-6", message.role === "user" ? "ml-auto rounded-br-lg bg-primary-700 text-white" : "rounded-bl-lg border border-primary-100 bg-primary-50 text-secondary-900")} key={message.id}>{message.text ?? <span className="text-secondary-500">Konten tidak tersedia.</span>}</div>)}{provisionalText !== null ? <div aria-hidden="true" className="max-w-[88%] rounded-3xl rounded-bl-lg border border-dashed border-primary-200 bg-primary-50 px-4 py-3 text-sm leading-6 text-secondary-700">{provisionalText || "Vera sedang menyusun jawaban…"}</div> : null}</div> : <EmptyCopy title="Mulai dari pertanyaanmu" body="Vera hanya memakai sumber yang kamu pilih dan hasilnya tetap tersimpan di sesi ini." /> : <EmptyCopy title="Belum ada sesi aktif" body="Buat percakapan baru untuk mulai belajar bersama Vera." />}
              </ScrollArea>
              <div className="border-t border-primary-100 p-3 md:p-4">
                <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[1.35rem] border border-primary-200 bg-white p-2 shadow-sm focus-within:ring-3 focus-within:ring-primary-200/50">
                  <textarea aria-label="Pesan untuk Vera" className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" disabled={!activeConversation || busy} maxLength={40000} onChange={(event) => setDraft(event.target.value)} placeholder="Tanyakan materi atau pola belajarmu…" value={draft} />
                  {busy ? <Button aria-label="Batalkan permintaan" onClick={cancelRequest} size="icon" variant="outline"><X /></Button> : <Button aria-label="Kirim pesan" disabled={!draft.trim() || !activeConversation} onClick={() => void streamRequest("chat", draft.trim(), null)} size="icon"><SendHorizontal /></Button>}
                </div>
              </div>
            </TabsContent>
            <TabsContent className="min-h-0 flex-1 overflow-auto p-4 xl:hidden" value="context"><ContextPanel catalog={catalog} context={context} onToggle={toggleSource} selected={selectedSourceIds} /></TabsContent>
            <TabsContent className="min-h-0 flex-1 overflow-auto p-4 xl:hidden" value="studio"><StudioPanel artifact={artifact} artifacts={artifacts} busy={busy} onApply={applyToExisting} onBack={() => setArtifact(null)} onGenerate={(tool) => void streamRequest("studio", tool.prompt, tool.id)} onMaterialize={materializeRoute} onOpen={openArtifact} progress={progress} /></TabsContent>
          </Tabs>
        </section>

        <aside className="hidden min-h-0 overflow-hidden rounded-[1.5rem] border border-primary-100 bg-white shadow-sm xl:flex xl:flex-col">
          <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="studio">
            <TabsList className="m-3 grid grid-cols-2"><TabsTrigger value="studio">Studio</TabsTrigger><TabsTrigger value="context">Konteks</TabsTrigger></TabsList>
            <TabsContent className="min-h-0 flex-1 overflow-auto px-4 pb-4" value="studio"><StudioPanel artifact={artifact} artifacts={artifacts} busy={busy} onApply={applyToExisting} onBack={() => setArtifact(null)} onGenerate={(tool) => void streamRequest("studio", tool.prompt, tool.id)} onMaterialize={materializeRoute} onOpen={openArtifact} progress={progress} /></TabsContent>
            <TabsContent className="min-h-0 flex-1 overflow-auto px-4 pb-4" value="context"><ContextPanel catalog={catalog} context={context} onToggle={toggleSource} selected={selectedSourceIds} /></TabsContent>
          </Tabs>
        </aside>
      </main>
      <section aria-label="Data dan privasi" className="mx-auto mb-3 w-full max-w-[1680px] rounded-[1.5rem] border border-primary-100 bg-white p-3 shadow-sm md:mb-4 md:p-4" data-vera-lifecycle-panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.12em] text-primary-700">Data &amp; privasi</p><p className="mt-1 max-w-2xl text-xs leading-5 text-secondary-500">Ekspor, penghapusan, dan akses pemulihan tetap tercatat sebagai operasi Vera yang bisa diperiksa ulang.</p></div>
          <div aria-live="polite" className="min-w-0 text-right text-xs text-secondary-600" role="status">{learnerExportState ? `Ekspor: ${learnerExportState}` : learnerDeleteOperationId ? "" : "Ekspor belum dimulai"}{learnerExportDownloadState ? ` · Unduh: ${learnerExportDownloadState}` : ""}{learnerDeleteState ? ` · Hapus: ${learnerDeleteState}` : ""}{lifecycleGrantState ? ` · Grant: ${lifecycleGrantState}` : ""}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={lifecycleBusy || !activeConversation} onClick={() => void createLearnerExport()} size="sm" variant="outline">Buat ekspor data</Button>
          <Button data-vera-lifecycle-status disabled={lifecycleBusy || !learnerExportOperationId && !learnerDeleteOperationId && !lifecycleExportReference.trim()} onClick={() => void refreshLearnerLifecycle()} size="sm" variant="outline">Periksa status tersimpan</Button>
          <Button data-vera-export-download disabled={lifecycleBusy || !learnerExportId || learnerExportState !== "ready"} onClick={() => void downloadLearnerExport()} size="sm" variant="outline">Unduh ekspor</Button>
          <Button disabled={lifecycleBusy || !activeConversation || Boolean(learnerDeleteOperationId)} onClick={() => void deleteActiveConversation()} size="sm" variant="outline">Hapus percakapan ini</Button>
        </div>
        {deleteConfirmation ? <div aria-live="assertive" className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-vera-delete-confirm role="alert"><span className="min-w-0 flex-1">Konfirmasi penghapusan percakapan?</span><Button data-vera-delete-confirm onClick={() => void deleteActiveConversation()} size="sm">Konfirmasi hapus percakapan</Button><Button onClick={() => setDeleteConfirmation(false)} size="sm" variant="ghost">Batal</Button></div> : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Input aria-label="ID ekspor" className="min-w-0" maxLength={64} onChange={(event) => setLifecycleExportReference(event.target.value)} placeholder="ID ekspor untuk akses grant" value={lifecycleExportReference} />
          <Input aria-label="Token akses cleanup" className="min-w-0" maxLength={240} onChange={(event) => setLifecycleGrant(event.target.value)} placeholder="Token akses cleanup (opsional)" type="password" value={lifecycleGrant} />
          <Button disabled={lifecycleBusy} onClick={() => void checkCleanupGrant()} size="sm" variant="outline">Periksa grant</Button>
        </div>
        {learnerExportId || learnerDeleteOperationId ? <p className="mt-2 break-all text-xs text-secondary-400">{learnerExportId ? `Ekspor tersimpan: ${learnerExportId}` : ""}{learnerExportOperationId ? ` · operasi ${learnerExportOperationId}` : ""}{learnerDeleteOperationId ? ` · operasi hapus ${learnerDeleteOperationId}` : ""}</p> : null}
      </section>
    </div>
  );
}

function EmptyCopy({ title, body }: { title: string; body: string }) {
  return <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center"><span className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"><Sparkles /></span><p className="text-sm font-semibold">{title}</p><p className="mt-1 max-w-xs text-xs leading-5 text-secondary-500">{body}</p></div>;
}

function ContextPanel({ catalog, context, selected, onToggle }: { catalog: SourceCatalogItem[]; context: { sources: ContextSource[]; maxSources: number } | null; selected: Set<string>; onToggle: (source: SourceCatalogItem) => Promise<void> }) {
  return <div><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-primary-700">Konteks aktif</p><p className="mt-1 text-xs text-secondary-500">{context?.sources.length ?? 0}/{context?.maxSources ?? 6} sumber · Dokumen belum tersedia</p></div><div className="space-y-2">{catalog.map((source) => { const active = selected.has(source.sourceId); const Icon = source.sourceType === "material" ? BookOpen : Gauge; return <button className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition", active ? "border-primary-300 bg-primary-50" : "border-secondary-100 hover:border-primary-200")} key={`${source.sourceType}:${source.sourceId}`} onClick={() => void onToggle(source)} type="button"><span className="flex size-9 items-center justify-center rounded-xl bg-white text-primary-700"><Icon /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{source.title}</span><span className="block truncate text-xs text-secondary-500">{source.subtitle}</span></span>{active ? <Check className="text-primary-700" /> : null}</button>; })}{catalog.length === 0 ? <EmptyCopy title="Belum ada sumber dirilis" body="Materi terbit dan latihan milikmu yang sudah dirilis akan muncul di sini." /> : null}</div></div>;
}

function StudioPanel({ artifact, artifacts, busy, progress, onApply, onBack, onGenerate, onMaterialize, onOpen }: { artifact: ArtifactDetail | null; artifacts: ArtifactSummary[]; busy: boolean; progress: number | null; onApply: (target: ArtifactDetail["applyCapabilities"]["targets"][number]) => Promise<void>; onBack: () => void; onGenerate: (tool: (typeof studioTools)[number]) => void; onMaterialize: () => Promise<void>; onOpen: (id: string) => Promise<void> }) {
  if (artifact) return <article className="rounded-3xl border border-primary-100 bg-[#fffdf8] p-5"><Button className="mb-3" onClick={onBack} size="sm" variant="ghost"><ArrowLeft />Kembali ke Studio</Button><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-primary-700">{artifact.artifactType}</p><h2 className="mt-1 text-lg font-semibold">{artifact.title ?? "Hasil tidak tersedia"}</h2></div><span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">Revisi {artifact.revision}</span></div>{artifact.markdown ? <div className="prose prose-sm max-w-none text-secondary-800"><ReactMarkdown>{artifact.markdown}</ReactMarkdown></div> : <p className="rounded-2xl border border-dashed border-secondary-200 p-4 text-sm text-secondary-500">Konten tidak tersedia karena siklus hidup hasil ini sudah {artifact.lifecycle.state}.</p>}<div className="mt-5 flex flex-wrap gap-2 text-xs text-secondary-500"><span>Konteks: {artifact.contextState}</span><span>•</span><span>Status: {artifact.resultState}</span><span>•</span><span>Siklus: {artifact.lifecycle.state}</span></div>{artifact.applyCapabilities.materializeLearningRecommendation ? <Button className="mt-5" disabled={busy} onClick={() => void onMaterialize()}>Simpan sebagai rekomendasi baru</Button> : null}{artifact.applyCapabilities.targets.length ? <div className="mt-5 border-t border-primary-100 pt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-primary-700">Terapkan ke target yang ada</p><div className="space-y-2">{artifact.applyCapabilities.targets.map((target) => <Button className="w-full justify-between" disabled={busy} key={`${target.registryKey}:${target.id}`} onClick={() => void onApply(target)} variant="outline"><span className="truncate">{target.label}</span><span className="text-xs text-secondary-500">Rev {target.revision}</span></Button>)}</div></div> : null}</article>;
  return <div><div className="grid grid-cols-2 gap-2">{studioTools.map((tool) => { const Icon = tool.icon; return <Button className="h-auto min-h-24 flex-col items-start rounded-2xl border-primary-100 p-3 text-left" disabled={busy} key={tool.id} onClick={() => onGenerate(tool)} variant="outline"><Icon className="text-primary-700" /><span className="mt-2 w-full whitespace-normal text-xs font-semibold">{tool.label}</span></Button>; })}</div>{progress !== null ? <div aria-live="polite" className="mt-4 rounded-2xl bg-primary-50 p-3" role="status"><div className="flex items-center gap-2 text-xs font-medium text-primary-800"><LoaderCircle className="animate-spin" />Menyiapkan hasil tersimpan…</div><Progress className="mt-2" value={progress} /></div> : null}<div className="mt-6"><p className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-primary-700">Hasil tersimpan</p><div className="space-y-2">{artifacts.map((item) => <button className="w-full rounded-2xl border border-secondary-100 p-3 text-left hover:border-primary-200" key={item.id} onClick={() => void onOpen(item.id)} type="button"><p className="truncate text-sm font-semibold">{item.title ?? `Konten ${item.lifecycleState}`}</p><p className="mt-1 text-xs text-secondary-500">{item.artifactType} · {item.lifecycleState} · {relativeTime(item.createdAt)}</p></button>)}{artifacts.length === 0 ? <p className="rounded-2xl border border-dashed border-secondary-200 p-4 text-center text-xs text-secondary-500">Belum ada hasil Studio.</p> : null}</div></div></div>;
}

export { VeraAiPageModule };

"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  FileQuestion,
  FileText,
  GraduationCap,
  ListChecks,
  NotebookPen,
  Plus,
  Search,
  SendHorizontal,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { StudentNotificationPopover } from "@/modules/student/components/student-notification-popover";
import { studentNotificationItems } from "@/modules/student/notification-data";

import {
  veraContextSources,
  veraContextTypes,
  veraMaterialHistory,
  veraPracticeHistory,
  veraStudioTools,
  veraToolModes,
  type VeraContextSource,
  type VeraContextType,
  type VeraContextTypeId,
  type VeraMaterialHistory,
  type VeraPracticeHistory,
  type VeraStudioTool,
  type VeraToolId,
} from "./data";

type SourceFilter = "all" | VeraContextTypeId;

type VeraMessage = {
  id: string;
  role: "vera" | "student";
  body: string;
  createdAt: string;
  citations?: string[];
};

type DeleteTarget =
  | {
      kind: "context";
      sourceId: string;
      label: string;
    }
  | {
      kind: "artifact";
      toolId: VeraToolId;
      label: string;
    };

const toolIcons: Record<VeraToolId, LucideIcon> = {
  analysis: ChartNoAxesColumnIncreasing,
  route: ListChecks,
  drill: Dumbbell,
  review: FileQuestion,
  ptn: GraduationCap,
  summary: FileText,
};

const contextTypeIcons: Record<VeraContextTypeId, LucideIcon> = {
  practice: ChartNoAxesColumnIncreasing,
  material: BookOpen,
  document: FileText,
};

const fallbackContextType = veraContextTypes[0];

const initialSelectedSourceIds = [
  "tryout-04",
  "module-ratio",
  "personal-summary",
];

const initialGeneratedTools: VeraToolId[] = ["analysis", "review", "summary"];

const initialMessages: VeraMessage[] = [
  {
    id: "msg-brief",
    role: "vera",
    body: "Aku sudah membaca tryout terakhir, modul rasio, dan rangkuman PK pribadimu. Fokus yang paling dekat saat ini masih simpulan implisit dan rasio dua langkah, jadi chat ini kita pakai untuk ngobrol dan menyusun langkah belajarnya.",
    createdAt: "Baru saja",
    citations: ["Tryout SNBT 04", "Modul Rasio Dasar", "Rangkuman PK Pribadi"],
  },
  {
    id: "msg-follow-up",
    role: "vera",
    body: "Kalau kamu butuh output belajar yang rapi, bilang saja. Aku akan siapkan hasilnya di Studio Vera supaya chat tetap bersih.",
    createdAt: "Baru saja",
  },
];

const toolRequestLabels: Record<VeraToolId, string> = {
  analysis: "Analisis kelemahanku dari konteks ini.",
  route: "Susun rute belajar mingguan dari konteks yang aktif.",
  drill: "Buat drill adaptif dari soal salahku.",
  review: "Bahas soal yang paling sering bikin aku meleset.",
  ptn: "Bantu susun strategi PTN dari skor dan targetku.",
  summary: "Ringkas keputusan belajar yang perlu aku bawa ke sesi berikutnya.",
};

function moveItemToFront<T extends string>(items: T[], nextItem: T) {
  return [nextItem, ...items.filter((item) => item !== nextItem)];
}

function isToolId(value: string | null): value is VeraToolId {
  return Boolean(
    value &&
    ["analysis", "route", "drill", "review", "ptn", "summary"].includes(value),
  );
}

function getContextType(typeId: VeraContextTypeId): VeraContextType {
  return (
    veraContextTypes.find((contextType) => contextType.id === typeId) ??
    fallbackContextType
  );
}

function buildGeneralReply(prompt: string, sourceTitles: string[]) {
  const sourceLine =
    sourceTitles.length > 0
      ? sourceTitles.join(", ")
      : "konteks belajar yang sedang aktif";
  const loweredPrompt = prompt.toLowerCase();

  if (loweredPrompt.includes("rasio")) {
    return `Aku membaca ${sourceLine}. Untuk rasio, pola yang paling sering bikin tempo melambat adalah ketika basis hitung berpindah di langkah kedua. Mulai dulu dari 3 soal pendek dengan urutan: tentukan basis, ubah perbandingan, lalu cek satuan hasil akhirnya.`;
  }

  if (
    loweredPrompt.includes("ptn") ||
    loweredPrompt.includes("ui") ||
    loweredPrompt.includes("jurusan")
  ) {
    return `Aku pakai ${sourceLine} sebagai pijakan. Dari konteks ini, langkah paling aman adalah menjaga topik yang sudah stabil tetap ringan, lalu mendorong PK dan PU sebagai sumber kenaikan skor yang paling realistis sebelum membahas target PTN lebih rinci.`;
  }

  return `Aku membaca ${sourceLine}. Pertanyaanmu paling dekat dengan dua kebutuhan: memperjelas konsep yang sedang lemah dan menjaga alur belajar tetap pendek. Kalau kamu butuh output yang lebih rapi, aku bisa siapkan versinya di Studio Vera tanpa memenuhi chat ini.`;
}

function buildStudioConfirmation(tool: VeraStudioTool) {
  return `Siap, ${tool.title.toLowerCase()} sudah aku siapkan di Studio Vera. Buka panel kanan untuk melihat hasil lengkapnya.`;
}

function VeraAiPageModule({ session }: { session: SessionContext }) {
  const searchParams = useSearchParams();
  const requestedArtifact = searchParams.get("artifact");
  const requestedToolParam = searchParams.get("tool");
  const requestedTool: VeraToolId | null = isToolId(requestedArtifact)
    ? requestedArtifact
    : isToolId(requestedToolParam)
      ? requestedToolParam
      : null;
  const [selectedSourceIds, setSelectedSourceIds] = useState(
    initialSelectedSourceIds,
  );
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [draft, setDraft] = useState("");
  const [generatedTools, setGeneratedTools] = useState<VeraToolId[]>(() =>
    requestedTool
      ? moveItemToFront(initialGeneratedTools, requestedTool)
      : initialGeneratedTools,
  );
  const [messages, setMessages] = useState<VeraMessage[]>(initialMessages);
  const [activeArtifactId, setActiveArtifactId] = useState<VeraToolId | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const selectedSources = useMemo(
    () =>
      veraContextSources.filter((source) =>
        selectedSourceIds.includes(source.id),
      ),
    [selectedSourceIds],
  );

  const activeVisibleSources = useMemo(() => {
    return selectedSources.filter((source) => {
      if (sourceFilter !== "all" && source.type !== sourceFilter) {
        return false;
      }

      return true;
    });
  }, [selectedSources, sourceFilter]);

  const generatedArtifacts = useMemo(
    () =>
      generatedTools
        .map((toolId) => veraStudioTools.find((tool) => tool.id === toolId))
        .filter((tool): tool is VeraStudioTool => Boolean(tool)),
    [generatedTools],
  );

  const resolvedActiveArtifactId = useMemo(() => {
    if (
      activeArtifactId &&
      generatedArtifacts.some((tool) => tool.id === activeArtifactId)
    ) {
      return activeArtifactId;
    }

    return null;
  }, [activeArtifactId, generatedArtifacts]);

  const activeArtifact = useMemo(
    () =>
      generatedArtifacts.find((tool) => tool.id === resolvedActiveArtifactId) ??
      null,
    [generatedArtifacts, resolvedActiveArtifactId],
  );

  function toggleSource(sourceId: string) {
    setSelectedSourceIds((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId],
    );
  }

  function requestDeleteSource(source: VeraContextSource) {
    setDeleteTarget({
      kind: "context",
      sourceId: source.id,
      label: source.title,
    });
  }

  function requestDeleteArtifact(tool: VeraStudioTool) {
    setDeleteTarget({
      kind: "artifact",
      toolId: tool.id,
      label: tool.outputTitle,
    });
  }

  function confirmDeleteTarget() {
    if (!deleteTarget) {
      return;
    }

    if (deleteTarget.kind === "context") {
      toggleSource(deleteTarget.sourceId);
      setDeleteTarget(null);
      return;
    }

    setGeneratedTools((current) =>
      current.filter((toolId) => toolId !== deleteTarget.toolId),
    );
    setActiveArtifactId((current) =>
      current === deleteTarget.toolId ? null : current,
    );
    setDeleteTarget(null);
  }

  function openArtifact(toolId: VeraToolId) {
    if (!generatedTools.includes(toolId)) {
      return;
    }

    setGeneratedTools((current) => moveItemToFront(current, toolId));
  }

  function handleToolRequest(toolId: VeraToolId) {
    const tool = veraStudioTools.find((item) => item.id === toolId);
    const mode = veraToolModes[toolId];
    const sourceTitles = selectedSources
      .slice(0, 3)
      .map((source) => source.title);

    if (!tool) {
      return;
    }

    setGeneratedTools((current) => moveItemToFront(current, toolId));
    setActiveArtifactId(toolId);
    setMessages((current) => [
      ...current,
      {
        id: `student-${toolId}-${current.length}`,
        role: "student",
        body: toolRequestLabels[toolId],
        createdAt: "Sekarang",
      },
      {
        id: `vera-${toolId}-${current.length}`,
        role: "vera",
        body: `${buildStudioConfirmation(tool)} ${mode.followUp}`,
        createdAt: "Sekarang",
        citations: sourceTitles,
      },
    ]);
  }

  function handleSend() {
    const nextDraft = draft.trim();

    if (!nextDraft) {
      return;
    }

    const citations = selectedSources.slice(0, 3).map((source) => source.title);

    setMessages((current) => [
      ...current,
      {
        id: `student-free-${current.length}`,
        role: "student",
        body: nextDraft,
        createdAt: "Sekarang",
      },
      {
        id: `vera-free-${current.length}`,
        role: "vera",
        body: buildGeneralReply(nextDraft, citations),
        createdAt: "Sekarang",
        citations,
      },
    ]);
    setDraft("");
  }

  return (
    <div className="min-h-svh bg-primary-50 text-secondary-900 lg:h-svh lg:overflow-hidden">
      <div className="relative flex min-h-svh flex-col lg:h-svh">
        <VeraTopBar session={session} />

        <main
          className={cn(
            "grid flex-1 gap-2 px-2 pb-2 md:px-3 md:pb-3 lg:min-h-0",
            activeArtifact
              ? "lg:grid-cols-[272px_minmax(0,1fr)_minmax(420px,40vw)] xl:grid-cols-[292px_minmax(560px,1fr)_minmax(520px,44vw)]"
              : "lg:grid-cols-[272px_minmax(0,1fr)_312px] xl:grid-cols-[292px_minmax(640px,1fr)_324px]",
          )}
        >
          <ContextPanel
            activeVisibleSources={activeVisibleSources}
            sourceFilter={sourceFilter}
            onFilterChange={setSourceFilter}
            onRequestRemoveSource={requestDeleteSource}
          />
          <ChatWorkspace
            draft={draft}
            messages={messages}
            onDraftChange={setDraft}
            onSend={handleSend}
          />
          <StudioPanel
            activeArtifact={activeArtifact}
            activeArtifactId={resolvedActiveArtifactId}
            generatedArtifacts={generatedArtifacts}
            selectedSources={selectedSources}
            onClosePreview={() => setActiveArtifactId(null)}
            onGenerateTool={handleToolRequest}
            onOpenArtifact={openArtifact}
            onRequestDeleteArtifact={requestDeleteArtifact}
          />
        </main>
        <DeleteConfirmationDialog
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteTarget}
          target={deleteTarget}
        />
      </div>
    </div>
  );
}

function VeraTopBar({ session }: { session: SessionContext }) {
  return (
    <header className="relative z-20 flex min-h-18 items-center gap-3 px-3 py-3 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          aria-label="Kembali ke dashboard"
          className="rounded-full border-primary-100 bg-white/78 text-primary-900 shadow-sm hover:bg-white"
          nativeButton={false}
          render={<Link href="/dashboard" />}
          size="icon-sm"
          variant="brandOutline"
        >
          <ArrowLeft />
        </Button>
        <Link
          aria-label="Vecalss dashboard"
          className="flex min-w-0 items-center gap-2.5 p-0 transition-opacity hover:opacity-90"
          href="/dashboard"
        >
          <Image
            alt="Vecalss logo"
            className="h-[26px] w-auto object-contain md:h-[30px]"
            height={42}
            priority
            src="/brand/logo-mark-cropped.png"
            width={42}
          />
          <span
            className="text-[1.35rem] leading-none tracking-[0.04em] text-primary-800 md:text-[1.7rem]"
            style={{ fontFamily: "var(--font-sports-world)" }}
          >
            VECALSS
          </span>
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-1.5 rounded-full border border-primary-100 bg-white/72 px-1.5 py-1 shadow-sm backdrop-blur">
        <StudentNotificationPopover items={studentNotificationItems} />
        <StudentAccountMenu extraItem="notifications" session={session} />
      </div>
    </header>
  );
}

function ContextPanel({
  activeVisibleSources,
  sourceFilter,
  onFilterChange,
  onRequestRemoveSource,
}: {
  activeVisibleSources: VeraContextSource[];
  sourceFilter: SourceFilter;
  onFilterChange: (filter: SourceFilter) => void;
  onRequestRemoveSource: (source: VeraContextSource) => void;
}) {
  return (
    <WorkspacePanel className="order-2 lg:order-1 lg:min-h-0">
      <PanelHeader title="Konteks Belajar" />

      <div className="border-b border-primary-100/70 px-4 py-3">
        <Dialog>
          <DialogTrigger
            render={
              <Button className="w-full rounded-xl" size="sm" variant="brand" />
            }
          >
            <Plus data-icon="inline-start" />
            Tambah konteks
          </DialogTrigger>
          <AddContextDialog />
        </Dialog>

        <div className="mt-3 flex flex-wrap gap-2">
          <SourceFilterChip
            active={sourceFilter === "all"}
            label="Semua"
            onClick={() => onFilterChange("all")}
          />
          {veraContextTypes.map((type) => (
            <SourceFilterChip
              active={sourceFilter === type.id}
              key={type.id}
              label={type.label}
              onClick={() => onFilterChange(type.id)}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {activeVisibleSources.length > 0 ? (
          <div className="grid gap-2">
            {activeVisibleSources.map((source) => (
              <ContextSourceRow
                key={source.id}
                source={source}
                onRemove={() => onRequestRemoveSource(source)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-primary-200 bg-white/76 px-4 py-5 text-sm text-secondary-500">
            Tidak ada konteks aktif pada filter ini.
          </div>
        )}
      </div>
    </WorkspacePanel>
  );
}

function SourceFilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary-700 bg-primary-700 text-white"
          : "border-primary-100 bg-white/84 text-secondary-600 hover:border-primary-300 hover:text-primary-800",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ContextSourceRow({
  source,
  onRemove,
}: {
  source: VeraContextSource;
  onRemove: () => void;
}) {
  const contextType = getContextType(source.type);
  const Icon = contextTypeIcons[source.type];

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-white/86 px-3 py-3 transition-colors hover:border-primary-200 hover:bg-white">
      <Icon className="size-4 shrink-0 text-primary-800" />

      <div className="min-w-0 flex-1">
        <span className="inline-flex rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-800">
          {contextType.label}
        </span>
        <p className="mt-1 truncate text-sm font-semibold text-secondary-950">
          {source.title}
        </p>
      </div>

      <button
        aria-label={`Hapus konteks ${source.title}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-secondary-400 transition-colors hover:bg-primary-50 hover:text-primary-800"
        onClick={onRemove}
        type="button"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function AddContextDialog() {
  const [materialQuery, setMaterialQuery] = useState("");
  const filteredMaterials = useMemo(() => {
    const query = materialQuery.trim().toLowerCase();

    if (!query) {
      return veraMaterialHistory;
    }

    return veraMaterialHistory.filter((material) =>
      [material.title, material.kind, material.topic]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [materialQuery]);

  return (
    <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[760px] gap-0 overflow-hidden rounded-5xl border border-primary-100 bg-[#f8fffb] p-0 text-secondary-950 shadow-[0_34px_120px_-50px_rgba(1,76,56,0.55)] sm:max-w-[760px]">
      <div className="border-b border-primary-100 px-5 py-5 md:px-6">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-xl font-semibold text-secondary-950">
            Tambahkan konteks
          </DialogTitle>
          <DialogDescription className="max-w-xl leading-6 text-secondary-500">
            Pilih data belajar yang ingin Vera pakai untuk membaca progres,
            menjawab pertanyaan, dan membuat rekomendasi.
          </DialogDescription>
        </DialogHeader>
      </div>

      <Tabs defaultValue="practice" className="min-h-0 gap-0">
        <div className="border-b border-primary-100 px-5 py-3 md:px-6">
          <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-primary-50 p-1">
            <TabsTrigger
              className="!h-auto !min-h-10 rounded-lg px-3 py-2 text-sm leading-5 data-[state=active]:shadow-sm"
              value="practice"
            >
              Hasil Latihan
            </TabsTrigger>
            <TabsTrigger
              className="!h-auto !min-h-10 rounded-lg px-3 py-2 text-sm leading-5 data-[state=active]:shadow-sm"
              value="material"
            >
              Materi
            </TabsTrigger>
            <TabsTrigger
              className="!h-auto !min-h-10 rounded-lg px-3 py-2 text-sm leading-5 data-[state=active]:shadow-sm"
              value="document"
            >
              Dokumen
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-5 md:px-6">
          <TabsContent className="m-0" value="practice">
            <div className="grid gap-3">
              {veraPracticeHistory.map((item) => (
                <PracticeContextOption item={item} key={item.id} />
              ))}
            </div>
          </TabsContent>

          <TabsContent className="m-0" value="material">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
              <Input
                className="h-11 rounded-2xl border-primary-100 bg-white pl-11 text-sm placeholder:text-secondary-400 focus-visible:border-primary-300 focus-visible:ring-primary-200/70"
                onChange={(event) => setMaterialQuery(event.target.value)}
                placeholder="Cari materi Vecalss..."
                value={materialQuery}
              />
            </div>
            <div className="mt-4 grid gap-3">
              {filteredMaterials.length > 0 ? (
                filteredMaterials.map((item) => (
                  <MaterialContextOption item={item} key={item.id} />
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-primary-200 bg-white/72 p-5 text-center text-sm leading-6 text-secondary-500">
                  Materi tidak ditemukan.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent className="m-0" value="document">
            <label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-4xl border border-dashed border-primary-300 bg-white/80 p-6 text-center transition-colors hover:border-primary-500 hover:bg-primary-50/70">
              <input
                accept=".pdf,.txt,text/plain,application/pdf"
                className="sr-only"
                multiple
                type="file"
              />
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
                <Upload className="size-5" />
              </span>
              <span className="mt-4 text-base font-semibold text-secondary-950">
                Upload dokumen belajar
              </span>
              <span className="mt-2 max-w-sm text-sm leading-6 text-secondary-500">
                Seret file ke sini atau pilih dari perangkat. Mendukung PDF dan
                TXT untuk catatan, rangkuman, dan materi eksternal.
              </span>
              <span className="mt-5 inline-flex rounded-full bg-primary-700 px-4 py-2 text-sm font-semibold text-white">
                Pilih file
              </span>
            </label>
          </TabsContent>
        </div>
      </Tabs>
    </DialogContent>
  );
}

function PracticeContextOption({ item }: { item: VeraPracticeHistory }) {
  return (
    <button
      className="group flex w-full items-center gap-3 rounded-3xl border border-primary-100 bg-white/84 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:bg-white"
      type="button"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
        <ChartNoAxesColumnIncreasing className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-secondary-950">
            {item.title}
          </span>
          <span className="rounded-full bg-[#f5c518]/18 px-2 py-0.5 text-xs font-semibold text-[#6a5300]">
            {item.kind}
          </span>
        </span>
        <span className="mt-1 block text-xs leading-5 text-secondary-500">
          {item.meta} • {item.result}
        </span>
      </span>
      <CheckCircle2 className="size-4 shrink-0 text-primary-500 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function MaterialContextOption({ item }: { item: VeraMaterialHistory }) {
  return (
    <button
      className="group flex w-full items-center gap-3 rounded-3xl border border-primary-100 bg-white/84 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:bg-white"
      type="button"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
        <NotebookPen className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-secondary-950">
            {item.title}
          </span>
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-800">
            {item.kind}
          </span>
        </span>
        <span className="mt-1 block text-xs leading-5 text-secondary-500">
          {item.topic} • {item.lastAccessed}
        </span>
      </span>
      <CheckCircle2 className="size-4 shrink-0 text-primary-500 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function ChatWorkspace({
  draft,
  messages,
  onDraftChange,
  onSend,
}: {
  draft: string;
  messages: VeraMessage[];
  onDraftChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <WorkspacePanel className="order-1 min-h-[720px] lg:order-2 lg:min-h-0">
      <PanelHeader title="Chat" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 px-4 py-4 md:px-5">
          {messages.map((message) => (
            <MessageCard key={message.id} message={message} />
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

function MessageCard({ message }: { message: VeraMessage }) {
  const isStudent = message.role === "student";

  return (
    <div className={cn("flex", isStudent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-3xl rounded-3xl border px-4 py-4",
          isStudent
            ? "border-primary-200 bg-primary-50/86"
            : "border-primary-100 bg-white/88",
        )}
      >
        {!isStudent ? (
          <div className="mb-2 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
              <Bot className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-secondary-950">Vera</p>
              <p className="text-xs text-secondary-400">{message.createdAt}</p>
            </div>
          </div>
        ) : (
          <p className="mb-2 text-xs font-semibold text-secondary-500">
            Kamu • {message.createdAt}
          </p>
        )}

        <p className="text-sm leading-7 text-secondary-700">{message.body}</p>

        {message.citations && message.citations.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {message.citations.map((citation) => (
              <span
                className="inline-flex rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800"
                key={citation}
              >
                {citation}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
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
    <div className="border-t border-primary-100/80 bg-white/80 px-4 py-2.5 md:px-5">
      <div className="rounded-3xl border border-primary-100 bg-white p-2.5">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <Input
            className="h-10 flex-1 border-transparent bg-transparent px-1 text-sm text-secondary-900 placeholder:text-secondary-400 focus-visible:border-transparent focus-visible:ring-0"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Tanya Vera tentang materi, strategi, atau langkah berikutnya..."
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
        </form>
      </div>
    </div>
  );
}

function StudioPanel({
  activeArtifact,
  activeArtifactId,
  generatedArtifacts,
  selectedSources,
  onClosePreview,
  onGenerateTool,
  onOpenArtifact,
  onRequestDeleteArtifact,
}: {
  activeArtifact: VeraStudioTool | null;
  activeArtifactId: VeraToolId | null;
  generatedArtifacts: VeraStudioTool[];
  selectedSources: VeraContextSource[];
  onClosePreview: () => void;
  onGenerateTool: (toolId: VeraToolId) => void;
  onOpenArtifact: (toolId: VeraToolId) => void;
  onRequestDeleteArtifact: (tool: VeraStudioTool) => void;
}) {
  if (activeArtifact) {
    return (
      <WorkspacePanel className="order-3 lg:min-h-0">
        <PanelHeader
          action={
            <Button
              className="rounded-full"
              onClick={onClosePreview}
              size="sm"
              variant="ghost"
            >
              Kembali
            </Button>
          }
          title="Studio Vera"
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <StudioArtifactPreview
            selectedSources={selectedSources}
            tool={activeArtifact}
          />
        </div>
      </WorkspacePanel>
    );
  }

  return (
    <WorkspacePanel className="order-3 lg:min-h-0">
      <PanelHeader title="Studio Vera" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          {veraStudioTools.map((tool) => (
            <StudioGenerateRow
              key={tool.id}
              tool={tool}
              onGenerate={() => onGenerateTool(tool.id)}
            />
          ))}
        </div>

        <section className="mt-6 border-t border-primary-100 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-secondary-500 uppercase">
                Hasil
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2">
            {generatedArtifacts.map((tool) => (
              <StudioArtifactCard
                active={activeArtifactId === tool.id}
                key={tool.id}
                tool={tool}
                onOpen={() => onOpenArtifact(tool.id)}
                onRequestDelete={() => onRequestDeleteArtifact(tool)}
              />
            ))}
          </div>
        </section>
      </div>
    </WorkspacePanel>
  );
}

function StudioArtifactPreview({
  selectedSources,
  tool,
}: {
  selectedSources: VeraContextSource[];
  tool: VeraStudioTool | null;
}) {
  if (!tool) {
    return (
      <div className="text-sm leading-6 text-secondary-500">
        Belum ada hasil yang dipilih. Generate output dari Studio Vera atau
        minta Vera menyiapkannya lewat chat.
      </div>
    );
  }

  const mode = veraToolModes[tool.id];

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-primary-100 pb-4">
        <h3 className="text-xl font-semibold leading-tight text-secondary-950">
          {tool.outputTitle}
        </h3>
        <p className="mt-2 text-sm leading-6 text-secondary-700">
          {tool.outputBody}
        </p>
      </div>

      <div className="space-y-6 py-5">
        <div className="grid gap-4 sm:grid-cols-3">
          {mode.metrics.map((metric) => (
            <div key={metric.label}>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-secondary-500 uppercase">
                {metric.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-secondary-950">
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-secondary-500 uppercase">
            Ringkasan
          </p>
          <p className="mt-2 text-sm leading-7 text-secondary-700">
            {mode.description}
          </p>
        </div>

        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-secondary-500 uppercase">
            Detail
          </p>
          <div className="mt-3 space-y-3">
            {mode.highlights.map((highlight) => (
              <p
                className="text-sm leading-7 text-secondary-700"
                key={highlight}
              >
                {highlight}
              </p>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-secondary-500 uppercase">
            Konteks Dipakai
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedSources.map((source) => (
              <span
                className="inline-flex rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800"
                key={source.id}
              >
                {source.title}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudioGenerateRow({
  tool,
  onGenerate,
}: {
  tool: VeraStudioTool;
  onGenerate: () => void;
}) {
  const ToolIcon = toolIcons[tool.id];

  return (
    <button
      className="flex min-h-24 flex-col items-start justify-between gap-3 rounded-2xl border border-primary-100 bg-white/84 p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 hover:bg-white hover:shadow-[0_18px_46px_-38px_rgba(1,76,56,0.32)]"
      onClick={onGenerate}
      type="button"
    >
      <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
        <ToolIcon className="size-4" aria-hidden="true" />
      </span>

      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 text-sm font-semibold leading-5 text-secondary-950">
          {tool.title}
        </span>
        <ChevronRight className="size-4 shrink-0 text-primary-700" />
      </span>
    </button>
  );
}

function StudioArtifactCard({
  active,
  tool,
  onOpen,
  onRequestDelete,
}: {
  active: boolean;
  tool: VeraStudioTool;
  onOpen: () => void;
  onRequestDelete: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      aria-label={`Buka hasil ${tool.outputTitle}`}
      className={cn(
        "group rounded-2xl border p-3 text-left transition-all duration-300",
        "cursor-pointer hover:-translate-y-1 hover:shadow-[0_24px_58px_-42px_rgba(1,76,56,0.42)]",
        active
          ? "border-primary-300 bg-white"
          : "border-primary-100 bg-white/84 hover:border-primary-200 hover:bg-white",
      )}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-3 transition-transform duration-300",
          active ? "translate-y-0" : "group-hover:-translate-y-0.5",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-secondary-950">
            {tool.outputTitle}
          </p>
          <p className="mt-1 text-xs text-secondary-500">{tool.title}</p>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-secondary-600">
            {tool.outputBody}
          </p>
        </div>

        <button
          aria-label={`Hapus hasil ${tool.outputTitle}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-secondary-400 transition-colors hover:bg-primary-50 hover:text-primary-800"
          onClick={(event) => {
            event.stopPropagation();
            onRequestDelete();
          }}
          type="button"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

    </div>
  );
}

function DeleteConfirmationDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: DeleteTarget | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = target?.kind === "artifact" ? "Hapus hasil?" : "Hapus konteks?";
  const description =
    target?.kind === "artifact"
      ? `Hasil "${target.label}" akan dihapus dari daftar hasil.`
      : `Konteks "${target?.label ?? ""}" akan dihapus dari workspace belajar.`;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      open={target !== null}
    >
      <DialogContent className="max-w-[28rem] border border-primary-100 bg-[#fbfffd] shadow-[0_24px_80px_-30px_rgba(1,76,56,0.45)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-secondary-950">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-1 leading-6 text-secondary-600">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="rounded-full" onClick={onCancel} variant="ghost">
            Batal
          </Button>
          <Button
            className="rounded-full border-danger-200 bg-danger-50 text-danger-700 hover:bg-danger-100 hover:text-danger-800 focus-visible:border-danger-400 focus-visible:ring-danger-200"
            onClick={onConfirm}
            variant="destructive"
          >
            Hapus
          </Button>
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
        "flex min-h-[520px] flex-col overflow-hidden rounded-3xl border border-primary-100/90 bg-white/82 backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  action,
  title,
}: {
  action?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-primary-100/80 px-4 py-3">
      <div className="flex min-w-0 items-center">
        <h2 className="truncate text-base font-semibold text-secondary-950">
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export { VeraAiPageModule };

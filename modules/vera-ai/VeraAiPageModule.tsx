"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpenCheck,
  Bot,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  Dumbbell,
  FileQuestion,
  FileText,
  GraduationCap,
  LayoutPanelLeft,
  Lightbulb,
  ListChecks,
  MessageCircle,
  NotebookPen,
  PanelRight,
  Plus,
  SendHorizontal,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { StudentNotificationPopover } from "@/modules/student/components/student-notification-popover";

import {
  veraContextSources,
  veraQuickPrompts,
  veraStudioTools,
  veraToolModes,
  type VeraContextSource,
  type VeraStudioTool,
  type VeraToolId,
  type VeraToolMode,
} from "./data";

type ActiveMode = VeraToolId | "chat";

const toolIcons: Record<VeraToolId, LucideIcon> = {
  analysis: ChartNoAxesColumnIncreasing,
  route: ListChecks,
  drill: Dumbbell,
  review: FileQuestion,
  ptn: GraduationCap,
  summary: FileText,
};

const sourceIcons: Record<string, LucideIcon> = {
  "Hasil tryout terakhir": ChartNoAxesColumnIncreasing,
  "Riwayat quiz": BookOpenCheck,
  "Soal salah": FileQuestion,
  "Target PTN": Target,
  "Modul yang sedang dipelajari": NotebookPen,
  "Drill terakhir": Dumbbell,
};

const toolToneClass: Record<VeraStudioTool["tone"], string> = {
  cream: "bg-[#fff8e8] text-[#6b5620] ring-[#f1d88a]/70",
  gold: "bg-[#fff3bc] text-[#6a5300] ring-[#f5c518]/70",
  green: "bg-[#e4f6eb] text-[#014c38] ring-[#96d9b5]/70",
  mint: "bg-[#dff8ef] text-[#0b624d] ring-[#8bdcc1]/70",
  rose: "bg-[#fff0ee] text-[#70413c] ring-[#f2b8ae]/70",
  sky: "bg-[#e9f5ff] text-[#245a78] ring-[#b4daf2]/70",
};

function VeraAiPageModule({ session }: { session: SessionContext }) {
  const [activeMode, setActiveMode] = useState<ActiveMode>("chat");

  const activeTool = useMemo(
    () =>
      activeMode === "chat"
        ? undefined
        : veraStudioTools.find((tool) => tool.id === activeMode),
    [activeMode],
  );

  return (
    <div className="min-h-svh bg-[#edf8f3] text-secondary-900 lg:h-svh lg:overflow-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_6%,rgba(245,197,24,0.18),transparent_30%),radial-gradient(circle_at_86%_10%,rgba(16,172,132,0.15),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(237,248,243,0.94))]" />
      <div className="relative flex min-h-svh flex-col lg:h-svh">
        <VeraTopBar session={session} />

        <main className="grid flex-1 gap-4 px-3 pb-3 md:px-4 md:pb-4 lg:min-h-0 lg:grid-cols-[300px_minmax(0,1fr)_330px] xl:grid-cols-[340px_minmax(560px,1fr)_360px]">
          <ContextPanel />
          <ChatWorkspace
            activeMode={activeMode}
            onModeChange={setActiveMode}
          />
          <StudioPanel
            activeMode={activeMode}
            activeTool={activeTool}
            onModeChange={setActiveMode}
          />
        </main>
      </div>
    </div>
  );
}

function VeraTopBar({ session }: { session: SessionContext }) {
  return (
    <header className="relative z-20 flex min-h-18 items-center gap-3 px-3 py-3 md:px-4">
      <Button
        className="rounded-full border-primary-100 bg-white/82 shadow-sm hover:bg-white"
        nativeButton={false}
        render={<Link href="/dashboard" />}
        size="sm"
        variant="brandOutline"
      >
        <ArrowLeft data-icon="inline-start" />
        Dashboard
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#014c38] text-white shadow-[0_16px_34px_-22px_rgba(1,76,56,0.8)]">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg leading-tight font-semibold md:text-xl">
            Vera AI
          </h1>
          <p className="hidden truncate text-xs font-medium text-secondary-500 sm:block">
            Workspace belajar UTBK/SNBT
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5 rounded-full border border-primary-100 bg-white/72 px-1.5 py-1 shadow-sm backdrop-blur">
        <StudentNotificationPopover />
        <StudentAccountMenu session={session} />
      </div>
    </header>
  );
}

function ContextPanel() {
  return (
    <WorkspacePanel className="lg:min-h-0">
      <PanelHeader icon={LayoutPanelLeft} title="Konteks Belajar" />

      <div className="px-4 py-3">
        <Button className="w-full rounded-full" size="sm" variant="brand">
          <Plus data-icon="inline-start" />
          Tambahkan konteks
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid gap-3">
          {veraContextSources.map((source) => (
            <ContextSourceCard key={source.id} source={source} />
          ))}
        </div>
      </div>

      <div className="border-t border-primary-100/80 px-4 py-3">
        <p className="rounded-2xl bg-primary-50/80 px-3 py-2 text-xs leading-5 text-secondary-500">
          Data belajar yang terhubung akan muncul di sini.
        </p>
      </div>
    </WorkspacePanel>
  );
}

function ContextSourceCard({ source }: { source: VeraContextSource }) {
  const Icon = sourceIcons[source.category] ?? BookOpenCheck;

  return (
    <button
      className="group w-full rounded-3xl border border-primary-100 bg-white/84 p-3 text-left shadow-[0_14px_34px_-30px_rgba(1,76,56,0.45)] transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:bg-white hover:shadow-[0_20px_44px_-32px_rgba(1,76,56,0.55)]"
      type="button"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-primary-700">
            {source.category}
          </span>
          <span className="mt-1 block text-sm leading-tight font-semibold text-secondary-900">
            {source.title}
          </span>
          <span className="mt-2 block text-xs leading-5 text-secondary-500">
            {source.detail}
          </span>
          <span className="mt-3 inline-flex rounded-full bg-[#f5c518]/18 px-2.5 py-1 text-[11px] font-semibold text-[#6a5300]">
            {source.meta}
          </span>
        </span>
      </div>
    </button>
  );
}

function ChatWorkspace({
  activeMode,
  onModeChange,
}: {
  activeMode: ActiveMode;
  onModeChange: (mode: ActiveMode) => void;
}) {
  const selectedMode =
    activeMode === "chat" ? undefined : veraToolModes[activeMode];

  return (
    <WorkspacePanel className="min-h-[720px] lg:min-h-0">
      <PanelHeader
        icon={MessageCircle}
        title="Vera AI"
        action={
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">
            <span className="size-2 rounded-full bg-[#10ac84]" />
            Siap bantu
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {selectedMode ? (
          <ToolModeWorkspace mode={selectedMode} />
        ) : (
          <DefaultChatState onModeChange={onModeChange} />
        )}
      </div>

      <ChatComposer activeMode={activeMode} />
    </WorkspacePanel>
  );
}

function DefaultChatState({
  onModeChange,
}: {
  onModeChange: (mode: ActiveMode) => void;
}) {
  return (
    <div className="flex min-h-full flex-col justify-center">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white/80 px-3 py-1 text-xs font-semibold text-primary-800">
          <Sparkles className="size-3.5" />
          Vecalss Research Assistant
        </div>
        <h2 className="max-w-2xl text-3xl leading-tight font-semibold text-secondary-950 md:text-4xl">
          Halo, aku Vera.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-8 text-secondary-600">
          Aku bisa bantu jelaskan materi, membaca kelemahanmu, membuat drill
          adaptif, dan menyusun strategi belajar.
        </p>

        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          {veraQuickPrompts.map((prompt) => (
            <button
              className="group flex min-h-14 items-center justify-between gap-3 rounded-3xl border border-primary-100 bg-white/82 px-4 py-3 text-left text-sm font-semibold text-secondary-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:bg-white"
              key={prompt.id}
              onClick={() => onModeChange(prompt.mode)}
              type="button"
            >
              <span>{prompt.label}</span>
              <ChevronRight className="size-4 shrink-0 text-primary-600 transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolModeWorkspace({ mode }: { mode: VeraToolMode }) {
  const Icon = toolIcons[mode.id];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center py-4">
      <div className="rounded-[32px] border border-primary-100 bg-white/78 p-4 shadow-[0_28px_80px_-64px_rgba(1,76,56,0.5)] md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">
              <Icon className="size-3.5" />
              {mode.eyebrow}
            </div>
            <h2 className="mt-5 max-w-3xl text-2xl leading-tight font-semibold text-secondary-950 md:text-3xl">
              {mode.title}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-secondary-600 md:text-base">
              {mode.description}
            </p>
          </div>
          <Button className="rounded-full" size="sm" variant="brand">
            {mode.primaryAction}
            <Sparkles data-icon="inline-end" />
          </Button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {mode.metrics.map((metric) => (
            <div
              className="rounded-3xl border border-primary-100 bg-primary-50/70 p-4"
              key={metric.label}
            >
              <p className="text-xs font-semibold text-secondary-500">
                {metric.label}
              </p>
              <p className="mt-2 text-xl leading-none font-semibold text-secondary-950">
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3">
          {mode.highlights.map((highlight, index) => (
            <div
              className="flex gap-3 rounded-3xl border border-primary-100 bg-white/82 p-4"
              key={highlight}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#014c38] text-xs font-semibold text-white">
                {index + 1}
              </span>
              <p className="text-sm leading-6 text-secondary-650">
                {highlight}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl bg-[#014c38] p-4 text-white">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#f5c518]" />
            <p className="text-sm leading-6 text-white/82">{mode.followUp}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatComposer({ activeMode }: { activeMode: ActiveMode }) {
  return (
    <div className="border-t border-primary-100/80 bg-white/72 px-4 py-3 md:px-6">
      <div className="flex items-center gap-2 rounded-[28px] border border-primary-100 bg-white p-2 shadow-[0_18px_48px_-38px_rgba(1,76,56,0.55)]">
        <Button
          aria-label="Tambahkan konteks ke chat"
          className="rounded-full"
          size="icon-sm"
          variant="brandOutline"
        >
          <Plus />
        </Button>
        <Input
          className="h-12 flex-1 border-transparent bg-transparent px-2 text-secondary-900 placeholder:text-secondary-400 focus-visible:border-transparent focus-visible:ring-0"
          placeholder="Tanya Vera tentang materi atau strategi belajar..."
          readOnly
        />
        <span className="hidden rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800 sm:inline-flex">
          {activeMode === "chat" ? "Chat" : veraToolModes[activeMode].eyebrow}
        </span>
        <Button
          aria-label="Kirim pertanyaan ke Vera"
          className="rounded-full"
          disabled
          size="icon-sm"
          variant="brand"
        >
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
}

function StudioPanel({
  activeMode,
  activeTool,
  onModeChange,
}: {
  activeMode: ActiveMode;
  activeTool?: VeraStudioTool;
  onModeChange: (mode: ActiveMode) => void;
}) {
  return (
    <WorkspacePanel className="lg:min-h-0">
      <PanelHeader icon={PanelRight} title="Studio Vera" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {veraStudioTools.map((tool) => (
            <StudioToolCard
              active={activeMode === tool.id}
              key={tool.id}
              onSelect={() => onModeChange(tool.id)}
              tool={tool}
            />
          ))}
        </div>

        <div className="mt-5 border-t border-primary-100 pt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-secondary-950">
              Output Vera
            </h2>
            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-800">
              {activeTool ? "Generated" : "Kosong"}
            </span>
          </div>

          {activeTool ? (
            <div className="mt-3 rounded-[26px] border border-primary-100 bg-white/82 p-4">
              <div
                className={cn(
                  "mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1",
                  toolToneClass[activeTool.tone],
                )}
              >
                {activeTool.badge}
              </div>
              <h3 className="text-base leading-snug font-semibold text-secondary-950">
                {activeTool.outputTitle}
              </h3>
              <p className="mt-2 text-sm leading-6 text-secondary-600">
                {activeTool.outputBody}
              </p>
              <Button className="mt-4 w-full rounded-full" size="sm" variant="brandOutline">
                Buka di chat
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex min-h-[240px] flex-col items-center justify-center rounded-[26px] border border-dashed border-primary-200 bg-primary-50/54 p-6 text-center">
              <Sparkles className="size-8 text-primary-500" />
              <p className="mt-4 text-sm leading-6 text-secondary-500">
                Hasil analisis, drill, rute belajar, dan pembahasan dari Vera
                akan muncul di sini.
              </p>
            </div>
          )}
        </div>
      </div>
    </WorkspacePanel>
  );
}

function StudioToolCard({
  active,
  onSelect,
  tool,
}: {
  active: boolean;
  onSelect: () => void;
  tool: VeraStudioTool;
}) {
  const Icon = toolIcons[tool.id];

  return (
    <button
      className={cn(
        "group min-h-[132px] rounded-[26px] p-3 text-left ring-1 transition-all hover:-translate-y-0.5",
        toolToneClass[tool.tone],
        active
          ? "shadow-[0_18px_48px_-34px_rgba(1,76,56,0.6)] outline-2 outline-[#014c38]"
          : "hover:shadow-[0_18px_44px_-36px_rgba(1,76,56,0.45)]",
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-2xl bg-white/64">
          <Icon className="size-4" />
        </span>
        <span className="rounded-full bg-white/60 px-2 py-1 text-[11px] font-semibold">
          {tool.badge}
        </span>
      </span>
      <span className="mt-3 block text-sm leading-snug font-semibold">
        {tool.title}
      </span>
      <span className="mt-2 block text-xs leading-5 opacity-78">
        {tool.description}
      </span>
    </button>
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
        "flex min-h-[520px] flex-col overflow-hidden rounded-[30px] border border-primary-100/90 bg-white/72 shadow-[0_28px_88px_-68px_rgba(1,76,56,0.58)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  action,
  icon: Icon,
  title,
}: {
  action?: React.ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 border-b border-primary-100/80 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Icon className="size-4" />
        </span>
        <h2 className="truncate text-base font-semibold text-secondary-950">
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export { VeraAiPageModule };

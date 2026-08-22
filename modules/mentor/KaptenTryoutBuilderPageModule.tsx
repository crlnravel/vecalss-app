"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  ListChecks,
  Lock,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Upload,
  Users,
  X,
} from "@/lib/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { assemblyCompatibleWithTestType } from "@/lib/tryout/assembly-validation";
import type { AssemblyAttachmentSummary, AssemblyPreview } from "@/lib/tryout/assembly-repository";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { AssessmentReleaseNotice } from "@/modules/mentor/KaptenTryoutOperationalShared";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { KaptenTryoutAttemptsPageModule } from "@/modules/mentor/KaptenTryoutAttemptsPageModule";
import { KaptenTryoutLivePageModule } from "@/modules/mentor/KaptenTryoutLivePageModule";
import { KaptenTryoutPolicyPageModule } from "@/modules/mentor/KaptenTryoutPolicyPageModule";
import { KaptenTryoutResultsPageModule } from "@/modules/mentor/KaptenTryoutResultsPageModule";
import { KaptenTryoutSessionsPageModule } from "@/modules/mentor/KaptenTryoutSessionsPageModule";
import { listQuestionBankSourcePageAction, listQuestionBankSourceQuestionsAction } from "@/modules/mentor/question-bank-actions";
import { attachReadyAssemblyAction, detachReadyAssemblyAction, previewAssemblyAction } from "@/modules/mentor/assembly-actions";
import { duplicateTryoutAction, saveTryoutAction } from "@/modules/mentor/tryout-actions";

const subjectCodes = kaptenSubjects.map((subject) => subject.code) as Array<"PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM">;
type SubjectCode = (typeof subjectCodes)[number];
type SelectionMode = "direct" | "set" | "pool" | "blueprint" | "cat_pool";
type AssemblyMode = "fixed_set" | "random_pool" | "blueprint" | "cat_pool";
type SelectionModes = Partial<Record<SubjectCode, SelectionMode>>;
type DirectQuestionDraft = {
  bankId?: string;
  bankTitle?: string;
  catReady?: boolean;
  difficulty?: "easy" | "medium" | "hard";
  hasExplanation?: boolean;
  hasReadyMedia?: boolean;
  prompt?: string;
  sourceContentDigest?: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId?: string;
};
type TestDraft = {
  catItemCount?: number;
  directQuestions?: DirectQuestionDraft[];
  durationMinutes: number;
  instructions: string;
  packageVersionId?: string;
  packageVersionLabel?: string;
  packageVersionMode?: AssemblyMode;
  scoringConfig?: Record<string, unknown>;
  shuffleItems: boolean;
  subtest: SubjectCode;
  testType: "cbt" | "cat";
};
type ReleaseMeta = {
  digest: string;
  id: string;
  number: number;
  payload?: unknown;
  publishedAt: string;
};
type TryoutDraft = {
  assessmentRelease?: ReleaseMeta | null;
  description: string;
  id: string;
  locked: boolean;
  sections: TestDraft[];
  status: "draft" | "published";
  title: string;
  updatedAt: number;
};
type ReadyVersion = {
  catReady: boolean;
  contentReady: boolean;
  hasExplanations: boolean;
  hasReadyMedia: boolean;
  id: string;
  itemCount: number;
  label: string;
  sourceQuestionIds: string[];
  subtest: SubjectCode;
};
type SourceBank = {
  categories?: Array<{ id: string; name: string }>;
  description: string;
  folderPath?: Array<{ id: string | null; name: string }>;
  id: string;
  questionCount: number;
  subjectCoverage?: string[];
  title: string;
};
type SourceQuestion = {
  bankId: string;
  catReady?: boolean;
  choices: Array<{ id: string; mediaAssetId?: string; text: string }>;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  explanationMediaAssetId?: string;
  id: string;
  prompt: string;
  promptMediaAssetId?: string;
  questionContentDigest?: string;
  questionRevisionId?: string;
  subjectCode: string;
};
type MockPoolCandidate = {
  bankTitle: string;
  catReady: boolean;
  difficulty: "easy" | "medium" | "hard";
  hasExplanation: boolean;
  hasReadyMedia: boolean;
  id: string;
  prompt: string;
  selected: boolean;
  stale?: boolean;
};
type PoolMockDraft = {
  candidates: MockPoolCandidate[];
  drawCount: number;
  name: string;
  previewSeed: string;
  previewState: "idle" | "sample" | "shortage" | "stale";
};
type BlueprintMockDraft = {
  easy: number;
  hard: number;
  medium: number;
  name: string;
  selectedBankIds: string[];
  shortagePreview: boolean;
  total: number;
};
type CatPoolMockCandidate = MockPoolCandidate & { included: boolean };
type CatPoolMockDraft = {
  candidates: CatPoolMockCandidate[];
  deliveredCount: number;
  name: string;
};
type Workspace = "basics" | "sections" | "questions" | "rules" | "schedule" | "live" | "attempts" | "results" | "review" | "publish";

const workspaceItems: Array<{ label: string; value: Workspace }> = [
  { label: "Basics", value: "basics" },
  { label: "Sections", value: "sections" },
  { label: "Questions", value: "questions" },
  { label: "Rules", value: "rules" },
  { label: "Schedule & akses", value: "schedule" },
  { label: "Live", value: "live" },
  { label: "Attempts", value: "attempts" },
  { label: "Results", value: "results" },
  { label: "Review", value: "review" },
  { label: "Publish", value: "publish" },
];

function defaultSections(): TestDraft[] {
  return subjectCodes.map((subtest) => ({
    directQuestions: [],
    durationMinutes: 30,
    instructions: "",
    shuffleItems: false,
    subtest,
    testType: "cbt",
  }));
}

function normalize(draft: TryoutDraft): TryoutDraft {
  const byCode = new Map(draft.sections.map((section) => [section.subtest, section]));
  const fallback = defaultSections();
  return {
    ...draft,
    sections: subjectCodes.map((code) => byCode.get(code) ?? fallback.find((section) => section.subtest === code)!),
  };
}

function normalizeWorkspace(value?: string): Workspace {
  switch (value) {
    case "basics":
    case "sections":
    case "questions":
    case "rules":
    case "schedule":
    case "live":
    case "attempts":
    case "results":
    case "review":
    case "publish":
      return value;
    case "authoring":
      return "sections";
    case "policy":
    case "sessions":
    case "participants":
    case "operations":
      return "schedule";
    default:
      return "basics";
  }
}

function subjectName(code: SubjectCode) {
  return kaptenSubjects.find((subject) => subject.code === code)?.name ?? code;
}

const mockBankOptions = [
  { id: "mock-bank-teras", title: "Bank UTBK Teras" },
  { id: "mock-bank-jelajah", title: "Bank UTBK Jelajah" },
] as const;

function releaseFor(
  draft: TryoutDraft,
  operationsInitial?: TryoutOperationsView,
): ReleaseMeta | null {
  return draft.assessmentRelease ?? operationsInitial?.assessmentRelease ?? null;
}

function WorkspaceUnavailable({ onSaveDraft }: { onSaveDraft: () => void }) {
  return (
    <section className="grid min-h-56 place-items-center rounded-3xl border border-dashed border-primary-200 bg-white px-6 py-12 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
          <Save aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-secondary-900">Simpan draf untuk membuka ruang ini</h2>
        <p className="text-sm leading-6 text-secondary-600">Basics, Sections, dan Review bisa disiapkan sekarang. Jadwal, peserta, dan hasil akan tersambung setelah Tryout memiliki ID.</p>
        <Button onClick={onSaveDraft} variant="brand">Simpan draf</Button>
      </div>
    </section>
  );
}

function selectionModeForAssembly(mode: AssemblyMode): SelectionMode {
  if (mode === "fixed_set") return "set";
  if (mode === "random_pool") return "pool";
  return mode;
}

function assemblyModeLabel(mode: AssemblyMode) {
  if (mode === "fixed_set") return "Set Soal";
  if (mode === "random_pool") return "Pool Soal";
  if (mode === "blueprint") return "Blueprint";
  return "CAT Pool";
}

function assemblyReadinessSummary(assembly: AssemblyAttachmentSummary) {
  const readiness = assembly.readiness;
  if (assembly.mode === "blueprint" && assembly.rule) {
    return `Mudah ${readiness.availableByDifficulty.easy}/${assembly.rule.easyCount} · Sedang ${readiness.availableByDifficulty.medium}/${assembly.rule.mediumCount} · Sulit ${readiness.availableByDifficulty.hard}/${assembly.rule.hardCount}`;
  }
  if (assembly.mode === "fixed_set") return `${assembly.itemCount} soal pada Set ini`;
  return `${readiness.eligibleCount} kandidat siap · ${readiness.requestedCount ?? assembly.itemCount} soal diambil`;
}

function ReadyAssemblyPicker({
  activeMode,
  assemblies,
  locked,
  onAttach,
  onDetach,
  onPreview,
  search,
  subtest,
  selectedId,
  setSearch,
  testType,
}: {
  activeMode: Exclude<SelectionMode, "direct">;
  assemblies: AssemblyAttachmentSummary[];
  locked: boolean;
  onAttach: (assembly: AssemblyAttachmentSummary) => void;
  onDetach: () => void;
  onPreview: (assembly: AssemblyAttachmentSummary) => void;
  search: string;
  selectedId?: string;
  setSearch: (value: string) => void;
  subtest: SubjectCode;
  testType: TestDraft["testType"];
}) {
  const mode = activeMode === "set" ? "fixed_set" : activeMode === "pool" ? "random_pool" : activeMode;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const modeAssemblies = assemblies.filter((assembly) => assembly.subtest === subtest && assembly.mode === mode);
  const compatible = modeAssemblies.filter((assembly) => assemblyCompatibleWithTestType(assembly.mode, testType) && (!normalizedSearch || assembly.packageTitle.toLocaleLowerCase().includes(normalizedSearch)));
  const selected = selectedId ? assemblies.find((assembly) => assembly.id === selectedId) : undefined;
  const selectedCompatible = selected ? assemblyCompatibleWithTestType(selected.mode, testType) : true;

  return (
    <section aria-labelledby="ready-assembly-title" className="grid min-w-0 gap-4 rounded-2xl border border-primary-100 bg-primary-50/45 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-secondary-900" id="ready-assembly-title">{assemblyModeLabel(mode)} Ready</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Pilih sumber yang sudah Ready untuk {subtest}. Kesiapan sumber akan diperiksa ulang server saat Tryout disimpan dan diterbitkan.</p>
        </div>
        {selected ? <Button disabled={locked} onClick={onDetach} size="sm" variant="brandOutline">Lepas sumber</Button> : null}
      </div>
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
        <FieldInput aria-label={`Cari ${assemblyModeLabel(mode)}`} className="h-10 rounded-xl bg-white py-2 pl-9 pr-3 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder={`Cari nama ${assemblyModeLabel(mode)}…`} value={search} />
      </div>
      {selected ? (
        <div className="grid gap-3 rounded-2xl border border-primary-300 bg-white p-4" role="status">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-800">Sumber terpasang</p><p className="mt-1 break-words font-semibold text-secondary-900">{selected.packageTitle}</p></div><Badge className="rounded-full" size="ui" variant={selectedCompatible && selected.readiness.ready ? "mint" : "accent"}>{selectedCompatible && selected.readiness.ready ? "Siap" : "Perlu ditinjau"}</Badge></div>
          <p className="text-sm leading-6 text-secondary-600">{assemblyReadinessSummary(selected)} · {selected.bankNames.join(", ") || "Bank Soal belum terbaca"}</p>
          {!selectedCompatible ? <p className="text-sm leading-6 text-[#6a4a00]">{selected.mode === "cat_pool" ? "CAT Pool hanya dapat dipakai pada Test CAT." : "Assembly ini hanya dapat dipakai pada Test CBT."}</p> : null}
          {selected.readiness.blockers.length ? <div className="grid gap-1 text-sm leading-5 text-[#6a4a00]">{selected.readiness.blockers.slice(0, 3).map((blocker) => <p key={`${blocker.code}-${blocker.message}`}>• {blocker.message}</p>)}</div> : null}
          <Button className="w-fit" disabled={locked} onClick={() => onPreview(selected)} size="sm" variant="ghost"><Eye />Lihat preview dan kesiapan</Button>
        </div>
      ) : null}
      <ul aria-label={`${assemblyModeLabel(mode)} yang kompatibel`} className="grid min-w-0 gap-2">
        {compatible.length ? compatible.map((assembly) => {
          const isSelected = selectedId === assembly.id;
          return (
            <li className="min-w-0" key={assembly.id}>
            <article className={`grid min-w-0 gap-3 rounded-2xl border bg-white p-4 ${isSelected ? "border-primary-300 ring-2 ring-primary-100" : "border-primary-100"}`}>
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold text-secondary-900">{assembly.packageTitle}</p><p className="mt-1 text-xs text-secondary-500">{assembly.bankNames.join(", ") || "Bank Soal"}</p></div><Badge className="rounded-full" size="ui" variant={assembly.readiness.ready ? "mint" : "accent"}>{assembly.readiness.ready ? "Ready" : "Ada blocker"}</Badge></div>
              <p className="text-sm leading-6 text-secondary-600">{assemblyReadinessSummary(assembly)}</p>
              {assembly.readiness.blockers.length ? <p className="text-sm leading-6 text-[#6a4a00]">{assembly.readiness.blockers[0]?.message}</p> : null}
              <div className="flex flex-wrap gap-2"><Button disabled={locked || isSelected} onClick={() => onAttach(assembly)} size="sm" variant={isSelected ? "ghost" : "brand"}>{isSelected ? "Terpasang" : "Pasang sumber"}</Button><Button onClick={() => onPreview(assembly)} size="sm" variant="brandOutline"><Eye />Preview</Button></div>
            </article>
            </li>
          );
        }) : <li className="list-none rounded-2xl border border-dashed border-primary-200 bg-white px-4 py-8 text-center text-sm leading-6 text-secondary-500">{modeAssemblies.length ? (assemblyCompatibleWithTestType(mode, testType) ? "Tidak ada sumber yang cocok dengan pencarian." : mode === "cat_pool" ? "CAT Pool hanya tersedia untuk Test CAT." : "Assembly ini hanya tersedia untuk Test CBT.") : `Belum ada ${assemblyModeLabel(mode)} Ready untuk ${subtest}.`}</li>}
      </ul>
    </section>
  );
}

function MockFlowNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-accent-300/70 bg-accent-200/45 px-4 py-3 text-sm leading-6 text-secondary-800" role="status">
      <SlidersHorizontal className="mt-1 size-4 shrink-0 text-primary-800" />
      <div className="min-w-0">
        <p className="font-semibold text-secondary-900">Mock flow lokal · belum tersimpan</p>
        <p>{children}</p>
      </div>
    </div>
  );
}

function MockDifficultyLabel({ difficulty }: { difficulty: MockPoolCandidate["difficulty"] }) {
  return <span>{difficulty === "easy" ? "Mudah" : difficulty === "hard" ? "Sulit" : "Sedang"}</span>;
}

function PoolMockPanel({
  draft,
  locked,
  onChange,
}: {
  draft: PoolMockDraft;
  locked: boolean;
  onChange: (change: Partial<PoolMockDraft>) => void;
}) {
  const selectedCandidates = draft.candidates.filter((candidate) => candidate.selected);
  const selectedStale = selectedCandidates.filter((candidate) => candidate.stale);
  const previewCandidates = selectedCandidates.filter((candidate) => !candidate.stale).slice(0, draft.drawCount);
  const previewResult = draft.previewState === "sample"
    ? `Contoh ${previewCandidates.length} soal dari ${selectedCandidates.length} kandidat.`
    : draft.previewState === "stale"
      ? "Satu kandidat perlu ditinjau sebelum sample dapat dipakai."
      : draft.previewState === "shortage"
        ? `Butuh ${draft.drawCount} soal, baru ${selectedCandidates.length} kandidat yang dipilih.`
        : "Pilih kandidat lalu lihat sample ilustratifnya.";
  const toggleCandidate = (id: string) => onChange({
    candidates: draft.candidates.map((candidate) => candidate.id === id ? { ...candidate, selected: !candidate.selected } : candidate),
    previewState: "idle",
  });
  const toggleStale = () => {
    const target = selectedCandidates[0] ?? draft.candidates[0];
    if (!target) return;
    onChange({
      candidates: draft.candidates.map((candidate) => candidate.id === target.id ? { ...candidate, selected: true, stale: !candidate.stale } : candidate),
      previewState: "idle",
    });
  };
  const preview = () => onChange({
    previewSeed: "preview-7D3A",
    previewState: selectedStale.length ? "stale" : selectedCandidates.length < draft.drawCount ? "shortage" : "sample",
  });

  return (
    <section aria-labelledby="pool-mock-title" className="grid gap-5 rounded-2xl border border-primary-200 bg-primary-50/45 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-secondary-900" id="pool-mock-title">Pool Soal · contoh alur</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Tetapkan kandidat sekarang. Bentuk final baru diundi sekali saat AssessmentRelease dibuat.</p>
        </div>
        <Badge className="rounded-full" size="ui" variant="accent">Preview</Badge>
      </div>
      <MockFlowNotice>Data di bawah hanya fixture untuk menyepakati interaksi. Tidak ada Pool, revisi, atau rilis yang dibuat dari layar ini.</MockFlowNotice>
      <div className="grid gap-4 lg:grid-cols-[minmax(14rem,.72fr)_minmax(0,1.28fr)]">
        <div className="grid content-start gap-4">
          <Field>
            <FieldLabel htmlFor="pool-mock-name">Nama Pool</FieldLabel>
            <FieldInput disabled={locked} id="pool-mock-name" onChange={(event) => onChange({ name: event.target.value })} value={draft.name} />
          </Field>
          <Field>
            <FieldLabel htmlFor="pool-mock-draw-count">Jumlah soal yang diambil</FieldLabel>
            <FieldInput disabled={locked} id="pool-mock-draw-count" min="1" onChange={(event) => onChange({ drawCount: Math.max(1, Number(event.target.value) || 1), previewState: "idle" })} type="number" value={draft.drawCount} />
            <p className="mt-1 text-xs leading-5 text-secondary-500">Preview memakai seed sementara {draft.previewSeed}; seed rilis dibuat server saat publish.</p>
          </Field>
          <div className="rounded-2xl border border-primary-100 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-800">Ringkasan Pool</p>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-secondary-500">Kandidat dipilih</dt><dd className="font-semibold text-secondary-900">{selectedCandidates.length}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-secondary-500">Jumlah diambil</dt><dd className="font-semibold text-secondary-900">{draft.drawCount}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-secondary-500">Status sample</dt><dd className="font-semibold text-secondary-900">{draft.previewState === "sample" ? "Tersedia" : "Belum dilihat"}</dd></div>
            </dl>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={locked} onClick={preview} size="sm" variant="brand"><Eye />Lihat sample</Button>
            <Button disabled={locked || !draft.candidates.length} onClick={toggleStale} size="sm" variant="brandOutline">Uji kandidat stale</Button>
          </div>
        </div>
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold text-secondary-900">Pilih kandidat Pool</h4>
              <p className="text-sm leading-6 text-secondary-600">Kandidat eksplisit dapat berasal dari lebih dari satu Bank Soal.</p>
            </div>
            <span className="text-xs font-semibold text-secondary-500">{selectedCandidates.length} dipilih</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {draft.candidates.map((candidate) => (
              <Button
                aria-pressed={candidate.selected}
                className={`h-auto min-h-28 w-full min-w-0 max-w-full items-start justify-between overflow-hidden rounded-2xl border p-3 text-left ${candidate.selected ? "border-primary-300 bg-white text-secondary-900" : "border-primary-100 bg-white/75 text-secondary-700"}`}
                disabled={locked}
                key={candidate.id}
                onClick={() => toggleCandidate(candidate.id)}
                variant="ghost"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-primary-800"><MockDifficultyLabel difficulty={candidate.difficulty} /><span className="text-secondary-400">·</span><span className="truncate text-secondary-500">{candidate.bankTitle}</span></span>
                  <span className="mt-1 block line-clamp-3 text-sm leading-5">{candidate.prompt}</span>
                  {candidate.stale ? <span className="mt-2 block text-xs font-semibold text-[#8a5e00]">Perlu ditinjau sebelum publish</span> : null}
                </span>
                <span aria-hidden="true" className={`ml-2 grid size-6 shrink-0 place-items-center rounded-lg ${candidate.selected ? "bg-primary-700 text-white" : "bg-primary-50 text-primary-700"}`}>{candidate.selected ? <Check className="size-4" /> : <Plus className="size-4" />}</span>
              </Button>
            ))}
          </div>
          <div aria-live="polite" className={`rounded-2xl border p-4 text-sm leading-6 ${draft.previewState === "stale" || draft.previewState === "shortage" ? "border-accent-300 bg-accent-200/35 text-secondary-800" : "border-primary-100 bg-white text-secondary-700"}`}>
            <div className="flex items-start gap-3"><ListChecks className="mt-1 size-4 shrink-0 text-primary-800" /><div><p className="font-semibold text-secondary-900">{draft.previewState === "sample" ? "Sample ilustratif" : "Belum menjadi form rilis"}</p><p>{previewResult}</p>{draft.previewState === "sample" ? <ol className="mt-2 grid gap-1 text-xs text-secondary-600">{previewCandidates.map((candidate, index) => <li key={candidate.id}>{index + 1}. {candidate.prompt}</li>)}</ol> : null}</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BlueprintMockPanel({
  draft,
  locked,
  onChange,
}: {
  draft: BlueprintMockDraft;
  locked: boolean;
  onChange: (change: Partial<BlueprintMockDraft>) => void;
}) {
  const quotaSum = draft.easy + draft.medium + draft.hard;
  const quotaValid = quotaSum === draft.total && draft.total > 0 && draft.selectedBankIds.length > 0;
  return (
    <section aria-labelledby="blueprint-mock-title" className="grid gap-5 rounded-2xl border border-primary-200 bg-primary-50/45 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-secondary-900" id="blueprint-mock-title">Blueprint · contoh alur</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Satu Section, satu Subtest aktif, dengan scope Bank dan kuota kesulitan yang eksplisit.</p></div><Badge className="rounded-full" size="ui" variant="accent">Preview</Badge></div>
      <MockFlowNotice>Blueprint menyimpan aturan scope, bukan daftar soal final. Ketersediaan Easy, Medium, dan Hard baru dipastikan saat publish.</MockFlowNotice>
      <div className="grid gap-4 lg:grid-cols-[minmax(14rem,.7fr)_minmax(0,1.3fr)]">
        <div className="grid content-start gap-4">
          <Field><FieldLabel htmlFor="blueprint-mock-name">Nama Blueprint</FieldLabel><FieldInput disabled={locked} id="blueprint-mock-name" onChange={(event) => onChange({ name: event.target.value })} value={draft.name} /></Field>
          <Field><FieldLabel htmlFor="blueprint-mock-total">Total soal</FieldLabel><FieldInput disabled={locked} id="blueprint-mock-total" min="1" onChange={(event) => onChange({ total: Math.max(1, Number(event.target.value) || 1) })} type="number" value={draft.total} /></Field>
          <div className="rounded-2xl border border-primary-100 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-800">Scope Bank</p><div className="mt-3 grid gap-2">{mockBankOptions.map((bank) => { const selected = draft.selectedBankIds.includes(bank.id); return <Button aria-pressed={selected} className="h-auto justify-between rounded-xl px-3 py-2.5 text-left" disabled={locked} key={bank.id} onClick={() => onChange({ selectedBankIds: selected ? draft.selectedBankIds.filter((id) => id !== bank.id) : [...draft.selectedBankIds, bank.id] })} variant={selected ? "contextSelected" : "ghost"}><span className="truncate">{bank.title}</span>{selected ? <Check /> : <Plus />}</Button>; })}</div><p className="mt-2 text-xs leading-5 text-secondary-500">Folder dan kategori dapat mempersempit union Bank pada versi berikutnya.</p></div>
        </div>
        <div className="grid content-start gap-4">
          <div className="grid gap-3 sm:grid-cols-3"><Field><FieldLabel htmlFor="blueprint-mock-easy">Mudah</FieldLabel><FieldInput disabled={locked} id="blueprint-mock-easy" min="0" onChange={(event) => onChange({ easy: Math.max(0, Number(event.target.value) || 0) })} type="number" value={draft.easy} /></Field><Field><FieldLabel htmlFor="blueprint-mock-medium">Sedang</FieldLabel><FieldInput disabled={locked} id="blueprint-mock-medium" min="0" onChange={(event) => onChange({ medium: Math.max(0, Number(event.target.value) || 0) })} type="number" value={draft.medium} /></Field><Field><FieldLabel htmlFor="blueprint-mock-hard">Sulit</FieldLabel><FieldInput disabled={locked} id="blueprint-mock-hard" min="0" onChange={(event) => onChange({ hard: Math.max(0, Number(event.target.value) || 0) })} type="number" value={draft.hard} /></Field></div>
          <div className={`rounded-2xl border p-4 text-sm leading-6 ${quotaValid && !draft.shortagePreview ? "border-primary-100 bg-white text-secondary-700" : "border-accent-300 bg-accent-200/35 text-secondary-800"}`} role="status"><p className="font-semibold text-secondary-900">{draft.shortagePreview ? "Contoh shortage report" : quotaValid ? "Kuota siap diperiksa" : "Kuota belum valid"}</p><p>{draft.shortagePreview ? "Easy 4 tersedia / 5 diminta · publish diblokir tanpa fallback." : `${quotaSum} dari ${draft.total} kuota terisi. Semua kuota harus berjumlah tepat sama dengan total.`}</p></div>
          <div className="flex flex-wrap gap-2"><Button disabled={locked} onClick={() => onChange({ shortagePreview: !draft.shortagePreview })} size="sm" variant="brandOutline">{draft.shortagePreview ? "Kembali ke kuota" : "Uji shortage"}</Button><span className="self-center text-xs text-secondary-500">Tidak ada fallback lintas kesulitan.</span></div>
        </div>
      </div>
    </section>
  );
}

function CatPoolMockPanel({
  draft,
  locked,
  onChange,
}: {
  draft: CatPoolMockDraft;
  locked: boolean;
  onChange: (change: Partial<CatPoolMockDraft>) => void;
}) {
  const includedCandidates = draft.candidates.filter((candidate) => candidate.included);
  const readyCandidates = includedCandidates.filter((candidate) => candidate.catReady);
  const ready = readyCandidates.length >= draft.deliveredCount && readyCandidates.length === includedCandidates.length;
  return (
    <section aria-labelledby="cat-pool-mock-title" className="grid gap-5 rounded-2xl border border-primary-200 bg-primary-50/45 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-secondary-900" id="cat-pool-mock-title">CAT Pool · contoh alur</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Kandidat eksplisit dengan kalibrasi canonical 2PL yang dipin saat rilis Tryout.</p></div><Badge className="rounded-full" size="ui" variant="accent">Tryout only</Badge></div>
      <MockFlowNotice>CAT Pool belum dapat dipakai untuk Kuis. Kandidat di bawah adalah fixture lokal untuk menyepakati readiness dan headroom.</MockFlowNotice>
      <div className="grid gap-4 lg:grid-cols-[minmax(14rem,.7fr)_minmax(0,1.3fr)]">
        <div className="grid content-start gap-4"><Field><FieldLabel htmlFor="cat-pool-mock-name">Nama CAT Pool</FieldLabel><FieldInput disabled={locked} id="cat-pool-mock-name" onChange={(event) => onChange({ name: event.target.value })} value={draft.name} /></Field><Field><FieldLabel htmlFor="cat-pool-mock-delivered">Jumlah soal dikirim</FieldLabel><FieldInput disabled={locked} id="cat-pool-mock-delivered" min="1" onChange={(event) => onChange({ deliveredCount: Math.max(1, Number(event.target.value) || 1) })} type="number" value={draft.deliveredCount} /></Field><div className="rounded-2xl border border-primary-100 bg-white p-4 text-sm leading-6"><p className="font-semibold text-secondary-900">{ready ? "CAT readiness terlihat siap" : "CAT readiness punya blocker"}</p><p className="mt-1 text-secondary-600">{readyCandidates.length} kandidat berkalibrasi dari {includedCandidates.length} dipilih · minimum {draft.deliveredCount}.</p></div></div>
          <div className="grid gap-2 sm:grid-cols-2">{draft.candidates.map((candidate) => <Button aria-pressed={candidate.included} className={`h-auto min-h-24 w-full min-w-0 max-w-full items-start justify-between overflow-hidden rounded-2xl border p-3 text-left ${candidate.included ? "border-primary-300 bg-white text-secondary-900" : "border-primary-100 bg-white/75 text-secondary-700"}`} disabled={locked} key={candidate.id} onClick={() => onChange({ candidates: draft.candidates.map((item) => item.id === candidate.id ? { ...item, included: !item.included } : item) })} variant="ghost"><span className="min-w-0 max-w-full"><span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-primary-800"><MockDifficultyLabel difficulty={candidate.difficulty} /><span className="text-secondary-400">·</span><span className="truncate text-secondary-500">{candidate.bankTitle}</span></span><span className="mt-1 block line-clamp-2 break-words text-sm leading-5">{candidate.prompt}</span><span className={`mt-2 block text-xs font-semibold ${candidate.catReady ? "text-primary-700" : "text-[#8a5e00]"}`}>{candidate.catReady ? "2PL siap" : "Kalibrasi perlu ditinjau"}</span></span><span aria-hidden="true" className={`ml-2 grid size-6 shrink-0 place-items-center rounded-lg ${candidate.included ? "bg-primary-700 text-white" : "bg-primary-50 text-primary-700"}`}>{candidate.included ? <Check className="size-4" /> : <Plus className="size-4" />}</span></Button>)}</div>
      </div>
    </section>
  );
}

// Kept as non-rendered fixtures for the existing authoring contract; the live
// Questions surface uses server-backed Ready assemblies below.
void PoolMockPanel;
void BlueprintMockPanel;
void CatPoolMockPanel;

function KaptenTryoutBuilderPageModule({
  id,
  initialDraft,
  initialWorkspace = "basics",
  operationsInitial,
  initialSourceBankTotal,
  initialSourceBanks,
  readyAssemblies,
  readyVersions,
  session,
}: {
  id?: string;
  initialDraft?: TryoutDraft | null;
  initialWorkspace?: string;
  initialSourceBankTotal?: number;
  initialSourceBanks: SourceBank[];
  operationsInitial?: TryoutOperationsView;
  readyAssemblies: AssemblyAttachmentSummary[];
  readyVersions: ReadyVersion[];
  session: SessionContext;
}) {
  void session;
  const [draft, setDraft] = useState<TryoutDraft>(() => normalize(initialDraft ?? {
    description: "",
    id: id ?? "baru",
    locked: false,
    sections: defaultSections(),
    status: "draft",
    title: "Draft Tryout Baru",
    updatedAt: Date.now(),
  }));
  const [activeCode, setActiveCode] = useState<SubjectCode>(() => draft.sections.find((section) => !section.packageVersionId && !section.directQuestions?.length)?.subtest ?? "PU");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [packageSearch, setPackageSearch] = useState("");
  const [selectionModes, setSelectionModes] = useState<SelectionModes>(() => Object.fromEntries(draft.sections.filter((section) => section.packageVersionId).map((section) => [section.subtest, selectionModeForAssembly(readyAssemblies.find((assembly) => assembly.id === section.packageVersionId)?.mode ?? "fixed_set")])) as SelectionModes);
  const [sourceBankSearch, setSourceBankSearch] = useState("");
  const [sourceBanks, setSourceBanks] = useState<SourceBank[]>(initialSourceBanks);
  const [sourceBankPage, setSourceBankPage] = useState(1);
  const [sourceBankTotal, setSourceBankTotal] = useState(initialSourceBankTotal ?? initialSourceBanks.length);
  const [sourceBankLoading, setSourceBankLoading] = useState(false);
  const [browseBankId, setBrowseBankId] = useState(initialSourceBanks[0]?.id ?? "");
  const [sourceQuestionSearch, setSourceQuestionSearch] = useState("");
  const [sourceQuestionPage, setSourceQuestionPage] = useState(1);
  const [sourceQuestionTotal, setSourceQuestionTotal] = useState(0);
  const [sourceQuestionLoading, setSourceQuestionLoading] = useState(false);
  const [sourceQuestions, setSourceQuestions] = useState<SourceQuestion[]>([]);
  const [assemblyOverrides, setAssemblyOverrides] = useState<Record<string, AssemblyAttachmentSummary>>({});
  const [assemblyPreview, setAssemblyPreview] = useState<AssemblyPreview | null>(null);
  const [assemblyPreviewLoading, setAssemblyPreviewLoading] = useState(false);
  const [assemblyPreviewOpen, setAssemblyPreviewOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(() => normalizeWorkspace(initialWorkspace));
  const tabRailRef = useRef<HTMLDivElement>(null);

  const activeSection = draft.sections.find((section) => section.subtest === activeCode) ?? draft.sections[0];
  const boundCount = draft.sections.filter((section) => section.packageVersionId || section.directQuestions?.length).length;
  const selectedVersions = draft.sections.map((section) => section.packageVersionId ? readyVersions.find((version) => version.id === section.packageVersionId) : undefined);
  const selectedAssemblies = draft.sections.map((section) => section.packageVersionId ? assemblyOverrides[section.packageVersionId] ?? readyAssemblies.find((assembly) => assembly.id === section.packageVersionId) : undefined);
  const selectedDirectQuestions = draft.sections.flatMap((section) => section.directQuestions ?? []);
  const selectedSourceQuestionIds = [...selectedVersions.flatMap((version) => version?.sourceQuestionIds ?? []), ...selectedDirectQuestions.map((question) => question.sourceQuestionId)];
  const duplicateSourceCount = selectedSourceQuestionIds.length - new Set(selectedSourceQuestionIds).size;
  const invalidDurationSections = draft.sections.filter((section) => !Number.isInteger(section.durationMinutes) || section.durationMinutes < 1);
  const invalidAssemblyTypeSections = draft.sections.filter((section, index) => {
    const assembly = selectedAssemblies[index];
    return Boolean(section.packageVersionId && assembly && !assemblyCompatibleWithTestType(assembly.mode, section.testType));
  });
  const invalidCatSections = draft.sections.filter((section, index) => {
    if (section.testType !== "cat" || !Number.isInteger(section.catItemCount) || !section.catItemCount) return section.testType === "cat";
    if (section.packageVersionId) return !selectedAssemblies[index]?.readiness.ready || !selectedVersions[index]?.catReady || (selectedAssemblies[index]?.readiness.eligibleCount ?? selectedVersions[index]?.itemCount ?? 0) < section.catItemCount;
    return !section.directQuestions?.length || section.directQuestions.length < section.catItemCount || section.directQuestions.some((question) => !question.catReady);
  });
  const incompleteSections = draft.sections.filter((section, index) => {
    const selectedVersion = selectedVersions[index];
    const directQuestions = section.directQuestions ?? [];
    const hasSource = Boolean(section.packageVersionId || directQuestions.length);
    const contentReady = section.packageVersionId ? Boolean(selectedAssemblies[index]?.readiness.ready ?? selectedVersion?.contentReady) : directQuestions.every((question) => question.hasReadyMedia !== false && question.prompt?.trim());
    return !hasSource
      || !contentReady
      || invalidAssemblyTypeSections.some((candidate) => candidate.subtest === section.subtest)
      || (section.testType === "cat" && invalidCatSections.some((candidate) => candidate.subtest === section.subtest));
  });
  const scheduleSessions = operationsInitial?.sessions ?? [];
  const scheduleConflicts = scheduleSessions.some((session) => new Date(session.availableUntil) <= new Date(session.availableFrom)) || scheduleSessions.filter((session) => session.isDefaultOpenRegistration).length > 1;
  const reviewChecks = [
    { detail: draft.title.trim() ? "Judul Tryout sudah terisi." : "Tambahkan judul sebelum publikasi.", label: "Basics lengkap", status: Boolean(draft.title.trim()) },
    { detail: draft.sections.length === 7 ? "PU, PPU, PBM, PK, LBI, LBE, dan PM tersedia." : "Tryout harus memiliki tepat tujuh Section.", label: "Tujuh Section tetap", status: draft.sections.length === 7 },
    { detail: boundCount === 7 ? "Semua Section memiliki sumber soal siap." : `${7 - boundCount} Section belum memiliki sumber soal.`, label: "Sumber soal lengkap", status: boundCount === 7 },
    { detail: incompleteSections.length === 0 ? "Snapshot soal, opsi, dan konten tersedia." : "Periksa soal, opsi, atau snapshot sumber yang belum siap.", label: "Konten soal siap", status: incompleteSections.length === 0 },
    { detail: draft.sections.every((section, index) => section.packageVersionId ? Boolean(selectedAssemblies[index]?.readiness.ready ?? (selectedVersions[index]?.hasExplanations && selectedVersions[index]?.hasReadyMedia)) : Boolean(section.directQuestions?.length && section.directQuestions.every((question) => question.hasExplanation && question.hasReadyMedia !== false))) ? "Penjelasan dan media siap digunakan peserta." : "Lengkapi penjelasan, media, atau blocker assembly yang belum siap.", label: "Penjelasan & media siap", status: draft.sections.every((section, index) => section.packageVersionId ? Boolean(selectedAssemblies[index]?.readiness.ready ?? (selectedVersions[index]?.hasExplanations && selectedVersions[index]?.hasReadyMedia)) : Boolean(section.directQuestions?.length && section.directQuestions.every((question) => question.hasExplanation && question.hasReadyMedia !== false))) },
    { detail: draft.sections.every((section, index) => !section.packageVersionId || (Boolean(selectedAssemblies[index]?.readiness.ready) && !invalidAssemblyTypeSections.some((candidate) => candidate.subtest === section.subtest))) ? "Set, Pool, Blueprint, dan CAT Pool tidak memiliki blocker saat ini." : draft.sections.filter((section, index) => section.packageVersionId && (!selectedAssemblies[index]?.readiness.ready || invalidAssemblyTypeSections.some((candidate) => candidate.subtest === section.subtest))).map((section) => `${section.subtest}: ${invalidAssemblyTypeSections.some((candidate) => candidate.subtest === section.subtest) ? "mode assembly tidak cocok dengan tipe Test" : selectedAssemblies[draft.sections.indexOf(section)]?.readiness.blockers[0]?.message ?? "sumber Ready perlu ditinjau"}`).join(" · "), label: "Assembly siap dirilis", status: draft.sections.every((section, index) => !section.packageVersionId || (Boolean(selectedAssemblies[index]?.readiness.ready) && !invalidAssemblyTypeSections.some((candidate) => candidate.subtest === section.subtest))) },
    { detail: duplicateSourceCount ? `${duplicateSourceCount} soal sumber muncul lebih dari sekali.` : "Tidak ada soal sumber yang duplikat.", label: "Sumber soal unik", status: duplicateSourceCount === 0 },
    { detail: invalidCatSections.length ? "Setiap CAT harus memiliki pool cukup dan kalibrasi 2PL siap." : "CAT dan kalibrasi 2PL siap.", label: "CAT & 2PL siap", status: invalidCatSections.length === 0 },
    { detail: invalidAssemblyTypeSections.length ? "CAT Pool hanya untuk Test CAT; assembly lain hanya untuk Test CBT." : "Mode assembly cocok dengan tipe Test setiap Section.", label: "Mode assembly sesuai Test", status: invalidAssemblyTypeSections.length === 0 },
    { detail: invalidDurationSections.length ? "Periksa durasi setiap Section." : "Durasi setiap Section valid.", label: "Durasi valid", status: invalidDurationSections.length === 0 },
    { detail: scheduleConflicts ? "Perbaiki jendela sesi atau lebih dari satu sesi default open registration." : scheduleSessions.length ? `${scheduleSessions.length} sesi tersimpan tanpa konflik konfigurasi.` : "Sesi dapat dijadwalkan setelah Tryout diterbitkan.", label: "Schedule & akses", status: !scheduleConflicts },
  ];
  const reviewFailures = reviewChecks.filter((check) => !check.status).length;
  const readyToPublish = !draft.locked && reviewFailures === 0;
  const activeSelectionMode = selectionModes[activeSection.subtest] ?? (activeSection.packageVersionId ? "set" : "direct");
  const activeDirectQuestions = activeSection.directQuestions ?? [];
  const activeAssembly = activeSection.packageVersionId ? assemblyOverrides[activeSection.packageVersionId] ?? readyAssemblies.find((assembly) => assembly.id === activeSection.packageVersionId) : undefined;
  const activeReadyAssemblies = useMemo(() => readyAssemblies.filter((assembly) => assembly.subtest === activeSection.subtest), [activeSection.subtest, readyAssemblies]);
  const activeBrowseBank = sourceBanks.find((bank) => bank.id === browseBankId);
  const activeSourceQuestions = sourceQuestions.filter((question) => question.subjectCode === activeSection.subtest);
  const release = releaseFor(draft, operationsInitial);

  const update = (subtest: SubjectCode, change: Partial<TestDraft>) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => section.subtest === subtest ? { ...section, ...change } : section),
    }));
  };

  const changeActiveCode = (nextCode: SubjectCode) => {
    setActiveCode(nextCode);
    setSourceBankPage(1);
    setSourceBankSearch("");
    setSourceQuestionPage(1);
    setSourceQuestionSearch("");
    setSourceQuestions([]);
  };

  const chooseSelectionMode = (mode: SelectionMode) => {
    setSelectionModes((current) => ({ ...current, [activeCode]: mode }));
    update(activeCode, mode === "direct"
      ? { directQuestions: activeSection.directQuestions ?? [], packageVersionId: undefined, packageVersionLabel: undefined, packageVersionMode: undefined }
      : { directQuestions: [], packageVersionId: undefined, packageVersionLabel: undefined, packageVersionMode: undefined });
    setError(null);
  };

  const attachAssembly = async (assembly: AssemblyAttachmentSummary) => {
    setSaving(true);
    setError(null);
    try {
      const result = await attachReadyAssemblyAction({ target: "tryout", targetSubtestCode: activeSection.subtest, targetTestType: activeSection.testType, versionId: assembly.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAssemblyOverrides((current) => ({ ...current, [assembly.id]: result.result }));
      setSelectionModes((current) => ({ ...current, [activeCode]: selectionModeForAssembly(result.result.mode) }));
      update(activeCode, {
        directQuestions: [],
        packageVersionId: result.result.id,
        packageVersionLabel: result.result.packageTitle,
        packageVersionMode: result.result.mode,
      });
      setPackageSearch("");
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : "Sumber Ready belum dapat dipasang.");
    } finally {
      setSaving(false);
    }
  };

  const detachAssembly = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await detachReadyAssemblyAction({ target: "tryout" });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      update(activeCode, { packageVersionId: undefined, packageVersionLabel: undefined, packageVersionMode: undefined });
      setSelectionModes((current) => ({ ...current, [activeCode]: "direct" }));
    } catch (detachError) {
      setError(detachError instanceof Error ? detachError.message : "Sumber Ready belum dapat dilepas.");
    } finally {
      setSaving(false);
    }
  };

  const previewAssembly = async (assembly: AssemblyAttachmentSummary) => {
    setAssemblyPreviewLoading(true);
    setAssemblyPreviewOpen(true);
    setError(null);
    try {
      const result = await previewAssemblyAction({ versionId: assembly.id });
      if (!result.ok) {
        setError(result.message);
        setAssemblyPreviewOpen(false);
        return;
      }
      setAssemblyPreview(result.result);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Preview assembly belum dapat dimuat.");
      setAssemblyPreviewOpen(false);
    } finally {
      setAssemblyPreviewLoading(false);
    }
  };

  const addDirectQuestion = (question: SourceQuestion) => {
    if (selectedSourceQuestionIds.includes(question.id)) {
      setError("Soal ini sudah dipilih di Section lain atau sumber yang sama.");
      return;
    }
    const bank = sourceBanks.find((candidate) => candidate.id === question.bankId);
    update(activeCode, {
      directQuestions: [...activeDirectQuestions, {
        bankId: question.bankId,
        bankTitle: bank?.title,
        catReady: question.catReady,
        difficulty: question.difficulty,
        hasExplanation: Boolean(question.explanation.trim() || question.explanationMediaAssetId),
        hasReadyMedia: true,
        prompt: question.prompt,
        sourceContentDigest: question.questionContentDigest,
        sourceQuestionId: question.id,
        sourceQuestionRevisionId: question.questionRevisionId,
      }],
      packageVersionId: undefined,
      packageVersionLabel: undefined,
      packageVersionMode: undefined,
    });
    setError(null);
  };

  const save = async (status: "draft" | "published" = "draft") => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveTryoutAction({
        description: draft.description,
        id,
        sections: draft.sections.map((section) => ({
          catItemCount: section.catItemCount,
          directQuestions: section.directQuestions?.map((question) => ({ sourceContentDigest: question.sourceContentDigest ?? "", sourceQuestionId: question.sourceQuestionId, sourceQuestionRevisionId: question.sourceQuestionRevisionId ?? "" })),
          durationMinutes: section.durationMinutes,
          instructions: section.instructions,
          packageVersionId: section.packageVersionId,
          scoringConfig: section.scoringConfig,
          shuffleItems: section.shuffleItems,
          subtest: section.subtest,
          testType: section.testType,
        })),
        status,
        title: draft.title,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft(normalize(result.result));
      if (!id) window.location.assign(`/mentor/tryout/${result.result.id}?workspace=review`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Tryout belum dapat disimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const result = await duplicateTryoutAction(id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.location.assign(`/mentor/tryout/${result.result.id}?workspace=review`);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Tryout belum dapat disalin. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const changeWorkspace = (value: string) => {
    const nextWorkspace = normalizeWorkspace(value);
    setWorkspace(nextWorkspace);
    const url = new URL(window.location.href);
    if (nextWorkspace === "basics") url.searchParams.delete("workspace");
    else url.searchParams.set("workspace", nextWorkspace);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    if (workspace !== "questions" || activeSelectionMode !== "direct") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSourceBankLoading(true);
      try {
        const result = await listQuestionBankSourcePageAction({
          page: sourceBankPage,
          pageSize: 20,
          search: sourceBankSearch,
          subjectCoverage: [activeSection.subtest],
        });
        if (cancelled) return;
        const nextBanks = result.items.map(({ bank }) => bank as SourceBank);
        setSourceBanks((current) => sourceBankPage === 1
          ? nextBanks
          : [...current, ...nextBanks].filter((bank, index, all) => all.findIndex((candidate) => candidate.id === bank.id) === index));
        setSourceBankTotal(result.total);
        setBrowseBankId((current) => nextBanks.some((bank) => bank.id === current) ? current : nextBanks[0]?.id ?? "");
      } catch (sourceError) {
        if (!cancelled) setError(sourceError instanceof Error ? sourceError.message : "Bank Soal belum dapat dimuat.");
      } finally {
        if (!cancelled) setSourceBankLoading(false);
      }
    }, sourceBankSearch.trim() ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeSection.subtest, activeSelectionMode, sourceBankPage, sourceBankSearch, workspace]);

  useEffect(() => {
    if (workspace !== "questions" || activeSelectionMode !== "direct" || !browseBankId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSourceQuestionLoading(true);
      if (sourceQuestionPage === 1) setSourceQuestions([]);
      try {
        const result = await listQuestionBankSourceQuestionsAction(browseBankId, {
          page: sourceQuestionPage,
          pageSize: 50,
          search: sourceQuestionSearch,
          subjectCode: activeSection.subtest,
        });
        if (cancelled || !result) return;
        const incoming = result.questions as SourceQuestion[];
        setSourceQuestionTotal(result.total);
        setSourceQuestions((current) => sourceQuestionPage === 1
          ? incoming
          : [...current, ...incoming].filter((question, index, all) => all.findIndex((candidate) => candidate.id === question.id) === index));
      } catch (sourceError) {
        if (!cancelled) setError(sourceError instanceof Error ? sourceError.message : "Soal siap belum dapat dimuat.");
      } finally {
        if (!cancelled) setSourceQuestionLoading(false);
      }
    }, sourceQuestionSearch.trim() ? 200 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeSection.subtest, activeSelectionMode, browseBankId, sourceQuestionPage, sourceQuestionSearch, workspace]);

  useEffect(() => {
    const label = workspaceItems.find((item) => item.value === workspace)?.label;
    const activeTab = label
      ? [...(tabRailRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])].find((tab) => tab.textContent?.trim() === label)
      : null;
    activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [workspace]);

  const goTo = (nextWorkspace: Workspace) => {
    changeWorkspace(nextWorkspace);
  };

  return (
    <div className="min-w-0 w-full px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-primary-100 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button nativeButton={false} render={<Link href="/mentor/tryout" />} size="sm" variant="ghost">
            <ArrowLeft />
            Semua Tryout
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={saving} onClick={() => setPreviewOpen(true)} size="sm" variant="ghost">
              <Eye />
              Pratinjau
            </Button>
            {draft.locked ? (
              <Button disabled={saving} onClick={() => setDuplicateOpen(true)} size="sm" variant="brand">
                <Copy />
                Duplikasi
              </Button>
            ) : (
              <>
                <Button disabled={saving} onClick={() => void save("draft")} size="sm" variant="brandOutline">
                  <Save />
                  {saving ? "Menyimpan…" : "Simpan draft"}
                </Button>
                <Button disabled={saving} onClick={() => goTo("publish")} size="sm" variant="brand">
                  <Upload />
                  Ke Publish
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-800">Tryout workspace</p>
            <h1 className="mt-1 line-clamp-2 break-words text-2xl font-semibold tracking-[-0.02em] text-secondary-900 sm:text-3xl">{draft.title || "Tryout tanpa judul"}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-secondary-600">Satu ruang kerja untuk merakit, memeriksa, menjadwalkan, dan menerbitkan Tryout.</p>
          </div>
          <Badge className="rounded-full px-3 py-1.5" size="ui" variant={draft.status === "published" ? "mint" : "accent"}>
            {draft.status === "published" ? "Diterbitkan" : "Draf"}
          </Badge>
        </div>
      </header>

      {error ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm leading-6 text-danger-500" role="alert">
          <CircleAlert className="mt-1 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {draft.locked ? (
        <section className="mt-5 flex items-start gap-3 rounded-2xl border border-secondary-900/10 bg-secondary-50 px-4 py-3 text-sm leading-6 text-secondary-700" role="status">
          <Lock className="mt-1 size-4 shrink-0" />
          <p><strong>Mode baca saja.</strong> Peserta sudah memulai Tryout ini; buat salinan untuk mengubah konfigurasi tanpa mengubah riwayat.</p>
        </section>
      ) : null}
      <AssessmentReleaseNotice
        label="Rilis konten Tryout"
        missingDescription="Rilis pertama dibuat saat Tryout diterbitkan dan tervalidasi server. Sesi peserta akan memakai rilis yang sama."
        release={release}
        state={draft.status === "draft" ? "historical" : "current"}
      />

      <Tabs className="mt-6" onValueChange={changeWorkspace} value={workspace}>
        <div className="relative" ref={tabRailRef}>
          <div className="overflow-x-auto pb-1">
          <TabsList aria-label="Ruang kerja Tryout" className="min-w-max rounded-2xl bg-primary-50 p-1">
            {workspaceItems.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>
            ))}
          </TabsList>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#f7faf8] to-transparent sm:hidden" />
          <p className="mt-1 text-right text-xs text-secondary-500 sm:hidden">Geser untuk area lain →</p>
        </div>

        <TabsContent className="mt-5" value="basics">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><FileText /></div>
              <div>
              <h2 className="text-xl font-semibold text-secondary-900">Identitas Tryout</h2>
              <p className="mt-1 text-sm leading-6 text-secondary-600">Nama dan deskripsi ini menjadi konteks yang dilihat Kapten dan peserta.</p>
              </div>
            </div>
            <div className="grid gap-5">
              <Field>
                <FieldLabel htmlFor="tryout-title">Judul Tryout</FieldLabel>
                <FieldInput disabled={draft.locked} id="tryout-title" onChange={(event) => setDraft({ ...draft, title: event.target.value })} value={draft.title} />
              </Field>
              <Field>
                <FieldLabel htmlFor="tryout-description">Deskripsi</FieldLabel>
                <FieldTextarea className="min-h-32 px-4 py-3 text-sm leading-6" disabled={draft.locked} id="tryout-description" onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Contoh: Simulasi UTBK dengan tujuh subtest." value={draft.description} />
              </Field>
            </div>
            <footer className="flex justify-end border-t border-primary-100 pt-5">
              <Button onClick={() => goTo("sections")} variant="brand">Lanjut ke Sections <ChevronRight /></Button>
            </footer>
          </section>
        </TabsContent>

        <TabsContent className="mt-5" value="sections">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><ClipboardList /></div>
                <div>
                <h2 className="text-xl font-semibold text-secondary-900">Tujuh Section wajib</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Pilih subject untuk mengatur durasi dan instruksi. Urutan ini menjadi urutan Test peserta.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-secondary-700" role="status">
                <span className="text-primary-800">{boundCount}/7 sumber siap</span>
                <span aria-hidden="true" className="text-secondary-300">·</span>
                <span>{draft.sections.filter((section) => section.testType === "cat").length} CAT</span>
              </div>
            </header>

            <div className="grid gap-4 lg:grid-cols-[minmax(14rem,0.5fr)_minmax(0,1.5fr)]">
              <ul className="grid content-start gap-2" aria-label="Daftar Section Tryout">
                {draft.sections.map((section, index) => {
                  const selected = section.subtest === activeSection.subtest;
                  return (
                    <li key={section.subtest}>
                      <Button
                        aria-current={selected ? "true" : undefined}
                        className={`h-auto min-h-14 w-full justify-start gap-3 rounded-2xl border px-3 py-3 text-left ${selected ? "border-primary-300 bg-primary-50 text-primary-950" : "border-primary-100 bg-white text-secondary-800"}`}
                        onClick={() => changeActiveCode(section.subtest)}
                        variant="ghost"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary-50 text-xs font-bold text-secondary-600">{String(index + 1).padStart(2, "0")}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{section.subtest} · {subjectName(section.subtest)}</span>
                          <span className={`mt-0.5 block text-xs ${section.packageVersionId || section.directQuestions?.length ? "text-primary-700" : "text-secondary-500"}`}>{section.packageVersionId ? assemblyModeLabel(selectedAssemblies[index]?.mode ?? section.packageVersionMode ?? "fixed_set") : section.directQuestions?.length ? `${section.directQuestions.length} soal langsung` : "Sumber belum dipilih"}</span>
                        </span>
                        {section.packageVersionId || section.directQuestions?.length ? <Check className="size-4 shrink-0 text-primary-700" /> : <CircleAlert className="size-4 shrink-0 text-[#a46b00]" />}
                      </Button>
                    </li>
                  );
                })}
              </ul>

              <div className="grid min-w-0 gap-5 rounded-2xl border border-primary-100 bg-[#f8fbf9] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-800">Test {String(subjectCodes.indexOf(activeSection.subtest) + 1).padStart(2, "0")}</p>
                    <h3 className="mt-1 text-lg font-semibold text-secondary-900">{activeSection.subtest} · {subjectName(activeSection.subtest)}</h3>
                  </div>
                  <Badge className="rounded-full" size="ui" variant={activeSection.packageVersionId || activeSection.directQuestions?.length ? "mint" : "accent"}>{activeSection.packageVersionId ? assemblyModeLabel(activeAssembly?.mode ?? activeSection.packageVersionMode ?? "fixed_set") : activeSection.directQuestions?.length ? "Soal siap" : "Perlu sumber"}</Badge>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`duration-${activeSection.subtest}`}>Durasi</FieldLabel>
                    <div className="relative">
                      <FieldInput className="pr-16" disabled={draft.locked} id={`duration-${activeSection.subtest}`} min="1" onChange={(event) => update(activeSection.subtest, { durationMinutes: Number(event.target.value) })} type="number" value={activeSection.durationMinutes} />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-secondary-500">menit</span>
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Urutan</FieldLabel>
                    <div className="flex h-11 items-center rounded-xl border border-secondary-900/14 bg-white px-3 text-sm text-secondary-700">Test {subjectCodes.indexOf(activeSection.subtest) + 1} dari 7</div>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor={`instruction-${activeSection.subtest}`}>Instruksi peserta</FieldLabel>
                  <FieldTextarea className="min-h-32 bg-white" disabled={draft.locked} id={`instruction-${activeSection.subtest}`} onChange={(event) => update(activeSection.subtest, { instructions: event.target.value })} placeholder="Instruksi yang dibaca peserta sebelum Test dimulai." value={activeSection.instructions} />
                </Field>
                <footer className="flex flex-wrap justify-between gap-2 border-t border-primary-100 pt-4">
                  <Button disabled={subjectCodes.indexOf(activeSection.subtest) === 0} onClick={() => changeActiveCode(subjectCodes[subjectCodes.indexOf(activeSection.subtest) - 1])} variant="brandOutline">Sebelumnya</Button>
                  <Button onClick={() => goTo("questions")} variant="brand">Atur Questions <ChevronRight /></Button>
                </footer>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent className="mt-5" value="questions">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-secondary-900">Pilih Questions</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Pilih soal langsung atau pasang satu sumber Ready: Set Soal, Pool Soal, Blueprint, atau CAT Pool.</p>
              </div>
              <Button onClick={() => goTo("sections")} variant="brandOutline">Kembali ke Sections</Button>
            </header>

            <div className="grid gap-5 rounded-2xl border border-primary-100 bg-[#f8fbf9] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-800">Subject aktif</p>
                  <h3 className="mt-1 text-lg font-semibold text-secondary-900">{activeSection.subtest} · {subjectName(activeSection.subtest)}</h3>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button className="justify-between sm:min-w-64" variant="context" />}>
                    Pindah subject
                    <ChevronDown />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-96 w-[min(28rem,calc(100vw-2rem))]">
                    <DropdownMenuLabel>Pilih Section</DropdownMenuLabel>
                    <DropdownMenuRadioGroup onValueChange={(value) => changeActiveCode(value as SubjectCode)} value={activeCode}>
                      {draft.sections.map((section) => <DropdownMenuRadioItem key={section.subtest} value={section.subtest}>{section.subtest} · {subjectName(section.subtest)}</DropdownMenuRadioItem>)}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div aria-label="Mode sumber soal" className="grid gap-2 rounded-2xl border border-primary-100 bg-white p-1 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup">
                <Button aria-checked={activeSelectionMode === "direct"} className={`h-auto min-h-16 justify-start gap-3 rounded-xl px-3 py-3 text-left ${activeSelectionMode === "direct" ? "bg-[#d7f2d8] text-[#14563e] hover:bg-[#c8ebca]" : "text-secondary-600"}`} disabled={draft.locked} onClick={() => chooseSelectionMode("direct")} role="radio" variant="ghost">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800"><Plus className="size-4" /></span>
                  <span><span className="block font-semibold">Pilih soal langsung</span><span className="mt-0.5 block text-xs font-normal opacity-75">Pilih soal lintas Bank Soal.</span></span>
                </Button>
                <Button aria-checked={activeSelectionMode === "set"} className={`h-auto min-h-16 justify-start gap-3 rounded-xl px-3 py-3 text-left ${activeSelectionMode === "set" ? "bg-[#d7f2d8] text-[#14563e] hover:bg-[#c8ebca]" : "text-secondary-600"}`} disabled={draft.locked} onClick={() => chooseSelectionMode("set")} role="radio" variant="ghost">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800"><ClipboardList className="size-4" /></span>
                  <span><span className="block font-semibold">Gunakan Set Soal siap</span><span className="mt-0.5 block text-xs font-normal opacity-75">Pakai assembly tetap yang sudah dirilis.</span></span>
                </Button>
                <Button aria-checked={activeSelectionMode === "pool"} className={`h-auto min-h-16 justify-start gap-3 rounded-xl px-3 py-3 text-left ${activeSelectionMode === "pool" ? "bg-accent-200 text-secondary-900" : "text-secondary-600"}`} disabled={draft.locked} onClick={() => chooseSelectionMode("pool")} role="radio" variant="ghost">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-200 text-primary-800"><SlidersHorizontal className="size-4" /></span>
                  <span><span className="block font-semibold">Pool acak</span><span className="mt-0.5 block text-xs font-normal opacity-75">Undi saat publish.</span></span>
                </Button>
                <Button aria-checked={activeSelectionMode === "blueprint"} className={`h-auto min-h-16 justify-start gap-3 rounded-xl px-3 py-3 text-left ${activeSelectionMode === "blueprint" ? "bg-accent-200 text-secondary-900" : "text-secondary-600"}`} disabled={draft.locked} onClick={() => chooseSelectionMode("blueprint")} role="radio" variant="ghost">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-200 text-primary-800"><ListChecks className="size-4" /></span>
                  <span><span className="block font-semibold">Blueprint</span><span className="mt-0.5 block text-xs font-normal opacity-75">Isi kuota kesulitan.</span></span>
                </Button>
                <Button aria-checked={activeSelectionMode === "cat_pool"} className={`h-auto min-h-16 justify-start gap-3 rounded-xl px-3 py-3 text-left ${activeSelectionMode === "cat_pool" ? "bg-accent-200 text-secondary-900" : "text-secondary-600"}`} disabled={draft.locked} onClick={() => chooseSelectionMode("cat_pool")} role="radio" variant="ghost">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-200 text-primary-800"><BarChart3 className="size-4" /></span>
                  <span><span className="block font-semibold">CAT Pool</span><span className="mt-0.5 block text-xs font-normal opacity-75">Kandidat 2PL siap.</span></span>
                </Button>
              </div>

              {activeSelectionMode !== "direct" ? (
                <ReadyAssemblyPicker activeMode={activeSelectionMode} assemblies={activeReadyAssemblies} locked={draft.locked || saving} onAttach={(assembly) => { void attachAssembly(assembly); }} onDetach={() => { void detachAssembly(); }} onPreview={(assembly) => { void previewAssembly(assembly); }} search={packageSearch} selectedId={activeSection.packageVersionId} setSearch={setPackageSearch} subtest={activeSection.subtest} testType={activeSection.testType} />
              ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(15rem,.65fr)_minmax(0,1.35fr)]">
                  <div className="grid min-w-0 gap-4">
                    <Field>
                      <FieldLabel>Bank Soal untuk ditelusuri</FieldLabel>
                      <Popover>
                        <PopoverTrigger disabled={draft.locked} render={<Button aria-haspopup="listbox" className="w-full justify-between bg-white" variant="context" />}>
                          <span className="min-w-0 truncate">{activeBrowseBank?.title ?? "Pilih Bank Soal"}</span>
                          <ChevronDown />
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] gap-3">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
                            <FieldInput aria-label="Cari Bank Soal untuk pilihan langsung" className="h-10 rounded-xl py-2 pl-9 pr-3 text-sm" onChange={(event) => { setSourceBankSearch(event.target.value); setSourceBankPage(1); }} placeholder="Cari judul, folder, atau kategori…" value={sourceBankSearch} />
                          </div>
                          {sourceBankLoading ? <p className="px-2 text-xs text-secondary-500">Memuat Bank Soal…</p> : null}
                          <div aria-label="Bank Soal sumber" className="grid max-h-72 gap-1 overflow-y-auto" role="listbox">
                            {sourceBanks.length ? sourceBanks.map((bank) => <Button aria-selected={browseBankId === bank.id} className="h-auto justify-start rounded-xl px-3 py-2.5 text-left" key={bank.id} onClick={() => { setBrowseBankId(bank.id); setSourceQuestionPage(1); setSourceQuestionSearch(""); setSourceQuestions([]); }} role="option" variant={browseBankId === bank.id ? "contextSelected" : "ghost"}><span className="min-w-0"><span className="block truncate font-semibold">{bank.title}</span><span className="mt-0.5 block truncate text-xs font-normal text-secondary-500">{bank.questionCount} soal{bank.folderPath?.length ? ` · ${bank.folderPath.map((item) => item.name).join(" / ")}` : ""}</span></span>{browseBankId === bank.id ? <Check className="ml-auto shrink-0" /> : null}</Button>) : <div className="grid gap-3 px-3 py-5"><p className="text-sm text-secondary-500">Belum ada Bank Soal dengan soal Ready untuk {activeSection.subtest}.</p><Button className="w-fit" nativeButton={false} render={<Link href="/mentor/quiz/question-bank" />} size="sm" variant="brand">Buka Bank Soal</Button></div>}
                          </div>
                          {sourceBankTotal > sourceBanks.length ? <Button className="w-full" disabled={sourceBankLoading} onClick={() => setSourceBankPage((page) => page + 1)} size="sm" variant="brandOutline">{sourceBankLoading ? "Memuat…" : "Muat Bank Soal lain"}</Button> : null}
                        </PopoverContent>
                      </Popover>
                    </Field>
                    <div className="rounded-2xl border border-primary-100 bg-white p-4">
                      <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-800">Soal terpilih</p><Badge className="rounded-full" size="ui" variant={activeDirectQuestions.length ? "mint" : "accent"}>{activeDirectQuestions.length}</Badge></div>
                      {activeDirectQuestions.length ? <ol className="mt-3 grid gap-2">{activeDirectQuestions.map((question, index) => <li className="rounded-xl border border-primary-100 px-3 py-2.5" key={question.sourceQuestionId}><div className="flex items-start gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary-50 text-xs font-bold text-primary-800">{index + 1}</span><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm leading-5 text-secondary-900">{question.prompt ?? "Soal pilihan langsung"}</p><p className="mt-1 truncate text-xs text-secondary-500">{question.bankTitle ?? "Bank Soal"}</p></div><Button aria-label={`Hapus soal langsung ${index + 1}`} disabled={draft.locked} onClick={() => update(activeCode, { directQuestions: activeDirectQuestions.filter((candidate) => candidate.sourceQuestionId !== question.sourceQuestionId) })} size="icon-xs" variant="ghost"><X /></Button></div><div className="mt-2 flex justify-end gap-1"><Button aria-label={`Naikkan soal langsung ${index + 1}`} disabled={draft.locked || index === 0} onClick={() => { const next = [...activeDirectQuestions]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; update(activeCode, { directQuestions: next }); }} size="icon-xs" variant="ghost"><ArrowUp /></Button><Button aria-label={`Turunkan soal langsung ${index + 1}`} disabled={draft.locked || index === activeDirectQuestions.length - 1} onClick={() => { const next = [...activeDirectQuestions]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; update(activeCode, { directQuestions: next }); }} size="icon-xs" variant="ghost"><ArrowDown /></Button></div></li>)}</ol> : <p className="mt-3 text-sm leading-6 text-secondary-500">Belum ada soal. Pilih dari Bank Soal di sebelah kanan.</p>}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-primary-100 bg-white p-4">
                    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" /><FieldInput aria-label="Cari soal Ready" className="h-10 rounded-xl py-2 pl-9 pr-3 text-sm" disabled={!browseBankId} onChange={(event) => { setSourceQuestionSearch(event.target.value); setSourceQuestionPage(1); }} placeholder={activeBrowseBank ? `Cari soal ${activeSection.subtest} di ${activeBrowseBank.title}…` : "Pilih Bank Soal terlebih dahulu"} value={sourceQuestionSearch} /></div>
                    {sourceQuestionLoading ? <p className="mt-3 text-xs text-secondary-500">Memuat soal Ready…</p> : null}
                    {activeSourceQuestions.length ? <div className="mt-4 grid gap-3">{activeSourceQuestions.map((question) => { const selected = selectedSourceQuestionIds.includes(question.id); return <article className="rounded-2xl border border-primary-100 p-3" key={question.id}><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-primary-800">{question.subjectCode} · {question.difficulty === "easy" ? "Mudah" : question.difficulty === "hard" ? "Sulit" : "Sedang"}</p>{selected ? <Badge className="rounded-full" size="ui" variant="mint">Terpilih</Badge> : null}</div><p className="mt-1 line-clamp-4 text-sm leading-6 text-secondary-900">{question.prompt}</p><Button className="mt-3" disabled={draft.locked || selected} onClick={() => addDirectQuestion(question)} size="sm" variant={selected ? "ghost" : "brandOutline"}>{selected ? <Check /> : <Plus />}{selected ? "Sudah dipilih" : "Tambah ke Section"}</Button></article>; })}</div> : <div className="mt-5 rounded-2xl border border-dashed border-primary-200 px-4 py-10 text-center text-sm leading-6 text-secondary-500">{browseBankId ? `Tidak ada soal ${activeSection.subtest} yang cocok di Bank Soal ini.` : "Pilih Bank Soal untuk mulai memilih."}</div>}
                    {browseBankId && sourceQuestionTotal > sourceQuestions.length ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4"><p className="text-xs text-secondary-500">Menampilkan {sourceQuestions.length} dari {sourceQuestionTotal} soal Ready.</p><Button disabled={sourceQuestionLoading} onClick={() => setSourceQuestionPage((page) => page + 1)} size="sm" variant="brandOutline"><ArrowDown />{sourceQuestionLoading ? "Memuat…" : "Muat soal lain"}</Button></div> : null}
                  </div>
                </div>
              )}
            </div>
            <footer className="flex justify-end border-t border-primary-100 pt-5"><Button onClick={() => goTo("rules")} variant="brand">Atur Rules <ChevronRight /></Button></footer>
          </section>
        </TabsContent>

        <TabsContent className="mt-5" value="rules">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <header>
              <h2 className="text-xl font-semibold text-secondary-900">Rules per Section</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Atur mode CBT/CAT, timer, dan urutan soal. Validasi CAT dan kalibrasi 2PL tetap dipastikan server saat publish.</p>
            </header>
            <div className="grid gap-4 lg:grid-cols-2">
              {draft.sections.map((section, index) => (
                <Card className={`shadow-none ring-primary-100 ${section.subtest === activeSection.subtest ? "ring-2 ring-primary-300" : ""}`} key={section.subtest}>
                  <CardHeader>
                    <CardTitle className="font-semibold">Test {index + 1} · {section.subtest}</CardTitle>
                    <CardDescription>{subjectName(section.subtest)} · {section.durationMinutes} menit</CardDescription>
                    <CardAction><Badge className="rounded-full" size="ui" variant={section.testType === "cat" ? "accent" : "mint"}>{section.testType.toUpperCase()}</Badge></CardAction>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid grid-cols-2 rounded-2xl border border-secondary-900/14 bg-white p-1" role="radiogroup" aria-label={`Mode Test ${section.subtest}`}>
                      <Button aria-checked={section.testType === "cbt"} className={`rounded-xl ${section.testType === "cbt" ? "bg-[#d7f2d8] text-[#14563e] hover:bg-[#c8ebca]" : "text-secondary-500"}`} disabled={draft.locked} onClick={() => update(section.subtest, { testType: "cbt" })} role="radio" variant="ghost">CBT</Button>
                      <Button aria-checked={section.testType === "cat"} className={`rounded-xl ${section.testType === "cat" ? "bg-[#d7f2d8] text-[#14563e] hover:bg-[#c8ebca]" : "text-secondary-500"}`} disabled={draft.locked} onClick={() => update(section.subtest, { testType: "cat" })} role="radio" variant="ghost">CAT</Button>
                    </div>
                    {section.testType === "cat" ? <Field><div className="flex items-center gap-1"><FieldLabel htmlFor={`cat-count-${section.subtest}`}>Jumlah soal CAT</FieldLabel><TooltipProvider><Tooltip><TooltipTrigger render={<Button aria-label={`Bantuan jumlah soal CAT ${section.subtest}`} size="icon-xs" variant="ghost" />}><CircleHelp /></TooltipTrigger><TooltipContent>Jumlah soal CAT harus tersedia pada sumber dan memiliki kalibrasi 2PL siap.</TooltipContent></Tooltip></TooltipProvider></div><FieldInput disabled={draft.locked} id={`cat-count-${section.subtest}`} min="1" onChange={(event) => update(section.subtest, { catItemCount: Number(event.target.value) })} type="number" value={section.catItemCount ?? ""} /></Field> : null}
                    <div className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-primary-100 bg-[#f8fbf9] px-4 py-3"><p className="text-sm font-semibold text-secondary-900">Acak urutan soal</p><Switch aria-label={`Acak urutan soal ${section.subtest}`} checked={section.shuffleItems} disabled={draft.locked} onCheckedChange={(checked) => update(section.subtest, { shuffleItems: checked })} /></div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <footer className="flex justify-end border-t border-primary-100 pt-5"><Button onClick={() => goTo("schedule")} variant="brand">Atur Schedule &amp; akses <ChevronRight /></Button></footer>
          </section>
        </TabsContent>

        <TabsContent className="mt-5" keepMounted value="schedule">
          {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : (
            <div className="grid gap-8">
              <section aria-labelledby="schedule-policy-title">
                <div className="mb-4 flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><SlidersHorizontal /></div><div><h2 id="schedule-policy-title" className="text-xl font-semibold text-secondary-900">Schedule &amp; akses</h2><p className="mt-1 text-sm leading-6 text-secondary-600">Atur cara peserta masuk, kebijakan hasil, sesi delivery, dan ParticipantView dari satu tempat.</p></div></div>
                <KaptenTryoutPolicyPageModule embedded initial={operationsInitial} />
              </section>
              <section aria-labelledby="schedule-sessions-title">
                <div className="mb-4 flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><CalendarDays /></div><div><h2 id="schedule-sessions-title" className="text-xl font-semibold text-secondary-900">Sesi delivery</h2><p className="mt-1 text-sm leading-6 text-secondary-600">Setiap sesi peserta akan mengikat satu AssessmentRelease saat dibuka.</p></div></div>
                <KaptenTryoutSessionsPageModule embedded initial={operationsInitial} />
              </section>
              <section aria-labelledby="schedule-participants-title">
                <div className="mb-4 flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><Users /></div><div><h2 id="schedule-participants-title" className="text-xl font-semibold text-secondary-900">Peserta</h2><p className="mt-1 text-sm leading-6 text-secondary-600">Lihat satu status peserta yang menggabungkan admission, sesi, attempt, dan nilai.</p></div></div>
                <KaptenTryoutParticipantsPageModule embedded initial={operationsInitial} />
              </section>
            </div>
          )}
        </TabsContent>

        <TabsContent className="mt-5" value="live">
          {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : <KaptenTryoutLivePageModule initial={operationsInitial} />}
        </TabsContent>

        <TabsContent className="mt-5" value="attempts">
          {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : <KaptenTryoutAttemptsPageModule initial={operationsInitial} />}
        </TabsContent>

        <TabsContent className="mt-5" value="results">
          {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : <KaptenTryoutResultsPageModule initial={operationsInitial} />}
        </TabsContent>

        <TabsContent className="mt-5" value="review">
          <section className="grid gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-secondary-900">Review sebelum publish</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Periksa isi dan kesiapan workspace. Membuka Review tidak membuat attempt atau mengubah state peserta.</p>
              </div>
              <Button onClick={() => setPreviewOpen(true)} variant="brandOutline"><Eye />Pratinjau peserta</Button>
            </header>
            <div className="grid gap-3">
              {reviewChecks.map((check) => (
                <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${check.status ? "border-primary-100 bg-white" : "border-[#f3d486] bg-[#fff7e5]"}`} key={check.label} role="status">
                  {check.status ? <Check className="mt-1 size-5 shrink-0 text-primary-700" /> : <CircleAlert className="mt-1 size-5 shrink-0 text-[#a46b00]" />}
                  <div><p className="font-semibold text-secondary-900">{check.label}</p><p className="mt-0.5 text-sm leading-6 text-secondary-600">{check.detail}</p></div>
                </div>
              ))}
            </div>
            {draft.sections.some((section) => section.packageVersionId) ? <section className="grid gap-3 rounded-3xl border border-primary-100 bg-white p-5 sm:p-6" aria-labelledby="assembly-review-title"><div className="flex items-start gap-3"><ListChecks className="mt-1 size-5 text-primary-800" /><div><h3 className="font-semibold text-secondary-900" id="assembly-review-title">Readiness sumber assembly</h3><p className="mt-1 text-sm leading-6 text-secondary-600">Ringkasan ini membantu Review menemukan blocker Pool, kuota Blueprint, kalibrasi CAT, atau ketidakcocokan tipe Test sebelum publish. Validasi server tetap menjadi penentu.</p></div></div><div className="grid gap-3 border-t border-primary-100 pt-4">{draft.sections.map((section, index) => { const assembly = selectedAssemblies[index]; if (!section.packageVersionId || !assembly) return null; const assemblyTypeCompatible = assemblyCompatibleWithTestType(assembly.mode, section.testType); const assemblyReady = assembly.readiness.ready && assemblyTypeCompatible; return <article className={`grid gap-2 rounded-2xl border p-4 ${assemblyReady ? "border-primary-100 bg-primary-50/35" : "border-[#f3d486] bg-[#fff7e5]"}`} key={section.subtest}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-800">{section.subtest} · {assemblyModeLabel(assembly.mode)}</p><p className="mt-1 break-words font-semibold text-secondary-900">{assembly.packageTitle}</p></div><Badge className="rounded-full" size="ui" variant={assemblyReady ? "mint" : "accent"}>{assemblyReady ? "Siap" : "Perlu ditinjau"}</Badge></div><p className="text-sm leading-6 text-secondary-600">{assemblyReadinessSummary(assembly)} · {assembly.bankNames.join(", ") || "Bank Soal"}</p>{!assemblyTypeCompatible ? <p className="text-sm leading-6 text-[#6a4a00]">{assembly.mode === "cat_pool" ? "CAT Pool hanya dapat dipakai pada Test CAT." : "Assembly ini hanya dapat dipakai pada Test CBT."}</p> : null}{assembly.readiness.blockers.length ? <div className="grid gap-1 text-sm leading-5 text-[#6a4a00]">{assembly.readiness.blockers.map((blocker) => <p key={`${blocker.code}-${blocker.message}`}>• {blocker.message}</p>)}</div> : assemblyTypeCompatible ? <p className="text-sm leading-5 text-primary-800">Tidak ada blocker readiness saat ini.</p> : null}<div><Button onClick={() => { void previewAssembly(assembly); }} size="sm" variant="brandOutline"><Eye />Lihat preview</Button></div></article>; })}</div></section> : null}
            <section className="grid gap-4 rounded-3xl border border-primary-100 bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3"><ListChecks className="mt-1 size-5 text-primary-800" /><div><h3 className="font-semibold text-secondary-900">Server checks tetap berlaku</h3><p className="mt-1 text-sm leading-6 text-secondary-600">Saat publish, server memeriksa sumber Ready, opsi, duplicate question, kesiapan CAT 2PL, dan snapshot AssessmentRelease. Checklist ini membantu navigasi; bukan pengganti validasi otoritatif.</p></div></div>
              {incompleteSections.length ? <div className="flex flex-wrap gap-2 border-t border-primary-100 pt-4">{incompleteSections.map((section) => <Button className="h-8 rounded-lg border-[#d4a943] bg-white/70 px-2.5 text-xs text-[#6a4a00] hover:bg-white" key={section.subtest} onClick={() => { changeActiveCode(section.subtest); goTo("questions"); }} variant="outline">Lengkapi {section.subtest}</Button>)}</div> : null}
            </section>
            <footer className="flex justify-end"><Button disabled={!readyToPublish} onClick={() => goTo("publish")} variant="brand">Lanjut ke Publish <ChevronRight /></Button></footer>
          </section>
        </TabsContent>

        <TabsContent className="mt-5" value="publish">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-secondary-900">Publish Tryout</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Simpan draft dan publish adalah dua tindakan berbeda. Publish membuat atau memajukan identitas AssessmentRelease yang dipakai sesi peserta.</p>
              </div>
              <Upload className="size-6 text-primary-800" />
            </header>
            <AssessmentReleaseNotice label="AssessmentRelease" missingDescription="Belum ada rilis. Publish akan membuat rilis pertama setelah semua server checks berhasil." release={release} state={draft.status === "draft" ? "historical" : "current"} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Kesiapan sumber</p><p className="mt-1 text-lg font-semibold text-secondary-900">{boundCount}/7 Section siap</p><p className="mt-1 text-sm leading-6 text-secondary-600">Semua sumber akan disalin sebagai snapshot immutable.</p></CardContent></Card>
              <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Perlindungan riwayat</p><p className="mt-1 text-lg font-semibold text-secondary-900">{draft.locked ? "Terkunci" : "Siap diperbarui"}</p><p className="mt-1 text-sm leading-6 text-secondary-600">Setelah participant start, perubahan fairness-sensitive memakai Duplikasi.</p></CardContent></Card>
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-[#f8fbf9] p-4 text-sm leading-6 text-secondary-700 sm:flex-row sm:items-start"><CircleHelp className="mt-1 size-4 shrink-0 text-primary-800" /><p>{release ? "Publish ulang hanya membuat rilis baru bila isi Tryout berubah. Sesi yang sudah terbuka tetap terikat pada rilis sebelumnya." : "Sesi peserta belum boleh dibuka sebelum memiliki AssessmentRelease. Setelah publish, buka sesi dari Schedule & akses."}</p></div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-primary-100 pt-5">
              {!draft.locked ? <Button disabled={saving} onClick={() => void save("draft")} variant="brandOutline"><Save />{saving ? "Menyimpan…" : "Simpan draft"}</Button> : null}
              {!draft.locked ? <Button disabled={saving || !readyToPublish} onClick={() => setPublishOpen(true)} variant="brand"><Upload />{draft.status === "published" ? "Terbitkan pembaruan" : "Terbitkan Tryout"}</Button> : <Button disabled={saving} onClick={() => setDuplicateOpen(true)} variant="brand"><Copy />Buat salinan editable</Button>}
            </footer>
            {!readyToPublish && !draft.locked ? <p className="text-right text-sm text-[#8a5e00]">Lengkapi Review terlebih dahulu: {reviewFailures} pemeriksaan belum lulus.</p> : null}
          </section>
        </TabsContent>
      </Tabs>

      <Dialog onOpenChange={setPreviewOpen} open={previewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pratinjau peserta</DialogTitle>
            <DialogDescription>Pratinjau ini hanya membaca draft saat ini. Tidak ada attempt, admission, atau sesi yang dibuat.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5">
            <div className="rounded-2xl bg-primary-50 p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-800">Tryout</p><h3 className="mt-1 text-2xl font-semibold text-secondary-900">{draft.title || "Tryout tanpa judul"}</h3>{draft.description ? <p className="mt-2 text-sm leading-6 text-secondary-700">{draft.description}</p> : <p className="mt-2 text-sm text-secondary-500">Belum ada deskripsi.</p>}</div>
            <div className="grid gap-2"><h4 className="font-semibold text-secondary-900">Urutan Test</h4>{draft.sections.map((section, index) => <div className="flex items-center justify-between gap-3 rounded-xl border border-primary-100 px-3 py-2.5 text-sm" key={section.subtest}><span className="font-medium text-secondary-900">{index + 1}. {section.subtest} · {subjectName(section.subtest)}</span><span className="text-secondary-600">{section.durationMinutes} menit · {section.packageVersionId ? "Set siap" : section.directQuestions?.length ? `${section.directQuestions.length} soal` : "Belum siap"}</span></div>)}</div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => { setAssemblyPreviewOpen(open); if (!open) setAssemblyPreview(null); }} open={assemblyPreviewOpen}>
        <DialogContent className="max-h-[min(80vh,42rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{assemblyPreview ? `${assemblyModeLabel(assemblyPreview.mode)} · preview` : "Preview sumber Ready"}</DialogTitle>
            <DialogDescription>Preview membaca sumber dan readiness saat ini. Tidak ada soal, rilis, atau state peserta yang dibuat dari dialog ini.</DialogDescription>
          </DialogHeader>
          {assemblyPreviewLoading ? <p className="rounded-2xl border border-primary-100 bg-primary-50/45 px-4 py-6 text-sm text-secondary-600">Memuat preview dan kesiapan…</p> : assemblyPreview ? <div className="grid gap-4"><div className={`rounded-2xl border p-4 text-sm leading-6 ${assemblyPreview.readiness.ready ? "border-primary-100 bg-primary-50/45 text-secondary-700" : "border-[#f3d486] bg-[#fff7e5] text-secondary-800"}`} role="status"><p className="font-semibold text-secondary-900">{assemblyPreview.readiness.ready ? "Sumber siap ditinjau" : "Sumber memiliki blocker"}</p><p className="mt-1">{assemblyPreview.readiness.mode === "blueprint" ? `Ketersediaan: Mudah ${assemblyPreview.readiness.availableByDifficulty.easy}, Sedang ${assemblyPreview.readiness.availableByDifficulty.medium}, Sulit ${assemblyPreview.readiness.availableByDifficulty.hard}.` : `${assemblyPreview.readiness.eligibleCount} kandidat eligible dari ${assemblyPreview.readiness.candidateCount} kandidat.`}</p>{assemblyPreview.readiness.blockers.length ? <div className="mt-2 grid gap-1 text-[#6a4a00]">{assemblyPreview.readiness.blockers.map((blocker) => <p key={`${blocker.code}-${blocker.message}`}>• {blocker.message}</p>)}</div> : null}</div><div className="grid gap-2"><h4 className="font-semibold text-secondary-900">Contoh soal</h4>{assemblyPreview.sample.length ? assemblyPreview.sample.map((sample, index) => <div className="rounded-xl border border-primary-100 px-3 py-2.5" key={`${sample.sourceQuestionId}-${sample.sourceQuestionRevisionId}`}><p className="text-xs font-semibold text-primary-800">{index + 1}. {sample.difficulty === "easy" ? "Mudah" : sample.difficulty === "hard" ? "Sulit" : "Sedang"}</p><p className="mt-1 line-clamp-3 text-sm leading-6 text-secondary-900">{sample.prompt}</p></div>) : <p className="rounded-xl border border-dashed border-primary-200 px-3 py-5 text-sm text-secondary-500">Belum ada contoh soal yang dapat ditampilkan.</p>}</div></div> : null}
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={(open) => { if (!saving) setPublishOpen(open); }} open={publishOpen}>
        <AlertDialogContent className="rounded-5xl" pending={saving} variant="warning">
          <AlertDialogHeader><AlertDialogTitle>Terbitkan Tryout?</AlertDialogTitle><AlertDialogDescription>Server akan memvalidasi tujuh Section, sumber Ready, snapshot, dan kesiapan CAT sebelum membuat AssessmentRelease. Publish terpisah dari simpan draft.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => { setPublishOpen(false); void save("published"); }} variant="brand"><Upload />{saving ? "Menerbitkan…" : "Terbitkan Tryout"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={(open) => { if (!saving) setDuplicateOpen(open); }} open={duplicateOpen}>
        <AlertDialogContent className="rounded-5xl" pending={saving} variant="info">
          <AlertDialogHeader><AlertDialogTitle>Duplikasi Tryout?</AlertDialogTitle><AlertDialogDescription>Salinan akan dibuat sebagai draf yang dapat diedit. Riwayat peserta dan AssessmentRelease Tryout ini tetap tidak berubah.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => { setDuplicateOpen(false); void duplicate(); }} variant="brand"><Copy />{saving ? "Menyalin…" : "Buat salinan"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { KaptenTryoutBuilderPageModule };

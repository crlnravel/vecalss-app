"use client";

import Link from "next/link";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  CircleHelp,
  Copy,
  Lock,
  Pencil,
  Save,
  Search,
} from "@/lib/icons";
import { useEffect, useMemo, useState } from "react";

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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FullWidthLineTabsList,
  FullWidthLineTabsTrigger,
} from "@/components/ui/full-width-line-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import type { AssemblyAttachmentSummary } from "@/lib/tryout/assembly-repository";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import type { ReusableQuestionPackageHandoff } from "@/lib/tryout/repository";
import type { TryoutWorkflowProjection as CanonicalTryoutWorkflowProjection } from "@/lib/tryout/workflow-projection";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { KaptenTryoutAttemptsPageModule } from "@/modules/mentor/KaptenTryoutAttemptsPageModule";
import { KaptenTryoutLivePageModule } from "@/modules/mentor/KaptenTryoutLivePageModule";
import { KaptenTryoutPolicyPageModule } from "@/modules/mentor/KaptenTryoutPolicyPageModule";
import { KaptenTryoutResultsPageModule } from "@/modules/mentor/KaptenTryoutResultsPageModule";
import { KaptenTryoutSessionsPageModule } from "@/modules/mentor/KaptenTryoutSessionsPageModule";
import { listQuestionBankSourcePageAction, listQuestionBankSourceQuestionsAction } from "@/modules/mentor/question-bank-actions";
import { duplicateTryoutAction, saveTryoutAction, updateTryoutMetadataAction } from "@/modules/mentor/tryout-actions";

const subjectCodes = kaptenSubjects.map((subject) => subject.code) as Array<"PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM">;
type SubjectCode = (typeof subjectCodes)[number];
type AssemblyMode = "fixed_set" | "random_pool" | "blueprint" | "cat_pool";
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
type Workspace = "basics" | "sections" | "questions" | "rules" | "schedule" | "live" | "attempts" | "results" | "review" | "publish";
type DeliveryArea = "policy" | "sessions" | "participants";
type WorkspacePhase = "overview" | "build" | "review_publish" | "delivery" | "operations" | "results";
type WorkflowMode = "draft" | "published";

type WorkspacePhaseDefinition = {
  label: string;
  value: WorkspacePhase;
  items: Array<{ label: string; value: Workspace }>;
};

const draftWorkspacePhases: WorkspacePhaseDefinition[] = [
  {
    label: "Overview",
    value: "overview",
    items: [{ label: "Overview", value: "basics" }],
  },
  {
    label: "Soal",
    value: "build",
    items: [{ label: "Configure Sections", value: "sections" }],
  },
  {
    label: "Review & Publish",
    value: "review_publish",
    items: [{ label: "Review & Publish", value: "review" }],
  },
];

const publishedWorkspacePhases: WorkspacePhaseDefinition[] = [
  {
    label: "Delivery",
    value: "delivery",
    items: [{ label: "Policy · Sessions · Participants", value: "schedule" }],
  },
  {
    label: "Operations",
    value: "operations",
    items: [
      { label: "Live", value: "live" },
      { label: "Attempts", value: "attempts" },
    ],
  },
  {
    label: "Results",
    value: "results",
    items: [{ label: "Results & release", value: "results" }],
  },
];

const lifecyclePhaseOrder: Array<{ label: string; value: WorkspacePhase }> = [
  { label: "Overview", value: "overview" },
  { label: "Soal", value: "build" },
  { label: "Review & Publish", value: "review_publish" },
  { label: "Delivery", value: "delivery" },
  { label: "Operations", value: "operations" },
  { label: "Results", value: "results" },
];

function lifecyclePhasesForMode(mode: WorkflowMode) {
  const phaseValues = new Set((mode === "draft" ? draftWorkspacePhases : publishedWorkspacePhases).map((phase) => phase.value));
  return lifecyclePhaseOrder.filter((phase) => phaseValues.has(phase.value));
}

const deliveryAreas: Array<{ label: string; value: DeliveryArea }> = [
  { label: "Policy", value: "policy" },
  { label: "Sessions", value: "sessions" },
  { label: "Participants", value: "participants" },
];

function phaseForWorkspace(value: Workspace): WorkspacePhase {
  if (value === "basics") return "overview";
  if (["sections", "questions", "rules"].includes(value)) return "build";
  if (["review", "publish"].includes(value)) return "review_publish";
  if (value === "schedule") return "delivery";
  if (["live", "attempts"].includes(value)) return "operations";
  return "results";
}

function deliveryAreaFor(value?: string): DeliveryArea {
  if (value === "sessions") return "sessions";
  if (value === "participants") return "participants";
  if (value === "operations") return "sessions";
  return "policy";
}

function workspaceForDeliveryArea(): Workspace {
  return "schedule";
}

function phaseStartWorkspace(phase: WorkspacePhase, mode: WorkflowMode = "draft"): Workspace {
  return (mode === "draft" ? draftWorkspacePhases : publishedWorkspacePhases).find((item) => item.value === phase)?.items[0]?.value ?? (mode === "draft" ? "basics" : "schedule");
}

function defaultSections(): TestDraft[] {
  return subjectCodes.map((subtest) => ({
    directQuestions: [],
    durationMinutes: 30,
    instructions: "",
    shuffleItems: true,
    subtest,
    testType: "cbt",
  }));
}

function normalize(draft: TryoutDraft): TryoutDraft {
  const byCode = new Map(draft.sections.map((section) => [section.subtest, section]));
  const fallback = defaultSections();
  return {
    ...draft,
    sections: subjectCodes.map((code) => ({
      ...(byCode.get(code) ?? fallback.find((section) => section.subtest === code)!),
      shuffleItems: true,
    })),
  };
}

function seedPackageHandoff(draft: TryoutDraft, handoff: ReusableQuestionPackageHandoff) {
  const packageVersionMode = handoff.packageVersionMode as AssemblyMode;
  const target = draft.sections.find((section) => section.subtest === handoff.subtest);
  if (!target) return { draft, didSeed: false };
  const nextSection: TestDraft = {
    ...target,
    catItemCount: handoff.testType === "cat" ? handoff.catItemCount : undefined,
    directQuestions: [],
    packageVersionId: handoff.packageVersionId,
    packageVersionLabel: handoff.packageVersionLabel,
    packageVersionMode,
    testType: handoff.testType,
  };
  const didSeed = target.packageVersionId !== nextSection.packageVersionId
    || target.packageVersionLabel !== nextSection.packageVersionLabel
    || target.packageVersionMode !== nextSection.packageVersionMode
    || target.testType !== nextSection.testType
    || target.catItemCount !== nextSection.catItemCount
    || Boolean(target.directQuestions?.length);
  if (!didSeed) return { draft, didSeed: false };
  return {
    didSeed: true,
    draft: {
      ...draft,
      sections: draft.sections.map((section) => section.subtest === handoff.subtest ? nextSection : section),
    },
  };
}

function normalizeWorkspace(value?: string): Workspace {
  switch (value) {
    case "overview":
      return "basics";
    case "basics":
    case "sections":
    case "schedule":
    case "live":
    case "attempts":
    case "results":
    case "review":
      return value;
    case "publish":
      return "review";
    case "configure_sections":
    case "questions":
    case "rules":
    case "authoring":
      return "sections";
    case "readiness_publish":
      return "review";
    case "delivery":
      return "schedule";
    case "policy":
    case "sessions":
    case "participants":
      return "schedule";
    case "operations":
      return "attempts";
    default:
      return "basics";
  }
}

function subjectName(code: SubjectCode) {
  return kaptenSubjects.find((subject) => subject.code === code)?.name ?? code;
}

function RequiredMark() {
  return <><span aria-hidden="true" className="ml-1 text-danger-500">*</span><span className="sr-only"> wajib</span></>;
}

function WorkspaceUnavailable({ onSaveDraft }: { onSaveDraft: () => void }) {
  return (
    <section className="grid min-h-56 place-items-center rounded-3xl border border-dashed border-primary-200 bg-white px-6 py-12 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
          <Save aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-secondary-900">Simpan perubahan untuk membuka area ini</h2>
        <p className="text-sm leading-6 text-secondary-600">Soal dan Review &amp; Publish bisa disiapkan sekarang. Delivery, Operations, dan Results akan tersambung setelah Tryout memiliki ID.</p>
        <Button onClick={onSaveDraft} variant="brand">Simpan perubahan</Button>
      </div>
    </section>
  );
}

type SectionReadiness = {
  detail: string;
  issueCount: number;
  status: "attention" | "in_progress" | "ready" | "setup";
  target: Workspace;
};

function SectionRail({
  activeCode,
  onSelect,
  readiness,
  sections,
}: {
  activeCode: SubjectCode;
  onSelect: (subtest: SubjectCode) => void;
  readiness: Record<SubjectCode, SectionReadiness>;
  sections: TestDraft[];
}) {
  return (
    <aside aria-labelledby="section-rail-title" className="grid gap-3 rounded-3xl border border-primary-100 bg-[#f8fbf9] p-4 lg:sticky lg:top-5 lg:self-start">
      <div>
        <h2 className="font-semibold text-secondary-900" id="section-rail-title">Configure Sections</h2>
      </div>
      <div className="grid gap-2" role="list" aria-label="Tujuh Section Tryout">
        {sections.map((section) => {
          const active = section.subtest === activeCode;
          const incomplete = readiness[section.subtest]?.status !== "ready";
          return (
            <div key={section.subtest} role="listitem">
              <Button
                aria-current={active ? "page" : undefined}
                aria-label={`${section.subtest}${incomplete ? " (belum lengkap)" : ""}`}
                className={`h-12 w-full justify-start rounded-xl border px-3 text-left text-base font-bold transition-colors ${active ? "border-primary-200 bg-primary-50 text-primary-900 hover:bg-primary-100" : "border-transparent text-secondary-800 hover:bg-primary-50"}`}
                onClick={() => onSelect(section.subtest)}
                variant="ghost"
              >
                <span>{section.subtest}</span>
                {incomplete ? <span aria-hidden="true" className="ml-auto size-2 rounded-full bg-voyage-warm-sun" /> : null}
              </Button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function KaptenTryoutBuilderPageModule({
  id,
  initialDraft,
  initialDeliveryArea,
  initialPackageHandoff,
  initialPackageHandoffError,
  initialParent,
  initialSessionId,
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
  initialDeliveryArea?: string;
  initialPackageHandoff?: ReusableQuestionPackageHandoff;
  initialPackageHandoffError?: string;
  initialParent?: { id: string; publishedAt?: string; title: string };
  initialSessionId?: string;
  initialWorkspace?: string;
  initialSourceBankTotal?: number;
  initialSourceBanks: SourceBank[];
  operationsInitial?: TryoutOperationsView & { workflow?: CanonicalTryoutWorkflowProjection };
  readyAssemblies: AssemblyAttachmentSummary[];
  readyVersions: ReadyVersion[];
  session: SessionContext;
}) {
  void session;
  void readyAssemblies;
  void readyVersions;
  const [initialFormDraft] = useState<TryoutDraft>(() => normalize(initialDraft ?? {
    description: "",
    id: id ?? "baru",
    locked: false,
    sections: defaultSections(),
    status: "draft",
    title: "Draft Tryout Baru",
    updatedAt: Date.now(),
  }));
  const initialSeed = initialPackageHandoff ? seedPackageHandoff(initialFormDraft, initialPackageHandoff) : { didSeed: false, draft: initialFormDraft };
  const [draft, setDraft] = useState<TryoutDraft>(() => initialSeed.draft);
  const [savedDraft, setSavedDraft] = useState<TryoutDraft>(() => initialFormDraft);
  const [activeCode, setActiveCode] = useState<SubjectCode>(() => initialPackageHandoff?.subtest ?? initialSeed.draft.sections.find((section) => !section.packageVersionId && !section.directQuestions?.length)?.subtest ?? "PU");
  const [error, setError] = useState<string | null>(() => initialPackageHandoffError ?? null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(() => !id || initialSeed.didSeed);
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
  const [publishOpen, setPublishOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [requestedWorkspace, setRequestedWorkspace] = useState<Workspace>(() => {
    const requested = normalizeWorkspace(initialWorkspace);
    if (initialDraft?.status === "published" && ["basics", "sections", "review", "publish"].includes(requested)) return "schedule";
    if (initialDraft?.status !== "published" && ["schedule", "live", "attempts", "results"].includes(requested)) return "basics";
    return requested;
  });
  const [deliveryArea, setDeliveryArea] = useState<DeliveryArea>(() => deliveryAreaFor(initialDeliveryArea ?? initialWorkspace));
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState(() => ({ description: initialSeed.draft.description, title: initialSeed.draft.title }));
  const [pendingWorkspace, setPendingWorkspace] = useState<Workspace | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [dirtyNavigationOpen, setDirtyNavigationOpen] = useState(false);

  const activeSection = draft.sections.find((section) => section.subtest === activeCode) ?? draft.sections[0];
  const selectedSourceQuestionIds = draft.sections.flatMap((section) => section.directQuestions ?? []).map((question) => question.sourceQuestionId);
  const directQuestionsReady = (questions: DirectQuestionDraft[]) => Boolean(
    questions.length
      && questions.every((question) => Boolean(question.prompt?.trim()) && question.hasExplanation === true && question.hasReadyMedia !== false),
  );
  const invalidDurationSections = draft.sections.filter((section) => !Number.isInteger(section.durationMinutes) || section.durationMinutes < 1);
  const incompleteSections = draft.sections.filter((section) => {
    const directQuestions = section.directQuestions ?? [];
    const hasSource = Boolean(section.packageVersionId || directQuestions.length);
    const contentReady = section.packageVersionId ? true : directQuestionsReady(directQuestions);
    return !hasSource
      || !contentReady;
  });
  const sectionReadiness = Object.fromEntries(draft.sections.map((section) => {
    const directQuestions = section.directQuestions ?? [];
    const hasSource = Boolean(section.packageVersionId || directQuestions.length);
    const issues: string[] = [];
    let target: Workspace = "sections";
    if (!hasSource) issues.push("Sumber soal belum dipilih.");
    if (invalidDurationSections.some((candidate) => candidate.subtest === section.subtest)) {
      issues.push("Durasi belum valid.");
      if (hasSource) target = "sections";
    }
    if (incompleteSections.some((candidate) => candidate.subtest === section.subtest) && !issues.length) {
      issues.push("Pilih soal dan pastikan kontennya siap.");
      target = "sections";
    }
    const hasAnyConfiguration = hasSource || Boolean(section.instructions.trim()) || section.durationMinutes !== 30;
    return [section.subtest, {
      detail: issues[0] ?? "Sumber dan durasi siap diperiksa.",
      issueCount: issues.length,
      status: !hasAnyConfiguration ? "setup" : !hasSource || issues.length ? (issues.length ? "attention" : "in_progress") : "ready",
      target,
    } satisfies SectionReadiness];
  })) as Record<SubjectCode, SectionReadiness>;
  const activeDirectQuestions = activeSection.directQuestions ?? [];
  const activeBrowseBank = sourceBanks.find((bank) => bank.id === browseBankId);
  const activeSourceQuestions = sourceQuestions.filter((question) => question.subjectCode === activeSection.subtest);
  const workflow = operationsInitial?.workflow;
  const mode: WorkflowMode = workflow?.mode ?? (draft.status === "published" ? "published" : "draft");
  const hasPersistedTryout = Boolean(id && draft.id !== "baru");
  const configureReady = draft.sections.length === 7
    && incompleteSections.length === 0
    && invalidDurationSections.length === 0;
  const fallbackOperationsAvailable = Boolean(
    operationsInitial?.sessions.some((session) => ["active", "archived", "closed", "open", "opened", "released"].includes(session.status) || Boolean(session.assessmentRelease))
      || operationsInitial?.attempts.length,
  );
  const fallbackResultEligible = Boolean(
    operationsInitial?.sessions.some((session) => session.status === "closed")
      || operationsInitial?.results.length,
  );
  const operationsAvailable = workflow?.operationsAvailable ?? fallbackOperationsAvailable;
  const resultEligible = workflow?.resultEligibleSessionIds?.length ? true : workflow?.resultEligibleSessionIds ? false : fallbackResultEligible;
  const liveEligibleSessionIds = workflow?.liveEligibleSessionIds ?? operationsInitial?.sessions
    .filter((session) => session.status === "active" && Boolean(session.assessmentRelease))
    .map((session) => session.id) ?? [];
  const resultEligibleSessionIds = workflow?.resultEligibleSessionIds ?? operationsInitial?.sessions
    .filter((session) => session.status === "closed" || operationsInitial.results.some((result) => result.sessionId === session.id))
    .map((session) => session.id) ?? [];
  const allowedWorkspaces = useMemo<Workspace[]>(() => {
    if (mode === "draft") {
      const allowed: Workspace[] = ["basics"];
      if (hasPersistedTryout && Boolean(draft.title.trim())) allowed.push("sections");
      if (configureReady) allowed.push("review");
      return allowed;
    }
    const allowed: Workspace[] = ["schedule"];
    if (liveEligibleSessionIds.length) allowed.push("live");
    if (operationsAvailable) allowed.push("attempts");
    if (resultEligible) allowed.push("results");
    return allowed;
  }, [configureReady, draft.title, hasPersistedTryout, liveEligibleSessionIds.length, mode, operationsAvailable, resultEligible]);
  const visiblePhaseDefinitions = useMemo<WorkspacePhaseDefinition[]>(() => {
    const definitions = mode === "draft" ? draftWorkspacePhases : publishedWorkspacePhases;
    return definitions
      .map((phase) => ({ ...phase, items: phase.items.filter((item) => allowedWorkspaces.includes(item.value)) }))
      .filter((phase) => phase.items.length > 0);
  }, [allowedWorkspaces, mode]);
  const selectedSessionId = initialSessionId ?? workflow?.selectedSessionId ?? resultEligibleSessionIds[0] ?? liveEligibleSessionIds[0] ?? operationsInitial?.sessions[0]?.id ?? null;
  const projectedDefaultWorkspace = workflow?.defaultStep ? normalizeWorkspace(workflow.defaultStep) : null;
  const fallbackWorkspace = projectedDefaultWorkspace && allowedWorkspaces.includes(projectedDefaultWorkspace)
    ? projectedDefaultWorkspace
    : allowedWorkspaces[allowedWorkspaces.length - 1] ?? (mode === "draft" ? "basics" : "schedule");
  const workspace = allowedWorkspaces.includes(requestedWorkspace) ? requestedWorkspace : fallbackWorkspace;
  const activePhase = phaseForWorkspace(workspace);
  const lifecyclePhases = useMemo(() => lifecyclePhasesForMode(mode), [mode]);
  const activePhaseDefinition = visiblePhaseDefinitions.find((phase) => phase.value === activePhase);
  const routeNormalizationNotice = useMemo(() => {
    const raw = initialWorkspace.trim().toLowerCase();
    if (mode === "draft" && ["schedule", "delivery", "live", "operations", "attempts", "results"].includes(raw)) {
      return "Delivery, Operations, dan Results terbuka setelah Tryout diterbitkan. Anda dikembalikan ke langkah draf yang tersedia.";
    }
    if (mode === "draft" && requestedWorkspace !== workspace) {
      return "Langkah tersebut belum tersedia. Selesaikan langkah sebelumnya untuk membukanya.";
    }
    if (mode === "draft" && ["questions", "rules"].includes(raw)) {
      return "Link lama diarahkan ke Configure Sections agar pemilihan soal tetap berada dalam satu konteks.";
    }
    return null;
  }, [initialWorkspace, mode, requestedWorkspace, workspace]);

  const update = (subtest: SubjectCode, change: Partial<TestDraft>) => {
    setDirty(true);
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

  const toggleDirectQuestion = (question: SourceQuestion) => {
    const selectedInActiveSection = activeDirectQuestions.some((candidate) => candidate.sourceQuestionId === question.id);
    if (selectedInActiveSection) {
      update(activeCode, { directQuestions: activeDirectQuestions.filter((candidate) => candidate.sourceQuestionId !== question.id) });
      setError(null);
      return;
    }
    if (selectedSourceQuestionIds.includes(question.id)) {
      setError("Soal ini sudah dipilih di Section lain.");
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
      catItemCount: undefined,
      testType: "cbt",
    });
    setError(null);
  };

  const save = async (status: "draft" | "published" = "draft", redirectWorkspace: Workspace = status === "published" ? "schedule" : "basics"): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveTryoutAction({
        description: draft.description,
        id,
        sections: draft.sections.map((section) => ({
          catItemCount: section.testType === "cat" ? section.catItemCount : undefined,
          directQuestions: section.directQuestions?.map((question) => ({ sourceContentDigest: question.sourceContentDigest ?? "", sourceQuestionId: question.sourceQuestionId, sourceQuestionRevisionId: question.sourceQuestionRevisionId ?? "" })),
          durationMinutes: section.durationMinutes,
          instructions: section.instructions,
          packageVersionId: section.packageVersionId,
          scoringConfig: section.scoringConfig,
          shuffleItems: true,
          subtest: section.subtest,
          testType: section.testType,
        })),
        status,
        title: draft.title,
      });
      if (!result.ok) {
        setError(result.message);
        return false;
      }
      const nextDraft = normalize(result.result);
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
      setDirty(false);
      if (!id) {
        const nextUrl = new URL(`/mentor/tryout/${result.result.id}`, window.location.origin);
        if (redirectWorkspace !== "basics") nextUrl.searchParams.set("workspace", redirectWorkspace);
        window.location.assign(`${nextUrl.pathname}${nextUrl.search}`);
      }
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Tryout belum dapat disimpan. Coba lagi.");
      return false;
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
      window.location.assign(`/mentor/tryout/${result.result.id}?workspace=basics&parent=${encodeURIComponent(id)}`);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Tryout belum dapat disalin. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const commitWorkspaceChange = (nextWorkspace: Workspace) => {
    setRequestedWorkspace(nextWorkspace);
    const url = new URL(window.location.href);
    if (nextWorkspace === "basics") url.searchParams.delete("workspace");
    else url.searchParams.set("workspace", nextWorkspace);
    if (nextWorkspace !== "schedule") url.searchParams.delete("delivery");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const changeWorkspace = (value: string) => {
    const nextWorkspace = normalizeWorkspace(value);
    if (!allowedWorkspaces.includes(nextWorkspace)) {
      const fallback = allowedWorkspaces[allowedWorkspaces.length - 1] ?? (mode === "draft" ? "basics" : "schedule");
      setError(nextWorkspace === "results"
        ? "Results belum tersedia sampai ada sesi yang ditutup atau attempt terminal."
        : nextWorkspace === "live"
          ? "Live hanya tersedia untuk sesi aktif yang sudah memiliki AssessmentRelease."
          : "Selesaikan langkah sebelumnya terlebih dahulu untuk membuka area ini.");
      if (workspace !== fallback) commitWorkspaceChange(fallback);
      return;
    }
    if (nextWorkspace === workspace) return;
    if (dirty && mode === "draft") {
      setPendingWorkspace(nextWorkspace);
      setDirtyNavigationOpen(true);
      return;
    }
    commitWorkspaceChange(nextWorkspace);
  };

  const changeDeliveryArea = (nextArea: DeliveryArea) => {
    setDeliveryArea(nextArea);
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", workspaceForDeliveryArea());
    url.searchParams.set("delivery", nextArea);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const saveMetadata = async () => {
    if (!id) return;
    setMetadataSaving(true);
    setError(null);
    try {
      const result = await updateTryoutMetadataAction({ ...metadataDraft, id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const nextDraft = normalize(result.result);
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
      setMetadataDraft({ description: nextDraft.description, title: nextDraft.title });
      setMetadataOpen(false);
    } catch (metadataError) {
      setError(metadataError instanceof Error ? metadataError.message : "Detail Tryout belum dapat disimpan.");
    } finally {
      setMetadataSaving(false);
    }
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    const expectedWorkspace = workspace === "basics" ? null : workspace;
    const workspaceMatches = (url.searchParams.get("workspace") ?? null) === expectedWorkspace;
    if (workspaceMatches && (workspace === "schedule" || !url.searchParams.has("delivery"))) return;
    if (expectedWorkspace === null) url.searchParams.delete("workspace");
    else url.searchParams.set("workspace", expectedWorkspace);
    if (workspace !== "schedule") url.searchParams.delete("delivery");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [requestedWorkspace, workspace]);

  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location.href);
      const nextWorkspace = normalizeWorkspace(url.searchParams.get("workspace") ?? "basics");
      if (dirty && mode === "draft" && nextWorkspace !== workspace) {
        if (workspace === "basics") url.searchParams.delete("workspace");
        else url.searchParams.set("workspace", workspace);
        if (workspace !== "schedule") url.searchParams.delete("delivery");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        setPendingWorkspace(nextWorkspace);
        setPendingHref(null);
        setDirtyNavigationOpen(true);
        return;
      }
      setRequestedWorkspace(nextWorkspace);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [dirty, mode, workspace]);

  useEffect(() => {
    if (!dirty || mode !== "draft") return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, mode]);

  useEffect(() => {
    if (workspace !== "sections") return;
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
  }, [activeSection.subtest, sourceBankPage, sourceBankSearch, workspace]);

  useEffect(() => {
    if (workspace !== "sections" || !browseBankId) return;
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
  }, [activeSection.subtest, browseBankId, sourceQuestionPage, sourceQuestionSearch, workspace]);

  const goTo = (nextWorkspace: Workspace) => {
    changeWorkspace(nextWorkspace);
  };

  const guardExternalNavigation = (href: string, event: { preventDefault: () => void }) => {
    if (!dirty || mode !== "draft") return;
    event.preventDefault();
    setPendingWorkspace(null);
    setPendingHref(href);
    setDirtyNavigationOpen(true);
  };

  return (
    <div className="min-w-0 w-full px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3 pb-4">
        <Button aria-label="Kembali ke semua Tryout" nativeButton={false} onClick={(event) => guardExternalNavigation("/mentor/tryout", event)} render={<Link href="/mentor/tryout" />} size="icon" title="Kembali ke semua Tryout" variant="ghost">
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary-900">{id ? "Edit Tryout" : "Buat Tryout"}</h1>
      </div>

      {error ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm leading-6 text-danger-500" role="alert">
          <CircleAlert className="mt-1 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {routeNormalizationNotice ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl border border-primary-100 bg-primary-50/55 px-4 py-3 text-sm leading-6 text-secondary-700" role="status">
          <CircleHelp className="mt-1 size-4 shrink-0 text-primary-800" />
          {routeNormalizationNotice}
        </p>
      ) : null}
      {draft.locked ? (
        <section className="mt-5 flex items-start gap-3 rounded-2xl border border-secondary-900/10 bg-secondary-50 px-4 py-3 text-sm leading-6 text-secondary-700" role="status">
          <Lock className="mt-1 size-4 shrink-0" />
          <p><strong>Mode baca saja.</strong> Peserta sudah memulai Tryout ini; buat salinan untuk mengubah konfigurasi tanpa mengubah riwayat.</p>
        </section>
      ) : null}
      {initialParent && mode === "draft" ? (
        <section className="mt-5 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/55 px-4 py-3.5 text-sm leading-6 text-secondary-700" role="status">
          <div><p className="font-semibold text-secondary-900">Draf perubahan</p><p className="mt-1">Berdasarkan “{initialParent.title}”{initialParent.publishedAt ? ` · diterbitkan ${new Date(initialParent.publishedAt).toLocaleString("id-ID")}` : ""}. Perubahan di sini tidak memengaruhi versi terbit, sesi, atau hasil sebelumnya.</p></div>
          <Button nativeButton={false} onClick={(event) => guardExternalNavigation(`/mentor/tryout/${initialParent.id}?workspace=schedule`, event)} render={<Link href={`/mentor/tryout/${initialParent.id}?workspace=schedule`} />} size="sm" variant="brandOutline">Lihat versi terbit</Button>
        </section>
      ) : null}
      <Tabs
        className="mt-6 min-w-0"
        onValueChange={(value) => goTo(phaseStartWorkspace(value as WorkspacePhase, mode))}
        value={activePhase}
      >
        <FullWidthLineTabsList aria-label="Fase lifecycle Tryout">
          {lifecyclePhases.map((phase) => {
            const available = visiblePhaseDefinitions.some((definition) => definition.value === phase.value);
            return (
              <FullWidthLineTabsTrigger
                aria-label={available ? phase.label : `${phase.label} terkunci`}
                disabled={!available}
                key={phase.value}
                value={phase.value}
              >
                {phase.label}
                {!available ? <Lock aria-hidden="true" className="size-3.5" /> : null}
              </FullWidthLineTabsTrigger>
            );
          })}
        </FullWidthLineTabsList>
      </Tabs>

      <Tabs className="mt-4 min-w-0" onValueChange={changeWorkspace} value={workspace}>
        {activePhaseDefinition && activePhaseDefinition.items.length > 1 ? (
          <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FullWidthLineTabsList aria-label={`Subarea ${activePhaseDefinition.label}`} className="min-w-max xl:min-w-0">
              {activePhaseDefinition.items.map((item) => (
                <FullWidthLineTabsTrigger className="min-w-max" key={item.value} value={item.value}>
                  {item.label}
                </FullWidthLineTabsTrigger>
              ))}
            </FullWidthLineTabsList>
          </div>
        ) : null}

        <div className={activePhase === "build" ? "mt-5 grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start" : "mt-5"}>
          {activePhase === "build" ? (
            <SectionRail
              activeCode={activeCode}
              onSelect={changeActiveCode}
              readiness={sectionReadiness}
              sections={draft.sections}
            />
          ) : null}

        <div className="grid gap-3 lg:col-start-2">

        <TabsContent className="mt-0 lg:col-start-2" value="basics">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <h2 className="text-xl font-semibold text-secondary-900">Identitas Tryout</h2>
            <div className="grid gap-5">
              <Field>
                <FieldLabel htmlFor="tryout-title">Judul Tryout <RequiredMark /></FieldLabel>
                <FieldInput disabled={draft.locked} id="tryout-title" onChange={(event) => { setDirty(true); setDraft({ ...draft, title: event.target.value }); }} required value={draft.title} />
              </Field>
              <Field>
                <FieldLabel htmlFor="tryout-description">Deskripsi</FieldLabel>
                <FieldTextarea className="min-h-32 px-4 py-3 text-sm leading-6" disabled={draft.locked} id="tryout-description" onChange={(event) => { setDirty(true); setDraft({ ...draft, description: event.target.value }); }} placeholder="Contoh: Simulasi UTBK dengan tujuh subtest." value={draft.description} />
              </Field>
            </div>
          </section>
        </TabsContent>

        <TabsContent className="mt-0 lg:col-start-2" value="sections">
          <div className="grid gap-5">
            <section aria-labelledby="tryout-basic-info-title" className="grid gap-5 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
              <h2 className="text-xl font-semibold text-secondary-900" id="tryout-basic-info-title">Informasi dasar</h2>
              <div className="grid gap-5">
                <Field>
                  <FieldLabel htmlFor={`duration-${activeSection.subtest}`}>Durasi <RequiredMark /></FieldLabel>
                  <div className="relative">
                    <FieldInput className="pr-16" disabled={draft.locked} id={`duration-${activeSection.subtest}`} min="1" onChange={(event) => update(activeSection.subtest, { durationMinutes: Number(event.target.value) })} required type="number" value={activeSection.durationMinutes} />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-secondary-500">menit</span>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`instruction-${activeSection.subtest}`}>Instruksi peserta</FieldLabel>
                  <FieldTextarea className="min-h-32 bg-white" disabled={draft.locked} id={`instruction-${activeSection.subtest}`} onChange={(event) => update(activeSection.subtest, { instructions: event.target.value })} placeholder="Instruksi yang dibaca peserta sebelum Test dimulai." value={activeSection.instructions} />
                </Field>
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent className="mt-0 lg:col-start-2" value="sections">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <div aria-label="Sumber soal" className="grid gap-1" id="question-source-chooser">
              <h2 className="text-xl font-semibold text-secondary-900">Pilih bank soal</h2>
            </div>

            <div className="grid gap-5">
              <div className="grid gap-5">
                <div className="grid min-w-0 gap-4">
                  <Field>
                    <FieldLabel>Bank Soal untuk ditelusuri <RequiredMark /></FieldLabel>
                    <Popover>
                      <PopoverTrigger disabled={draft.locked} render={<Button aria-haspopup="listbox" className="w-full justify-between bg-white" variant="context" />}>
                        <span className="min-w-0 truncate">{activeBrowseBank?.title ?? "Pilih Bank Soal"}</span>
                        <ChevronDown />
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] gap-3">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
                          <FieldInput aria-label="Cari Bank Soal" className="h-10 rounded-xl py-2 pl-9 pr-3 text-sm" onChange={(event) => { setSourceBankSearch(event.target.value); setSourceBankPage(1); }} placeholder="Cari judul, folder, atau kategori…" value={sourceBankSearch} />
                        </div>
                        {sourceBankLoading ? <p className="px-2 text-xs text-secondary-500">Memuat Bank Soal…</p> : null}
                        <div aria-label="Bank Soal sumber" className="grid max-h-72 gap-1 overflow-y-auto" role="listbox">
                          {sourceBanks.length ? sourceBanks.map((bank) => <Button aria-selected={browseBankId === bank.id} className="h-auto justify-start rounded-xl px-3 py-2.5 text-left" key={bank.id} onClick={() => { setBrowseBankId(bank.id); setSourceQuestionPage(1); setSourceQuestionSearch(""); setSourceQuestions([]); }} role="option" variant={browseBankId === bank.id ? "contextSelected" : "ghost"}><span className="min-w-0"><span className="block truncate font-semibold">{bank.title}</span><span className="mt-0.5 block truncate text-xs font-normal text-secondary-500">{bank.questionCount} soal{bank.folderPath?.length ? ` · ${bank.folderPath.map((item) => item.name).join(" / ")}` : ""}</span></span>{browseBankId === bank.id ? <Check className="ml-auto shrink-0" /> : null}</Button>) : <div className="grid gap-3 px-3 py-5"><p className="text-sm text-secondary-500">Belum ada Bank Soal dengan soal Ready untuk {activeSection.subtest}.</p><Button className="w-fit" nativeButton={false} onClick={(event) => guardExternalNavigation("/mentor/quiz/question-bank", event)} render={<Link href="/mentor/quiz/question-bank" />} size="sm" variant="brand">Buka Bank Soal</Button></div>}
                        </div>
                        {sourceBankTotal > sourceBanks.length ? <Button className="w-full" disabled={sourceBankLoading} onClick={() => setSourceBankPage((page) => page + 1)} size="sm" variant="brandOutline">{sourceBankLoading ? "Memuat…" : "Muat Bank Soal lain"}</Button> : null}
                      </PopoverContent>
                    </Popover>
                  </Field>
                </div>
                <div className="min-w-0 rounded-2xl border border-primary-100 bg-white p-4">
                  <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" /><FieldInput aria-label="Cari soal Ready" className="h-10 rounded-xl py-2 pl-9 pr-3 text-sm" disabled={!browseBankId} onChange={(event) => { setSourceQuestionSearch(event.target.value); setSourceQuestionPage(1); }} placeholder={activeBrowseBank ? `Cari soal ${activeSection.subtest} di ${activeBrowseBank.title}…` : "Pilih Bank Soal terlebih dahulu"} value={sourceQuestionSearch} /></div>
                  {sourceQuestionLoading ? <p className="mt-3 text-xs text-secondary-500">Memuat soal Ready…</p> : null}
                  {activeSourceQuestions.length ? <div className="mt-4 grid gap-3">{activeSourceQuestions.map((question) => {
                    const selected = activeDirectQuestions.some((candidate) => candidate.sourceQuestionId === question.id);
                    const selectedInOtherSection = !selected && selectedSourceQuestionIds.includes(question.id);
                    const checkboxId = `source-question-${question.id}`;
                    return <article className={`rounded-2xl border p-3 ${selected ? "border-primary-300 bg-primary-50/35" : "border-primary-100"}`} key={question.id}><div className="flex items-start gap-3"><Checkbox aria-label={selected ? `Hapus pilihan ${question.prompt}` : `Pilih ${question.prompt}`} checked={selected} disabled={draft.locked || selectedInOtherSection} id={checkboxId} onCheckedChange={() => toggleDirectQuestion(question)} /><div className="min-w-0 flex-1"><label className="block cursor-pointer" htmlFor={checkboxId}><p className="text-xs font-semibold text-primary-800">{question.subjectCode} · {question.difficulty === "easy" ? "Mudah" : question.difficulty === "hard" ? "Sulit" : "Sedang"}</p><p className="mt-1 line-clamp-4 text-sm leading-6 text-secondary-900">{question.prompt}</p></label>{selected ? <Badge className="mt-2 rounded-full" size="ui" variant="mint">Terpilih</Badge> : selectedInOtherSection ? <p className="mt-2 text-xs font-semibold text-secondary-500">Dipilih di Section lain</p> : null}</div></div></article>;
                  })}</div> : <div className="mt-5 rounded-2xl border border-dashed border-primary-200 px-4 py-10 text-center text-sm leading-6 text-secondary-500">{browseBankId ? `Tidak ada soal ${activeSection.subtest} yang cocok di Bank Soal ini.` : "Pilih Bank Soal untuk mulai memilih."}</div>}
                  {browseBankId && sourceQuestionTotal > sourceQuestions.length ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4"><p className="text-xs text-secondary-500">Menampilkan {sourceQuestions.length} dari {sourceQuestionTotal} soal Ready.</p><Button disabled={sourceQuestionLoading} onClick={() => setSourceQuestionPage((page) => page + 1)} size="sm" variant="brandOutline"><ArrowDown />{sourceQuestionLoading ? "Memuat…" : "Muat soal lain"}</Button></div> : null}
                </div>
              </div>
            </div>
          </section>
        </TabsContent>

        </div>

        <TabsContent className="mt-0" value="schedule">
          {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : (
            <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
              <aside aria-labelledby="delivery-area-title" className="grid gap-3 rounded-3xl border border-primary-100 bg-[#f8fbf9] p-4 lg:sticky lg:top-5 lg:self-start">
                <h2 className="font-semibold text-secondary-900" id="delivery-area-title">Delivery</h2>
                <div aria-label="Area Delivery" className="grid gap-2" role="tablist">
                  {deliveryAreas.map((area) => {
                    const active = deliveryArea === area.value;
                    return (
                      <Button aria-current={active ? "page" : undefined} className={`h-12 w-full justify-start rounded-xl border px-3 text-left text-base font-bold transition-colors ${active ? "border-primary-200 bg-primary-50 text-primary-900 hover:bg-primary-100" : "border-transparent text-secondary-800 hover:bg-primary-50"}`} key={area.value} onClick={() => changeDeliveryArea(area.value)} role="tab" variant="ghost">
                        {area.label}
                      </Button>
                    );
                  })}
                </div>
              </aside>

              <div className="min-w-0">
                {deliveryArea === "policy" ? (
                  <section aria-labelledby="schedule-policy-title">
                    <div className="mb-4"><h2 id="schedule-policy-title" className="text-xl font-semibold text-secondary-900">Access rules</h2><p className="mt-1 text-sm leading-6 text-secondary-600">Atur cara peserta masuk dan kebijakan paket hasil sebelum membuat sesi.</p></div>
                    <KaptenTryoutPolicyPageModule embedded initial={operationsInitial} />
                  </section>
                ) : null}
                {deliveryArea === "sessions" ? (
                  <section aria-labelledby="schedule-sessions-title">
                    <div className="mb-4"><h2 id="schedule-sessions-title" className="text-xl font-semibold text-secondary-900">Sessions</h2><p className="mt-1 text-sm leading-6 text-secondary-600">Tentukan jendela waktu dan versi terbit yang dipakai peserta.</p></div>
                    <KaptenTryoutSessionsPageModule embedded initial={operationsInitial} />
                  </section>
                ) : null}
                {deliveryArea === "participants" ? (
                  <section aria-labelledby="schedule-participants-title">
                    <div className="mb-4"><h2 id="schedule-participants-title" className="text-xl font-semibold text-secondary-900">Participants</h2><p className="mt-1 text-sm leading-6 text-secondary-600">Kelola admission, undangan, dan penugasan sesi.</p></div>
                    <KaptenTryoutParticipantsPageModule embedded initial={operationsInitial} />
                  </section>
                ) : null}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent className="mt-0" value="live">
          {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : <KaptenTryoutLivePageModule initial={operationsInitial} selectedSessionId={selectedSessionId} />}
        </TabsContent>

        <TabsContent className="mt-0" value="attempts">
          {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : <KaptenTryoutAttemptsPageModule initial={operationsInitial} />}
        </TabsContent>

        <TabsContent className="mt-0" value="results">
          {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : <KaptenTryoutResultsPageModule initial={operationsInitial} selectedSessionId={selectedSessionId} />}
        </TabsContent>

        <TabsContent className="mt-0" value="review">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <h2 className="text-xl font-semibold text-secondary-900">Review &amp; Publish</h2>
            <dl className="grid gap-5">
              <div className="grid gap-1">
                <dt className="text-sm font-semibold text-secondary-600">Judul</dt>
                <dd className="text-lg font-semibold text-secondary-900">{draft.title || "Tanpa judul"}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-sm font-semibold text-secondary-600">Deskripsi</dt>
                <dd className="text-sm leading-6 text-secondary-700">{draft.description || "Belum ada deskripsi."}</dd>
              </div>
            </dl>
            <section className="grid gap-3" aria-labelledby="tryout-sections-summary-title">
              <h3 className="font-semibold text-secondary-900" id="tryout-sections-summary-title">Sections</h3>
              <div className="grid gap-2">
                {draft.sections.map((section, index) => (
                  <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-primary-100 px-4 py-3" key={section.subtest}>
                    <div>
                      <p className="font-semibold text-secondary-900">{index + 1}. {section.subtest}</p>
                      <p className="text-sm text-secondary-600">{subjectName(section.subtest)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-primary-800">{section.durationMinutes} menit</span>
                  </div>
                ))}
              </div>
            </section>
            <div className="flex justify-end">
              <Button disabled={saving || draft.locked} onClick={() => setPublishOpen(true)} variant="brand">{saving ? "Menerbitkan…" : "Terbitkan"}</Button>
            </div>
          </section>
        </TabsContent>
        </div>
      </Tabs>

      {mode === "draft" && workspace !== "review" ? (
        <footer className="sticky bottom-0 z-20 mt-5 flex flex-wrap items-center justify-end gap-3 bg-transparent px-0 py-4" aria-label="Tindakan langkah Tryout">
          <div className="flex flex-wrap justify-end gap-2">
            {draft.locked ? <Button disabled={saving} onClick={() => setDuplicateOpen(true)} variant="brand"><Copy />Buat draf perubahan</Button> : null}
            {!draft.locked && workspace === "basics" ? <Button className="bg-transparent text-primary-700 hover:bg-primary-50" disabled={saving || !draft.title.trim()} onClick={() => { void save("draft", "sections").then((ok) => { if (ok && id) commitWorkspaceChange("sections"); }); }} variant="brand">{saving ? "Menyimpan…" : "Selanjutnya"}</Button> : null}
            {!draft.locked && workspace === "sections" ? <Button className="bg-transparent text-primary-700 hover:bg-primary-50" disabled={saving || !configureReady} onClick={() => { void save("draft", "review").then((ok) => { if (ok && id) commitWorkspaceChange("review"); }); }} variant="brand">{saving ? "Menyimpan…" : "Selanjutnya"}</Button> : null}
          </div>
        </footer>
      ) : mode === "published" ? (
        <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-white px-4 py-3.5" aria-label="Tindakan versi terbit">
          <div className="min-w-0"><p className="font-semibold text-secondary-900">Versi terbit tidak dapat diubah strukturnya</p><p className="mt-1 text-sm leading-6 text-secondary-600">Edit detail hanya mengubah judul dan deskripsi. Perubahan Section atau sumber dibuat sebagai draf perubahan.</p></div>
          <div className="flex flex-wrap gap-2"><Button disabled={metadataSaving} onClick={() => { setMetadataDraft({ description: draft.description, title: draft.title }); setMetadataOpen(true); }} variant="brandOutline"><Pencil />Edit details</Button><Button disabled={saving} onClick={() => setDuplicateOpen(true)} variant="brand"><Copy />Buat draf perubahan</Button></div>
        </section>
      ) : null}

      <Dialog onOpenChange={(open) => { if (!metadataSaving) setMetadataOpen(open); }} open={metadataOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit details Tryout</DialogTitle>
            <DialogDescription>Perubahan ini hanya mengubah judul dan deskripsi. Section, sumber soal, AssessmentRelease, sesi, dan hasil tetap tidak berubah.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field><FieldLabel htmlFor="published-tryout-title">Judul Tryout <RequiredMark /></FieldLabel><FieldInput disabled={metadataSaving} id="published-tryout-title" onChange={(event) => setMetadataDraft((current) => ({ ...current, title: event.target.value }))} required value={metadataDraft.title} /></Field>
            <Field><FieldLabel htmlFor="published-tryout-description">Deskripsi</FieldLabel><FieldTextarea className="min-h-28 px-4 py-3 text-sm leading-6" disabled={metadataSaving} id="published-tryout-description" onChange={(event) => setMetadataDraft((current) => ({ ...current, description: event.target.value }))} value={metadataDraft.description} /></Field>
            <div className="flex flex-wrap justify-end gap-2 border-t border-primary-100 pt-4"><Button disabled={metadataSaving} onClick={() => setMetadataOpen(false)} variant="brandOutline">Batal</Button><Button disabled={metadataSaving || !metadataDraft.title.trim()} onClick={() => { void saveMetadata(); }} variant="brand">{metadataSaving ? "Menyimpan…" : "Simpan detail"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={(open) => { if (!saving) setPublishOpen(open); }} open={publishOpen}>
        <AlertDialogContent className="rounded-5xl" pending={saving} variant="warning">
          <AlertDialogHeader><AlertDialogTitle>Terbitkan Tryout?</AlertDialogTitle><AlertDialogDescription>Setelah tryout di-publish dan terdapat siswa mengerjakan, soal akan terkunci dan Anda tidak dapat mengubahnya kembali.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="grid gap-2 sm:grid-cols-2"><AlertDialogCancel className="w-full" disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction className="w-full" disabled={saving} onClick={() => { setPublishOpen(false); void save("published"); }} variant="brand">{saving ? "Menerbitkan…" : "Terbitkan"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={(open) => { if (!saving) setDuplicateOpen(open); }} open={duplicateOpen}>
        <AlertDialogContent className="rounded-5xl" pending={saving} variant="info">
          <AlertDialogHeader><AlertDialogTitle>Duplikasi Tryout?</AlertDialogTitle><AlertDialogDescription>Salinan akan dibuat sebagai draf yang dapat diedit. Riwayat peserta dan AssessmentRelease Tryout ini tetap tidak berubah.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => { setDuplicateOpen(false); void duplicate(); }} variant="brand"><Copy />{saving ? "Menyalin…" : "Buat salinan"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={(open) => { if (!saving) setDirtyNavigationOpen(open); }} open={dirtyNavigationOpen}>
        <AlertDialogContent className="!max-w-xl rounded-5xl gap-5" pending={saving} variant="warning">
          <AlertDialogHeader><AlertDialogTitle>Perubahan belum disimpan</AlertDialogTitle><AlertDialogDescription>Simpan perubahan sebelum berpindah langkah, atau buang perubahan lokal. Jika penyimpanan gagal, Anda tetap berada di langkah ini.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="!justify-stretch grid w-full gap-2">
            <AlertDialogCancel className="w-full" disabled={saving} onClick={() => { setPendingWorkspace(null); setPendingHref(null); setDirtyNavigationOpen(false); }}>Tetap di sini</AlertDialogCancel>
            <Button className="w-full" disabled={saving} onClick={() => { const target = pendingWorkspace; const href = pendingHref; setDraft(savedDraft); setDirty(false); setPendingWorkspace(null); setPendingHref(null); setDirtyNavigationOpen(false); if (target) commitWorkspaceChange(target); else if (href) window.location.assign(href); }} variant="brandOutline">Buang perubahan</Button>
            <AlertDialogAction className="w-full" disabled={saving || !draft.title.trim()} onClick={() => { const target = pendingWorkspace; const href = pendingHref; void save("draft").then((ok) => { if (ok && target) commitWorkspaceChange(target); else if (ok && href) window.location.assign(href); if (ok) { setPendingWorkspace(null); setPendingHref(null); setDirtyNavigationOpen(false); } }); }} variant="brand"><Save />Simpan dan lanjutkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { KaptenTryoutBuilderPageModule };

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
  FilePenLine,
  ImagePlus,
  Lock,
  Save,
  Search,
  Trash2,
} from "@/lib/icons";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { imageMediaMimeTypes } from "@/lib/media/domain";
import type { MediaAssetDto } from "@/lib/media/types";
import { formatTryoutDateTime } from "@/lib/tryout/time";

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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FullWidthLineTabsList,
  FullWidthLineTabsTrigger,
} from "@/components/ui/full-width-line-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import type { SessionContext } from "@/lib/auth/types";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import type { TryoutWorkflowProjection as CanonicalTryoutWorkflowProjection } from "@/lib/tryout/workflow-projection";
import { HelpFieldLabel } from "@/modules/mentor/KaptenTryoutOperationalShared";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import { MediaAssetPreview, MediaPickerDialog } from "@/modules/media/media-library";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { KaptenTryoutAttemptsPageModule } from "@/modules/mentor/KaptenTryoutAttemptsPageModule";
import { KaptenTryoutLivePageModule } from "@/modules/mentor/KaptenTryoutLivePageModule";
import { KaptenTryoutPolicyPageModule } from "@/modules/mentor/KaptenTryoutPolicyPageModule";
import { KaptenTryoutResultsPageModule } from "@/modules/mentor/KaptenTryoutResultsPageModule";
import { KaptenTryoutSessionsPageModule } from "@/modules/mentor/KaptenTryoutSessionsPageModule";
import { listQuestionBankSourcePageAction, listQuestionBankSourceQuestionsAction } from "@/modules/mentor/question-bank-actions";
import { duplicateTryoutAction, saveTryoutAction, unpublishTryoutAction, updateTryoutMetadataAction } from "@/modules/mentor/tryout-actions";

const subjectCodes = kaptenSubjects.map((subject) => subject.code) as Array<"PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM">;
type SubjectCode = (typeof subjectCodes)[number];
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
  bannerMediaId?: string | null;
  description: string;
  id: string;
  locked: boolean;
  sections: TestDraft[];
  status: "draft" | "published";
  title: string;
  updatedAt: number;
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
type WorkspacePhase = "overview" | "build" | "review_publish" | "delivery" | "live" | "attempts" | "results";
type WorkflowMode = "draft" | "published";

type WorkspacePhaseDefinition = {
  items: Array<{ label: string; value: Workspace }>;
  label: string;
  value: WorkspacePhase;
};

const draftWorkspacePhases: WorkspacePhaseDefinition[] = [
  {
    items: [{ label: "Overview", value: "basics" }],
    label: "Overview",
    value: "overview",
  },
  {
    items: [{ label: "Configure Sections", value: "sections" }],
    label: "Soal",
    value: "build",
  },
  {
    items: [{ label: "Review & Publish", value: "review" }],
    label: "Review & Publish",
    value: "review_publish",
  },
];

const publishedWorkspacePhases: WorkspacePhaseDefinition[] = [
  {
    items: [{ label: "Overview", value: "basics" }],
    label: "Overview",
    value: "overview",
  },
  {
    items: [{ label: "Policy · Sessions · Participants", value: "schedule" }],
    label: "Delivery",
    value: "delivery",
  },
  {
    items: [{ label: "Live", value: "live" }],
    label: "Live",
    value: "live",
  },
  {
    items: [{ label: "Attempts", value: "attempts" }],
    label: "Attempts",
    value: "attempts",
  },
  {
    items: [{ label: "Results & release", value: "results" }],
    label: "Results",
    value: "results",
  },
];

const lifecyclePhaseOrder: Array<{ label: string; value: WorkspacePhase }> = [
  { label: "Overview", value: "overview" },
  { label: "Soal", value: "build" },
  { label: "Review & Publish", value: "review_publish" },
  { label: "Delivery", value: "delivery" },
  { label: "Live", value: "live" },
  { label: "Attempts", value: "attempts" },
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
  if (value === "live") return "live";
  if (value === "attempts") return "attempts";
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

function unavailablePhaseReason(phase: WorkspacePhase) {
  if (phase === "build") return "Isi judul Tryout di Overview untuk membuka Soal.";
  if (phase === "review_publish") return "Lengkapi durasi dan soal di semua Section untuk membuka Review & Publish.";
  if (phase === "live") return "Live hanya tersedia untuk sesi aktif yang sudah memiliki AssessmentRelease.";
  if (phase === "results") return "Results belum tersedia sampai ada sesi yang ditutup atau attempt terminal.";
  return "Selesaikan langkah sebelumnya terlebih dahulu untuk membuka area ini.";
}

function RequiredMark() {
  return <><span aria-hidden="true" className="ml-1 text-danger-500">*</span><span className="sr-only"> wajib</span></>;
}

function WorkspaceUnavailable({ onSaveDraft }: { onSaveDraft: () => void }) {
  return (
    <ReferenceSurface as="section" className="grid min-h-56 place-items-center px-6 py-12 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
          <Save aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-secondary-900">Simpan perubahan untuk membuka area ini</h2>
        <p className="text-sm leading-6 text-secondary-600">Soal dan Review &amp; Publish bisa disiapkan sekarang. Delivery, Live, Attempts, dan Results akan tersambung setelah Tryout memiliki ID.</p>
        <Button onClick={onSaveDraft} variant="reference">Simpan perubahan</Button>
      </div>
    </ReferenceSurface>
  );
}

type SectionReadiness = {
  detail: string;
  issueCount: number;
  status: "attention" | "in_progress" | "ready" | "setup";
  target: Workspace;
};

function directQuestionsReady(questions: DirectQuestionDraft[]) {
  return Boolean(
    questions.length
      && questions.every((question) => Boolean(question.prompt?.trim()) && question.hasExplanation === true && question.hasReadyMedia !== false),
  );
}

function SourceBankList({
  activeSectionSubtest,
  browseBankId,
  disabled,
  guardExternalNavigation,
  onSelectBank,
  sourceBanks,
}: {
  activeSectionSubtest: SubjectCode;
  browseBankId: string;
  disabled: boolean;
  guardExternalNavigation: (href: string, event: { preventDefault: () => void }) => void;
  onSelectBank: (bankId: string) => void;
  sourceBanks: SourceBank[];
}) {
  if (!sourceBanks.length) {
    return (
      <div className="grid gap-3 px-3 py-5">
        <p className="text-sm text-secondary-500">Belum ada Bank Soal dengan soal Ready untuk {activeSectionSubtest}.</p>
        <Button className="w-fit" disabled={disabled} nativeButton={false} onClick={(event) => guardExternalNavigation("/mentor/quiz/question-bank", event)} render={<Link href="/mentor/quiz/question-bank" />} size="sm" variant="reference">Buka Bank Soal</Button>
      </div>
    );
  }
  return sourceBanks.map((bank) => (
    <Button
      aria-selected={browseBankId === bank.id}
      className="h-auto justify-start rounded-xl px-3 py-2.5 text-left"
      disabled={disabled}
      key={bank.id}
      onClick={() => onSelectBank(bank.id)}
      role="option"
      variant={browseBankId === bank.id ? "contextSelected" : "ghost"}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{bank.title}</span>
        <span className="mt-0.5 block truncate text-xs font-normal text-secondary-500">{bank.questionCount} soal{bank.folderPath?.length ? ` · ${bank.folderPath.map((item) => item.name).join(" / ")}` : ""}</span>
      </span>
      {browseBankId === bank.id ? <Check className="ml-auto shrink-0" /> : null}
    </Button>
  ));
}

function SectionRail({
  activeCode,
  disabled,
  onSelect,
  readiness,
  sections,
}: {
  activeCode: SubjectCode;
  disabled: boolean;
  onSelect: (subtest: SubjectCode) => void;
  readiness: Record<SubjectCode, SectionReadiness>;
  sections: TestDraft[];
}) {
  return (
    <ReferenceSurface as="aside" aria-labelledby="section-rail-title" className="grid gap-3 p-4 lg:sticky lg:top-5 lg:self-start">
      <div>
        <h2 className="font-semibold text-secondary-900" id="section-rail-title">Configure Sections</h2>
      </div>
      <ul aria-label="Tujuh Section Tryout" className="m-0 grid gap-2 list-none p-0">
        {sections.map((section) => {
          const active = section.subtest === activeCode;
          const incomplete = readiness[section.subtest]?.status !== "ready";
          return (
            <li key={section.subtest}>
              <Button
                aria-current={active ? "page" : undefined}
                aria-label={`${section.subtest}${incomplete ? " (belum lengkap)" : ""}`}
                className={`h-12 w-full justify-start rounded-xl px-3 text-left text-base font-bold transition-colors ${active ? "bg-primary-50 text-primary-800 shadow-[inset_0_-1px_0_rgba(1,76,56,0.08)] hover:bg-primary-50" : "text-secondary-800 hover:bg-primary-50/70"}`}
                disabled={disabled}
                onClick={() => onSelect(section.subtest)}
                variant="ghost"
              >
                <span>{section.subtest}</span>
                {incomplete ? <span aria-hidden="true" className="ml-auto size-2 rounded-full bg-voyage-warm-sun" /> : null}
              </Button>
            </li>
          );
        })}
      </ul>
    </ReferenceSurface>
  );
}

type BuilderState = {
  activeCode: SubjectCode;
  browseBankId: string;
  deliveryArea: DeliveryArea;
  dirty: boolean;
  dirtyNavigationOpen: boolean;
  draft: TryoutDraft;
  duplicateOpen: boolean;
  error: string | null;
  metadataSaving: boolean;
  publishOpen: boolean;
  requestedWorkspace: Workspace;
  saving: boolean;
  sourceBankLoading: boolean;
  sourceBankPage: number;
  sourceBankSearch: string;
  sourceBankTotal: number;
  sourceBanks: SourceBank[];
  sourceQuestionLoading: boolean;
  sourceQuestionPage: number;
  sourceQuestionSearch: string;
  sourceQuestionTotal: number;
  sourceQuestions: SourceQuestion[];
  unpublishOpen: boolean;
};

type BuilderAction =
  | { type: "setDraft"; draft: TryoutDraft }
  | { type: "updateSection"; change: Partial<TestDraft>; subtest: SubjectCode }
  | { type: "changeActiveCode"; code: SubjectCode }
  | { type: "setSourceBankSearch"; search: string }
  | { type: "setSourceBankPage"; page: number }
  | { type: "setSourceBankLoading"; loading: boolean }
  | { type: "setSourceBankResults"; banks: SourceBank[]; total: number }
  | { type: "setBrowseBankId"; bankId: string }
  | { type: "setSourceQuestionSearch"; search: string }
  | { type: "setSourceQuestionPage"; page: number }
  | { type: "setSourceQuestionLoading"; loading: boolean }
  | { type: "setSourceQuestionResults"; questions: SourceQuestion[]; total: number }
  | { type: "setRequestedWorkspace"; workspace: Workspace }
  | { type: "setDeliveryArea"; area: DeliveryArea }
  | { type: "setSaving"; saving: boolean }
  | { type: "setMetadataSaving"; saving: boolean }
  | { type: "setError"; error: string | null }
  | { type: "setDirty"; dirty: boolean }
  | { type: "setPublishOpen"; open: boolean }
  | { type: "setUnpublishOpen"; open: boolean }
  | { type: "setDuplicateOpen"; open: boolean }
  | { type: "setDirtyNavigationOpen"; open: boolean };

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "setDraft":
      return { ...state, draft: action.draft };
    case "updateSection":
      return {
        ...state,
        dirty: true,
        draft: {
          ...state.draft,
          sections: state.draft.sections.map((section) =>
            section.subtest === action.subtest ? { ...section, ...action.change } : section,
          ),
        },
      };
    case "changeActiveCode":
      return {
        ...state,
        activeCode: action.code,
        sourceBankPage: 1,
        sourceBankSearch: "",
        sourceQuestionPage: 1,
        sourceQuestionSearch: "",
        sourceQuestions: [],
      };
    case "setSourceBankSearch":
      return { ...state, sourceBankPage: 1, sourceBankSearch: action.search };
    case "setSourceBankPage":
      return { ...state, sourceBankPage: action.page };
    case "setSourceBankLoading":
      return { ...state, sourceBankLoading: action.loading };
    case "setSourceBankResults": {
      const nextBanks = state.sourceBankPage === 1
        ? action.banks
        : [...state.sourceBanks, ...action.banks].filter((bank, index, all) => all.findIndex((candidate) => candidate.id === bank.id) === index);
      const nextBrowseBankId = nextBanks.some((bank) => bank.id === state.browseBankId) ? state.browseBankId : nextBanks[0]?.id ?? "";
      return { ...state, browseBankId: nextBrowseBankId, sourceBankTotal: action.total, sourceBanks: nextBanks };
    }
    case "setBrowseBankId":
      return {
        ...state,
        browseBankId: action.bankId,
        sourceQuestionPage: 1,
        sourceQuestionSearch: "",
        sourceQuestions: [],
      };
    case "setSourceQuestionSearch":
      return { ...state, sourceQuestionPage: 1, sourceQuestionSearch: action.search };
    case "setSourceQuestionPage":
      return { ...state, sourceQuestionPage: action.page };
    case "setSourceQuestionLoading":
      return { ...state, sourceQuestionLoading: action.loading };
    case "setSourceQuestionResults": {
      const nextQuestions = state.sourceQuestionPage === 1
        ? action.questions
        : [...state.sourceQuestions, ...action.questions].filter((question, index, all) => all.findIndex((candidate) => candidate.id === question.id) === index);
      return { ...state, sourceQuestionTotal: action.total, sourceQuestions: nextQuestions };
    }
    case "setRequestedWorkspace":
      return { ...state, requestedWorkspace: action.workspace };
    case "setDeliveryArea":
      return { ...state, deliveryArea: action.area };
    case "setSaving":
      return { ...state, saving: action.saving };
    case "setMetadataSaving":
      return { ...state, metadataSaving: action.saving };
    case "setError":
      return { ...state, error: action.error };
    case "setDirty":
      return { ...state, dirty: action.dirty };
    case "setPublishOpen":
      return { ...state, publishOpen: action.open };
    case "setUnpublishOpen":
      return { ...state, unpublishOpen: action.open };
    case "setDuplicateOpen":
      return { ...state, duplicateOpen: action.open };
    case "setDirtyNavigationOpen":
      return { ...state, dirtyNavigationOpen: action.open };
    default:
      return state;
  }
}

function TryoutBannerField({
  bannerMediaId,
  disabled,
  onChange,
}: {
  bannerMediaId?: string | null;
  disabled: boolean;
  onChange: (bannerMediaId: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <Field>
      <HelpFieldLabel
        htmlFor="tryout-banner-choose"
        label="Banner Tryout"
        tooltip="Banner tampil di halaman dan kartu Tryout peserta. Gunakan gambar lanskap rasio 16:9, disarankan 1280×720. Tanpa banner, gambar bawaan tetap dipakai."
      />
      {bannerMediaId ? (
        <div className="grid gap-3">
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-primary-100 bg-primary-50 [&_img]:object-cover">
            <MediaAssetPreview alt="Preview banner Tryout" assetId={bannerMediaId} className="absolute inset-0 min-h-0 w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className={REFERENCE_CONTROL_CLASS_NAMES.file} disabled={disabled} id="tryout-banner-choose" onClick={() => setPickerOpen(true)} variant="reference">
              <ImagePlus />Ganti gambar
            </Button>
            <Button disabled={disabled} onClick={() => onChange(null)} size="sm" variant="ghost">
              <Trash2 />Hapus banner
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div aria-hidden="true" className="grid aspect-[16/9] place-items-center rounded-2xl border border-dashed border-primary-200 bg-primary-50/60 text-sm text-secondary-500">
            Belum ada banner — peserta melihat gambar bawaan.
          </div>
          <div>
            <Button className={REFERENCE_CONTROL_CLASS_NAMES.file} disabled={disabled} id="tryout-banner-choose" onClick={() => setPickerOpen(true)} variant="reference">
              <ImagePlus />Pilih gambar
            </Button>
          </div>
        </div>
      )}
      <MediaPickerDialog
        allowedMimeTypes={imageMediaMimeTypes}
        onOpenChange={setPickerOpen}
        onSelect={(asset: MediaAssetDto) => onChange(asset.id)}
        open={pickerOpen && !disabled}
        selectedAssetId={bannerMediaId ?? null}
        title="Pilih banner Tryout"
      />
    </Field>
  );
}

function TryoutBasicsTab({
  draft,
  metadataSaving,
  mode,
  onBannerChange,
  onDescriptionChange,
  onSaveMetadata,
  onTitleChange,
  saving,
}: {
  draft: TryoutDraft;
  metadataSaving: boolean;
  mode: WorkflowMode;
  onBannerChange: (bannerMediaId: string | null) => void;
  onDescriptionChange: (description: string) => void;
  onSaveMetadata: () => void;
  onTitleChange: (title: string) => void;
  saving: boolean;
}) {
  const identityDisabled = saving || (mode === "draft" && draft.locked);
  return (
    <TabsContent className="mt-0 w-full" value="basics">
      <ReferenceSurface as="section" className="grid w-full gap-6 p-5 sm:p-7">
        <h2 className="text-xl font-semibold text-secondary-900">Identitas Tryout</h2>
        <div className="grid gap-5">
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="tryout-title">Judul Tryout <RequiredMark /></FieldLabel>
            <FieldInput className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-12 text-base font-semibold`} disabled={identityDisabled} id="tryout-title" onChange={(event) => onTitleChange(event.target.value)} required value={draft.title} />
          </Field>
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="tryout-description">Deskripsi</FieldLabel>
            <FieldTextarea className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-32 text-sm leading-6`} disabled={identityDisabled} id="tryout-description" onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Contoh: Simulasi UTBK dengan tujuh subtest." value={draft.description} />
          </Field>
          <TryoutBannerField bannerMediaId={draft.bannerMediaId} disabled={identityDisabled} onChange={onBannerChange} />
        </div>
        {mode === "published" ? (
          <div className="flex justify-end pt-1">
            <Button disabled={metadataSaving || !draft.title.trim()} onClick={onSaveMetadata} variant="reference">
              {metadataSaving ? "Menyimpan…" : "Simpan perubahan"}
            </Button>
          </div>
        ) : null}
      </ReferenceSurface>
    </TabsContent>
  );
}

function TryoutSectionsTab({
  activeBrowseBank,
  activeDirectQuestions,
  activeSection,
  activeSourceQuestions,
  browseBankId,
  draft,
  guardExternalNavigation,
  onBankPageNext,
  onBankSearchChange,
  onQuestionPageNext,
  onQuestionSearchChange,
  onSelectBank,
  onToggleQuestion,
  onUpdateSection,
  selectedSourceQuestionIdsSet,
  sourceBankLoading,
  sourceBankSearch,
  sourceBankTotal,
  sourceBanks,
  sourceQuestionLoading,
  sourceQuestionSearch,
  sourceQuestionTotal,
  sourceQuestions,
  saving,
}: {
  activeBrowseBank?: SourceBank;
  activeDirectQuestions: DirectQuestionDraft[];
  activeSection: TestDraft;
  activeSourceQuestions: SourceQuestion[];
  browseBankId: string;
  draft: TryoutDraft;
  guardExternalNavigation: (href: string, event: { preventDefault: () => void }) => void;
  onBankPageNext: () => void;
  onBankSearchChange: (search: string) => void;
  onQuestionPageNext: () => void;
  onQuestionSearchChange: (search: string) => void;
  onSelectBank: (bankId: string) => void;
  onToggleQuestion: (question: SourceQuestion) => void;
  onUpdateSection: (change: Partial<TestDraft>) => void;
  selectedSourceQuestionIdsSet: Set<string>;
  sourceBankLoading: boolean;
  sourceBankSearch: string;
  sourceBankTotal: number;
  sourceBanks: SourceBank[];
  sourceQuestionLoading: boolean;
  sourceQuestionSearch: string;
  sourceQuestionTotal: number;
  sourceQuestions: SourceQuestion[];
  saving: boolean;
}) {
  return (
    <>
      <TabsContent className="mt-0 min-w-0 w-full lg:col-start-2" value="sections">
        <div className="grid gap-5">
          <ReferenceSurface as="section" aria-labelledby="tryout-basic-info-title" className="grid gap-5 p-5 sm:p-7">
            <h2 className="text-xl font-semibold text-secondary-900" id="tryout-basic-info-title">Informasi dasar</h2>
            <div className="grid gap-5">
              <Field>
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`duration-${activeSection.subtest}`}>Durasi <RequiredMark /></FieldLabel>
                <div className="relative">
                  <FieldInput className={`${REFERENCE_CONTROL_CLASS_NAMES.input} pr-16`} disabled={saving || draft.locked} id={`duration-${activeSection.subtest}`} min="1" onChange={(event) => onUpdateSection({ durationMinutes: Number(event.target.value) })} required type="number" value={activeSection.durationMinutes} />
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-secondary-500">menit</span>
                </div>
              </Field>
              <Field>
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`instruction-${activeSection.subtest}`}>Instruksi peserta</FieldLabel>
                <FieldTextarea className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-32`} disabled={saving || draft.locked} id={`instruction-${activeSection.subtest}`} onChange={(event) => onUpdateSection({ instructions: event.target.value })} placeholder="Instruksi yang dibaca peserta sebelum Test dimulai." value={activeSection.instructions} />
              </Field>
            </div>
          </ReferenceSurface>
        </div>
      </TabsContent>

      <TabsContent className="mt-0 min-w-0 w-full lg:col-start-2" value="sections">
        <ReferenceSurface as="section" className="grid gap-6 p-5 sm:p-7">
          <div aria-label="Sumber soal" className="grid gap-1" id="question-source-chooser">
            <h2 className="text-2xl font-bold tracking-tight text-secondary-900">Pilih bank soal</h2>
          </div>

          <div className="grid gap-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.34fr)_minmax(0,0.66fr)] lg:items-start">
              <ReferenceSurface className="grid min-w-0 gap-4 p-4" variant="inset">
                <Field>
                  <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Bank Soal untuk ditelusuri <RequiredMark /></FieldLabel>
                  <Popover>
                    <PopoverTrigger disabled={saving || draft.locked} render={<Button aria-haspopup="listbox" className={`${REFERENCE_CONTROL_CLASS_NAMES.select} w-full`} variant="reference" />}>
                      <span className="min-w-0 truncate">{activeBrowseBank?.title ?? "Pilih Bank Soal"}</span>
                      <ChevronDown />
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] gap-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
                        <FieldInput aria-label="Cari Bank Soal" className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 rounded-xl py-2 pl-9 pr-3 text-sm`} disabled={saving} onChange={(event) => onBankSearchChange(event.target.value)} placeholder="Cari judul, folder, atau kategori…" value={sourceBankSearch} />
                      </div>
                      {sourceBankLoading ? <p className="px-2 text-xs text-secondary-500">Memuat Bank Soal…</p> : null}
                      <div aria-label="Bank Soal sumber" className="grid max-h-72 gap-1 overflow-y-auto" role="listbox">
                        <SourceBankList
                          activeSectionSubtest={activeSection.subtest}
                          browseBankId={browseBankId}
                          disabled={saving}
                          guardExternalNavigation={guardExternalNavigation}
                          onSelectBank={onSelectBank}
                          sourceBanks={sourceBanks}
                        />
                      </div>
                      {sourceBankTotal > sourceBanks.length ? <Button className="w-full" disabled={saving || sourceBankLoading} onClick={onBankPageNext} size="sm" variant="reference">{sourceBankLoading ? "Memuat…" : "Muat Bank Soal lain"}</Button> : null}
                    </PopoverContent>
                  </Popover>
                </Field>
              </ReferenceSurface>
              <ReferenceSurface className="min-w-0 p-5">
                <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" /><FieldInput aria-label="Cari soal Ready" className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-11 rounded-xl py-2 pl-9 pr-3 text-sm`} disabled={saving || !browseBankId} onChange={(event) => onQuestionSearchChange(event.target.value)} placeholder={activeBrowseBank ? `Cari soal ${activeSection.subtest} di ${activeBrowseBank.title}…` : "Pilih Bank Soal terlebih dahulu"} value={sourceQuestionSearch} /></div>
                {sourceQuestionLoading ? <p className="mt-3 text-xs text-secondary-500">Memuat soal Ready…</p> : null}
                {activeSourceQuestions.length ? <div className="mt-4 grid gap-3">{activeSourceQuestions.map((question) => {
                  const selected = activeDirectQuestions.some((candidate) => candidate.sourceQuestionId === question.id);
                  const selectedInOtherSection = !selected && selectedSourceQuestionIdsSet.has(question.id);
                  const checkboxId = `source-question-${question.id}`;
                  return <article className={`rounded-2xl border p-3 transition-colors ${selected ? "border-primary-200 bg-white shadow-[0_12px_24px_-20px_rgba(23,107,77,0.7)]" : "border-primary-100 bg-primary-50/45 hover:border-primary-200 hover:bg-primary-50/70"}`} key={question.id}><div className="flex items-start gap-3"><Checkbox aria-label={selected ? `Hapus pilihan ${question.prompt}` : `Pilih ${question.prompt}`} checked={selected} disabled={saving || draft.locked || selectedInOtherSection} id={checkboxId} onCheckedChange={() => onToggleQuestion(question)} /><div className="min-w-0 flex-1"><label className="block cursor-pointer" htmlFor={checkboxId}><p className="text-xs font-semibold text-primary-800">{question.subjectCode} · {question.difficulty === "easy" ? "Mudah" : question.difficulty === "hard" ? "Sulit" : "Sedang"}</p><p className="mt-1 line-clamp-4 text-sm leading-6 text-secondary-900">{question.prompt}</p></label>{selectedInOtherSection ? <p className="mt-2 text-xs font-semibold text-secondary-500">Dipilih di Section lain</p> : null}</div></div></article>;
                })}</div> : <ReferenceSurface className="mt-5 px-4 py-10 text-center text-sm leading-6 text-secondary-500" variant="inset">{browseBankId ? `Tidak ada soal ${activeSection.subtest} yang cocok di Bank Soal ini.` : "Pilih Bank Soal untuk mulai memilih."}</ReferenceSurface>}
                {browseBankId && sourceQuestionTotal > sourceQuestions.length ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-1"><p className="text-xs text-secondary-500">Menampilkan {sourceQuestions.length} dari {sourceQuestionTotal} soal Ready.</p><Button disabled={saving || sourceQuestionLoading} onClick={onQuestionPageNext} size="sm" variant="reference"><ArrowDown />{sourceQuestionLoading ? "Memuat…" : "Muat soal lain"}</Button></div> : null}
              </ReferenceSurface>
            </div>
          </div>
        </ReferenceSurface>
      </TabsContent>
    </>
  );
}

function TryoutReviewTab({
  draft,
  onPublishClick,
  saving,
  setPublishOpen,
}: {
  draft: TryoutDraft;
  onPublishClick: () => void;
  saving: boolean;
  setPublishOpen: (open: boolean) => void;
}) {
  return (
    <TabsContent className="mt-0 min-w-0 w-full" value="review">
      <ReferenceSurface as="section" className="grid gap-6 p-5 sm:p-7">
        <h2 className="text-2xl font-bold tracking-tight text-secondary-900">Review &amp; Publish</h2>
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
        <section aria-labelledby="tryout-sections-summary-title" className="grid gap-3">
          <h3 className="font-semibold text-secondary-900" id="tryout-sections-summary-title">Sections</h3>
          <div className="grid gap-2">
            {draft.sections.map((section, index) => (
              <ReferenceSurface className="flex w-full items-center justify-between gap-3 px-4 py-3" key={section.subtest} variant="inset">
                <div>
                  <p className="font-semibold text-secondary-900">{index + 1}. {section.subtest}</p>
                  <p className="text-sm text-secondary-600">{subjectName(section.subtest)}</p>
                </div>
                <MentorBadge className="shrink-0 font-bold" size="sm" tone="category">{section.durationMinutes} menit</MentorBadge>
              </ReferenceSurface>
            ))}
          </div>
        </section>
        <div className="flex justify-end">
          <Button disabled={saving || draft.locked} onClick={() => setPublishOpen(true)} variant="reference">{saving ? "Menerbitkan…" : "Terbitkan"}</Button>
        </div>
      </ReferenceSurface>
    </TabsContent>
  );
}

function TryoutLifecycleModals({
  dirtyNavigationOpen,
  draft,
  duplicateOpen,
  hasActiveAttempt,
  onCancelDirtyNavigation,
  onConfirmDiscard,
  onConfirmDuplicate,
  onConfirmPublish,
  onConfirmSaveDirty,
  onConfirmUnpublish,
  onOpenChangeDirtyNavigation,
  onOpenChangeDuplicate,
  onOpenChangePublish,
  onOpenChangeUnpublish,
  publishOpen,
  saving,
  unpublishOpen,
}: {
  dirtyNavigationOpen: boolean;
  draft: TryoutDraft;
  duplicateOpen: boolean;
  hasActiveAttempt: boolean;
  onCancelDirtyNavigation: () => void;
  onConfirmDiscard: () => void;
  onConfirmDuplicate: () => void;
  onConfirmPublish: () => void;
  onConfirmSaveDirty: () => void;
  onConfirmUnpublish: () => void;
  onOpenChangeDirtyNavigation: (open: boolean) => void;
  onOpenChangeDuplicate: (open: boolean) => void;
  onOpenChangePublish: (open: boolean) => void;
  onOpenChangeUnpublish: (open: boolean) => void;
  publishOpen: boolean;
  saving: boolean;
  unpublishOpen: boolean;
}) {
  return (
    <>
      <AlertDialog onOpenChange={onOpenChangePublish} open={publishOpen}>
        <AlertDialogContent className="rounded-5xl" pending={saving} variant="warning">
          <AlertDialogHeader><AlertDialogTitle>Terbitkan Tryout?</AlertDialogTitle><AlertDialogDescription>Setelah tryout di-publish dan terdapat siswa mengerjakan, soal akan terkunci dan Anda tidak dapat mengubahnya kembali.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="grid gap-2 sm:grid-cols-2"><AlertDialogCancel className="w-full" disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction className="w-full" disabled={saving} onClick={onConfirmPublish} variant="brand">{saving ? "Menerbitkan…" : "Terbitkan"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={onOpenChangeUnpublish} open={unpublishOpen}>
        <AlertDialogContent className="rounded-5xl" pending={saving} variant="warning">
          <AlertDialogHeader><AlertDialogTitle>Jadikan Tryout draf?</AlertDialogTitle><AlertDialogDescription>Tryout tidak lagi tersedia untuk pendaftaran baru. Riwayat peserta dan AssessmentRelease tetap tersimpan. Perintah ini hanya dapat dilakukan saat tidak ada peserta yang sedang mengerjakan.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving || hasActiveAttempt} onClick={onConfirmUnpublish} variant="brand">{saving ? "Memproses…" : "Jadikan draf"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={onOpenChangeDuplicate} open={duplicateOpen}>
        <AlertDialogContent className="rounded-5xl" pending={saving} variant="info">
          <AlertDialogHeader><AlertDialogTitle>Duplikasi Tryout?</AlertDialogTitle><AlertDialogDescription>Salinan akan dibuat sebagai draf yang dapat diedit. Riwayat peserta dan AssessmentRelease Tryout ini tetap tidak berubah.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={onConfirmDuplicate} variant="brand"><Copy />{saving ? "Menyalin…" : "Buat salinan"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={onOpenChangeDirtyNavigation} open={dirtyNavigationOpen}>
        <AlertDialogContent className="!max-w-xl rounded-5xl gap-5" pending={saving} variant="warning">
          <AlertDialogHeader><AlertDialogTitle>Perubahan belum disimpan</AlertDialogTitle><AlertDialogDescription>Simpan perubahan sebelum meninggalkan halaman, atau buang perubahan lokal. Jika penyimpanan gagal, Anda tetap berada di sini.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="!justify-stretch grid w-full gap-2">
            <AlertDialogCancel className="w-full" disabled={saving} onClick={onCancelDirtyNavigation}>Tetap di sini</AlertDialogCancel>
            <Button className="w-full" disabled={saving} onClick={onConfirmDiscard} variant="brandOutline">Buang perubahan</Button>
            <AlertDialogAction className="w-full" disabled={saving || !draft.title.trim()} onClick={onConfirmSaveDirty} variant="brand"><Save />Simpan dan lanjutkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function useTryoutBuilderState({
  id,
  initialDeliveryArea,
  initialDraft,
  initialParent,
  initialSessionId,
  initialSourceBankTotal,
  initialSourceBanks,
  initialWorkspace = "basics",
  operationsInitial,
}: {
  id?: string;
  initialDeliveryArea?: string;
  initialDraft?: TryoutDraft | null;
  initialParent?: { id: string; publishedAt?: string; title: string };
  initialSessionId?: string;
  initialSourceBankTotal?: number;
  initialSourceBanks: SourceBank[];
  initialWorkspace?: string;
  operationsInitial?: TryoutOperationsView & { workflow?: CanonicalTryoutWorkflowProjection };
}) {
  const initialFormDraft = useMemo<TryoutDraft>(() => normalize(initialDraft ?? {
    bannerMediaId: null,
    description: "",
    id: id ?? "baru",
    locked: false,
    sections: defaultSections(),
    status: "draft",
    title: "Draft Tryout Baru",
    updatedAt: 0,
  }), [id, initialDraft]);

  const [state, dispatch] = useReducer(builderReducer, undefined, () => ({
    activeCode: initialFormDraft.sections.find((section) => !section.directQuestions?.length)?.subtest ?? "PU",
    browseBankId: initialSourceBanks[0]?.id ?? "",
    deliveryArea: deliveryAreaFor(initialDeliveryArea),
    dirty: !id,
    dirtyNavigationOpen: false,
    draft: initialFormDraft,
    duplicateOpen: false,
    error: null,
    metadataSaving: false,
    publishOpen: false,
    requestedWorkspace: normalizeWorkspace(initialWorkspace),
    saving: false,
    sourceBankLoading: false,
    sourceBankPage: 1,
    sourceBankSearch: "",
    sourceBankTotal: initialSourceBankTotal ?? initialSourceBanks.length,
    sourceBanks: initialSourceBanks,
    sourceQuestionLoading: false,
    sourceQuestionPage: 1,
    sourceQuestionSearch: "",
    sourceQuestionTotal: 0,
    sourceQuestions: [],
    unpublishOpen: false,
  }));

  const {
    activeCode,
    browseBankId,
    deliveryArea,
    dirty,
    dirtyNavigationOpen,
    draft,
    duplicateOpen,
    error,
    metadataSaving,
    publishOpen,
    requestedWorkspace,
    saving,
    sourceBankLoading,
    sourceBankPage,
    sourceBankSearch,
    sourceBankTotal,
    sourceBanks,
    sourceQuestionLoading,
    sourceQuestionPage,
    sourceQuestionSearch,
    sourceQuestionTotal,
    sourceQuestions,
    unpublishOpen,
  } = state;

  const savedDraftRef = useRef<TryoutDraft>(initialFormDraft);
  const latestDraftRef = useRef<TryoutDraft>(initialFormDraft);
  const draftWorkspaceSaveInFlightRef = useRef(false);
  const pendingDraftWorkspaceRef = useRef<Workspace | null>(null);
  const pendingWorkspaceRef = useRef<Workspace | null>(null);
  const pendingHrefRef = useRef<string | null>(null);

  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  const selectedSessionId = useMemo(() => {
    return initialSessionId
      ?? operationsInitial?.sessions.find((candidate) => candidate.status === "active")?.id
      ?? operationsInitial?.sessions[0]?.id
      ?? "";
  }, [initialSessionId, operationsInitial?.sessions]);

  const hasActiveAttempt = useMemo(() => {
    return Boolean(operationsInitial?.sessions.some((candidate) =>
      candidate.attempts.some((attempt) => attempt.attemptState === "in_progress"),
    ));
  }, [operationsInitial?.sessions]);

  const mode: WorkflowMode = draft.status === "published" ? "published" : "draft";
  const activeSection = draft.sections.find((section) => section.subtest === activeCode) ?? draft.sections[0]!;
  const activeDirectQuestions = activeSection.directQuestions ?? [];
  const selectedSourceQuestionIdsSet = useMemo(() => {
    const ids = new Set<string>();
    draft.sections.forEach((section) => {
      section.directQuestions?.forEach((question) => ids.add(question.sourceQuestionId));
    });
    return ids;
  }, [draft.sections]);

  const sectionReadiness = useMemo(() => {
    return draft.sections.reduce<Record<SubjectCode, SectionReadiness>>((acc, section) => {
      const questions = section.directQuestions ?? [];
      const hasDirectQuestions = Boolean(questions.length);
      const isReady = directQuestionsReady(questions);
      acc[section.subtest] = {
        detail: isReady ? `${questions.length} soal ready` : hasDirectQuestions ? `${questions.length} soal (cek kelengkapan)` : "Belum ada soal",
        issueCount: isReady ? 0 : 1,
        status: isReady ? "ready" : hasDirectQuestions ? "in_progress" : "setup",
        target: "sections",
      };
      return acc;
    }, {} as Record<SubjectCode, SectionReadiness>);
  }, [draft.sections]);

  const configureReady = useMemo(() => {
    return draft.sections.every((section) => sectionReadiness[section.subtest]?.status === "ready");
  }, [draft.sections, sectionReadiness]);

  const activeBrowseBank = sourceBanks.find((bank) => bank.id === browseBankId);
  const activeSourceQuestions = sourceQuestions.filter((question) => question.bankId === browseBankId && question.subjectCode === activeSection.subtest);

  const allowedWorkspaces = useMemo(() => {
    if (mode === "published") return ["basics", "schedule", "live", "attempts", "results"] as Workspace[];
    const allowed: Workspace[] = ["basics", "schedule"];
    if (draft.title.trim()) allowed.push("sections");
    if (configureReady) allowed.push("review");
    return allowed;
  }, [configureReady, draft.title, mode]);

  const workspace = allowedWorkspaces.includes(requestedWorkspace)
    ? requestedWorkspace
    : allowedWorkspaces[allowedWorkspaces.length - 1] ?? (mode === "draft" ? "basics" : "schedule");
  const activePhase = phaseForWorkspace(workspace);

  const visiblePhaseDefinitions = useMemo(() => {
    const allowedSet = new Set(allowedWorkspaces);
    return (mode === "draft" ? draftWorkspacePhases : publishedWorkspacePhases).filter((phase) =>
      phase.items.some((item) => allowedSet.has(item.value)),
    );
  }, [allowedWorkspaces, mode]);

  const lifecyclePhases = useMemo(() => lifecyclePhasesForMode(mode), [mode]);
  const activePhaseDefinition = (mode === "draft" ? draftWorkspacePhases : publishedWorkspacePhases).find((item) => item.value === activePhase);

  const routeNormalizationNotice = useMemo(() => {
    if (!initialWorkspace) return null;
    const requested = normalizeWorkspace(initialWorkspace);
    if (requestedWorkspace !== workspace && requested === requestedWorkspace) {
      if (mode === "draft" && requested === "review") return "Selesaikan konfigurasi Soal untuk membuka Review & Publish.";
      if (mode === "draft" && requested === "sections") return "Isi judul Tryout terlebih dahulu untuk membuka Soal.";
      return "Area yang diminta belum siap dibuka. Kami mengarahkan ke langkah yang sedang aktif.";
    }
    return null;
  }, [initialWorkspace, mode, requestedWorkspace, workspace]);

  const update = (subtest: SubjectCode, change: Partial<TestDraft>) => {
    dispatch({ change, subtest, type: "updateSection" });
  };

  const changeActiveCode = (nextCode: SubjectCode) => {
    dispatch({ code: nextCode, type: "changeActiveCode" });
  };

  const toggleDirectQuestion = (question: SourceQuestion) => {
    const selectedInActiveSection = activeDirectQuestions.some((candidate) => candidate.sourceQuestionId === question.id);
    if (selectedInActiveSection) {
      update(activeCode, { directQuestions: activeDirectQuestions.filter((candidate) => candidate.sourceQuestionId !== question.id) });
      dispatch({ error: null, type: "setError" });
      return;
    }
    if (selectedSourceQuestionIdsSet.has(question.id)) {
      dispatch({ error: "Soal ini sudah dipilih di Section lain.", type: "setError" });
      return;
    }
    const bank = sourceBanks.find((candidate) => candidate.id === question.bankId);
    update(activeCode, {
      catItemCount: undefined,
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
      testType: "cbt",
    });
    dispatch({ error: null, type: "setError" });
  };

  const save = async (status: "draft" | "published" = "draft", redirectWorkspace: Workspace = status === "published" ? "schedule" : "basics"): Promise<boolean> => {
    const draftToSave = latestDraftRef.current;
    dispatch({ saving: true, type: "setSaving" });
    dispatch({ error: null, type: "setError" });
    try {
      const result = await saveTryoutAction({
        bannerMediaId: draftToSave.bannerMediaId ?? null,
        description: draftToSave.description,
        id,
        sections: draftToSave.sections.map((section) => ({
          catItemCount: section.testType === "cat" ? section.catItemCount : undefined,
          directQuestions: section.directQuestions?.map((question) => ({ sourceContentDigest: question.sourceContentDigest ?? "", sourceQuestionId: question.sourceQuestionId, sourceQuestionRevisionId: question.sourceQuestionRevisionId ?? "" })),
          durationMinutes: section.durationMinutes,
          instructions: section.instructions,
          scoringConfig: section.scoringConfig,
          shuffleItems: true,
          subtest: section.subtest,
          testType: section.testType,
        })),
        status,
        title: draftToSave.title,
      });
      if (!result.ok) {
        dispatch({ error: result.message, type: "setError" });
        return false;
      }
      const nextDraft = normalize(result.result);
      savedDraftRef.current = nextDraft;
      if (latestDraftRef.current === draftToSave) {
        latestDraftRef.current = nextDraft;
        dispatch({ draft: nextDraft, type: "setDraft" });
        dispatch({ dirty: false, type: "setDirty" });
      }
      if (!id) {
        const nextUrl = new URL(`/mentor/tryout/${result.result.id}`, window.location.origin);
        if (redirectWorkspace !== "basics") nextUrl.searchParams.set("workspace", redirectWorkspace);
        window.location.assign(`${nextUrl.pathname}${nextUrl.search}`);
      }
      return true;
    } catch (saveError) {
      dispatch({ error: saveError instanceof Error ? saveError.message : "Tryout belum dapat disimpan. Coba lagi.", type: "setError" });
      return false;
    } finally {
      dispatch({ saving: false, type: "setSaving" });
    }
  };

  const duplicate = async () => {
    if (!id) return;
    dispatch({ saving: true, type: "setSaving" });
    dispatch({ error: null, type: "setError" });
    try {
      const result = await duplicateTryoutAction(id);
      if (!result.ok) {
        dispatch({ error: result.message, type: "setError" });
        return;
      }
      window.location.assign(`/mentor/tryout/${result.result.id}?workspace=basics&parent=${encodeURIComponent(id)}`);
    } catch (duplicateError) {
      dispatch({ error: duplicateError instanceof Error ? duplicateError.message : "Tryout belum dapat disalin. Coba lagi.", type: "setError" });
    } finally {
      dispatch({ saving: false, type: "setSaving" });
    }
  };

  const unpublish = async () => {
    if (!id) return;
    dispatch({ saving: true, type: "setSaving" });
    dispatch({ error: null, type: "setError" });
    try {
      const result = await unpublishTryoutAction(id);
      if (!result.ok) {
        dispatch({ error: result.message, type: "setError" });
        return;
      }
      window.location.assign(`/mentor/tryout/${id}`);
    } catch (unpublishError) {
      dispatch({ error: unpublishError instanceof Error ? unpublishError.message : "Tryout belum dapat dikembalikan ke draf. Coba lagi.", type: "setError" });
    } finally {
      dispatch({ saving: false, type: "setSaving" });
    }
  };

  const commitWorkspaceChange = (nextWorkspace: Workspace) => {
    dispatch({ type: "setRequestedWorkspace", workspace: nextWorkspace });
    const url = new URL(window.location.href);
    if (nextWorkspace === "basics") url.searchParams.delete("workspace");
    else url.searchParams.set("workspace", nextWorkspace);
    if (nextWorkspace !== "schedule") url.searchParams.delete("delivery");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const saveBeforeDraftWorkspaceChange = (nextWorkspace: Workspace) => {
    if (draftWorkspaceSaveInFlightRef.current) {
      pendingDraftWorkspaceRef.current = nextWorkspace;
      return;
    }
    if (saving) return;
    pendingDraftWorkspaceRef.current = null;
    draftWorkspaceSaveInFlightRef.current = true;
    void save("draft", nextWorkspace).then((ok) => {
      if (ok && id) commitWorkspaceChange(pendingDraftWorkspaceRef.current ?? nextWorkspace);
    }).finally(() => {
      pendingDraftWorkspaceRef.current = null;
      draftWorkspaceSaveInFlightRef.current = false;
    });
  };

  const changeWorkspace = (value: string) => {
    const nextWorkspace = normalizeWorkspace(value);
    if (!allowedWorkspaces.includes(nextWorkspace)) {
      const fallback = allowedWorkspaces[allowedWorkspaces.length - 1] ?? (mode === "draft" ? "basics" : "schedule");
      dispatch({
        error: nextWorkspace === "results"
          ? "Results belum tersedia sampai ada sesi yang ditutup atau attempt terminal."
          : nextWorkspace === "live"
            ? "Live hanya tersedia untuk sesi aktif yang sudah memiliki AssessmentRelease."
            : "Selesaikan langkah sebelumnya terlebih dahulu untuk membuka area ini.",
        type: "setError",
      });
      if (workspace !== fallback) commitWorkspaceChange(fallback);
      return;
    }
    if (nextWorkspace === workspace) return;
    if (dirty && mode === "draft") {
      saveBeforeDraftWorkspaceChange(nextWorkspace);
      return;
    }
    commitWorkspaceChange(nextWorkspace);
  };

  const changeDeliveryArea = (nextArea: DeliveryArea) => {
    dispatch({ area: nextArea, type: "setDeliveryArea" });
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", workspaceForDeliveryArea());
    url.searchParams.set("delivery", nextArea);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const saveMetadata = async () => {
    if (!id) return;
    dispatch({ saving: true, type: "setMetadataSaving" });
    dispatch({ error: null, type: "setError" });
    try {
      const result = await updateTryoutMetadataAction({ bannerMediaId: draft.bannerMediaId ?? null, description: draft.description, id, title: draft.title });
      if (!result.ok) {
        dispatch({ error: result.message, type: "setError" });
        return;
      }
      const nextDraft = normalize(result.result);
      dispatch({ draft: nextDraft, type: "setDraft" });
      savedDraftRef.current = nextDraft;
      dispatch({ dirty: false, type: "setDirty" });
    } catch (metadataError) {
      dispatch({ error: metadataError instanceof Error ? metadataError.message : "Detail Tryout belum dapat disimpan.", type: "setError" });
    } finally {
      dispatch({ saving: false, type: "setMetadataSaving" });
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
        pendingWorkspaceRef.current = nextWorkspace;
        pendingHrefRef.current = null;
        dispatch({ open: true, type: "setDirtyNavigationOpen" });
        return;
      }
      dispatch({ type: "setRequestedWorkspace", workspace: nextWorkspace });
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
      dispatch({ loading: true, type: "setSourceBankLoading" });
      try {
        const result = await listQuestionBankSourcePageAction({
          page: sourceBankPage,
          pageSize: 20,
          search: sourceBankSearch,
          subjectCoverage: [activeSection.subtest],
        });
        if (cancelled) return;
        const nextBanks = result.items.map(({ bank }) => bank as SourceBank);
        dispatch({ banks: nextBanks, total: result.total, type: "setSourceBankResults" });
      } catch (sourceError) {
        if (!cancelled) dispatch({ error: sourceError instanceof Error ? sourceError.message : "Bank Soal belum dapat dimuat.", type: "setError" });
      } finally {
        dispatch({ loading: false, type: "setSourceBankLoading" });
      }
    }, sourceBankSearch.trim() ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeSection.subtest, sourceBankPage, sourceBankSearch, workspace]);

  useEffect(() => {
    if (workspace !== "sections" || !browseBankId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      dispatch({ loading: true, type: "setSourceQuestionLoading" });
      try {
        const result = await listQuestionBankSourceQuestionsAction(browseBankId, {
          page: sourceQuestionPage,
          pageSize: 50,
          search: sourceQuestionSearch,
          subjectCode: activeSection.subtest,
        });
        if (cancelled || !result) return;
        const incoming = result.questions as SourceQuestion[];
        dispatch({ questions: incoming, total: result.total, type: "setSourceQuestionResults" });
      } catch (sourceError) {
        if (!cancelled) dispatch({ error: sourceError instanceof Error ? sourceError.message : "Soal siap belum dapat dimuat.", type: "setError" });
      } finally {
        dispatch({ loading: false, type: "setSourceQuestionLoading" });
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
    pendingWorkspaceRef.current = null;
    pendingHrefRef.current = href;
    dispatch({ open: true, type: "setDirtyNavigationOpen" });
  };

  return {
    activeBrowseBank,
    activeCode,
    activeDirectQuestions,
    activePhase,
    activePhaseDefinition,
    activeSection,
    activeSourceQuestions,
    browseBankId,
    changeActiveCode,
    changeDeliveryArea,
    changeWorkspace,
    commitWorkspaceChange,
    configureReady,
    deliveryArea,
    dirtyNavigationOpen,
    dispatch,
    draft,
    duplicate,
    duplicateOpen,
    error,
    goTo,
    guardExternalNavigation,
    hasActiveAttempt,
    lifecyclePhases,
    metadataSaving,
    mode,
    pendingHrefRef,
    pendingWorkspaceRef,
    publishOpen,
    routeNormalizationNotice,
    save,
    saveMetadata,
    savedDraftRef,
    saving,
    sectionReadiness,
    selectedSessionId,
    selectedSourceQuestionIdsSet,
    sourceBankLoading,
    sourceBankPage,
    sourceBankSearch,
    sourceBankTotal,
    sourceBanks,
    sourceQuestionLoading,
    sourceQuestionPage,
    sourceQuestionSearch,
    sourceQuestionTotal,
    sourceQuestions,
    toggleDirectQuestion,
    unpublish,
    unpublishOpen,
    update,
    visiblePhaseDefinitions,
    workspace,
  };
}

function TryoutPhaseNavigation({
  activePhase,
  activePhaseDefinition,
  changeWorkspace,
  goTo,
  lifecyclePhases,
  mode,
  saving,
  visiblePhaseDefinitions,
}: {
  activePhase: WorkspacePhase;
  activePhaseDefinition?: WorkspacePhaseDefinition;
  changeWorkspace: (workspace: Workspace) => void;
  goTo: (workspace: Workspace) => void;
  lifecyclePhases: Array<{ label: string; value: WorkspacePhase }>;
  mode: WorkflowMode;
  saving: boolean;
  visiblePhaseDefinitions: WorkspacePhaseDefinition[];
}) {
  return (
    <>
      <Tabs
        className="mt-5 min-w-0"
        onValueChange={(value) => goTo(phaseStartWorkspace(value as WorkspacePhase, mode))}
        value={activePhase}
      >
        <FullWidthLineTabsList aria-label="Fase lifecycle Tryout">
          <TooltipProvider>
            {lifecyclePhases.map((phase) => {
              const available = visiblePhaseDefinitions.some((definition) => definition.value === phase.value);
              const reason = unavailablePhaseReason(phase.value);
              const trigger = (
                <FullWidthLineTabsTrigger
                  aria-label={available ? phase.label : `${phase.label} terkunci`}
                  disabled={!available || saving}
                  key={phase.value}
                  value={phase.value}
                >
                  {phase.label}
                  {!available ? <Lock aria-hidden="true" className="size-3.5" /> : null}
                </FullWidthLineTabsTrigger>
              );
              if (available) return trigger;
              return (
                <Tooltip key={phase.value}>
                  <TooltipTrigger render={<span className="flex min-w-0 flex-1" title={reason} />}>
                    {trigger}
                  </TooltipTrigger>
                  <TooltipContent>{reason}</TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </FullWidthLineTabsList>
      </Tabs>

      {activePhaseDefinition && activePhaseDefinition.items.length > 1 ? (
        <div className="mt-5 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <FullWidthLineTabsList aria-label={`Subarea ${activePhaseDefinition.label}`} className="min-w-max xl:min-w-0">
            {activePhaseDefinition.items.map((item) => (
              <FullWidthLineTabsTrigger
                className="min-w-max"
                disabled={saving}
                key={item.value}
                onClick={() => changeWorkspace(item.value)}
                value={item.value}
              >
                {item.label}
              </FullWidthLineTabsTrigger>
            ))}
          </FullWidthLineTabsList>
        </div>
      ) : null}
    </>
  );
}

function TryoutDeliveryTab({
  changeDeliveryArea,
  deliveryArea,
  id,
  onSaveDraft,
  operationsInitial,
}: {
  changeDeliveryArea: (area: DeliveryArea) => void;
  deliveryArea: DeliveryArea;
  id?: string;
  onSaveDraft: () => void;
  operationsInitial?: TryoutOperationsView & { workflow?: CanonicalTryoutWorkflowProjection };
}) {
  return (
    <TabsContent className="mt-0 min-w-0 w-full" value="schedule">
      {!id || !operationsInitial ? (
        <WorkspaceUnavailable onSaveDraft={onSaveDraft} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <aside aria-label="Area Delivery" className="grid gap-2 lg:sticky lg:top-5 lg:self-start">
            <div aria-label="Policy, Sessions, Participants" className="grid gap-2" role="tablist">
              {deliveryAreas.map((area) => {
                const active = deliveryArea === area.value;
                return (
                  <Button
                    aria-current={active ? "page" : undefined}
                    className={`h-12 w-full justify-start rounded-xl px-3 text-left text-base font-bold transition-colors ${active ? "bg-primary-50 text-primary-800 shadow-[inset_0_-1px_0_rgba(1,76,56,0.08)] hover:bg-primary-50" : "text-secondary-800 hover:bg-primary-50/70"}`}
                    key={area.value}
                    onClick={() => changeDeliveryArea(area.value)}
                    role="tab"
                    variant="ghost"
                  >
                    {area.label}
                  </Button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0">
            {deliveryArea === "policy" ? (
              <section aria-labelledby="schedule-policy-title">
                <h2 className="mb-4 text-xl font-semibold text-secondary-900" id="schedule-policy-title">Aturan akses</h2>
                <KaptenTryoutPolicyPageModule embedded initial={operationsInitial} onNext={() => changeDeliveryArea("sessions")} />
              </section>
            ) : null}
            {deliveryArea === "sessions" ? (
              <section aria-label="Sessions">
                <KaptenTryoutSessionsPageModule embedded initial={operationsInitial} />
              </section>
            ) : null}
            {deliveryArea === "participants" ? (
              <section aria-label="Participants">
                <KaptenTryoutParticipantsPageModule embedded initial={operationsInitial} />
              </section>
            ) : null}
          </div>
        </div>
      )}
    </TabsContent>
  );
}

function TryoutFooterActions({
  commitWorkspaceChange,
  configureReady,
  draft,
  id,
  mode,
  onDuplicateClick,
  save,
  saving,
  workspace,
}: {
  commitWorkspaceChange: (workspace: Workspace) => void;
  configureReady: boolean;
  draft: TryoutDraft;
  id?: string;
  mode: WorkflowMode;
  onDuplicateClick: () => void;
  save: (status?: "draft" | "published", nextWorkspace?: Workspace) => Promise<boolean>;
  saving: boolean;
  workspace: Workspace;
}) {
  if (mode !== "draft" || workspace === "review") return null;

  return (
    <footer aria-label="Tindakan langkah Tryout" className="sticky bottom-0 z-20 mt-6 flex flex-wrap items-center justify-end gap-3 bg-transparent px-0 py-4">
      <div className="flex flex-wrap justify-end gap-2">
        {draft.locked ? <Button disabled={saving} onClick={onDuplicateClick} variant="brand"><Copy />Duplikat draf baru</Button> : null}
        {!draft.locked && workspace === "basics" ? <Button disabled={saving || !draft.title.trim()} onClick={() => { void save("draft", "sections").then((ok) => { if (ok && id) commitWorkspaceChange("sections"); }); }} variant="reference">{saving ? "Menyimpan…" : "Selanjutnya"}</Button> : null}
        {!draft.locked && workspace === "sections" ? <Button disabled={saving || !configureReady} onClick={() => { void save("draft", "review").then((ok) => { if (ok && id) commitWorkspaceChange("review"); }); }} variant="reference">{saving ? "Menyimpan…" : "Selanjutnya"}</Button> : null}
      </div>
    </footer>
  );
}

function KaptenTryoutBuilderPageModule({
  id,
  initialDraft,
  initialDeliveryArea,
  initialParent,
  initialSessionId,
  initialWorkspace = "basics",
  operationsInitial,
  initialSourceBankTotal,
  initialSourceBanks,
  session,
}: {
  id?: string;
  initialDeliveryArea?: string;
  initialDraft?: TryoutDraft | null;
  initialParent?: { id: string; publishedAt?: string; title: string };
  initialSessionId?: string;
  initialSourceBankTotal?: number;
  initialSourceBanks: SourceBank[];
  initialWorkspace?: string;
  operationsInitial?: TryoutOperationsView & { workflow?: CanonicalTryoutWorkflowProjection };
  session: SessionContext;
}) {
  const {
    activeBrowseBank,
    activeCode,
    activeDirectQuestions,
    activePhase,
    activePhaseDefinition,
    activeSection,
    activeSourceQuestions,
    browseBankId,
    changeActiveCode,
    changeDeliveryArea,
    changeWorkspace,
    commitWorkspaceChange,
    configureReady,
    deliveryArea,
    dirtyNavigationOpen,
    dispatch,
    draft,
    duplicate,
    duplicateOpen,
    error,
    goTo,
    guardExternalNavigation,
    hasActiveAttempt,
    lifecyclePhases,
    metadataSaving,
    mode,
    pendingHrefRef,
    pendingWorkspaceRef,
    publishOpen,
    routeNormalizationNotice,
    save,
    savedDraftRef,
    saveMetadata,
    saving,
    sectionReadiness,
    selectedSessionId,
    selectedSourceQuestionIdsSet,
    sourceBankLoading,
    sourceBankPage,
    sourceBankSearch,
    sourceBankTotal,
    sourceBanks,
    sourceQuestionLoading,
    sourceQuestionPage,
    sourceQuestionSearch,
    sourceQuestionTotal,
    sourceQuestions,
    toggleDirectQuestion,
    unpublish,
    unpublishOpen,
    update,
    visiblePhaseDefinitions,
    workspace,
  } = useTryoutBuilderState({
    id,
    initialDeliveryArea,
    initialDraft,
    initialParent,
    initialSessionId,
    initialSourceBanks,
    initialSourceBankTotal,
    initialWorkspace,
    operationsInitial,
  });

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-start gap-3">
        <Button aria-label="Kembali ke semua Tryout" className="mt-1 shrink-0 rounded-xl text-secondary-500 hover:bg-primary-50 hover:text-secondary-900" nativeButton={false} onClick={(event) => guardExternalNavigation("/mentor/tryout", event)} render={<Link href="/mentor/tryout" />} size="icon" title="Kembali ke semua Tryout" variant="ghost">
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Button>
        <ReferencePageHeader
          className="min-w-0 flex-1"
          description={(
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{mode === "published" ? "Kelola akses, sesi, dan hasil untuk Tryout ini." : "Susun konfigurasi Tryout sebelum diterbitkan."}</span>
              <ReferenceStatusBadge appearance="mentor" size="xs" status={mode === "published" ? "published" : "draft"} />
            </span>
          )}
          title={mode === "published" ? "Detail Tryout" : id ? "Edit Tryout" : "Buat Tryout"}
          actions={mode === "published" ? (
            <>
              <Button disabled={saving || hasActiveAttempt} onClick={() => dispatch({ open: true, type: "setUnpublishOpen" })} title={hasActiveAttempt ? "Tunggu sampai semua peserta selesai sebelum menjadikan Tryout draf." : "Jadikan Tryout draf"} variant="outline">
                <FilePenLine />Jadikan draf
              </Button>
              <Button disabled={saving} onClick={() => dispatch({ open: true, type: "setDuplicateOpen" })} variant="brandOutline">
                <Copy />Duplikat draf baru
              </Button>
            </>
          ) : undefined}
        />
      </div>

      {error ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm leading-6 text-danger-500" role="alert">
          <CircleAlert className="mt-1 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {routeNormalizationNotice ? (
        <ReferenceSurface className="mt-4 flex items-start gap-2 px-4 py-3 text-sm leading-6 text-secondary-700" role="status" variant="inset">
          <CircleHelp className="mt-1 size-4 shrink-0 text-primary-800" />
          {routeNormalizationNotice}
        </ReferenceSurface>
      ) : null}
      {draft.locked ? (
        <ReferenceSurface className="mt-4 flex items-start gap-3 px-4 py-3 text-sm leading-6 text-secondary-700" role="status" variant="inset">
          <Lock className="mt-1 size-4 shrink-0" />
          <p><strong>Mode baca saja.</strong> Peserta sudah memulai Tryout ini; buat salinan untuk mengubah konfigurasi tanpa mengubah riwayat.</p>
        </ReferenceSurface>
      ) : null}
      {initialParent && mode === "draft" ? (
        <ReferenceSurface className="mt-4 flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 text-sm leading-6 text-secondary-700" role="status" variant="inset">
          <div><p className="font-semibold text-secondary-900">Draf perubahan</p><p className="mt-1">Berdasarkan “{initialParent.title}”{initialParent.publishedAt ? ` · diterbitkan ${formatTryoutDateTime(initialParent.publishedAt)}` : ""}. Perubahan di sini tidak memengaruhi versi terbit, sesi, atau hasil sebelumnya.</p></div>
          <Button nativeButton={false} onClick={(event) => guardExternalNavigation(`/mentor/tryout/${initialParent.id}?workspace=schedule`, event)} render={<Link href={`/mentor/tryout/${initialParent.id}?workspace=schedule`} />} size="sm" variant="brandOutline">Lihat versi terbit</Button>
        </ReferenceSurface>
      ) : null}

      <TryoutPhaseNavigation
        activePhase={activePhase}
        activePhaseDefinition={activePhaseDefinition}
        changeWorkspace={changeWorkspace}
        goTo={goTo}
        lifecyclePhases={lifecyclePhases}
        mode={mode}
        saving={saving}
        visiblePhaseDefinitions={visiblePhaseDefinitions}
      />

      <Tabs className="mt-5 min-w-0" onValueChange={changeWorkspace} value={workspace}>
        <div className={activePhase === "build" ? "mt-5 grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start" : "mt-6 w-full"}>
          {activePhase === "build" ? (
            <SectionRail
              activeCode={activeCode}
              disabled={saving}
              onSelect={changeActiveCode}
              readiness={sectionReadiness}
              sections={draft.sections}
            />
          ) : null}

          <div className={activePhase === "build" ? "grid min-w-0 gap-3 lg:col-start-2" : "grid w-full min-w-0 gap-5"}>
            <TryoutBasicsTab
              draft={draft}
              metadataSaving={metadataSaving}
              mode={mode}
              onBannerChange={(bannerMediaId) => { dispatch({ change: {}, subtest: activeCode, type: "updateSection" }); dispatch({ draft: { ...draft, bannerMediaId }, type: "setDraft" }); }}
              onDescriptionChange={(desc) => { dispatch({ change: {}, subtest: activeCode, type: "updateSection" }); dispatch({ draft: { ...draft, description: desc }, type: "setDraft" }); }}
              onSaveMetadata={() => void saveMetadata()}
              onTitleChange={(title) => { dispatch({ change: {}, subtest: activeCode, type: "updateSection" }); dispatch({ draft: { ...draft, title }, type: "setDraft" }); }}
              saving={saving}
            />

            <TryoutSectionsTab
              activeBrowseBank={activeBrowseBank}
              activeDirectQuestions={activeDirectQuestions}
              activeSection={activeSection}
              activeSourceQuestions={activeSourceQuestions}
              browseBankId={browseBankId}
              draft={draft}
              guardExternalNavigation={guardExternalNavigation}
              onBankPageNext={() => dispatch({ page: sourceBankPage + 1, type: "setSourceBankPage" })}
              onBankSearchChange={(search) => dispatch({ search, type: "setSourceBankSearch" })}
              onQuestionPageNext={() => dispatch({ page: sourceQuestionPage + 1, type: "setSourceQuestionPage" })}
              onQuestionSearchChange={(search) => dispatch({ search, type: "setSourceQuestionSearch" })}
              onSelectBank={(bankId) => dispatch({ bankId, type: "setBrowseBankId" })}
              onToggleQuestion={toggleDirectQuestion}
              onUpdateSection={(change) => update(activeSection.subtest, change)}
              selectedSourceQuestionIdsSet={selectedSourceQuestionIdsSet}
              sourceBankLoading={sourceBankLoading}
              sourceBankSearch={sourceBankSearch}
              sourceBankTotal={sourceBankTotal}
              sourceBanks={sourceBanks}
              sourceQuestionLoading={sourceQuestionLoading}
              sourceQuestionSearch={sourceQuestionSearch}
              sourceQuestionTotal={sourceQuestionTotal}
              sourceQuestions={sourceQuestions}
              saving={saving}
            />

            <TryoutDeliveryTab
              changeDeliveryArea={changeDeliveryArea}
              deliveryArea={deliveryArea}
              id={id}
              onSaveDraft={() => void save("draft")}
              operationsInitial={operationsInitial}
            />

            <TabsContent className="mt-0 min-w-0 w-full" value="live">
              {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : <KaptenTryoutLivePageModule initial={operationsInitial} selectedSessionId={selectedSessionId} />}
            </TabsContent>

            <TabsContent className="mt-0 min-w-0 w-full" value="attempts">
              {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : <KaptenTryoutAttemptsPageModule initial={operationsInitial} />}
            </TabsContent>

            <TabsContent className="mt-0 min-w-0 w-full" value="results">
              {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save("draft")} /> : <KaptenTryoutResultsPageModule initial={operationsInitial} selectedSessionId={selectedSessionId} />}
            </TabsContent>

            <TryoutReviewTab
              draft={draft}
              onPublishClick={() => dispatch({ open: true, type: "setPublishOpen" })}
              saving={saving}
              setPublishOpen={(open) => dispatch({ open, type: "setPublishOpen" })}
            />
          </div>
        </div>
      </Tabs>

      <TryoutFooterActions
        commitWorkspaceChange={commitWorkspaceChange}
        configureReady={configureReady}
        draft={draft}
        id={id}
        mode={mode}
        onDuplicateClick={() => dispatch({ open: true, type: "setDuplicateOpen" })}
        save={save}
        saving={saving}
        workspace={workspace}
      />

      <TryoutLifecycleModals
        dirtyNavigationOpen={dirtyNavigationOpen}
        draft={draft}
        duplicateOpen={duplicateOpen}
        hasActiveAttempt={hasActiveAttempt}
        onCancelDirtyNavigation={() => {
          pendingWorkspaceRef.current = null;
          pendingHrefRef.current = null;
          dispatch({ open: false, type: "setDirtyNavigationOpen" });
        }}
        onConfirmDiscard={() => {
          const target = pendingWorkspaceRef.current;
          const href = pendingHrefRef.current;
          dispatch({ draft: savedDraftRef.current, type: "setDraft" });
          dispatch({ dirty: false, type: "setDirty" });
          pendingWorkspaceRef.current = null;
          pendingHrefRef.current = null;
          dispatch({ open: false, type: "setDirtyNavigationOpen" });
          if (target) commitWorkspaceChange(target);
          else if (href) window.location.assign(href);
        }}
        onConfirmDuplicate={() => {
          dispatch({ open: false, type: "setDuplicateOpen" });
          void duplicate();
        }}
        onConfirmPublish={() => {
          dispatch({ open: false, type: "setPublishOpen" });
          void save("published");
        }}
        onConfirmSaveDirty={() => {
          const target = pendingWorkspaceRef.current;
          const href = pendingHrefRef.current;
          void save("draft").then((ok) => {
            if (ok && target) commitWorkspaceChange(target);
            else if (ok && href) window.location.assign(href);
            if (ok) {
              pendingWorkspaceRef.current = null;
              pendingHrefRef.current = null;
              dispatch({ open: false, type: "setDirtyNavigationOpen" });
            }
          });
        }}
        onConfirmUnpublish={() => {
          dispatch({ open: false, type: "setUnpublishOpen" });
          void unpublish();
        }}
        onOpenChangeDirtyNavigation={(open) => { if (!saving) dispatch({ open, type: "setDirtyNavigationOpen" }); }}
        onOpenChangeDuplicate={(open) => { if (!saving) dispatch({ open, type: "setDuplicateOpen" }); }}
        onOpenChangePublish={(open) => { if (!saving) dispatch({ open, type: "setPublishOpen" }); }}
        onOpenChangeUnpublish={(open) => { if (!saving) dispatch({ open, type: "setUnpublishOpen" }); }}
        publishOpen={publishOpen}
        saving={saving}
        unpublishOpen={unpublishOpen}
      />
    </div>
  );
}

export { KaptenTryoutBuilderPageModule };

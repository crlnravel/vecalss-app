"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Eye,
  ImagePlus,
  Save,
  Search,
  SendHorizontal,
  Trash2,
} from "@/lib/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ComponentProps,
} from "react";
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
import { showToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import {
  FullWidthLineTabsList,
  FullWidthLineTabsTrigger,
} from "@/components/ui/full-width-line-tabs";
import { MentorBadge } from "@/components/ui/mentor-badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import type { TryoutWorkflowProjection as CanonicalTryoutWorkflowProjection } from "@/lib/tryout/workflow-projection";
import { buildQuestionBankHref } from "@/lib/navigation/canonical-context";
import {
  HelpFieldLabel,
  OptionSet,
} from "@/modules/mentor/KaptenTryoutOperationalShared";
import {
  type DefaultPolicy,
  type Mode,
} from "@/modules/mentor/KaptenTryoutOperationsData";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import {
  CBT_FIXED_POINTS_METHOD,
  CBT_IRT_2PL_METHOD,
} from "@/lib/tryout/cbt-scoring-policy";
import {
  MediaAssetPreview,
  MediaPickerDialog,
} from "@/modules/media/media-library";
import { PaginationControls } from "@/modules/mentor/components/kapten-ui";
import {
  listQuestionBankSourcePageAction,
  listQuestionBankSourceQuestionsAction,
} from "@/modules/mentor/question-bank-actions";
import {
  duplicateTryoutAction,
  archiveTryoutAction,
  deleteTryoutAction,
  saveTryoutAction,
  unpublishTryoutAction,
  updateTryoutMetadataAction,
} from "@/modules/mentor/tryout-actions";
import {
  TryoutWorkspaceHeader,
  type TryoutWorkspaceTab,
} from "@/modules/mentor/KaptenTryoutWorkspaceHeader";
import { KaptenTryoutOperationsModule } from "@/modules/mentor/KaptenTryoutOperationsModule";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { KaptenTryoutSettingsPageModule } from "@/modules/mentor/KaptenTryoutSettingsPageModule";
import {
  ResourceAuthoringLockBanner,
  type AuthoringLockState,
} from "@/modules/mentor/components/resource-authoring-lock-banner";
import {
  ResourceEditLockProvider,
  useResourceEditLock,
} from "@/modules/mentor/resource-edit-lock-provider";

const subjectCodes = kaptenSubjects.map((subject) => subject.code) as Array<
  "PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM"
>;
const SOURCE_QUESTION_PAGE_SIZE = 10;
type SubjectCode = (typeof subjectCodes)[number];
type DirectQuestionDraft = {
  bankId?: string;
  bankTitle?: string;
  difficulty?: "easy" | "medium" | "hard";
  hasExplanation?: boolean;
  hasReadyMedia?: boolean;
  prompt?: string;
  sourceContentDigest?: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId?: string;
  questionType?: "single_choice" | "multiple_choice";
};
type TestDraft = {
  directQuestions?: DirectQuestionDraft[];
  durationMinutes: number;
  instructions: string;
  scoringConfig?: Record<string, unknown>;
  shuffleItems: boolean;
  subtest: SubjectCode;
  testType: "cbt";
};
type ReleaseMeta = {
  digest: string;
  id: string;
  number: number;
  payload?: unknown;
  publishedAt: string;
};
type TryoutDraft = {
  admissionMode?: Mode;
  assessmentRelease?: ReleaseMeta | null;
  bannerMediaId?: string | null;
  defaultReleasePolicy?: DefaultPolicy | "inherit" | "scheduled";
  description: string;
  id: string;
  locked: boolean;
  sections: TestDraft[];
  status: "draft" | "published";
  title: string;
  updatedAt: number;
};

function defaultPolicyForDraft(
  value?: TryoutDraft["defaultReleasePolicy"],
): DefaultPolicy {
  return value === "immediate" ||
    value === "manual" ||
    value === "automatic_at_end"
    ? value
    : "automatic_at_end";
}
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
  choices: Array<{ id: string; mediaAssetId?: string; text: string }>;
  correctChoiceIds?: string[];
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  explanationMediaAssetId?: string;
  id: string;
  prompt: string;
  promptMediaAssetId?: string;
  questionContentDigest?: string;
  questionRevisionId?: string;
  questionType?: "single_choice" | "multiple_choice";
  subjectCode: string;
};
type Workspace = "basics" | "schedule";
type WorkflowMode = "draft" | "published";
type SubtestDetailTab = "info" | "bank";

function defaultSections(): TestDraft[] {
  return subjectCodes.map((subtest) => ({
    directQuestions: [],
    durationMinutes: 30,
    instructions: "",
    scoringConfig: {
      correctAnswerPoints: 1,
      method: CBT_FIXED_POINTS_METHOD,
      unansweredPoints: 0,
      wrongAnswerPoints: 0,
    },
    shuffleItems: true,
    subtest,
    testType: "cbt",
  }));
}

function scoringMethodForSection(section: Pick<TestDraft, "scoringConfig">) {
  return section.scoringConfig?.method === CBT_IRT_2PL_METHOD
    ? CBT_IRT_2PL_METHOD
    : CBT_FIXED_POINTS_METHOD;
}

function normalize(draft: TryoutDraft): TryoutDraft {
  const byCode = new Map(
    draft.sections.map((section) => [section.subtest, section]),
  );
  const fallback = defaultSections();
  return {
    ...draft,
    sections: subjectCodes.map((code) => ({
      ...(byCode.get(code) ??
        fallback.find((section) => section.subtest === code)!),
      shuffleItems: true,
    })),
  };
}

function subjectName(code: SubjectCode) {
  return kaptenSubjects.find((subject) => subject.code === code)?.name ?? code;
}

function difficultyLabel(difficulty: SourceQuestion["difficulty"]) {
  return difficulty === "easy"
    ? "Mudah"
    : difficulty === "hard"
      ? "Sulit"
      : "Sedang";
}

function questionTypeLabel(questionType?: SourceQuestion["questionType"]) {
  return questionType === "multiple_choice"
    ? "Pilihan Ganda Kompleks"
    : "Pilihan Ganda";
}

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-1 text-danger-500">
        *
      </span>
      <span className="sr-only"> wajib</span>
    </>
  );
}

type SectionReadiness = {
  detail: string;
  issueCount: number;
  status: "attention" | "in_progress" | "ready" | "setup";
};

function directQuestionsReady(questions: DirectQuestionDraft[]) {
  // The source chooser only exposes Ready questions; attaching one completes the subtest.
  return questions.length > 0;
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
  browseBankId: string | null;
  disabled: boolean;
  guardExternalNavigation: (
    href: string,
    event: { preventDefault: () => void },
  ) => void;
  onSelectBank: (bankId: string) => void;
  sourceBanks: SourceBank[];
}) {
  if (!sourceBanks.length) {
    return (
      <div className="grid gap-3 px-3 py-5">
        <p className="text-sm text-secondary-500">
          Belum ada Bank Soal dengan soal Ready untuk {activeSectionSubtest}.
        </p>
        <Button
          className="w-fit"
          disabled={disabled}
          nativeButton={false}
          onClick={(event) =>
            guardExternalNavigation(
              buildQuestionBankHref({ purpose: "tryout" }),
              event,
            )
          }
          render={<Link href={buildQuestionBankHref({ purpose: "tryout" })} />}
          size="sm"
          variant="reference"
        >
          Buka Bank Soal
        </Button>
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
        <span className="mt-0.5 block truncate text-xs font-normal text-secondary-500">
          {bank.questionCount} soal
          {bank.folderPath?.length
            ? ` · ${bank.folderPath.map((item) => item.name).join(" / ")}`
            : ""}
        </span>
      </span>
      {browseBankId === bank.id ? <Check className="ml-auto shrink-0" /> : null}
    </Button>
  ));
}

type BuilderState = {
  activeCode: SubjectCode;
  browseBankId: string;
  dirty: boolean;
  dirtyNavigationOpen: boolean;
  draft: TryoutDraft;
  duplicateOpen: boolean;
  error: string | null;
  metadataSaving: boolean;
  publishOpen: boolean;
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
  | { type: "setSourceBankSearch"; search: string }
  | { type: "setSourceBankPage"; page: number }
  | { type: "setSourceBankLoading"; loading: boolean }
  | { type: "setSourceBankResults"; banks: SourceBank[]; total: number }
  | { type: "setBrowseBankId"; bankId: string }
  | { type: "setSourceQuestionSearch"; search: string }
  | { type: "setSourceQuestionPage"; page: number }
  | { type: "setSourceQuestionLoading"; loading: boolean }
  | {
      type: "setSourceQuestionResults";
      questions: SourceQuestion[];
      total: number;
    }
  | { type: "setSaving"; saving: boolean }
  | { type: "setMetadataSaving"; saving: boolean }
  | { type: "setError"; error: string | null }
  | { type: "setDirty"; dirty: boolean }
  | { type: "setPublishOpen"; open: boolean }
  | { type: "setUnpublishOpen"; open: boolean }
  | { type: "setDuplicateOpen"; open: boolean }
  | { type: "setDirtyNavigationOpen"; open: boolean };

function builderReducer(
  state: BuilderState,
  action: BuilderAction,
): BuilderState {
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
            section.subtest === action.subtest
              ? { ...section, ...action.change }
              : section,
          ),
        },
      };
    case "setSourceBankSearch":
      return { ...state, sourceBankPage: 1, sourceBankSearch: action.search };
    case "setSourceBankPage":
      return { ...state, sourceBankPage: action.page };
    case "setSourceBankLoading":
      return { ...state, sourceBankLoading: action.loading };
    case "setSourceBankResults": {
      const nextBanks =
        state.sourceBankPage === 1
          ? action.banks
          : [...state.sourceBanks, ...action.banks].filter(
              (bank, index, all) =>
                all.findIndex((candidate) => candidate.id === bank.id) ===
                index,
            );
      const nextBrowseBankId = nextBanks.some(
        (bank) => bank.id === state.browseBankId,
      )
        ? state.browseBankId
        : (nextBanks[0]?.id ?? "");
      return {
        ...state,
        browseBankId: nextBrowseBankId,
        sourceBankTotal: action.total,
        sourceBanks: nextBanks,
      };
    }
    case "setBrowseBankId":
      if (state.browseBankId === action.bankId) return state;
      return {
        ...state,
        browseBankId: action.bankId,
        sourceQuestionPage: 1,
        sourceQuestionSearch: "",
        sourceQuestionTotal: 0,
        sourceQuestions: [],
      };
    case "setSourceQuestionSearch":
      return {
        ...state,
        sourceQuestionPage: 1,
        sourceQuestionSearch: action.search,
        sourceQuestionTotal: 0,
      };
    case "setSourceQuestionPage":
      return { ...state, sourceQuestionPage: action.page };
    case "setSourceQuestionLoading":
      return { ...state, sourceQuestionLoading: action.loading };
    case "setSourceQuestionResults":
      return {
        ...state,
        sourceQuestionTotal: action.total,
        sourceQuestions: action.questions,
      };
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
            <MediaAssetPreview
              alt="Preview banner Tryout"
              assetId={bannerMediaId}
              className="absolute inset-0 min-h-0 w-full"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className={REFERENCE_CONTROL_CLASS_NAMES.file}
              disabled={disabled}
              id="tryout-banner-choose"
              onClick={() => setPickerOpen(true)}
              variant="reference"
            >
              <ImagePlus />
              Ganti gambar
            </Button>
            <Button
              disabled={disabled}
              onClick={() => onChange(null)}
              size="sm"
              variant="ghost"
            >
              <Trash2 />
              Hapus banner
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div
            aria-hidden="true"
            className="grid aspect-[16/9] place-items-center rounded-2xl border border-dashed border-primary-200 bg-primary-50/60 text-sm text-secondary-500"
          >
            Belum ada banner — peserta melihat gambar bawaan.
          </div>
          <div>
            <Button
              className={REFERENCE_CONTROL_CLASS_NAMES.file}
              disabled={disabled}
              id="tryout-banner-choose"
              onClick={() => setPickerOpen(true)}
              variant="reference"
            >
              <ImagePlus />
              Pilih gambar
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

function TryoutIdentityPanel({
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
    <ReferenceSurface
      as="section"
      className="grid w-full mt-4 gap-6 p-5 sm:p-7"
    >
      <h2
        className="text-xl font-semibold text-secondary-900"
        id="tryout-basic-info-title"
      >
        Informasi Tryout
      </h2>
      <div className="grid gap-5">
        <Field>
          <FieldLabel
            className={REFERENCE_FIELD_LABEL_CLASS_NAME}
            htmlFor="tryout-title"
          >
            Judul Tryout <RequiredMark />
          </FieldLabel>
          <FieldInput
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-12 text-base font-semibold`}
            disabled={identityDisabled}
            id="tryout-title"
            onChange={(event) => onTitleChange(event.target.value)}
            required
            value={draft.title}
          />
        </Field>
        <Field>
          <FieldLabel
            className={REFERENCE_FIELD_LABEL_CLASS_NAME}
            htmlFor="tryout-description"
          >
            Deskripsi
          </FieldLabel>
          <FieldTextarea
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-32 text-sm leading-6`}
            disabled={identityDisabled}
            id="tryout-description"
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Contoh: Simulasi UTBK dengan tujuh subtest."
            value={draft.description}
          />
        </Field>
        <TryoutBannerField
          bannerMediaId={draft.bannerMediaId}
          disabled={identityDisabled}
          onChange={onBannerChange}
        />
      </div>
      {mode === "published" ? (
        <div className="flex justify-end pt-1">
          <Button
            disabled={metadataSaving || !draft.title.trim()}
            onClick={onSaveMetadata}
            variant="reference"
          >
            {metadataSaving ? "Menyimpan…" : "Simpan perubahan"}
          </Button>
        </div>
      ) : null}
    </ReferenceSurface>
  );
}

type TryoutSubtestEditorProps = {
  activeBrowseBank?: SourceBank;
  activeDirectQuestions: DirectQuestionDraft[];
  activeSection: TestDraft;
  activeSourceQuestions: SourceQuestion[];
  browseBankId: string | null;
  draft: TryoutDraft;
  guardExternalNavigation: (
    href: string,
    event: { preventDefault: () => void },
  ) => void;
  onBankPageNext: () => void;
  onBankSearchChange: (search: string) => void;
  onQuestionPageChange: (page: number) => void;
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
  sourceQuestionPage: number;
  sourceQuestionSearch: string;
  sourceQuestionTotal: number;
  readOnly: boolean;
  saving: boolean;
};

function TryoutSourceQuestionCard({
  activeDirectQuestions,
  onPreviewQuestion,
  onToggleQuestion,
  question,
  selectedSourceQuestionIdsSet,
  saving,
  locked,
}: {
  activeDirectQuestions: DirectQuestionDraft[];
  locked: boolean;
  onPreviewQuestion: (question: SourceQuestion) => void;
  onToggleQuestion: (question: SourceQuestion) => void;
  question: SourceQuestion;
  selectedSourceQuestionIdsSet: Set<string>;
  saving: boolean;
}) {
  const selected = activeDirectQuestions.some(
    (candidate) => candidate.sourceQuestionId === question.id,
  );
  const selectedInOtherSection =
    !selected && selectedSourceQuestionIdsSet.has(question.id);
  const checkboxId = `source-question-${question.id}`;

  return (
    <article
      className={`min-w-0 overflow-hidden rounded-2xl border p-3 transition-colors ${selected ? "border-primary-200 bg-white shadow-[0_12px_24px_-20px_color-mix(in_oklab,var(--voyage-forest)_70%,transparent)]" : "border-primary-100 bg-primary-50/45 hover:border-primary-200 hover:bg-primary-50/70"}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Checkbox
          aria-label={
            selected
              ? `Hapus pilihan ${question.prompt}`
              : `Pilih ${question.prompt}`
          }
          checked={selected}
          disabled={saving || locked || selectedInOtherSection}
          id={checkboxId}
          onCheckedChange={() => onToggleQuestion(question)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <label
              className="min-w-0 flex-1 cursor-pointer overflow-hidden"
              htmlFor={checkboxId}
            >
              <div className="flex flex-wrap gap-2">
                <MentorBadge size="compact" tone="category">
                  {question.subjectCode}
                </MentorBadge>
                <MentorBadge size="compact" tone="neutral">
                  {difficultyLabel(question.difficulty)}
                </MentorBadge>
                <MentorBadge
                  size="compact"
                  tone={
                    question.questionType === "multiple_choice"
                      ? "attention"
                      : "neutral"
                  }
                >
                  {questionTypeLabel(question.questionType)}
                </MentorBadge>
              </div>
              <p
                className="mt-2 block w-full min-w-0 max-w-[60ch] truncate text-sm leading-6 text-secondary-900"
                title={question.prompt}
              >
                {question.prompt}
              </p>
            </label>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={`Lihat pratinjau soal ${question.subjectCode}`}
                    disabled={saving}
                    onClick={() => onPreviewQuestion(question)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <Eye />
              </TooltipTrigger>
              <TooltipContent>Preview soal</TooltipContent>
            </Tooltip>
          </div>
          {selectedInOtherSection ? (
            <p className="mt-2 text-xs font-semibold text-secondary-500">
              Dipilih di subtest lain
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function TryoutSourceBankPicker({
  activeBrowseBank,
  activeSection,
  browseBankId,
  draft,
  guardExternalNavigation,
  onBankPageNext,
  onBankSearchChange,
  onSelectBank,
  sourceBankLoading,
  sourceBankSearch,
  sourceBankTotal,
  sourceBanks,
  readOnly,
  saving,
}: Pick<
  TryoutSubtestEditorProps,
  | "activeBrowseBank"
  | "activeSection"
  | "browseBankId"
  | "draft"
  | "guardExternalNavigation"
  | "onBankPageNext"
  | "onBankSearchChange"
  | "onSelectBank"
  | "readOnly"
  | "sourceBankLoading"
  | "sourceBankSearch"
  | "sourceBankTotal"
  | "sourceBanks"
  | "saving"
>) {
  return (
    <ReferenceSurface className="grid min-w-0 gap-4 p-4" variant="inset">
      <Field>
        <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME}>
          Bank Soal terpilih
          <RequiredMark />
        </FieldLabel>
        <Popover>
          <PopoverTrigger
            disabled={saving || readOnly || draft.locked}
            render={
              <Button
                aria-haspopup="listbox"
                className={`${REFERENCE_CONTROL_CLASS_NAMES.select} w-full`}
                variant="reference"
              />
            }
          >
            <span className="min-w-0 truncate">
              {activeBrowseBank?.title ?? "Pilih Bank Soal"}
            </span>
            <ChevronDown />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[min(30rem,calc(100vw-2rem))] gap-3"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
              <FieldInput
                aria-label="Cari Bank Soal"
                className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 rounded-xl py-2 pl-9 pr-3 text-sm`}
                disabled={saving || readOnly}
                onChange={(event) => onBankSearchChange(event.target.value)}
                placeholder="Cari judul, folder, atau kategori…"
                value={sourceBankSearch}
              />
            </div>
            {sourceBankLoading ? (
              <p className="px-2 text-xs text-secondary-500">
                Memuat Bank Soal…
              </p>
            ) : null}
            <div
              aria-label="Bank Soal sumber"
              className="grid max-h-72 gap-1 overflow-y-auto"
              role="listbox"
            >
              <SourceBankList
                activeSectionSubtest={activeSection.subtest}
                browseBankId={browseBankId}
                disabled={saving || readOnly || draft.locked}
                guardExternalNavigation={guardExternalNavigation}
                onSelectBank={onSelectBank}
                sourceBanks={sourceBanks}
              />
            </div>
            {sourceBankTotal > sourceBanks.length ? (
              <Button
                className="w-full"
                disabled={saving || readOnly || sourceBankLoading}
                onClick={onBankPageNext}
                size="sm"
                variant="reference"
              >
                {sourceBankLoading ? "Memuat…" : "Muat Bank Soal lain"}
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
      </Field>
    </ReferenceSurface>
  );
}

function TryoutSourceQuestionList({
  activeBrowseBank,
  activeDirectQuestions,
  activeSection,
  activeSourceQuestions,
  browseBankId,
  draft,
  onPreviewQuestion,
  onQuestionPageChange,
  onQuestionSearchChange,
  onToggleQuestion,
  onUpdateSection,
  selectedSourceQuestionIdsSet,
  sourceQuestionLoading,
  sourceQuestionPage,
  sourceQuestionSearch,
  sourceQuestionTotal,
  readOnly,
  saving,
}: Pick<
  TryoutSubtestEditorProps,
  | "activeBrowseBank"
  | "activeDirectQuestions"
  | "activeSection"
  | "activeSourceQuestions"
  | "browseBankId"
  | "draft"
  | "onQuestionPageChange"
  | "onQuestionSearchChange"
  | "onToggleQuestion"
  | "onUpdateSection"
  | "readOnly"
  | "selectedSourceQuestionIdsSet"
  | "sourceQuestionLoading"
  | "sourceQuestionPage"
  | "sourceQuestionSearch"
  | "sourceQuestionTotal"
  | "saving"
> & { onPreviewQuestion: (question: SourceQuestion) => void }) {
  const sourceQuestionPageCount = Math.max(
    1,
    Math.ceil(sourceQuestionTotal / SOURCE_QUESTION_PAGE_SIZE),
  );
  const selectedCount = activeDirectQuestions.length;
  const moveSelectedQuestion = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (
      nextIndex < 0 ||
      nextIndex >= activeDirectQuestions.length ||
      readOnly ||
      draft.locked ||
      saving
    )
      return;
    const nextQuestions = [...activeDirectQuestions];
    const [moved] = nextQuestions.splice(index, 1);
    if (!moved) return;
    nextQuestions.splice(nextIndex, 0, moved);
    onUpdateSection({ directQuestions: nextQuestions });
  };
  const removeSelectedQuestion = (sourceQuestionId: string) => {
    if (readOnly || draft.locked || saving) return;
    onUpdateSection({
      directQuestions: activeDirectQuestions.filter(
        (question) => question.sourceQuestionId !== sourceQuestionId,
      ),
    });
  };

  return (
    <ReferenceSurface className="min-w-0 p-5">
      <div className="flex flex-wrap items-center justify-between gap-5 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-secondary-900">
            Daftar Soal
          </h3>
        </div>
        <MentorBadge
          size="compact"
          tone={selectedCount ? "category" : "neutral"}
        >
          {selectedCount} terpilih
        </MentorBadge>
      </div>
      {/* {selectedCount ? ( */}
      {/*   <section */}
      {/*     aria-labelledby={`selected-questions-${activeSection.subtest}`} */}
      {/*     className="grid gap-2 rounded-2xl border border-primary-100 bg-primary-50/45 p-3" */}
      {/*   > */}
      {/*     <div className="flex flex-wrap items-center justify-between gap-2"> */}
      {/*       <h4 */}
      {/*         className="text-sm font-semibold text-secondary-900" */}
      {/*         id={`selected-questions-${activeSection.subtest}`} */}
      {/*       > */}
      {/*         Urutan soal di subtest */}
      {/*       </h4> */}
      {/*       {!readOnly ? ( */}
      {/*         <span className="text-xs text-secondary-500"> */}
      {/*           Gunakan tombol naik/turun untuk mengatur urutan. */}
      {/*         </span> */}
      {/*       ) : null} */}
      {/*     </div> */}
      {/*     <ol */}
      {/*       aria-label={`Urutan soal subtest ${activeSection.subtest}`} */}
      {/*       className="grid gap-2" */}
      {/*     > */}
      {/*       {activeDirectQuestions.map((question, index) => ( */}
      {/*         <li */}
      {/*           className="flex min-w-0 items-center gap-2 rounded-xl border border-primary-100 bg-white px-3 py-2" */}
      {/*           key={question.sourceQuestionId} */}
      {/*         > */}
      {/*           <span */}
      {/*             aria-hidden="true" */}
      {/*             className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-800" */}
      {/*           > */}
      {/*             {index + 1} */}
      {/*           </span> */}
      {/*           <span */}
      {/*             className="min-w-0 flex-1 truncate text-sm text-secondary-800" */}
      {/*             title={question.prompt} */}
      {/*           > */}
      {/*             {question.prompt || "Soal tanpa pertanyaan"} */}
      {/*           </span> */}
      {/*           {question.questionType === "multiple_choice" ? ( */}
      {/*             <MentorBadge size="compact" tone="attention"> */}
      {/*               Beberapa jawaban */}
      {/*             </MentorBadge> */}
      {/*           ) : null} */}
      {/*           {!readOnly ? ( */}
      {/*             <div className="flex shrink-0 items-center gap-0.5"> */}
      {/*               <Button */}
      {/*                 aria-label={`Pindah soal ${index + 1} ke atas`} */}
      {/*                 disabled={draft.locked || saving || index === 0} */}
      {/*                 onClick={() => moveSelectedQuestion(index, "up")} */}
      {/*                 size="icon-sm" */}
      {/*                 type="button" */}
      {/*                 variant="ghost" */}
      {/*               > */}
      {/*                 <ArrowUp className="size-3.5" /> */}
      {/*               </Button> */}
      {/*               <Button */}
      {/*                 aria-label={`Pindah soal ${index + 1} ke bawah`} */}
      {/*                 disabled={ */}
      {/*                   draft.locked || saving || index === selectedCount - 1 */}
      {/*                 } */}
      {/*                 onClick={() => moveSelectedQuestion(index, "down")} */}
      {/*                 size="icon-sm" */}
      {/*                 type="button" */}
      {/*                 variant="ghost" */}
      {/*               > */}
      {/*                 <ArrowDown className="size-3.5" /> */}
      {/*               </Button> */}
      {/*               <Button */}
      {/*                 aria-label={`Hapus soal ${index + 1} dari subtest`} */}
      {/*                 disabled={draft.locked || saving} */}
      {/*                 onClick={() => */}
      {/*                   removeSelectedQuestion(question.sourceQuestionId) */}
      {/*                 } */}
      {/*                 size="icon-sm" */}
      {/*                 type="button" */}
      {/*                 variant="ghost" */}
      {/*               > */}
      {/*                 <Trash2 className="size-3.5" /> */}
      {/*               </Button> */}
      {/*             </div> */}
      {/*           ) : null} */}
      {/*         </li> */}
      {/*       ))} */}
      {/*     </ol> */}
      {/*   </section> */}
      {/* ) : null} */}
      {!readOnly ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
            <FieldInput
              aria-label="Cari soal Ready"
              className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-11 rounded-xl py-2 pl-9 pr-3 text-sm`}
              disabled={saving || !browseBankId}
              onChange={(event) => onQuestionSearchChange(event.target.value)}
              placeholder={
                activeBrowseBank
                  ? `Cari soal ${activeSection.subtest} di ${activeBrowseBank.title}…`
                  : "Pilih Bank Soal terlebih dahulu"
              }
              value={sourceQuestionSearch}
            />
          </div>
          {sourceQuestionLoading ? (
            <p className="mt-3 text-xs text-secondary-500">
              Memuat soal Ready…
            </p>
          ) : null}
          {activeSourceQuestions.length ? (
            <div className="mt-4 grid gap-3">
              {activeSourceQuestions.map((question) => (
                <TryoutSourceQuestionCard
                  activeDirectQuestions={activeDirectQuestions}
                  locked={draft.locked}
                  onPreviewQuestion={onPreviewQuestion}
                  onToggleQuestion={onToggleQuestion}
                  question={question}
                  selectedSourceQuestionIdsSet={selectedSourceQuestionIdsSet}
                  key={question.id}
                  saving={saving}
                />
              ))}
            </div>
          ) : (
            <ReferenceSurface
              className="mt-5 px-4 py-10 text-center text-sm leading-6 text-secondary-500"
              variant="inset"
            >
              {browseBankId
                ? `Tidak ada soal ${activeSection.subtest} yang cocok di Bank Soal ini.`
                : "Pilih Bank Soal untuk mulai memilih."}
            </ReferenceSurface>
          )}
          {browseBankId && sourceQuestionTotal > 0 ? (
            <div
              aria-busy={sourceQuestionLoading}
              className="mt-4 flex justify-center pt-4 sm:justify-end"
            >
              <PaginationControls
                onPageChange={onQuestionPageChange}
                page={sourceQuestionPage}
                pageCount={sourceQuestionPageCount}
              />
            </div>
          ) : null}
        </>
      ) : selectedCount === 0 ? (
        <ReferenceSurface
          className="mt-4 px-4 py-8 text-center text-sm leading-6 text-secondary-500"
          variant="inset"
        >
          Belum ada soal yang tersimpan untuk subtest ini.
        </ReferenceSurface>
      ) : null}
    </ReferenceSurface>
  );
}

function TryoutSavedQuestionList({
  activeDirectQuestions,
  activeSection,
}: Pick<TryoutSubtestEditorProps, "activeDirectQuestions" | "activeSection">) {
  if (!activeDirectQuestions.length) {
    return (
      <p className="text-sm leading-6 text-secondary-500">
        Belum ada soal yang tersimpan untuk subtest ini.
      </p>
    );
  }

  return (
    <ol
      aria-label={`Daftar soal subtest ${activeSection.subtest}`}
      className="m-0 grid list-none divide-y divide-primary-100 border-y border-primary-100 p-0"
    >
      {activeDirectQuestions.map((question, index) => (
        <li
          className="flex min-w-0 items-start gap-3 py-3"
          key={question.sourceQuestionId}
        >
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-800"
          >
            {index + 1}
          </span>
          <span
            className="min-w-0 flex-1 break-words text-sm leading-6 text-secondary-900"
            title={question.prompt}
          >
            {question.prompt || "Soal tanpa pertanyaan"}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TryoutQuestionSourcePanel(
  props: TryoutSubtestEditorProps & {
    onPreviewQuestion: (question: SourceQuestion) => void;
  },
) {
  const { readOnly } = props;
  return (
    <ReferenceSurface as="section" className="grid gap-6 p-5 sm:p-7">
      <div
        aria-label="Sumber soal"
        className="grid gap-1"
        id="question-source-chooser"
      >
        <h2 className="text-xl font-semibold text-secondary-900">
          {readOnly ? "Daftar soal" : "Pilih bank soal"}
        </h2>
      </div>
      <div className="grid gap-5">
        {!readOnly ? <TryoutSourceBankPicker {...props} /> : null}
        {readOnly ? (
          <TryoutSavedQuestionList
            activeDirectQuestions={props.activeDirectQuestions}
            activeSection={props.activeSection}
          />
        ) : (
          <TryoutSourceQuestionList {...props} />
        )}
      </div>
    </ReferenceSurface>
  );
}

function TryoutSourceQuestionPreview({
  question,
  onClose,
}: {
  question: SourceQuestion | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={Boolean(question)}
    >
      <DialogContent
        className="max-h-[calc(100svh-2rem)] sm:max-w-2xl"
        variant="default"
      >
        <DialogHeader>
          <DialogTitle>Preview soal</DialogTitle>
        </DialogHeader>
        {question ? (
          <div className="grid gap-5">
            <p className="break-words text-base leading-7 text-secondary-900">
              {question.prompt || "Pertanyaan belum tersedia."}
            </p>
            <div className="flex flex-wrap gap-2">
              <MentorBadge size="compact" tone="category">
                {questionTypeLabel(question.questionType)}
              </MentorBadge>
              <MentorBadge size="compact" tone="neutral">
                {difficultyLabel(question.difficulty)}
              </MentorBadge>
            </div>
            <ol
              aria-label="Pilihan jawaban"
              className="m-0 grid list-none gap-3 p-0"
            >
              {question.choices.map((choice, index) => (
                <li
                  className={`flex min-w-0 items-start gap-3 rounded-xl border px-3 py-3 ${question.correctChoiceIds?.includes(choice.id) ? "border-success-200 bg-success-50/55" : "border-primary-100 bg-primary-50/45"}`}
                  key={choice.id}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-primary-800"
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="min-w-0 break-words pt-0.5 text-sm leading-6 text-secondary-900">
                    {choice.text}
                    {question.correctChoiceIds?.includes(choice.id) ? (
                      <span className="ml-2 text-xs font-semibold text-success-700">
                        Kunci
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TryoutSubtestEditor({
  activeBrowseBank,
  activeDirectQuestions,
  activeSection,
  activeSourceQuestions,
  browseBankId,
  draft,
  guardExternalNavigation,
  onBankPageNext,
  onBankSearchChange,
  onQuestionPageChange,
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
  sourceQuestionPage,
  sourceQuestionSearch,
  sourceQuestionTotal,
  readOnly,
  saving,
}: TryoutSubtestEditorProps) {
  const [previewQuestion, setPreviewQuestion] = useState<SourceQuestion | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<SubtestDetailTab>("info");

  const changeTab = (value: string) => {
    if (value !== "info" && value !== "bank") return;
    setActiveTab(value);
  };

  return (
    <TooltipProvider>
      <>
        <Tabs
          className="w-full min-w-0 gap-5"
          onValueChange={changeTab}
          value={activeTab}
        >
          <FullWidthLineTabsList aria-label="Bagian detail soal">
            <FullWidthLineTabsTrigger
              className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm"
              value="info"
            >
              Informasi dasar
            </FullWidthLineTabsTrigger>
            <FullWidthLineTabsTrigger
              className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm"
              value="bank"
            >
              Pilih bank soal
            </FullWidthLineTabsTrigger>
          </FullWidthLineTabsList>
          <TabsContent className="m-0" value="info">
            <ReferenceSurface
              as="section"
              aria-labelledby="tryout-basic-info-title"
              className="grid gap-5 p-5 sm:p-7"
            >
              <h2
                className="text-xl font-semibold text-secondary-900"
                id="tryout-basic-info-title"
              >
                Informasi dasar
              </h2>
              <div className="grid gap-5">
                <Field>
                  <FieldLabel
                    className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                    htmlFor={`duration-${activeSection.subtest}`}
                  >
                    Durasi <RequiredMark />
                  </FieldLabel>
                  <div className="relative">
                    <FieldInput
                      className={`${REFERENCE_CONTROL_CLASS_NAMES.input} pr-16`}
                      disabled={saving || readOnly || draft.locked}
                      id={`duration-${activeSection.subtest}`}
                      min="1"
                      onChange={(event) =>
                        onUpdateSection({
                          durationMinutes: Number(event.target.value),
                        })
                      }
                      required
                      type="number"
                      value={activeSection.durationMinutes}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-secondary-500">
                      menit
                    </span>
                  </div>
                </Field>
                <ReferenceSurface
                  as="section"
                  aria-label="Metode penilaian CBT"
                  className="grid gap-4 p-4"
                  variant="inset"
                >
                  <OptionSet
                    label="Metode penilaian"
                    onValueChange={(method) =>
                      onUpdateSection({
                        scoringConfig:
                          method === CBT_IRT_2PL_METHOD
                            ? {
                                estimatorVersion: "bounded-map-v1",
                                method: CBT_IRT_2PL_METHOD,
                                modelVersion: "irt-2pl-cbt-v1",
                                normalizationVersion: "logistic-0-100-v1",
                              }
                            : {
                                correctAnswerPoints: 1,
                                method: CBT_FIXED_POINTS_METHOD,
                                unansweredPoints: 0,
                                wrongAnswerPoints: 0,
                              },
                      })
                    }
                    options={[
                      {
                        disabled: readOnly,
                        label: "Poin tetap",
                        value: CBT_FIXED_POINTS_METHOD,
                      },
                      {
                        disabled: readOnly,
                        label: "IRT",
                        tooltip:
                          "IRT membutuhkan kalibrasi yang disetujui untuk seluruh soal sebelum rilis.",
                        value: CBT_IRT_2PL_METHOD,
                      },
                    ]}
                    required
                    value={scoringMethodForSection(activeSection)}
                  />
                </ReferenceSurface>
                <Field>
                  <FieldLabel
                    className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                    htmlFor={`instruction-${activeSection.subtest}`}
                  >
                    Instruksi peserta
                  </FieldLabel>
                  <FieldTextarea
                    className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-32`}
                    disabled={saving || readOnly || draft.locked}
                    id={`instruction-${activeSection.subtest}`}
                    onChange={(event) =>
                      onUpdateSection({ instructions: event.target.value })
                    }
                    placeholder="Instruksi yang dibaca peserta sebelum Test dimulai."
                    value={activeSection.instructions}
                  />
                </Field>
              </div>
            </ReferenceSurface>
          </TabsContent>
          <TabsContent className="m-0" value="bank">
            <TryoutQuestionSourcePanel
              activeBrowseBank={activeBrowseBank}
              activeDirectQuestions={activeDirectQuestions}
              activeSection={activeSection}
              activeSourceQuestions={activeSourceQuestions}
              browseBankId={browseBankId}
              draft={draft}
              guardExternalNavigation={guardExternalNavigation}
              onBankPageNext={onBankPageNext}
              onBankSearchChange={onBankSearchChange}
              onPreviewQuestion={setPreviewQuestion}
              onQuestionPageChange={onQuestionPageChange}
              onQuestionSearchChange={onQuestionSearchChange}
              onSelectBank={onSelectBank}
              onToggleQuestion={onToggleQuestion}
              onUpdateSection={onUpdateSection}
              readOnly={readOnly}
              selectedSourceQuestionIdsSet={selectedSourceQuestionIdsSet}
              sourceBankLoading={sourceBankLoading}
              sourceBankSearch={sourceBankSearch}
              sourceBankTotal={sourceBankTotal}
              sourceBanks={sourceBanks}
              sourceQuestionLoading={sourceQuestionLoading}
              sourceQuestionPage={sourceQuestionPage}
              sourceQuestionSearch={sourceQuestionSearch}
              sourceQuestionTotal={sourceQuestionTotal}
              saving={saving}
            />
          </TabsContent>
        </Tabs>
        <TryoutSourceQuestionPreview
          onClose={() => setPreviewQuestion(null)}
          question={previewQuestion}
        />
      </>
    </TooltipProvider>
  );
}

function tryoutSubtestEditorHref(
  id: string,
  subtest: SubjectCode,
  parentId?: string,
) {
  const href = `/mentor/tryout/${encodeURIComponent(id)}/soal/${encodeURIComponent(subtest)}`;
  return parentId ? `${href}?parent=${encodeURIComponent(parentId)}` : href;
}

function TryoutSubtestIndex({
  draft,
  id,
  parentId,
  onOpenSubtest,
  readOnly,
  saving,
}: {
  draft: TryoutDraft;
  id?: string;
  parentId?: string;
  onOpenSubtest: (
    subtest: SubjectCode,
    event?: { preventDefault: () => void },
  ) => void;
  readOnly: boolean;
  saving: boolean;
}) {
  return (
    <ReferenceSurface
      as="section"
      aria-labelledby="tryout-subtest-index-title"
      className="grid mt-4 gap-5 p-5 sm:p-7"
    >
      <div className="grid gap-1">
        <h2
          className="text-xl font-semibold text-secondary-900"
          id="tryout-subtest-index-title"
        >
          Subtest Tryout
        </h2>
      </div>
      <ul
        aria-label="Daftar subtest Tryout"
        className="m-0 grid list-none gap-3 p-0"
      >
        {draft.sections.map((section) => {
          const href = id
            ? tryoutSubtestEditorHref(id, section.subtest, parentId)
            : undefined;
          const actionLabel = readOnly
            ? `Lihat soal ${section.subtest}`
            : `Edit soal ${section.subtest}`;
          return (
            <li key={section.subtest}>
              {href ? (
                <Button
                  aria-label={actionLabel}
                  className="group h-auto min-h-16 w-full justify-start rounded-2xl border border-primary-100 bg-white px-4 py-3 text-left hover:border-primary-200 hover:bg-primary-50/60 sm:px-5"
                  disabled={saving}
                  nativeButton={false}
                  onClick={(event) => onOpenSubtest(section.subtest, event)}
                  render={<Link href={href} />}
                  variant="ghost"
                >
                  <span className="text-base font-semibold text-secondary-900">
                    {section.subtest}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="ml-auto size-5 shrink-0 text-secondary-400 transition-transform group-hover:translate-x-0.5"
                  />
                </Button>
              ) : (
                <Button
                  aria-label={actionLabel}
                  className="group h-auto min-h-16 w-full justify-start rounded-2xl border border-primary-100 bg-white px-4 py-3 text-left hover:border-primary-200 hover:bg-primary-50/60 sm:px-5"
                  disabled={saving}
                  onClick={() => onOpenSubtest(section.subtest)}
                  variant="ghost"
                >
                  <span className="text-base font-semibold text-secondary-900">
                    {section.subtest}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="ml-auto size-5 shrink-0 text-secondary-400 transition-transform group-hover:translate-x-0.5"
                  />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </ReferenceSurface>
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
        <AlertDialogContent
          className="rounded-5xl"
          pending={saving}
          variant="warning"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Terbitkan Tryout?</AlertDialogTitle>
            <AlertDialogDescription>
              Setelah tryout di-publish dan terdapat siswa mengerjakan, soal
              akan terkunci dan Anda tidak dapat mengubahnya kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="grid gap-2 sm:grid-cols-2">
            <AlertDialogCancel className="w-full" disabled={saving}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full"
              disabled={saving}
              onClick={onConfirmPublish}
              variant="brand"
            >
              {saving ? "Menerbitkan…" : "Terbitkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={onOpenChangeUnpublish} open={unpublishOpen}>
        <AlertDialogContent
          className="rounded-5xl"
          pending={saving}
          variant="warning"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Jadikan Tryout draf?</AlertDialogTitle>
            <AlertDialogDescription>
              Tryout tidak lagi tersedia untuk pendaftaran baru. Riwayat peserta
              dan AssessmentRelease tetap tersimpan. Perintah ini hanya dapat
              dilakukan saat tidak ada peserta yang sedang mengerjakan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || hasActiveAttempt}
              onClick={onConfirmUnpublish}
              variant="brand"
            >
              {saving ? "Memproses…" : "Jadikan draf"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={onOpenChangeDuplicate} open={duplicateOpen}>
        <AlertDialogContent
          className="rounded-5xl"
          pending={saving}
          variant="info"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Duplikasi Tryout?</AlertDialogTitle>
            <AlertDialogDescription>
              Salinan akan dibuat sebagai draf yang dapat diedit. Riwayat
              peserta dan AssessmentRelease Tryout ini tetap tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={onConfirmDuplicate}
              variant="brand"
            >
              <Copy />
              {saving ? "Menyalin…" : "Buat salinan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={onOpenChangeDirtyNavigation}
        open={dirtyNavigationOpen}
      >
        <AlertDialogContent
          className="!max-w-xl rounded-5xl gap-5"
          pending={saving}
          variant="warning"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Perubahan belum disimpan</AlertDialogTitle>
            <AlertDialogDescription>
              Simpan perubahan sebelum meninggalkan halaman, atau buang
              perubahan lokal. Jika penyimpanan gagal, Anda tetap berada di
              sini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="!justify-stretch grid w-full gap-2">
            <AlertDialogCancel
              className="w-full"
              disabled={saving}
              onClick={onCancelDirtyNavigation}
            >
              Tetap di sini
            </AlertDialogCancel>
            <Button
              className="w-full"
              disabled={saving}
              onClick={onConfirmDiscard}
              variant="brandOutline"
            >
              Buang perubahan
            </Button>
            <AlertDialogAction
              className="w-full"
              disabled={saving || !draft.title.trim()}
              onClick={onConfirmSaveDirty}
              variant="brand"
            >
              <Save />
              Simpan dan lanjutkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function useTryoutBuilderState({
  id,
  initialDraft,
  initialSubtest,
  initialSourceBankTotal,
  initialSourceBanks = [],
  operationsInitial,
}: {
  id?: string;
  initialDraft?: TryoutDraft | null;
  initialSubtest?: SubjectCode;
  initialSourceBankTotal?: number;
  initialSourceBanks?: SourceBank[];
  operationsInitial?: TryoutOperationsView & {
    workflow?: CanonicalTryoutWorkflowProjection;
  };
}) {
  const resourceLock = useResourceEditLock();
  const initialFormDraft = useMemo<TryoutDraft>(
    () =>
      normalize(
        initialDraft ?? {
          admissionMode: "open",
          bannerMediaId: null,
          defaultReleasePolicy: "automatic_at_end",
          description: "",
          id: id ?? "baru",
          locked: false,
          sections: defaultSections(),
          status: "draft",
          title: "Draft Tryout Baru",
          updatedAt: 0,
        },
      ),
    [id, initialDraft],
  );

  const [state, dispatch] = useReducer(builderReducer, undefined, () => ({
    activeCode:
      initialSubtest ??
      initialFormDraft.sections.find(
        (section) => !section.directQuestions?.length,
      )?.subtest ??
      "PU",
    browseBankId: initialSourceBanks[0]?.id ?? "",
    dirty: !id,
    dirtyNavigationOpen: false,
    draft: initialFormDraft,
    duplicateOpen: false,
    error: null,
    metadataSaving: false,
    publishOpen: false,
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
    dirty,
    dirtyNavigationOpen,
    draft,
    duplicateOpen,
    error,
    metadataSaving,
    publishOpen,
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
  const pendingHrefRef = useRef<string | null>(null);
  const autosaveInFlightRef = useRef<Promise<boolean> | null>(null);
  const autosaveSnapshotRef = useRef<TryoutDraft | null>(null);
  const autosaveQueuedRef = useRef(false);
  const autosaveRequestRef = useRef<() => void>(() => undefined);

  const hasActiveAttempt = useMemo(() => {
    return Boolean(
      operationsInitial?.attempts.some(
        (attempt) =>
          attempt.attemptState === "in_progress" ||
          attempt.status === "in_progress",
      ) ||
      operationsInitial?.sessions.some((candidate) =>
        candidate.attempts.some(
          (attempt) => attempt.attemptState === "in_progress",
        ),
      ),
    );
  }, [operationsInitial]);

  const mode: WorkflowMode =
    draft.status === "published" ? "published" : "draft";
  const isEditLocked = Boolean(id && !resourceLock.canEdit);
  const isAutosaveSubtest = Boolean(
    initialSubtest && id && mode === "draft" && !draft.locked && dirty,
  );
  const activeSection =
    draft.sections.find((section) => section.subtest === activeCode) ??
    draft.sections[0]!;
  const activeDirectQuestions = activeSection.directQuestions ?? [];
  const selectedSourceQuestionIdsSet = useMemo(() => {
    const ids = new Set<string>();
    draft.sections.forEach((section) => {
      section.directQuestions?.forEach((question) =>
        ids.add(question.sourceQuestionId),
      );
    });
    return ids;
  }, [draft.sections]);

  const sectionReadiness = useMemo(() => {
    return draft.sections.reduce<Record<SubjectCode, SectionReadiness>>(
      (acc, section) => {
        const questions = section.directQuestions ?? [];
        const hasDirectQuestions = Boolean(questions.length);
        const isReady = directQuestionsReady(questions);
        acc[section.subtest] = {
          detail: isReady
            ? `${questions.length} soal ready`
            : hasDirectQuestions
              ? `${questions.length} soal (cek kelengkapan)`
              : "Belum ada soal",
          issueCount: isReady ? 0 : 1,
          status: isReady
            ? "ready"
            : hasDirectQuestions
              ? "in_progress"
              : "setup",
        };
        return acc;
      },
      {} as Record<SubjectCode, SectionReadiness>,
    );
  }, [draft.sections]);

  const configureReady = useMemo(() => {
    return draft.sections.every(
      (section) => sectionReadiness[section.subtest]?.status === "ready",
    );
  }, [draft.sections, sectionReadiness]);

  const activeBrowseBank = sourceBanks.find((bank) => bank.id === browseBankId);
  const activeSourceQuestions = sourceQuestions.filter(
    (question) =>
      question.bankId === browseBankId &&
      question.subjectCode === activeSection.subtest,
  );

  const updateDraft = (change: (current: TryoutDraft) => TryoutDraft) => {
    const nextDraft = change(latestDraftRef.current);
    latestDraftRef.current = nextDraft;
    dispatch({ draft: nextDraft, type: "setDraft" });
    dispatch({ dirty: true, type: "setDirty" });
  };

  const update = (subtest: SubjectCode, change: Partial<TestDraft>) => {
    updateDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.subtest === subtest ? { ...section, ...change } : section,
      ),
    }));
  };

  const toggleDirectQuestion = (question: SourceQuestion) => {
    const currentDraft = latestDraftRef.current;
    const currentSection =
      currentDraft.sections.find((section) => section.subtest === activeCode) ??
      currentDraft.sections[0]!;
    const currentDirectQuestions = currentSection.directQuestions ?? [];
    const selectedInActiveSection = currentDirectQuestions.some(
      (candidate) => candidate.sourceQuestionId === question.id,
    );
    if (selectedInActiveSection) {
      update(activeCode, {
        directQuestions: currentDirectQuestions.filter(
          (candidate) => candidate.sourceQuestionId !== question.id,
        ),
      });
      dispatch({ error: null, type: "setError" });
      return;
    }
    const selectedInAnySection = currentDraft.sections.some((section) =>
      section.directQuestions?.some(
        (candidate) => candidate.sourceQuestionId === question.id,
      ),
    );
    if (selectedInAnySection) {
      dispatch({
        error: "Soal ini sudah dipilih di subtest lain.",
        type: "setError",
      });
      return;
    }
    const bank = sourceBanks.find(
      (candidate) => candidate.id === question.bankId,
    );
    update(activeCode, {
      directQuestions: [
        ...currentDirectQuestions,
        {
          bankId: question.bankId,
          bankTitle: bank?.title,
          difficulty: question.difficulty,
          hasExplanation: Boolean(
            question.explanation.trim() || question.explanationMediaAssetId,
          ),
          hasReadyMedia: true,
          prompt: question.prompt,
          sourceContentDigest: question.questionContentDigest,
          sourceQuestionId: question.id,
          sourceQuestionRevisionId: question.questionRevisionId,
          questionType: question.questionType,
        },
      ],
      testType: "cbt",
    });
    dispatch({ error: null, type: "setError" });
  };

  const save = useCallback(
    async (
      status: "draft" | "published" = "draft",
      redirectWorkspace: Workspace = status === "published"
        ? "schedule"
        : "basics",
      redirectSubtest?: SubjectCode,
    ): Promise<boolean> => {
      const draftToSave = latestDraftRef.current;
      if (id && !resourceLock.canEdit) return false;
      dispatch({ saving: true, type: "setSaving" });
      dispatch({ error: null, type: "setError" });
      try {
        const result = await saveTryoutAction({
          admissionMode: id ? undefined : (draftToSave.admissionMode ?? "open"),
          bannerMediaId: draftToSave.bannerMediaId ?? null,
          defaultResultReleasePolicy: id
            ? undefined
            : defaultPolicyForDraft(draftToSave.defaultReleasePolicy),
          description: draftToSave.description,
          editLease: id ? resourceLock.proof ?? undefined : undefined,
          id,
          sections: draftToSave.sections.map((section) => ({
            directQuestions: section.directQuestions?.map((question) => ({
              sourceContentDigest: question.sourceContentDigest ?? "",
              sourceQuestionId: question.sourceQuestionId,
              sourceQuestionRevisionId: question.sourceQuestionRevisionId ?? "",
            })),
            durationMinutes: section.durationMinutes,
            instructions: section.instructions,
            scoringConfig: section.scoringConfig,
            shuffleItems: true,
            subtest: section.subtest,
            testType: "cbt",
          })),
          status,
          title: draftToSave.title,
        });
        if (!result.ok) {
          showToast(result.message, { variant: "error" });
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
          const nextUrl = new URL(
            redirectSubtest
              ? tryoutSubtestEditorHref(result.result.id, redirectSubtest)
              : `/mentor/tryout/${result.result.id}`,
            window.location.origin,
          );
          if (!redirectSubtest && redirectWorkspace !== "basics")
            nextUrl.searchParams.set("workspace", redirectWorkspace);
          window.location.assign(`${nextUrl.pathname}${nextUrl.search}`);
        }
        return true;
      } catch (saveError) {
        showToast(
          saveError instanceof Error
            ? saveError.message
            : "Tryout belum dapat disimpan. Coba lagi.",
          { variant: "error" },
        );
        return false;
      } finally {
        dispatch({ saving: false, type: "setSaving" });
      }
    },
    [id, resourceLock.canEdit, resourceLock.proof],
  );

  const requestAutosave = useCallback(() => {
    if (!isAutosaveSubtest) return;
    if (autosaveInFlightRef.current) {
      if (autosaveSnapshotRef.current !== latestDraftRef.current)
        autosaveQueuedRef.current = true;
      return;
    }
    const draftSnapshot = latestDraftRef.current;
    const promise = save("draft");
    autosaveInFlightRef.current = promise;
    autosaveSnapshotRef.current = draftSnapshot;
    const finishAutosave = () => {
      if (autosaveInFlightRef.current !== promise) return;
      autosaveInFlightRef.current = null;
      autosaveSnapshotRef.current = null;
      if (!autosaveQueuedRef.current) return;
      autosaveQueuedRef.current = false;
      autosaveRequestRef.current();
    };
    void promise.then(finishAutosave, finishAutosave);
  }, [isAutosaveSubtest, save]);
  useEffect(() => {
    autosaveRequestRef.current = requestAutosave;
  }, [requestAutosave]);

  const duplicate = async () => {
    if (!id || isEditLocked) return;
    dispatch({ saving: true, type: "setSaving" });
    dispatch({ error: null, type: "setError" });
    try {
      const result = await duplicateTryoutAction(id);
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      window.location.assign(
        `/mentor/tryout/${result.result.id}?parent=${encodeURIComponent(id)}`,
      );
    } catch (duplicateError) {
      showToast(
        duplicateError instanceof Error
          ? duplicateError.message
          : "Tryout belum dapat disalin. Coba lagi.",
        { variant: "error" },
      );
    } finally {
      dispatch({ saving: false, type: "setSaving" });
    }
  };

  const unpublish = async () => {
    if (!id || isEditLocked) return;
    dispatch({ saving: true, type: "setSaving" });
    dispatch({ error: null, type: "setError" });
    try {
      const result = await unpublishTryoutAction(id, resourceLock.proof ?? undefined);
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      window.location.assign(`/mentor/tryout/${id}`);
    } catch (unpublishError) {
      showToast(
        unpublishError instanceof Error
          ? unpublishError.message
          : "Tryout belum dapat dikembalikan ke draf. Coba lagi.",
        { variant: "error" },
      );
    } finally {
      dispatch({ saving: false, type: "setSaving" });
    }
  };

  const archive = async () => {
    if (!id || isEditLocked) return;
    dispatch({ saving: true, type: "setSaving" });
    dispatch({ error: null, type: "setError" });
    try {
      const result = await archiveTryoutAction(id, resourceLock.proof ?? undefined);
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      window.location.assign("/mentor/tryout");
    } catch (archiveError) {
      showToast(
        archiveError instanceof Error
          ? archiveError.message
          : "Tryout belum dapat diarsipkan. Coba lagi.",
        { variant: "error" },
      );
    } finally {
      dispatch({ saving: false, type: "setSaving" });
    }
  };

  const remove = async () => {
    if (!id || isEditLocked) return;
    dispatch({ saving: true, type: "setSaving" });
    dispatch({ error: null, type: "setError" });
    try {
      const result = await deleteTryoutAction(id, resourceLock.proof ?? undefined);
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      window.location.assign("/mentor/tryout");
    } catch (deleteError) {
      showToast(
        deleteError instanceof Error
          ? deleteError.message
          : "Tryout belum dapat dihapus. Coba lagi.",
        { variant: "error" },
      );
    } finally {
      dispatch({ saving: false, type: "setSaving" });
    }
  };

  const saveMetadata = async () => {
    if (!id || isEditLocked) return;
    const draftToSave = latestDraftRef.current;
    dispatch({ saving: true, type: "setMetadataSaving" });
    dispatch({ error: null, type: "setError" });
    try {
      const result = await updateTryoutMetadataAction({
        bannerMediaId: draftToSave.bannerMediaId ?? null,
        description: draftToSave.description,
        editLease: resourceLock.proof ?? undefined,
        id,
        title: draftToSave.title,
      });
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      const nextDraft = normalize(result.result);
      savedDraftRef.current = nextDraft;
      if (latestDraftRef.current === draftToSave) {
        latestDraftRef.current = nextDraft;
        dispatch({ draft: nextDraft, type: "setDraft" });
        dispatch({ dirty: false, type: "setDirty" });
      }
    } catch (metadataError) {
      showToast(
        metadataError instanceof Error
          ? metadataError.message
          : "Konten Tryout belum dapat disimpan.",
        { variant: "error" },
      );
    } finally {
      dispatch({ saving: false, type: "setMetadataSaving" });
    }
  };

  const discardDraft = () => {
    latestDraftRef.current = savedDraftRef.current;
    dispatch({ draft: savedDraftRef.current, type: "setDraft" });
    dispatch({ dirty: false, type: "setDirty" });
  };

  useEffect(() => {
    if (initialSubtest || !dirty || mode !== "draft") return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, initialSubtest, mode]);

  useEffect(() => {
    if (!isAutosaveSubtest) return;
    const timer = window.setTimeout(() => autosaveRequestRef.current(), 5000);
    return () => window.clearTimeout(timer);
  }, [draft, isAutosaveSubtest]);

  useEffect(() => {
    if (!initialSubtest || !id) return;
    const flushAutosave = () => autosaveRequestRef.current();
    const handlePageHide = () => flushAutosave();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushAutosave();
    };
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushAutosave();
    };
  }, [id, initialSubtest]);

  useEffect(() => {
    if (!initialSubtest || mode === "published" || draft.locked) return;
    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        dispatch({ loading: true, type: "setSourceBankLoading" });
        try {
          const result = await listQuestionBankSourcePageAction({
            page: sourceBankPage,
            pageSize: 20,
            purpose: "tryout",
            search: sourceBankSearch,
            subjectCoverage: [activeSection.subtest],
          });
          if (cancelled) return;
          const nextBanks = result.items.map(({ bank }) => bank as SourceBank);
          dispatch({
            banks: nextBanks,
            total: result.total,
            type: "setSourceBankResults",
          });
        } catch (sourceError) {
          if (!cancelled)
            dispatch({
              error:
                sourceError instanceof Error
                  ? sourceError.message
                  : "Bank Soal belum dapat dimuat.",
              type: "setError",
            });
        } finally {
          dispatch({ loading: false, type: "setSourceBankLoading" });
        }
      },
      sourceBankSearch.trim() ? 250 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activeSection.subtest,
    draft.locked,
    initialSubtest,
    mode,
    sourceBankPage,
    sourceBankSearch,
  ]);

  useEffect(() => {
    if (
      !initialSubtest ||
      mode === "published" ||
      draft.locked ||
      !browseBankId
    )
      return;
    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        dispatch({ loading: true, type: "setSourceQuestionLoading" });
        try {
          const result = await listQuestionBankSourceQuestionsAction(
            browseBankId,
            {
              page: sourceQuestionPage,
              pageSize: SOURCE_QUESTION_PAGE_SIZE,
              purpose: "tryout",
              search: sourceQuestionSearch,
              subjectCode: activeSection.subtest,
            },
          );
          if (cancelled || !result) return;
          const incoming = result.questions as SourceQuestion[];
          dispatch({
            questions: incoming,
            total: result.total,
            type: "setSourceQuestionResults",
          });
        } catch (sourceError) {
          if (!cancelled)
            dispatch({
              error:
                sourceError instanceof Error
                  ? sourceError.message
                  : "Soal siap belum dapat dimuat.",
              type: "setError",
            });
        } finally {
          dispatch({ loading: false, type: "setSourceQuestionLoading" });
        }
      },
      sourceQuestionSearch.trim() ? 200 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activeSection.subtest,
    browseBankId,
    draft.locked,
    initialSubtest,
    mode,
    sourceQuestionPage,
    sourceQuestionSearch,
  ]);

  const guardExternalNavigation = (
    href: string,
    event: { preventDefault: () => void },
  ) => {
    if (initialSubtest && id && mode === "draft" && !draft.locked) {
      autosaveRequestRef.current();
      return;
    }
    if (!dirty || mode !== "draft") return;
    event.preventDefault();
    pendingHrefRef.current = href;
    dispatch({ open: true, type: "setDirtyNavigationOpen" });
  };

  return {
    activeBrowseBank,
    activeCode,
    activeDirectQuestions,
    activeSection,
    activeSourceQuestions,
    archive,
    browseBankId,
    configureReady,
    discardDraft,
    dirty,
    dirtyNavigationOpen,
    dispatch,
    draft,
    duplicate,
    duplicateOpen,
    error,
    guardExternalNavigation,
    hasActiveAttempt,
    metadataSaving,
    mode,
    pendingHrefRef,
    publishOpen,
    save,
    saveMetadata,
    savedDraftRef,
    saving,
    sectionReadiness,
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
    toggleDirectQuestion,
    unpublish,
    remove,
    updateDraft,
    unpublishOpen,
    update,
    editLocked: isEditLocked,
    lockState: (id ? resourceLock.state : "owned") as AuthoringLockState,
    retryLock: resourceLock.retry,
  };
}

function TryoutBuilderHeaderActions({
  configureReady,
  draft,
  id,
  mode,
  onPublishClick,
  saving,
}: Pick<
  ComponentProps<typeof TryoutBuilderHeader>,
  "draft" | "id" | "mode" | "saving"
> & {
  configureReady: boolean;
  onPublishClick: () => void;
}) {
  if (!id) return undefined;

  return (
    <div className="flex items-center gap-2">
      {mode === "draft" && !draft.locked ? (
        <Button
          aria-busy={saving}
          aria-label="Terbitkan Tryout"
          disabled={saving || !configureReady}
          onClick={onPublishClick}
          title={
            configureReady
              ? "Terbitkan Tryout"
              : "Lengkapi semua subtest sebelum menerbitkan."
          }
          type="button"
          variant="brand"
        >
          <SendHorizontal />
          {saving ? "Menerbitkan…" : "Terbitkan"}
        </Button>
      ) : null}
    </div>
  );
}

function TryoutBuilderNotices({
  error,
  guardExternalNavigation,
  initialParent,
  mode,
}: Pick<
  React.ComponentProps<typeof TryoutBuilderHeader>,
  "error" | "guardExternalNavigation" | "initialParent" | "mode"
>) {
  return (
    <>
      {error ? (
        <p
          className="mt-4 flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm leading-6 text-danger-500"
          role="alert"
        >
          <CircleAlert className="mt-1 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {initialParent && mode === "draft" ? (
        <ReferenceSurface
          className="mt-4 flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 text-sm leading-6 text-secondary-700"
          role="status"
          variant="inset"
        >
          <div>
            <p className="font-semibold text-secondary-900">Draf perubahan</p>
            <p className="mt-1">
              Berdasarkan “{initialParent.title}”
              {initialParent.publishedAt
                ? ` · diterbitkan ${formatTryoutDateTime(initialParent.publishedAt)}`
                : ""}
              . Perubahan di sini tidak memengaruhi versi terbit, sesi, atau
              hasil sebelumnya.
            </p>
          </div>
          <Button
            nativeButton={false}
            onClick={(event) =>
              guardExternalNavigation(
                `/mentor/tryout/${initialParent.id}`,
                event,
              )
            }
            render={<Link href={`/mentor/tryout/${initialParent.id}`} />}
            size="sm"
            variant="brandOutline"
          >
            Lihat versi terbit
          </Button>
        </ReferenceSurface>
      ) : null}
    </>
  );
}

function TryoutBuilderHeader({
  configureReady,
  draft,
  error,
  guardExternalNavigation,
  id,
  activeWorkspace,
  initialSubtest,
  initialParent,
  mode,
  onPublishClick,
  onWorkspaceChange,
  saving,
}: {
  activeWorkspace: TryoutWorkspaceTab;
  configureReady: boolean;
  draft: TryoutDraft;
  error: string | null;
  guardExternalNavigation: (
    href: string,
    event: { preventDefault: () => void },
  ) => void;
  id?: string;
  initialSubtest?: SubjectCode;
  initialParent?: { id: string; publishedAt?: string; title: string };
  mode: "draft" | "published";
  onPublishClick: () => void;
  onWorkspaceChange: (tab: TryoutWorkspaceTab) => void;
  saving: boolean;
}) {
  const isSubtestEditor = Boolean(initialSubtest && id);
  const isReadOnly = mode === "published" || draft.locked;
  const backHref = isSubtestEditor
    ? `/mentor/tryout/${encodeURIComponent(id!)}${initialParent ? `?parent=${encodeURIComponent(initialParent.id)}` : ""}`
    : "/mentor/tryout";
  const backLabel = isSubtestEditor
    ? "Kembali ke daftar subtest"
    : "Kembali ke semua Tryout";
  const actions = (
    <TryoutBuilderHeaderActions
      configureReady={configureReady}
      draft={draft}
      id={id}
      mode={mode}
      onPublishClick={onPublishClick}
      saving={saving}
    />
  );
  const workspaceBackHref = isSubtestEditor
    ? `/mentor/tryout/${encodeURIComponent(id!)}?workspace=sections${initialParent ? `&parent=${encodeURIComponent(initialParent.id)}` : ""}`
    : undefined;

  if (id) {
    return (
      <>
        <TryoutWorkspaceHeader
          activeTab={isSubtestEditor ? "subtests" : activeWorkspace}
          actions={actions}
          backHref={workspaceBackHref}
          backLabel={isSubtestEditor ? "Kembali ke Subtest" : undefined}
          id={id}
          locked={draft.locked}
          onTabChange={onWorkspaceChange}
          onNavigate={(href, event) => guardExternalNavigation(href, event)}
          parentId={initialParent?.id}
          showTabs={!isSubtestEditor}
          title={isSubtestEditor ? `Subtes ${initialSubtest}` : draft.title}
        />
        <TryoutBuilderNotices
          error={error}
          guardExternalNavigation={guardExternalNavigation}
          initialParent={initialParent}
          mode={mode}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex min-w-0 items-start gap-3">
        <Button
          aria-label={backLabel}
          className="mt-1 shrink-0 rounded-xl text-secondary-500 hover:bg-primary-50 hover:text-secondary-900"
          nativeButton={false}
          onClick={(event) => guardExternalNavigation(backHref, event)}
          render={<Link href={backHref} />}
          size="icon"
          title={backLabel}
          variant="ghost"
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Button>
        <ReferencePageHeader
          className="min-w-0 flex-1"
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {initialSubtest ? (
                <span>{subjectName(initialSubtest)}</span>
              ) : null}
              {mode === "published" && !initialSubtest ? (
                <span>Kelola akses, sesi, dan hasil untuk Tryout ini.</span>
              ) : null}
              {initialSubtest && mode === "draft" && saving ? (
                <span aria-live="polite">Menyimpan otomatis…</span>
              ) : null}
            </span>
          }
          title={
            initialSubtest
              ? `${isReadOnly ? "Detail" : "Edit"} Soal ${initialSubtest}`
              : id
                ? "Konten Tryout"
                : "Buat Tryout"
          }
          actions={actions}
        />
      </div>
      <TryoutBuilderNotices
        error={error}
        guardExternalNavigation={guardExternalNavigation}
        initialParent={initialParent}
        mode={mode}
      />
    </>
  );
}

function TryoutBuilderContent({
  id,
  initialDraft,
  initialParent,
  initialSubtest,
  initialWorkspace,
  operationsInitial,
  initialSourceBankTotal,
  initialSourceBanks,
}: {
  id?: string;
  initialDeliveryArea?: string;
  initialDraft?: TryoutDraft | null;
  initialParent?: { id: string; publishedAt?: string; title: string };
  initialSessionId?: string;
  initialSubtest?: SubjectCode;
  initialSourceBankTotal?: number;
  initialSourceBanks?: SourceBank[];
  initialWorkspace?: TryoutWorkspaceTab;
  operationsInitial?: TryoutOperationsView & {
    workflow?: CanonicalTryoutWorkflowProjection;
  };
}) {
  const [activeWorkspace, setActiveWorkspace] = useState<TryoutWorkspaceTab>(
    initialSubtest ? "subtests" : initialWorkspace ?? "identity",
  );
  const {
    activeBrowseBank,
    activeDirectQuestions,
    activeSection,
    activeSourceQuestions,
    archive,
    browseBankId,
    configureReady,
    discardDraft,
    dirtyNavigationOpen,
    dispatch,
    dirty,
    editLocked,
    draft,
    duplicate,
    duplicateOpen,
    error,
    guardExternalNavigation,
    hasActiveAttempt,
    metadataSaving,
    mode,
    pendingHrefRef,
    publishOpen,
    save,
    saveMetadata,
    saving,
    lockState,
    retryLock,
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
    toggleDirectQuestion,
    unpublish,
    remove,
    unpublishOpen,
    updateDraft,
    update,
  } = useTryoutBuilderState({
    id,
    initialDraft,
    initialSubtest,
    initialSourceBanks,
    initialSourceBankTotal,
    operationsInitial,
  });
  const viewDraft = editLocked ? { ...draft, locked: true } : draft;
  const viewSaving = saving || editLocked;
  const viewMetadataSaving = metadataSaving || editLocked;
  return (
    <div className="mx-auto min-w-0 w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <TryoutBuilderHeader
        activeWorkspace={activeWorkspace}
        configureReady={configureReady}
        draft={viewDraft}
        error={error}
        guardExternalNavigation={guardExternalNavigation}
        id={id}
        initialSubtest={initialSubtest}
        initialParent={initialParent}
        mode={mode}
        onPublishClick={() => dispatch({ open: true, type: "setPublishOpen" })}
        onWorkspaceChange={setActiveWorkspace}
        saving={viewSaving}
      />

      {id ? <ResourceAuthoringLockBanner hasLocalChanges={dirty} onRetry={retryLock} resourceLabel="Tryout" state={lockState} /> : null}

      {initialSubtest ? (
        <TryoutSubtestEditor
          activeBrowseBank={activeBrowseBank}
          activeDirectQuestions={activeDirectQuestions}
          activeSection={activeSection}
          activeSourceQuestions={activeSourceQuestions}
          browseBankId={browseBankId}
          draft={viewDraft}
          guardExternalNavigation={guardExternalNavigation}
          onBankPageNext={() =>
            dispatch({ page: sourceBankPage + 1, type: "setSourceBankPage" })
          }
          onBankSearchChange={(search) =>
            dispatch({ search, type: "setSourceBankSearch" })
          }
          onQuestionPageChange={(page) =>
            dispatch({ page, type: "setSourceQuestionPage" })
          }
          onQuestionSearchChange={(search) =>
            dispatch({ search, type: "setSourceQuestionSearch" })
          }
          onSelectBank={(bankId) =>
            dispatch({ bankId, type: "setBrowseBankId" })
          }
          onToggleQuestion={toggleDirectQuestion}
          onUpdateSection={(change) => update(activeSection.subtest, change)}
          readOnly={mode === "published" || viewDraft.locked}
          selectedSourceQuestionIdsSet={selectedSourceQuestionIdsSet}
          sourceBankLoading={sourceBankLoading}
          sourceBankSearch={sourceBankSearch}
          sourceBankTotal={sourceBankTotal}
          sourceBanks={sourceBanks}
          sourceQuestionLoading={sourceQuestionLoading}
          sourceQuestionPage={sourceQuestionPage}
          sourceQuestionSearch={sourceQuestionSearch}
          sourceQuestionTotal={sourceQuestionTotal}
          saving={viewSaving}
        />
      ) : activeWorkspace === "subtests" ? (
        <TryoutSubtestIndex
          draft={viewDraft}
          id={id}
          parentId={initialParent?.id}
          onOpenSubtest={(subtest, event) => {
            if (!id) {
              void save("draft", "basics", subtest);
              return;
            }
            if (event)
              guardExternalNavigation(
                tryoutSubtestEditorHref(id, subtest, initialParent?.id),
                event,
              );
          }}
          readOnly={mode === "published" || viewDraft.locked}
          saving={viewSaving}
        />
      ) : activeWorkspace === "operations" && operationsInitial ? (
        <ReferenceSurface as="section" className="mt-4 p-5 sm:p-7">
          <KaptenTryoutOperationsModule embedded initial={operationsInitial} />
        </ReferenceSurface>
      ) : activeWorkspace === "participants" && operationsInitial ? (
        <ReferenceSurface as="section" className="mt-4 p-5 sm:p-7">
          <KaptenTryoutParticipantsPageModule
            embedded
            initial={operationsInitial}
            parentId={initialParent?.id}
          />
        </ReferenceSurface>
      ) : activeWorkspace === "settings" ? (
        <KaptenTryoutSettingsPageModule
          draft={{ locked: viewDraft.locked, status: viewDraft.status, title: viewDraft.title }}
          error={error}
          hasActiveAttempt={hasActiveAttempt}
          onArchive={() => void archive()}
          onDelete={() => void remove()}
          onDuplicate={() => dispatch({ open: true, type: "setDuplicateOpen" })}
          onUnpublish={() => dispatch({ open: true, type: "setUnpublishOpen" })}
          saving={viewSaving}
        />
      ) : (
        <TryoutIdentityPanel
          draft={viewDraft}
          metadataSaving={viewMetadataSaving}
          mode={mode}
          onBannerChange={(bannerMediaId) =>
            updateDraft((current) => ({ ...current, bannerMediaId }))
          }
          onDescriptionChange={(description) =>
            updateDraft((current) => ({ ...current, description }))
          }
          onSaveMetadata={() => void saveMetadata()}
          onTitleChange={(title) =>
            updateDraft((current) => ({ ...current, title }))
          }
          saving={viewSaving}
        />
      )}

      <TryoutLifecycleModals
        dirtyNavigationOpen={dirtyNavigationOpen}
        draft={viewDraft}
        duplicateOpen={duplicateOpen}
        hasActiveAttempt={hasActiveAttempt}
        onCancelDirtyNavigation={() => {
          pendingHrefRef.current = null;
          dispatch({ open: false, type: "setDirtyNavigationOpen" });
        }}
        onConfirmDiscard={() => {
          const href = pendingHrefRef.current;
          discardDraft();
          pendingHrefRef.current = null;
          dispatch({ open: false, type: "setDirtyNavigationOpen" });
          if (href) window.location.assign(href);
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
          const href = pendingHrefRef.current;
          void save("draft").then((ok) => {
            if (ok && href) window.location.assign(href);
            if (ok) {
              pendingHrefRef.current = null;
              dispatch({ open: false, type: "setDirtyNavigationOpen" });
            }
          });
        }}
        onConfirmUnpublish={() => {
          dispatch({ open: false, type: "setUnpublishOpen" });
          void unpublish();
        }}
        onOpenChangeDirtyNavigation={(open) => {
          if (!saving) dispatch({ open, type: "setDirtyNavigationOpen" });
        }}
        onOpenChangeDuplicate={(open) => {
          if (!saving) dispatch({ open, type: "setDuplicateOpen" });
        }}
        onOpenChangePublish={(open) => {
          if (!saving) dispatch({ open, type: "setPublishOpen" });
        }}
        onOpenChangeUnpublish={(open) => {
          if (!saving) dispatch({ open, type: "setUnpublishOpen" });
        }}
        publishOpen={publishOpen}
        saving={viewSaving}
        unpublishOpen={unpublishOpen}
      />
    </div>
  );
}

function KaptenTryoutBuilderPageModule(props: {
  id?: string;
  initialDeliveryArea?: string;
  initialDraft?: TryoutDraft | null;
  initialParent?: { id: string; publishedAt?: string; title: string };
  initialSessionId?: string;
  initialSubtest?: SubjectCode;
  initialSourceBankTotal?: number;
  initialSourceBanks?: SourceBank[];
  initialWorkspace?: TryoutWorkspaceTab;
  operationsInitial?: TryoutOperationsView & { workflow?: CanonicalTryoutWorkflowProjection };
}) {
  return (
    <ResourceEditLockProvider
      enabled={Boolean(props.id)}
      resourceId={props.id ?? "00000000-0000-4000-8000-000000000000"}
      resourceType="tryout"
    >
      <TryoutBuilderContent {...props} />
    </ResourceEditLockProvider>
  );
}

export { KaptenTryoutBuilderPageModule };

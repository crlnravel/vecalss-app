"use client";

import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  FilePenLine,
  ImagePlus,
  Pencil,
  Save,
  Trash2,
  X,
} from "@/lib/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { showToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldInput, FieldTextarea } from "@/components/ui/field";
import { MentorBadge } from "@/components/ui/mentor-badge";
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
import { OptionSet } from "@/modules/mentor/KaptenTryoutOperationalShared";
import {
  type DefaultPolicy,
  type Mode,
} from "@/modules/mentor/KaptenTryoutOperationsData";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import {
  CBT_FIXED_POINTS_METHOD,
  CBT_IRT_2PL_METHOD,
} from "@/lib/tryout/cbt-scoring-policy";
import { MediaAssetPreview } from "@/modules/media/media-library";
import { TryoutBannerUploadDialog } from "@/modules/mentor/components/tryout-banner-upload-dialog";
import { UnsavedChangesConfirmationDialog } from "@/modules/mentor/components/unsaved-changes-confirmation-dialog";
import {
  listQuestionBankSourcePageAction,
  listQuestionBankSourceQuestionsAction,
} from "@/modules/mentor/question-bank-actions";
import {
  duplicateTryoutAction,
  archiveTryoutAction,
  deleteTryoutAction,
  importTryoutBankQuestionSnapshotsAction,
  saveTryoutAction,
  setTryoutHiddenAction,
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
import {
  TRYOUT_SOURCE_QUESTION_PAGE_SIZE,
  TryoutSectionQuestionManager,
  type TryoutDirectQuestionDraft,
  type TryoutQuestionChange,
  type TryoutQuestionImportOutcome,
  type TryoutQuestionImportRequest,
  type TryoutQuestionSnapshotDraft,
  type TryoutSourceBank,
  type TryoutSourceQuestion,
} from "@/modules/mentor/components/tryout-section-question-manager";

const subjectCodes = kaptenSubjects.map((subject) => subject.code) as Array<
  "PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM"
>;
type SubjectCode = (typeof subjectCodes)[number];
type DirectQuestionDraft = TryoutDirectQuestionDraft;
type TestDraft = {
  directQuestions?: DirectQuestionDraft[];
  durationMinutes: number;
  instructions: string;
  packageVersionId?: string | null;
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
  isHidden?: boolean;
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
type SourceBank = TryoutSourceBank;
type SourceQuestion = TryoutSourceQuestion;
type Workspace = "basics" | "schedule";
type WorkflowMode = "draft" | "published";
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
  // Server-side validation handles content readiness; the section needs at least one question.
  return questions.length > 0;
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

function TryoutBannerHero({
  bannerMediaId,
  disabled,
  onSave,
  onChange,
  presentation,
}: {
  bannerMediaId?: string | null;
  disabled: boolean;
  onSave?: () => void;
  onChange: (bannerMediaId: string | null) => void;
  presentation: "dialog" | "page";
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleBannerChange = (nextBannerMediaId: string | null) => {
    onChange(nextBannerMediaId);
    onSave?.();
  };

  return (
    <section
      aria-label="Banner Tryout"
      className="grid min-w-0 max-w-full gap-2"
    >
      <div
        className={`group relative min-w-0 max-w-full overflow-hidden border border-primary-100 bg-primary-50 ${
          presentation === "dialog"
            ? "aspect-[2.85/1] min-h-52 rounded-[2.5rem] sm:min-h-72 lg:min-h-[22.5rem]"
            : "aspect-[6/1] min-h-40 rounded-3xl sm:min-h-48"
        }`}
      >
        {bannerMediaId ? (
          <MediaAssetPreview
            alt="Banner Tryout"
            assetId={bannerMediaId}
            className="absolute inset-0 min-h-0 min-w-0 w-full max-w-full [&_img]:object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary-50 px-6 text-center text-secondary-600">
            <ImagePlus
              aria-hidden="true"
              className={
                presentation === "dialog"
                  ? "size-10 text-primary-700"
                  : "size-7 text-primary-700"
              }
            />
            <span
              className={`font-semibold ${presentation === "dialog" ? "text-xl" : "text-sm"}`}
            >
              Belum ada banner
            </span>
          </div>
        )}
        <div
          aria-hidden="true"
          className={`absolute inset-0 transition-colors ${
            presentation === "dialog"
              ? "bg-secondary-950/0 group-hover:bg-secondary-950/20 group-focus-within:bg-secondary-950/10"
              : "bg-secondary-950/20 group-hover:bg-secondary-950/30"
          }`}
        />
        <TooltipProvider>
          <div
            className={`absolute flex items-center gap-2 ${
              presentation === "dialog"
                ? "right-5 top-5 sm:right-7 sm:top-7"
                : "right-4 top-4"
            }`}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Ubah banner Tryout"
                    className={`rounded-xl bg-white/95 text-secondary-900 shadow-sm hover:bg-white hover:text-secondary-900 ${
                      presentation === "dialog"
                        ? "size-12 sm:size-16 lg:size-[5.25rem] lg:rounded-2xl"
                        : "size-11"
                    }`}
                    disabled={disabled}
                    onClick={() => setPickerOpen(true)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <Pencil
                  aria-hidden="true"
                  className={presentation === "dialog" ? "size-5 lg:size-6" : "size-4"}
                />
              </TooltipTrigger>
              <TooltipContent>Ubah banner Tryout</TooltipContent>
            </Tooltip>
            {bannerMediaId ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="Hapus banner Tryout"
                      className={`rounded-xl bg-white/95 text-secondary-900 shadow-sm hover:bg-white hover:text-secondary-900 ${
                        presentation === "dialog"
                          ? "size-12 sm:size-16 lg:size-[5.25rem] lg:rounded-2xl"
                          : "size-11"
                      }`}
                      disabled={disabled}
                      onClick={() => handleBannerChange(null)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    />
                  }
                >
                  <Trash2
                    aria-hidden="true"
                    className={presentation === "dialog" ? "size-5 lg:size-6" : "size-4"}
                  />
                </TooltipTrigger>
                <TooltipContent>Hapus banner Tryout</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </TooltipProvider>
      </div>
      <TryoutBannerUploadDialog
        onOpenChange={setPickerOpen}
        onSelect={handleBannerChange}
        open={pickerOpen && !disabled}
      />
    </section>
  );
}

function TryoutTitleField({
  disabled,
  isSaving,
  onChange,
  onSave,
  presentation,
  value,
}: {
  disabled: boolean;
  isSaving: boolean;
  onChange: (title: string) => void;
  onSave: () => void;
  presentation: "dialog" | "page";
  value: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const save = () => {
    const next = draft.trim();
    if (!next) {
      cancel();
      return;
    }
    onChange(next);
    setEditing(false);
    onSave();
  };

  if (editing) {
    return (
      <div className="grid gap-2">
        <FieldInput
          autoFocus
          className={`${REFERENCE_CONTROL_CLASS_NAMES.input} font-semibold tracking-tight ${presentation === "dialog" ? "h-14 text-3xl sm:h-16 sm:text-4xl" : "h-12 text-2xl md:text-3xl"}`}
          disabled={disabled || isSaving}
          id="tryout-title"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            } else if (event.key === "Escape") {
              cancel();
            }
          }}
          required
          value={draft}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled || isSaving || !draft.trim()}
            onClick={save}
            size="sm"
            type="button"
            variant="brand"
          >
            <Check aria-hidden="true" />
            Simpan
          </Button>
          <Button
            disabled={disabled || isSaving}
            onClick={cancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
            Batal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3">
      <h2
        className={`min-w-0 break-words font-semibold text-secondary-900 ${
          presentation === "dialog"
            ? "text-4xl leading-[1.08] tracking-[-0.035em] sm:text-5xl lg:text-6xl"
            : "text-3xl tracking-tight md:text-4xl"
        }`}
      >
        {value || "Tryout tanpa judul"}
      </h2>
      {!disabled ? (
        <Button
          aria-label="Ubah judul Tryout"
          className={`shrink-0 text-secondary-400 opacity-70 hover:text-secondary-900 group-hover:opacity-100 ${
            presentation === "dialog" ? "mt-2 size-10 sm:size-11" : "mt-1 size-8"
          }`}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          size={presentation === "dialog" ? "icon" : "icon-sm"}
          title="Ubah judul Tryout"
          type="button"
          variant="ghost"
        >
          <Pencil
            aria-hidden="true"
            className={presentation === "dialog" ? "size-5" : "size-4"}
          />
        </Button>
      ) : null}
    </div>
  );
}

function TryoutDescriptionField({
  disabled,
  isSaving,
  onChange,
  onSave,
  presentation,
  value,
}: {
  disabled: boolean;
  isSaving: boolean;
  onChange: (description: string) => void;
  onSave: () => void;
  presentation: "dialog" | "page";
  value: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const save = () => {
    onChange(draft.trim());
    setEditing(false);
    onSave();
  };

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span
          className={`font-semibold text-secondary-500 ${presentation === "dialog" ? "text-lg sm:text-xl" : "text-xs"}`}
        >
          Deskripsi
        </span>
        {!editing && !disabled ? (
          <Button
            aria-label="Ubah deskripsi Tryout"
            className={`text-secondary-400 hover:text-secondary-900 ${presentation === "dialog" ? "size-9 sm:size-10" : "size-7"}`}
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            size={presentation === "dialog" ? "icon" : "icon-sm"}
            title="Ubah deskripsi Tryout"
            type="button"
            variant="ghost"
          >
            <Pencil
              aria-hidden="true"
              className={presentation === "dialog" ? "size-5" : "size-3.5"}
            />
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 grid gap-2">
          <FieldTextarea
            autoFocus
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} ${presentation === "dialog" ? "min-h-40 text-lg leading-7 sm:min-h-48 sm:text-xl" : "min-h-[110px] text-sm leading-6"}`}
            disabled={disabled || isSaving}
            id="tryout-description"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Tuliskan deskripsi ringkas tentang Tryout ini…"
            value={draft}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={disabled || isSaving}
              onClick={save}
              size="sm"
              type="button"
              variant="brand"
            >
              <Check aria-hidden="true" />
              Simpan
            </Button>
            <Button
              disabled={disabled || isSaving}
              onClick={cancel}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <p
          className={`mt-1 leading-7 ${presentation === "dialog" ? "text-lg text-secondary-600 sm:text-2xl sm:leading-9" : "text-sm text-secondary-700 leading-6"}`}
        >
          {value || (
            <span
              className={`italic ${presentation === "dialog" ? "text-secondary-500" : "text-secondary-400"}`}
            >
              Belum ada deskripsi untuk Tryout ini. Klik ikon pensil untuk
              menambahkan.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function TryoutIdentityPanel({
  draft,
  metadataSaving,
  mode,
  onBannerChange,
  onCreate,
  onDescriptionChange,
  onSaveMetadata,
  onTitleChange,
  presentation = "page",
  saving,
}: {
  draft: TryoutDraft;
  metadataSaving: boolean;
  mode: WorkflowMode;
  onBannerChange: (bannerMediaId: string | null) => void;
  onCreate?: () => void;
  onDescriptionChange: (description: string) => void;
  onSaveMetadata: () => void;
  onTitleChange: (title: string) => void;
  presentation?: "dialog" | "page";
  saving: boolean;
}) {
  const identityDisabled =
    saving || metadataSaving || (mode === "draft" && draft.locked);
  const isSaving = saving || metadataSaving;
  const informationCard = (
    <ReferenceSurface
      aria-labelledby="tryout-basic-info-title"
      as="section"
      className={`grid min-w-0 w-full max-w-full overflow-hidden ${
        presentation === "dialog"
          ? "gap-14 rounded-[2.75rem] p-5 sm:p-8 lg:p-14"
          : "gap-7 p-5 sm:p-7"
      }`}
    >
      <h2 className="sr-only" id="tryout-basic-info-title">
        Informasi Tryout
      </h2>
      <TryoutBannerHero
        bannerMediaId={draft.bannerMediaId}
        disabled={identityDisabled}
        onChange={onBannerChange}
        onSave={onSaveMetadata}
        presentation={presentation}
      />
      <TryoutTitleField
        disabled={identityDisabled}
        isSaving={isSaving}
        onChange={onTitleChange}
        onSave={onSaveMetadata}
        presentation={presentation}
        value={draft.title}
      />
      <TryoutDescriptionField
        disabled={identityDisabled}
        isSaving={isSaving}
        onChange={onDescriptionChange}
        onSave={onSaveMetadata}
        presentation={presentation}
        value={draft.description}
      />
    </ReferenceSurface>
  );

  return (
    <>
      <div
        className={
          presentation === "dialog"
            ? "grid min-w-0 w-full gap-5 sm:gap-12"
            : "grid min-w-0 w-full gap-6"
        }
      >
        {informationCard}
      </div>
      {onCreate ? (
        <Button
          aria-busy={saving}
          aria-label="Buat Tryout"
          className={
            presentation === "dialog"
              ? "h-[5.5rem] w-full rounded-3xl text-2xl sm:rounded-[1.5rem] sm:text-2xl"
              : "mt-4 w-full"
          }
          disabled={saving || !draft.title.trim()}
          onClick={onCreate}
          type="button"
          variant="brand"
        >
          <Save className={presentation === "dialog" ? "size-6" : undefined} />
          {saving ? "Membuat…" : "Buat"}
        </Button>
      ) : null}
    </>
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
  onImport: (
    subtest: SubjectCode,
    request: TryoutQuestionImportRequest,
  ) => Promise<TryoutQuestionImportOutcome>;
  onMoveQuestion: (
    subtest: SubjectCode,
    snapshotId: string,
    direction: "up" | "down",
  ) => void;
  onQuestionPageChange: (page: number) => void;
  onQuestionSearchChange: (search: string) => void;
  onRemoveQuestion: (subtest: SubjectCode, snapshotId: string) => void;
  onSelectBank: (bankId: string) => void;
  onUpdateQuestion: (
    subtest: SubjectCode,
    snapshotId: string,
    change: TryoutQuestionChange,
  ) => void;
  onUpdateSection: (change: Partial<TestDraft>) => void;
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

function TryoutSavedQuestionList({
  activeDirectQuestions,
  activeSection,
}: Pick<TryoutSubtestEditorProps, "activeDirectQuestions" | "activeSection">) {
  return (
    <section
      aria-label={`Daftar soal subtes ${activeSection.subtest}`}
      className="grid gap-4"
    >
      <h2 className="text-xl font-semibold text-secondary-900">Soal</h2>
      {activeDirectQuestions.length === 0 ? (
        <ReferenceSurface
          className="px-4 py-10 text-center text-sm leading-6 text-secondary-500"
          variant="inset"
        >
          Belum ada soal di subtes ini.
        </ReferenceSurface>
      ) : (
        <div className="grid gap-4">
          {activeDirectQuestions.map((question, index) => {
            const questionKey =
              "snapshotId" in question
                ? question.snapshotId
                : `${question.sourceQuestionId}-${index}`;
            const difficulty = question.difficulty ?? "medium";
            const difficultyLabel =
              difficulty === "easy"
                ? "Mudah"
                : difficulty === "hard"
                  ? "Sulit"
                  : difficulty === "adaptive"
                    ? "Adaptif"
                    : "Sedang";
            const questionTypeLabel =
              question.questionType === "multiple_choice"
                ? "Pilihan ganda kompleks"
                : "Pilihan ganda";
            const options = question.options ?? [];

            return (
              <ReferenceSurface
                as="article"
                className="p-5 sm:p-6"
                key={questionKey}
              >
                <div className="flex flex-col items-start gap-4 border-b border-primary-100/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <span className="grid size-8 place-items-center rounded-xl bg-primary-50 text-sm font-bold text-primary-800">
                    {index + 1}
                  </span>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <MentorBadge size="xs" tone="category">
                      {questionTypeLabel}
                    </MentorBadge>
                    <MentorBadge size="xs" tone="category">
                      {difficultyLabel}
                    </MentorBadge>
                  </div>
                </div>
                <div className="mt-4 grid gap-4">
                  <div>
                    <p className="break-words text-base font-medium leading-7 text-secondary-900">
                      {question.prompt || (
                        <span className="italic text-secondary-400">
                          Pertanyaan belum diisi.
                        </span>
                      )}
                    </p>
                    {question.promptAssetId ? (
                      <div className="mt-3 max-w-md overflow-hidden rounded-xl border border-primary-100">
                        <MediaAssetPreview
                          alt={`Gambar soal ${index + 1}`}
                          assetId={question.promptAssetId}
                          className="max-h-48 bg-white"
                        />
                      </div>
                    ) : null}
                  </div>
                  {options.length ? (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {options.map((option, optionIndex) => {
                        const choiceLabel =
                          option.choiceKey ||
                          String.fromCharCode(65 + optionIndex);
                        const correct = option.isCorrect === true;
                        const optionKey =
                          option.snapshotOptionId ||
                          ("sourceQuestionOptionId" in option
                            ? option.sourceQuestionOptionId
                            : undefined) ||
                          `${questionKey}-choice-${optionIndex}`;

                        return (
                          <div
                            className={
                              correct
                                ? "flex min-w-0 items-start gap-2.5 rounded-xl border border-primary-200 bg-primary-50/60 p-3 text-sm font-medium text-primary-950"
                                : "flex min-w-0 items-start gap-2.5 rounded-xl border border-secondary-100 bg-secondary-50/40 p-3 text-sm text-secondary-700"
                            }
                            key={optionKey}
                          >
                            <span
                              className={
                                correct
                                  ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold uppercase text-white"
                                  : "flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary-200 text-xs font-bold uppercase text-secondary-700"
                              }
                            >
                              {choiceLabel}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="break-words leading-5">
                                {option.content || (
                                  <span className="italic text-secondary-400">
                                    Pilihan belum diisi.
                                  </span>
                                )}
                              </p>
                              {option.assetId ? (
                                <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100">
                                  <MediaAssetPreview
                                    alt={`Media pilihan ${choiceLabel}`}
                                    assetId={option.assetId}
                                    className="max-h-24 bg-white"
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-secondary-500">
                      Pilihan jawaban belum tersedia.
                    </p>
                  )}
                  {question.explanation || question.explanationAssetId ? (
                    <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-3.5 text-sm leading-6 text-secondary-700">
                      <span className="font-bold text-primary-900">
                        Pembahasan:{" "}
                      </span>
                      {question.explanation}
                      {question.explanationAssetId ? (
                        <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100">
                          <MediaAssetPreview
                            alt="Gambar pembahasan"
                            assetId={question.explanationAssetId}
                            className="max-h-28 bg-white"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </ReferenceSurface>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TryoutQuestionSourcePanel(props: TryoutSubtestEditorProps) {
  const { activeDirectQuestions, activeSection, readOnly } = props;
  const packageBound = Boolean(activeSection.packageVersionId);

  return (
    <ReferenceSurface as="section" className="grid min-w-0 gap-6 p-5 sm:p-7">
      <div
        aria-label="Soal subtes"
        className="grid gap-1"
        id="question-source-chooser"
      >
        <h2 className="text-xl font-semibold text-secondary-900">
          {readOnly ? "Daftar soal" : "Soal di subtes"}
        </h2>
      </div>
      {packageBound && !readOnly ? (
        <p className="text-sm leading-6 text-secondary-600" role="status">
          Konten subtes ini dikelola melalui Paket Soal. Impor langsung dari
          Bank Soal tidak tersedia di sini.
        </p>
      ) : readOnly ? (
        <TryoutSavedQuestionList
          activeDirectQuestions={activeDirectQuestions}
          activeSection={activeSection}
        />
      ) : (
        <TryoutSectionQuestionManager
          activeBrowseBank={props.activeBrowseBank}
          activeSourceQuestions={props.activeSourceQuestions}
          browseBankId={props.browseBankId}
          draftLocked={props.draft.locked}
          guardExternalNavigation={props.guardExternalNavigation}
          onBankPageNext={props.onBankPageNext}
          onBankSearchChange={props.onBankSearchChange}
          onImport={(request) => props.onImport(activeSection.subtest, request)}
          onMoveQuestion={(snapshotId, direction) =>
            props.onMoveQuestion(activeSection.subtest, snapshotId, direction)
          }
          onQuestionPageChange={props.onQuestionPageChange}
          onQuestionSearchChange={props.onQuestionSearchChange}
          onRemoveQuestion={(snapshotId) =>
            props.onRemoveQuestion(activeSection.subtest, snapshotId)
          }
          onSelectBank={props.onSelectBank}
          onUpdateQuestion={(snapshotId, change) =>
            props.onUpdateQuestion(activeSection.subtest, snapshotId, change)
          }
          packageVersionId={activeSection.packageVersionId}
          questions={activeDirectQuestions}
          readOnly={readOnly}
          saving={props.saving}
          sectionSubject={activeSection.subtest}
          sourceBankLoading={props.sourceBankLoading}
          sourceBankSearch={props.sourceBankSearch}
          sourceBankTotal={props.sourceBankTotal}
          sourceBanks={props.sourceBanks}
          sourceQuestionLoading={props.sourceQuestionLoading}
          sourceQuestionPage={props.sourceQuestionPage}
          sourceQuestionSearch={props.sourceQuestionSearch}
          sourceQuestionTotal={props.sourceQuestionTotal}
        />
      )}
    </ReferenceSurface>
  );
}

function TryoutSubtestMetadataField({
  canSave = true,
  children,
  disabled,
  editing,
  label,
  onCancel,
  onEdit,
  onSave,
  required = false,
  value,
}: {
  canSave?: boolean;
  children: ReactNode;
  disabled: boolean;
  editing: boolean;
  label: string;
  onCancel: () => void;
  onEdit: () => void;
  onSave: () => void;
  required?: boolean;
  value: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className={REFERENCE_FIELD_LABEL_CLASS_NAME}>
          {label}
          {required ? <RequiredMark /> : null}
        </p>
        {editing ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label={`Simpan ${label.toLowerCase()}`}
              disabled={disabled || !canSave}
              onClick={onSave}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Check aria-hidden="true" />
            </Button>
            <Button
              aria-label={`Batalkan perubahan ${label.toLowerCase()}`}
              onClick={onCancel}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : disabled ? null : (
          <Button
            aria-label={`Edit ${label.toLowerCase()}`}
            onClick={onEdit}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Pencil aria-hidden="true" />
          </Button>
        )}
      </div>
      {editing ? (
        children
      ) : (
        <div className="text-base leading-7 text-secondary-800">{value}</div>
      )}
    </div>
  );
}

function TryoutSubtestMetadataCard({
  activeSection,
  draft,
  onUpdateSection,
  readOnly,
  saving,
}: Pick<
  TryoutSubtestEditorProps,
  "activeSection" | "draft" | "onUpdateSection" | "readOnly" | "saving"
>) {
  const canEdit = !readOnly && !draft.locked && !saving;
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationDraft, setDurationDraft] = useState(
    String(activeSection.durationMinutes),
  );
  const [editingScoringMethod, setEditingScoringMethod] = useState(false);
  const [scoringMethodDraft, setScoringMethodDraft] = useState(
    scoringMethodForSection(activeSection),
  );
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState(
    activeSection.instructions,
  );
  const subjectName =
    kaptenSubjects.find((subject) => subject.code === activeSection.subtest)
      ?.name ?? activeSection.subtest;
  const durationValue = Number(durationDraft);
  const durationIsValid = Number.isInteger(durationValue) && durationValue > 0;
  const sectionId = activeSection.subtest.toLowerCase();

  const cancelDurationEdit = () => {
    setDurationDraft(String(activeSection.durationMinutes));
    setEditingDuration(false);
  };
  const cancelScoringMethodEdit = () => {
    setScoringMethodDraft(scoringMethodForSection(activeSection));
    setEditingScoringMethod(false);
  };
  const cancelInstructionsEdit = () => {
    setInstructionsDraft(activeSection.instructions);
    setEditingInstructions(false);
  };

  return (
    <ReferenceSurface
      as="section"
      aria-labelledby="tryout-subtest-title"
      className="grid gap-6 p-5 sm:p-7"
    >
      <h1
        className="text-2xl font-semibold tracking-[-0.025em] text-secondary-900 sm:text-3xl"
        id="tryout-subtest-title"
      >
        {subjectName}
      </h1>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <TryoutSubtestMetadataField
          canSave={durationIsValid}
          disabled={!canEdit}
          editing={editingDuration}
          label="Durasi"
          onCancel={cancelDurationEdit}
          required
          onEdit={() => {
            setDurationDraft(String(activeSection.durationMinutes));
            setEditingDuration(true);
          }}
          onSave={() => {
            if (!durationIsValid) return;
            onUpdateSection({ durationMinutes: durationValue });
            setEditingDuration(false);
          }}
          value={
            activeSection.durationMinutes > 0 ? (
              `${activeSection.durationMinutes} menit`
            ) : (
              <span className="italic text-secondary-400">Belum diatur</span>
            )
          }
        >
          <div className="relative">
            <FieldInput
              aria-label="Durasi dalam menit"
              className={`${REFERENCE_CONTROL_CLASS_NAMES.input} pr-16`}
              disabled={!canEdit}
              id={`tryout-subtest-duration-${sectionId}`}
              min={1}
              onChange={(event) => setDurationDraft(event.target.value)}
              required
              type="number"
              value={durationDraft}
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-secondary-500">
              menit
            </span>
          </div>
          {!durationIsValid ? (
            <p className="text-xs leading-5 text-danger-500" role="alert">
              Masukkan durasi dalam jumlah menit yang lebih dari nol.
            </p>
          ) : null}
        </TryoutSubtestMetadataField>

        <TryoutSubtestMetadataField
          disabled={!canEdit}
          editing={editingScoringMethod}
          label="Metode penilaian"
          onCancel={cancelScoringMethodEdit}
          onEdit={() => {
            setScoringMethodDraft(scoringMethodForSection(activeSection));
            setEditingScoringMethod(true);
          }}
          required
          onSave={() => {
            onUpdateSection({
              scoringConfig:
                scoringMethodDraft === CBT_IRT_2PL_METHOD
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
            });
            setEditingScoringMethod(false);
          }}
          value={
            scoringMethodForSection(activeSection) === CBT_IRT_2PL_METHOD
              ? "IRT"
              : "Poin tetap"
          }
        >
          <OptionSet
            label="Metode penilaian"
            onValueChange={setScoringMethodDraft}
            options={[
              {
                label: "Poin tetap",
                value: CBT_FIXED_POINTS_METHOD,
              },
              {
                label: "IRT",
                tooltip:
                  "IRT membutuhkan kalibrasi yang disetujui untuk seluruh soal sebelum rilis.",
                value: CBT_IRT_2PL_METHOD,
              },
            ]}
            required
            value={scoringMethodDraft}
          />
        </TryoutSubtestMetadataField>

        <div className="sm:col-span-2">
          <TryoutSubtestMetadataField
            disabled={!canEdit}
            editing={editingInstructions}
            label="Instruksi peserta"
            onCancel={cancelInstructionsEdit}
            onEdit={() => {
              setInstructionsDraft(activeSection.instructions);
              setEditingInstructions(true);
            }}
            onSave={() => {
              onUpdateSection({ instructions: instructionsDraft });
              setEditingInstructions(false);
            }}
            value={
              activeSection.instructions.trim() ? (
                <p className="whitespace-pre-wrap">
                  {activeSection.instructions}
                </p>
              ) : (
                <span className="italic text-secondary-400">
                  Belum ada instruksi peserta.
                </span>
              )
            }
          >
            <FieldTextarea
              aria-label="Instruksi peserta"
              className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-28`}
              disabled={!canEdit}
              id={`tryout-subtest-instructions-${sectionId}`}
              onChange={(event) => setInstructionsDraft(event.target.value)}
              placeholder="Tuliskan arahan untuk peserta sebelum mengerjakan subtes."
              value={instructionsDraft}
            />
          </TryoutSubtestMetadataField>
        </div>
      </div>
    </ReferenceSurface>
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
  onImport,
  onMoveQuestion,
  onQuestionPageChange,
  onQuestionSearchChange,
  onRemoveQuestion,
  onSelectBank,
  onUpdateQuestion,
  onUpdateSection,
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
  const [editingQuestions, setEditingQuestions] = useState(false);
  const [questionEditorMounted, setQuestionEditorMounted] = useState(false);
  const packageBound = Boolean(activeSection.packageVersionId);
  const canEditQuestions = !readOnly && !draft.locked && !packageBound;
  const showQuestionEditor = editingQuestions && canEditQuestions;

  useEffect(() => {
    if (!canEditQuestions) setEditingQuestions(false);
  }, [canEditQuestions]);

  const questionSourcePanel = (
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
      onImport={onImport}
      onMoveQuestion={onMoveQuestion}
      onQuestionPageChange={onQuestionPageChange}
      onQuestionSearchChange={onQuestionSearchChange}
      onRemoveQuestion={onRemoveQuestion}
      onSelectBank={onSelectBank}
      onUpdateQuestion={onUpdateQuestion}
      onUpdateSection={onUpdateSection}
      readOnly={readOnly}
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
  );

  return (
    <TooltipProvider>
      <div className="grid min-w-0 gap-5">
        <TryoutSubtestMetadataCard
          activeSection={activeSection}
          draft={draft}
          onUpdateSection={onUpdateSection}
          readOnly={readOnly}
          saving={saving}
        />

        {canEditQuestions ? (
          <div className="flex justify-end">
            <Button
              aria-pressed={editingQuestions}
              onClick={() => {
                if (!editingQuestions) setQuestionEditorMounted(true);
                setEditingQuestions((current) => !current);
              }}
              type="button"
              variant={editingQuestions ? "brandOutline" : "brand"}
            >
              {editingQuestions ? (
                <>
                  <Check aria-hidden="true" />
                  Selesai mengedit
                </>
              ) : (
                <>
                  <FilePenLine aria-hidden="true" />
                  Edit Soal
                </>
              )}
            </Button>
          </div>
        ) : null}

        {canEditQuestions && questionEditorMounted ? (
          <div className="min-w-0" hidden={!showQuestionEditor}>
            {questionSourcePanel}
          </div>
        ) : null}

        {!showQuestionEditor && packageBound && !readOnly
          ? questionSourcePanel
          : null}

        {!showQuestionEditor && !(packageBound && !readOnly) ? (
          <TryoutSavedQuestionList
            activeDirectQuestions={activeDirectQuestions}
            activeSection={activeSection}
          />
        ) : null}

        {!readOnly &&
        !draft.locked &&
        scoringMethodForSection(activeSection) === CBT_IRT_2PL_METHOD &&
        activeDirectQuestions.length > 0 ? (
          <ReferenceSurface
            className="flex items-start gap-3 border border-primary-200 bg-primary-50/60 p-4 text-sm leading-6 text-secondary-700"
            role="status"
            variant="inset"
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-1 size-4 shrink-0 text-primary-700"
            />
            <div>
              <p className="font-semibold text-secondary-900">
                Kalibrasi IRT belum tersedia
              </p>
              <p className="mt-1">
                Draf tetap bisa disimpan, tetapi Tryout belum bisa diterbitkan
                dengan IRT. Pilih Poin tetap untuk melanjutkan ke publikasi.
              </p>
            </div>
          </ReferenceSurface>
        ) : null}
      </div>
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

function tryoutSubtestListHref(id: string, parentId?: string) {
  const href = `/mentor/tryout/${encodeURIComponent(id)}?workspace=sections`;
  return parentId ? `${href}&parent=${encodeURIComponent(parentId)}` : href;
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
    <section
      aria-labelledby="tryout-subtest-index-title"
      className="mt-4 min-w-0"
    >
      <h2 className="sr-only" id="tryout-subtest-index-title">
        Subtes Tryout
      </h2>
      <ul
        aria-label="Daftar subtes Tryout"
        className="m-0 grid list-none gap-3 p-0"
      >
        {draft.sections.map((section) => {
          const href = id
            ? tryoutSubtestEditorHref(id, section.subtest, parentId)
            : undefined;
          const subjectName =
            kaptenSubjects.find((subject) => subject.code === section.subtest)
              ?.name ?? section.subtest;
          const questionCount = section.directQuestions?.length ?? 0;
          const actionLabel = readOnly
            ? `Lihat detail subtes ${subjectName}`
            : `Buka detail subtes ${subjectName}`;
          const content = (
            <span className="grid min-w-0 gap-0.5 text-left">
              <span className="text-base font-semibold text-secondary-900">
                {subjectName}
              </span>
              <span className="text-xs leading-5 text-secondary-500">
                {section.subtest} · {questionCount} soal
              </span>
            </span>
          );
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
                  {content}
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
                  {content}
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
    </section>
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
          isHidden: false,
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

  const sectionReadiness = useMemo(() => {
    return draft.sections.reduce<Record<SubjectCode, SectionReadiness>>(
      (acc, section) => {
        const questions = section.directQuestions ?? [];
        const hasDirectQuestions = Boolean(questions.length);
        const missingIrtCalibration =
          hasDirectQuestions &&
          scoringMethodForSection(section) === CBT_IRT_2PL_METHOD;
        const isReady =
          directQuestionsReady(questions) && !missingIrtCalibration;
        acc[section.subtest] = {
          detail: missingIrtCalibration
            ? `${questions.length} soal · kalibrasi IRT belum tersedia`
            : isReady
              ? `${questions.length} soal siap`
              : hasDirectQuestions
                ? `${questions.length} soal (cek kelengkapan)`
                : "Belum ada soal",
          issueCount: isReady ? 0 : 1,
          status: missingIrtCalibration
            ? "attention"
            : isReady
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

  const appendImportedQuestions = (
    subtest: SubjectCode,
    snapshots: TryoutQuestionSnapshotDraft[],
  ) => {
    updateDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.subtest === subtest
          ? {
              ...section,
              directQuestions: [
                ...(section.directQuestions ?? []),
                ...snapshots,
              ],
              testType: "cbt",
            }
          : section,
      ),
    }));
  };

  const importQuestions = async (
    subtest: SubjectCode,
    request: TryoutQuestionImportRequest,
  ): Promise<TryoutQuestionImportOutcome> => {
    if (id && (!resourceLock.canEdit || !resourceLock.proof)) {
      return {
        message:
          "Kunci edit Tryout belum aktif. Muat ulang halaman, lalu coba lagi.",
        ok: false,
      };
    }

    try {
      const selection = request.allInBank
        ? { allInBank: true as const }
        : {
            expectedSourceRevisions: request.expectedSourceRevisions,
            questionIds: request.questionIds,
          };
      const result = await importTryoutBankQuestionSnapshotsAction({
        bankId: request.bankId,
        ...selection,
        ...(id
          ? { editLease: resourceLock.proof ?? undefined, tryoutId: id }
          : {}),
        sectionSubjectCode: subtest,
      });
      if (!result.ok) return { message: result.message, ok: false };
      if (!result.importedCount || !result.snapshots.length) {
        return {
          message:
            "Tidak ada soal siap yang dapat ditambahkan dari Bank Soal ini. Pilih bank lain atau muat ulang daftar soal.",
          ok: false,
        };
      }

      const snapshots = result.snapshots as TryoutQuestionSnapshotDraft[];
      appendImportedQuestions(subtest, snapshots);
      showToast(
        `${result.importedCount} soal ditambahkan ke subtes ${subtest}.`,
        {
          variant: "success",
        },
      );
      return {
        importedCount: result.importedCount,
        ok: true,
        snapshots,
      };
    } catch (importError) {
      return {
        message:
          importError instanceof Error
            ? importError.message
            : "Soal belum dapat ditambahkan. Coba lagi.",
        ok: false,
      };
    }
  };

  const updateQuestion = (
    subtest: SubjectCode,
    snapshotId: string,
    change: TryoutQuestionChange,
  ) => {
    updateDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.subtest === subtest
          ? {
              ...section,
              directQuestions: (section.directQuestions ?? []).map(
                (question) =>
                  "snapshotId" in question && question.snapshotId === snapshotId
                    ? { ...question, ...change }
                    : question,
              ),
            }
          : section,
      ),
    }));
  };

  const moveQuestion = (
    subtest: SubjectCode,
    snapshotId: string,
    direction: "up" | "down",
  ) => {
    const currentSection = latestDraftRef.current.sections.find(
      (section) => section.subtest === subtest,
    );
    const currentQuestions = currentSection?.directQuestions ?? [];
    const snapshots = currentQuestions.filter(
      (question): question is TryoutQuestionSnapshotDraft =>
        "snapshotId" in question,
    );
    const index = snapshots.findIndex(
      (question) => question.snapshotId === snapshotId,
    );
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= snapshots.length) return;

    const moved = [...snapshots];
    const [question] = moved.splice(index, 1);
    if (!question) return;
    moved.splice(nextIndex, 0, question);
    let nextSnapshotIndex = 0;
    update(subtest, {
      directQuestions: currentQuestions.map((candidate) =>
        "snapshotId" in candidate ? moved[nextSnapshotIndex++]! : candidate,
      ),
    });
  };

  const removeQuestion = (subtest: SubjectCode, snapshotId: string) => {
    const currentSection = latestDraftRef.current.sections.find(
      (section) => section.subtest === subtest,
    );
    update(subtest, {
      directQuestions: (currentSection?.directQuestions ?? []).filter(
        (question) =>
          !("snapshotId" in question && question.snapshotId === snapshotId),
      ),
    });
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
          editLease: id ? (resourceLock.proof ?? undefined) : undefined,
          id,
          sections: draftToSave.sections.map((section) => ({
            directQuestions: section.directQuestions?.map((question) => {
              if ("snapshotId" in question) {
                return {
                  difficulty: question.difficulty,
                  explanation: question.explanation,
                  explanationAssetId: question.explanationAssetId,
                  options: question.options.map((option, sortOrder) => ({
                    assetId: option.assetId,
                    choiceKey: option.choiceKey,
                    content: option.content,
                    isCorrect: option.isCorrect,
                    snapshotOptionId: option.snapshotOptionId,
                    sortOrder,
                  })),
                  prompt: question.prompt,
                  promptAssetId: question.promptAssetId,
                  questionType: question.questionType,
                  snapshotId: question.snapshotId,
                };
              }
              return {
                sourceContentDigest: question.sourceContentDigest ?? "",
                sourceQuestionId: question.sourceQuestionId,
                sourceQuestionRevisionId:
                  question.sourceQuestionRevisionId ?? "",
              };
            }),
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
      const result = await unpublishTryoutAction(
        id,
        resourceLock.proof ?? undefined,
      );
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
      const result = await archiveTryoutAction(
        id,
        resourceLock.proof ?? undefined,
      );
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

  const setTryoutVisibility = async (isHidden: boolean) => {
    if (!id || isEditLocked) return;
    dispatch({ saving: true, type: "setSaving" });
    dispatch({ error: null, type: "setError" });
    try {
      const result = await setTryoutHiddenAction(
        id,
        isHidden,
        resourceLock.proof ?? undefined,
      );
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      const savedHidden = result.result.isHidden;
      const nextDraft = {
        ...latestDraftRef.current,
        isHidden: savedHidden,
      };
      savedDraftRef.current = {
        ...savedDraftRef.current,
        isHidden: savedHidden,
      };
      latestDraftRef.current = nextDraft;
      dispatch({ draft: nextDraft, type: "setDraft" });
      showToast(
        isHidden ? "Tryout disembunyikan." : "Tryout ditampilkan kembali.",
        { variant: "success" },
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Visibilitas Tryout belum dapat diubah. Coba lagi.",
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
      const result = await deleteTryoutAction(
        id,
        resourceLock.proof ?? undefined,
      );
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
              pageSize: TRYOUT_SOURCE_QUESTION_PAGE_SIZE,
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
    importQuestions,
    metadataSaving,
    mode,
    pendingHrefRef,
    publishOpen,
    save,
    saveMetadata,
    savedDraftRef,
    saving,
    sectionReadiness,
    sourceBankLoading,
    sourceBankPage,
    sourceBankSearch,
    sourceBankTotal,
    sourceBanks,
    sourceQuestionLoading,
    sourceQuestionPage,
    sourceQuestionSearch,
    sourceQuestionTotal,
    moveQuestion,
    removeQuestion,
    updateQuestion,
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
  children,
  draft,
  error,
  guardExternalNavigation,
  id,
  activeWorkspace,
  initialParent,
  mode,
  onWorkspaceChange,
}: {
  activeWorkspace: TryoutWorkspaceTab;
  children?: ReactNode;
  draft: TryoutDraft;
  error: string | null;
  guardExternalNavigation: (
    href: string,
    event: { preventDefault: () => void },
  ) => void;
  id?: string;
  initialParent?: { id: string; publishedAt?: string; title: string };
  mode: "draft" | "published";
  onWorkspaceChange: (tab: TryoutWorkspaceTab) => void;
}) {
  const backHref = "/mentor/tryout";
  const backLabel = "Kembali ke semua Tryout";
  if (id) {
    return (
      <>
        <TryoutWorkspaceHeader
          activeTab={activeWorkspace}
          id={id}
          locked={draft.locked}
          onTabChange={onWorkspaceChange}
          onNavigate={(href, event) => guardExternalNavigation(href, event)}
          parentId={initialParent?.id}
          showBackButton={false}
          showTabs
          showTitle={false}
          title={draft.title}
        >
          {children}
        </TryoutWorkspaceHeader>
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
          title={id ? "Konten Tryout" : "Buat Tryout"}
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
  dialogOpen,
  id,
  initialDraft,
  initialParent,
  initialSubtest,
  initialWorkspace,
  operationsInitial,
  initialSourceBankTotal,
  initialSourceBanks,
  onDialogOpenChange,
  presentation = "page",
}: {
  dialogOpen?: boolean;
  id?: string;
  initialDeliveryArea?: string;
  initialDraft?: TryoutDraft | null;
  initialParent?: { id: string; publishedAt?: string; title: string };
  initialSessionId?: string;
  initialSubtest?: SubjectCode;
  initialSourceBankTotal?: number;
  initialSourceBanks?: SourceBank[];
  initialWorkspace?: TryoutWorkspaceTab;
  onDialogOpenChange?: (open: boolean) => void;
  presentation?: "dialog" | "page";
  operationsInitial?: TryoutOperationsView & {
    workflow?: CanonicalTryoutWorkflowProjection;
  };
}) {
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [createDialogDirty, setCreateDialogDirty] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<TryoutWorkspaceTab>(
    initialSubtest ? "subtests" : (initialWorkspace ?? "subtests"),
  );
  const {
    activeBrowseBank,
    activeDirectQuestions,
    activeSection,
    activeSourceQuestions,
    archive,
    browseBankId,
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
    importQuestions,
    metadataSaving,
    mode,
    pendingHrefRef,
    publishOpen,
    save,
    saveMetadata,
    saving,
    lockState,
    retryLock,
    sourceBankLoading,
    sourceBankPage,
    sourceBankSearch,
    sourceBankTotal,
    sourceBanks,
    sourceQuestionLoading,
    sourceQuestionPage,
    sourceQuestionSearch,
    sourceQuestionTotal,
    moveQuestion,
    removeQuestion,
    updateQuestion,
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

  const isCreateDialog = presentation === "dialog" && !id;
  const updateIdentityDraft = (
    change: (current: TryoutDraft) => TryoutDraft,
  ) => {
    if (isCreateDialog) setCreateDialogDirty(true);
    updateDraft(change);
  };
  const handleCreateDialogOpenChange = (open: boolean) => {
    if (open) {
      onDialogOpenChange?.(true);
      return;
    }
    if (viewSaving) return;
    if (createDialogDirty) {
      setDiscardConfirmationOpen(true);
      return;
    }
    onDialogOpenChange?.(false);
  };
  const closeCreateDialogAfterDiscard = () => {
    discardDraft();
    setCreateDialogDirty(false);
    setDiscardConfirmationOpen(false);
    onDialogOpenChange?.(false);
  };
  const identityPanel = (
    <TryoutIdentityPanel
      draft={viewDraft}
      metadataSaving={viewMetadataSaving}
      mode={mode}
      onBannerChange={(bannerMediaId) =>
        updateIdentityDraft((current) => ({ ...current, bannerMediaId }))
      }
      onCreate={!id ? () => void save("draft") : undefined}
      onDescriptionChange={(description) =>
        updateIdentityDraft((current) => ({ ...current, description }))
      }
      onSaveMetadata={() => void saveMetadata()}
      onTitleChange={(title) =>
        updateIdentityDraft((current) => ({ ...current, title }))
      }
      presentation={isCreateDialog ? "dialog" : "page"}
      saving={viewSaving}
    />
  );

  if (isCreateDialog) {
    return (
      <>
        <Dialog
          onOpenChange={handleCreateDialogOpenChange}
          open={Boolean(dialogOpen)}
        >
          <DialogContent
            className="max-h-[92svh] w-[calc(100vw-2rem)] gap-8 overflow-y-auto p-5 sm:max-w-[min(calc(100vw-3rem),78.75rem)] sm:gap-10 sm:p-8 lg:gap-14 lg:p-14 lg:[&>button]:right-12 lg:[&>button]:top-12"
            data-tryout-create-modal="true"
            pending={viewSaving}
          >
            <DialogHeader className="pr-12">
              <DialogTitle className="text-3xl font-medium tracking-tight sm:text-4xl">
                Buat Tryout
              </DialogTitle>
            </DialogHeader>
            <TryoutBuilderNotices
              error={error}
              guardExternalNavigation={guardExternalNavigation}
              initialParent={initialParent}
              mode={mode}
            />
            {identityPanel}
          </DialogContent>
        </Dialog>
        <UnsavedChangesConfirmationDialog
          description="Perubahan Tryout yang belum disimpan akan hilang."
          onDiscard={closeCreateDialogAfterDiscard}
          onOpenChange={setDiscardConfirmationOpen}
          open={discardConfirmationOpen}
        />
      </>
    );
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      {initialSubtest ? (
        <TryoutBuilderNotices
          error={error}
          guardExternalNavigation={guardExternalNavigation}
          initialParent={initialParent}
          mode={mode}
        />
      ) : (
        <TryoutBuilderHeader
          activeWorkspace={activeWorkspace}
          draft={viewDraft}
          error={error}
          guardExternalNavigation={guardExternalNavigation}
          id={id}
          initialParent={initialParent}
          mode={mode}
          onWorkspaceChange={setActiveWorkspace}
        >
          {identityPanel}
        </TryoutBuilderHeader>
      )}

      {initialSubtest && id ? (
        <div className="-mt-4 md:hidden">
          <Button
            className="px-0 text-sm text-secondary-600 hover:text-secondary-900"
            nativeButton={false}
            onClick={(event) =>
              guardExternalNavigation(
                tryoutSubtestListHref(id, initialParent?.id),
                event,
              )
            }
            render={
              <Link href={tryoutSubtestListHref(id, initialParent?.id)} />
            }
            variant="ghost"
          >
            Kembali ke daftar subtes
          </Button>
        </div>
      ) : null}

      {id ? (
        <ResourceAuthoringLockBanner
          hasLocalChanges={dirty}
          onRetry={retryLock}
          resourceLabel="Tryout"
          state={lockState}
        />
      ) : null}

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
          onImport={importQuestions}
          onMoveQuestion={moveQuestion}
          onQuestionPageChange={(page) =>
            dispatch({ page, type: "setSourceQuestionPage" })
          }
          onQuestionSearchChange={(search) =>
            dispatch({ search, type: "setSourceQuestionSearch" })
          }
          onRemoveQuestion={removeQuestion}
          onSelectBank={(bankId) =>
            dispatch({ bankId, type: "setBrowseBankId" })
          }
          onUpdateQuestion={updateQuestion}
          onUpdateSection={(change) => update(activeSection.subtest, change)}
          readOnly={mode === "published" || viewDraft.locked}
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
        <ReferenceSurface
          aria-labelledby="tryout-operations-title"
          as="section"
          className="mt-4 p-5 sm:p-7"
        >
          <h2
            className="text-xl font-semibold tracking-[-0.025em] text-secondary-900"
            id="tryout-operations-title"
          >
            Operasional
          </h2>
          <KaptenTryoutOperationsModule embedded initial={operationsInitial} />
        </ReferenceSurface>
      ) : activeWorkspace === "participants" && operationsInitial ? (
        <KaptenTryoutParticipantsPageModule
          embedded
          initial={operationsInitial}
          parentId={initialParent?.id}
        />
      ) : activeWorkspace === "settings" ? (
        <KaptenTryoutSettingsPageModule
          draft={{
            isHidden: viewDraft.isHidden === true,
            locked: viewDraft.locked,
            status: viewDraft.status,
            title: viewDraft.title,
          }}
          error={error}
          hasActiveAttempt={hasActiveAttempt}
          onArchive={() => void archive()}
          onDelete={() => void remove()}
          onDuplicate={() => dispatch({ open: true, type: "setDuplicateOpen" })}
          onSetHidden={(isHidden) => void setTryoutVisibility(isHidden)}
          onUnpublish={() => dispatch({ open: true, type: "setUnpublishOpen" })}
          saving={viewSaving}
        />
      ) : null}

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
  dialogOpen?: boolean;
  id?: string;
  initialDeliveryArea?: string;
  initialDraft?: TryoutDraft | null;
  initialParent?: { id: string; publishedAt?: string; title: string };
  initialSessionId?: string;
  initialSubtest?: SubjectCode;
  initialSourceBankTotal?: number;
  initialSourceBanks?: SourceBank[];
  initialWorkspace?: TryoutWorkspaceTab;
  onDialogOpenChange?: (open: boolean) => void;
  presentation?: "dialog" | "page";
  operationsInitial?: TryoutOperationsView & {
    workflow?: CanonicalTryoutWorkflowProjection;
  };
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

function MentorTryoutCreateDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  if (!open) return null;

  return (
    <KaptenTryoutBuilderPageModule
      dialogOpen={open}
      onDialogOpenChange={onOpenChange}
      presentation="dialog"
    />
  );
}

export { KaptenTryoutBuilderPageModule, MentorTryoutCreateDialog };

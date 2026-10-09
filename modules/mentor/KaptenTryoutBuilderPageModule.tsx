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
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
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
import {
  isImageMimeType,
  validateMediaUpload,
} from "@/lib/media/domain";
import type { MediaUploadTicket } from "@/lib/media/types";
import { MediaAssetPreview } from "@/modules/media/media-library";
import {
  postMediaAction,
  putFile,
  readImageDimensions,
} from "@/modules/media/helpers";
import { questionAnswerModeLabel } from "@/modules/mentor/question-answer-mode-label";
import {
  QuestionEditorHeader,
  QuestionEditorPageShell,
} from "@/modules/mentor/components/question-editor-workspace";
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
  onUploadStateChange,
  presentation,
}: {
  bannerMediaId?: string | null;
  disabled: boolean;
  onSave?: () => void;
  onChange: (bannerMediaId: string | null) => void;
  onUploadStateChange: (uploading: boolean) => void;
  presentation: "dialog" | "page";
}) {
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInFlightRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

  const handleBannerChange = (nextBannerMediaId: string | null) => {
    onChange(nextBannerMediaId);
    onSave?.();
  };
  const openPicker = () => {
    if (disabled || uploading) return;
    bannerInputRef.current?.click();
  };
  const uploadBanner = async (nextFile: File) => {
    if (uploadInFlightRef.current) return;

    if (!isImageMimeType(nextFile.type)) {
      showToast("Pilih gambar berformat JPG, PNG, WebP, atau GIF.", {
        variant: "error",
      });
      return;
    }

    const validation = validateMediaUpload({
      fileName: nextFile.name,
      mimeType: nextFile.type,
      sizeBytes: nextFile.size,
    });
    if (!validation.isValid) {
      showToast(validation.error, { variant: "error" });
      return;
    }

    uploadInFlightRef.current = true;
    onUploadStateChange(true);
    setUploading(true);
    setUploadFileName(nextFile.name);
    setUploadProgress(null);

    try {
      const ticket = await postMediaAction<MediaUploadTicket>("kapten", {
        action: "request-upload",
        fileName: nextFile.name,
        folderId: null,
        mimeType: nextFile.type,
        sizeBytes: nextFile.size,
      });
      const dimensions = await readImageDimensions(nextFile);
      setUploadProgress(0);
      await putFile(nextFile, ticket.uploadUrl, setUploadProgress);
      await postMediaAction("kapten", {
        action: "finalize-upload",
        assetId: ticket.assetId,
        height: dimensions.height,
        width: dimensions.width,
      });

      handleBannerChange(ticket.assetId);
      showToast("Banner Tryout berhasil diunggah.", { variant: "success" });
    } catch {
      showToast(
        "Banner belum dapat diunggah. Periksa format dan ukuran file, lalu coba lagi.",
        { variant: "error" },
      );
    } finally {
      uploadInFlightRef.current = false;
      onUploadStateChange(false);
      setUploading(false);
      setUploadFileName(null);
      setUploadProgress(null);
    }
  };
  const hasBanner = Boolean(bannerMediaId);
  const bannerDisabled = disabled || uploading;

  return (
    <section
      aria-label={presentation === "page" ? "Banner Tryout" : undefined}
      aria-labelledby={
        presentation === "dialog" ? "tryout-banner-label" : undefined
      }
      className={`grid min-w-0 max-w-full ${presentation === "dialog" ? "gap-2 sm:gap-3" : "gap-2"}`}
    >
      <input
        accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
        aria-label="Pilih gambar banner Tryout"
        className="sr-only"
        disabled={bannerDisabled}
        onChange={(event) => {
          const nextFile = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";
          if (nextFile) void uploadBanner(nextFile);
        }}
        ref={bannerInputRef}
        type="file"
      />
      {presentation === "dialog" ? (
        <p
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          id="tryout-banner-label"
        >
          Banner Tryout
        </p>
      ) : null}
      <div
        className={tryoutBannerFrameClassName(presentation, hasBanner)}
      >
        {bannerMediaId ? (
          <MediaAssetPreview
            alt="Banner Tryout"
            assetId={bannerMediaId}
            className="absolute inset-0 min-h-0 min-w-0 w-full max-w-full [&_img]:object-cover"
          />
        ) : (
          <TryoutBannerPlaceholder
            disabled={bannerDisabled}
            onOpenPicker={openPicker}
            presentation={presentation}
          />
        )}
        <TryoutBannerActions
          bannerMediaId={bannerMediaId}
          disabled={bannerDisabled}
          onChange={handleBannerChange}
          onOpenPicker={openPicker}
          presentation={presentation}
        />
        {uploading ? (
          <TryoutBannerUploadStatus
            fileName={uploadFileName}
            progress={uploadProgress}
          />
        ) : null}
      </div>
    </section>
  );
}

function TryoutBannerUploadStatus({
  fileName,
  progress,
}: {
  fileName: string | null;
  progress: number | null;
}) {
  const progressValue =
    typeof progress === "number" ? Math.min(100, Math.max(0, progress)) : null;

  return (
    <div
      aria-live="polite"
      className="absolute inset-0 z-30 grid place-items-center bg-secondary-950/70 px-5 text-center text-white"
      role="status"
    >
      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold">Mengunggah banner</p>
        {fileName ? (
          <p className="mt-1 truncate text-xs text-white/85" title={fileName}>
            {fileName}
          </p>
        ) : null}
        <div
          aria-label={
            progressValue === null
              ? "Banner sedang diproses"
              : `${progressValue}% selesai`
          }
          aria-valuemax={progressValue === null ? undefined : 100}
          aria-valuemin={progressValue === null ? undefined : 0}
          aria-valuenow={progressValue ?? undefined}
          className="mt-3 h-1.5 overflow-hidden rounded-pill bg-white/30"
          role="progressbar"
        >
          <span
            className="block h-full rounded-pill bg-white transition-[width]"
            style={{
              width: progressValue === null ? "40%" : `${progressValue}%`,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-white/85">
          {progressValue === null
            ? "File sedang disiapkan"
            : `${progressValue}% selesai`}
        </p>
      </div>
    </div>
  );
}

function tryoutBannerFrameClassName(
  presentation: "dialog" | "page",
  hasBanner: boolean,
) {
  if (presentation === "page") {
    return "group relative min-w-0 max-w-full aspect-[6/1] min-h-40 overflow-hidden rounded-3xl border border-primary-100 bg-primary-50 sm:min-h-48";
  }

  const emptyClasses = hasBanner
    ? "border border-primary-100 bg-primary-50"
    : "border-2 border-dashed border-primary-200 bg-primary-50/35";
  return `group relative min-w-0 max-w-full aspect-[2.4/1] min-h-48 overflow-hidden rounded-2xl sm:min-h-56 ${emptyClasses}`;
}

function TryoutBannerPlaceholder({
  disabled,
  onOpenPicker,
  presentation,
}: {
  disabled: boolean;
  onOpenPicker: () => void;
  presentation: "dialog" | "page";
}) {
  if (presentation === "dialog") {
    return (
      <button
        aria-label="Pilih gambar banner Tryout"
        aria-describedby="tryout-banner-upload-hint"
        className="absolute inset-0 z-10 flex w-full flex-col items-center justify-center gap-3 px-5 text-center outline-none transition-[transform,background-color] hover:bg-primary-100/25 active:scale-[0.99] focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary-700/20 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none"
        disabled={disabled}
        onClick={onOpenPicker}
        type="button"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-100 text-primary-900 sm:size-14">
          <ImagePlus aria-hidden="true" className="size-6" />
        </span>
        <span className="text-sm leading-6 text-secondary-500">
          Pilih gambar banner
        </span>
        <span
          className="text-xs leading-5 text-secondary-500"
          id="tryout-banner-upload-hint"
        >
          JPG, PNG, WebP, atau GIF · maks. 15 MB
        </span>
        <span className="text-sm font-semibold leading-6 text-primary-800 underline decoration-primary-300 underline-offset-4">
          Telusuri file
        </span>
      </button>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary-50 px-6 text-center text-secondary-600">
      <ImagePlus aria-hidden="true" className="size-7 text-primary-700" />
      <span className="text-sm font-semibold">Belum ada banner</span>
    </div>
  );
}

function TryoutBannerActions({
  bannerMediaId,
  disabled,
  onChange,
  onOpenPicker,
  presentation,
}: {
  bannerMediaId?: string | null;
  disabled: boolean;
  onChange: (bannerMediaId: string | null) => void;
  onOpenPicker: () => void;
  presentation: "dialog" | "page";
}) {
  if (!bannerMediaId && presentation === "dialog") return null;
  const position = presentation === "dialog"
    ? "right-3 top-3 sm:right-4 sm:top-4"
    : "right-4 top-4";

  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-colors ${presentation === "dialog" ? "bg-secondary-950/0 group-hover:bg-secondary-950/20 group-focus-within:bg-secondary-950/10" : "bg-secondary-950/20 group-hover:bg-secondary-950/30"}`}
      />
      <TooltipProvider>
        <div className={`absolute z-20 flex items-center gap-2 ${position}`}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Ubah banner Tryout"
                  disabled={disabled}
                  onClick={onOpenPicker}
                  size="icon"
                  type="button"
                  variant="inverse"
                />
              }
            >
              <Pencil aria-hidden="true" className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Ubah banner Tryout</TooltipContent>
          </Tooltip>
          {bannerMediaId ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Hapus banner Tryout"
                    disabled={disabled}
                    onClick={() => onChange(null)}
                    size="icon"
                    type="button"
                    variant="inverse"
                  />
                }
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Hapus banner Tryout</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TooltipProvider>
    </>
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

  if (presentation === "dialog") {
    return (
      <TryoutTitleDialogInput
        disabled={disabled}
        isSaving={isSaving}
        onChange={onChange}
        value={value}
      />
    );
  }

  if (editing) {
    return (
      <TryoutTitleEditingForm
        disabled={disabled}
        draft={draft}
        isSaving={isSaving}
        onCancel={cancel}
        onDraftChange={setDraft}
        onSave={save}
      />
    );
  }

  return (
    <TryoutTitleReadView
      disabled={disabled}
      onEdit={() => {
        setDraft(value);
        setEditing(true);
      }}
      value={value}
    />
  );
}

function TryoutTitleDialogInput({
  disabled,
  isSaving,
  onChange,
  value,
}: {
  disabled: boolean;
  isSaving: boolean;
  onChange: (title: string) => void;
  value: string;
}) {
  return (
    <Field className="gap-3">
      <FieldLabel
        className={REFERENCE_FIELD_LABEL_CLASS_NAME}
        htmlFor="tryout-title"
        required
      >
        Judul Tryout
      </FieldLabel>
      <FieldInput
        className={REFERENCE_CONTROL_CLASS_NAMES.input}
        disabled={disabled || isSaving}
        id="tryout-title"
        onChange={(event) => onChange(event.target.value)}
        required
        value={value}
      />
    </Field>
  );
}

function TryoutTitleEditingForm({
  disabled,
  draft,
  isSaving,
  onCancel,
  onDraftChange,
  onSave,
}: {
  disabled: boolean;
  draft: string;
  isSaving: boolean;
  onCancel: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="grid gap-2">
      <FieldInput
        autoFocus
        className={`${REFERENCE_CONTROL_CLASS_NAMES.input} font-semibold tracking-tight h-12 text-2xl md:text-3xl`}
        disabled={disabled || isSaving}
        id="tryout-title"
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSave();
          } else if (event.key === "Escape") {
            onCancel();
          }
        }}
        required
        value={draft}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled || isSaving || !draft.trim()}
          onClick={onSave}
          size="sm"
          type="button"
          variant="default"
        >
          <Check aria-hidden="true" />
          Simpan
        </Button>
        <Button
          disabled={disabled || isSaving}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="outline"
        >
          <X aria-hidden="true" />
          Batal
        </Button>
      </div>
    </div>
  );
}

function TryoutTitleReadView({
  disabled,
  onEdit,
  value,
}: {
  disabled: boolean;
  onEdit: () => void;
  value: string;
}) {
  return (
    <div className="group flex items-start gap-3">
      <h2 className="min-w-0 break-words text-3xl font-semibold tracking-tight text-secondary-900 md:text-4xl">
        {value || "Tryout tanpa judul"}
      </h2>
      {!disabled ? (
        <Button
          aria-label="Ubah judul Tryout"
          className="mt-1 size-8 shrink-0 text-secondary-400 opacity-70 hover:text-secondary-900 group-hover:opacity-100"
          onClick={onEdit}
          size="icon-sm"
          title="Ubah judul Tryout"
          type="button"
          variant="outline"
        >
          <Pencil aria-hidden="true" className="size-4" />
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

  if (presentation === "dialog") {
    return (
      <TryoutDescriptionDialogInput
        disabled={disabled}
        isSaving={isSaving}
        onChange={onChange}
        value={value}
      />
    );
  }

  return (
    <TryoutDescriptionPageField
      disabled={disabled}
      draft={draft}
      editing={editing}
      isSaving={isSaving}
      onCancel={cancel}
      onDraftChange={setDraft}
      onEdit={() => {
        setDraft(value);
        setEditing(true);
      }}
      onSave={save}
      value={value}
    />
  );
}

function TryoutDescriptionDialogInput({
  disabled,
  isSaving,
  onChange,
  value,
}: {
  disabled: boolean;
  isSaving: boolean;
  onChange: (description: string) => void;
  value: string;
}) {
  return (
    <Field className="gap-3">
      <FieldLabel
        className={REFERENCE_FIELD_LABEL_CLASS_NAME}
        htmlFor="tryout-description"
      >
        Deskripsi
      </FieldLabel>
      <FieldTextarea
        className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-32 resize-y`}
        disabled={disabled || isSaving}
        id="tryout-description"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </Field>
  );
}

function TryoutDescriptionPageField({
  disabled,
  draft,
  editing,
  isSaving,
  onCancel,
  onDraftChange,
  onEdit,
  onSave,
  value,
}: {
  disabled: boolean;
  draft: string;
  editing: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onDraftChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-secondary-500">
          Deskripsi
        </span>
        {!editing && !disabled ? (
          <Button
            aria-label="Ubah deskripsi Tryout"
            className="size-7 text-secondary-400 hover:text-secondary-900"
            onClick={onEdit}
            size="icon-sm"
            title="Ubah deskripsi Tryout"
            type="button"
            variant="outline"
          >
            <Pencil aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {editing ? (
        <TryoutDescriptionEditingForm
          disabled={disabled}
          draft={draft}
          isSaving={isSaving}
          onCancel={onCancel}
          onDraftChange={onDraftChange}
          onSave={onSave}
        />
      ) : (
        <p className="mt-1 text-sm leading-6 text-secondary-700">
          {value || (
            <span className="italic text-secondary-400">
              Belum ada deskripsi untuk Tryout ini. Klik ikon pensil untuk
              menambahkan.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function TryoutDescriptionEditingForm({
  disabled,
  draft,
  isSaving,
  onCancel,
  onDraftChange,
  onSave,
}: {
  disabled: boolean;
  draft: string;
  isSaving: boolean;
  onCancel: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-2 grid gap-2">
      <FieldTextarea
        autoFocus
        className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-[110px] text-sm leading-6`}
        disabled={disabled || isSaving}
        id="tryout-description"
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Tuliskan deskripsi ringkas tentang Tryout ini…"
        value={draft}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled || isSaving}
          onClick={onSave}
          size="sm"
          type="button"
          variant="default"
        >
          <Check aria-hidden="true" />
          Simpan
        </Button>
        <Button
          disabled={disabled || isSaving}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="outline"
        >
          <X aria-hidden="true" />
          Batal
        </Button>
      </div>
    </div>
  );
}

function TryoutIdentityPanel({
  draft,
  metadataSaving,
  mode,
  onBannerChange,
  onBannerUploadStateChange,
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
  onBannerUploadStateChange: (uploading: boolean) => void;
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
  const bannerHero = (
    <TryoutBannerHero
      bannerMediaId={draft.bannerMediaId}
      disabled={identityDisabled}
      onChange={onBannerChange}
      onSave={onSaveMetadata}
      onUploadStateChange={onBannerUploadStateChange}
      presentation={presentation}
    />
  );
  const titleField = (
    <TryoutTitleField
      disabled={identityDisabled}
      isSaving={isSaving}
      onChange={onTitleChange}
      onSave={onSaveMetadata}
      presentation={presentation}
      value={draft.title}
    />
  );
  const descriptionField = (
    <TryoutDescriptionField
      disabled={identityDisabled}
      isSaving={isSaving}
      onChange={onDescriptionChange}
      onSave={onSaveMetadata}
      presentation={presentation}
      value={draft.description}
    />
  );

  return (
    <>
      <div className="grid min-w-0 w-full gap-6">
        <TryoutIdentityInformation
          bannerHero={bannerHero}
          descriptionField={descriptionField}
          presentation={presentation}
          titleField={titleField}
        />
      </div>
      {onCreate ? (
        <TryoutIdentityCreateAction
          disabled={saving}
          onCreate={onCreate}
          presentation={presentation}
          title={draft.title}
        />
      ) : null}
    </>
  );
}

function TryoutIdentityInformation({
  bannerHero,
  descriptionField,
  presentation,
  titleField,
}: {
  bannerHero: ReactNode;
  descriptionField: ReactNode;
  presentation: "dialog" | "page";
  titleField: ReactNode;
}) {
  if (presentation === "dialog") {
    return (
      <section
        aria-labelledby="tryout-basic-info-title"
        className="grid min-w-0 w-full max-w-full gap-5 sm:gap-6"
      >
        <h2 className="sr-only" id="tryout-basic-info-title">
          Informasi Tryout
        </h2>
        {titleField}
        {descriptionField}
        {bannerHero}
      </section>
    );
  }

  return (
    <ReferenceSurface
      aria-labelledby="tryout-basic-info-title"
      as="section"
      className="grid min-w-0 w-full max-w-full gap-7 overflow-hidden p-5 sm:p-7"
    >
      <h2 className="sr-only" id="tryout-basic-info-title">
        Informasi Tryout
      </h2>
      {bannerHero}
      {titleField}
      {descriptionField}
    </ReferenceSurface>
  );
}

function TryoutIdentityCreateAction({
  disabled,
  onCreate,
  presentation,
  title,
}: {
  disabled: boolean;
  onCreate: () => void;
  presentation: "dialog" | "page";
  title: string;
}) {
  const emptyTitle = !title.trim();
  return (
    <Button
      aria-busy={disabled}
      aria-label="Buat Tryout"
      className={presentation === "dialog" ? "w-full" : "mt-4 w-full"}
      disabled={disabled || emptyTitle}
      onClick={onCreate}
      type="button"
      variant={presentation === "dialog" && emptyTitle ? "outline" : "default"}
    >
      <Save className={presentation === "dialog" ? "size-6" : undefined} />
      {disabled ? "Membuat…" : "Buat"}
    </Button>
  );
}

type TryoutSubtestEditorProps = {
  activeBrowseBank?: SourceBank;
  activeDirectQuestions: DirectQuestionDraft[];
  activeSection: TestDraft;
  activeSourceQuestions: SourceQuestion[];
  browseBankId: string | null;
  draft: TryoutDraft;
  dirty: boolean;
  editorMode: boolean;
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
  questionEditorHref?: string;
  saveDraft: () => Promise<boolean>;
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
  action,
  activeDirectQuestions,
  activeSection,
}: Pick<TryoutSubtestEditorProps, "activeDirectQuestions" | "activeSection"> & {
  action?: ReactNode;
}) {
  return (
    <section
      aria-label={`Daftar soal subtes ${activeSection.subtest}`}
      className="grid gap-4"
    >
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-secondary-900">Soal</h2>
        {action}
      </div>
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
                : question.sourceQuestionId;
            const difficulty = question.difficulty ?? "medium";
            const difficultyLabel =
              difficulty === "easy"
                ? "Mudah"
                : difficulty === "hard"
                  ? "Sulit"
                  : difficulty === "adaptive"
                    ? "Adaptif"
                    : "Sedang";
            const questionTypeLabel = questionAnswerModeLabel(question.questionType);
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
                    <Badge size="xs" tone="category">
                      {questionTypeLabel}
                    </Badge>
                    <Badge size="xs" tone="category">
                      {difficultyLabel}
                    </Badge>
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
                          `${questionKey}-choice-${option.choiceKey ?? option.content}`;

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
  const manager = (
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
      presentation={props.editorMode ? "workspace" : "embedded"}
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
  );

  if (props.editorMode && !packageBound) return manager;

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
        manager
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
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-secondary-500">
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
              variant="outline"
            >
              <Check aria-hidden="true" />
            </Button>
            <Button
              aria-label={`Batalkan perubahan ${label.toLowerCase()}`}
              onClick={onCancel}
              size="icon"
              type="button"
              variant="outline"
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
            variant="outline"
          >
            <Pencil aria-hidden="true" />
          </Button>
        )}
      </div>
      {editing ? (
        <div className="mt-2">{children}</div>
      ) : (
        <div className="mt-1 text-sm leading-6 text-secondary-700">{value}</div>
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
    () => scoringMethodForSection(activeSection),
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
      className="p-5 sm:p-6"
    >
      <div className="space-y-6">
        <h1
          className="mt-3 text-3xl font-semibold tracking-tight text-secondary-900 md:text-4xl"
          id="tryout-subtest-title"
        >
          {subjectName}
        </h1>
        <div className="space-y-5">
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
  dirty,
  editorMode,
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
  questionEditorHref,
  saveDraft,
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
  const packageBound = Boolean(activeSection.packageVersionId);
  const canEditQuestions = !readOnly && !draft.locked && !packageBound;
  const view = tryoutSubtestEditorView({
    activeDirectQuestions,
    activeSection,
    draft,
    editorMode,
    packageBound,
    readOnly,
  });

  const questionSourcePanel = (
    <TryoutQuestionSourcePanel
      activeBrowseBank={activeBrowseBank}
      activeDirectQuestions={activeDirectQuestions}
      activeSection={activeSection}
      activeSourceQuestions={activeSourceQuestions}
      browseBankId={browseBankId}
      draft={draft}
      dirty={dirty}
      editorMode={editorMode}
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
      saveDraft={saveDraft}
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
      <div
        className={
          editorMode
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "grid min-w-0 gap-5"
        }
      >
        {view.showMetadata ? (
          <TryoutSubtestMetadataCard
            activeSection={activeSection}
            draft={draft}
            onUpdateSection={onUpdateSection}
            readOnly={readOnly}
            saving={saving}
          />
        ) : null}

        {view.showQuestionSource ? questionSourcePanel : null}

        {view.showSavedQuestions ? (
          <TryoutSavedQuestionList
            activeDirectQuestions={activeDirectQuestions}
            activeSection={activeSection}
            action={
              <TryoutQuestionEditorAction
                canEdit={canEditQuestions}
                dirty={dirty}
                href={questionEditorHref}
                saveDraft={saveDraft}
                saving={saving}
              />
            }
          />
        ) : null}

        {view.showIrtCalibrationNotice ? (
          <TryoutIrtCalibrationNotice />
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function tryoutSubtestEditorView({
  activeDirectQuestions,
  activeSection,
  draft,
  editorMode,
  packageBound,
  readOnly,
}: Pick<
  TryoutSubtestEditorProps,
  "activeDirectQuestions" | "activeSection" | "draft" | "editorMode" | "readOnly"
> & { packageBound: boolean }) {
  const canPublishWithIrt =
    scoringMethodForSection(activeSection) === CBT_IRT_2PL_METHOD;
  return {
    showIrtCalibrationNotice:
      !editorMode &&
      !readOnly &&
      !draft.locked &&
      canPublishWithIrt &&
      activeDirectQuestions.length > 0,
    showMetadata: !editorMode,
    showQuestionSource: editorMode || (packageBound && !readOnly),
    showSavedQuestions: !editorMode && !(packageBound && !readOnly),
  };
}

function TryoutQuestionEditorAction({
  canEdit,
  dirty,
  href,
  saveDraft,
  saving,
}: {
  canEdit: boolean;
  dirty: boolean;
  href?: string;
  saveDraft: () => Promise<boolean>;
  saving: boolean;
}) {
  if (!canEdit || !href) return null;
  return (
    <Button
      disabled={saving}
      nativeButton={false}
      onClick={(event) => {
        if (!dirty) return;
        event.preventDefault();
        void saveDraft().then((saved) => {
          if (saved) window.location.assign(href);
        });
      }}
      render={<Link href={href} />}
      type="button"
      variant="default"
    >
      <FilePenLine aria-hidden="true" />
      Edit Soal
    </Button>
  );
}

function TryoutIrtCalibrationNotice() {
  return (
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
          Draf tetap bisa disimpan, tetapi Tryout belum bisa diterbitkan dengan
          IRT. Pilih Poin tetap untuk melanjutkan ke publikasi.
        </p>
      </div>
    </ReferenceSurface>
  );
}

function tryoutSubtestDetailHref(
  id: string,
  subtest: SubjectCode,
  parentId?: string,
) {
  const href = `/mentor/tryout/${encodeURIComponent(id)}/soal/${encodeURIComponent(subtest)}`;
  return parentId ? `${href}?parent=${encodeURIComponent(parentId)}` : href;
}

function tryoutQuestionEditorHref(
  id: string,
  subtest: SubjectCode,
  parentId?: string,
) {
  const href =
    "/mentor/tryout/" +
    encodeURIComponent(id) +
    "/soal/" +
    encodeURIComponent(subtest) +
    "/editor";
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
            ? tryoutSubtestDetailHref(id, section.subtest, parentId)
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
                  className="group h-auto min-h-16 w-full justify-start px-4 py-3 text-left sm:px-5"
                  disabled={saving}
                  nativeButton={false}
                  onClick={(event) => onOpenSubtest(section.subtest, event)}
                  render={<Link href={href} />}
                  variant="outline"
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
                  className="group h-auto min-h-16 w-full justify-start px-4 py-3 text-left sm:px-5"
                  disabled={saving}
                  onClick={() => onOpenSubtest(section.subtest)}
                  variant="outline"
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
              Setelah Tryout diterbitkan, susunan soal akan terkunci. Untuk
              mengubahnya, buat draf perubahan.
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
              variant="default"
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
              Tryout tidak lagi tersedia untuk pendaftaran baru. Riwayat
              pengerjaan peserta dan soal yang sudah digunakan tetap tersimpan.
              Tindakan ini hanya dapat dilakukan saat tidak ada peserta yang
              sedang mengerjakan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || draft.locked || hasActiveAttempt}
              onClick={onConfirmUnpublish}
              variant="default"
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
              Salinan akan dibuat sebagai draf yang bisa diedit. Riwayat
              pengerjaan peserta dan isi Tryout ini tetap tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={onConfirmDuplicate}
              variant="default"
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
              variant="outline"
            >
              Buang perubahan
            </Button>
            <AlertDialogAction
              className="w-full"
              disabled={saving || !draft.title.trim()}
              onClick={onConfirmSaveDirty}
              variant="default"
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
  manualQuestionEditor = false,
  initialSourceBankTotal,
  initialSourceBanks = [],
  operationsInitial,
}: {
  id?: string;
  initialDraft?: TryoutDraft | null;
  initialSubtest?: SubjectCode;
  manualQuestionEditor?: boolean;
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
          title: "Draf Tryout baru",
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
    !manualQuestionEditor &&
      initialSubtest &&
      id &&
      mode === "draft" &&
      !draft.locked &&
      dirty,
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
    } catch {
      return {
        message:
          "Soal belum berhasil ditambahkan dari Bank Soal. Muat ulang daftar lalu coba lagi.",
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
              ? tryoutSubtestDetailHref(result.result.id, redirectSubtest)
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
    if (!id || isEditLocked || draft.locked) return;
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
    if (
      (initialSubtest && !manualQuestionEditor) ||
      !dirty ||
      mode !== "draft"
    )
      return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, initialSubtest, manualQuestionEditor, mode]);

  useEffect(() => {
    if (!isAutosaveSubtest) return;
    const timer = window.setTimeout(() => autosaveRequestRef.current(), 5000);
    return () => window.clearTimeout(timer);
  }, [draft, isAutosaveSubtest]);

  useEffect(() => {
    if (!initialSubtest || !id || manualQuestionEditor) return;
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
  }, [id, initialSubtest, manualQuestionEditor]);

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
    if (
      !manualQuestionEditor &&
      initialSubtest &&
      id &&
      mode === "draft" &&
      !draft.locked
    ) {
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
    setTryoutVisibility,
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

type TryoutBuilderState = ReturnType<typeof useTryoutBuilderState>;

function TryoutQuestionEditorWorkspace({
  activeSection,
  id,
  initialParent,
  lifecycleModals,
  renderSubtestEditor,
  state,
}: {
  activeSection: TestDraft;
  id: string;
  initialParent?: { id: string; publishedAt?: string; title: string };
  lifecycleModals: ReactNode;
  renderSubtestEditor: (editorMode: boolean) => ReactNode;
  state: TryoutBuilderState;
}) {
  const readOnly =
    state.mode === "published" || state.draft.locked || state.editLocked;
  const hasUncalibratedIrtQuestions =
    !readOnly &&
    scoringMethodForSection(activeSection) === CBT_IRT_2PL_METHOD &&
    state.activeDirectQuestions.length > 0;

  return (
    <QuestionEditorPageShell marker="tryout">
      <TryoutQuestionEditorHeader
        backHref={tryoutSubtestDetailHref(
          id,
          activeSection.subtest,
          initialParent?.id,
        )}
        dirty={state.dirty}
        draftTitle={state.draft.title}
        guardExternalNavigation={state.guardExternalNavigation}
        readOnly={readOnly}
        editLocked={state.editLocked}
        saving={state.saving}
        saveDraft={() => state.save("draft")}
        subtest={activeSection.subtest}
      />
      <ResourceAuthoringLockBanner
        hasLocalChanges={state.dirty}
        onRetry={state.retryLock}
        resourceLabel="Tryout"
        state={state.lockState}
      />
      <div className="shrink-0 px-4 md:px-6">
        <TryoutBuilderNotices error={state.error} />
        {hasUncalibratedIrtQuestions ? (
          <ReferenceSurface
            className="mt-3 flex items-start gap-3 border border-primary-200 bg-primary-50/60 p-3 text-sm leading-6 text-secondary-700"
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
      {renderSubtestEditor(true)}
      {lifecycleModals}
    </QuestionEditorPageShell>
  );
}

function TryoutCreateDialogWorkspace({
  discardConfirmationOpen,
  dialogOpen,
  error,
  identityPanel,
  onCloseAfterDiscard,
  onDiscardOpenChange,
  onOpenChange,
  saving,
}: {
  discardConfirmationOpen: boolean;
  dialogOpen?: boolean;
  error: string | null;
  identityPanel: ReactNode;
  onCloseAfterDiscard: () => void;
  onDiscardOpenChange: (open: boolean) => void;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
}) {
  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={Boolean(dialogOpen)}>
        <DialogContent
          className="max-h-[min(86vh,760px)] w-[calc(100vw-2rem)] overflow-y-auto p-6 sm:max-w-2xl sm:p-8"
          data-tryout-create-modal="true"
          pending={saving}
        >
          <DialogHeader className="pr-12">
            <DialogTitle>Buat Tryout</DialogTitle>
          </DialogHeader>
          <TryoutBuilderNotices error={error} />
          {identityPanel}
        </DialogContent>
      </Dialog>
      <UnsavedChangesConfirmationDialog
        description="Perubahan Tryout yang belum disimpan akan hilang."
        onDiscard={onCloseAfterDiscard}
        onOpenChange={onDiscardOpenChange}
        open={discardConfirmationOpen}
      />
    </>
  );
}

function TryoutBuilderNotices({ error }: { error: string | null }) {
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
    </>
  );
}

function TryoutQuestionEditorHeader({
  backHref,
  dirty,
  draftTitle,
  editLocked,
  guardExternalNavigation,
  readOnly,
  saving,
  saveDraft,
  subtest,
}: {
  backHref: string;
  dirty: boolean;
  draftTitle: string;
  editLocked: boolean;
  guardExternalNavigation: (href: string, event: { preventDefault: () => void }) => void;
  saveDraft: () => Promise<boolean>;
  readOnly: boolean;
  saving: boolean;
  subtest: SubjectCode;
}) {
  return <QuestionEditorHeader
    backControl={<Button
      aria-label={`Kembali ke detail subtes ${subtest}`}
      className="shrink-0"
      disabled={saving || editLocked}
      nativeButton={false}
      onClick={(event) => guardExternalNavigation(backHref, event)}
      render={<Link href={backHref} />}
      size="sm"
      type="button"
      variant="outline"
    ><ChevronLeft aria-hidden="true" /></Button>}
    category={subtest}
    dirty={dirty}
    onSave={readOnly ? undefined : () => void saveDraft()}
    saveDisabled={saving || editLocked}
    saveId="tryout-save-button"
    saving={saving}
    title={draftTitle || "Tryout"}
  />;
}

function TryoutBuilderHeader({
  children,
  draft,
  error,
  guardExternalNavigation,
  id,
  activeWorkspace,
  initialParent,
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
        />
      </>
    );
  }

  return (
    <>
      <div className="flex min-w-0 items-start gap-3">
        <Button
          aria-label={backLabel}
          className="mt-1 shrink-0"
          nativeButton={false}
          onClick={(event) => guardExternalNavigation(backHref, event)}
          render={<Link href={backHref} />}
          size="icon"
          title={backLabel}
          variant="outline"
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
      />
    </>
  );
}

function TryoutWorkspaceContent({
  activeWorkspace,
  draft,
  error,
  hasActiveAttempt,
  id,
  initialParent,
  initialSubtest,
  mode,
  onArchive,
  onDelete,
  onDuplicate,
  onOpenSubtest,
  onPublish,
  onSetHidden,
  onUnpublish,
  operationsInitial,
  renderSubtestEditor,
  saving,
}: {
  activeWorkspace: TryoutWorkspaceTab;
  draft: TryoutDraft;
  error: string | null;
  hasActiveAttempt: boolean;
  id?: string;
  initialParent?: { id: string; publishedAt?: string; title: string };
  initialSubtest?: SubjectCode;
  mode: WorkflowMode;
  onArchive: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpenSubtest: (
    subtest: SubjectCode,
    event?: { preventDefault: () => void },
  ) => void;
  onPublish: () => void;
  onSetHidden: (hidden: boolean) => void;
  onUnpublish: () => void;
  operationsInitial?: TryoutOperationsView & {
    workflow?: CanonicalTryoutWorkflowProjection;
  };
  renderSubtestEditor: (editorMode: boolean) => ReactNode;
  saving: boolean;
}) {
  if (initialSubtest) return renderSubtestEditor(false);

  if (activeWorkspace === "subtests") {
    return (
      <TryoutSubtestIndex
        draft={draft}
        id={id}
        onOpenSubtest={onOpenSubtest}
        parentId={initialParent?.id}
        readOnly={mode === "published" || draft.locked}
        saving={saving}
      />
    );
  }

  if (activeWorkspace === "operations" && operationsInitial) {
    return (
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
    );
  }

  if (activeWorkspace === "participants" && operationsInitial) {
    return (
      <KaptenTryoutParticipantsPageModule
        embedded
        initial={operationsInitial}
        parentId={initialParent?.id}
      />
    );
  }

  if (activeWorkspace === "settings") {
    return (
      <KaptenTryoutSettingsPageModule
        draft={{
          isHidden: draft.isHidden === true,
          locked: draft.locked,
          status: draft.status,
          title: draft.title,
        }}
        error={error}
        hasActiveAttempt={hasActiveAttempt}
        onArchive={onArchive}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onPublish={onPublish}
        onSetHidden={onSetHidden}
        onUnpublish={onUnpublish}
        saving={saving}
      />
    );
  }

  return null;
}

function TryoutBuilderPageWorkspace({
  activeWorkspace,
  error,
  guardExternalNavigation,
  identityPanel,
  id,
  initialParent,
  initialSubtest,
  lifecycleModals,
  mode,
  onOpenSubtest,
  onWorkspaceChange,
  operationsInitial,
  renderSubtestEditor,
  state,
  viewDraft,
  viewSaving,
}: {
  activeWorkspace: TryoutWorkspaceTab;
  error: string | null;
  guardExternalNavigation: TryoutBuilderState["guardExternalNavigation"];
  identityPanel: ReactNode;
  id?: string;
  initialParent?: { id: string; publishedAt?: string; title: string };
  initialSubtest?: SubjectCode;
  lifecycleModals: ReactNode;
  mode: WorkflowMode;
  onOpenSubtest: (
    subtest: SubjectCode,
    event?: { preventDefault: () => void },
  ) => void;
  onWorkspaceChange: (workspace: TryoutWorkspaceTab) => void;
  operationsInitial?: TryoutOperationsView & {
    workflow?: CanonicalTryoutWorkflowProjection;
  };
  renderSubtestEditor: (editorMode: boolean) => ReactNode;
  state: TryoutBuilderState;
  viewDraft: TryoutDraft;
  viewSaving: boolean;
}) {
  return (
    <div className="mx-auto min-w-0 w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      {initialSubtest ? (
        <TryoutBuilderNotices error={error} />
      ) : (
        <TryoutBuilderHeader
          activeWorkspace={activeWorkspace}
          draft={viewDraft}
          error={error}
          guardExternalNavigation={guardExternalNavigation}
          id={id}
          initialParent={initialParent}
          onWorkspaceChange={onWorkspaceChange}
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
            render={<Link href={tryoutSubtestListHref(id, initialParent?.id)} />}
            variant="outline"
          >
            Kembali ke daftar subtes
          </Button>
        </div>
      ) : null}

      {id ? (
        <ResourceAuthoringLockBanner
          hasLocalChanges={state.dirty}
          onRetry={state.retryLock}
          resourceLabel="Tryout"
          state={state.lockState}
        />
      ) : null}

      <TryoutWorkspaceContent
        activeWorkspace={activeWorkspace}
        draft={viewDraft}
        error={error}
        hasActiveAttempt={state.hasActiveAttempt}
        id={id}
        initialParent={initialParent}
        initialSubtest={initialSubtest}
        mode={mode}
        onArchive={() => void state.archive()}
        onDelete={() => void state.remove()}
        onDuplicate={() => state.dispatch({ open: true, type: "setDuplicateOpen" })}
        onOpenSubtest={onOpenSubtest}
        onPublish={() => state.dispatch({ open: true, type: "setPublishOpen" })}
        onSetHidden={(hidden) => void state.setTryoutVisibility(hidden)}
        onUnpublish={() => state.dispatch({ open: true, type: "setUnpublishOpen" })}
        operationsInitial={operationsInitial}
        renderSubtestEditor={renderSubtestEditor}
        saving={viewSaving}
      />
      {lifecycleModals}
    </div>
  );
}

function TryoutBuilderLifecycleDialogContent({
  state,
  viewDraft,
  viewSaving,
}: {
  state: TryoutBuilderState;
  viewDraft: TryoutDraft;
  viewSaving: boolean;
}) {
  const {
    dispatch,
    discardDraft,
    duplicate,
    hasActiveAttempt,
    pendingHrefRef,
    publishOpen,
    save,
    saving,
    unpublish,
    unpublishOpen,
    duplicateOpen,
    dirtyNavigationOpen,
  } = state;

  return (
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
  );
}

function TryoutBuilderContent({
  dialogOpen,
  id,
  initialDraft,
  initialParent,
  initialSubtest,
  questionEditorMode = false,
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
  questionEditorMode?: boolean;
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
  const [bannerUploading, setBannerUploading] = useState(false);
  const createDialogDirtyRef = useRef(false);
  const [activeWorkspace, setActiveWorkspace] = useState<TryoutWorkspaceTab>(
    initialSubtest ? "subtests" : (initialWorkspace ?? "subtests"),
  );
  const state = useTryoutBuilderState({
    id,
    initialDraft,
    initialSubtest,
    manualQuestionEditor: questionEditorMode,
    initialSourceBanks,
    initialSourceBankTotal,
    operationsInitial,
  });
  const {
    activeBrowseBank,
    activeDirectQuestions,
    activeSection,
    activeSourceQuestions,
    browseBankId,
    discardDraft,
    dispatch,
    dirty,
    editLocked,
    draft,
    error,
    guardExternalNavigation,
    importQuestions,
    metadataSaving,
    mode,
    save,
    saveMetadata,
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
    moveQuestion,
    removeQuestion,
    updateQuestion,
    updateDraft,
    update,
  } = state;
  const viewDraft = editLocked ? { ...draft, locked: true } : draft;
  const viewSaving = saving || editLocked;
  const viewMetadataSaving = metadataSaving || editLocked;

  const isCreateDialog = presentation === "dialog" && !id;
  const updateIdentityDraft = (
    change: (current: TryoutDraft) => TryoutDraft,
  ) => {
    if (isCreateDialog) createDialogDirtyRef.current = true;
    updateDraft(change);
  };
  const handleCreateDialogOpenChange = (open: boolean) => {
    if (open) {
      onDialogOpenChange?.(true);
      return;
    }
    if (viewSaving || bannerUploading) return;
    if (createDialogDirtyRef.current) {
      setDiscardConfirmationOpen(true);
      return;
    }
    onDialogOpenChange?.(false);
  };
  const closeCreateDialogAfterDiscard = () => {
    discardDraft();
    createDialogDirtyRef.current = false;
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
      onBannerUploadStateChange={setBannerUploading}
      onCreate={!id ? () => void save("draft") : undefined}
      onDescriptionChange={(description) =>
        updateIdentityDraft((current) => ({ ...current, description }))
      }
      onSaveMetadata={() => void saveMetadata()}
      onTitleChange={(title) =>
        updateIdentityDraft((current) => ({ ...current, title }))
      }
      presentation={isCreateDialog ? "dialog" : "page"}
      saving={viewSaving || bannerUploading}
    />
  );

  const renderSubtestEditor = (editorMode: boolean) => {
    if (!initialSubtest) return null;
    return (
      <TryoutSubtestEditor
        activeBrowseBank={activeBrowseBank}
        activeDirectQuestions={activeDirectQuestions}
        activeSection={activeSection}
        activeSourceQuestions={activeSourceQuestions}
        browseBankId={browseBankId}
        draft={viewDraft}
        dirty={dirty}
        editorMode={editorMode}
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
        questionEditorHref={
          id
            ? tryoutQuestionEditorHref(
                id,
                activeSection.subtest,
                initialParent?.id,
              )
            : undefined
        }
        saveDraft={() => save("draft")}
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
    );
  };

  const lifecycleModals = (
    <TryoutBuilderLifecycleDialogContent
      state={state}
      viewDraft={viewDraft}
      viewSaving={viewSaving}
    />
  );

  if (questionEditorMode && id && initialSubtest) {
    return (
      <TryoutQuestionEditorWorkspace
        activeSection={activeSection}
        id={id}
        initialParent={initialParent}
        lifecycleModals={lifecycleModals}
        renderSubtestEditor={renderSubtestEditor}
        state={state}
      />
    );
  }

  if (isCreateDialog) {
    return (
      <TryoutCreateDialogWorkspace
        discardConfirmationOpen={discardConfirmationOpen}
        dialogOpen={dialogOpen}
        error={error}
        identityPanel={identityPanel}
        onCloseAfterDiscard={closeCreateDialogAfterDiscard}
        onDiscardOpenChange={setDiscardConfirmationOpen}
        onOpenChange={handleCreateDialogOpenChange}
        saving={viewSaving || bannerUploading}
      />
    );
  }

  return (
    <TryoutBuilderPageWorkspace
      activeWorkspace={activeWorkspace}
      error={error}
      guardExternalNavigation={guardExternalNavigation}
      identityPanel={identityPanel}
      id={id}
      initialParent={initialParent}
      initialSubtest={initialSubtest}
      lifecycleModals={lifecycleModals}
      mode={mode}
      onOpenSubtest={(subtest, event) => {
        if (!id) {
          void save("draft", "basics", subtest);
          return;
        }
        if (event) {
          guardExternalNavigation(
            tryoutSubtestDetailHref(id, subtest, initialParent?.id),
            event,
          );
        }
      }}
      onWorkspaceChange={setActiveWorkspace}
      operationsInitial={operationsInitial}
      renderSubtestEditor={renderSubtestEditor}
      state={state}
      viewDraft={viewDraft}
      viewSaving={viewSaving}
    />
  );
}

type TryoutBuilderPageModuleProps = {
  dialogOpen?: boolean;
  id?: string;
  initialDeliveryArea?: string;
  initialDraft?: TryoutDraft | null;
  initialParent?: { id: string; publishedAt?: string; title: string };
  initialSessionId?: string;
  initialSubtest?: SubjectCode;
  questionEditorMode?: boolean;
  initialSourceBankTotal?: number;
  initialSourceBanks?: SourceBank[];
  initialWorkspace?: TryoutWorkspaceTab;
  onDialogOpenChange?: (open: boolean) => void;
  presentation?: "dialog" | "page";
  operationsInitial?: TryoutOperationsView & {
    workflow?: CanonicalTryoutWorkflowProjection;
  };
};

function KaptenTryoutBuilderPageModule(props: TryoutBuilderPageModuleProps) {
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

function KaptenTryoutQuestionEditorPageModule(
  props: Omit<TryoutBuilderPageModuleProps, "questionEditorMode">,
) {
  return <KaptenTryoutBuilderPageModule {...props} questionEditorMode />;
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

export {
  KaptenTryoutBuilderPageModule,
  KaptenTryoutQuestionEditorPageModule,
  MentorTryoutCreateDialog,
};

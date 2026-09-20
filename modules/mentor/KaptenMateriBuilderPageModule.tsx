"use client";

import Link from "next/link";
import {
  AlertCircle,
  Archive,
  ChevronDown,
  ChevronLeft,
  FileText,
  Save,
  Upload,
} from "@/lib/icons";
import { useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";

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
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { MATERI_DOCUMENT_MIME_TYPE } from "@/lib/materi/contract";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import {
  MediaAssetPreview,
  MediaPickerDialog,
} from "@/modules/media/media-library";
import type { MediaAssetDto } from "@/lib/media/types";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  archiveMateriLessonAction,
  publishMateriLessonAction,
  returnMateriLessonToDraftAction,
  saveMateriLessonAction,
} from "@/modules/mentor/materi-actions";
import type {
  KaptenMateriSubjectView,
  KaptenMateriView,
} from "@/modules/mentor/materi-view-model";
import {
  toDocumentInput,
  toPreviewDocument,
  validateMateriBuilderState,
  type MateriBuilderErrors,
  type MateriBuilderState,
  type MateriDocumentSource,
} from "@/modules/mentor/materi-builder-validation";
import { MateriLessonPresentation } from "@/modules/courses/MateriLessonPresentation";

type MateriEditorState = {
  savedMateri: KaptenMateriView | null;
  errors: MateriBuilderErrors;
  hasUnsavedChanges: boolean;
  isPreviewOpen: boolean;
  isPickerOpen: boolean;
  isLifecycleSaving: boolean;
  saveError: string | null;
  pendingRouteReplacement: string | null;
  isSaving: boolean;
};

type MateriEditorAction = { type: "patch"; patch: Partial<MateriEditorState> };

function materiEditorReducer(
  state: MateriEditorState,
  action: MateriEditorAction,
): MateriEditorState {
  return action.type === "patch" ? { ...state, ...action.patch } : state;
}

function getSubject(subjects: KaptenMateriSubjectView[], slug: string) {
  return subjects.find((subject) => subject.slug === slug);
}

function getInitialState(
  initialMateri: KaptenMateriView | null | undefined,
  initialSubjectSlug: string | undefined,
  subjects: KaptenMateriSubjectView[],
): MateriBuilderState {
  if (initialMateri) {
    const document = initialMateri.document;
    return {
      documentAssetId:
        document?.sourceKind === "managed"
          ? (document.managedAssetId ?? "")
          : "",
      documentMimeType: document?.mimeType ?? "",
      documentName: document?.originalName ?? "",
      documentSource: document?.sourceKind ?? "managed",
      documentUrl:
        document?.sourceKind === "hosted" ? (document.url ?? "") : "",
      subjectSlug: initialMateri.subjectSlug,
      title: initialMateri.title,
      videoDuration: initialMateri.videoUrl ? initialMateri.duration : "",
      videoUrl: initialMateri.videoUrl,
    };
  }

  return {
    documentAssetId: "",
    documentMimeType: "",
    documentName: "",
    documentSource: "managed",
    documentUrl: "",
    subjectSlug: initialSubjectSlug ?? subjects[0]?.slug ?? "",
    title: "",
    videoDuration: "",
    videoUrl: "",
  };
}

function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? (
    <p className="text-sm leading-5 text-student-status-danger-fg" id={id}>
      {error}
    </p>
  ) : null;
}

function mapActionErrors(
  fieldErrors: Partial<Record<string, string>> | undefined,
  source: MateriDocumentSource,
): MateriBuilderErrors {
  if (!fieldErrors) return {};

  return {
    documentAssetId:
      fieldErrors.managedAssetId ??
      (source === "managed" ? fieldErrors.document : undefined),
    documentMimeType: fieldErrors.documentMimeType,
    documentUrl:
      fieldErrors.documentUrl ??
      (source === "hosted" ? fieldErrors.document : undefined),
    subjectSlug: fieldErrors.subjectSlug,
    title: fieldErrors.title,
    videoDuration: fieldErrors.videoDuration ?? fieldErrors.duration,
    videoUrl: fieldErrors.videoUrl,
  };
}

function MateriBuilderHeader({
  builderState,
  isPreviewOpen,
  mode,
  parentHref,
}: {
  builderState: MateriBuilderState;
  isPreviewOpen: boolean;
  mode: "create" | "edit";
  parentHref: string;
}) {
  if (isPreviewOpen) return null;

  return (
    <div className="flex min-w-0 items-start gap-3">
      <Button
        aria-label="Kembali ke materi"
        className="mt-1 shrink-0 rounded-xl text-secondary-500 hover:bg-primary-50 hover:text-secondary-900"
        nativeButton={false}
        render={<Link href={parentHref} />}
        size="icon"
        title="Kembali ke materi"
        variant="ghost"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </Button>
      <ReferencePageHeader
        className="min-w-0 flex-1"
        title={
          mode === "create"
            ? "Buat Materi"
            : builderState.title || "Edit Materi"
        }
      />
    </div>
  );
}

function MateriUnsavedChangesBar({
  isArchived,
  isSaving,
  onReset,
  onSave,
}: {
  isArchived: boolean;
  isSaving: boolean;
  onReset: () => void;
  onSave: () => void;
}) {
  return true ? (
    <></>
  ) : (
    <ReferenceSurface
      aria-live="polite"
      className="animate-in fade-in-0 slide-in-from-bottom-3 fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-xl flex-col gap-3 p-3 pl-4 transition-opacity transition-transform duration-300 ease-out backdrop-blur-md motion-reduce:animate-none sm:right-0 sm:left-(--sidebar-offset) sm:w-[min(calc(100vw-3rem),36rem)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center text-primary-800">
          <AlertCircle className="size-5" strokeWidth={2.2} />
        </span>
        <p className="text-sm font-medium leading-5 text-secondary-800">
          Ada perubahan yang belum disimpan.
        </p>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 sm:ml-auto">
        <Button
          className="w-32 justify-center text-student-status-danger-fg hover:bg-student-status-danger-bg hover:text-student-status-danger-solid-bg"
          onClick={onReset}
          size="sm"
          type="button"
          variant="ghost"
        >
          Batal
        </Button>
        <Button
          className="w-32 justify-center"
          disabled={isArchived || isSaving}
          onClick={onSave}
          size="sm"
          type="button"
          variant="brand"
        >
          {isSaving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </ReferenceSurface>
  );
}

function MateriBuilderPreview({
  builderState,
  onPreviewChange,
  selectedSubjectName,
  status,
}: {
  builderState: MateriBuilderState;
  onPreviewChange: (open: boolean) => void;
  selectedSubjectName: string;
  status: KaptenMateriView["status"];
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-secondary-900">
            Pratinjau materi
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 max-w-[42ch] truncate text-xs text-secondary-500">
              {builderState.title || "Materi tanpa judul"}
            </p>
            <ReferenceStatusBadge
              appearance="mentor"
              size="xs"
              status={status}
            />
          </div>
        </div>
        <Button
          onClick={() => onPreviewChange(false)}
          type="button"
          variant="reference"
        >
          <ChevronLeft />
          Kembali ke editor
        </Button>
      </div>
      <ReferenceSurface
        as="section"
        aria-live="polite"
        className="max-w-4xl p-5 sm:p-7"
      >
        <MateriLessonPresentation
          document={toPreviewDocument(builderState)}
          duration={builderState.videoDuration.trim() || undefined}
          managedDocumentPreview={
            builderState.documentAssetId ? (
              <MediaAssetPreview
                alt={builderState.documentName.trim() || "Dokumen Materi"}
                assetId={builderState.documentAssetId}
                className="min-h-[16rem] rounded-none bg-voyage-canvas md:min-h-[24rem]"
                showDownloadControls
              />
            ) : undefined
          }
          showDuration
          showSectionLabel={false}
          subject={selectedSubjectName}
          title={builderState.title}
          videoUrl={builderState.videoUrl}
        />
      </ReferenceSurface>
    </>
  );
}

function MateriBasicsSection({
  builderState,
  errors,
  isArchived,
  onFieldChange,
  subjects,
}: {
  builderState: MateriBuilderState;
  errors: MateriBuilderErrors;
  isArchived: boolean;
  onFieldChange: (field: keyof MateriBuilderState, value: string) => void;
  subjects: KaptenMateriSubjectView[];
}) {
  const selectedSubjectOption = subjects.find(
    (subject) => subject.slug === builderState.subjectSlug,
  );
  return (
    <ReferenceSurface
      as="section"
      aria-labelledby="materi-details-title"
      className="grid gap-5 p-5 sm:p-7"
    >
      <div>
        <h2
          className="text-xl font-semibold tracking-[-0.025em] text-secondary-900"
          id="materi-details-title"
        >
          Materi
        </h2>
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <Field>
          <FieldLabel
            className={REFERENCE_FIELD_LABEL_CLASS_NAME}
            htmlFor="materi-subject"
            required
          >
            Subject
          </FieldLabel>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-describedby={
                errors.subjectSlug ? "materi-subject-error" : undefined
              }
              aria-invalid={Boolean(errors.subjectSlug)}
              aria-label="Subject"
              disabled={isArchived}
              id="materi-subject"
              render={
                <Button
                  className={cn(
                    REFERENCE_CONTROL_CLASS_NAMES.select,
                    "h-12",
                    errors.subjectSlug && "border-student-status-danger-border",
                  )}
                  variant="reference"
                />
              }
            >
              <span className="truncate">
                {selectedSubjectOption
                  ? selectedSubjectOption.code +
                    " · " +
                    selectedSubjectOption.name
                  : "Pilih subject"}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-secondary-500"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-(--anchor-width)"
            >
              <DropdownMenuRadioGroup
                onValueChange={(value) => onFieldChange("subjectSlug", value)}
                value={builderState.subjectSlug}
              >
                {subjects.map((subject) => (
                  <DropdownMenuRadioItem
                    closeOnClick
                    key={subject.slug}
                    value={subject.slug}
                  >
                    {subject.code} · {subject.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <FieldError error={errors.subjectSlug} id="materi-subject-error" />
        </Field>
        <Field>
          <FieldLabel
            className={REFERENCE_FIELD_LABEL_CLASS_NAME}
            htmlFor="materi-title"
            required
          >
            Judul materi
          </FieldLabel>
          <FieldInput
            aria-describedby={errors.title ? "materi-title-error" : undefined}
            aria-invalid={Boolean(errors.title)}
            className={cn(
              REFERENCE_CONTROL_CLASS_NAMES.input,
              "h-12 text-base font-semibold",
            )}
            disabled={isArchived}
            id="materi-title"
            onChange={(event) => onFieldChange("title", event.target.value)}
            value={builderState.title}
          />
          <FieldError error={errors.title} id="materi-title-error" />
        </Field>
      </div>
    </ReferenceSurface>
  );
}

function MateriDocumentSection({
  builderState,
  errors,
  isArchived,
  onOpenPicker,
  selectedDocumentName,
}: {
  builderState: MateriBuilderState;
  errors: MateriBuilderErrors;
  isArchived: boolean;
  onOpenPicker: () => void;
  selectedDocumentName: string;
}) {
  const hasDocumentName = Boolean(builderState.documentName.trim());
  return (
    <ReferenceSurface
      as="section"
      aria-labelledby="materi-document-title"
      className="grid gap-5 p-5 sm:p-7"
    >
      <div>
        <h2
          className="text-xl font-semibold tracking-[-0.025em] text-secondary-900"
          id="materi-document-title"
        >
          Bacaan PDF
          <span aria-hidden="true" className="ml-1 text-destructive">*</span>
          <span className="sr-only"> (wajib)</span>
        </h2>
      </div>
      <ReferenceSurface className="space-y-4 p-4 sm:p-5" variant="inset">
        <div
          className={cn(
            "flex flex-wrap justify-between gap-4",
            hasDocumentName ? "items-center" : "items-start",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 gap-3",
              hasDocumentName ? "items-center" : "items-start",
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-primary-800 ring-1 ring-primary-100">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-secondary-900">
                {hasDocumentName
                  ? selectedDocumentName
                  : "Belum ada PDF dipilih"}
              </p>
              {!hasDocumentName ? (
                <p className="mt-1 text-xs leading-5 text-secondary-500">
                  Pilih PDF dari pustaka media untuk melanjutkan.
                </p>
              ) : null}
            </div>
          </div>
          <Button
            aria-describedby={
              errors.documentAssetId || errors.documentMimeType
                ? "materi-document-error"
                : undefined
            }
            aria-invalid={Boolean(
              errors.documentAssetId || errors.documentMimeType,
            )}
            disabled={isArchived}
            onClick={onOpenPicker}
            size="sm"
            type="button"
            variant="reference"
          >
            {builderState.documentAssetId ? "Ganti PDF" : "Pilih PDF"}
          </Button>
        </div>
        <FieldError
          error={errors.documentAssetId || errors.documentMimeType}
          id="materi-document-error"
        />
      </ReferenceSurface>
    </ReferenceSurface>
  );
}

function MateriVideoSection({
  builderState,
  errors,
  isArchived,
  onFieldChange,
}: {
  builderState: MateriBuilderState;
  errors: MateriBuilderErrors;
  isArchived: boolean;
  onFieldChange: (field: keyof MateriBuilderState, value: string) => void;
}) {
  return (
    <ReferenceSurface
      as="section"
      aria-labelledby="materi-video-title"
      className="grid gap-5 p-5 sm:p-7"
    >
      <div>
        <h2
          className="text-xl font-semibold tracking-[-0.025em] text-secondary-900"
          id="materi-video-title"
        >
          Video pendamping
        </h2>
      </div>
      <div>
        <Field>
          <FieldLabel
            className={REFERENCE_FIELD_LABEL_CLASS_NAME}
            htmlFor="materi-video-url"
          >
            URL video
          </FieldLabel>
          <FieldInput
            aria-describedby={
              errors.videoUrl ? "materi-video-url-error" : undefined
            }
            aria-invalid={Boolean(errors.videoUrl)}
            className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "h-12")}
            disabled={isArchived}
            id="materi-video-url"
            onChange={(event) => onFieldChange("videoUrl", event.target.value)}
            placeholder="https://youtube.com/..."
            type="url"
            value={builderState.videoUrl}
          />
          <FieldError error={errors.videoUrl} id="materi-video-url-error" />
        </Field>
      </div>
    </ReferenceSurface>
  );
}

function MateriAdministrationSection({
  hasUnsavedChanges,
  isSaving,
  onArchive,
  onPublish,
  onRestore,
  readiness,
  status,
}: {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onArchive: () => void;
  onPublish: () => void;
  onRestore: () => void;
  readiness: "ready" | "incomplete";
  status: KaptenMateriView["status"];
}) {
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const isDraft = status === "draft";
  const isPublished = status === "published";
  const isArchived = status === "archived";
  const isLifecycleActionBlocked = isSaving || hasUnsavedChanges;
  const isPublishBlocked = isLifecycleActionBlocked || readiness !== "ready";
  const publishButton = (
    <Button
      aria-busy={isSaving}
      disabled={isPublishBlocked}
      onClick={onPublish}
      type="button"
      variant="brand"
    >
      <Upload />
      {isSaving ? "Menerbitkan…" : "Terbitkan materi"}
    </Button>
  );

  return (
    <>
      <ReferenceSurface
        as="section"
        aria-labelledby="materi-administration-title"
        className="grid gap-5 p-5 sm:p-7"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h2
              className="text-xl font-semibold tracking-[-0.025em] text-secondary-900"
              id="materi-administration-title"
            >
              Administrasi
            </h2>
            {!isPublished ? (
              <p className="max-w-2xl text-sm leading-6 text-secondary-600">
                {isDraft
                  ? "Terbitkan materi setelah data dan bacaan siap."
                  : isArchived
                    ? "Materi ini diarsipkan dan tidak dapat diedit."
                    : "Atur status publikasi materi."}
              </p>
            ) : null}
          </div>
          {isDraft ? (
            hasUnsavedChanges ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex" />}>
                    {publishButton}
                  </TooltipTrigger>
                  <TooltipContent>
                    Simpan perubahan sebelum mengubah status publikasi materi.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              publishButton
            )
          ) : null}
          {isPublished ? (
            <Button
              aria-busy={isSaving}
              disabled={isLifecycleActionBlocked}
              onClick={() => setIsArchiveDialogOpen(true)}
              type="button"
              variant="dangerOutline"
            >
              <Archive />
              {isSaving ? "Mengarsipkan…" : "Arsipkan materi"}
            </Button>
          ) : null}
          {isArchived ? (
            <Button
              aria-busy={isSaving}
              disabled={isSaving}
              onClick={onRestore}
              type="button"
              variant="brandOutline"
            >
              <Upload />
              {isSaving ? "Memulihkan…" : "Pulihkan materi"}
            </Button>
          ) : null}
        </div>
        {readiness !== "ready" && isDraft ? (
          <p className="text-sm leading-6 text-student-status-attention-fg">
            Lengkapi judul dan PDF/ebook sebelum menerbitkan materi.
          </p>
        ) : null}
      </ReferenceSurface>
      <AlertDialog
        onOpenChange={setIsArchiveDialogOpen}
        open={isArchiveDialogOpen}
      >
        <AlertDialogContent size="sm" variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger">
              <Archive />
            </AlertDialogMedia>
            <AlertDialogTitle>Arsipkan materi?</AlertDialogTitle>
            <AlertDialogDescription>
              Materi ini akan dipindahkan ke arsip dan tidak dapat diedit sampai
              dipulihkan kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setIsArchiveDialogOpen(false);
                onArchive();
              }}
              variant="destructive"
            >
              Arsipkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MateriBuilderForm({
  builderState,
  errors,
  hasUnsavedChanges,
  isArchived,
  isSaving,
  mode,
  onFieldChange,
  onArchive,
  onOpenPicker,
  onPublish,
  onRestore,
  onSave,
  readiness,
  selectedDocumentName,
  status,
  subjects,
}: {
  builderState: MateriBuilderState;
  errors: MateriBuilderErrors;
  hasUnsavedChanges: boolean;
  isArchived: boolean;
  isSaving: boolean;
  mode: "create" | "edit";
  onFieldChange: (field: keyof MateriBuilderState, value: string) => void;
  onArchive: () => void;
  onOpenPicker: () => void;
  onPublish: () => void;
  onRestore: () => void;
  onSave: () => void;
  readiness: "ready" | "incomplete";
  selectedDocumentName: string;
  status: KaptenMateriView["status"];
  subjects: KaptenMateriSubjectView[];
}) {
  return (
    <form action={onSave} className="space-y-5" noValidate>
      <MateriBasicsSection
        builderState={builderState}
        errors={errors}
        isArchived={isArchived}
        onFieldChange={onFieldChange}
        subjects={subjects}
      />
      <MateriDocumentSection
        builderState={builderState}
        errors={errors}
        isArchived={isArchived}
        onOpenPicker={onOpenPicker}
        selectedDocumentName={selectedDocumentName}
      />
      <MateriVideoSection
        builderState={builderState}
        errors={errors}
        isArchived={isArchived}
        onFieldChange={onFieldChange}
      />
      {mode === "edit" ? (
        <MateriAdministrationSection
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={isSaving}
          onArchive={onArchive}
          onPublish={onPublish}
          onRestore={onRestore}
          readiness={readiness}
          status={status}
        />
      ) : null}
      <Button
        aria-label="Simpan"
        className="w-full justify-center"
        disabled={isArchived || isSaving}
        type="submit"
        variant="brand"
      >
        <Save />
        {isSaving ? "Menyimpan…" : "Simpan"}
      </Button>
    </form>
  );
}

function MateriBuilderEditor({
  builderState,
  errors,
  hasUnsavedChanges,
  isArchived,
  isPreviewOpen,
  isSaving,
  mode,
  onFieldChange,
  onArchive,
  onOpenPicker,
  onPreviewChange,
  onPublish,
  onRestore,
  onSave,
  readiness,
  selectedDocumentName,
  selectedSubjectName,
  status,
  subjects,
}: {
  builderState: MateriBuilderState;
  errors: MateriBuilderErrors;
  hasUnsavedChanges: boolean;
  isArchived: boolean;
  isPreviewOpen: boolean;
  isSaving: boolean;
  mode: "create" | "edit";
  onFieldChange: (field: keyof MateriBuilderState, value: string) => void;
  onArchive: () => void;
  onOpenPicker: () => void;
  onPreviewChange: (open: boolean) => void;
  onPublish: () => void;
  onRestore: () => void;
  onSave: () => void;
  readiness: "ready" | "incomplete";
  selectedDocumentName: string;
  selectedSubjectName: string;
  status: KaptenMateriView["status"];
  subjects: KaptenMateriSubjectView[];
}) {
  return isPreviewOpen ? (
    <MateriBuilderPreview
      builderState={builderState}
      onPreviewChange={onPreviewChange}
      selectedSubjectName={selectedSubjectName}
      status={status}
    />
  ) : (
    <MateriBuilderForm
      builderState={builderState}
      errors={errors}
      hasUnsavedChanges={hasUnsavedChanges}
      isArchived={isArchived}
      isSaving={isSaving}
      mode={mode}
      onFieldChange={onFieldChange}
      onArchive={onArchive}
      onOpenPicker={onOpenPicker}
      onPublish={onPublish}
      onRestore={onRestore}
      onSave={onSave}
      readiness={readiness}
      selectedDocumentName={selectedDocumentName}
      status={status}
      subjects={subjects}
    />
  );
}
function useMateriNavigationGuards({
  hasUnsavedChanges,
  pendingRouteReplacement,
  router,
}: {
  hasUnsavedChanges: boolean;
  pendingRouteReplacement: string | null;
  router: ReturnType<typeof useRouter>;
}) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) =>
      event.preventDefault();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!pendingRouteReplacement || hasUnsavedChanges) return;
    const frame = window.requestAnimationFrame(() =>
      router.replace(pendingRouteReplacement),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [hasUnsavedChanges, pendingRouteReplacement, router]);
}

function KaptenMateriBuilderPageModule({
  initialMateri = null,
  initialPreview = false,
  initialSubjectSlug,
  materiId,
  mode,
  returnTo,
  session,
  subjects,
}: {
  initialMateri?: KaptenMateriView | null;
  initialPreview?: boolean;
  initialSubjectSlug?: string;
  materiId?: string;
  mode: "create" | "edit";
  returnTo?: string;
  session: SessionContext;
  subjects: KaptenMateriSubjectView[];
}) {
  const router = useRouter();
  const [builderState, setBuilderState] = useState(() =>
    getInitialState(initialMateri, initialSubjectSlug, subjects),
  );
  const [editorState, dispatch] = useReducer(materiEditorReducer, {
    errors: {},
    hasUnsavedChanges: false,
    isLifecycleSaving: false,
    isPickerOpen: false,
    isPreviewOpen: initialPreview,
    isSaving: false,
    pendingRouteReplacement: null,
    saveError: null,
    savedMateri: initialMateri,
  });
  const {
    errors,
    hasUnsavedChanges,
    isLifecycleSaving,
    isPickerOpen,
    isPreviewOpen,
    isSaving,
    pendingRouteReplacement,
    saveError,
    savedMateri,
  } = editorState;
  const updateEditor = (patch: Partial<MateriEditorState>) =>
    dispatch({ patch, type: "patch" });

  const selectedSubject = getSubject(subjects, builderState.subjectSlug);
  const parentHref =
    returnTo ??
    (initialMateri
      ? `/mentor/materi/subject/${initialMateri.subjectSlug}`
      : "/mentor/materi");
  const materiStatus = savedMateri?.status ?? "draft";
  const isArchived = materiStatus === "archived";
  const readiness =
    Object.keys(validateMateriBuilderState(builderState, subjects)).length === 0
      ? "ready"
      : "incomplete";
  const selectedDocumentName = builderState.documentName.trim();

  useMateriNavigationGuards({
    hasUnsavedChanges,
    pendingRouteReplacement,
    router,
  });

  function markChanged(nextErrors?: MateriBuilderErrors) {
    updateEditor({
      errors: nextErrors ?? errors,
      hasUnsavedChanges: true,
      saveError: null,
    });
  }

  function updateField(field: keyof MateriBuilderState, value: string) {
    setBuilderState((current) => ({
      ...current,
      [field]: value,
      ...(field === "videoUrl" ? { videoDuration: "" } : {}),
    }));
    markChanged({
      ...errors,
      [field]: undefined,
      ...(field === "videoUrl" ? { videoDuration: undefined } : {}),
    });
  }

  function selectManagedDocument(asset: MediaAssetDto) {
    if (asset.mimeType.trim().toLowerCase() !== MATERI_DOCUMENT_MIME_TYPE) {
      updateEditor({
        errors: {
          ...errors,
          documentMimeType: "Dokumen Materi harus berformat PDF.",
        },
      });
      return;
    }

    setBuilderState((current) => ({
      ...current,
      documentAssetId: asset.id,
      documentMimeType: asset.mimeType,
      documentName: asset.name,
      documentSource: "managed",
      documentUrl: "",
    }));
    markChanged({
      ...errors,
      documentAssetId: undefined,
      documentMimeType: undefined,
      documentUrl: undefined,
    });
  }

  function resetChanges() {
    setBuilderState(getInitialState(savedMateri, initialSubjectSlug, subjects));
    updateEditor({ errors: {}, hasUnsavedChanges: false, saveError: null });
  }

  async function saveLesson() {
    if (isArchived) {
      updateEditor({
        saveError:
          "Materi yang diarsipkan hanya dapat dipulihkan sebelum diedit.",
      });
      return;
    }

    const nextErrors = validateMateriBuilderState(builderState, subjects);
    if (Object.keys(nextErrors).length) {
      updateEditor({
        errors: nextErrors,
        hasUnsavedChanges: true,
        saveError: "Lengkapi field yang ditandai sebelum menyimpan materi.",
      });
      return;
    }

    updateEditor({ isSaving: true });
    try {
      const result = await saveMateriLessonAction({
        code: savedMateri?.code,
        document: toDocumentInput(builderState),
        subjectSlug: builderState.subjectSlug,
        title: builderState.title,
        videoDuration: builderState.videoDuration,
        videoUrl: builderState.videoUrl,
      });
      if (!result.ok) {
        updateEditor({
          errors: mapActionErrors(
            result.fieldErrors,
            builderState.documentSource,
          ),
          hasUnsavedChanges: true,
          saveError: result.message,
        });
        return;
      }

      updateEditor({
        errors: {},
        hasUnsavedChanges: false,
        saveError: null,
        savedMateri: result.lesson,
      });
      toast.success(result.message);
      if (!materiId && !initialMateri) {
        updateEditor({
          pendingRouteReplacement: returnTo
            ? `${result.lesson.href}?${new URLSearchParams({ returnTo })}`
            : result.lesson.href,
        });
      }
      router.refresh();
    } catch (error) {
      updateEditor({
        hasUnsavedChanges: true,
        saveError:
          error instanceof Error
            ? error.message
            : "Materi tidak dapat disimpan. Coba lagi.",
      });
    } finally {
      updateEditor({ isSaving: false });
    }
  }

  async function updateLifecycle(operation: "archive" | "publish" | "restore") {
    const code = savedMateri?.code;
    if (!code || hasUnsavedChanges) return;

    updateEditor({ isLifecycleSaving: true, saveError: null });
    try {
      const result =
        operation === "archive"
          ? await archiveMateriLessonAction(code)
          : operation === "publish"
            ? await publishMateriLessonAction(code)
            : await returnMateriLessonToDraftAction(code);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      updateEditor({
        errors: {},
        hasUnsavedChanges: false,
        saveError: null,
        savedMateri: result.lesson,
      });
      toast.success(result.message);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Status materi tidak dapat diubah. Coba lagi.",
      );
    } finally {
      updateEditor({ isLifecycleSaving: false });
    }
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={mode === "create" ? "Buat Materi" : "Edit Materi"}
      mainClassName="!max-w-none gap-6"
      onNavigateAway={() => !hasUnsavedChanges}
      searchPlaceholder="Cari materi..."
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
      shouldGuardNavigation={hasUnsavedChanges}
    >
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
        <MateriBuilderHeader
          builderState={builderState}
          isPreviewOpen={isPreviewOpen}
          mode={mode}
          parentHref={parentHref}
        />

        {!isPreviewOpen && saveError ? (
          <ReferenceSurface
            className="flex items-start gap-2 px-4 py-3 text-sm leading-6 text-student-status-danger-fg"
            role="alert"
            variant="inset"
          >
            <AlertCircle className="mt-1 size-4 shrink-0" />
            {saveError}
          </ReferenceSurface>
        ) : null}
        <MateriBuilderEditor
          builderState={builderState}
          errors={errors}
          hasUnsavedChanges={hasUnsavedChanges}
          isArchived={isArchived}
          isPreviewOpen={isPreviewOpen}
          isSaving={isSaving || isLifecycleSaving}
          mode={mode}
          onFieldChange={updateField}
          onArchive={() => void updateLifecycle("archive")}
          onOpenPicker={() => updateEditor({ isPickerOpen: true })}
          onPreviewChange={(open) => updateEditor({ isPreviewOpen: open })}
          onPublish={() => void updateLifecycle("publish")}
          onRestore={() => void updateLifecycle("restore")}
          onSave={() => void saveLesson()}
          readiness={readiness}
          selectedDocumentName={selectedDocumentName}
          selectedSubjectName={selectedSubject?.name ?? "Materi"}
          status={materiStatus}
          subjects={subjects}
        />
      </div>

      <MediaPickerDialog
        allowedMimeTypes={["application/pdf"]}
        onOpenChange={(open) => updateEditor({ isPickerOpen: open })}
        onSelect={selectManagedDocument}
        open={isPickerOpen && !isArchived}
        selectedAssetId={builderState.documentAssetId || null}
        title="Pilih PDF Materi"
      />

      {hasUnsavedChanges ? (
        <MateriUnsavedChangesBar
          isArchived={isArchived}
          isSaving={isSaving}
          onReset={resetChanges}
          onSave={() => void saveLesson()}
        />
      ) : null}
    </MentorWorkspaceShell>
  );
}

export { KaptenMateriBuilderPageModule };

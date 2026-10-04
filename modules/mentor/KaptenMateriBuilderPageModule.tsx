"use client";

import Link from "next/link";
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  FileText,
  Save,
  Upload,
} from "@/lib/icons";
import { useEffect, useReducer, useState, type ReactNode } from "react";
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
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { showToast, toast } from "@/components/ui/toast";
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
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { MATERI_DOCUMENT_MIME_TYPE } from "@/lib/materi/contract";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import {
  MediaAssetPreview,
  MediaPickerDialog,
} from "@/modules/media/media-library";
import type { MediaAssetDto } from "@/lib/media/types";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { AdministrationActionRow } from "@/modules/mentor/components/administration-action-row";
import { UnsavedChangesConfirmationDialog } from "@/modules/mentor/components/unsaved-changes-confirmation-dialog";
import {
  ResourceAuthoringLockBanner,
  type AuthoringLockState,
} from "@/modules/mentor/components/resource-authoring-lock-banner";
import {
  ResourceEditLockProvider,
  useResourceEditLock,
} from "@/modules/mentor/resource-edit-lock-provider";
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
        className="mt-1 shrink-0"
        nativeButton={false}
        render={<Link href={parentHref} />}
        size="icon"
        title="Kembali ke materi"
        variant="outline"
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
  usePageStatusToast({
    active: true,
    message: isSaving ? "Menyimpan perubahan…" : "Ada perubahan yang belum disimpan",
    variant: "info",
    action: !isArchived && !isSaving ? { label: "Simpan", onClick: onSave } : undefined,
    cancel: !isSaving ? { label: "Batal", onClick: onReset } : undefined,
  });

  return null;
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
              size="xs"
              status={status}
            />
          </div>
        </div>
        <Button
          onClick={() => onPreviewChange(false)}
          type="button"
          variant="outline"
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
            Subtes
          </FieldLabel>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-describedby={
                errors.subjectSlug ? "materi-subject-error" : undefined
              }
              aria-invalid={Boolean(errors.subjectSlug)}
              aria-label="Pilih subtes Materi"
              disabled={isArchived}
              id="materi-subject"
              render={
                <Button
                  className={cn(
                    REFERENCE_CONTROL_CLASS_NAMES.select,
                    "h-12",
                    errors.subjectSlug && "border-student-status-danger-border",
                  )}
                  variant="outline"
                />
              }
            >
              <span className="truncate">
                {selectedSubjectOption
                  ? selectedSubjectOption.code +
                    " · " +
                    selectedSubjectOption.name
                  : "Pilih subtes"}
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
            variant="outline"
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
      variant="default"
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
        <h2
          className="text-xl font-semibold tracking-[-0.025em] text-secondary-900"
          id="materi-administration-title"
        >
          Administrasi
        </h2>
        <div>
          {isDraft ? (
            <AdministrationActionRow
              action="Terbitkan materi"
              description="Terbitkan materi setelah data dan bacaan siap."
            >
              {hasUnsavedChanges ? (
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
              )}
            </AdministrationActionRow>
          ) : null}
          {isPublished ? (
            <AdministrationActionRow
              action="Arsipkan materi"
              description="Pindahkan materi ke arsip agar tidak dapat diedit sampai dipulihkan kembali."
            >
              <Button
                aria-busy={isSaving}
                disabled={isLifecycleActionBlocked}
                onClick={() => setIsArchiveDialogOpen(true)}
                type="button"
                variant="destructive"
              >
                <Archive />
                {isSaving ? "Mengarsipkan…" : "Arsipkan materi"}
              </Button>
            </AdministrationActionRow>
          ) : null}
          {isArchived ? (
            <AdministrationActionRow
              action="Pulihkan materi"
              description="Kembalikan materi dari arsip agar dapat dikelola kembali."
            >
              <Button
                aria-busy={isSaving}
                disabled={isSaving}
                onClick={onRestore}
                type="button"
                variant="outline"
              >
                <Upload />
                {isSaving ? "Memulihkan…" : "Pulihkan materi"}
              </Button>
            </AdministrationActionRow>
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
        variant="default"
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

function useMateriLifecycleAction({
  hasUnsavedChanges,
  isEditLocked,
  resourceLock,
  router,
  savedMateri,
  updateEditor,
}: {
  hasUnsavedChanges: boolean;
  isEditLocked: boolean;
  resourceLock: ReturnType<typeof useResourceEditLock>;
  router: ReturnType<typeof useRouter>;
  savedMateri: KaptenMateriView | null;
  updateEditor: (patch: Partial<MateriEditorState>) => void;
}) {
  return async (operation: "archive" | "publish" | "restore") => {
    const code = savedMateri?.code;
    if (!code || hasUnsavedChanges || isEditLocked) return;

    updateEditor({ isLifecycleSaving: true });
    try {
      const result =
        operation === "archive"
          ? await archiveMateriLessonAction(code, resourceLock.proof ?? undefined)
          : operation === "publish"
            ? await publishMateriLessonAction(code, resourceLock.proof ?? undefined)
            : await returnMateriLessonToDraftAction(code, resourceLock.proof ?? undefined);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      updateEditor({
        errors: {},
        hasUnsavedChanges: false,
        savedMateri: result.lesson,
      });
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error(
        "Status Materi belum dapat diubah. Periksa koneksi lalu coba lagi.",
      );
    } finally {
      updateEditor({ isLifecycleSaving: false });
    }
  };
}

function MateriBuilderContent({
  dialogOpen = false,
  initialMateri = null,
  initialPreview = false,
  initialSubjectSlug,
  isCreateDialog = false,
  materiId,
  mode,
  onDialogOpenChange,
  returnTo,
  session,
  subjects,
}: {
  dialogOpen?: boolean;
  initialMateri?: KaptenMateriView | null;
  initialPreview?: boolean;
  initialSubjectSlug?: string;
  isCreateDialog?: boolean;
  materiId?: string;
  mode: "create" | "edit";
  onDialogOpenChange?: (open: boolean) => void;
  returnTo?: string;
  session: SessionContext;
  subjects: KaptenMateriSubjectView[];
}) {
  const router = useRouter();
  const resourceLock = useResourceEditLock();
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
    savedMateri: initialMateri,
  });
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const {
    errors,
    hasUnsavedChanges,
    isLifecycleSaving,
    isPickerOpen,
    isPreviewOpen,
    isSaving,
    pendingRouteReplacement,
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
  const lockState: AuthoringLockState = mode === "create" ? "owned" : resourceLock.state;
  const isEditLocked = mode === "edit" && !resourceLock.canEdit;
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
    updateEditor({ errors: {}, hasUnsavedChanges: false });
  }

  function handleDialogOpenChange(open: boolean) {
    if (open) {
      onDialogOpenChange?.(true);
      return;
    }
    if (isSaving) return;
    if (hasUnsavedChanges) {
      setDiscardConfirmationOpen(true);
      return;
    }
    onDialogOpenChange?.(false);
  }

  function discardAndCloseDialog() {
    setDiscardConfirmationOpen(false);
    resetChanges();
    onDialogOpenChange?.(false);
  }

  const updateLifecycle = useMateriLifecycleAction({
    hasUnsavedChanges,
    isEditLocked,
    resourceLock,
    router,
    savedMateri,
    updateEditor,
  });

  async function saveLesson() {
    if (isArchived || isEditLocked) {
      showToast(
        isArchived
          ? "Materi yang diarsipkan hanya dapat dipulihkan sebelum diedit."
          : "Materi belum bisa diubah. Draf lokal tetap tersimpan.",
        { placement: "notification", variant: "error" },
      );
      return;
    }

    const nextErrors = validateMateriBuilderState(builderState, subjects);
    if (Object.keys(nextErrors).length) {
      updateEditor({
        errors: nextErrors,
        hasUnsavedChanges: true,
      });
      showToast("Lengkapi bagian yang ditandai sebelum menyimpan materi.", {
        placement: "notification",
        variant: "error",
      });
      return;
    }

    updateEditor({ isSaving: true });
    try {
      const result = await saveMateriLessonAction({
        code: savedMateri?.code,
        document: toDocumentInput(builderState),
        editLease: mode === "edit" ? resourceLock.proof ?? undefined : undefined,
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
        });
        showToast(result.message, { placement: "notification", variant: "error" });
        return;
      }

      updateEditor({
        errors: {},
        hasUnsavedChanges: false,
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
    } catch {
      updateEditor({
        hasUnsavedChanges: true,
      });
      showToast("Materi belum berhasil disimpan. Periksa koneksi lalu coba lagi.", {
        placement: "notification",
        variant: "error",
      });
    } finally {
      updateEditor({ isSaving: false });
    }
  }

  const builderContent = <MateriBuilderBody
    builderState={builderState}
    errors={errors}
    hasUnsavedChanges={hasUnsavedChanges}
    isArchived={isArchived || isEditLocked}
    isCreateDialog={isCreateDialog}
    isEditLocked={isEditLocked}
    isLifecycleSaving={isLifecycleSaving}
    isPickerOpen={isPickerOpen}
    isPreviewOpen={isPreviewOpen}
    isSaving={isSaving}
    lockState={lockState}
    mode={mode}
    onArchive={() => void updateLifecycle("archive")}
    onFieldChange={updateField}
    onOpenPicker={() => updateEditor({ isPickerOpen: true })}
    onPreviewChange={(open) => updateEditor({ isPreviewOpen: open })}
    onPublish={() => void updateLifecycle("publish")}
    onReset={resetChanges}
    onRestore={() => void updateLifecycle("restore")}
    onSave={() => void saveLesson()}
    onSelectDocument={selectManagedDocument}
    onRetryLock={resourceLock.retry}
    onPickerOpenChange={(open) => updateEditor({ isPickerOpen: open })}
    onUnsavedSave={() => void saveLesson()}
    parentHref={parentHref}
    readiness={readiness}
    selectedDocumentName={selectedDocumentName}
    selectedSubjectName={selectedSubject?.name ?? "Materi"}
    status={materiStatus}
    subjects={subjects}
  />;

  return <MateriBuilderPresentation
    dialogOpen={dialogOpen}
    hasUnsavedChanges={hasUnsavedChanges}
    isCreateDialog={isCreateDialog}
    isSaving={isSaving}
    mode={mode}
    onDialogOpenChange={handleDialogOpenChange}
    onDiscard={discardAndCloseDialog}
    onDiscardOpenChange={setDiscardConfirmationOpen}
    discardConfirmationOpen={discardConfirmationOpen}
    session={session}
  >{builderContent}</MateriBuilderPresentation>;
}

function MateriBuilderPresentation({ children, dialogOpen, discardConfirmationOpen, hasUnsavedChanges, isCreateDialog, isSaving, mode, onDialogOpenChange, onDiscard, onDiscardOpenChange, session }: {
  children: ReactNode;
  dialogOpen: boolean;
  discardConfirmationOpen: boolean;
  hasUnsavedChanges: boolean;
  isCreateDialog: boolean;
  isSaving: boolean;
  mode: "create" | "edit";
  onDialogOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onDiscardOpenChange: (open: boolean) => void;
  session: SessionContext;
}) {
  if (isCreateDialog) {
    return (
      <>
        <Dialog onOpenChange={onDialogOpenChange} open={dialogOpen}>
          <DialogContent className="max-h-[min(86vh,760px)] w-[calc(100vw-2rem)] p-6 sm:max-w-2xl sm:p-8" pending={isSaving}>
            <DialogHeader className="pr-8"><DialogTitle>Buat Materi</DialogTitle></DialogHeader>
            {children}
          </DialogContent>
        </Dialog>
        <UnsavedChangesConfirmationDialog description="Perubahan materi yang belum disimpan akan hilang." onDiscard={onDiscard} onOpenChange={onDiscardOpenChange} open={discardConfirmationOpen} />
      </>
    );
  }
  return (
    <MentorWorkspaceShell activeLabel="Materi" breadcrumbLabel={mode === "create" ? "Buat Materi" : "Edit Materi"} mainClassName="!max-w-none gap-6" onNavigateAway={() => !hasUnsavedChanges} searchPlaceholder="Cari materi..." session={session} showSearch={false} sidebarAppearance="reference" shouldGuardNavigation={hasUnsavedChanges}>
      {children}
    </MentorWorkspaceShell>
  );
}

function MateriBuilderBody({
  builderState, errors, hasUnsavedChanges, isArchived, isCreateDialog, isEditLocked,
  isLifecycleSaving, isPickerOpen, isPreviewOpen, isSaving, lockState, mode, onArchive,
  onFieldChange, onOpenPicker, onPreviewChange, onPublish, onReset, onRestore, onSave,
  onSelectDocument, onRetryLock, onPickerOpenChange, onUnsavedSave, parentHref,
  readiness, selectedDocumentName, selectedSubjectName, status, subjects,
}: {
  builderState: MateriBuilderState;
  errors: MateriBuilderErrors;
  hasUnsavedChanges: boolean;
  isArchived: boolean;
  isCreateDialog: boolean;
  isEditLocked: boolean;
  isLifecycleSaving: boolean;
  isPickerOpen: boolean;
  isPreviewOpen: boolean;
  isSaving: boolean;
  lockState: AuthoringLockState;
  mode: "create" | "edit";
  onArchive: () => void;
  onFieldChange: (field: keyof MateriBuilderState, value: string) => void;
  onOpenPicker: () => void;
  onPreviewChange: (open: boolean) => void;
  onPublish: () => void;
  onReset: () => void;
  onRestore: () => void;
  onSave: () => void;
  onSelectDocument: (asset: MediaAssetDto) => void;
  onRetryLock: () => void;
  onPickerOpenChange: (open: boolean) => void;
  onUnsavedSave: () => void;
  parentHref: string;
  readiness: "ready" | "incomplete";
  selectedDocumentName: string;
  selectedSubjectName: string;
  status: KaptenMateriView["status"];
  subjects: KaptenMateriSubjectView[];
}) {
  return (
    <>
      <div className={cn("flex w-full flex-col gap-6", isCreateDialog ? "gap-5" : "mx-auto max-w-[1180px]")}>
        {!isCreateDialog ? <MateriBuilderHeader builderState={builderState} isPreviewOpen={isPreviewOpen} mode={mode} parentHref={parentHref} /> : null}
        {mode === "edit" ? <ResourceAuthoringLockBanner hasLocalChanges={hasUnsavedChanges} onRetry={onRetryLock} resourceLabel="Materi" state={lockState} /> : null}
        <MateriBuilderEditor builderState={builderState} errors={errors} hasUnsavedChanges={hasUnsavedChanges} isArchived={isArchived} isPreviewOpen={isPreviewOpen} isSaving={isSaving || isLifecycleSaving} mode={mode} onFieldChange={onFieldChange} onArchive={onArchive} onOpenPicker={onOpenPicker} onPreviewChange={onPreviewChange} onPublish={onPublish} onRestore={onRestore} onSave={onSave} readiness={readiness} selectedDocumentName={selectedDocumentName} selectedSubjectName={selectedSubjectName} status={status} subjects={subjects} />
      </div>
      <MediaPickerDialog allowedMimeTypes={["application/pdf"]} onOpenChange={onPickerOpenChange} onSelect={onSelectDocument} open={isPickerOpen && !isArchived && !isEditLocked} selectedAssetId={builderState.documentAssetId || null} title="Pilih PDF Materi" />
      {!isCreateDialog && (hasUnsavedChanges || isSaving) ? <MateriUnsavedChangesBar isArchived={isArchived || isEditLocked} isSaving={isSaving} onReset={onReset} onSave={onUnsavedSave} /> : null}
    </>
  );
}

function KaptenMateriBuilderPageModule(props: {
  dialogOpen?: boolean;
  initialMateri?: KaptenMateriView | null;
  initialPreview?: boolean;
  initialSubjectSlug?: string;
  isCreateDialog?: boolean;
  materiId?: string;
  mode: "create" | "edit";
  onDialogOpenChange?: (open: boolean) => void;
  returnTo?: string;
  session: SessionContext;
  subjects: KaptenMateriSubjectView[];
}) {
  return (
    <ResourceEditLockProvider
      enabled={props.mode === "edit" && Boolean(props.materiId)}
      resourceId={props.materiId ?? "materi-placeholder"}
      resourceType="materi"
    >
      <MateriBuilderContent {...props} />
    </ResourceEditLockProvider>
  );
}

function MentorMateriCreateDialog({
  initialSubjectSlug,
  onOpenChange,
  open,
  returnTo,
  session,
  subjects,
}: {
  initialSubjectSlug?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  returnTo?: string;
  session: SessionContext;
  subjects: KaptenMateriSubjectView[];
}) {
  if (!open) return null;

  return (
    <KaptenMateriBuilderPageModule
      dialogOpen={open}
      initialSubjectSlug={initialSubjectSlug}
      isCreateDialog
      mode="create"
      onDialogOpenChange={onOpenChange}
      returnTo={returnTo}
      session={session}
      subjects={subjects}
    />
  );
}

export { KaptenMateriBuilderPageModule, MentorMateriCreateDialog };

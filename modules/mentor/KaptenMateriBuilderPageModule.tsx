"use client";

import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  Eye,
  FileText,
  Save,
} from "@/lib/icons";
import { useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldInput,
  FieldLabel,
} from "@/components/ui/field";
import { MATERI_DOCUMENT_MIME_TYPE } from "@/lib/materi/contract";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import {
  MediaAssetPreview,
  MediaPickerDialog,
} from "@/modules/media/media-library";
import type { MediaAssetDto } from "@/lib/media/types";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { saveMateriLessonAction } from "@/modules/mentor/materi-actions";
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
  saveError: string | null;
  pendingRouteReplacement: string | null;
  isSaving: boolean;
};

type MateriEditorAction = { type: "patch"; patch: Partial<MateriEditorState> };

function materiEditorReducer(state: MateriEditorState, action: MateriEditorAction): MateriEditorState {
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
      documentAssetId: document?.sourceKind === "managed" ? document.managedAssetId ?? "" : "",
      documentMimeType: document?.mimeType ?? "",
      documentName: document?.originalName ?? "",
      documentSource: document?.sourceKind ?? "managed",
      documentUrl: document?.sourceKind === "hosted" ? document.url ?? "" : "",
      subjectSlug: initialMateri.subjectSlug,
      title: initialMateri.title,
      videoDuration: initialMateri.duration,
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
    documentAssetId: fieldErrors.managedAssetId
      ?? (source === "managed" ? fieldErrors.document : undefined),
    documentMimeType: fieldErrors.documentMimeType,
    documentUrl: fieldErrors.documentUrl
      ?? (source === "hosted" ? fieldErrors.document : undefined),
    subjectSlug: fieldErrors.subjectSlug,
    title: fieldErrors.title,
    videoDuration: fieldErrors.videoDuration ?? fieldErrors.duration,
    videoUrl: fieldErrors.videoUrl,
  };
}

function MateriBuilderHeader({
  builderState,
  headerState,
  mode,
  onPreviewChange,
  onSave,
  parentHref,
  status,
}: {
  builderState: MateriBuilderState;
  headerState: {
    isArchived: boolean;
    isPreviewOpen: boolean;
    isSaving: boolean;
  };
  mode: "create" | "edit";
  onPreviewChange: (open: boolean) => void;
  onSave: () => void;
  parentHref: string;
  status: KaptenMateriView["status"];
}) {
  const { isArchived, isPreviewOpen, isSaving } = headerState;

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
        actions={(
          <>
            <Button aria-label="Preview materi" onClick={() => onPreviewChange(true)} size="icon" title="Preview materi" type="button" variant="reference">
              <Eye />
            </Button>
            <Button disabled={isSaving || isArchived} onClick={onSave} type="button" variant="brand">
              <Save />
              {isSaving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        )}
        className="min-w-0 flex-1"
        description={(
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{mode === "create" ? "Susun bacaan PDF dan video pendamping untuk materi ini." : "Kelola bacaan dan video pendamping materi ini."}</span>
            <ReferenceStatusBadge size="xs" status={status} />
          </span>
        )}
        title={mode === "create" ? "Buat Materi" : builderState.title || "Edit Materi"}
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
  return (
    <ReferenceSurface
      aria-live="polite"
      className="animate-in fade-in-0 slide-in-from-bottom-3 fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-xl flex-col gap-3 p-3 pl-4 transition-opacity transition-transform duration-300 ease-out backdrop-blur-md motion-reduce:animate-none sm:right-0 sm:left-(--sidebar-offset) sm:w-[min(calc(100vw-3rem),36rem)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center text-primary-800">
          <AlertCircle className="size-5" strokeWidth={2.2} />
        </span>
        <p className="text-sm font-medium leading-5 text-secondary-800">Ada perubahan yang belum disimpan.</p>
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

function MateriBuilderEditor({
  builderState,
  errors,
  isArchived,
  isPreviewOpen,
  onFieldChange,
  onOpenPicker,
  onPreviewChange,
  onSave,
  readiness,
  selectedDocumentName,
  selectedSubjectName,
  status,
  subjects,
}: {
  builderState: MateriBuilderState;
  errors: MateriBuilderErrors;
  isArchived: boolean;
  isPreviewOpen: boolean;
  onFieldChange: (field: keyof MateriBuilderState, value: string) => void;
  onOpenPicker: () => void;
  onPreviewChange: (open: boolean) => void;
  onSave: () => void;
  readiness: "ready" | "incomplete";
  selectedDocumentName: string;
  selectedSubjectName: string;
  status: KaptenMateriView["status"];
  subjects: KaptenMateriSubjectView[];
}) {
  const selectedSubjectOption = subjects.find((subject) => subject.slug === builderState.subjectSlug);
  const hasDocumentName = Boolean(builderState.documentName.trim());

  return isPreviewOpen ? (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-secondary-900">Pratinjau materi</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 max-w-[42ch] truncate text-xs text-secondary-500">
              {builderState.title || "Materi tanpa judul"}
            </p>
            <ReferenceStatusBadge size="xs" status={status} />
          </div>
        </div>
        <Button onClick={() => onPreviewChange(false)} type="button" variant="reference">
          <ChevronLeft />
          Kembali ke editor
        </Button>
      </div>
      <ReferenceSurface as="section" aria-live="polite" className="max-w-4xl p-5 sm:p-7">
        <MateriLessonPresentation
          document={toPreviewDocument(builderState)}
          duration={builderState.videoDuration.trim() || undefined}
          managedDocumentPreview={builderState.documentAssetId ? (
            <MediaAssetPreview
              alt={builderState.documentName.trim() || "Dokumen Materi"}
              assetId={builderState.documentAssetId}
              className="min-h-[16rem] rounded-none bg-voyage-canvas md:min-h-[24rem]"
              showDownloadControls
            />
          ) : undefined}
          showDuration
          showSectionLabel={false}
          subject={selectedSubjectName}
          title={builderState.title}
          videoUrl={builderState.videoUrl}
        />
      </ReferenceSurface>
    </>
  ) : (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <ReferenceSurface as="section" aria-labelledby="materi-details-title" className="grid gap-5 p-5 sm:p-7">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="materi-details-title">Materi</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
          <Field>
            <FieldLabel htmlFor="materi-subject">Subject</FieldLabel>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-describedby={errors.subjectSlug ? "materi-subject-error" : undefined}
                aria-invalid={Boolean(errors.subjectSlug)}
                aria-label="Subject"
                disabled={isArchived}
                id="materi-subject"
                render={<Button className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "h-12", errors.subjectSlug && "border-student-status-danger-border")} variant="reference" />}
              >
                <span className="truncate">
                  {selectedSubjectOption ? `${selectedSubjectOption.code} · ${selectedSubjectOption.name}` : "Pilih subject"}
                </span>
                <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-secondary-500" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-(--anchor-width)">
                <DropdownMenuRadioGroup onValueChange={(value) => onFieldChange("subjectSlug", value)} value={builderState.subjectSlug}>
                  {subjects.map((subject) => (
                    <DropdownMenuRadioItem closeOnClick key={subject.slug} value={subject.slug}>
                      {subject.code} · {subject.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <FieldError error={errors.subjectSlug} id="materi-subject-error" />
          </Field>
          <Field>
            <FieldLabel htmlFor="materi-title">Judul materi</FieldLabel>
            <FieldInput
              aria-describedby={errors.title ? "materi-title-error" : undefined}
              aria-invalid={Boolean(errors.title)}
              className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-12 text-base font-semibold`}
              disabled={isArchived}
              id="materi-title"
              onChange={(event) => onFieldChange("title", event.target.value)}
              value={builderState.title}
            />
            <FieldError error={errors.title} id="materi-title-error" />
          </Field>
        </div>
      </ReferenceSurface>

      <ReferenceSurface as="section" aria-labelledby="materi-document-title" className="grid gap-5 p-5 sm:p-7">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="materi-document-title">Bacaan PDF</h2>
        </div>

        <ReferenceSurface className="space-y-4 p-4 sm:p-5" variant="inset">
          <div className={cn("flex flex-wrap justify-between gap-4", hasDocumentName ? "items-center" : "items-start")}>
            <div className={cn("flex min-w-0 gap-3", hasDocumentName ? "items-center" : "items-start")}>
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-primary-800 ring-1 ring-primary-100">
                <FileText className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-secondary-900">{selectedDocumentName}</p>
                {!hasDocumentName ? <p className="mt-1 text-xs leading-5 text-secondary-500">Placeholder</p> : null}
              </div>
            </div>
            <Button disabled={isArchived} onClick={onOpenPicker} size="sm" type="button" variant="reference">
              {builderState.documentAssetId ? "Ganti PDF" : "Pilih PDF"}
            </Button>
          </div>
          <FieldError error={errors.documentAssetId || errors.documentMimeType} id="materi-document-error" />
        </ReferenceSurface>
      </ReferenceSurface>

      <ReferenceSurface as="section" aria-labelledby="materi-video-title" className="grid gap-5 p-5 sm:p-7">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="materi-video-title">Video pendamping (opsional)</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_180px]">
          <Field>
            <FieldLabel htmlFor="materi-video-url">URL video</FieldLabel>
            <FieldInput
              aria-describedby={errors.videoUrl ? "materi-video-url-error" : undefined}
              aria-invalid={Boolean(errors.videoUrl)}
              className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-12`}
              disabled={isArchived}
              id="materi-video-url"
              onChange={(event) => onFieldChange("videoUrl", event.target.value)}
              placeholder="https://youtube.com/..."
              type="url"
              value={builderState.videoUrl}
            />
            <FieldError error={errors.videoUrl} id="materi-video-url-error" />
          </Field>
          <Field>
            <FieldLabel htmlFor="materi-video-duration">Durasi video</FieldLabel>
            <FieldInput
              aria-describedby={errors.videoDuration ? "materi-video-duration-error" : undefined}
              aria-invalid={Boolean(errors.videoDuration)}
              className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-12`}
              disabled={isArchived}
              id="materi-video-duration"
              onChange={(event) => onFieldChange("videoDuration", event.target.value)}
              placeholder="08:30"
              value={builderState.videoDuration}
            />
            <FieldError error={errors.videoDuration} id="materi-video-duration-error" />
          </Field>
        </div>
        {readiness === "incomplete" ? (
          <ReferenceSurface className="px-4 py-3 text-sm leading-6 text-secondary-700" role="status" variant="inset">
            Lengkapi subject, judul, dan PDF. Video pendamping hanya perlu diisi jika URL dan durasinya lengkap.
          </ReferenceSurface>
        ) : null}
      </ReferenceSurface>
    </form>
  );
}

function useMateriNavigationGuards({ hasUnsavedChanges, pendingRouteReplacement, router }: { hasUnsavedChanges: boolean; pendingRouteReplacement: string | null; router: ReturnType<typeof useRouter> }) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!pendingRouteReplacement || hasUnsavedChanges) return;
    const frame = window.requestAnimationFrame(() => router.replace(pendingRouteReplacement));
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
    isPickerOpen,
    isPreviewOpen,
    isSaving,
    pendingRouteReplacement,
    saveError,
    savedMateri,
  } = editorState;
  const updateEditor = (patch: Partial<MateriEditorState>) => dispatch({ patch, type: "patch" });

  const selectedSubject = getSubject(subjects, builderState.subjectSlug);
  const parentHref = returnTo
    ?? (initialMateri ? `/mentor/materi/subject/${initialMateri.subjectSlug}` : "/mentor/materi");
  const materiStatus = savedMateri?.status ?? "draft";
  const isArchived = materiStatus === "archived";
  const readiness = Object.keys(validateMateriBuilderState(builderState, subjects)).length === 0
    ? "ready"
    : "incomplete";
  const selectedDocumentName = builderState.documentName.trim() || "test.pdf";

  useMateriNavigationGuards({ hasUnsavedChanges, pendingRouteReplacement, router });

  function markChanged(nextErrors?: MateriBuilderErrors) {
    updateEditor({
      errors: nextErrors ?? errors,
      hasUnsavedChanges: true,
      saveError: null,
    });
  }

  function updateField(field: keyof MateriBuilderState, value: string) {
    setBuilderState((current) => ({ ...current, [field]: value }));
    markChanged({ ...errors, [field]: undefined });
  }

  function selectManagedDocument(asset: MediaAssetDto) {
    if (asset.mimeType.trim().toLowerCase() !== MATERI_DOCUMENT_MIME_TYPE) {
      updateEditor({ errors: {
        ...errors,
        documentMimeType: "Dokumen Materi harus berformat PDF.",
      } });
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
      updateEditor({ saveError: "Materi yang diarsipkan hanya dapat dipulihkan sebelum diedit." });
      return;
    }

    const nextErrors = validateMateriBuilderState(builderState, subjects);
    if (Object.keys(nextErrors).length) {
      updateEditor({ errors: nextErrors, hasUnsavedChanges: true, saveError: "Lengkapi field yang ditandai sebelum menyimpan materi." });
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
          errors: mapActionErrors(result.fieldErrors, builderState.documentSource),
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
        updateEditor({ pendingRouteReplacement: returnTo
          ? `${result.lesson.href}?${new URLSearchParams({ returnTo })}`
          : result.lesson.href });
      }
      router.refresh();
    } catch (error) {
      updateEditor({ hasUnsavedChanges: true, saveError: error instanceof Error ? error.message : "Materi tidak dapat disimpan. Coba lagi." });
    } finally {
      updateEditor({ isSaving: false });
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
          headerState={{ isArchived, isPreviewOpen, isSaving }}
          mode={mode}
          onPreviewChange={(open) => updateEditor({ isPreviewOpen: open })}
          onSave={() => void saveLesson()}
          parentHref={parentHref}
          status={materiStatus}
        />

        {!isPreviewOpen && saveError ? (
          <ReferenceSurface className="flex items-start gap-2 px-4 py-3 text-sm leading-6 text-student-status-danger-fg" role="alert" variant="inset">
            <AlertCircle className="mt-1 size-4 shrink-0" />
            {saveError}
          </ReferenceSurface>
        ) : null}
        <MateriBuilderEditor
          builderState={builderState}
          errors={errors}
          isArchived={isArchived}
          isPreviewOpen={isPreviewOpen}
          onFieldChange={updateField}
          onOpenPicker={() => updateEditor({ isPickerOpen: true })}
          onPreviewChange={(open) => updateEditor({ isPreviewOpen: open })}
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

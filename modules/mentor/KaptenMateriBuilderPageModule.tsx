"use client";

import Link from "next/link";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Ellipsis,
  Eye,
  FileText,
  LoaderCircle,
  Save,
  Trash2,
  Upload,
} from "@/lib/icons";
import { useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldInput,
  FieldLabel,
} from "@/components/ui/field";
import { fieldControlClassName } from "@/components/ui/field-constants";
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
  unpublishMateriLessonAction,
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

type LifecycleIntent = "archive" | "publish" | "unpublish" | "returnToDraft";

type MateriEditorState = {
  savedMateri: KaptenMateriView | null;
  errors: MateriBuilderErrors;
  hasUnsavedChanges: boolean;
  isPreviewOpen: boolean;
  isPickerOpen: boolean;
  lastSavedAt: string | null;
  saveError: string | null;
  pendingRouteReplacement: string | null;
  isSaving: boolean;
  lifecycleIntent: LifecycleIntent | null;
  lifecycleError: string | null;
};

type MateriEditorAction = { type: "patch"; patch: Partial<MateriEditorState> };

function materiEditorReducer(state: MateriEditorState, action: MateriEditorAction): MateriEditorState {
  return action.type === "patch" ? { ...state, ...action.patch } : state;
}

const lifecycleLabels = {
  archived: "Diarsipkan",
  draft: "Draf",
  published: "Diterbitkan",
  scheduled: "Terjadwal",
} as const;

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
    <p className="text-sm leading-5 text-red-700" id={id}>
      {error}
    </p>
  ) : null;
}

function LifecycleLabel({ status }: { status: KaptenMateriView["status"] }) {
  return (
    <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-900">
      {lifecycleLabels[status]}
    </span>
  );
}

function lifecycleCopy(intent: LifecycleIntent) {
  if (intent === "publish") {
    return {
      confirm: "Terbitkan",
      description: "Materi akan tersedia untuk siswa.",
      title: "Terbitkan materi?",
    };
  }
  if (intent === "unpublish") {
    return {
      confirm: "Batalkan terbit",
      description: "Materi akan kembali menjadi draf dan tidak lagi terlihat oleh siswa.",
      title: "Batalkan penerbitan?",
    };
  }
  if (intent === "archive") {
    return {
      confirm: "Arsipkan",
      description: "Materi tidak lagi tersedia untuk siswa sampai dipulihkan.",
      title: "Arsipkan materi?",
    };
  }
  return {
    confirm: "Kembalikan ke draf",
    description: "Materi akan kembali menjadi draf.",
    title: "Kembalikan materi ke draf?",
  };
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
  onLifecycle,
  onPreviewChange,
  onSave,
  parentHref,
  saveLabel,
  savedMateri,
}: {
  builderState: MateriBuilderState;
  headerState: {
    hasUnsavedChanges: boolean;
    isArchived: boolean;
    isPreviewOpen: boolean;
    isSaving: boolean;
    materiStatus: KaptenMateriView["status"];
  };
  mode: "create" | "edit";
  onLifecycle: (intent: LifecycleIntent) => void;
  onPreviewChange: (open: boolean) => void;
  onSave: () => void;
  parentHref: string;
  saveLabel: string;
  savedMateri: KaptenMateriView | null;
}) {
  const { hasUnsavedChanges, isArchived, isPreviewOpen, isSaving, materiStatus } = headerState;

  return (
    <section
      className={cn(
        "rounded-[28px] border border-primary-100 bg-white p-5 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] md:p-7",
        isPreviewOpen ? "flex flex-wrap items-center justify-between gap-4" : "space-y-5",
      )}
    >
      {isPreviewOpen ? (
        <div className="flex min-w-0 items-center gap-4">
          <Button onClick={() => onPreviewChange(false)} type="button" variant="brandOutline">
            <ChevronLeft />
            Kembali ke editor
          </Button>
          <div className="hidden min-w-0 sm:block">
            <p className="text-sm font-semibold text-secondary-900">Pratinjau materi</p>
            <p className="mt-1 max-w-[42ch] truncate text-xs text-secondary-500">
              {builderState.title || "Materi tanpa judul"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <Button
              className="-ml-3 min-h-[44px]"
              nativeButton={false}
              render={<Link href={parentHref} />}
              size="sm"
              aria-label="Kembali ke materi"
              variant="ghost"
            >
              <ChevronLeft />
              Kembali ke materi
            </Button>
            <h1 className="mt-4 max-w-4xl break-words text-2xl leading-tight font-bold tracking-[-0.03em] text-secondary-900 md:text-3xl">
              {mode === "create" ? "Buat Materi" : builderState.title || "Edit Materi"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-2 text-sm font-medium", hasUnsavedChanges ? "text-secondary-600" : "text-primary-800")}>
                <span aria-hidden="true" className={cn("size-2 rounded-full", hasUnsavedChanges ? "bg-secondary-400" : "bg-primary-700")} />
                {hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}
              </span>
              <LifecycleLabel status={materiStatus} />
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button aria-label="Preview lesson" className="min-h-[44px]" onClick={() => onPreviewChange(true)} size="sm" type="button" variant="brandOutline">
              <Eye />
              Preview
            </Button>
            <Button className="min-h-[44px] min-w-36" disabled={isSaving || isArchived} onClick={onSave} type="button" variant="brand">
              <Save />
              {isSaving ? "Menyimpan..." : saveLabel}
            </Button>
            {savedMateri ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button aria-label="Aksi materi" disabled={isSaving || hasUnsavedChanges} size="icon-sm" type="button" variant="ghost" />}>
                  <Ellipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuGroup>
                    {materiStatus === "draft" ? (
                      <DropdownMenuItem disabled={savedMateri.readiness !== "ready" || isSaving || hasUnsavedChanges} onClick={() => onLifecycle("publish")}>
                        <Upload />
                        Terbitkan
                      </DropdownMenuItem>
                    ) : null}
                    {materiStatus === "published" ? (
                      <DropdownMenuItem disabled={isSaving || hasUnsavedChanges} onClick={() => onLifecycle("unpublish")}>
                        Batalkan terbit
                      </DropdownMenuItem>
                    ) : null}
                    {materiStatus !== "archived" ? (
                      <DropdownMenuItem disabled={isSaving || hasUnsavedChanges} onClick={() => onLifecycle("archive")}>
                        <Archive />
                        Arsipkan
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled={isSaving} onClick={() => onLifecycle("returnToDraft")}>
                        Pulihkan
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled variant="destructive">
                      <Trash2 />
                      Hapus
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function ReadinessItem({
  label,
  ready,
}: {
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full",
          ready ? "bg-primary-700 text-white" : "border border-secondary-200 bg-white",
        )}
      >
        {ready ? <CheckCircle2 className="size-3.5" weight="bold" /> : null}
      </span>
      <span className={ready ? "text-secondary-800" : "text-secondary-500"}>{label}</span>
    </div>
  );
}

function MateriBuilderReadinessRail({
  builderState,
  hasUnsavedChanges,
  isArchived,
  materiStatus,
  readiness,
  subjects,
}: {
  builderState: MateriBuilderState;
  hasUnsavedChanges: boolean;
  isArchived: boolean;
  materiStatus: KaptenMateriView["status"];
  readiness: "ready" | "incomplete";
  subjects: KaptenMateriSubjectView[];
}) {
  const validationErrors = validateMateriBuilderState(builderState, subjects);
  const hasManagedDocument = builderState.documentSource === "managed";
  const documentReady = hasManagedDocument
    ? Boolean(builderState.documentAssetId.trim()) && !validationErrors.documentAssetId && !validationErrors.documentMimeType
    : Boolean(builderState.documentUrl.trim()) && !validationErrors.documentUrl && !validationErrors.documentMimeType;
  const videoReady = (!builderState.videoUrl.trim() && !builderState.videoDuration.trim())
    || (Boolean(builderState.videoUrl.trim()) && Boolean(builderState.videoDuration.trim()) && !validationErrors.videoUrl && !validationErrors.videoDuration);
  const checks = [
    { label: "Subject dipilih", ready: Boolean(builderState.subjectSlug) && !validationErrors.subjectSlug },
    { label: "Judul materi", ready: Boolean(builderState.title.trim()) && !validationErrors.title },
    { label: "PDF bacaan", ready: documentReady },
    { label: "Video opsional", ready: videoReady },
  ];

  return (
    <aside aria-label="Ringkasan materi" className="space-y-4 xl:sticky xl:top-5 xl:self-start">
      <section className="rounded-[24px] border border-primary-100 bg-primary-50/60 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em] text-secondary-900">Kesiapan materi</h2>
            <p className="mt-1 text-sm leading-6 text-secondary-600">
              {readiness === "ready" ? "Semua kebutuhan utama sudah lengkap." : "Lengkapi item yang masih tertinggal."}
            </p>
          </div>
          <span className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
            readiness === "ready" ? "bg-primary-700 text-white" : "bg-[#fff3c4] text-[#765b00]",
          )}>
            {readiness === "ready" ? "Siap" : "Belum siap"}
          </span>
        </div>
        <div className="mt-5 space-y-3" role="list">
          {checks.map((check) => (
            <div key={check.label} role="listitem">
              <ReadinessItem {...check} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-primary-100 bg-white p-5 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-[-0.02em] text-secondary-900">Status publikasi</h2>
          <LifecycleLabel status={materiStatus} />
        </div>
        <p className="mt-3 text-sm leading-6 text-secondary-600">
          {materiStatus === "published"
            ? "Materi ini sedang tersedia untuk siswa."
            : materiStatus === "archived"
              ? "Materi ini diarsipkan dan tidak tersedia untuk siswa."
              : "Materi ini masih berupa draf."}
        </p>
        {hasUnsavedChanges ? (
          <p className="mt-4 rounded-2xl border border-[#ead9a5] bg-[#fff8df] px-3.5 py-3 text-sm leading-5 text-[#765b00]" role="status">
            Simpan perubahan sebelum mengubah status publikasi.
          </p>
        ) : null}
        {isArchived ? (
          <p className="mt-4 text-xs leading-5 text-secondary-500">Pulihkan materi untuk mengedit isinya.</p>
        ) : null}
      </section>
    </aside>
  );
}

function MateriBuilderEditor({
  builderState,
  errors,
  isArchived,
  isPreviewOpen,
  onDocumentSourceChange,
  onFieldChange,
  onHostedDocumentChange,
  onOpenPicker,
  onSave,
  readiness,
  selectedDocumentName,
  selectedSubjectName,
  subjects,
}: {
  builderState: MateriBuilderState;
  errors: MateriBuilderErrors;
  isArchived: boolean;
  isPreviewOpen: boolean;
  onDocumentSourceChange: (source: MateriDocumentSource) => void;
  onFieldChange: (field: keyof MateriBuilderState, value: string) => void;
  onHostedDocumentChange: (value: string) => void;
  onOpenPicker: () => void;
  onSave: () => void;
  readiness: "ready" | "incomplete";
  selectedDocumentName: string;
  selectedSubjectName: string;
  subjects: KaptenMateriSubjectView[];
}) {
  return isPreviewOpen ? (
    <section aria-live="polite" className="max-w-4xl rounded-[28px] border border-primary-100 bg-white p-5 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] sm:p-7">
      <MateriLessonPresentation
        document={toPreviewDocument(builderState)}
        duration={builderState.videoDuration.trim() || undefined}
        managedDocumentPreview={builderState.documentAssetId ? (
          <MediaAssetPreview
            alt={builderState.documentName.trim() || "Dokumen Materi"}
            assetId={builderState.documentAssetId}
            className="min-h-[16rem] rounded-none bg-[#f7faf8] md:min-h-[24rem]"
            showDownloadControls
          />
        ) : undefined}
        showDuration
        showSectionLabel={false}
        subject={selectedSubjectName}
        title={builderState.title}
        videoUrl={builderState.videoUrl}
      />
    </section>
  ) : (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <section className="space-y-5 rounded-[24px] border border-primary-100 bg-white p-5 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] sm:p-6">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.025em] text-secondary-900">Materi</h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-secondary-500">Pilih subject dan beri judul untuk bacaan ini.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
          <Field>
            <FieldLabel htmlFor="materi-subject">Subject</FieldLabel>
            <div className="relative">
              <select
                aria-label="Subject"
                aria-describedby={errors.subjectSlug ? "materi-subject-error" : undefined}
                aria-invalid={Boolean(errors.subjectSlug)}
                className={`${fieldControlClassName} appearance-none pr-12`}
                id="materi-subject"
                disabled={isArchived}
                onChange={(event) => onFieldChange("subjectSlug", event.target.value)}
                value={builderState.subjectSlug}
              >
                {subjects.map((subject) => <option key={subject.slug} value={subject.slug}>{subject.code} · {subject.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
            </div>
            <FieldError error={errors.subjectSlug} id="materi-subject-error" />
          </Field>
          <Field>
            <FieldLabel htmlFor="materi-title">Judul materi</FieldLabel>
            <FieldInput
              aria-describedby={errors.title ? "materi-title-error" : undefined}
              aria-invalid={Boolean(errors.title)}
              disabled={isArchived}
              id="materi-title"
              onChange={(event) => onFieldChange("title", event.target.value)}
              value={builderState.title}
            />
            <FieldError error={errors.title} id="materi-title-error" />
          </Field>
        </div>
      </section>

      <section className="space-y-5 rounded-[24px] border border-primary-100 bg-white p-5 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] sm:p-6">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.025em] text-secondary-900">Bacaan PDF</h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-secondary-500">Satu PDF wajib dipilih dari Media Kapten atau diberikan sebagai URL hosted.</p>
        </div>

        <div aria-label="Sumber PDF" className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {["managed", "hosted"].map((source) => {
            const typedSource = source as MateriDocumentSource;
            const isSelected = builderState.documentSource === typedSource;
            return (
              <button
                aria-checked={isSelected}
                className={cn(
                  "flex min-h-14 items-center justify-between rounded-2xl border px-4 text-left text-sm font-bold transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35",
                  isSelected
                    ? "border-primary-500 bg-primary-50 text-primary-900 shadow-[0_12px_24px_-20px_rgba(1,76,56,0.55)]"
                    : "border-primary-100 bg-white text-secondary-700 hover:border-primary-300 hover:bg-primary-50/40",
                )}
                key={typedSource}
                disabled={isArchived}
                onClick={() => onDocumentSourceChange(typedSource)}
                role="radio"
                type="button"
              >
                <span>{typedSource === "managed" ? "Media Kapten" : "URL hosted"}</span>
                <span aria-hidden="true" className={cn("size-2.5 rounded-full", isSelected ? "bg-primary-700" : "bg-secondary-200")} />
              </button>
            );
          })}
        </div>

        {builderState.documentSource === "managed" ? (
          <div className="space-y-4 rounded-2xl border border-primary-100 bg-primary-50/45 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-primary-800 ring-1 ring-primary-100">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-secondary-900">{selectedDocumentName}</p>
                  <p className="mt-1 text-xs leading-5 text-secondary-500">
                    {builderState.documentAssetId ? "PDF managed dipilih dari Media Kapten." : "Belum ada PDF managed yang dipilih."}
                  </p>
                </div>
              </div>
              <Button disabled={isArchived} onClick={onOpenPicker} size="sm" type="button" variant="brandOutline">
                {builderState.documentAssetId ? "Ganti PDF" : "Pilih PDF"}
              </Button>
            </div>
            <FieldError error={errors.documentAssetId || errors.documentMimeType} id="materi-document-error" />
          </div>
        ) : (
          <Field>
            <FieldLabel htmlFor="materi-document-url">URL PDF hosted</FieldLabel>
            <FieldInput
              aria-describedby={errors.documentUrl ? "materi-document-url-error" : undefined}
              aria-invalid={Boolean(errors.documentUrl)}
              disabled={isArchived}
              id="materi-document-url"
              onChange={(event) => onHostedDocumentChange(event.target.value)}
              placeholder="https://contoh.com/materi.pdf"
              type="url"
              value={builderState.documentUrl}
            />
            <p className="text-xs leading-5 text-secondary-500">Gunakan URL HTTP(S) yang mengarah ke PDF. URL tanpa akhiran .pdf perlu metadata PDF dari sumbernya.</p>
            <FieldError error={errors.documentUrl || errors.documentMimeType} id="materi-document-url-error" />
          </Field>
        )}
      </section>

      <section className="space-y-5 rounded-[24px] border border-primary-100 bg-white p-5 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] sm:p-6">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.025em] text-secondary-900">Video pendamping (opsional)</h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-secondary-500">Isi URL dan durasi bersama-sama, atau biarkan keduanya kosong untuk materi PDF saja.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_180px]">
          <Field>
            <FieldLabel htmlFor="materi-video-url">URL video</FieldLabel>
            <FieldInput
              aria-describedby={errors.videoUrl ? "materi-video-url-error" : undefined}
              aria-invalid={Boolean(errors.videoUrl)}
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
          <p className="rounded-2xl border border-[#ead9a5] bg-[#fff8df] px-4 py-3 text-sm leading-6 text-[#765b00]" role="status">Lengkapi subject, judul, dan PDF. Video pendamping hanya perlu diisi jika URL dan durasinya lengkap.</p>
        ) : (
          <p className="rounded-2xl border border-primary-100 bg-primary-50/55 px-4 py-3 text-sm font-medium leading-6 text-primary-900" role="status">Materi siap disimpan. PDF menjadi bacaan utama siswa.</p>
        )}
      </section>
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

function MateriLifecycleDialog({ confirmation, isSaving, lifecycleError, onClose, onConfirm, open }: { confirmation: ReturnType<typeof lifecycleCopy> | null; isSaving: boolean; lifecycleError: string | null; onClose: () => void; onConfirm: () => void; open: boolean }) {
  return <Dialog onOpenChange={(nextOpen) => { if (!nextOpen && !isSaving) onClose(); }} open={open}><DialogContent pending={isSaving} showCloseButton={!isSaving} variant="info"><DialogHeader><DialogTitle>{confirmation?.title}</DialogTitle><DialogDescription>{confirmation?.description}</DialogDescription></DialogHeader>{lifecycleError ? <div aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{lifecycleError}</div> : null}<DialogFooter><DialogClose disabled={isSaving} render={<Button type="button" variant="brandOutline" />}>Batal</DialogClose><Button disabled={isSaving} onClick={onConfirm} type="button" variant="brand">{isSaving ? <><LoaderCircle className="animate-spin" />Memproses...</> : confirmation?.confirm}</Button></DialogFooter></DialogContent></Dialog>;
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
    lastSavedAt: null,
    lifecycleError: null,
    lifecycleIntent: null,
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
    lastSavedAt,
    lifecycleError,
    lifecycleIntent,
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
  const saveLabel = materiStatus === "draft" ? "Simpan draf" : "Simpan perubahan";
  const readiness = Object.keys(validateMateriBuilderState(builderState, subjects)).length === 0
    ? "ready"
    : "incomplete";
  const selectedDocumentName = builderState.documentName.trim() || "Belum ada PDF yang dipilih";

  useMateriNavigationGuards({ hasUnsavedChanges, pendingRouteReplacement, router });

  function markChanged(nextErrors?: MateriBuilderErrors) {
    updateEditor({
      errors: nextErrors ?? errors,
      hasUnsavedChanges: true,
      lastSavedAt: null,
      saveError: null,
    });
  }

  function updateField(field: keyof MateriBuilderState, value: string) {
    setBuilderState((current) => ({ ...current, [field]: value }));
    markChanged({ ...errors, [field]: undefined });
  }

  function switchDocumentSource(source: MateriDocumentSource) {
    if (builderState.documentSource === source) return;
    setBuilderState((current) => ({
      ...current,
      documentAssetId: source === "managed" ? current.documentAssetId : "",
      documentMimeType: "",
      documentName: "",
      documentSource: source,
      documentUrl: source === "hosted" ? current.documentUrl : "",
    }));
    markChanged({
      ...errors,
      documentAssetId: undefined,
      documentMimeType: undefined,
      documentUrl: undefined,
    });
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
        lastSavedAt: result.message,
        saveError: null,
        savedMateri: result.lesson,
      });
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

  async function confirmLifecycle() {
    if (!savedMateri || !lifecycleIntent || isSaving) return;
    if (hasUnsavedChanges) {
      updateEditor({ lifecycleError: "Simpan perubahan materi terlebih dahulu sebelum mengubah status publikasi." });
      return;
    }
    updateEditor({ isSaving: true, lifecycleError: null });
    try {
      const result = lifecycleIntent === "publish"
        ? await publishMateriLessonAction(savedMateri.code)
        : lifecycleIntent === "unpublish"
          ? await unpublishMateriLessonAction(savedMateri.code)
          : lifecycleIntent === "archive"
            ? await archiveMateriLessonAction(savedMateri.code)
            : await returnMateriLessonToDraftAction(savedMateri.code);
      if (!result.ok) {
        updateEditor({ lifecycleError: result.message });
        return;
      }
      updateEditor({
        lastSavedAt: result.message,
        lifecycleError: null,
        lifecycleIntent: null,
        saveError: null,
        savedMateri: result.lesson,
      });
      router.refresh();
    } catch (error) {
      updateEditor({ lifecycleError: error instanceof Error ? error.message : "Status publikasi tidak dapat diubah. Coba lagi." });
    } finally {
      updateEditor({ isSaving: false });
    }
  }

  function openLifecycle(intent: LifecycleIntent) {
    updateEditor({ lifecycleError: null });
    if (hasUnsavedChanges) {
      updateEditor({ lifecycleError: "Simpan perubahan materi terlebih dahulu sebelum mengubah status publikasi.", lifecycleIntent: null });
      return;
    }
    updateEditor({ lifecycleIntent: intent });
  }

  const confirmation = lifecycleIntent ? lifecycleCopy(lifecycleIntent) : null;

  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={mode === "create" ? "Buat Materi" : "Edit Materi"}
      mainClassName="max-w-6xl gap-6"
      onNavigateAway={() => !hasUnsavedChanges}
      searchPlaceholder="Cari materi..."
      session={session}
      shouldGuardNavigation={hasUnsavedChanges}
    >
      <MateriBuilderHeader
        builderState={builderState}
        headerState={{ hasUnsavedChanges, isArchived, isPreviewOpen, isSaving, materiStatus }}
        mode={mode}
        onLifecycle={openLifecycle}
        onPreviewChange={(open) => updateEditor({ isPreviewOpen: open })}
        onSave={() => void saveLesson()}
        parentHref={parentHref}
        saveLabel={saveLabel}
        savedMateri={savedMateri}
      />

      {!isPreviewOpen && lastSavedAt ? (
        <p className="flex items-center gap-2 text-sm font-medium text-primary-800" role="status">
          <CheckCircle2 className="size-4" />
          {lastSavedAt}
        </p>
      ) : null}
      {!isPreviewOpen && saveError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">
          {saveError}
        </div>
      ) : null}
      <div className={cn(
        "grid items-start gap-6",
        isPreviewOpen ? "max-w-4xl" : "xl:grid-cols-[minmax(0,1fr)_280px]",
      )}>
        <MateriBuilderEditor
          builderState={builderState}
          errors={errors}
          isArchived={isArchived}
          isPreviewOpen={isPreviewOpen}
          onDocumentSourceChange={switchDocumentSource}
          onFieldChange={updateField}
          onHostedDocumentChange={(value) => {
            setBuilderState((current) => ({
              ...current,
              documentMimeType: value === current.documentUrl ? current.documentMimeType : "",
              documentName: value === current.documentUrl ? current.documentName : "",
              documentUrl: value,
            }));
            markChanged({ ...errors, documentUrl: undefined });
          }}
          onOpenPicker={() => updateEditor({ isPickerOpen: true })}
          onSave={() => void saveLesson()}
          readiness={readiness}
          selectedDocumentName={selectedDocumentName}
          selectedSubjectName={selectedSubject?.name ?? "Materi"}
          subjects={subjects}
        />
        {!isPreviewOpen ? (
          <MateriBuilderReadinessRail
            builderState={builderState}
            hasUnsavedChanges={hasUnsavedChanges}
            isArchived={isArchived}
            materiStatus={materiStatus}
            readiness={readiness}
            subjects={subjects}
          />
        ) : null}
      </div>

      <MediaPickerDialog
        allowedMimeTypes={["application/pdf"]}
        onOpenChange={(open) => updateEditor({ isPickerOpen: open })}
        onSelect={selectManagedDocument}
        open={isPickerOpen && !isArchived}
        selectedAssetId={builderState.documentAssetId || null}
        title="Pilih PDF Materi"
      />

      <MateriLifecycleDialog confirmation={confirmation} isSaving={isSaving} lifecycleError={lifecycleError} onClose={() => updateEditor({ lifecycleError: null, lifecycleIntent: null })} onConfirm={() => void confirmLifecycle()} open={Boolean(lifecycleIntent)} />
    </MentorWorkspaceShell>
  );
}

export { KaptenMateriBuilderPageModule };

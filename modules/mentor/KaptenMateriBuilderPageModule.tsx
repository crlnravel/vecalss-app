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
} from "lucide-react";
import { useEffect, useState } from "react";
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
  fieldControlClassName,
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
  const labels = {
    archived: "Diarsipkan",
    draft: "Draf",
    published: "Diterbitkan",
    scheduled: "Terjadwal",
  } as const;
  return (
    <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-900">
      {labels[status]}
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
  const [savedMateri, setSavedMateri] = useState<KaptenMateriView | null>(initialMateri);
  const [errors, setErrors] = useState<MateriBuilderErrors>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(initialPreview);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lifecycleIntent, setLifecycleIntent] = useState<LifecycleIntent | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

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

  function markChanged(nextErrors?: MateriBuilderErrors) {
    setHasUnsavedChanges(true);
    setLastSavedAt(null);
    setSaveError(null);
    if (nextErrors) setErrors(nextErrors);
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
      setErrors((current) => ({
        ...current,
        documentMimeType: "Dokumen Materi harus berformat PDF.",
      }));
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
      setSaveError("Materi yang diarsipkan hanya dapat dipulihkan sebelum diedit.");
      return;
    }

    const nextErrors = validateMateriBuilderState(builderState, subjects);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setSaveError("Lengkapi field yang ditandai sebelum menyimpan materi.");
      setHasUnsavedChanges(true);
      return;
    }

    setIsSaving(true);
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
        setErrors(mapActionErrors(result.fieldErrors, builderState.documentSource));
        setHasUnsavedChanges(true);
        setSaveError(result.message);
        return;
      }

      setSavedMateri(result.lesson);
      setErrors({});
      setHasUnsavedChanges(false);
      setSaveError(null);
      setLastSavedAt(result.message);
      if (!materiId && !initialMateri) {
        setPendingRouteReplacement(
          returnTo
            ? `${result.lesson.href}?${new URLSearchParams({ returnTo })}`
            : result.lesson.href,
        );
      }
      router.refresh();
    } catch (error) {
      setHasUnsavedChanges(true);
      setSaveError(error instanceof Error ? error.message : "Materi tidak dapat disimpan. Coba lagi.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmLifecycle() {
    if (!savedMateri || !lifecycleIntent || isSaving) return;
    if (hasUnsavedChanges) {
      setLifecycleError("Simpan perubahan materi terlebih dahulu sebelum mengubah status publikasi.");
      return;
    }
    setIsSaving(true);
    setLifecycleError(null);
    try {
      const result = lifecycleIntent === "publish"
        ? await publishMateriLessonAction(savedMateri.code)
        : lifecycleIntent === "unpublish"
          ? await unpublishMateriLessonAction(savedMateri.code)
          : lifecycleIntent === "archive"
            ? await archiveMateriLessonAction(savedMateri.code)
            : await returnMateriLessonToDraftAction(savedMateri.code);
      if (!result.ok) {
        setLifecycleError(result.message);
        return;
      }
      setSavedMateri(result.lesson);
      setLastSavedAt(result.message);
      setSaveError(null);
      setLifecycleError(null);
      setLifecycleIntent(null);
      router.refresh();
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Status publikasi tidak dapat diubah. Coba lagi.");
    } finally {
      setIsSaving(false);
    }
  }

  function openLifecycle(intent: LifecycleIntent) {
    setLifecycleError(null);
    if (hasUnsavedChanges) {
      setLifecycleError("Simpan perubahan materi terlebih dahulu sebelum mengubah status publikasi.");
      setLifecycleIntent(null);
      return;
    }
    setLifecycleIntent(intent);
  }

  const confirmation = lifecycleIntent ? lifecycleCopy(lifecycleIntent) : null;

  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={mode === "create" ? "Buat Materi" : "Edit Materi"}
      mainClassName="max-w-5xl gap-7"
      onNavigateAway={() => !hasUnsavedChanges}
      searchPlaceholder="Cari materi..."
      session={session}
      shouldGuardNavigation={hasUnsavedChanges}
    >
      <section className={isPreviewOpen ? "flex flex-wrap items-center justify-between gap-4" : "flex flex-wrap items-start justify-between gap-4"}>
        <div className="min-w-0">
          <Button
            nativeButton={false}
            render={<Link href={parentHref} />}
            size="icon-sm"
            aria-label="Kembali ke materi"
            title="Kembali ke materi"
            variant="ghost"
          >
            <ChevronLeft />
          </Button>
          {!isPreviewOpen ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">
                {mode === "create" ? "Buat Materi" : builderState.title || "Edit Materi"}
              </h1>
              <span className={cn("inline-flex items-center gap-2 text-sm font-medium", hasUnsavedChanges ? "text-secondary-600" : "text-primary-800")}>
                <span aria-hidden="true" className={cn("size-2 rounded-full", hasUnsavedChanges ? "bg-secondary-400" : "bg-primary-700")} />
                {hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}
              </span>
              <LifecycleLabel status={materiStatus} />
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm font-semibold text-secondary-500">Pratinjau materi</p>
              <h1 className="mt-1 text-2xl leading-tight font-semibold text-secondary-900 md:text-3xl">
                {builderState.title.trim() || "Materi tanpa judul"}
              </h1>
            </div>
          )}
        </div>
        {isPreviewOpen ? (
          <Button onClick={() => setIsPreviewOpen(false)} type="button" variant="brandOutline">
            Kembali ke editor
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button aria-label="Preview lesson" onClick={() => setIsPreviewOpen(true)} size="icon-sm" title="Preview" type="button" variant="brandOutline">
              <Eye />
            </Button>
            <Button disabled={isSaving || isArchived} onClick={saveLesson} type="button" variant="brand">
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
                      <DropdownMenuItem disabled={savedMateri.readiness !== "ready" || isSaving || hasUnsavedChanges} onClick={() => openLifecycle("publish")}>
                        <Upload />
                        Terbitkan
                      </DropdownMenuItem>
                    ) : null}
                    {materiStatus === "published" ? (
                      <DropdownMenuItem disabled={isSaving || hasUnsavedChanges} onClick={() => openLifecycle("unpublish")}>
                        Batalkan terbit
                      </DropdownMenuItem>
                    ) : null}
                    {materiStatus !== "archived" ? (
                      <DropdownMenuItem disabled={isSaving || hasUnsavedChanges} onClick={() => openLifecycle("archive")}>
                        <Archive />
                        Arsipkan
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled={isSaving} onClick={() => openLifecycle("returnToDraft")}>
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
        )}
      </section>

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
      {!isPreviewOpen && savedMateri && hasUnsavedChanges && !isArchived ? (
        <p className="text-sm font-medium text-secondary-600" role="status">
          Simpan perubahan materi terlebih dahulu sebelum mengubah status publikasi.
        </p>
      ) : null}

      {isPreviewOpen ? (
        <section aria-live="polite" className="max-w-3xl">
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
            subject={selectedSubject?.name ?? "Materi"}
            title={builderState.title}
            videoUrl={builderState.videoUrl}
          />
        </section>
      ) : (
        <form
          className="max-w-3xl"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void saveLesson();
          }}
        >
          <section className="space-y-5 border-b border-primary-100 pb-8">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900">Materi</h2>
              <p className="mt-1 text-sm leading-6 text-secondary-500">Pilih subject dan beri judul untuk bacaan ini.</p>
            </div>
            <Field className="max-w-xl">
              <FieldLabel htmlFor="materi-subject">Subject</FieldLabel>
              <div className="relative">
                <select
                  aria-describedby={errors.subjectSlug ? "materi-subject-error" : undefined}
                  aria-invalid={Boolean(errors.subjectSlug)}
                  className={`${fieldControlClassName} appearance-none pr-12`}
                  id="materi-subject"
                  disabled={isArchived}
                  onChange={(event) => updateField("subjectSlug", event.target.value)}
                  value={builderState.subjectSlug}
                >
                  {subjects.map((subject) => <option key={subject.slug} value={subject.slug}>{subject.code} · {subject.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
              </div>
              <FieldError error={errors.subjectSlug} id="materi-subject-error" />
            </Field>
            <Field className="max-w-xl">
              <FieldLabel htmlFor="materi-title">Judul materi</FieldLabel>
              <FieldInput
                aria-describedby={errors.title ? "materi-title-error" : undefined}
                aria-invalid={Boolean(errors.title)}
                disabled={isArchived}
                id="materi-title"
                onChange={(event) => updateField("title", event.target.value)}
                value={builderState.title}
              />
              <FieldError error={errors.title} id="materi-title-error" />
            </Field>
          </section>

          <section className="mt-8 space-y-5 border-b border-primary-100 pb-8">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900">Bacaan PDF</h2>
              <p className="mt-1 text-sm leading-6 text-secondary-500">Satu PDF wajib dipilih dari Media Kapten atau diberikan sebagai URL hosted.</p>
            </div>

            <div aria-label="Sumber PDF" className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {(["managed", "hosted"] as const).map((source) => {
                const isSelected = builderState.documentSource === source;
                return (
                  <button
                    aria-checked={isSelected}
                    className={cn(
                      "flex min-h-12 items-center justify-between rounded-xl border px-4 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35",
                      isSelected
                        ? "border-primary-500 bg-primary-50 text-primary-900"
                        : "border-primary-100 bg-white text-secondary-700 hover:border-primary-300 hover:bg-primary-50/40",
                    )}
                    key={source}
                    disabled={isArchived}
                    onClick={() => switchDocumentSource(source)}
                    role="radio"
                    type="button"
                  >
                    <span>{source === "managed" ? "Media Kapten" : "URL hosted"}</span>
                    <span aria-hidden="true" className={cn("size-2.5 rounded-full", isSelected ? "bg-primary-700" : "bg-secondary-200")} />
                  </button>
                );
              })}
            </div>

            {builderState.documentSource === "managed" ? (
              <div className="space-y-3 rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-primary-800 ring-1 ring-primary-100">
                      <FileText className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-secondary-900">{selectedDocumentName}</p>
                      <p className="mt-1 text-xs leading-5 text-secondary-500">
                        {builderState.documentAssetId ? "PDF managed dipilih dari Media Kapten." : "Belum ada PDF managed yang dipilih."}
                      </p>
                    </div>
                  </div>
                  <Button disabled={isArchived} onClick={() => setIsPickerOpen(true)} size="sm" type="button" variant="brandOutline">
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
                  onChange={(event) => {
                    setBuilderState((current) => ({
                      ...current,
                      documentMimeType: event.target.value === current.documentUrl ? current.documentMimeType : "",
                      documentName: event.target.value === current.documentUrl ? current.documentName : "",
                      documentUrl: event.target.value,
                    }));
                    markChanged({ ...errors, documentUrl: undefined });
                  }}
                  placeholder="https://contoh.com/materi.pdf"
                  type="url"
                  value={builderState.documentUrl}
                />
                <p className="text-xs leading-5 text-secondary-500">Gunakan URL HTTP(S) yang mengarah ke PDF. URL tanpa akhiran .pdf perlu metadata PDF dari sumbernya.</p>
                <FieldError error={errors.documentUrl || errors.documentMimeType} id="materi-document-url-error" />
              </Field>
            )}
          </section>

          <section className="mt-8 space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900">Video pendamping (opsional)</h2>
              <p className="mt-1 text-sm leading-6 text-secondary-500">Isi URL dan durasi bersama-sama, atau biarkan keduanya kosong untuk materi PDF saja.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_180px]">
              <Field>
                <FieldLabel htmlFor="materi-video-url">URL video</FieldLabel>
                <FieldInput
                  aria-describedby={errors.videoUrl ? "materi-video-url-error" : undefined}
                  aria-invalid={Boolean(errors.videoUrl)}
                  disabled={isArchived}
                  id="materi-video-url"
                  onChange={(event) => updateField("videoUrl", event.target.value)}
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
                  onChange={(event) => updateField("videoDuration", event.target.value)}
                  placeholder="08:30"
                  value={builderState.videoDuration}
                />
                <FieldError error={errors.videoDuration} id="materi-video-duration-error" />
              </Field>
            </div>
            {readiness === "incomplete" ? (
              <p className="text-sm font-medium text-secondary-600">Lengkapi subject, judul, dan PDF. Video pendamping hanya perlu diisi jika URL dan durasinya lengkap.</p>
            ) : (
              <p className="text-sm font-medium text-primary-800">Materi siap disimpan. PDF menjadi bacaan utama siswa.</p>
            )}
          </section>
        </form>
      )}

      <MediaPickerDialog
        allowedMimeTypes={["application/pdf"]}
        onOpenChange={setIsPickerOpen}
        onSelect={selectManagedDocument}
        open={isPickerOpen && !isArchived}
        selectedAssetId={builderState.documentAssetId || null}
        title="Pilih PDF Materi"
      />

      <Dialog onOpenChange={(open) => { if (!open && !isSaving) { setLifecycleError(null); setLifecycleIntent(null); } }} open={Boolean(lifecycleIntent)}>
        <DialogContent showCloseButton={!isSaving}>
          <DialogHeader>
            <DialogTitle>{confirmation?.title}</DialogTitle>
            <DialogDescription>{confirmation?.description}</DialogDescription>
          </DialogHeader>
          {lifecycleError ? <div aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{lifecycleError}</div> : null}
          <DialogFooter>
            <DialogClose disabled={isSaving} render={<Button type="button" variant="brandOutline" />}>Batal</DialogClose>
            <Button disabled={isSaving} onClick={confirmLifecycle} type="button" variant="brand">
              {isSaving ? <><LoaderCircle className="animate-spin" />Memproses...</> : confirmation?.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenMateriBuilderPageModule };

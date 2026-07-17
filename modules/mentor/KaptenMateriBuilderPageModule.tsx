"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronDown, Eye, Save, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel, fieldControlClassName } from "@/components/ui/field";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { getMateriWithStoredDrafts, saveMateriDraft } from "@/modules/mentor/materi-draft-storage";
import {
  getCanonicalMateriSection,
  getCanonicalMateriSections,
  getMateriReadiness,
  getMateriSubject,
  isValidHttpUrl,
  materiSubjects,
} from "@/modules/mentor/materi-model";
import { materi, type KaptenMateri } from "@/modules/mentor/mock-data";
import type { MateriBuilderState } from "@/modules/mentor/materi-builder-types";

type BuilderErrors = Partial<Record<keyof MateriBuilderState, string>>;

type CreateContext = {
  sectionId: string;
  subjectSlug: string;
};

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "materi-baru";
}

function getAppendOrder(subjectSlug: string, sectionId: string, currentId?: string) {
  if (!getCanonicalMateriSection(subjectSlug, sectionId)) {
    return "1";
  }

  const siblings = getMateriWithStoredDrafts(materi).filter(
    (lesson) =>
      lesson.id !== currentId
      && lesson.status !== "archived"
      && lesson.migrationState !== "needs-review"
      && lesson.subjectSlug === subjectSlug
      && lesson.sectionId === sectionId,
  );

  return String(siblings.length + 1);
}

function getInitialState(
  materiRecord?: KaptenMateri | null,
  createContext?: CreateContext,
): MateriBuilderState {
  if (materiRecord) {
    const hasCanonicalPlacement = materiRecord.migrationState !== "needs-review" && Boolean(
      getCanonicalMateriSection(materiRecord.subjectSlug, materiRecord.sectionId),
    );

    return {
      duration: materiRecord.duration,
      position: hasCanonicalPlacement ? String(materiRecord.position + 1) : "1",
      sectionId: hasCanonicalPlacement ? materiRecord.sectionId ?? "" : "",
      subjectSlug: getMateriSubject(materiRecord.subjectSlug)?.slug ?? materiSubjects[0]?.slug ?? "",
      title: materiRecord.title,
      videoUrl: materiRecord.videoUrl,
    };
  }

  const subjectSlug = createContext?.subjectSlug ?? materiSubjects[0]?.slug ?? "";
  const sectionId = createContext?.sectionId ?? "";

  return {
    duration: "",
    position: getAppendOrder(subjectSlug, sectionId),
    sectionId,
    subjectSlug,
    title: "",
    videoUrl: "",
  };
}

function getValidationErrors(state: MateriBuilderState): BuilderErrors {
  const errors: BuilderErrors = {};
  const subject = getMateriSubject(state.subjectSlug);
  const canonicalSection = getCanonicalMateriSection(state.subjectSlug, state.sectionId);

  if (!subject) {
    errors.subjectSlug = "Pilih subject Materi yang tersedia.";
  }
  if (!canonicalSection) {
    errors.sectionId = "Pilih section kanonis untuk menempatkan video ini.";
  }
  if (!state.title.trim()) {
    errors.title = "Judul lesson wajib diisi.";
  }
  if (!state.duration.trim()) {
    errors.duration = "Durasi video wajib diisi.";
  }
  if (!state.videoUrl.trim()) {
    errors.videoUrl = "URL video wajib diisi.";
  } else {
    try {
      const url = new URL(state.videoUrl.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.videoUrl = "Gunakan URL video HTTP atau HTTPS yang valid.";
      }
    } catch {
      errors.videoUrl = "Gunakan URL video HTTP atau HTTPS yang valid.";
    }
  }

  const parsedPosition = Number(state.position);
  if (!Number.isInteger(parsedPosition) || parsedPosition < 1) {
    errors.position = "Urutan lesson harus berupa angka minimal 1.";
  }

  return errors;
}

function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? <p className="text-sm leading-5 text-red-700" id={id}>{error}</p> : null;
}

function LifecycleLabel({ status }: { status: KaptenMateri["status"] }) {
  const labels = {
    archived: "Diarsipkan",
    draft: "Draf",
    published: "Diterbitkan",
    scheduled: "Terjadwal",
  } as const;

  return <span className="rounded-full border border-primary-100 bg-white px-3 py-1.5 text-sm font-semibold text-secondary-700">{labels[status]}</span>;
}

function KaptenMateriBuilderPageModule({
  createContext,
  initialMateri = null,
  initialPreview = false,
  materiId,
  mode,
  returnTo,
  session,
}: {
  createContext?: CreateContext;
  initialMateri?: KaptenMateri | null;
  initialPreview?: boolean;
  materiId?: string;
  mode: "create" | "edit";
  returnTo?: string;
  session: SessionContext;
}) {
  const router = useRouter();
  const [builderState, setBuilderState] = useState(() => getInitialState(initialMateri, createContext));
  const [savedMateri, setSavedMateri] = useState<KaptenMateri | null>(initialMateri);
  const [errors, setErrors] = useState<BuilderErrors>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(initialPreview);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<string | null>(null);

  const canonicalSections = useMemo(
    () => getCanonicalMateriSections(builderState.subjectSlug),
    [builderState.subjectSlug],
  );
  const selectedSubject = getMateriSubject(builderState.subjectSlug);
  const selectedSection = getCanonicalMateriSection(builderState.subjectSlug, builderState.sectionId);
  const materiStatus = savedMateri?.status ?? "draft";
  const saveLabel = materiStatus === "draft" ? "Simpan draf" : "Simpan perubahan";
  const readiness = getMateriReadiness({
    duration: builderState.duration,
    sectionId: builderState.sectionId || null,
    subjectSlug: builderState.subjectSlug,
    title: builderState.title,
    videoUrl: builderState.videoUrl,
  });

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!pendingRouteReplacement || hasUnsavedChanges) {
      return;
    }

    const frame = window.requestAnimationFrame(() => router.replace(pendingRouteReplacement));
    return () => window.cancelAnimationFrame(frame);
  }, [hasUnsavedChanges, pendingRouteReplacement, router]);

  function markChanged(nextState: MateriBuilderState) {
    setBuilderState(nextState);
    setHasUnsavedChanges(true);
    setLastSavedAt(null);
    setSaveError(null);
    setErrors((current) => {
      const nextErrors = { ...current };
      for (const field of Object.keys(nextState) as Array<keyof MateriBuilderState>) {
        delete nextErrors[field];
      }
      return nextErrors;
    });
  }

  function updateField(field: keyof MateriBuilderState, value: string) {
    markChanged({ ...builderState, [field]: value });
  }

  function updateSubject(subjectSlug: string) {
    markChanged({
      ...builderState,
      position: "1",
      sectionId: "",
      subjectSlug,
    });
  }

  function updateSection(sectionId: string) {
    markChanged({
      ...builderState,
      position: getAppendOrder(builderState.subjectSlug, sectionId, savedMateri?.id),
      sectionId,
    });
  }

  function saveLesson() {
    const nextErrors = getValidationErrors(builderState);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSaveError("Lengkapi field yang ditandai sebelum menyimpan lesson.");
      setHasUnsavedChanges(true);
      return;
    }

    const subject = getMateriSubject(builderState.subjectSlug);
    const section = getCanonicalMateriSection(builderState.subjectSlug, builderState.sectionId);
    if (!subject || !section) {
      return;
    }

    const currentMateri = savedMateri;
    const id = currentMateri?.id ?? `draft-${slugify(builderState.title)}-${Date.now()}`;
    const title = builderState.title.trim();
    const duration = builderState.duration.trim();
    const videoUrl = builderState.videoUrl.trim();
    const requestedPosition = Number(builderState.position);
    const nextReadiness = getMateriReadiness({
      duration,
      sectionId: section.sectionId,
      subjectSlug: subject.slug,
      title,
      videoUrl,
    });
    const materiDraft: KaptenMateri = {
      description: currentMateri?.description ?? `${subject.name} · ${section.title}`,
      duration,
      href: `/mentor/materi/${id}`,
      id,
      migrationState: currentMateri?.migrationState === "needs-review" ? "canonical" : currentMateri?.migrationState,
      position: Math.max(0, requestedPosition - 1),
      primaryMetric: `${duration} · ${nextReadiness === "ready" ? "Siap" : "Belum siap"}`,
      progress: nextReadiness === "ready" ? 100 : 0,
      readiness: nextReadiness,
      resourceCount: currentMateri?.resourceCount ?? 1,
      resourceType: "materi",
      sections: currentMateri?.sections ?? [section.title],
      sectionId: section.sectionId,
      sectionTitle: section.title,
      scheduledFor: currentMateri?.scheduledFor,
      status: currentMateri?.status ?? "draft",
      subjectCode: subject.code,
      subjectName: subject.name,
      subjectSlug: subject.slug,
      title,
      updatedAt: "Diedit baru saja",
      videoUrl,
    };

    try {
      const savedDraft = saveMateriDraft({ materi: materiDraft, sections: [] }, { requestedPosition });
      const saved = savedDraft.materi;
      setSavedMateri(saved);
      setBuilderState((current) => ({ ...current, position: String(saved.position + 1) }));
      setErrors({});
      setHasUnsavedChanges(false);
      setSaveError(null);
      setLastSavedAt(materiStatus === "draft" ? "Draf tersimpan." : "Perubahan tersimpan.");

      if (!materiId && !initialMateri) {
        setPendingRouteReplacement(
          returnTo
            ? `${saved.href}?${new URLSearchParams({ returnTo }).toString()}`
            : saved.href,
        );
      }
    } catch (error) {
      setHasUnsavedChanges(true);
      setSaveError(error instanceof Error ? error.message : "Lesson tidak dapat disimpan. Coba lagi.");
    }
  }

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
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Button render={<Link href={returnTo ?? "/mentor/materi"} />} size="sm" variant="ghost">
            <ArrowLeft />
            Materi
          </Button>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">
              {mode === "create" ? "Buat Materi" : builderState.title || "Edit Materi"}
            </h1>
            <span className={cn("inline-flex items-center gap-2 text-sm font-medium", hasUnsavedChanges ? "text-[#856300]" : "text-primary-800")}>
              <span aria-hidden="true" className={cn("size-2 rounded-full", hasUnsavedChanges ? "bg-[#d29b18]" : "bg-primary-700")} />
              {hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}
            </span>
            <LifecycleLabel status={materiStatus} />
          </div>
          <p className="mt-2 text-sm text-secondary-500">
            Status lifecycle hanya sebagai konteks dan tidak berubah saat lesson disimpan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setIsPreviewOpen((current) => !current)} type="button" variant="brandOutline">
            <Eye />
            Preview
          </Button>
          <Button onClick={saveLesson} type="button" variant="brand">
            <Save />
            {saveLabel}
          </Button>
        </div>
      </section>

      {lastSavedAt ? (
        <p className="flex items-center gap-2 text-sm font-medium text-primary-800" role="status">
          <CheckCircle2 className="size-4" />
          {lastSavedAt}
        </p>
      ) : null}
      {saveError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">
          {saveError}
        </div>
      ) : null}

      {isPreviewOpen ? (
        <section aria-live="polite" className="border-y border-primary-100 py-7 md:py-9">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-primary-800">Preview lesson siswa</p>
              <p className="mt-2 text-sm text-secondary-500">
                {selectedSubject?.code ?? "Subject"} · Unit {(Number(builderState.position) || 1)}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-secondary-900 md:text-3xl">
                {builderState.title.trim() || "Judul lesson belum diisi"}
              </h2>
            </div>
            <Button onClick={() => setIsPreviewOpen(false)} type="button" variant="brandOutline">
              Kembali mengedit
            </Button>
          </div>

          <div className="mt-7 max-w-3xl">
            <p className="text-sm font-semibold text-secondary-700">{selectedSection?.title ?? "Section belum dipilih"}</p>
            <div className="mt-3 aspect-video overflow-hidden rounded-3xl bg-secondary-900 p-6 text-white sm:p-8">
              <Video className="size-7 text-primary-100" />
              <p className="mt-8 text-xs font-semibold tracking-[0.12em] text-primary-100 uppercase">Video pembelajaran</p>
              <p className="mt-2 text-lg font-semibold">{builderState.duration.trim() || "Durasi belum diisi"}</p>
              {isValidHttpUrl(builderState.videoUrl) ? (
                <a className="mt-5 inline-flex text-sm font-semibold text-primary-100 underline underline-offset-4" href={builderState.videoUrl} rel="noreferrer" target="_blank">
                  Buka video
                </a>
              ) : (
                <p className="mt-5 text-sm text-white/65">Video belum ditautkan.</p>
              )}
            </div>
          </div>
          <p className="mt-5 text-sm text-secondary-500">Preview ini hanya simulasi Kapten dan tidak membaca atau mengubah progres siswa.</p>
        </section>
      ) : (
        <form className="max-w-3xl" onSubmit={(event) => { event.preventDefault(); saveLesson(); }} noValidate>
          <section className="space-y-5 border-b border-primary-100 pb-8">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900">Penempatan</h2>
              <p className="mt-1 text-sm leading-6 text-secondary-500">Tentukan subject, section kanonis, dan urutan yang akan dilihat siswa.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="materi-subject">Subject</FieldLabel>
                <div className="relative">
                  <select aria-describedby={errors.subjectSlug ? "materi-subject-error" : undefined} aria-invalid={Boolean(errors.subjectSlug)} className={`${fieldControlClassName} appearance-none pr-12`} id="materi-subject" onChange={(event) => updateSubject(event.target.value)} value={builderState.subjectSlug}>
                    {materiSubjects.map((subject) => <option key={subject.slug} value={subject.slug}>{subject.code} · {subject.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
                </div>
                <FieldError error={errors.subjectSlug} id="materi-subject-error" />
              </Field>
              <Field>
                <FieldLabel htmlFor="materi-section">Section</FieldLabel>
                <div className="relative">
                  <select aria-describedby={errors.sectionId ? "materi-section-error" : undefined} aria-invalid={Boolean(errors.sectionId)} className={`${fieldControlClassName} appearance-none pr-12`} id="materi-section" onChange={(event) => updateSection(event.target.value)} value={builderState.sectionId}>
                    <option value="">Pilih section kanonis</option>
                    {canonicalSections.map((section) => <option key={section.sectionId} value={section.sectionId}>{section.title}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
                </div>
                <FieldError error={errors.sectionId} id="materi-section-error" />
              </Field>
              <Field className="md:max-w-xs">
                <FieldLabel htmlFor="materi-position">Urutan lesson</FieldLabel>
                <FieldInput aria-describedby={errors.position ? "materi-position-error" : undefined} aria-invalid={Boolean(errors.position)} id="materi-position" min="1" onChange={(event) => updateField("position", event.target.value)} type="number" value={builderState.position} />
                <p className="text-sm leading-5 text-secondary-500">Gunakan urutan 1 untuk posisi paling awal.</p>
                <FieldError error={errors.position} id="materi-position-error" />
              </Field>
            </div>
          </section>

          <section className="mt-8 space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900">Konten video</h2>
              <p className="mt-1 text-sm leading-6 text-secondary-500">Satu Materi merepresentasikan satu video lesson.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_180px]">
              <Field>
                <FieldLabel htmlFor="materi-title">Judul lesson</FieldLabel>
                <FieldInput aria-describedby={errors.title ? "materi-title-error" : undefined} aria-invalid={Boolean(errors.title)} id="materi-title" onChange={(event) => updateField("title", event.target.value)} value={builderState.title} />
                <FieldError error={errors.title} id="materi-title-error" />
              </Field>
              <Field>
                <FieldLabel htmlFor="materi-duration">Durasi</FieldLabel>
                <FieldInput aria-describedby={errors.duration ? "materi-duration-error" : undefined} aria-invalid={Boolean(errors.duration)} id="materi-duration" onChange={(event) => updateField("duration", event.target.value)} placeholder="Contoh: 08:30" value={builderState.duration} />
                <FieldError error={errors.duration} id="materi-duration-error" />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="materi-video-url">URL video</FieldLabel>
                <FieldInput aria-describedby={errors.videoUrl ? "materi-video-url-error" : undefined} aria-invalid={Boolean(errors.videoUrl)} id="materi-video-url" onChange={(event) => updateField("videoUrl", event.target.value)} placeholder="https://youtube.com/..." type="url" value={builderState.videoUrl} />
                <FieldError error={errors.videoUrl} id="materi-video-url-error" />
              </Field>
            </div>
            <p className={cn("text-sm font-medium", readiness === "ready" ? "text-primary-800" : "text-[#856300]")}>{readiness === "ready" ? "Lesson siap ditampilkan dalam katalog Kapten." : "Lesson belum siap sampai penempatan, judul, durasi, dan URL video lengkap."}</p>
          </section>
        </form>
      )}
    </MentorWorkspaceShell>
  );
}

export { KaptenMateriBuilderPageModule };

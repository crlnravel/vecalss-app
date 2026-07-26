"use client";

import Link from "next/link";
import { Archive, CheckCircle2, ChevronDown, ChevronLeft, Ellipsis, Eye, LoaderCircle, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel, fieldControlClassName } from "@/components/ui/field";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { archiveMateriLessonAction, publishMateriLessonAction, returnMateriLessonToDraftAction, saveMateriLessonAction, unpublishMateriLessonAction } from "@/modules/mentor/materi-actions";
import type { KaptenMateriSubjectView, KaptenMateriView } from "@/modules/mentor/materi-view-model";
import { MateriLessonPresentation } from "@/modules/courses/MateriLessonPresentation";

type MateriBuilderState = {
  duration: string;
  subjectSlug: string;
  title: string;
  videoUrl: string;
};

type BuilderErrors = Partial<Record<keyof MateriBuilderState, string>>;
type LifecycleIntent = "archive" | "publish" | "unpublish" | "returnToDraft";

function getSubject(subjects: KaptenMateriSubjectView[], slug: string) {
  return subjects.find((subject) => subject.slug === slug);
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getInitialState(initialMateri: KaptenMateriView | null | undefined, initialSubjectSlug: string | undefined, subjects: KaptenMateriSubjectView[]): MateriBuilderState {
  return initialMateri
    ? { duration: initialMateri.duration, subjectSlug: initialMateri.subjectSlug, title: initialMateri.title, videoUrl: initialMateri.videoUrl }
    : { duration: "", subjectSlug: initialSubjectSlug ?? subjects[0]?.slug ?? "", title: "", videoUrl: "" };
}

function validate(state: MateriBuilderState, subjects: KaptenMateriSubjectView[]): BuilderErrors {
  const errors: BuilderErrors = {};
  if (!getSubject(subjects, state.subjectSlug)) errors.subjectSlug = "Pilih subject Materi yang tersedia.";
  if (!state.title.trim()) errors.title = "Judul lesson wajib diisi.";
  if (!state.duration.trim()) errors.duration = "Durasi video wajib diisi.";
  if (!state.videoUrl.trim()) errors.videoUrl = "URL video wajib diisi.";
  else if (!isValidHttpUrl(state.videoUrl)) errors.videoUrl = "Gunakan URL video HTTP atau HTTPS yang valid.";
  return errors;
}

function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? <p className="text-sm leading-5 text-red-700" id={id}>{error}</p> : null;
}

function LifecycleLabel({ status }: { status: KaptenMateriView["status"] }) {
  const labels = { archived: "Diarsipkan", draft: "Draf", published: "Diterbitkan", scheduled: "Terjadwal" } as const;
  return <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-900">{labels[status]}</span>;
}

function lifecycleCopy(intent: LifecycleIntent) {
  if (intent === "publish") return { confirm: "Terbitkan", description: "Lesson akan tersedia untuk siswa.", title: "Terbitkan lesson?" };
  if (intent === "unpublish") return { confirm: "Batalkan terbit", description: "Lesson akan kembali menjadi draf dan tidak lagi terlihat oleh siswa.", title: "Batalkan penerbitan?" };
  if (intent === "archive") return { confirm: "Arsipkan", description: "Lesson tidak lagi tersedia untuk siswa sampai dipulihkan.", title: "Arsipkan lesson?" };
  return { confirm: "Kembalikan ke draf", description: "Lesson akan kembali menjadi draf.", title: "Kembalikan lesson ke draf?" };
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
  const [builderState, setBuilderState] = useState(() => getInitialState(initialMateri, initialSubjectSlug, subjects));
  const [savedMateri, setSavedMateri] = useState<KaptenMateriView | null>(initialMateri);
  const [errors, setErrors] = useState<BuilderErrors>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(initialPreview);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lifecycleIntent, setLifecycleIntent] = useState<LifecycleIntent | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const selectedSubject = getSubject(subjects, builderState.subjectSlug);
  const parentHref = returnTo ?? (initialMateri ? `/mentor/materi/subject/${initialMateri.subjectSlug}` : "/mentor/materi");
  const materiStatus = savedMateri?.status ?? "draft";
  const saveLabel = materiStatus === "draft" ? "Simpan draf" : "Simpan perubahan";
  const readiness = builderState.title.trim() && builderState.duration.trim() && selectedSubject && isValidHttpUrl(builderState.videoUrl) ? "ready" : "incomplete";

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

  function updateField(field: keyof MateriBuilderState, value: string) {
    setBuilderState((current) => ({ ...current, [field]: value }));
    setHasUnsavedChanges(true);
    setLastSavedAt(null);
    setSaveError(null);
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function saveLesson() {
    const nextErrors = validate(builderState, subjects);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setSaveError("Lengkapi field yang ditandai sebelum menyimpan lesson.");
      setHasUnsavedChanges(true);
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveMateriLessonAction({ code: savedMateri?.code, duration: builderState.duration, subjectSlug: builderState.subjectSlug, title: builderState.title, videoUrl: builderState.videoUrl });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setHasUnsavedChanges(true);
        setSaveError(result.message);
        return;
      }
      setSavedMateri(result.lesson);
      setErrors({});
      setHasUnsavedChanges(false);
      setSaveError(null);
      setLastSavedAt(result.message);
      if (!materiId && !initialMateri) setPendingRouteReplacement(returnTo ? `${result.lesson.href}?${new URLSearchParams({ returnTo })}` : result.lesson.href);
      router.refresh();
    } catch (error) {
      setHasUnsavedChanges(true);
      setSaveError(error instanceof Error ? error.message : "Lesson tidak dapat disimpan. Coba lagi.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmLifecycle() {
    if (!savedMateri || !lifecycleIntent || isSaving) return;
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
    setLifecycleIntent(intent);
  }

  const confirmation = lifecycleIntent ? lifecycleCopy(lifecycleIntent) : null;
  return <MentorWorkspaceShell activeLabel="Materi" breadcrumbLabel={mode === "create" ? "Buat Materi" : "Edit Materi"} mainClassName="max-w-5xl gap-7" onNavigateAway={() => !hasUnsavedChanges} searchPlaceholder="Cari materi..." session={session} shouldGuardNavigation={hasUnsavedChanges}>
    <section className={isPreviewOpen ? "" : "flex flex-wrap items-start justify-between gap-4"}>
      <div className="min-w-0">
        <Button render={<Link href={parentHref} />} size="icon-sm" aria-label="Kembali ke materi" title="Kembali ke materi" variant="ghost"><ChevronLeft /></Button>
        {!isPreviewOpen ? <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2"><h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">{mode === "create" ? "Buat Materi" : builderState.title || "Edit Materi"}</h1><span className={cn("inline-flex items-center gap-2 text-sm font-medium", hasUnsavedChanges ? "text-secondary-600" : "text-primary-800")}><span aria-hidden="true" className={cn("size-2 rounded-full", hasUnsavedChanges ? "bg-secondary-400" : "bg-primary-700")} />{hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}</span><LifecycleLabel status={materiStatus} /></div> : null}
      </div>
      {!isPreviewOpen ? <div className="flex flex-wrap items-center gap-2"><Button aria-label="Preview lesson" onClick={() => setIsPreviewOpen(true)} size="icon-sm" title="Preview" type="button" variant="brandOutline"><Eye /></Button><Button disabled={isSaving || materiStatus === "archived"} onClick={saveLesson} type="button" variant="brand"><Save />{isSaving ? "Menyimpan..." : saveLabel}</Button>{savedMateri ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label="Aksi lesson" size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuGroup>{materiStatus === "draft" ? <DropdownMenuItem disabled={savedMateri.readiness !== "ready" || isSaving} onClick={() => openLifecycle("publish")}><Upload />Terbitkan</DropdownMenuItem> : null}{materiStatus === "published" ? <DropdownMenuItem disabled={isSaving} onClick={() => openLifecycle("unpublish")}>Batalkan terbit</DropdownMenuItem> : null}{materiStatus !== "archived" ? <DropdownMenuItem disabled={isSaving} onClick={() => openLifecycle("archive")}><Archive />Arsipkan</DropdownMenuItem> : <DropdownMenuItem disabled={isSaving} onClick={() => openLifecycle("returnToDraft")}>Pulihkan</DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem disabled variant="destructive"><Trash2 />Hapus</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu> : null}</div> : null}
    </section>
    {!isPreviewOpen && lastSavedAt ? <p className="flex items-center gap-2 text-sm font-medium text-primary-800" role="status"><CheckCircle2 className="size-4" />{lastSavedAt}</p> : null}{!isPreviewOpen && saveError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{saveError}</div> : null}
    {isPreviewOpen ? <section aria-live="polite" className="max-w-3xl"><MateriLessonPresentation duration={builderState.duration.trim() || undefined} showDuration showSectionLabel={false} subject={selectedSubject?.name ?? "Materi"} title={builderState.title} videoUrl={builderState.videoUrl} /></section> : <form className="max-w-3xl" noValidate onSubmit={(event) => { event.preventDefault(); saveLesson(); }}><section className="space-y-5 border-b border-primary-100 pb-8"><div><h2 className="text-xl font-semibold text-secondary-900">Materi</h2><p className="mt-1 text-sm leading-6 text-secondary-500">Pilih subject untuk lesson ini.</p></div><Field className="max-w-xl"><FieldLabel htmlFor="materi-subject">Subject</FieldLabel><div className="relative"><select aria-describedby={errors.subjectSlug ? "materi-subject-error" : undefined} aria-invalid={Boolean(errors.subjectSlug)} className={`${fieldControlClassName} appearance-none pr-12`} id="materi-subject" onChange={(event) => updateField("subjectSlug", event.target.value)} value={builderState.subjectSlug}>{subjects.map((subject) => <option key={subject.slug} value={subject.slug}>{subject.code} · {subject.name}</option>)}</select><ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" /></div><FieldError error={errors.subjectSlug} id="materi-subject-error" /></Field></section><section className="mt-8 space-y-5"><div><h2 className="text-xl font-semibold text-secondary-900">Konten video</h2></div><div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_180px]"><Field><FieldLabel htmlFor="materi-title">Judul lesson</FieldLabel><FieldInput aria-describedby={errors.title ? "materi-title-error" : undefined} aria-invalid={Boolean(errors.title)} id="materi-title" onChange={(event) => updateField("title", event.target.value)} value={builderState.title} /><FieldError error={errors.title} id="materi-title-error" /></Field><Field><FieldLabel htmlFor="materi-duration">Durasi</FieldLabel><FieldInput aria-describedby={errors.duration ? "materi-duration-error" : undefined} aria-invalid={Boolean(errors.duration)} id="materi-duration" onChange={(event) => updateField("duration", event.target.value)} placeholder="Contoh: 08:30" value={builderState.duration} /><FieldError error={errors.duration} id="materi-duration-error" /></Field><Field className="md:col-span-2"><FieldLabel htmlFor="materi-video-url">URL video</FieldLabel><FieldInput aria-describedby={errors.videoUrl ? "materi-video-url-error" : undefined} aria-invalid={Boolean(errors.videoUrl)} id="materi-video-url" onChange={(event) => updateField("videoUrl", event.target.value)} placeholder="https://youtube.com/..." type="url" value={builderState.videoUrl} /><FieldError error={errors.videoUrl} id="materi-video-url-error" /></Field></div>{readiness === "incomplete" ? <p className="text-sm font-medium text-secondary-600">Lengkapi subject, judul, durasi, dan URL video.</p> : null}</section></form>}
    <Dialog onOpenChange={(open) => { if (!open && !isSaving) { setLifecycleError(null); setLifecycleIntent(null); } }} open={Boolean(lifecycleIntent)}><DialogContent showCloseButton={!isSaving}><DialogHeader><DialogTitle>{confirmation?.title}</DialogTitle><DialogDescription>{confirmation?.description}</DialogDescription></DialogHeader>{lifecycleError ? <div aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{lifecycleError}</div> : null}<DialogFooter><DialogClose disabled={isSaving} render={<Button type="button" variant="brandOutline" />}>Batal</DialogClose><Button disabled={isSaving} onClick={confirmLifecycle} type="button" variant="brand">{isSaving ? <><LoaderCircle className="animate-spin" />Memproses...</> : confirmation?.confirm}</Button></DialogFooter></DialogContent></Dialog>
  </MentorWorkspaceShell>;
}

export { KaptenMateriBuilderPageModule };

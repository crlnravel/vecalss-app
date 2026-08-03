"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ChevronLeft, Ellipsis, Eye, FilePenLine, FileText, ListChecks, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  CatalogueFilter,
  CatalogueSearchInput,
  PageIntro,
  PaginationControls,
  StatusPill,
} from "@/modules/mentor/components/kapten-ui";
import { getSubjectCategory } from "@/modules/mentor/subject-category";
import {
  bulkPublishMateriLessonsAction,
  bulkUnpublishMateriLessonsAction,
  archiveMateriLessonAction,
  returnMateriLessonToDraftAction,
} from "@/modules/mentor/materi-actions";
import type {
  KaptenMateriSubjectView,
  KaptenMateriView,
} from "@/modules/mentor/materi-view-model";

function buildCreateHref(subjectSlug?: string) {
  return subjectSlug
    ? `/mentor/materi/create?${new URLSearchParams({ subject: subjectSlug })}`
    : "/mentor/materi/create";
}

function buildEditorHref(
  lesson: KaptenMateriView,
  returnTo: string,
  preview = false,
) {
  const query = new URLSearchParams({ returnTo });
  if (preview) query.set("preview", "1");
  return `/mentor/materi/${lesson.code}?${query.toString()}`;
}

function ReadinessWarning({
  readiness,
}: {
  readiness: KaptenMateriView["readiness"];
}) {
  return readiness === "incomplete" ? (
    <span className="text-sm font-semibold text-secondary-600">PDF belum siap</span>
  ) : null;
}

function SubjectCard({ subject }: { subject: KaptenMateriSubjectView }) {
  const subjectCategory = getSubjectCategory(subject.code);

  return (
    <Link
      className="group flex min-h-32 flex-col rounded-3xl border border-primary-200 bg-white p-5 shadow-sm transition-[transform,border-color,background-color,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:border-primary-500 hover:bg-primary-50/40 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.42)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35"
      href={`/mentor/materi/subject/${subject.slug}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex rounded-xl bg-primary-100 px-3 py-1.5 text-sm font-bold text-primary-900">
          {subjectCategory}
        </span>
        <FileText className="size-5 text-primary-800" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-secondary-900">
        {subject.name}
      </h2>
    </Link>
  );
}

function KaptenMateriPageModule({
  session,
  subjects,
}: {
  catalogue: KaptenMateriView[];
  session: SessionContext;
  subjects: KaptenMateriSubjectView[];
}) {
  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel="Materi"
      searchPlaceholder="Cari materi..."
      session={session}
    >
      <PageIntro description="Susun bacaan PDF untuk siswa, lalu tambahkan video pendamping bila diperlukan." title="Materi" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.map((subject) => (
          <SubjectCard key={subject.slug} subject={subject} />
        ))}
      </div>
    </MentorWorkspaceShell>
  );
}

function MateriLessonRow({
  lesson,
  onAction,
  onSelectedChange,
  returnTo,
  selectionMode,
  selected,
}: {
  lesson: KaptenMateriView;
  onAction: (action: "archive" | "delete" | "publish" | "restore" | "unpublish") => void;
  onSelectedChange: (checked: boolean) => void;
  returnTo: string;
  selectionMode: boolean;
  selected: boolean;
}) {
  return (
    <article className={`grid gap-4 rounded-3xl border border-primary-100 bg-white p-4 shadow-sm transition-[transform,border-color,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] focus-within:border-primary-200 focus-within:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] ${selectionMode ? "sm:grid-cols-[auto_minmax(0,1fr)_auto]" : "sm:grid-cols-[minmax(0,1fr)_auto]"} sm:items-center`}>
      {selectionMode ? <Checkbox
        aria-label={`Pilih ${lesson.title}`}
        checked={selected}
        onCheckedChange={(checked) => onSelectedChange(checked === true)}
      /> : null}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-secondary-900">
            {lesson.title}
          </h2>
          <StatusPill status={lesson.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-500">
          <span>{lesson.primaryMetric}</span>
          <ReadinessWarning readiness={lesson.readiness} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button render={<Link href={buildEditorHref(lesson, returnTo, true)} />} aria-label="Preview lesson" size="icon-sm" title="Preview" variant="brandOutline"><Eye /></Button>
        <Button
          aria-label="Edit materi"
          render={<Link href={buildEditorHref(lesson, returnTo)} />}
          size="icon-sm"
          title="Edit materi"
          variant="brand"
        >
          <Pencil />
        </Button>
        <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${lesson.title}`} size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuGroup>{lesson.status === "draft" ? <DropdownMenuItem disabled={lesson.readiness !== "ready"} onClick={() => onAction("publish")}><Upload />Terbitkan</DropdownMenuItem> : null}{lesson.status === "published" ? <DropdownMenuItem onClick={() => onAction("unpublish")}><FilePenLine />Batalkan terbit</DropdownMenuItem> : null}{lesson.status !== "archived" ? <DropdownMenuItem onClick={() => onAction("archive")}><Archive />Arsipkan</DropdownMenuItem> : <DropdownMenuItem onClick={() => onAction("restore")}>Pulihkan</DropdownMenuItem>}<DropdownMenuItem disabled variant="destructive"><Trash2 />Hapus</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      </div>
    </article>
  );
}

function KaptenMateriSubjectPageModule({
  catalogue,
  session,
  subject,
}: {
  catalogue: KaptenMateriView[];
  session: SessionContext;
  subject: KaptenMateriSubjectView;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [lessons, setLessons] = useState(() =>
    catalogue
      .filter((lesson) => lesson.subjectSlug === subject.slug)
      .sort((a, b) => a.position - b.position || a.code.localeCompare(b.code)),
  );
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkIntent, setBulkIntent] = useState<"publish" | "unpublish" | null>(
    null,
  );
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [isBulkPending, setIsBulkPending] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [readinessFilter, setReadinessFilter] = useState("");
  const [videoFilter, setVideoFilter] = useState("");
  const returnTo = `/mentor/materi/subject/${subject.slug}`;

  function filterVisibleLessons(value: string) {
    const normalizedValue = value.trim().toLocaleLowerCase();
    return lessons.filter(
      (lesson) =>
        (!normalizedValue ||
          [
            lesson.title,
            lesson.primaryMetric,
            lesson.documentName,
            lesson.hasOptionalVideo ? "video opsional" : "tanpa video",
            lesson.status,
            lesson.readiness === "incomplete" ? "belum siap" : "",
          ].some((candidate) =>
            candidate.toLocaleLowerCase().includes(normalizedValue),
        )) &&
        (!statusFilter || lesson.status === statusFilter) &&
        (!readinessFilter || lesson.readiness === readinessFilter) &&
        (!videoFilter || (videoFilter === "with-video" ? lesson.hasOptionalVideo : !lesson.hasOptionalVideo)),
    );
  }

  const visibleLessons = filterVisibleLessons(query);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleLessons.length / pageSize));
  const pagedLessons = visibleLessons.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const selectedLessons = lessons.filter((lesson) =>
    selectedCodes.has(lesson.code),
  );
  const publishEligible =
    selectedLessons.length > 0 &&
    selectedLessons.every(
      (lesson) => lesson.status === "draft" && lesson.readiness === "ready",
    );
  const unpublishEligible =
    selectedLessons.length > 0 &&
    selectedLessons.every((lesson) => lesson.status === "published");
  const eligibilityReason =
    selectedLessons.length > 0 && !publishEligible && !unpublishEligible
      ? "Pilih hanya lesson draf dengan PDF siap atau lesson yang sudah diterbitkan."
      : null;
  const selectAllVisible =
    visibleLessons.length > 0 &&
    visibleLessons.every((lesson) => selectedCodes.has(lesson.code));
  const confirmation =
    bulkIntent === "publish"
      ? {
          confirm: "Terbitkan semua",
          description: `${selectedLessons.length} lesson akan tersedia untuk siswa.`,
          title: "Terbitkan lesson terpilih?",
        }
      : {
          confirm: "Batalkan terbit",
          description: `${selectedLessons.length} lesson tidak lagi tersedia untuk siswa dan kembali menjadi draf.`,
          title: "Batalkan penerbitan lesson?",
        };

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
    setSelectedCodes(new Set());
  }

  function toggleSelected(code: string, checked: boolean) {
    setBulkNotice(null);
    setSelectedCodes((current) => {
      const next = new Set(current);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setBulkNotice(null);
    setSelectedCodes((current) => {
      const next = new Set(current);
      for (const lesson of visibleLessons) {
        if (checked) next.add(lesson.code);
        else next.delete(lesson.code);
      }
      return next;
    });
  }

  async function confirmBulkLifecycle() {
    if (!bulkIntent || isBulkPending || selectedLessons.length === 0) return;
    setIsBulkPending(true);
    setBulkError(null);
    const codes = selectedLessons.map((lesson) => lesson.code);
    try {
      const result =
        bulkIntent === "publish"
          ? await bulkPublishMateriLessonsAction(subject.slug, codes)
          : await bulkUnpublishMateriLessonsAction(subject.slug, codes);
      if (!result.ok) {
        setBulkError(result.message);
        return;
      }
      const affected = new Set(result.affectedCodes);
      setLessons((current) =>
        current.map((lesson) =>
          affected.has(lesson.code)
            ? {
                ...lesson,
                lifecycleStatus: result.status,
                status: result.status,
              }
            : lesson,
        ),
      );
      setSelectedCodes(new Set());
      setSelectionMode(false);
      setBulkNotice(result.message);
      setBulkIntent(null);
      router.refresh();
    } catch (error) {
      setBulkError(
        error instanceof Error
          ? error.message
          : "Status lesson tidak dapat diubah saat ini. Coba lagi.",
      );
    } finally {
      setIsBulkPending(false);
    }
  }

  async function applyLessonAction(lesson: KaptenMateriView, action: "archive" | "delete" | "publish" | "restore" | "unpublish") {
    if (isBulkPending) return;
    if (action === "delete") return;
    setIsBulkPending(true); setBulkError(null);
    try {
      if (action === "publish" || action === "unpublish") {
        const result = action === "publish" ? await bulkPublishMateriLessonsAction(subject.slug, [lesson.code]) : await bulkUnpublishMateriLessonsAction(subject.slug, [lesson.code]);
        if (!result.ok) { setBulkError(result.message); return; }
        setLessons((current) => current.map((item) => item.code === lesson.code ? { ...item, lifecycleStatus: result.status, status: result.status } : item));
        setBulkNotice(result.message);
      } else {
        const result = action === "archive" ? await archiveMateriLessonAction(lesson.code) : await returnMateriLessonToDraftAction(lesson.code);
        if (!result.ok) { setBulkError(result.message); return; }
        setLessons((current) => current.map((item) => item.code === lesson.code ? result.lesson : item));
        setBulkNotice(result.message);
      }
      router.refresh();
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Status lesson tidak dapat diubah saat ini. Coba lagi.");
    } finally { setIsBulkPending(false); }
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={`${subject.code} · Materi`}
      searchPlaceholder="Cari lesson..."
      session={session}
    >
      <div className="space-y-3">
      <section className="space-y-3">
        <Button
          aria-label="Kembali ke semua materi"
          render={<Link href="/mentor/materi" />}
          size="icon-sm"
          title="Kembali ke semua materi"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
        <PageIntro
          action={
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="Buat materi baru"
                      render={<Link href={buildCreateHref(subject.slug)} />}
                      size="icon"
                      variant="brand"
                    />
                  }
                >
                  <Plus />
                </TooltipTrigger>
                <TooltipContent>Buat materi baru</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          }
          title={subject.name}
        />
        <CatalogueSearchInput
          onChange={changeQuery}
          placeholder="Cari judul, PDF, video, atau status..."
          value={query}
        />
        <div className="flex flex-wrap items-center gap-2">
          <CatalogueFilter
            label="Filter status"
            onValueChange={(value) => { setStatusFilter(value); setPage(1); setSelectedCodes(new Set()); }}
            options={[
              { label: "Semua status", value: "" },
              { label: "Draf", value: "draft" },
              { label: "Diterbitkan", value: "published" },
              { label: "Diarsipkan", value: "archived" },
              { label: "Terjadwal", value: "scheduled" },
            ]}
            value={statusFilter}
          />
          <CatalogueFilter
            label="Filter kesiapan PDF"
            onValueChange={(value) => { setReadinessFilter(value); setPage(1); setSelectedCodes(new Set()); }}
            options={[
              { label: "Semua kesiapan PDF", value: "" },
              { label: "PDF siap", value: "ready" },
              { label: "PDF belum siap", value: "incomplete" },
            ]}
            value={readinessFilter}
          />
          <CatalogueFilter
            label="Filter video opsional"
            onValueChange={(value) => { setVideoFilter(value); setPage(1); setSelectedCodes(new Set()); }}
            options={[
              { label: "Semua video", value: "" },
              { label: "Dengan video opsional", value: "with-video" },
              { label: "Tanpa video", value: "without-video" },
            ]}
            value={videoFilter}
          />
          {!selectionMode ? (
            <Button
              aria-label="Pilih beberapa lesson"
              className="ml-auto"
              onClick={() => setSelectionMode(true)}
              size="icon-sm"
              title="Pilih beberapa lesson"
              type="button"
              variant="brandOutline"
            >
              <ListChecks />
            </Button>
          ) : null}
        </div>
      </section>
      <section className="space-y-3">
        {selectionMode ? (
          <div className="flex flex-wrap items-center gap-5 rounded-3xl border border-primary-100 bg-primary-50/35 px-6 py-4">
            <Button aria-label="Keluar dari mode pilih" onClick={() => { setSelectionMode(false); setSelectedCodes(new Set()); }} size="icon-xs" type="button" variant="ghost"><X /></Button>
            <span className="text-sm font-semibold text-secondary-900">{selectedLessons.length} dipilih</span>
            <Checkbox
              aria-label="Pilih semua lesson yang terlihat"
              checked={selectAllVisible}
              onCheckedChange={(checked) => toggleAllVisible(checked === true)}
            />
            <span className="text-sm font-semibold text-secondary-700">
              Semua hasil
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <Button
                disabled={!publishEligible || isBulkPending}
                onClick={() => {
                  setBulkError(null);
                  setBulkIntent("publish");
                }}
                size="sm"
                type="button"
                variant="brand"
              >
                Terbitkan
              </Button>
              <Button
                disabled={!unpublishEligible || isBulkPending}
                onClick={() => {
                  setBulkError(null);
                  setBulkIntent("unpublish");
                }}
                size="sm"
                type="button"
                variant="brandOutline"
              >
                Batalkan terbit
              </Button>
              <Button
                disabled={isBulkPending}
                onClick={() => setSelectedCodes(new Set())}
                size="sm"
                type="button"
                variant="ghost"
              >
                Hapus pilihan
              </Button>
            </div>
            {eligibilityReason ? (
              <p
                className="basis-full text-sm text-secondary-600"
                role="status"
              >
                {eligibilityReason}
              </p>
            ) : null}
          </div>
        ) : null}
        {bulkNotice ? (
          <p
            className="rounded-2xl border border-primary-200 bg-primary-50/40 px-4 py-3 text-sm font-medium text-primary-900"
            role="status"
          >
            {bulkNotice}
          </p>
        ) : null}
        {pagedLessons.length ? (
          pagedLessons.map((lesson) => (
            <MateriLessonRow
              key={lesson.code}
              lesson={lesson}
              onAction={(action) => { void applyLessonAction(lesson, action); }}
              onSelectedChange={(checked) =>
                toggleSelected(lesson.code, checked)
              }
              returnTo={returnTo}
              selectionMode={selectionMode}
              selected={selectedCodes.has(lesson.code)}
            />
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50/40 px-5 py-10 text-center text-sm text-secondary-600">
            Tidak ada lesson yang cocok dengan pencarian ini.
          </div>
        )}
        <PaginationControls
          onPageChange={setPage}
          page={page}
          pageCount={pageCount}
        />
      </section>
      </div>
      <Dialog
        onOpenChange={(open) => {
          if (!open && !isBulkPending) {
            setBulkError(null);
            setBulkIntent(null);
          }
        }}
        open={Boolean(bulkIntent)}
      >
        <DialogContent showCloseButton={!isBulkPending}>
          <DialogHeader>
            <DialogTitle>{confirmation.title}</DialogTitle>
            <DialogDescription>{confirmation.description}</DialogDescription>
          </DialogHeader>
          {bulkError ? (
            <div
              aria-live="assertive"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {bulkError}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose
              disabled={isBulkPending}
              render={<Button type="button" variant="brandOutline" />}
            >
              Batal
            </DialogClose>
            <Button
              disabled={
                isBulkPending ||
                (bulkIntent === "publish"
                  ? !publishEligible
                  : !unpublishEligible)
              }
              onClick={confirmBulkLifecycle}
              type="button"
              variant="brand"
            >
              {isBulkPending ? "Memproses..." : confirmation.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenMateriPageModule, KaptenMateriSubjectPageModule };

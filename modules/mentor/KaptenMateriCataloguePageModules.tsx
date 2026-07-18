"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Eye, Pencil, Plus, Search, Video } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { PageIntro } from "@/modules/mentor/components/kapten-ui";
import { getSubjectCategory } from "@/modules/mentor/subject-category";
import {
  bulkPublishMateriLessonsAction,
  bulkUnpublishMateriLessonsAction,
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

function SearchInput({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-700" />
      <input
        className="h-12 w-full rounded-2xl border border-primary-200 bg-white px-11 text-sm text-secondary-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-3 focus:ring-primary-300/35"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}

function LifecycleStatus({ status }: { status: KaptenMateriView["status"] }) {
  const labels = {
    archived: "Diarsipkan",
    draft: "Draf",
    published: "Diterbitkan",
    scheduled: "Terjadwal",
  } as const;
  const colors = {
    archived: "text-secondary-500",
    draft: "text-primary-800",
    published: "text-primary-900",
    scheduled: "text-secondary-600",
  } as const;
  return (
    <span className={cn("text-sm font-semibold", colors[status])}>
      {labels[status]}
    </span>
  );
}

function ReadinessWarning({
  readiness,
}: {
  readiness: KaptenMateriView["readiness"];
}) {
  return readiness === "incomplete" ? (
    <span className="text-sm font-semibold text-secondary-600">Belum siap</span>
  ) : null;
}

function SubjectCard({ subject }: { subject: KaptenMateriSubjectView }) {
  const subjectCategory = getSubjectCategory(subject.code);

  return (
    <Link
      className="group flex min-h-32 flex-col rounded-3xl border border-primary-200 bg-white p-5 shadow-sm transition hover:border-primary-500 hover:bg-primary-50/40"
      href={`/mentor/materi/subject/${subject.slug}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex rounded-xl bg-primary-100 px-3 py-1.5 text-sm font-bold text-primary-900">
          {subjectCategory}
        </span>
        <Video className="size-5 text-primary-800" />
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
      <PageIntro title="Materi" />
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
  onSelectedChange,
  returnTo,
  selected,
}: {
  lesson: KaptenMateriView;
  onSelectedChange: (checked: boolean) => void;
  returnTo: string;
  selected: boolean;
}) {
  return (
    <article className="grid gap-4 rounded-3xl border border-primary-100 bg-white p-4 shadow-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <Checkbox
        aria-label={`Pilih ${lesson.title}`}
        checked={selected}
        onCheckedChange={(checked) => onSelectedChange(checked === true)}
      />
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-secondary-900">
          {lesson.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-500">
          <span>{lesson.duration || "Durasi belum diisi"}</span>
          <LifecycleStatus status={lesson.status} />
          <ReadinessWarning readiness={lesson.readiness} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button
          render={<Link href={buildEditorHref(lesson, returnTo, true)} />}
          aria-label="Kembali ke semua materi"
          size="icon-sm"
          title="Kembali ke semua materi"
          variant="brandOutline"
        >
          <Eye />
          Preview
        </Button>
        <Button
          render={<Link href={buildEditorHref(lesson, returnTo)} />}
          size="sm"
          variant="brand"
        >
          <Pencil />
          Edit
        </Button>
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
  const returnTo = `/mentor/materi/subject/${subject.slug}`;

  function filterVisibleLessons(value: string) {
    const normalizedValue = value.trim().toLocaleLowerCase();
    return lessons.filter(
      (lesson) =>
        !normalizedValue ||
        [
          lesson.title,
          lesson.duration,
          lesson.status,
          lesson.readiness === "incomplete" ? "belum siap" : "",
        ].some((candidate) =>
          candidate.toLocaleLowerCase().includes(normalizedValue),
        ),
    );
  }

  const visibleLessons = filterVisibleLessons(query);
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
      ? "Pilih hanya lesson draf yang siap diterbitkan atau lesson yang sudah diterbitkan."
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
    const visibleCodes = new Set(
      filterVisibleLessons(value).map((lesson) => lesson.code),
    );
    setQuery(value);
    setSelectedCodes((current) => {
      const next = new Set(
        [...current].filter((code) => visibleCodes.has(code)),
      );
      return next.size === current.size ? current : next;
    });
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

  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={`${subject.code} · Materi`}
      searchPlaceholder="Cari lesson..."
      session={session}
    >
      <section className="space-y-5">
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
            <Button
              render={<Link href={buildCreateHref(subject.slug)} />}
              variant="brand"
            >
              <Plus />
              Buat Materi
            </Button>
          }
          eyebrow={getSubjectCategory(subject.code)}
          title={subject.name}
        />
        <SearchInput
          onChange={changeQuery}
          placeholder="Cari judul, durasi, atau status..."
          value={query}
        />
      </section>
      <section className="mt-5 space-y-3">
        {visibleLessons.length && selectedLessons.length ? (
          <div className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50/35 px-4 py-3">
            <Checkbox
              aria-label="Pilih semua lesson yang terlihat"
              checked={selectAllVisible}
              onCheckedChange={(checked) => toggleAllVisible(checked === true)}
            />
            <span className="text-sm font-semibold text-secondary-700">
              Pilih semua hasil
            </span>
          </div>
        ) : null}
        {selectedLessons.length ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3">
            <span className="text-sm font-semibold text-secondary-900">
              {selectedLessons.length} dipilih
            </span>
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
        {visibleLessons.length ? (
          visibleLessons.map((lesson) => (
            <MateriLessonRow
              key={lesson.code}
              lesson={lesson}
              onSelectedChange={(checked) =>
                toggleSelected(lesson.code, checked)
              }
              returnTo={returnTo}
              selected={selectedCodes.has(lesson.code)}
            />
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50/40 px-5 py-10 text-center text-sm text-secondary-600">
            Tidak ada lesson yang cocok dengan pencarian ini.
          </div>
        )}
      </section>
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

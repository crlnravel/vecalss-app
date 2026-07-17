"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  Pencil,
  Plus,
  Search,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { PageIntro, StatusPill } from "@/modules/mentor/components/kapten-ui";
import {
  getMateriWithStoredDrafts,
} from "@/modules/mentor/materi-draft-storage";
import {
  getCanonicalMateriSection,
  getMateriSubjectRoute,
  materiSubjects,
  sortMateriInventory,
  type MateriSubject,
} from "@/modules/mentor/materi-model";
import { materi, type KaptenMateri } from "@/modules/mentor/mock-data";

const materiChangeEvent = "vecalss-materi-drafts-change";

function buildCreateHref(subject: MateriSubject, sectionId?: string) {
  const query = new URLSearchParams({
    returnTo: getMateriSubjectRoute(subject.slug) ?? "/mentor/materi",
    subject: subject.slug,
  });

  if (sectionId) {
    query.set("section", sectionId);
  }

  return `/mentor/materi/create?${query.toString()}`;
}

function buildEditorHref(materi: KaptenMateri, returnTo: string, preview = false) {
  const query = new URLSearchParams({ returnTo });
  if (preview) {
    query.set("preview", "1");
  }

  return `/mentor/materi/${materi.id}?${query.toString()}`;
}

function useMateriCatalogue() {
  const [catalogue, setCatalogue] = useState<KaptenMateri[]>(materi);

  useEffect(() => {
    const sync = () => setCatalogue(getMateriWithStoredDrafts(materi));

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(materiChangeEvent, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(materiChangeEvent, sync);
    };
  }, []);

  return catalogue;
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
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-400" />
      <input
        className="h-12 w-full rounded-2xl border border-primary-100 bg-white px-11 text-sm shadow-sm outline-none transition focus:border-primary-300 focus:ring-3 focus:ring-primary-300/20"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}

function ReadinessLabel({ readiness }: { readiness: KaptenMateri["readiness"] }) {
  return (
    <span className={cn("text-sm font-semibold", readiness === "ready" ? "text-primary-800" : "text-[#856300]")}>
      {readiness === "ready" ? "Siap" : "Belum siap"}
    </span>
  );
}

function SubjectCard({
  catalogue,
  subject,
}: {
  catalogue: KaptenMateri[];
  subject: MateriSubject;
}) {
  const lessons = catalogue.filter((lesson) => lesson.subjectSlug === subject.slug);
  const ready = lessons.filter((lesson) => lesson.readiness === "ready").length;
  const lifecycle = (["draft", "scheduled", "published", "archived"] as const)
    .flatMap((status) => {
      const count = lessons.filter((lesson) => lesson.status === status).length;
      return count ? [`${count} ${status}`] : [];
    })
    .join(" · ");
  const href = getMateriSubjectRoute(subject.slug)!;

  return (
    <Link
      className="group flex min-h-52 flex-col rounded-3xl border border-primary-100 bg-white p-5 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50/35"
      href={href}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex rounded-xl bg-primary-100 px-3 py-1.5 text-sm font-bold text-primary-900">
          {subject.code}
        </span>
        <Video className="size-5 text-primary-800" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-secondary-900">{subject.name}</h2>
      <p className="mt-2 text-sm leading-6 text-secondary-500">{subject.description}</p>
      <div className="mt-auto border-t border-primary-100 pt-4 text-sm text-secondary-600">
        <p className="font-semibold text-secondary-900">{lessons.length} video · {ready} siap</p>
        <p className="mt-1 truncate text-xs text-secondary-500">{lifecycle || "Belum ada status video"}</p>
      </div>
    </Link>
  );
}

function KaptenMateriPageModule({ session }: { session: SessionContext }) {
  const catalogue = useMateriCatalogue();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const subjects = useMemo(
    () => materiSubjects.filter((subject) =>
        !normalizedQuery || [subject.code, subject.name, subject.description]
          .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [normalizedQuery],
  );

  return (
    <MentorWorkspaceShell activeLabel="Materi" breadcrumbLabel="Materi" searchPlaceholder="Cari materi..." session={session}>
      <PageIntro
        action={<Button render={<Link href="/mentor/materi/create" />} variant="brand"><Plus />Buat Materi</Button>}
        description="Kelola katalog video berdasarkan tujuh subject Materi. Ringkasan ini hanya menunjukkan status dan kesiapan untuk Kapten."
        title="Materi"
      />
      <section className="space-y-6">
        <SearchInput onChange={setQuery} placeholder="Cari kode, subject, atau deskripsi..." value={query} />
        {subjects.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject) => <SubjectCard catalogue={catalogue} key={subject.slug} subject={subject} />)}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-primary-200 bg-white px-5 py-10 text-center text-sm text-secondary-500">
            Tidak ada subject yang cocok dengan pencarian ini.
          </div>
        )}
      </section>
    </MentorWorkspaceShell>
  );
}

function MateriLessonRow({ lesson, returnTo }: { lesson: KaptenMateri; returnTo: string }) {
  return (
    <div className="grid gap-4 border-t border-primary-100 py-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-bold text-primary-800">{lesson.position + 1}.</span>
          <h3 className="min-w-0 text-base font-semibold text-secondary-900">{lesson.title}</h3>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-500">
          <span>{lesson.duration || "Durasi belum diisi"}</span>
          <StatusPill status={lesson.status} />
          <ReadinessLabel readiness={lesson.readiness} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button render={<Link href={buildEditorHref(lesson, returnTo, true)} />} size="sm" variant="brandOutline"><Eye />Preview</Button>
        <Button render={<Link href={buildEditorHref(lesson, returnTo)} />} size="sm" variant="brand"><Pencil />Edit</Button>
      </div>
    </div>
  );
}

function SubjectSection({
  lessons,
  section,
  subject,
}: {
  lessons: KaptenMateri[];
  section: MateriSubject["sections"][number];
  subject: MateriSubject;
}) {
  return (
    <section className="rounded-3xl border border-primary-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-secondary-900">{section.title}</h2>
          <p className="mt-1 text-sm text-secondary-500">{lessons.length} video</p>
        </div>
        <Button render={<Link href={buildCreateHref(subject, section.sectionId)} />} size="sm" variant="brandOutline"><Plus />Buat video</Button>
      </div>
      <div className="mt-5">
        {lessons.length ? lessons.map((lesson) => (
          <MateriLessonRow key={lesson.id} lesson={lesson} returnTo={getMateriSubjectRoute(subject.slug)!} />
        )) : (
          <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/35 px-4 py-6 text-sm text-secondary-500">
            Belum ada video di section ini. Buat video untuk menambahkannya ke urutan learner-facing.
          </div>
        )}
      </div>
    </section>
  );
}

function KaptenMateriSubjectPageModule({
  session,
  subject,
}: {
  session: SessionContext;
  subject: MateriSubject;
}) {
  const catalogue = useMateriCatalogue();
  const [query, setQuery] = useState("");
  const returnTo = getMateriSubjectRoute(subject.slug)!;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const subjectLessons = useMemo(
    () => sortMateriInventory(catalogue.filter((lesson) => lesson.subjectSlug === subject.slug)),
    [catalogue, subject.slug],
  );
  const matches = (lesson: KaptenMateri) => !normalizedQuery || [
    lesson.title,
    lesson.duration,
    lesson.status,
    lesson.readiness === "ready" ? "siap" : "belum siap",
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  const isRecoveryLesson = (lesson: KaptenMateri) =>
    lesson.migrationState === "needs-review" || !getCanonicalMateriSection(subject.slug, lesson.sectionId);
  const recoveryLessons = subjectLessons.filter(isRecoveryLesson).filter(matches);

  return (
    <MentorWorkspaceShell activeLabel="Materi" breadcrumbLabel={`${subject.code} · Materi`} searchPlaceholder="Cari video..." session={session}>
      <section className="space-y-5">
        <Button render={<Link href="/mentor/materi" />} size="sm" variant="ghost"><ArrowLeft />Semua subject</Button>
        <PageIntro
          action={<Button render={<Link href={buildCreateHref(subject)} />} variant="brand"><Plus />Buat Materi</Button>}
          description={subject.description}
          eyebrow={subject.code}
          title={subject.name}
        />
        <SearchInput onChange={setQuery} placeholder="Cari judul, durasi, status, atau kesiapan..." value={query} />
      </section>
      <div className="space-y-5">
        {subject.sections.map((section) => (
          <SubjectSection
            key={section.sectionId}
            lessons={subjectLessons
              .filter((lesson) => lesson.sectionId === section.sectionId)
              .filter((lesson) => !isRecoveryLesson(lesson))
              .filter(matches)}
            section={section}
            subject={subject}
          />
        ))}
        <section className="rounded-3xl border border-dashed border-[#d7b96b] bg-[#fffdf1] p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-secondary-900">Perlu pemulihan</h2>
          <p className="mt-1 text-sm leading-6 text-secondary-600">Video ini belum punya penempatan section yang dapat dipetakan dengan aman. Video tidak ditampilkan dalam urutan learner-facing sampai Kapten memilih section kanonis.</p>
          <div className="mt-5">
            {recoveryLessons.length ? recoveryLessons.map((lesson) => (
              <MateriLessonRow key={lesson.id} lesson={lesson} returnTo={returnTo} />
            )) : (
              <p className="rounded-2xl border border-dashed border-[#e6d49d] bg-white/60 px-4 py-5 text-sm text-secondary-500">
                Tidak ada video yang memerlukan pemulihan.
              </p>
            )}
          </div>
        </section>
      </div>
    </MentorWorkspaceShell>
  );
}

export {
  KaptenMateriPageModule,
  KaptenMateriSubjectPageModule,
};

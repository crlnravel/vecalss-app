"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eye,
  FileText,
  GripVertical,
  Paperclip,
  Plus,
  Save,
  Trash2,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
  fieldControlClassName,
} from "@/components/ui/field";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  kaptenSubjects,
  mediaAssets,
  type KaptenMateri,
} from "@/modules/mentor/mock-data";

type MateriSectionKind = "video" | "notes" | "attachment" | "practice";

type MateriBuilderSection = {
  assetId?: string;
  body: string;
  id: string;
  kind: MateriSectionKind;
  prompt?: string;
  title: string;
  videoUrl?: string;
};

type MateriBuilderState = {
  description: string;
  sections: MateriBuilderSection[];
  subjectCode: string;
  title: string;
};

const sectionKindMeta: Record<
  MateriSectionKind,
  { icon: LucideIcon; label: string }
> = {
  attachment: { icon: Paperclip, label: "Attachment" },
  notes: { icon: FileText, label: "Catatan" },
  practice: { icon: ClipboardList, label: "Practice" },
  video: { icon: Video, label: "Video" },
};

const blankSection: MateriBuilderSection = {
  body: "",
  id: "section-new",
  kind: "notes",
  title: "Section baru",
};

function getSeedSections(materi?: KaptenMateri | null): MateriBuilderSection[] {
  if (!materi) {
    return [
      {
        body: "",
        id: "section-video",
        kind: "video",
        title: "Video pembuka",
        videoUrl: "",
      },
      {
        body: "",
        id: "section-notes",
        kind: "notes",
        title: "Catatan inti",
      },
    ];
  }

  return materi.sections.map((title, index) => ({
    assetId: index === 1 ? mediaAssets[0]?.id : undefined,
    body:
      index === 0
        ? materi.description
        : "Tambahkan catatan ringkas untuk membantu siswa mengikuti materi.",
    id: `${materi.id}-section-${index + 1}`,
    kind: index === 0 ? "video" : index === 1 ? "notes" : "practice",
    prompt: index === 2 ? "Tulis satu contoh soal singkat untuk section ini." : "",
    title,
    videoUrl: index === 0 ? materi.videoUrl : "",
  }));
}

function getInitialState(materi?: KaptenMateri | null): MateriBuilderState {
  return {
    description: materi?.description ?? "",
    sections: getSeedSections(materi),
    subjectCode: materi?.subjectCode ?? "PU",
    title: materi?.title ?? "Draft Materi Baru",
  };
}

function getSubjectName(subjectCode: string) {
  return kaptenSubjects.find((subject) => subject.code === subjectCode)?.name ?? subjectCode;
}

function SectionKindIcon({ kind }: { kind: MateriSectionKind }) {
  const meta = sectionKindMeta[kind];

  return <meta.icon className="size-4 text-primary-800" />;
}

function SectionTypeSelect({
  onChange,
  value,
}: {
  onChange: (value: MateriSectionKind) => void;
  value: MateriSectionKind;
}) {
  return (
    <div className="relative">
      <select
        className={`${fieldControlClassName} appearance-none pr-12`}
        onChange={(event) => onChange(event.target.value as MateriSectionKind)}
        value={value}
      >
        {Object.entries(sectionKindMeta).map(([kind, meta]) => (
          <option key={kind} value={kind}>
            {meta.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
    </div>
  );
}

function KaptenMateriBuilderPageModule({
  initialMateri = null,
  mode,
  session,
}: {
  initialMateri?: KaptenMateri | null;
  mode: "create" | "edit";
  session: SessionContext;
}) {
  const [builderState, setBuilderState] = useState(() =>
    getInitialState(initialMateri),
  );
  const [activeSectionId, setActiveSectionId] = useState(
    builderState.sections[0]?.id ?? "",
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const activeSection = useMemo(
    () =>
      builderState.sections.find((section) => section.id === activeSectionId) ??
      builderState.sections[0],
    [activeSectionId, builderState.sections],
  );

  const selectedSubject = getSubjectName(builderState.subjectCode);
  const readySectionCount = builderState.sections.filter(
    (section) => section.title.trim() && section.body.trim(),
  ).length;

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  function markChanged(nextState: MateriBuilderState) {
    setBuilderState(nextState);
    setHasUnsavedChanges(true);
    setLastSavedAt(null);
  }

  function updateMetadata(field: keyof Omit<MateriBuilderState, "sections">, value: string) {
    markChanged({
      ...builderState,
      [field]: value,
    });
  }

  function updateActiveSection(patch: Partial<MateriBuilderSection>) {
    if (!activeSection) {
      return;
    }

    markChanged({
      ...builderState,
      sections: builderState.sections.map((section) =>
        section.id === activeSection.id ? { ...section, ...patch } : section,
      ),
    });
  }

  function addSection(kind: MateriSectionKind = "notes") {
    const nextSection: MateriBuilderSection = {
      ...blankSection,
      id: `section-${Date.now()}`,
      kind,
      title:
        kind === "video"
          ? "Video baru"
          : kind === "attachment"
            ? "Resource pendukung"
            : kind === "practice"
              ? "Latihan singkat"
              : "Catatan baru",
    };

    markChanged({
      ...builderState,
      sections: [...builderState.sections, nextSection],
    });
    setActiveSectionId(nextSection.id);
  }

  function removeSection(sectionId: string) {
    if (builderState.sections.length <= 1) {
      return;
    }

    const nextSections = builderState.sections.filter(
      (section) => section.id !== sectionId,
    );

    markChanged({
      ...builderState,
      sections: nextSections,
    });

    if (activeSectionId === sectionId) {
      setActiveSectionId(nextSections[0]?.id ?? "");
    }
  }

  function moveSection(sectionId: string, direction: "up" | "down") {
    const currentIndex = builderState.sections.findIndex(
      (section) => section.id === sectionId,
    );
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= builderState.sections.length
    ) {
      return;
    }

    const nextSections = [...builderState.sections];
    const [movedSection] = nextSections.splice(currentIndex, 1);

    if (!movedSection) {
      return;
    }

    nextSections.splice(nextIndex, 0, movedSection);
    markChanged({ ...builderState, sections: nextSections });
  }

  function saveDraft() {
    setHasUnsavedChanges(false);
    setLastSavedAt("Draft tersimpan.");
  }

  function handleBackNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (
      hasUnsavedChanges &&
      !window.confirm("Perubahan belum disimpan. Keluar dari builder?")
    ) {
      event.preventDefault();
    }
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={mode === "create" ? "Buat Materi" : "Edit Materi"}
      mainClassName="max-w-[1500px] gap-7"
      searchPlaceholder="Cari materi atau asset..."
      session={session}
    >
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Button
            render={<Link href="/mentor/materi" onClick={handleBackNavigation} />}
            size="sm"
            variant="ghost"
          >
            <ArrowLeft />
            Materi
          </Button>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">
              {mode === "create" ? "Buat Materi" : builderState.title}
            </h1>
            <span className="text-sm font-semibold text-[#856300]">Draft</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setIsPreviewOpen((current) => !current)}
            type="button"
            variant="brandOutline"
          >
            <Eye />
            Preview
          </Button>
          <Button onClick={saveDraft} type="button" variant="brand">
            <Save />
            Simpan Draft
          </Button>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[minmax(300px,0.34fr)_minmax(0,0.66fr)]">
        <aside className="space-y-5">
          <div className="rounded-3xl border border-primary-100 bg-white px-5 py-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-secondary-900">
                  Struktur
                </p>
                <p className="mt-1 text-xs text-secondary-500">
                  {builderState.sections.length} section
                </p>
              </div>
              <Button
                onClick={() => addSection("notes")}
                size="sm"
                type="button"
                variant="brandOutline"
              >
                <Plus />
                Section
              </Button>
            </div>

            <div className="mt-5 space-y-1">
              {builderState.sections.map((section, index) => (
                <button
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
                    section.id === activeSection?.id
                      ? "bg-primary-50 text-primary-900"
                      : "text-secondary-600 hover:bg-primary-50/60",
                  )}
                  key={section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  type="button"
                >
                  <GripVertical className="size-4 shrink-0 text-secondary-300" />
                  <SectionKindIcon kind={section.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {section.title || `Section ${index + 1}`}
                    </span>
                    <span className="mt-1 block text-xs text-secondary-500">
                      {sectionKindMeta[section.kind].label}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-primary-100 bg-white px-5 py-5 shadow-sm">
            <p className="text-sm font-semibold text-secondary-900">Status</p>
            <div className="mt-4 space-y-3 text-sm text-secondary-600">
              <div className="flex items-center justify-between gap-4">
                <span>Subject</span>
                <span className="font-semibold text-secondary-900">
                  {builderState.subjectCode}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Siap</span>
                <span className="font-semibold text-secondary-900">
                  {readySectionCount}/{builderState.sections.length} section
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Perubahan</span>
                <span
                  className={cn(
                    "font-semibold",
                    hasUnsavedChanges ? "text-[#856300]" : "text-primary-800",
                  )}
                >
                  {hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}
                </span>
              </div>
            </div>
            {lastSavedAt ? (
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-primary-800">
                <CheckCircle2 className="size-4" />
                {lastSavedAt}
              </p>
            ) : null}
          </div>
        </aside>

        <div className="space-y-7">
          <section className="rounded-3xl border border-primary-100 bg-white px-5 py-5 shadow-sm md:px-6 md:py-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <Field>
                <FieldLabel htmlFor="materi-title">Judul materi</FieldLabel>
                <FieldInput
                  id="materi-title"
                  onChange={(event) => updateMetadata("title", event.target.value)}
                  value={builderState.title}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="materi-subject">Subject</FieldLabel>
                <div className="relative">
                  <select
                    className={`${fieldControlClassName} appearance-none pr-12`}
                    id="materi-subject"
                    onChange={(event) =>
                      updateMetadata("subjectCode", event.target.value)
                    }
                    value={builderState.subjectCode}
                  >
                    {kaptenSubjects.map((subject) => (
                      <option key={subject.code} value={subject.code}>
                        {subject.code} - {subject.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
                </div>
              </Field>

              <Field className="lg:col-span-2">
                <FieldLabel htmlFor="materi-summary">Ringkasan</FieldLabel>
                <FieldTextarea
                  className="min-h-[118px]"
                  id="materi-summary"
                  onChange={(event) =>
                    updateMetadata("description", event.target.value)
                  }
                  value={builderState.description}
                />
              </Field>
            </div>
          </section>

          {activeSection ? (
            <section className="rounded-3xl border border-primary-100 bg-white px-5 py-5 shadow-sm md:px-6 md:py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-secondary-900">
                    Section editor
                  </p>
                  <p className="mt-1 text-sm text-secondary-500">
                    {sectionKindMeta[activeSection.kind].label}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    aria-label="Pindah section ke atas"
                    onClick={() => moveSection(activeSection.id, "up")}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    aria-label="Pindah section ke bawah"
                    onClick={() => moveSection(activeSection.id, "down")}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    aria-label="Hapus section"
                    disabled={builderState.sections.length <= 1}
                    onClick={() => removeSection(activeSection.id)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                <Field>
                  <FieldLabel htmlFor="section-title">Judul section</FieldLabel>
                  <FieldInput
                    id="section-title"
                    onChange={(event) =>
                      updateActiveSection({ title: event.target.value })
                    }
                    value={activeSection.title}
                  />
                </Field>

                <Field>
                  <FieldLabel>Tipe</FieldLabel>
                  <SectionTypeSelect
                    onChange={(kind) => updateActiveSection({ kind })}
                    value={activeSection.kind}
                  />
                </Field>

                {activeSection.kind === "video" ? (
                  <Field className="lg:col-span-2">
                    <FieldLabel htmlFor="section-video-url">Video URL</FieldLabel>
                    <FieldInput
                      id="section-video-url"
                      onChange={(event) =>
                        updateActiveSection({ videoUrl: event.target.value })
                      }
                      placeholder="https://youtube.com/..."
                      value={activeSection.videoUrl ?? ""}
                    />
                  </Field>
                ) : null}

                {activeSection.kind === "attachment" ? (
                  <Field className="lg:col-span-2">
                    <FieldLabel htmlFor="section-asset">Media asset</FieldLabel>
                    <div className="relative">
                      <select
                        className={`${fieldControlClassName} appearance-none pr-12`}
                        id="section-asset"
                        onChange={(event) =>
                          updateActiveSection({ assetId: event.target.value })
                        }
                        value={activeSection.assetId ?? ""}
                      >
                        <option value="">Pilih asset</option>
                        {mediaAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.title}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
                    </div>
                  </Field>
                ) : null}

                <Field className="lg:col-span-2">
                  <FieldLabel htmlFor="section-body">Konten</FieldLabel>
                  <FieldTextarea
                    id="section-body"
                    onChange={(event) =>
                      updateActiveSection({ body: event.target.value })
                    }
                    value={activeSection.body}
                  />
                </Field>

                {activeSection.kind === "practice" ? (
                  <Field className="lg:col-span-2">
                    <FieldLabel htmlFor="section-prompt">Prompt latihan</FieldLabel>
                    <FieldTextarea
                      className="min-h-[120px]"
                      id="section-prompt"
                      onChange={(event) =>
                        updateActiveSection({ prompt: event.target.value })
                      }
                      value={activeSection.prompt ?? ""}
                    />
                  </Field>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </section>

      {isPreviewOpen ? (
        <section className="rounded-3xl border border-primary-100 bg-white px-5 py-6 shadow-sm md:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-primary-800">
                Preview learner
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-secondary-900">
                {builderState.title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary-500">
                {selectedSubject} · {builderState.description || "Belum ada ringkasan."}
              </p>
            </div>
            <Button
              onClick={() => setIsPreviewOpen(false)}
              size="sm"
              type="button"
              variant="brandOutline"
            >
              Tutup Preview
            </Button>
          </div>

          <div className="mt-6 divide-y divide-primary-100">
            {builderState.sections.map((section, index) => (
              <div className="py-5 first:pt-0 last:pb-0" key={section.id}>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-secondary-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <SectionKindIcon kind={section.kind} />
                  <h3 className="text-lg font-semibold text-secondary-900">
                    {section.title}
                  </h3>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-secondary-600">
                  {section.body || "Konten section belum diisi."}
                </p>
                {section.videoUrl ? (
                  <p className="mt-2 text-sm text-primary-800">
                    {section.videoUrl}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </MentorWorkspaceShell>
  );
}

export { KaptenMateriBuilderPageModule };

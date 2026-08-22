"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  ListChecks,
  Lock,
  Save,
  Search,
  SlidersHorizontal,
  Upload,
  Users,
} from "@/lib/icons";
import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { AssessmentReleaseNotice } from "@/modules/mentor/KaptenTryoutOperationalShared";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { KaptenTryoutPolicyPageModule } from "@/modules/mentor/KaptenTryoutPolicyPageModule";
import { KaptenTryoutSessionsPageModule } from "@/modules/mentor/KaptenTryoutSessionsPageModule";
import {
  policyLabels,
  rankingLabels,
  type Policy,
} from "@/modules/mentor/KaptenTryoutOperationsData";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import { duplicateTryoutAction, saveTryoutAction } from "@/modules/mentor/tryout-actions";

const subjectCodes = kaptenSubjects.map((subject) => subject.code) as Array<"PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM">;
type SubjectCode = (typeof subjectCodes)[number];
type TestDraft = {
  catItemCount?: number;
  durationMinutes: number;
  instructions: string;
  packageVersionId?: string;
  packageVersionLabel?: string;
  scoringConfig?: Record<string, unknown>;
  shuffleItems: boolean;
  subtest: SubjectCode;
  testType: "cbt" | "cat";
};
type ReleaseMeta = {
  digest: string;
  id: string;
  number: number;
  payload?: unknown;
  publishedAt: string;
};
type TryoutDraft = {
  assessmentRelease?: ReleaseMeta | null;
  description: string;
  id: string;
  locked: boolean;
  sections: TestDraft[];
  status: "draft" | "published";
  title: string;
  updatedAt: number;
};
type ReadyVersion = { id: string; label: string; subtest: SubjectCode };
type Workspace = "basics" | "sections" | "questions" | "rules" | "schedule" | "results" | "review" | "publish";

const workspaceItems: Array<{ label: string; value: Workspace }> = [
  { label: "Basics", value: "basics" },
  { label: "Sections", value: "sections" },
  { label: "Questions", value: "questions" },
  { label: "Rules", value: "rules" },
  { label: "Schedule & akses", value: "schedule" },
  { label: "Results", value: "results" },
  { label: "Review", value: "review" },
  { label: "Publish", value: "publish" },
];

function defaultSections(): TestDraft[] {
  return subjectCodes.map((subtest) => ({
    durationMinutes: 30,
    instructions: "",
    shuffleItems: false,
    subtest,
    testType: "cbt",
  }));
}

function normalize(draft: TryoutDraft): TryoutDraft {
  const byCode = new Map(draft.sections.map((section) => [section.subtest, section]));
  const fallback = defaultSections();
  return {
    ...draft,
    sections: subjectCodes.map((code) => byCode.get(code) ?? fallback.find((section) => section.subtest === code)!),
  };
}

function normalizeWorkspace(value?: string): Workspace {
  switch (value) {
    case "basics":
    case "sections":
    case "questions":
    case "rules":
    case "schedule":
    case "results":
    case "review":
    case "publish":
      return value;
    case "authoring":
      return "sections";
    case "policy":
    case "sessions":
    case "participants":
    case "operations":
      return "schedule";
    default:
      return "basics";
  }
}

function subjectName(code: SubjectCode) {
  return kaptenSubjects.find((subject) => subject.code === code)?.name ?? code;
}

function releaseFor(
  draft: TryoutDraft,
  operationsInitial?: TryoutOperationsView,
): ReleaseMeta | null {
  return draft.assessmentRelease ?? operationsInitial?.assessmentRelease ?? null;
}

function resultPolicyLabel(policy: string, fallback: Policy) {
  if (policy === "inherit") return policyLabels[fallback];
  return policyLabels[policy as Policy] ?? policy;
}

function WorkspaceUnavailable({ onSaveDraft }: { onSaveDraft: () => void }) {
  return (
    <section className="grid min-h-56 place-items-center rounded-3xl border border-dashed border-primary-200 bg-white px-6 py-12 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
          <Save aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-secondary-900">Simpan draf untuk membuka ruang ini</h2>
        <p className="text-sm leading-6 text-secondary-600">Basics, Sections, dan Review bisa disiapkan sekarang. Jadwal, peserta, dan hasil akan tersambung setelah Tryout memiliki ID.</p>
        <Button onClick={onSaveDraft} variant="brand">Simpan draf</Button>
      </div>
    </section>
  );
}

function KaptenTryoutBuilderPageModule({
  id,
  initialDraft,
  initialWorkspace = "basics",
  operationsInitial,
  readyVersions,
  session,
}: {
  id?: string;
  initialDraft?: TryoutDraft | null;
  initialWorkspace?: string;
  operationsInitial?: TryoutOperationsView;
  readyVersions: ReadyVersion[];
  session: SessionContext;
}) {
  void session;
  const [draft, setDraft] = useState<TryoutDraft>(() => normalize(initialDraft ?? {
    description: "",
    id: id ?? "baru",
    locked: false,
    sections: defaultSections(),
    status: "draft",
    title: "Draft Tryout Baru",
    updatedAt: Date.now(),
  }));
  const [activeCode, setActiveCode] = useState<SubjectCode>(() => draft.sections.find((section) => !section.packageVersionId)?.subtest ?? "PU");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [packageSearch, setPackageSearch] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(() => normalizeWorkspace(initialWorkspace));

  const activeSection = draft.sections.find((section) => section.subtest === activeCode) ?? draft.sections[0];
  const boundCount = draft.sections.filter((section) => section.packageVersionId).length;
  const readyToPublish = Boolean(draft.title.trim()) && boundCount === subjectCodes.length;
  const activeReadyVersions = useMemo(
    () => readyVersions.filter((version) => version.subtest === activeSection.subtest && version.label.toLocaleLowerCase().includes(packageSearch.toLocaleLowerCase())),
    [activeSection.subtest, packageSearch, readyVersions],
  );
  const release = releaseFor(draft, operationsInitial);

  const update = (subtest: SubjectCode, change: Partial<TestDraft>) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => section.subtest === subtest ? { ...section, ...change } : section),
    }));
  };

  const save = async (status = draft.status) => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveTryoutAction({
        description: draft.description,
        id,
        sections: draft.sections.map((section) => ({
          catItemCount: section.catItemCount,
          durationMinutes: section.durationMinutes,
          instructions: section.instructions,
          packageVersionId: section.packageVersionId,
          scoringConfig: section.scoringConfig,
          shuffleItems: section.shuffleItems,
          subtest: section.subtest,
          testType: section.testType,
        })),
        status,
        title: draft.title,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft(normalize(result.result));
      if (!id) window.location.assign(`/mentor/tryout/${result.result.id}?workspace=review`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Tryout belum dapat disimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const result = await duplicateTryoutAction(id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.location.assign(`/mentor/tryout/${result.result.id}?workspace=review`);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Tryout belum dapat disalin. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const changeWorkspace = (value: string) => {
    const nextWorkspace = normalizeWorkspace(value);
    setWorkspace(nextWorkspace);
    const url = new URL(window.location.href);
    if (nextWorkspace === "basics") url.searchParams.delete("workspace");
    else url.searchParams.set("workspace", nextWorkspace);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const goTo = (nextWorkspace: Workspace) => {
    changeWorkspace(nextWorkspace);
  };

  const incompleteSections = draft.sections.filter((section) => !section.packageVersionId);
  const reviewChecks = [
    { detail: draft.title.trim() ? "Judul Tryout sudah terisi." : "Tambahkan judul sebelum publikasi.", label: "Basics lengkap", status: Boolean(draft.title.trim()) },
    { detail: "PU, PPU, PBM, PK, LBI, LBE, dan PM tersedia.", label: "Tujuh Section tetap", status: draft.sections.length === 7 },
    { detail: boundCount === 7 ? "Semua Section memiliki sumber soal siap." : `${7 - boundCount} Section belum memiliki sumber soal.`, label: "Sumber soal lengkap", status: boundCount === 7 },
    { detail: draft.sections.every((section) => section.durationMinutes >= 1) ? "Durasi setiap Section valid." : "Periksa durasi setiap Section.", label: "Durasi valid", status: draft.sections.every((section) => section.durationMinutes >= 1) },
    { detail: id ? (operationsInitial?.sessions.length ? `${operationsInitial.sessions.length} sesi tersimpan.` : "Belum ada sesi delivery.") : "Simpan draf untuk mengatur sesi.", label: "Schedule & akses", status: Boolean(operationsInitial?.sessions.length) },
  ];

  return (
    <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-primary-100 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button nativeButton={false} render={<Link href="/mentor/tryout" />} size="sm" variant="ghost">
            <ArrowLeft />
            Semua Tryout
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={saving} onClick={() => setPreviewOpen(true)} size="sm" variant="ghost">
              <Eye />
              Pratinjau
            </Button>
            {draft.locked ? (
              <Button disabled={saving} onClick={() => setDuplicateOpen(true)} size="sm" variant="brand">
                <Copy />
                Duplikasi
              </Button>
            ) : (
              <>
                <Button disabled={saving} onClick={() => void save()} size="sm" variant="brandOutline">
                  <Save />
                  {saving ? "Menyimpan…" : "Simpan draft"}
                </Button>
                <Button disabled={saving} onClick={() => goTo("publish")} size="sm" variant="brand">
                  <Upload />
                  Ke Publish
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-800">Tryout workspace</p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-[-0.02em] text-secondary-900 sm:text-3xl">{draft.title || "Tryout tanpa judul"}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-secondary-600">Satu ruang kerja untuk merakit, memeriksa, menjadwalkan, dan menerbitkan Tryout.</p>
          </div>
          <Badge className="rounded-full px-3 py-1.5" size="ui" variant={draft.status === "published" ? "mint" : "accent"}>
            {draft.status === "published" ? "Diterbitkan" : "Draf"}
          </Badge>
        </div>
      </header>

      {error ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm leading-6 text-danger-500" role="alert">
          <CircleAlert className="mt-1 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {draft.locked ? (
        <section className="mt-5 flex items-start gap-3 rounded-2xl border border-secondary-900/10 bg-secondary-50 px-4 py-3 text-sm leading-6 text-secondary-700" role="status">
          <Lock className="mt-1 size-4 shrink-0" />
          <p><strong>Mode baca saja.</strong> Peserta sudah memulai Tryout ini; buat salinan untuk mengubah konfigurasi tanpa mengubah riwayat.</p>
        </section>
      ) : null}
      <AssessmentReleaseNotice
        label="Rilis konten Tryout"
        missingDescription="Rilis pertama dibuat saat Tryout diterbitkan dan tervalidasi server. Sesi peserta akan memakai rilis yang sama."
        release={release}
      />

      <Tabs className="mt-6" onValueChange={changeWorkspace} value={workspace}>
        <div className="overflow-x-auto pb-1">
          <TabsList aria-label="Ruang kerja Tryout" className="min-w-max rounded-2xl bg-primary-50 p-1">
            {workspaceItems.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent className="mt-5" value="basics">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><FileText /></div>
              <div>
              <h2 className="text-xl font-semibold text-secondary-900">Identitas Tryout</h2>
              <p className="mt-1 text-sm leading-6 text-secondary-600">Nama dan deskripsi ini menjadi konteks yang dilihat Kapten dan peserta.</p>
              </div>
            </div>
            <div className="grid gap-5">
              <Field>
                <FieldLabel htmlFor="tryout-title">Judul Tryout</FieldLabel>
                <FieldInput disabled={draft.locked} id="tryout-title" onChange={(event) => setDraft({ ...draft, title: event.target.value })} value={draft.title} />
              </Field>
              <Field>
                <FieldLabel htmlFor="tryout-description">Deskripsi</FieldLabel>
                <FieldTextarea className="min-h-32 px-4 py-3 text-sm leading-6" disabled={draft.locked} id="tryout-description" onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Contoh: Simulasi UTBK dengan tujuh subtest." value={draft.description} />
              </Field>
            </div>
            <footer className="flex justify-end border-t border-primary-100 pt-5">
              <Button onClick={() => goTo("sections")} variant="brand">Lanjut ke Sections <ChevronRight /></Button>
            </footer>
          </section>
        </TabsContent>

        <TabsContent className="mt-5" value="sections">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><ClipboardList /></div>
                <div>
                <h2 className="text-xl font-semibold text-secondary-900">Tujuh Section wajib</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Pilih subject untuk mengatur durasi dan instruksi. Urutan ini menjadi urutan Test peserta.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-secondary-700" role="status">
                <span className="text-primary-800">{boundCount}/7 sumber siap</span>
                <span aria-hidden="true" className="text-secondary-300">·</span>
                <span>{draft.sections.filter((section) => section.testType === "cat").length} CAT</span>
              </div>
            </header>

            <div className="grid gap-4 lg:grid-cols-[minmax(14rem,0.5fr)_minmax(0,1.5fr)]">
              <div className="grid content-start gap-2" role="list" aria-label="Daftar Section Tryout">
                {draft.sections.map((section, index) => {
                  const selected = section.subtest === activeSection.subtest;
                  return (
                    <Button
                      aria-current={selected ? "true" : undefined}
                      className={`h-auto min-h-14 justify-start gap-3 rounded-2xl border px-3 py-3 text-left ${selected ? "border-primary-300 bg-primary-50 text-primary-950" : "border-primary-100 bg-white text-secondary-800"}`}
                      key={section.subtest}
                      onClick={() => setActiveCode(section.subtest)}
                      role="listitem"
                      variant="ghost"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary-50 text-xs font-bold text-secondary-600">{String(index + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{section.subtest} · {subjectName(section.subtest)}</span>
                        <span className={`mt-0.5 block text-xs ${section.packageVersionId ? "text-primary-700" : "text-secondary-500"}`}>{section.packageVersionId ? "Sumber siap" : "Sumber belum dipilih"}</span>
                      </span>
                      {section.packageVersionId ? <Check className="size-4 shrink-0 text-primary-700" /> : <CircleAlert className="size-4 shrink-0 text-[#a46b00]" />}
                    </Button>
                  );
                })}
              </div>

              <div className="grid min-w-0 gap-5 rounded-2xl border border-primary-100 bg-[#f8fbf9] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-800">Test {String(subjectCodes.indexOf(activeSection.subtest) + 1).padStart(2, "0")}</p>
                    <h3 className="mt-1 text-lg font-semibold text-secondary-900">{activeSection.subtest} · {subjectName(activeSection.subtest)}</h3>
                  </div>
                  <Badge className="rounded-full" size="ui" variant={activeSection.packageVersionId ? "mint" : "accent"}>{activeSection.packageVersionId ? "Siap" : "Perlu sumber"}</Badge>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`duration-${activeSection.subtest}`}>Durasi</FieldLabel>
                    <div className="relative">
                      <FieldInput className="pr-16" disabled={draft.locked} id={`duration-${activeSection.subtest}`} min="1" onChange={(event) => update(activeSection.subtest, { durationMinutes: Number(event.target.value) })} type="number" value={activeSection.durationMinutes} />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-secondary-500">menit</span>
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Urutan</FieldLabel>
                    <div className="flex h-11 items-center rounded-xl border border-secondary-900/14 bg-white px-3 text-sm text-secondary-700">Test {subjectCodes.indexOf(activeSection.subtest) + 1} dari 7</div>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor={`instruction-${activeSection.subtest}`}>Instruksi peserta</FieldLabel>
                  <FieldTextarea className="min-h-32 bg-white" disabled={draft.locked} id={`instruction-${activeSection.subtest}`} onChange={(event) => update(activeSection.subtest, { instructions: event.target.value })} placeholder="Instruksi yang dibaca peserta sebelum Test dimulai." value={activeSection.instructions} />
                </Field>
                <footer className="flex flex-wrap justify-between gap-2 border-t border-primary-100 pt-4">
                  <Button disabled={subjectCodes.indexOf(activeSection.subtest) === 0} onClick={() => setActiveCode(subjectCodes[subjectCodes.indexOf(activeSection.subtest) - 1])} variant="brandOutline">Sebelumnya</Button>
                  <Button onClick={() => goTo("questions")} variant="brand">Atur Questions <ChevronRight /></Button>
                </footer>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent className="mt-5" value="questions">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-secondary-900">Sumber Questions</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Pilih sumber soal siap untuk subject aktif. Set/Pool tetap menjadi detail internal; Kapten tidak perlu membuka route Paket atau Versi.</p>
              </div>
              <Button onClick={() => goTo("sections")} variant="brandOutline">Kembali ke Sections</Button>
            </header>

            <div className="grid gap-4 rounded-2xl border border-primary-100 bg-[#f8fbf9] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-800">Subject aktif</p>
                  <h3 className="mt-1 text-lg font-semibold text-secondary-900">{activeSection.subtest} · {subjectName(activeSection.subtest)}</h3>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button className="justify-between sm:min-w-64" variant="context" />}>
                    Pindah subject
                    <ChevronDown />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-96 w-[min(28rem,calc(100vw-2rem))]">
                    <DropdownMenuLabel>Pilih Section</DropdownMenuLabel>
                    <DropdownMenuRadioGroup onValueChange={(value) => setActiveCode(value as SubjectCode)} value={activeCode}>
                      {draft.sections.map((section) => <DropdownMenuRadioItem key={section.subtest} value={section.subtest}>{section.subtest} · {subjectName(section.subtest)}</DropdownMenuRadioItem>)}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Field>
                <FieldLabel>Sumber soal siap</FieldLabel>
                <Popover>
                  <PopoverTrigger disabled={draft.locked} render={<Button aria-haspopup="listbox" className="w-full justify-between bg-white" variant="context" />}>
                    {activeSection.packageVersionLabel ?? readyVersions.find((version) => version.id === activeSection.packageVersionId)?.label ?? "Cari sumber soal"}
                    <ChevronDown />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] gap-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
                      <FieldInput aria-label="Cari sumber soal siap" className="h-10 rounded-xl py-2 pl-9 pr-3 text-sm" onChange={(event) => setPackageSearch(event.target.value)} placeholder="Cari nama sumber soal…" value={packageSearch} />
                    </div>
                    <div aria-label="Sumber soal kompatibel" className="grid max-h-64 gap-1 overflow-y-auto" role="listbox">
                      {activeReadyVersions.length ? activeReadyVersions.map((version) => (
                        <Button aria-selected={activeSection.packageVersionId === version.id} className="h-auto justify-start rounded-xl px-3 py-2.5 text-left hover:bg-primary-50" key={version.id} onClick={() => { update(activeSection.subtest, { packageVersionId: version.id, packageVersionLabel: version.label }); setPackageSearch(""); }} role="option" variant={activeSection.packageVersionId === version.id ? "contextSelected" : "ghost"}>
                          {version.label}
                          {activeSection.packageVersionId === version.id ? <Check className="ml-auto" /> : null}
                        </Button>
                      )) : (
                        <div className="grid gap-3 px-3 py-5 text-sm leading-6 text-secondary-500">
                          <p>{readyVersions.some((version) => version.subtest === activeSection.subtest) ? "Tidak ada sumber yang cocok dengan pencarian." : `Belum ada sumber soal ${activeSection.subtest} yang siap.`}</p>
                          {!readyVersions.some((version) => version.subtest === activeSection.subtest) ? <Button className="w-fit" nativeButton={false} render={<Link href="/mentor/quiz/question-bank" />} size="sm" variant="brand">Buka Bank Soal</Button> : null}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </Field>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-primary-100 bg-white p-4"><p className="text-xs text-secondary-500">Sumber</p><p className="mt-1 font-semibold text-secondary-900">{activeSection.packageVersionId ? "Terpilih" : "Belum dipilih"}</p></div>
                <div className="rounded-2xl border border-primary-100 bg-white p-4"><p className="text-xs text-secondary-500">Kesesuaian</p><p className="mt-1 font-semibold text-secondary-900">{activeSection.packageVersionId ? `${activeSection.subtest} cocok` : "Menunggu sumber"}</p></div>
                <div className="rounded-2xl border border-primary-100 bg-white p-4"><p className="text-xs text-secondary-500">Snapshot</p><p className="mt-1 font-semibold text-secondary-900">{activeSection.packageVersionId ? "Dibuat saat simpan" : "Belum dibuat"}</p></div>
              </div>
            </div>
            <footer className="flex justify-end border-t border-primary-100 pt-5"><Button onClick={() => goTo("rules")} variant="brand">Atur Rules <ChevronRight /></Button></footer>
          </section>
        </TabsContent>

        <TabsContent className="mt-5" value="rules">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <header>
              <h2 className="text-xl font-semibold text-secondary-900">Rules per Section</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Atur mode CBT/CAT, timer, dan urutan soal. Validasi CAT dan kalibrasi 2PL tetap dipastikan server saat publish.</p>
            </header>
            <div className="grid gap-4 lg:grid-cols-2">
              {draft.sections.map((section, index) => (
                <Card className={`shadow-none ring-primary-100 ${section.subtest === activeSection.subtest ? "ring-2 ring-primary-300" : ""}`} key={section.subtest}>
                  <CardHeader>
                    <CardTitle className="font-semibold">Test {index + 1} · {section.subtest}</CardTitle>
                    <CardDescription>{subjectName(section.subtest)} · {section.durationMinutes} menit</CardDescription>
                    <CardAction><Badge className="rounded-full" size="ui" variant={section.testType === "cat" ? "accent" : "mint"}>{section.testType.toUpperCase()}</Badge></CardAction>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid grid-cols-2 rounded-2xl border border-secondary-900/14 bg-white p-1" role="radiogroup" aria-label={`Mode Test ${section.subtest}`}>
                      <Button aria-checked={section.testType === "cbt"} className={`rounded-xl ${section.testType === "cbt" ? "bg-[#d7f2d8] text-[#14563e] hover:bg-[#c8ebca]" : "text-secondary-500"}`} disabled={draft.locked} onClick={() => update(section.subtest, { testType: "cbt" })} role="radio" variant="ghost">CBT</Button>
                      <Button aria-checked={section.testType === "cat"} className={`rounded-xl ${section.testType === "cat" ? "bg-[#d7f2d8] text-[#14563e] hover:bg-[#c8ebca]" : "text-secondary-500"}`} disabled={draft.locked} onClick={() => update(section.subtest, { testType: "cat" })} role="radio" variant="ghost">CAT</Button>
                    </div>
                    {section.testType === "cat" ? <Field><div className="flex items-center gap-1"><FieldLabel htmlFor={`cat-count-${section.subtest}`}>Jumlah soal CAT</FieldLabel><TooltipProvider><Tooltip><TooltipTrigger render={<Button aria-label={`Bantuan jumlah soal CAT ${section.subtest}`} size="icon-xs" variant="ghost" />}><CircleHelp /></TooltipTrigger><TooltipContent>Jumlah soal CAT harus tersedia pada sumber dan memiliki kalibrasi 2PL siap.</TooltipContent></Tooltip></TooltipProvider></div><FieldInput disabled={draft.locked} id={`cat-count-${section.subtest}`} min="1" onChange={(event) => update(section.subtest, { catItemCount: Number(event.target.value) })} type="number" value={section.catItemCount ?? ""} /></Field> : null}
                    <div className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-primary-100 bg-[#f8fbf9] px-4 py-3"><p className="text-sm font-semibold text-secondary-900">Acak urutan soal</p><Switch aria-label={`Acak urutan soal ${section.subtest}`} checked={section.shuffleItems} disabled={draft.locked} onCheckedChange={(checked) => update(section.subtest, { shuffleItems: checked })} /></div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <footer className="flex justify-end border-t border-primary-100 pt-5"><Button onClick={() => goTo("schedule")} variant="brand">Atur Schedule &amp; akses <ChevronRight /></Button></footer>
          </section>
        </TabsContent>

        <TabsContent className="mt-5" value="schedule">
          {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save()} /> : (
            <div className="grid gap-8">
              <section aria-labelledby="schedule-policy-title">
                <div className="mb-4 flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><SlidersHorizontal /></div><div><h2 id="schedule-policy-title" className="text-xl font-semibold text-secondary-900">Schedule &amp; akses</h2><p className="mt-1 text-sm leading-6 text-secondary-600">Atur cara peserta masuk, kebijakan hasil, sesi delivery, dan ParticipantView dari satu tempat.</p></div></div>
                <KaptenTryoutPolicyPageModule embedded initial={operationsInitial} />
              </section>
              <section aria-labelledby="schedule-sessions-title">
                <div className="mb-4 flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><CalendarDays /></div><div><h2 id="schedule-sessions-title" className="text-xl font-semibold text-secondary-900">Sesi delivery</h2><p className="mt-1 text-sm leading-6 text-secondary-600">Setiap sesi peserta akan mengikat satu AssessmentRelease saat dibuka.</p></div></div>
                <KaptenTryoutSessionsPageModule embedded initial={operationsInitial} />
              </section>
              <section aria-labelledby="schedule-participants-title">
                <div className="mb-4 flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><Users /></div><div><h2 id="schedule-participants-title" className="text-xl font-semibold text-secondary-900">Peserta</h2><p className="mt-1 text-sm leading-6 text-secondary-600">Lihat satu status peserta yang menggabungkan admission, sesi, attempt, dan nilai.</p></div></div>
                <KaptenTryoutParticipantsPageModule embedded initial={operationsInitial} />
              </section>
            </div>
          )}
        </TabsContent>

        <TabsContent className="mt-5" value="results">
          {!id || !operationsInitial ? <WorkspaceUnavailable onSaveDraft={() => void save()} /> : (
            <section className="grid gap-6">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><BarChart3 /></div>
                  <div>
                  <h2 className="text-xl font-semibold text-secondary-900">Results</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Pantau attempt, skor, dan status rilis tanpa berpindah ke model runtime internal.</p>
                  </div>
                </div>
                <Badge className="rounded-full" size="ui" variant="mint">{operationsInitial.sessions.reduce((total, delivery) => total + delivery.attempts.length, 0)} attempt</Badge>
              </header>
              <AssessmentReleaseNotice label="Rilis hasil Tryout" release={release} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Sesi</p><p className="mt-1 text-2xl font-semibold text-secondary-900">{operationsInitial.sessions.length}</p></CardContent></Card>
                <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Peserta</p><p className="mt-1 text-2xl font-semibold text-secondary-900">{operationsInitial.participants.length}</p></CardContent></Card>
                <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Sesi dirilis</p><p className="mt-1 text-2xl font-semibold text-secondary-900">{operationsInitial.sessions.filter((delivery) => delivery.releasedAt).length}</p></CardContent></Card>
              </div>
              <div className="grid gap-3">
                {operationsInitial.sessions.length ? operationsInitial.sessions.map((delivery) => (
                  <Card className="shadow-none ring-primary-100" key={delivery.id}>
                    <CardHeader>
                      <CardTitle className="font-semibold">{delivery.name}</CardTitle>
                      <CardDescription>{new Date(delivery.availableFrom).toLocaleString("id-ID")} — {new Date(delivery.availableUntil).toLocaleString("id-ID")}</CardDescription>
                      <CardAction className="flex items-center gap-2"><StatusBadge status={delivery.status} /><span className="text-sm text-secondary-600">{delivery.releasedAt ? "Hasil dirilis" : "Belum dirilis"}</span></CardAction>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-600"><span><strong className="font-medium text-secondary-800">Peringkat:</strong> {rankingLabels[delivery.rankingRule as keyof typeof rankingLabels] ?? "Belum diatur"}</span><span><strong className="font-medium text-secondary-800">Kebijakan:</strong> {resultPolicyLabel(delivery.releasePolicy, operationsInitial.defaultReleasePolicy as Policy)}</span></div>
                      {delivery.attempts.length ? <div className="grid gap-2 border-t border-primary-100 pt-3">{delivery.attempts.slice(0, 5).map((attempt) => <Link className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-100 px-3 py-2.5 text-sm hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" href={`/mentor/tryout/${operationsInitial.id}/operations/attempts/${attempt.id}`} key={attempt.id}><span className="font-medium text-secondary-900">{attempt.student}</span><span className="text-secondary-600">{attempt.score !== null ? `Indeks ${Number(attempt.score).toFixed(2)}` : "Belum dihitung"} · {attempt.runs.filter((run) => run.status === "sealed").length}/7 Test</span></Link>)}</div> : <p className="border-t border-primary-100 pt-3 text-sm text-secondary-500">Belum ada attempt pada sesi ini.</p>}
                      <div><Button nativeButton={false} render={<Link href={`/mentor/tryout/${operationsInitial.id}/operations/sessions/${delivery.id}`} />} size="sm" variant="ghost">Buka detail sesi <ChevronRight /></Button></div>
                    </CardContent>
                  </Card>
                )) : <div className="rounded-3xl border border-dashed border-primary-200 bg-white px-5 py-12 text-center text-sm text-secondary-500">Belum ada sesi delivery untuk menampilkan hasil.</div>}
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent className="mt-5" value="review">
          <section className="grid gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-secondary-900">Review sebelum publish</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Periksa isi dan kesiapan workspace. Membuka Review tidak membuat attempt atau mengubah state peserta.</p>
              </div>
              <Button onClick={() => setPreviewOpen(true)} variant="brandOutline"><Eye />Pratinjau peserta</Button>
            </header>
            <div className="grid gap-3">
              {reviewChecks.map((check) => (
                <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${check.status ? "border-primary-100 bg-white" : "border-[#f3d486] bg-[#fff7e5]"}`} key={check.label} role="status">
                  {check.status ? <Check className="mt-1 size-5 shrink-0 text-primary-700" /> : <CircleAlert className="mt-1 size-5 shrink-0 text-[#a46b00]" />}
                  <div><p className="font-semibold text-secondary-900">{check.label}</p><p className="mt-0.5 text-sm leading-6 text-secondary-600">{check.detail}</p></div>
                </div>
              ))}
            </div>
            <section className="grid gap-4 rounded-3xl border border-primary-100 bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3"><ListChecks className="mt-1 size-5 text-primary-800" /><div><h3 className="font-semibold text-secondary-900">Server checks tetap berlaku</h3><p className="mt-1 text-sm leading-6 text-secondary-600">Saat publish, server memeriksa sumber Ready, opsi, duplicate question, kesiapan CAT 2PL, dan snapshot AssessmentRelease. Checklist ini membantu navigasi; bukan pengganti validasi otoritatif.</p></div></div>
              {incompleteSections.length ? <div className="flex flex-wrap gap-2 border-t border-primary-100 pt-4">{incompleteSections.map((section) => <Button className="h-8 rounded-lg border-[#d4a943] bg-white/70 px-2.5 text-xs text-[#6a4a00] hover:bg-white" key={section.subtest} onClick={() => { setActiveCode(section.subtest); goTo("questions"); }} variant="outline">Lengkapi {section.subtest}</Button>)}</div> : null}
            </section>
            <footer className="flex justify-end"><Button disabled={!readyToPublish} onClick={() => goTo("publish")} variant="brand">Lanjut ke Publish <ChevronRight /></Button></footer>
          </section>
        </TabsContent>

        <TabsContent className="mt-5" value="publish">
          <section className="grid gap-6 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-secondary-900">Publish Tryout</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Simpan draft dan publish adalah dua tindakan berbeda. Publish membuat atau memajukan identitas AssessmentRelease yang dipakai sesi peserta.</p>
              </div>
              <Upload className="size-6 text-primary-800" />
            </header>
            <AssessmentReleaseNotice label="AssessmentRelease" missingDescription="Belum ada rilis. Publish akan membuat rilis pertama setelah semua server checks berhasil." release={release} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Kesiapan sumber</p><p className="mt-1 text-lg font-semibold text-secondary-900">{boundCount}/7 Section siap</p><p className="mt-1 text-sm leading-6 text-secondary-600">Semua sumber akan disalin sebagai snapshot immutable.</p></CardContent></Card>
              <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Perlindungan riwayat</p><p className="mt-1 text-lg font-semibold text-secondary-900">{draft.locked ? "Terkunci" : "Siap diperbarui"}</p><p className="mt-1 text-sm leading-6 text-secondary-600">Setelah participant start, perubahan fairness-sensitive memakai Duplikasi.</p></CardContent></Card>
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-[#f8fbf9] p-4 text-sm leading-6 text-secondary-700 sm:flex-row sm:items-start"><CircleHelp className="mt-1 size-4 shrink-0 text-primary-800" /><p>{release ? "Publish ulang hanya membuat rilis baru bila isi Tryout berubah. Sesi yang sudah terbuka tetap terikat pada rilis sebelumnya." : "Sesi peserta belum boleh dibuka sebelum memiliki AssessmentRelease. Setelah publish, buka sesi dari Schedule & akses."}</p></div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-primary-100 pt-5">
              {!draft.locked ? <Button disabled={saving} onClick={() => void save()} variant="brandOutline"><Save />{saving ? "Menyimpan…" : "Simpan draft"}</Button> : null}
              {!draft.locked ? <Button disabled={saving || !readyToPublish} onClick={() => setPublishOpen(true)} variant="brand"><Upload />{draft.status === "published" ? "Terbitkan pembaruan" : "Terbitkan Tryout"}</Button> : <Button disabled={saving} onClick={() => setDuplicateOpen(true)} variant="brand"><Copy />Buat salinan editable</Button>}
            </footer>
            {!readyToPublish && !draft.locked ? <p className="text-right text-sm text-[#8a5e00]">Lengkapi Review terlebih dahulu: {7 - boundCount} Section belum memiliki sumber soal.</p> : null}
          </section>
        </TabsContent>
      </Tabs>

      <Dialog onOpenChange={setPreviewOpen} open={previewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pratinjau peserta</DialogTitle>
            <DialogDescription>Pratinjau ini hanya membaca draft saat ini. Tidak ada attempt, admission, atau sesi yang dibuat.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5">
            <div className="rounded-2xl bg-primary-50 p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-800">Tryout</p><h3 className="mt-1 text-2xl font-semibold text-secondary-900">{draft.title || "Tryout tanpa judul"}</h3>{draft.description ? <p className="mt-2 text-sm leading-6 text-secondary-700">{draft.description}</p> : <p className="mt-2 text-sm text-secondary-500">Belum ada deskripsi.</p>}</div>
            <div className="grid gap-2"><h4 className="font-semibold text-secondary-900">Urutan Test</h4>{draft.sections.map((section, index) => <div className="flex items-center justify-between gap-3 rounded-xl border border-primary-100 px-3 py-2.5 text-sm" key={section.subtest}><span className="font-medium text-secondary-900">{index + 1}. {section.subtest} · {subjectName(section.subtest)}</span><span className="text-secondary-600">{section.durationMinutes} menit · {section.packageVersionId ? "Sumber siap" : "Belum siap"}</span></div>)}</div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={(open) => { if (!saving) setPublishOpen(open); }} open={publishOpen}>
        <AlertDialogContent className="rounded-5xl" pending={saving} variant="warning">
          <AlertDialogHeader><AlertDialogTitle>Terbitkan Tryout?</AlertDialogTitle><AlertDialogDescription>Server akan memvalidasi tujuh Section, sumber Ready, snapshot, dan kesiapan CAT sebelum membuat AssessmentRelease. Publish terpisah dari simpan draft.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => { setPublishOpen(false); void save("published"); }} variant="brand"><Upload />{saving ? "Menerbitkan…" : "Terbitkan Tryout"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={(open) => { if (!saving) setDuplicateOpen(open); }} open={duplicateOpen}>
        <AlertDialogContent className="rounded-5xl" pending={saving} variant="info">
          <AlertDialogHeader><AlertDialogTitle>Duplikasi Tryout?</AlertDialogTitle><AlertDialogDescription>Salinan akan dibuat sebagai draf yang dapat diedit. Riwayat peserta dan AssessmentRelease Tryout ini tetap tidak berubah.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => { setDuplicateOpen(false); void duplicate(); }} variant="brand"><Copy />{saving ? "Menyalin…" : "Buat salinan"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

export { KaptenTryoutBuilderPageModule };

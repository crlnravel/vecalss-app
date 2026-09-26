"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";

import {
  ArrowUpRight,
  ChevronDown,
  FilePenLine,
  Plus,
  Search,
  Video,
} from "@/lib/icons";
import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSectionHeading,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { Switch } from "@/components/ui/switch";
import { showToast } from "@/components/ui/toast";
import type { SessionContext } from "@/lib/auth/types";
import {
  isYouTubeVideoUrl,
  VIDEO_DESCRIPTION_MAX_LENGTH,
  VIDEO_TITLE_MAX_LENGTH,
  type SaveKaptenVideoInput,
} from "@/lib/video/contract";
import { cn } from "@/lib/utils";
import {
  saveKaptenVideoAction,
  updateKaptenVideoPublicationAction,
  updateKaptenVideoVisibilityAction,
} from "@/modules/mentor/video-actions";
import {
  videoFilters,
  type VideoGalleryItem,
  type VideoSubtest,
} from "@/modules/video/video-gallery-data";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

type VideoDraft = Pick<
  VideoGalleryItem,
  "description" | "isVisibleToStudents" | "status" | "subtest" | "title" | "youtubeUrl"
>;
type VideoDraftTextField = "description" | "subtest" | "title" | "youtubeUrl";

const emptyVideoDraft: VideoDraft = {
  description: "",
  isVisibleToStudents: false,
  status: "draft",
  subtest: "PK",
  title: "",
  youtubeUrl: "",
};

const thumbnailToneClasses = {
  forest: "bg-voyage-forest",
  deep: "bg-voyage-deep",
  leaf: "bg-voyage-leaf",
} as const;

function VideoPreview({ video }: { video: VideoGalleryItem }) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full shrink-0 overflow-hidden rounded-3xl text-white sm:w-56",
        thumbnailToneClasses[video.thumbnailTone],
      )}
    >
      <div aria-hidden="true" className="absolute -right-10 -top-14 size-44 rounded-full border-[18px] border-voyage-sea-glass/20" />
      <div aria-hidden="true" className="absolute -bottom-14 -left-8 size-44 rounded-full bg-voyage-deep/45 blur-2xl" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-secondary-950/25" />
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-xl border border-white/15 bg-secondary-950/45 px-2 py-1 text-ui-xs font-bold tracking-[0.1em] text-white uppercase backdrop-blur-sm">
            {video.subtest}
          </span>
          {video.duration ? (
            <span className="rounded-lg bg-secondary-950/75 px-2 py-1 text-xs font-bold tabular-nums text-white">
              {video.duration}
            </span>
          ) : null}
        </div>
        <p className="relative z-10 max-w-[15ch] whitespace-pre-line font-display text-xl leading-[0.95] font-extrabold tracking-[-0.04em] text-white">
          {video.thumbnailTitle}
        </p>
      </div>
    </div>
  );
}

function KaptenVideoCard({
  isPending,
  onEdit,
  onPublicationChange,
  onVisibilityChange,
  video,
}: {
  isPending: boolean;
  onEdit: (video: VideoGalleryItem) => void;
  onPublicationChange: (video: VideoGalleryItem, status: VideoGalleryItem["status"]) => void;
  onVisibilityChange: (video: VideoGalleryItem, isVisibleToStudents: boolean) => void;
  video: VideoGalleryItem;
}) {
  return (
    <article className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "p-4 sm:p-5")}>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row">
        <VideoPreview video={video} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <MentorBadge size="sm" tone="category">
              {video.subtest}
            </MentorBadge>
            <MentorBadge size="sm" tone={video.status === "published" ? "success" : "attention"}>
              {video.status === "published" ? "Terbit" : "Draf"}
            </MentorBadge>
            <MentorBadge size="sm" tone={video.isVisibleToStudents ? "active" : "neutral"}>
              {video.isVisibleToStudents ? "Tampil ke siswa" : "Disembunyikan"}
            </MentorBadge>
            <span className="text-xs font-medium text-secondary-500">{video.subject}</span>
          </div>
          <h3 className="mt-3 text-lg leading-tight font-semibold tracking-[-0.02em] text-secondary-900">
            {video.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-secondary-600">
            {video.description}
          </p>
          <p className="mt-3 truncate text-xs text-secondary-400" title={video.youtubeUrl}>
            {video.youtubeUrl}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-secondary-900">Terbitkan video</p>
                <p className="mt-0.5 text-xs text-secondary-500">
                  {video.status === "published" ? "Video sudah terbit." : "Video masih berupa draf."}
                </p>
              </div>
              <Switch
              aria-label={`Terbitkan ${video.title}`}
              checked={video.status === "published"}
              disabled={isPending}
              onCheckedChange={(published) =>
                  onPublicationChange(video, published ? "published" : "draft")
                }
              />
            </div>
            <div className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-secondary-900">Tampilkan ke siswa</p>
                <p className="mt-0.5 text-xs text-secondary-500">
                  {video.isVisibleToStudents
                    ? "Muncul di galeri siswa jika sudah terbit."
                    : "Tidak muncul di galeri siswa."}
                </p>
              </div>
              <Switch
              aria-label={`Tampilkan ${video.title} kepada siswa`}
              checked={video.isVisibleToStudents}
              disabled={isPending}
              onCheckedChange={(visible) => onVisibilityChange(video, visible)}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-auto sm:pt-4">
            <Button disabled={isPending} onClick={() => onEdit(video)} size="sm" type="button" variant="reference">
              <FilePenLine aria-hidden="true" />
              Edit video
            </Button>
            <Button
              nativeButton={false}
              render={<a href={video.youtubeUrl} rel="noreferrer" target="_blank" />}
              size="sm"
              variant="ghost"
            >
              <ArrowUpRight aria-hidden="true" />
              Lihat di YouTube
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function VideoEditorDialog({
  draft,
  error,
  isPending,
  isPublished,
  isEditing,
  onChange,
  onStatusChange,
  onVisibilityChange,
  onOpenChange,
  onSubmit,
  open,
}: {
  draft: VideoDraft;
  error: string | null;
  isPending: boolean;
  isPublished: boolean;
  isEditing: boolean;
  onChange: (field: VideoDraftTextField, value: string) => void;
  onStatusChange: (status: VideoGalleryItem["status"]) => void;
  onVisibilityChange: (isVisibleToStudents: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit video" : "Tambah video"}</DialogTitle>
          <DialogDescription>
            Isi informasi video, lalu tentukan apakah video diterbitkan dan ditampilkan kepada siswa.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-5" onSubmit={onSubmit}>
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-video-title" required>
              Judul video
            </FieldLabel>
            <FieldInput
              aria-describedby={error ? "kapten-video-form-error" : undefined}
              aria-invalid={Boolean(error?.includes("judul"))}
              className={REFERENCE_CONTROL_CLASS_NAMES.input}
              disabled={isPending}
              id="kapten-video-title"
              maxLength={VIDEO_TITLE_MAX_LENGTH}
              onChange={(event) => onChange("title", event.target.value)}
              placeholder="Contoh: Strategi Cepat Menjawab Soal PU"
              required
              value={draft.title}
            />
          </Field>

          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-video-url" required>
              Tautan YouTube
            </FieldLabel>
            <FieldInput
              aria-describedby={error ? "kapten-video-form-error" : undefined}
              aria-invalid={Boolean(error?.includes("YouTube"))}
              className={REFERENCE_CONTROL_CLASS_NAMES.input}
              disabled={isPending}
              id="kapten-video-url"
              onChange={(event) => onChange("youtubeUrl", event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
              type="url"
              value={draft.youtubeUrl}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-video-subtest" required>
                Subtes
              </FieldLabel>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Pilih subtes video"
                  className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "w-full")}
                  disabled={isPending}
                  id="kapten-video-subtest"
                  render={<Button type="button" variant="reference" />}
                >
                  <span>{draft.subtest}</span>
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-secondary-500" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-(--anchor-width)">
                  <DropdownMenuRadioGroup
                    onValueChange={(value) => onChange("subtest", value)}
                    value={draft.subtest}
                  >
                    {videoFilters.slice(1).map((subtest) => (
                      <DropdownMenuRadioItem key={subtest} value={subtest}>
                        {subtest}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </Field>

          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field className="min-h-20 flex-row items-center justify-between gap-4 rounded-2xl border border-primary-100 bg-white px-4 py-3">
              <div className="min-w-0">
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-video-published">
                  Terbitkan video
                </FieldLabel>
                <p className="mt-1 text-xs leading-5 text-secondary-500">
                  Video draf belum tampil kepada siswa.
                </p>
              </div>
              <Switch
                aria-label="Terbitkan video"
                checked={draft.status === "published"}
                disabled={isPending}
                id="kapten-video-published"
                onCheckedChange={(published) => onStatusChange(published ? "published" : "draft")}
              />
            </Field>

            <Field className="min-h-20 flex-row items-center justify-between gap-4 rounded-2xl border border-primary-100 bg-white px-4 py-3">
              <div className="min-w-0">
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-video-visible">
                  Tampilkan di galeri siswa
                </FieldLabel>
                <p className="mt-1 text-xs leading-5 text-secondary-500">
                  Siswa melihat video jika sudah terbit dan ditampilkan.
                </p>
              </div>
              <Switch
                aria-label="Tampilkan video di galeri siswa"
                checked={draft.isVisibleToStudents}
                disabled={isPending}
                id="kapten-video-visible"
                onCheckedChange={onVisibilityChange}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-video-description">
              Deskripsi singkat
            </FieldLabel>
            <FieldTextarea
              className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "min-h-28 resize-y")}
              disabled={isPending}
              id="kapten-video-description"
              maxLength={VIDEO_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => onChange("description", event.target.value)}
              placeholder="Jelaskan isi video secara singkat untuk membantu siswa memilih materi."
              value={draft.description}
            />
          </Field>

          {error ? (
            <FieldError error={error} id="kapten-video-form-error" />
          ) : null}

          <DialogFooter className="border-t border-primary-100 pt-4">
            <DialogClose render={<Button disabled={isPending} type="button" variant="brandOutline" />}>
              Batal
            </DialogClose>
            <Button disabled={isPending} type="submit" variant="brand">
              {isPending ? "Menyimpan…" : draft.status === "published" && !isPublished
                ? "Terbitkan video"
                : draft.status === "draft" && isPublished
                  ? "Jadikan draf"
                  : isEditing
                    ? "Simpan perubahan"
                    : "Simpan draf"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KaptenVideoGalleryPageModule({
  session,
  videos: initialVideos,
}: {
  session: SessionContext;
  videos: VideoGalleryItem[];
}) {
  const [activeSubtest, setActiveSubtest] = useState<(typeof videoFilters)[number]>("Semua");
  const [draft, setDraft] = useState<VideoDraft>(emptyVideoDraft);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<VideoGalleryItem[]>(initialVideos);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");

    return videos.filter((video) => {
      if (activeSubtest !== "Semua" && video.subtest !== activeSubtest) return false;
      if (!normalizedQuery) return true;
      return [video.title, video.description, video.subject, ...video.tags]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .includes(normalizedQuery);
    });
  }, [activeSubtest, query, videos]);

  const editingVideo = editingVideoId
    ? videos.find((video) => video.id === editingVideoId)
    : undefined;

  function closeEditor() {
    setIsEditorOpen(false);
    setEditingVideoId(null);
    setFormError(null);
    setDraft(emptyVideoDraft);
  }

  function openCreate() {
    setEditingVideoId(null);
    setFormError(null);
    setDraft(emptyVideoDraft);
    setIsEditorOpen(true);
  }

  function openEdit(video: VideoGalleryItem) {
    setEditingVideoId(video.id);
    setFormError(null);
    setDraft({
      description: video.description,
      isVisibleToStudents: video.isVisibleToStudents,
      status: video.status,
      subtest: video.subtest,
      title: video.title,
      youtubeUrl: video.youtubeUrl,
    });
    setIsEditorOpen(true);
  }

  function updateDraft(field: VideoDraftTextField, value: string) {
    setDraft((current) => ({
      ...current,
      [field]: field === "subtest" ? (value as VideoSubtest) : value,
    }));
  }

  function updatePublication(video: VideoGalleryItem, status: VideoGalleryItem["status"]) {
    startTransition(async () => {
      const result = await updateKaptenVideoPublicationAction(video.id, status);
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }

      setVideos((current) => current.map((item) => item.id === video.id ? result.video : item));
      showToast(result.message, { variant: "success" });
    });
  }

  function updateVisibility(video: VideoGalleryItem, isVisibleToStudents: boolean) {
    startTransition(async () => {
      const result = await updateKaptenVideoVisibilityAction(video.id, isVisibleToStudents);
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }

      setVideos((current) => current.map((item) => item.id === video.id ? result.video : item));
      showToast(result.message, { variant: "success" });
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    const youtubeUrl = draft.youtubeUrl.trim();

    if (!title) {
      setFormError("Masukkan judul video terlebih dahulu.");
      return;
    }
    if (!isYouTubeVideoUrl(youtubeUrl)) {
      setFormError("Masukkan tautan YouTube yang mengarah langsung ke video.");
      return;
    }

    const input: SaveKaptenVideoInput = {
      ...(editingVideo ? { id: editingVideo.id } : {}),
      description: draft.description,
      isVisibleToStudents: draft.isVisibleToStudents,
      status: draft.status,
      subtest: draft.subtest,
      title,
      youtubeUrl,
    };

    startTransition(async () => {
      const result = await saveKaptenVideoAction(input);
      if (!result.ok) {
        setFormError(
          result.fieldErrors?.title
          ?? result.fieldErrors?.youtubeUrl
          ?? result.fieldErrors?.subtest
          ?? result.fieldErrors?.description
          ?? result.message,
        );
        return;
      }

      setVideos((current) => {
        const exists = current.some((video) => video.id === result.video.id);
        return exists
          ? current.map((video) => video.id === result.video.id ? result.video : video)
          : [result.video, ...current];
      });
      closeEditor();
      showToast(result.message, { variant: "success" });
    });
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Video"
      breadcrumbLabel="Video"
      searchPlaceholder="Cari video..."
      session={session}
      sidebarAppearance="reference"
    >
      <div className="space-y-8">
        <ReferencePageHeader
          actions={
            <Button disabled={isPending} onClick={openCreate} type="button" variant="brand">
              <Plus aria-hidden="true" />
              Tambah video
            </Button>
          }
          description="Tambahkan dan rapikan video YouTube yang ingin dibagikan kepada siswa."
          title="Video"
          titleClassName="font-display text-4xl font-extrabold tracking-[-0.04em] text-voyage-ink text-balance md:text-5xl"
        />

        <ReferenceSurface as="aside" className="flex items-start gap-3 p-4 md:p-5" variant="inset">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-voyage-sea-glass-wash text-voyage-deep">
            <Video aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-secondary-900">Kontrol publikasi</p>
            <p className="mt-1 text-sm leading-6 text-secondary-600">
              Penerbitan dan tampilan diatur terpisah. Siswa melihat video jika keduanya aktif.
            </p>
          </div>
        </ReferenceSurface>

        <section aria-labelledby="kapten-video-list-title" className="grid gap-5">
          <ReferenceSectionHeading
            description="Pilih subtes untuk melihat koleksi yang ingin kamu rapikan."
            id="kapten-video-list-title"
            title="Koleksi video"
          />

          <div className="grid gap-3">
            <div className="relative min-w-0 md:max-w-[30rem]">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-500" />
              <input
                aria-label="Cari video Kapten"
                className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "pl-11")}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari judul atau topik..."
                type="search"
                value={query}
              />
            </div>
            <div aria-label="Filter subtes video Kapten" className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist">
              {videoFilters.map((filter) => {
                const isActive = activeSubtest === filter;

                return (
                  <button
                    aria-selected={isActive}
                    className={cn(
                      "min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-200 motion-reduce:transition-none",
                      "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40",
                      isActive
                        ? "border-voyage-deep bg-voyage-deep text-white shadow-[0_8px_18px_-14px_color-mix(in_oklab,var(--voyage-deep)_80%,transparent)]"
                        : "border-primary-100 bg-white text-secondary-600 hover:border-primary-200 hover:bg-primary-50 hover:text-secondary-900",
                    )}
                    key={filter}
                    onClick={() => setActiveSubtest(filter)}
                    role="tab"
                    type="button"
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredVideos.length ? (
            <div className="grid gap-4" id="kapten-video-list">
              {filteredVideos.map((video) => (
                <KaptenVideoCard
                  isPending={isPending}
                  key={video.id}
                  onEdit={openEdit}
                  onPublicationChange={updatePublication}
                  onVisibilityChange={updateVisibility}
                  video={video}
                />
              ))}
            </div>
          ) : (
            <ReferenceSurface className="border-learning-card-border" variant="raised">
              <ReferenceEmptyState
                action={<Button disabled={isPending} onClick={openCreate} size="sm" variant="brand">Tambah video</Button>}
                description={videos.length > 0
                  ? "Coba kata kunci lain atau pilih Semua untuk melihat koleksi yang tersedia."
                  : "Tambahkan tautan YouTube pertama untuk koleksi video siswa."}
                icon={Video}
                title={videos.length > 0 ? "Video tidak ditemukan" : "Belum ada video"}
              />
            </ReferenceSurface>
          )}
        </section>
      </div>

      <VideoEditorDialog
        draft={draft}
        error={formError}
        isPending={isPending}
        isEditing={Boolean(editingVideo)}
        isPublished={editingVideo?.status === "published"}
        onChange={updateDraft}
        onStatusChange={(status) => setDraft((current) => ({ ...current, status }))}
        onVisibilityChange={(isVisibleToStudents) =>
          setDraft((current) => ({ ...current, isVisibleToStudents }))
        }
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        onSubmit={handleSubmit}
        open={isEditorOpen}
      />
    </MentorWorkspaceShell>
  );
}

export { KaptenVideoGalleryPageModule };

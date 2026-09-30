"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";

import {
  Archive,
  ArrowUpRight,
  ChevronDown,
  FilePenLine,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Video,
} from "@/lib/icons";
import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import {
  Field,
  FieldError,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { SunkenTabButton } from "@/components/ui/sunken-tabs";
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
  deleteKaptenVideoAction,
  saveKaptenVideoAction,
  setKaptenVideoArchivedAction,
} from "@/modules/mentor/video-actions";
import {
  videoFilters,
  type VideoGalleryItem,
  type VideoSubtest,
} from "@/modules/video/video-gallery-data";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

type VideoDraft = Pick<
  VideoGalleryItem,
  "description" | "subtest" | "title" | "youtubeUrl"
>;
type VideoDraftTextField = "description" | "subtest" | "title" | "youtubeUrl";

const emptyVideoDraft: VideoDraft = {
  description: "",
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
      <div
        aria-hidden="true"
        className="absolute -right-10 -top-14 size-44 rounded-full border-[18px] border-voyage-sea-glass/20"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-14 -left-8 size-44 rounded-full bg-voyage-deep/45 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1/2 bg-secondary-950/25"
      />
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
  onArchive,
  onDelete,
  onEdit,
  video,
}: {
  isPending: boolean;
  onArchive: (video: VideoGalleryItem, archived: boolean) => void;
  onDelete: (video: VideoGalleryItem) => void;
  onEdit: (video: VideoGalleryItem) => void;
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
            <span className="text-xs font-medium text-secondary-500">
              {video.subject}
            </span>
          </div>
          <h3 className="mt-3 text-lg leading-tight font-semibold tracking-[-0.02em] text-secondary-900">
            {video.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-secondary-600">
            {video.description}
          </p>
          <p
            className="mt-3 truncate text-xs text-secondary-400"
            title={video.youtubeUrl}
          >
            {video.youtubeUrl}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-auto sm:pt-4">
            <Button
              disabled={isPending}
              onClick={() => onEdit(video)}
              size="sm"
              type="button"
              variant="reference"
            >
              <FilePenLine aria-hidden="true" />
              Edit video
            </Button>
            <Button
              nativeButton={false}
              render={
                <a aria-label="Lihat di YouTube" href={video.youtubeUrl} rel="noreferrer" target="_blank" />
              }
              size="sm"
              variant="ghost"
            >
              <ArrowUpRight aria-hidden="true" />
              Lihat di YouTube
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onArchive(video, !video.isArchived)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {video.isArchived ? (
                <RotateCcw aria-hidden="true" />
              ) : (
                <Archive aria-hidden="true" />
              )}
              {video.isArchived ? "Pulihkan" : "Arsipkan"}
            </Button>
            <Button
              className="text-destructive hover:text-destructive"
              disabled={isPending}
              onClick={() => onDelete(video)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
              Hapus
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
  isEditing,
  onChange,
  onOpenChange,
  onSubmit,
  open,
}: {
  draft: VideoDraft;
  error: string | null;
  isPending: boolean;
  isEditing: boolean;
  onChange: (field: VideoDraftTextField, value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[min(86vh,760px)] w-[calc(100vw-2rem)] overflow-y-auto p-6 sm:max-w-2xl sm:p-8">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-display text-3xl font-semibold tracking-[-0.03em] text-voyage-ink">
            {isEditing ? "Edit video" : "Tambah video"}
          </DialogTitle>
        </DialogHeader>

        <form className="grid gap-6" onSubmit={onSubmit}>
          <Field>
            <FieldLabel
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor="kapten-video-title"
              required
            >
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
            <FieldLabel
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor="kapten-video-url"
              required
            >
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

          <Field>
            <FieldLabel
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor="kapten-video-subtest"
              required
            >
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
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-secondary-500"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-(--anchor-width)"
              >
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

          <Field>
            <FieldLabel
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor="kapten-video-description"
            >
              Deskripsi singkat
            </FieldLabel>
            <FieldTextarea
              className={cn(
                REFERENCE_CONTROL_CLASS_NAMES.input,
                "min-h-28 resize-y",
              )}
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

          <div>
            <Button
              className="min-h-14 w-full"
              disabled={isPending}
              type="submit"
              variant="brand"
            >
              {isPending ? "Menyimpan…" : isEditing ? "Simpan perubahan" : "Tambah video"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VideoDeleteDialog({
  isPending,
  onCancel,
  onConfirm,
  video,
}: {
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  video: VideoGalleryItem | null;
}) {
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
      open={Boolean(video)}
    >
      <AlertDialogContent pending={isPending} size="sm" variant="danger">
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus video?</AlertDialogTitle>
          <AlertDialogDescription>
            “{video?.title}” akan dihapus dari galeri secara permanen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={onCancel}>
            Batal
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={onConfirm}
            variant="destructive"
          >
            {isPending ? "Menghapus…" : "Hapus video"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function KaptenVideoGalleryPageModule({
  session,
  videos: initialVideos,
}: {
  session: SessionContext;
  videos: VideoGalleryItem[];
}) {
  const [activeSubtest, setActiveSubtest] =
    useState<(typeof videoFilters)[number]>("Semua");
  const [draft, setDraft] = useState<VideoDraft>(emptyVideoDraft);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [showArchivedVideos, setShowArchivedVideos] = useState(false);
  const [videoPendingDeletion, setVideoPendingDeletion] =
    useState<VideoGalleryItem | null>(null);
  const [videos, setVideos] = useState<VideoGalleryItem[]>(initialVideos);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");

    return videos.filter((video) => {
      if (video.isArchived && !showArchivedVideos) return false;
      if (activeSubtest !== "Semua" && video.subtest !== activeSubtest)
        return false;
      if (!normalizedQuery) return true;
      return [video.title, video.description, video.subject, ...video.tags]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .includes(normalizedQuery);
    });
  }, [activeSubtest, query, showArchivedVideos, videos]);

  const editingVideo = editingVideoId
    ? videos.find((video) => video.id === editingVideoId)
    : undefined;
  const hasVideosInCurrentCollection = videos.some(
    (video) => !video.isArchived || showArchivedVideos,
  );
  const hasArchivedVideos = videos.some((video) => video.isArchived);

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

  function updateArchivedState(
    video: VideoGalleryItem,
    archived: boolean,
  ) {
    startTransition(async () => {
      const result = await setKaptenVideoArchivedAction(video.id, archived);
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }

      setVideos((current) =>
        current.map((item) => (item.id === video.id ? result.video : item)),
      );
      showToast(
        archived ? "Video diarsipkan." : "Video dipulihkan dan kembali tampil kepada siswa.",
        { variant: "success" },
      );
    });
  }

  function deleteVideo() {
    if (!videoPendingDeletion) return;
    const videoId = videoPendingDeletion.id;

    startTransition(async () => {
      const result = await deleteKaptenVideoAction(videoId);
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }

      setVideos((current) => current.filter((video) => video.id !== videoId));
      setVideoPendingDeletion(null);
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
      subtest: draft.subtest,
      title,
      youtubeUrl,
    };

    startTransition(async () => {
      const result = await saveKaptenVideoAction(input);
      if (!result.ok) {
        setFormError(
          result.fieldErrors?.title ??
            result.fieldErrors?.youtubeUrl ??
            result.fieldErrors?.subtest ??
            result.fieldErrors?.description ??
            result.message,
        );
        return;
      }

      setVideos((current) => {
        const exists = current.some((video) => video.id === result.video.id);
        return exists
          ? current.map((video) =>
              video.id === result.video.id ? result.video : video,
            )
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
            <Button
              disabled={isPending}
              onClick={openCreate}
              type="button"
              variant="brand"
            >
              <Plus aria-hidden="true" />
              Tambah video
            </Button>
          }
          title="Video"
          titleClassName="font-display text-4xl font-extrabold tracking-[-0.04em] text-voyage-ink text-balance md:text-5xl"
        />

        <VideoLibraryToolbar activeSubtest={activeSubtest} onQueryChange={setQuery} onSubtestChange={setActiveSubtest} onShowArchivedChange={setShowArchivedVideos} query={query} showArchivedVideos={showArchivedVideos} />
        <VideoCollection
          hasArchivedVideos={hasArchivedVideos}
          hasVideosInCurrentCollection={hasVideosInCurrentCollection}
          isPending={isPending}
          onArchive={updateArchivedState}
          onCreate={openCreate}
          onDelete={setVideoPendingDeletion}
          onEdit={openEdit}
          showArchivedVideos={showArchivedVideos}
          videos={filteredVideos}
        />
      </div>

      <VideoEditorDialog
        draft={draft}
        error={formError}
        isPending={isPending}
        isEditing={Boolean(editingVideo)}
        onChange={updateDraft}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        onSubmit={handleSubmit}
        open={isEditorOpen}
      />
      <VideoDeleteDialog
        isPending={isPending}
        onCancel={() => setVideoPendingDeletion(null)}
        onConfirm={deleteVideo}
        video={videoPendingDeletion}
      />
    </MentorWorkspaceShell>
  );
}

function VideoLibraryToolbar({ activeSubtest, onQueryChange, onShowArchivedChange, onSubtestChange, query, showArchivedVideos }: {
  activeSubtest: (typeof videoFilters)[number];
  onQueryChange: (value: string) => void;
  onShowArchivedChange: (value: boolean) => void;
  onSubtestChange: (value: (typeof videoFilters)[number]) => void;
  query: string;
  showArchivedVideos: boolean;
}) {
  return (
    <div className="grid gap-3">
      <div className="relative min-w-0 sm:max-w-[30rem]">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-500" />
        <input aria-label="Cari video Kapten" className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "pl-11")} onChange={(event) => onQueryChange(event.target.value)} placeholder="Cari judul atau topik..." type="search" value={query} />
      </div>
      <div aria-label="Filter subtes video Kapten" className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist">
        {videoFilters.map((filter) => <VideoFilterTab activeSubtest={activeSubtest} filter={filter} key={filter} onSubtestChange={onSubtestChange} />)}
      </div>
      <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-sm font-medium text-secondary-700" htmlFor="kapten-video-show-archived">
        <Checkbox checked={showArchivedVideos} id="kapten-video-show-archived" onCheckedChange={(checked) => onShowArchivedChange(checked === true)} />
        <span>Tampilkan arsip</span>
      </label>
    </div>
  );
}

function VideoFilterTab({ activeSubtest, filter, onSubtestChange }: {
  activeSubtest: (typeof videoFilters)[number];
  filter: (typeof videoFilters)[number];
  onSubtestChange: (value: (typeof videoFilters)[number]) => void;
}) {
  const isActive = activeSubtest === filter;
  return <SunkenTabButton aria-selected={isActive} layout="content" onClick={() => onSubtestChange(filter)} role="tab" selected={isActive} type="button">{filter}</SunkenTabButton>;
}

function getVideoEmptyState(hasVideosInCurrentCollection: boolean, hasArchivedVideos: boolean, showArchivedVideos: boolean) {
  if (hasVideosInCurrentCollection) return { description: "Coba kata kunci lain atau pilih Semua untuk melihat koleksi yang tersedia.", title: "Video tidak ditemukan" };
  if (!showArchivedVideos && hasArchivedVideos) return { description: "Centang Tampilkan arsip untuk melihat video yang diarsipkan.", title: "Belum ada video aktif" };
  return { description: "Tambahkan tautan YouTube pertama untuk koleksi video siswa.", title: "Belum ada video" };
}

function VideoCollection({ hasArchivedVideos, hasVideosInCurrentCollection, isPending, onArchive, onCreate, onDelete, onEdit, showArchivedVideos, videos }: {
  hasArchivedVideos: boolean;
  hasVideosInCurrentCollection: boolean;
  isPending: boolean;
  onArchive: (video: VideoGalleryItem, archived: boolean) => void;
  onCreate: () => void;
  onDelete: (video: VideoGalleryItem) => void;
  onEdit: (video: VideoGalleryItem) => void;
  showArchivedVideos: boolean;
  videos: VideoGalleryItem[];
}) {
  if (videos.length) {
    return <div className="grid gap-4" id="kapten-video-list">{videos.map((video) => <KaptenVideoCard isPending={isPending} key={video.id} onArchive={onArchive} onDelete={onDelete} onEdit={onEdit} video={video} />)}</div>;
  }
  const emptyState = getVideoEmptyState(hasVideosInCurrentCollection, hasArchivedVideos, showArchivedVideos);
  return (
    <ReferenceSurface className="border-learning-card-border" variant="raised">
      <ReferenceEmptyState action={!hasVideosInCurrentCollection ? <Button disabled={isPending} onClick={onCreate} size="sm" variant="brand">Tambah video</Button> : undefined} description={emptyState.description} icon={Video} title={emptyState.title} />
    </ReferenceSurface>
  );
}

export { KaptenVideoGalleryPageModule };

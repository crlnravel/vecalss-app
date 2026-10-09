"use client";

import Image from "next/image";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Funnel } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";

import {
  Archive,
  ArrowUpRight,
  Check,
  ChevronDown,
  FilePenLine,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "@/lib/icons";
import {
  ReferencePageHeader,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import type { SessionContext } from "@/lib/auth/types";
import {
  getYouTubeThumbnailUrl,
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
import {
  MentorAssessmentGrid,
  MentorGridMenu,
} from "@/modules/mentor/components/mentor-assessment-table";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import styles from "./quiz-dashboard.module.css";

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

const numberFormatter = new Intl.NumberFormat("id-ID");

const videoStatusLabels = {
  published: "Terbit",
  archived: "Arsip",
} as const;

type VideoStatusFilter = "" | keyof typeof videoStatusLabels;

function VideoPreview({ video }: { video: VideoGalleryItem }) {
  const thumbnailUrl = getYouTubeThumbnailUrl(video.youtubeUrl);
  const [thumbnailErrorUrl, setThumbnailErrorUrl] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "relative aspect-video w-24 shrink-0 overflow-hidden rounded-control",
        thumbnailToneClasses[video.thumbnailTone],
      )}
    >
      {thumbnailUrl && thumbnailErrorUrl !== thumbnailUrl ? (
        <Image
          alt=""
          aria-hidden="true"
          className="object-cover"
          fill
          loading="lazy"
          onError={() => setThumbnailErrorUrl(thumbnailUrl)}
          sizes="96px"
          src={thumbnailUrl}
          unoptimized
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute -right-8 -top-10 size-28 rounded-full border-[12px] border-voyage-sea-glass/20"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-10 -left-6 size-28 rounded-full bg-voyage-deep/45 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1/2 bg-secondary-950/25"
      />
    </div>
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
                render={<Button type="button" variant="outline" />}
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
              variant="default"
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

function VideoRowActions({
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
    <MentorGridMenu
      className={styles.iconButton}
      disabled={isPending}
      label={`Tindakan untuk ${video.title}`}
      trigger={<MoreHorizontal aria-hidden="true" size={16} />}
    >
      <DropdownMenuItem
        disabled={isPending}
        onClick={() => onEdit(video)}
        size="sm"
      >
        <FilePenLine aria-hidden="true" />
        Edit video
      </DropdownMenuItem>
      <DropdownMenuItem
        render={
          <a
            aria-label={`Lihat ${video.title} di YouTube`}
            href={video.youtubeUrl}
            rel="noreferrer"
            target="_blank"
          />
        }
        size="sm"
      >
        <ArrowUpRight aria-hidden="true" />
        Lihat di YouTube
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={isPending}
        onClick={() => onArchive(video, !video.isArchived)}
        size="sm"
      >
        {video.isArchived ? (
          <RotateCcw aria-hidden="true" />
        ) : (
          <Archive aria-hidden="true" />
        )}
        {video.isArchived ? "Pulihkan" : "Arsipkan"}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={isPending}
        onClick={() => onDelete(video)}
        size="sm"
        variant="destructive"
      >
        <Trash2 aria-hidden="true" />
        Hapus
      </DropdownMenuItem>
    </MentorGridMenu>
  );
}

function KaptenVideoGalleryPageModule({
  session,
  videos: initialVideos,
}: {
  session: SessionContext;
  videos: VideoGalleryItem[];
}) {
  "use no memo";

  const [activeSubtest, setActiveSubtest] =
    useState<(typeof videoFilters)[number]>("Semua");
  const [draft, setDraft] = useState<VideoDraft>(emptyVideoDraft);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [statusFilter, setStatusFilter] = useState<VideoStatusFilter>("");
  const [videoPendingDeletion, setVideoPendingDeletion] =
    useState<VideoGalleryItem | null>(null);
  const [videos, setVideos] = useState<VideoGalleryItem[]>(initialVideos);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");

    return videos.filter((video) => {
      if (statusFilter === "published" && video.isArchived) return false;
      if (statusFilter === "archived" && !video.isArchived) return false;
      if (activeSubtest !== "Semua" && video.subtest !== activeSubtest)
        return false;
      if (!normalizedQuery) return true;
      return [video.title, video.description, video.subject, ...video.tags]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .includes(normalizedQuery);
    });
  }, [activeSubtest, query, statusFilter, videos]);

  const editingVideo = editingVideoId
    ? videos.find((video) => video.id === editingVideoId)
    : undefined;
  const hasVideosInCurrentCollection = videos.some(
    (video) =>
      statusFilter === "" ||
      (statusFilter === "archived" ? video.isArchived : !video.isArchived),
  );

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
      setSelection({});
      showToast(
        archived ? "Video diarsipkan." : "Video dipulihkan dan kembali tampil kepada siswa.",
        { variant: "success" },
      );
    });
  }

  function updateArchivedVideos(
    selectedVideos: VideoGalleryItem[],
    archived: boolean,
  ) {
    if (!selectedVideos.length) return;

    startTransition(async () => {
      const results = await Promise.all(
        selectedVideos.map((video) =>
          setKaptenVideoArchivedAction(video.id, archived),
        ),
      );
      const succeeded = results.filter((result) => result.ok);
      const failed = results.length - succeeded.length;
      const updatedById = new Map(
        succeeded.map((result) => [result.video.id, result.video]),
      );

      if (succeeded.length) {
        setVideos((current) =>
          current.map((item) => updatedById.get(item.id) ?? item),
        );
      }
      setSelection({});

      if (failed) {
        showToast(
          `${succeeded.length} video berhasil diperbarui; ${failed} belum berhasil.`,
          { variant: "warning" },
        );
      } else {
        showToast(
          `${succeeded.length} video berhasil ${archived ? "diarsipkan" : "dipulihkan"}.`,
          { variant: "success" },
        );
      }
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
      setSelection({});
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

  const columns: ColumnDef<VideoGalleryItem>[] = [
    {
      id: "select",
      size: 40,
      header: ({ table }) => (
        <Checkbox
          aria-label="Pilih semua video di halaman ini"
          checked={table.getIsAllPageRowsSelected()}
          disabled={isPending || !filteredVideos.length}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(checked)
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Pilih ${row.original.title}`}
          checked={row.getIsSelected()}
          disabled={isPending}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
        />
      ),
    },
    {
      id: "thumbnail",
      size: 120,
      enableHiding: false,
      enableSorting: false,
      header: () => <span className={styles.srOnly}>Thumbnail</span>,
      cell: ({ row }) => <VideoPreview video={row.original} />,
    },
    {
      accessorKey: "title",
      size: 350,
      enableHiding: false,
      cell: ({ row }) => (
        <span
          className={styles.quizTitle}
          title={row.original.title}
        >
          {row.original.title}
        </span>
      ),
    },
    {
      accessorKey: "subject",
      size: 220,
      cell: ({ row }) => (
        <span className="font-medium text-secondary-900" title={row.original.subject}>
          {row.original.subject}
        </span>
      ),
    },
    {
      accessorKey: "views",
      size: 100,
      cell: ({ getValue }) => {
        const views = getValue<number | null>();
        return views === null ? "—" : numberFormatter.format(views);
      },
    },
    {
      id: "actions",
      size: 60,
      enableHiding: false,
      enableSorting: false,
      header: () => <span className={styles.srOnly}>Tindakan</span>,
      cell: ({ row }) => (
        <VideoRowActions
          isPending={isPending}
          onArchive={updateArchivedState}
          onDelete={setVideoPendingDeletion}
          onEdit={openEdit}
          video={row.original}
        />
      ),
    },
  ];

  // TanStack's mutable table API intentionally opts out of React Compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library -- The compiler skips this supported TanStack integration.
  const table = useReactTable({
    data: filteredVideos,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    state: { rowSelection: selection },
    enableRowSelection: true,
    onRowSelectionChange: setSelection,
    enableSorting: false,
    autoResetPageIndex: false,
  });
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedVideos = selectedRows.map((row) => row.original);
  const canArchiveSelection = selectedVideos.some((video) => !video.isArchived);
  const canRestoreSelection = selectedVideos.some((video) => video.isArchived);
  const activeFilters: Array<{
    key: "status" | "subtest";
    label: string;
  }> = [
    ...(activeSubtest !== "Semua"
      ? [{ key: "subtest" as const, label: activeSubtest }]
      : []),
    ...(statusFilter
      ? [{ key: "status" as const, label: videoStatusLabels[statusFilter] }]
      : []),
  ];
  const emptyState = getVideoEmptyState(
    hasVideosInCurrentCollection,
    statusFilter,
  );

  return (
    <MentorWorkspaceShell
      activeLabel="Video"
      breadcrumbLabel="Video"
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
      mainClassName={styles.canvas}
    >
      <ReferencePageHeader
        actions={
          <Button
            disabled={isPending}
            onClick={openCreate}
            type="button"
            variant="default"
          >
            <Plus aria-hidden="true" />
            Tambah video
          </Button>
        }
        className={styles.pageHeader}
        title="Video"
        titleClassName="font-display text-4xl font-extrabold tracking-[-0.04em] text-voyage-ink text-balance md:text-5xl"
      />

      <section
        aria-busy={isPending}
        aria-label="Daftar video"
        className={styles.panel}
      >
        <div className={styles.toolbar} data-selected={selectedVideos.length > 0}>
          <form
            className={styles.search}
            onSubmit={(event) => event.preventDefault()}
          >
            <Search aria-hidden="true" />
            <Input
              aria-label="Cari video berdasarkan judul atau subjek"
              className="pl-9"
              disabled={isPending}
              onChange={(event) => {
                setSelection({});
                setQuery(event.target.value);
              }}
              placeholder="Cari video…"
              type="search"
              value={query}
            />
          </form>
          <div className={styles.filters}>
            <MentorGridMenu
              className={styles.subject}
              label="Filter subtes video"
              trigger={
                <>
                  {activeSubtest === "Semua" ? "Semua subtes" : activeSubtest}
                  <ChevronDown aria-hidden="true" />
                </>
              }
            >
              {videoFilters.map((filter) => (
                <DropdownMenuItem
                  key={filter}
                  onClick={() => {
                    setSelection({});
                    setActiveSubtest(filter);
                  }}
                  size="sm"
                >
                  {filter === "Semua" ? "Semua subtes" : filter}
                  {activeSubtest === filter ? <Check aria-hidden="true" /> : null}
                </DropdownMenuItem>
              ))}
            </MentorGridMenu>
            <MentorGridMenu
              label="Filter status"
              trigger={
                <>
                  <Funnel aria-hidden="true" />
                  Status
                  {statusFilter ? (
                    <Badge size="xs" tone="neutral">
                      1
                    </Badge>
                  ) : null}
                </>
              }
            >
              <DropdownMenuItem
                disabled={isPending}
                onClick={() => {
                  setSelection({});
                  setStatusFilter("");
                }}
                size="sm"
              >
                Semua
                {!statusFilter ? <Check aria-hidden="true" /> : null}
              </DropdownMenuItem>
              {(Object.entries(videoStatusLabels) as Array<[
                keyof typeof videoStatusLabels,
                string,
              ]>).map(([value, label]) => (
                <DropdownMenuItem
                  disabled={isPending}
                  key={value}
                  onClick={() => {
                    setSelection({});
                    setStatusFilter(value);
                  }}
                  size="sm"
                >
                  {label}
                  {statusFilter === value ? (
                    <Check aria-hidden="true" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </MentorGridMenu>
          </div>
          {selectedVideos.length > 0 ? (
            <div className={styles.bulkTools}>
              <MentorGridMenu
                className={styles.iconButton}
                disabled={isPending}
                label={`Tindakan ${selectedVideos.length} video terpilih`}
                trigger={<MoreHorizontal aria-hidden="true" size={16} />}
              >
                <DropdownMenuItem
                  disabled={!canArchiveSelection || isPending}
                  onClick={() =>
                    updateArchivedVideos(
                      selectedVideos.filter((video) => !video.isArchived),
                      true,
                    )
                  }
                  size="sm"
                >
                  <Archive aria-hidden="true" />
                  Arsipkan
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canRestoreSelection || isPending}
                  onClick={() =>
                    updateArchivedVideos(
                      selectedVideos.filter((video) => video.isArchived),
                      false,
                    )
                  }
                  size="sm"
                >
                  <RotateCcw aria-hidden="true" />
                  Pulihkan
                </DropdownMenuItem>
              </MentorGridMenu>
            </div>
          ) : null}
        </div>

        {activeFilters.length > 0 ? (
          <div aria-label="Filter aktif" className={styles.chips}>
            {activeFilters.map((filter) => (
              <Button
                aria-label={`Hapus filter ${filter.label}`}
                className="px-0"
                key={filter.key}
                onClick={() => {
                  setSelection({});
                  if (filter.key === "subtest") setActiveSubtest("Semua");
                  if (filter.key === "status") setStatusFilter("");
                }}
                size="sm"
                type="button"
                variant="quiet"
              >
                <Badge size="sm" tone="category">
                  {filter.label}
                  <X aria-hidden="true" className="size-3" />
                </Badge>
              </Button>
            ))}
            <Button
              onClick={() => {
                setSelection({});
                setActiveSubtest("Semua");
                setStatusFilter("");
              }}
              size="sm"
              type="button"
              variant="quiet"
            >
              Hapus semua
            </Button>
          </div>
        ) : null}

        <MentorAssessmentGrid
          caption="Daftar video YouTube Kapten dengan subjek dan jumlah views."
          columnLabels={{
            subject: "Subjek",
            title: "Judul",
            views: "Views",
          }}
          emptyState={
            <>
              <strong>{emptyState.title}</strong>
              {emptyState.description}
              {!hasVideosInCurrentCollection ? (
                <div>
                  <Button
                    disabled={isPending}
                    onClick={openCreate}
                    size="sm"
                    type="button"
                    variant="default"
                  >
                    <Plus aria-hidden="true" />
                    Tambah video
                  </Button>
                </div>
              ) : null}
            </>
          }
          label="Tabel video, geser untuk melihat semua kolom"
          numericColumns={["views"]}
          table={table}
        />
      </section>

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

function getVideoEmptyState(
  hasVideosInCurrentCollection: boolean,
  statusFilter: VideoStatusFilter,
) {
  if (hasVideosInCurrentCollection) return { description: "Coba kata kunci lain atau pilih Semua untuk melihat koleksi yang tersedia.", title: "Video tidak ditemukan" };
  if (statusFilter === "published") return { description: "Belum ada video terbit untuk ditampilkan.", title: "Belum ada video terbit" };
  if (statusFilter === "archived") return { description: "Video yang diarsipkan akan muncul di sini.", title: "Belum ada video arsip" };
  return { description: "Tambahkan tautan YouTube pertama untuk koleksi video siswa.", title: "Belum ada video" };
}

export { KaptenVideoGalleryPageModule };

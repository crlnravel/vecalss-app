"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";

import {
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { showToast } from "@/components/ui/toast";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import type { SessionContext } from "@/lib/auth/types";
import {
  isYouTubeVideoUrl,
  type SaveKaptenVideoInput,
} from "@/lib/video/contract";
import {
  saveKaptenVideoAction,
} from "@/modules/mentor/video-actions";
import {
  VideoEditorForm,
  type VideoDraft,
  type VideoDraftTextField,
} from "@/modules/mentor/components/video-editor-form";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import type { VideoGalleryItem } from "@/modules/video/video-gallery-data";

function toVideoDraft(video: VideoGalleryItem): VideoDraft {
  return {
    description: video.description,
    subtest: video.subtest,
    title: video.title,
    youtubeUrl: video.youtubeUrl,
  };
}

function areVideoDraftsEqual(left: VideoDraft, right: VideoDraft) {
  return (
    left.description === right.description &&
    left.subtest === right.subtest &&
    left.title === right.title &&
    left.youtubeUrl === right.youtubeUrl
  );
}

function KaptenVideoEditorPageContent({
  initialVideo,
  session,
}: {
  initialVideo: VideoGalleryItem;
  session: SessionContext;
}) {
  const initialDraft = useMemo(() => toVideoDraft(initialVideo), [initialVideo]);
  const [draft, setDraft] = useState<VideoDraft>(initialDraft);
  const [savedDraft, setSavedDraft] = useState<VideoDraft>(initialDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasUnsavedChanges = !areVideoDraftsEqual(draft, savedDraft);

  function updateDraft(field: VideoDraftTextField, value: string) {
    setFormError(null);
    setDraft((current) => ({
      ...current,
      [field]: field === "subtest" ? (value as VideoDraft["subtest"]) : value,
    }));
  }

  function resetChanges() {
    if (isPending) return;
    setDraft(savedDraft);
    setFormError(null);
  }

  function saveVideo() {
    if (isPending) return;

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
      description: draft.description,
      id: initialVideo.id,
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

      const nextDraft = toVideoDraft(result.video);
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
      setFormError(null);
      showToast(result.message, { variant: "success" });
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveVideo();
  }

  usePageStatusToast({
    active: hasUnsavedChanges || isPending,
    action:
      hasUnsavedChanges && !isPending
        ? { label: "Simpan", onClick: saveVideo }
        : undefined,
    cancel:
      hasUnsavedChanges && !isPending
        ? { label: "Batal", onClick: resetChanges }
        : undefined,
    message: isPending
      ? "Menyimpan perubahan…"
      : "Ada perubahan yang belum disimpan",
    variant: "info",
  });

  return (
    <MentorWorkspaceShell
      activeLabel="Video"
      breadcrumbLabel="Edit Video"
      mainClassName="!max-w-none gap-6"
      onNavigateAway={() => !hasUnsavedChanges && !isPending}
      searchPlaceholder="Cari video..."
      session={session}
      showSearch={false}
      shouldGuardNavigation={hasUnsavedChanges}
      sidebarAppearance="reference"
    >
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
        <ReferencePageHeader
          title={draft.title.trim() || "Edit video"}
          titleClassName="font-display text-4xl font-extrabold tracking-[-0.04em] text-voyage-ink text-balance md:text-5xl"
        />
        <ReferenceSurface
          aria-labelledby="video-edit-heading"
          as="section"
          className="grid gap-6 p-5 sm:p-7"
        >
          <div>
            <h2
              className="text-xl font-semibold tracking-[-0.025em] text-secondary-900"
              id="video-edit-heading"
            >
              Informasi video
            </h2>
            <p className="mt-1 text-sm leading-6 text-secondary-600">
              Perbarui judul, tautan YouTube, subtes, atau deskripsi video.
            </p>
          </div>
          <VideoEditorForm
            draft={draft}
            error={formError}
            idPrefix="kapten-video-edit"
            isPending={isPending}
            onChange={updateDraft}
            onSubmit={handleSubmit}
            submitLabel={isPending ? "Menyimpan…" : "Simpan perubahan"}
          />
        </ReferenceSurface>
      </div>
    </MentorWorkspaceShell>
  );
}

function KaptenVideoEditorPageModule({
  initialVideo,
  session,
}: {
  initialVideo: VideoGalleryItem;
  session: SessionContext;
}) {
  return (
    <KaptenVideoEditorPageContent
      initialVideo={initialVideo}
      session={session}
    />
  );
}

export { KaptenVideoEditorPageModule };

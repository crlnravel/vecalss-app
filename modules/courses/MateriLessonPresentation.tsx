import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import type { MateriDocument } from "@/lib/materi/contract";

import { StudentPdfPreview } from "./StudentPdfPreview";

type VideoProvider = "other" | "vimeo" | "youtube";

type VideoUrls = {
  embedUrl: string;
  openUrl: string;
  provider: VideoProvider;
};

function getVideoUrls(mediaUrl: string): VideoUrls | undefined {
  try {
    const url = new URL(mediaUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathParts = url.pathname.split("/").filter(Boolean);
    const isYoutube = host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be";

    if (isYoutube) {
      const videoId = host === "youtu.be"
        ? pathParts[0]
        : url.searchParams.get("v") ?? (pathParts[0] === "embed" || pathParts[0] === "shorts" || pathParts[0] === "live" ? pathParts[1] : undefined);
      if (videoId) {
        return {
          embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0`,
          openUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
          provider: "youtube",
        };
      }
    }

    const isVimeo = host === "vimeo.com" || host === "player.vimeo.com";
    if (isVimeo) {
      const videoId = host === "player.vimeo.com" && pathParts[0] === "video" ? pathParts[1] : pathParts[0];
      if (videoId) {
        return {
          embedUrl: `https://player.vimeo.com/video/${encodeURIComponent(videoId)}`,
          openUrl: `https://vimeo.com/${encodeURIComponent(videoId)}`,
          provider: "vimeo",
        };
      }
    }

    return { embedUrl: mediaUrl, openUrl: mediaUrl, provider: "other" };
  } catch {
    return undefined;
  }
}

function getProviderOpenCopy(provider: VideoProvider) {
  if (provider === "youtube") return "Buka di YouTube";
  if (provider === "vimeo") return "Buka di Vimeo";
  return "Buka video";
}

function MateriVideoPreview({
  title,
  videoUrls,
}: {
  title: string;
  videoUrls?: VideoUrls;
}) {
  if (!videoUrls) return null;

  return (
    <section aria-label="Video pendamping" className="mt-8 space-y-3 md:mt-10">
      <div>
        <p className="text-xs font-bold tracking-[0.14em] text-[#698078] uppercase">Pendamping (opsional)</p>
        <p className="mt-1 text-sm font-semibold text-[#285641]">Video pembelajaran</p>
      </div>
      <div className="overflow-hidden rounded-[1.65rem] bg-black ring-1 ring-[#d9e5de] md:rounded-[2rem]">
        <div className="relative aspect-video w-full">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
            loading="lazy"
            src={videoUrls.embedUrl}
            title={`Video pembelajaran: ${title.trim() || "Materi"}`}
          />
        </div>
      </div>
    </section>
  );
}

function MateriLessonPresentation({
  action,
  document,
  documentDeliveryUrl,
  managedDocumentPreview,
  duration,
  position,
  showSectionLabel = true,
  showDuration = false,
  subject,
  title,
  videoUrl,
}: {
  action?: ReactNode;
  document?: MateriDocument | null;
  documentDeliveryUrl?: string;
  managedDocumentPreview?: ReactNode;
  duration?: string;
  position?: number;
  showSectionLabel?: boolean;
  showDuration?: boolean;
  subject: string;
  title: string;
  videoUrl?: string;
}) {
  const videoUrls = getVideoUrls(videoUrl ?? "");
  const isDocumentMode = document !== undefined;
  const subjectDetails = isDocumentMode
    ? `Materi ${subject} · Bacaan PDF`
    : showDuration && duration
      ? `Materi ${subject} · ${duration}`
      : `Materi ${subject}`;
  const providerLink = videoUrls ? (
    <a
      className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl px-1 text-sm font-semibold text-[#426757] underline decoration-[#b7ddc3] underline-offset-4 outline-none hover:text-[#173c2d] focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30"
      href={videoUrls.openUrl}
      rel="noreferrer"
      target="_blank"
    >
      {getProviderOpenCopy(videoUrls.provider)} <ExternalLink className="size-4" />
    </a>
  ) : null;

  return (
    <>
      <header className="mt-2">
        {showSectionLabel ? (
          <p className="text-xs font-bold tracking-[0.14em] text-[#698078] uppercase">
            Bagian{position === undefined ? "" : ` ${position + 1}`}
          </p>
        ) : null}
        <h1 className={`${showSectionLabel ? "mt-2" : ""} max-w-[32ch] text-3xl leading-tight font-extrabold tracking-[-0.045em] text-[#121a29] text-balance md:text-4xl lg:text-[2.8rem]`}>
          {title.trim() || "Materi tanpa judul"}
        </h1>
        <p className="mt-2 text-base text-[#66766e] md:text-lg">{subjectDetails}</p>
      </header>

      {isDocumentMode ? (
        <section aria-label="Dokumen Materi" className="mt-7 space-y-3 md:mt-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-[#698078] uppercase">Bacaan utama</p>
              <p className="mt-1 text-sm font-semibold text-[#285641]">{document?.originalName?.trim() || "Dokumen Materi"}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f5ec] px-3 py-1.5 text-xs font-bold text-[#176b4d]">
              PDF
            </span>
          </div>
          {managedDocumentPreview ?? (
            <StudentPdfPreview
              document={document ?? null}
              documentDeliveryUrl={documentDeliveryUrl}
              title={title}
            />
          )}
        </section>
      ) : <div className="mt-7 overflow-hidden rounded-[1.65rem] bg-black ring-1 ring-[#d9e5de] md:mt-9 md:rounded-[2rem]">
        <div className="relative aspect-video w-full">
          {videoUrls ? <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
            loading="lazy"
            src={videoUrls.embedUrl}
            title={`Video pembelajaran: ${title.trim() || "Materi"}`}
          /> : <p className="grid size-full place-items-center px-6 text-center text-sm font-medium text-white/70">Video belum tersedia.</p>}
        </div>
      </div>}

      {isDocumentMode ? <MateriVideoPreview title={title} videoUrls={videoUrls} /> : null}

      {action ? (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {action}
          {providerLink}
        </div>
      ) : providerLink ? <div className="mt-5">{providerLink}</div> : null}
    </>
  );
}

export { MateriLessonPresentation };

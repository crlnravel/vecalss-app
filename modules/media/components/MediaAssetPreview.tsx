"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import { FileText, ImageOff } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isPdfMimeType, type MediaScope } from "@/lib/media/domain";
import { cn } from "@/lib/utils";
import { readJson } from "../helpers";

export function MediaAssetPreview({
  assetId,
  alt,
  className,
  showDownloadControls = false,
  scope = "kapten",
}: {
  alt: string;
  assetId: string;
  className?: string;
  showDownloadControls?: boolean;
  scope?: MediaScope;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/media/${scope}/assets/${assetId}/preview`, { cache: "no-store", signal: controller.signal })
      .then((response) => readJson<{ mimeType?: string; previewUrl: string }>(response))
      .then((payload) => {
        setMimeType(payload.mimeType ?? null);
        setPreviewUrl(payload.previewUrl);
      })
      .catch((previewError) => {
        if (!(previewError instanceof DOMException && previewError.name === "AbortError")) setHasError(true);
      });
    return () => controller.abort();
  }, [assetId, scope]);

  if (hasError) {
    return <div className={cn("flex min-h-24 items-center justify-center rounded-2xl bg-primary-50 text-sm text-secondary-500", className)}><ImageOff className="mr-2 size-4" />Pratinjau media belum tersedia</div>;
  }
  if (!previewUrl) return <Skeleton className={cn("min-h-24 w-full rounded-2xl", className)} />;

  if (isPdfMimeType(mimeType)) {
    return <div className={cn("flex min-h-24 flex-wrap items-center justify-center gap-2 rounded-2xl bg-primary-50 px-4", className)}>
      <Button
        nativeButton={false}
        render={<a aria-label="Buka PDF" href={previewUrl} rel="noreferrer" target="_blank" />}
        size="default"
        variant="brandOutline"
      >
        <FileText className="size-5" />
        Buka PDF
      </Button>
      {showDownloadControls ? <Button
        nativeButton={false}
        render={<a aria-label="Unduh PDF" download href={previewUrl} />}
        size="default"
        variant="brand"
      >
        Unduh PDF
      </Button> : null}
    </div>;
  }

  return <div className={cn("relative min-h-24 w-full", className)}><NextImage alt={alt} className="object-contain" fill sizes="(min-width: 768px) 36rem, 100vw" src={previewUrl} unoptimized /></div>;
}

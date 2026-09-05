"use client";

import { Download, Expand, ExternalLink, FileText, LoaderCircle, Minimize2, RefreshCw } from "@/lib/icons";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  isValidHostedPdfUrl,
  type MateriDocument,
} from "@/lib/materi/contract";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type DocumentPreviewState = "loading" | "ready" | "unavailable";

type StudentPdfPreviewProps = {
  actions?: ReactNode;
  className?: string;
  completionAction?: ReactNode;
  document: MateriDocument | null;
  documentDeliveryUrl?: string;
  title: string;
};

const StudentPdfDocument = dynamic(
  () => import("./StudentPdfDocument").then((module) => module.StudentPdfDocument),
  {
    loading: () => (
      <div className="flex min-h-[22rem] items-center justify-center px-6 text-center text-sm font-semibold text-[var(--voyage-muted-ink)]">
        Menyiapkan halaman PDF…
      </div>
    ),
    ssr: false,
  },
);

type DeliveryPayload = {
  documentUrl?: unknown;
  downloadUrl?: unknown;
  sourceKind?: unknown;
};

function isHttpDocumentUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function StudentPdfPreview({
  actions,
  className,
  completionAction,
  document,
  documentDeliveryUrl,
  title,
}: StudentPdfPreviewProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const documentName = document?.originalName?.trim() || "Dokumen Materi";
  const isManaged = document?.sourceKind === "managed" && Boolean(document.managedAssetId);
  const hostedUrl = document?.url?.trim() || "";
  const isHosted = document?.sourceKind === "hosted" && isValidHostedPdfUrl(hostedUrl, document?.mimeType);
  const shouldResolveDelivery = Boolean(documentDeliveryUrl);
  const unavailableMessage = isManaged
    ? "Dokumen PDF managed belum dapat dibuka. Coba muat ulang halaman atau gunakan jalur kembali ke Materi."
    : "Dokumen PDF belum tersedia untuk dibaca. Kembali ke Materi untuk memilih unit lain.";
  const requestKey = `${documentDeliveryUrl ?? ""}:${hostedUrl}:${document?.managedAssetId ?? ""}:${requestVersion}`;
  const state: DocumentPreviewState = !shouldResolveDelivery && isHosted
    ? "ready"
    : !shouldResolveDelivery
      ? "unavailable"
      : failedKey === requestKey
        ? "unavailable"
        : resolvedKey === requestKey && resolvedUrl
          ? "ready"
          : "loading";
  const previewUrl = shouldResolveDelivery ? resolvedUrl : hostedUrl;
  const downloadUrl = shouldResolveDelivery
    ? resolvedDownloadUrl ?? getDownloadUrl(previewUrl)
    : getDownloadUrl(hostedUrl);
  const documentActionsReady = state === "ready" && Boolean(previewUrl);
  const completionReady = documentActionsReady && renderedKey === requestKey;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (!shouldResolveDelivery) {
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    if (!documentDeliveryUrl) {
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    void fetch(documentDeliveryUrl, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Materi PDF tidak tersedia.");
        }
        const payload = await response.json().catch(() => null) as DeliveryPayload | null;
        if (
          !payload
          || (payload.sourceKind !== "managed" && payload.sourceKind !== "hosted")
          || payload.sourceKind !== document?.sourceKind
          || !isHttpDocumentUrl(payload.documentUrl)
          || (payload.downloadUrl !== undefined && !isHttpDocumentUrl(payload.downloadUrl))
        ) {
          throw new Error("Materi PDF tidak tersedia.");
        }
        return {
          downloadUrl: typeof payload.downloadUrl === "string" ? payload.downloadUrl : null,
          documentUrl: payload.documentUrl,
        };
      })
      .then(({ documentUrl, downloadUrl: nextDownloadUrl }) => {
        if (cancelled) return;
        setResolvedUrl(documentUrl);
        setResolvedDownloadUrl(nextDownloadUrl);
        setResolvedKey(requestKey);
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setFailedKey(requestKey);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [document?.sourceKind, documentDeliveryUrl, hostedUrl, isHosted, isManaged, requestKey, shouldResolveDelivery]);

  useEffect(() => {
    if (typeof globalThis.document === "undefined") return;

    const updateFullscreenState = () => {
      setIsFullscreen(globalThis.document.fullscreenElement === previewRef.current);
    };

    setFullscreenAvailable(Boolean(globalThis.document.fullscreenEnabled && previewRef.current?.requestFullscreen));
    updateFullscreenState();
    globalThis.document.addEventListener("fullscreenchange", updateFullscreenState);

    return () => globalThis.document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  const handleToggleFullscreen = async () => {
    const preview = previewRef.current;
    if (!preview || !fullscreenAvailable) return;

    try {
      if (globalThis.document.fullscreenElement === preview) {
        await globalThis.document.exitFullscreen();
        return;
      }

      if (globalThis.document.fullscreenElement) {
        await globalThis.document.exitFullscreen();
      }
      await preview.requestFullscreen();
    } catch {
      setIsFullscreen(false);
    }
  };

  const previewTitle = useMemo(
    () => `Preview PDF: ${title.trim() || documentName}`,
    [documentName, title],
  );

  return (
    <div
      ref={previewRef}
      className={cn(
        "flex w-full flex-col gap-4 p-4",
        className,
        isFullscreen && "h-screen min-h-0 bg-[var(--voyage-canvas)]",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-[var(--voyage-soft-border)] bg-white",
          isFullscreen && "min-h-0 flex-1 rounded-none border-0 bg-[var(--voyage-canvas)]",
        )}
      >
        {state === "loading" ? (
          <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[var(--voyage-muted-ink)] md:min-h-[34rem]">
            <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-[var(--voyage-leaf)] motion-reduce:animate-none" />
            <p className="font-semibold text-[var(--voyage-muted-ink)]">Menyiapkan PDF untuk dibaca…</p>
          </div>
        ) : state === "ready" && previewUrl ? (
          <StudentPdfDocument
            file={previewUrl}
            fullscreen={isFullscreen}
            key={requestKey}
            onError={() => setRenderedKey(null)}
            onReady={() => setRenderedKey(requestKey)}
            title={previewTitle}
          />
        ) : (
          <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[var(--voyage-muted-ink)] md:min-h-[34rem]">
            <FileText aria-hidden="true" className="size-9 text-[var(--voyage-muted-ink)]" />
            <p className="font-semibold text-[var(--voyage-muted-ink)]">PDF belum dapat ditampilkan.</p>
            <p className="max-w-[48ch] leading-6">{unavailableMessage}</p>
            {isManaged ? (
              <Button
                className="mt-1"
                onClick={() => setRequestVersion((version) => version + 1)}
                size="default"
                variant="brandOutline"
              >
                <RefreshCw className="size-4" />
                Coba lagi
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {documentActionsReady && (completionAction || actions || documentActionsReady) ? (
        <div className="flex items-center gap-2" role="group">
          {completionReady ? completionAction : null}
          {actions || documentActionsReady ? (
            <div aria-label={state === "ready" ? "Aksi dokumen PDF" : "Aksi bacaan"} className="flex shrink-0 items-center gap-1" role="group">
              {documentActionsReady ? (
                <>
                  <Tooltip>
                    <TooltipTrigger
                      render={(
                        <Button
                          aria-label="Buka PDF"
                          nativeButton={false}
                          render={<a aria-label="Buka PDF" href={previewUrl ?? ""} rel="noreferrer" target="_blank" />}
                          size="icon-lg"
                          title="Buka PDF"
                          variant="brandOutline"
                        />
                      )}
                    >
                      <ExternalLink aria-hidden="true" className="size-5" />
                    </TooltipTrigger>
                    <TooltipContent>Buka PDF</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={(
                        <Button
                          aria-label="Download PDF"
                          nativeButton={false}
                          render={<a aria-label="Download PDF" download={documentName} href={downloadUrl ?? previewUrl ?? ""} />}
                          size="icon-lg"
                          title="Download PDF"
                          variant="brandOutline"
                        />
                      )}
                    >
                      <Download aria-hidden="true" className="size-5" />
                    </TooltipTrigger>
                    <TooltipContent>Download PDF</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={(
                        <Button
                          aria-label={isFullscreen ? "Keluar layar penuh" : "Lihat layar penuh"}
                          disabled={!fullscreenAvailable}
                          onClick={handleToggleFullscreen}
                          size="icon-lg"
                          title={isFullscreen ? "Keluar layar penuh" : "Lihat layar penuh"}
                          variant="brandOutline"
                        />
                      )}
                    >
                      {isFullscreen ? (
                        <Minimize2 aria-hidden="true" className="size-5" />
                      ) : (
                        <Expand aria-hidden="true" className="size-5" />
                      )}
                    </TooltipTrigger>
                    <TooltipContent>
                      {isFullscreen ? "Keluar layar penuh" : "Lihat layar penuh"}
                    </TooltipContent>
                  </Tooltip>
                </>
              ) : null}
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-left text-xs leading-5 text-[var(--voyage-muted-ink)]">
        {state === "ready"
          ? "Jika pratinjau tidak muncul di browser atau ponselmu, buka atau download PDF menggunakan tombol di atas."
          : "Dokumen hanya ditampilkan setelah sumber PDF tersedia dan dapat diakses oleh siswa."}
      </p>
    </div>
  );
}

function getDownloadUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.pathname.startsWith("/api/materi-demo/")) {
      url.searchParams.set("download", "1");
      return url.toString();
    }
  } catch {
    return value;
  }

  return value;
}

export { StudentPdfPreview };

"use client";

import { Download, Expand, ExternalLink, FileText, LoaderCircle, Minimize2, RefreshCw } from "@/lib/icons";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import {
  isValidHostedPdfUrl,
  type MateriDocument,
} from "@/lib/materi/contract";
import { withMateriDocumentDeliveryMode } from "@/lib/materi/document-preview";
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

async function toggleDocumentFullscreen(preview: HTMLDivElement | null, fullscreenAvailable: boolean, onError: () => void) {
  if (!preview || !fullscreenAvailable) return;

  try {
    if (globalThis.document.fullscreenElement === preview) {
      await globalThis.document.exitFullscreen();
      return;
    }
    if (globalThis.document.fullscreenElement) await globalThis.document.exitFullscreen();
    await preview.requestFullscreen();
  } catch {
    onError();
  }
}

function getDocumentPreviewState({
  failedKey,
  isHosted,
  requestKey,
  resolvedKey,
  resolvedUrl,
  shouldResolveDelivery,
}: {
  failedKey: string | null;
  isHosted: boolean;
  requestKey: string;
  resolvedKey: string | null;
  resolvedUrl: string | null;
  shouldResolveDelivery: boolean;
}): DocumentPreviewState {
  if (!shouldResolveDelivery) return isHosted ? "ready" : "unavailable";
  if (failedKey === requestKey) return "unavailable";
  return resolvedKey === requestKey && resolvedUrl ? "ready" : "loading";
}

function getStudentPdfPreviewModel({
  document,
  documentDeliveryUrl,
  failedKey,
  requestVersion,
}: {
  document: MateriDocument | null;
  documentDeliveryUrl?: string;
  failedKey: string | null;
  requestVersion: number;
}) {
  const documentName = document?.originalName?.trim() || "Dokumen Materi";
  const isManaged = document?.sourceKind === "managed" && Boolean(document.managedAssetId);
  const hostedUrl = document?.url?.trim() || "";
  const isHosted = document?.sourceKind === "hosted" && isValidHostedPdfUrl(hostedUrl, document?.mimeType);
  const shouldResolveDelivery = Boolean(documentDeliveryUrl);
  const unavailableMessage = isManaged
    ? "Dokumen PDF managed belum dapat dibuka. Coba muat ulang halaman atau gunakan jalur kembali ke Materi."
    : "Dokumen PDF belum tersedia untuk dibaca. Kembali ke Materi untuk memilih unit lain.";
  const requestKey = `${documentDeliveryUrl ?? ""}:${hostedUrl}:${document?.managedAssetId ?? ""}:${requestVersion}`;
  const previewUrl = shouldResolveDelivery && documentDeliveryUrl ? withMateriDocumentDeliveryMode(documentDeliveryUrl, "pdf") : hostedUrl;
  const state = getDocumentPreviewState({ failedKey, isHosted, requestKey, resolvedKey: shouldResolveDelivery ? requestKey : null, resolvedUrl: previewUrl, shouldResolveDelivery });
  const downloadUrl = shouldResolveDelivery
    ? documentDeliveryUrl ? withMateriDocumentDeliveryMode(documentDeliveryUrl, "download") : null
    : getDownloadUrl(hostedUrl);

  return {
    completionReady: state === "ready" && Boolean(previewUrl),
    documentActionsReady: state === "ready" && Boolean(previewUrl),
    documentName,
    downloadUrl,
    isManaged,
    previewUrl,
    requestKey,
    state,
    unavailableMessage,
  };
}

function useStudentPdfPreviewController({
  document,
  documentDeliveryUrl,
  title,
}: Pick<StudentPdfPreviewProps, "document" | "documentDeliveryUrl" | "title">) {
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const fullscreenControlRef = useRef<HTMLButtonElement>(null);
  const previousFullscreenRef = useRef(false);
  const model = getStudentPdfPreviewModel({ document, documentDeliveryUrl, failedKey, requestVersion });

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

  useEffect(() => {
    if (isFullscreen !== previousFullscreenRef.current) {
      (fullscreenControlRef.current ?? previewRef.current)?.focus();
    }
    previousFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  const handleToggleFullscreen = async () => {
    await toggleDocumentFullscreen(previewRef.current, fullscreenAvailable, () => setIsFullscreen(false));
  };

  return {
    ...model,
    completionReady: model.completionReady && renderedKey === model.requestKey,
    failedKey,
    fullscreenAvailable,
    fullscreenControlRef,
    handleToggleFullscreen,
    isFullscreen,
    onPreviewError: () => { setFailedKey(model.requestKey); setRenderedKey(null); },
    onPreviewReady: () => setRenderedKey(model.requestKey),
    onRetry: () => setRequestVersion((version) => version + 1),
    previewRef,
    previewTitle: `Preview PDF: ${title.trim() || model.documentName}`,
  };
}

function StudentPdfPreviewCanvas({
  fullscreen,
  isManaged,
  onError,
  onReady,
  onRetry,
  previewTitle,
  previewUrl,
  requestKey,
  state,
  unavailableMessage,
}: {
  fullscreen: boolean;
  isManaged: boolean;
  onError: () => void;
  onReady: () => void;
  onRetry: () => void;
  previewTitle: string;
  previewUrl: string | null;
  requestKey: string;
  state: DocumentPreviewState;
  unavailableMessage: string;
}) {
  if (state === "loading") {
    return <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[var(--voyage-muted-ink)] md:min-h-[34rem]"><LoaderCircle aria-hidden="true" className="size-7 animate-spin text-[var(--voyage-leaf)] motion-reduce:animate-none" /><p className="font-semibold text-[var(--voyage-muted-ink)]">Menyiapkan PDF untuk dibaca…</p></div>;
  }

  if (state === "ready" && previewUrl) {
    return <StudentPdfDocument file={previewUrl} fullscreen={fullscreen} key={requestKey} onError={onError} onReady={onReady} title={previewTitle} />;
  }

  return (
    <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[var(--voyage-muted-ink)] md:min-h-[34rem]">
      <FileText aria-hidden="true" className="size-9 text-[var(--voyage-muted-ink)]" />
      <p className="font-semibold text-[var(--voyage-muted-ink)]">PDF belum dapat ditampilkan.</p>
      <p className="max-w-[48ch] leading-6">{unavailableMessage}</p>
      {isManaged ? <Button className="mt-1" onClick={onRetry} size="default" variant="outline"><RefreshCw className="size-4" />Coba lagi</Button> : null}
    </div>
  );
}

function StudentPdfPreviewActions({
  actions,
  completionAction,
  completionReady,
  documentActionsReady,
  documentName,
  downloadUrl,
  fullscreenAvailable,
  fullscreenControlRef,
  handleToggleFullscreen,
  isFullscreen,
  previewUrl,
}: {
  actions?: ReactNode;
  completionAction?: ReactNode;
  completionReady: boolean;
  documentActionsReady: boolean;
  documentName: string;
  downloadUrl: string | null;
  fullscreenAvailable: boolean;
  fullscreenControlRef: RefObject<HTMLButtonElement | null>;
  handleToggleFullscreen: () => void;
  isFullscreen: boolean;
  previewUrl: string | null;
}) {
  if (!documentActionsReady) return null;

  return (
    <div className="flex items-center gap-2" role="group">
      {completionReady ? completionAction : null}
      <div aria-label="Aksi dokumen PDF" className="flex shrink-0 items-center gap-1" role="group">
        <Tooltip>
          <TooltipTrigger render={<Button aria-label="Buka PDF" nativeButton={false} render={<a aria-label="Buka PDF" href={previewUrl ?? ""} rel="noreferrer" target="_blank" />} size="icon-lg" title="Buka PDF" variant="outline" />}>
            <ExternalLink aria-hidden="true" className="size-5" />
          </TooltipTrigger>
          <TooltipContent>Buka PDF</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button aria-label="Unduh PDF" nativeButton={false} render={<a aria-label="Unduh PDF" download={documentName} href={downloadUrl ?? previewUrl ?? ""} />} size="icon-lg" title="Unduh PDF" variant="outline" />}>
            <Download aria-hidden="true" className="size-5" />
          </TooltipTrigger>
          <TooltipContent>Unduh PDF</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button ref={fullscreenControlRef} aria-label={isFullscreen ? "Keluar layar penuh" : "Lihat layar penuh"} disabled={!fullscreenAvailable} onClick={handleToggleFullscreen} size="icon-lg" title={isFullscreen ? "Keluar layar penuh" : "Lihat layar penuh"} variant="outline" />}>
            {isFullscreen ? <Minimize2 aria-hidden="true" className="size-5" /> : <Expand aria-hidden="true" className="size-5" />}
          </TooltipTrigger>
          <TooltipContent>{isFullscreen ? "Keluar layar penuh" : "Lihat layar penuh"}</TooltipContent>
        </Tooltip>
        {actions}
      </div>
    </div>
  );
}

function StudentPdfPreviewFooterMessage({ state }: { state: DocumentPreviewState }) {
  return <p className="text-left text-xs leading-5 text-[var(--voyage-muted-ink)]">{state === "ready" ? "Jika pratinjau tidak muncul di browser atau ponselmu, buka atau unduh PDF lewat tombol di atas." : "Dokumen hanya ditampilkan setelah sumber PDF tersedia dan dapat diakses oleh siswa."}</p>;
}

function StudentPdfPreview({
  actions,
  className,
  completionAction,
  document,
  documentDeliveryUrl,
  title,
}: StudentPdfPreviewProps) {
  const {
    completionReady,
    documentActionsReady,
    documentName,
    downloadUrl,
    fullscreenAvailable,
    fullscreenControlRef,
    handleToggleFullscreen,
    isFullscreen,
    isManaged,
    onPreviewError,
    onPreviewReady,
    onRetry,
    previewRef,
    previewTitle,
    previewUrl,
    requestKey,
    state,
    unavailableMessage,
  } = useStudentPdfPreviewController({ document, documentDeliveryUrl, title });

  return (
    <div
      aria-label={previewTitle}
      ref={previewRef}
      role="region"
      tabIndex={-1}
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
        <StudentPdfPreviewCanvas fullscreen={isFullscreen} isManaged={isManaged} onError={onPreviewError} onReady={onPreviewReady} onRetry={onRetry} previewTitle={previewTitle} previewUrl={previewUrl} requestKey={requestKey} state={state} unavailableMessage={unavailableMessage} />
        {isFullscreen ? (
          <Tooltip>
            <TooltipTrigger render={<Button ref={fullscreenControlRef} aria-label="Keluar layar penuh" className="absolute top-3 right-3 z-10" onClick={handleToggleFullscreen} size="icon-lg" title="Keluar layar penuh" variant="outline" />}>
              <Minimize2 aria-hidden="true" className="size-5" />
            </TooltipTrigger>
            <TooltipContent>Keluar layar penuh</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {!isFullscreen ? (
        <>
          <StudentPdfPreviewActions actions={actions} completionAction={completionAction} completionReady={completionReady} documentActionsReady={documentActionsReady} documentName={documentName} downloadUrl={downloadUrl} fullscreenAvailable={fullscreenAvailable} fullscreenControlRef={fullscreenControlRef} handleToggleFullscreen={handleToggleFullscreen} isFullscreen={isFullscreen} previewUrl={previewUrl} />
          <StudentPdfPreviewFooterMessage state={state} />
        </>
      ) : null}
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

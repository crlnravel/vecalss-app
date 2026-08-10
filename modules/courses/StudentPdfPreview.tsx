"use client";

import { Download, ExternalLink, FileText, LoaderCircle, RefreshCw } from "@/lib/icons";
import { useEffect, useMemo, useState } from "react";

import {
  isValidHostedPdfUrl,
  type MateriDocument,
} from "@/lib/materi/contract";
import { cn } from "@/lib/utils";

type DocumentPreviewState = "loading" | "ready" | "unavailable";

type StudentPdfPreviewProps = {
  className?: string;
  document: MateriDocument | null;
  documentDeliveryUrl?: string;
  title: string;
};

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
  className,
  document,
  documentDeliveryUrl,
  title,
}: StudentPdfPreviewProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  const documentName = document?.originalName?.trim() || "Dokumen Materi";
  const isManaged = document?.sourceKind === "managed" && Boolean(document.managedAssetId);
  const hostedUrl = document?.url?.trim() || "";
  const isHosted = document?.sourceKind === "hosted" && isValidHostedPdfUrl(hostedUrl, document?.mimeType);
  const shouldResolveDelivery = Boolean(documentDeliveryUrl);
  const unavailableMessage = isManaged
    ? "Dokumen PDF managed belum dapat dibuka. Coba muat ulang halaman atau gunakan jalur kembali ke Materi."
    : "Dokumen PDF belum tersedia untuk dibaca. Kembali ke Materi untuk memilih unit lain.";
  const requestKey = `${documentDeliveryUrl ?? ""}:${requestVersion}`;
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
  const downloadUrl = shouldResolveDelivery ? resolvedDownloadUrl ?? previewUrl : hostedUrl;

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

  const iframeTitle = useMemo(
    () => `Preview PDF: ${title.trim() || documentName}`,
    [documentName, title],
  );

  return (
    <div className={cn("flex w-full flex-col gap-4 p-4", className)}>
      <div className="relative overflow-hidden rounded-2xl border border-[#d9e5de] bg-white">
        {state === "loading" ? (
          <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[#66766e] md:min-h-[34rem]">
            <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-[#2f8a5d] motion-reduce:animate-none" />
            <p className="font-semibold text-[#285641]">Menyiapkan PDF untuk dibaca…</p>
          </div>
        ) : state === "ready" && previewUrl ? (
          <iframe
            className="h-[min(68vh,52rem)] min-h-[22rem] w-full bg-white md:min-h-[34rem]"
            sandbox=""
            src={previewUrl}
            title={iframeTitle}
          />
        ) : (
          <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[#66766e] md:min-h-[34rem]">
            <FileText aria-hidden="true" className="size-9 text-[#9ab4a4]" />
            <p className="font-semibold text-[#285641]">PDF belum dapat ditampilkan.</p>
            <p className="max-w-[48ch] leading-6">{unavailableMessage}</p>
            {isManaged ? (
              <button
                className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#c8dfd0] bg-white px-4 text-sm font-semibold text-[#285641] hover:bg-[#f3faf5] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30"
                onClick={() => setRequestVersion((version) => version + 1)}
                type="button"
              >
                <RefreshCw className="size-4" />
                Coba lagi
              </button>
            ) : null}
          </div>
        )}
      </div>

      {state === "ready" && previewUrl ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#c8dfd0] bg-white px-4 text-sm font-semibold text-[#285641] hover:bg-[#f3faf5] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30"
            href={previewUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="size-4" />
            Buka PDF
          </a>
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#176b4d] px-4 text-sm font-semibold text-white hover:bg-[#0f563b] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30"
            download={documentName}
            href={downloadUrl ?? previewUrl}
          >
            <Download className="size-4" />
            Download PDF
          </a>
        </div>
      ) : null}

      <p className="text-center text-xs leading-5 text-[#718077]">
        {state === "ready"
          ? "Jika pratinjau tidak muncul di browser atau ponselmu, buka atau download PDF menggunakan tombol di atas."
          : "Dokumen hanya ditampilkan setelah sumber PDF tersedia dan dapat diakses oleh siswa."}
      </p>
    </div>
  );
}

export { StudentPdfPreview };

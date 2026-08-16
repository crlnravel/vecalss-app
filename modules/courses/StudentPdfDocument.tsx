"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { cn } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type StudentPdfDocumentProps = {
  file: string;
  fullscreen?: boolean;
  title: string;
};

function StudentPdfDocument({ file, fullscreen = false, title }: StudentPdfDocumentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => setContainerWidth(container.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.max(240, Math.min(containerWidth - 32, 900));

  return (
    <div
      ref={containerRef}
      aria-label={`Pratinjau PDF: ${title}`}
      className={cn(
        "h-[min(68vh,52rem)] min-h-[22rem] overflow-y-auto overscroll-contain bg-[#f7faf8] p-3 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30 sm:p-4 md:min-h-[34rem]",
        fullscreen && "h-full min-h-0",
      )}
      role="region"
      tabIndex={0}
    >
      <Document
        file={file}
        loading={(
          <div className="flex min-h-[22rem] items-center justify-center px-6 text-center text-sm font-semibold text-[#285641]">
            Menyiapkan halaman PDF…
          </div>
        )}
        error={(
          <div className="flex min-h-[22rem] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[#66766e]">
            <p className="font-semibold text-[#285641]">PDF belum dapat dirender di pratinjau.</p>
            <p>Gunakan tombol buka atau download di bawah untuk mengakses dokumen.</p>
          </div>
        )}
        onLoadSuccess={({ numPages: loadedNumPages }) => setNumPages(loadedNumPages)}
      >
        {numPages > 0 ? (
          <div aria-label={title} className="flex flex-col items-center gap-4">
            {Array.from({ length: numPages }, (_, index) => (
              <Page
                className="max-w-full overflow-hidden rounded-xl bg-white shadow-[0_14px_32px_-28px_rgba(23,107,77,0.55)] ring-1 ring-[#d9e5de]"
                key={`${file}-${index + 1}`}
                pageNumber={index + 1}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                width={pageWidth}
              />
            ))}
          </div>
        ) : null}
      </Document>
    </div>
  );
}

export { StudentPdfDocument };

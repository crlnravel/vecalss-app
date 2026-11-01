"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUploadSlot } from "@/components/ui/file-upload-slot";
import { validateMediaUpload } from "@/lib/media/domain";
import type { MediaAssetDto, MediaUploadTicket } from "@/lib/media/types";
import { getMediaErrorMessage, postMediaAction, putFile } from "@/modules/media/helpers";

type UploadedMateriPdf = Pick<MediaAssetDto, "id" | "mimeType" | "name">;

export function MateriPdfUploadDialog({
  onOpenChange,
  onUploaded,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onUploaded: (asset: UploadedMateriPdf) => void;
  open: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const runRef = useRef(0);

  useEffect(() => {
    if (open) return;
    runRef.current += 1;
    setFile(null);
    setProgress(null);
    setError(null);
    setUploading(false);
  }, [open]);

  async function upload(nextFile: File | null) {
    setFile(nextFile);
    setError(null);
    setProgress(null);
    if (!nextFile) return;

    const validation = validateMediaUpload({ fileName: nextFile.name, mimeType: nextFile.type, sizeBytes: nextFile.size });
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }
    if (nextFile.type !== "application/pdf") {
      setError("Pilih file berformat PDF.");
      return;
    }

    const run = ++runRef.current;
    setUploading(true);
    setProgress(0);
    try {
      const ticket = await postMediaAction<MediaUploadTicket>("kapten", {
        action: "request-upload",
        fileName: nextFile.name,
        folderId: null,
        mimeType: nextFile.type,
        sizeBytes: nextFile.size,
      });
      await putFile(nextFile, ticket.uploadUrl, (value) => {
        if (runRef.current === run) setProgress(value);
      });
      await postMediaAction("kapten", { action: "finalize-upload", assetId: ticket.assetId, height: null, width: null });
      if (runRef.current !== run) return;
      onUploaded({ id: ticket.assetId, mimeType: nextFile.type, name: nextFile.name });
      onOpenChange(false);
    } catch (uploadError) {
      if (runRef.current !== run) return;
      setError(getMediaErrorMessage(uploadError, "PDF belum berhasil diunggah. Periksa koneksi lalu coba lagi."));
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent variant="info">
        <DialogHeader>
          <DialogTitle>Unggah PDF Materi</DialogTitle>
          <DialogDescription>Pilih file PDF dari perangkatmu. Ukuran maksimal 15 MB.</DialogDescription>
        </DialogHeader>
        <FileUploadSlot
          accept="application/pdf,.pdf"
          disabled={uploading}
          file={file}
          maxSizeLabel="PDF · Maks. 15 MB"
          onCancelUpload={() => onOpenChange(false)}
          onChange={(nextFile) => void upload(nextFile)}
          progress={progress}
          uploadLabel="Mengunggah PDF"
          uploading={uploading}
        />
        {error ? <p aria-live="polite" className="text-xs leading-5 text-student-status-danger-fg" role="alert">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Camera, Trash2, Upload } from "@/lib/icons";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ProfilePhotoEditorProps = {
  initials: string;
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read selected image."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read selected image."));
    };

    reader.readAsDataURL(file);
  });
}

function ProfilePhotoEditor({ initials }: ProfilePhotoEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [draftPhotoSrc, setDraftPhotoSrc] = useState<string | null>(null);
  const [draftFileName, setDraftFileName] = useState<string | null>(null);
  const [committedPhotoSrc, setCommittedPhotoSrc] = useState<string | null>(
    null,
  );

  function syncDraftWithCommittedPhoto() {
    setDraftPhotoSrc(committedPhotoSrc);
    setDraftFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function openUploadDialog() {
    syncDraftWithCommittedPhoto();
    setIsUploadDialogOpen(true);
  }

  function closeUploadDialog() {
    setIsUploadDialogOpen(false);
    syncDraftWithCommittedPhoto();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const nextPreview = await readFileAsDataUrl(file);
    setDraftPhotoSrc(nextPreview);
    setDraftFileName(file.name);
  }

  function handleSavePhoto() {
    if (!draftPhotoSrc) {
      return;
    }

    setCommittedPhotoSrc(draftPhotoSrc);
    setIsUploadDialogOpen(false);
  }

  return (
    <div className="flex flex-col items-center gap-3 pt-2">
      <div className="group/photo relative">
        <Avatar className="size-32 overflow-hidden border border-primary-100 shadow-[0_18px_44px_-24px_rgba(1,76,56,0.32)]">
          {committedPhotoSrc ? (
            <AvatarImage alt="Foto profil" src={committedPhotoSrc} />
          ) : null}
          <AvatarFallback className="bg-[linear-gradient(135deg,#d7ebe3_0%,#7abda8_100%)] text-2xl font-semibold text-primary-800 transition duration-200 group-hover/photo:brightness-[0.72] group-focus-within/photo:brightness-[0.72]">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="pointer-events-none absolute inset-0 rounded-full bg-secondary-950/0 transition-colors duration-200 group-hover/photo:bg-secondary-950/28 group-focus-within/photo:bg-secondary-950/28" />

        <TooltipProvider delay={2400}>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label="Ganti foto profil"
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-transparent text-white opacity-0 transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 group-hover/photo:opacity-100"
                  onClick={openUploadDialog}
                  type="button"
                >
                  <Camera className="size-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]" />
                </button>
              }
            />
            <TooltipContent side="top">
              Ganti foto profil
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          aria-label="Hapus foto"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            openUploadDialog();
            return;
          }

          closeUploadDialog();
        }}
        open={isUploadDialogOpen}
      >
        <DialogContent className="max-w-[32rem] border border-primary-100 bg-[#fbfffd] shadow-[0_24px_80px_-30px_rgba(1,76,56,0.45)]" variant="default">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-secondary-950">
              Unggah foto profil
            </DialogTitle>
            <DialogDescription>Pilih gambar yang ingin digunakan sebagai foto profil.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="rounded-3xl border border-dashed border-primary-200 bg-white p-4">
              <div className="flex items-center gap-4">
                <Avatar className="size-20 shrink-0 border border-primary-100">
                  {draftPhotoSrc ? (
                    <AvatarImage alt="Pratinjau foto profil" src={draftPhotoSrc} />
                  ) : null}
                  <AvatarFallback className="bg-[linear-gradient(135deg,#d7ebe3_0%,#7abda8_100%)] text-lg font-semibold text-primary-800">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-secondary-900">
                    {draftFileName ?? "Belum ada file yang dipilih"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-secondary-500">
                    Resolusi yang tajam akan terlihat paling bagus di avatar.
                  </p>
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              accept="image/*"
              aria-label="Pilih foto profil"
              className="sr-only"
              onChange={handleFileChange}
              type="file"
            />

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="brandOutline"
              >
                <Upload className="size-4" />
                Pilih file
              </Button>

              <Button
                disabled={!draftPhotoSrc}
                onClick={handleSavePhoto}
                size="sm"
                type="button"
                variant="brand"
              >
                Gunakan foto ini
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { ProfilePhotoEditor };

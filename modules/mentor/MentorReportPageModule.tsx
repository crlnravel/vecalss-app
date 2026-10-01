"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { FileUploadSlot } from "@/components/ui/file-upload-slot";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { showToast } from "@/components/ui/toast";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { submitMentorReportAction } from "@/modules/mentor/report-actions";

const reportFeatureOptions = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Materi", value: "materi" },
  { label: "Video", value: "video" },
  { label: "Kuis", value: "kuis" },
  { label: "Bank Soal Kuis", value: "bank_soal_kuis" },
  { label: "Tryout", value: "tryout" },
  { label: "Bank Soal Tryout", value: "bank_soal_tryout" },
  { label: "Media", value: "media" },
  { label: "Profil", value: "profile" },
] as const;

const MAX_REPORT_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "pdf"]);

type SelectedReportAttachment = { file: File; id: string };

function getAttachmentExtension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function isImageAttachment(file: File) {
  return ["jpg", "jpeg", "png", "gif", "webp"].includes(getAttachmentExtension(file));
}

function formatAttachmentSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
}

function ReportAttachmentImagePreview({ file }: { file: File }) {
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previewElement = previewRef.current;
    if (!isImageAttachment(file) || !previewElement) return;

    const objectUrl = URL.createObjectURL(file);
    previewElement.style.backgroundImage = `url("${objectUrl}")`;
    return () => {
      previewElement.style.backgroundImage = "";
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  if (!isImageAttachment(file)) return null;

  return (
    <div
      aria-label={`Pratinjau ${file.name}`}
      className="aspect-square size-20 rounded-control border border-primary-100 bg-center bg-cover bg-no-repeat sm:size-24"
      ref={previewRef}
      role="img"
    />
  );
}

function MentorReportPageModule({ session }: { session: SessionContext }) {
  const attachmentInputId = useId();
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentIdSequence = useRef(0);
  const attachmentsRef = useRef<SelectedReportAttachment[]>([]);
  const [feature, setFeature] = useState("");
  const [attachments, setAttachments] = useState<SelectedReportAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateAttachments(nextAttachments: SelectedReportAttachment[]) {
    attachmentsRef.current = nextAttachments;
    setAttachments(nextAttachments);
  }

  function handleFilesSelected(files: File[]) {
    const nextAttachments = [...attachmentsRef.current];
    const rejectionMessages = new Set<string>();
    let totalSize = nextAttachments.reduce((total, item) => total + item.file.size, 0);

    for (const file of files) {
      if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(getAttachmentExtension(file))) {
        rejectionMessages.add("Pilih file JPG, PNG, GIF, WebP, atau PDF.");
        continue;
      }
      if (file.size === 0) {
        rejectionMessages.add("File kosong tidak dapat dilampirkan.");
        continue;
      }
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        rejectionMessages.add("Setiap file maksimal 10 MB.");
        continue;
      }
      if (nextAttachments.length >= MAX_REPORT_ATTACHMENTS) {
        rejectionMessages.add("Maksimal 10 file per laporan.");
        continue;
      }
      if (totalSize + file.size > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
        rejectionMessages.add("Total ukuran lampiran maksimal 50 MB.");
        continue;
      }

      nextAttachments.push({ file, id: `${attachmentInputId}-${attachmentIdSequence.current}` });
      attachmentIdSequence.current += 1;
      totalSize += file.size;
    }

    if (nextAttachments.length !== attachmentsRef.current.length) updateAttachments(nextAttachments);
    if (rejectionMessages.size > 0) {
      showToast(`Sebagian file tidak ditambahkan: ${Array.from(rejectionMessages).join(" ")}`, { variant: "error" });
    }
  }

  function removeAttachment(id: string) {
    updateAttachments(attachmentsRef.current.filter((item) => item.id !== id));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (isSubmitting || !form.reportValidity()) return;

    setIsSubmitting(true);

    try {
      const formData = new FormData(form);
      formData.delete("attachment");
      for (const item of attachmentsRef.current) {
        formData.append("attachment", item.file);
      }

      const result = await submitMentorReportAction(formData);

      showToast(result.message, {
        variant: result.ok ? "success" : "error",
      });

      if (result.ok) {
        form.reset();
        setFeature("");
        if (attachmentInputRef.current) attachmentInputRef.current.value = "";
        updateAttachments([]);
      }
    } catch {
      showToast("Laporan belum terkirim. Coba lagi.", { variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Laporan"
      breadcrumbLabel="Laporan"
      mainClassName="max-w-[960px] gap-6"
      session={session}
      sidebarAppearance="reference"
    >
      <ReferencePageHeader title="Laporan" />

      <form className="min-w-0" onSubmit={handleSubmit}>
        <ReferenceSurface
          aria-labelledby="mentor-report-form-title"
          as="section"
          className="grid min-w-0 gap-6 p-5 sm:p-7"
        >
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel
                className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                htmlFor="mentor-report-title"
                required
              >
                Judul
              </FieldLabel>
              <FieldInput
                autoComplete="off"
                className={REFERENCE_CONTROL_CLASS_NAMES.input}
                id="mentor-report-title"
                maxLength={160}
                name="title"
                placeholder="Ringkas masalah atau usulan Anda"
                disabled={isSubmitting}
                required
              />
            </Field>

            <Field>
              <FieldLabel
                className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                htmlFor="mentor-report-feature"
                required
              >
                Fitur
              </FieldLabel>
              <ReferenceSelect
                id="mentor-report-feature"
                name="feature"
                onValueChange={setFeature}
                options={reportFeatureOptions}
                placeholder="Pilih fitur"
                disabled={isSubmitting}
                required
                value={feature}
              />
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel
                className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                htmlFor="mentor-report-url"
                required
              >
                URL terkait
              </FieldLabel>
              <FieldInput
                aria-describedby="mentor-report-url-help"
                autoComplete="off"
                className={REFERENCE_CONTROL_CLASS_NAMES.input}
                id="mentor-report-url"
                inputMode="url"
                maxLength={2048}
                name="url"
                placeholder="Tautan halaman terkait"
                disabled={isSubmitting}
                required
                type="text"
              />
              <p
                className="text-xs leading-5 text-secondary-500"
                id="mentor-report-url-help"
              >
                Taruh url (mis.
                https://vecalss-app.vercel.app/mentor/quiz/subject/penalaran-umum)
              </p>
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel
                className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                htmlFor="mentor-report-description"
                required
              >
                Laporan bug/Saran fitur
              </FieldLabel>
              <FieldTextarea
                className={cn(
                  REFERENCE_CONTROL_CLASS_NAMES.input,
                  "min-h-40 resize-y",
                )}
                disabled={isSubmitting}
                id="mentor-report-description"
                maxLength={10000}
                name="description"
                placeholder="Jelaskan masalah yang dialami atau perubahan yang Anda usulkan."
                required
              />
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel
                className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                htmlFor={attachmentInputId}
              >
                Lampiran
              </FieldLabel>
              <div className="grid min-w-0 gap-3">
                {attachments.length > 0 ? (
                  <p aria-live="polite" className="text-xs text-secondary-600" role="status">
                    {attachments.length} file siap dilampirkan.
                  </p>
                ) : null}
                {attachments.map(({ file, id }) => (
                  <div
                    className="grid min-w-0 gap-3 rounded-field border border-primary-100 bg-white p-3 sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-center"
                    key={id}
                  >
                    <ReportAttachmentImagePreview file={file} />
                    <div className="grid min-w-0 gap-2">
                      <p className="text-xs text-secondary-600">{formatAttachmentSize(file.size)}</p>
                      <FileUploadSlot
                        disabled={isSubmitting}
                        file={file}
                        maxSizeLabel="Gunakan tombol Hapus untuk melepas file ini."
                        onChange={(nextFile) => {
                          if (!nextFile) removeAttachment(id);
                        }}
                      />
                    </div>
                  </div>
                ))}
                <FileUploadSlot
                  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                  disabled={isSubmitting}
                  dropZoneClassName="min-h-44 sm:min-h-64"
                  file={null}
                  id={attachmentInputId}
                  inputRef={attachmentInputRef}
                  maxSizeLabel="JPG, PNG, GIF, WebP, atau PDF. Maks. 10 file, 10 MB per file, total 50 MB."
                  multiple
                  onChange={() => {}}
                  onFilesSelected={handleFilesSelected}
                />
              </div>
            </Field>
          </div>

          <div className="flex justify-end pt-5">
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={isSubmitting}
              type="submit"
              variant="default"
            >
              {isSubmitting ? "Mengirim…" : "Kirim laporan"}
            </Button>
          </div>
        </ReferenceSurface>
      </form>
    </MentorWorkspaceShell>
  );
}

export { MentorReportPageModule };

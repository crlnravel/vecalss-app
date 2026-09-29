"use client";

import { useRef, useState, type FormEvent } from "react";

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
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { showToast } from "@/components/ui/toast";
import { Upload } from "@/lib/icons";
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

function MentorReportPageModule({ session }: { session: SessionContext }) {
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [feature, setFeature] = useState("");
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (isSubmitting || !form.reportValidity()) return;

    setIsSubmitting(true);

    try {
      const formData = new FormData(form);
      if (!attachmentInputRef.current?.files?.length) {
        formData.delete("attachment");
      }

      const result = await submitMentorReportAction(formData);

      showToast(result.message, {
        variant: result.ok ? "success" : "error",
      });

      if (result.ok) {
        form.reset();
        setFeature("");
        setAttachmentName(null);
      }
    } catch {
      showToast("Laporan belum terkirim. Coba lagi.", { variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearAttachment() {
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
    setAttachmentName(null);
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Report"
      breadcrumbLabel="Report"
      mainClassName="max-w-[960px] gap-6"
      session={session}
      sidebarAppearance="reference"
    >
      <ReferencePageHeader title="Report" />

      <form className="min-w-0" onSubmit={handleSubmit}>
        <ReferenceSurface
          aria-labelledby="mentor-report-form-title"
          as="section"
          className="grid min-w-0 gap-6 p-5 sm:p-7"
        >
          <div className="space-y-2">
            <h2
              className="font-heading text-xl leading-tight font-semibold tracking-[-0.025em] text-secondary-900"
              id="mentor-report-form-title"
            >
              Detail laporan
            </h2>
            <p className="max-w-[58ch] text-sm leading-6 text-secondary-500">
              Isi form ini untuk melaporkan masalah atau mengusulkan perbaikan.
            </p>
          </div>

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
                Tempel tautan penuh atau rute halaman, misalnya /mentor/materi.
              </p>
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel
                className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                htmlFor="mentor-report-description"
                required
              >
                Apa yang terjadi?
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
                htmlFor="mentor-report-attachment"
              >
                Lampiran
              </FieldLabel>
              <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center">
                <input
                  aria-describedby="mentor-report-attachment-help"
                  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                  className="peer sr-only"
                  id="mentor-report-attachment"
                  name="attachment"
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setAttachmentName(event.currentTarget.files?.[0]?.name ?? null);
                  }}
                  ref={attachmentInputRef}
                  type="file"
                />
                <label
                  className={cn(
                    REFERENCE_CONTROL_CLASS_NAMES.file,
                    isSubmitting
                      ? "cursor-not-allowed opacity-55"
                      : "cursor-pointer peer-focus-visible:border-primary-500/65 peer-focus-visible:ring-4 peer-focus-visible:ring-primary-700/15",
                  )}
                  htmlFor="mentor-report-attachment"
                >
                  <Upload aria-hidden="true" className="size-4 text-primary-800" />
                  <span>Pilih file</span>
                </label>
                <p
                  className="text-sm leading-6 text-secondary-500"
                  id="mentor-report-attachment-help"
                >
                  JPG, PNG, GIF, WebP, atau PDF; maksimal 10 MB.
                </p>
              </div>

              {attachmentName ? (
                <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 break-all text-sm leading-6 text-secondary-700">
                    {attachmentName}
                  </p>
                  <Button
                    className="min-h-11 shrink-0 self-start sm:self-auto"
                    onClick={clearAttachment}
                    disabled={isSubmitting}
                    size="sm"
                    type="button"
                    variant="brandOutline"
                  >
                    Hapus lampiran
                  </Button>
                </div>
              ) : null}
            </Field>
          </div>

          <div className="flex justify-end border-t border-primary-100 pt-5">
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={isSubmitting}
              type="submit"
              variant="brand"
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

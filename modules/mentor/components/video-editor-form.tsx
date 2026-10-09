"use client";

import { ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  VIDEO_DESCRIPTION_MAX_LENGTH,
  VIDEO_TITLE_MAX_LENGTH,
  type VideoInputFieldErrors,
} from "@/lib/video/contract";
import type { VideoGalleryItem } from "@/modules/video/video-gallery-data";
import { videoFilters } from "@/modules/video/video-gallery-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import type { FormEvent } from "react";

type VideoDraft = Pick<
  VideoGalleryItem,
  "description" | "subtest" | "title" | "youtubeUrl"
>;

type VideoDraftTextField = "description" | "subtest" | "title" | "youtubeUrl";

const emptyVideoDraft: VideoDraft = {
  description: "",
  subtest: "PK",
  title: "",
  youtubeUrl: "",
};

function VideoEditorForm({
  draft,
  error,
  idPrefix = "kapten-video",
  isPending,
  onChange,
  onSubmit,
  submitLabel,
}: {
  draft: VideoDraft;
  error: string | null;
  idPrefix?: string;
  isPending: boolean;
  onChange: (field: VideoDraftTextField, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
}) {
  const fieldErrors: VideoInputFieldErrors = {};
  if (error?.toLocaleLowerCase("id-ID").includes("judul")) {
    fieldErrors.title = error;
  }
  if (error?.toLocaleLowerCase("id-ID").includes("youtube")) {
    fieldErrors.youtubeUrl = error;
  }
  if (error?.toLocaleLowerCase("id-ID").includes("subtes")) {
    fieldErrors.subtest = error;
  }
  if (error?.toLocaleLowerCase("id-ID").includes("deskripsi")) {
    fieldErrors.description = error;
  }

  return (
    <form className="grid gap-6" onSubmit={onSubmit} noValidate>
      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor={`${idPrefix}-title`}
          required
        >
          Judul video
        </FieldLabel>
        <FieldInput
          aria-describedby={fieldErrors.title ? `${idPrefix}-title-error` : undefined}
          aria-invalid={Boolean(fieldErrors.title)}
          className={REFERENCE_CONTROL_CLASS_NAMES.input}
          disabled={isPending}
          id={`${idPrefix}-title`}
          maxLength={VIDEO_TITLE_MAX_LENGTH}
          onChange={(event) => onChange("title", event.target.value)}
          placeholder="Contoh: Strategi Cepat Menjawab Soal PU"
          required
          value={draft.title}
        />
        <FieldError error={fieldErrors.title} id={`${idPrefix}-title-error`} />
      </Field>

      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor={`${idPrefix}-url`}
          required
        >
          Tautan YouTube
        </FieldLabel>
        <FieldInput
          aria-describedby={fieldErrors.youtubeUrl ? `${idPrefix}-url-error` : undefined}
          aria-invalid={Boolean(fieldErrors.youtubeUrl)}
          className={REFERENCE_CONTROL_CLASS_NAMES.input}
          disabled={isPending}
          id={`${idPrefix}-url`}
          onChange={(event) => onChange("youtubeUrl", event.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          required
          type="url"
          value={draft.youtubeUrl}
        />
        <FieldError error={fieldErrors.youtubeUrl} id={`${idPrefix}-url-error`} />
      </Field>

      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor={`${idPrefix}-subtest`}
          required
        >
          Subtes
        </FieldLabel>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-describedby={fieldErrors.subtest ? `${idPrefix}-subtest-error` : undefined}
            aria-invalid={Boolean(fieldErrors.subtest)}
            aria-label="Pilih subtes video"
            className={cn(
              REFERENCE_CONTROL_CLASS_NAMES.select,
              "w-full",
              fieldErrors.subtest && "border-student-status-danger-border",
            )}
            disabled={isPending}
            id={`${idPrefix}-subtest`}
            render={<Button type="button" variant="outline" />}
          >
            <span>{draft.subtest}</span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-secondary-500"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-(--anchor-width)"
          >
            <DropdownMenuRadioGroup
              onValueChange={(value) => onChange("subtest", value)}
              value={draft.subtest}
            >
              {videoFilters.slice(1).map((subtest) => (
                <DropdownMenuRadioItem
                  disabled={isPending}
                  key={subtest}
                  value={subtest}
                >
                  {subtest}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <FieldError error={fieldErrors.subtest} id={`${idPrefix}-subtest-error`} />
      </Field>

      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor={`${idPrefix}-description`}
        >
          Deskripsi singkat
        </FieldLabel>
        <FieldTextarea
          aria-describedby={fieldErrors.description ? `${idPrefix}-description-error` : undefined}
          aria-invalid={Boolean(fieldErrors.description)}
          className={cn(
            REFERENCE_CONTROL_CLASS_NAMES.input,
            "min-h-28 resize-y",
          )}
          disabled={isPending}
          id={`${idPrefix}-description`}
          maxLength={VIDEO_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => onChange("description", event.target.value)}
          placeholder="Jelaskan isi video secara singkat untuk membantu siswa memilih materi."
          value={draft.description}
        />
        <FieldError
          error={fieldErrors.description}
          id={`${idPrefix}-description-error`}
        />
      </Field>

      {error && Object.keys(fieldErrors).length === 0 ? (
        <FieldError error={error} id={`${idPrefix}-form-error`} />
      ) : null}

      <div>
        <Button
          className="min-h-14 w-full"
          disabled={isPending}
          type="submit"
          variant="default"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export {
  emptyVideoDraft,
  VideoEditorForm,
};
export type { VideoDraft, VideoDraftTextField };

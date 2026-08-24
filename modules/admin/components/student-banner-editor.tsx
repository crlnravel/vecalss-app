"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import type { FormState } from "@/modules/auth/form-state";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import { BookOpen, Gauge, House, ListChecks, type AppIcon } from "@/lib/icons";
import {
  resolveStudentBannerText,
  type StudentBannerContent,
  type StudentBannerKey,
  type StudentBannerSet,
} from "@/lib/student/banner-content";
import { buildAdminStudentPreviewRoute } from "@/lib/student/preview-routes";

import { ADMIN_CARD_CLASS_NAME } from "../admin-ui-contract";
import { SyntaxHighlightedTextarea } from "./syntax-highlighted-field";

type StudentBannerAction = (
  previousState: FormState,
  formData: FormData,
) => Promise<FormState>;

const bannerDefinitions: Array<{
  description: string;
  icon: AppIcon;
  key: StudentBannerKey;
  label: string;
  route: string;
}> = [
  {
    description: "Main student banner.",
    icon: House,
    key: "beranda",
    label: "Beranda",
    route: "/dashboard",
  },
  {
    description: "Materials banner.",
    icon: BookOpen,
    key: "materi",
    label: "Materi",
    route: "/courses",
  },
  {
    description: "Quiz banner.",
    icon: ListChecks,
    key: "kuis",
    label: "Kuis",
    route: "/quiz",
  },
  {
    description: "Tryout banner.",
    icon: Gauge,
    key: "tryout",
    label: "Tryout",
    route: "/tryout",
  },
];

const previewVariables = {
  firstName: "Alya",
  target: "Kedokteran UI",
};

function toFormFields(banners: StudentBannerSet, version: string | null) {
  return Object.fromEntries(
    [
      ["version", version ?? ""],
      ...bannerDefinitions.flatMap(({ key }) => [
        [`${key}.title`, banners[key].title],
        [`${key}.description`, banners[key].description],
      ]),
    ],
  );
}

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readBannersFromForm(form: HTMLFormElement) {
  const formData = new FormData(form);

  return {
    banners: Object.fromEntries(
      bannerDefinitions.map(({ key }) => [key, {
        description: readFormText(formData, `${key}.description`),
        title: readFormText(formData, `${key}.title`),
      }]),
    ) as StudentBannerSet,
    version: readFormText(formData, "version"),
  };
}

function BannerPreviewPanel({
  banners,
  onClose,
  previewMode,
}: {
  banners: StudentBannerSet;
  onClose: () => void;
  previewMode: boolean;
}) {
  return (
    <section
      aria-label="Student banner preview"
      className="overflow-hidden rounded-[1.75rem] border border-primary-200 bg-primary-50/60 shadow-[0_18px_45px_-32px_rgba(26,72,61,0.65)]"
    >
      <div className="flex flex-col gap-4 border-b border-primary-100 bg-white/75 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Preview</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-secondary-950">Student page banners</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Uses the current form text.</p>
        </div>
        <Button onClick={onClose} size="sm" type="button" variant="ghost">
          Close preview
        </Button>
      </div>

      <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
        {bannerDefinitions.map(({ icon: Icon, key, label, route }) => (
          <article className="rounded-2xl border border-primary-100 bg-white p-5 shadow-sm" key={key}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800">
                  <Icon aria-hidden="true" size={17} />
                </span>
                <p className="truncate text-sm font-semibold text-secondary-900">{label}</p>
              </div>
              <span className="shrink-0 rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-medium text-secondary-600">
                {previewMode
                  ? buildAdminStudentPreviewRoute(key === "beranda" ? "/" : route)
                  : route}
              </span>
            </div>
            <div className="mt-5 rounded-xl bg-secondary-900 px-5 py-6 text-white">
              <h3 className="text-xl font-semibold tracking-[-0.03em]">
                {resolveStudentBannerText(banners[key].title, previewVariables)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-secondary-200">
                {resolveStudentBannerText(banners[key].description, previewVariables)}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BannerEditorCard({
  banner,
  definition,
  state,
}: {
  banner: StudentBannerContent;
  definition: (typeof bannerDefinitions)[number];
  state: FormState;
}) {
  const { icon: Icon, key } = definition;
  const titleField = `${key}.title`;
  const descriptionField = `${key}.description`;
  const titleError = state.fieldErrors?.[titleField];
  const descriptionError = state.fieldErrors?.[descriptionField];

  return (
    <section className={`${ADMIN_CARD_CLASS_NAME} flex min-w-0 flex-col p-5 sm:p-6`}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-800">
          <Icon aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900">{definition.label}</h2>
          <p className="mt-1 text-sm leading-6 text-secondary-600">{definition.description}</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-semibold text-secondary-600">
          {definition.route}
        </span>
      </div>

      <div className="mt-6 grid gap-5">
        <Field>
          <FieldLabel
            htmlFor={`${key}-title`}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(`${key}-title`)?.focus();
            }}
          >
            Heading
          </FieldLabel>
          <Input
            aria-describedby={titleError ? `${key}-title-error` : undefined}
            aria-invalid={Boolean(titleError)}
            aria-label="Heading"
            className="h-[52px] border-secondary-900/14 bg-white px-5 text-base text-secondary-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] focus-visible:border-primary-700/40 focus-visible:ring-4 focus-visible:ring-primary-700/12"
            defaultValue={state.fields?.[titleField] ?? banner.title}
            id={`${key}-title`}
            maxLength={180}
            name={titleField}
            required
          />
          <FieldError error={titleError} id={`${key}-title-error`} />
        </Field>

        <Field>
          <FieldLabel
            htmlFor={`${key}-description`}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(`${key}-description`)?.focus();
            }}
          >
            Supporting text
          </FieldLabel>
          <SyntaxHighlightedTextarea
            aria-describedby={descriptionError ? `${key}-description-error` : undefined}
            aria-invalid={Boolean(descriptionError)}
            aria-label="Supporting text"
            className="min-h-36"
            defaultValue={state.fields?.[descriptionField] ?? banner.description}
            id={`${key}-description`}
            maxLength={1000}
            name={descriptionField}
            required
          />
          <FieldError error={descriptionError} id={`${key}-description-error`} />
        </Field>
      </div>
    </section>
  );
}

function StudentBannerEditor({
  action,
  banners,
  hasUnpublishedChanges,
  previewHref,
  previewMode = false,
  version,
}: {
  action: StudentBannerAction;
  banners: StudentBannerSet;
  hasUnpublishedChanges: boolean;
  previewHref?: string;
  previewMode?: boolean;
  version: string | null;
}) {
  const [state, formAction] = useActionState(action, {
    status: "idle",
    fields: toFormFields(banners, version),
  });
  const [previewState, setPreviewState] = useState<{
    banners: StudentBannerSet;
    version: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const draftHasChanges = state.hasUnpublishedChanges ?? hasUnpublishedChanges;
  const currentVersion = state.fields?.version ?? version ?? "";
  const toastKey = JSON.stringify([
    state.status,
    currentVersion,
    state.message ?? "",
    state.published ?? false,
  ]);

  const resultToastMessage = state.status === "success"
    ? state.published
      ? "Published."
      : "Draft saved."
    : state.message ?? "Couldn’t save.";
  const dismissedToastKeyRef = useRef<string | null>(null);
  const setDismissedToastKey = (key: string) => {
    dismissedToastKeyRef.current = key;
  };

  useEffect(() => {
    if (state.status === "idle" || dismissedToastKeyRef.current === toastKey) {
      return;
    }

    setDismissedToastKey(toastKey);

    if (state.status === "success") {
      toast.success(resultToastMessage);
    } else {
      toast.error(resultToastMessage);
    }
  }, [resultToastMessage, state.status, toastKey]);

  function handlePreview() {
    if (formRef.current) {
      setPreviewState(readBannersFromForm(formRef.current));
    }
  }

  return (
    <div className="space-y-6">
      {previewMode ? (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Banner editor</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-secondary-950">Edit banners</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-600">Drafts stay private until published.</p>
          </div>
          {previewHref ? (
            <Button
              nativeButton={false}
              render={<Link href={previewHref} />}
              size="sm"
              variant="ghost"
            >
              Close editor
            </Button>
          ) : null}
        </header>
      ) : null}

      {previewState?.version === currentVersion ? (
        <BannerPreviewPanel banners={previewState.banners} onClose={() => setPreviewState(null)} previewMode={previewMode} />
      ) : null}

      <form
        action={formAction}
        className="space-y-6"
        key={state.fields?.version ?? version ?? "new"}
        ref={formRef}
      >
        <input name="version" type="hidden" value={state.fields?.version ?? version ?? ""} readOnly />

        <div className="grid gap-5 xl:grid-cols-2">
          {bannerDefinitions.map((definition) => (
            <BannerEditorCard
              banner={banners[definition.key]}
              definition={definition}
              key={definition.key}
              state={state}
            />
          ))}
        </div>

        <div className={`${ADMIN_CARD_CLASS_NAME} flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${draftHasChanges ? "bg-amber-100 text-amber-800" : "bg-primary-50 text-primary-800"}`}>
                {draftHasChanges ? "Unpublished draft" : "Published"}
              </span>
              <p className="text-sm font-medium text-secondary-900">
                {draftHasChanges ? "Students see the published copy." : "Matches the published copy."}
              </p>
            </div>
            <p className="mt-1 text-sm leading-6 text-secondary-600">Save a draft or publish it now.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handlePreview} size="lg" type="button" variant="brandOutline">
              Preview
            </Button>
            <SubmitButton name="intent" pendingLabel="Saving draft…" size="lg" type="submit" value="save-draft" variant="brandOutline">
              Save draft
            </SubmitButton>
            <SubmitButton name="intent" pendingLabel="Publishing…" size="lg" type="submit" value="publish" variant="brand">
              Publish
            </SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}

export { StudentBannerEditor };
export type { StudentBannerAction };

"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import type { SessionContext } from "@/lib/auth/types";
import {
  ArrowUpRight,
  BookOpen,
  Gauge,
  House,
  ListChecks,
  type AppIcon,
} from "@/lib/icons";
import {
  resolveStudentBannerText,
  type StudentBannerContent,
  type StudentBannerKey,
  type StudentBannerSet,
} from "@/lib/student/banner-content";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import { EMPTY_FORM_STATE, type FormState } from "@/modules/auth/form-state";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { ADMIN_CARD_CLASS_NAME } from "./admin-ui-contract";
import { SyntaxHighlightedInput, SyntaxHighlightedTextarea } from "./components/syntax-highlighted-field";
import { updateStudentBannersAction } from "./student-banners-actions";

const bannerDefinitions: Array<{
  description: string;
  icon: AppIcon;
  key: StudentBannerKey;
  label: string;
  route: string;
}> = [
  {
    description: "Banner utama setelah siswa masuk.",
    icon: House,
    key: "beranda",
    label: "Beranda",
    route: "/dashboard",
  },
  {
    description: "Pembuka katalog bacaan dan jalur belajar.",
    icon: BookOpen,
    key: "materi",
    label: "Materi",
    route: "/courses",
  },
  {
    description: "Pembuka katalog latihan soal.",
    icon: ListChecks,
    key: "kuis",
    label: "Kuis",
    route: "/quiz",
  },
  {
    description: "Pembuka katalog simulasi ujian.",
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
}: {
  banners: StudentBannerSet;
  onClose: () => void;
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
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">
            This preview uses the text currently in the form. Beranda placeholders use a sample student so you can check the final sentence.
          </p>
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
              <span className="shrink-0 rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-medium text-secondary-600">{route}</span>
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
          <FieldLabel htmlFor={`${key}-title`}>Heading</FieldLabel>
          <SyntaxHighlightedInput
            aria-describedby={titleError ? `${key}-title-error` : undefined}
            aria-invalid={Boolean(titleError)}
            defaultValue={state.fields?.[titleField] ?? banner.title}
            id={`${key}-title`}
            maxLength={180}
            name={titleField}
            required
          />
          {titleError ? <p className="text-sm text-danger-700" id={`${key}-title-error`}>{titleError}</p> : null}
        </Field>

        <Field>
          <FieldLabel htmlFor={`${key}-description`}>Supporting text</FieldLabel>
          <SyntaxHighlightedTextarea
            aria-describedby={descriptionError ? `${key}-description-error` : undefined}
            aria-invalid={Boolean(descriptionError)}
            className="min-h-36"
            defaultValue={state.fields?.[descriptionField] ?? banner.description}
            id={`${key}-description`}
            maxLength={1000}
            name={descriptionField}
            required
          />
          {descriptionError ? <p className="text-sm text-danger-700" id={`${key}-description-error`}>{descriptionError}</p> : null}
        </Field>
      </div>
    </section>
  );
}

function StudentBannersPageModule({
  banners,
  hasUnpublishedChanges,
  session,
  version,
}: {
  banners: StudentBannerSet;
  hasUnpublishedChanges: boolean;
  session: SessionContext;
  version: string | null;
}) {
  const [state, formAction] = useActionState(updateStudentBannersAction, {
    ...EMPTY_FORM_STATE,
    fields: toFormFields(banners, version),
  });
  const [previewState, setPreviewState] = useState<{
    banners: StudentBannerSet;
    version: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const draftHasChanges = state.hasUnpublishedChanges ?? hasUnpublishedChanges;
  const currentVersion = state.fields?.version ?? version ?? "";

  function handlePreview() {
    if (formRef.current) {
      setPreviewState(readBannersFromForm(formRef.current));
    }
  }

  return (
    <PortalShell
      activeAdminSection="student-banners"
      audience="admin"
      description="Update the copy shown in the four main student banners."
      session={session}
      title="Student banners"
    >
      <div className="space-y-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">Student page banners</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-600">
              Edit a private draft, preview it with sample student data, then publish when it is ready.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary-800 transition hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
            href="/admin/docs#student-banners"
          >
            Read documentation
            <ArrowUpRight aria-hidden="true" size={16} />
          </Link>
        </header>

        {previewState?.version === currentVersion ? (
          <BannerPreviewPanel banners={previewState.banners} onClose={() => setPreviewState(null)} />
        ) : null}

        <form
          action={formAction}
          className="space-y-6"
          key={state.fields?.version ?? version ?? "new"}
          ref={formRef}
        >
          <input name="version" type="hidden" value={state.fields?.version ?? version ?? ""} readOnly />
          {state.message ? <FormNotice tone={state.status === "success" ? "success" : "danger"}>{state.message}</FormNotice> : null}

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
                  {draftHasChanges ? "Students still see the previous published copy." : "The draft matches what students see."}
                </p>
              </div>
              <p className="mt-1 text-sm leading-6 text-secondary-600">
                Save a draft to keep edits private. Publish when you want the new copy to appear on student pages.
              </p>
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
    </PortalShell>
  );
}

export { StudentBannersPageModule };

"use client";

import {
  BookOpen,
  Gauge,
  House,
  Info,
  ListChecks,
  type AppIcon,
} from "@/lib/icons";
import type {
  StudentBannerContent,
  StudentBannerKey,
  StudentBannerSet,
} from "@/lib/student/banner-content";
import type { SessionContext } from "@/lib/auth/types";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { useActionState } from "react";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { EMPTY_FORM_STATE, type FormState } from "@/modules/auth/form-state";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { updateStudentBannersAction } from "./student-banners-actions";
import { ADMIN_CARD_CLASS_NAME, ADMIN_INSET_CLASS_NAME } from "./admin-ui-contract";

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

function toFormFields(banners: StudentBannerSet) {
  return Object.fromEntries(
    bannerDefinitions.flatMap(({ key }) => [
      [`${key}.title`, banners[key].title],
      [`${key}.description`, banners[key].description],
    ]),
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
          <FieldInput
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
          <FieldTextarea
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
  session,
}: {
  banners: StudentBannerSet;
  session: SessionContext;
}) {
  const [state, formAction] = useActionState(updateStudentBannersAction, {
    ...EMPTY_FORM_STATE,
    fields: toFormFields(banners),
  });

  return (
    <PortalShell
      activeAdminSection="student-banners"
      audience="admin"
      description="Update the copy shown in the four main student banners."
      session={session}
      title="Student banners"
    >
      <div className="space-y-7">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">Student page banners</h1>
            <p className="mt-2 max-w-[68ch] text-sm leading-6 text-secondary-600">
              Keep the first message students see clear and useful across Beranda, Materi, Kuis, and Tryout.
            </p>
          </div>
          <span className="text-sm text-secondary-500">4 banners · heading + supporting text</span>
        </header>

        <div className={`${ADMIN_INSET_CLASS_NAME} flex items-start gap-3 px-4 py-4 text-sm leading-6 text-secondary-700`}>
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-white text-primary-700"><Info aria-hidden="true" size={15} /></span>
          <p>
            Beranda supports <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-primary-800">&#123;firstName&#125;</code> and <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-primary-800">&#123;target&#125;</code>. They are replaced with each student&apos;s name and study target. Other banners can use plain text.
          </p>
        </div>

        <form action={formAction} className="space-y-6">
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

          <div className={`${ADMIN_CARD_CLASS_NAME} flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6`}>
            <p className="text-sm leading-6 text-secondary-600">Changes are written to the student pages immediately after saving.</p>
            <SubmitButton pendingLabel="Saving changes…" size="lg" type="submit" variant="brand">
              Save banner copy
            </SubmitButton>
          </div>
        </form>
      </div>
    </PortalShell>
  );
}

export { StudentBannersPageModule };

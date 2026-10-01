"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
} from "react";
import { useFormStatus } from "react-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import type { FormState } from "@/modules/auth/form-state";
import {
  BookOpen,
  CircleHelp,
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
    description: "Banner utama siswa.",
    icon: House,
    key: "beranda",
    label: "Beranda",
    route: "/dashboard",
  },
  {
    description: "Banner materi.",
    icon: BookOpen,
    key: "materi",
    label: "Materi",
    route: "/courses",
  },
  {
    description: "Banner kuis.",
    icon: ListChecks,
    key: "kuis",
    label: "Kuis",
    route: "/quiz",
  },
  {
    description: "Banner tryout.",
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

type BannerIntent = "publish" | "save-draft";

const confirmationCopy: Record<
  BannerIntent,
  {
    confirmLabel: string;
    description: string;
    title: string;
  }
> = {
  "save-draft": {
    confirmLabel: "Simpan draf",
    description:
      "Perubahan pada empat banner siswa akan disimpan sebagai draf privat. Siswa tetap melihat versi yang diterbitkan sampai kamu memilih Terbitkan.",
    title: "Simpan draf banner?",
  },
  publish: {
    confirmLabel: "Terbitkan banner",
    description:
      "Draf banner siswa yang sudah disimpan akan diterbitkan untuk pengalaman siswa. Ini tidak mengubah kemajuan, akun, atau status siswa.",
    title: "Terbitkan draf banner siswa?",
  },
};

function toFormFields(banners: StudentBannerSet, version: string | null) {
  return Object.fromEntries([
    ["version", version ?? ""],
    ...bannerDefinitions.flatMap(({ key }) => [
      [`${key}.title`, banners[key].title],
      [`${key}.description`, banners[key].description],
    ]),
  ]);
}

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readBannersFromForm(form: HTMLFormElement) {
  const formData = new FormData(form);

  return {
    banners: Object.fromEntries(
      bannerDefinitions.map(({ key }) => [
        key,
        {
          description: readFormText(formData, `${key}.description`),
          title: readFormText(formData, `${key}.title`),
        },
      ]),
    ) as StudentBannerSet,
    version: readFormText(formData, "version"),
  };
}

function bannerResultToastMessage(state: FormState) {
  if (state.status === "success")
    return state.published ? "Banner diterbitkan." : "Draf tersimpan.";
  return state.message ?? "Banner tidak dapat disimpan.";
}

function handleStudentBannerSubmit(
  event: FormEvent<HTMLFormElement>,
  allowNextSubmitRef: { current: boolean },
  setPendingIntent: (intent: BannerIntent) => void,
) {
  if (allowNextSubmitRef.current) {
    allowNextSubmitRef.current = false;
    return;
  }

  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  const intent =
    submitter instanceof HTMLButtonElement ? submitter.value : "save-draft";
  if (intent === "save-draft" || intent === "publish") {
    event.preventDefault();
    setPendingIntent(intent);
  }
}

function confirmStudentBannerIntent(
  pendingIntent: BannerIntent | null,
  formRef: { current: HTMLFormElement | null },
  setPendingIntent: (intent: BannerIntent | null) => void,
  allowNextSubmitRef: { current: boolean },
) {
  const form = formRef.current;
  if (!pendingIntent || !form) return;

  const submitter = form.querySelector<HTMLButtonElement>(
    `button[name="intent"][value="${pendingIntent}"]`,
  );
  setPendingIntent(null);
  allowNextSubmitRef.current = true;
  form.requestSubmit(submitter ?? undefined);
}

function BannerSubmitButton({
  blocked = false,
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & {
  blocked?: boolean;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  const disabled = blocked || pending;

  return (
    <Button aria-disabled={disabled} disabled={disabled} {...props}>
      {pending ? (pendingLabel ?? "Memproses…") : children}
    </Button>
  );
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
      aria-label="Pratinjau banner siswa"
      className="overflow-hidden rounded-card border border-primary-200 bg-primary-50/60 shadow-[0_18px_45px_-32px_color-mix(in_oklab,var(--voyage-deep)_65%,transparent)]"
    >
      <div className="flex flex-col gap-4 border-b border-primary-100 bg-white/75 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
            Pratinjau
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-secondary-950">
            Banner halaman siswa
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">
            Menggunakan teks dari formulir saat ini.
          </p>
        </div>
        <Button onClick={onClose} size="sm" type="button" variant="outline">
          Tutup pratinjau
        </Button>
      </div>

      <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
        {bannerDefinitions.map(({ icon: Icon, key, label, route }) => (
          <article
            className="rounded-card border border-primary-100 bg-white p-5 shadow-sm"
            key={key}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800">
                  <Icon aria-hidden="true" size={17} />
                </span>
                <p className="truncate text-sm font-semibold text-secondary-900">
                  {label}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-medium text-secondary-600">
                {previewMode
                  ? buildAdminStudentPreviewRoute(
                      key === "beranda" ? "/" : route,
                    )
                  : route}
              </span>
            </div>
            <div className="mt-5 rounded-xl bg-secondary-900 px-5 py-6 text-white">
              <h3 className="text-xl font-semibold tracking-[-0.03em]">
                {resolveStudentBannerText(banners[key].title, previewVariables)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-secondary-200">
                {resolveStudentBannerText(
                  banners[key].description,
                  previewVariables,
                )}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StudentBannerConfirmationDialog({
  onClose,
  onConfirm,
  pendingConfirmation,
}: {
  onClose: () => void;
  onConfirm: () => void;
  pendingConfirmation: {
    confirmLabel: string;
    description: string;
    title: string;
  } | null;
}) {
  if (!pendingConfirmation) return null;

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <AlertDialogContent
        data-testid="student-banner-confirmation"
        variant="warning"
      >
        <AlertDialogHeader>
          <AlertDialogMedia variant="warning">
            <CircleHelp />
          </AlertDialogMedia>
          <AlertDialogTitle>{pendingConfirmation.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingConfirmation.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant="default">
            {pendingConfirmation.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function StudentBannerEditorHeader({
  previewHref,
  previewMode,
}: {
  previewHref?: string;
  previewMode: boolean;
}) {
  if (!previewMode) return null;

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
          Editor banner
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-secondary-950">
          Edit banner
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-600">
          Perubahan di sini hanya berlaku untuk konten Tryout dan tidak
          memengaruhi progres atau akun siswa. Jika ingin mengulang Tryout atau
          mengatur ulang sesi, kamu bisa melakukannya secara terpisah melalui
          pengaturan penugasan.
        </p>
      </div>
      {previewHref ? (
        <Button
          nativeButton={false}
          render={<Link href={previewHref} />}
          size="sm"
          variant="outline"
        >
          Tutup editor
        </Button>
      ) : null}
    </header>
  );
}

function StudentBannerSavePanel({
  canPublish,
  hasUnpublishedChanges,
  onPreview,
}: {
  canPublish: boolean;
  hasUnpublishedChanges: boolean;
  onPreview: () => void;
}) {
  return (
    <>
      <div
        className={`${ADMIN_CARD_CLASS_NAME} flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${hasUnpublishedChanges ? "bg-warning-100 text-warning-800" : "bg-primary-50 text-primary-800"}`}
            >
              {hasUnpublishedChanges ? "Draf belum diterbitkan" : "Diterbitkan"}
            </span>
            <p className="text-sm font-medium text-secondary-900">
              {hasUnpublishedChanges
                ? "Siswa melihat salinan yang diterbitkan."
                : "Sama dengan salinan yang diterbitkan."}
            </p>
          </div>
          <p className="mt-1 text-sm leading-6 text-secondary-600">
            Simpan draf hanya mengubah draf privat. Terbitkan menerbitkan draf
            yang sudah tersimpan setelah konfirmasi dan pembacaan ulang;
            pengulangan Tryout tetap merupakan tindakan operasional penugasan
            dan sesi yang terpisah.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onPreview}
            size="lg"
            type="button"
            variant="outline"
          >
            Pratinjau
          </Button>
          <BannerSubmitButton
            name="intent"
            pendingLabel="Menyimpan draf…"
            size="lg"
            type="submit"
            value="save-draft"
            variant="outline"
          >
            Simpan draf
          </BannerSubmitButton>
          <BannerSubmitButton
            blocked={!canPublish}
            name="intent"
            pendingLabel="Menerbitkan…"
            size="lg"
            type="submit"
            value="publish"
            variant="default"
          >
            {canPublish ? "Terbitkan" : "Simpan draf sebelum menerbitkan"}
          </BannerSubmitButton>
        </div>
      </div>
    </>
  );
}

function StudentBannerEditorFeedback({
  canPublish,
  publishBlockedCopy,
  state,
}: {
  canPublish: boolean;
  publishBlockedCopy: string;
  state: FormState;
}) {
  const hasFieldErrors = Object.values(state.fieldErrors ?? {}).some(Boolean);

  return (
    <>
      {!canPublish ? (
        <p
          className="rounded-card border border-warning-200 bg-warning-50 px-4 py-3 text-sm font-medium text-warning-800"
          data-testid="student-banner-publish-gating"
        >
          {publishBlockedCopy}
        </p>
      ) : null}
      {state.status === "error" && state.message && hasFieldErrors ? (
        <p
          aria-live="assertive"
          className="rounded-card border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm font-medium text-student-status-danger-fg"
          data-testid="student-banner-error"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
    </>
  );
}

function StudentBannerEditorForm({
  banners,
  canPublish,
  currentVersion,
  formAction,
  formRef,
  handlePreview,
  handleSubmit,
  previewMode,
  previewHref,
  publishBlockedCopy,
  setDirtyVersion,
  hasUnpublishedChanges,
  state,
  version,
}: {
  banners: StudentBannerSet;
  canPublish: boolean;
  currentVersion: string;
  formAction: (payload: FormData) => void;
  formRef: { current: HTMLFormElement | null };
  handlePreview: () => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  previewMode: boolean;
  previewHref?: string;
  publishBlockedCopy: string;
  setDirtyVersion: (version: string) => void;
  hasUnpublishedChanges: boolean;
  state: FormState;
  version: string | null;
}) {
  const draftHasChanges = state.hasUnpublishedChanges ?? hasUnpublishedChanges;

  return (
    <>
      <StudentBannerEditorHeader
        previewHref={previewHref}
        previewMode={previewMode}
      />
      <form
        action={formAction}
        className="space-y-6"
        key={state.fields?.version ?? version ?? "new"}
        onInput={() => setDirtyVersion(currentVersion)}
        onSubmit={handleSubmit}
        ref={formRef}
      >
        <input
          name="version"
          type="hidden"
          value={state.fields?.version ?? version ?? ""}
          readOnly
        />
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
        <StudentBannerSavePanel
          canPublish={canPublish}
          hasUnpublishedChanges={draftHasChanges}
          onPreview={handlePreview}
        />
        <StudentBannerEditorFeedback
          canPublish={canPublish}
          publishBlockedCopy={publishBlockedCopy}
          state={state}
        />
      </form>
    </>
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
    <section
      className={`${ADMIN_CARD_CLASS_NAME} flex min-w-0 flex-col p-5 sm:p-6`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-800">
          <Icon aria-hidden="true" size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900">
            {definition.label}
          </h2>
          <p className="mt-1 text-sm leading-6 text-secondary-600">
            {definition.description}
          </p>
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
            Judul
          </FieldLabel>
          <Input
            aria-describedby={titleError ? `${key}-title-error` : undefined}
            aria-invalid={Boolean(titleError)}
            aria-label="Judul"
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
            Teks pendukung
          </FieldLabel>
          <SyntaxHighlightedTextarea
            aria-describedby={
              descriptionError ? `${key}-description-error` : undefined
            }
            aria-invalid={Boolean(descriptionError)}
            aria-label="Teks pendukung"
            className="min-h-36"
            defaultValue={
              state.fields?.[descriptionField] ?? banner.description
            }
            id={`${key}-description`}
            maxLength={1000}
            name={descriptionField}
            required
          />
          <FieldError
            error={descriptionError}
            id={`${key}-description-error`}
          />
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
  const [pendingIntent, setPendingIntent] = useState<BannerIntent | null>(null);
  const [dirtyVersion, setDirtyVersion] = useState<string | null>(null);
  const allowNextSubmitRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const draftHasChanges = state.hasUnpublishedChanges ?? hasUnpublishedChanges;
  const currentVersion = state.fields?.version ?? version ?? "";
  const isInputDirty = dirtyVersion !== null && dirtyVersion === currentVersion;
  const canPublish = draftHasChanges && !isInputDirty;
  const publishBlockedCopy = isInputDirty
    ? "Simpan draf sebelum menerbitkan agar versi yang dikonfirmasi sama dengan input terbaru."
    : "Terbitkan tersedia setelah ada draf banner yang tersimpan.";
  const toastKey = JSON.stringify([
    state.status,
    currentVersion,
    state.message ?? "",
    state.published ?? false,
  ]);

  const resultToastMessage = bannerResultToastMessage(state);
  const dismissedToastKeyRef = useRef<string | null>(null);
  const setDismissedToastKey = (key: string) => {
    dismissedToastKeyRef.current = key;
  };

  const hasFieldErrors = Object.values(state.fieldErrors ?? {}).some(Boolean);

  useEffect(() => {
    if (
      state.status === "idle" ||
      (state.status === "error" && hasFieldErrors) ||
      dismissedToastKeyRef.current === toastKey
    ) {
      return;
    }

    setDismissedToastKey(toastKey);
    showToast(resultToastMessage, {
      variant: state.status === "success" ? "success" : "error",
    });
  }, [hasFieldErrors, resultToastMessage, state.status, toastKey]);

  function handlePreview() {
    if (formRef.current) {
      setPreviewState(readBannersFromForm(formRef.current));
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) =>
    handleStudentBannerSubmit(event, allowNextSubmitRef, setPendingIntent);
  const confirmPendingIntent = () =>
    confirmStudentBannerIntent(
      pendingIntent,
      formRef,
      setPendingIntent,
      allowNextSubmitRef,
    );

  const pendingConfirmation = pendingIntent
    ? confirmationCopy[pendingIntent]
    : null;

  return (
    <div className="space-y-6">
      <StudentBannerConfirmationDialog
        onClose={() => setPendingIntent(null)}
        onConfirm={confirmPendingIntent}
        pendingConfirmation={pendingConfirmation}
      />

      {previewState?.version === currentVersion ? (
        <BannerPreviewPanel
          banners={previewState.banners}
          onClose={() => setPreviewState(null)}
          previewMode={previewMode}
        />
      ) : null}

      <StudentBannerEditorForm
        banners={banners}
        canPublish={canPublish}
        currentVersion={currentVersion}
        formAction={formAction}
        formRef={formRef}
        hasUnpublishedChanges={hasUnpublishedChanges}
        handlePreview={handlePreview}
        handleSubmit={handleSubmit}
        previewHref={previewHref}
        previewMode={previewMode}
        publishBlockedCopy={publishBlockedCopy}
        setDirtyVersion={setDirtyVersion}
        state={state}
        version={version}
      />
    </div>
  );
}

export { StudentBannerEditor };
export type { StudentBannerAction };

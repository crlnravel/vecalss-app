"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldInput,
  FieldLabel,
} from "@/components/ui/field";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { showToast } from "@/components/ui/toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { BookOpen, Camera, Copy, UserRound } from "@/lib/icons";
import {
  AVATAR_FORMAT_ERROR_MESSAGE,
  MAX_AVATAR_BYTES,
  validateKaptenAvatarDataUrl,
} from "@/modules/mentor/avatar-validation";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { MENTOR_SETTINGS_ACTION_WIDTH_CLASS_NAME } from "@/modules/mentor/components/administration-action-row";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import {
  saveKaptenSettingsAction,
  saveKaptenSubjectAction,
} from "@/modules/mentor/settings-actions";
import type { KaptenSettings } from "@/modules/mentor/settings-types";

type SettingsMenu = "profil" | "subjek";
type MenuFeedback = {
  status: "idle" | "saving" | "saved" | "error";
  error?: {
    field?: "avatarUrl" | "profileName" | "subjectCode";
    message: string;
  };
};

const MAX_RAW_AVATAR_FILE_BYTES = 5 * 1024 * 1024;
const AVATAR_CROP_SIZE_PX = 256;

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("File tidak dapat dibaca."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("File tidak dapat dibaca."));
    };
    reader.readAsDataURL(file);
  });
}

function normalizeAvatarImageDataUrl(
  rawDataUrl: string,
  mimeType: string,
): Promise<string> {
  if (mimeType === "image/gif" || typeof document === "undefined") {
    return Promise.resolve(rawDataUrl);
  }

  return new Promise<string>((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
          resolve(rawDataUrl);
          return;
        }
        const squareSide = Math.min(width, height);
        const sourceX = Math.floor((width - squareSide) / 2);
        const sourceY = Math.floor((height - squareSide) / 2);
        const targetSide = Math.min(squareSide, AVATAR_CROP_SIZE_PX);

        const canvas = document.createElement("canvas");
        canvas.width = targetSide;
        canvas.height = targetSide;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(rawDataUrl);
          return;
        }
        context.drawImage(
          image,
          sourceX,
          sourceY,
          squareSide,
          squareSide,
          0,
          0,
          targetSide,
          targetSide,
        );
        const outputMime =
          mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
        const resizedDataUrl =
          outputMime === "image/jpeg"
            ? canvas.toDataURL("image/jpeg", 0.9)
            : canvas.toDataURL("image/png");
        resolve(resizedDataUrl);
      } catch {
        resolve(rawDataUrl);
      }
    };
    image.onerror = () => resolve(rawDataUrl);
    image.src = rawDataUrl;
  });
}

function SettingsPanel({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="min-w-0 rounded-card border border-voyage-soft-border bg-voyage-surface"
      id={id}
    >
      <header className="border-b border-voyage-soft-border px-5 py-4">
        <h2
          className="text-sm font-semibold leading-6 text-voyage-ink"
          id={`${id}-title`}
        >
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

function AccountRow({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="grid min-w-0 gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-6">
      <dt className={REFERENCE_FIELD_LABEL_CLASS_NAME}>{title}</dt>
      <dd className="min-w-0 text-sm leading-6 text-voyage-ink">
        {children}
        {description ? (
          <p className="mt-1 text-xs leading-5 text-voyage-muted-ink">
            {description}
          </p>
        ) : null}
      </dd>
    </div>
  );
}

function KaptenSettingsPageModule({
  initialSettings,
  session,
}: {
  initialSettings: KaptenSettings;
  session: SessionContext;
}) {
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initialSettings.avatarUrl,
  );
  const [profileName, setProfileName] = useState(initialSettings.profileName);
  const [subjectCode, setSubjectCode] = useState(
    initialSettings.subjectCode ?? "",
  );
  const [activeMenu, setActiveMenu] = useState<SettingsMenu>("profil");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    "horizontal",
  );
  const [feedback, setFeedback] = useState<Record<SettingsMenu, MenuFeedback>>({
    profil: { status: "idle" },
    subjek: { status: "idle" },
  });
  const menuDirty = {
    profil:
      profileName !== savedSettings.profileName ||
      avatarUrl !== savedSettings.avatarUrl,
    subjek: subjectCode !== (savedSettings.subjectCode ?? ""),
  };
  const dirty = menuDirty.profil || menuDirty.subjek;
  const saving =
    feedback.profil.status === "saving" || feedback.subjek.status === "saving";
  const { error } = feedback[activeMenu];
  const activeDirty = menuDirty[activeMenu];
  const otherMenu = activeMenu === "profil" ? "subjek" : "profil";
  const initials = getInitials(savedSettings.profileName);
  const draftInitials = getInitials(profileName || savedSettings.profileName);
  const currentSession = {
    ...session,
    user: {
      ...session.user,
      avatarUrl: savedSettings.avatarUrl,
      fullName: savedSettings.profileName,
    },
  };

  usePageStatusToast({
    active: dirty || saving,
    description: error?.message,
    message: saving
      ? "Menyimpan perubahan\u2026"
      : error
        ? "Perubahan belum tersimpan"
        : activeDirty
          ? `Ada perubahan yang belum disimpan di ${activeMenu === "profil" ? "Profil" : "Subjek"}`
          : `Ada perubahan yang belum disimpan di ${otherMenu === "profil" ? "Profil" : "Subjek"}`,
    variant: error ? "error" : "info",
  });

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const updateOrientation = () =>
      setOrientation(desktop.matches ? "vertical" : "horizontal");
    updateOrientation();
    desktop.addEventListener("change", updateOrientation);
    return () => desktop.removeEventListener("change", updateOrientation);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function updateFeedback(menu: SettingsMenu, next: MenuFeedback) {
    setFeedback((previous) => ({ ...previous, [menu]: next }));
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const normalizedType = file.type.trim().toLowerCase();
    const maxRawBytes =
      normalizedType === "image/gif"
        ? MAX_AVATAR_BYTES
        : MAX_RAW_AVATAR_FILE_BYTES;
    if (file.size <= 0 || file.size > maxRawBytes) {
      updateFeedback("profil", {
        status: "error",
        error: { field: "avatarUrl", message: AVATAR_FORMAT_ERROR_MESSAGE },
      });
      return;
    }

    try {
      const rawDataUrl = await readFileAsDataUrl(file);
      const normalizedDataUrl = await normalizeAvatarImageDataUrl(
        rawDataUrl,
        normalizedType,
      );
      const candidateCheck = validateKaptenAvatarDataUrl(normalizedDataUrl);
      const finalCheck = candidateCheck.ok
        ? candidateCheck
        : validateKaptenAvatarDataUrl(rawDataUrl);

      if (!finalCheck.ok) {
        updateFeedback("profil", {
          status: "error",
          error: { field: "avatarUrl", message: finalCheck.message },
        });
        return;
      }

      setAvatarUrl(finalCheck.avatarUrl);
      updateFeedback("profil", { status: "idle" });
    } catch {
      updateFeedback("profil", {
        status: "error",
        error: { field: "avatarUrl", message: AVATAR_FORMAT_ERROR_MESSAGE },
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeDirty || saving) return;
    const menu = activeMenu;
    updateFeedback(menu, { status: "saving" });
    try {
      const result =
        menu === "profil"
          ? await saveKaptenSettingsAction({ avatarUrl, profileName })
          : await saveKaptenSubjectAction({ subjectCode: subjectCode || null });
      if (!result.ok) {
        updateFeedback(menu, {
          status: "error",
          error: { field: result.field, message: result.message },
        });
        return;
      }
      setSavedSettings(result.settings);
      // Saving one menu never discards the draft in the other menu.
      if (menu === "profil") {
        setProfileName(result.settings.profileName);
        setAvatarUrl(result.settings.avatarUrl);
      } else {
        setSubjectCode(result.settings.subjectCode ?? "");
      }
      updateFeedback(menu, { status: "saved" });
      showToast("Perubahan tersimpan.", { variant: "success" });
    } catch {
      updateFeedback(menu, {
        status: "error",
        error: { message: "Perubahan belum tersimpan. Coba simpan lagi." },
      });
    }
  }

  function cancelChanges() {
    if (activeMenu === "profil") {
      setProfileName(savedSettings.profileName);
      setAvatarUrl(savedSettings.avatarUrl);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    } else {
      setSubjectCode(savedSettings.subjectCode ?? "");
    }
    updateFeedback(activeMenu, { status: "idle" });
  }

  async function copyAccountId() {
    try {
      await navigator.clipboard.writeText(savedSettings.userId);
      showToast("ID akun disalin.", { variant: "success" });
    } catch {
      showToast(
        "ID akun belum bisa disalin. Pilih teks ID lalu salin secara manual.",
        { variant: "error" },
      );
    }
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Pengaturan"
      breadcrumbLabel="Pengaturan"
      mainClassName="gap-8 py-6 lg:py-8"
      navigationConfirmCopy={{
        cancelLabel: "Tetap di sini",
        confirmLabel: "Buang perubahan",
        title: "Tinggalkan pengaturan?",
      }}
      onNavigateAway={() => !dirty && !saving}
      session={currentSession}
      shouldGuardNavigation={dirty || saving}
      showSearch={false}
      sidebarAppearance="reference"
    >
      <ReferencePageHeader title="Pengaturan" />
      <div className="flex min-w-0 items-center gap-4">
        <Avatar className="!size-14">
          {savedSettings.avatarUrl ? (
            <AvatarImage
              alt={`Foto profil ${savedSettings.profileName}`}
              src={savedSettings.avatarUrl}
            />
          ) : null}
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-xl font-semibold leading-7 text-voyage-ink">
              {savedSettings.profileName}
            </p>
          </div>
          <p className="mt-1 break-all text-sm leading-6 text-voyage-muted-ink">
            {savedSettings.email}
          </p>
        </div>
      </div>

      <Tabs
        className="grid min-w-0 gap-6 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8"
        onValueChange={(value) => {
          if (value === "profil" || value === "subjek") setActiveMenu(value);
        }}
        orientation={orientation}
        value={activeMenu}
      >
        <TabsList
          aria-label="Menu pengaturan"
          className="h-auto w-full md:self-start"
          layout="equal"
        >
          {(
            [
              { icon: UserRound, id: "profil", label: "Profil" },
              { icon: BookOpen, id: "subjek", label: "Subjek" },
            ] as const
          ).map(({ icon: Icon, id, label }) => (
            <TabsTrigger
              className="justify-start gap-3 whitespace-normal text-left md:w-full md:flex-none"
              disabled={saving}
              key={id}
              layout="equal"
              value={id}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent
          className="flex min-w-0 flex-col gap-6"
          key={activeMenu}
          value={activeMenu}
        >
          <SettingsPanel
            id="settings-panel"
            title={activeMenu === "profil" ? "Profil" : "Subjek"}
          >
            <form aria-busy={saving} onSubmit={handleSubmit}>
              {activeMenu === "profil" ? (
                <>
                  <Field className="grid gap-3 border-b border-voyage-soft-border px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-6">
                    <div className="min-w-0">
                      <FieldLabel
                        className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                        htmlFor="kapten-profile-avatar"
                      >
                        Foto profil
                      </FieldLabel>
                      <p
                        className="mt-1 text-xs leading-5 text-voyage-muted-ink"
                        id="kapten-profile-avatar-help"
                      >
                        Format JPG, PNG, WebP, atau GIF (maks. 2 MB).
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-4">
                      <div className="group/photo relative shrink-0">
                        <Avatar className="!size-16">
                          {avatarUrl ? (
                            <AvatarImage
                              alt={`Pratinjau foto profil ${profileName || savedSettings.profileName}`}
                              src={avatarUrl}
                            />
                          ) : null}
                          <AvatarFallback className="text-lg transition duration-200 group-hover/photo:brightness-[0.72] group-focus-within/photo:brightness-[0.72]">
                            {draftInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="pointer-events-none absolute inset-0 rounded-pill bg-secondary-950/0 transition-colors duration-200 group-hover/photo:bg-secondary-950/28 group-focus-within/photo:bg-secondary-950/28" />
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                aria-label={
                                  avatarUrl
                                    ? "Ganti foto profil"
                                    : "Pilih foto profil"
                                }
                                className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-pill bg-transparent text-white opacity-0 transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35 group-hover/photo:opacity-100 disabled:pointer-events-none"
                                disabled={saving}
                                onClick={() => avatarInputRef.current?.click()}
                                type="button"
                              >
                                <Camera aria-hidden="true" className="size-5" />
                              </button>
                            }
                          />
                          <TooltipContent>
                            {avatarUrl
                              ? "Ganti foto profil"
                              : "Pilih foto profil"}
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      <input
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        aria-describedby={
                          error?.field === "avatarUrl"
                            ? "kapten-profile-avatar-help kapten-profile-avatar-error"
                            : "kapten-profile-avatar-help"
                        }
                        aria-invalid={error?.field === "avatarUrl"}
                        className="sr-only"
                        disabled={saving}
                        id="kapten-profile-avatar"
                        onChange={handleAvatarChange}
                        ref={avatarInputRef}
                        type="file"
                      />
                    </div>
                    {error?.field === "avatarUrl" ? (
                      <div className="sm:col-start-2">
                        <FieldError
                          error={error.message}
                          id="kapten-profile-avatar-error"
                        />
                      </div>
                    ) : null}
                  </Field>
                  <Field className="grid gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-6">
                    <FieldLabel
                      className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                      htmlFor="kapten-profile-name"
                      required
                    >
                      Nama profil
                    </FieldLabel>
                    <FieldInput
                      aria-describedby={
                        error?.field === "profileName"
                          ? "kapten-profile-name-error"
                          : undefined
                      }
                      aria-invalid={error?.field === "profileName"}
                      autoComplete="name"
                      className={REFERENCE_CONTROL_CLASS_NAMES.input}
                      disabled={saving}
                      id="kapten-profile-name"
                      maxLength={160}
                      name="profileName"
                      required
                      value={profileName}
                      onChange={(event) => {
                        setProfileName(event.target.value);
                        updateFeedback("profil", { status: "idle" });
                      }}
                    />
                    {error?.field === "profileName" ? (
                      <div className="sm:col-start-2">
                        <FieldError
                          error={error.message}
                          id="kapten-profile-name-error"
                        />
                      </div>
                    ) : null}
                  </Field>
                  <dl className="border-t border-voyage-soft-border">
                    <AccountRow
                      description="Email login tidak dapat diubah di sini."
                      title="Email login"
                    >
                      <span className="break-all">{savedSettings.email}</span>
                    </AccountRow>
                  </dl>
                </>
              ) : (
                <div className="grid min-w-0 gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start sm:gap-6">
                  <label
                    className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                    htmlFor="kapten-teaching-subject"
                  >
                    Subjek yang diajar
                  </label>
                  <div className="min-w-0">
                    <ReferenceSelect
                      aria-describedby={
                        error?.field === "subjectCode"
                          ? "kapten-teaching-subject-help kapten-teaching-subject-error"
                          : "kapten-teaching-subject-help"
                      }
                      aria-invalid={error?.field === "subjectCode"}
                      aria-label="Subjek yang diajar"
                      disabled={saving}
                      id="kapten-teaching-subject"
                      name="subjectCode"
                      onValueChange={(value) => {
                        setSubjectCode(value);
                        updateFeedback("subjek", { status: "idle" });
                      }}
                      options={[
                        { label: "Tidak ditentukan", value: "" },
                        ...kaptenSubjects.map((subject) => ({
                          label: subject.name,
                          value: subject.code,
                        })),
                      ]}
                      placeholder="Tidak ditentukan"
                      value={subjectCode}
                    />
                    {error?.field === "subjectCode" ? (
                      <FieldError
                        error={error.message}
                        id="kapten-teaching-subject-error"
                      />
                    ) : null}
                  </div>
                </div>
              )}
              <footer className="flex flex-wrap items-center justify-end gap-4 border-t border-voyage-soft-border px-5 py-4">
                <Button
                  className={MENTOR_SETTINGS_ACTION_WIDTH_CLASS_NAME}
                  disabled={!activeDirty || saving}
                  onClick={cancelChanges}
                  type="button"
                  variant="outline"
                >
                  Batal
                </Button>
                <Button
                  className={MENTOR_SETTINGS_ACTION_WIDTH_CLASS_NAME}
                  disabled={!activeDirty || saving}
                  type="submit"
                >
                  {saving ? "Menyimpan…" : "Simpan perubahan"}
                </Button>
              </footer>
            </form>
          </SettingsPanel>
          {activeMenu === "profil" ? (
            <SettingsPanel id="settings-account-info" title="Informasi akun">
              <dl className="divide-y divide-voyage-soft-border">
                <AccountRow title="Peran akun">Kapten</AccountRow>
                <AccountRow title="ID akun">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 break-all select-all">
                      {savedSettings.userId}
                    </span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            aria-label="Salin ID akun"
                            disabled={saving}
                            onClick={copyAccountId}
                            size="icon"
                            type="button"
                            variant="quiet"
                          />
                        }
                      >
                        <Copy aria-hidden="true" className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent>Salin ID akun</TooltipContent>
                    </Tooltip>
                  </div>
                </AccountRow>
              </dl>
            </SettingsPanel>
          ) : null}
        </TabsContent>
      </Tabs>
    </MentorWorkspaceShell>
  );
}

export { KaptenSettingsPageModule };

"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { showToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { Check, Copy, Info, UserRound } from "@/lib/icons";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { saveKaptenSettingsAction } from "@/modules/mentor/settings-actions";
import type { KaptenSettings } from "@/modules/mentor/settings-types";

const SETTINGS_LABEL_CLASS_NAME = "text-sm font-medium leading-6 text-voyage-ink";

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
    <section aria-labelledby={`${id}-title`} className="min-w-0 scroll-mt-28 rounded-2xl border border-voyage-soft-border bg-voyage-surface" id={id}>
      <header className="border-b border-voyage-soft-border px-5 py-4">
        <h2 className="text-sm font-semibold leading-6 text-voyage-ink" id={`${id}-title`}>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function AccountRow({ children, description, title }: { children: ReactNode; description?: string; title: string }) {
  return (
    <div className="grid min-w-0 gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-6">
      <dt className={SETTINGS_LABEL_CLASS_NAME}>{title}</dt>
      <dd className="min-w-0 text-sm leading-6 text-voyage-ink">
        {children}
        {description ? <p className="mt-1 text-xs leading-5 text-voyage-muted-ink">{description}</p> : null}
      </dd>
    </div>
  );
}

function KaptenSettingsPageModule({ initialSettings, session }: { initialSettings: KaptenSettings; session: SessionContext }) {
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [profileName, setProfileName] = useState(initialSettings.profileName);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<{ field?: "profileName"; message: string } | null>(null);
  const [activeSection, setActiveSection] = useState("profil");
  const dirty = profileName !== savedSettings.profileName;
  const saving = status === "saving";
  const initials = savedSettings.profileName.trim().split(/\s+/u).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const currentSession = { ...session, user: { ...session.user, fullName: savedSettings.profileName } };

  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function navigateToSection(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving) return;
    setStatus("saving");
    setError(null);
    try {
      const result = await saveKaptenSettingsAction({ profileName });
      if (!result.ok) {
        setError({ field: result.field, message: result.message });
        setStatus("error");
        return;
      }
      setSavedSettings(result.settings);
      setProfileName(result.settings.profileName);
      setStatus("saved");
    } catch {
      setError({ message: "Perubahan belum tersimpan. Coba simpan lagi." });
      setStatus("error");
    }
  }

  async function copyAccountId() {
    try {
      await navigator.clipboard.writeText(savedSettings.userId);
      showToast("ID akun disalin.", { variant: "success" });
    } catch {
      showToast("ID akun belum bisa disalin. Pilih teks ID lalu salin secara manual.", { variant: "error" });
    }
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Pengaturan"
      breadcrumbLabel="Pengaturan"
      mainClassName="max-w-[944px] gap-8 px-4 py-6 md:px-6 lg:px-6 lg:py-8"
      navigationConfirmCopy={{ cancelLabel: "Tetap di sini", confirmLabel: "Buang perubahan", title: "Tinggalkan pengaturan?" }}
      onNavigateAway={() => !dirty && !saving}
      session={currentSession}
      shouldGuardNavigation={dirty || saving}
      showSearch={false}
      sidebarAppearance="reference"
    >
      <ReferencePageHeader title="Pengaturan" />

      <div className="flex min-w-0 items-center gap-4">
        <Avatar className="!size-14">
          <AvatarFallback className="bg-voyage-sea-glass-wash text-lg font-semibold text-voyage-deep">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-xl font-semibold leading-7 text-voyage-ink">{savedSettings.profileName}</p>
            <MentorBadge size="compact">Kapten</MentorBadge>
          </div>
          <p className="mt-1 break-all text-sm leading-6 text-voyage-muted-ink">{savedSettings.email}</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8">
        <nav aria-label="Bagian pengaturan" className="flex gap-2 md:flex-col md:self-start">
          {[
            { icon: UserRound, id: "profil", label: "Profil" },
            { icon: Info, id: "informasi-akun", label: "Informasi akun" },
          ].map(({ icon: Icon, id, label }) => (
            <Button
              aria-controls={id}
              aria-pressed={activeSection === id}
              className="min-h-11 flex-1 justify-start gap-3 whitespace-normal px-3 text-left md:w-full md:flex-none"
              key={id}
              onClick={() => navigateToSection(id)}
              type="button"
              variant={activeSection === id ? "contextSelected" : "ghost"}
            >
              <Icon aria-hidden="true" className="size-4" />{label}
            </Button>
          ))}
        </nav>

        <div className="grid min-w-0 gap-4">
          <SettingsPanel id="profil" title="Profil">
            <form aria-busy={saving} onSubmit={handleSubmit}>
              <Field className="grid gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-6">
                <FieldLabel className={SETTINGS_LABEL_CLASS_NAME} htmlFor="kapten-profile-name" required>Nama profil</FieldLabel>
                <FieldInput
                  aria-describedby={error?.field === "profileName" ? "kapten-profile-name-error" : undefined}
                  aria-invalid={error?.field === "profileName"}
                  autoComplete="name"
                  className={REFERENCE_CONTROL_CLASS_NAMES.input}
                  disabled={saving}
                  id="kapten-profile-name"
                  maxLength={160}
                  name="profileName"
                  onChange={(event) => { setProfileName(event.target.value); setStatus("idle"); setError(null); }}
                  required
                  value={profileName}
                />
                {error?.field === "profileName" ? (
                  <div className="sm:col-start-2">
                    <FieldError error={error.message} id="kapten-profile-name-error" />
                  </div>
                ) : null}
              </Field>
              <dl className="border-t border-voyage-soft-border">
                <AccountRow description="Email login tidak dapat diubah di sini." title="Email login">
                  <span className="break-all">{savedSettings.email}</span>
                </AccountRow>
              </dl>
              <footer className="flex flex-wrap items-center justify-end gap-4 border-t border-voyage-soft-border px-5 py-4">
                <div className="mr-auto min-w-0 flex-1 basis-full text-sm leading-6 sm:basis-auto">
                  {error && !error.field ? <p className="text-student-status-danger-fg" role="alert">{error.message}</p> : (
                    <p aria-live="polite" className={status === "saved" && !dirty ? "flex items-center gap-2 text-voyage-deep" : "text-voyage-muted-ink"}>
                      {status === "saved" && !dirty ? <Check aria-hidden="true" className="size-4" /> : null}
                      {saving ? "Menyimpan perubahan…" : dirty ? "Ada perubahan yang belum disimpan" : status === "saved" ? "Perubahan tersimpan" : ""}
                    </p>
                  )}
                </div>
                <Button disabled={!dirty || saving} onClick={() => { setProfileName(savedSettings.profileName); setStatus("idle"); setError(null); }} type="button" variant="context">Batal</Button>
                <Button disabled={!dirty || saving} type="submit" variant="brand">{saving ? "Menyimpan…" : "Simpan perubahan"}</Button>
              </footer>
            </form>
          </SettingsPanel>

          <SettingsPanel id="informasi-akun" title="Informasi akun">
            <dl className="divide-y divide-voyage-soft-border">
              <AccountRow title="Peran akun">Kapten</AccountRow>
              <AccountRow description="Sertakan ID ini saat melaporkan kendala akun." title="ID akun">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 break-all select-all">{savedSettings.userId}</span>
                  <Tooltip>
                    <TooltipTrigger render={<Button aria-label="Salin ID akun" className="min-h-11 min-w-11" onClick={copyAccountId} size="icon" type="button" variant="ghost" />}>
                      <Copy aria-hidden="true" className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent>Salin ID akun</TooltipContent>
                  </Tooltip>
                </div>
              </AccountRow>
            </dl>
          </SettingsPanel>
        </div>
      </div>
    </MentorWorkspaceShell>
  );
}

export { KaptenSettingsPageModule };

"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES, REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { showToast } from "@/components/ui/toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { BookOpen, Copy, UserRound } from "@/lib/icons";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import { saveKaptenSettingsAction, saveKaptenSubjectAction } from "@/modules/mentor/settings-actions";
import type { KaptenSettings } from "@/modules/mentor/settings-types";

const SETTINGS_LABEL_CLASS_NAME = "text-sm font-medium leading-6 text-voyage-ink";
type SettingsMenu = "profil" | "subjek";
type MenuFeedback = {
  status: "idle" | "saving" | "saved" | "error";
  error?: { field?: "profileName" | "subjectCode"; message: string };
};

function SettingsPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section aria-labelledby="settings-panel-title" className="min-w-0 rounded-panel border border-voyage-soft-border bg-voyage-surface" id="settings-panel">
      <header className="border-b border-voyage-soft-border px-5 py-4">
        <h2 className="text-sm font-semibold leading-6 text-voyage-ink" id="settings-panel-title">{title}</h2>
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
  const [subjectCode, setSubjectCode] = useState(initialSettings.subjectCode ?? "");
  const [activeMenu, setActiveMenu] = useState<SettingsMenu>("profil");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [feedback, setFeedback] = useState<Record<SettingsMenu, MenuFeedback>>({ profil: { status: "idle" }, subjek: { status: "idle" } });
  const menuDirty = { profil: profileName !== savedSettings.profileName, subjek: subjectCode !== (savedSettings.subjectCode ?? "") };
  const dirty = menuDirty.profil || menuDirty.subjek;
  const saving = feedback.profil.status === "saving" || feedback.subjek.status === "saving";
  const { error, status } = feedback[activeMenu];
  const activeDirty = menuDirty[activeMenu];
  const otherMenu = activeMenu === "profil" ? "subjek" : "profil";
  const initials = savedSettings.profileName.trim().split(/\s+/u).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const currentSession = { ...session, user: { ...session.user, fullName: savedSettings.profileName } };

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const updateOrientation = () => setOrientation(desktop.matches ? "vertical" : "horizontal");
    updateOrientation();
    desktop.addEventListener("change", updateOrientation);
    return () => desktop.removeEventListener("change", updateOrientation);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function updateFeedback(menu: SettingsMenu, next: MenuFeedback) {
    setFeedback((previous) => ({ ...previous, [menu]: next }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeDirty || saving) return;
    const menu = activeMenu;
    updateFeedback(menu, { status: "saving" });
    try {
      const result = menu === "profil"
        ? await saveKaptenSettingsAction({ profileName })
        : await saveKaptenSubjectAction({ subjectCode: subjectCode || null });
      if (!result.ok) {
        updateFeedback(menu, { status: "error", error: { field: result.field, message: result.message } });
        if (!result.field) showToast(result.message, { variant: "error" });
        return;
      }
      setSavedSettings(result.settings);
      // Saving one menu never discards the draft in the other menu.
      if (menu === "profil") setProfileName(result.settings.profileName);
      else setSubjectCode(result.settings.subjectCode ?? "");
      updateFeedback(menu, { status: "saved" });
      showToast("Perubahan tersimpan.", { variant: "success" });
    } catch {
      updateFeedback(menu, { status: "error" });
      showToast("Perubahan belum tersimpan. Coba simpan lagi.", { variant: "error" });
    }
  }

  function cancelChanges() {
    if (activeMenu === "profil") setProfileName(savedSettings.profileName);
    else setSubjectCode(savedSettings.subjectCode ?? "");
    updateFeedback(activeMenu, { status: "idle" });
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
      activeLabel="Pengaturan" breadcrumbLabel="Pengaturan"
      mainClassName="max-w-[944px] gap-8 px-4 py-6 md:px-6 lg:px-6 lg:py-8"
      navigationConfirmCopy={{ cancelLabel: "Tetap di sini", confirmLabel: "Buang perubahan", title: "Tinggalkan pengaturan?" }}
      onNavigateAway={() => !dirty && !saving} session={currentSession}
      shouldGuardNavigation={dirty || saving} showSearch={false} sidebarAppearance="reference"
    >
      <ReferencePageHeader title="Pengaturan" />
      <div className="flex min-w-0 items-center gap-4">
        <Avatar className="!size-14"><AvatarFallback className="bg-voyage-sea-glass-wash text-lg font-semibold text-voyage-deep">{initials}</AvatarFallback></Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-xl font-semibold leading-7 text-voyage-ink">{savedSettings.profileName}</p>
            <Badge depth="flat" size="xs" tone="neutral">Kapten</Badge>
          </div>
          <p className="mt-1 break-all text-sm leading-6 text-voyage-muted-ink">{savedSettings.email}</p>
        </div>
      </div>

      <Tabs className="grid min-w-0 gap-6 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8" onValueChange={(value) => { if (value === "profil" || value === "subjek") setActiveMenu(value); }} orientation={orientation} value={activeMenu}>
        <TabsList aria-label="Menu pengaturan" className="h-auto w-full md:self-start" layout="equal">
          {([
            { icon: UserRound, id: "profil", label: "Profil" },
            { icon: BookOpen, id: "subjek", label: "Subjek" },
          ] as const).map(({ icon: Icon, id, label }) => (
            <TabsTrigger className="justify-start gap-3 whitespace-normal text-left md:w-full md:flex-none" disabled={saving} key={id} layout="equal" value={id}>
              <Icon aria-hidden="true" className="size-4" />{label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent className="min-w-0" key={activeMenu} value={activeMenu}>
        <SettingsPanel title={activeMenu === "profil" ? "Profil" : "Subjek"}>
          <form aria-busy={saving} onSubmit={handleSubmit}>
            {activeMenu === "profil" ? <>
              <Field className="grid gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-6">
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-profile-name" required>Nama profil</FieldLabel>
                <FieldInput
                  aria-describedby={error?.field === "profileName" ? "kapten-profile-name-error" : undefined}
                  aria-invalid={error?.field === "profileName"} autoComplete="name"
                  className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={saving} id="kapten-profile-name"
                  maxLength={160} name="profileName" required value={profileName}
                  onChange={(event) => { setProfileName(event.target.value); updateFeedback("profil", { status: "idle" }); }}
                />
                {error?.field === "profileName" ? <div className="sm:col-start-2"><FieldError error={error.message} id="kapten-profile-name-error" /></div> : null}
              </Field>
              <dl className="border-t border-voyage-soft-border">
                <AccountRow description="Email login tidak dapat diubah di sini." title="Email login"><span className="break-all">{savedSettings.email}</span></AccountRow>
              </dl>
              <h3 className="border-t border-voyage-soft-border px-5 pt-4 text-sm font-semibold leading-6 text-voyage-ink">Informasi akun</h3>
              <dl className="divide-y divide-voyage-soft-border">
                <AccountRow title="Peran akun">Kapten</AccountRow>
                <AccountRow description="Sertakan ID ini saat melaporkan kendala akun." title="ID akun">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 break-all select-all">{savedSettings.userId}</span>
                    <Tooltip>
                      <TooltipTrigger render={<Button aria-label="Salin ID akun" disabled={saving} onClick={copyAccountId} size="icon" type="button" variant="outline" />}><Copy aria-hidden="true" className="size-4" /></TooltipTrigger>
                      <TooltipContent>Salin ID akun</TooltipContent>
                    </Tooltip>
                  </div>
                </AccountRow>
              </dl>
            </> : <div className="grid min-w-0 gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start sm:gap-6">
              <label className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-teaching-subject">Subjek yang diajar</label>
              <div className="min-w-0">
                <ReferenceSelect
                  aria-describedby={error?.field === "subjectCode" ? "kapten-teaching-subject-help kapten-teaching-subject-error" : "kapten-teaching-subject-help"}
                  aria-invalid={error?.field === "subjectCode"} aria-label="Subjek yang diajar"
                  disabled={saving} id="kapten-teaching-subject" name="subjectCode"
                  onValueChange={(value) => { setSubjectCode(value); updateFeedback("subjek", { status: "idle" }); }}
                  options={[{ label: "Tidak ditentukan", value: "" }, ...kaptenSubjects.map((subject) => ({ label: subject.name, value: subject.code }))]}
                  placeholder="Tidak ditentukan" value={subjectCode}
                />
                <p className="mt-2 text-xs leading-5 text-voyage-muted-ink" id="kapten-teaching-subject-help">Menjadi filter awal di daftar kuis. Anda tetap bisa memilih subjek lain atau semua subjek.</p>
                {error?.field === "subjectCode" ? <FieldError error={error.message} id="kapten-teaching-subject-error" /> : null}
              </div>
            </div>}
            <footer className="flex flex-wrap items-center justify-end gap-4 border-t border-voyage-soft-border px-5 py-4">
              <p className="mr-auto min-w-0 flex-1 basis-full text-sm leading-6 text-voyage-muted-ink sm:basis-auto">
                {saving ? "Menyimpan perubahan…" : activeDirty ? "Ada perubahan yang belum disimpan" : menuDirty[otherMenu] ? `Ada perubahan yang belum disimpan di ${otherMenu === "profil" ? "Profil" : "Subjek"}` : status === "saved" ? "Perubahan tersimpan" : ""}
              </p>
              <Button disabled={!activeDirty || saving} onClick={cancelChanges} type="button" variant="outline">Batal</Button>
              <Button disabled={!activeDirty || saving} type="submit">{saving ? "Menyimpan…" : "Simpan perubahan"}</Button>
            </footer>
          </form>
        </SettingsPanel>
        </TabsContent>
      </Tabs>
    </MentorWorkspaceShell>
  );
}

export { KaptenSettingsPageModule };

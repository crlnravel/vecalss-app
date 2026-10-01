"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldInput } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { showToast } from "@/components/ui/toast";
import { parseTryoutDateTime } from "@/lib/tryout/time";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import {
  HelpFieldLabel,
  OperationalPageHeader,
} from "@/modules/mentor/KaptenTryoutOperationalShared";
import { createTryoutDeliverySessionAction } from "@/modules/mentor/tryout-actions";

type SessionDraft = {
  availableFrom: string;
  availableUntil: string;
  fullscreenPrompt: boolean;
  name: string;
  status: "draft" | "active";
};

const emptySession: SessionDraft = {
  availableFrom: "",
  availableUntil: "",
  fullscreenPrompt: false,
  name: "",
  status: "active",
};

function KaptenTryoutSessionCreatePageModule({
  initial,
}: {
  initial: TryoutOperationsView;
}) {
  const router = useRouter();
  const [session, setSession] = useState<SessionDraft>(emptySession);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<{ field: "name" | "schedule"; message: string } | null>(null);
  const sessionsHref = `/mentor/tryout/${initial.id}?workspace=operations&delivery=sessions`;

  const handleCreate = async () => {
    if (!session.name.trim()) {
      setValidation({ field: "name", message: "Nama sesi wajib diisi." });
      return;
    }
    const availableFrom = parseTryoutDateTime(session.availableFrom);
    const availableUntil = parseTryoutDateTime(session.availableUntil);
    if (Number.isNaN(availableFrom.getTime()) || Number.isNaN(availableUntil.getTime())) {
      setValidation({ field: "schedule", message: "Waktu mulai dan selesai sesi tidak valid." });
      return;
    }
    if (availableUntil <= availableFrom) {
      setValidation({ field: "schedule", message: "Waktu selesai harus setelah waktu mulai." });
      return;
    }
    setBusy(true);
    setValidation(null);
    try {
      const result = await createTryoutDeliverySessionAction(
        { ...session, rankingRule: "none", resultReleasePolicy: "inherit", tryoutId: initial.id },
        "Membuat sesi Tryout",
      );
      if (!result.ok) {
        showToast(result.message ?? "Sesi tidak dapat dibuat.", {
          variant: "error",
        });
        return;
      }
      router.push(`/mentor/tryout/${initial.id}?workspace=operations&delivery=sessions`);
    } catch (createError) {
      showToast(
        createError instanceof Error
          ? createError.message
          : "Sesi tidak dapat dibuat.",
        { variant: "error" },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
      <OperationalPageHeader
        backHref={sessionsHref}
        description={initial.title}
        divider={false}
        title="Buat sesi"
      />
      <form className="mt-5" onSubmit={(event) => { event.preventDefault(); void handleCreate(); }}>
      <ReferenceSurface as="section" className="grid gap-6 p-5 sm:p-7">
        <h2 className="text-xl font-semibold text-secondary-900">Informasi sesi</h2>
        <div className="grid gap-6">
          <Field>
            <HelpFieldLabel htmlFor="session-name" label="Nama sesi" required />
            <FieldInput
              aria-describedby={validation?.field === "name" ? "session-name-error" : undefined}
              aria-invalid={validation?.field === "name" || undefined}
              className={REFERENCE_CONTROL_CLASS_NAMES.input}
              id="session-name"
              onChange={(event) => {
                setSession({ ...session, name: event.target.value });
                if (validation?.field === "name") setValidation(null);
              }}
              placeholder="Contoh: Tryout Nasional Agustus"
              required
              value={session.name}
            />
            <FieldError error={validation?.field === "name" ? validation.message : undefined} id="session-name-error" />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <HelpFieldLabel htmlFor="session-from" label="Mulai (WIB)" required />
              <FieldInput
                aria-describedby={validation?.field === "schedule" ? "session-schedule-error" : undefined}
                aria-invalid={validation?.field === "schedule" || undefined}
                className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-12`}
                id="session-from"
                onChange={(event) => {
                  setSession({ ...session, availableFrom: event.target.value });
                  if (validation?.field === "schedule") setValidation(null);
                }}
                required
                type="datetime-local"
                value={session.availableFrom}
              />
            </Field>
            <Field>
              <HelpFieldLabel htmlFor="session-until" label="Selesai (WIB)" required />
              <FieldInput
                aria-describedby={validation?.field === "schedule" ? "session-schedule-error" : undefined}
                aria-invalid={validation?.field === "schedule" || undefined}
                className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-12`}
                id="session-until"
                onChange={(event) => {
                  setSession({ ...session, availableUntil: event.target.value });
                  if (validation?.field === "schedule") setValidation(null);
                }}
                required
                type="datetime-local"
                value={session.availableUntil}
              />
            </Field>
          </div>
          <FieldError error={validation?.field === "schedule" ? validation.message : undefined} id="session-schedule-error" />

          <div className="grid gap-3 md:grid-cols-2">
            <Field className="min-h-16 flex-row items-center justify-between rounded-2xl border border-primary-100 bg-white px-4 py-3 shadow-[0_12px_30px_-26px_color-mix(in_oklab,var(--voyage-forest)_50%,transparent)]">
              <HelpFieldLabel htmlFor="session-status" label="Aktif saat dibuat" tooltip="Sesi langsung dapat dipakai peserta setelah dibuat. Matikan untuk membuat draf dan membukanya nanti." />
              <Switch
                checked={session.status === "active"}
                id="session-status"
                onCheckedChange={(active) =>
                  setSession({ ...session, status: active ? "active" : "draft" })
                }
              />
            </Field>
            <Field className="min-h-16 flex-row items-center justify-between rounded-2xl border border-primary-100 bg-white px-4 py-3 shadow-[0_12px_30px_-26px_color-mix(in_oklab,var(--voyage-forest)_50%,transparent)]">
              <HelpFieldLabel htmlFor="session-fullscreen" label="Minta layar penuh" tooltip="Peserta diminta masuk mode layar penuh. Keluar setelah masuk dicatat sebagai peringatan integritas tanpa konsekuensi otomatis." />
              <Switch
                checked={session.fullscreenPrompt}
                id="session-fullscreen"
                onCheckedChange={(fullscreenPrompt) =>
                  setSession({ ...session, fullscreenPrompt })
                }
              />
            </Field>
          </div>
        </div>
      </ReferenceSurface>
      <div className="mt-5 flex justify-end">
        <Button disabled={busy} type="submit" variant="outline">
          {busy ? "Membuat…" : "Buat sesi"}
        </Button>
      </div>
      </form>
    </main>
  );
}

export { KaptenTryoutSessionCreatePageModule };

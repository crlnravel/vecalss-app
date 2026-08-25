"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldInput } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import {
  HelpFieldLabel,
  OperationalPageHeader,
  OperationNotice,
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
  const [notice, setNotice] = useState<{ message: string; tone: "default" | "error" } | null>(null);
  const sessionsHref = `/mentor/tryout/${initial.id}?workspace=schedule&delivery=sessions`;

  const handleCreate = async () => {
    if (
      !session.name.trim() ||
      !session.availableFrom ||
      !session.availableUntil
    ) {
      setNotice({ message: "Lengkapi semua kolom wajib sebelum membuat sesi.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const result = await createTryoutDeliverySessionAction(
        { ...session, rankingRule: "none", resultReleasePolicy: "inherit", tryoutId: initial.id },
        "Membuat sesi Tryout",
      );
      if (!result.ok) {
        setNotice({ message: result.message ?? "Sesi tidak dapat dibuat.", tone: "error" });
        return;
      }
      router.push(`/mentor/tryout/${initial.id}?workspace=schedule&delivery=sessions`);
    } catch (createError) {
      setNotice({ message: createError instanceof Error ? createError.message : "Sesi tidak dapat dibuat.", tone: "error" });
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
      <OperationNotice message={notice?.message ?? null} tone={notice?.tone} />

      <Card className="mt-5 shadow-none ring-primary-100">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Informasi sesi</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <Field>
            <HelpFieldLabel htmlFor="session-name" label="Nama sesi" required />
            <FieldInput
              aria-required="true"
              id="session-name"
              onChange={(event) =>
                setSession({ ...session, name: event.target.value })
              }
              placeholder="Contoh: Tryout Nasional Agustus"
              value={session.name}
            />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <HelpFieldLabel htmlFor="session-from" label="Mulai (WIB)" required />
              <FieldInput
                aria-required="true"
                id="session-from"
                onChange={(event) =>
                  setSession({ ...session, availableFrom: event.target.value })
                }
                type="datetime-local"
                value={session.availableFrom}
              />
            </Field>
            <Field>
              <HelpFieldLabel htmlFor="session-until" label="Selesai (WIB)" required />
              <FieldInput
                aria-required="true"
                id="session-until"
                onChange={(event) =>
                  setSession({ ...session, availableUntil: event.target.value })
                }
                type="datetime-local"
                value={session.availableUntil}
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field className="min-h-16 flex-row items-center justify-between rounded-2xl border border-secondary-900/14 bg-white px-4 py-3">
              <HelpFieldLabel htmlFor="session-status" label="Aktif saat dibuat" tooltip="Sesi langsung dapat dipakai peserta setelah dibuat. Matikan untuk membuat draf dan membukanya nanti." />
              <Switch
                checked={session.status === "active"}
                id="session-status"
                onCheckedChange={(active) =>
                  setSession({ ...session, status: active ? "active" : "draft" })
                }
              />
            </Field>
            <Field className="min-h-16 flex-row items-center justify-between rounded-2xl border border-secondary-900/14 bg-white px-4 py-3">
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
        </CardContent>
      </Card>
      <div className="mt-5 flex justify-end">
        <Button disabled={busy} onClick={() => void handleCreate()} variant="brand">
          {busy ? "Membuat…" : "Buat sesi"}
        </Button>
      </div>
    </main>
  );
}

export { KaptenTryoutSessionCreatePageModule };

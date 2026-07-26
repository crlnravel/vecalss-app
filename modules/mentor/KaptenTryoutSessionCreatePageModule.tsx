"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldInput } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { policyLabels } from "@/modules/mentor/KaptenTryoutOperationsModule";
import type { Policy } from "@/modules/mentor/KaptenTryoutOperationsModule";
import {
  HelpFieldLabel,
  OperationalPageHeader,
  OperationNotice,
  OptionSet,
} from "@/modules/mentor/KaptenTryoutOperationalShared";
import { createTryoutDeliverySessionAction } from "@/modules/mentor/tryout-actions";

type SessionDraft = {
  auditReason: string;
  availableFrom: string;
  availableUntil: string;
  fullscreenPrompt: boolean;
  isDefaultOpenRegistration: boolean;
  name: string;
  rankingRule: "national" | "cohort" | "none";
  resultReleasePolicy: "inherit" | Policy;
  scheduledReleaseAt: string;
};

const emptySession: SessionDraft = {
  auditReason: "",
  availableFrom: "",
  availableUntil: "",
  fullscreenPrompt: false,
  isDefaultOpenRegistration: false,
  name: "",
  rankingRule: "national",
  resultReleasePolicy: "inherit",
  scheduledReleaseAt: "",
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
  const sessionsHref = `/mentor/tryout/${initial.id}?workspace=sessions`;

  const handleCreate = async () => {
    if (
      !session.name.trim() ||
      !session.availableFrom ||
      !session.availableUntil ||
      (session.resultReleasePolicy === "scheduled" && !session.scheduledReleaseAt) ||
      !session.auditReason.trim()
    ) {
      setNotice({ message: "Lengkapi semua kolom wajib sebelum menyimpan sesi.", tone: "error" });
      return;
    }
    if (session.resultReleasePolicy === "scheduled" && new Date(session.scheduledReleaseAt) < new Date(session.availableUntil)) {
      setNotice({ message: "Waktu rilis hasil harus sama dengan atau setelah sesi selesai.", tone: "error" });
      return;
    }
    setBusy(true);
    const result = await createTryoutDeliverySessionAction(
      { ...session, tryoutId: initial.id },
      session.auditReason,
    );
    setBusy(false);
    if (!result.ok) {
      setNotice({ message: result.message ?? "Sesi tidak dapat dibuat.", tone: "error" });
      return;
    }
    router.push(`/mentor/tryout/${initial.id}/operations/sessions/${result.result.id}`);
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
              <HelpFieldLabel htmlFor="session-from" label="Mulai" required />
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
              <HelpFieldLabel htmlFor="session-until" label="Selesai" required />
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

          <div className="grid gap-7 lg:grid-cols-2">
            <OptionSet
              label="Peringkat"
              labelTooltip="Menentukan populasi peringkat yang ditampilkan pada paket hasil sesi."
              onValueChange={(rankingRule) =>
                setSession({ ...session, rankingRule })
              }
              options={[
                { label: "Nasional", tooltip: "Membandingkan peserta dengan seluruh attempt bernilai pada sesi ini.", value: "national" },
                { label: "Cohort", tooltip: "Membandingkan peserta dalam kelompok peserta yang ditugaskan ke sesi ini.", value: "cohort" },
                { label: "Tanpa peringkat", tooltip: "Paket hasil tidak menampilkan posisi peringkat peserta.", value: "none" },
              ]}
              required
              value={session.rankingRule}
            />
            <OptionSet
              label="Rilis hasil"
              labelTooltip="Menentukan kapan paket nilai, pembahasan, peringkat, dan laporan dapat dilihat peserta."
              onValueChange={(resultReleasePolicy) =>
                setSession({ ...session, resultReleasePolicy, scheduledReleaseAt: resultReleasePolicy === "scheduled" ? session.scheduledReleaseAt : "" })
              }
              options={[
                { label: "Ikuti kebijakan Tryout", tooltip: "Menggunakan kebijakan rilis default yang dipilih pada tab Kebijakan.", value: "inherit" },
                ...(
                  ["immediate", "automatic_at_end", "manual", "scheduled"] as Policy[]
                ).map((value) => ({
                  label: policyLabels[value],
                  tooltip: value === "immediate"
                    ? "Membuka hasil setelah perhitungan peserta lengkap."
                    : value === "automatic_at_end"
                      ? "Membuka hasil setelah sesi berakhir dan perhitungan lengkap."
                      : value === "manual"
                        ? "Menunggu operator merilis seluruh hasil sesi secara manual."
                        : "Membuka hasil otomatis pada tanggal dan waktu yang ditentukan setelah sesi selesai.",
                  value,
                })),
              ]}
              required
              value={session.resultReleasePolicy}
            />
          </div>

          {session.resultReleasePolicy === "scheduled" ? (
            <Field>
              <HelpFieldLabel htmlFor="session-release-at" label="Waktu rilis hasil" required tooltip="Paket hasil dibuka otomatis pada waktu ini setelah seluruh perhitungan valid. Waktu harus sama dengan atau setelah sesi selesai." />
              <FieldInput
                aria-required="true"
                id="session-release-at"
                min={session.availableUntil || undefined}
                onChange={(event) => setSession({ ...session, scheduledReleaseAt: event.target.value })}
                type="datetime-local"
                value={session.scheduledReleaseAt}
              />
            </Field>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
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
            <Field className="min-h-16 flex-row items-center justify-between rounded-2xl border border-secondary-900/14 bg-white px-4 py-3">
              <HelpFieldLabel htmlFor="session-default" label="Sesi utama pendaftaran" tooltip="Peserta dari pendaftaran terbuka akan otomatis ditugaskan ke sesi ini. Hanya satu sesi aktif yang dapat menjadi sesi utama." />
              <Switch
                checked={session.isDefaultOpenRegistration}
                id="session-default"
                onCheckedChange={(isDefaultOpenRegistration) =>
                  setSession({ ...session, isDefaultOpenRegistration })
                }
              />
            </Field>
          </div>

          <Field>
            <HelpFieldLabel htmlFor="session-audit-reason" label="Alasan audit" required tooltip="Alasan ini disimpan pada jejak audit untuk menjelaskan pembuatan dan konfigurasi sesi." />
            <FieldInput
              aria-required="true"
              id="session-audit-reason"
              onChange={(event) =>
                setSession({ ...session, auditReason: event.target.value })
              }
              placeholder="Contoh: Membuka jadwal Tryout gelombang pertama"
              value={session.auditReason}
            />
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t border-primary-100">
          <Button disabled={busy} onClick={() => void handleCreate()} variant="brand">
            <Save data-icon="inline-start" />
            {busy ? "Menyimpan…" : "Simpan draft"}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export { KaptenTryoutSessionCreatePageModule };

"use client";

import { Save } from "lucide-react";
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
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { modeLabels, policyLabels, type DefaultPolicy, type Mode } from "@/modules/mentor/KaptenTryoutOperationsData";
import {
  HelpFieldLabel,
  OperationalPageHeader,
  OperationNotice,
  OptionSet,
} from "@/modules/mentor/KaptenTryoutOperationalShared";
import {
  configureTryoutAdmissionAction,
  configureTryoutDefaultResultReleaseAction,
} from "@/modules/mentor/tryout-actions";

function KaptenTryoutPolicyPageModule({
  embedded = false,
  initial,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
}) {
  const [admissionMode, setAdmissionMode] = useState(
    initial.admissionMode as Mode,
  );
  const [defaultReleasePolicy, setDefaultReleasePolicy] = useState(
    initial.defaultReleasePolicy as DefaultPolicy,
  );
  const [auditReason, setAuditReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "default" | "error" } | null>(null);
  const tryoutHref = `/mentor/tryout/${initial.id}`;

  const handleSave = async () => {
    if (!auditReason.trim()) {
      setNotice({ message: "Alasan audit wajib diisi.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const [admission, release] = await Promise.all([
        configureTryoutAdmissionAction(
          initial.id,
          admissionMode,
          auditReason,
        ),
        configureTryoutDefaultResultReleaseAction(
          initial.id,
          defaultReleasePolicy,
          auditReason,
        ),
      ]);
      if (!admission.ok) {
        setNotice({ message: admission.message ?? "Kebijakan admission gagal disimpan.", tone: "error" });
        return;
      }
      if (!release.ok) {
        setNotice({ message: release.message ?? "Kebijakan rilis gagal disimpan.", tone: "error" });
        return;
      }
      setAuditReason("");
      setNotice({ message: "Kebijakan Tryout berhasil disimpan.", tone: "default" });
    } catch (saveError) {
      setNotice({ message: saveError instanceof Error ? saveError.message : "Kebijakan Tryout belum dapat disimpan.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? null : <OperationalPageHeader
        backHref={tryoutHref}
        description={initial.title}
        title="Kebijakan Tryout"
      />}
      <OperationNotice message={notice?.message ?? null} tone={notice?.tone} />

      <Card className={`${embedded ? "" : "mt-5"} shadow-none ring-primary-100`}>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Akses dan hasil</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-7 lg:grid-cols-2">
          <OptionSet
            label="Admission peserta"
            labelTooltip="Menentukan bagaimana peserta memperoleh akses ke Tryout ini."
            onValueChange={setAdmissionMode}
            options={(Object.entries(modeLabels) as Array<[Mode, string]>).map(
              ([value, label]) => ({
                label,
                tooltip: value === "open"
                  ? "Peserta dapat mendaftar dan memperoleh admission aktif tanpa persetujuan manual."
                  : value === "approval_required"
                    ? "Pendaftaran peserta menunggu keputusan mentor sebelum dapat ditugaskan ke sesi."
                    : "Hanya peserta yang diundang mentor yang dapat memperoleh akses.",
                value,
              }),
            )}
            required
            value={admissionMode}
          />
          <OptionSet
            label="Rilis hasil default"
            labelTooltip="Kebijakan ini digunakan oleh sesi yang memilih Ikuti kebijakan Tryout."
            onValueChange={setDefaultReleasePolicy}
            options={(["immediate", "automatic_at_end", "manual"] as DefaultPolicy[]).map((value) => ({
              label: policyLabels[value],
              tooltip: value === "immediate"
                ? "Hasil dibuka setelah perhitungan peserta lengkap; peringkat dapat bersifat sementara sampai sesi selesai."
                : value === "automatic_at_end"
                  ? "Hasil dibuka setelah waktu sesi berakhir dan perhitungan lengkap."
                  : "Hasil tetap tertutup sampai operator merilis seluruh hasil sesi secara manual.",
              value,
            }))}
            required
            value={defaultReleasePolicy}
          />
          <Field className="lg:col-span-2">
            <HelpFieldLabel htmlFor="policy-audit-reason" label="Alasan audit" required tooltip="Alasan ini disimpan pada jejak audit untuk menjelaskan perubahan kebijakan." />
            <FieldInput
              aria-required="true"
              id="policy-audit-reason"
              onChange={(event) => setAuditReason(event.target.value)}
              placeholder="Contoh: Menyesuaikan kebijakan pendaftaran Tryout"
              value={auditReason}
            />
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t border-primary-100">
          <Button disabled={busy} onClick={() => void handleSave()} variant="brand">
            <Save data-icon="inline-start" />
            {busy ? "Menyimpan…" : "Simpan kebijakan"}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export { KaptenTryoutPolicyPageModule };

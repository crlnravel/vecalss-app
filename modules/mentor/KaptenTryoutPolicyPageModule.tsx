"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { policyLabels, type DefaultPolicy, type Mode } from "@/modules/mentor/KaptenTryoutOperationsData";
import {
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
  onNext,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
  onNext?: () => void;
}) {
  const [admissionMode, setAdmissionMode] = useState<Mode>("open");
  const [defaultReleasePolicy, setDefaultReleasePolicy] = useState(
    initial.defaultReleasePolicy as DefaultPolicy,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "default" | "error" } | null>(null);
  const tryoutHref = `/mentor/tryout/${initial.id}`;

  const handleSave = async () => {
    setBusy(true);
    try {
      const [admission, release] = await Promise.all([
        configureTryoutAdmissionAction(
          initial.id,
          admissionMode,
          "Pengaturan akses peserta Tryout",
        ),
        configureTryoutDefaultResultReleaseAction(
          initial.id,
          defaultReleasePolicy,
          "Pengaturan jadwal rilis hasil Tryout",
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
      setNotice(null);
      onNext?.();
    } catch (saveError) {
      setNotice({ message: saveError instanceof Error ? saveError.message : "Kebijakan Tryout belum dapat disimpan.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const Root = embedded ? "section" : "main";

  return (
    <Root className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? null : <OperationalPageHeader
        backHref={tryoutHref}
        description={initial.title}
        title="Kebijakan Tryout"
      />}
      <OperationNotice message={notice?.message ?? null} tone={notice?.tone} />

      <Card className={`${embedded ? "" : "mt-5"} border border-primary-100 bg-white shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] ring-0`}>
        <CardContent className="grid gap-7 lg:grid-cols-2">
          <OptionSet
            label="Akses peserta"
            onValueChange={setAdmissionMode}
            options={[
              { disabled: true, label: "Perlu persetujuan", value: "approval_required" },
              { disabled: true, label: "Undangan saja", value: "invitation_only" },
              { label: "Terbuka", value: "open" },
            ]}
            required
            value={admissionMode}
          />
          <OptionSet
            label="Jadwal rilis hasil"
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
        </CardContent>
      </Card>
      <div className="mt-5 flex justify-end">
        <Button disabled={busy} onClick={() => void handleSave()} variant="brand">
          {busy ? "Menyimpan…" : "Selanjutnya"}
        </Button>
      </div>
    </Root>
  );
}

export { KaptenTryoutPolicyPageModule };

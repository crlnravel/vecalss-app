"use client";

import { AlertTriangle } from "@/lib/icons";
import { useState } from "react";

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
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { modeLabels, policyLabels, type DefaultPolicy, type Mode } from "@/modules/mentor/KaptenTryoutOperationsData";
import {
  OperationalPageHeader,
  OperationNotice,
  OptionSet,
} from "@/modules/mentor/KaptenTryoutOperationalShared";
import {
  configureTryoutAdmissionAction,
  configureTryoutDefaultResultReleaseAction,
} from "@/modules/mentor/tryout-actions";

type TryoutPolicyInitial = {
  admissionMode: Mode;
  defaultReleasePolicy: DefaultPolicy;
  id: string;
  title: string;
};

type CreatePolicyChange = {
  admissionMode: Mode;
  defaultReleasePolicy: DefaultPolicy;
};

function KaptenTryoutPolicyPageModule({
  embedded = false,
  initial,
  mode = "edit",
  onCreatePolicyChange,
  onNext,
}: {
  embedded?: boolean;
  initial: TryoutPolicyInitial;
  mode?: "create" | "edit";
  onCreatePolicyChange?: (policy: CreatePolicyChange) => void;
  onNext?: () => void;
}) {
  const initialAdmissionMode = mode === "create" ? "open" : initial.admissionMode as Mode;
  const initialDefaultReleasePolicy = initial.defaultReleasePolicy as DefaultPolicy;
  const [admissionMode, setAdmissionMode] = useState<Mode>(initialAdmissionMode);
  const [defaultReleasePolicy, setDefaultReleasePolicy] = useState(initialDefaultReleasePolicy);
  const [pendingAdmissionMode, setPendingAdmissionMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "default" | "error" } | null>(null);
  const tryoutHref = `/mentor/tryout/${initial.id}`;

  const admissionChanged = admissionMode !== initialAdmissionMode;
  const releaseChanged = defaultReleasePolicy !== initialDefaultReleasePolicy;

  const requestAdmissionMode = (next: Mode) => {
    if (next === admissionMode) return;
    setPendingAdmissionMode(next);
  };

  const confirmAdmissionMode = () => {
    if (pendingAdmissionMode) {
      setAdmissionMode(pendingAdmissionMode);
      onCreatePolicyChange?.({ admissionMode: pendingAdmissionMode, defaultReleasePolicy });
    }
    setPendingAdmissionMode(null);
  };

  const handleSave = async () => {
    if (!admissionChanged && !releaseChanged) {
      setNotice({
        message: mode === "create"
          ? "Kebijakan awal siap. Simpan draf Tryout untuk menerapkannya."
          : "Tidak ada perubahan untuk disimpan.",
        tone: "default",
      });
      onNext?.();
      return;
    }

    if (mode === "create") {
      setNotice({ message: "Kebijakan awal siap. Simpan draf Tryout untuk menerapkannya.", tone: "default" });
      onNext?.();
      return;
    }

    setBusy(true);
    try {
      if (admissionChanged) {
        const admission = await configureTryoutAdmissionAction(
          initial.id,
          admissionMode,
          "Pengaturan akses peserta Tryout",
        );
        if (!admission.ok) {
          setNotice({ message: admission.message ?? "Kebijakan akses peserta gagal disimpan.", tone: "error" });
          return;
        }
      }

      if (releaseChanged) {
        const release = await configureTryoutDefaultResultReleaseAction(
          initial.id,
          defaultReleasePolicy,
          "Pengaturan jadwal rilis hasil Tryout",
        );
        if (!release.ok) {
          setNotice({ message: release.message ?? "Kebijakan rilis gagal disimpan.", tone: "error" });
          return;
        }
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

      <div className={`${embedded ? "" : "mt-5"} grid gap-5 lg:grid-cols-2`}>
        <ReferenceSurface as="section" aria-label="Akses peserta" className="p-5 sm:p-6">
          <OptionSet
            label="Akses peserta"
            onValueChange={requestAdmissionMode}
            options={[
              { label: "Perlu persetujuan", value: "approval_required" },
              { label: "Undangan saja", value: "invitation_only" },
              { label: "Terbuka", value: "open" },
            ]}
            required
            value={admissionMode}
          />
        </ReferenceSurface>
        <ReferenceSurface as="section" aria-label="Jadwal rilis hasil" className="p-5 sm:p-6">
          <OptionSet
            label="Jadwal rilis hasil"
            labelTooltip="Kebijakan ini digunakan oleh sesi yang memilih Ikuti kebijakan Tryout."
            onValueChange={(value) => {
              const nextPolicy = value as DefaultPolicy;
              setDefaultReleasePolicy(nextPolicy);
              onCreatePolicyChange?.({ admissionMode, defaultReleasePolicy: nextPolicy });
            }}
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
        </ReferenceSurface>
      </div>
      <div className="mt-5 flex justify-end">
        <Button disabled={busy} onClick={() => void handleSave()} variant="reference">
          {busy ? "Menyimpan…" : "Selanjutnya"}
        </Button>
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingAdmissionMode(null);
        }}
        open={Boolean(pendingAdmissionMode)}
      >
        <AlertDialogContent data-testid="tryout-admission-confirmation" size="sm" variant="warning">
          <AlertDialogHeader>
            <AlertDialogMedia variant="warning"><AlertTriangle /></AlertDialogMedia>
            <AlertDialogTitle>Konfirmasi perubahan akses peserta</AlertDialogTitle>
            <AlertDialogDescription>
              Akses peserta akan berubah dari {modeLabels[admissionMode]} menjadi {pendingAdmissionMode ? modeLabels[pendingAdmissionMode] : "pilihan baru"}. Perubahan ini memengaruhi siapa yang dapat mendaftar dan akan dicatat dalam konteks audit “Pengaturan akses peserta Tryout”. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAdmissionMode} variant="brand">
              Konfirmasi perubahan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Root>
  );
}

export { KaptenTryoutPolicyPageModule };

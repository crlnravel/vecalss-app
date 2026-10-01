"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ToastOnMount } from "@/components/ui/toast-on-mount";
import { showToast, toast, type ToastVariant } from "@/components/ui/toast";
import { useActionToast } from "@/components/ui/use-action-toast";

const toastVariants: Array<{ value: ToastVariant; label: string }> = [
  { value: "default", label: "Default" },
  { value: "success", label: "Berhasil" },
  { value: "error", label: "Gagal" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Peringatan" },
];

type ActionToastDemoState = {
  fieldErrors?: Record<string, string | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
};

function ActionToastPreview() {
  const [state, setState] = useState<ActionToastDemoState>({ status: "idle" });
  const keepMessageInline = useActionToast(state);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-secondary-800">useActionToast · idle, sukses, error</p>
        <p className="mt-1 text-xs leading-5 text-secondary-600">
          Hook tidak mengirim toast saat idle. Kesalahan isian tetap ditampilkan dekat formulir.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => setState({ message: "Contoh perubahan berhasil disimpan.", status: "success" })}
          type="button"
          variant="default"
        >
          Simulasikan sukses
        </Button>
        <Button
          onClick={() => setState({ message: "Contoh perubahan belum tersimpan. Coba lagi.", status: "error" })}
          type="button"
          variant="destructive"
        >
          Simulasikan gagal
        </Button>
        <Button
          onClick={() => setState({ fieldErrors: { nama: "Nama perlu diisi." }, message: "Periksa isian nama.", status: "error" })}
          type="button"
          variant="outline"
        >
          Simulasikan error isian
        </Button>
      </div>
      {keepMessageInline ? (
        <p aria-live="polite" className="text-sm font-medium text-student-status-danger-fg" role="alert">
          {state.fieldErrors?.nama ?? state.message}
        </p>
      ) : (
        <p aria-live="polite" className="text-xs text-secondary-500">
          {state.status === "idle" ? "Status awal: idle." : "Hasil aksi dikirim ke Sonner."}
        </p>
      )}
    </div>
  );
}

export function NotificationsPreview() {
  const [mountKey, setMountKey] = useState(0);

  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-secondary-800">Sonner · showToast · semua tone</p>
          <p className="mt-1 text-sm leading-6 text-secondary-600">
            Toaster sudah terpasang sekali di layout aplikasi. Tombol berikut hanya menampilkan pesan simulasi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {toastVariants.map(({ value, label }) => (
            <Button
              key={value}
              onClick={() => showToast(`Contoh notifikasi ${label.toLowerCase()}.`, { variant: value })}
              type="button"
              variant={value === "error" ? "destructive" : "outline"}
            >
              showToast · {label}
            </Button>
          ))}
          <Button
            onClick={() => toast.success("Contoh toast.success dari Sonner.")}
            type="button"
            variant="outline"
          >
            toast.success
          </Button>
        </div>
      </div>

      <ActionToastPreview />

      <div className="space-y-3 border-t border-voyage-soft-border pt-5">
        <div>
          <p className="text-sm font-semibold text-secondary-800">ToastOnMount · aman saat halaman dibuka</p>
          <p className="mt-1 text-xs leading-5 text-secondary-600">
            Komponen baru dipasang setelah tombol dipilih, jadi galeri tidak menampilkan notifikasi sendiri ketika dibuka.
          </p>
        </div>
        <Button onClick={() => setMountKey((current) => current + 1)} type="button" variant="outline">
          Pasang contoh notifikasi
        </Button>
        {mountKey > 0 ? (
          <ToastOnMount
            key={mountKey}
            message="Contoh notifikasi saat komponen dipasang."
            variant="info"
          />
        ) : null}
      </div>
    </div>
  );
}

"use client";

import {
  ArrowRight,
  Buildings,
  CaretDown,
  Check,
  GraduationCap,
  MagnifyingGlass,
  SpinnerGap,
} from "@phosphor-icons/react";
import Image from "next/image";
import { unstable_rethrow } from "next/navigation";
import { useMemo, useState } from "react";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { registerForTryoutWithTargetAction } from "@/modules/tryout/participant-actions";

type UniversityOption = { id: string; name: string; shortName: string | null };
type MajorOption = { id: string; name: string; universityId: string };

function ParticipantTryoutEnrollmentPanel({
  initialMajorId,
  initialUniversityId,
  majors,
  tryoutId,
  tryoutTitle,
  universities,
}: {
  initialMajorId: string | null;
  initialUniversityId: string | null;
  majors: MajorOption[];
  tryoutId: string;
  tryoutTitle: string;
  universities: UniversityOption[];
}) {
  const [universityId, setUniversityId] = useState(initialUniversityId ?? "");
  const [majorId, setMajorId] = useState(initialMajorId ?? "");
  const [universityOpen, setUniversityOpen] = useState(false);
  const [majorOpen, setMajorOpen] = useState(false);
  const [universityQuery, setUniversityQuery] = useState("");
  const [majorQuery, setMajorQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const visibleMajors = useMemo(
    () => majors.filter((major) => major.universityId === universityId),
    [majors, universityId],
  );
  const matchingUniversities = useMemo(() => {
    const query = universityQuery.trim().toLocaleLowerCase("id-ID");
    if (!query) return universities;
    return universities.filter((item) =>
      `${item.name} ${item.shortName ?? ""}`
        .toLocaleLowerCase("id-ID")
        .includes(query),
    );
  }, [universityQuery, universities]);
  const matchingMajors = useMemo(() => {
    const query = majorQuery.trim().toLocaleLowerCase("id-ID");
    if (!query) return visibleMajors;
    return visibleMajors.filter((item) =>
      item.name.toLocaleLowerCase("id-ID").includes(query),
    );
  }, [majorQuery, visibleMajors]);
  const university = universities.find((item) => item.id === universityId);
  const major = majors.find(
    (item) => item.id === majorId && item.universityId === universityId,
  );

  const handleUniversityChange = (value: string) => {
    setUniversityId(value);
    if (!majors.some((item) => item.id === majorId && item.universityId === value)) {
      setMajorId("");
    }
    setMajorQuery("");
    setMessage(null);
    setUniversityOpen(false);
  };

  const handleMajorChange = (value: string) => {
    setMajorId(value);
    setMajorQuery("");
    setMessage(null);
    setMajorOpen(false);
  };

  const handleOpenConfirmation = () => {
    if (!university || !major) {
      setMessage("Pilih universitas dan jurusan target sebelum mendaftar.");
      return;
    }
    setMessage(null);
    setConfirmOpen(true);
  };

  const handleRegister = async () => {
    if (!university || !major) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await registerForTryoutWithTargetAction(tryoutId, {
        majorId: major.id,
        universityId: university.id,
      });
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      if (response.result.state === "unavailable") {
        setMessage(
          "Belum ada sesi tryout yang dapat menerima pendaftaran. Targetmu belum diubah; coba lagi setelah Kapten membuka jadwal baru.",
        );
        return;
      }
      setConfirmOpen(false);
      window.location.assign(
        response.result.assignmentId
          ? `/tryout/${tryoutId}/waiting`
          : `/tryout/${tryoutId}`,
      );
    } catch (registerError) {
      unstable_rethrow(registerError);
      setMessage(
        registerError instanceof Error
          ? registerError.message
          : "Pendaftaran tryout belum dapat diproses.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <section
        aria-labelledby="target-jurusan"
        className="rounded-xl bg-white p-5 shadow-[0_14px_34px_-28px_rgba(1,76,56,0.26)] sm:p-6"
      >
        <h2
          id="target-jurusan"
          className="text-center font-heading text-xl font-extrabold tracking-[-0.025em] text-secondary-900"
        >
          Target Jurusan
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
          <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-2xl bg-primary-100">
            <Image
              alt=""
              className="h-32 w-32 object-contain"
              height={256}
              src="/brand/mascot-vecalss.png"
              width={256}
            />
          </div>
          <div className="grid gap-3">
            <div className="grid gap-2 text-sm font-medium text-secondary-800">
              <span className="flex items-center gap-2">
                <Buildings className="text-primary-700" />
                Universitas target
              </span>
              <Popover
                onOpenChange={setUniversityOpen}
                open={universityOpen}
              >
                <PopoverTrigger
                  aria-haspopup="listbox"
                  render={
                    <Button
                      className="h-12 w-full justify-between rounded-xl px-4 text-left"
                      type="button"
                      variant="context"
                    />
                  }
                >
                  <span
                    className={
                      university
                        ? "truncate"
                        : "truncate text-secondary-500"
                    }
                  >
                    {university?.name ?? "Pilih universitas"}
                  </span>
                  <CaretDown className="text-secondary-500" />
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[min(28rem,calc(100vw-2rem))] gap-3 p-3"
                >
                  <div className="relative">
                    <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500" />
                    <Input
                      aria-label="Cari universitas target"
                      autoFocus
                      className="h-10 rounded-xl border-primary-100 bg-primary-50 pl-9"
                      onChange={(event) =>
                        setUniversityQuery(event.target.value)
                      }
                      placeholder="Cari universitas..."
                      value={universityQuery}
                    />
                  </div>
                  <div
                    aria-label="Pilihan universitas"
                    className="grid max-h-60 gap-1 overflow-y-auto"
                    role="listbox"
                  >
                    {matchingUniversities.length ? (
                      matchingUniversities.map((item) => (
                        <Button
                          aria-selected={item.id === universityId}
                          className="h-auto justify-start rounded-xl px-3 py-2.5 text-left"
                          key={item.id}
                          onClick={() => handleUniversityChange(item.id)}
                          role="option"
                          type="button"
                          variant={
                            item.id === universityId
                              ? "contextSelected"
                              : "ghost"
                          }
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {item.name}
                          </span>
                          {item.id === universityId ? (
                            <Check className="text-primary-700" />
                          ) : null}
                        </Button>
                      ))
                    ) : (
                      <p className="px-3 py-5 text-sm text-secondary-500">
                        Universitas tidak ditemukan.
                      </p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-2 text-sm font-medium text-secondary-800">
              <span className="flex items-center gap-2">
                <GraduationCap className="text-primary-700" />
                Jurusan target
              </span>
              <Popover onOpenChange={setMajorOpen} open={majorOpen}>
                <PopoverTrigger
                  aria-haspopup="listbox"
                  disabled={!universityId}
                  render={
                    <Button
                      className="h-12 w-full justify-between rounded-xl px-4 text-left"
                      type="button"
                      variant="context"
                    />
                  }
                >
                  <span
                    className={major ? "truncate" : "truncate text-secondary-500"}
                  >
                    {major?.name ??
                      (universityId
                        ? "Pilih jurusan"
                        : "Pilih universitas dulu")}
                  </span>
                  <CaretDown className="text-secondary-500" />
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[min(28rem,calc(100vw-2rem))] gap-3 p-3"
                >
                  <div className="relative">
                    <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500" />
                    <Input
                      aria-label="Cari jurusan target"
                      autoFocus
                      className="h-10 rounded-xl border-primary-100 bg-primary-50 pl-9"
                      onChange={(event) => setMajorQuery(event.target.value)}
                      placeholder="Cari jurusan..."
                      value={majorQuery}
                    />
                  </div>
                  <div
                    aria-label="Pilihan jurusan"
                    className="grid max-h-60 gap-1 overflow-y-auto"
                    role="listbox"
                  >
                    {matchingMajors.length ? (
                      matchingMajors.map((item) => (
                        <Button
                          aria-selected={item.id === majorId}
                          className="h-auto justify-start rounded-xl px-3 py-2.5 text-left"
                          key={item.id}
                          onClick={() => handleMajorChange(item.id)}
                          role="option"
                          type="button"
                          variant={
                            item.id === majorId
                              ? "contextSelected"
                              : "ghost"
                          }
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {item.name}
                          </span>
                          {item.id === majorId ? (
                            <Check className="text-primary-700" />
                          ) : null}
                        </Button>
                      ))
                    ) : (
                      <p className="px-3 py-5 text-sm text-secondary-500">
                        Jurusan tidak ditemukan.
                      </p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-sm leading-6 text-secondary-600">
              Target jurusan akan tersimpan di profilmu saat kamu menyelesaikan
              pendaftaran.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-2">
        <Button
          className="w-full"
          disabled={busy}
          onClick={handleOpenConfirmation}
          size="lg"
          type="button"
          variant="brand"
        >
          Daftar Sekarang
          <ArrowRight />
        </Button>
        {!university || !major ? (
          <p className="text-center text-sm text-secondary-500">
            Pilih universitas dan jurusan target untuk melanjutkan.
          </p>
        ) : null}
        {message && !confirmOpen ? (
          <p
            className="rounded-xl border border-student-status-danger-border bg-student-status-danger-bg p-3 text-sm text-student-status-danger-fg"
            role="alert"
          >
            {message}
          </p>
        ) : null}
      </div>

      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (!busy) setConfirmOpen(nextOpen);
        }}
        open={confirmOpen}
      >
        <AlertDialogContent pending={busy}>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi pendaftaran</AlertDialogTitle>
            <AlertDialogDescription>
              Periksa targetmu sebelum mendaftar ke {tryoutTitle}. Pendaftaran
              tidak langsung menjalankan timer; kamu tetap akan masuk ke ruang
              tunggu dan membaca aturan ujian.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="grid gap-0 divide-y divide-primary-100 rounded-2xl border border-primary-100 px-4">
            <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
              <dt className="text-sm text-secondary-500">Universitas target</dt>
              <dd className="font-semibold text-secondary-900">{university?.name}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
              <dt className="text-sm text-secondary-500">Jurusan target</dt>
              <dd className="font-semibold text-secondary-900">{major?.name}</dd>
            </div>
          </dl>

          {message ? (
            <p
              className="rounded-xl border border-student-status-danger-border bg-student-status-danger-bg p-3 text-sm text-student-status-danger-fg"
              role="alert"
            >
              {message}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={() => void handleRegister()}
              type="button"
              variant="brand"
            >
              {busy ? (
                <>
                  <SpinnerGap className="animate-spin" />
                  Mendaftarkan…
                </>
              ) : (
                <>
                  Konfirmasi dan daftar
                  <ArrowRight />
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { ParticipantTryoutEnrollmentPanel };
export type { MajorOption, UniversityOption };

"use client";

import {
  ArrowRight,
  Buildings,
  Check,
  ChevronDown,
  GraduationCap,
  LoaderCircle,
  Search,
} from "@/lib/icons";
import Image from "next/image";
import { unstable_rethrow } from "next/navigation";
import { useMemo, useState } from "react";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import { buildStudentTryoutHref, buildStudentTryoutSubrouteHref } from "@/lib/navigation/canonical-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { registerForTryoutWithTargetAction } from "@/modules/tryout/participant-actions";

type UniversityOption = { id: string; name: string; shortName: string | null };
type MajorOption = { id: string; name: string; universityId: string };

function UniversityPicker({
  matchingUniversities,
  onOpenChange,
  onQueryChange,
  onSelectUniversity,
  open,
  query,
  selectedUniversity,
  selectedUniversityId,
}: {
  matchingUniversities: UniversityOption[];
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelectUniversity: (id: string) => void;
  open: boolean;
  query: string;
  selectedUniversity?: UniversityOption;
  selectedUniversityId: string;
}) {
  return (
    <div className="grid gap-2 text-sm font-medium text-secondary-800">
      <span className="flex items-center gap-2">
        <Buildings className="text-primary-700" />
        Universitas target
      </span>
      <Popover onOpenChange={onOpenChange} open={open}>
        <PopoverTrigger
          aria-haspopup="listbox"
          render={
            <Button
              className="h-12 w-full justify-between  px-4 text-left"
              type="button"
              variant="outline"
            />
          }
        >
          <span className={selectedUniversity ? "truncate" : "truncate text-secondary-500"}>
            {selectedUniversity?.name ?? "Pilih universitas"}
          </span>
          <ChevronDown className="text-secondary-500" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(28rem,calc(100vw-2rem))] gap-3 p-3"
          initialFocus={false}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500" />
            <Input
              aria-label="Cari universitas target"
              className="pl-9"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Cari universitas…"
              value={query}
            />
          </div>
          <div aria-label="Pilihan universitas" className="grid max-h-60 gap-1 overflow-y-auto" role="listbox">
            {matchingUniversities.length ? (
              matchingUniversities.map((item) => (
                <Button
                  aria-selected={item.id === selectedUniversityId}
                  className="h-auto justify-start  px-3 py-2.5 text-left"
                  key={item.id}
                  onClick={() => onSelectUniversity(item.id)}
                  role="option"
                  type="button"
                  variant={item.id === selectedUniversityId ? "default" : "outline"}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.id === selectedUniversityId ? <Check className="text-primary-700" /> : null}
                </Button>
              ))
            ) : (
              <p className="px-3 py-5 text-sm text-secondary-500">Universitas tidak ditemukan.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MajorPicker({
  disabled,
  matchingMajors,
  onOpenChange,
  onQueryChange,
  onSelectMajor,
  open,
  query,
  selectedMajor,
  selectedMajorId,
  selectedUniversityId,
}: {
  disabled: boolean;
  matchingMajors: MajorOption[];
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelectMajor: (id: string) => void;
  open: boolean;
  query: string;
  selectedMajor?: MajorOption;
  selectedMajorId: string;
  selectedUniversityId: string;
}) {
  return (
    <div className="grid gap-2 text-sm font-medium text-secondary-800">
      <span className="flex items-center gap-2">
        <GraduationCap className="text-primary-700" />
        Jurusan target
      </span>
      <Popover onOpenChange={onOpenChange} open={open}>
        <PopoverTrigger
          aria-haspopup="listbox"
          disabled={disabled}
          render={
            <Button
              className="h-12 w-full justify-between  px-4 text-left"
              type="button"
              variant="outline"
            />
          }
        >
          <span className={selectedMajor ? "truncate" : "truncate text-secondary-500"}>
            {!selectedUniversityId ? "Pilih universitas terlebih dahulu" : selectedMajor?.name ?? "Pilih jurusan"}
          </span>
          <ChevronDown className="text-secondary-500" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(28rem,calc(100vw-2rem))] gap-3 p-3"
          initialFocus={false}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500" />
            <Input
              aria-label="Cari jurusan target"
              className="pl-9"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Cari jurusan…"
              value={query}
            />
          </div>
          <div aria-label="Pilihan jurusan" className="grid max-h-60 gap-1 overflow-y-auto" role="listbox">
            {matchingMajors.length ? (
              matchingMajors.map((item) => (
                <Button
                  aria-selected={item.id === selectedMajorId}
                  className="h-auto justify-start  px-3 py-2.5 text-left"
                  key={item.id}
                  onClick={() => onSelectMajor(item.id)}
                  role="option"
                  type="button"
                  variant={item.id === selectedMajorId ? "default" : "outline"}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.id === selectedMajorId ? <Check className="text-primary-700" /> : null}
                </Button>
              ))
            ) : (
              <p className="px-3 py-5 text-sm text-secondary-500">Jurusan tidak ditemukan.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function EnrollmentConfirmationDialog({
  busy,
  major,
  onConfirm,
  onOpenChange,
  open,
  university,
}: {
  busy: boolean;
  major?: MajorOption;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  university?: UniversityOption;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent pending={busy}>
        <AlertDialogHeader>
          <AlertDialogTitle>Konfirmasi pendaftaran</AlertDialogTitle>
        </AlertDialogHeader>

        <dl className="grid gap-4 rounded-card border border-primary-100 p-4">
          <div className="grid gap-1">
            <dt className="text-sm text-secondary-500">Universitas target</dt>
            <dd className="font-semibold text-secondary-900">{university?.name}</dd>
          </div>
          <div className="grid gap-1 border-t border-primary-100 pt-4">
            <dt className="text-sm text-secondary-500">Jurusan target</dt>
            <dd className="font-semibold text-secondary-900">{major?.name}</dd>
          </div>
        </dl>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
          <Button disabled={busy} onClick={onConfirm} type="button" variant="default">
            {busy ? (
              <>
                <LoaderCircle className="animate-spin" />
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
  );
}

function ParticipantTryoutEnrollmentPanel({
  initialMajorId,
  initialUniversityId,
  majors,
  returnToHref,
  sessionId,
  tryoutId,
  universities,
}: {
  initialMajorId: string | null;
  initialUniversityId: string | null;
  majors: MajorOption[];
  returnToHref?: string;
  sessionId?: string;
  tryoutId: string;
  universities: UniversityOption[];
}) {
  const profileMajor = initialMajorId
    ? majors.find((item) => item.id === initialMajorId)
    : undefined;
  const profileUniversityId = initialUniversityId ?? profileMajor?.universityId ?? "";
  const profileMajorId =
    profileMajor?.universityId === profileUniversityId ? profileMajor.id : "";
  const [universityId, setUniversityId] = useState(profileUniversityId);
  const [majorId, setMajorId] = useState(profileMajorId);
  const [universityOpen, setUniversityOpen] = useState(false);
  const [majorOpen, setMajorOpen] = useState(false);
  const [universityQuery, setUniversityQuery] = useState("");
  const [majorQuery, setMajorQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const visibleMajors = useMemo(
    () => majors.filter((m) => m.universityId === universityId),
    [majors, universityId],
  );
  const matchingUniversities = useMemo(() => {
    const query = universityQuery.trim().toLocaleLowerCase("id-ID");
    if (!query) return universities;
    return universities.filter((item) =>
      `${item.name} ${item.shortName ?? ""}`.toLocaleLowerCase("id-ID").includes(query),
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
      }, sessionId);
      if (!response.ok) {
        showToast(response.message, { variant: "error" });
        return;
      }
      if (response.result.state === "unavailable") {
        showToast(
          "Belum ada sesi tryout yang dapat menerima pendaftaran. Targetmu belum diubah; coba lagi setelah Kapten membuka jadwal baru.",
          { variant: "error" },
        );
        return;
      }
      setConfirmOpen(false);
      const destinationSessionId = response.result.deliverySessionId;
      window.location.assign(
        destinationSessionId
          ? buildStudentTryoutSubrouteHref(tryoutId, "waiting", { returnTo: returnToHref, session: destinationSessionId })
          : buildStudentTryoutHref(tryoutId, { returnTo: returnToHref, session: sessionId }),
      );
    } catch (registerError) {
      unstable_rethrow(registerError);
      showToast(
        "Pendaftaran Tryout belum berhasil. Periksa koneksi lalu coba lagi.",
        { variant: "error" },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <section
        aria-labelledby="target-jurusan"
        className="rounded-xl bg-white p-5 shadow-[0_14px_34px_-28px_color-mix(in_oklab,var(--voyage-deep)_26%,transparent)] sm:p-6"
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
              src="/brand/mascot-vecalss-2.png"
              width={256}
            />
          </div>
          <div className="grid gap-3">
            <UniversityPicker
              matchingUniversities={matchingUniversities}
              onOpenChange={setUniversityOpen}
              onQueryChange={setUniversityQuery}
              onSelectUniversity={handleUniversityChange}
              open={universityOpen}
              query={universityQuery}
              selectedUniversity={university}
              selectedUniversityId={universityId}
            />
            <MajorPicker
              disabled={!universityId}
              matchingMajors={matchingMajors}
              onOpenChange={setMajorOpen}
              onQueryChange={setMajorQuery}
              onSelectMajor={handleMajorChange}
              open={majorOpen}
              query={majorQuery}
              selectedMajor={major}
              selectedMajorId={majorId}
              selectedUniversityId={universityId}
            />
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
          variant="default"
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

      <EnrollmentConfirmationDialog
        busy={busy}
        major={major}
        onConfirm={() => void handleRegister()}
        onOpenChange={(nextOpen) => {
          if (!busy) setConfirmOpen(nextOpen);
        }}
        open={confirmOpen}
        university={university}
      />
    </div>
  );
}

export { ParticipantTryoutEnrollmentPanel };
export type { MajorOption, UniversityOption };

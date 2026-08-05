"use client";

import {
  ArrowRight,
  Buildings,
  CaretDown,
  Check,
  CheckCircle,
  GraduationCap,
  MagnifyingGlass,
  SpinnerGap,
  Target,
} from "@phosphor-icons/react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SessionContext } from "@/lib/auth/types";
import type { ParticipantTryout } from "@/lib/tryout/participant-repository";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { registerForTryoutWithTargetAction } from "@/modules/tryout/participant-actions";

type UniversityOption = { id: string; name: string; shortName: string | null };
type MajorOption = { id: string; name: string; universityId: string };

function ParticipantTryoutRegistrationModule({
  initialMajorId,
  initialUniversityId,
  majors,
  session,
  tryout,
  universities,
}: {
  initialMajorId: string | null;
  initialUniversityId: string | null;
  majors: MajorOption[];
  session: SessionContext;
  tryout: ParticipantTryout;
  universities: UniversityOption[];
}) {
  const [step, setStep] = useState<"target" | "confirmation">("target");
  const [universityId, setUniversityId] = useState(initialUniversityId ?? "");
  const [majorId, setMajorId] = useState(initialMajorId ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [universityOpen, setUniversityOpen] = useState(false);
  const [majorOpen, setMajorOpen] = useState(false);
  const [universityQuery, setUniversityQuery] = useState("");
  const [majorQuery, setMajorQuery] = useState("");

  const visibleMajors = useMemo(() => majors.filter((major) => major.universityId === universityId), [majors, universityId]);
  const matchingUniversities = useMemo(() => {
    const query = universityQuery.trim().toLocaleLowerCase("id-ID");
    if (!query) return universities;
    return universities.filter((item) => `${item.name} ${item.shortName ?? ""}`.toLocaleLowerCase("id-ID").includes(query));
  }, [universityQuery, universities]);
  const matchingMajors = useMemo(() => {
    const query = majorQuery.trim().toLocaleLowerCase("id-ID");
    if (!query) return visibleMajors;
    return visibleMajors.filter((item) => item.name.toLocaleLowerCase("id-ID").includes(query));
  }, [majorQuery, visibleMajors]);
  const university = universities.find((item) => item.id === universityId);
  const major = majors.find((item) => item.id === majorId && item.universityId === universityId);

  const handleUniversityChange = (value: string) => {
    setUniversityId(value);
    if (!majors.some((item) => item.id === majorId && item.universityId === value)) setMajorId("");
    setMajorQuery("");
    setUniversityOpen(false);
  };

  const handleMajorChange = (value: string) => {
    setMajorId(value);
    setMajorOpen(false);
  };

  const handleRegister = async () => {
    if (!university || !major) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await registerForTryoutWithTargetAction(tryout.id, {
        majorId: major.id,
        universityId: university.id,
      });
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      window.location.assign(response.result.state === "assigned" ? `/tryout/${tryout.id}/waiting` : `/tryout/${tryout.id}`);
    } catch (registerError) {
      unstable_rethrow(registerError);
      setMessage(registerError instanceof Error ? registerError.message : "Pendaftaran tryout belum dapat diproses.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Pendaftaran tryout" session={session} showSearch={false}>
      <Button
        aria-label="Kembali ke detail tryout"
        render={<Link href={`/tryout/${tryout.id}`} />}
        size="icon"
        title="Kembali ke detail tryout"
        variant="ghost"
      >
        <ChevronLeft />
      </Button>

      <div className="mx-auto grid w-full max-w-4xl gap-5">
        <header className="text-center">
          <p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Pendaftaran · {tryout.title}</p>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            {step === "target" ? "Pilih targetmu" : "Konfirmasi pendaftaran"}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-secondary-600 sm:text-base">
            {step === "target"
              ? "Cari kampus dan jurusan tujuanmu."
              : "Periksa targetmu sebelum mendaftar."}
          </p>
        </header>

        <ol aria-label="Tahap pendaftaran" className="mx-auto grid w-full max-w-md grid-cols-2 gap-2 text-xs font-semibold">
          <li className={`rounded-full px-4 py-2 text-center ${step === "target" ? "bg-primary-900 text-white" : "bg-primary-100 text-primary-900"}`}>1. Target</li>
          <li className={`rounded-full px-4 py-2 text-center ${step === "confirmation" ? "bg-primary-900 text-white" : "bg-white text-secondary-500"}`}>2. Konfirmasi</li>
        </ol>

        {message ? <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{message}</p> : null}

        {step === "target" ? (
          <section className="grid gap-6 rounded-[2rem] border border-primary-100 bg-white p-6 sm:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2 text-sm font-medium text-secondary-800">
                <span className="flex items-center gap-2"><Buildings className="text-primary-700" />Universitas target</span>
                <Popover onOpenChange={setUniversityOpen} open={universityOpen}>
                  <PopoverTrigger
                    aria-haspopup="listbox"
                    render={<Button className="h-12 w-full justify-between rounded-xl px-4 text-left" type="button" variant="context" />}
                  >
                    <span className={university ? "truncate" : "truncate text-secondary-500"}>{university?.name ?? "Cari universitas"}</span>
                    <CaretDown className="text-secondary-500" />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] gap-3 p-3">
                    <div className="relative">
                      <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500" />
                      <Input
                        aria-label="Cari universitas target"
                        autoFocus
                        className="h-10 rounded-xl border-primary-100 bg-primary-50 pl-9"
                        onChange={(event) => setUniversityQuery(event.target.value)}
                        placeholder="Cari universitas..."
                        value={universityQuery}
                      />
                    </div>
                    <div aria-label="Pilihan universitas" className="grid max-h-60 gap-1 overflow-y-auto" role="listbox">
                      {matchingUniversities.length ? matchingUniversities.map((item) => (
                        <Button
                          aria-selected={item.id === universityId}
                          className="h-auto justify-start rounded-xl px-3 py-2.5 text-left"
                          key={item.id}
                          onClick={() => handleUniversityChange(item.id)}
                          role="option"
                          type="button"
                          variant={item.id === universityId ? "contextSelected" : "ghost"}
                        >
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                          {item.id === universityId ? <Check className="text-primary-700" /> : null}
                        </Button>
                      )) : <p className="px-3 py-5 text-sm text-secondary-500">Universitas tidak ditemukan.</p>}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-2 text-sm font-medium text-secondary-800">
                <span className="flex items-center gap-2"><GraduationCap className="text-primary-700" />Jurusan target</span>
                <Popover onOpenChange={setMajorOpen} open={majorOpen}>
                  <PopoverTrigger
                    aria-haspopup="listbox"
                    disabled={!universityId}
                    render={<Button className="h-12 w-full justify-between rounded-xl px-4 text-left" type="button" variant="context" />}
                  >
                    <span className={major ? "truncate" : "truncate text-secondary-500"}>{major?.name ?? (universityId ? "Cari jurusan" : "Pilih universitas dulu")}</span>
                    <CaretDown className="text-secondary-500" />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] gap-3 p-3">
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
                    <div aria-label="Pilihan jurusan" className="grid max-h-60 gap-1 overflow-y-auto" role="listbox">
                      {matchingMajors.length ? matchingMajors.map((item) => (
                        <Button
                          aria-selected={item.id === majorId}
                          className="h-auto justify-start rounded-xl px-3 py-2.5 text-left"
                          key={item.id}
                          onClick={() => handleMajorChange(item.id)}
                          role="option"
                          type="button"
                          variant={item.id === majorId ? "contextSelected" : "ghost"}
                        >
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                          {item.id === majorId ? <Check className="text-primary-700" /> : null}
                        </Button>
                      )) : <p className="px-3 py-5 text-sm text-secondary-500">Jurusan tidak ditemukan.</p>}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-primary-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-secondary-500"><Target className="text-primary-700" />Target dapat diubah saat mendaftar.</p>
              <Button disabled={!university || !major} onClick={() => setStep("confirmation")} variant="brand">
                Lanjutkan <ArrowRight />
              </Button>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-primary-100 bg-white">
            <div className="border-b border-primary-100 bg-primary-50 p-6 sm:p-8">
              <CheckCircle className="text-4xl text-primary-700" />
              <h2 className="mt-4 font-heading text-2xl font-semibold tracking-[-0.025em]">Siap mendaftar</h2>
              <p className="mt-2 text-sm leading-6 text-secondary-600">Pendaftaran tidak langsung menjalankan timer. Kamu tetap akan masuk ke ruang tunggu dan membaca aturan ujian.</p>
            </div>
            <dl className="grid gap-0 divide-y divide-primary-100 p-6 sm:p-8">
              <div className="grid gap-1 py-4 first:pt-0 sm:grid-cols-[11rem_1fr]"><dt className="text-sm text-secondary-500">Tryout</dt><dd className="font-semibold">{tryout.title}</dd></div>
              <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr]"><dt className="text-sm text-secondary-500">Universitas target</dt><dd className="font-semibold">{university?.name}</dd></div>
              <div className="grid gap-1 py-4 last:pb-0 sm:grid-cols-[11rem_1fr]"><dt className="text-sm text-secondary-500">Jurusan target</dt><dd className="font-semibold">{major?.name}</dd></div>
            </dl>
            <div className="flex flex-col-reverse gap-3 border-t border-primary-100 p-6 sm:flex-row sm:justify-end sm:p-8">
              <Button disabled={busy} onClick={() => setStep("target")} variant="brandOutline">Ubah target</Button>
              <Button disabled={busy} onClick={() => void handleRegister()} variant="brand">
                {busy ? <><SpinnerGap className="animate-spin" />Mendaftarkan…</> : <>Konfirmasi dan daftar <ArrowRight /></>}
              </Button>
            </div>
          </section>
        )}
      </div>
    </CourseWorkspaceShell>
  );
}

export { ParticipantTryoutRegistrationModule };

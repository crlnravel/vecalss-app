"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { Check, CircleAlert, LoaderCircle, Search, SendHorizontal, UserPlus } from "@/lib/icons";
import type { InvitationPickerStudent } from "@/lib/tryout/invitation-picker";
import type { TryoutOperationsView, TryoutParticipantsView } from "@/lib/tryout/operations-view";
import {
  inviteTryoutParticipantAction,
  refreshTryoutParticipantsAction,
  searchTryoutInvitationStudentsAction,
} from "@/modules/mentor/tryout-actions";
import { admissionStatusLabels } from "@/modules/mentor/KaptenTryoutOperationsData";

type PickerSession = TryoutOperationsView["sessions"][number];

const searchInputId = "tryout-invitation-student-search";
const searchResultsId = "tryout-invitation-student-results";
const searchResultsStatusId = "tryout-invitation-student-results-status";
const reasonInputId = "tryout-invitation-audit-reason";
const sessionInputId = "tryout-invitation-session";

function sessionWindow(session: PickerSession) {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
  return `${formatter.format(new Date(session.availableFrom))} – ${formatter.format(new Date(session.availableUntil))}`;
}

function admissionLabel(status: string) {
  return admissionStatusLabels[status] ?? status;
}

function selectedSessionIsAvailable(session: PickerSession, now: number) {
  return session.status === "active"
    && Boolean(session.assessmentRelease)
    && new Date(session.availableUntil).getTime() > now;
}

function KaptenTryoutInvitationPicker({
  onRefresh,
  sessions,
  tryoutId,
}: {
  onRefresh: (view: TryoutParticipantsView) => void;
  sessions: PickerSession[];
  tryoutId: string;
}) {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<InvitationPickerStudent[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedStudent, setSelectedStudent] = useState<InvitationPickerStudent | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const searchRequestRef = useRef(0);
  const [currentTime] = useState(() => Date.now());

  const availableSessions = useMemo(() => {
    return sessions.filter((session) => selectedSessionIsAvailable(session, currentTime));
  }, [currentTime, sessions]);

  const effectiveSelectedSessionId = availableSessions.some((session) => session.id === selectedSessionId)
    ? selectedSessionId
    : availableSessions[0]?.id ?? "";

  useEffect(() => {
    const normalizedQuery = query.trim();
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;

    const timer = window.setTimeout(() => {
      if (normalizedQuery.length < 2) {
        setStudents([]);
        setSearchError(null);
        setSearchState("idle");
        setActiveIndex(-1);
        return;
      }

      setSearchState("loading");
      setSearchError(null);
      setStudents([]);
      setActiveIndex(-1);
      void searchTryoutInvitationStudentsAction(tryoutId, normalizedQuery).then((result) => {
        if (requestId !== searchRequestRef.current) return;
        if (!result.ok) {
          setStudents([]);
          setSearchError(result.message);
          setSearchState("error");
          return;
        }
        setStudents(result.result);
        setActiveIndex(result.result.length ? 0 : -1);
        setSearchState("ready");
      }).catch(() => {
        if (requestId !== searchRequestRef.current) return;
        setStudents([]);
        setSearchError("Pencarian peserta belum dapat dimuat. Coba lagi.");
        setSearchState("error");
      });
    }, normalizedQuery.length < 2 ? 0 : 280);

    return () => window.clearTimeout(timer);
  }, [query, tryoutId]);

  const chooseStudent = (student: InvitationPickerStudent) => {
    setSelectedStudent(student);
    setActiveIndex(-1);
    setFeedback(null);
  };

  const submitInvitation = async () => {
    if (!selectedStudent || !effectiveSelectedSessionId || !reason.trim()) return;

    setBusy(true);
    setFeedback(null);
    try {
      const result = await inviteTryoutParticipantAction(
        tryoutId,
        selectedStudent.id,
        reason,
        effectiveSelectedSessionId,
      );
      if (!result.ok) {
        setFeedback({ message: result.message, tone: "error" });
        return;
      }

      const refreshed = await refreshTryoutParticipantsAction(tryoutId);
      if (!refreshed.ok) {
        setFeedback({
          message: "Undangan berhasil diproses, tetapi daftar peserta belum diperbarui. Muat ulang halaman untuk melihat status terbaru.",
          tone: "error",
        });
        return;
      }

      onRefresh(refreshed.result);
      setSelectedStudent(null);
      setReason("");
      setFeedback({ message: "Undangan peserta berhasil diproses dan daftar peserta sudah diperbarui.", tone: "success" });
    } catch {
      setFeedback({ message: "Undangan belum dapat diproses. Coba lagi.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="tryout-invitation-picker-title"
      className="mt-5 grid min-w-0 gap-5 rounded-3xl border border-primary-200 bg-primary-50/55 p-4 sm:p-6"
    >
      <header className="flex min-w-0 items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-700 text-white">
          <UserPlus aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-secondary-900" id="tryout-invitation-picker-title">Undang peserta</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">
            Cari akun student berdasarkan nama tampilan, pilih sesi yang tersedia, lalu catat alasan audit sebelum mengirim undangan.
          </p>
        </div>
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.9fr)]">
        <div className="grid min-w-0 content-start gap-3">
          <Field>
            <FieldLabel htmlFor={searchInputId}>Cari akun student</FieldLabel>
            <div className="relative min-w-0">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-secondary-500" />
              <FieldInput
                aria-activedescendant={activeIndex >= 0 ? `${searchResultsId}-${students[activeIndex]?.id ?? ""}` : undefined}
                aria-autocomplete="list"
                aria-controls={searchResultsId}
                aria-describedby={`${searchInputId}-hint`}
                className="min-h-11 pl-10"
                id={searchInputId}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && students.length) {
                    event.preventDefault();
                    setActiveIndex((current) => Math.min(students.length - 1, current + 1));
                  } else if (event.key === "ArrowUp" && students.length) {
                    event.preventDefault();
                    setActiveIndex((current) => Math.max(0, current - 1));
                  } else if (event.key === "Enter" && activeIndex >= 0 && students[activeIndex]) {
                    event.preventDefault();
                    chooseStudent(students[activeIndex]);
                } else if (event.key === "Escape") {
                    searchRequestRef.current += 1;
                    setActiveIndex(-1);
                    setStudents([]);
                    setSearchError(null);
                    setSearchState("idle");
                  }
                }}
                placeholder="Ketik nama tampilan student"
                role="combobox"
                value={query}
              />
            </div>
            <p className="text-xs leading-5 text-secondary-500" id={`${searchInputId}-hint`}>Minimal 2 karakter. Email dan metadata akun tidak ditampilkan.</p>
          </Field>

          <div aria-live="polite" className="min-h-7 text-sm" id={searchResultsStatusId}>
            {searchState === "loading" ? (
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-primary-100 bg-white px-3 text-secondary-600" role="status">
                <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                Mencari peserta…
              </div>
            ) : searchState === "error" ? (
              <Alert className="border-[#f3d486] bg-[#fff7e5] text-[#6a4a00]" role="alert">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Pencarian gagal</AlertTitle>
                <AlertDescription>{searchError}</AlertDescription>
              </Alert>
            ) : searchState === "ready" && !students.length ? (
              <div className="rounded-xl border border-dashed border-primary-200 bg-white px-3 py-3 text-sm text-secondary-600">Belum ada akun student yang cocok.</div>
            ) : searchState === "idle" ? (
              <p className="px-1 text-sm text-secondary-500">Hasil pencarian akan muncul di sini.</p>
            ) : null}
          </div>

          {students.length ? (
            <ul aria-label="Hasil pencarian student" className="grid max-h-64 min-w-0 gap-2 overflow-y-auto" id={searchResultsId} role="listbox">
              {students.map((student, index) => {
                const currentAdmission = student.admission;
                const isActive = activeIndex === index;
                return (
                  <li key={student.id}>
                    <Button
                      aria-selected={isActive}
                      className={`min-h-12 w-full min-w-0 justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left ${isActive ? "border-primary-400 bg-white ring-2 ring-primary-700/20" : "border-primary-100 bg-white hover:border-primary-300"}`}
                      id={`${searchResultsId}-${student.id}`}
                      onClick={() => chooseStudent(student)}
                      role="option"
                      type="button"
                      variant="ghost"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-secondary-900">{student.displayName}</span>
                        <span className="mt-0.5 block truncate text-xs text-secondary-500">
                          {currentAdmission ? `${admissionLabel(currentAdmission.status)}${currentAdmission.assignment ? ` · ${currentAdmission.assignment.name}` : ""}` : "Belum pernah diundang"}
                        </span>
                      </span>
                      <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full ${isActive ? "bg-primary-700 text-white" : "bg-primary-50 text-primary-700"}`}>
                        {isActive ? <Check className="size-4" /> : <UserPlus className="size-4" />}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <Card className="min-w-0 border-primary-100 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="font-semibold">Detail undangan</CardTitle>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4">
            {selectedStudent ? (
              <div className="grid min-w-0 gap-2 rounded-2xl border border-primary-100 bg-primary-50/60 p-3" role="status">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-800">Student terpilih</p>
                    <p className="mt-1 break-words font-semibold text-secondary-900">{selectedStudent.displayName}</p>
                  </div>
                  <Badge className="shrink-0 rounded-full" size="ui" variant={selectedStudent.admission?.status === "active" ? "mint" : "accent"}>
                    {selectedStudent.admission ? admissionLabel(selectedStudent.admission.status) : "Baru"}
                  </Badge>
                </div>
                <p className="text-xs leading-5 text-secondary-600">Pilihan sesi dan alasan audit akan dikirim bersama student ID ini.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/35 px-3 py-4 text-sm leading-6 text-secondary-600">Pilih satu student dari hasil pencarian untuk melanjutkan.</div>
            )}

            <Field>
              <FieldLabel htmlFor={sessionInputId}>Sesi Tryout</FieldLabel>
              <select
                aria-describedby={`${sessionInputId}-hint`}
                className="min-h-11 w-full min-w-0 rounded-xl border border-secondary-900/15 bg-white px-3 py-2 text-sm text-secondary-900 outline-none transition focus-visible:border-primary-700 focus-visible:ring-2 focus-visible:ring-primary-700/25 disabled:cursor-not-allowed disabled:bg-secondary-50"
                disabled={busy || !availableSessions.length}
                id={sessionInputId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
                value={effectiveSelectedSessionId}
              >
                <option value="">Pilih sesi tersedia</option>
                {availableSessions.map((session) => (
                  <option key={session.id} value={session.id}>{session.name} · {sessionWindow(session)}</option>
                ))}
              </select>
              <p className="text-xs leading-5 text-secondary-500" id={`${sessionInputId}-hint`}>
                {availableSessions.length ? "Sesi aktif dengan rilis konten dan waktu yang belum berakhir." : "Belum ada sesi aktif yang siap menerima peserta."}
              </p>
            </Field>

            <Field>
              <FieldLabel htmlFor={reasonInputId}>Alasan audit <span aria-hidden="true" className="text-destructive">*</span><span className="sr-only"> (wajib)</span></FieldLabel>
              <FieldTextarea
                aria-describedby={`${reasonInputId}-hint`}
                className="min-h-28"
                disabled={busy}
                id={reasonInputId}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Contoh: Peserta lolos verifikasi pendaftaran gelombang 1."
                value={reason}
              />
              <p className="text-xs leading-5 text-secondary-500" id={`${reasonInputId}-hint`}>Catatan ini tersimpan di audit log dan wajib diisi.</p>
            </Field>

            {feedback ? (
              <Alert className={feedback.tone === "success" ? "border-primary-200 bg-primary-50 text-primary-950" : "border-[#f3d486] bg-[#fff7e5] text-[#6a4a00]"} role={feedback.tone === "error" ? "alert" : "status"}>
                {feedback.tone === "error" ? <CircleAlert aria-hidden="true" /> : <Check aria-hidden="true" />}
                <AlertTitle>{feedback.tone === "error" ? "Undangan belum selesai" : "Undangan berhasil"}</AlertTitle>
                <AlertDescription>{feedback.message}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              className="min-h-11 w-full"
              disabled={busy || !selectedStudent || !effectiveSelectedSessionId || !reason.trim()}
              onClick={() => void submitInvitation()}
              type="button"
              variant="brand"
            >
              {busy ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <SendHorizontal aria-hidden="true" />}
              {busy ? "Memproses undangan…" : "Kirim undangan"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export { KaptenTryoutInvitationPicker };

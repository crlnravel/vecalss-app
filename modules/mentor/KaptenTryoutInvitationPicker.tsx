"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { showToast } from "@/components/ui/toast";
import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Check, CircleAlert, LoaderCircle, Search, SendHorizontal, UserPlus } from "@/lib/icons";
import { selectMainTryoutSession } from "@/lib/tryout/main-session";
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

const sessionWindowFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function sessionWindow(session: PickerSession) {
  return `${sessionWindowFormatter.format(new Date(session.availableFrom))} – ${sessionWindowFormatter.format(new Date(session.availableUntil))}`;
}

function admissionLabel(status: string) {
  return admissionStatusLabels[status] ?? status;
}

function selectedSessionIsAvailable(session: PickerSession, now: number) {
  return session.status === "active"
    && Boolean(session.assessmentRelease)
    && new Date(session.availableUntil).getTime() > now;
}

type PickerState = {
  activeIndex: number;
  busy: boolean;
  query: string;
  reason: string;
  searchError: string | null;
  searchState: "idle" | "loading" | "ready" | "error";
  selectedSessionId: string;
  selectedStudent: InvitationPickerStudent | null;
  students: InvitationPickerStudent[];
};

type PickerAction =
  | { type: "setQuery"; query: string }
  | { type: "searchStart" }
  | { type: "searchReset" }
  | { type: "searchSuccess"; students: InvitationPickerStudent[] }
  | { type: "searchError"; message: string }
  | { type: "setActiveIndex"; index: number }
  | { type: "chooseStudent"; student: InvitationPickerStudent }
  | { type: "setSessionId"; sessionId: string }
  | { type: "setReason"; reason: string }
  | { type: "submitStart" };

function pickerReducer(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case "setQuery":
      return { ...state, query: action.query };
    case "searchStart":
      return { ...state, activeIndex: -1, searchError: null, searchState: "loading", students: [] };
    case "searchReset":
      return { ...state, activeIndex: -1, searchError: null, searchState: "idle", students: [] };
    case "searchSuccess":
      return {
        ...state,
        activeIndex: action.students.length ? 0 : -1,
        searchError: null,
        searchState: "ready",
        students: action.students,
      };
    case "searchError":
      return { ...state, activeIndex: -1, searchError: action.message, searchState: "error", students: [] };
    case "setActiveIndex":
      return { ...state, activeIndex: action.index };
    case "chooseStudent":
      return { ...state, activeIndex: -1, selectedStudent: action.student };
    case "setSessionId":
      return { ...state, selectedSessionId: action.sessionId };
    case "setReason":
      return { ...state, reason: action.reason };
    case "submitStart":
      return {
        ...state,
        activeIndex: -1,
        busy: true,
        searchError: null,
        searchState: "idle",
        students: [],
      };
    default:
      return state;
  }
}

function StudentSearchSection({
  activeIndex,
  busy,
  onChooseStudent,
  onQueryChange,
  onQueryKeyDown,
  query,
  searchError,
  searchState,
  students,
}: {
  activeIndex: number;
  busy: boolean;
  onChooseStudent: (student: InvitationPickerStudent) => void;
  onQueryChange: (query: string) => void;
  onQueryKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  query: string;
  searchError: string | null;
  searchState: "idle" | "loading" | "ready" | "error";
  students: InvitationPickerStudent[];
}) {
  return (
    <div className="grid min-w-0 content-start gap-3">
      <Field>
        <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={searchInputId}>Cari akun student</FieldLabel>
        <div className="relative min-w-0">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-secondary-500" />
          <FieldInput
            aria-activedescendant={activeIndex >= 0 ? `${searchResultsId}-${students[activeIndex]?.id ?? ""}` : undefined}
            aria-autocomplete="list"
            aria-controls={searchResultsId}
            aria-describedby={`${searchInputId}-hint`}
            aria-expanded={students.length > 0}
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-11 pl-10`}
            disabled={busy}
            id={searchInputId}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onQueryKeyDown}
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
          <Alert className="border-[var(--warning-200)] bg-[var(--warning-50)] text-[var(--voyage-warm-sun-ink)]" role="alert">
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
                  disabled={busy}
                  id={`${searchResultsId}-${student.id}`}
                  onClick={() => onChooseStudent(student)}
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
  );
}

function InvitationSelectedStudent({ selectedStudent }: { selectedStudent: InvitationPickerStudent | null }) {
  return selectedStudent ? (
    <div className="grid min-w-0 gap-2 rounded-2xl border border-primary-100 bg-primary-50/60 p-3" role="status">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-800">Student terpilih</p>
          <p className="mt-1 break-words font-semibold text-secondary-900">{selectedStudent.displayName}</p>
        </div>
        <MentorBadge className="shrink-0" size="sm" tone={selectedStudent.admission?.status === "active" ? "success" : "attention"}>
          {selectedStudent.admission ? admissionLabel(selectedStudent.admission.status) : "Baru"}
        </MentorBadge>
      </div>
      <p className="text-xs leading-5 text-secondary-600">Pilihan sesi dan alasan audit akan dikirim bersama student ID ini.</p>
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/35 px-3 py-4 text-sm leading-6 text-secondary-600">Pilih satu student dari hasil pencarian untuk melanjutkan.</div>
  );
}

function InvitationSubmitButton({ busy, disabled, onSubmit }: { busy: boolean; disabled: boolean; onSubmit: () => void }) {
  return (
    <Button className="min-h-11 w-full" disabled={busy || disabled} onClick={onSubmit} type="button" variant="reference">
      {busy ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <SendHorizontal aria-hidden="true" />}
      {busy ? "Memproses undangan…" : "Kirim undangan"}
    </Button>
  );
}

function InvitationDetailCard({
  availableSessions,
  busy,
  effectiveSelectedSessionId,
  onReasonChange,
  onSessionChange,
  onSubmit,
  reason,
  selectedStudent,
}: {
  availableSessions: PickerSession[];
  busy: boolean;
  effectiveSelectedSessionId: string;
  onReasonChange: (reason: string) => void;
  onSessionChange: (sessionId: string) => void;
  onSubmit: () => void;
  reason: string;
  selectedStudent: InvitationPickerStudent | null;
}) {
  return (
    <Card className="min-w-0 border-primary-100 bg-white shadow-none">
      <CardHeader>
        <CardTitle className="font-semibold">Detail undangan</CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <InvitationSelectedStudent selectedStudent={selectedStudent} />

        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={sessionInputId} required>Sesi Tryout</FieldLabel>
          <ReferenceSelect
            aria-describedby={`${sessionInputId}-hint`}
            aria-label="Sesi Tryout"
            className="w-full"
            disabled={busy || !availableSessions.length}
            id={sessionInputId}
            onValueChange={onSessionChange}
            options={availableSessions.map((session) => ({
              label: `${session.name} · ${sessionWindow(session)}`,
              value: session.id,
            }))}
            placeholder="Pilih sesi tersedia"
            value={effectiveSelectedSessionId}
          />
          <p className="text-xs leading-5 text-secondary-500" id={`${sessionInputId}-hint`}>
            {availableSessions.length ? "Sesi aktif dengan rilis konten dan waktu yang belum berakhir." : "Belum ada sesi aktif yang siap menerima peserta."}
          </p>
        </Field>

        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={reasonInputId} required>Alasan audit</FieldLabel>
          <FieldTextarea
            aria-describedby={`${reasonInputId}-hint`}
            aria-required="true"
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-28`}
            disabled={busy}
            id={reasonInputId}
            maxLength={500}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Contoh: Peserta lolos verifikasi pendaftaran gelombang 1."
            required
            value={reason}
          />
          <p className="text-xs leading-5 text-secondary-500" id={`${reasonInputId}-hint`}>Catatan ini tersimpan di audit log dan wajib diisi.</p>
        </Field>

        <InvitationSubmitButton disabled={!selectedStudent || !effectiveSelectedSessionId || !reason.trim()} busy={busy} onSubmit={onSubmit} />
      </CardContent>
    </Card>
  );
}

const initialPickerState: PickerState = {
  activeIndex: -1,
  busy: false,
  query: "",
  reason: "",
  searchError: null,
  searchState: "idle",
  selectedSessionId: "",
  selectedStudent: null,
  students: [],
};

function KaptenTryoutInvitationPicker({
  onRefresh,
  sessions,
  tryoutId,
}: {
  onRefresh: (view: TryoutParticipantsView) => void;
  sessions: PickerSession[];
  tryoutId: string;
}) {
  const [state, dispatch] = useReducer(pickerReducer, initialPickerState);
  const { activeIndex, busy, query, reason, searchError, searchState, selectedSessionId, selectedStudent, students } = state;
  const searchRequestRef = useRef(0);
  const [currentTime] = useState(() => Date.now());

  const availableSessions = useMemo(() => {
    const mainSession = selectMainTryoutSession(sessions);
    return mainSession && selectedSessionIsAvailable(mainSession, currentTime) ? [mainSession] : [];
  }, [currentTime, sessions]);

  const effectiveSelectedSessionId = availableSessions.some((session) => session.id === selectedSessionId)
    ? selectedSessionId
    : availableSessions[0]?.id ?? "";

  useEffect(() => {
    const normalizedQuery = query.trim();
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;

    if (busy) return;

    const timer = window.setTimeout(() => {
      if (normalizedQuery.length < 2) {
        dispatch({ type: "searchReset" });
        return;
      }

      dispatch({ type: "searchStart" });
      void searchTryoutInvitationStudentsAction(tryoutId, normalizedQuery).then((result) => {
        if (requestId !== searchRequestRef.current) return;
        if (!result.ok) {
          dispatch({ message: result.message, type: "searchError" });
          return;
        }
        dispatch({ students: result.result, type: "searchSuccess" });
      }).catch(() => {
        if (requestId !== searchRequestRef.current) return;
        dispatch({ message: "Pencarian peserta belum dapat dimuat. Coba lagi.", type: "searchError" });
      });
    }, normalizedQuery.length < 2 ? 0 : 280);

    return () => window.clearTimeout(timer);
  }, [busy, query, tryoutId]);

  const chooseStudent = (student: InvitationPickerStudent) => {
    if (busy) return;
    dispatch({ student, type: "chooseStudent" });
  };

  const handleQueryKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && students.length) {
      event.preventDefault();
      dispatch({ index: Math.min(students.length - 1, activeIndex + 1), type: "setActiveIndex" });
    } else if (event.key === "ArrowUp" && students.length) {
      event.preventDefault();
      dispatch({ index: Math.max(0, activeIndex - 1), type: "setActiveIndex" });
    } else if (event.key === "Enter" && activeIndex >= 0 && students[activeIndex]) {
      event.preventDefault();
      chooseStudent(students[activeIndex]);
    } else if (event.key === "Escape") {
      searchRequestRef.current += 1;
      dispatch({ type: "searchReset" });
    }
  };

  const submitInvitation = async () => {
    if (!selectedStudent || !effectiveSelectedSessionId || !reason.trim()) return;

    searchRequestRef.current += 1;
    dispatch({ type: "submitStart" });
    try {
      const result = await inviteTryoutParticipantAction(
        tryoutId,
        selectedStudent.id,
        reason,
        effectiveSelectedSessionId,
      );
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }

      const refreshed = await refreshTryoutParticipantsAction(tryoutId);
      if (!refreshed.ok) {
        showToast(
          "Undangan berhasil diproses, tetapi daftar peserta belum diperbarui. Muat ulang halaman untuk melihat status terbaru.",
          { variant: "warning" },
        );
        return;
      }

      onRefresh(refreshed.result);
      showToast(
        "Undangan peserta berhasil diproses dan daftar peserta sudah diperbarui.",
        { variant: "success" },
      );
    } catch {
      showToast("Undangan belum dapat diproses. Coba lagi.", {
        variant: "error",
      });
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
            Cari akun student berdasarkan nama tampilan, gunakan sesi utama yang sedang terbuka, lalu catat alasan audit sebelum mengirim undangan.
          </p>
        </div>
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.9fr)]">
        <StudentSearchSection
          activeIndex={activeIndex}
          busy={busy}
          onChooseStudent={chooseStudent}
          onQueryChange={(nextQuery) => dispatch({ query: nextQuery, type: "setQuery" })}
          onQueryKeyDown={handleQueryKeyDown}
          query={query}
          searchError={searchError}
          searchState={searchState}
          students={students}
        />
        <InvitationDetailCard
          availableSessions={availableSessions}
          busy={busy}
          effectiveSelectedSessionId={effectiveSelectedSessionId}
          onReasonChange={(nextReason) => dispatch({ reason: nextReason, type: "setReason" })}
          onSessionChange={(sessionId) => dispatch({ sessionId, type: "setSessionId" })}
          onSubmit={() => void submitInvitation()}
          reason={reason}
          selectedStudent={selectedStudent}
        />
      </div>
    </section>
  );
}

export { KaptenTryoutInvitationPicker };

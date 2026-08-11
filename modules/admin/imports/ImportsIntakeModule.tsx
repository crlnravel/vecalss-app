"use client";

import { useRef, useState } from "react";
import { ArrowDownToLine, FileUp, UsersRound } from "@/lib/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  classifyImportSessionRecovery,
  getImportLoginRecoveryHref,
  resetImportFileSelection,
} from "./import-ui-contract";
import {
  ADMIN_CARD_CLASS_NAME,
  ADMIN_INSET_CLASS_NAME,
  ADMIN_STATUS_CLASS_NAMES,
} from "../admin-ui-contract";

type ImportRole = "student" | "tutor";

const IMPORT_ROLES: ImportRole[] = ["student", "tutor"];

const templateForRole: Record<ImportRole, { fileName: string; label: string; version: string }> = {
  student: { fileName: "students.v1.csv", label: "Students", version: "students.v1" },
  tutor: { fileName: "kapten.v1.csv", label: "Kapten", version: "kapten.v1" },
};

const previewErrorMessages: Record<string, string> = {
  csv_empty_file: "The CSV needs a header and at least one data row.",
  csv_header_mismatch: "The column header does not match the selected template.",
  csv_invalid_utf8: "The CSV must be saved as UTF-8.",
  csv_malformed: "The CSV contains malformed quoted data.",
  csv_row_limit: "The CSV has more than 500 data rows.",
  invalid_origin: "This upload expired. Refresh the page and try again.",
  invalid_role: "Choose Students or Kapten before uploading.",
  invalid_template: "Choose the matching template for this role.",
  multipart_invalid: "The upload could not be read. Choose one CSV file and try again.",
  preview_unavailable: "The preview could not be created. No accounts were changed; try again.",
  request_too_large: "The CSV is larger than the 2 MiB upload limit.",
};

function readPreviewError(code: unknown) {
  return typeof code === "string" && previewErrorMessages[code]
    ? previewErrorMessages[code]
    : "The preview could not be created. No accounts were changed; try again.";
}

function responseErrorCode(payload: unknown) {
  return payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: unknown }).error
    : null;
}

function redirectedPath(response: Response) {
  if (!response.redirected || typeof window === "undefined") return null;
  try {
    return new URL(response.url, window.location.origin).pathname;
  } catch {
    return null;
  }
}

function ImportsIntakeModule() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const roleButtonRefs = useRef<Record<ImportRole, HTMLButtonElement | null>>({
    student: null,
    tutor: null,
  });
  const [role, setRole] = useState<ImportRole>("student");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "info" }>({
    message: "",
    tone: "info",
  });
  const [sessionIssue, setSessionIssue] = useState<"expired" | "forbidden" | null>(null);
  const template = templateForRole[role];

  function handleRoleChange(nextRole: ImportRole) {
    if (nextRole === role) return;
    setRole(nextRole);
    resetImportFileSelection(fileInputRef.current);
    setFeedback({ message: `Role changed to ${templateForRole[nextRole].label}. Choose a fresh CSV for this template.`, tone: "info" });
  }

  function handleRoleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentRole: ImportRole) {
    const currentIndex = IMPORT_ROLES.indexOf(currentRole);
    let nextRole: ImportRole | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextRole = IMPORT_ROLES[(currentIndex + 1) % IMPORT_ROLES.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextRole = IMPORT_ROLES[(currentIndex - 1 + IMPORT_ROLES.length) % IMPORT_ROLES.length];
    } else if (event.key === "Home") {
      nextRole = IMPORT_ROLES[0];
    } else if (event.key === "End") {
      nextRole = IMPORT_ROLES[IMPORT_ROLES.length - 1];
    }

    if (!nextRole) return;
    event.preventDefault();
    handleRoleChange(nextRole);
    roleButtonRefs.current[nextRole]?.focus();
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFeedback({ message: "Choose a CSV file before creating a preview.", tone: "error" });
      return;
    }

    setBusy(true);
    setFeedback({ message: "Uploading the CSV and checking its rows…", tone: "info" });
    try {
      const body = new FormData();
      body.append("template", template.version);
      body.append("role", role);
      body.append("file", file, file.name);
      const response = await fetch("/api/admin/imports/preview", {
        body,
        cache: "no-store",
        headers: { Accept: "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json().catch(() => null);
      const recovery = classifyImportSessionRecovery({
        errorCode: typeof responseErrorCode(payload) === "string" ? responseErrorCode(payload) as string : null,
        redirectPath: redirectedPath(response),
        status: response.status,
      });
      if (recovery) {
        setSessionIssue(recovery);
        setFeedback({ message: recovery === "expired" ? "Your admin session expired. Sign in again to continue this import." : "Your account no longer has permission to create imports.", tone: "error" });
        return;
      }
      setSessionIssue(null);
      if (!response.ok) {
        const code = responseErrorCode(payload);
        setFeedback({ message: readPreviewError(code), tone: "error" });
        return;
      }

      const draft = payload && typeof payload === "object" && "draft" in payload
        ? (payload as { draft?: { importId?: unknown } }).draft
        : null;
      if (!draft || typeof draft.importId !== "string") {
        setFeedback({ message: "The server returned an incomplete preview. Try again.", tone: "error" });
        return;
      }

      if (fileInputRef.current) {
        resetImportFileSelection(fileInputRef.current);
      }
      router.push(`/admin/imports/${encodeURIComponent(draft.importId)}`);
    } catch {
      setSessionIssue(null);
      setFeedback({ message: "The upload could not reach the server. No accounts were changed.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="start-import-heading" className={`${ADMIN_CARD_CLASS_NAME} p-5 sm:p-6`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="start-import-heading">Start a roster import</h2>
          <p className="mt-1 max-w-[65ch] text-sm leading-6 text-secondary-600">Pick a role, download its columns, then upload a CSV. The preview is saved before account changes happen.</p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-secondary-600"><UsersRound aria-hidden="true" size={15} /> One role per file</span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <p className="text-sm font-semibold text-secondary-900">Choose a role</p>
          <div aria-label="Import role" className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup">
            {(Object.entries(templateForRole) as Array<[ImportRole, (typeof templateForRole)[ImportRole]]>).map(([candidate, definition]) => {
              const selected = candidate === role;
              return (
                <button
                  aria-checked={selected}
                  className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 ${selected ? "border-primary-300 bg-primary-50 text-primary-800 shadow-[0_16px_30px_-28px_rgba(1,76,56,0.8)]" : "border-primary-100 bg-white text-secondary-600 hover:border-primary-200 hover:bg-secondary-50"}`}
                  key={candidate}
                  disabled={busy}
                  onClick={() => handleRoleChange(candidate)}
                  onKeyDown={(event) => handleRoleKeyDown(event, candidate)}
                  ref={(node) => {
                    roleButtonRefs.current[candidate] = node;
                  }}
                  role="radio"
                  tabIndex={selected ? 0 : -1}
                  type="button"
                >
                  <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-xl text-sm font-semibold ${selected ? "bg-primary-700 text-white" : "bg-primary-50 text-primary-800"}`}>{candidate === "student" ? "S" : "K"}</span>
                  <span>
                    <span className="block text-sm font-semibold">{definition.label}</span>
                    <span className="mt-0.5 block text-xs text-current/70">{definition.version}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className={`${ADMIN_INSET_CLASS_NAME} mt-4 px-4 py-3 text-sm text-secondary-600`}>
            <p className="font-semibold text-secondary-900">Template columns</p>
            <p className="mt-1 leading-6">{role === "student" ? "email, full_name, target_exam" : "email, full_name, phone, headline, bio"}</p>
          </div>
          <a
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary-200 px-4 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
            download={template.fileName}
            href={`/api/admin/imports/templates/${template.version}`}
          >
            <ArrowDownToLine aria-hidden="true" size={16} />
            Download {template.label} template
          </a>
        </div>

        <form className="rounded-3xl border border-dashed border-primary-200 bg-primary-50/70 p-4 sm:p-5" onSubmit={handleUpload}>
          <label className="block text-sm font-semibold text-secondary-900" htmlFor="roster-upload">Upload {template.label} CSV</label>
          <p className="mt-1 text-xs leading-5 text-secondary-600">CSV only, up to 2 MiB and 500 data rows. A preview will explain each row before confirmation.</p>
          <input
            accept=".csv,text/csv"
            className="mt-4 block min-h-11 w-full cursor-pointer rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-secondary-900 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
            id="roster-upload"
            key={role}
            name="file"
            ref={fileInputRef}
            type="file"
          />
          <button className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy} type="submit">
            <FileUp aria-hidden="true" size={17} />
            {busy ? "Creating preview…" : "Create preview"}
          </button>
          <p aria-live="polite" className={`mt-3 min-h-5 text-xs leading-5 ${feedback.tone === "error" ? "text-student-status-danger-fg" : "text-secondary-600"}`} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.message}</p>
          {sessionIssue ? (
            <div className={`mt-3 flex flex-col gap-2 rounded-3xl border px-4 py-3 text-xs leading-5 ${ADMIN_STATUS_CLASS_NAMES.danger}`} role="alert">
              <p className="font-semibold">{sessionIssue === "expired" ? "Admin session expired" : "Admin permission required"}</p>
              <p>{sessionIssue === "expired" ? "Sign in again to return to the imports workspace." : "Use an active admin account or return to the admin home."}</p>
              <div className="flex flex-wrap gap-2">
                <Link className="inline-flex min-h-11 items-center rounded-xl border border-student-status-danger-border px-3 font-semibold text-student-status-danger-fg hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-student-status-danger-border" href={sessionIssue === "expired" ? getImportLoginRecoveryHref("/admin/imports") : "/admin"}>
                  {sessionIssue === "expired" ? "Sign in again" : "Return to Admin home"}
                </Link>
                <button className="inline-flex min-h-11 items-center rounded-xl px-3 font-semibold text-student-status-danger-fg hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-student-status-danger-border" onClick={() => window.location.reload()} type="button">Refresh page</button>
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}

export { ImportsIntakeModule, readPreviewError, templateForRole };

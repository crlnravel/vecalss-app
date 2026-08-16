"use client";

import { useRef, useState } from "react";
import { ArrowDownToLine, ChevronDown, CircleHelp, FileUp, Upload } from "@/lib/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  classifyImportSessionRecovery,
  getImportLoginRecoveryHref,
  resetImportFileSelection,
} from "./import-ui-contract";
import {
  ADMIN_CARD_CLASS_NAME,
  ADMIN_STATUS_CLASS_NAMES,
} from "../admin-ui-contract";

type ImportRole = "student" | "tutor";

type ImportsIntakeModuleProps = {
  embedded?: boolean;
  initialRole?: ImportRole;
  onBusyChange?: (busy: boolean) => void;
  showRoleSelect?: boolean;
};

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

function ImportsIntakeModule({
  embedded = false,
  initialRole = "student",
  onBusyChange,
  showRoleSelect = true,
}: ImportsIntakeModuleProps = {}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<ImportRole>(initialRole);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "info" }>({
    message: "",
    tone: "info",
  });
  const [sessionIssue, setSessionIssue] = useState<"expired" | "forbidden" | null>(null);
  const template = templateForRole[role];

  function resetFile() {
    setFile(null);
    setIsDragging(false);
    resetImportFileSelection(fileInputRef.current);
  }

  function handleRoleChange(nextRole: ImportRole) {
    if (nextRole === role) return;
    setRole(nextRole);
    resetFile();
    setFeedback({ message: `Role changed to ${templateForRole[nextRole].label}. Choose a fresh CSV for this template.`, tone: "info" });
  }

  function handleFileSelection(nextFile: File | null) {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      resetFile();
      setFeedback({ message: "Choose a CSV file before uploading.", tone: "error" });
      return;
    }
    setFile(nextFile);
    setFeedback({ message: "", tone: "info" });
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    handleFileSelection(event.target.files?.[0] ?? null);
  }

  function handleFileDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (busy) return;
    handleFileSelection(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setFeedback({ message: "Choose a CSV file before uploading.", tone: "error" });
      return;
    }

    setBusy(true);
    onBusyChange?.(true);
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

      resetFile();
      router.push(`/admin/imports/${encodeURIComponent(draft.importId)}`);
    } catch {
      setSessionIssue(null);
      setFeedback({ message: "The upload could not reach the server. No accounts were changed.", tone: "error" });
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section aria-labelledby={embedded ? undefined : "import-siswa-heading"} className={embedded ? "" : `${ADMIN_CARD_CLASS_NAME} overflow-hidden`}>
      {!embedded ? (
        <div className="border-b border-primary-100 px-5 py-6 sm:px-8 sm:py-7">
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="import-siswa-heading">Import Siswa</h2>
        </div>
      ) : null}

      <form className={embedded ? "" : "px-5 py-6 sm:px-8 sm:py-8"} onSubmit={handleUpload}>
        <div className={showRoleSelect ? "grid gap-8 lg:grid-cols-2 lg:gap-x-16" : "grid gap-5"}>
          {showRoleSelect ? (
            <div className="lg:pr-8">
            <div className="flex items-center gap-1.5">
              <label className="block text-sm font-semibold text-secondary-900" htmlFor="import-role">1. Choose a role</label>
              <Tooltip>
                <TooltipTrigger render={<button aria-label="Role import guidance" className="inline-flex size-6 items-center justify-center rounded-full text-secondary-500 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300" type="button" />}>
                  <CircleHelp aria-hidden="true" size={15} />
                </TooltipTrigger>
                <TooltipContent>Each file can contain one role only.</TooltipContent>
              </Tooltip>
            </div>
            <div className="relative mt-3">
              <select
                className="min-h-12 w-full appearance-none rounded-xl border border-primary-200 bg-white px-4 pr-11 text-sm font-semibold text-secondary-900 transition-colors hover:border-primary-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                disabled={busy}
                id="import-role"
                onChange={(event) => handleRoleChange(event.target.value as ImportRole)}
                value={role}
              >
                <option value="student">Students</option>
                <option value="tutor">Kapten</option>
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-primary-700" size={18} />
            </div>
            </div>
          ) : null}

          <div>
            <p className="text-sm font-semibold text-secondary-900">{showRoleSelect ? "2." : "1."} Download the CSV template</p>
            <a
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary-200 px-3.5 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
              download={template.fileName}
              href={`/api/admin/imports/templates/${template.version}`}
            >
              <ArrowDownToLine aria-hidden="true" size={16} />
              Download template
            </a>
          </div>

          <div className={showRoleSelect ? "pt-4 lg:col-span-2" : "pt-2"}>
            <p className="text-sm font-semibold text-secondary-900">{showRoleSelect ? "3." : "2."} Upload the file</p>
            <p className="mt-2 text-xs leading-5 text-secondary-600">CSV only, up to 2 MiB and 500 data rows.</p>
            <label
              className={`mt-4 flex min-h-36 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-300 ${isDragging ? "border-primary-400 bg-primary-100" : "border-primary-200 bg-primary-50/50 hover:border-primary-300 hover:bg-primary-50"} ${busy ? "cursor-not-allowed opacity-70" : ""}`}
              htmlFor="roster-upload"
              onDragEnter={(event) => {
                event.preventDefault();
                if (!busy) setIsDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!busy) setIsDragging(true);
              }}
              onDrop={handleFileDrop}
            >
              <input
                accept=".csv,text/csv"
                aria-describedby="roster-upload-help"
                className="sr-only"
                disabled={busy}
                id="roster-upload"
                key={role}
                name="file"
                onChange={handleFileInputChange}
                ref={fileInputRef}
                type="file"
              />
              <Upload aria-hidden="true" className="text-primary-700" size={26} />
              <span className="mt-3 text-sm font-semibold text-secondary-900">{file ? file.name : "Drop a CSV file here or browse"}</span>
              <span className="mt-1 text-xs leading-5 text-secondary-600">{file ? "Ready to upload" : "CSV only · up to 2 MiB · 500 data rows"}</span>
            </label>
            <p className="sr-only" id="roster-upload-help">Drop a CSV file here or browse for one. A preview will explain each row before confirmation.</p>
            <button className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy || !file} type="submit">
              <FileUp aria-hidden="true" size={17} />
              {busy ? "Uploading…" : "Upload"}
            </button>
            <p aria-live="polite" className={`mt-3 min-h-5 text-xs leading-5 ${feedback.tone === "error" ? "text-student-status-danger-fg" : "text-secondary-600"}`} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.message}</p>
          </div>
        </div>

        {sessionIssue ? (
          <div className={`mt-6 flex flex-col gap-3 border-t border-primary-100 pt-5 text-xs leading-5 ${ADMIN_STATUS_CLASS_NAMES.danger}`} role="alert">
            <div>
              <p className="font-semibold">{sessionIssue === "expired" ? "Admin session expired" : "Admin permission required"}</p>
              <p className="mt-1">{sessionIssue === "expired" ? "Sign in again to return to the imports workspace." : "Use an active admin account or return to the admin home."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="inline-flex min-h-11 items-center rounded-xl border border-student-status-danger-border px-3 font-semibold text-student-status-danger-fg hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-student-status-danger-border" href={sessionIssue === "expired" ? getImportLoginRecoveryHref("/admin/imports") : "/admin"}>
                {sessionIssue === "expired" ? "Sign in again" : "Return to Admin home"}
              </Link>
              <button className="inline-flex min-h-11 items-center rounded-xl px-3 font-semibold text-student-status-danger-fg hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-student-status-danger-border" onClick={() => window.location.reload()} type="button">Refresh page</button>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}

export { ImportsIntakeModule };

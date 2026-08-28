"use client";

import { useRef, useState } from "react";
import { ArrowDownToLine, ChevronDown, CircleHelp, FileUp, Upload } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  classifyImportSessionRecovery,
  getImportLoginRecoveryHref,
  resetImportFileSelection,
} from "./import-ui-contract";
import {
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
      const initialRecovery = classifyImportSessionRecovery({
        errorCode: null,
        redirectPath: redirectedPath(response),
        status: response.status,
      });
      if (initialRecovery) {
        setSessionIssue(initialRecovery);
        setFeedback({ message: initialRecovery === "expired" ? "Your admin session expired. Sign in again to continue this import." : "Your account no longer has permission to create imports.", tone: "error" });
        return;
      }
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const errorCode = responseErrorCode(payload);
        const recovery = classifyImportSessionRecovery({
          errorCode: typeof errorCode === "string" ? errorCode : null,
          redirectPath: redirectedPath(response),
          status: response.status,
        });
        if (recovery) {
          setSessionIssue(recovery);
          setFeedback({ message: recovery === "expired" ? "Your admin session expired. Sign in again to continue this import." : "Your account no longer has permission to create imports.", tone: "error" });
          return;
        }
        const code = responseErrorCode(payload);
        setFeedback({ message: readPreviewError(code), tone: "error" });
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      setSessionIssue(null);

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
    <ReferenceSurface
      as="section"
      aria-labelledby={embedded ? undefined : "import-siswa-heading"}
      className={embedded ? "space-y-5 border-0 bg-transparent p-0 shadow-none" : "overflow-hidden p-0"}
    >
      {!embedded ? (
        <div className="border-b border-primary-100/80 px-5 py-6 sm:px-7 sm:py-7">
          <h2 className="font-heading text-2xl font-semibold tracking-[-0.03em] text-secondary-900" id="import-siswa-heading">Import Siswa</h2>
          <p className="mt-2 max-w-[60ch] text-sm leading-6 text-secondary-500">Upload a CSV, review each row, then confirm the import when it is ready.</p>
        </div>
      ) : null}

      <form className={embedded ? "grid gap-5" : "grid gap-5 p-5 sm:p-7"} onSubmit={handleUpload}>
        <div className={showRoleSelect ? "grid gap-5 lg:grid-cols-2 lg:gap-6" : "grid gap-5"}>
          {showRoleSelect ? (
            <ReferenceSurface as="div" className="min-w-0 p-4 sm:p-5" variant="inset">
              <div className="flex items-center gap-1.5">
                <label className="block text-sm font-semibold text-secondary-900" htmlFor="import-role">1. Choose a role</label>
                <Tooltip>
                  <TooltipTrigger render={<Button aria-label="Role import guidance" size="icon-xs" type="button" variant="ghost" />}>
                    <CircleHelp aria-hidden="true" size={15} />
                  </TooltipTrigger>
                  <TooltipContent>Each file can contain one role only.</TooltipContent>
                </Tooltip>
              </div>
              <div className="relative mt-3">
                <select
                  className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "appearance-none pr-11 font-medium")}
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
            </ReferenceSurface>
          ) : null}

          <ReferenceSurface as="div" className="min-w-0 p-4 sm:p-5" variant="inset">
            <p className="text-sm font-semibold text-secondary-900">{showRoleSelect ? "2. Get the CSV template" : "1. Download the CSV template"}</p>
            <p className="mt-1 text-xs leading-5 text-secondary-500">Use the matching columns for {template.label}.</p>
            <Button
              className="mt-4"
              nativeButton={false}
              render={<a aria-label="Download template" download={template.fileName} href={`/api/admin/imports/templates/${template.version}`} />}
              size="default"
              variant="reference"
            >
              <ArrowDownToLine aria-hidden="true" size={16} />
              Download template
            </Button>
          </ReferenceSurface>

          <ReferenceSurface as="div" className={showRoleSelect ? "min-w-0 p-4 lg:col-span-2 sm:p-5" : "min-w-0 p-4 sm:p-5"} variant="inset">
            <p className="text-sm font-semibold text-secondary-900">{showRoleSelect ? "3. Upload the file" : "2. Upload the file"}</p>
            <p className="mt-2 text-xs leading-5 text-secondary-500">CSV only, up to 2 MiB and 500 data rows.</p>
            <label
              className={cn(
                "mt-4 flex min-h-36 w-full cursor-pointer rounded-3xl border border-dashed px-6 py-8 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-300",
                "flex-col items-center justify-center",
                isDragging ? "border-primary-400 bg-primary-100" : "border-primary-200 bg-primary-50/50 hover:border-primary-300 hover:bg-primary-50",
                busy ? "cursor-not-allowed opacity-70" : "",
              )}
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
              <span className="mt-1 text-xs leading-5 text-secondary-500">{file ? "Ready to upload" : "CSV only · up to 2 MiB · 500 data rows"}</span>
            </label>
            <p className="sr-only" id="roster-upload-help">Drop a CSV file here or browse for one. A preview will explain each row before confirmation.</p>
            <Button className="mt-4 w-full" disabled={busy || !file} size="lg" type="submit" variant="brand">
              <FileUp aria-hidden="true" size={17} />
              {busy ? "Uploading…" : "Upload"}
            </Button>
            <p aria-live="polite" className={`mt-3 min-h-5 text-xs leading-5 ${feedback.tone === "error" ? "text-student-status-danger-fg" : "text-secondary-600"}`} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.message}</p>
          </ReferenceSurface>
        </div>

        {sessionIssue ? (
          <ReferenceSurface as="div" className={`flex flex-col gap-3 p-4 text-xs leading-5 ${ADMIN_STATUS_CLASS_NAMES.danger}`} role="alert" variant="inset">
            <div>
              <p className="font-semibold">{sessionIssue === "expired" ? "Admin session expired" : "Admin permission required"}</p>
              <p className="mt-1">{sessionIssue === "expired" ? "Sign in again to return to the imports workspace." : "Use an active admin account or return to the admin home."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                nativeButton={false}
                render={<Link href={sessionIssue === "expired" ? getImportLoginRecoveryHref("/admin/enrollment") : "/admin"} />}
                size="default"
                variant="dangerOutline"
              >
                {sessionIssue === "expired" ? "Sign in again" : "Return to Admin home"}
              </Button>
              <Button onClick={() => window.location.reload()} size="default" variant="dangerOutline">Refresh page</Button>
            </div>
          </ReferenceSurface>
        ) : null}
      </form>
    </ReferenceSurface>
  );
}

export { ImportsIntakeModule };

"use client";

import { useRef, useState } from "react";
import { ArrowDownToLine, CircleHelp, FileUp, Upload } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
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
  csv_empty_file: "CSV harus memiliki header dan setidaknya satu baris data.",
  csv_header_mismatch: "Header kolom tidak sesuai dengan template yang dipilih.",
  csv_invalid_utf8: "CSV harus disimpan dalam UTF-8.",
  csv_malformed: "CSV berisi data kutipan yang tidak valid.",
  csv_row_limit: "CSV berisi lebih dari 500 baris data.",
  invalid_origin: "Upload ini sudah kedaluwarsa. Segarkan halaman lalu coba lagi.",
  invalid_role: "Pilih Siswa atau Kapten sebelum mengunggah.",
  invalid_template: "Pilih template yang sesuai untuk peran ini.",
  multipart_invalid: "Upload tidak dapat dibaca. Pilih satu file CSV lalu coba lagi.",
  preview_unavailable: "Preview tidak dapat dibuat. Tidak ada akun yang berubah; coba lagi.",
  request_too_large: "CSV lebih besar dari batas upload 2 MiB.",
};

function readPreviewError(code: unknown) {
  return typeof code === "string" && previewErrorMessages[code]
    ? previewErrorMessages[code]
     : "Preview tidak dapat dibuat. Tidak ada akun yang berubah; coba lagi.";
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
     setFeedback({ message: `Peran diubah menjadi ${templateForRole[nextRole].label}. Pilih CSV baru untuk template ini.`, tone: "info" });
  }

  function handleFileSelection(nextFile: File | null) {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      resetFile();
       setFeedback({ message: "Pilih file CSV sebelum mengunggah.", tone: "error" });
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
       setFeedback({ message: "Pilih file CSV sebelum mengunggah.", tone: "error" });
      return;
    }

    setBusy(true);
    onBusyChange?.(true);
     setFeedback({ message: "Mengunggah CSV dan memeriksa barisnya…", tone: "info" });
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
         setFeedback({ message: initialRecovery === "expired" ? "Sesi admin Anda kedaluwarsa. Masuk lagi untuk melanjutkan import ini." : "Akun Anda tidak lagi memiliki izin untuk membuat import.", tone: "error" });
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
           setFeedback({ message: recovery === "expired" ? "Sesi admin Anda kedaluwarsa. Masuk lagi untuk melanjutkan import ini." : "Akun Anda tidak lagi memiliki izin untuk membuat import.", tone: "error" });
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
         setFeedback({ message: "Server mengembalikan preview yang tidak lengkap. Coba lagi.", tone: "error" });
        return;
      }

      resetFile();
      router.push(`/admin/imports/${encodeURIComponent(draft.importId)}`);
    } catch {
      setSessionIssue(null);
       setFeedback({ message: "Upload tidak dapat mencapai server. Tidak ada akun yang berubah.", tone: "error" });
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
           <p className="mt-2 max-w-[60ch] text-sm leading-6 text-secondary-500">Unggah CSV, periksa setiap baris, lalu konfirmasi import setelah siap.</p>
        </div>
      ) : null}

      <form className={embedded ? "grid gap-5" : "grid gap-5 p-5 sm:p-7"} onSubmit={handleUpload}>
        <div className={showRoleSelect ? "grid gap-5 lg:grid-cols-2 lg:gap-6" : "grid gap-5"}>
          {showRoleSelect ? (
            <ReferenceSurface as="div" className="min-w-0 p-4 sm:p-5" variant="inset">
              <div className="flex items-center gap-1.5">
                 <label className="block text-sm font-semibold text-secondary-900" htmlFor="import-role">1. Pilih peran</label>
                <Tooltip>
                  <TooltipTrigger render={<Button aria-label="Role import guidance" size="icon-xs" type="button" variant="ghost" />}>
                    <CircleHelp aria-hidden="true" size={15} />
                  </TooltipTrigger>
                   <TooltipContent>Setiap file hanya boleh berisi satu peran.</TooltipContent>
                </Tooltip>
              </div>
              <div className="mt-3">
                <ReferenceSelect
                  aria-label="Peran import"
                  disabled={busy}
                  id="import-role"
                  onValueChange={(value) => handleRoleChange(value as ImportRole)}
                  options={[
                    { label: "Siswa", value: "student" },
                    { label: "Kapten", value: "tutor" },
                  ]}
                  value={role}
                />
              </div>
            </ReferenceSurface>
          ) : null}

          <ReferenceSurface as="div" className="min-w-0 p-4 sm:p-5" variant="inset">
             <p className="text-sm font-semibold text-secondary-900">{showRoleSelect ? "2. Dapatkan template CSV" : "1. Unduh template CSV"}</p>
             <p className="mt-1 text-xs leading-5 text-secondary-500">Gunakan kolom yang sesuai untuk {template.label}.</p>
            <Button
              className="mt-4"
              nativeButton={false}
               render={<a aria-label="Unduh template" download={template.fileName} href={`/api/admin/imports/templates/${template.version}`} />}
              size="default"
              variant="reference"
            >
               <ArrowDownToLine aria-hidden="true" size={16} />
               Unduh template
            </Button>
          </ReferenceSurface>

          <ReferenceSurface as="div" className={showRoleSelect ? "min-w-0 p-4 lg:col-span-2 sm:p-5" : "min-w-0 p-4 sm:p-5"} variant="inset">
             <p className="text-sm font-semibold text-secondary-900">{showRoleSelect ? "3. Unggah file" : "2. Unggah file"}</p>
             <p className="mt-2 text-xs leading-5 text-secondary-500">Hanya CSV, maksimal 2 MiB dan 500 baris data.</p>
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
               <span className="mt-3 text-sm font-semibold text-secondary-900">{file ? file.name : "Letakkan file CSV di sini atau telusuri"}</span>
               <span className="mt-1 text-xs leading-5 text-secondary-500">{file ? "Siap diunggah" : "Hanya CSV · maksimal 2 MiB · 500 baris data"}</span>
            </label>
             <p className="sr-only" id="roster-upload-help">Letakkan file CSV di sini atau telusuri file. Preview akan menjelaskan setiap baris sebelum konfirmasi.</p>
            <Button className="mt-4 w-full" disabled={busy || !file} size="lg" type="submit" variant="brand">
              <FileUp aria-hidden="true" size={17} />
               {busy ? "Mengunggah…" : "Unggah"}
            </Button>
            <p aria-live="polite" className={`mt-3 min-h-5 text-xs leading-5 ${feedback.tone === "error" ? "text-student-status-danger-fg" : "text-secondary-600"}`} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.message}</p>
          </ReferenceSurface>
        </div>

        {sessionIssue ? (
          <ReferenceSurface as="div" className={`flex flex-col gap-3 p-4 text-xs leading-5 ${ADMIN_STATUS_CLASS_NAMES.danger}`} role="alert" variant="inset">
            <div>
               <p className="font-semibold">{sessionIssue === "expired" ? "Sesi admin kedaluwarsa" : "Izin admin diperlukan"}</p>
               <p className="mt-1">{sessionIssue === "expired" ? "Masuk lagi untuk kembali ke workspace import." : "Gunakan akun admin aktif atau kembali ke halaman utama admin."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                nativeButton={false}
                render={<Link href={sessionIssue === "expired" ? getImportLoginRecoveryHref("/admin/enrollment") : "/admin"} />}
                size="default"
                variant="dangerOutline"
              >
                 {sessionIssue === "expired" ? "Masuk lagi" : "Kembali ke halaman utama admin"}
              </Button>
               <Button onClick={() => window.location.reload()} size="default" variant="dangerOutline">Segarkan halaman</Button>
            </div>
          </ReferenceSurface>
        ) : null}
      </form>
    </ReferenceSurface>
  );
}

export { ImportsIntakeModule };

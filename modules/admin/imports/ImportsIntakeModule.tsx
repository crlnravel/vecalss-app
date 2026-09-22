"use client";

import { useRef, useState } from "react";
import { ArrowDownToLine, CircleHelp, FileUp } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { FieldRequiredMark } from "@/components/ui/field";
import { FileUploadSlot } from "@/components/ui/file-upload-slot";
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
  student: { fileName: "daftar-siswa.csv", label: "Siswa", version: "students.v1" },
  tutor: { fileName: "daftar-kapten.csv", label: "Kapten", version: "kapten.v1" },
};

const previewErrorMessages: Record<string, string> = {
  csv_empty_file: "File harus memiliki judul kolom dan setidaknya satu baris data.",
  csv_header_mismatch: "Susunan kolom tidak sesuai dengan templat yang dipilih.",
  csv_invalid_utf8: "File tidak bisa dibaca. Simpan ulang file lalu coba lagi.",
  csv_malformed: "Ada bagian file yang belum lengkap.",
  csv_row_limit: "File berisi lebih dari 500 baris.",
  invalid_origin: "Upload ini sudah kedaluwarsa. Segarkan halaman lalu coba lagi.",
  invalid_role: "Pilih Siswa atau Kapten sebelum mengunggah.",
  invalid_template: "Pilih templat yang sesuai untuk peran ini.",
  multipart_invalid: "Unggahan tidak dapat dibaca. Pilih satu file daftar lalu coba lagi.",
  preview_unavailable: "Pemeriksaan tidak dapat dibuat. Tidak ada akun yang berubah; coba lagi.",
  request_too_large: "File terlalu besar (maksimal 2 MB).",
};

function readPreviewError(code: unknown) {
  return typeof code === "string" && previewErrorMessages[code]
    ? previewErrorMessages[code]
     : "Pemeriksaan tidak dapat dibuat. Tidak ada akun yang berubah; coba lagi.";
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


function resetImportFileSelectionState(fileInputRef: React.RefObject<HTMLInputElement | null>, setFile: (file: File | null) => void) {
  setFile(null);
  resetImportFileSelection(fileInputRef.current);
}

function selectImportFile(nextFile: File | null, fileInputRef: React.RefObject<HTMLInputElement | null>, setFile: (file: File | null) => void, setFeedback: (value: { message: string; tone: "error" | "info" }) => void) {
  if (!nextFile) return;
  if (!nextFile.name.toLowerCase().endsWith(".csv")) {
    resetImportFileSelectionState(fileInputRef, setFile);
    setFeedback({ message: "Pilih file sebelum mengunggah.", tone: "error" });
    return;
  }
  setFile(nextFile);
  setFeedback({ message: "", tone: "info" });
}

async function submitImportPreview({
  file,
  onBusyChange,
  resetFile,
  role,
  routerPush,
  setBusy,
  setFeedback,
  setSessionIssue,
  templateVersion,
}: {
  file: File | null;
  onBusyChange?: (busy: boolean) => void;
  resetFile: () => void;
  role: ImportRole;
  routerPush: (href: string) => void;
  setBusy: (value: boolean) => void;
  setFeedback: (value: { message: string; tone: "error" | "info" }) => void;
  setSessionIssue: (value: "expired" | "forbidden" | null) => void;
  templateVersion: string;
}) {
  if (!file) {
    setFeedback({ message: "Pilih file sebelum mengunggah.", tone: "error" });
    return;
  }

  setBusy(true);
  onBusyChange?.(true);
  setFeedback({ message: "Mengunggah file dan memeriksa isinya…", tone: "info" });
  try {
    const body = new FormData();
    body.append("template", templateVersion);
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
      setFeedback({ message: initialRecovery === "expired" ? "Sesi admin Anda kedaluwarsa. Masuk lagi untuk melanjutkan penambahan daftar ini." : "Akun Anda tidak lagi memiliki izin untuk menambahkan daftar.", tone: "error" });
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
        setFeedback({ message: recovery === "expired" ? "Sesi admin Anda kedaluwarsa. Masuk lagi untuk melanjutkan penambahan daftar ini." : "Akun Anda tidak lagi memiliki izin untuk menambahkan daftar.", tone: "error" });
        return;
      }
      setFeedback({ message: readPreviewError(errorCode), tone: "error" });
      return;
    }

    const payload: unknown = await response.json().catch(() => null);
    setSessionIssue(null);
    const draft = payload && typeof payload === "object" && "draft" in payload
      ? (payload as { draft?: { importId?: unknown } }).draft
      : null;
    if (!draft || typeof draft.importId !== "string") {
      setFeedback({ message: "Sistem mengembalikan pemeriksaan yang tidak lengkap. Coba lagi.", tone: "error" });
      return;
    }

    resetFile();
    routerPush("/admin/imports/" + encodeURIComponent(draft.importId));
  } catch {
    setSessionIssue(null);
    setFeedback({ message: "File tidak dapat diproses. Tidak ada akun yang berubah.", tone: "error" });
  } finally {
    setBusy(false);
    onBusyChange?.(false);
  }
}

function ImportIntakeHeader({ embedded }: { embedded: boolean }) {
  if (embedded) return null;

  return (
    <div className="border-b border-primary-100/80 px-5 py-6 sm:px-7 sm:py-7">
      <h2 className="font-heading text-2xl font-semibold tracking-[-0.03em] text-secondary-900" id="import-siswa-heading">Tambah Siswa</h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-6 text-secondary-500">Unggah daftar, periksa isinya, lalu konfirmasi setelah siap.</p>
    </div>
  );
}

function ImportRoleSelection({ busy, onRoleChange, role }: { busy: boolean; onRoleChange: (role: ImportRole) => void; role: ImportRole }) {
  return (
    <ReferenceSurface as="div" className="min-w-0 p-4 sm:p-5" variant="inset">
      <div className="flex items-center gap-1.5">
        <label className="block text-sm font-semibold text-secondary-900" htmlFor="import-role">1. Pilih peran<FieldRequiredMark /></label>
        <Tooltip>
          <TooltipTrigger render={<Button aria-label="Panduan peran" size="icon-xs" type="button" variant="ghost" />}>
            <CircleHelp aria-hidden="true" size={15} />
          </TooltipTrigger>
          <TooltipContent>Setiap file hanya boleh berisi satu peran.</TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-3">
        <ReferenceSelect
          aria-label="Peran"
          disabled={busy}
          id="import-role"
          onValueChange={(value) => onRoleChange(value as ImportRole)}
          options={[{ label: "Siswa", value: "student" }, { label: "Kapten", value: "tutor" }]}
          required
          value={role}
        />
      </div>
    </ReferenceSurface>
  );
}

function ImportTemplateDownload({ showRoleSelect, template }: { showRoleSelect: boolean; template: { fileName: string; label: string; version: string } }) {
  return (
    <ReferenceSurface as="div" className="min-w-0 p-4 sm:p-5" variant="inset">
      <p className="text-sm font-semibold text-secondary-900">{showRoleSelect ? "2. Unduh templat daftar" : "1. Unduh templat daftar"}</p>
      <p className="mt-1 text-xs leading-5 text-secondary-500">Gunakan templat ini untuk menambahkan daftar {template.label}.</p>
      <Button className="mt-4" nativeButton={false} render={<a aria-label="Unduh templat" download={template.fileName} href={"/api/admin/imports/templates/" + template.version} />} size="default" variant="reference">
        <ArrowDownToLine aria-hidden="true" size={16} />
        Unduh templat
      </Button>
    </ReferenceSurface>
  );
}

function ImportFileUpload({
  busy,
  file,
  fileInputRef,
  feedback,
  onFileChange,
  showRoleSelect,
}: {
  busy: boolean;
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  feedback: { message: string; tone: "error" | "info" };
  onFileChange: (file: File | null) => void;
  showRoleSelect: boolean;
}) {
  return (
    <ReferenceSurface as="div" className={showRoleSelect ? "min-w-0 p-4 lg:col-span-2 sm:p-5" : "min-w-0 p-4 sm:p-5"} variant="inset">
      <p className="text-sm font-semibold text-secondary-900">{showRoleSelect ? "3. Unggah file" : "2. Unggah file"}<FieldRequiredMark /></p>
      <p className="mt-2 text-xs leading-5 text-secondary-500">Maksimal 2 MB dan 500 baris.</p>
      <div className="mt-4">
        <FileUploadSlot
          accept=".csv,text/csv"
          disabled={busy}
          file={file}
          id="roster-upload"
          inputRef={fileInputRef}
          maxSizeLabel="Maks. 2 MB · 500 baris"
          onChange={onFileChange}
          uploadLabel="Mengunggah file"
          uploading={busy}
        />
      </div>
      <p className="sr-only" id="roster-upload-help">Letakkan file di sini atau telusuri file. Pemeriksaan akan menjelaskan isi file sebelum konfirmasi.</p>
      <Button className="mt-4 w-full" disabled={busy || !file} size="lg" type="submit" variant="brand">
        <FileUp aria-hidden="true" size={17} />
        {busy ? "Mengunggah…" : "Unggah"}
      </Button>
      <p aria-live="polite" className={cn("mt-3 min-h-5 text-xs leading-5", feedback.tone === "error" ? "text-student-status-danger-fg" : "text-secondary-600")} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.message}</p>
    </ReferenceSurface>
  );
}

function ImportSessionIssueNotice({ sessionIssue }: { sessionIssue: "expired" | "forbidden" | null }) {
  if (!sessionIssue) return null;
  const expired = sessionIssue === "expired";

  return (
    <ReferenceSurface as="div" className={cn("flex flex-col gap-3 p-4 text-xs leading-5", ADMIN_STATUS_CLASS_NAMES.danger)} role="alert" variant="inset">
      <div>
        <p className="font-semibold">{expired ? "Sesi admin kedaluwarsa" : "Izin admin diperlukan"}</p>
      <p className="mt-1">{expired ? "Masuk lagi untuk kembali ke halaman penambahan daftar." : "Gunakan akun admin aktif atau kembali ke halaman utama admin."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href={expired ? getImportLoginRecoveryHref("/admin/enrollment") : "/admin"} />} size="default" variant="dangerOutline">
          {expired ? "Masuk lagi" : "Kembali ke halaman utama admin"}
        </Button>
        <Button onClick={() => window.location.reload()} size="default" variant="dangerOutline">Segarkan halaman</Button>
      </div>
    </ReferenceSurface>
  );
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
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "info" }>({ message: "", tone: "info" });
  const [sessionIssue, setSessionIssue] = useState<"expired" | "forbidden" | null>(null);
  const template = templateForRole[role];

  const resetFile = () => resetImportFileSelectionState(fileInputRef, setFile);
  const handleRoleChange = (nextRole: ImportRole) => {
    if (nextRole === role) return;
    setRole(nextRole);
    resetFile();
    setFeedback({ message: "Peran diubah menjadi " + templateForRole[nextRole].label + ". Pilih file baru untuk templat ini.", tone: "info" });
  };
  const handleFileSelection = (nextFile: File | null) => {
    if (!nextFile) {
      resetFile();
      return;
    }
    selectImportFile(nextFile, fileInputRef, setFile, setFeedback);
  };
  const handleUpload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitImportPreview({
      file,
      onBusyChange,
      resetFile,
      role,
      routerPush: (href) => router.push(href),
      setBusy,
      setFeedback,
      setSessionIssue,
      templateVersion: template.version,
    });
  };

  return (
    <ReferenceSurface as="section" aria-labelledby={embedded ? undefined : "import-siswa-heading"} className={embedded ? "space-y-5 border-0 bg-transparent p-0 shadow-none" : "overflow-hidden p-0"}>
      <ImportIntakeHeader embedded={embedded} />
      <form className={embedded ? "grid gap-5" : "grid gap-5 p-5 sm:p-7"} onSubmit={handleUpload}>
        <div className={showRoleSelect ? "grid gap-5 lg:grid-cols-2 lg:gap-6" : "grid gap-5"}>
          {showRoleSelect ? <ImportRoleSelection busy={busy} onRoleChange={handleRoleChange} role={role} /> : null}
          <ImportTemplateDownload showRoleSelect={showRoleSelect} template={template} />
          <ImportFileUpload
            busy={busy}
            file={file}
            fileInputRef={fileInputRef}
            feedback={feedback}
            onFileChange={handleFileSelection}
            showRoleSelect={showRoleSelect}
          />
        </div>
        <ImportSessionIssueNotice sessionIssue={sessionIssue} />
      </form>
    </ReferenceSurface>
  );
}
export { ImportsIntakeModule };

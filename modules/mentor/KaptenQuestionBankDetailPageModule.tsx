"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  AlertTriangle,
  Check,
  ChevronLeft,
  CircleHelp,
  Ellipsis,
  FilePenLine,
  Folder,
  LibraryBig,
  Pencil,
  Plus,
  Upload,
  X,
} from "@/lib/icons";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldTextarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/sonner";
import type { SessionContext } from "@/lib/auth/types";
import { questionBankFolderLabel } from "@/lib/question-bank/labels";
import {
  getQuestionBankReadinessFromDrafts,
  type QuestionBankReadiness,
} from "@/lib/question-bank/readiness";
import { cn } from "@/lib/utils";
import { MediaAssetPreview } from "@/modules/media/media-library";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import type { BankQuestion, KaptenQuestionBank } from "@/modules/mentor/mock-data";
import {
  moveQuestionBanksToFolderAction,
  saveQuestionBankAction,
  setQuestionBankCategoriesAction,
  updateQuestionBankLifecycleAction,
} from "@/modules/mentor/question-bank-actions";

const ROOT_FOLDER_VALUE = "__bank_soal_root__";

type QuestionBankFolderNode = {
  children?: QuestionBankFolderNode[];
  id: string | null;
  name: string;
};

type QuestionBankCategoryOption = {
  id: string;
  name: string;
};

type ConfirmationRequest = {
  confirmLabel: string;
  description: string;
  onConfirm: () => void;
  title: string;
};

function flattenQuestionBankFolders(
  folders: QuestionBankFolderNode[],
  depth = 0,
): Array<{ depth: number; folder: QuestionBankFolderNode & { id: string } }> {
  return folders.flatMap((folder) => [
    ...(folder.id ? [{ depth, folder: folder as QuestionBankFolderNode & { id: string } }] : []),
    ...(folder.children ? flattenQuestionBankFolders(folder.children, depth + 1) : []),
  ]);
}

function findQuestionBankFolder(
  folders: QuestionBankFolderNode[],
  id: string | null,
): QuestionBankFolderNode | null {
  if (id === null) return folders.find((folder) => folder.id === null) ?? null;
  for (const folder of folders) {
    if (folder.id === id) return folder;
    const child = folder.children ? findQuestionBankFolder(folder.children, id) : null;
    if (child) return child;
  }
  return null;
}

function StatusPill({ status }: { status: KaptenQuestionBank["status"] }) {
  if (status === "published") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-600" />
        Terbit
      </span>
    );
  }
  if (status === "archived") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary-200 bg-secondary-50 px-2.5 py-1 text-xs font-semibold text-secondary-700">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-secondary-500" />
        Diarsipkan
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-600" />
      Draf
    </span>
  );
}

function KaptenQuestionBankDetailPageModule({
  bankId,
  initialBank,
  initialCategories = [],
  initialFolderTree = [],
  initialQuestions = [],
  initialReadiness = null,
  session,
}: {
  bankId: string;
  initialBank: KaptenQuestionBank;
  initialCategories?: QuestionBankCategoryOption[];
  initialFolderTree?: QuestionBankFolderNode[];
  initialQuestions?: BankQuestion[];
  initialReadiness?: QuestionBankReadiness | null;
  session: SessionContext;
}) {
  const router = useRouter();
  const [bank, setBank] = useState<KaptenQuestionBank>(initialBank);
  const [questions] = useState<BankQuestion[]>(initialQuestions);
  const [categories] = useState<QuestionBankCategoryOption[]>(initialCategories);
  const [folders] = useState<QuestionBankFolderNode[]>(initialFolderTree);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(bank.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionInput, setDescriptionInput] = useState(bank.description ?? "");
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  const [isSavingLifecycle, setIsSavingLifecycle] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);

  const readiness = initialReadiness ?? getQuestionBankReadinessFromDrafts(questions);
  const isMetadataLocked = bank.status === "archived" || bank.status === "scheduled";

  const currentFolder = findQuestionBankFolder(folders, bank.folderId ?? null);
  const folderLabel = questionBankFolderLabel(bank.folderId ?? null, currentFolder?.name ?? "Folder tidak ditemukan");
  const folderOptions = flattenQuestionBankFolders(folders);
  const assignedCategories = categories.filter((category) => (bank.categoryIds ?? []).includes(category.id));

  const subjectCoverage = [
    ...new Set(
      questions
        .map((q) => q.subjectCode)
        .filter((code): code is string => Boolean(code)),
    ),
  ];

  async function handleSaveTitle() {
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === bank.title) {
      setIsEditingTitle(false);
      return;
    }
    setIsSavingTitle(true);
    setLifecycleError(null);
    try {
      const result = await saveQuestionBankAction({
        description: bank.description,
        id: bank.id,
        questions,
        revision: bank.revision,
        title: trimmed,
      });
      if (!result.ok) {
        setLifecycleError(result.message);
        return;
      }
      setBank((current) => ({
        ...current,
        revision: result.result.bank.revision,
        title: result.result.bank.title,
        updatedAt: result.result.bank.updatedAt,
      }));
      setIsEditingTitle(false);
      showToast("Judul Bank Soal diperbarui.", { variant: "success" });
      router.refresh();
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : "Gagal mengubah judul bank soal.");
    } finally {
      setIsSavingTitle(false);
    }
  }

  async function handleSaveDescription() {
    const trimmed = descriptionInput.trim();
    if (trimmed === (bank.description ?? "")) {
      setIsEditingDescription(false);
      return;
    }
    setIsSavingDescription(true);
    setLifecycleError(null);
    try {
      const result = await saveQuestionBankAction({
        description: trimmed,
        id: bank.id,
        questions,
        revision: bank.revision,
        title: bank.title,
      });
      if (!result.ok) {
        setLifecycleError(result.message);
        return;
      }
      setBank((current) => ({
        ...current,
        description: result.result.bank.description,
        revision: result.result.bank.revision,
        updatedAt: result.result.bank.updatedAt,
      }));
      setIsEditingDescription(false);
      showToast("Deskripsi Bank Soal diperbarui.", { variant: "success" });
      router.refresh();
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : "Gagal mengubah deskripsi bank soal.");
    } finally {
      setIsSavingDescription(false);
    }
  }

  async function handleFolderChange(nextFolderId: string | null) {
    if (nextFolderId === bank.folderId || isMetadataLocked) return;
    setLifecycleError(null);
    try {
      const result = await moveQuestionBanksToFolderAction([bank.id], nextFolderId, {
        expected: {
          [bank.id]: {
            expectedRevision: bank.revision,
            expectedUpdatedAt: bank.updatedAt,
          },
        },
      });
      if (!result.ok) {
        setLifecycleError(result.message);
        return;
      }
      const version = result.result.versions.find((item) => item.id === bank.id);
      setBank((current) => ({
        ...current,
        folderId: nextFolderId,
        ...(version ? { revision: version.revision, updatedAt: version.updatedAt } : {}),
      }));
      showToast("Folder Bank Soal diperbarui.", { variant: "success" });
      router.refresh();
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : "Gagal memindahkan folder.");
    }
  }

  async function handleCategoriesChange(nextCategoryIds: string[]) {
    if (isMetadataLocked) return;
    setLifecycleError(null);
    try {
      const result = await setQuestionBankCategoriesAction(bank.id, nextCategoryIds, {
        expectedRevision: bank.revision,
        expectedUpdatedAt: bank.updatedAt,
      });
      if (!result.ok) {
        setLifecycleError(result.message);
        return;
      }
      setBank((current) => ({
        ...current,
        categoryIds: nextCategoryIds,
        revision: result.result.revision,
        updatedAt: result.result.updatedAt,
      }));
      showToast("Kategori Bank Soal diperbarui.", { variant: "success" });
      router.refresh();
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : "Gagal memperbarui kategori.");
    }
  }

  async function handleLifecycle(operation: "publish" | "unpublish" | "archive" | "restore") {
    setIsSavingLifecycle(true);
    setLifecycleError(null);
    try {
      const result = await updateQuestionBankLifecycleAction(bank.id, operation, {
        expectedRevision: bank.revision ?? 1,
      });
      if (!result.ok) {
        setLifecycleError(result.message);
        return;
      }
      setBank((current) => ({
        ...current,
        revision: result.result.revision,
        status: result.result.status,
      }));
      const lifecycleMessage = {
        archive: "Bank Soal diarsipkan.",
        publish: "Bank Soal diterbitkan.",
        restore: "Bank Soal dipulihkan.",
        unpublish: "Bank Soal dijadikan draf.",
      }[operation];
      showToast(lifecycleMessage, { variant: "success" });
      router.refresh();
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : "Gagal mengubah status bank.");
    } finally {
      setIsSavingLifecycle(false);
    }
  }

  function requestArchive() {
    setConfirmationRequest({
      confirmLabel: "Arsipkan",
      description:
        "Bank Soal ini akan dipindahkan ke arsip dan tidak dapat dipakai untuk authoring sampai dipulihkan.",
      onConfirm: () => {
        setConfirmationRequest(null);
        void handleLifecycle("archive");
      },
      title: "Arsipkan Bank Soal?",
    });
  }

  const publishDisabledReason =
    readiness.incompleteCount > 0
      ? `${readiness.incompleteCount} soal perlu diperbaiki sebelum diterbitkan`
      : undefined;

  return (
    <MentorWorkspaceShell
      activeLabel="Bank Soal"
      breadcrumbLabel={bank.title || "Detail Bank Soal"}
      contentElement="div"
      mainClassName="max-w-[1400px] gap-8"
      session={session}
      showSearch={false}
    >
      {/* Top Bar Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            aria-label="Kembali ke Bank Soal"
            nativeButton={false}
            render={<Link href="/mentor/quiz/question-bank" />}
            size="sm"
            title="Kembali ke Bank Soal"
            variant="ghost"
          >
            <ChevronLeft />
            <span>Kembali ke Bank Soal</span>
          </Button>
        </div>

        {/* Global Bank Lifecycle Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {bank.status === "archived" ? (
            <Button
              aria-busy={isSavingLifecycle}
              disabled={isSavingLifecycle}
              onClick={() => handleLifecycle("restore")}
              size="sm"
              type="button"
              variant="brandOutline"
            >
              <Upload />
              {isSavingLifecycle ? "Memulihkan…" : "Pulihkan bank"}
            </Button>
          ) : bank.status === "published" ? (
            <Button
              aria-busy={isSavingLifecycle}
              disabled={isSavingLifecycle}
              onClick={() => handleLifecycle("unpublish")}
              size="sm"
              type="button"
              variant="brandOutline"
            >
              <FilePenLine />
              {isSavingLifecycle ? "Menjadikan draf…" : "Jadikan draf"}
            </Button>
          ) : (
            <Button
              aria-busy={isSavingLifecycle}
              aria-describedby={publishDisabledReason ? "publish-disabled-reason" : undefined}
              disabled={isSavingLifecycle || readiness.incompleteCount > 0}
              onClick={() => handleLifecycle("publish")}
              size="sm"
              type="button"
              variant="brand"
            >
              <Upload />
              {isSavingLifecycle ? "Menerbitkan…" : "Terbitkan"}
            </Button>
          )}

          {bank.status !== "archived" && bank.status !== "scheduled" ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label="Aksi Bank Soal"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={isSavingLifecycle}
                    onClick={requestArchive}
                    variant="destructive"
                  >
                    <Archive />
                    Arsipkan bank
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {publishDisabledReason ? (
            <p className="sr-only" id="publish-disabled-reason">
              {publishDisabledReason}
            </p>
          ) : null}
        </div>
      </div>

      {lifecycleError ? (
        <Alert variant="destructive">
          <AlertTitle>Terjadi Masalah</AlertTitle>
          <AlertDescription>{lifecycleError}</AlertDescription>
        </Alert>
      ) : null}

      {/* Main Bank Information Header Card */}
      <section className="rounded-2xl border border-primary-100 bg-white p-5 shadow-xs sm:p-6">
        <div className="space-y-6">
          {/* Bank Title & Status */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={bank.status} />
              {subjectCoverage.map((code) => (
                <Badge key={code} size="ui" variant="mint">
                  {code}
                </Badge>
              ))}
            </div>

            {isEditingTitle ? (
              <div className="mt-3 flex max-w-2xl items-center gap-2">
                <Input
                  autoFocus
                  className="text-2xl font-semibold md:text-3xl"
                  disabled={isSavingTitle}
                  id="edit-bank-title-input"
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSaveTitle();
                    } else if (e.key === "Escape") {
                      setIsEditingTitle(false);
                      setTitleInput(bank.title);
                    }
                  }}
                  value={titleInput}
                />
                <Button
                  disabled={isSavingTitle || !titleInput.trim()}
                  onClick={handleSaveTitle}
                  size="sm"
                  type="button"
                  variant="brand"
                >
                  <Check />
                  Simpan
                </Button>
                <Button
                  disabled={isSavingTitle}
                  onClick={() => {
                    setIsEditingTitle(false);
                    setTitleInput(bank.title);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X />
                  Batal
                </Button>
              </div>
            ) : (
              <div className="group mt-3 flex items-start gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-secondary-900 md:text-4xl">
                  {bank.title}
                </h1>
                {!isMetadataLocked ? (
                  <Button
                    aria-label="Ubah judul bank soal"
                    className="mt-1 size-8 shrink-0 text-secondary-400 opacity-60 hover:text-secondary-900 group-hover:opacity-100"
                    onClick={() => {
                      setTitleInput(bank.title);
                      setIsEditingTitle(true);
                    }}
                    size="icon-sm"
                    title="Ubah judul bank soal"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil className="size-4" />
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          {/* Description Section with Pencil */}
          <div className="border-t border-primary-100/70 pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-secondary-500">
                Deskripsi
              </span>
              {!isEditingDescription && !isMetadataLocked ? (
                <Button
                  aria-label="Ubah deskripsi bank"
                  className="size-7 text-secondary-400 hover:text-secondary-900"
                  onClick={() => {
                    setDescriptionInput(bank.description ?? "");
                    setIsEditingDescription(true);
                  }}
                  size="icon-sm"
                  title="Ubah deskripsi"
                  type="button"
                  variant="ghost"
                >
                  <Pencil className="size-3.5" />
                </Button>
              ) : null}
            </div>

            {isEditingDescription ? (
              <div className="mt-2 max-w-3xl space-y-2">
                <FieldTextarea
                  autoFocus
                  className="min-h-[90px] text-sm"
                  disabled={isSavingDescription}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder="Tuliskan deskripsi ringkas tentang bank soal ini…"
                  value={descriptionInput}
                />
                <div className="flex gap-2">
                  <Button
                    disabled={isSavingDescription}
                    onClick={handleSaveDescription}
                    size="sm"
                    type="button"
                    variant="brand"
                  >
                    <Check />
                    Simpan
                  </Button>
                  <Button
                    disabled={isSavingDescription}
                    onClick={() => {
                      setIsEditingDescription(false);
                      setDescriptionInput(bank.description ?? "");
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <X />
                    Batal
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm leading-6 text-secondary-700">
                {bank.description ? (
                  bank.description
                ) : (
                  <span className="italic text-secondary-400">
                    Belum ada deskripsi untuk bank soal ini. Klik ikon pensil untuk menambahkan.
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Taxonomy & Organization with Editable Pickers */}
          <div className="grid gap-5 rounded-xl border border-primary-100 bg-primary-50/30 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            {/* Folder Selection */}
            <div>
              <span className="text-xs font-semibold text-secondary-500">Folder</span>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary-900">
                  <Folder className="size-4 text-primary-700" />
                  <span className="truncate">{folderLabel}</span>
                </span>
                {!isMetadataLocked ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label="Pindahkan folder"
                          className="size-6 text-secondary-400 hover:text-secondary-900"
                          size="icon-sm"
                          title="Pindahkan folder"
                          type="button"
                          variant="ghost"
                        />
                      }
                    >
                      <Pencil className="size-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel>Pilih Folder</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        onValueChange={(val) =>
                          handleFolderChange(val === ROOT_FOLDER_VALUE ? null : val)
                        }
                        value={bank.folderId ?? ROOT_FOLDER_VALUE}
                      >
                        <DropdownMenuRadioItem value={ROOT_FOLDER_VALUE}>
                          Bank soal (Utama)
                        </DropdownMenuRadioItem>
                        {folderOptions.map(({ depth, folder }) => (
                          <DropdownMenuRadioItem key={folder.id} value={folder.id}>
                            <span style={{ paddingLeft: `${depth * 12}px` }}>{folder.name}</span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>

            {/* Category Selection */}
            <div>
              <span className="text-xs font-semibold text-secondary-500">Kategori</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {assignedCategories.length > 0 ? (
                  assignedCategories.map((cat) => (
                    <span
                      className="inline-flex items-center rounded-full border border-primary-200 bg-white px-2.5 py-0.5 text-xs font-medium text-primary-800"
                      key={cat.id}
                    >
                      {cat.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-secondary-400">Tanpa kategori</span>
                )}
                {!isMetadataLocked ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label="Kelola kategori"
                          className="size-6 text-secondary-400 hover:text-secondary-900"
                          size="icon-sm"
                          title="Kelola kategori"
                          type="button"
                          variant="ghost"
                        />
                      }
                    >
                      <Pencil className="size-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel>Pilih Kategori</DropdownMenuLabel>
                      {categories.map((category) => {
                        const categoryIds = bank.categoryIds ?? [];
                        const checked = categoryIds.includes(category.id);
                        return (
                          <DropdownMenuCheckboxItem
                            checked={checked}
                            key={category.id}
                            onCheckedChange={(nextChecked) => {
                              const nextIds = nextChecked
                                ? [...categoryIds, category.id]
                                : categoryIds.filter((id) => id !== category.id);
                              void handleCategoriesChange(nextIds);
                            }}
                          >
                            {category.name}
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>

            {/* Readiness & Quality Summary */}
            <div>
              <span className="text-xs font-semibold text-secondary-500">Status Kesiapan</span>
              <p className="mt-1.5 text-sm font-semibold text-secondary-900">
                Kesiapan terbit: {readiness.readyCount}/{readiness.totalCount}
              </p>
              {readiness.incompleteCount > 0 ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                  <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
                  {readiness.incompleteCount} soal perlu diperbaiki
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Soal-soal Section in the Bottom with Prominent Editor Button */}
      <section className="space-y-6">
        <div className="flex flex-col items-start gap-4 rounded-xl border border-primary-100 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-secondary-900 sm:text-2xl">
                Daftar Soal
              </h2>
              <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-800">
                {questions.length} Soal
              </span>
            </div>
            <p className="text-sm text-secondary-600">
              Kesiapan terbit: {readiness.readyCount}/{readiness.totalCount}
            </p>
            {readiness.incompleteCount > 0 ? (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
                {readiness.incompleteCount} soal perlu diperbaiki
              </p>
            ) : null}
          </div>

          {/* Button on top of soal summary to go to the editor */}
          <Button
            aria-label="Buka Editor Soal"
            className="w-full shadow-sm sm:w-auto"
            nativeButton={false}
            render={<Link href={`/mentor/quiz/question-bank/${bankId}/editor`} />}
            size="default"
            variant="brand"
          >
            <Pencil data-icon="inline-start" />
            Buka Editor Soal
          </Button>
        </div>

        {/* Questions Cards List */}
        {questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-white py-16 text-center">
            <LibraryBig className="size-12 text-primary-300" />
            <h3 className="mt-4 font-semibold text-secondary-900">Belum ada soal dalam bank ini</h3>
            <p className="mt-1 text-sm text-secondary-600">
              Mulai menulis soal pilihan ganda lengkap dengan kunci jawaban dan pembahasan.
            </p>
            <Button
              className="mt-6"
              nativeButton={false}
              render={<Link href={`/mentor/quiz/question-bank/${bankId}/editor`} />}
              variant="brand"
            >
              <Plus />
              Tulis Soal Pertama
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {questions.map((question, index) => {
              const questionIssues = readiness.issues.filter(
                (issue) => issue.questionId === question.id,
              );
              const hasIssues = questionIssues.length > 0;

              return (
                <article
                  className={cn(
                    "rounded-xl border p-4 shadow-xs transition-shadow hover:shadow-sm sm:p-5",
                    hasIssues
                      ? "border-amber-300 bg-amber-50/60 hover:border-amber-400"
                      : "border-primary-100 bg-white hover:border-primary-200",
                  )}
                  key={question.id}
                >
                  <div className="flex flex-col items-start gap-3 border-b border-primary-100/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-xl bg-primary-50 text-sm font-bold text-primary-800">
                        {index + 1}
                      </span>
                      <Badge size="ui" variant="mint">
                        {question.subjectCode}
                      </Badge>
                      <Badge
                        size="ui"
                        variant={
                          question.difficulty === "easy"
                            ? "neutral"
                            : question.difficulty === "hard"
                              ? "accent"
                              : "mint"
                        }
                      >
                        {question.difficulty === "easy"
                          ? "Mudah"
                          : question.difficulty === "hard"
                            ? "Sulit"
                            : "Sedang"}
                      </Badge>
                      {hasIssues ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-950">
                          <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
                          Perlu diperbaiki ({questionIssues.length})
                        </span>
                      ) : null}
                    </div>

                    <Button
                      aria-label={`Edit soal ${index + 1}`}
                      nativeButton={false}
                      render={
                        <Link
                          href={`/mentor/quiz/question-bank/${bankId}/editor?question=${question.id}`}
                        />
                      }
                      size="sm"
                      className="self-start"
                      variant="brandOutline"
                    >
                      <Pencil data-icon="inline-start" />
                      Edit Soal
                    </Button>
                  </div>

                  {/* Question Content */}
                  <div className="mt-4 space-y-4">
                    {/* Prompt Text & Image */}
                    <div>
                      <p className="text-sm font-medium leading-6 text-secondary-900">
                        {question.prompt || (
                          <span className="italic text-secondary-400">
                            Pertanyaan belum diisi…
                          </span>
                        )}
                      </p>
                      {question.promptMediaAssetId ? (
                        <div className="mt-3 max-w-md overflow-hidden rounded-xl border border-primary-100">
                          <MediaAssetPreview
                            alt={`Gambar soal ${index + 1}`}
                            assetId={question.promptMediaAssetId}
                            className="max-h-48 bg-white"
                          />
                        </div>
                      ) : null}
                    </div>

                    {/* Choices Grid */}
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {question.choices.map((choice) => {
                        const isCorrect = choice.id === question.correctChoiceId;
                        return (
                          <div
                            className={cn(
                              "flex items-start gap-2.5 rounded-xl border p-3 text-sm transition-colors",
                              isCorrect
                                ? "border-primary-200 bg-primary-50/60 text-primary-950 font-medium"
                                : "border-secondary-100 bg-secondary-50/40 text-secondary-700",
                            )}
                            key={choice.id}
                          >
                            <span
                              className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase",
                                isCorrect
                                  ? "bg-primary-700 text-white"
                                  : "bg-secondary-200 text-secondary-700",
                              )}
                            >
                              {choice.id}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="leading-5">{choice.text || <span className="italic text-secondary-400">Opsi kosong</span>}</p>
                              {choice.mediaAssetId ? (
                                <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100">
                                  <MediaAssetPreview
                                    alt={`Media opsi ${choice.id.toUpperCase()}`}
                                    assetId={choice.mediaAssetId}
                                    className="max-h-24 bg-white"
                                  />
                                </div>
                              ) : null}
                            </div>
                            {isCorrect ? (
                              <span className="shrink-0 text-xs font-semibold text-primary-800">Kunci</span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation if present */}
                    {question.explanation || question.explanationMediaAssetId ? (
                      <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-3.5 text-xs leading-5 text-secondary-700">
                        <span className="font-bold text-primary-900">Pembahasan: </span>
                        {question.explanation}
                        {question.explanationMediaAssetId ? (
                          <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100">
                            <MediaAssetPreview
                              alt="Media pembahasan"
                              assetId={question.explanationMediaAssetId}
                              className="max-h-28 bg-white"
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Confirmation Dialog for Archiving / Lifecycle */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setConfirmationRequest(null);
        }}
        open={Boolean(confirmationRequest)}
      >
        <AlertDialogContent size="sm" variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger">
              <CircleHelp />
            </AlertDialogMedia>
            <AlertDialogTitle>{confirmationRequest?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmationRequest?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmationRequest(null)}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmationRequest?.onConfirm()}
              variant="destructive"
            >
              {confirmationRequest?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuestionBankDetailPageModule };

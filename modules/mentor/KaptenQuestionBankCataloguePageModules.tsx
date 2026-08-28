"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  FilePenLine,
  Folder,
  FolderPlus,
  LibraryBig,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Upload,
} from "@/lib/icons";
import { useMemo, useState, useTransition, type KeyboardEvent } from "react";

import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { DataTableColumn, DataTableFilter } from "@/components/ui/data-table";
import { ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { MentorCatalogueTable } from "@/modules/mentor/components/mentor-catalogue-table";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { kaptenSubjects, type KaptenQuestionBank } from "@/modules/mentor/mock-data";
import {
  createQuestionBankCategoryAction,
  createQuestionBankFolderAction,
  moveQuestionBankFolderAction,
  moveQuestionBanksToFolderAction,
  removeQuestionBankCategoryAction,
  removeQuestionBankFolderAction,
  renameQuestionBankCategoryAction,
  renameQuestionBankFolderAction,
  setQuestionBankCategoriesAction,
  updateQuestionBankLifecycleAction,
} from "@/modules/mentor/question-bank-actions";

type QuestionBankOrganization = {
  categories: Array<{ id: string; name: string }>;
  categoryIds: string[];
  folder: { id: string; name: string } | null;
  folderId: string | null;
  folderPath: Array<{ id: string | null; name: string }>;
  subjectCoverage: string[];
};

type BankEntry = {
  bank: KaptenQuestionBank & QuestionBankOrganization;
};

type FolderNode = {
  bankCount: number;
  children?: FolderNode[];
  createdAt: string;
  id: string | null;
  name: string;
  parentId: string | null;
  updatedAt: string;
};

type QuestionBankCatalogueRow =
  | { bank: BankEntry["bank"]; kind: "bank" }
  | { folder: FolderNode; kind: "folder" };

type CategoryNode = {
  bankCount: number;
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
};

type FolderSelection = "root" | string | null;
type FolderDialogState = { kind: "create" | "move" | "rename"; folderId?: string } | null;
type CategoryEditorState = { categoryId?: string; kind: "create" | "rename" } | null;
type ConfirmationState = { description: string; label: string; onConfirm: () => void; title: string } | null;
type LifecycleAction = "archive" | "publish" | "restore" | "unpublish";
type BankSortMode = "updated" | "name" | "questions";

const BANKS_PER_PAGE = 25;
const ROOT_FOLDER = "root" as const;

type QuestionBankHrefOptions = {
  categories?: string[];
  folder?: FolderSelection;
  page?: number;
  query?: string;
  sort?: BankSortMode;
  status?: string;
  subjects?: string[];
};

function questionBankHref({ categories = [], folder = ROOT_FOLDER, page = 1, query = "", sort = "updated", status = "", subjects = [] }: QuestionBankHrefOptions = {}) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (folder !== ROOT_FOLDER) params.set("folder", folder === null ? "unfiled" : folder);
  categories.forEach((id) => params.append("category", id));
  subjects.forEach((code) => params.append("subtest", code));
  if (status) params.set("status", status);
  if (sort !== "updated") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  return `/mentor/quiz/question-bank${params.toString() ? `?${params.toString()}` : ""}`;
}

function flattenFolders(nodes: FolderNode[], depth = 0): Array<{ depth: number; folder: FolderNode }> {
  return nodes.flatMap((folder) => [
    ...(folder.id === null ? [] : [{ depth, folder }]),
    ...(folder.children ? flattenFolders(folder.children, depth + 1) : []),
  ]);
}

function findFolder(nodes: FolderNode[], id: string | null): FolderNode | null {
  if (id === null) return nodes.find((folder) => folder.id === null) ?? null;
  for (const folder of nodes) {
    if (folder.id === id) return folder;
    const child = folder.children ? findFolder(folder.children, id) : null;
    if (child) return child;
  }
  return null;
}

function folderReference(nodes: FolderNode[], id: string | null): { id: string; name: string } | null {
  const folder = id ? findFolder(nodes, id) : null;
  return folder?.id ? { id: folder.id, name: folder.name } : null;
}

function updateFolder(nodes: FolderNode[], id: string, updater: (folder: FolderNode) => FolderNode): FolderNode[] {
  return nodes.map((folder) => {
    if (folder.id === id) return updater(folder);
    return folder.children ? { ...folder, children: updateFolder(folder.children, id, updater) } : folder;
  });
}

function updateFolderBankCount(nodes: FolderNode[], id: string | null, delta: number): FolderNode[] {
  return nodes.map((folder) => {
    const nextFolder = folder.id === id ? { ...folder, bankCount: Math.max(0, folder.bankCount + delta) } : folder;
    return nextFolder.children ? { ...nextFolder, children: updateFolderBankCount(nextFolder.children, id, delta) } : nextFolder;
  });
}

function moveFolderBankCount(nodes: FolderNode[], sourceId: string | null, targetId: string | null): FolderNode[] {
  if (sourceId === targetId) return nodes;
  return updateFolderBankCount(updateFolderBankCount(nodes, sourceId, -1), targetId, 1);
}

function removeFolder(nodes: FolderNode[], id: string): FolderNode[] {
  return nodes.flatMap((folder) => {
    if (folder.id === id) {
      return (folder.children ?? []).map((child) => ({ ...child, parentId: folder.parentId }));
    }
    return folder.children
      ? [{ ...folder, children: removeFolder(folder.children, id) }]
      : [folder];
  });
}

function detachFolder(nodes: FolderNode[], id: string): FolderNode[] {
  const result: FolderNode[] = [];
  for (const folder of nodes) {
    if (folder.id !== id) {
      result.push(folder.children ? { ...folder, children: detachFolder(folder.children, id) } : folder);
    }
  }
  return result;
}

function insertFolder(nodes: FolderNode[], folder: FolderNode): FolderNode[] {
  if (folder.parentId === null) return [...nodes, folder].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return nodes.map((node) => {
    if (node.id === folder.parentId) {
      return { ...node, children: [...(node.children ?? []), folder].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })) };
    }
    return node.children ? { ...node, children: insertFolder(node.children, folder) } : node;
  });
}

function moveFolder(nodes: FolderNode[], id: string, parentId: string | null): FolderNode[] {
  const folder = findFolder(nodes, id);
  if (!folder) return nodes;
  const without = detachFolder(nodes, id);
  return insertFolder(without, { ...folder, parentId });
}

function folderPath(nodes: FolderNode[], id: string | null): Array<{ id: string | null; name: string }> {
  if (!id) return [{ id: null, name: "Belum ditempatkan" }];
  const flat = new Map(flattenFolders(nodes).map(({ folder }) => [folder.id, folder]));
  const path: Array<{ id: string | null; name: string }> = [];
  let current: string | null = id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = flat.get(current);
    if (!node) break;
    path.unshift({ id: node.id, name: node.name });
    current = node.parentId;
  }
  return path;
}

function statusCopy(status: KaptenQuestionBank["status"]) {
  return status === "published" ? "Diterbitkan" : status === "archived" ? "Diarsipkan" : status === "scheduled" ? "Terjadwal" : "Draf";
}

function StatusPill({ status }: { status: KaptenQuestionBank["status"] }) {
  const tone = status === "published"
    ? "success"
    : status === "archived"
      ? "neutral"
      : status === "scheduled"
        ? "info"
        : "attention";

  return <MentorBadge size="sm" tone={tone}>{statusCopy(status)}</MentorBadge>;
}

function QuestionBankCatalogueFilterPanel({
  categories,
  navigateCatalogue,
  resetPage,
  selectedCategories,
  selectedSubjects,
  setSelectedCategories,
  setSelectedSubjects,
  setStatusFilter,
  statusFilter,
}: {
  categories: CategoryNode[];
  navigateCatalogue: (next?: { categories?: string[]; folder?: FolderSelection; page?: number; query?: string; sort?: BankSortMode; status?: string; subjects?: string[] }) => void;
  resetPage: () => void;
  selectedCategories: string[];
  selectedSubjects: string[];
  setSelectedCategories: (categories: string[]) => void;
  setSelectedSubjects: (subjects: string[]) => void;
  setStatusFilter: (status: string) => void;
  statusFilter: string;
}) {
  const selectedSubjectsSet = new Set(selectedSubjects);
  const selectedCategoriesSet = new Set(selectedCategories);

  return (
    <div className="space-y-4 p-1">
      <fieldset className="space-y-2">
        <legend className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Subject</legend>
        <div className="space-y-1">
          {kaptenSubjects.map((subject) => (
            <label className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "min-h-9 rounded-lg px-2 py-2 text-sm text-secondary-700 hover:bg-primary-50/60 has-[:checked]:border-primary-500/65 has-[:checked]:bg-primary-50")} key={subject.code}>
              <input checked={selectedSubjectsSet.has(subject.code)} className="size-4 accent-primary-700" onChange={(event) => { const next = event.target.checked ? [...selectedSubjects, subject.code] : selectedSubjects.filter((code) => code !== subject.code); setSelectedSubjects(next); resetPage(); navigateCatalogue({ page: 1, subjects: next }); }} type="checkbox" />
              <span>{subject.code} · {subject.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Kategori</legend>
        <div className="space-y-1">
          {categories.length ? categories.map((category) => (
            <label className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "min-h-9 rounded-lg px-2 py-2 text-sm text-secondary-700 hover:bg-primary-50/60 has-[:checked]:border-primary-500/65 has-[:checked]:bg-primary-50")} key={category.id}>
              <input checked={selectedCategoriesSet.has(category.id)} className="size-4 accent-primary-700" onChange={(event) => { const next = event.target.checked ? [...selectedCategories, category.id] : selectedCategories.filter((id) => id !== category.id); setSelectedCategories(next); resetPage(); navigateCatalogue({ categories: next, page: 1 }); }} type="checkbox" />
              <span>{category.name}</span>
            </label>
          )) : <p className="px-2 text-sm text-secondary-500">Belum ada kategori bersama.</p>}
        </div>
      </fieldset>
      <label className={cn(REFERENCE_FIELD_LABEL_CLASS_NAME, "block space-y-2")} htmlFor="question-bank-status-filter">
        <span>Status</span>
        <select className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "appearance-auto font-normal tracking-normal")} id="question-bank-status-filter" onChange={(event) => { const next = event.target.value; setStatusFilter(next); resetPage(); navigateCatalogue({ page: 1, status: next }); }} value={statusFilter}>
          <option value="">Semua status</option>
          <option value="draft">Draf</option>
          <option value="published">Diterbitkan</option>
          <option value="archived">Diarsipkan</option>
          <option value="scheduled">Terjadwal</option>
        </select>
      </label>
    </div>
  );
}

function QuestionBankFolderDialog({
  flatFolders,
  folderDialog,
  folderError,
  folderName,
  folderParentId,
  folders,
  isApplying,
  onClose,
  onFolderNameChange,
  onFolderParentIdChange,
  onSubmit,
}: {
  flatFolders: Array<{ depth: number; folder: FolderNode }>;
  folderDialog: FolderDialogState;
  folderError: string | null;
  folderName: string;
  folderParentId: string | null;
  folders: FolderNode[];
  isApplying: boolean;
  onClose: () => void;
  onFolderNameChange: (name: string) => void;
  onFolderParentIdChange: (parentId: string | null) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog onOpenChange={(open) => { if (!open && !isApplying) onClose(); }} open={Boolean(folderDialog)}>
      <DialogContent className="sm:max-w-sm" pending={isApplying}>
        <DialogHeader>
          <DialogTitle>{folderDialog?.kind === "create" ? "Buat folder" : folderDialog?.kind === "rename" ? "Ubah nama folder" : "Pindahkan folder"}</DialogTitle>
        </DialogHeader>
        {folderDialog?.kind === "move" ? (
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="folder-parent">Folder induk</FieldLabel>
            <select aria-label="Folder induk" className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "appearance-auto px-3 font-normal")} id="folder-parent" onChange={(event) => onFolderParentIdChange(event.target.value || null)} value={folderParentId ?? ""}>
              <option value="">Tidak ada · root</option>
              {flatFolders.flatMap(({ depth, folder }) => {
                if (folder.id === null || folder.id === folderDialog.folderId || folderPath(folders, folder.id).some((item) => item.id === folderDialog.folderId)) return [];
                return [<option key={folder.id} value={folder.id ?? ""}>{"— ".repeat(depth)}{folder.name}</option>];
              })}
            </select>
          </Field>
        ) : (
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="folder-name">Nama folder</FieldLabel>
            <FieldInput autoFocus className={REFERENCE_CONTROL_CLASS_NAMES.input} id="folder-name" maxLength={160} onChange={(event) => onFolderNameChange(event.target.value)} value={folderName} />
          </Field>
        )}
        {folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{folderError}</p> : null}
        <DialogFooter>
          <Button disabled={isApplying} onClick={onClose} type="button" variant="brandOutline">Batal</Button>
          <Button disabled={isApplying || (folderDialog?.kind !== "move" && !folderName.trim())} onClick={onSubmit} type="button" variant="brand">{isApplying ? "Menyimpan…" : "Simpan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionBankMoveDialog({
  bankMoveId,
  flatFolders,
  folderError,
  folderParentId,
  isApplying,
  onClose,
  onFolderParentIdChange,
  onSubmit,
  selectedBank,
}: {
  bankMoveId: string | null;
  flatFolders: Array<{ depth: number; folder: FolderNode }>;
  folderError: string | null;
  folderParentId: string | null;
  isApplying: boolean;
  onClose: () => void;
  onFolderParentIdChange: (parentId: string | null) => void;
  onSubmit: () => void;
  selectedBank: BankEntry["bank"] | null;
}) {
  return (
    <Dialog onOpenChange={(open) => { if (!open && !isApplying) onClose(); }} open={Boolean(bankMoveId)}>
      <DialogContent className="sm:max-w-sm" pending={isApplying}>
        <DialogHeader>
          <DialogTitle>Pindahkan bank</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="bank-folder">Folder tujuan</FieldLabel>
          <select aria-label="Folder tujuan" className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "appearance-auto px-3 font-normal")} id="bank-folder" onChange={(event) => onFolderParentIdChange(event.target.value || null)} value={folderParentId ?? selectedBank?.folderId ?? ""}>
            <option value="">Belum ditempatkan</option>
            {flatFolders.flatMap(({ depth, folder }) => folder.id !== null ? [<option key={folder.id} value={folder.id ?? ""}>{"— ".repeat(depth)}{folder.name}</option>] : [])}
          </select>
        </Field>
        {folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{folderError}</p> : null}
        <DialogFooter>
          <Button disabled={isApplying} onClick={onClose} type="button" variant="brandOutline">Batal</Button>
          <Button disabled={isApplying} onClick={onSubmit} type="button" variant="brand">{isApplying ? "Memindahkan…" : "Pindahkan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionBankCategorySelectionDialog({
  bankCategoryId,
  bankCategorySelection,
  categories,
  folderError,
  isApplying,
  onClose,
  onSelectionChange,
  onSubmit,
}: {
  bankCategoryId: string | null;
  bankCategorySelection: string[];
  categories: CategoryNode[];
  folderError: string | null;
  isApplying: boolean;
  onClose: () => void;
  onSelectionChange: (selection: string[]) => void;
  onSubmit: () => void;
}) {
  const selectionSet = new Set(bankCategorySelection);

  return (
    <Dialog onOpenChange={(open) => { if (!open && !isApplying) onClose(); }} open={Boolean(bankCategoryId)}>
      <DialogContent className="sm:max-w-sm" pending={isApplying}>
        <DialogHeader>
          <DialogTitle>Kelola kategori</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {categories.length ? categories.map((category) => (
            <label className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "px-3 text-sm text-secondary-700 hover:bg-primary-50/60 has-[:checked]:border-primary-500/65 has-[:checked]:bg-primary-50")} key={category.id}>
              <input checked={selectionSet.has(category.id)} className="size-4 accent-primary-700" onChange={(event) => onSelectionChange(event.target.checked ? [...bankCategorySelection, category.id] : bankCategorySelection.filter((id) => id !== category.id))} type="checkbox" />
              {category.name}
            </label>
          )) : <p className="text-sm text-secondary-500">Belum ada kategori. Buat dari menu kategori.</p>}
        </div>
        {folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{folderError}</p> : null}
        <DialogFooter>
          <Button disabled={isApplying} onClick={onClose} type="button" variant="brandOutline">Batal</Button>
          <Button disabled={isApplying} onClick={onSubmit} type="button" variant="brand">{isApplying ? "Menyimpan…" : "Simpan kategori"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionBankCategoryManagementDialog({
  categories,
  categoryEditor,
  categoryManagementOpen,
  categoryName,
  folderError,
  handleCategoryEditorKeyDown,
  isApplying,
  onCancelCategoryEditor,
  onCategoryNameChange,
  onClose,
  onOpenCategoryCreate,
  onOpenCategoryRename,
  onRemoveCategory,
  onSubmitCategoryEditor,
}: {
  categories: CategoryNode[];
  categoryEditor: CategoryEditorState;
  categoryManagementOpen: boolean;
  categoryName: string;
  folderError: string | null;
  handleCategoryEditorKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  isApplying: boolean;
  onCancelCategoryEditor: () => void;
  onCategoryNameChange: (name: string) => void;
  onClose: () => void;
  onOpenCategoryCreate: () => void;
  onOpenCategoryRename: (category: CategoryNode) => void;
  onRemoveCategory: (category: CategoryNode) => void;
  onSubmitCategoryEditor: () => void;
}) {
  return (
    <Dialog onOpenChange={(open) => { if (!open && !isApplying) onClose(); }} open={categoryManagementOpen}>
      <DialogContent className="sm:max-w-lg" pending={isApplying}>
        <DialogHeader>
          <DialogTitle>Kelola kategori bersama</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary-500">Kategori</p>
          <Button disabled={Boolean(categoryEditor)} onClick={onOpenCategoryCreate} size="sm" type="button" variant="brandOutline"><Plus />Buat kategori</Button>
        </div>
        <div className="grid gap-2">
          {categoryEditor?.kind === "create" ? (
            <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-primary-200 bg-primary-50/40 p-1">
              <Field className="min-w-0 flex-1">
                <FieldLabel className="sr-only" htmlFor="category-name">Nama kategori baru</FieldLabel>
                <FieldInput autoFocus className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "min-h-0 h-10 rounded-xl px-3 py-2 text-sm")} id="category-name" maxLength={120} onChange={(event) => onCategoryNameChange(event.target.value)} onKeyDown={handleCategoryEditorKeyDown} placeholder="Nama kategori" value={categoryName} />
              </Field>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <Button disabled={isApplying} onClick={onCancelCategoryEditor} size="sm" type="button" variant="brandOutline">Batal</Button>
                <Button disabled={isApplying || !categoryName.trim()} onClick={onSubmitCategoryEditor} size="sm" type="button" variant="brand">{isApplying ? "Menyimpan…" : "Simpan"}</Button>
              </div>
            </div>
          ) : null}
          {categories.map((category) => categoryEditor?.kind === "rename" && categoryEditor.categoryId === category.id ? (
            <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-primary-200 bg-primary-50/40 p-1" key={category.id}>
              <Field className="min-w-0 flex-1">
                <FieldLabel className="sr-only" htmlFor={`category-name-${category.id}`}>Nama kategori</FieldLabel>
                <FieldInput autoFocus className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "min-h-0 h-10 rounded-xl px-3 py-2 text-sm")} id={`category-name-${category.id}`} maxLength={120} onChange={(event) => onCategoryNameChange(event.target.value)} onKeyDown={handleCategoryEditorKeyDown} value={categoryName} />
              </Field>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <Button disabled={isApplying} onClick={onCancelCategoryEditor} size="sm" type="button" variant="brandOutline">Batal</Button>
                <Button disabled={isApplying || !categoryName.trim()} onClick={onSubmitCategoryEditor} size="sm" type="button" variant="brand">{isApplying ? "Menyimpan…" : "Simpan"}</Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-11 items-center gap-2 rounded-2xl border border-primary-100 px-3" key={category.id}>
              <span className="min-w-0 flex-1 truncate text-sm text-secondary-700">{category.name}</span>
              <span className="text-xs text-secondary-400">{category.bankCount}</span>
              <Button aria-label={`Ubah kategori ${category.name}`} disabled={Boolean(categoryEditor) || isApplying} onClick={() => onOpenCategoryRename(category)} size="icon-sm" type="button" variant="ghost"><Pencil /></Button>
              <Button aria-label={`Hapus kategori ${category.name}`} disabled={Boolean(categoryEditor) || isApplying} onClick={() => onRemoveCategory(category)} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
            </div>
          ))}
          {!categories.length && categoryEditor?.kind !== "create" ? <p className="rounded-2xl bg-primary-50/50 px-3 py-4 text-sm text-secondary-500">Belum ada kategori bersama.</p> : null}
        </div>
        {folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{folderError}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

function QuestionBankLifecycleConfirmationDialog({
  folderError,
  isApplying,
  lifecycleCopy,
  lifecycleError,
  onCancel,
  onConfirm,
  onOpenChange,
  open,
  pendingConfirmation,
}: {
  folderError: string | null;
  isApplying: boolean;
  lifecycleCopy: [string, string, string];
  lifecycleError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pendingConfirmation: ConfirmationState;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent pending={isApplying} size="sm" variant={pendingConfirmation ? "danger" : lifecycleCopy[0].includes("Arsipkan") ? "warning" : "info"}>
        <AlertDialogHeader>
          <AlertDialogMedia variant={pendingConfirmation ? "danger" : lifecycleCopy[0].includes("Arsipkan") ? "warning" : "info"}><CircleHelp /></AlertDialogMedia>
          <AlertDialogTitle>{pendingConfirmation?.title ?? lifecycleCopy[0]}</AlertDialogTitle>
          <AlertDialogDescription>{pendingConfirmation?.description ?? lifecycleCopy[1]}</AlertDialogDescription>
        </AlertDialogHeader>
        {lifecycleError || folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{lifecycleError ?? folderError}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isApplying} onClick={onCancel}>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={isApplying} onClick={onConfirm} variant={pendingConfirmation ? "destructive" : "brand"}>
            {isApplying ? "Memproses…" : pendingConfirmation?.label ?? lifecycleCopy[2]}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function useQuestionBankCatalogueState({
  initialCategories,
  initialEntries,
  initialFolderTree,
  initialPage = 1,
  initialPageSize = BANKS_PER_PAGE,
  initialSearch = "",
  initialSelectedCategories = [],
  initialSelectedFolder = ROOT_FOLDER,
  initialSelectedSubjects = [],
  initialSort = "updated",
  initialStatusFilter = "",
  initialTotal,
}: {
  initialCategories: CategoryNode[];
  initialEntries: BankEntry[];
  initialFolderTree: FolderNode[];
  initialPage?: number;
  initialPageSize?: number;
  initialSearch?: string;
  initialSelectedCategories?: string[];
  initialSelectedFolder?: FolderSelection;
  initialSelectedSubjects?: string[];
  initialSort?: BankSortMode;
  initialStatusFilter?: string;
  initialTotal: number;
}) {
  const router = useRouter();
  const [isCataloguePending, startCatalogueTransition] = useTransition();
  const [entries, setEntries] = useState(initialEntries);
  const [folders, setFolders] = useState(initialFolderTree);
  const [categories, setCategories] = useState(initialCategories);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>(initialSelectedFolder);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialSelectedCategories);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(initialSelectedSubjects);
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [page, setPage] = useState(initialPage);
  const [pendingLifecycle, setPendingLifecycle] = useState<{ action: LifecycleAction; bank: BankEntry["bank"] } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationState>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  const [folderName, setFolderName] = useState("");
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [bankMoveId, setBankMoveId] = useState<string | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryManagementOpen, setCategoryManagementOpen] = useState(false);
  const [bankCategoryId, setBankCategoryId] = useState<string | null>(null);
  const [bankCategorySelection, setBankCategorySelection] = useState<string[]>([]);

  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);
  const currentFolder = selectedFolder !== ROOT_FOLDER && selectedFolder !== null ? findFolder(folders, selectedFolder) : selectedFolder === null ? findFolder(folders, null) : null;
  const currentPath = selectedFolder === ROOT_FOLDER ? [{ id: null, name: "Bank soal" }] : [{ id: null, name: "Bank soal" }, ...(selectedFolder === null ? [{ id: null, name: "Belum ditempatkan" }] : folderPath(folders, selectedFolder))];
  const folderCreateParentId = selectedFolder === ROOT_FOLDER || selectedFolder === null ? null : selectedFolder;
  const folderCreateLabel = selectedFolder === ROOT_FOLDER || selectedFolder === null ? "Buat folder" : "Buat subfolder";
  const totalPages = Math.max(1, Math.ceil(initialTotal / initialPageSize));
  const visiblePage = Math.min(page, totalPages);
  const isGlobalSearch = Boolean(initialSearch.trim());
  const childFolders = selectedFolder === ROOT_FOLDER
    ? folders.filter((folder) => folder.id !== null)
    : selectedFolder && currentFolder
      ? currentFolder.children ?? []
      : [];
  const selectedBank = bankMoveId ? entries.find(({ bank }) => bank.id === bankMoveId)?.bank ?? null : null;
  const categoryBank = bankCategoryId ? entries.find(({ bank }) => bank.id === bankCategoryId)?.bank ?? null : null;

  function navigateCatalogue(next: { categories?: string[]; folder?: FolderSelection; page?: number; query?: string; sort?: BankSortMode; status?: string; subjects?: string[] } = {}) {
    const nextCategories = next.categories ?? selectedCategories;
    const nextFolder = next.folder ?? selectedFolder;
    const nextQuery = next.query ?? initialSearch;
    const nextSort = next.sort ?? initialSort;
    const nextStatus = next.status ?? statusFilter;
    const nextSubjects = next.subjects ?? selectedSubjects;
    const nextPage = next.page ?? 1;
    startCatalogueTransition(() => {
      router.push(questionBankHref({ categories: nextCategories, folder: nextFolder, page: nextPage, query: nextQuery, sort: nextSort, status: nextStatus, subjects: nextSubjects }));
    });
  }
  function resetPage() { setPage(1); }
  function refreshFromServer() {
    startCatalogueTransition(() => router.refresh());
  }
  function openFolderCreate(parentId: string | null) { setFolderError(null); setFolderName(""); setFolderParentId(parentId); setFolderDialog({ kind: "create" }); }
  function openFolderManage(folder: FolderNode, kind: "move" | "rename" | "remove") {
    if (kind === "remove") {
      setPendingConfirmation({ description: "Bank di dalam folder akan dipindahkan ke tingkat induknya. Subfolder juga akan dinaikkan satu tingkat.", label: "Hapus folder", onConfirm: () => void removeFolderFromServer(folder), title: `Hapus folder “${folder.name}”?` });
      return;
    }
    setFolderError(null);
    setFolderName(folder.name);
    setFolderParentId(folder.parentId);
    setFolderDialog({ folderId: folder.id ?? undefined, kind });
  }
  async function removeFolderFromServer(folder: FolderNode) {
    setIsApplying(true);
    setFolderError(null);
    try {
      const result = await removeQuestionBankFolderAction(folder.id ?? "", { expectedUpdatedAt: folder.updatedAt });
      if (!result.ok) { setFolderError(result.message); return; }
      const removedId = folder.id ?? "";
      const nextFolders = updateFolderBankCount(removeFolder(folders, removedId), folder.parentId, folder.bankCount);
      setFolders(nextFolders);
      setEntries((current) => current.map((entry) => {
        const nextFolderId = entry.bank.folderId === folder.id ? folder.parentId : entry.bank.folderId;
        return { ...entry, bank: { ...entry.bank, folder: folderReference(nextFolders, nextFolderId), folderId: nextFolderId, folderPath: folderPath(nextFolders, nextFolderId) } };
      }));
      if (selectedFolder === folder.id) setSelectedFolder(folder.parentId);
      setPendingConfirmation(null);
      refreshFromServer();
    } finally { setIsApplying(false); }
  }
  async function submitFolderDialog() {
    if (!folderDialog || isApplying) return;
    setIsApplying(true); setFolderError(null);
    try {
      if (folderDialog.kind === "create") {
        const result = await createQuestionBankFolderAction({ name: folderName, parentId: folderParentId });
        if (!result.ok) { setFolderError(result.message); return; }
        setFolders((current) => insertFolder(current, { ...result.result, id: result.result.id, children: undefined }));
      } else if (folderDialog.kind === "rename") {
        const folder = findFolder(folders, folderDialog.folderId ?? null);
        const result = await renameQuestionBankFolderAction(folderDialog.folderId ?? "", folderName, { expectedUpdatedAt: folder?.updatedAt });
        if (!result.ok) { setFolderError(result.message); return; }
        const renamedId = result.result.id;
        if (!renamedId) return;
        const nextFolders = updateFolder(folders, renamedId, (item) => ({ ...item, ...result.result }));
        setFolders(nextFolders);
        setEntries((current) => current.map((entry) => ({
          ...entry,
          bank: {
            ...entry.bank,
            folder: folderReference(nextFolders, entry.bank.folderId),
            folderPath: folderPath(nextFolders, entry.bank.folderId),
          },
        })));
      } else {
        const folder = findFolder(folders, folderDialog.folderId ?? null);
        const result = await moveQuestionBankFolderAction(folderDialog.folderId ?? "", folderParentId, { expectedUpdatedAt: folder?.updatedAt });
        if (!result.ok) { setFolderError(result.message); return; }
        const movedId = result.result.id;
        if (!movedId) return;
        const nextFolders = moveFolder(folders, movedId, result.result.parentId);
        setFolders(nextFolders);
        setEntries((current) => current.map((entry) => ({ ...entry, bank: { ...entry.bank, folderPath: folderPath(nextFolders, entry.bank.folderId) } })));
      }
      setFolderDialog(null); refreshFromServer();
    } finally { setIsApplying(false); }
  }
  function openMoveBank(bankId: string) { setFolderError(null); setBankMoveId(bankId); }
  async function moveBankToFolder() {
    if (!bankMoveId || isApplying) return;
    setIsApplying(true); setFolderError(null);
    try {
      const bank = selectedBank;
      if (!bank) { setFolderError("Bank Soal tidak ditemukan. Muat ulang halaman lalu coba lagi."); return; }
      const result = await moveQuestionBanksToFolderAction([bankMoveId], folderParentId, { expected: { [bankMoveId]: { expectedRevision: bank.revision, expectedUpdatedAt: bank.updatedAt } } });
      if (!result.ok) { setFolderError(result.message); return; }
      const sourceFolderId = selectedBank?.folderId ?? null;
      const nextFolders = moveFolderBankCount(folders, sourceFolderId, folderParentId);
      setFolders(nextFolders);
      const version = result.result.versions.find((item) => item.id === bankMoveId);
      setEntries((current) => current.map((entry) => entry.bank.id === bankMoveId ? { ...entry, bank: { ...entry.bank, folderId: folderParentId, folder: folderReference(nextFolders, folderParentId), folderPath: folderPath(nextFolders, folderParentId), ...(version ? { revision: version.revision, updatedAt: version.updatedAt } : {}) } } : entry));
      setBankMoveId(null); refreshFromServer();
    } finally { setIsApplying(false); }
  }
  function openBankCategories(bank: BankEntry["bank"]) { setBankCategoryId(bank.id); setBankCategorySelection(bank.categoryIds ?? []); setFolderError(null); }
  async function saveBankCategories() {
    if (!bankCategoryId || isApplying) return;
    setIsApplying(true); setFolderError(null);
    try {
      const bank = categoryBank;
      if (!bank) { setFolderError("Bank Soal tidak ditemukan. Muat ulang halaman lalu coba lagi."); return; }
      const result = await setQuestionBankCategoriesAction(bankCategoryId, bankCategorySelection, { expectedRevision: bank.revision, expectedUpdatedAt: bank.updatedAt });
      if (!result.ok) { setFolderError(result.message); return; }
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
      const newCategories = bankCategorySelection.flatMap((id) => {
        const name = categoryMap.get(id);
        return name ? [{ id, name }] : [];
      });
      setEntries((current) => current.map((entry) => entry.bank.id === bankCategoryId ? { ...entry, bank: { ...entry.bank, categories: newCategories, categoryIds: bankCategorySelection, revision: result.result.revision, updatedAt: result.result.updatedAt } } : entry));
      setBankCategoryId(null); refreshFromServer();
    } finally { setIsApplying(false); }
  }
  function openCategoryCreate() { setCategoryName(""); setFolderError(null); setCategoryEditor({ categoryId: "", kind: "create" }); }
  function openCategoryRename(category: CategoryNode) { setCategoryName(category.name); setFolderError(null); setCategoryEditor({ categoryId: category.id, kind: "rename" }); }
  function cancelCategoryEditor() { setCategoryEditor(null); setCategoryName(""); setFolderError(null); }
  function handleCategoryEditorKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void submitCategoryEditor();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelCategoryEditor();
    }
  }
  async function submitCategoryEditor() {
    if (!categoryEditor || isApplying || !categoryName.trim()) return;
    setIsApplying(true); setFolderError(null);
    try {
      if (categoryEditor.kind === "create") {
        const result = await createQuestionBankCategoryAction(categoryName.trim());
        if (!result.ok) { setFolderError(result.message); return; }
        setCategories((current) => [...current, result.result].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
      } else {
        const category = categories.find((item) => item.id === categoryEditor.categoryId);
        const result = await renameQuestionBankCategoryAction(categoryEditor.categoryId ?? "", categoryName.trim(), { expectedUpdatedAt: category?.updatedAt });
        if (!result.ok) { setFolderError(result.message); return; }
        setCategories((current) => current.map((item) => item.id === result.result.id ? result.result : item));
        setEntries((current) => current.map((entry) => ({ ...entry, bank: { ...entry.bank, categories: entry.bank.categories.map((item) => item.id === result.result.id ? { id: item.id, name: result.result.name } : item) } })));
      }
      setCategoryEditor(null); setCategoryName(""); refreshFromServer();
    } finally { setIsApplying(false); }
  }
  async function removeCategory(category: CategoryNode) {
    setPendingConfirmation({ description: "Kategori akan dilepas dari semua bank. Isi bank dan snapshot yang sudah ada tidak berubah.", label: "Hapus kategori", onConfirm: () => void (async () => { setIsApplying(true); try { const result = await removeQuestionBankCategoryAction(category.id, { expectedUpdatedAt: category.updatedAt }); if (!result.ok) { setFolderError(result.message); return; } setCategories((current) => current.filter((item) => item.id !== category.id)); setEntries((current) => current.map((entry) => ({ ...entry, bank: { ...entry.bank, categoryIds: entry.bank.categoryIds.filter((id) => id !== category.id), categories: entry.bank.categories.filter((item) => item.id !== category.id) } }))); setPendingConfirmation(null); refreshFromServer(); } finally { setIsApplying(false); } })(), title: `Hapus kategori “${category.name}”?` });
  }
  async function applyLifecycle() {
    if (!pendingLifecycle || isApplying) return;
    setIsApplying(true); setLifecycleError(null);
    try {
      const result = await updateQuestionBankLifecycleAction(pendingLifecycle.bank.id, pendingLifecycle.action, { expectedRevision: pendingLifecycle.bank.revision ?? 1 });
      if (!result.ok) { setLifecycleError(result.message); return; }
      setEntries((current) => current.map((entry) => entry.bank.id === pendingLifecycle.bank.id ? { ...entry, bank: { ...entry.bank, revision: result.result.revision, status: result.result.status } } : entry));
      setPendingLifecycle(null); refreshFromServer();
    } finally { setIsApplying(false); }
  }

  const catalogueRows: QuestionBankCatalogueRow[] = [
    ...childFolders.map((folder): QuestionBankCatalogueRow => ({ folder, kind: "folder" })),
    ...entries.map(({ bank }): QuestionBankCatalogueRow => ({ bank, kind: "bank" })),
  ];

  const catalogueColumns: DataTableColumn<QuestionBankCatalogueRow>[] = [
    {
      cell: (row) => row.kind === "folder" ? (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700"><Folder className="size-4" /></span>
            <div className="min-w-0">
              <button className="block truncate font-semibold text-secondary-900 hover:text-primary-800 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200" onClick={() => { setSelectedFolder(row.folder.id); resetPage(); navigateCatalogue({ folder: row.folder.id, page: 1 }); }} type="button">{row.folder.name}</button>
              <p className="mt-0.5 block truncate text-xs text-secondary-500">{row.folder.bankCount} bank{row.folder.children?.length ? ` · ${row.folder.children.length} subfolder` : ""}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700"><LibraryBig aria-hidden="true" className="size-4" /></span>
            <div className="min-w-0">
              <Link className="block truncate font-semibold text-secondary-900 hover:text-primary-800 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200" href={row.bank.href}>{row.bank.title}</Link>
              <p className="mt-0.5 block truncate text-xs text-secondary-500">{row.bank.questionCount} soal</p>
            </div>
          </div>
        </div>
      ),
      headerClassName: "min-w-[18rem]",
      hideable: false,
      id: "name",
      label: "Nama",
      width: 34,
    },
    {
      cell: (row) => row.kind === "folder" ? <span className="text-sm text-secondary-400">—</span> : (
        <div className="flex max-h-14 min-w-0 max-w-full flex-wrap content-start items-start gap-1.5 overflow-hidden" title={row.bank.subjectCoverage.join(" · ")}>
          {row.bank.subjectCoverage.length ? row.bank.subjectCoverage.map((subject) => <MentorBadge className="min-w-0 max-w-[8rem] shrink-0 truncate" key={subject} size="compact" tone="category">{subject}</MentorBadge>) : <span className="text-sm text-secondary-400">—</span>}
        </div>
      ),
      headerClassName: "min-w-[9rem]",
      id: "subject",
      label: "Subject",
      width: 22,
    },
    {
      cell: (row) => row.kind === "folder" ? <span className="text-sm text-secondary-400">—</span> : (
        <div className="flex max-h-14 min-w-0 max-w-full flex-wrap content-start items-start gap-1.5 overflow-hidden" title={row.bank.categories.map((category) => category.name).join(" · ")}>
          {row.bank.categories.length ? row.bank.categories.map((category) => <MentorBadge className="min-w-0 max-w-[10rem] shrink-0 truncate" key={category.id} size="compact" tone="category">{category.name}</MentorBadge>) : <span className="text-sm text-secondary-400">—</span>}
        </div>
      ),
      headerClassName: "min-w-[10rem]",
      id: "category",
      label: "Kategori",
      width: 24,
    },
    {
      cell: (row) => row.kind === "folder" ? <span className="text-sm text-secondary-400">—</span> : <StatusPill status={row.bank.status} />,
      headerClassName: "min-w-[7rem]",
      id: "status",
      label: "Status",
      width: 13,
    },
  ];

  const catalogueRowContextMenu = (row: QuestionBankCatalogueRow) => row.kind === "folder" ? (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onClick={() => openFolderManage(row.folder, "rename")}><Pencil />Ubah nama</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => openFolderManage(row.folder, "remove")} variant="destructive"><Trash2 />Hapus folder</ContextMenuItem>
    </ContextMenuContent>
  ) : (
    <ContextMenuContent className="w-52">
      <ContextMenuItem onClick={() => router.push(row.bank.href)}><Pencil />Edit bank soal</ContextMenuItem>
      <ContextMenuItem disabled={row.bank.status === "archived"} onClick={() => openBankCategories(row.bank)}><Tag />Kelola kategori</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        {row.bank.status === "draft" ? <ContextMenuItem onClick={() => { setLifecycleError(null); setPendingLifecycle({ action: "publish", bank: row.bank }); }}><Upload />Terbitkan</ContextMenuItem> : null}
        {row.bank.status === "published" ? <ContextMenuItem onClick={() => { setLifecycleError(null); setPendingLifecycle({ action: "unpublish", bank: row.bank }); }}><FilePenLine />Jadikan draf</ContextMenuItem> : null}
        {row.bank.status !== "archived" ? <ContextMenuItem onClick={() => { setLifecycleError(null); setPendingLifecycle({ action: "archive", bank: row.bank }); }}><Archive />Arsipkan</ContextMenuItem> : <ContextMenuItem onClick={() => { setLifecycleError(null); setPendingLifecycle({ action: "restore", bank: row.bank }); }}><Upload />Pulihkan</ContextMenuItem>}
      </ContextMenuGroup>
    </ContextMenuContent>
  );

  const activeFilters: DataTableFilter[] = [
    ...(selectedSubjects.length ? [{ href: questionBankHref({ categories: selectedCategories, folder: selectedFolder, page: 1, query: initialSearch, sort: initialSort, status: statusFilter }), id: "subjects", label: "Subject", value: selectedSubjects.join(", ") }] : []),
    ...(selectedCategories.length ? [{ href: questionBankHref({ folder: selectedFolder, page: 1, query: initialSearch, sort: initialSort, status: statusFilter, subjects: selectedSubjects }), id: "categories", label: "Kategori", value: `${selectedCategories.length} dipilih` }] : []),
    ...(statusFilter ? [{ href: questionBankHref({ categories: selectedCategories, folder: selectedFolder, page: 1, query: initialSearch, sort: initialSort, subjects: selectedSubjects }), id: "status", label: "Status", value: statusCopy(statusFilter as KaptenQuestionBank["status"]) }] : []),
  ];
  const clearFiltersHref = questionBankHref({ folder: selectedFolder, page: 1, sort: initialSort });
  const folderBreadcrumb = (
    <nav aria-label="Breadcrumb folder" className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-secondary-500">
      {currentPath.map((item, index) => (
        <span className="flex shrink-0 items-center gap-1" key={`${item.id ?? "root"}-${item.name}`}>
          <button className={cn("rounded-lg px-1.5 py-1 hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200", index === currentPath.length - 1 ? "font-semibold text-secondary-900" : "")} onClick={() => { const next = index === 0 ? ROOT_FOLDER : item.id; setSelectedFolder(next); resetPage(); navigateCatalogue({ folder: next, page: 1 }); }} type="button">{item.name}</button>
          {index < currentPath.length - 1 ? <ChevronRight className="size-3.5 text-secondary-300" /> : null}
        </span>
      ))}
    </nav>
  );
  const sortMenu = (
    <>
      <DropdownMenuLabel className="font-semibold text-secondary-900">Urutkan koleksi</DropdownMenuLabel>
      <DropdownMenuRadioGroup onValueChange={(value) => { resetPage(); navigateCatalogue({ page: 1, sort: value as BankSortMode }); }} value={initialSort}>
        <DropdownMenuRadioItem value="updated">Terbaru diperbarui</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="name">Nama A–Z</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="questions">Jumlah soal</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );

  return {
    activeFilters,
    applyLifecycle,
    bankCategoryId,
    bankCategorySelection,
    bankMoveId,
    cancelCategoryEditor,
    catalogueColumns,
    catalogueRowContextMenu,
    catalogueRows,
    categories,
    categoryEditor,
    categoryManagementOpen,
    categoryName,
    clearFiltersHref,
    currentFolder,
    flatFolders,
    folderBreadcrumb,
    folderCreateLabel,
    folderCreateParentId,
    folderDialog,
    folderError,
    folderName,
    folderParentId,
    folders,
    handleCategoryEditorKeyDown,
    isApplying,
    isCataloguePending,
    isGlobalSearch,
    lifecycleError,
    moveBankToFolder,
    navigateCatalogue,
    openCategoryCreate,
    openCategoryRename,
    openFolderCreate,
    openFolderManage,
    openMoveBank,
    pendingConfirmation,
    pendingLifecycle,
    removeCategory,
    resetPage,
    saveBankCategories,
    selectedBank,
    selectedCategories,
    selectedFolder,
    selectedSubjects,
    setBankCategoryId,
    setBankCategorySelection,
    setBankMoveId,
    setCategoryEditor,
    setCategoryManagementOpen,
    setCategoryName,
    setFolderDialog,
    setFolderError,
    setFolderName,
    setFolderParentId,
    setLifecycleError,
    setPage,
    setPendingConfirmation,
    setPendingLifecycle,
    setSelectedCategories,
    setSelectedFolder,
    setSelectedSubjects,
    setStatusFilter,
    sortMenu,
    statusFilter,
    submitCategoryEditor,
    submitFolderDialog,
    totalPages,
    visiblePage,
  };
}

function KaptenQuestionBankPageModule({
  initialCategories,
  initialEntries,
  initialFolderTree,
  initialPage = 1,
  initialPageSize = BANKS_PER_PAGE,
  initialSearch = "",
  initialSort = "updated",
  initialSelectedCategories = [],
  initialSelectedFolder = ROOT_FOLDER,
  initialSelectedSubjects = [],
  initialStatusFilter = "",
  initialTotal,
  session,
}: {
  initialCategories: CategoryNode[];
  initialEntries: BankEntry[];
  initialFolderTree: FolderNode[];
  initialPage?: number;
  initialPageSize?: number;
  initialSearch?: string;
  initialSort?: BankSortMode;
  initialSelectedCategories?: string[];
  initialSelectedFolder?: FolderSelection;
  initialSelectedSubjects?: string[];
  initialStatusFilter?: string;
  initialTotal: number;
  session: SessionContext;
}) {
  const {
    activeFilters,
    applyLifecycle,
    bankCategoryId,
    bankCategorySelection,
    bankMoveId,
    cancelCategoryEditor,
    catalogueColumns,
    catalogueRowContextMenu,
    catalogueRows,
    categories,
    categoryEditor,
    categoryManagementOpen,
    categoryName,
    clearFiltersHref,
    currentFolder,
    flatFolders,
    folderBreadcrumb,
    folderCreateLabel,
    folderCreateParentId,
    folderDialog,
    folderError,
    folderName,
    folderParentId,
    folders,
    handleCategoryEditorKeyDown,
    isApplying,
    isCataloguePending,
    isGlobalSearch,
    lifecycleError,
    moveBankToFolder,
    navigateCatalogue,
    openCategoryCreate,
    openCategoryRename,
    openFolderCreate,
    openFolderManage,
    pendingConfirmation,
    pendingLifecycle,
    removeCategory,
    resetPage,
    saveBankCategories,
    selectedBank,
    selectedCategories,
    selectedFolder,
    selectedSubjects,
    setBankCategoryId,
    setBankCategorySelection,
    setBankMoveId,
    setCategoryEditor,
    setCategoryManagementOpen,
    setCategoryName,
    setFolderDialog,
    setFolderError,
    setFolderName,
    setFolderParentId,
    setLifecycleError,
    setPage,
    setPendingConfirmation,
    setPendingLifecycle,
    setSelectedCategories,
    setSelectedSubjects,
    setStatusFilter,
    sortMenu,
    statusFilter,
    submitCategoryEditor,
    submitFolderDialog,
    totalPages,
    visiblePage,
  } = useQuestionBankCatalogueState({
    initialCategories,
    initialEntries,
    initialFolderTree,
    initialPage,
    initialPageSize,
    initialSearch,
    initialSelectedCategories,
    initialSelectedFolder,
    initialSelectedSubjects,
    initialSort,
    initialStatusFilter,
    initialTotal,
  });

  const lifecycleCopy = pendingLifecycle?.action === "publish" ? ["Terbitkan bank?", "Bank yang lengkap akan tersedia sebagai sumber baru.", "Terbitkan"] : pendingLifecycle?.action === "unpublish" ? ["Kembalikan ke draf?", "Bank tidak lagi tersedia sebagai sumber baru sampai diterbitkan lagi.", "Jadikan draf"] : pendingLifecycle?.action === "archive" ? ["Arsipkan bank?", "Bank disembunyikan dari sumber baru tanpa menghapus soal atau snapshot.", "Arsipkan"] : ["Pulihkan bank?", "Bank kembali sebagai draf dan dapat diatur lagi.", "Pulihkan"];

  return (
    <MentorWorkspaceShell activeLabel="Bank Soal" breadcrumbLabel="Bank Soal" contentElement="div" searchPlaceholder="Cari bank soal, folder, atau kategori..." session={session} showSearch={false} sidebarAppearance="reference">
      <div className="space-y-8">
        <ReferencePageHeader
          actions={(
            <>
              <Button aria-label="Kelola kategori bersama" onClick={() => setCategoryManagementOpen(true)} size="icon-sm" title="Kelola kategori bersama" type="button" variant="context"><Tag /></Button>
              <Button aria-label={folderCreateLabel} onClick={() => openFolderCreate(folderCreateParentId)} size="icon-sm" title={folderCreateLabel} type="button" variant="brandOutline"><FolderPlus /></Button>
              <Button aria-label="Tambah Soal" render={<Link href="/mentor/quiz/question-bank/create" />} size="sm" title="Tambah Soal" type="button" variant="brand"><Plus />Tambah Soal</Button>
            </>
          )}
          title="Bank Soal"
        />

        <div className="min-w-0">
          <MentorCatalogueTable
            breadcrumb={folderBreadcrumb}
            caption="Daftar folder dan bank soal"
            clearFiltersHref={clearFiltersHref}
            columns={catalogueColumns}
            emptyState={<div className="min-w-0 max-w-[calc(100vw-2rem)] whitespace-normal flex flex-col items-center py-2 text-center"><LibraryBig className="size-7 text-primary-300" /><h2 className="mt-3 font-semibold text-secondary-900">{isGlobalSearch ? "Tidak ada hasil pencarian" : "Belum ada item di lokasi ini"}</h2><p className="mt-1 text-sm font-normal leading-6 text-secondary-600">Buat bank soal atau folder baru untuk mulai mengisi ruang ini.</p>{!isGlobalSearch ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2"><Button nativeButton={false} render={<Link href="/mentor/quiz/question-bank/create" />} size="sm" type="button" variant="brand"><Plus />Buat bank soal</Button><Button onClick={() => openFolderCreate(folderCreateParentId)} size="sm" type="button" variant="brandOutline"><FolderPlus />{folderCreateLabel}</Button></div> : null}</div>}
            filterPanel={
              <QuestionBankCatalogueFilterPanel
                categories={categories}
                navigateCatalogue={navigateCatalogue}
                resetPage={resetPage}
                selectedCategories={selectedCategories}
                selectedSubjects={selectedSubjects}
                setSelectedCategories={setSelectedCategories}
                setSelectedSubjects={setSelectedSubjects}
                setStatusFilter={setStatusFilter}
                statusFilter={statusFilter}
              />
            }
            filters={activeFilters}
            getRowId={(row) => row.kind === "folder" ? `folder-${row.folder.id ?? row.folder.name}` : `bank-${row.bank.id}`}
            headerActions={selectedFolder !== ROOT_FOLDER && currentFolder?.id ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={`Kelola folder ${currentFolder.name}`} size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={() => openFolderManage(currentFolder, "rename")}><Pencil />Ubah nama</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => openFolderManage(currentFolder, "remove")} variant="destructive"><Trash2 />Hapus folder</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}
            isLoading={isCataloguePending}
            loadingLabel="Memuat bank soal…"
            moreMenu={sortMenu}
            rowContextMenu={catalogueRowContextMenu}
            rows={catalogueRows}
            search={{ action: "/mentor/quiz/question-bank", clearHref: questionBankHref({ categories: selectedCategories, folder: selectedFolder, page: 1, sort: initialSort, status: statusFilter, subjects: selectedSubjects }), hiddenFields: { ...(selectedFolder !== ROOT_FOLDER ? { folder: selectedFolder === null ? "unfiled" : selectedFolder } : {}), ...(selectedCategories.length ? { category: selectedCategories } : {}), ...(selectedSubjects.length ? { subtest: selectedSubjects } : {}), ...(statusFilter ? { status: statusFilter } : {}), ...(initialSort !== "updated" ? { sort: initialSort } : {}) }, label: "Cari bank soal", placeholder: "Cari judul, folder, subject, atau kategori…", value: initialSearch }}
            tableClassName="min-w-[760px]"
            wrapperClassName={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "min-w-0")}
          />
          {initialTotal ? <nav aria-label="Paginasi bank soal" className="flex items-center justify-center gap-2 pt-2"><Button aria-label="Halaman sebelumnya" disabled={visiblePage === 1} onClick={() => { const next = Math.max(1, visiblePage - 1); setPage(next); navigateCatalogue({ page: next }); }} size="icon-sm" type="button" variant="brandOutline"><ChevronRight className="rotate-180" /></Button><span className="text-sm text-secondary-500">Halaman {visiblePage} dari {totalPages}</span><Button aria-label="Halaman berikutnya" disabled={visiblePage === totalPages} onClick={() => { const next = Math.min(totalPages, visiblePage + 1); setPage(next); navigateCatalogue({ page: next }); }} size="icon-sm" type="button" variant="brandOutline"><ChevronRight /></Button></nav> : null}
        </div>
      </div>

      <QuestionBankFolderDialog
        flatFolders={flatFolders}
        folderDialog={folderDialog}
        folderError={folderError}
        folderName={folderName}
        folderParentId={folderParentId}
        folders={folders}
        isApplying={isApplying}
        onClose={() => { setFolderDialog(null); setFolderError(null); }}
        onFolderNameChange={setFolderName}
        onFolderParentIdChange={setFolderParentId}
        onSubmit={() => void submitFolderDialog()}
      />

      <QuestionBankMoveDialog
        bankMoveId={bankMoveId}
        flatFolders={flatFolders}
        folderError={folderError}
        folderParentId={folderParentId}
        isApplying={isApplying}
        onClose={() => { setBankMoveId(null); setFolderError(null); }}
        onFolderParentIdChange={setFolderParentId}
        onSubmit={() => void moveBankToFolder()}
        selectedBank={selectedBank}
      />

      <QuestionBankCategorySelectionDialog
        bankCategoryId={bankCategoryId}
        bankCategorySelection={bankCategorySelection}
        categories={categories}
        folderError={folderError}
        isApplying={isApplying}
        onClose={() => { setBankCategoryId(null); setFolderError(null); }}
        onSelectionChange={setBankCategorySelection}
        onSubmit={() => void saveBankCategories()}
      />

      <QuestionBankCategoryManagementDialog
        categories={categories}
        categoryEditor={categoryEditor}
        categoryManagementOpen={categoryManagementOpen}
        categoryName={categoryName}
        folderError={folderError}
        handleCategoryEditorKeyDown={handleCategoryEditorKeyDown}
        isApplying={isApplying}
        onCancelCategoryEditor={cancelCategoryEditor}
        onCategoryNameChange={setCategoryName}
        onClose={() => { setCategoryManagementOpen(false); setCategoryEditor(null); setCategoryName(""); setFolderError(null); }}
        onOpenCategoryCreate={openCategoryCreate}
        onOpenCategoryRename={openCategoryRename}
        onRemoveCategory={(cat) => void removeCategory(cat)}
        onSubmitCategoryEditor={() => void submitCategoryEditor()}
      />

      <QuestionBankLifecycleConfirmationDialog
        folderError={folderError}
        isApplying={isApplying}
        lifecycleCopy={lifecycleCopy as [string, string, string]}
        lifecycleError={lifecycleError}
        onCancel={() => { setPendingLifecycle(null); setPendingConfirmation(null); }}
        onConfirm={() => { if (pendingConfirmation) { pendingConfirmation.onConfirm(); } else { void applyLifecycle(); } }}
        onOpenChange={(open) => { if (!open && !isApplying) { setPendingLifecycle(null); setPendingConfirmation(null); setLifecycleError(null); } }}
        open={Boolean(pendingLifecycle || pendingConfirmation)}
        pendingConfirmation={pendingConfirmation}
      />
    </MentorWorkspaceShell>
  );
}

export { KaptenQuestionBankPageModule };

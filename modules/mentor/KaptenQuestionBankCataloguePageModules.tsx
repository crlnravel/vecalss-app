"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  Folder,
  FolderPlus,
  LibraryBig,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "@/lib/icons";
import {
  useMemo,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";

import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
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
import { Button } from "@/components/ui/button";
import type {
  DataTableColumn,
  DataTableFilter,
} from "@/components/ui/data-table";
import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { showToast } from "@/components/ui/toast";
import type { SessionContext } from "@/lib/auth/types";
import { questionBankNavigationLabel } from "@/lib/question-bank/purpose";
import { cn } from "@/lib/utils";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { MentorCatalogueTable } from "@/modules/mentor/components/mentor-catalogue-table";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  kaptenSubjects,
  type KaptenQuestionBank,
} from "@/modules/mentor/mock-data";
import {
  createQuestionBankFolderAction,
  moveQuestionBankFolderAction,
  moveQuestionBanksToFolderAction,
  removeQuestionBankFolderAction,
  renameQuestionBankFolderAction,
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
  purpose: QuestionBankPurpose;
  updatedAt: string;
};

type QuestionBankCatalogueRow =
  | { bank: BankEntry["bank"]; kind: "bank" }
  | { folder: FolderNode; kind: "folder" };

type FolderSelection = "root" | string | null;
type FolderDialogState = {
  kind: "create" | "move" | "rename";
  folderId?: string;
} | null;
type ConfirmationState = {
  description: string;
  label: string;
  onConfirm: () => void;
  title: string;
} | null;
type LifecycleAction = "archive" | "restore";
type BankSortMode = "updated" | "name" | "questions";
type QuestionBankPurpose = "quiz" | "tryout";

const BANKS_PER_PAGE = 25;
const ROOT_FOLDER = "root" as const;

type QuestionBankHrefOptions = {
  categories?: string[];
  folder?: FolderSelection;
  page?: number;
  purpose?: QuestionBankPurpose;
  query?: string;
  sort?: BankSortMode;
  status?: string;
  subjects?: string[];
};

function questionBankHref({
  categories = [],
  folder = ROOT_FOLDER,
  page = 1,
  purpose = "quiz",
  query = "",
  sort = "updated",
  status = "",
  subjects = [],
}: QuestionBankHrefOptions = {}) {
  const params = new URLSearchParams();
  params.set("purpose", purpose);
  if (query.trim()) params.set("q", query.trim());
  if (folder !== ROOT_FOLDER)
    params.set("folder", folder === null ? "unfiled" : folder);
  categories.forEach((id) => params.append("category", id));
  subjects.forEach((code) => params.append("subtest", code));
  if (status) params.set("status", status);
  if (sort !== "updated") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  return `/mentor/quiz/question-bank${params.toString() ? `?${params.toString()}` : ""}`;
}

function questionBankCreateHref({
  folder = ROOT_FOLDER,
  purpose = "quiz",
}: {
  folder?: FolderSelection;
  purpose?: QuestionBankPurpose;
} = {}) {
  const params = new URLSearchParams({ purpose });
  if (folder !== ROOT_FOLDER) {
    params.set("folder", folder === null ? "unfiled" : folder);
  }
  return `/mentor/quiz/question-bank/create?${params.toString()}`;
}

function flattenFolders(
  nodes: FolderNode[],
  depth = 0,
): Array<{ depth: number; folder: FolderNode }> {
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

function folderReference(
  nodes: FolderNode[],
  id: string | null,
): { id: string; name: string } | null {
  const folder = id ? findFolder(nodes, id) : null;
  return folder?.id ? { id: folder.id, name: folder.name } : null;
}

function updateFolder(
  nodes: FolderNode[],
  id: string,
  updater: (folder: FolderNode) => FolderNode,
): FolderNode[] {
  return nodes.map((folder) => {
    if (folder.id === id) return updater(folder);
    return folder.children
      ? { ...folder, children: updateFolder(folder.children, id, updater) }
      : folder;
  });
}

function updateFolderBankCount(
  nodes: FolderNode[],
  id: string | null,
  delta: number,
): FolderNode[] {
  return nodes.map((folder) => {
    const nextFolder =
      folder.id === id
        ? { ...folder, bankCount: Math.max(0, folder.bankCount + delta) }
        : folder;
    return nextFolder.children
      ? {
          ...nextFolder,
          children: updateFolderBankCount(nextFolder.children, id, delta),
        }
      : nextFolder;
  });
}

function moveFolderBankCount(
  nodes: FolderNode[],
  sourceId: string | null,
  targetId: string | null,
): FolderNode[] {
  if (sourceId === targetId) return nodes;
  return updateFolderBankCount(
    updateFolderBankCount(nodes, sourceId, -1),
    targetId,
    1,
  );
}

function removeFolder(nodes: FolderNode[], id: string): FolderNode[] {
  return nodes.flatMap((folder) => {
    if (folder.id === id) {
      return (folder.children ?? []).map((child) => ({
        ...child,
        parentId: folder.parentId,
      }));
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
      result.push(
        folder.children
          ? { ...folder, children: detachFolder(folder.children, id) }
          : folder,
      );
    }
  }
  return result;
}

function insertFolder(nodes: FolderNode[], folder: FolderNode): FolderNode[] {
  if (folder.parentId === null)
    return [...nodes, folder].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  return nodes.map((node) => {
    if (node.id === folder.parentId) {
      return {
        ...node,
        children: [...(node.children ?? []), folder].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
      };
    }
    return node.children
      ? { ...node, children: insertFolder(node.children, folder) }
      : node;
  });
}

function moveFolder(
  nodes: FolderNode[],
  id: string,
  parentId: string | null,
): FolderNode[] {
  const folder = findFolder(nodes, id);
  if (!folder) return nodes;
  const without = detachFolder(nodes, id);
  return insertFolder(without, { ...folder, parentId });
}

function folderPath(
  nodes: FolderNode[],
  id: string | null,
): Array<{ id: string | null; name: string }> {
  if (!id) return [{ id: null, name: "Belum ditempatkan" }];
  const flat = new Map(
    flattenFolders(nodes).map(({ folder }) => [folder.id, folder]),
  );
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
  return status === "archived" ? "Diarsipkan" : "Diterbitkan";
}

function StatusPill({ status }: { status: KaptenQuestionBank["status"] }) {
  const tone = status === "archived" ? "neutral" : "success";

  return (
    <MentorBadge size="sm" tone={tone}>
      {statusCopy(status)}
    </MentorBadge>
  );
}

function createQuestionBankCatalogueColumns({
  onOpenFolder,
}: {
  onOpenFolder: (folder: FolderNode) => void;
}): DataTableColumn<QuestionBankCatalogueRow>[] {
  return [
    {
      cell: (row) =>
        row.kind === "folder" ? (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700"
              >
                <Folder className="size-4" />
              </span>
              <div className="min-w-0">
                <button
                  className="block truncate font-semibold text-secondary-900 hover:text-primary-800 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200"
                  onClick={() => onOpenFolder(row.folder)}
                  type="button"
                >
                  {row.folder.name}
                </button>
                <p className="mt-0.5 block truncate text-xs text-secondary-500">
                  {row.folder.bankCount} bank
                  {row.folder.children?.length
                    ? ` · ${row.folder.children.length} subfolder`
                    : ""}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700"
              >
                <LibraryBig aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <Link
                  className="block truncate font-semibold text-secondary-900 hover:text-primary-800 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200"
                  href={row.bank.href}
                >
                  {row.bank.title}
                </Link>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                  <p className="block truncate text-xs text-secondary-500">
                    {row.bank.questionCount} soal
                  </p>
                  <span className="lg:hidden">
                    <StatusPill status={row.bank.status} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        ),
      headerClassName: "min-w-0 lg:min-w-[18rem]",
      id: "name",
      label: "Nama",
      width: 34,
    },
    {
      cell: (row) =>
        row.kind === "folder" ? (
          <span className="text-sm text-secondary-400">—</span>
        ) : (
          <div
            className="flex max-h-14 min-w-0 max-w-full flex-wrap content-start items-start gap-1.5 overflow-hidden"
            title={row.bank.subjectCoverage.join(" · ")}
          >
            {row.bank.subjectCoverage.length ? (
              row.bank.subjectCoverage.map((subject) => (
                <MentorBadge
                  className="min-w-0 max-w-[8rem] shrink-0 truncate"
                  key={subject}
                  size="compact"
                  tone="category"
                >
                  {subject}
                </MentorBadge>
              ))
            ) : (
              <span className="text-sm text-secondary-400">—</span>
            )}
          </div>
        ),
      cellClassName: "max-lg:hidden",
      headerClassName: "max-lg:hidden lg:min-w-[9rem]",
      id: "subject",
      label: "Subject",
      width: 22,
    },
    {
      cell: (row) =>
        row.kind === "folder" ? (
          <span className="text-sm text-secondary-400">—</span>
        ) : (
          <div
            className="flex max-h-14 min-w-0 max-w-full flex-wrap content-start items-start gap-1.5 overflow-hidden"
            title={(row.bank.materiCoverage ?? []).join(" · ")}
          >
            {(row.bank.materiCoverage ?? []).length ? (
              (row.bank.materiCoverage ?? []).map((materi) => (
                <MentorBadge
                  className="min-w-0 max-w-[12rem] shrink-0 truncate"
                  key={materi}
                  size="compact"
                  tone="category"
                >
                  {materi}
                </MentorBadge>
              ))
            ) : (
              <span className="text-sm text-secondary-400">—</span>
            )}
          </div>
        ),
      headerClassName: "min-w-0 lg:min-w-[16rem]",
      id: "materi",
      label: "Materi",
      width: 30,
    },
    {
      cell: (row) =>
        row.kind === "folder" ? (
          <span className="text-sm text-secondary-400">—</span>
        ) : (
          <StatusPill status={row.bank.status} />
        ),
      cellClassName: "max-lg:hidden",
      headerClassName: "max-lg:hidden lg:min-w-[7rem]",
      id: "status",
      label: "Status",
      width: 10,
    },
  ];
}

function QuestionBankCatalogueRowContextMenu({
  actions,
  row,
}: {
  actions: {
    onEditBank: (bank: BankEntry["bank"]) => void;
    onManageFolder: (
      folder: FolderNode,
      kind: "move" | "rename" | "remove",
    ) => void;
    onSetLifecycle: (bank: BankEntry["bank"], action: LifecycleAction) => void;
  };
  row: QuestionBankCatalogueRow;
}) {
  if (row.kind === "folder") {
    return (
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          onClick={() => actions.onManageFolder(row.folder, "rename")}
        >
          <Pencil />
          Ubah nama
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => actions.onManageFolder(row.folder, "remove")}
          variant="destructive"
        >
          <Trash2 />
          Hapus folder
        </ContextMenuItem>
      </ContextMenuContent>
    );
  }

  return (
    <ContextMenuContent className="w-52">
      <ContextMenuItem onClick={() => actions.onEditBank(row.bank)}>
        <Pencil />
        Edit bank soal
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        {row.bank.status !== "archived" ? (
          <ContextMenuItem
            onClick={() => actions.onSetLifecycle(row.bank, "archive")}
          >
            <Archive />
            Arsipkan
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            onClick={() => actions.onSetLifecycle(row.bank, "restore")}
          >
            <Upload />
            Pulihkan
          </ContextMenuItem>
        )}
      </ContextMenuGroup>
    </ContextMenuContent>
  );
}

function QuestionBankFolderBreadcrumb({
  currentPath,
  onSelect,
}: {
  currentPath: Array<{ id: string | null; name: string }>;
  onSelect: (item: { id: string | null; name: string }, index: number) => void;
}) {
  return (
    <nav
      aria-label="Breadcrumb folder"
      className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-secondary-500"
    >
      {currentPath.map((item, index) => (
        <span
          className="flex shrink-0 items-center gap-1"
          key={`${item.id ?? "root"}-${item.name}`}
        >
          <button
            className={cn(
              "rounded-lg px-1.5 py-1 hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200",
              index === currentPath.length - 1
                ? "font-semibold text-secondary-900"
                : "",
            )}
            onClick={() => onSelect(item, index)}
            type="button"
          >
            {item.name}
          </button>
          {index < currentPath.length - 1 ? (
            <ChevronRight className="size-3.5 text-secondary-300" />
          ) : null}
        </span>
      ))}
    </nav>
  );
}

function QuestionBankSortMenu({
  initialSort,
  onChange,
}: {
  initialSort: BankSortMode;
  onChange: (sort: BankSortMode) => void;
}) {
  return (
    <>
      <DropdownMenuLabel className="font-semibold text-secondary-900">
        Urutkan koleksi
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        onValueChange={(value) => onChange(value as BankSortMode)}
        value={initialSort}
      >
        <DropdownMenuRadioItem value="updated">
          Terbaru diperbarui
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="name">Nama A–Z</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="questions">
          Jumlah soal
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}

function getQuestionBankActiveFilters({
  initialPurpose,
  initialSearch,
  initialSort,
  selectedCategories,
  selectedFolder,
  selectedSubjects,
  statusFilter,
}: {
  initialPurpose: QuestionBankPurpose;
  initialSearch: string;
  initialSort: BankSortMode;
  selectedCategories: string[];
  selectedFolder: FolderSelection;
  selectedSubjects: string[];
  statusFilter: string;
}): DataTableFilter[] {
  return [
    ...(selectedSubjects.length
      ? [
          {
            href: questionBankHref({
              categories: selectedCategories,
              folder: selectedFolder,
              page: 1,
              purpose: initialPurpose,
              query: initialSearch,
              sort: initialSort,
              status: statusFilter,
            }),
            id: "subjects",
            label: "Subject",
            value: selectedSubjects.join(", "),
          },
        ]
      : []),
    ...(statusFilter
      ? [
          {
            href: questionBankHref({
              categories: selectedCategories,
              folder: selectedFolder,
              page: 1,
              purpose: initialPurpose,
              query: initialSearch,
              sort: initialSort,
              subjects: selectedSubjects,
            }),
            id: "status",
            label: "Status",
            value: statusCopy(statusFilter as KaptenQuestionBank["status"]),
          },
        ]
      : []),
  ];
}

function QuestionBankCatalogueFilterPanel({
  navigateCatalogue,
  resetPage,
  selectedSubjects,
  setSelectedSubjects,
  setStatusFilter,
  statusFilter,
}: {
  navigateCatalogue: (next?: {
    categories?: string[];
    folder?: FolderSelection;
    page?: number;
    query?: string;
    sort?: BankSortMode;
    status?: string;
    subjects?: string[];
  }) => void;
  resetPage: () => void;
  selectedSubjects: string[];
  setSelectedSubjects: (subjects: string[]) => void;
  setStatusFilter: (status: string) => void;
  statusFilter: string;
}) {
  const selectedSubjectsSet = new Set(selectedSubjects);

  return (
    <div className="space-y-4 p-1">
      <fieldset className="space-y-2">
        <legend className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Subject</legend>
        <div className="space-y-1">
          {kaptenSubjects.map((subject) => (
            <label
              className={cn(
                REFERENCE_CONTROL_CLASS_NAMES.choice,
                "min-h-9 rounded-lg px-2 py-2 text-sm text-secondary-700 hover:bg-primary-50/60 has-[:checked]:border-primary-500/65 has-[:checked]:bg-primary-50",
              )}
              key={subject.code}
            >
              <input
                checked={selectedSubjectsSet.has(subject.code)}
                className="size-4 accent-primary-700"
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selectedSubjects, subject.code]
                    : selectedSubjects.filter((code) => code !== subject.code);
                  setSelectedSubjects(next);
                  resetPage();
                  navigateCatalogue({ page: 1, subjects: next });
                }}
                type="checkbox"
              />
              <span>
                {subject.code} · {subject.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label
        className={cn(REFERENCE_FIELD_LABEL_CLASS_NAME, "block space-y-2")}
        htmlFor="question-bank-status-filter"
      >
        <span>Status</span>
        <ReferenceSelect
          className="font-normal tracking-normal"
          id="question-bank-status-filter"
          onValueChange={(next) => {
            setStatusFilter(next);
            resetPage();
            navigateCatalogue({ page: 1, status: next });
          }}
          options={[
            { label: "Semua status", value: "" },
            { label: "Diterbitkan", value: "published" },
            { label: "Diarsipkan", value: "archived" },
          ]}
          placeholder="Semua status"
          value={statusFilter}
        />
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
    <Dialog
      onOpenChange={(open) => {
        if (!open && !isApplying) onClose();
      }}
      open={Boolean(folderDialog)}
    >
      <DialogContent className="sm:max-w-sm" pending={isApplying}>
        <DialogHeader>
          <DialogTitle>
            {folderDialog?.kind === "create"
              ? "Buat folder"
              : folderDialog?.kind === "rename"
                ? "Ubah nama folder"
                : "Pindahkan folder"}
          </DialogTitle>
        </DialogHeader>
        {folderDialog?.kind === "move" ? (
          <Field>
            <FieldLabel
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor="folder-parent"
            >
              Folder induk
            </FieldLabel>
            <ReferenceSelect
              aria-label="Folder induk"
              className="px-3 font-normal"
              id="folder-parent"
              onValueChange={(value) => onFolderParentIdChange(value || null)}
              options={[
                { label: "Tidak ada · root", value: "" },
                ...flatFolders.flatMap(({ depth, folder }) => {
                  if (
                    folder.id === null ||
                    folder.id === folderDialog.folderId ||
                    folderPath(folders, folder.id).some(
                      (item) => item.id === folderDialog.folderId,
                    )
                  )
                    return [];
                  return [
                    {
                      label: `${"— ".repeat(depth)}${folder.name}`,
                      value: folder.id,
                    },
                  ];
                }),
              ]}
              placeholder="Tidak ada · root"
              value={folderParentId ?? ""}
            />
          </Field>
        ) : (
          <Field>
            <FieldLabel
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor="folder-name"
              required
            >
              Nama folder
            </FieldLabel>
            <FieldInput
              autoFocus
              className={REFERENCE_CONTROL_CLASS_NAMES.input}
              id="folder-name"
              maxLength={160}
              onChange={(event) => onFolderNameChange(event.target.value)}
              required
              value={folderName}
            />
          </Field>
        )}
        {folderError ? (
          <p
            aria-live="assertive"
            className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-3 py-2 text-sm text-student-status-danger-fg"
            role="alert"
          >
            {folderError}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={isApplying}
            onClick={onClose}
            type="button"
            variant="brandOutline"
          >
            Batal
          </Button>
          <Button
            disabled={
              isApplying ||
              (folderDialog?.kind !== "move" && !folderName.trim())
            }
            onClick={onSubmit}
            type="button"
            variant="brand"
          >
            {isApplying ? "Menyimpan…" : "Simpan"}
          </Button>
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
    <Dialog
      onOpenChange={(open) => {
        if (!open && !isApplying) onClose();
      }}
      open={Boolean(bankMoveId)}
    >
      <DialogContent className="sm:max-w-sm" pending={isApplying}>
        <DialogHeader>
          <DialogTitle>Pindahkan bank</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel
            className={REFERENCE_FIELD_LABEL_CLASS_NAME}
            htmlFor="bank-folder"
          >
            Folder tujuan
          </FieldLabel>
          <ReferenceSelect
            aria-label="Folder tujuan"
            className="px-3 font-normal"
            id="bank-folder"
            onValueChange={(value) => onFolderParentIdChange(value || null)}
            options={[
              { label: "Belum ditempatkan", value: "" },
              ...flatFolders.flatMap(({ depth, folder }) =>
                folder.id !== null
                  ? [
                      {
                        label: `${"— ".repeat(depth)}${folder.name}`,
                        value: folder.id,
                      },
                    ]
                  : [],
              ),
            ]}
            placeholder="Belum ditempatkan"
            value={folderParentId ?? selectedBank?.folderId ?? ""}
          />
        </Field>
        {folderError ? (
          <p
            aria-live="assertive"
            className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-3 py-2 text-sm text-student-status-danger-fg"
            role="alert"
          >
            {folderError}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={isApplying}
            onClick={onClose}
            type="button"
            variant="brandOutline"
          >
            Batal
          </Button>
          <Button
            disabled={isApplying}
            onClick={onSubmit}
            type="button"
            variant="brand"
          >
            {isApplying ? "Memindahkan…" : "Pindahkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionBankLifecycleConfirmationDialog({
  isApplying,
  lifecycleCopy,
  onCancel,
  onConfirm,
  onOpenChange,
  open,
  pendingConfirmation,
}: {
  isApplying: boolean;
  lifecycleCopy: [string, string, string];
  onCancel: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pendingConfirmation: ConfirmationState;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent
        pending={isApplying}
        size="sm"
        variant={
          pendingConfirmation
            ? "danger"
            : lifecycleCopy[0].includes("Arsipkan")
              ? "warning"
              : "info"
        }
      >
        <AlertDialogHeader>
          <AlertDialogMedia
            variant={
              pendingConfirmation
                ? "danger"
                : lifecycleCopy[0].includes("Arsipkan")
                  ? "warning"
                  : "info"
            }
          >
            <CircleHelp />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {pendingConfirmation?.title ?? lifecycleCopy[0]}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingConfirmation?.description ?? lifecycleCopy[1]}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isApplying} onClick={onCancel}>
            Batal
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isApplying}
            onClick={onConfirm}
            variant={pendingConfirmation ? "destructive" : "brand"}
          >
            {isApplying
              ? "Memproses…"
              : (pendingConfirmation?.label ?? lifecycleCopy[2])}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type CatalogueStateSetter<T> = Dispatch<SetStateAction<T>>;

function useQuestionBankFolderActions({
  folderDialog,
  folderName,
  folderParentId,
  folders,
  isApplying,
  purpose,
  refreshFromServer,
  selectedFolder,
  setEntries,
  setFolderDialog,
  setFolderError,
  setFolderName,
  setFolderParentId,
  setFolders,
  setIsApplying,
  setPendingConfirmation,
  setSelectedFolder,
}: {
  folderDialog: FolderDialogState;
  folderName: string;
  folderParentId: string | null;
  folders: FolderNode[];
  isApplying: boolean;
  purpose: QuestionBankPurpose;
  refreshFromServer: () => void;
  selectedFolder: FolderSelection;
  setEntries: CatalogueStateSetter<BankEntry[]>;
  setFolderDialog: CatalogueStateSetter<FolderDialogState>;
  setFolderError: CatalogueStateSetter<string | null>;
  setFolderName: CatalogueStateSetter<string>;
  setFolderParentId: CatalogueStateSetter<string | null>;
  setFolders: CatalogueStateSetter<FolderNode[]>;
  setIsApplying: CatalogueStateSetter<boolean>;
  setPendingConfirmation: CatalogueStateSetter<ConfirmationState>;
  setSelectedFolder: CatalogueStateSetter<FolderSelection>;
}) {
  async function removeFolderFromServer(folder: FolderNode) {
    setIsApplying(true);
    setFolderError(null);
    try {
      const result = await removeQuestionBankFolderAction(
        folder.id ?? "",
        purpose,
        { expectedUpdatedAt: folder.updatedAt },
      );
      if (!result.ok) {
        setFolderError(result.message);
        return;
      }
      const removedId = folder.id ?? "";
      const nextFolders = updateFolderBankCount(
        removeFolder(folders, removedId),
        folder.parentId,
        folder.bankCount,
      );
      setFolders(nextFolders);
      setEntries((current) =>
        current.map((entry) => {
          const nextFolderId =
            entry.bank.folderId === folder.id
              ? folder.parentId
              : entry.bank.folderId;
          return {
            ...entry,
            bank: {
              ...entry.bank,
              folder: folderReference(nextFolders, nextFolderId),
              folderId: nextFolderId,
              folderPath: folderPath(nextFolders, nextFolderId),
            },
          };
        }),
      );
      if (selectedFolder === folder.id) setSelectedFolder(folder.parentId);
      setPendingConfirmation(null);
      refreshFromServer();
    } finally {
      setIsApplying(false);
    }
  }

  function openFolderCreate(parentId: string | null) {
    setFolderError(null);
    setFolderName("");
    setFolderParentId(parentId);
    setFolderDialog({ kind: "create" });
  }

  function openFolderManage(
    folder: FolderNode,
    kind: "move" | "rename" | "remove",
  ) {
    if (kind === "remove") {
      setPendingConfirmation({
        description:
          "Bank di dalam folder akan dipindahkan ke tingkat induknya. Subfolder juga akan dinaikkan satu tingkat.",
        label: "Hapus folder",
        onConfirm: () => void removeFolderFromServer(folder),
        title: `Hapus folder “${folder.name}”?`,
      });
      return;
    }
    setFolderError(null);
    setFolderName(folder.name);
    setFolderParentId(folder.parentId);
    setFolderDialog({ folderId: folder.id ?? undefined, kind });
  }

  async function submitFolderDialog() {
    if (!folderDialog || isApplying) return;
    setIsApplying(true);
    setFolderError(null);
    try {
      if (folderDialog.kind === "create") {
        const result = await createQuestionBankFolderAction({
          name: folderName,
          parentId: folderParentId,
          purpose,
        });
        if (!result.ok) {
          setFolderError(result.message);
          return;
        }
        setFolders((current) =>
          insertFolder(current, {
            ...result.result,
            id: result.result.id,
            children: undefined,
          }),
        );
      } else if (folderDialog.kind === "rename") {
        const folder = findFolder(folders, folderDialog.folderId ?? null);
        const result = await renameQuestionBankFolderAction(
          folderDialog.folderId ?? "",
          folderName,
          purpose,
          { expectedUpdatedAt: folder?.updatedAt },
        );
        if (!result.ok) {
          setFolderError(result.message);
          return;
        }
        const renamedId = result.result.id;
        if (!renamedId) return;
        const nextFolders = updateFolder(folders, renamedId, (item) => ({
          ...item,
          ...result.result,
        }));
        setFolders(nextFolders);
        setEntries((current) =>
          current.map((entry) => ({
            ...entry,
            bank: {
              ...entry.bank,
              folder: folderReference(nextFolders, entry.bank.folderId),
              folderPath: folderPath(nextFolders, entry.bank.folderId),
            },
          })),
        );
      } else {
        const folder = findFolder(folders, folderDialog.folderId ?? null);
        const result = await moveQuestionBankFolderAction(
          folderDialog.folderId ?? "",
          folderParentId,
          purpose,
          { expectedUpdatedAt: folder?.updatedAt },
        );
        if (!result.ok) {
          setFolderError(result.message);
          return;
        }
        const movedId = result.result.id;
        if (!movedId) return;
        const nextFolders = moveFolder(
          folders,
          movedId,
          result.result.parentId,
        );
        setFolders(nextFolders);
        setEntries((current) =>
          current.map((entry) => ({
            ...entry,
            bank: {
              ...entry.bank,
              folderPath: folderPath(nextFolders, entry.bank.folderId),
            },
          })),
        );
      }
      setFolderDialog(null);
      refreshFromServer();
    } finally {
      setIsApplying(false);
    }
  }

  return { openFolderCreate, openFolderManage, submitFolderDialog };
}

function useQuestionBankBankActions({
  bankMoveId,
  folderParentId,
  folders,
  isApplying,
  purpose,
  refreshFromServer,
  selectedBank,
  setBankMoveId,
  setEntries,
  setFolderError,
  setFolders,
  setIsApplying,
}: {
  bankMoveId: string | null;
  folderParentId: string | null;
  folders: FolderNode[];
  isApplying: boolean;
  purpose: QuestionBankPurpose;
  refreshFromServer: () => void;
  selectedBank: BankEntry["bank"] | null;
  setBankMoveId: CatalogueStateSetter<string | null>;
  setEntries: CatalogueStateSetter<BankEntry[]>;
  setFolderError: CatalogueStateSetter<string | null>;
  setFolders: CatalogueStateSetter<FolderNode[]>;
  setIsApplying: CatalogueStateSetter<boolean>;
}) {
  function openMoveBank(bankId: string) {
    setFolderError(null);
    setBankMoveId(bankId);
  }

  async function moveBankToFolder() {
    if (!bankMoveId || isApplying) return;
    setIsApplying(true);
    setFolderError(null);
    try {
      const bank = selectedBank;
      if (!bank) {
        setFolderError(
          "Bank Soal tidak ditemukan. Muat ulang halaman lalu coba lagi.",
        );
        return;
      }
      const result = await moveQuestionBanksToFolderAction(
        [bankMoveId],
        folderParentId,
        purpose,
        {
          expected: {
            [bankMoveId]: {
              expectedRevision: bank.revision,
              expectedUpdatedAt: bank.updatedAt,
            },
          },
        },
      );
      if (!result.ok) {
        setFolderError(result.message);
        return;
      }
      const sourceFolderId = selectedBank.folderId ?? null;
      const nextFolders = moveFolderBankCount(
        folders,
        sourceFolderId,
        folderParentId,
      );
      setFolders(nextFolders);
      const version = result.result.versions.find(
        (item) => item.id === bankMoveId,
      );
      setEntries((current) =>
        current.map((entry) =>
          entry.bank.id === bankMoveId
            ? {
                ...entry,
                bank: {
                  ...entry.bank,
                  folderId: folderParentId,
                  folder: folderReference(nextFolders, folderParentId),
                  folderPath: folderPath(nextFolders, folderParentId),
                  ...(version
                    ? {
                        revision: version.revision,
                        updatedAt: version.updatedAt,
                      }
                    : {}),
                },
              }
            : entry,
        ),
      );
      setBankMoveId(null);
      refreshFromServer();
    } finally {
      setIsApplying(false);
    }
  }

  return { moveBankToFolder, openMoveBank };
}

function useQuestionBankLifecycleActions({
  isApplying,
  pendingLifecycle,
  refreshFromServer,
  setEntries,
  setIsApplying,
  setPendingLifecycle,
}: {
  isApplying: boolean;
  pendingLifecycle: { action: LifecycleAction; bank: BankEntry["bank"] } | null;
  refreshFromServer: () => void;
  setEntries: CatalogueStateSetter<BankEntry[]>;
  setIsApplying: CatalogueStateSetter<boolean>;
  setPendingLifecycle: CatalogueStateSetter<{
    action: LifecycleAction;
    bank: BankEntry["bank"];
  } | null>;
}) {
  async function applyLifecycle() {
    if (!pendingLifecycle || isApplying) return;
    setIsApplying(true);
    try {
      const result = await updateQuestionBankLifecycleAction(
        pendingLifecycle.bank.id,
        pendingLifecycle.action,
        { expectedRevision: pendingLifecycle.bank.revision ?? 1 },
      );
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      setEntries((current) =>
        current.map((entry) =>
          entry.bank.id === pendingLifecycle.bank.id
            ? {
                ...entry,
                bank: {
                  ...entry.bank,
                  revision: result.result.revision,
                  status: result.result.status,
                },
              }
            : entry,
        ),
      );
      setPendingLifecycle(null);
      showToast(
        pendingLifecycle.action === "archive"
          ? "Bank Soal diarsipkan."
          : "Bank Soal dipulihkan.",
        { variant: "success" },
      );
      refreshFromServer();
    } finally {
      setIsApplying(false);
    }
  }

  return { applyLifecycle };
}

function getQuestionBankCatalogueViewModel({
  flatFolders,
  folders,
  initialPageSize,
  initialPurpose,
  initialSearch,
  initialTotal,
  page,
  selectedFolder,
}: {
  flatFolders: Array<{ depth: number; folder: FolderNode }>;
  folders: FolderNode[];
  initialPageSize: number;
  initialPurpose: QuestionBankPurpose;
  initialSearch: string;
  initialTotal: number;
  page: number;
  selectedFolder: FolderSelection;
}) {
  const currentFolder =
    selectedFolder !== ROOT_FOLDER && selectedFolder !== null
      ? findFolder(folders, selectedFolder)
      : selectedFolder === null
        ? findFolder(folders, null)
        : null;
  const rootLabel = questionBankNavigationLabel(initialPurpose);
  const currentPath =
    selectedFolder === ROOT_FOLDER
      ? [{ id: null, name: rootLabel }]
      : [
          { id: null, name: rootLabel },
          ...(selectedFolder === null
            ? [{ id: null, name: "Belum ditempatkan" }]
            : folderPath(folders, selectedFolder)),
        ];
  const folderCreateParentId =
    selectedFolder === ROOT_FOLDER || selectedFolder === null
      ? null
      : selectedFolder;
  const folderCreateLabel =
    selectedFolder === ROOT_FOLDER || selectedFolder === null
      ? "Buat folder"
      : "Buat subfolder";
  const totalPages = Math.max(1, Math.ceil(initialTotal / initialPageSize));
  const visiblePage = Math.min(page, totalPages);
  const isGlobalSearch = Boolean(initialSearch.trim());
  const childFolders =
    selectedFolder === ROOT_FOLDER
      ? folders.filter((folder) => folder.id !== null)
      : selectedFolder && currentFolder
        ? (currentFolder.children ?? [])
        : [];
  return {
    childFolders,
    currentFolder,
    currentPath,
    folderCreateLabel,
    folderCreateParentId,
    isGlobalSearch,
    totalPages,
    visiblePage,
    flatFolders,
  };
}

function useQuestionBankCatalogueState({
  initialEntries,
  initialFolderTree,
  initialPage = 1,
  initialPageSize = BANKS_PER_PAGE,
  initialPurpose = "quiz",
  initialSearch = "",
  initialSelectedCategories = [],
  initialSelectedFolder = ROOT_FOLDER,
  initialSelectedSubjects = [],
  initialSort = "updated",
  initialStatusFilter = "",
  initialTotal,
}: {
  initialEntries: BankEntry[];
  initialFolderTree: FolderNode[];
  initialPage?: number;
  initialPageSize?: number;
  initialPurpose?: QuestionBankPurpose;
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
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>(
    initialSelectedFolder,
  );
  const [selectedCategories] = useState<string[]>(initialSelectedCategories);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    initialSelectedSubjects,
  );
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [page, setPage] = useState(initialPage);
  const [pendingLifecycle, setPendingLifecycle] = useState<{
    action: LifecycleAction;
    bank: BankEntry["bank"];
  } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ConfirmationState>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  const [folderName, setFolderName] = useState("");
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [bankMoveId, setBankMoveId] = useState<string | null>(null);

  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);
  const {
    childFolders,
    currentFolder,
    currentPath,
    folderCreateLabel,
    folderCreateParentId,
    isGlobalSearch,
    totalPages,
    visiblePage,
  } = getQuestionBankCatalogueViewModel({
    flatFolders,
    folders,
    initialPageSize,
    initialPurpose,
    initialSearch,
    initialTotal,
    page,
    selectedFolder,
  });
  const selectedBank = bankMoveId
    ? (entries.find(({ bank }) => bank.id === bankMoveId)?.bank ?? null)
    : null;

  function navigateCatalogue(
    next: {
      categories?: string[];
      folder?: FolderSelection;
      page?: number;
      query?: string;
      sort?: BankSortMode;
      status?: string;
      subjects?: string[];
    } = {},
  ) {
    const nextCategories = next.categories ?? selectedCategories;
    const nextFolder = next.folder ?? selectedFolder;
    const nextQuery = next.query ?? initialSearch;
    const nextSort = next.sort ?? initialSort;
    const nextStatus = next.status ?? statusFilter;
    const nextSubjects = next.subjects ?? selectedSubjects;
    const nextPage = next.page ?? 1;
    startCatalogueTransition(() =>
      router.push(
        questionBankHref({
          categories: nextCategories,
          folder: nextFolder,
          page: nextPage,
          purpose: initialPurpose,
          query: nextQuery,
          sort: nextSort,
          status: nextStatus,
          subjects: nextSubjects,
        }),
      ),
    );
  }

  function resetPage() {
    setPage(1);
  }

  function refreshFromServer() {
    startCatalogueTransition(() => router.refresh());
  }

  const folderActions = useQuestionBankFolderActions({
    folderDialog,
    folderName,
    folderParentId,
    folders,
    isApplying,
    purpose: initialPurpose,
    refreshFromServer,
    selectedFolder,
    setEntries,
    setFolderDialog,
    setFolderError,
    setFolderName,
    setFolderParentId,
    setFolders,
    setIsApplying,
    setPendingConfirmation,
    setSelectedFolder,
  });
  const bankActions = useQuestionBankBankActions({
    bankMoveId,
    folderParentId,
    folders,
    isApplying,
    purpose: initialPurpose,
    refreshFromServer,
    selectedBank,
    setBankMoveId,
    setEntries,
    setFolderError,
    setFolders,
    setIsApplying,
  });
  const lifecycleActions = useQuestionBankLifecycleActions({
    isApplying,
    pendingLifecycle,
    refreshFromServer,
    setEntries,
    setIsApplying,
    setPendingLifecycle,
  });

  const { openFolderCreate, openFolderManage, submitFolderDialog } =
    folderActions;
  const { moveBankToFolder, openMoveBank } = bankActions;
  const { applyLifecycle } = lifecycleActions;

  const catalogueRows: QuestionBankCatalogueRow[] = [
    ...childFolders.map(
      (folder): QuestionBankCatalogueRow => ({ folder, kind: "folder" }),
    ),
    ...entries.map(
      ({ bank }): QuestionBankCatalogueRow => ({ bank, kind: "bank" }),
    ),
  ];

  const openCatalogueFolder = (folder: FolderNode) => {
    setSelectedFolder(folder.id);
    resetPage();
    navigateCatalogue({ folder: folder.id, page: 1 });
  };
  const openCatalogueRow = (row: QuestionBankCatalogueRow) => {
    if (row.kind === "folder") {
      openCatalogueFolder(row.folder);
      return;
    }
    router.push(row.bank.href);
  };
  const openBankLifecycle = (
    bank: BankEntry["bank"],
    action: LifecycleAction,
  ) => {
    setPendingLifecycle({ action, bank });
  };
  const catalogueColumns = createQuestionBankCatalogueColumns({
    onOpenFolder: openCatalogueFolder,
  });
  const catalogueRowContextMenu = (row: QuestionBankCatalogueRow) => (
    <QuestionBankCatalogueRowContextMenu
      actions={{
        onEditBank: (bank) => router.push(bank.href),
        onManageFolder: openFolderManage,
        onSetLifecycle: openBankLifecycle,
      }}
      row={row}
    />
  );
  const activeFilters = getQuestionBankActiveFilters({
    initialPurpose,
    initialSearch,
    initialSort,
    selectedCategories,
    selectedFolder,
    selectedSubjects,
    statusFilter,
  });
  const clearFiltersHref = questionBankHref({
    folder: selectedFolder,
    page: 1,
    purpose: initialPurpose,
    sort: initialSort,
  });
  const folderBreadcrumb = (
    <QuestionBankFolderBreadcrumb
      currentPath={currentPath}
      onSelect={(item, index) => {
        const next = index === 0 ? ROOT_FOLDER : item.id;
        setSelectedFolder(next);
        resetPage();
        navigateCatalogue({ folder: next, page: 1 });
      }}
    />
  );
  const sortMenu = (
    <QuestionBankSortMenu
      initialSort={initialSort}
      onChange={(sort) => {
        resetPage();
        navigateCatalogue({ page: 1, sort });
      }}
    />
  );

  return {
    activeFilters,
    applyLifecycle,
    bankMoveId,
    catalogueColumns,
    catalogueRowContextMenu,
    catalogueRows,
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
    isApplying,
    isCataloguePending,
    isGlobalSearch,
    moveBankToFolder,
    navigateCatalogue,
    openFolderCreate,
    openFolderManage,
    openCatalogueRow,
    openMoveBank,
    pendingConfirmation,
    pendingLifecycle,
    resetPage,
    selectedBank,
    selectedCategories,
    selectedFolder,
    selectedSubjects,
    setBankMoveId,
    setFolderDialog,
    setFolderError,
    setFolderName,
    setFolderParentId,
    setPage,
    setPendingConfirmation,
    setPendingLifecycle,
    setSelectedFolder,
    setSelectedSubjects,
    setStatusFilter,
    sortMenu,
    statusFilter,
    submitFolderDialog,
    totalPages,
    visiblePage,
  };
}

function getQuestionBankLifecycleCopy(
  action?: LifecycleAction,
): [string, string, string] {
  if (action === "archive")
    return [
      "Arsipkan bank?",
      "Bank disembunyikan dari sumber baru tanpa menghapus soal atau snapshot.",
      "Arsipkan",
    ];
  return [
    "Pulihkan bank?",
    "Bank kembali tersedia dan dapat diatur lagi.",
    "Pulihkan",
  ];
}

type QuestionBankCatalogueState = ReturnType<
  typeof useQuestionBankCatalogueState
>;

function QuestionBankCataloguePageContent({
  initialPurpose,
  initialSearch,
  initialSort,
  initialTotal,
  state,
}: {
  initialPurpose: QuestionBankPurpose;
  initialSearch: string;
  initialSort: BankSortMode;
  initialTotal: number;
  state: QuestionBankCatalogueState;
}) {
  const {
    activeFilters,
    applyLifecycle,
    bankMoveId,
    catalogueColumns,
    catalogueRowContextMenu,
    catalogueRows,
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
    isApplying,
    isCataloguePending,
    isGlobalSearch,
    moveBankToFolder,
    navigateCatalogue,
    openFolderCreate,
    openFolderManage,
    openCatalogueRow,
    pendingConfirmation,
    pendingLifecycle,
    resetPage,
    selectedBank,
    selectedCategories,
    selectedFolder,
    selectedSubjects,
    setBankMoveId,
    setFolderDialog,
    setFolderError,
    setFolderName,
    setFolderParentId,
    setPage,
    setPendingConfirmation,
    setPendingLifecycle,
    setSelectedSubjects,
    setStatusFilter,
    sortMenu,
    statusFilter,
    submitFolderDialog,
    totalPages,
    visiblePage,
  } = state;
  const lifecycleCopy = getQuestionBankLifecycleCopy(pendingLifecycle?.action);
  const pageTitle = questionBankNavigationLabel(initialPurpose);

  return (
    <div className="space-y-8">
      <ReferencePageHeader
        actions={
          <>
            <Button
              aria-label={folderCreateLabel}
              onClick={() => openFolderCreate(folderCreateParentId)}
              size="icon-sm"
              title={folderCreateLabel}
              type="button"
              variant="brandOutline"
            >
              <FolderPlus />
            </Button>
            <Button
              aria-label="Buat Soal"
              render={
                <Link
                  href={questionBankCreateHref({
                    folder: selectedFolder,
                    purpose: initialPurpose,
                  })}
                />
              }
              size="sm"
              title="Buat Bank"
              type="button"
              variant="brand"
            >
              <Plus />
              Buat Bank
            </Button>
          </>
        }
        title={pageTitle}
      />

      <div className="min-w-0">
        <MentorCatalogueTable
          breadcrumb={folderBreadcrumb}
          caption="Daftar folder dan bank soal"
          clearFiltersHref={clearFiltersHref}
          columns={catalogueColumns}
          emptyState={
            <div className="min-w-0 max-w-[calc(100vw-2rem)] whitespace-normal flex flex-col items-center py-2 text-center">
              <LibraryBig className="size-7 text-primary-300" />
              <h2 className="mt-3 font-semibold text-secondary-900">
                {isGlobalSearch
                  ? "Tidak ada hasil pencarian"
                  : "Belum ada item di lokasi ini"}
              </h2>
              <p className="mt-1 text-sm font-normal leading-6 text-secondary-600">
                Buat bank soal atau folder baru untuk mulai mengisi ruang ini.
              </p>
              {/* {!isGlobalSearch ? ( */}
              {/*   <div className="mt-5 flex flex-wrap items-center justify-center gap-2"> */}
              {/*     <Button */}
              {/*       nativeButton={false} */}
              {/*       render={ */}
              {/*         <Link */}
              {/*           href={questionBankCreateHref({ */}
              {/*             folder: selectedFolder, */}
              {/*             purpose: initialPurpose, */}
              {/*           })} */}
              {/*         /> */}
              {/*       } */}
              {/*       size="sm" */}
              {/*       type="button" */}
              {/*       variant="brand" */}
              {/*     > */}
              {/*       <Plus /> */}
              {/*       Buat bank soal */}
              {/*     </Button> */}
              {/*     <Button */}
              {/*       onClick={() => openFolderCreate(folderCreateParentId)} */}
              {/*       size="sm" */}
              {/*       type="button" */}
              {/*       variant="brandOutline" */}
              {/*     > */}
              {/*       <FolderPlus /> */}
              {/*       {folderCreateLabel} */}
              {/*     </Button> */}
              {/*   </div> */}
              {/* ) : null} */}
            </div>
          }
          filterPanel={
            <QuestionBankCatalogueFilterPanel
              navigateCatalogue={navigateCatalogue}
              resetPage={resetPage}
              selectedSubjects={selectedSubjects}
              setSelectedSubjects={setSelectedSubjects}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
            />
          }
          filters={activeFilters}
          getRowId={(row) =>
            row.kind === "folder"
              ? `folder-${row.folder.id ?? row.folder.name}`
              : `bank-${row.bank.id}`
          }
          isLoading={isCataloguePending}
          loadingLabel="Memuat bank soal…"
          moreMenu={sortMenu}
          onRowClick={openCatalogueRow}
          rowContextMenu={catalogueRowContextMenu}
          rows={catalogueRows}
          search={{
            action: "/mentor/quiz/question-bank",
            clearHref: questionBankHref({
              categories: selectedCategories,
              folder: selectedFolder,
              page: 1,
              purpose: initialPurpose,
              sort: initialSort,
              status: statusFilter,
              subjects: selectedSubjects,
            }),
            hiddenFields: {
              purpose: initialPurpose,
              ...(selectedFolder !== ROOT_FOLDER
                ? {
                    folder:
                      selectedFolder === null ? "unfiled" : selectedFolder,
                  }
                : {}),
              ...(selectedCategories.length
                ? { category: selectedCategories }
                : {}),
              ...(selectedSubjects.length ? { subtest: selectedSubjects } : {}),
              ...(statusFilter ? { status: statusFilter } : {}),
              ...(initialSort !== "updated" ? { sort: initialSort } : {}),
            },
            label: "Cari bank soal",
            placeholder: "Cari judul, folder, subject, atau materi…",
            value: initialSearch,
          }}
          tableClassName="min-w-0"
          wrapperClassName={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "min-w-0")}
        />
        {initialTotal ? (
          <nav
            aria-label="Paginasi bank soal"
            className="flex items-center justify-center gap-2 pt-2"
          >
            <Button
              aria-label="Halaman sebelumnya"
              disabled={visiblePage === 1}
              onClick={() => {
                const next = Math.max(1, visiblePage - 1);
                setPage(next);
                navigateCatalogue({ page: next });
              }}
              size="icon-sm"
              type="button"
              variant="brandOutline"
            >
              <ChevronRight className="rotate-180" />
            </Button>
            <span className="text-sm text-secondary-500">
              Halaman {visiblePage} dari {totalPages}
            </span>
            <Button
              aria-label="Halaman berikutnya"
              disabled={visiblePage === totalPages}
              onClick={() => {
                const next = Math.min(totalPages, visiblePage + 1);
                setPage(next);
                navigateCatalogue({ page: next });
              }}
              size="icon-sm"
              type="button"
              variant="brandOutline"
            >
              <ChevronRight />
            </Button>
          </nav>
        ) : null}
      </div>

      <QuestionBankFolderDialog
        flatFolders={flatFolders}
        folderDialog={folderDialog}
        folderError={folderError}
        folderName={folderName}
        folderParentId={folderParentId}
        folders={folders}
        isApplying={isApplying}
        onClose={() => {
          setFolderDialog(null);
          setFolderError(null);
        }}
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
        onClose={() => {
          setBankMoveId(null);
          setFolderError(null);
        }}
        onFolderParentIdChange={setFolderParentId}
        onSubmit={() => void moveBankToFolder()}
        selectedBank={selectedBank}
      />
      <QuestionBankLifecycleConfirmationDialog
        isApplying={isApplying}
        lifecycleCopy={lifecycleCopy}
        onCancel={() => {
          setPendingLifecycle(null);
          setPendingConfirmation(null);
        }}
        onConfirm={() => {
          if (pendingConfirmation) pendingConfirmation.onConfirm();
          else void applyLifecycle();
        }}
        onOpenChange={(open) => {
          if (!open && !isApplying) {
            setPendingLifecycle(null);
            setPendingConfirmation(null);
          }
        }}
        open={Boolean(pendingLifecycle || pendingConfirmation)}
        pendingConfirmation={pendingConfirmation}
      />
    </div>
  );
}

function KaptenQuestionBankPageModule({
  initialEntries,
  initialFolderTree,
  initialPage = 1,
  initialPageSize = BANKS_PER_PAGE,
  initialPurpose = "quiz",
  initialSearch = "",
  initialSort = "updated",
  initialSelectedCategories = [],
  initialSelectedFolder = ROOT_FOLDER,
  initialSelectedSubjects = [],
  initialStatusFilter = "",
  initialTotal,
  session,
}: {
  initialEntries: BankEntry[];
  initialFolderTree: FolderNode[];
  initialPage?: number;
  initialPageSize?: number;
  initialPurpose?: QuestionBankPurpose;
  initialSearch?: string;
  initialSort?: BankSortMode;
  initialSelectedCategories?: string[];
  initialSelectedFolder?: FolderSelection;
  initialSelectedSubjects?: string[];
  initialStatusFilter?: string;
  initialTotal: number;
  session: SessionContext;
}) {
  const catalogueState = useQuestionBankCatalogueState({
    initialEntries,
    initialFolderTree,
    initialPage,
    initialPageSize,
    initialPurpose,
    initialSearch,
    initialSelectedCategories,
    initialSelectedFolder,
    initialSelectedSubjects,
    initialSort,
    initialStatusFilter,
    initialTotal,
  });
  const navigationLabel = questionBankNavigationLabel(initialPurpose);

  return (
    <MentorWorkspaceShell
      activeLabel={navigationLabel}
      breadcrumbLabel={navigationLabel}
      contentElement="div"
      searchPlaceholder="Cari bank soal, folder, atau materi..."
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
    >
      <QuestionBankCataloguePageContent
        initialPurpose={initialPurpose}
        initialSearch={initialSearch}
        initialSort={initialSort}
        initialTotal={initialTotal}
        state={catalogueState}
      />
    </MentorWorkspaceShell>
  );
}

export { KaptenQuestionBankPageModule };

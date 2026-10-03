"use client";

import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronRight,
  CircleHelp,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "@/lib/icons";
import {
  useEffect,
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
import type { DataTableFilter } from "@/components/ui/data-table";
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
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { showToast } from "@/components/ui/toast";
import type { SessionContext } from "@/lib/auth/types";
import { questionBankNavigationLabel } from "@/lib/question-bank/purpose";
import type { QuestionBankCreator } from "@/lib/question-bank/creator";
import { cn } from "@/lib/utils";
import { QuestionBankAssessmentTable } from "./components/question-bank-assessment-table";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { KaptenQuestionBankBuilderPageModule } from "@/modules/mentor/KaptenQuestionBankBuilderPageModule";
import {
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
import quizStyles from "./quiz-dashboard.module.css";

type QuestionBankOrganization = {
  categories: Array<{ id: string; name: string }>;
  categoryIds: string[];
  folder: { id: string; name: string } | null;
  folderId: string | null;
  folderPath: Array<{ id: string | null; name: string }>;
  subjectCoverage: string[];
};

type BankEntry = {
  bank: KaptenQuestionBank & QuestionBankOrganization & { creator?: QuestionBankCreator };
};

type FolderNode = {
  creator?: QuestionBankCreator;
  bankCount: number;
  children?: FolderNode[];
  createdAt: string;
  id: string | null;
  name: string;
  parentId: string | null;
  purpose: QuestionBankPurpose;
  updatedAt: string;
};

export type QuestionBankCatalogueRow =
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

const BANKS_PER_PAGE = 6;
const ROOT_FOLDER = "root" as const;

export type QuestionBankHrefOptions = {
  categories?: string[];
  folder?: FolderSelection;
  page?: number;
  pageSize?: number;
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
  pageSize = BANKS_PER_PAGE,
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
  if (pageSize !== BANKS_PER_PAGE) params.set("pageSize", String(pageSize));
  return `/mentor/quiz/question-bank${params.toString() ? `?${params.toString()}` : ""}`;
}

function questionBankCreateHref({
  categories,
  folder = ROOT_FOLDER,
  page,
  pageSize,
  purpose = "quiz",
  query,
  sort,
  status,
  subjects,
}: {
  categories?: string[];
  folder?: FolderSelection;
  page?: number;
  pageSize?: number;
  purpose?: QuestionBankPurpose;
  query?: string;
  sort?: BankSortMode;
  status?: string;
  subjects?: string[];
} = {}) {
  return `${questionBankHref({ categories, folder, page, pageSize, purpose, query, sort, status, subjects })}&create=1`;
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
  if (status === "draft") return "Draf";
  return status === "archived" ? "Diarsipkan" : "Diterbitkan";
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
            variant="outline"
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
            variant="default"
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
            variant="outline"
          >
            Batal
          </Button>
          <Button
            disabled={isApplying}
            onClick={onSubmit}
            type="button"
            variant="default"
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
            variant={pendingConfirmation ? "destructive" : "default"}
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
  initialSearch,
  initialTotal,
  page,
  selectedFolder,
}: {
  flatFolders: Array<{ depth: number; folder: FolderNode }>;
  folders: FolderNode[];
  initialPageSize: number;
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
  const rootLabel = "#";
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
  initialCreateDialogOpen = false,
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
  initialCreateDialogOpen?: boolean;
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
  const [createDialogOpen, setCreateDialogOpen] = useState(initialCreateDialogOpen);

  useEffect(() => {
    function syncCreateDialogWithHistory() {
      const values = new URLSearchParams(window.location.search).getAll("create");
      setCreateDialogOpen(values.length === 1 && values[0] === "1");
    }

    window.addEventListener("popstate", syncCreateDialogWithHistory);
    return () => window.removeEventListener("popstate", syncCreateDialogWithHistory);
  }, []);

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
    initialSearch,
    initialTotal,
    page,
    selectedFolder,
  });
  const selectedBank = bankMoveId
    ? (entries.find(({ bank }) => bank.id === bankMoveId)?.bank ?? null)
    : null;

  function navigateCatalogue(
    next: QuestionBankHrefOptions = {},
  ) {
    const nextCategories = next.categories ?? selectedCategories;
    const nextFolder = next.folder === undefined ? selectedFolder : next.folder;
    const nextQuery = next.query ?? initialSearch;
    const nextSort = next.sort ?? initialSort;
    const nextStatus = next.status ?? statusFilter;
    const nextSubjects = next.subjects ?? selectedSubjects;
    const nextPage = next.page ?? 1;
    const nextPageSize = next.pageSize ?? initialPageSize;
    startCatalogueTransition(() =>
      router.push(
        questionBankHref({
          categories: nextCategories,
          folder: nextFolder,
          page: nextPage,
          pageSize: nextPageSize,
          purpose: initialPurpose,
          query: nextQuery,
          sort: nextSort,
          status: nextStatus,
          subjects: nextSubjects,
        }),
        { scroll: false },
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
  return {
    activeFilters,
    applyLifecycle,
    bankMoveId,
    initialPageSize,
    refreshFromServer,
    setEntries,
    setIsApplying,
    catalogueRowContextMenu,
    catalogueRows,
    clearFiltersHref,
    createDialogOpen,
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
    setCreateDialogOpen,
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

export type QuestionBankCatalogueState = ReturnType<
  typeof useQuestionBankCatalogueState
>;

function QuestionBankCataloguePageContent({
  session,
  initialPurpose,
  initialSearch,
  initialSort,
  initialTotal,
  state,
}: {
  session: SessionContext;
  initialPurpose: QuestionBankPurpose;
  initialSearch: string;
  initialSort: BankSortMode;
  initialTotal: number;
  state: QuestionBankCatalogueState;
}) {
  const {
    applyLifecycle,
    bankMoveId,
    createDialogOpen,
    flatFolders,
    folderCreateLabel,
    folderCreateParentId,
    folderDialog,
    folderError,
    folderName,
    folderParentId,
    folders,
    isApplying,
    moveBankToFolder,
    openFolderCreate,
    pendingConfirmation,
    pendingLifecycle,
    selectedBank,
    selectedCategories,
    selectedFolder,
    selectedSubjects,
    setBankMoveId,
    setCreateDialogOpen,
    setFolderDialog,
    setFolderError,
    setFolderName,
    setFolderParentId,
    setPendingConfirmation,
    setPendingLifecycle,
    statusFilter,
    submitFolderDialog,
    visiblePage,
  } = state;
  const lifecycleCopy = getQuestionBankLifecycleCopy(pendingLifecycle?.action);
  const pageTitle = questionBankNavigationLabel(initialPurpose);

  function handleCreateDialogOpenChange(open: boolean) {
    setCreateDialogOpen(open);
    if (!open && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("create")) {
      window.history.replaceState(null, "", questionBankHref({
        categories: selectedCategories,
        folder: selectedFolder,
        page: visiblePage,
        pageSize: state.initialPageSize,
        purpose: initialPurpose,
        query: initialSearch,
        sort: initialSort,
        status: statusFilter,
        subjects: selectedSubjects,
      }));
    }
  }

  return (
    <div className={cn("space-y-8", quizStyles.pageHeader)}>
      <ReferencePageHeader
        actions={
          <>
            <Button
              aria-label={folderCreateLabel}
              onClick={() => openFolderCreate(folderCreateParentId)}
              size="icon-sm"
              title={folderCreateLabel}
              type="button"
              variant="outline"
            >
              <FolderPlus />
            </Button>
            <Button
              aria-label="Buat Soal"
              onClick={() => {
                setCreateDialogOpen(true);
                // Opening a local dialog must not remount the server catalogue.
                window.history.pushState(null, "", questionBankCreateHref({
                  categories: selectedCategories,
                  folder: selectedFolder,
                  page: visiblePage,
                  pageSize: state.initialPageSize,
                  purpose: initialPurpose,
                  query: initialSearch,
                  sort: initialSort,
                  status: statusFilter,
                  subjects: selectedSubjects,
                }));
              }}
              size="sm"
              title="Buat Bank"
              type="button"
              variant="default"
            >
              <Plus />
              Buat Bank
            </Button>
          </>
        }
        title={pageTitle}
      />

      <QuestionBankCatalogueTableSection initialPurpose={initialPurpose} initialSearch={initialSearch} initialSort={initialSort} initialTotal={initialTotal} state={state} />

      {createDialogOpen ? (
        <KaptenQuestionBankBuilderPageModule
          initialFolderId={selectedFolder === ROOT_FOLDER ? null : selectedFolder}
          mode="create"
          onOpenChange={handleCreateDialogOpenChange}
          open
          presentation="modal"
          purpose={initialPurpose}
          session={session}
        />
      ) : null}
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

function QuestionBankCatalogueTableSection(props: {
  initialPurpose: QuestionBankPurpose;
  initialSearch: string;
  initialSort: BankSortMode;
  initialTotal: number;
  state: QuestionBankCatalogueState;
}) {
  return <QuestionBankAssessmentTable {...props} />;
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
  initialCreateDialogOpen = false,
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
  initialCreateDialogOpen?: boolean;
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
    initialCreateDialogOpen,
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
      mainClassName={quizStyles.canvas}
    >
      <QuestionBankCataloguePageContent
        session={session}
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

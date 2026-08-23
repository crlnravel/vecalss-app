"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  FilePenLine,
  Folder,
  FolderPlus,
  LayoutGrid,
  LibraryBig,
  List as ListIcon,
  ListFilter,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "@/lib/icons";
import { useMemo, useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
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

type CategoryNode = {
  bankCount: number;
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
};

type FolderSelection = "all" | string | null;
type FolderDialogState = { kind: "create" | "move" | "rename"; folderId?: string } | null;
type CategoryDialogState = { categoryId?: string; kind: "create" | "rename" } | null;
type ConfirmationState = { description: string; label: string; onConfirm: () => void; title: string } | null;
type LifecycleAction = "archive" | "publish" | "restore" | "unpublish";
type BankViewMode = "grid" | "list";
type BankSortMode = "updated" | "name" | "questions";

const BANKS_PER_PAGE = 25;
const ALL_FOLDER = "all" as const;

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
  return nodes
    .filter((folder) => folder.id !== id)
    .map((folder) => folder.children ? { ...folder, children: detachFolder(folder.children, id) } : folder);
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
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", status === "published" ? "border-primary-200 bg-primary-50 text-primary-800" : status === "archived" ? "border-secondary-200 bg-secondary-50 text-secondary-600" : status === "scheduled" ? "border-secondary-200 bg-secondary-50 text-secondary-700" : "border-[#ead9a5] bg-[#fff8df] text-[#856300]")}>{statusCopy(status)}</span>;
}

function FolderTree({ folders, selected, onCreate, onManage, onSelect }: { folders: FolderNode[]; onCreate: (parentId: string | null) => void; onManage: (folder: FolderNode, kind: "move" | "rename" | "remove") => void; onSelect: (id: FolderSelection) => void; selected: FolderSelection }) {
  function renderNode(folder: FolderNode, depth = 0): React.ReactNode {
    const hasChildren = Boolean(folder.children?.length);
    return <div key={folder.id ?? "unfiled"}>
      <div className="group flex items-center gap-1">
        <button aria-current={selected === folder.id ? "page" : undefined} className={cn("flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200", selected === folder.id ? "bg-primary-50 font-semibold text-primary-900" : "text-secondary-700")} onClick={() => onSelect(folder.id)} style={{ paddingLeft: `${12 + depth * 16}px` }} type="button">
          <Folder className={cn("size-4 shrink-0", selected === folder.id ? "text-primary-700" : "text-secondary-400")} />
          <span className="min-w-0 flex-1 truncate">{folder.id === null ? "Belum ditempatkan" : folder.name}</span>
          <span className="text-xs tabular-nums text-secondary-400">{folder.bankCount}</span>
        </button>
        {folder.id && folder.id !== ALL_FOLDER ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={`Kelola folder ${folder.name}`} className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={() => onCreate(folder.id)}><FolderPlus />Buat subfolder</DropdownMenuItem><DropdownMenuItem onClick={() => onManage(folder, "rename")}><Pencil />Ubah nama</DropdownMenuItem><DropdownMenuItem onClick={() => onManage(folder, "move")}><Folder />Pindahkan</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => onManage(folder, "remove")} variant="destructive"><Trash2 />Hapus folder</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}
      </div>
      {hasChildren ? <div>{folder.children?.map((child) => renderNode(child, depth + 1))}</div> : null}
    </div>;
  }

  return <div className="space-y-0.5">{folders.map((folder) => renderNode(folder))}</div>;
}

function KaptenQuestionBankPageModule({
  initialCategories,
  initialEntries,
  initialFolderTree,
  initialPage = 1,
  initialPageSize = BANKS_PER_PAGE,
  initialSearch = "",
  initialSelectedCategories = [],
  initialSelectedFolder = ALL_FOLDER,
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
  initialSelectedCategories?: string[];
  initialSelectedFolder?: FolderSelection;
  initialSelectedSubjects?: string[];
  initialStatusFilter?: string;
  initialTotal: number;
  session: SessionContext;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [folders, setFolders] = useState(initialFolderTree);
  const [categories, setCategories] = useState(initialCategories);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>(initialSelectedFolder);
  const [query, setQuery] = useState(initialSearch);
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
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryManagementOpen, setCategoryManagementOpen] = useState(false);
  const [bankCategoryId, setBankCategoryId] = useState<string | null>(null);
  const [bankCategorySelection, setBankCategorySelection] = useState<string[]>([]);
  const [organizationOpen, setOrganizationOpen] = useState(true);
  const [viewMode, setViewMode] = useState<BankViewMode>("grid");
  const [sortMode, setSortMode] = useState<BankSortMode>("updated");

  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);
  const currentFolder = selectedFolder !== ALL_FOLDER && selectedFolder !== null ? findFolder(folders, selectedFolder) : selectedFolder === null ? findFolder(folders, null) : null;
  const currentPath = selectedFolder === ALL_FOLDER ? [{ id: null, name: "Semua bank" }] : [{ id: null, name: "Semua bank" }, ...(selectedFolder === null ? [{ id: null, name: "Belum ditempatkan" }] : folderPath(folders, selectedFolder))];
  const needle = query.trim().toLowerCase();
  // The repository applies the filters and returns only the current page.
  // Keep the client-side list bounded even when the shared library is large.
  const totalPages = Math.max(1, Math.ceil(initialTotal / initialPageSize));
  const visiblePage = Math.min(page, totalPages);
  const paginatedEntries = entries;
  const childFolders = selectedFolder === ALL_FOLDER
    ? folders.filter((folder) => folder.id !== null)
    : selectedFolder && currentFolder
      ? currentFolder.children ?? []
      : [];
  const sortedEntries = useMemo(() => [...paginatedEntries].sort((left, right) => {
    if (sortMode === "name") return left.bank.title.localeCompare(right.bank.title, "id", { sensitivity: "base" });
    if (sortMode === "questions") return right.bank.questionCount - left.bank.questionCount;
    return String(right.bank.updatedAt).localeCompare(String(left.bank.updatedAt));
  }), [paginatedEntries, sortMode]);
  const selectedBank = bankMoveId ? entries.find(({ bank }) => bank.id === bankMoveId)?.bank ?? null : null;
  const categoryBank = bankCategoryId ? entries.find(({ bank }) => bank.id === bankCategoryId)?.bank ?? null : null;

  function navigateCatalogue(next: { categories?: string[]; folder?: FolderSelection; page?: number; query?: string; status?: string; subjects?: string[] } = {}) {
    const nextCategories = next.categories ?? selectedCategories;
    const nextFolder = next.folder ?? selectedFolder;
    const nextQuery = next.query ?? query;
    const nextStatus = next.status ?? statusFilter;
    const nextSubjects = next.subjects ?? selectedSubjects;
    const nextPage = next.page ?? 1;
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextFolder !== ALL_FOLDER) params.set("folder", nextFolder === null ? "unfiled" : nextFolder);
    nextCategories.forEach((id) => params.append("category", id));
    nextSubjects.forEach((code) => params.append("subtest", code));
    if (nextStatus) params.set("status", nextStatus);
    if (nextPage > 1) params.set("page", String(nextPage));
    router.push(`/mentor/quiz/question-bank${params.toString() ? `?${params.toString()}` : ""}`);
  }
  function resetPage() { setPage(1); }
  function refreshFromServer() { router.refresh(); }
  function openFolderCreate(parentId: string | null) { setFolderError(null); setFolderName(""); setFolderParentId(parentId); setFolderDialog({ kind: "create" }); }
  function openFolderManage(folder: FolderNode, kind: "move" | "rename" | "remove") {
    if (kind === "remove") {
      setPendingConfirmation({ description: `Bank di dalam folder akan dipindahkan ke tingkat induknya. Subfolder juga akan dinaikkan satu tingkat.`, label: "Hapus folder", onConfirm: () => void removeFolderFromServer(folder), title: `Hapus folder “${folder.name}”?` });
      return;
    }
    setFolderError(null);
    setFolderName(folder.name);
    setFolderParentId(folder.parentId);
    setFolderDialog({ folderId: folder.id ?? undefined, kind });
  }
  async function removeFolderFromServer(folder: FolderNode) {
    setIsApplying(true);
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
  function openBankCategories(bank: BankEntry["bank"]) { setBankCategoryId(bank.id); setBankCategorySelection(bank.categoryIds); setFolderError(null); }
  async function saveBankCategories() {
    if (!bankCategoryId || isApplying) return;
    setIsApplying(true); setFolderError(null);
    try {
      const bank = categoryBank;
      if (!bank) { setFolderError("Bank Soal tidak ditemukan. Muat ulang halaman lalu coba lagi."); return; }
      const result = await setQuestionBankCategoriesAction(bankCategoryId, bankCategorySelection, { expectedRevision: bank.revision, expectedUpdatedAt: bank.updatedAt });
      if (!result.ok) { setFolderError(result.message); return; }
      const previousCategoryIds = categoryBank?.categoryIds ?? [];
      setEntries((current) => current.map((entry) => entry.bank.id === bankCategoryId ? { ...entry, bank: { ...entry.bank, categoryIds: bankCategorySelection, categories: categories.filter((category) => bankCategorySelection.includes(category.id)).map(({ id, name }) => ({ id, name })), revision: result.result.revision, updatedAt: result.result.updatedAt } } : entry));
      setCategories((current) => current.map((category) => ({
        ...category,
        bankCount: category.bankCount
          + (bankCategorySelection.includes(category.id) ? 1 : 0)
          - (previousCategoryIds.includes(category.id) ? 1 : 0),
      })));
      setBankCategoryId(null); refreshFromServer();
    } finally { setIsApplying(false); }
  }
  async function submitCategoryDialog() {
    if (!categoryDialog || isApplying) return;
    setIsApplying(true); setFolderError(null);
    try {
      if (categoryDialog.kind === "create") {
        const result = await createQuestionBankCategoryAction(categoryName);
        if (!result.ok) { setFolderError(result.message); return; }
        setCategories((current) => [...current, result.result].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
      } else {
        const category = categories.find((item) => item.id === categoryDialog.categoryId);
        const result = await renameQuestionBankCategoryAction(categoryDialog.categoryId ?? "", categoryName, { expectedUpdatedAt: category?.updatedAt });
        if (!result.ok) { setFolderError(result.message); return; }
        setCategories((current) => current.map((item) => item.id === result.result.id ? result.result : item));
        setEntries((current) => current.map((entry) => ({ ...entry, bank: { ...entry.bank, categories: entry.bank.categories.map((item) => item.id === result.result.id ? { id: item.id, name: result.result.name } : item) } })));
      }
      setCategoryDialog(null); refreshFromServer();
    } finally { setIsApplying(false); }
  }
  function removeCategory(category: CategoryNode) {
    setPendingConfirmation({ description: "Kategori akan dilepas dari semua bank. Isi bank dan snapshot yang sudah ada tidak berubah.", label: "Hapus kategori", onConfirm: () => void (async () => { setIsApplying(true); try { const result = await removeQuestionBankCategoryAction(category.id, { expectedUpdatedAt: category.updatedAt }); if (!result.ok) { setFolderError(result.message); return; } setCategories((current) => current.filter((item) => item.id !== category.id)); setEntries((current) => current.map((entry) => ({ ...entry, bank: { ...entry.bank, categoryIds: entry.bank.categoryIds.filter((id) => id !== category.id), categories: entry.bank.categories.filter((item) => item.id !== category.id) } }))); setPendingConfirmation(null); refreshFromServer(); } finally { setIsApplying(false); } })(), title: `Hapus kategori “${category.name}”?` });
  }
  async function applyLifecycle() {
    if (!pendingLifecycle || isApplying) return;
    setIsApplying(true); setLifecycleError(null);
    try {
      const result = await updateQuestionBankLifecycleAction(pendingLifecycle.bank.id, pendingLifecycle.action, { expectedRevision: pendingLifecycle.bank.revision ?? 1 });
      if (!result.ok) { setLifecycleError(result.message); return; }
      setEntries((current) => current.map((entry) => entry.bank.id === pendingLifecycle.bank.id ? { ...entry, bank: { ...entry.bank, status: result.result.status } } : entry));
      setPendingLifecycle(null); refreshFromServer();
    } finally { setIsApplying(false); }
  }

  const lifecycleCopy = pendingLifecycle?.action === "publish" ? ["Terbitkan bank?", "Bank yang lengkap akan tersedia sebagai sumber baru.", "Terbitkan"] : pendingLifecycle?.action === "unpublish" ? ["Kembalikan ke draf?", "Bank tidak lagi tersedia sebagai sumber baru sampai diterbitkan lagi.", "Jadikan draf"] : pendingLifecycle?.action === "archive" ? ["Arsipkan bank?", "Bank disembunyikan dari sumber baru tanpa menghapus soal atau snapshot.", "Arsipkan"] : ["Pulihkan bank?", "Bank kembali sebagai draf dan dapat diatur lagi.", "Pulihkan"];
  const isGlobalSearch = Boolean(needle);

  function selectFolder(folder: FolderSelection) {
    setSelectedFolder(folder);
    resetPage();
    navigateCatalogue({ folder, page: 1 });
  }

  function renderBankCard(bank: BankEntry["bank"]) {
    const compact = viewMode === "list";
    return (
      <article className={cn("rounded-3xl border border-primary-100 bg-white shadow-sm transition-[border-color,box-shadow] hover:border-primary-200 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)]", compact ? "p-3" : "p-4")} key={bank.id}>
        <div className={cn("min-w-0", compact ? "flex flex-col gap-3 sm:flex-row sm:items-center" : "space-y-4")}>
          <div className={cn("flex min-w-0 gap-3", compact ? "flex-1 items-center" : "items-start")}>
            <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", compact ? "bg-secondary-50 text-secondary-700" : "bg-primary-50 text-primary-800")}>
              <LibraryBig className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 truncate font-semibold text-secondary-900">{bank.title}</h2>
                <StatusPill status={bank.status} />
              </div>
              <p className="mt-1 text-sm text-secondary-600">{bank.questionCount} soal · {bank.progress}% siap · {bank.difficultyMix}</p>
              {isGlobalSearch ? <p className="mt-2 flex items-center gap-1.5 text-xs text-secondary-500"><Folder className="size-3.5" />{bank.folderPath.map((item) => item.name).join(" / ")}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {bank.subjectCoverage.map((subject) => <Badge key={subject} size="ui" variant="mint">{subject}</Badge>)}
                {bank.categories.map((category) => <span className="inline-flex items-center rounded-full border border-primary-100 bg-white px-2.5 py-1 text-xs font-medium text-primary-800" key={category.id}>{category.name}</span>)}
              </div>
            </div>
          </div>
          <div className={cn("flex shrink-0 items-center gap-2", compact ? "justify-end sm:justify-start" : "flex-wrap") }>
            <Button aria-label={`Edit ${bank.title}`} className="min-h-11 min-w-11" nativeButton={false} render={<Link href={bank.href} />} size="icon-sm" title="Edit bank soal" variant="brand"><Pencil /></Button>
            <Button className="min-h-11" disabled={bank.status === "archived"} onClick={() => { setFolderParentId(bank.folderId); setFolderError(null); setBankMoveId(bank.id); }} size="sm" type="button" variant="brandOutline"><Folder />Pindahkan</Button>
            <Button className="min-h-11" disabled={bank.status === "archived"} onClick={() => openBankCategories(bank)} size="sm" type="button" variant="ghost">Kategori</Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${bank.title}`} className="min-h-11 min-w-11" size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  {bank.status === "draft" ? <DropdownMenuItem onClick={() => { setLifecycleError(null); setPendingLifecycle({ action: "publish", bank }); }}><Upload />Terbitkan</DropdownMenuItem> : null}
                  {bank.status === "published" ? <DropdownMenuItem onClick={() => { setLifecycleError(null); setPendingLifecycle({ action: "unpublish", bank }); }}><FilePenLine />Jadikan draf</DropdownMenuItem> : null}
                  {bank.status !== "archived" ? <DropdownMenuItem onClick={() => { setLifecycleError(null); setPendingLifecycle({ action: "archive", bank }); }}><Archive />Arsipkan</DropdownMenuItem> : <DropdownMenuItem onClick={() => { setLifecycleError(null); setPendingLifecycle({ action: "restore", bank }); }}><Upload />Pulihkan</DropdownMenuItem>}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </article>
    );
  }

  return <MentorWorkspaceShell activeLabel="Bank Soal" breadcrumbLabel="Bank Soal" contentElement="div" searchPlaceholder="Cari bank soal, folder, atau kategori..." session={session} showSearch={false}>
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><h1 className="text-4xl leading-tight font-semibold text-secondary-900">Bank Soal</h1><p className="mt-3 max-w-[62ch] text-sm leading-6 text-secondary-500">Satu ruang bersama untuk menyimpan, mengelompokkan, dan menerbitkan bank soal yang dapat dipakai ulang.</p></div><div className="flex flex-wrap items-center gap-2"><Button aria-controls="question-bank-organization-panel" aria-expanded={organizationOpen} className="hidden min-h-10 lg:inline-flex" onClick={() => setOrganizationOpen((open) => !open)} size="sm" type="button" variant="context"><Folder />{organizationOpen ? "Sembunyikan lokasi" : "Tampilkan lokasi"}</Button><Button aria-label="Buat bank soal baru" render={<Link href="/mentor/quiz/question-bank/create" />} size="icon-sm" title="Buat bank soal baru" variant="brand"><Plus /></Button></div></section>
      <div className={cn("grid gap-6 lg:items-start", organizationOpen ? "lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]" : "lg:grid-cols-1")}>
        <aside className={cn("hidden rounded-3xl border border-primary-100 bg-white p-4 shadow-sm lg:sticky lg:top-24", organizationOpen ? "lg:block" : "lg:hidden")} id="question-bank-organization-panel"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-secondary-900">Lokasi bank</h2><p className="mt-1 text-xs text-secondary-500">{initialTotal} bank bersama</p></div><div className="flex items-center gap-1"><Button aria-label="Kelola kategori bersama" onClick={() => setCategoryManagementOpen(true)} size="icon-sm" title="Kelola kategori bersama" type="button" variant="ghost"><Pencil /></Button><Button aria-label="Buat folder utama" onClick={() => openFolderCreate(null)} size="icon-sm" title="Buat folder utama" type="button" variant="brandOutline"><FolderPlus /></Button></div></div><div className="mt-4 border-t border-primary-100 pt-3"><FolderTree folders={[{ bankCount: initialTotal, children: folders, createdAt: "", id: ALL_FOLDER, name: "Semua bank", parentId: null, updatedAt: "" }]} onCreate={openFolderCreate} onManage={openFolderManage} onSelect={(id) => { const next = id === ALL_FOLDER ? ALL_FOLDER : id; setSelectedFolder(next); resetPage(); navigateCatalogue({ folder: next, page: 1 }); }} selected={selectedFolder} /></div></aside>
        <div className="min-w-0 space-y-4">
          <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 lg:hidden"><DropdownMenu><DropdownMenuTrigger render={<Button className="min-h-11 flex-1 justify-between" type="button" variant="context" />}><span className="flex min-w-0 items-center gap-2"><Folder className="size-4 text-primary-700" /><span className="truncate">{selectedFolder === ALL_FOLDER ? "Semua bank" : selectedFolder === null ? "Belum ditempatkan" : currentFolder?.name ?? "Pilih folder"}</span></span><ChevronDown /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-(--anchor-width)"><DropdownMenuRadioGroup onValueChange={(value) => { const next = value === ALL_FOLDER ? ALL_FOLDER : value === "unfiled" ? null : value; setSelectedFolder(next); resetPage(); navigateCatalogue({ folder: next, page: 1 }); }} value={selectedFolder === ALL_FOLDER ? ALL_FOLDER : selectedFolder === null ? "unfiled" : selectedFolder}><DropdownMenuRadioItem value={ALL_FOLDER}>Semua bank</DropdownMenuRadioItem><DropdownMenuRadioItem value="unfiled">Belum ditempatkan</DropdownMenuRadioItem>{flatFolders.map(({ depth, folder }) => <DropdownMenuRadioItem className="pl-(--dropdown-menu-item-inset)" key={folder.id} style={{ paddingLeft: `${12 + depth * 12}px` }} value={folder.id ?? ""}>{folder.name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><Button aria-label="Kelola kategori bersama" onClick={() => setCategoryManagementOpen(true)} size="icon-sm" title="Kelola kategori bersama" type="button" variant="ghost"><Pencil /></Button><Button aria-label="Buat folder utama" onClick={() => openFolderCreate(null)} size="icon-sm" title="Buat folder utama" type="button" variant="brandOutline"><FolderPlus /></Button></div>
          <nav aria-label="Breadcrumb folder" className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-secondary-500">{currentPath.map((item, index) => <span className="flex shrink-0 items-center gap-1" key={`${item.id ?? "root"}-${item.name}`}><button className={cn("rounded-lg px-1.5 py-1 hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200", index === currentPath.length - 1 ? "font-semibold text-secondary-900" : "")} onClick={() => { const next = index === 0 ? ALL_FOLDER : item.id; setSelectedFolder(next); resetPage(); navigateCatalogue({ folder: next, page: 1 }); }} type="button">{item.name}</button>{index < currentPath.length - 1 ? <ChevronRight className="size-3.5 text-secondary-300" /> : null}</span>)}</nav>
            <label className="relative block" htmlFor="question-bank-search"><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-secondary-400" /><input aria-label="Cari bank soal" className="min-h-11 w-full rounded-2xl border border-primary-100 bg-white pl-10 pr-3 text-sm text-secondary-900 outline-none transition-colors placeholder:text-secondary-400 focus:border-primary-300 focus:ring-3 focus:ring-primary-100" id="question-bank-search" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); resetPage(); navigateCatalogue({ query, page: 1 }); } }} placeholder="Cari judul, folder, subject, atau kategori..." type="search" value={query} /></label>
            <DropdownMenu><DropdownMenuTrigger render={<Button className="justify-between" type="button" variant="context" />}><span>Subject{selectedSubjects.length ? ` · ${selectedSubjects.length}` : ""}</span><ChevronDown /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>Coverage subject</DropdownMenuLabel>{kaptenSubjects.map((subject) => <DropdownMenuCheckboxItem checked={selectedSubjects.includes(subject.code)} key={subject.code} onCheckedChange={(checked) => { const next = checked ? [...selectedSubjects, subject.code] : selectedSubjects.filter((code) => code !== subject.code); setSelectedSubjects(next); resetPage(); navigateCatalogue({ subjects: next, page: 1 }); }}>{subject.code} · {subject.name}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu>
            <DropdownMenu><DropdownMenuTrigger render={<Button className="justify-between" type="button" variant="context" />}><span>Kategori{selectedCategories.length ? ` · ${selectedCategories.length}` : ""}</span><ChevronDown /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>Kategori bersama</DropdownMenuLabel>{categories.length ? categories.map((category) => <DropdownMenuCheckboxItem checked={selectedCategories.includes(category.id)} key={category.id} onCheckedChange={(checked) => { const next = checked ? [...selectedCategories, category.id] : selectedCategories.filter((id) => id !== category.id); setSelectedCategories(next); resetPage(); navigateCatalogue({ categories: next, page: 1 }); }}>{category.name}</DropdownMenuCheckboxItem>) : <div className="px-3 py-2 text-sm text-secondary-500">Belum ada kategori bersama.</div>}</DropdownMenuContent></DropdownMenu>
            <DropdownMenu><DropdownMenuTrigger render={<Button className="justify-between" type="button" variant="context" />}><span>{statusFilter ? statusCopy(statusFilter as KaptenQuestionBank["status"]) : "Status"}</span><ChevronDown /></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup onValueChange={(value) => { setStatusFilter(value); resetPage(); navigateCatalogue({ status: value, page: 1 }); }} value={statusFilter}><DropdownMenuRadioItem value="">Semua status</DropdownMenuRadioItem><DropdownMenuRadioItem value="draft">Draf</DropdownMenuRadioItem><DropdownMenuRadioItem value="published">Diterbitkan</DropdownMenuRadioItem><DropdownMenuRadioItem value="archived">Diarsipkan</DropdownMenuRadioItem><DropdownMenuRadioItem value="scheduled">Terjadwal</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
            {(query || selectedCategories.length || selectedSubjects.length || statusFilter || selectedFolder !== ALL_FOLDER) ? <Button onClick={() => { setQuery(""); setSelectedCategories([]); setSelectedSubjects([]); setStatusFilter(""); setSelectedFolder(ALL_FOLDER); resetPage(); navigateCatalogue({ categories: [], folder: ALL_FOLDER, query: "", status: "", subjects: [], page: 1 }); }} size="sm" type="button" variant="ghost">Bersihkan filter</Button> : null}
          </section>
          <div className="flex flex-col gap-3 rounded-3xl border border-primary-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800 sm:flex"><SlidersHorizontal className="size-5" /></span>
              <div className="min-w-0"><p className="font-semibold text-secondary-900">{initialTotal} bank ditemukan</p><p className="text-xs text-secondary-500">{isGlobalSearch ? "Pencarian di semua folder" : currentFolder ? `Lokasi: ${currentFolder.name}` : "Pilih folder atau cari dari seluruh koleksi"}</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button className="min-h-10" size="sm" type="button" variant="context" />}><ListFilter className="size-4" />{sortMode === "name" ? "Nama" : sortMode === "questions" ? "Jumlah soal" : "Terbaru"}<ChevronDown /></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuLabel>Urutkan koleksi</DropdownMenuLabel><DropdownMenuRadioGroup onValueChange={(value) => setSortMode(value as BankSortMode)} value={sortMode}><DropdownMenuRadioItem value="updated">Terbaru diperbarui</DropdownMenuRadioItem><DropdownMenuRadioItem value="name">Nama A–Z</DropdownMenuRadioItem><DropdownMenuRadioItem value="questions">Jumlah soal</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent>
              </DropdownMenu>
              <div aria-label="Tampilan koleksi" className="flex items-center rounded-xl border border-primary-100 bg-primary-50/50 p-0.5" role="group">
                <Button aria-label="Tampilan grid" aria-pressed={viewMode === "grid"} className="min-h-11 min-w-11" onClick={() => setViewMode("grid")} size="icon-sm" title="Tampilan grid" type="button" variant={viewMode === "grid" ? "contextSelected" : "ghost"}><LayoutGrid /></Button>
                <Button aria-label="Tampilan daftar" aria-pressed={viewMode === "list"} className="min-h-11 min-w-11" onClick={() => setViewMode("list")} size="icon-sm" title="Tampilan daftar" type="button" variant={viewMode === "list" ? "contextSelected" : "ghost"}><ListIcon /></Button>
              </div>
              {selectedFolder !== ALL_FOLDER && !isGlobalSearch ? <Button onClick={() => openFolderCreate(selectedFolder)} size="sm" type="button" variant="brandOutline"><FolderPlus />Subfolder</Button> : null}
            </div>
          </div>
          <section aria-label="Koleksi bank soal" className="space-y-5">
            {childFolders.length ? <div className="space-y-3"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-secondary-900">Folder di lokasi ini</h2><p className="text-xs text-secondary-500">Buka folder untuk melihat bank di dalamnya.</p></div><span className="text-xs tabular-nums text-secondary-500">{childFolders.length} folder</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{childFolders.map((folder) => <button aria-label={`Buka folder ${folder.name}`} className="group flex min-w-0 items-center gap-3 rounded-3xl border border-primary-100 bg-white p-4 text-left shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200" key={folder.id} onClick={() => selectFolder(folder.id)} type="button"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><Folder className="size-6" /></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-secondary-900">{folder.name}</span><span className="mt-1 block text-xs text-secondary-500">{folder.bankCount} bank{folder.children?.length ? ` · ${folder.children.length} subfolder` : ""}</span></span><ChevronRight className="size-4 shrink-0 text-secondary-300 transition-transform group-hover:translate-x-0.5" /></button>)}</div></div> : null}
            {sortedEntries.length ? <div className={viewMode === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>{sortedEntries.map(({ bank }) => renderBankCard(bank))}</div> : <div className="rounded-3xl border border-dashed border-primary-200 bg-white px-5 py-12 text-center"><LibraryBig className="mx-auto size-8 text-primary-300" /><h2 className="mt-3 font-semibold text-secondary-900">{needle ? "Tidak ada hasil pencarian" : selectedFolder === null ? "Belum ditempatkan masih kosong" : "Folder ini masih kosong"}</h2><p className="mx-auto mt-2 max-w-[48ch] text-sm leading-6 text-secondary-600">{needle ? "Coba kata kunci lain atau bersihkan filter untuk melihat semua bank." : "Buat bank baru, atau pindahkan bank yang sudah ada ke lokasi ini."}</p><Button className="mt-5" nativeButton={selectedFolder !== ALL_FOLDER} onClick={selectedFolder === ALL_FOLDER ? undefined : () => openFolderCreate(selectedFolder)} render={selectedFolder === ALL_FOLDER ? <Link href="/mentor/quiz/question-bank/create" /> : undefined} size="sm" type={selectedFolder === ALL_FOLDER ? undefined : "button"} variant="brand">{selectedFolder === ALL_FOLDER ? "Buat bank soal" : "Buat subfolder"}</Button></div>}
          </section>
          {initialTotal ? <nav aria-label="Paginasi bank soal" className="flex items-center justify-center gap-2 pt-2"><Button aria-label="Halaman sebelumnya" disabled={visiblePage === 1} onClick={() => { const next = Math.max(1, visiblePage - 1); setPage(next); navigateCatalogue({ page: next }); }} size="icon-sm" type="button" variant="brandOutline"><ChevronRight className="rotate-180" /></Button><span className="text-sm text-secondary-500">Halaman {visiblePage} dari {totalPages}</span><Button aria-label="Halaman berikutnya" disabled={visiblePage === totalPages} onClick={() => { const next = Math.min(totalPages, visiblePage + 1); setPage(next); navigateCatalogue({ page: next }); }} size="icon-sm" type="button" variant="brandOutline"><ChevronRight /></Button></nav> : null}
        </div>
      </div>
    </div>

    <Dialog onOpenChange={(open) => { if (!open && !isApplying) { setFolderDialog(null); setFolderError(null); } }} open={Boolean(folderDialog)}><DialogContent className="sm:max-w-sm" pending={isApplying}><DialogHeader><DialogTitle>{folderDialog?.kind === "create" ? "Buat folder" : folderDialog?.kind === "rename" ? "Ubah nama folder" : "Pindahkan folder"}</DialogTitle><DialogDescription>{folderDialog?.kind === "move" ? "Pilih tingkat induk baru. Folder tidak dapat dipindahkan ke dalam turunannya sendiri." : "Folder membantu tim menemukan bank tanpa mengubah isi soal."}</DialogDescription></DialogHeader>{folderDialog?.kind === "move" ? <Field><FieldLabel htmlFor="folder-parent">Folder induk</FieldLabel><select className="min-h-11 rounded-2xl border border-primary-100 bg-white px-3 text-sm text-secondary-900 outline-none focus:border-primary-300 focus:ring-3 focus:ring-primary-100" id="folder-parent" onChange={(event) => setFolderParentId(event.target.value || null)} value={folderParentId ?? ""}><option value="">Tidak ada · root</option>{flatFolders.filter(({ folder }) => folder.id !== null && folder.id !== folderDialog.folderId && !folderPath(folders, folder.id).some((item) => item.id === folderDialog.folderId)).map(({ depth, folder }) => <option key={folder.id} value={folder.id ?? ""}>{"— ".repeat(depth)}{folder.name}</option>)}</select></Field> : <Field><FieldLabel htmlFor="folder-name">Nama folder</FieldLabel><FieldInput autoFocus id="folder-name" maxLength={160} onChange={(event) => setFolderName(event.target.value)} value={folderName} /></Field>}{folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{folderError}</p> : null}<DialogFooter><Button disabled={isApplying} onClick={() => setFolderDialog(null)} type="button" variant="brandOutline">Batal</Button><Button disabled={isApplying || (folderDialog?.kind !== "move" && !folderName.trim())} onClick={() => void submitFolderDialog()} type="button" variant="brand">{isApplying ? "Menyimpan…" : "Simpan"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog onOpenChange={(open) => { if (!open && !isApplying) { setBankMoveId(null); setFolderError(null); } }} open={Boolean(bankMoveId)}><DialogContent className="sm:max-w-sm" pending={isApplying}><DialogHeader><DialogTitle>Pindahkan bank</DialogTitle><DialogDescription>{selectedBank ? `“${selectedBank.title}” tetap dapat dipakai di Quiz dan Tryout setelah dipindahkan.` : "Pilih folder tujuan untuk bank ini."}</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="bank-folder">Folder tujuan</FieldLabel><select className="min-h-11 rounded-2xl border border-primary-100 bg-white px-3 text-sm text-secondary-900 outline-none focus:border-primary-300 focus:ring-3 focus:ring-primary-100" id="bank-folder" onChange={(event) => setFolderParentId(event.target.value || null)} value={folderParentId ?? selectedBank?.folderId ?? ""}><option value="">Belum ditempatkan</option>{flatFolders.filter(({ folder }) => folder.id !== null).map(({ depth, folder }) => <option key={folder.id} value={folder.id ?? ""}>{"— ".repeat(depth)}{folder.name}</option>)}</select></Field>{folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{folderError}</p> : null}<DialogFooter><Button disabled={isApplying} onClick={() => setBankMoveId(null)} type="button" variant="brandOutline">Batal</Button><Button disabled={isApplying} onClick={() => void moveBankToFolder()} type="button" variant="brand">{isApplying ? "Memindahkan…" : "Pindahkan"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog onOpenChange={(open) => { if (!open && !isApplying) { setBankCategoryId(null); setFolderError(null); } }} open={Boolean(bankCategoryId)}><DialogContent className="sm:max-w-sm" pending={isApplying}><DialogHeader><DialogTitle>Kelola kategori</DialogTitle><DialogDescription>{categoryBank ? `Pilih label untuk “${categoryBank.title}”. Kategori hanya mengatur penemuan, bukan isi soal.` : "Pilih kategori untuk bank ini."}</DialogDescription></DialogHeader><div className="grid gap-2">{categories.length ? categories.map((category) => <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-primary-100 px-3 text-sm text-secondary-700 hover:bg-primary-50/60" key={category.id}><input checked={bankCategorySelection.includes(category.id)} className="size-4 accent-primary-700" onChange={(event) => setBankCategorySelection((current) => event.target.checked ? [...current, category.id] : current.filter((id) => id !== category.id))} type="checkbox" />{category.name}</label>) : <p className="text-sm text-secondary-500">Belum ada kategori. Buat dari menu kategori.</p>}</div>{folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{folderError}</p> : null}<DialogFooter><Button disabled={isApplying} onClick={() => setBankCategoryId(null)} type="button" variant="brandOutline">Batal</Button><Button disabled={isApplying} onClick={() => void saveBankCategories()} type="button" variant="brand">{isApplying ? "Menyimpan…" : "Simpan kategori"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog onOpenChange={(open) => { if (!open && !isApplying) { setCategoryManagementOpen(false); setCategoryDialog(null); setFolderError(null); } }} open={categoryManagementOpen}><DialogContent className="sm:max-w-sm" pending={isApplying}><DialogHeader><DialogTitle>Kelola kategori bersama</DialogTitle><DialogDescription>Buat kosakata bersama agar semua tutor dapat menemukan bank dengan cepat.</DialogDescription></DialogHeader><div className="flex flex-wrap gap-2"><Button onClick={() => { setCategoryName(""); setCategoryDialog({ kind: "create" }); }} size="sm" type="button" variant="brandOutline"><Plus />Buat kategori</Button></div><div className="grid gap-2">{categories.map((category) => <div className="flex min-h-11 items-center gap-2 rounded-2xl border border-primary-100 px-3" key={category.id}><span className="min-w-0 flex-1 truncate text-sm text-secondary-700">{category.name}</span><span className="text-xs text-secondary-400">{category.bankCount}</span><Button aria-label={`Ubah kategori ${category.name}`} onClick={() => { setCategoryName(category.name); setCategoryDialog({ categoryId: category.id, kind: "rename" }); }} size="icon-sm" type="button" variant="ghost"><Pencil /></Button><Button aria-label={`Hapus kategori ${category.name}`} onClick={() => removeCategory(category)} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button></div>)}{!categories.length ? <p className="rounded-2xl bg-primary-50/50 px-3 py-4 text-sm text-secondary-500">Belum ada kategori bersama.</p> : null}</div>{folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{folderError}</p> : null}</DialogContent></Dialog>

    <Dialog onOpenChange={(open) => { if (!open && !isApplying) { setCategoryDialog(null); setFolderError(null); } }} open={Boolean(categoryDialog)}><DialogContent className="sm:max-w-sm" pending={isApplying}><DialogHeader><DialogTitle>{categoryDialog?.kind === "create" ? "Buat kategori" : "Ubah kategori"}</DialogTitle><DialogDescription>Kategori bersifat datar dan dapat dipakai lintas bank.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="category-name">Nama kategori</FieldLabel><FieldInput autoFocus id="category-name" maxLength={120} onChange={(event) => setCategoryName(event.target.value)} value={categoryName} /></Field>{folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{folderError}</p> : null}<DialogFooter><Button disabled={isApplying} onClick={() => setCategoryDialog(null)} type="button" variant="brandOutline">Batal</Button><Button disabled={isApplying || !categoryName.trim()} onClick={() => void submitCategoryDialog()} type="button" variant="brand">{isApplying ? "Menyimpan…" : "Simpan"}</Button></DialogFooter></DialogContent></Dialog>

    <AlertDialog onOpenChange={(open) => { if (!open && !isApplying) { setPendingLifecycle(null); setPendingConfirmation(null); setLifecycleError(null); } }} open={Boolean(pendingLifecycle || pendingConfirmation)}><AlertDialogContent pending={isApplying} size="sm" variant={pendingConfirmation ? "danger" : pendingLifecycle?.action === "archive" ? "warning" : "info"}><AlertDialogHeader><AlertDialogMedia variant={pendingConfirmation ? "danger" : pendingLifecycle?.action === "archive" ? "warning" : "info"}><CircleHelp /></AlertDialogMedia><AlertDialogTitle>{pendingConfirmation?.title ?? lifecycleCopy[0]}</AlertDialogTitle><AlertDialogDescription>{pendingConfirmation?.description ?? lifecycleCopy[1]}</AlertDialogDescription></AlertDialogHeader>{lifecycleError || folderError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{lifecycleError ?? folderError}</p> : null}<AlertDialogFooter><AlertDialogCancel disabled={isApplying} onClick={() => { setPendingLifecycle(null); setPendingConfirmation(null); }} >Batal</AlertDialogCancel><AlertDialogAction disabled={isApplying} onClick={() => { if (pendingConfirmation) { pendingConfirmation.onConfirm(); } else { void applyLifecycle(); } }} variant={pendingConfirmation ? "destructive" : "brand"}>{isApplying ? "Memproses…" : pendingConfirmation?.label ?? lifecycleCopy[2]}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </MentorWorkspaceShell>;
}

export { KaptenQuestionBankPageModule };

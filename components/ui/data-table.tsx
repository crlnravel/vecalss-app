"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowDown,
  ArrowUp,
  ListFilter,
  LoaderCircle,
  MoreHorizontal,
  Search,
  TableIcon,
  X,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

type DataTableColumn<T> = {
  cell: (row: T) => ReactNode;
  cellClassName?: string;
  defaultVisible?: boolean;
  headerClassName?: string;
  id: string;
  label: string;
  sortKey?: string;
  hideable?: boolean;
  width?: number;
};

type DataTableSortDirection = "asc" | "desc";

type DataTableSort = {
  direction: DataTableSortDirection;
  href: (key: string | null, direction: DataTableSortDirection) => string;
  key: string | null;
};

type DataTableFilter = {
  href?: string;
  id: string;
  label: string;
  value: string;
};

type DataTableSearch = {
  action?: string;
  clearHref?: string;
  hiddenFields?: Readonly<Record<string, string | readonly string[]>>;
  label?: string;
  placeholder?: string;
  value?: string;
};

type DataTableSelection<T> = {
  ids: readonly string[];
  rows: readonly T[];
};

type DataTableProps<T> = {
  caption: string;
  columns: readonly DataTableColumn<T>[];
  filterPanel?: ReactNode;
  filters?: readonly DataTableFilter[];
  clearFiltersHref?: string;
  getRowId: (row: T) => string;
  isLoading?: boolean;
  loadingLabel?: string;
  moreMenu?: ReactNode;
  rowClassName?: (row: T, selected: boolean) => string | undefined;
  rowContextMenu?: (row: T) => ReactNode;
  rowProps?: (row: T) => ComponentProps<typeof TableRow>;
  rows: readonly T[];
  onRowClick?: (row: T) => void;
  rowNumberOffset?: number;
  search?: DataTableSearch;
  showColumnVisibility?: boolean;
  showRowNumbers?: boolean;
  sort?: DataTableSort;
  selection?: boolean;
  selectionActions?: (selection: DataTableSelection<T>) => ReactNode;
  tableClassName?: string;
  emptyState?: ReactNode;
};

function DataTableFilterChips({
  clearFiltersHref,
  filters,
}: {
  clearFiltersHref?: string;
  filters: readonly DataTableFilter[];
}) {
  if (!filters.length) {
    return null;
  }

  return (
    <div aria-label="Filter tabel aktif" className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
      {filters.map((filter) => (
        <span
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-secondary-50 px-2.5 py-1.5 text-xs text-secondary-700"
          key={filter.id}
        >
          <span className="font-semibold text-secondary-900">{filter.label}</span>
           <span className="text-secondary-400">adalah</span>
          <span className="max-w-[16rem] truncate" title={filter.value}>{filter.value}</span>
          {filter.href ? (
            <Link
               aria-label={`Hapus filter ${filter.label}`}
              className="ml-0.5 inline-flex size-5 items-center justify-center rounded-md text-secondary-500 transition-colors hover:bg-white hover:text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30"
              href={filter.href}
            >
              <X aria-hidden="true" size={13} />
            </Link>
          ) : null}
        </span>
      ))}
      {clearFiltersHref ? (
        <Link
          className={cn(buttonVariants({ size: "xs", variant: "ghost" }), "ml-1 text-secondary-600")}
          href={clearFiltersHref}
        >
           Hapus semua
        </Link>
      ) : null}
    </div>
  );
}

function getDefaultVisibleColumnIds<T>(columns: readonly DataTableColumn<T>[]) {
  const ids = new Set<string>();

  for (const column of columns) {
    if (column.defaultVisible !== false) {
      ids.add(column.id);
    }
  }

  return ids;
}

type DataTableGridProps<T> = {
  areAllVisibleSelected: boolean;
  caption: string;
  emptyState?: ReactNode;
  getRowId: (row: T) => string;
  hasPartialSelection: boolean;
  isLoading: boolean;
  loadingLabel?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, selected: boolean) => string | undefined;
  rowContextMenu?: (row: T) => ReactNode;
  rowProps?: (row: T) => ComponentProps<typeof TableRow>;
  rowNumberOffset: number;
  rowIsClickable: boolean;
  showRowNumbers: boolean;
  rows: readonly T[];
  selectedIds: Set<string>;
  selection: boolean;
  sort?: DataTableSort;
  tableClassName?: string;
  toggleAllVisible: (checked: boolean) => void;
  toggleSelected: (id: string, checked: boolean) => void;
  visibleColumnWidthTotal: number;
  visibleColumns: readonly DataTableColumn<T>[];
};

function DataTableSortHeader<T>({
  column,
  sort,
}: {
  column: DataTableColumn<T>;
  sort: DataTableSort;
}) {
  if (!column.sortKey) {
    return column.label;
  }

  const sorted = sort.key === column.sortKey ? sort.direction : null;
  const nextSortKey = sorted === "desc" ? null : column.sortKey;
  const nextDirection: DataTableSortDirection = sorted === "asc" ? "desc" : "asc";
   const nextAction = nextSortKey === null
     ? "hapus pengurutan"
     : `urutkan ${nextDirection === "desc" ? "menurun" : "menaik"}`;

  return (
    <Link
       aria-label={`Urutkan berdasarkan ${column.label}; aktifkan untuk ${nextAction}`}
      className="group inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs font-semibold tracking-[0.02em] text-secondary-700 transition-colors hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20"
      href={sort.href(nextSortKey, nextDirection)}
      prefetch={false}
    >
      <span>{column.label}</span>
      {sorted ? (
        <span aria-hidden="true" className="inline-flex items-center text-primary-700">
          {sorted === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </span>
      ) : null}
    </Link>
  );
}

function DataTableGrid<T>({
  areAllVisibleSelected,
  caption,
  emptyState,
  getRowId,
  hasPartialSelection,
  isLoading,
  loadingLabel,
  onRowClick,
  rowClassName,
  rowNumberOffset,
  rowContextMenu,
  rowProps,
  rowIsClickable,
  showRowNumbers,
  rows,
  selectedIds,
  selection,
  sort,
  tableClassName,
  toggleAllVisible,
  toggleSelected,
  visibleColumnWidthTotal,
  visibleColumns,
}: DataTableGridProps<T>) {
  return (
    <Table aria-busy={isLoading} className={cn("min-w-[760px] table-fixed border-separate border-spacing-y-0", tableClassName)}>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow className="border-0 bg-secondary-50/80 hover:bg-secondary-50/80">
          {showRowNumbers ? (
            <TableHead className="w-14 rounded-l-xl px-3 py-2.5 text-center sm:px-4">
              No.
            </TableHead>
          ) : selection ? (
            <TableHead className="w-12 rounded-l-xl px-4 py-2.5 sm:px-5">
              <Checkbox
                aria-checked={hasPartialSelection ? "mixed" : areAllVisibleSelected}
                 aria-label={hasPartialSelection || areAllVisibleSelected ? "Hapus pilihan semua baris di halaman ini" : "Pilih semua baris di halaman ini"}
                checked={areAllVisibleSelected}
                indeterminate={hasPartialSelection}
                onCheckedChange={(checked) => {
                  if (hasPartialSelection) {
                    toggleAllVisible(false);
                    return;
                  }

                  toggleAllVisible(checked === true);
                }}
              />
            </TableHead>
          ) : null}
          {visibleColumns.map((column, index) => (
            <TableHead
              aria-sort={column.sortKey && sort
                ? sort.key === column.sortKey
                  ? sort.direction === "asc" ? "ascending" : "descending"
                  : "none"
                : undefined}
              className={cn(
                "h-11 px-4 py-2.5 text-xs font-medium tracking-[0.02em] text-secondary-700 sm:px-5",
                index === 0 && !selection && !showRowNumbers && "rounded-l-xl",
                index === visibleColumns.length - 1 && "rounded-r-xl",
                column.headerClassName,
              )}
              key={column.id}
              style={{ width: `${((column.width ?? 1) / visibleColumnWidthTotal) * 100}%` }}
            >
              {column.sortKey && sort ? <DataTableSortHeader column={column} sort={sort} /> : column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell className="px-5 py-10 text-center" colSpan={visibleColumns.length + (selection || showRowNumbers ? 1 : 0)}>
              <div aria-live="polite" className="flex items-center justify-center gap-2 text-sm text-secondary-700" role="status">
                <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" size={17} />
                 <span>{loadingLabel ?? "Memuat…"}</span>
              </div>
            </TableCell>
          </TableRow>
        ) : rows.length ? rows.map((row, rowIndex) => {
          const id = getRowId(row);
          const selected = selectedIds.has(id);
          const additionalRowProps = rowProps?.(row);
          const contextMenu = rowContextMenu?.(row);
          const rowIsInteractive = rowIsClickable || Boolean(contextMenu);
          const rowInteractionProps = rowIsClickable && onRowClick
            ? {
                onClick: (event: MouseEvent<HTMLTableRowElement>) => {
                  additionalRowProps?.onClick?.(event);
                  if (
                    event.defaultPrevented ||
                    (event.target instanceof Element && event.target.closest("a,button,input,select,textarea,[role='button'],[role='checkbox']"))
                  ) {
                    return;
                  }

                  onRowClick(row);
                },
                onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                  additionalRowProps?.onKeyDown?.(event);
                  if (
                    event.defaultPrevented ||
                    (event.target instanceof Element && event.target.closest("a,button,input,select,textarea,[role='button'],[role='checkbox']"))
                  ) {
                    return;
                  }

                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRowClick(row);
                  }
                },
                tabIndex: 0,
              }
            : contextMenu
              ? { tabIndex: 0 }
            : undefined;
          const tableRow = (
            <TableRow
              {...additionalRowProps}
              {...rowInteractionProps}
              aria-haspopup={contextMenu ? "menu" : undefined}
              aria-selected={selection ? selected : undefined}
              className={cn(
                "border-primary-100/55 transition-colors hover:bg-secondary-50/70",
                selected && "bg-primary-50/60 hover:bg-primary-50/80",
                rowIsInteractive && "cursor-pointer focus-visible:bg-primary-50/60 focus-visible:outline-2 focus-visible:outline-primary-700/20 focus-visible:outline-offset-[-2px]",
                rowClassName?.(row, selected),
                additionalRowProps?.className,
              )}
              key={id}
            >
              {showRowNumbers ? (
                <TableCell className="w-14 px-3 py-3.5 text-center text-sm font-semibold tabular-nums text-secondary-500 sm:px-4" key="row-number">
                  {rowNumberOffset + rowIndex + 1}
                </TableCell>
              ) : selection ? (
                <TableCell className="w-12 px-4 py-3.5 sm:px-5" key="selection">
                  <Checkbox
                     aria-label={`Pilih baris ${id}`}
                    checked={selected}
                    onCheckedChange={(checked) => toggleSelected(id, checked === true)}
                  />
                </TableCell>
              ) : null}
              {visibleColumns.map((column) => (
                <TableCell className={cn("px-4 py-3.5 sm:px-5", column.cellClassName)} key={column.id}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          );

          return contextMenu ? (
            <ContextMenu key={id}>
              <ContextMenuTrigger render={tableRow} />
              {contextMenu}
            </ContextMenu>
          ) : tableRow;
        }) : (
          <TableRow className="hover:bg-transparent">
            <TableCell className="px-0 py-10 text-center" colSpan={visibleColumns.length + (selection || showRowNumbers ? 1 : 0)}>
              {emptyState ?? <span className="text-sm text-secondary-700">Tidak ada hasil.</span>}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function DataTable<T>({
  caption,
  clearFiltersHref,
  columns,
  emptyState,
  filterPanel,
  filters = [],
  getRowId,
  isLoading = false,
  loadingLabel,
  moreMenu,
  onRowClick,
  rowContextMenu,
  rowClassName,
  rowProps,
  rows,
  rowNumberOffset = 0,
  search,
  showColumnVisibility = true,
  showRowNumbers = false,
  sort,
  selection = false,
  selectionActions,
  tableClassName,
}: DataTableProps<T>) {
  const router = useRouter();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchValue, setSearchValue] = useState(() => search?.value ?? "");
  const [isSearchDebouncing, setIsSearchDebouncing] = useState(false);
  const [isSearchPending, startSearchTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(
    () => getDefaultVisibleColumnIds(columns),
  );

  const visibleIds = rows.map((row) => getRowId(row));
  const tableIsLoading = isLoading || isSearchDebouncing || isSearchPending;
  const visibleColumns = columns.filter((column) => visibleColumnIds.has(column.id));
  const visibleColumnWidthTotal = visibleColumns.reduce((total, column) => total + (column.width ?? 1), 0);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const selectedRows = rows.filter((row) => selectedIds.has(getRowId(row)));
  const areAllVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const hasPartialSelection = selectedVisibleCount > 0 && !areAllVisibleSelected;
  const hasCustomColumnVisibility = columns.some((column) => {
    const isVisible = visibleColumnIds.has(column.id);
    return isVisible !== (column.defaultVisible !== false);
  });

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  };

  const resetColumns = () => {
    setVisibleColumnIds(getDefaultVisibleColumnIds(columns));
  };

  const rowIsClickable = Boolean(onRowClick);
  const hasSelection = selection && selectedVisibleCount > 0;
  const hasTableMenu = selection || showColumnVisibility || Boolean(moreMenu);
  const selectionActionMenu = hasSelection
    ? selectionActions?.({
        ids: selectedRows.map((row) => getRowId(row)),
        rows: selectedRows,
      })
    : null;

  const cancelPendingSearch = () => {
    setIsSearchDebouncing(false);
    if (searchDebounceRef.current !== null) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  };

  useEffect(() => () => {
    if (searchDebounceRef.current !== null) {
      clearTimeout(searchDebounceRef.current);
    }
  }, []);

  const navigateToSearch = (value: string) => {
    if (!search) {
      return;
    }

    const target = new URL(search.action ?? window.location.pathname, window.location.origin);
    const params = new URLSearchParams();

    if (value) {
      params.set("q", value);
    }

    if (search.hiddenFields) {
      Object.entries(search.hiddenFields).forEach(([name, hiddenValue]) => {
        const values = Array.isArray(hiddenValue) ? hiddenValue : [hiddenValue];
        values.filter(Boolean).forEach((value) => params.append(name, value));
      });
    }

    target.search = params.toString();
    setIsSearchDebouncing(false);
    startSearchTransition(() => {
      router.replace(`${target.pathname}${target.search}`, { scroll: false });
    });
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value;
    setSearchValue(nextValue);

    cancelPendingSearch();
    setIsSearchDebouncing(true);

    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      navigateToSearch(nextValue);
    }, 350);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    cancelPendingSearch();
    navigateToSearch(searchValue);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        {search ? (
          <form aria-busy={tableIsLoading} action={search.action} className="relative min-w-[min(100%,18rem)] flex-1 rounded-2xl border border-primary-100 bg-primary-50/45 transition-[border-color,box-shadow,background-color] focus-within:border-primary-500 focus-within:bg-primary-50/70 focus-within:ring-3 focus-within:ring-primary-500/25" method="get" onSubmit={handleSearchSubmit}>
            {isSearchDebouncing || isSearchPending ? (
              <LoaderCircle aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 animate-spin text-secondary-400" size={17} />
            ) : (
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary-400" size={17} />
            )}
             <label className="sr-only" htmlFor="data-table-search">{search.label ?? "Cari tabel"}</label>
            <input
              className="h-11 w-full rounded-2xl border-0 bg-transparent py-2.5 pl-10 pr-9 text-sm text-secondary-900 outline-none transition-[color,background-color] placeholder:text-secondary-600 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-500/30"
              id="data-table-search"
              name="q"
              onChange={handleSearchChange}
               placeholder={search.placeholder ?? "Cari di tabel ini…"}
              type="search"
              value={searchValue}
            />
            {search.hiddenFields
              ? Object.entries(search.hiddenFields).flatMap(([name, hiddenValue]) => {
                  const values = Array.isArray(hiddenValue) ? hiddenValue : [hiddenValue];
                  return values.map((value) => (
                    <input key={`${name}-${value}`} name={name} type="hidden" value={value} />
                  ));
                })
              : null}
            {search.value && search.clearHref ? (
              <Link
                 aria-label="Hapus pencarian tabel"
                className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-secondary-400 transition-colors hover:bg-secondary-50 hover:text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30"
                href={search.clearHref}
                onClick={cancelPendingSearch}
              >
                <X aria-hidden="true" size={14} />
              </Link>
            ) : null}
          </form>
        ) : <div className="min-w-0 flex-1" />}

        <div className="flex items-center gap-2">
          {filterPanel ? (
            <Popover>
              <PopoverTrigger
                 render={<Button aria-label="Buka filter tabel" className="rounded-lg aria-expanded:bg-secondary-50" size="icon-sm" type="button" variant={filters.length ? "contextSelected" : "ghost"} />}
              >
                <ListFilter aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(19rem,calc(100vw-2rem))] gap-2 rounded-lg p-2">
                {filterPanel}
              </PopoverContent>
            </Popover>
          ) : null}

          {hasTableMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button aria-label={hasSelection ? "Buka aksi massal" : showColumnVisibility ? "Pilih kolom tabel" : "Buka aksi tabel"} className="size-9 rounded-lg text-secondary-500" size="icon-sm" type="button" variant="ghost" />}
              >
                {hasSelection || !showColumnVisibility ? <MoreHorizontal aria-hidden="true" /> : <TableIcon aria-hidden="true" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl" keepMounted>
                {hasSelection ? (
                  <>
                    <DropdownMenuLabel className="font-semibold text-secondary-900">Aksi massal</DropdownMenuLabel>
                    {selectionActionMenu}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setSelectedIds(new Set())}>Hapus pilihan</DropdownMenuItem>
                  </>
                ) : (
                  <>
                    {showColumnVisibility ? (
                      <>
                        <DropdownMenuLabel className="font-semibold text-secondary-900">Pilih kolom</DropdownMenuLabel>
                        {columns.reduce<ReactNode[]>((items, column) => {
                          if (column.hideable === false) {
                            return items;
                          }

                          items.push(
                            <DropdownMenuCheckboxItem
                              checked={visibleColumnIds.has(column.id)}
                              key={column.id}
                              onCheckedChange={(checked) => {
                                if (!checked && visibleColumns.length <= 1) {
                                  return;
                                }

                                setVisibleColumnIds((current) => {
                                  const next = new Set(current);
                                  if (checked) {
                                    next.add(column.id);
                                  } else {
                                    next.delete(column.id);
                                  }
                                  return next;
                                });
                              }}
                            >
                              {column.label}
                            </DropdownMenuCheckboxItem>,
                          );
                          return items;
                        }, [])}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={!hasCustomColumnVisibility} onClick={resetColumns}>
                          Atur ulang kolom
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {moreMenu ? (
                      <>
                        {showColumnVisibility ? <DropdownMenuSeparator /> : null}
                        {moreMenu}
                      </>
                    ) : null}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

        </div>
      </div>

      <DataTableFilterChips clearFiltersHref={clearFiltersHref} filters={filters} />

      <DataTableGrid
        areAllVisibleSelected={areAllVisibleSelected}
        caption={caption}
        emptyState={emptyState}
        getRowId={getRowId}
        hasPartialSelection={hasPartialSelection}
        isLoading={tableIsLoading}
        loadingLabel={loadingLabel}
        onRowClick={onRowClick}
        rowClassName={rowClassName}
        rowNumberOffset={rowNumberOffset}
        rowContextMenu={rowContextMenu}
        rowIsClickable={rowIsClickable}
        rowProps={rowProps}
        rows={rows}
        selectedIds={selectedIds}
        showRowNumbers={showRowNumbers && !selection}
        selection={selection}
        sort={sort}
        tableClassName={tableClassName}
        toggleAllVisible={toggleAllVisible}
        toggleSelected={toggleSelected}
        visibleColumnWidthTotal={visibleColumnWidthTotal}
        visibleColumns={visibleColumns}
      />
    </>
  );
}

export { DataTable };
export type { DataTableColumn, DataTableFilter, DataTableProps, DataTableSearch, DataTableSelection, DataTableSort, DataTableSortDirection };

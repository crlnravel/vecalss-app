"use client";

import { type ReactNode, type ComponentProps } from "react";
import { Funnel } from "@phosphor-icons/react";
import { flexRender, type ColumnDef, type Table as TanStackTable } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Table, TableHeader, TableBody, TableHead, TableCell, TableRow, TableCaption } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationPage, PaginationPrevious, PaginationNext, PaginationEllipsis } from "@/components/ui/pagination";
import { fieldLabelClassName } from "@/components/ui/field-constants";
import { Check, ChevronDown, MoreHorizontal, Search, X } from "@/lib/icons";
import styles from "../quiz-dashboard.module.css";

export function MentorGridMenu({
  children,
  trigger,
  label,
  className,
  disabled = false,
}: {
  children: ReactNode;
  trigger: ReactNode;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={className === styles.iconButton ? "quiet" : "outline"}
            size={className === styles.iconButton ? "icon-sm" : "xs"}
          />
        }
        className={className}
        disabled={disabled}
        aria-label={label}
      >
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}


export function MentorAssessmentGrid<T>({
  table, caption, label, columnLabels = {}, numericColumns = [], headerTitles = {},
  emptyState, loadingState, onRowOpen, wrapRow,
}: {
  table: TanStackTable<T>;
  caption: string;
  label: string;
  columnLabels?: Record<string, string>;
  numericColumns?: string[];
  headerTitles?: Record<string, string>;
  emptyState: ReactNode;
  loadingState?: ReactNode;
  onRowOpen?: (row: T) => void;
  wrapRow?: (row: T, element: ReactNode) => ReactNode;
}) {
  const cellClassName = (id: string) => id === "select" ? styles.selectionCell : id === "thumbnail" ? styles.thumbnailCell : id === "title" ? styles.titleCell : undefined;
  const rowProps = (original: T): ComponentProps<typeof TableRow> => onRowOpen ? {
    tabIndex: 0,
    onClick: (event) => {
      if (event.target instanceof Element && event.target.closest("a,button,input,[role='button'],[role='checkbox']")) return;
      onRowOpen(original);
    },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      onRowOpen(original);
    },
    className: "bg-voyage-surface cursor-pointer focus-visible:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-700/20 focus-visible:outline-offset-[-2px]",
  } : { className: "bg-voyage-surface" };
  return (
    <div className={styles.viewport} tabIndex={0} role="region" aria-label={label}>
      <Table className={styles.table} density="compact">
        <TableCaption className={styles.srOnly}>{caption}</TableCaption>
        <colgroup>
          {table.getVisibleLeafColumns().map((column) => <col key={column.id} style={{ width: column.id === "title" ? undefined : column.getSize() }} />)}
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="bg-voyage-surface">
              {group.headers.map((header) => (
                <TableHead key={header.id} scope="col" className={`${fieldLabelClassName} text-[12px] ${cellClassName(header.column.id) ?? ""}`} data-numeric={numericColumns.includes(header.column.id)} title={headerTitles[header.column.id]}>
                  {columnLabels[header.column.id] ?? flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loadingState ? <TableRow className="hover:bg-transparent"><TableCell className={styles.empty} colSpan={table.getVisibleLeafColumns().length}>{loadingState}</TableCell></TableRow> :
            table.getRowModel().rows.map((row) => {
              const element = (
                <TableRow key={row.id} {...rowProps(row.original)} aria-haspopup={wrapRow ? "menu" : undefined} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cellClassName(cell.column.id)} data-numeric={numericColumns.includes(cell.column.id)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
              return wrapRow ? wrapRow(row.original, element) : element;
            })}
          {!loadingState && !table.getRowModel().rows.length && <TableRow className="hover:bg-transparent"><TableCell className={styles.empty} colSpan={table.getVisibleLeafColumns().length}>{emptyState}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

export function MentorAssessmentPagination({
  page, pageSize, pageCount, total, disabled = false, label,
  onPageChange, onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  disabled?: boolean;
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pages = Array.from(new Set([1, ...Array.from({ length: 3 }, (_, index) => page - 1 + index).filter((number) => number > 0 && number <= pageCount), pageCount])).sort((a, b) => a - b);
  return (
        <div className={styles.footer}>
          <div className={styles.pageSize}>
            <span>Baris per halaman</span>
            <MentorGridMenu
              label="Baris per halaman"
              trigger={
                <>
                  {pageSize}
                  <ChevronDown size={14} />
                </>
              }
            >
              {[6, 10, 20, 50].map((size) => (
                <DropdownMenuItem
                  size="sm"
                  key={size}
                  onClick={() => onPageSizeChange(size)}
                >
                  {size}
                  {pageSize === size && <Check />}
                </DropdownMenuItem>
              ))}
            </MentorGridMenu>
          </div>
          <div className={styles.pagination}>
            <span className={styles.range}>
              {total ? (page - 1) * pageSize + 1 : 0}–
              {Math.min(page * pageSize, total)} dari{" "}
              {total}
            </span>
            <Pagination
              size="sm"
              aria-label={label}
              className="mx-0 w-auto"
            >
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    minimal
                    aria-label="Halaman sebelumnya"
                    disabled={disabled || page === 1}
                    onClick={() => onPageChange(page - 1)}
                  />
                </PaginationItem>
                {pages.map((pageNumber, index) => (
                  <PaginationItem key={pageNumber} className="flex items-center">
                    {index > 0 && pageNumber - pages[index - 1] > 1 && (
                      <PaginationEllipsis />
                    )}
                    <PaginationPage
                      minimal
                      isActive={page === pageNumber}
                      aria-label={`Halaman ${pageNumber}`}
                      disabled={disabled}
                      onClick={() => onPageChange(pageNumber)}
                    >
                      {pageNumber}
                    </PaginationPage>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    minimal
                    aria-label="Halaman berikutnya"
                    disabled={
                      disabled || page === pageCount
                    }
                    onClick={() => onPageChange(page + 1)}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>

  );
}

/** The bordered surface every Kapten assessment list (Kuis, Tryout) renders its toolbar, grid and footer in. */
export function MentorAssessmentPanel({ label, busy = false, children }: { label: string; busy?: boolean; children: ReactNode }) {
  return <section className={styles.panel} aria-label={label} aria-busy={busy} data-quiz-dashboard>{children}</section>;
}

/** Search, filters and (when rows are selected) bulk tools in one row above the grid. */
export function MentorAssessmentToolbar({ search, filters, bulk, hasSelection = false }: { search: ReactNode; filters?: ReactNode; bulk?: ReactNode; hasSelection?: boolean }) {
  return (
    <div className={styles.toolbar} data-selected={hasSelection}>
      {search}
      {filters ? <div className={styles.filters}>{filters}</div> : null}
      {bulk}
    </div>
  );
}

/**
 * Search box. By default it searches on submit and remounts when `value` changes so the field follows the
 * applied query; pass `onValueChange` instead to filter on every keystroke (client-side lists).
 */
export function MentorAssessmentSearch({ value, placeholder, label, disabled = false, onSearch, onValueChange }: { value: string; placeholder: string; label: string; disabled?: boolean; onSearch?: (query: string) => void; onValueChange?: (query: string) => void }) {
  return (
    <form className={styles.search} onSubmit={(event) => { event.preventDefault(); onSearch?.(String(new FormData(event.currentTarget).get("q") ?? "")); }}>
      <Search aria-hidden="true" />
      {onValueChange ? (
        <Input className="pl-9" name="q" value={value} onChange={(event) => onValueChange(event.target.value)} placeholder={placeholder} aria-label={label} type="search" disabled={disabled} />
      ) : (
        <Input className="pl-9" name="q" key={value} defaultValue={value} placeholder={placeholder} aria-label={label} type="search" disabled={disabled} />
      )}
    </form>
  );
}

export type MentorFilterOption = { key: string; label: ReactNode; active?: boolean; onSelect: () => void };

export function MentorFilterMenu({ label, trigger, options, className, disabled = false }: { label: string; trigger: ReactNode; options: MentorFilterOption[]; className?: string; disabled?: boolean }) {
  return (
    <MentorGridMenu className={className} disabled={disabled} label={label} trigger={trigger}>
      {options.map((option) => (
        <DropdownMenuItem size="sm" key={option.key} onClick={option.onSelect}>
          {option.label}
          {option.active && <Check />}
        </DropdownMenuItem>
      ))}
    </MentorGridMenu>
  );
}

/** The funnel-and-count "Status" filter shared by the assessment lists. */
export function MentorStatusFilterMenu({ options, activeCount = 0, label = "Filter status", disabled = false }: { options: MentorFilterOption[]; activeCount?: number; label?: string; disabled?: boolean }) {
  return (
    <MentorFilterMenu
      disabled={disabled}
      label={label}
      options={options}
      trigger={<><Funnel />Status{activeCount > 0 && <Badge size="xs" tone="neutral">{activeCount}</Badge>}</>}
    />
  );
}

export type MentorFilterChip = { key: string; label: string; ariaLabel?: string; onRemove: () => void };

export function MentorFilterChips({ chips, onClearAll }: { chips: MentorFilterChip[]; onClearAll: () => void }) {
  if (!chips.length) return null;
  return (
    <div className={styles.chips} role="group" aria-label="Filter aktif">
      {chips.map((chip) => (
        <Button key={chip.key} type="button" size="sm" variant="quiet" className="px-0" aria-label={chip.ariaLabel ?? `Hapus filter ${chip.label}`} onClick={chip.onRemove}>
          <Badge size="sm" tone="category">{chip.label}<X className="size-3" aria-hidden="true" /></Badge>
        </Button>
      ))}
      <Button size="sm" variant="quiet" type="button" onClick={onClearAll}>Hapus semua</Button>
    </div>
  );
}

/** The "..." menu that appears in the toolbar while rows are selected. */
export function MentorBulkMenu({ label, disabled = false, children }: { label: string; disabled?: boolean; children: ReactNode }) {
  return (
    <div className={styles.bulkTools}>
      <MentorGridMenu className={styles.iconButton} disabled={disabled} label={label} trigger={<MoreHorizontal size={16} />}>{children}</MentorGridMenu>
    </div>
  );
}

/** Per-item failures from a bulk action, listed above the grid until dismissed. */
export function MentorAssessmentFeedback({ heading, items, onClose }: { heading: string; items: string[]; onClose: () => void }) {
  return (
    <div className={styles.feedback} role="status">
      <div>
        <p>{heading}</p>
        <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
      </div>
      <Button type="button" size="icon-sm" variant="quiet" aria-label="Tutup pemberitahuan" onClick={onClose}><X size={16} /></Button>
    </div>
  );
}

/** Checkbox column with a page-level "select all" header. */
export function mentorSelectionColumn<T>({ allLabel, rowLabel, disabled = false, hasRows, isSelectable = () => true }: { allLabel: string; rowLabel: (row: T) => string; disabled?: boolean; hasRows: boolean; isSelectable?: (row: T) => boolean }): ColumnDef<T> {
  return {
    id: "select",
    size: 40,
    header: ({ table }) => (
      <Checkbox aria-label={allLabel} checked={table.getIsAllPageRowsSelected()} indeterminate={table.getIsSomePageRowsSelected()} onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)} disabled={disabled || !hasRows} />
    ),
    cell: ({ row }) => isSelectable(row.original) ? (
      <Checkbox aria-label={rowLabel(row.original)} checked={row.getIsSelected()} onCheckedChange={(checked) => row.toggleSelected(checked)} disabled={disabled} />
    ) : null,
  };
}

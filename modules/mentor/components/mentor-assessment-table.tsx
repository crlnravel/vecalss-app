"use client";

import { type ReactNode, type ComponentProps } from "react";
import { flexRender, type Table as TanStackTable } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Table, TableHeader, TableBody, TableHead, TableCell, TableRow, TableCaption } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationPage, PaginationPrevious, PaginationNext, PaginationEllipsis } from "@/components/ui/pagination";
import { fieldLabelClassName } from "@/components/ui/field-constants";
import { Check, ChevronDown } from "@/lib/icons";
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

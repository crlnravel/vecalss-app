"use client";

import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field-constants";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Eye, Pencil, Search, X } from "@/lib/icons";
import { DIRECTORY_PAGE_SIZE_OPTIONS } from "@/lib/admin/operations/directory-page-constants";
import styles from "./reui-directory-grid.module.css";

type ReuiDirectoryColumn<T> = {
  id: string;
  label: string;
  cell: (row: T) => ReactNode;
  sortKey?: string;
  width?: number;
};
type ReuiDirectoryFilter = { id: string; label: string; value: string; href?: string };
type ReuiDirectorySearch = { action: string; label?: string; placeholder?: string; value?: string; clearHref?: string; hiddenFields?: Readonly<Record<string, string | readonly string[]>>; onValueChange?: (value: string) => void };
type ReuiDirectorySort = { key: string | null; direction: "asc" | "desc"; href?: (key: string | null, direction: "asc" | "desc") => string; onChange?: (key: string | null, direction: "asc" | "desc") => void };

function ReuiDirectoryGrid<T>({ caption, title, total, actions, columns, rows, getRowId, search, sort, filterPanel, filters = [], clearFiltersHref, emptyState, rowProps, onRowClick }: {
  caption: string; title: string; total: number; actions?: ReactNode;
  columns: readonly ReuiDirectoryColumn<T>[]; rows: readonly T[]; getRowId: (row: T) => string;
  search?: ReuiDirectorySearch; sort?: ReuiDirectorySort; filterPanel?: ReactNode; filters?: readonly ReuiDirectoryFilter[]; clearFiltersHref?: string; emptyState?: ReactNode;
  rowProps?: (row: T) => ComponentProps<"tr">; onRowClick?: (row: T) => void;
}) {
  const router = useRouter();
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (search?.onValueChange) return;
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => { if (String(value).trim()) params.append(key, String(value)); });
    router.replace(`${search!.action}${params.size ? `?${params}` : ""}`, { scroll: false });
  }
  return (
    <div className={styles.root} data-reui-directory>
      <div className={styles.toolbar}>
        <div className={styles.titleGroup}><h1 className={styles.title}>{title}</h1><span className={styles.count}>{total}</span></div>
        <div className={styles.tools}>
          {search ? <form action={search.action} method="get" onSubmit={submitSearch} className={cn(fieldControlClassName, "py-0", styles.search)}>
            <Search size={16} aria-hidden="true" />
            {Object.entries(search.hiddenFields ?? {}).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((item, index) => <input key={`${key}-${index}`} type="hidden" name={key} value={item} />))}
            <input name="q" aria-label={search.label ?? `Cari ${title}`} placeholder={search.placeholder ?? "Cari…"} defaultValue={search.onValueChange ? undefined : search.value} value={search.onValueChange ? search.value : undefined} onChange={search.onValueChange ? event => search.onValueChange?.(event.target.value) : undefined} key={search.onValueChange ? "local-search" : search.value} type="search" />
            {search.value ? search.onValueChange ? <Button aria-label="Hapus pencarian" onClick={() => search.onValueChange?.("")} size="icon-sm" type="button" variant="outline"><X size={14} /></Button> : search.clearHref ? <Link className={buttonVariants({ size: "icon-sm", variant: "outline" })} aria-label="Hapus pencarian" href={search.clearHref}><X size={14} /></Link> : null : null}
          </form> : null}
          {filterPanel}
          {actions}
        </div>
      </div>
      {filters.length ? <div className={styles.chips} aria-label="Filter aktif">
        {filters.map(filter => <span className={styles.chip} key={filter.id}>{filter.label}: {filter.value}{filter.href ? <Link href={filter.href} aria-label={`Hapus filter ${filter.label}`}><X size={12} /></Link> : null}</span>)}
        {clearFiltersHref ? <Link className={styles.clear} href={clearFiltersHref}>Hapus semua</Link> : null}
      </div> : null}
      <div className={styles.viewport}>
        <table className={styles.table}>
          <caption className="sr-only">{caption}</caption>
          <thead><tr>{columns.map(column => {
            const active = Boolean(column.sortKey && sort?.key === column.sortKey);
            return <th key={column.id} scope="col" style={{ width: column.width ? `${column.width}%` : undefined }} aria-sort={column.sortKey ? active ? sort?.direction === "desc" ? "descending" : "ascending" : "none" : undefined}>
              {column.sortKey && sort ? <Menu.Root><Menu.Trigger className={styles.sortTrigger} aria-label={`Urutkan ${column.label}`}>
                {column.label}{active ? sort.direction === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" /> : <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 9 4-4 4 4m-8 6 4 4 4-4" /></svg>}
              </Menu.Trigger><Menu.Portal><Menu.Positioner className={styles.positioner} align="start" sideOffset={4}><Menu.Popup className={styles.popup}>
                <Menu.Item className={styles.menuItem} render={sort.href ? <Link href={sort.href(column.sortKey, "asc")} /> : undefined} onClick={() => sort.onChange?.(column.sortKey!, "asc")}><ArrowUp size={14} />Urutkan naik</Menu.Item>
                <Menu.Item className={styles.menuItem} render={sort.href ? <Link href={sort.href(column.sortKey, "desc")} /> : undefined} onClick={() => sort.onChange?.(column.sortKey!, "desc")}><ArrowDown size={14} />Urutkan turun</Menu.Item>
                {active ? <Menu.Item className={styles.menuItem} render={sort.href ? <Link href={sort.href(null, "asc")} /> : undefined} onClick={() => sort.onChange?.(null, "asc")}>Hapus urutan</Menu.Item> : null}
              </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root> : column.label}
            </th>;
          })}</tr></thead>
          <tbody>{rows.length ? rows.map(row => <tr key={getRowId(row)} {...rowProps?.(row)} onClick={onRowClick ? event => { if (!(event.target as Element).closest("a,button,input")) onRowClick(row); } : undefined}>
            {columns.map(column => <td key={column.id}>{column.cell(row)}</td>)}
          </tr>) : <tr><td className={styles.empty} colSpan={columns.length}>{emptyState ?? "Tidak ada akun yang cocok."}</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

function ReuiDirectoryMember({ name, email, onView, editHref }: { name: string; email: string; onView?: () => void; editHref?: string }) {
  return <div className={styles.member}>
    <span className={styles.avatar} aria-hidden="true">{name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>
    <div className={styles.identity}><span className={styles.name} title={name}>{name}</span><span className={styles.username}>{email.split("@")[0]}</span></div>
    {onView || editHref ? <div className={styles.rowActions}>
      {onView ? <Button aria-label={`Lihat ${name}`} title={`Lihat ${name}`} onClick={onView} size="icon-sm" type="button" variant="outline"><Eye /></Button> : null}
      {editHref ? <Link className={buttonVariants({ size: "icon-sm", variant: "outline" })} aria-label={`Kelola ${name}`} title={`Kelola ${name}`} href={editHref}><Pencil /></Link> : null}
    </div> : null}
  </div>;
}

function ReuiDirectoryFilters({ basePath, query, statuses, multiple = false, dateRange, clearHref }: { basePath: string; query: string; statuses: string[]; multiple?: boolean; dateRange?: { from: string | null; to: string | null }; clearHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(query.replace(/^\?/, ""));
    ["page", "focus", "status", "addedFrom", "addedTo"].forEach(key => params.delete(key));
    new FormData(event.currentTarget).forEach((value, key) => { if (value) params.append(key, String(value)); });
    router.replace(`${basePath}${params.size ? `?${params}` : ""}`, { scroll: false }); setOpen(false);
  }
  const labels: Record<string, string> = { active: "Aktif", disabled: "Nonaktif", locked: "Terkunci" };
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger className={buttonVariants({ size: "sm", variant: "outline" })} aria-label="Filter akun">Filter<ChevronDown size={14} /></Popover.Trigger>
    <Popover.Portal><Popover.Positioner className={styles.positioner} align="end" sideOffset={4}><Popover.Popup className={styles.popup}>
      <form className={styles.filterForm} action={basePath} method="get" onSubmit={apply}>
        <fieldset><legend>Status akun</legend>{Object.entries(labels).map(([value, label]) => <label key={value}><input type={multiple ? "checkbox" : "radio"} name="status" value={value} defaultChecked={statuses.includes(value)} />{label}</label>)}</fieldset>
        {dateRange ? <fieldset className={styles.dateFields}><legend>Ditambahkan</legend><label className={fieldLabelClassName}>Dari tanggal<input className={fieldControlClassName} type="date" name="addedFrom" defaultValue={dateRange.from ?? ""} /></label><label className={fieldLabelClassName}>Sampai tanggal<input className={fieldControlClassName} type="date" name="addedTo" defaultValue={dateRange.to ?? ""} /></label></fieldset> : null}
        <div className={styles.filterActions}><Link className={buttonVariants({ size: "sm", variant: "outline" })} href={clearHref} onClick={() => setOpen(false)}>Hapus filter</Link><Button size="sm" type="submit" variant="default">Terapkan</Button></div>
      </form>
    </Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}

function ReuiDirectoryFooter({ page, pageCount, pageSize, total, visibleCount, basePath, query, onPageChange, onSizeChange }: { page: number; pageCount: number; pageSize: number; total: number; visibleCount: number; basePath?: string; query?: string; onPageChange?: (page: number) => void; onSizeChange?: (size: number) => void }) {
  const router = useRouter();
  function href(nextPage: number, nextSize = pageSize) {
    const params = new URLSearchParams((query ?? "").replace(/^\?/, "")); params.delete("focus");
    if (nextPage === 1) params.delete("page"); else params.set("page", String(nextPage));
    params.set("pageSize", String(nextSize));
    return `${basePath}${params.size ? `?${params}` : ""}`;
  }
  const pages = [...new Set([1, ...Array.from({ length: Math.min(5, pageCount) }, (_, index) => Math.min(Math.max(1, page - 2), Math.max(1, pageCount - 4)) + index), pageCount])].filter(value => value >= 1 && value <= pageCount);
  function changePage(nextPage: number) { if (onPageChange) onPageChange(nextPage); else router.replace(href(nextPage), { scroll: false }); }
  const from = visibleCount ? (page - 1) * pageSize + 1 : 0;
  return <div className={`${styles.root} ${styles.footer}`}>
    <div className={styles.sizeGroup}><span>Baris per halaman</span><Menu.Root><Menu.Trigger className={buttonVariants({ size: "sm", variant: "outline" })} aria-label="Baris per halaman">{pageSize}<ChevronDown size={14} /></Menu.Trigger><Menu.Portal><Menu.Positioner className={styles.positioner} align="start" sideOffset={4}><Menu.Popup className={styles.popup}>{DIRECTORY_PAGE_SIZE_OPTIONS.map(size => <Menu.Item key={size} className={styles.menuItem} onClick={() => { if (onSizeChange) onSizeChange(size); else router.replace(href(1, size), { scroll: false }); }}>{size}</Menu.Item>)}</Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></div>
    <div className={styles.pagination}><span>{from} - {visibleCount ? from + visibleCount - 1 : 0} dari {total} akun</span>
      {pageCount > 1 ? <nav className={styles.pageList} aria-label="Halaman direktori"><Button size="icon-sm" type="button" variant="outline" disabled={page <= 1} aria-label="Halaman sebelumnya" onClick={() => changePage(page - 1)}><ChevronLeft size={16} /></Button>
        {pages.map((value, index) => <span key={value}>{index > 0 && value - pages[index - 1] > 1 ? <span className={styles.pageEllipsis}>…</span> : null}<Button className="min-w-8" size="sm" type="button" variant={page === value ? "default" : "outline"} aria-label={`Buka halaman ${value}`} aria-current={page === value ? "page" : undefined} onClick={() => changePage(value)}>{value}</Button></span>)}
        <Button size="icon-sm" type="button" variant="outline" disabled={page >= pageCount} aria-label="Halaman berikutnya" onClick={() => changePage(page + 1)}><ChevronRight size={16} /></Button>
      </nav> : null}
    </div>
  </div>;
}

export { ReuiDirectoryGrid, ReuiDirectoryMember, ReuiDirectoryFilters, ReuiDirectoryFooter };
export type { ReuiDirectoryColumn, ReuiDirectoryFilter };

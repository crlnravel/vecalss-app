"use client";

import { Menu } from "@base-ui/react/menu";
import { useMemo, useState } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { ChevronDown } from "@/lib/icons";
import type { AffiliatorDirectoryItem } from "../AffiliatorPageModule";
import { AddAffiliatorDialog } from "./add-affiliator-dialog";
import { ReuiDirectoryFooter, ReuiDirectoryGrid, ReuiDirectoryMember, type ReuiDirectoryColumn } from "./reui-directory-grid";
import styles from "./reui-directory-grid.module.css";

type Row = Omit<AffiliatorDirectoryItem, "createdAt"> & { createdAt: string };
const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

function AffiliatorDirectoryTable({ affiliators }: { affiliators: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<string | null>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id-ID");
    const rows = affiliators.filter(person => (status === "all" || person.status === status) && `${person.fullName} ${person.email} ${person.referralCode ?? ""}`.toLocaleLowerCase("id-ID").includes(needle));
    if (!sort) return rows;
    return rows.sort((left, right) => {
      const value = (row: Row) => ({ name: row.fullName, email: row.email, referral: row.referralCode ?? "", purchases: row.packagePurchaseCount, status: row.status, added: row.createdAt })[sort as "name" | "email" | "referral" | "purchases" | "status" | "added"];
      const a = value(left), b = value(right);
      const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "id-ID", { sensitivity: "base" });
      return (comparison || left.id.localeCompare(right.id)) * (direction === "asc" ? 1 : -1);
    });
  }, [affiliators, search, status, sort, direction]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const statusLabel = (value: string) => ({ active: "Aktif", disabled: "Nonaktif", locked: "Terkunci" })[value as "active" | "disabled" | "locked"] ?? "Nonaktif";
  const columns: ReuiDirectoryColumn<Row>[] = [
    { id: "name", label: "Affiliator", sortKey: "name", width: 25, cell: person => <ReuiDirectoryMember name={person.fullName} email={person.email} /> },
    { id: "email", label: "Email", sortKey: "email", width: 23, cell: person => <a className={styles.email} href={`mailto:${person.email}`}>{person.email}</a> },
    { id: "referral", label: "Kode referral", sortKey: "referral", cell: person => person.referralCode ? <span className={styles.status} data-status={person.referralCodeIsActive ? "active" : "disabled"} title={person.referralCodeIsActive ? "Kode aktif" : "Kode nonaktif"}>{person.referralCode}<span className="sr-only"> — {person.referralCodeIsActive ? "Kode aktif" : "Kode nonaktif"}</span></span> : <span className={styles.muted}>Belum ada kode</span> },
    { id: "purchases", label: "Pembelian berhasil", sortKey: "purchases", cell: person => person.packagePurchaseCount },
    { id: "status", label: "Status akun", sortKey: "status", cell: person => <span className={styles.status} data-status={person.status}>{statusLabel(person.status)}</span> },
    { id: "added", label: "Ditambahkan", sortKey: "added", cell: person => <time className={styles.muted} dateTime={person.createdAt}>{dateFormatter.format(new Date(person.createdAt))}</time> },
  ];
  return <section className={`${styles.root} ${styles.surface}`} aria-label="Direktori affiliator">
    <ReuiDirectoryGrid caption="Daftar akun affiliator dan performa pembeliannya" title="Affiliator" total={filtered.length} columns={columns} rows={visible} getRowId={person => person.id}
      search={{ action: "/admin/affiliators", label: "Cari affiliator", placeholder: "Cari…", value: search, onValueChange: value => { setSearch(value); setPage(1); } }}
      sort={{ key: sort, direction, onChange: (key, nextDirection) => { setSort(key); setDirection(nextDirection); setPage(1); } }}
      actions={<AddAffiliatorDialog />}
      filterPanel={<Menu.Root><Menu.Trigger className={buttonVariants({ size: "sm", variant: "outline" })} aria-label="Filter akun">Filter<ChevronDown size={14} /></Menu.Trigger><Menu.Portal><Menu.Positioner className={styles.positioner} align="end" sideOffset={4}><Menu.Popup className={styles.popup}><Menu.RadioGroup value={status} onValueChange={value => { setStatus(value); setPage(1); }}>{["all", "active", "disabled", "locked"].map(value => <Menu.RadioItem key={value} value={value} className={styles.menuItem}>{value === "all" ? "Semua status" : statusLabel(value)}</Menu.RadioItem>)}</Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>}
      emptyState={<><strong>{affiliators.length ? "Tidak ada affiliator yang cocok" : "Belum ada akun affiliator"}</strong>{affiliators.length ? "Coba nama, email, atau filter lain." : "Tambahkan affiliator untuk membuat akun dan kode referral pertamanya."}</>}
    />
    <ReuiDirectoryFooter page={currentPage} pageCount={pageCount} pageSize={pageSize} total={filtered.length} visibleCount={visible.length} onPageChange={setPage} onSizeChange={size => { setPageSize(size); setPage(1); }} />
  </section>;
}

export { AffiliatorDirectoryTable };

"use client";

import Image from "next/image";
import { useMemo, useRef, useState, type UIEvent } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, Buildings, ChevronDown, Download, ListFilter, RefreshCw, Search, SlidersHorizontal, X, Zap } from "@/lib/icons";

import { GRID_HEIGHT, queryTransactions, transactions, transactionsCsv, virtualWindow, type Sort, type SortKey, type Transaction } from "./transactions";
import styles from "./transaction-grid-demo.module.css";

const columns: { key: SortKey; label: string; width: number }[] = [
  { key: "id", label: "Transaction", width: 178 },
  { key: "customer", label: "Customer", width: 245 },
  { key: "amount", label: "Amount", width: 128 },
  { key: "status", label: "Status", width: 121 },
  { key: "method", label: "Method", width: 158 },
  { key: "channel", label: "Channel", width: 118 },
  { key: "risk", label: "Risk", width: 108 },
  { key: "date", label: "Date", width: 116 },
];
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compactCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 });
const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const timeLabel = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function CardMark({ method }: { method: Transaction["method"] }) {
  if (method === "mastercard") return <span aria-label="Mastercard" className={styles.mastercard}><i /><i /></span>;
  if (method === "visa") return <span className={styles.visa}>VISA</span>;
  return <span aria-label="American Express" className={styles.amex}>AMERICAN<br />EXPRESS</span>;
}

function TransactionCell({ column, row }: { column: SortKey; row: Transaction }) {
  switch (column) {
    case "id": return <div className={styles.twoLines}><span>{row.id}</span><span className={styles.charge}>{row.charge}</span></div>;
    case "customer": return <div className={styles.customer}><Image alt="" className={styles.avatar} height={28} width={28} src={`/table-demo/avatar-${row.avatar}.jpg`} /><div className={styles.twoLines}><span>{row.customer}</span><span title={row.email}>{row.email}</span></div></div>;
    case "amount": return <span className={styles.amount}>{currency.format(row.amount)}</span>;
    case "status": return <span className={styles.status} data-status={row.status}>{row.status}</span>;
    case "method": return <div className={styles.method}><CardMark method={row.method} /><span>•••• {row.card}</span></div>;
    case "channel": return <span className={styles.channel}>{row.channel === "API" ? <Zap aria-hidden="true" className={styles.channelIcon} size={14} /> : row.channel === "POS" ? <Buildings aria-hidden="true" className={styles.channelIcon} size={14} /> : row.channel === "Web" ? <svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><ellipse cx="8" cy="8" rx="2.5" ry="6" /><path d="M2 8h12" /></svg> : <svg aria-hidden="true" viewBox="0 0 16 16"><rect x="4" y="2" width="8" height="12" rx="1" /><path d="M7 12h2" /></svg>}{row.channel}</span>;
    case "risk": return <span className={styles.risk} data-risk={row.risk >= 80 ? "high" : row.risk >= 35 ? "medium" : "low"}><i />{row.risk}</span>;
    case "date": return <div className={styles.twoLines}><span>{dateLabel.format(row.date)}</span><span>{timeLabel.format(row.date)}</span></div>;
  }
}

export function TransactionGridDemo() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<Sort>({ key: "date", direction: "desc" });
  const [hidden, setHidden] = useState<Set<SortKey>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadedCount, setLoadedCount] = useState(25);
  const [scrollTop, setScrollTop] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => queryTransactions(query, status, sort), [query, status, sort]);
  const loaded = Math.min(loadedCount, rows.length);
  const window = virtualWindow(loaded, scrollTop);
  const visibleRows = rows.slice(window.start, window.end);
  const visibleColumns = columns.filter((column) => !hidden.has(column.key));
  const selectedLoaded = rows.slice(0, loaded).filter((row) => selected.has(row.id)).length;
  const allSelected = loaded > 0 && selectedLoaded === loaded;
  const settledVolume = useMemo(() => transactions.reduce((sum, row) => sum + (row.status === "Settled" ? row.amount : 0), 0), []);

  function resetViewport() {
    viewportRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
    setLoadedCount(25);
    setSelected(new Set());
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    setScrollTop(element.scrollTop);
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 200) {
      setLoadedCount((count) => Math.min(rows.length, count + 25));
    }
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function exportCsv() {
    const exported = selected.size ? rows.filter((row) => selected.has(row.id)) : rows;
    const url = URL.createObjectURL(new Blob([transactionsCsv(exported)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mock-transactions.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement(`${exported.length.toLocaleString("en-US")} transactions exported.`);
  }

  return (
    <section aria-label="Transactions — mock data" className={styles.demo}>
      <div className={styles.topbar}>
        <div><h2>Transactions</h2><p aria-live="polite">{loaded.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")} loaded{selected.size > 0 ? ` · ${selected.size} selected` : ""}</p></div>
        <button className={styles.export} onClick={exportCsv} type="button"><Download size={16} aria-hidden="true" />Export</button>
      </div>
      <div className={styles.frame}>
        <div className={styles.toolbar}>
          <label className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label="Search transactions" placeholder="Search id, customer, card..." type="search" value={query} onChange={(event) => { setQuery(event.target.value); resetViewport(); }} /></label>
          <DropdownMenu>
            <DropdownMenuTrigger className={styles.control}><ListFilter size={16} aria-hidden="true" />Filters{status !== "all" ? <span className={styles.filterCount}>1</span> : null}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={status} onValueChange={(value) => { setStatus(value); resetViewport(); }}>
                {["all", "Settled", "Pending", "Refunded"].map((value) => <DropdownMenuRadioItem key={value} value={value}>{value === "all" ? "All statuses" : value}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className={styles.toolbarSpacer} />
          <button className={styles.control} type="button" onClick={() => { resetViewport(); setAnnouncement("Mock transactions refreshed."); }}><RefreshCw size={16} aria-hidden="true" />Refresh</button>
          <DropdownMenu>
            <DropdownMenuTrigger className={styles.control}><SlidersHorizontal size={16} aria-hidden="true" />View settings</DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              {columns.map((column) => <DropdownMenuCheckboxItem checked={!hidden.has(column.key)} disabled={column.key === "id"} key={column.key} onCheckedChange={(checked) => setHidden((current) => { const next = new Set(current); if (checked) next.delete(column.key); else next.add(column.key); return next; })}>{column.label}</DropdownMenuCheckboxItem>)}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setHidden(new Set())}>Show all columns</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {status !== "all" ? <div className={styles.activeFilter}><span>Status: {status}</span><button aria-label="Clear status filter" type="button" onClick={() => { setStatus("all"); resetViewport(); }}><X size={14} /></button></div> : null}
        <div aria-label="Scrollable transactions" className={styles.viewport} onScroll={handleScroll} ref={viewportRef} style={{ height: GRID_HEIGHT }} tabIndex={0}>
          <Table aria-label="Transactions" aria-rowcount={rows.length + 1} className={styles.table} style={{ minWidth: 40 + visibleColumns.reduce((sum, column) => sum + column.width, 0) }}>
            <colgroup><col style={{ width: 40 }} />{visibleColumns.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
            <TableHeader><TableRow aria-rowindex={1}>
              <TableHead><Checkbox aria-label="Select all loaded transactions" checked={allSelected} indeterminate={selectedLoaded > 0 && !allSelected} onCheckedChange={(checked) => setSelected(checked ? new Set(rows.slice(0, loaded).map((row) => row.id)) : new Set())} /></TableHead>
              {visibleColumns.map((column) => <TableHead aria-sort={sort.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"} key={column.key}><button className={styles.sort} onClick={() => { setSort({ key: column.key, direction: sort.key === column.key && sort.direction === "asc" ? "desc" : "asc" }); resetViewport(); }} type="button">{column.label}{sort.key === column.key ? sort.direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <span className={styles.sortArrows}><ChevronDown size={11} /><ChevronDown size={11} /></span>}</button></TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {window.before > 0 ? <TableRow aria-hidden="true" className={styles.spacer}><TableCell colSpan={visibleColumns.length + 1} style={{ height: window.before }} /></TableRow> : null}
              {visibleRows.map((row, index) => <TableRow aria-rowindex={window.start + index + 2} aria-selected={selected.has(row.id)} className={styles.record} data-state={selected.has(row.id) ? "selected" : undefined} key={row.id}>
                <TableCell><Checkbox aria-label={`Select ${row.id}`} checked={selected.has(row.id)} onCheckedChange={(checked) => toggleRow(row.id, checked)} /></TableCell>
                {visibleColumns.map((column) => <TableCell key={column.key}><TransactionCell column={column.key} row={row} /></TableCell>)}
              </TableRow>)}
              {window.after > 0 ? <TableRow aria-hidden="true" className={styles.spacer}><TableCell colSpan={visibleColumns.length + 1} style={{ height: window.after }} /></TableRow> : null}
              {!rows.length ? <TableRow className={styles.empty}><TableCell colSpan={visibleColumns.length + 1}><div><Search size={24} aria-hidden="true" /><strong>No transactions found</strong><p>Try another search or clear the filters.</p><button className={styles.control} type="button" onClick={() => { setQuery(""); setStatus("all"); resetViewport(); }}>Clear filters</button></div></TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
      </div>
      <footer className={styles.footer}><span>{loaded === rows.length ? "All matching transactions loaded" : "Virtualized · loads on scroll"}</span><span>Settled volume <strong title={currency.format(settledVolume)}>{compactCurrency.format(settledVolume)}</strong></span></footer>
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  );
}

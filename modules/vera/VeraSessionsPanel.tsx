"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { fieldControlClassName } from "@/components/ui/field-constants";
import { Plus, Search } from "@/lib/icons";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import { cn } from "@/lib/utils";
import { SESSION_DAY_LABELS, sessionDay, type SessionDay } from "@/modules/vera/session-day";
import type { SessionView } from "@/modules/vera/use-vera-sessions";
import { VeraSessionRow } from "@/modules/vera/VeraSessionRow";

const DAY_ORDER: readonly SessionDay[] = ["today", "yesterday", "older"];

/**
 * The conversation list, shared by the right panel and the sheet below lg: the new-session button, a search over the loaded titles, the
 * Aktif and Arsip chips, and the rows grouped as Hari ini, Kemarin and Lebih lama.
 */
export function VeraSessionsPanel({
  view,
  sessions,
  loading,
  error,
  activeId,
  onViewChange,
  onNew,
  onOpen,
  onRename,
  onArchive,
  onDelete,
}: {
  view: SessionView;
  sessions: VeraSessionSummary[];
  loading: boolean;
  error: string | null;
  activeId: string | null;
  onViewChange: (view: SessionView) => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string, toArchive: boolean) => void;
  onDelete: (id: string) => void;
}) {
  // The groups are counted from when the list first shows, so a row keeps its group while the student is looking at the list.
  const [now] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase("id-ID");
  const shown = term
    ? sessions.filter((session) => session.title.toLocaleLowerCase("id-ID").includes(term))
    : sessions;
  const groups = DAY_ORDER.map((day) => ({
    day,
    items: shown.filter((session) => sessionDay(session.updatedAt, now) === day),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Button className="w-full" onClick={onNew} type="button">
        <Plus />
        Sesi baru
      </Button>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          aria-label="Cari percakapan"
          className={cn(fieldControlClassName, "pl-9")}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari percakapan…"
          type="search"
          value={query}
        />
      </div>

      <div aria-label="Tampilan sesi" className="flex gap-1.5" role="group">
        <Button
          aria-pressed={view === "active"}
          className="rounded-pill"
          onClick={() => onViewChange("active")}
          size="sm"
          type="button"
          variant={view === "active" ? "default" : "outline"}
        >
          Aktif
        </Button>
        <Button
          aria-pressed={view === "archived"}
          className="rounded-pill"
          onClick={() => onViewChange("archived")}
          size="sm"
          type="button"
          variant={view === "archived" ? "default" : "outline"}
        >
          Arsip
        </Button>
      </div>

      {error ? (
        <p className="px-1 text-sm text-muted-foreground" role="alert">
          {error}
        </p>
      ) : null}

      {loading && sessions.length === 0 ? <p className="px-1 text-sm text-muted-foreground">Memuat…</p> : null}
      {!loading && sessions.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">{view === "archived" ? "Belum ada arsip." : "Belum ada sesi."}</p>
      ) : null}
      {sessions.length > 0 && groups.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Tidak ada percakapan yang cocok.</p>
      ) : null}

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
        {groups.map((group) => (
          <section aria-label={SESSION_DAY_LABELS[group.day]} className="flex flex-col gap-1" key={group.day}>
            <h2 className="px-3 text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
              {SESSION_DAY_LABELS[group.day]}
            </h2>
            <ul className="flex flex-col gap-1">
              {group.items.map((session) => (
                <li key={session.id}>
                  <VeraSessionRow
                    active={session.id === activeId}
                    now={now}
                    onArchive={onArchive}
                    onDelete={onDelete}
                    onOpen={onOpen}
                    onRename={onRename}
                    session={session}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

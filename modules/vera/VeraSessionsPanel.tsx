"use client";

import { Button } from "@/components/ui/button";
import { SunkenTabButton } from "@/components/ui/sunken-tabs";
import { Plus } from "@/lib/icons";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import type { SessionView } from "@/modules/vera/use-vera-sessions";
import { VeraSessionRow } from "@/modules/vera/VeraSessionRow";

/** The new-session button, the Aktif and Arsip filters, and the list. The history sheet holds it. */
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
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Button onClick={onNew} type="button">
        <Plus />
        Sesi baru
      </Button>

      <div aria-label="Tampilan sesi" className="grid grid-cols-2 gap-1.5" role="group">
        <SunkenTabButton
          aria-pressed={view === "active"}
          layout="equal"
          onClick={() => onViewChange("active")}
          selected={view === "active"}
          type="button"
        >
          Aktif
        </SunkenTabButton>
        <SunkenTabButton
          aria-pressed={view === "archived"}
          layout="equal"
          onClick={() => onViewChange("archived")}
          selected={view === "archived"}
          type="button"
        >
          Arsip
        </SunkenTabButton>
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

      <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1">
        {sessions.map((session) => (
          <li key={session.id}>
            <VeraSessionRow
              active={session.id === activeId}
              onArchive={onArchive}
              onDelete={onDelete}
              onOpen={onOpen}
              onRename={onRename}
              session={session}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "@/lib/icons";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import { cn } from "@/lib/utils";
import type { SessionView } from "@/modules/vera/use-vera-sessions";
import { VeraSessionRow } from "@/modules/vera/VeraSessionRow";

/** The session list, the archive toggle and the new-session button. The desktop sidebar and the mobile dialog both use it. */
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
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-secondary-950">Sesi</h2>
        <Button onClick={onNew} size="sm" type="button" variant="outline">
          <Plus />
          Sesi baru
        </Button>
      </div>

      <div aria-label="Tampilan sesi" className="flex rounded-full bg-muted p-1" role="tablist">
        <ViewButton onClick={() => onViewChange("active")} selected={view === "active"}>
          Sesi
        </ViewButton>
        <ViewButton onClick={() => onViewChange("archived")} selected={view === "archived"}>
          Arsip
        </ViewButton>
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground" role="alert">
          {error}
        </p>
      ) : null}

      {loading && sessions.length === 0 ? <p className="text-sm text-muted-foreground">Memuat…</p> : null}
      {!loading && sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{view === "archived" ? "Belum ada arsip." : "Belum ada sesi."}</p>
      ) : null}

      <ul className="flex flex-col gap-1 overflow-y-auto">
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

function ViewButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      aria-selected={selected}
      className={cn(
        "min-h-9 flex-1 rounded-full px-3 text-sm font-medium transition-colors motion-reduce:transition-none",
        selected ? "bg-card text-secondary-950 shadow-sm" : "text-muted-foreground hover:text-secondary-950",
      )}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}

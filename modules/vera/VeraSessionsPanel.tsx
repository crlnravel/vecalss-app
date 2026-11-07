"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { fieldControlClassName } from "@/components/ui/field-constants";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { Plus, Search } from "@/lib/icons";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import { cn } from "@/lib/utils";
import { SESSION_DAY_LABELS, sessionDay, type SessionDay } from "@/modules/vera/session-day";
import { VeraSessionRow } from "@/modules/vera/VeraSessionRow";
import { VeraUsageBar } from "@/modules/vera/VeraUsageBar";

const DAY_ORDER: readonly SessionDay[] = ["today", "yesterday", "older"];

/**
 * The conversation list, built from the sidebar's own parts. The new-session button sits in the header, and the usage bar sits in the
 * footer, outside the list's scroll area. The content holds the search and the active sessions under their day groups. The same panel
 * opens in the sheet below lg.
 */
export function VeraSessionsPanel({
  sessions,
  loading,
  error,
  activeId,
  usage,
  onNew,
  onOpen,
  onRename,
  onDelete,
}: {
  sessions: VeraSessionSummary[];
  loading: boolean;
  error: string | null;
  activeId: string | null;
  usage: VeraUsageSnapshot;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  // The groups are counted from when the list first shows, so a row keeps its group while the student is looking at the list.
  const [now] = useState(() => new Date());
  // The right panel and the sheet can both be mounted, so each panel makes its own label ids.
  const labelId = useId();
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
    <>
      <SidebarHeader className="p-3">
        <Button className="w-full" onClick={onNew} type="button">
          <Plus />
          Sesi baru
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
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
        </SidebarGroup>

        {error ? (
          <p className="px-3 text-sm text-muted-foreground" role="alert">
            {error}
          </p>
        ) : null}
        {loading && sessions.length === 0 ? <p className="px-3 text-sm text-muted-foreground">Memuat…</p> : null}
        {!loading && sessions.length === 0 ? <p className="px-3 text-sm text-muted-foreground">Belum ada sesi.</p> : null}
        {sessions.length > 0 && groups.length === 0 ? (
          <p className="px-3 text-sm text-muted-foreground">Tidak ada percakapan yang cocok.</p>
        ) : null}

        {groups.map((group) => (
          <SidebarGroup aria-labelledby={`${labelId}-${group.day}`} key={group.day} role="group">
            <SidebarGroupLabel id={`${labelId}-${group.day}`} render={<h2 />}>
              {SESSION_DAY_LABELS[group.day]}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((session) => (
                  <VeraSessionRow
                    active={session.id === activeId}
                    key={session.id}
                    now={now}
                    onDelete={onDelete}
                    onOpen={onOpen}
                    onRename={onRename}
                    session={session}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <VeraUsageBar usage={usage} />
      </SidebarFooter>
    </>
  );
}

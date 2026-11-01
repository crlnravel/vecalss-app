import { cn } from "@/lib/utils";
import {
  flattenGroups,
  MENTION_GROUPS,
  type MentionCandidate,
  type MentionGroups,
} from "@/modules/vera/mention-model";

export function optionId(listboxId: string, index: number) {
  return `${listboxId}-option-${index}`;
}

/**
 * The `@` menu: Materi, Kuis and Tryout in their own groups. The textarea keeps focus, so the options do not take it on press.
 */
export function VeraMentionMenu({
  listboxId,
  groups,
  loading,
  query,
  activeIndex,
  onPick,
}: {
  listboxId: string;
  groups: MentionGroups | null;
  loading: boolean;
  query: string;
  activeIndex: number;
  onPick: (candidate: MentionCandidate) => void;
}) {
  const items = flattenGroups(groups);
  if (items.length === 0) {
    const message = loading
      ? "Mencari…"
      : query
        ? "Tidak ada yang cocok."
        : "Ketik untuk mencari Materi, Kuis, atau Tryout.";
    return <p className="px-2 py-1.5 text-sm text-muted-foreground">{message}</p>;
  }

  return (
    <div className="flex flex-col gap-2" id={listboxId} role="listbox" aria-label="Sumber Vera">
      {MENTION_GROUPS.map(({ type, label }) => {
        const candidates = groups?.[type] ?? [];
        if (candidates.length === 0) return null;
        return (
          <div aria-label={label} className="flex flex-col" key={type} role="group">
            <p aria-hidden="true" className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {label}
            </p>
            {candidates.map((candidate) => {
              const position = items.indexOf(candidate);
              const active = position === activeIndex;
              return (
                <button
                  aria-selected={active}
                  className={cn(
                    "flex w-full min-w-0 flex-col items-start rounded-lg px-2 py-1.5 text-left text-sm",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                  id={optionId(listboxId, position)}
                  key={`${candidate.type}:${candidate.id}`}
                  onClick={() => onPick(candidate)}
                  onMouseDown={(event) => event.preventDefault()}
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  <span className="max-w-full truncate font-medium">{candidate.label}</span>
                  {candidate.detail ? (
                    <span className="max-w-full truncate text-xs text-muted-foreground">{candidate.detail}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

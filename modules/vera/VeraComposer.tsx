"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputStatus,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { AtSign } from "@/lib/icons";
import type { VeraEffortId } from "@/lib/vera/config";
import { estimateCreditRange, formatCreditRange, type VeraPrices } from "@/lib/vera/credits-shared";
import { VeraEffortMenu } from "@/modules/vera/VeraEffortMenu";
import { VeraMentionChips } from "@/modules/vera/VeraMentionChips";
import { optionId, VeraMentionMenu } from "@/modules/vera/VeraMentionMenu";
import {
  activeMention,
  chipFrom,
  flattenGroups,
  MENTION_LIMIT,
  sameMention,
  shouldDismissOnSpace,
  withoutMention,
  type CompletedSearch,
  type MentionCandidate,
  type MentionChip,
  type MentionGroups,
} from "@/modules/vera/mention-model";

/** The search waits this long after the last keystroke before it asks the server. */
const SEARCH_DEBOUNCE_MS = 150;
/** The placeholder moves to the next suggested question this often. */
const EXAMPLE_INTERVAL_MS = 4_000;
const DEFAULT_PLACEHOLDER = "Tanya Vera… ketik @ untuk menyebut Materi, Kuis, atau Tryout";

export type ComposerSubmit = { text: string; chips: MentionChip[] };

/**
 * The message box, as a card: the text, the sources pinned with `@`, and a toolbar. The toolbar's left side holds the "@ Sebut" button,
 * the effort menu and the Studio menu passed as `leading`. Its right side holds the credit estimate and the send button, which becomes
 * Stop while an answer streams. `examples` rotates the placeholder through suggested questions; `placeholder` fixes it instead.
 */
export function VeraComposer({
  effort,
  onEffortChange,
  prices,
  historyChars,
  status,
  blocked,
  onSend,
  onStop,
  initialChips = [],
  examples,
  leading,
  placeholder: fixedPlaceholder,
}: {
  effort: VeraEffortId;
  onEffortChange: (effort: VeraEffortId) => void;
  prices: VeraPrices;
  historyChars: number;
  status: PromptInputStatus;
  blocked: string | null;
  onSend: (submit: ComposerSubmit) => void;
  onStop: () => void;
  // Sources already pinned when the composer mounts, such as a Studio document the student asked Vera about.
  initialChips?: MentionChip[];
  examples?: readonly string[];
  leading?: ReactNode;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const [chips, setChips] = useState<MentionChip[]>(initialChips);
  // The `@` the caret is typing after, and the one the student dismissed (Esc, or a space with nothing to match).
  const [menu, setMenu] = useState<{ start: number; query: string } | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [groups, setGroups] = useState<MentionGroups | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const listboxId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const requestRef = useRef(0);
  // The last search that finished, so the menu can tell a dead end from a search that is still running.
  const completedSearchRef = useRef<CompletedSearch | null>(null);

  useEffect(() => {
    if (!examples || examples.length < 2) return;
    const timer = window.setInterval(() => setExampleIndex((index) => (index + 1) % examples.length), EXAMPLE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [examples]);

  const placeholder =
    fixedPlaceholder ?? (examples && examples.length > 0 ? examples[exampleIndex % examples.length] : DEFAULT_PLACEHOLDER);
  const items = flattenGroups(groups);
  const menuOpen = menu !== null && menu.start !== dismissedAt;
  const active = Math.min(activeIndex, Math.max(items.length - 1, 0));
  const busy = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && !busy && blocked === null;
  const estimate = formatCreditRange(estimateCreditRange({ effort, historyChars, mentionCount: chips.length }, prices));

  function queueSearch(query: string) {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void runSearch(query), SEARCH_DEBOUNCE_MS);
  }

  async function runSearch(query: string) {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/vera/mentions?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Search failed with ${response.status}`);
      const next = (await response.json()) as MentionGroups;
      completedSearchRef.current = { query, count: flattenGroups(next).length };
      if (request === requestRef.current) {
        setGroups(next);
        setActiveIndex(0);
      }
    } catch {
      if (request === requestRef.current) setGroups(null);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const { value, selectionStart } = event.target;
    setInput(value);
    setLimitReached(false);
    const mention = activeMention(value, selectionStart);
    setMenu(mention);
    if (!mention) {
      setDismissedAt(null);
      return;
    }
    if (value.endsWith(" ") && shouldDismissOnSpace(mention.query, completedSearchRef.current)) setDismissedAt(mention.start);
    queueSearch(mention.query);
  }

  // "@ Sebut" types an `@` at the caret, so the source menu opens exactly as it does when the student types one.
  function insertMention() {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? input.length;
    const next = `${input.slice(0, caret)}@${input.slice(caret)}`;
    setInput(next);
    setLimitReached(false);
    const mention = activeMention(next, caret + 1);
    setMenu(mention);
    setDismissedAt(null);
    if (mention) queueSearch(mention.query);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(caret + 1, caret + 1);
    });
  }

  function pick(candidate: MentionCandidate) {
    if (!menu) return;
    const chip = chipFrom(candidate);
    const already = chips.some((item) => sameMention(item, chip));
    if (!already && chips.length >= MENTION_LIMIT) {
      setLimitReached(true);
      setMenu(null);
      return;
    }
    const caret = menu.start + 1 + menu.query.length;
    setInput(withoutMention(input, menu.start, caret));
    if (!already) setChips([...chips, chip]);
    setMenu(null);
    setDismissedAt(null);
    setGroups(null);
    const start = menu.start;
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(start, start));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!menuOpen || !menu) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedAt(menu.start);
      return;
    }
    if (items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      pick(items[active]);
    }
  }

  function removeChip(chip: MentionChip) {
    setChips(chips.filter((item) => !sameMention(item, chip)));
    setLimitReached(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    onSend({ text: input.trim(), chips });
    setInput("");
    setChips([]);
    setMenu(null);
    setLimitReached(false);
  }

  const statusText = loading
    ? "Mencari sumber…"
    : items.length > 0
      ? `${items.length} sumber ditemukan`
      : "Tidak ada yang cocok.";

  return (
    <PromptInput onSubmit={submit}>
      <PromptInputBody className="rounded-panel border-border focus-within:border-voyage-deep" ref={anchorRef}>
        {chips.length > 0 || limitReached ? (
          <div className="flex flex-col gap-2 px-3 pt-3">
            <VeraMentionChips chips={chips} onRemove={removeChip} />
            {limitReached ? (
              <p aria-live="polite" className="text-xs text-muted-foreground">
                Sudah {MENTION_LIMIT} sumber. Lepas salah satu untuk menambah.
              </p>
            ) : null}
          </div>
        ) : null}
        <PromptInputTextarea
          aria-activedescendant={menuOpen && items.length > 0 ? optionId(listboxId, active) : undefined}
          aria-autocomplete="list"
          aria-controls={menuOpen ? listboxId : undefined}
          aria-expanded={menuOpen}
          aria-label="Tulis pertanyaan untuk Vera"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={textareaRef}
          role="combobox"
          rows={examples ? 2 : 1}
          value={input}
        />
        <span aria-live="polite" className="sr-only" role="status">
          {menuOpen ? statusText : ""}
        </span>
        <PromptInputFooter className="flex-wrap">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button onClick={insertMention} size="sm" type="button" variant="quiet">
              <AtSign />
              Sebut
            </Button>
            <VeraEffortMenu onChange={onEffortChange} value={effort} />
            {leading}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{estimate}</span>
            <PromptInputSubmit className="size-12 rounded-pill" disabled={!canSend} onStop={onStop} status={status} />
          </div>
        </PromptInputFooter>
      </PromptInputBody>
      <Popover
        open={menuOpen}
        onOpenChange={(open) => {
          if (!open && menu) setDismissedAt(menu.start);
        }}
      >
        <PopoverContent
          align="start"
          anchor={anchorRef}
          className="w-[min(28rem,calc(100vw-2rem))] gap-2 p-2"
          finalFocus={false}
          initialFocus={false}
          // A fixed positioner stays out of the page's scrollable height, so an open menu cannot make the page scroll.
          positionMethod="fixed"
          side="top"
        >
          <VeraMentionMenu
            activeIndex={active}
            groups={groups}
            listboxId={listboxId}
            loading={loading}
            onPick={pick}
            query={menu?.query ?? ""}
          />
        </PopoverContent>
      </Popover>
    </PromptInput>
  );
}

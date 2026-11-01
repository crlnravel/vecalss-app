"use client";

import { useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputStatus,
} from "@/components/ai-elements/prompt-input";
import { Popover, PopoverContent } from "@/components/ui/popover";
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
  withoutMention,
  type MentionCandidate,
  type MentionChip,
  type MentionGroups,
} from "@/modules/vera/mention-model";

/** The search waits this long after the last keystroke before it asks the server. */
const SEARCH_DEBOUNCE_MS = 150;

export type ComposerSubmit = { text: string; chips: MentionChip[] };

/**
 * The message box: the text, the sources pinned with `@`, the effort, and the credit estimate. Sending is handed to the page.
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
}: {
  effort: VeraEffortId;
  onEffortChange: (effort: VeraEffortId) => void;
  prices: VeraPrices;
  historyChars: number;
  status: PromptInputStatus;
  blocked: string | null;
  onSend: (submit: ComposerSubmit) => void;
  onStop: () => void;
}) {
  const [input, setInput] = useState("");
  const [chips, setChips] = useState<MentionChip[]>([]);
  // The `@` the caret is typing after, and the one the student dismissed (Esc, or a space with nothing to match).
  const [menu, setMenu] = useState<{ start: number; query: string } | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [groups, setGroups] = useState<MentionGroups | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const listboxId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const requestRef = useRef(0);

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
    if (value.endsWith(" ") && !loading && items.length === 0) setDismissedAt(mention.start);
    queueSearch(mention.query);
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
      <PromptInputBody ref={anchorRef}>
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
          placeholder="Tanya Vera… ketik @ untuk menyebut Materi, Kuis, atau Tryout"
          ref={textareaRef}
          role="combobox"
          rows={1}
          value={input}
        />
        <span aria-live="polite" className="sr-only" role="status">
          {menuOpen ? statusText : ""}
        </span>
        <PromptInputFooter>
          <VeraEffortMenu onChange={onEffortChange} value={effort} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{estimate}</span>
            <PromptInputSubmit disabled={!canSend} onStop={onStop} status={status} />
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

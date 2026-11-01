import { VERA_LIMITS } from "@/lib/vera/config";
import type { VeraMentionType, VeraSource } from "@/lib/vera/sources/types";

/** A candidate the `@` menu offers, as the search endpoint returns it. */
export type MentionCandidate = {
  type: VeraMentionType;
  id: string;
  label: string;
  detail: string | null;
  source: VeraSource;
};

export type MentionGroups = Record<VeraMentionType, MentionCandidate[]>;

/** A source the composer is about to send. It shows as a chip above the textarea. */
export type MentionChip = { type: VeraMentionType; id: string; label: string; href: string };

export const MENTION_GROUPS: Array<{ type: VeraMentionType; label: string }> = [
  { type: "materi", label: "Materi" },
  { type: "kuis", label: "Kuis" },
  { type: "tryout", label: "Tryout" },
  { type: "studio", label: "Studio" },
];

export const MENTION_LIMIT = VERA_LIMITS.maxMentions;

const MAX_QUERY_CHARS = 60;

/** The `@` the caret is typing after, when it starts a word. Spaces are allowed, since source titles have them. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0) return null;
  if (start > 0 && !/\s/u.test(before.charAt(start - 1))) return null;
  const query = before.slice(start + 1);
  if (query.includes("\n") || query.length > MAX_QUERY_CHARS) return null;
  return { start, query };
}

/** The text with the typed `@query` taken out. */
export function withoutMention(text: string, start: number, end: number) {
  return `${text.slice(0, start)}${text.slice(end)}`;
}

/** The candidates in the order the arrow keys walk them: Materi, then Kuis, then Tryout. */
export function flattenGroups(groups: MentionGroups | null): MentionCandidate[] {
  if (!groups) return [];
  return MENTION_GROUPS.flatMap(({ type }) => groups[type]);
}

export function chipFrom(candidate: MentionCandidate): MentionChip {
  return { type: candidate.type, id: candidate.id, label: candidate.label, href: candidate.source.href };
}

export function sameMention(left: { type: VeraMentionType; id: string }, right: { type: VeraMentionType; id: string }) {
  return left.type === right.type && left.id === right.id;
}

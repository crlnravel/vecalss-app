import type { TryoutReadinessBlocker } from "@/lib/tryout/result-readiness";

export type ReadinessBlockerLine = { message: string; sections: number[] };
export type ReadinessBlockerGroup = { attemptId: string | null; lines: ReadinessBlockerLine[] };

/** "Tes 1–3, 5" from sorted section numbers. */
export function formatBlockerSections(sections: number[]) {
  const sorted = [...new Set(sections)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let index = 0; index < sorted.length;) {
    let end = index;
    while (sorted[end + 1] === sorted[end] + 1) end += 1;
    parts.push(end > index + 1 ? `${sorted[index]}–${sorted[end]}` : sorted.slice(index, end + 1).join(", "));
    index = end + 1;
  }
  return parts.length ? `Tes ${parts.join(", ")}` : "";
}

/** One group per attempt; identical messages merge, and downstream blockers hide behind an unfinished attempt. */
export function groupReadinessBlockers(blockers: TryoutReadinessBlocker[]): ReadinessBlockerGroup[] {
  const order: Array<string | null> = [];
  const byAttempt = new Map<string | null, TryoutReadinessBlocker[]>();
  for (const blocker of blockers) {
    const key = blocker.attemptId;
    if (!byAttempt.has(key)) { byAttempt.set(key, []); order.push(key); }
    byAttempt.get(key)!.push(blocker);
  }
  return order.map((attemptId) => {
    const items = byAttempt.get(attemptId)!;
    const visible = items.some((item) => item.category === "unfinished") ? items.filter((item) => item.category === "unfinished") : items;
    const lines: ReadinessBlockerLine[] = [];
    for (const item of visible) {
      const line = lines.find((candidate) => candidate.message === item.message);
      if (!line) lines.push({ message: item.message, sections: item.section ? [item.section] : [] });
      else if (item.section) line.sections.push(item.section);
    }
    return { attemptId, lines };
  });
}

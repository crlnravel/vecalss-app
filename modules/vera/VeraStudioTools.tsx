"use client";

import { type ReactNode, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { STUDY_ROUTE_MINUTES, STUDIO_TOOLS, type StudioRequest } from "@/lib/vera/studio";
import { quizSubjects } from "@/modules/quiz/data";
import type { MentionCandidate, MentionGroups } from "@/modules/vera/mention-model";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 150;

type PickedResult = { type: "kuis" | "tryout"; id: string; label: string };

/** The three Studio tools, each with its own options, its estimate and a Buat button. */
export function VeraStudioTools({
  busy,
  estimate,
  onRun,
}: {
  busy: boolean;
  estimate: string;
  onRun: (request: StudioRequest) => void;
}) {
  const [subtest, setSubtest] = useState("");
  const [minutes, setMinutes] = useState<(typeof STUDY_ROUTE_MINUTES)[number]>(30);
  const [reviewMode, setReviewMode] = useState<"latest" | "pick">("latest");
  const [picked, setPicked] = useState<PickedResult | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MentionGroups | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  async function search(term: string) {
    const response = await fetch(`/api/vera/mentions?q=${encodeURIComponent(term)}`, { cache: "no-store" });
    if (response.ok) setResults((await response.json()) as MentionGroups);
  }

  function queueSearch(term: string) {
    setQuery(term);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void search(term), SEARCH_DEBOUNCE_MS);
  }

  function chooseMode(mode: "latest" | "pick") {
    setReviewMode(mode);
    if (mode === "pick" && results === null) void search("");
  }

  function pick(candidate: MentionCandidate) {
    if (candidate.type !== "kuis" && candidate.type !== "tryout") return;
    setPicked({ type: candidate.type, id: candidate.id, label: candidate.label });
  }

  const reviewReady = reviewMode === "latest" || picked !== null;

  return (
    <section aria-label="Pilih dokumen Studio" className="grid gap-4 md:grid-cols-3">
      <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold text-secondary-950">{STUDIO_TOOLS.weakness_analysis.label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{STUDIO_TOOLS.weakness_analysis.description}</p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Fokus subtes
          <select
            className="h-10 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            onChange={(event) => setSubtest(event.target.value)}
            value={subtest}
          >
            <option value="">Semua subtes</option>
            {quizSubjects.map((subject) => (
              <option key={subject.title} value={subject.title}>
                {subject.title}
              </option>
            ))}
          </select>
        </label>
        <Footer estimate={estimate}>
          <Button
            disabled={busy}
            onClick={() => onRun({ tool: "weakness_analysis", input: subtest ? { subtest } : {}, effort: "mendalam" })}
            type="button"
          >
            Buat
          </Button>
        </Footer>
      </article>

      <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold text-secondary-950">{STUDIO_TOOLS.study_route.label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{STUDIO_TOOLS.study_route.description}</p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Menit per hari
          <select
            className="h-10 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            onChange={(event) => setMinutes(Number(event.target.value) as (typeof STUDY_ROUTE_MINUTES)[number])}
            value={minutes}
          >
            {STUDY_ROUTE_MINUTES.map((value) => (
              <option key={value} value={value}>
                {value} menit
              </option>
            ))}
          </select>
        </label>
        <Footer estimate={estimate}>
          <Button
            disabled={busy}
            onClick={() => onRun({ tool: "study_route", input: { minutesPerDay: minutes }, effort: "mendalam" })}
            type="button"
          >
            Buat
          </Button>
        </Footer>
      </article>

      <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold text-secondary-950">{STUDIO_TOOLS.wrong_answer_review.label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{STUDIO_TOOLS.wrong_answer_review.description}</p>
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label="Hasil yang dibahas">
          <ModeButton selected={reviewMode === "latest"} onClick={() => chooseMode("latest")}>
            Hasil terbaru
          </ModeButton>
          <ModeButton selected={reviewMode === "pick"} onClick={() => chooseMode("pick")}>
            Pilih hasil
          </ModeButton>
        </div>
        {reviewMode === "pick" ? (
          <div className="flex flex-col gap-2">
            <input
              aria-label="Cari Kuis atau Tryout"
              className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
              onChange={(event) => queueSearch(event.target.value)}
              placeholder="Cari Kuis atau Tryout"
              value={query}
            />
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {[...(results?.kuis ?? []), ...(results?.tryout ?? [])].map((candidate) => (
                <li key={`${candidate.type}:${candidate.id}`}>
                  <button
                    className={cn(
                      "w-full truncate rounded-lg px-2 py-1.5 text-left text-xs",
                      picked?.id === candidate.id ? "bg-muted font-medium" : "hover:bg-muted/60",
                    )}
                    onClick={() => pick(candidate)}
                    type="button"
                  >
                    {candidate.label}
                  </button>
                </li>
              ))}
            </ul>
            {picked ? <p className="text-xs text-muted-foreground">Dipilih: {picked.label}</p> : null}
          </div>
        ) : null}
        <Footer estimate={estimate}>
          <Button
            disabled={busy || !reviewReady}
            onClick={() =>
              onRun({
                tool: "wrong_answer_review",
                input: { target: reviewMode === "latest" || !picked ? "latest" : { type: picked.type, id: picked.id } },
                effort: "mendalam",
              })
            }
            type="button"
          >
            Buat
          </Button>
        </Footer>
      </article>
    </section>
  );
}

function Footer({ estimate, children }: { estimate: string; children: ReactNode }) {
  return (
    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
      <span className="text-xs text-muted-foreground tabular-nums">{estimate}</span>
      {children}
    </div>
  );
}

function ModeButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-checked={selected}
      className={cn(
        "min-h-9 flex-1 rounded-full border px-3 text-xs font-medium transition-colors",
        selected ? "border-transparent bg-secondary-950 text-card" : "border-border text-muted-foreground hover:text-secondary-950",
      )}
      onClick={onClick}
      role="radio"
      type="button"
    >
      {children}
    </button>
  );
}

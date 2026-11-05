"use client";

import { type ReactNode, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fieldControlClassName } from "@/components/ui/field-constants";
import { SunkenTabButton } from "@/components/ui/sunken-tabs";
import { type AppIcon, ChevronDown, Compass, ListChecks, Target } from "@/lib/icons";
import { STUDY_ROUTE_MINUTES, STUDIO_TOOLS, type StudioRequest } from "@/lib/vera/studio";
import { quizSubjects } from "@/modules/quiz/data";
import type { MentionCandidate, MentionGroups } from "@/modules/vera/mention-model";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 150;
const ALL_SUBTESTS = "semua";

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
      <ToolCard
        action={
          <Button
            disabled={busy}
            onClick={() =>
              onRun({ tool: "weakness_analysis", input: subtest ? { subtest } : {}, effort: "mendalam" })
            }
            type="button"
          >
            Buat
          </Button>
        }
        description={STUDIO_TOOLS.weakness_analysis.description}
        estimate={estimate}
        icon={Target}
        label={STUDIO_TOOLS.weakness_analysis.label}
      >
        <ToolOption label="Fokus subtes" valueLabel={subtest || "Semua subtes"}>
          <DropdownMenuRadioGroup
            onValueChange={(next) => setSubtest(next === ALL_SUBTESTS ? "" : next)}
            value={subtest || ALL_SUBTESTS}
          >
            <DropdownMenuRadioItem value={ALL_SUBTESTS}>Semua subtes</DropdownMenuRadioItem>
            {quizSubjects.map((subject) => (
              <DropdownMenuRadioItem key={subject.title} value={subject.title}>
                {subject.title}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </ToolOption>
      </ToolCard>

      <ToolCard
        action={
          <Button
            disabled={busy}
            onClick={() => onRun({ tool: "study_route", input: { minutesPerDay: minutes }, effort: "mendalam" })}
            type="button"
          >
            Buat
          </Button>
        }
        description={STUDIO_TOOLS.study_route.description}
        estimate={estimate}
        icon={Compass}
        label={STUDIO_TOOLS.study_route.label}
      >
        <ToolOption label="Menit per hari" valueLabel={`${minutes} menit`}>
          <DropdownMenuRadioGroup
            onValueChange={(next) => setMinutes(Number(next) as (typeof STUDY_ROUTE_MINUTES)[number])}
            value={String(minutes)}
          >
            {STUDY_ROUTE_MINUTES.map((value) => (
              <DropdownMenuRadioItem key={value} value={String(value)}>
                {value} menit
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </ToolOption>
      </ToolCard>

      <ToolCard
        action={
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
        }
        description={STUDIO_TOOLS.wrong_answer_review.description}
        estimate={estimate}
        icon={ListChecks}
        label={STUDIO_TOOLS.wrong_answer_review.label}
      >
        <div aria-label="Hasil yang dibahas" className="grid grid-cols-2 gap-1.5" role="group">
          <SunkenTabButton
            aria-pressed={reviewMode === "latest"}
            layout="equal"
            onClick={() => chooseMode("latest")}
            selected={reviewMode === "latest"}
            type="button"
          >
            Hasil terbaru
          </SunkenTabButton>
          <SunkenTabButton
            aria-pressed={reviewMode === "pick"}
            layout="equal"
            onClick={() => chooseMode("pick")}
            selected={reviewMode === "pick"}
            type="button"
          >
            Pilih hasil
          </SunkenTabButton>
        </div>
        {reviewMode === "pick" ? (
          <div className="flex flex-col gap-2">
            <input
              aria-label="Cari Kuis atau Tryout"
              className={fieldControlClassName}
              onChange={(event) => queueSearch(event.target.value)}
              placeholder="Cari Kuis atau Tryout"
              value={query}
            />
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {[...(results?.kuis ?? []), ...(results?.tryout ?? [])].map((candidate) => (
                <li key={`${candidate.type}:${candidate.id}`}>
                  <button
                    className={cn(
                      "flex min-h-[44px] w-full min-w-0 items-center rounded-control px-3 text-left text-sm",
                      picked?.id === candidate.id
                        ? "bg-accent font-semibold text-accent-foreground"
                        : "hover:bg-accent/60",
                    )}
                    onClick={() => pick(candidate)}
                    type="button"
                  >
                    <span className="truncate">{candidate.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            {picked ? <p className="text-xs text-muted-foreground">Dipilih: {picked.label}</p> : null}
          </div>
        ) : null}
      </ToolCard>
    </section>
  );
}

/** One tool as a card: its icon block, title, description, options, and the estimate with the Buat action. */
function ToolCard({
  action,
  children,
  description,
  estimate,
  icon: Icon,
  label,
}: {
  action: ReactNode;
  children: ReactNode;
  description: string;
  estimate: string;
  icon: AppIcon;
  label: string;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-card border border-primary-100 bg-white p-5 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)]">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-[40px] shrink-0 items-center justify-center rounded-control border border-primary-100 bg-[linear-gradient(180deg,var(--voyage-sea-glass-wash),var(--voyage-sea-glass))] text-voyage-deep"
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-base font-extrabold tracking-[-0.02em] text-voyage-ink">{label}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground tabular-nums">{estimate}</span>
        {action}
      </div>
    </article>
  );
}

/** A Studio option: a labelled trigger that opens the shared dropdown menu. */
function ToolOption({ children, label, valueLabel }: { children: ReactNode; label: string; valueLabel: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-heading text-xs font-semibold tracking-[0.04em] text-secondary-600">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${label}: ${valueLabel}`}
          render={<Button className="w-full justify-between" variant="outline" />}
        >
          <span className="truncate">{valueLabel}</span>
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";

import { ReferenceSelectField } from "@/components/dashboard/reference-select-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fieldControlClassName } from "@/components/ui/field-constants";
import { SunkenTabButton } from "@/components/ui/sunken-tabs";
import { ChevronDown, Compass, ListChecks, Target, type AppIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { estimateCreditRange, formatCreditRange, type VeraPrices } from "@/lib/vera/credits-shared";
import { STUDY_ROUTE_MINUTES, STUDIO_TOOLS, type StudioRequest, type StudioToolId } from "@/lib/vera/studio";
import { quizSubjects } from "@/modules/quiz/data";
import type { MentionCandidate, MentionGroups } from "@/modules/vera/mention-model";

const SEARCH_DEBOUNCE_MS = 150;
const ALL_SUBTESTS = "semua";
const SUBTEST_OPTIONS = [
  { label: "Semua subtes", value: ALL_SUBTESTS },
  ...quizSubjects.map((subject) => ({ label: subject.title, value: subject.title })),
];
const MINUTE_OPTIONS = STUDY_ROUTE_MINUTES.map((value) => ({ label: `${value} menit`, value: String(value) }));
const TOOL_ORDER: readonly StudioToolId[] = ["weakness_analysis", "study_route", "wrong_answer_review"];
const TOOL_ICONS: Record<StudioToolId, AppIcon> = {
  weakness_analysis: Target,
  study_route: Compass,
  wrong_answer_review: ListChecks,
};

type PickedResult = { type: "kuis" | "tryout"; id: string; label: string };

/**
 * The Studio menu in the composer's toolbar. Each of the three tools shows its icon and what it makes. Picking one opens its options
 * dialog, as the old chips did.
 */
export function VeraStudioMenu({ busy, onPick }: { busy: boolean; onPick: (tool: StudioToolId) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Pilih alat Studio" render={<Button disabled={busy} variant="outline" />}>
        Studio
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {TOOL_ORDER.map((tool) => {
          const Icon = TOOL_ICONS[tool];
          return (
            <DropdownMenuItem key={tool} onClick={() => onPick(tool)}>
              <Icon />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{STUDIO_TOOLS[tool].label}</span>
                <span className="text-xs text-muted-foreground">{STUDIO_TOOLS[tool].description}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One tool's options, with its credit estimate and the primary Buat action. The dialog closes when a run starts. */
export function VeraStudioToolDialog({
  busy,
  onClose,
  onRun,
  prices,
  tool,
}: {
  busy: boolean;
  onClose: () => void;
  onRun: (request: StudioRequest) => void;
  prices: VeraPrices;
  tool: StudioToolId | null;
}) {
  const estimate = formatCreditRange(estimateCreditRange({ effort: "mendalam", historyChars: 0, mentionCount: 0 }, prices));
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={tool !== null}
    >
      <DialogContent className="flex w-[calc(100vw-1.5rem)] max-w-[32rem] flex-col gap-5 rounded-panel p-5 sm:max-w-[32rem] sm:p-6">
        {tool ? (
          <>
            <DialogHeader>
              <DialogTitle>{STUDIO_TOOLS[tool].label}</DialogTitle>
              <DialogDescription>{STUDIO_TOOLS[tool].description}</DialogDescription>
            </DialogHeader>
            <ToolOptions busy={busy} estimate={estimate} key={tool} onRun={onRun} tool={tool} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The options for one tool. Its state starts fresh each time the dialog opens, because the dialog's content unmounts when it closes. */
function ToolOptions({
  busy,
  estimate,
  onRun,
  tool,
}: {
  busy: boolean;
  estimate: string;
  onRun: (request: StudioRequest) => void;
  tool: StudioToolId;
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

  function runTool() {
    if (tool === "weakness_analysis") {
      onRun({ tool, input: subtest ? { subtest } : {}, effort: "mendalam" });
    } else if (tool === "study_route") {
      onRun({ tool, input: { minutesPerDay: minutes }, effort: "mendalam" });
    } else {
      onRun({
        tool,
        input: { target: reviewMode === "latest" || !picked ? "latest" : { type: picked.type, id: picked.id } },
        effort: "mendalam",
      });
    }
  }

  return (
    <>
      {tool === "weakness_analysis" ? (
        <ReferenceSelectField
          id="vera-studio-subtes"
          label="Fokus subtes"
          onValueChange={(next) => setSubtest(next === ALL_SUBTESTS ? "" : next)}
          options={SUBTEST_OPTIONS}
          value={subtest || ALL_SUBTESTS}
        />
      ) : null}

      {tool === "study_route" ? (
        <ReferenceSelectField
          id="vera-studio-menit"
          label="Menit per hari"
          onValueChange={(next) => setMinutes(Number(next) as (typeof STUDY_ROUTE_MINUTES)[number])}
          options={MINUTE_OPTIONS}
          value={String(minutes)}
        />
      ) : null}

      {tool === "wrong_answer_review" ? (
        <div className="flex flex-col gap-3">
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
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">{estimate}</span>
        <Button disabled={busy || !reviewReady} onClick={runTool} type="button">
          Buat
        </Button>
      </div>
    </>
  );
}

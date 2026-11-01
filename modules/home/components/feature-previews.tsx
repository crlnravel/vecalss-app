import { BookOpen, Check, Clock, Play, Target, Timer } from "@/lib/icons";
import { cn } from "@/lib/utils";

import type { ProgramFeatureId } from "../data";

const rowClass =
  "flex items-center gap-2.5 rounded-xl border border-[var(--voyage-deep)]/10 bg-white px-3 py-2";

function ProgressBar({ value }: { value: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--voyage-deep)]/10">
      <span
        className="block h-full rounded-full bg-[var(--voyage-leaf)]"
        style={{ width: `${value}%` }}
      />
    </span>
  );
}

function DoneDot({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border",
        done
          ? "border-[var(--voyage-leaf)] bg-[var(--voyage-leaf)] text-white"
          : "border-[var(--voyage-deep)]/20 bg-white",
      )}
    >
      {done ? <Check className="size-3" weight="bold" /> : null}
    </span>
  );
}

function MateriPreview() {
  const chapters = [
    { done: 100, title: "Penalaran Induktif" },
    { done: 60, title: "Penalaran Deduktif" },
    { done: 0, title: "Penalaran Kuantitatif" },
  ];

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--voyage-deep)]/60">
        <BookOpen className="size-3.5" />
        Penalaran Umum
      </p>
      {chapters.map((chapter) => (
        <div className={cn(rowClass, "flex-col items-stretch gap-1.5")} key={chapter.title}>
          <span className="text-xs font-semibold text-[var(--voyage-deep)]">
            {chapter.title}
          </span>
          <ProgressBar value={chapter.done} />
        </div>
      ))}
    </div>
  );
}

function KuisPreview() {
  const options = ["A", "B", "C", "D"];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--voyage-deep)]/60">
        <span>Soal 3 dari 10</span>
        <span className="flex items-center gap-1">
          <Timer className="size-3.5" />
          04:20
        </span>
      </div>
      <div className="grid gap-1.5">
        <span className="h-2 w-full rounded-full bg-[var(--voyage-deep)]/15" />
        <span className="h-2 w-3/4 rounded-full bg-[var(--voyage-deep)]/15" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((option, index) => (
          <span
            className={cn(
              rowClass,
              "text-xs font-bold text-[var(--voyage-deep)]",
              index === 1 &&
                "border-[var(--voyage-leaf)] bg-[var(--sea-glass-wash,#eef8f1)]",
            )}
            key={option}
          >
            <span className="grid size-5 place-items-center rounded-full bg-[var(--voyage-deep)]/10 text-[0.65rem]">
              {option}
            </span>
            <span className="h-1.5 flex-1 rounded-full bg-[var(--voyage-deep)]/15" />
          </span>
        ))}
      </div>
    </div>
  );
}

function TryOutPreview() {
  const answered = new Set([1, 2, 3, 4, 6, 7]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl bg-[var(--voyage-deep)] px-3 py-2 text-white">
        <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/70">
          Sisa waktu
        </span>
        <span className="flex items-center gap-1.5 text-sm font-extrabold tabular-nums">
          <Clock className="size-4" />
          01:42:10
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((number) => (
          <span
            className={cn(
              "grid h-7 place-items-center rounded-lg border text-xs font-bold tabular-nums",
              answered.has(number)
                ? "border-[var(--voyage-leaf)] bg-[var(--voyage-leaf)] text-white"
                : "border-[var(--voyage-deep)]/15 bg-white text-[var(--voyage-deep)]",
              number === 5 && "ring-2 ring-[var(--warm-sun,#ffd766)]",
            )}
            key={number}
          >
            {number}
          </span>
        ))}
      </div>
    </div>
  );
}

function VideoBelajarPreview() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl bg-[var(--voyage-deep)]">
        <span className="grid size-10 place-items-center rounded-full bg-white/90 text-[var(--voyage-deep)]">
          <Play className="size-5" weight="fill" />
        </span>
        <span className="absolute inset-x-3 bottom-2.5 block">
          <span className="block h-1 w-full overflow-hidden rounded-full bg-white/25">
            <span className="block h-full w-2/5 rounded-full bg-[var(--warm-sun,#ffd766)]" />
          </span>
        </span>
      </div>
      <div className="grid gap-1.5">
        <span className="h-2 w-4/5 rounded-full bg-[var(--voyage-deep)]/20" />
        <span className="h-2 w-1/2 rounded-full bg-[var(--voyage-deep)]/12" />
      </div>
    </div>
  );
}

function TargetBelajarPreview() {
  const targets = [
    { label: "Pilihan 1", major: "Kedokteran", campus: "Universitas Indonesia" },
    { label: "Pilihan 2", major: "Psikologi", campus: "Universitas Gadjah Mada" },
  ];

  return (
    <div className="flex flex-col gap-2">
      {targets.map((target, index) => (
        <div className={rowClass} key={target.label}>
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg",
              index === 0
                ? "bg-[var(--voyage-deep)] text-white"
                : "bg-[var(--voyage-deep)]/10 text-[var(--voyage-deep)]",
            )}
          >
            <Target className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--voyage-deep)]/55">
              {target.label}
            </span>
            <span className="block truncate text-xs font-bold text-[var(--voyage-deep)]">
              {target.major}
            </span>
            <span className="block truncate text-[0.7rem] text-[var(--voyage-deep)]/65">
              {target.campus}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function MisiHarianPreview() {
  const missions = [
    { done: true, label: "Selesaikan 1 materi" },
    { done: false, label: "Kerjakan 10 soal Penalaran Umum" },
    { done: false, label: "Daftar Try Out SNBT" },
  ];

  return (
    <div className="flex flex-col gap-2">
      {missions.map((mission) => (
        <div className={rowClass} key={mission.label}>
          <DoneDot done={mission.done} />
          <span
            className={cn(
              "text-xs font-semibold text-[var(--voyage-deep)]",
              mission.done && "line-through opacity-55",
            )}
          >
            {mission.label}
          </span>
        </div>
      ))}
    </div>
  );
}

const previews: Record<ProgramFeatureId, () => React.ReactNode> = {
  materi: MateriPreview,
  kuis: KuisPreview,
  tryout: TryOutPreview,
  "video-belajar": VideoBelajarPreview,
  "target-belajar": TargetBelajarPreview,
  "misi-harian": MisiHarianPreview,
};

export function FeaturePreview({ id }: { id: ProgramFeatureId }) {
  const Preview = previews[id];

  return (
    <div
      aria-hidden="true"
      className="home-feature-preview pointer-events-none select-none p-4"
    >
      <Preview />
    </div>
  );
}

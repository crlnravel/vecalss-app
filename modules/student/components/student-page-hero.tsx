import type { ReactNode } from "react";

import type { AppIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

function StudentPageHero({
  actions,
  className,
  description,
  icon: Icon,
  meta,
  title,
}: {
  actions?: ReactNode;
  className?: string;
  description?: string;
  icon: AppIcon;
  meta?: ReactNode;
  title: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-[2rem] bg-learning-hero-bg px-6 py-8 text-learning-hero-fg shadow-[0_26px_80px_-46px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)] md:px-10 md:py-10",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-14 -top-20 size-64 rounded-full border-[16px] border-voyage-sea-glass/15"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 right-20 size-56 rounded-full bg-voyage-forest/55 blur-3xl"
      />

      <div className="relative grid gap-8 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center md:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="min-w-0">
          <h1 className="max-w-[22ch] font-display text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance md:text-5xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 max-w-[58ch] text-sm leading-6 text-learning-hero-muted sm:text-base sm:leading-7">
              {description}
            </p>
          ) : null}
          {meta || actions ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {meta}
              {actions}
            </div>
          ) : null}
        </div>

        <div aria-hidden="true" className="relative hidden h-32 sm:block md:h-36">
          <span className="absolute inset-1 rounded-full border border-voyage-sea-glass/35" />
          <span className="absolute inset-4 grid place-items-center rounded-full bg-voyage-sea-glass text-voyage-deep shadow-[0_24px_48px_-30px_color-mix(in_oklab,var(--voyage-deep)_68%,transparent)]">
            <Icon className="size-12 md:size-14" strokeWidth={2.1} />
          </span>
          <span className="absolute right-1 top-1 size-8 rounded-full bg-voyage-warm-sun shadow-[0_12px_24px_-16px_color-mix(in_oklab,var(--voyage-deep)_55%,transparent)]" />
        </div>
      </div>
    </section>
  );
}

export { StudentPageHero };

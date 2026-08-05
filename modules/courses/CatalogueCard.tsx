import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type CatalogueCardStat = {
  icon: LucideIcon;
  label: string;
  value: string;
};

type CatalogueCardProps = {
  code: string;
  description: string;
  href: string;
  icon: LucideIcon;
  palette: string;
  stats: CatalogueCardStat[];
  title: string;
  className?: string;
  codeBadge?: boolean;
  leftAccent?: boolean;
};

function CatalogueCard({
  code,
  description,
  href,
  icon: Icon,
  palette,
  stats,
  title,
  className,
  codeBadge = false,
  leftAccent = false,
}: CatalogueCardProps) {
  return (
    <Link
      className={cn(
        "group relative flex min-h-[200px] overflow-hidden rounded-6xl p-6 outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_70px_-50px_rgba(1,76,56,0.42)] focus-visible:ring-3 focus-visible:ring-primary-400/25 md:min-h-[230px] md:p-8",
        palette,
        className,
      )}
      href={href}
    >
      {leftAccent ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-2 bg-primary-700"
        />
      ) : null}
      <div className="flex w-full flex-col gap-3">
        <div className="mb-3 flex items-start gap-4">
          <div
            className={cn(
              "inline-flex items-center gap-2 text-sm font-semibold md:text-base",
              codeBadge
                ? "rounded-[1rem] bg-[linear-gradient(135deg,#b7ddc3_0%,#eef8f1_100%)] px-3 py-2 text-[#176b4d]"
                : null,
            )}
          >
            <Icon className={cn(codeBadge ? "size-5" : "size-4")} />
            <span>{code}</span>
          </div>
        </div>

        <div className="mt-auto">
          <h2
            className={cn(
              "max-w-[12ch] text-4xl leading-[1.05] font-semibold md:text-5xl",
              title.length > 24
                ? "max-w-[16ch] text-3xl md:text-4xl"
                : null,
            )}
          >
            {title}
          </h2>
          <p className="mt-3 line-clamp-2 max-w-[34ch] text-sm leading-6 opacity-82">
            {description}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm font-semibold">
            {stats.map((stat) => {
              const StatIcon = stat.icon;

              return (
                <span
                  className="inline-flex items-center gap-1.5"
                  key={stat.label}
                >
                  <StatIcon className="size-4" />
                  {stat.value}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </Link>
  );
}

export { CatalogueCard };
export type { CatalogueCardStat };

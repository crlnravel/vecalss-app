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
};

function CatalogueCard({
  code,
  description,
  href,
  icon: Icon,
  palette,
  stats,
  title,
}: CatalogueCardProps) {
  return (
    <Link
      className={cn(
        "group relative flex min-h-[200px] overflow-hidden rounded-[34px] p-6 outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_70px_-50px_rgba(1,76,56,0.42)] focus-visible:ring-3 focus-visible:ring-primary-400/25 md:min-h-[230px] md:p-8",
        palette,
      )}
      href={href}
    >
      <div className="flex w-full flex-col gap-3">
        <div className="mb-3 flex items-start gap-4">
          <div className="inline-flex items-center gap-2 text-sm font-semibold md:text-base">
            <Icon className="size-4" />
            <span>{code}</span>
          </div>
        </div>

        <div className="mt-auto">
          <h2
            className={cn(
              "max-w-[12ch] text-[30px] leading-[1.05] font-semibold md:text-[40px]",
              title.length > 24
                ? "max-w-[16ch] text-[28px] md:text-[34px]"
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

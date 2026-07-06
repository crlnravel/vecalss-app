import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProgramCardData } from "../data";

type ProgramCardProps = ProgramCardData;

function ProgramCard({
  title,
  href,
  art,
  artAlt,
  tone,
  chipTone,
}: ProgramCardProps) {
  const isDark = tone === "dark";
  const backgroundClass =
    tone === "accent"
      ? "bg-accent-300"
      : tone === "dark"
        ? "bg-primary-700"
        : "bg-[#f3f3f3]";
  const linkToneClass = isDark ? "text-white" : "text-secondary-900";
  const iconToneClass = isDark
    ? "border-primary-700 bg-white text-primary-700"
    : "border-primary-700 bg-primary-700 text-white";

  return (
    <article
      className={cn(
        backgroundClass,
        "flex min-h-[217px] flex-col justify-between overflow-hidden rounded-5xl border border-primary-700 p-7 shadow-[0px_5px_0px_0px_#191a23] md:h-[297px] md:flex-row md:items-center md:rounded-6xl md:p-[50px]",
      )}
    >
      <div className="flex flex-col gap-10 md:gap-[93px]">
        <div className="flex flex-col items-start">
          {title.map((line) => (
            <Badge
              key={line}
              size="card"
              variant={chipTone === "white" ? "neutral" : "accent"}
            >
              {line}
            </Badge>
          ))}
        </div>

        <Link
          className={cn(
            "inline-flex items-center gap-[15px] text-lg leading-7 font-normal md:text-xl",
            linkToneClass,
          )}
          href={href}
        >
          <span
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full border md:size-[41px]",
              iconToneClass,
            )}
          >
            <ArrowUpRight className="size-4 md:size-[18px]" />
          </span>
          <span>Learn more</span>
        </Link>
      </div>

      <Image
        alt={artAlt}
        className="mt-6 h-[100px] w-[100px] self-end md:mt-0 md:h-[150px] md:w-[150px]"
        height={150}
        src={art}
        width={150}
      />
    </article>
  );
}

export { ProgramCard };

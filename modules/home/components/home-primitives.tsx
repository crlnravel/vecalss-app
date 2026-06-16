import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  description: string;
  label: string;
  tone?: "accent" | "mint";
};

type NavigationDotsProps = {
  active?: number;
  count?: number;
  onSelect?: (index: number) => void;
  tone?: "dark" | "light";
};

type ActionButtonLinkProps = Omit<React.ComponentProps<typeof Link>, "className"> & {
  className?: string;
  variant?: "brand" | "brandOutline" | "inverseOutline";
};

function ActionButtonLink({
  children,
  className,
  variant = "brand",
  ...props
}: ActionButtonLinkProps) {
  return (
    <Link
      className={buttonVariants({
        variant,
        size: "marketing",
        className,
      })}
      {...props}
    >
      {children}
    </Link>
  );
}

function BrandLogo({ compact = false }: { compact?: boolean }) {
  const iconSize = compact ? "h-[40px] w-[50px]" : "h-[55px] w-[68px]";
  const wordSize = compact ? "h-[30px] w-[168px]" : "h-[39px] w-[219px]";

  return (
    <div className="flex items-center">
      <div className={cn(iconSize, "relative shrink-0 overflow-hidden")}>
        <Image
          alt="Vecalss Learning Academy"
          fill
          className="absolute top-[-53.21%] left-[-40.26%] h-[281.41%] w-[181.03%] max-w-none"
          sizes={compact ? "50px" : "68px"}
          src="/landing-assets/logo-sprite.png"
        />
      </div>
      <div className={cn(wordSize, "relative shrink-0 overflow-hidden")}>
        <Image
          alt=""
          fill
          className="absolute top-[-385.48%] left-[-0.03%] h-[708.06%] w-[100.06%] max-w-none"
          sizes={compact ? "168px" : "219px"}
          src="/landing-assets/logo-sprite.png"
        />
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="relative h-12 w-[60px] overflow-hidden">
      <Image
        alt="Vecalss Learning Academy"
        fill
        className="absolute top-[-53.21%] left-[-40.26%] h-[281.41%] w-[181.03%] max-w-none"
        sizes="60px"
        src="/landing-assets/logo-sprite.png"
      />
    </div>
  );
}

function NavigationDots({
  active = 0,
  count = 5,
  onSelect,
  tone = "light",
}: NavigationDotsProps) {
  const activeClass = tone === "light" ? "text-accent-300" : "text-primary-700";
  const inactiveClass =
    tone === "light"
      ? "text-white/70 hover:text-white"
      : "text-secondary-300 hover:text-secondary-900";

  return (
    <div className="flex items-center gap-3 text-[12px]">
      {Array.from({ length: count }).map((_, index) => (
        <button
          aria-label={`Go to testimonial ${index + 1}`}
          key={index}
          className={cn(
            "cursor-pointer transition-colors duration-200",
            index === active ? activeClass : inactiveClass,
          )}
          onClick={() => onSelect?.(index)}
          type="button"
        >
          ✦
        </button>
      ))}
    </div>
  );
}

function SectionHeading({
  label,
  description,
  tone = "accent",
}: SectionHeadingProps) {
  return (
    <div className="flex w-full flex-col items-center gap-4 px-4 text-center md:flex-row md:items-start md:gap-10 md:px-[100px] md:text-left">
      <div className="flex shrink-0 flex-col items-center md:items-start">
        <Badge size="section" variant={tone === "mint" ? "mint" : "accent"}>
          {label}
        </Badge>
      </div>
      <p className="max-w-[653px] text-[16px] leading-tight text-secondary-900 md:text-[18px]">
        {description}
      </p>
    </div>
  );
}

function SocialIcon({ platform }: { platform: "facebook" | "linkedin" | "twitter" }) {
  if (platform === "linkedin") {
    return (
      <svg
        aria-hidden="true"
        className="size-4"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle cx="5.25" cy="7.25" fill="currentColor" r="1.75" />
        <path
          d="M4 10.25h2.5V18H4zM10 10.25h2.4v1.12h.03c.4-.74 1.37-1.52 2.83-1.52 3.03 0 3.6 1.99 3.6 4.58V18H16.4v-3.1c0-1.48-.03-3.38-2.06-3.38-2.07 0-2.39 1.61-2.39 3.28V18H10z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (platform === "facebook") {
    return (
      <svg
        aria-hidden="true"
        className="size-4"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M13.62 20v-7.1h2.38l.36-2.77h-2.74V8.35c0-.8.22-1.34 1.37-1.34H16.1V4.54c-.19-.03-.86-.08-1.63-.08-1.62 0-2.73.99-2.73 2.8v1.87H9.9v2.77h1.84V20z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M18.9 7.15c-.49.22-1.01.36-1.56.43a2.72 2.72 0 0 0 1.2-1.5 5.41 5.41 0 0 1-1.73.66 2.72 2.72 0 0 0-4.64 2.48 7.71 7.71 0 0 1-5.6-2.84 2.72 2.72 0 0 0 .84 3.63 2.7 2.7 0 0 1-1.23-.34v.04c0 1.32.94 2.41 2.18 2.66a2.73 2.73 0 0 1-1.22.05 2.72 2.72 0 0 0 2.54 1.88A5.47 5.47 0 0 1 5.7 15.4a7.71 7.71 0 0 0 4.17 1.22c5 0 7.73-4.14 7.73-7.73v-.35a5.48 5.48 0 0 0 1.3-1.39"
        fill="currentColor"
      />
    </svg>
  );
}

export {
  ActionButtonLink,
  BrandLogo,
  BrandMark,
  NavigationDots,
  SectionHeading,
  SocialIcon,
};

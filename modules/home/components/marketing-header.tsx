import Link from "next/link";
import Image from "next/image";
import { Menu } from "@/lib/icons";
import { buttonVariants } from "@/components/ui/button-variants";

import { marketingNavItems } from "../data";

type MarketingHeaderProps = {
  currentPath?: string;
  layout?: "default" | "landing";
  tone?: "dark" | "light";
};

const landingNavItems = [
  { href: "/#about", label: "Tentang" },
  { href: "/#program", label: "Program" },
  { href: "/#learning-loop", label: "Cara belajar" },
  { href: "/#alumni", label: "Alumni" },
];

function LandingHeader() {
  return (
    <header className="home-landing-header fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-[1040px] -translate-x-1/2 rounded-[16px] border border-[var(--voyage-deep)]/10 bg-white/96 shadow-[0_16px_44px_-30px_rgba(1,76,56,0.5)]">
      <div className="flex h-16 items-center justify-between gap-3 px-2.5 pl-4">
        <Link
          aria-label="Beranda Vecalss"
          className="inline-flex min-h-11 shrink-0 items-center gap-2.5"
          href="/"
        >
          <span className="relative size-7 shrink-0">
            <Image
              alt=""
              fill
              loading="eager"
              className="object-contain"
              sizes="28px"
              src="/brand/logo-mark-cropped.png"
            />
          </span>
          <span
            className="text-base font-normal uppercase leading-none tracking-[0.08em] text-[var(--voyage-deep)]"
            style={{ fontFamily: "var(--font-sports-world)" }}
          >
            Vecalss
          </span>
        </Link>

        <div className="hidden h-full shrink-0 items-center gap-4 lg:flex">
          <nav
            className="flex h-full items-center gap-1"
            aria-label="Navigasi utama"
          >
            {landingNavItems.map((item) => (
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-xs font-semibold text-[var(--voyage-deep)]/78 transition-colors hover:bg-[#f1f5f3] hover:text-[var(--voyage-deep)]"
                href={item.href}
                key={item.label}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            className="inline-flex h-11 w-32 shrink-0 items-center justify-center rounded-xl border border-[var(--voyage-soft-border)] bg-white px-4 text-xs font-semibold text-[var(--voyage-deep)] transition-colors hover:border-[var(--voyage-deep)]/25 hover:bg-[#f1f5f3]"
            href="/login"
          >
            Masuk
          </Link>
        </div>

        <details className="relative flex items-center lg:hidden">
          <summary
            aria-label="Menu navigasi"
            className="landing-elevated-button flex size-11 list-none items-center justify-center rounded-xl bg-[var(--voyage-deep)] text-white [&::-webkit-details-marker]:hidden"
          >
            <Menu className="size-4" />
          </summary>
          <nav
            aria-label="Navigasi seluler"
            className="absolute right-0 top-full mt-3 grid w-[min(18rem,calc(100vw-2.5rem))] gap-1 rounded-[16px] border border-[var(--voyage-deep)]/10 bg-white p-3 shadow-[0_24px_64px_-40px_rgba(1,76,56,0.5)]"
          >
            {landingNavItems.map((item) => (
              <Link
                className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-[var(--voyage-deep)]/72 hover:bg-[#f1f5f3] hover:text-[var(--voyage-deep)]"
                href={item.href}
                key={item.label}
              >
                {item.label}
              </Link>
            ))}
            <Link
              className="landing-elevated-button mt-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--voyage-deep)] px-4 text-sm font-semibold text-white"
              href="/login"
            >
              Masuk
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}

function MarketingHeader({
  currentPath,
  layout = "default",
  tone = "light",
}: MarketingHeaderProps) {
  const showLandingCta = layout === "landing";
  const isDark = tone === "dark";
  const navItems = showLandingCta
    ? marketingNavItems.filter((item) => item.href !== "/login")
    : marketingNavItems;
  const loginItem = marketingNavItems.find((item) => item.href === "/login");

  if (showLandingCta) {
    return <LandingHeader />;
  }

  return (
    <header
      className={`sticky top-0 z-40 w-screen ${showLandingCta ? "backdrop-blur-xl" : "backdrop-blur"} ${isDark ? "bg-voyage-deep/92" : "bg-white/94"}`}
      style={{ marginLeft: "calc(50% - 50vw)" }}
    >
      <div
        className={`mx-auto flex w-full max-w-[1440px] items-center justify-between border-b px-4 md:px-8 lg:px-10 ${showLandingCta ? "py-3 md:py-3.5" : "py-4"} ${isDark ? "border-white/12" : "border-[var(--voyage-deep)]/10"}`}
      >
        <Link
          aria-label="Beranda Vecalss"
          className={`group inline-flex min-h-12 items-center gap-3 rounded-[10px] pr-3 transition-opacity hover:opacity-80 ${isDark ? "text-white" : "text-[var(--voyage-deep)]"}`}
          href="/"
        >
          <span className="relative size-11 shrink-0 md:size-12">
            <Image
              alt=""
              fill
              priority
              className="object-contain"
              sizes="44px"
              src="/brand/logo-mark-cropped.png"
            />
          </span>
          <span
            className={`text-xl font-normal leading-none tracking-[0.08em] uppercase md:text-3xl ${isDark ? "text-white" : "text-[var(--voyage-deep)]"}`}
            style={{ fontFamily: "var(--font-sports-world)" }}
          >
            VECALSS
          </span>
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          <nav className="flex items-center gap-7">
            {navItems.map((item) => {
              const isActive = item.href === currentPath;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold transition-colors ${isDark ? (isActive ? "text-white" : "text-white/68 hover:text-white") : isActive ? "text-[var(--voyage-deep)]" : "text-[var(--voyage-deep)]/62 hover:text-[var(--voyage-deep)]"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {showLandingCta && loginItem ? (
            <span className="inline-flex gap-7">
              <Link
                className={buttonVariants({
                  size: "marketingCompact",
                  variant: isDark ? "inverseOutline" : "marketing",
                })}
                href={loginItem.href}
              >
                {loginItem.label}
              </Link>
            </span>
          ) : null}
        </div>

        <details className="relative lg:hidden">
          <summary
            aria-label="Menu navigasi"
            className={`flex size-12 list-none items-center justify-center rounded-full border [&::-webkit-details-marker]:hidden ${isDark ? "border-white/20 bg-white/10 text-white" : "border-[var(--voyage-deep)]/12 bg-white text-[var(--voyage-deep)]"}`}
          >
            <Menu className="size-5" />
          </summary>
          <div
            className={`absolute right-0 top-full mt-3 w-[18rem] rounded-2xl border p-4 shadow-[0_24px_64px_-44px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)] ${isDark ? "border-white/12 bg-voyage-deep" : "border-[var(--voyage-deep)]/10 bg-white"}`}
          >
            <nav className="flex flex-col gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition-colors ${isDark ? "text-white/72 hover:bg-white/10 hover:text-white" : "text-[var(--voyage-deep)]/70 hover:bg-[var(--voyage-deep)]/5 hover:text-[var(--voyage-deep)]"}`}
                >
                  {item.label}
                </Link>
              ))}
              {showLandingCta && loginItem ? (
                <Link
                  className={buttonVariants({
                    size: "marketingCompact",
                    variant: isDark ? "inverseOutline" : "marketing",
                  })}
                  href={loginItem.href}
                >
                  {loginItem.label}
                </Link>
              ) : null}
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}

export { MarketingHeader };

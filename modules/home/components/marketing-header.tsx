import Link from "next/link";
import Image from "next/image";
import { Menu } from "@/lib/icons";
import { buttonVariants } from "@/components/ui/button-variants";

import { marketingNavItems } from "../data";

type MarketingHeaderProps = {
  currentPath?: string;
  layout?: "default" | "landing";
};

function MarketingHeader({
  currentPath,
  layout = "default",
}: MarketingHeaderProps) {
  const showLandingCta = layout === "landing";
  const navItems = showLandingCta
    ? marketingNavItems.filter((item) => item.href !== "/login")
    : marketingNavItems;
  const loginItem = marketingNavItems.find((item) => item.href === "/login");

  return (
    <header
      className="sticky top-0 z-40 w-screen bg-white/94 backdrop-blur"
      style={{ marginLeft: "calc(50% - 50vw)" }}
    >
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between border-b border-[#014C38]/10 px-4 py-4 md:px-8 lg:px-10">
        <Link
          aria-label="Vecalss homepage"
          className="group inline-flex min-h-12 items-center gap-3 rounded-[10px] pr-3 transition-opacity hover:opacity-80"
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
            className="text-xl font-normal leading-none tracking-[0.08em] text-[#014C38] uppercase md:text-3xl"
            style={{ fontFamily: "var(--font-sports-world)" }}
          >
            VECALSS
          </span>
        </Link>

        <div className="hidden items-center gap-6 lg:flex">
          <nav className="flex items-center gap-8">
            {navItems.map((item) => {
              const isActive = item.href === currentPath;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold transition-colors ${isActive ? "text-[#014C38]" : "text-[#014C38]/62 hover:text-[#014C38]"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {showLandingCta && loginItem ? (
            <span className="inline-flex">
              <Link className={buttonVariants({ size: "marketingCompact", variant: "marketing" })} href={loginItem.href}>
                {loginItem.label}
              </Link>
            </span>
          ) : null}
        </div>

        <details className="relative lg:hidden">
          <summary aria-label="Menu navigasi" className="flex size-12 list-none items-center justify-center rounded-full border border-[#014C38]/12 bg-white text-[#014C38] [&::-webkit-details-marker]:hidden">
            <Menu className="size-5" />
          </summary>
          <div className="absolute right-0 top-full mt-3 w-[18rem] rounded-2xl border border-[#014C38]/10 bg-white p-4 shadow-[0_24px_64px_-44px_rgba(1,76,56,0.24)]">
            <nav className="flex flex-col gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-[#014C38]/70 transition-colors hover:bg-[#014C38]/5 hover:text-[#014C38]"
                >
                  {item.label}
                </Link>
              ))}
              {showLandingCta && loginItem ? (
                <Link className={buttonVariants({ size: "marketingCompact", variant: "marketing" })} href={loginItem.href}>
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

import Link from "next/link";
import { Menu } from "lucide-react";

import { getRegistrationFormUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { marketingNavItems } from "../data";
import { ActionButtonLink, BrandLogo } from "./home-primitives";

type MarketingHeaderProps = {
  currentPath?: string;
};

function MarketingHeader({ currentPath }: MarketingHeaderProps) {
  const registerUrl = getRegistrationFormUrl();

  return (
    <header className="flex items-center justify-between px-4 py-1 md:px-[100px] md:py-5">
      <div className="hidden md:block">
        <BrandLogo />
      </div>

      <div className="md:hidden">
        <BrandLogo compact />
      </div>

      <nav className="hidden items-center gap-10 md:flex">
        {marketingNavItems.map((item) => {
          const isActive = item.href === currentPath;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "text-[20px] leading-7 transition-colors duration-200",
                isActive
                  ? "text-primary-700 underline decoration-primary-700/35 underline-offset-8"
                  : "text-black hover:text-[#124c2b]",
              )}
            >
              {item.label}
            </Link>
          );
        })}
        <ActionButtonLink href="/login" variant="brandOutline">
          Student Login
        </ActionButtonLink>
        <ActionButtonLink href={registerUrl}>
          Register Now
        </ActionButtonLink>
      </nav>

      <details className="relative md:hidden">
        <summary className="list-none rounded-full border border-[#d9dfdb] p-2 text-[#191a23] [&::-webkit-details-marker]:hidden">
          <Menu className="size-5" />
        </summary>
        <div className="absolute right-0 top-full z-20 mt-3 w-56 rounded-[24px] border border-[#191a23] bg-white p-4 shadow-[0px_5px_0px_0px_#191a23]">
          <nav className="flex flex-col gap-3">
            {marketingNavItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "text-[18px] leading-7",
                  item.href === currentPath ? "text-primary-700" : "text-black",
                )}
              >
                {item.label}
              </Link>
            ))}
            <ActionButtonLink className="mt-2 w-full" href="/login" variant="brandOutline">
              Student Login
            </ActionButtonLink>
            <ActionButtonLink className="w-full" href={registerUrl}>
              Register Now
            </ActionButtonLink>
          </nav>
        </div>
      </details>
    </header>
  );
}

export { MarketingHeader };

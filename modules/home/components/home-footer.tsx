import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { footerItems } from "../data";
import { BrandMark, SocialIcon } from "./home-primitives";

function HomeFooter() {
  return (
    <footer className="w-full bg-primary-900 text-white">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 px-6 pt-10 pb-12 text-center md:px-[113px] md:pt-[55px] md:pb-[50px] md:text-left">
        <div className="flex w-full flex-col items-center gap-8 md:flex-row md:items-center md:justify-between">
          <BrandMark />

          <nav className="flex flex-wrap items-center justify-center gap-6 text-[20px] leading-[23px] underline underline-offset-4 md:gap-10">
            {footerItems.map((item) => (
              <Link key={item.label} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-5">
            <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-white text-primary-900">
              <SocialIcon platform="linkedin" />
            </span>
            <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-white text-primary-900">
              <SocialIcon platform="facebook" />
            </span>
            <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-white text-primary-900">
              <SocialIcon platform="twitter" />
            </span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-5 md:max-w-[332px]">
          <Badge size="footer">Contact us</Badge>
          <div className="space-y-3 text-[18px] leading-[1.3]">
            <p>Email: info@vecalss.com</p>
            <p>Phone: 555-567-8901</p>
            <p>
              Address: 1234 Main St
              <br />
              Moonstone City, Stardust State 12345
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 border-t border-white/70 pt-6 md:mt-[50px] md:pt-[50px]">
        <div className="flex flex-col items-center gap-3 text-center text-[18px] md:flex-row md:gap-10 md:text-left">
          <p>© 2026 Vecalss. All Rights Reserved.</p>
          <Link href="#about" className="underline underline-offset-4">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}

export { HomeFooter };

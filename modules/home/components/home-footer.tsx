import Image from "next/image";
import Link from "next/link";
import { AtSign, Mail, MessageCircle } from "lucide-react";

const quickLinks = [
  { label: "About Us", href: "/#about" },
  { label: "Programs", href: "/#program" },
  { label: "Login", href: "/login" },
];

const contactLinks = [
  { label: "Contact Form", href: "/#briefing", icon: Mail },
  { label: "Instagram", href: "https://www.instagram.com/vecalss.academy/", icon: AtSign },
  { label: "WhatsApp & Links", href: "https://linktr.ee/vecalss2025", icon: MessageCircle },
];

function HomeFooter() {
  return (
    <footer className="bg-[#014C38] text-white">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 px-6 py-14 md:px-10 lg:px-16 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.7fr_0.9fr] lg:items-start">
          <div className="max-w-[28rem]">
            <Link
              aria-label="Vecalss homepage"
              className="inline-flex items-center"
              href="/"
            >
              <Image
                alt="Vecalss"
                className="h-auto w-[150px] brightness-0 invert"
                height={44}
                sizes="150px"
                src="/brand/logo-full-cropped.png"
                width={300}
              />
            </Link>
            <p className="mt-5 max-w-[30ch] text-sm leading-7 text-white/76 md:text-base">
              Ekosistem belajar untuk Voyager yang ingin mempersiapkan diri
              menuju PTN dengan lebih terarah.
            </p>
          </div>

          <nav className="grid gap-3 text-sm font-medium">
            <p className="kicker-label mb-2 text-white/52">Quick Links</p>
            {quickLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="inline-flex min-h-11 items-center text-white/72 transition-colors hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <nav className="grid gap-3 text-sm font-medium">
            <p className="kicker-label mb-2 text-white/52">Contact</p>
            {contactLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="inline-flex min-h-11 items-center gap-3 text-white/72 transition-colors hover:text-white"
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/12 pt-6 text-sm text-white/58 md:flex-row md:items-center md:justify-between">
          <p>&copy;&nbsp;2026 Vecalss Learning Academy. Seluruh hak cipta dilindungi.</p>
          <p>Belajar lebih terarah, konsisten, dan percaya diri menuju PTN.</p>
        </div>
      </div>
    </footer>
  );
}

export { HomeFooter };

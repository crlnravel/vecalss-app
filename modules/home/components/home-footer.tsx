import Image from "next/image";
import Link from "next/link";
import { AtSign, BriefcaseBusiness, X } from "@/lib/icons";

const quickLinks = [
  { label: "Tentang Vecalss", href: "/#about" },
  { label: "Program", href: "/#program" },
  { label: "Masuk", href: "/login" },
];

const contactLinks = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/vecalss.academy/",
    icon: AtSign,
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/vecalss",
    icon: BriefcaseBusiness,
  },
  { label: "X", href: "https://x.com/vecalss", icon: X },
];

function HomeFooter() {
  return (
    <footer className="bg-[var(--voyage-deep)] text-white">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 px-6 pt-14 md:px-10 lg:px-16 lg:pt-16">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.7fr_0.9fr] lg:items-start">
          <div className="max-w-[28rem]">
            <Link
              aria-label="Beranda Vecalss"
              className="inline-flex items-center gap-4"
              href="/"
            >
              <Image
                alt="Vecalss"
                className="h-auto w-15 md:w-20"
                height={44}
                sizes="100px"
                src="/brand/logo-mark-cropped.png"
                width={200}
              />
              <span
                className="text-xl font-normal leading-none tracking-[0.08em] text-white uppercase md:text-4xl"
                style={{ fontFamily: "var(--font-sports-world)" }}
              >
                VECALSS
              </span>
            </Link>
            <p className="mt-5 max-w-[30ch] text-sm leading-7 text-voyage-sea-glass md:text-base font-thin">
              Ekosistem belajar untuk Voyager yang ingin mempersiapkan diri
              menuju PTN dengan lebih terarah.
            </p>
          </div>

          <nav
            aria-label="Tautan cepat"
            className="grid gap-3 text-sm font-medium"
          >
            <p className="kicker-label mb-2 text-voyage-sea-glass">
              Tautan cepat
            </p>
            {quickLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="inline-flex min-h-11 items-center text-voyage-sea-glass transition-colors hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <nav
            aria-label="Media sosial"
            className="grid gap-3 text-sm font-medium"
          >
            <p className="kicker-label mb-2 text-voyage-sea-glass">
              Media sosial
            </p>
            {contactLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="inline-flex min-h-11 items-center gap-3 text-voyage-sea-glass transition-colors hover:text-white"
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/12 pt-6 text-sm text-voyage-sea-glass md:flex-row md:items-center md:justify-between">
          <p>
            &copy;&nbsp;2026 Vecalss Learning Academy. Seluruh hak cipta
            dilindungi.
          </p>
        </div>
      </div>
    </footer>
  );
}

export { HomeFooter };

import Link from "next/link";
import { Fragment } from "react";

import { documentText } from "@/lib/legal";
import type { LegalDocument } from "@/lib/legal/types";
import { Info } from "@/lib/icons";
import { HomeFooter } from "@/modules/home/components/home-footer";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

const LEGAL_LINKS = [
  { href: "/kebijakan-privasi", label: "Kebijakan Privasi" },
  { href: "/syarat-ketentuan", label: "Syarat dan Ketentuan" },
  { href: "/syarat-pembelian", label: "Syarat Pembelian" },
] as const;

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

function sectionId(index: number) {
  return `pasal-${index + 1}`;
}

/** Text with each bracketed placeholder marked, so the owner sees what is still open. */
function WithPlaceholders({ text }: { text: string }) {
  return text.split(/(\[[A-Za-z][^\]]*\])/u).map((part, index) =>
    /^\[[A-Za-z][^\]]*\]$/u.test(part) ? (
      <span
        className="rounded-sm bg-student-status-attention-bg px-1 text-student-status-attention-fg"
        key={index}
      >
        {part}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

function LegalPageModule({
  currentHref,
  document,
}: {
  currentHref: (typeof LEGAL_LINKS)[number]["href"];
  document: LegalDocument;
}) {
  const isDraft = document.status === "draft";
  const hasOpenPlaceholder = /\[[A-Za-z][^\]]*\]/u.test(documentText(document));

  return (
    <main className="reference-landing min-h-screen overflow-x-clip bg-[#eef2f0] text-[var(--voyage-deep)]">
      <MarketingHeader currentPath="/" layout="landing" />

      <div className="mx-auto w-full max-w-[680px] px-5 pb-24 pt-32 md:pt-40">
        <header>
          <h1 className="text-balance font-heading text-4xl font-extrabold leading-tight tracking-[-0.04em] text-voyage-ink md:text-5xl">
            {document.title}
          </h1>
          <div className="mt-4 space-y-3 text-pretty text-sm leading-7 text-voyage-deep/85 md:text-base">
            {document.intro.map((paragraph) => (
              <p key={paragraph}>
                <WithPlaceholders text={paragraph} />
              </p>
            ))}
          </div>
        </header>

        {isDraft ? (
          <p
            className="mt-8 flex items-start gap-2.5 text-sm leading-6 text-student-status-attention-fg"
            role="status"
          >
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Ini masih draf per {dateFormat.format(new Date(`${document.draftedOn}T00:00:00+07:00`))}. Isinya belum
              disetujui pemilik PTN Pro dan bisa berubah.
              {hasOpenPlaceholder
                ? " Bagian yang masih dalam tanda kurung siku menunggu data dari pemilik."
                : ""}
            </span>
          </p>
        ) : null}

        <nav aria-label={`Isi ${document.title}`} className="mt-10 border-y border-voyage-soft-border py-5">
          <p className="kicker-label text-voyage-deep/70">Isi halaman</p>
          <ol className="mt-3 grid gap-x-6 text-sm sm:grid-cols-2">
            {document.sections.map((section, index) => (
              <li key={section.heading}>
                <a
                  className="inline-flex min-h-11 items-center font-medium text-voyage-deep underline-offset-4 hover:underline"
                  href={`#${sectionId(index)}`}
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-8">
          {document.sections.map((section, index) => (
            <section aria-labelledby={`${sectionId(index)}-heading`} id={sectionId(index)} key={section.heading}>
              <h2
                className="scroll-mt-28 font-heading text-xl font-extrabold tracking-[-0.035em] text-voyage-ink"
                id={`${sectionId(index)}-heading`}
              >
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-voyage-deep/85">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>
                    <WithPlaceholders text={paragraph} />
                  </p>
                ))}
                {section.items ? (
                  <ul className="list-disc space-y-2 pl-5 marker:text-voyage-deep/50">
                    {section.items.map((item) => (
                      <li key={item}>
                        <WithPlaceholders text={item} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {section.after?.map((paragraph) => (
                  <p key={paragraph}>
                    <WithPlaceholders text={paragraph} />
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <nav
          aria-label="Dokumen hukum lain"
          className="mt-10 border-t border-voyage-soft-border pt-6 text-sm leading-7 text-voyage-deep/85"
        >
          <p className="font-semibold text-voyage-ink">Dokumen lain</p>
          <ul className="mt-1">
            {LEGAL_LINKS.filter((link) => link.href !== currentHref).map((link) => (
              <li key={link.href}>
                <Link
                  className="inline-flex min-h-11 items-center font-semibold text-voyage-deep underline underline-offset-4"
                  href={link.href}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <HomeFooter />
    </main>
  );
}

export { LEGAL_LINKS, LegalPageModule };

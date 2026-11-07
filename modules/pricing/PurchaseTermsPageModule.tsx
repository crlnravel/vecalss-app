import { Info } from "@/lib/icons";
import type { PurchaseTerms } from "@/lib/fulfillment/terms";
import { HomeFooter } from "@/modules/home/components/home-footer";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

type PurchaseTermsPageModuleProps = {
  supportContact: { label: string; url: string };
  terms: PurchaseTerms;
};

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

export default function PurchaseTermsPageModule({ supportContact, terms }: PurchaseTermsPageModuleProps) {
  const isDraft = terms.status === "draft";

  return (
    <main className="reference-landing min-h-screen overflow-x-clip bg-[#eef2f0] text-[var(--voyage-deep)]">
      <MarketingHeader currentPath="/pricing" layout="landing" />

      <div className="mx-auto w-full max-w-[680px] px-5 pb-24 pt-32 md:pt-40">
        <header>
          <h1 className="text-balance font-heading text-4xl font-extrabold leading-tight tracking-[-0.04em] text-voyage-ink md:text-5xl">
            {terms.title}
          </h1>
          <p className="mt-4 max-w-[52ch] text-pretty text-sm leading-7 text-voyage-deep/78 md:text-base">
            Aturan pembelian paket belajar Vecalss, ditulis supaya mudah dipahami.
          </p>
        </header>

        {isDraft ? (
          <p
            className="mt-8 flex items-start gap-2.5 text-sm leading-6 text-student-status-attention-fg"
            role="status"
          >
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Ini masih draf per {dateFormat.format(new Date(`${terms.draftedOn}T00:00:00+07:00`))}. Isinya belum
              disetujui pemilik Vecalss dan bisa berubah sebelum pembelian dibuka.
            </span>
          </p>
        ) : null}

        <div className="mt-10 space-y-8">
          {terms.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-heading text-xl font-extrabold tracking-[-0.035em] text-voyage-ink">
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-voyage-deep/85">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-voyage-soft-border pt-6 text-sm leading-7 text-voyage-deep/85">
          Kontak bantuan:{" "}
          <a
            className="font-semibold text-voyage-deep underline underline-offset-4"
            href={supportContact.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {supportContact.label}
          </a>
        </p>
      </div>

      <HomeFooter />
    </main>
  );
}

import Image from "next/image";

import { topAlumni, type TopAlumni } from "@/modules/alumni/data";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

function TopAlumniPageModule() {
  return (
    <main className="overflow-x-clip bg-white text-[var(--voyage-deep)]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col px-4 py-3 md:px-8 lg:px-10">
        <MarketingHeader currentPath="/top-alumni" />
      </div>

      <div className="mx-auto flex w-full max-w-[1420px] flex-col gap-16 px-4 pb-20 pt-12 md:px-8 md:gap-20 md:pt-16 lg:px-10">
        <div className="mx-auto max-w-[860px] text-center">
          <h1 className="text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-[var(--voyage-deep)] md:text-7xl">
            Contoh profil alumni
          </h1>
          <p className="mt-4 text-base leading-7 text-[var(--voyage-deep)]/68 md:text-lg">
            Daftar ini memakai data contoh dan belum mencerminkan alumni Vecalss
            yang sebenarnya.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {topAlumni.map((alumnus) => (
            <AlumniCard alumnus={alumnus} key={alumnus.id} />
          ))}
        </section>
      </div>
    </main>
  );
}

function AlumniCard({ alumnus }: { alumnus: TopAlumni }) {
  return (
    <article className="group overflow-hidden rounded-4xl border border-[var(--voyage-deep)]/10 bg-white shadow-[0_26px_80px_-66px_color-mix(in_oklab,var(--voyage-deep)_28%,transparent)] transition duration-300 hover:-translate-y-1 hover:border-[var(--voyage-deep)]/18">
      <div className="relative aspect-[4/3] bg-[var(--voyage-deep)]/[0.04]">
        <Image
          alt={`Foto profil ${alumnus.name}`}
          fill
          className="object-cover"
          sizes="(min-width: 1536px) 260px, (min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          src={alumnus.photoSrc}
        />
        {alumnus.logoSrc && alumnus.logoAlt ? (
          <div className="absolute right-4 top-4 size-14">
            <Image
              alt={alumnus.logoAlt}
              fill
              className="object-contain"
              sizes="56px"
              src={alumnus.logoSrc}
            />
          </div>
        ) : null}
      </div>
      <div className="p-5 md:p-6">
        <h3 className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-[var(--voyage-deep)]">
          {alumnus.name}
        </h3>
        <p className="mt-3 text-sm leading-6 text-[var(--voyage-deep)]/68">
          {alumnus.university}
        </p>
      </div>
    </article>
  );
}

export default TopAlumniPageModule;

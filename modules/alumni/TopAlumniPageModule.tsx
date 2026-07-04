import Image from "next/image";

import { topAlumni, type TopAlumni } from "@/modules/alumni/data";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

function TopAlumniPageModule() {
  return (
    <main className="overflow-x-clip bg-white text-[#014C38]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col px-4 py-3 md:px-8 lg:px-10">
        <MarketingHeader currentPath="/top-alumni" />
      </div>

      <div className="mx-auto flex w-full max-w-[1420px] flex-col gap-16 px-4 pb-20 pt-12 md:px-8 md:gap-20 md:pt-16 lg:px-10">
        <div className="mx-auto max-w-[860px] text-center">
          <h1 className="text-balance text-[42px] font-semibold leading-[1.02] tracking-[-0.045em] text-[#014C38] md:text-[68px]">
            Top 20 Alumni
          </h1>
          <p className="mt-4 text-[16px] leading-7 text-[#014C38]/68 md:text-[18px]">
            Tempat para voyager berlabuh!
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
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
    <article className="group overflow-hidden rounded-[20px] border border-[#014C38]/10 bg-white shadow-[0_20px_56px_-48px_rgba(1,76,56,0.26)] transition duration-300 hover:-translate-y-1 hover:border-[#014C38]/18">
      <div className="relative aspect-[1/1] bg-[#014C38]/[0.04]">
        <Image
          alt={`${alumnus.name} profile photo`}
          fill
          className="object-cover"
          sizes="(min-width: 768px) 25vw, (min-width: 640px) 50vw, 100vw"
          src={alumnus.photoSrc}
        />
        {alumnus.logoSrc && alumnus.logoAlt ? (
          <div className="absolute right-3 top-3 size-10 md:size-11">
            <Image
              alt={alumnus.logoAlt}
              fill
              className="object-contain"
              sizes="44px"
              src={alumnus.logoSrc}
            />
          </div>
        ) : null}
      </div>
      <div className="p-4 md:p-5">
        <h3 className="text-[18px] font-semibold leading-tight tracking-[-0.03em] text-[#014C38] md:text-[20px]">
          {alumnus.name}
        </h3>
        <p className="mt-2 text-[13px] leading-5 text-[#014C38]/68 md:text-sm">
          {alumnus.university}
        </p>
        {alumnus.isPlaceholder ? (
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#014C38]/42">
            Placeholder
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default TopAlumniPageModule;

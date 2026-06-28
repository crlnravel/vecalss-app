import Image from "next/image";

import { ActionButtonLink } from "@/modules/home/components/home-primitives";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

export default function NotFound() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-secondary-900">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col px-0 py-4 md:py-3">
        <MarketingHeader />

        <section className="px-4 pb-8 pt-6 md:px-8 md:pb-10 lg:px-10">
          <div className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-[1180px] items-center px-6 py-10 md:px-10 md:py-12 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:gap-10">
            <div className="relative flex items-center justify-center">
              <div className="pointer-events-none absolute bottom-4 h-20 w-[72%] rounded-full bg-black/12 blur-2xl" />
              <div className="pointer-events-none absolute top-0 text-[92px] font-semibold tracking-[-0.08em] text-secondary-900/[0.05] md:text-[132px]">
                404
              </div>
              <Image
                alt="Vecalss mascot"
                width={520}
                height={520}
                className="relative h-auto w-full max-w-[320px] object-contain md:max-w-[400px]"
                priority
                src="/brand/mascot-vecalss.png"
              />
            </div>

            <div className="mt-8 lg:mt-0">
              <h1 className="max-w-[9ch] text-5xl leading-[0.95] font-semibold tracking-[-0.055em] text-[#14171c] md:text-[78px]">
                404
              </h1>
              <p className="mt-5 max-w-[22ch] text-[22px] leading-[1.4] text-secondary-900/36 md:text-[30px]">
                Maaf, sepertinya kamu salah kapal
              </p>

              <div className="mt-8">
                <ActionButtonLink
                  className="rounded-full px-7 py-4 text-[15px] font-semibold"
                  href="/"
                >
                  Kembali
                </ActionButtonLink>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

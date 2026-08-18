import Image from "next/image";

import { ArrowRight } from "@/lib/icons";
import { ActionButtonLink } from "@/modules/home/components/home-primitives";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

export default function NotFound() {
  return (
    <main className="min-h-screen overflow-hidden bg-white text-[#173C2D]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col px-0 py-4 md:py-3">
        <MarketingHeader />

        <section className="relative px-4 pt-5 pb-6 sm:px-6 md:px-8 md:pt-8 md:pb-10 lg:px-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-24 -right-32 size-[28rem] rounded-full bg-[#B7DDC3]/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 -left-40 size-[24rem] rounded-full bg-[#FFD766]/15 blur-3xl"
          />

          <div className="relative mx-auto grid min-h-[calc(100vh-8.5rem)] w-full max-w-[1240px] gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(330px,0.92fr)] lg:gap-10">
            <div className="relative isolate flex min-h-[300px] overflow-hidden rounded-[32px] bg-[#F7FAF8] px-7 py-6 sm:min-h-[470px] sm:px-10 sm:py-12 lg:min-h-[640px] lg:px-12 lg:py-14">
              <div
                aria-hidden="true"
                className="atlas-grid pointer-events-none absolute inset-0 opacity-[0.6]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-40 -left-24 size-[26rem] rounded-full bg-[#B7DDC3]/50 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-10 bottom-[-4rem] size-[18rem] rounded-full bg-[#B7DDC3]/35 blur-3xl"
              />

              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[78%] w-full"
                fill="none"
                preserveAspectRatio="none"
                viewBox="0 0 620 420"
              >
                <path
                  d="M-40 320C70 250 78 104 212 152c126 45 62 216 198 204 83-7 120-85 244-194"
                  stroke="#2F8A5D"
                  strokeDasharray="8 12"
                  strokeLinecap="round"
                  strokeOpacity="0.38"
                  strokeWidth="3"
                />
                <path
                  d="M-22 352c108-73 112-169 211-137 78 25 89 133 159 140"
                  stroke="#FFD766"
                  strokeLinecap="round"
                  strokeOpacity="0.78"
                  strokeWidth="3"
                />
                <circle cx="212" cy="152" fill="#FFD766" r="8" />
                <circle cx="410" cy="356" fill="#B7DDC3" r="7" />
                <circle cx="560" cy="162" fill="#2F8A5D" r="10" />
              </svg>

              <div className="relative z-10 flex w-full flex-col">
                <div className="relative mt-auto flex min-h-[220px] flex-1 items-end justify-center sm:min-h-[380px] sm:items-center lg:min-h-[500px]">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-6 h-16 w-[70%] rounded-full bg-[#176B4D]/15 blur-2xl sm:bottom-8"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-[15%] text-[clamp(9rem,23vw,18rem)] leading-none font-extrabold tracking-[-0.1em] text-[#014C38]/[0.08]"
                  >
                    404
                  </div>
                  <Image
                    alt="Maskot Vecalss"
                    width={520}
                    height={520}
                    className="relative z-10 max-h-[225px] w-auto max-w-[250px] object-contain drop-shadow-[0_30px_24px_rgba(0,31,23,0.18)] sm:h-auto sm:max-h-none sm:w-full sm:max-w-[410px] lg:max-w-[520px]"
                    priority
                    src="/brand/mascot-vecalss.png"
                  />
                </div>
              </div>
            </div>

            <div className="relative flex min-h-[430px] flex-col justify-center bg-white px-7 py-10 sm:px-12 lg:min-h-[640px] lg:px-14 xl:px-16">
              <div className="pt-8 sm:pt-12 lg:pt-0">
                <p className="font-display text-[clamp(5.5rem,12vw,9rem)] leading-[0.78] font-extrabold tracking-[-0.09em] text-[#014C38]">
                  404
                </p>
                <h1 className="mt-6 max-w-[11ch] font-display text-[clamp(2.5rem,4.5vw,4.8rem)] leading-[0.92] font-extrabold tracking-[-0.06em] text-[#173C2D] sm:mt-8">
                  Maaf, sepertinya kamu salah kapal.
                </h1>
                <p className="mt-5 max-w-[30ch] text-base leading-7 text-[#5F776A] sm:mt-6 md:text-lg">
                  Halaman yang kamu cari tidak berlabuh di sini. Yuk, kembali ke
                  rute utama.
                </p>

                <ActionButtonLink
                  className="mt-6 sm:mt-8"
                  href="/"
                >
                  Kembali ke beranda
                  <ArrowRight aria-hidden="true" className="size-5" />
                </ActionButtonLink>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

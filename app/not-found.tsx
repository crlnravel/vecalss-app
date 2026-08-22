import Image from "next/image";
import Link from "next/link";

import { ArrowRight } from "@/lib/icons";
import { ActionButtonLink } from "@/modules/home/components/home-primitives";

export default function NotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-[#173C2D]">
      <div
        aria-hidden="true"
        className="atlas-grid pointer-events-none absolute inset-0 z-0 opacity-[0.6]"
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        fill="none"
        preserveAspectRatio="none"
        viewBox="0 0 1440 900"
      >
        <path
          d="M-80 665c188-248 326-238 467-69 130 156 252 235 386 77 132-156 274-260 743-309"
          stroke="#176B4D"
          strokeDasharray="8 13"
          strokeLinecap="round"
          strokeOpacity="0.34"
          strokeWidth="3"
        />
        <circle cx="190" cy="565" fill="#FFD766" r="8" />
        <circle cx="1145" cy="432" fill="#176B4D" opacity="0.72" r="9" />
      </svg>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-56 right-[-8rem] z-0 size-[34rem] rounded-full bg-[#B7DDC3]/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-12rem] left-[-8rem] z-0 size-[32rem] rounded-full bg-[#FFD766]/12 blur-3xl"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-6 py-7 sm:px-8 md:px-10 md:py-9">
        <header className="flex items-center justify-between">
          <Link
            aria-label="Beranda Vecalss"
            className="group inline-flex min-h-11 items-center gap-3 rounded-[10px] pr-3 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#014C38]/30 focus-visible:ring-offset-4"
            href="/"
          >
            <span className="relative flex size-10 items-center justify-center p-1.5 sm:size-11">
              <Image
                alt=""
                fill
                className="object-contain"
                sizes="44px"
                src="/brand/logo-mark-cropped.png"
              />
            </span>
            <span className="font-logo text-lg tracking-[0.1em] text-[#014C38] sm:text-xl">
              VECALSS
            </span>
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center py-10 md:py-14">
          <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(320px,0.98fr)] lg:gap-14">
            <div className="relative flex min-h-[290px] items-center justify-center px-5 py-8 sm:min-h-[360px] sm:px-10 md:min-h-[420px] lg:min-h-[450px]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-[8%] bottom-[12%] h-12 rounded-full bg-[#176B4D]/14 blur-2xl sm:bottom-[14%]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-[8%] text-[clamp(8rem,22vw,16rem)] leading-none font-extrabold tracking-[-0.1em] text-[#014C38]/[0.07]"
              >
                404
              </div>
              <div className="relative h-[230px] w-[230px] animate-float-slow motion-reduce:animate-none sm:h-[320px] sm:w-[320px] md:h-[390px] md:w-[390px] lg:h-[440px] lg:w-[440px]">
                <Image
                  alt="Maskot Vecalss"
                  fill
                  className="object-contain drop-shadow-[0_30px_24px_rgba(0,31,23,0.18)]"
                  priority
                  sizes="(min-width: 1024px) 440px, (min-width: 768px) 390px, (min-width: 640px) 320px, 230px"
                  src="/brand/mascot-vecalss.png"
                />
              </div>
            </div>

            <div className="flex flex-col justify-center px-1 py-2 sm:px-4 lg:px-0 lg:py-12">
              <p className="font-display text-[clamp(3.25rem,6vw,5.75rem)] leading-[0.88] font-extrabold tracking-[-0.065em] text-[#FFD766]">
                404
              </p>
              <h1 className="mt-5 max-w-[9ch] font-display text-[clamp(2.75rem,5.5vw,5.25rem)] leading-[0.9] font-extrabold tracking-[-0.065em] text-[#173C2D] sm:mt-7">
                Maaf, sepertinya kamu salah kapal.
              </h1>
              <p className="mt-6 max-w-[31ch] text-base leading-7 text-[#5F776A] md:text-lg">
                Halaman yang kamu cari tidak berlabuh di sini. Yuk, kembali ke
                rute utama.
              </p>

              <ActionButtonLink className="mt-7 sm:mt-8" href="/">
                Kembali ke beranda
                <ArrowRight aria-hidden="true" className="size-5" />
              </ActionButtonLink>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

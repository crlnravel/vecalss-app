import Image from "next/image";

export function LoadingPageModule() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="relative min-h-screen overflow-hidden bg-white text-[var(--voyage-ink)]"
    >
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
          stroke="var(--voyage-forest)"
          strokeDasharray="8 13"
          strokeLinecap="round"
          strokeOpacity="0.34"
          strokeWidth="3"
        />
        <circle cx="190" cy="565" fill="var(--voyage-warm-sun)" r="8" />
        <circle cx="1145" cy="432" fill="var(--voyage-forest)" opacity="0.72" r="9" />
      </svg>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-56 right-[-8rem] z-0 size-[34rem] rounded-full bg-[var(--voyage-sea-glass)]/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-12rem] left-[-8rem] z-0 size-[32rem] rounded-full bg-[var(--voyage-warm-sun)]/12 blur-3xl"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-6 py-7 sm:px-8 md:px-10 md:py-9">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex size-10 items-center justify-center p-1.5 sm:size-11">
              <Image
                alt=""
                fill
                className="object-contain"
                sizes="44px"
                src="/brand/logo-mark-cropped.png"
              />
            </span>
            <span className="font-logo text-lg tracking-[0.1em] text-[var(--voyage-deep)] sm:text-xl">
              VECALSS
            </span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10 md:py-14">
          <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(320px,0.98fr)] lg:gap-14">
            <div className="relative flex min-h-[290px] items-center justify-center px-5 py-8 sm:min-h-[360px] sm:px-10 md:min-h-[420px] lg:min-h-[450px]">
              <div className="ship-bob relative h-[170px] w-[280px] sm:h-[210px] sm:w-[340px] md:h-[250px] md:w-[390px]">
                <Image
                  alt=""
                  fill
                  className="object-contain"
                  sizes="(min-width: 768px) 390px, (min-width: 640px) 340px, 280px"
                  src="/brand/voyage-assets/kapal-bajak-laut-vecalss.png"
                />
              </div>
            </div>

            <div className="flex flex-col justify-center px-1 py-2 sm:px-4 lg:px-0 lg:py-12">
              <h1 className="max-w-[9ch] font-display text-[clamp(3.25rem,6vw,5.75rem)] leading-[0.88] font-extrabold tracking-[-0.065em] text-[var(--voyage-warm-sun)]">
                Menyusun
                <span className="mt-2 block text-[var(--voyage-ink)]">rute belajarmu</span>
              </h1>
              <p
                aria-label="Halaman sedang dimuat"
                className="route-shimmer mt-7 max-w-[31ch] text-base leading-7 md:text-lg"
                role="status"
              >
                Menyiapkan halaman Anda…
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

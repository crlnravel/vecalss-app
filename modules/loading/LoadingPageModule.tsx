import Image from "next/image";

export function LoadingPageModule() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="relative min-h-screen overflow-hidden bg-white text-[#173C2D]"
    >
      <div
        aria-hidden="true"
        className="atlas-grid pointer-events-none absolute inset-0 opacity-[0.6]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-56 right-[-8rem] size-[34rem] rounded-full bg-[#B7DDC3]/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-12rem] left-[-8rem] size-[32rem] rounded-full bg-[#FFD766]/12 blur-3xl"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-6 py-7 sm:px-8 md:px-10 md:py-9">
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
            <span className="font-logo text-lg tracking-[0.1em] text-[#014C38] sm:text-xl">
              VECALSS
            </span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10 md:py-14">
          <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(320px,0.98fr)] lg:gap-14">
            <div className="relative isolate flex min-h-[290px] items-center justify-center overflow-hidden rounded-[32px] border border-[#D6E5DB] bg-[#F7FAF8] px-5 py-8 sm:min-h-[360px] sm:px-10 md:min-h-[420px] lg:min-h-[450px]">
              <div
                aria-hidden="true"
                className="atlas-grid pointer-events-none absolute inset-0 opacity-[0.6]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[#B7DDC3]/50 blur-3xl"
              />
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
                fill="none"
                preserveAspectRatio="none"
                viewBox="0 0 560 420"
              >
                <path
                  d="M-30 318c102-126 132-125 210-84 80 41 57 121 138 139 77 17 121-40 267-191"
                  stroke="#176B4D"
                  strokeDasharray="8 13"
                  strokeLinecap="round"
                  strokeOpacity="0.34"
                  strokeWidth="3"
                />
                <circle cx="178" cy="234" fill="#FFD766" r="8" />
                <circle cx="452" cy="182" fill="#176B4D" opacity="0.72" r="9" />
              </svg>

              <div className="route-pulse relative z-10 h-[150px] w-[150px] sm:h-[190px] sm:w-[190px] md:h-[220px] md:w-[220px]">
                <Image
                  alt=""
                  fill
                  className="object-contain"
                  sizes="220px"
                  src="/landing-assets/program-stopwatch.svg"
                />
              </div>
            </div>

            <div className="flex flex-col justify-center px-1 py-2 sm:px-4 lg:px-0 lg:py-12">
              <h1 className="max-w-[9ch] font-display text-[clamp(3.25rem,6vw,5.75rem)] leading-[0.88] font-extrabold tracking-[-0.065em] text-[#FFD766]">
                Menyusun
                <span className="mt-2 block text-[#173C2D]">rute belajarmu</span>
              </h1>
              <p className="mt-7 max-w-[31ch] text-base leading-7 text-[#5F776A] md:text-lg">
                Menyiapkan halaman Anda…
              </p>

              <div
                aria-label="Halaman sedang dimuat"
                className="mt-8 flex items-center gap-3"
                role="status"
              >
                <div className="route-loader relative h-2 flex-1 overflow-hidden rounded-full bg-[#D6E5DB]">
                  <div className="h-full w-2/5 rounded-full bg-[#176B4D]" />
                </div>
                <span className="text-ui-xs font-bold tracking-[0.15em] text-[#5F776A] uppercase">
                  Tunggu
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

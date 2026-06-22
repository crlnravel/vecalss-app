import Image from "next/image";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf6ec_0%,#f5eedf_50%,#efe5d2_100%)] text-secondary-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-10 md:px-10">
        <div className="parchment-panel mx-auto w-full max-w-3xl overflow-hidden rounded-[36px] px-6 py-10 text-center md:px-12 md:py-14">
          <div className="relative mx-auto h-[56px] w-[190px]">
            <Image
              alt="Vecalss Learning Academy"
              fill
              className="object-contain"
              sizes="190px"
              src="/brand/logo-full-cropped.png"
            />
          </div>

          <div className="relative mx-auto mt-8 flex h-[170px] w-[170px] items-center justify-center rounded-full bg-[#fff9ed] shadow-[0_30px_80px_-46px_rgba(11,18,45,0.28)] md:h-[210px] md:w-[210px]">
            <div className="route-orbit absolute inset-2 rounded-full border border-dashed border-primary-200/70" />
            <div className="route-pulse relative h-[98px] w-[98px] md:h-[126px] md:w-[126px]">
              <Image
                alt=""
                fill
                className="object-contain"
                sizes="126px"
                src="/landing-assets/program-stopwatch.svg"
              />
            </div>
          </div>

          <p className="mt-8 text-xs tracking-[0.18em] text-primary-700 uppercase">
            Plotting the next route
          </p>
          <h1 className="mt-3 text-3xl leading-tight font-medium md:text-4xl">
            Getting your next Vecalss view ready.
          </h1>
          <p className="mx-auto mt-4 max-w-[44ch] text-sm leading-7 text-secondary-600 md:text-base">
            We are lining up the next page so the transition still feels calm,
            structured, and on course.
          </p>

          <div className="mx-auto mt-8 grid max-w-xl gap-3 md:grid-cols-3">
            {["Preparing content", "Aligning the layout", "Opening the next step"].map((item) => (
              <div
                key={item}
                className="route-loader rounded-[18px] border border-secondary-900/10 bg-white/78 px-4 py-4 text-sm text-secondary-700 shadow-[0_18px_38px_-30px_rgba(11,18,45,0.16)]"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

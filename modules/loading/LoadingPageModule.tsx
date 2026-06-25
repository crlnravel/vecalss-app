import Image from "next/image";

export function LoadingPageModule() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf6ec_0%,#f5eedf_50%,#efe5d2_100%)] text-secondary-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-10 md:px-10">
        <div className="flex flex-col items-center text-center">
          <div className="route-pulse relative h-[112px] w-[112px] md:h-[140px] md:w-[140px]">
            <Image
              alt="Loading"
              fill
              className="object-contain"
              sizes="140px"
              src="/landing-assets/program-stopwatch.svg"
            />
          </div>

          <h1 className="mt-6 text-2xl leading-tight font-semibold text-secondary-800 md:text-3xl">
            Menyiapkan halaman Anda...
          </h1>
        </div>
      </div>
    </main>
  );
}

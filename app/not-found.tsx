import Image from "next/image";
import Link from "next/link";

import { ActionButtonLink } from "@/modules/home/components/home-primitives";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf6ec_0%,#f5eedf_52%,#efe5d2_100%)] text-secondary-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6 md:px-10">
        <div className="flex items-center justify-between rounded-[24px] border border-secondary-900/10 bg-[rgba(255,249,236,0.84)] px-4 py-3 shadow-[0_18px_48px_-32px_rgba(11,18,45,0.16)] backdrop-blur md:px-5">
          <Link href="/" className="relative h-[50px] w-[178px] shrink-0">
            <Image
              alt="Vecalss Learning Academy"
              fill
              className="object-contain"
              sizes="178px"
              src="/brand/logo-full-cropped.png"
            />
          </Link>
          <p className="hidden text-sm text-secondary-500 md:block">
            The route changed, but the destination is still close.
          </p>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.04fr)_minmax(320px,0.96fr)]">
            <section className="parchment-panel rounded-[34px] p-7 md:p-10">
              <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">
                Route not found
              </p>
              <h1 className="mt-4 max-w-[12ch] text-4xl leading-[1.02] font-medium md:text-6xl">
                This page drifted off the map.
              </h1>
              <p className="mt-5 max-w-[54ch] text-base leading-7 text-secondary-600 md:text-lg md:leading-8">
                The link may be out of date, or the page may have moved. The rest of
                the Vecalss route is still available.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <ActionButtonLink href="/">Back to home</ActionButtonLink>
                <ActionButtonLink href="/faq" variant="brandOutline">
                  Open the FAQ
                </ActionButtonLink>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  "Check the main route",
                  "Open About for the overview",
                  "Use FAQ for the quickest answers",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[18px] border border-secondary-900/10 bg-white/76 px-4 py-4 text-sm leading-6 text-secondary-700"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <aside className="navy-panel relative overflow-hidden rounded-[34px] px-6 py-8 text-white md:px-8">
              <div className="absolute right-5 top-5 relative flex size-[4.5rem] items-center justify-center rounded-full border border-white/10 bg-white/8">
                <Image
                  alt=""
                  fill
                  className="object-contain p-4"
                  sizes="72px"
                  src="/landing-assets/program-consultation.svg"
                />
              </div>
              <p className="text-xs tracking-[0.16em] text-accent-300 uppercase">
                Quick return
              </p>
              <h2 className="mt-4 max-w-[12ch] text-[30px] leading-[1.08] font-medium md:text-[38px]">
                Pick the next clean route.
              </h2>
              <div className="mt-7 grid gap-3">
                {[
                  { label: "Home", href: "/" },
                  { label: "About", href: "/about" },
                  { label: "FAQ", href: "/faq" },
                ].map((item, index) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-[20px] border border-white/10 bg-white/6 px-4 py-4 transition-colors hover:bg-white/10"
                  >
                    <p className="text-[11px] tracking-[0.16em] text-accent-300 uppercase">
                      {`0${index + 1}`}
                    </p>
                    <p className="mt-2 text-lg font-medium text-white">{item.label}</p>
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

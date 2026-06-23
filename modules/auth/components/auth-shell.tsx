import Image from "next/image";
import Link from "next/link";

function AuthShell({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-secondary-50 text-secondary-900">
      <div className="grid min-h-screen lg:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
        <aside className="relative isolate flex min-h-[500px] flex-col overflow-hidden bg-primary-800 px-5 py-6 text-white md:px-10 lg:h-screen lg:min-h-screen lg:px-12 lg:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_78%,rgba(122,189,168,0.34),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_42%)]" />
          <Link
            href="/"
            className="relative z-10 inline-flex w-fit items-center gap-3"
            aria-label="Vecalss"
          >
            <Image
              alt=""
              aria-hidden="true"
              className="h-12 w-12 object-contain"
              height={64}
              priority
              src="/brand/logo-mark-cropped.png"
              width={64}
            />
            <span
              className="text-[28px] leading-none tracking-[0.02em] text-white"
              style={{ fontFamily: "var(--font-sports-world)" }}
            >
              VECALSS
            </span>
          </Link>

          <div className="relative z-10 mt-14 max-w-[25rem] lg:mt-20">
            <h1 className="font-heading text-[38px] leading-[1.04] font-semibold text-white md:text-[54px] lg:text-[60px]">
              {title}
            </h1>
          </div>

          <div className="pointer-events-none absolute bottom-[-125px] left-1/2 z-[5] flex w-[min(104vw,650px)] -translate-x-1/2 justify-center md:bottom-[-210px] lg:bottom-[-210px] lg:w-[min(48vw,680px)]">
            <div className="absolute bottom-24 left-1/2 h-9 w-[64%] -translate-x-1/2 rounded-full bg-secondary-900/22 blur-xl" />
            <Image
              alt="Vecalss mascot"
              className="relative z-10 h-auto w-full object-contain drop-shadow-[0_30px_34px_rgba(2,47,36,0.3)]"
              height={620}
              priority
              sizes="(min-width: 1024px) 39vw, 76vw"
              src="/brand/mascot-vecalss.png"
              width={620}
            />
          </div>
        </aside>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 md:px-8 lg:px-12">
          <div className="w-full max-w-[520px]">
            <div className="mb-9">
              <h2 className="font-heading text-[42px] leading-none font-semibold text-secondary-900 md:text-[52px]">
                Selamat Datang
              </h2>
              <p className="mt-4 text-lg leading-7 text-secondary-600">
                {description}
              </p>
            </div>

            <div className="rounded-[28px] bg-white px-5 py-6 shadow-[0_22px_68px_-48px_rgba(1,76,56,0.48)] md:px-8 md:py-8">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export { AuthShell };

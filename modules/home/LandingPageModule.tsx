import Image from "next/image";
import type { ElementType } from "react";

import { ArrowRight, ArrowUpRight, BookOpenText, Brain, CheckCircle2, Compass, Gauge, ListChecks, MessageCircle, Sparkles, Users } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { featuredTopAlumni, type TopAlumni } from "@/modules/alumni/data";

import { FAQ } from "./components/FAQ";
import { HomeFooter } from "./components/home-footer";
import { ActionButtonLink } from "./components/home-primitives";
import { MarketingHeader } from "./components/marketing-header";
import { MentorCards } from "./components/mentor-cards";
import {
  campusCrewMarks,
  crewMembers,
  faqItems,
  pathways,
  testimonials,
} from "./data";

type LoopItem = {
  body: string;
  icon: ElementType;
  label: string;
  title: string;
};

const loopItems: LoopItem[] = [
  {
    body: "Mulai dari konsep yang perlu kamu kuasai.",
    icon: BookOpenText,
    label: "01",
    title: "Materi",
  },
  {
    body: "Uji pemahaman dengan latihan yang terarah.",
    icon: ListChecks,
    label: "02",
    title: "Kuis",
  },
  {
    body: "Baca kesiapanmu lewat simulasi yang lebih utuh.",
    icon: Gauge,
    label: "03",
    title: "Tryout",
  },
  {
    body: "Dapatkan teman berpikir yang menjaga ritmemu.",
    icon: Users,
    label: "04",
    title: "Kapten",
  },
];

const pathwayToneClasses = {
  deep: "bg-voyage-forest text-white border-white/12",
  emerald: "bg-voyage-deep-hover text-white border-white/12",
  paper: "bg-voyage-canvas text-voyage-deep border-voyage-deep/10",
  soft: "bg-voyage-sea-glass text-voyage-deep border-voyage-deep/10",
} as const;

function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-voyage-deep text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-44 top-14 size-[34rem] rounded-full border border-white/10" />
        <div className="absolute -right-20 top-44 size-[26rem] rounded-full border border-voyage-sea-glass/25" />
        <div className="absolute left-[9%] top-[30%] size-2 rounded-full bg-voyage-warm-sun" />
        <div className="absolute right-[31%] top-[17%] size-3 rounded-full bg-voyage-leaf" />
        <span className="absolute -bottom-6 right-[-1rem] hidden font-display text-8xl font-black leading-none tracking-[-0.04em] text-white/[0.04] xl:block">
          ARAH
        </span>
      </div>

      <div className="relative mx-auto w-full max-w-[1440px] px-4 md:px-8 lg:px-10">
        <MarketingHeader currentPath="/" layout="landing" tone="dark" />

        <div className="grid min-h-[calc(100svh-80px)] gap-12 py-14 lg:grid-cols-[0.9fr_0.82fr] lg:items-center lg:gap-16 lg:py-20">
          <div className="relative z-10 max-w-[720px]">
            <h1 className="max-w-[11ch] text-balance font-display text-6xl font-extrabold leading-[0.91] tracking-[-0.04em] sm:text-7xl md:text-8xl">
              Mulai dari <span className="text-voyage-warm-sun">yang kecil.</span>{" "}
              Lanjut sampai <span className="text-voyage-sea-glass">PTN.</span>
            </h1>
            <p className="mt-8 max-w-[47ch] text-base leading-7 text-voyage-sea-glass sm:text-lg sm:leading-8">
              Peta belajar yang jelas, ritme yang konsisten, dan Kapten yang
              menjaga perjalananmu tetap menuju tujuan.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <ActionButtonLink href="/login" variant="onboarding">
                Mulai Belajar
                <ArrowRight className="ml-1 size-4" />
              </ActionButtonLink>
              <ActionButtonLink href="#program" variant="inverseOutline">
                Lihat Program
              </ActionButtonLink>
            </div>

            <div className="mt-14 flex max-w-[31rem] items-center gap-4 border-t border-white/12 pt-5 text-sm text-voyage-sea-glass">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-voyage-warm-sun" />
              <p>
                Satu jalur terhubung: Materi <span className="text-voyage-sea-glass">→</span>{" "}
                Kuis <span className="text-voyage-sea-glass">→</span> Tryout{" "}
                <span className="text-voyage-sea-glass">→</span> Kapten.
              </p>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[620px] lg:justify-self-end">
            <div className="absolute inset-[9%] rounded-5xl bg-voyage-sea-glass/75 blur-[1px]" />
            <div className="relative aspect-square overflow-visible rounded-5xl border border-white/10 bg-voyage-forest/82 shadow-[0_36px_100px_-48px_rgba(0,0,0,0.75)]">
              <div className="absolute inset-7 rounded-4xl border border-white/10" />
              <div className="absolute left-[-1rem] top-[13%] z-20 inline-flex items-center gap-2 rounded-full bg-voyage-warm-sun px-4 py-2 text-xs font-bold tracking-[0.12em] text-voyage-warm-sun-ink shadow-[0_14px_34px_-20px_rgba(0,0,0,0.6)]">
                MATERI <ArrowRight aria-hidden="true" className="size-3.5" /> KUIS
              </div>
              <div className="absolute right-[-1rem] top-[48%] z-20 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold tracking-[0.12em] text-voyage-deep shadow-[0_14px_34px_-20px_rgba(0,0,0,0.6)]">
                TRYOUT <ArrowRight aria-hidden="true" className="size-3.5" /> KAPTEN
              </div>
              <div className="absolute bottom-[9%] left-[10%] z-20 rounded-2xl border border-white/18 bg-voyage-deep/80 px-4 py-3 backdrop-blur">
                <p className="text-xs font-bold tracking-[0.18em] text-voyage-sea-glass">THE VECALSS WAY</p>
                <p className="mt-1 text-sm font-semibold text-white">Bergerak setiap hari.</p>
              </div>

              <Image
                alt="Maskot Vecalss sebagai Kapten perjalanan belajar"
                className="animate-float-slow absolute inset-5 z-10 size-[calc(100%-2.5rem)] object-contain drop-shadow-[0_36px_48px_rgba(0,0,0,0.28)]"
                height={720}
                priority
                sizes="(min-width: 1024px) 560px, 88vw"
                src="/brand/mascot-vecalss.png"
                width={720}
              />
              <Image
                alt=""
                aria-hidden="true"
                className="absolute -bottom-5 -right-8 z-20 w-[39%] rotate-[11deg] object-contain drop-shadow-[0_24px_28px_rgba(0,0,0,0.28)]"
                height={480}
                sizes="240px"
                src="/brand/voyage-assets/perahu.png"
                width={480}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/12 py-5 text-sm text-voyage-sea-glass sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[32ch]">Dari fondasi sampai hari ujian, kamu tidak perlu menebak sendirian.</p>
          <div className="flex flex-wrap gap-2" aria-label="Vecalss learning loop">
            {loopItems.map((item) => (
              <span className="rounded-full border border-white/12 px-3 py-1.5 text-xs font-semibold text-voyage-sea-glass" key={item.title}>
                {item.title}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CampusRibbon() {
  return (
    <section className="overflow-hidden bg-voyage-warm-sun text-voyage-deep">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-8 md:px-8 md:py-10 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="max-w-[28rem]">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-voyage-warm-sun-ink">Tempat para Voyager berlabuh</p>
          <p className="mt-2 text-lg font-semibold tracking-[-0.02em]">Tujuan boleh berbeda. Arah belajarnya tetap jelas.</p>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-start gap-7 overflow-hidden lg:justify-end lg:gap-10">
          {campusCrewMarks.map((item) => (
            <div className="relative h-12 w-20 shrink-0 opacity-65 grayscale brightness-0 transition-opacity hover:opacity-100 md:h-14 md:w-24" key={item.name}>
              <Image alt={item.markAlt} className="object-contain" fill sizes="96px" src={item.markSrc} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LearningLoopSection() {
  return (
    <section className="bg-voyage-canvas px-4 py-20 md:px-8 md:py-28 lg:px-10" id="journey">
      <div className="mx-auto grid w-full max-w-[1180px] gap-14 lg:grid-cols-[0.72fr_1fr] lg:items-center lg:gap-20">
        <div>
          <h2 className="max-w-[10ch] text-balance font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] text-voyage-deep md:text-7xl">
            Belajar dengan <span className="text-voyage-forest">jalur,</span> bukan tebakan.
          </h2>
          <p className="mt-7 max-w-[43ch] text-base leading-7 text-voyage-ink md:text-lg md:leading-8">
            Vecalss merangkai aktivitas belajar menjadi satu perjalanan yang
            bisa kamu lihat, jalani, dan ulangi dengan ritme yang lebih masuk akal.
          </p>
          <ActionButtonLink className="mt-9" href="/login" variant="marketing">
            Mulai dari sini
            <ArrowRight className="ml-1 size-4" />
          </ActionButtonLink>
        </div>

        <div className="relative">
          <div aria-hidden="true" className="absolute left-6 right-6 top-1/2 hidden border-t border-dashed border-voyage-deep/20 sm:block" />
          <div className="grid gap-3 sm:grid-cols-2">
            {loopItems.map((item, index) => {
              const Icon = item.icon;

              return (
                <article
                  className={cn(
                    "relative flex min-h-[220px] flex-col justify-between rounded-4xl border p-6 transition-transform duration-500 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                    index === 0 && "bg-white text-voyage-deep shadow-[0_24px_52px_-38px_rgba(23,107,77,0.55)]",
                    index === 1 && "bg-voyage-sea-glass-wash text-voyage-deep",
                    index === 2 && "bg-voyage-forest text-white shadow-[0_24px_52px_-38px_rgba(1,76,56,0.7)]",
                    index === 3 && "bg-voyage-warm-sun text-voyage-warm-sun-ink",
                  )}
                  key={item.title}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid size-12 place-items-center rounded-2xl bg-current/10">
                      <Icon aria-hidden="true" className="size-6" />
                    </span>
                    <span className="text-sm font-bold tracking-[0.15em]">{item.label}</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold tracking-[-0.04em]">{item.title}</h3>
                    <p className="mt-2 max-w-[24ch] text-sm leading-6">{item.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section className="bg-white px-4 py-20 md:px-8 md:py-28 lg:px-10" id="about">
      <div className="mx-auto grid w-full max-w-[1180px] gap-12 lg:grid-cols-[0.92fr_1fr] lg:items-center lg:gap-20">
        <div className="relative min-h-[360px] overflow-hidden rounded-5xl bg-voyage-sea-glass-wash md:min-h-[520px]">
          <div aria-hidden="true" className="absolute -left-16 top-10 size-64 rounded-full border border-voyage-forest/15" />
          <div aria-hidden="true" className="absolute -right-20 bottom-0 size-72 rounded-full bg-voyage-sea-glass/70" />
          <Image
            alt="Variasi maskot Vecalss yang menemani perjalanan belajar"
            className="relative z-10 size-full object-contain object-center drop-shadow-[0_34px_70px_color-mix(in_oklab,var(--voyage-deep)_18%,transparent)]"
            height={720}
            sizes="(min-width: 1024px) 550px, 92vw"
            src="/brand/voyage-assets/mascot-about-variation.png"
            width={720}
          />
          <div className="absolute bottom-6 left-6 z-20 rounded-3xl bg-voyage-deep px-5 py-4 text-white shadow-[0_24px_52px_-34px_rgba(1,76,56,0.8)]">
            <p className="text-3xl font-extrabold leading-none tracking-[-0.04em]">15.000+</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.15em] text-voyage-sea-glass">Voyager dalam perjalanan</p>
          </div>
        </div>

        <div>
          <h2 className="max-w-[11ch] text-balance font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] text-voyage-deep md:text-7xl">
            Perjalanan kecil yang terasa berarti.
          </h2>
          <p className="mt-7 max-w-[50ch] text-base leading-7 text-voyage-ink md:text-lg md:leading-8">
            Vecalss tumbuh dari ruang belajar kecil menjadi ekosistem yang
            membantu Voyager menata persiapan menuju PTN dengan lebih terarah,
            konsisten, dan tidak sendirian.
          </p>
          <div className="mt-10 grid gap-6 border-t border-voyage-deep/12 pt-6 sm:grid-cols-2">
            <div>
              <p className="text-3xl font-extrabold tracking-[-0.04em] text-voyage-deep">4 tahun</p>
              <p className="mt-1 text-sm leading-6 text-voyage-ink">Menjaga ritme perjalanan belajar.</p>
            </div>
            <div>
              <p className="text-3xl font-extrabold tracking-[-0.04em] text-voyage-deep">1 arah</p>
              <p className="mt-1 text-sm leading-6 text-voyage-ink">Menuju tujuan yang kamu pilih sendiri.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProgramsSection() {
  return (
    <section className="bg-voyage-deep px-4 py-20 text-white md:px-8 md:py-28 lg:px-10" id="program">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="grid gap-8 lg:grid-cols-[0.82fr_0.5fr] lg:items-end lg:gap-16">
          <h2 className="max-w-[10ch] text-balance font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] md:text-7xl">
            Pilih rute yang sesuai dengan musim belajarmu.
          </h2>
          <p className="max-w-[35ch] text-base leading-7 text-voyage-sea-glass md:text-lg md:leading-8">
            Empat misi untuk fase perjalanan yang berbeda — dari mulai lebih
            awal sampai pendampingan yang lebih personal.
          </p>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-12">
          {pathways.map((pathway, index) => (
            <article
              className={cn(
                "relative min-h-[360px] overflow-hidden rounded-4xl border p-7 md:p-9",
                pathwayToneClasses[pathway.tone],
                index === 0 && "lg:col-span-7 lg:min-h-[450px]",
                index === 1 && "lg:col-span-5 lg:min-h-[450px]",
                index === 2 && "lg:col-span-5 lg:min-h-[390px]",
                index === 3 && "lg:col-span-7 lg:min-h-[390px]",
              )}
              key={pathway.id}
            >
              <div className="relative z-10 flex items-start justify-between gap-4">
                <span className="rounded-full border border-current/20 px-3 py-1.5 text-xs font-bold tracking-[0.14em]">
                  Rute {pathway.kicker}
                </span>
              </div>
              <h3 className="relative z-10 mt-12 max-w-[12ch] text-4xl font-extrabold leading-[0.95] tracking-[-0.04em] md:text-6xl">
                {pathway.title}
              </h3>
              <p className="relative z-10 mt-5 max-w-[32ch] text-base leading-7">{pathway.summary}</p>
              <div className="relative z-10 mt-8 grid gap-2">
                {pathway.details.map((detail) => (
                  <p className="flex items-start gap-2 text-sm leading-6" key={detail}>
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>{detail}</span>
                  </p>
                ))}
              </div>
              <Image
                alt={pathway.artAlt}
                className="absolute -bottom-9 -right-6 z-0 h-auto w-[47%] object-contain opacity-80 md:-bottom-12 md:-right-8 md:w-[45%]"
                height={420}
                sizes="(min-width: 1024px) 320px, 45vw"
                src={pathway.art}
                width={420}
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PrinciplesSection() {
  const principles = [
    { body: "Fondasi konsep dibuat kuat sebelum masuk ke latihan berat.", icon: Brain, title: "Fundamental" },
    { body: "Ritme belajar dijaga agar Voyager tetap bergerak setiap minggu.", icon: Compass, title: "Konsisten" },
    { body: "Kebiasaan belajar dibangun sampai hari ujian tiba.", icon: Sparkles, title: "Disiplin" },
  ];

  return (
    <section className="bg-voyage-warm-sun px-4 py-20 text-voyage-deep md:px-8 md:py-28 lg:px-10">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_0.5fr] lg:items-end lg:gap-16">
          <h2 className="max-w-[10ch] text-balance font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] md:text-7xl">
            Tiga kebiasaan yang membawa kapal tetap bergerak.
          </h2>
          <p className="max-w-[35ch] text-base leading-7 text-voyage-deep md:text-lg md:leading-8">
            Hasil besar dibangun dari keputusan kecil yang terus diulang.
          </p>
        </div>

        <div className="mt-14 grid gap-3 md:grid-cols-3">
          {principles.map(({ body, icon: Icon, title }, index) => (
            <article className={cn("min-h-[300px] rounded-4xl border border-voyage-deep/12 p-7 md:p-8", index === 1 ? "bg-voyage-deep text-white" : "bg-white/55")} key={title}>
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-12 place-items-center rounded-2xl bg-voyage-deep/10">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                <Sparkles aria-hidden="true" className="size-7 opacity-20" />
              </div>
              <h3 className="mt-16 text-3xl font-extrabold tracking-[-0.04em]">{title}</h3>
              <p className="mt-3 max-w-[28ch] text-sm leading-6">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function MentorsSection() {
  return (
    <section className="bg-white px-4 py-20 md:px-8 md:py-28 lg:px-10">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="grid gap-8 lg:grid-cols-[0.82fr_0.5fr] lg:items-end lg:gap-16">
          <h2 className="max-w-[10ch] text-balance font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] text-voyage-deep md:text-7xl">
            Para Kapten yang ikut membaca arah.
          </h2>
          <p className="max-w-[35ch] text-base leading-7 text-voyage-ink md:text-lg md:leading-8">
            Tutor dari UI, ITB, UGM, dan PTN unggulan lainnya yang hadir di balik setiap kelas.
          </p>
        </div>
        <MentorCards members={crewMembers} />
      </div>
    </section>
  );
}

function AlumniSection() {
  return (
    <section className="bg-voyage-canvas px-4 py-20 md:px-8 md:py-28 lg:px-10">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
          <h2 className="max-w-[10ch] text-balance font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] text-voyage-deep md:text-7xl">
              Tujuan yang akhirnya terasa dekat.
            </h2>
            <p className="mt-6 max-w-[42ch] text-base leading-7 text-voyage-ink md:text-lg md:leading-8">
              Tempat para Voyager berlabuh setelah menata fondasi, latihan, dan keberanian mereka.
            </p>
          </div>
          <ActionButtonLink
            href="https://docs.google.com/spreadsheets/d/1bbnfOYTPHhN3obMEyrNU3yEoHzvSoJ5fCjtNWCiPdHM/edit?gid=0#gid=0"
            target="_blank"
            variant="marketing"
          >
            Lihat Top 90 dan alumni lainnya
            <ArrowUpRight className="ml-1 size-4" />
          </ActionButtonLink>
        </div>

        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {featuredTopAlumni.map((alumnus) => (
            <TopAlumniCard alumnus={alumnus} key={alumnus.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TopAlumniCard({ alumnus }: { alumnus: TopAlumni }) {
  return (
    <article className="group overflow-hidden rounded-4xl border border-voyage-deep/10 bg-white transition-transform duration-500 hover:-translate-y-1 hover:shadow-[0_34px_90px_-70px_color-mix(in_oklab,var(--voyage-deep)_55%,transparent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="relative aspect-[4/5] bg-voyage-deep/[0.04]">
        <Image
          alt={`${alumnus.name} profile photo`}
          className="object-cover transition duration-700 group-hover:scale-[1.04] motion-reduce:transition-none"
          fill
          sizes="(min-width: 1024px) 20vw, (min-width: 640px) 50vw, 100vw"
          src={alumnus.photoSrc}
        />
        {alumnus.logoSrc && alumnus.logoAlt ? (
          <div className="absolute right-3 top-3 size-9 rounded-full bg-white/88 p-1.5 backdrop-blur">
            <Image alt={alumnus.logoAlt} className="object-contain" fill sizes="36px" src={alumnus.logoSrc} />
          </div>
        ) : null}
      </div>
      <div className="p-4">
        <h3 className="text-lg font-extrabold leading-tight tracking-[-0.03em] text-voyage-deep">{alumnus.name}</h3>
        <p className="mt-1.5 text-sm leading-5 text-voyage-ink">{alumnus.university}</p>
        {alumnus.isPlaceholder ? <p className="mt-2 text-xs font-bold uppercase tracking-[0.15em] text-voyage-deep">Placeholder</p> : null}
      </div>
    </article>
  );
}

function StoriesSection() {
  const storyItems = testimonials.map((item, index) => ({ ...item, index }));

  return (
    <section className="overflow-hidden bg-voyage-deep py-20 text-white md:py-28">
      <div className="mx-auto w-full max-w-[1180px] px-4 md:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_0.5fr] lg:items-end lg:gap-16">
          <h2 className="max-w-[10ch] text-balance font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] md:text-7xl">
            Cerita dari kapal yang sama.
          </h2>
          <p className="max-w-[35ch] text-base leading-7 text-voyage-sea-glass md:text-lg md:leading-8">
            Pengalaman Voyager yang menemukan arah, ritme, dan teman seperjalanan.
          </p>
        </div>
      </div>

      <div className="mt-14 overflow-x-auto px-4 pb-4 [scrollbar-width:none] md:px-8 lg:px-10 [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto flex w-max gap-4 lg:mx-auto lg:min-w-[1180px] lg:max-w-[1180px]">
          {storyItems.map((item) => (
            <article className="flex w-[310px] shrink-0 flex-col justify-between rounded-4xl bg-white p-6 text-voyage-deep md:w-[360px] md:p-7" key={`${item.name}-${item.index}`}>
              <div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-voyage-sea-glass-wash">
                      <Image alt={item.avatarAlt} className="object-cover" fill sizes="48px" src={item.avatarSrc} />
                    </div>
                    <div>
                      <h3 className="text-xl font-extrabold tracking-[-0.03em]">{item.name}</h3>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-voyage-deep">{item.outcome}</p>
                    </div>
                  </div>
                  <MessageCircle aria-hidden="true" className="size-5 text-voyage-deep/25" />
                </div>
                <p className="mt-7 text-base leading-7 text-voyage-deep">&ldquo;{item.quote}&rdquo;</p>
              </div>
              <p className="mt-8 border-t border-voyage-deep/10 pt-4 text-sm font-semibold text-voyage-deep">{item.meta}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function VeraAiSection() {
  return (
    <section className="bg-voyage-sea-glass-wash px-4 py-20 md:px-8 md:py-28 lg:px-10">
      <div className="mx-auto grid w-full max-w-[1180px] gap-12 lg:grid-cols-[1fr_0.72fr] lg:items-center lg:gap-20">
        <div>
          <h2 className="max-w-[11ch] text-balance font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] text-voyage-deep md:text-7xl">
            Vera AI sedang menyiapkan kompas personalmu.
          </h2>
          <p className="mt-7 max-w-[50ch] text-base leading-7 text-voyage-ink md:text-lg md:leading-8">
            Vecalss sedang menyiapkan Vera AI untuk membantu membaca pola
            belajar dan memberi rekomendasi langkah yang lebih tepat untuk setiap Voyager.
          </p>
          <div className="mt-10 grid gap-6 border-t border-voyage-deep/12 pt-6 sm:grid-cols-2">
            <div>
              <p className="text-base font-extrabold text-voyage-deep">Peta yang personal</p>
              <p className="mt-2 text-sm leading-6 text-voyage-ink">Rekomendasi belajar mengikuti ritme dan kebutuhanmu.</p>
            </div>
            <div>
              <p className="text-base font-extrabold text-voyage-deep">Arah yang lebih jelas</p>
              <p className="mt-2 text-sm leading-6 text-voyage-ink">Setiap langkah dibuat lebih fokus dari awal sampai hari ujian.</p>
            </div>
          </div>
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[380px]">
          <div aria-hidden="true" className="absolute inset-7 rounded-full border border-voyage-deep/15" />
          <div aria-hidden="true" className="absolute inset-16 rounded-full bg-voyage-warm-sun/65" />
          <Image
            alt="Teropong sebagai simbol kompas cerdas Vera AI"
            className="animate-float-slow relative size-full object-contain drop-shadow-[0_34px_70px_color-mix(in_oklab,var(--voyage-deep)_18%,transparent)]"
            height={480}
            sizes="380px"
            src="/brand/voyage-assets/teropong.png"
            width={480}
          />
        </div>
      </div>
    </section>
  );
}

function QuestionsSection() {
  return (
    <section className="bg-white px-4 py-20 md:px-8 md:py-28 lg:px-10">
      <div className="mx-auto grid w-full max-w-[1180px] gap-12 lg:grid-cols-[0.56fr_1fr] lg:items-start lg:gap-20">
        <div>
          <h2 className="max-w-[9ch] text-balance font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] text-voyage-deep md:text-7xl">
            Sebelum kapal berangkat.
          </h2>
          <p className="mt-6 max-w-[30ch] text-base leading-7 text-voyage-ink md:text-lg md:leading-8">
            Jawaban singkat untuk pertanyaan yang paling sering muncul.
          </p>
          <div className="relative mt-10 aspect-square w-full max-w-[320px]">
            <div aria-hidden="true" className="absolute inset-8 rounded-full bg-voyage-sea-glass-wash" />
            <Image
              alt="Maskot Vecalss menemani bagian pertanyaan"
              className="relative size-full object-contain drop-shadow-[0_30px_70px_color-mix(in_oklab,var(--voyage-deep)_14%,transparent)]"
              height={360}
              sizes="320px"
              src="/brand/mascot-vecalss.png"
              width={360}
            />
          </div>
        </div>
        <FAQ className="gap-3" items={faqItems} />
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="bg-voyage-canvas px-4 py-20 md:px-8 md:py-28 lg:px-10">
      <div className="relative mx-auto grid w-full max-w-[1180px] overflow-hidden rounded-5xl bg-voyage-forest p-8 text-white md:p-12 lg:grid-cols-[1fr_300px] lg:items-center lg:p-16">
        <div aria-hidden="true" className="absolute -right-28 -top-32 size-[30rem] rounded-full border border-white/10" />
        <div className="relative z-10">
          <h2 className="max-w-[9ch] text-balance font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] md:text-7xl">
            Siap memulai misimu?
          </h2>
          <p className="mt-6 max-w-[38ch] text-base leading-7 text-voyage-sea-glass md:text-lg md:leading-8">
            Satu langkah kecil hari ini bisa membuat perjalananmu terasa lebih jelas.
          </p>
          <ActionButtonLink className="mt-9" href="/login" variant="marketingOnDark">
            Ikut Misi Belajar
            <ArrowRight className="ml-1 size-4" />
          </ActionButtonLink>
        </div>
        <div className="relative mx-auto mt-8 aspect-square w-full max-w-[240px] lg:mt-0 lg:max-w-none">
          <Image alt="Maskot Vecalss mengajak memulai misi belajar" className="size-full object-contain drop-shadow-[0_32px_48px_rgba(0,0,0,0.28)]" fill sizes="300px" src="/brand/mascot-vecalss.png" />
        </div>
      </div>
    </section>
  );
}

function LandingPageModule() {
  return (
    <main className="overflow-x-clip bg-voyage-canvas text-voyage-deep">
      <Hero />
      <CampusRibbon />
      <LearningLoopSection />
      <AboutSection />
      <ProgramsSection />
      <PrinciplesSection />
      <MentorsSection />
      <AlumniSection />
      <StoriesSection />
      <VeraAiSection />
      <QuestionsSection />
      <FinalCTA />
      <HomeFooter />
    </main>
  );
}

export default LandingPageModule;

import Image from "next/image";
import { ArrowRight } from "lucide-react";

import { featuredTopAlumni, type TopAlumni } from "@/modules/alumni/data";
import { ContactForm } from "./components/contact-form";
import { CountUpStats } from "./components/count-up-stats";
import { FAQ } from "./components/FAQ";
import { MarketingHeader } from "./components/marketing-header";
import { ActionButtonLink } from "./components/home-primitives";
import { HomeFooter } from "./components/home-footer";
import { MentorCards } from "./components/mentor-cards";
import {
  campusCrewMarks,
  crewMembers,
  faqItems,
  journeyStats,
  pathways,
  testimonials,
  voyagePrinciples,
} from "./data";

const principleAssets = [
  "/brand/voyage-assets/jangkar.png",
  "/brand/voyage-assets/teropong.png",
  "/brand/voyage-assets/kemudi-kapal.png",
];

const programAssets = [
  "/brand/voyage-assets/perahu.png",
  "/brand/voyage-assets/kapal-bajak-laut-vecalss.png",
  "/brand/voyage-assets/teropong.png",
  "/brand/voyage-assets/jangkar.png",
];

function SectionIntro({
  eyebrow,
  title,
  body,
  center = false,
  light = false,
}: {
  body?: string;
  center?: boolean;
  eyebrow?: string;
  light?: boolean;
  title: string;
}) {
  return (
    <div className={`${center ? "mx-auto text-center" : ""} max-w-[760px]`}>
      {eyebrow ? (
        <p
          className={`kicker-label ${light ? "text-white/70" : "text-[#014C38]/70"}`}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={`mt-3 text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.04em] md:text-6xl ${
          light ? "text-white" : "text-[#014C38]"
        }`}
      >
        {title}
      </h2>
      {body ? (
        <p
          className={`mt-5 max-w-[54ch] text-base leading-7 md:text-lg ${
            center ? "mx-auto" : ""
          } ${light ? "text-white/78" : "text-[#014C38]/70"}`}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

function Hero() {
  return (
    <section className="bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 pb-14 pt-3 md:px-8 lg:px-10">
        <MarketingHeader currentPath="/" layout="landing" />

        <div className="grid flex-1 gap-8 py-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.78fr)] lg:items-center lg:py-16">
          <div className="max-w-[720px]">
            <h1 className="text-balance text-6xl font-semibold leading-[0.95] tracking-[-0.055em] text-[#014C38] sm:text-7xl md:text-8xl lg:text-8xl">
              Misi Belajar Konsisten Dari Dasar Sampai Mahir
            </h1>
            <p className="mt-7 max-w-[600px] text-lg leading-8 text-[#014C38]/70 md:text-xl md:leading-8">
              Peta belajar yang jelas, ritme yang konsisten, dan Kapten yang
              menjaga perjalananmu tetap menuju PTN.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <ActionButtonLink
                className="rounded-full !bg-[#014C38] px-7 py-4 text-base font-semibold !text-white hover:!bg-[#014C38]/90"
                href="/login"
                variant="brand"
              >
                Mulai Belajar
              </ActionButtonLink>
              <ActionButtonLink
                className="rounded-full border-[#014C38]/20 bg-white px-7 py-4 text-base font-semibold text-[#014C38] hover:bg-[#014C38]/5"
                href="/#program"
                variant="brandOutline"
              >
                Lihat Program
              </ActionButtonLink>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[540px] lg:max-w-[620px]">
            <div className="absolute inset-x-8 bottom-4 h-24 rounded-full bg-[#014C38]/12 blur-3xl" />
            <div className="relative aspect-square">
              <Image
                alt="Maskot Vecalss sebagai kapten perjalanan belajar"
                fill
                priority
                className="object-contain drop-shadow-[0_34px_72px_rgba(1,76,56,0.16)]"
                sizes="(min-width: 1024px) 620px, 88vw"
                src="/brand/mascot-vecalss.png"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LogoMarquee() {
  const logos = [...campusCrewMarks, ...campusCrewMarks, ...campusCrewMarks];

  return (
    <section className="bg-white py-16 md:py-24">
      <div className="mx-auto mb-12 w-full max-w-[1440px] px-4 md:px-8 lg:px-10">
        <p className="kicker-label text-[#014C38]/62">
          University Destinations
        </p>
        <h2 className="mt-3 max-w-[780px] text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-[#014C38] md:text-6xl">
          Tempat Para Voyager Berlabuh
        </h2>
        <p className="mt-5 max-w-[620px] text-base leading-7 text-[#014C38]/66 md:text-lg md:leading-8">
          Ribuan Voyager telah menuntaskan perjalanan mereka dan berlabuh di
          kampus impian di seluruh Indonesia.
        </p>
      </div>

      <div className="marquee-mask marquee-mask-white py-3 md:py-5">
        <div className="marquee-track hover:[animation-play-state:paused]">
          {logos.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="relative mx-10 h-14 w-28 shrink-0 opacity-58 transition duration-300 hover:opacity-100 md:mx-14 md:h-16 md:w-36"
            >
              <Image
                alt={item.markAlt}
                fill
                className="object-contain"
                sizes="144px"
                src={item.markSrc}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section
      id="about"
      className="bg-white px-4 py-20 md:px-8 md:py-28 lg:px-10"
    >
      <div className="scroll-reveal mx-auto grid w-full max-w-[1180px] gap-14 lg:grid-cols-[0.86fr_1fr] lg:items-center">
        <div className="relative min-h-[300px] md:min-h-[500px]">
          <Image
            alt="Variasi maskot Vecalss"
            fill
            className="object-contain object-center drop-shadow-[0_34px_70px_rgba(1,76,56,0.14)] lg:object-left"
            sizes="(min-width: 2048px) 1045px, 120vw"
            src="/brand/voyage-assets/mascot-about-variation.png"
          />
        </div>

        <div>
          <SectionIntro
            eyebrow="About Us"
            title="Dari Perjalanan Kecil ke 15.000+ Voyager"
            body="Vecalss bermula dari ruang belajar kecil untuk membantu siswa menata ulang persiapan menuju PTN. Dari sana, perjalanan ini tumbuh menjadi ekosistem belajar yang memadukan kelas, latihan, mentoring, dan komunitas agar setiap Voyager punya arah yang lebih jelas, ritme yang lebih konsisten, dan teman seperjalanan yang memahami prosesnya."
          />
        </div>
      </div>
    </section>
  );
}

function PrinciplesSection() {
  return (
    <section className="bg-[#014C38] px-4 py-20 text-white md:px-8 md:py-28 lg:px-10">
      <div className="scroll-reveal mx-auto w-full max-w-[1180px]">
        <SectionIntro
          center
          light
          title="Tiga Prinsip yang Menjaga Setiap Voyager Tetap di Jalur"
        />

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {voyagePrinciples.map((principle, index) => (
            <article
              key={principle.title}
              className="group min-h-[320px] rounded-4xl border border-white/14 bg-white/[0.06] p-6 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.09]"
            >
              <div className="relative mx-auto h-36 w-36 md:h-44 md:w-44">
                <Image
                  alt=""
                  fill
                  className="object-contain transition duration-300 group-hover:scale-105"
                  sizes="176px"
                  src={principleAssets[index]}
                />
              </div>
              <h3 className="mt-7 text-center text-3xl font-semibold tracking-[-0.03em]">
                {principle.title}
              </h3>
              <p className="mx-auto mt-3 max-w-[25ch] text-center text-sm leading-6 text-white/72">
                {principle.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProgramsSection() {
  return (
    <section
      id="program"
      className="bg-white px-4 py-20 md:px-8 md:py-28 lg:px-10"
    >
      <div className="scroll-reveal mx-auto w-full max-w-[1180px]">
        <SectionIntro
          center
          eyebrow="Program"
          title="Pilih Rute Belajarmu"
          body="Empat misi sederhana untuk tahap perjalanan yang berbeda."
        />

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {pathways.map((pathway, index) => (
            <article
              key={pathway.id}
              className="group relative min-h-[300px] overflow-hidden rounded-4xl border border-[#014C38]/10 bg-white p-8 transition duration-300 hover:-translate-y-1 hover:border-[#014C38]/18 hover:shadow-[0_34px_90px_-74px_rgba(1,76,56,0.5)] md:p-10"
            >
              <div className="absolute -bottom-12 -right-10 h-48 w-48 opacity-[0.11] transition duration-300 group-hover:scale-105 md:h-64 md:w-64">
                <Image
                  alt=""
                  fill
                  className="object-contain"
                  sizes="260px"
                  src={programAssets[index]}
                />
              </div>
              <span className="relative text-sm font-semibold text-[#014C38]/55">
                Rute {pathway.kicker}
              </span>
              <h3 className="relative mt-8 max-w-[13ch] text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-[#014C38] md:text-6xl">
                {pathway.title}
              </h3>
              <p className="relative mt-5 max-w-[34ch] text-base leading-7 text-[#014C38]/70">
                {pathway.summary}
              </p>
              <div className="relative mt-8 h-px w-16 bg-[#014C38]/16" />
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
      <div className="scroll-reveal mx-auto w-full max-w-[1180px]">
        <SectionIntro
          center
          eyebrow="Kapten Kelas"
          title="Para Kapten di Balik Setiap Kelas"
          body="Tutor dari UI, ITB, UGM, dan PTN unggulan lainnya."
        />

        <MentorCards members={crewMembers} />
      </div>
    </section>
  );
}

function ResultsSection() {
  const marqueeItems = [...testimonials, ...testimonials];

  return (
    <section className="bg-[#014C38] py-20 text-white md:py-28">
      <div className="scroll-reveal mx-auto w-full max-w-[1180px] px-4 md:px-8 lg:px-10">
        <SectionIntro
          center
          light
          eyebrow="Social Proof"
          title="Para Voyager yang Telah Berlabuh"
          body="Cerita singkat dari Voyager yang menemukan ritme, arah, dan keberanian untuk terus bergerak menuju kampus impian."
        />
      </div>

      <div className="marquee-mask marquee-mask-dark mt-12 overflow-hidden">
        <div className="marquee-track hover:[animation-play-state:paused]">
          {marqueeItems.map((item, index) => (
            <article
              key={`${item.name}-${index}`}
              className="mx-3 flex w-[320px] shrink-0 flex-col rounded-4xl border border-white/12 bg-white p-5 text-[#014C38] shadow-[0_26px_80px_-64px_rgba(0,0,0,0.44)] md:mx-4 md:w-[390px] md:p-6"
            >
              <div className="flex items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-[#014C38]/[0.04] md:size-16">
                    <Image
                      alt={item.avatarAlt}
                      fill
                      className="object-cover"
                      sizes="64px"
                      src={item.avatarSrc}
                    />
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold tracking-[-0.03em]">
                      {item.name}
                    </h3>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#014C38]/48">
                      {item.meta}
                    </p>
                  </div>
                </div>
                {item.universityMarkSrc && item.universityMarkAlt ? (
                  <div className="relative size-11 shrink-0 opacity-85 md:size-12">
                    <Image
                      alt={item.universityMarkAlt}
                      fill
                      className="object-contain"
                      sizes="48px"
                      src={item.universityMarkSrc}
                    />
                  </div>
                ) : null}
              </div>
              <p className="mt-7 text-base leading-7 text-[#014C38]/72 md:text-lg md:leading-8">
                &ldquo;{item.quote}&rdquo;
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TopAlumniSection() {
  return (
    <section className="bg-[#F7FBF4] px-4 py-20 md:px-8 md:py-28 lg:px-10">
      <div className="scroll-reveal mx-auto w-full max-w-[1180px]">
        <div className="grid gap-8 lg:grid-cols-[0.4fr_0.6fr] lg:items-end">
          <SectionIntro
            title="Top Alumni 2026"
            body="Tempat para voyager berlabuh!"
          />

          <div className="flex lg:justify-end">
            <ActionButtonLink
              className="rounded-full !bg-[#014C38] px-7 py-4 text-base font-semibold !text-white hover:!bg-[#014C38]/90"
              href="https://docs.google.com/spreadsheets/d/1bbnfOYTPHhN3obMEyrNU3yEoHzvSoJ5fCjtNWCiPdHM/edit?gid=0#gid=0"
              target="_blank"
              variant="brand"
            >
              Lihat Top 90 dan Alumni Lainnya...
              <ArrowRight className="ml-2 size-4" />
            </ActionButtonLink>
          </div>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
    <article className="group overflow-hidden rounded-2xl border border-[#014C38]/10 bg-white shadow-[0_18px_44px_-42px_rgba(1,76,56,0.24)] transition duration-300 hover:-translate-y-1 hover:border-[#014C38]/18">
      <div className="relative aspect-[4/5] bg-[#014C38]/[0.04]">
        <Image
          alt={`${alumnus.name} profile photo`}
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          src={alumnus.photoSrc}
        />
        {alumnus.logoSrc && alumnus.logoAlt ? (
          <div className="absolute right-3 top-3 size-9 md:size-10">
            <Image
              alt={alumnus.logoAlt}
              fill
              className="object-contain"
              sizes="40px"
              src={alumnus.logoSrc}
            />
          </div>
        ) : null}
      </div>
      <div className="p-3.5 md:p-4">
        <h3 className="text-base font-semibold leading-tight tracking-[-0.03em] text-[#014C38] md:text-lg">
          {alumnus.name}
        </h3>
        <p className="mt-1.5 text-xs leading-4 text-[#014C38]/68 md:text-sm md:leading-5">
          {alumnus.university}
        </p>
        {alumnus.isPlaceholder ? (
          <p className="mt-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#014C38]/42">
            Placeholder
          </p>
        ) : null}
      </div>
    </article>
  );
}

function QuestionsSection() {
  return (
    <section className="bg-white px-4 py-20 md:px-8 md:py-28 lg:px-10">
      <div className="scroll-reveal mx-auto grid w-full max-w-[1180px] gap-10 lg:grid-cols-[0.58fr_1fr] lg:items-start">
        <div className="flex flex-col gap-8">
          <SectionIntro
            eyebrow="FAQ"
            title="Pertanyaan dari Deck Kapal"
            body="Jawaban singkat sebelum kamu mulai berlayar."
          />
          <div className="relative mx-auto aspect-square w-full max-w-[260px] lg:mx-0 lg:max-w-[320px]">
            <div className="absolute inset-6 rounded-full bg-[#014C38]/10 blur-3xl" />
            <Image
              alt="Maskot Vecalss menemani bagian FAQ"
              fill
              className="relative object-contain drop-shadow-[0_30px_70px_rgba(1,76,56,0.14)]"
              sizes="(min-width: 1024px) 320px, 260px"
              src="/brand/mascot-vecalss.png"
            />
          </div>
        </div>
        <FAQ className="gap-3" items={faqItems} />
      </div>
    </section>
  );
}

function VeraAiSection() {
  return (
    <section className="bg-[#F7FBF4] px-4 py-20 md:px-8 md:py-28 lg:px-10">
      <div className="scroll-reveal mx-auto grid w-full max-w-[1180px] gap-12 lg:grid-cols-[1fr_0.72fr] lg:items-center">
        <div>
          <SectionIntro
            eyebrow="Kompas Cerdas Masa Depan"
            title="Vera AI Akan Membantu Membaca Arah Belajarmu"
            body="Vecalss sedang menyiapkan Vera AI sebagai kompas personal untuk menganalisis pola belajar, membaca area yang perlu diperkuat, dan memberi rekomendasi langkah yang lebih tepat untuk setiap Voyager."
          />
          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            <div className="border-l border-[#014C38]/18 py-1 pl-5">
              <p className="text-sm font-semibold text-[#014C38]">
                Peta yang personal
              </p>
              <p className="mt-2 text-sm leading-6 text-[#014C38]/64">
                Rekomendasi belajar disesuaikan dengan ritme dan kebutuhanmu.
              </p>
            </div>
            <div className="border-l border-[#014C38]/18 py-1 pl-5">
              <p className="text-sm font-semibold text-[#014C38]">
                Arah yang lebih jelas
              </p>
              <p className="mt-2 text-sm leading-6 text-[#014C38]/64">
                Setiap langkah dibuat lebih fokus dari awal sampai hari ujian.
              </p>
            </div>
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[360px]">
          <div className="absolute inset-8 rounded-full bg-[#014C38]/10 blur-3xl" />
          <Image
            alt="Teropong sebagai simbol kompas cerdas Vera AI"
            fill
            className="relative object-contain drop-shadow-[0_34px_70px_rgba(1,76,56,0.14)]"
            sizes="360px"
            src="/brand/voyage-assets/teropong.png"
          />
        </div>
      </div>
    </section>
  );
}

function BriefingSection() {
  return (
    <section
      id="briefing"
      className="bg-white px-4 py-20 md:px-8 md:py-28 lg:px-10"
    >
      <div className="scroll-reveal mx-auto grid w-full max-w-[1180px] gap-10 lg:grid-cols-[0.42fr_1fr] lg:items-start">
        <div className="lg:pt-8">
          <SectionIntro
            eyebrow="Kontak"
            title="Ceritakan titik berangkatmu."
            body="Tim Vecalss akan membantu membaca kebutuhanmu, memilih rute belajar yang paling masuk akal, dan menjelaskan langkah awal tanpa membuat prosesnya terasa rumit."
          />
          <p className="mt-8 max-w-[34ch] text-sm leading-7 text-[#014C38]/58">
            Balasan akan diarahkan ke kontak yang kamu tuliskan di form.
          </p>
        </div>
        <ContactForm />
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="bg-white px-4 py-20 md:px-8 md:py-28 lg:px-10">
      <div className="scroll-reveal mx-auto grid w-full max-w-[1180px] gap-8 rounded-5xl bg-[#014C38] p-8 text-white md:p-12 lg:grid-cols-[1fr_240px] lg:items-center">
        <div>
          <h2 className="text-5xl font-semibold leading-tight tracking-[-0.05em] md:text-7xl">
            Siap Memulai Misimu?
          </h2>
          <p className="mt-5 max-w-[520px] text-lg leading-8 text-white/76">
            Bergabung ke misi belajar konsisten bersama Vecalss.
          </p>
          <ActionButtonLink
            className="mt-8 rounded-full !bg-white px-7 py-4 text-base font-semibold !text-[#014C38] hover:!bg-white/90"
            href="/login"
            variant="brandOutline"
          >
            Ikut Misi Belajar
            <ArrowRight className="ml-2 size-4" />
          </ActionButtonLink>
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[210px] lg:max-w-none">
          <Image
            alt="Maskot Vecalss mengajak memulai misi belajar"
            fill
            className="object-contain"
            sizes="240px"
            src="/brand/mascot-vecalss.png"
          />
        </div>
      </div>
    </section>
  );
}

function HomePageModule() {
  return (
    <main className="overflow-x-clip bg-white text-[#014C38]">
      <Hero />
      {/* <CountUpStats items={journeyStats} /> */}
      <LogoMarquee />
      <AboutSection />
      <PrinciplesSection />
      <ProgramsSection />
      <MentorsSection />
      <TopAlumniSection />
      <ResultsSection />
      <QuestionsSection />
      <VeraAiSection />
      {/* <BriefingSection /> */}
      <FinalCTA />
      <HomeFooter />
    </main>
  );
}

export default HomePageModule;

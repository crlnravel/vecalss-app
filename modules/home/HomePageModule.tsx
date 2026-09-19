import Image from "next/image";
import Link from "next/link";

import { ArrowRight, InstagramLogo, LinkedinLogo, XLogo } from "@/lib/icons";
import { featuredTopAlumni } from "@/modules/alumni/data";

import { FAQ } from "./components/FAQ";
import { ActionButtonLink } from "./components/home-primitives";
import { LandingMotionController } from "./components/landing-motion-controller";
import { MarketingHeader } from "./components/marketing-header";
import { TestimonialStage } from "./components/testimonial-stage";
import {
  campusCrewMarks,
  crewMembers,
  faqItems,
  pathways,
  testimonials,
} from "./data";

const footerLinks = [
  {
    title: "Jelajahi",
    items: [
      { href: "/#about", label: "Tentang Vecalss" },
      { href: "/#program", label: "Program" },
      { href: "/#alumni", label: "Alumni" },
    ],
  },
  {
    title: "Bantuan",
    items: [
      { href: "/faq", label: "FAQ" },
      { href: "/about", label: "Tentang kami" },
      { href: "/login", label: "Masuk" },
    ],
  },
];

const footerSocialLinks = [
  {
    href: "https://www.instagram.com/vecalss.academy/",
    label: "Instagram",
    icon: InstagramLogo,
  },
  {
    href: "https://www.linkedin.com/company/vecalss",
    label: "LinkedIn",
    icon: LinkedinLogo,
  },
  {
    href: "https://x.com/vecalss",
    label: "X",
    icon: XLogo,
  },
];

function PanelHeading({
  body,
  children,
  id,
}: {
  body?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="motion-heading mx-auto max-w-[780px] text-center" id={id}>
      <h2 className="text-balance text-[clamp(2.6rem,6vw,5.75rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-[var(--voyage-deep)]">
        {children}
      </h2>
      {body ? (
        <p className="mx-auto mt-5 max-w-[62ch] text-pretty text-sm leading-6 text-[var(--voyage-deep)]/78 md:text-base md:leading-7">
          {body}
        </p>
      ) : null}
    </div>
  );
}

function Hero() {
  return (
    <section className="reference-panel" data-motion-scene="hero" id="top">
      <div className="motion-scene-stage mx-auto grid min-h-svh w-full max-w-[1360px] items-center gap-8 px-5 pb-16 pt-28 md:px-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-10 lg:pb-20">
        <div className="motion-hero-copy relative z-10 text-left">
          <h1 className="max-w-[10ch] text-balance text-5xl font-semibold tracking-[-0.04em] text-[var(--voyage-deep)] sm:text-[clamp(3.5rem,6vw,5.75rem)] sm:leading-[0.9]">
            Lancarkan perjalananmu menuju{" "}
            <span
              className="hero-accent-word text-[var(--voyage-warm-sun)]"
              style={{
                color: "var(--voyage-warm-sun)",
                textDecoration: "none",
                textDecorationColor: "var(--voyage-warm-sun)",
                textDecorationLine: "underline",
                textDecorationStyle: "wavy",
                textDecorationThickness: "0.08em",
                textUnderlineOffset: "0.12em",
              }}
            >
              PTN
            </span>
          </h1>
          <p className="mt-6 max-w-[500px] text-pretty text-sm leading-6 text-[var(--voyage-deep)]/78 md:text-base md:leading-7">
            Ayo mulai perjalananmu dari sini!
          </p>
          <ActionButtonLink
            className="landing-elevated-button mt-7 h-12 min-w-36 px-5 text-sm"
            href="/login"
            variant="marketing"
          >
            Mulai belajar
            <ArrowRight className="ml-2 size-4" />
          </ActionButtonLink>
        </div>

        <div className="home-hero-media relative aspect-[4/3] w-full overflow-hidden lg:translate-x-40">
          <video
            aria-label="Maskot Vecalss mengamati perjalanan belajar dengan kaca pembesar"
            autoPlay
            className="size-full object-cover"
            loop
            muted
            playsInline
            poster="/brand/mascot-vecalss.png"
            preload="auto"
            src="/mascott.webm"
          />
        </div>
      </div>
    </section>
  );
}

function MentorPortraitWheel() {
  const orbitGroups = [
    {
      mentors: crewMembers.slice(0, 4),
      className: "university-orbit-left",
      side: "kiri",
      startAngle: -45,
    },
    {
      mentors: crewMembers.slice(4, 8),
      className: "university-orbit-right",
      side: "kanan",
      startAngle: 45,
    },
  ];

  return (
    <div
      aria-label="Foto para Kapten berputar di sisi kiri dan kanan"
      className="motion-university-wheel absolute inset-0"
      role="group"
    >
      {orbitGroups.map((group) => (
        <div
          aria-label={`Orbit Kapten sisi ${group.side}`}
          className={`university-orbit-shell ${group.className}`}
          key={group.side}
        >
          <div aria-hidden="true" className="university-orbit-ring" />
          <div className="university-orbit-track">
            {group.mentors.map((mentor, index) => {
              const angle = group.startAngle + index * 90;

              return (
                <div
                  className="university-orbit-node"
                  key={mentor.id}
                  style={
                    {
                      "--orbit-angle": `${angle}deg`,
                      "--orbit-counter-angle": `${-angle}deg`,
                      "--orbit-portrait-scale": index % 2 === 0 ? "1" : "0.88",
                    } as React.CSSProperties
                  }
                >
                  <figure className="university-orbit-logo">
                    <div className="home-mentor-card-photo relative min-h-0 flex-1 overflow-hidden rounded-[18px]">
                      <Image
                        alt={mentor.photoAlt}
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 12rem, 7rem"
                        src={mentor.photoSrc}
                      />
                    </div>
                    <figcaption className="flex min-h-12 flex-col items-center justify-center px-2 text-center leading-tight">
                      <span className="text-sm font-semibold text-[var(--voyage-deep)] md:text-base">
                        {mentor.name}
                      </span>
                      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--voyage-deep)]/62 md:text-xs">
                        {mentor.campus}
                      </span>
                    </figcaption>
                  </figure>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MentorField() {
  return (
    <div className="relative mx-auto h-full min-h-svh w-full max-w-[1440px]">
      <MentorPortraitWheel />
      <div className="motion-orbit-copy relative z-10 flex h-full min-h-svh flex-col items-center justify-center px-16 text-center md:px-8">
        <div className="landing-recessed-emblem relative mb-7 flex size-16 items-center justify-center rounded-[22px] bg-white md:size-20 md:rounded-[26px]">
          <div className="relative size-10 md:size-24">
            <Image
              alt=""
              fill
              className="object-contain"
              sizes="48px"
              src="/brand/voyage-assets/kemudi-kapal.png"
            />
          </div>
        </div>
        <h2 className="mx-auto max-w-[10ch] text-balance text-[clamp(3rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-[var(--voyage-deep)]">
          Kapten di setiap langkah.
        </h2>
        <p className="mx-auto mt-5 max-w-[520px] text-pretty text-sm leading-6 text-[var(--voyage-deep)]/78 md:text-base md:leading-7">
          Tutor dari kampus unggulan membantu kamu belajar konsisten.
        </p>
        <Link
          className="landing-elevated-button mt-7 inline-flex min-h-10 items-center rounded-full bg-[var(--voyage-deep)] px-5 text-xs font-semibold text-white transition-colors hover:bg-[var(--voyage-deep-hover)]"
          href="/about"
        >
          Kenali para Kapten
        </Link>
      </div>
    </div>
  );
}

function MentorsSection() {
  return (
    <section
      className="reference-panel relative h-[240svh] md:h-[270svh]"
      data-motion-scene="mentors"
      id="about"
    >
      <div className="sticky top-0 h-svh overflow-hidden px-5 md:px-8">
        <div className="motion-scene-stage h-full">
          <MentorField />
        </div>
      </div>
    </section>
  );
}

function ProgramCard({ index }: { index: number }) {
  const pathway = pathways[index];
  const isWideCard = index > 2;
  const imageClass = isWideCard
    ? "right-1 top-1/2 size-44 -translate-y-1/2 md:right-8 md:size-56"
    : "right-2 top-1 size-40 md:right-3 md:top-2 md:size-48";

  return (
    <article
      className={`program-reference-card motion-program-card relative min-h-[250px] overflow-hidden p-6 md:min-h-[320px] ${isWideCard ? "md:col-span-3" : "md:col-span-2"}`}
      style={
        {
          "--motion-delay": `${index * 85}ms`,
        } as React.CSSProperties
      }
    >
      <div className={`program-card-art absolute ${imageClass}`}>
        <Image
          alt=""
          fill
          className="object-contain"
          sizes="208px"
          src={pathway.art}
        />
      </div>
      <div className="relative z-10 flex h-full max-w-[62%] flex-col justify-end md:max-w-[68%]">
        <h3 className="text-balance text-2xl font-semibold leading-[1.02] tracking-[-0.03em] text-[var(--voyage-deep)] md:text-3xl">
          {pathway.title}
        </h3>
        <p className="mt-3 text-sm leading-6 text-[var(--voyage-deep)]/78">
          {pathway.summary}
        </p>
      </div>
    </article>
  );
}

function ProgramsSection() {
  return (
    <section
      className="reference-panel px-5 pb-20 pt-28 md:px-8 md:pb-28 md:pt-32"
      data-motion-scene="programs"
      id="program"
    >
      <div className="motion-scene-stage">
        <PanelHeading body="Didesain untuk membantu para voyager melewati perjalanan menuju PTN">
          Program
        </PanelHeading>
        <div className="program-reference-grid mx-auto mt-10 grid w-full max-w-[1160px] gap-4 md:grid-cols-6 md:gap-5">
          {pathways.map((pathway, index) => (
            <ProgramCard index={index} key={pathway.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

function LearningLoopSection() {
  const campusDisplayNames: Record<string, string> = {
    IPB: "Institut Pertanian Bogor",
    ITB: "Institut Teknologi Bandung",
    ITS: "Institut Teknologi Sepuluh Nopember",
    UI: "Universitas Indonesia",
    UGM: "Universitas Gadjah Mada",
    Unair: "Universitas Airlangga",
    Unpad: "Universitas Padjadjaran",
    UPN: "UPN Veteran Jakarta",
  };
  const rotatingCampuses = [
    ...campusCrewMarks,
    {
      name: "IPB",
      markSrc: "/brand/campuses/ipb.png",
      markAlt: "Institut Pertanian Bogor mark",
    },
    {
      name: "ITS",
      markSrc: "/brand/campuses/its.svg",
      markAlt: "Institut Teknologi Sepuluh Nopember mark",
    },
  ].map((campus) => ({
    ...campus,
    displayName: campusDisplayNames[campus.name] ?? campus.name,
  }));
  const focusedCampuses = [
    rotatingCampuses[1],
    rotatingCampuses[0],
    ...rotatingCampuses.slice(2).reverse(),
  ];

  return (
    <section
      className="reference-panel px-4 py-20 md:px-8 md:py-28"
      data-motion-scene="learning"
      id="learning-loop"
    >
      <div className="motion-scene-stage mx-auto w-full max-w-[1440px]">
        <div className="home-campus-sunken-panel relative min-h-[550px] overflow-hidden px-5 pt-14 md:min-h-[720px] md:px-12 md:pt-16">
          <div className="motion-heading relative z-20 mx-auto text-center">
            <h2 className="mx-auto max-w-[15ch] text-balance text-[clamp(2.6rem,5vw,4.75rem)] font-semibold leading-[0.94] tracking-[-0.04em] text-[var(--voyage-deep)]">
              Kampus Tujuan
            </h2>
            <p className="mx-auto mt-5 max-w-[62ch] text-pretty text-sm leading-6 text-[var(--voyage-deep)]/78 md:text-base md:leading-7">
              Belajar terarah menuju kampus impian.
            </p>
          </div>

          <div
            aria-label={`Kampus tujuan: ${rotatingCampuses.map((campus) => campus.displayName).join(", ")}`}
            className="home-campus-carousel absolute inset-x-0 bottom-0 z-10 h-[350px] overflow-hidden md:h-[520px]"
            role="img"
          >
            <div aria-hidden="true" className="home-campus-orbit-track">
              <div className="home-campus-orbit-ring" />
              {rotatingCampuses.map((campus, index) => {
                const angle = 225 + index * (360 / rotatingCampuses.length);

                return (
                  <div
                    className="home-campus-orbit-node"
                    key={campus.name}
                    style={
                      {
                        "--campus-angle": `${angle}deg`,
                        "--campus-counter-angle": `${-angle}deg`,
                        "--campus-counter-end-angle": `${-angle - 360}deg`,
                      } as React.CSSProperties
                    }
                  >
                    <div className="home-campus-logo-card">
                      <Image
                        alt=""
                        fill
                        className="object-contain p-5 md:p-7"
                        sizes="(min-width: 768px) 184px, 112px"
                        src={campus.markSrc}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              aria-hidden="true"
              className="home-campus-focus-caption absolute inset-x-5 bottom-7 z-20 min-h-16 text-center md:bottom-10 md:min-h-20"
            >
              {focusedCampuses.map((campus, index) => (
                <div
                  className="home-campus-focus-caption-item absolute inset-x-0 top-0"
                  key={campus.name}
                  style={
                    {
                      "--caption-delay": `${index * 3.5}s`,
                    } as React.CSSProperties
                  }
                >
                  <p className="text-balance text-xl font-semibold tracking-[-0.03em] text-[var(--voyage-deep)] md:text-3xl">
                    {campus.displayName}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AlumniSection() {
  const alumni = featuredTopAlumni.slice(0, 6);
  const positions = [
    "left-[2%] top-[18%]",
    "left-[17%] top-[6%]",
    "bottom-[4%] left-[12%]",
    "right-[16%] top-[6%]",
    "right-[2%] top-[20%]",
    "bottom-[4%] right-[11%]",
  ];
  const entryVectors = [
    { x: -460, y: 56, rotate: -8 },
    { x: -380, y: -42, rotate: 7 },
    { x: -420, y: 70, rotate: -8 },
    { x: 380, y: -40, rotate: -7 },
    { x: 460, y: 58, rotate: 8 },
    { x: 420, y: 72, rotate: 7 },
  ];
  const portraitDelays = [0, 130, 260, 65, 195, 325];

  return (
    <section
      className="reference-panel relative overflow-hidden px-5 py-24 md:px-8 md:py-32"
      data-motion-scene="alumni"
      id="alumni"
    >
      <div className="motion-scene-stage relative isolate mx-auto min-h-[720px] w-full max-w-[1240px] md:min-h-[820px]">
        <div className="motion-orbit-copy absolute inset-x-0 top-[46%] z-10 -translate-y-1/2 text-center md:top-1/2">
          <div className="mx-auto mb-6 flex w-fit items-center gap-2">
            {campusCrewMarks.slice(0, 4).map((campus) => (
              <div className="relative size-9" key={campus.name}>
                <Image
                  alt={campus.markAlt}
                  fill
                  className="object-contain"
                  sizes="36px"
                  src={campus.markSrc}
                />
              </div>
            ))}
          </div>
          <h2 className="mx-auto max-w-[11ch] text-balance text-[clamp(3rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-[var(--voyage-deep)]">
            1.000+ Voyager telah berlabuh
          </h2>
          <p className="mx-auto mt-5 max-w-[520px] text-pretty text-sm leading-6 text-[var(--voyage-deep)]/78 md:text-base md:leading-7">
            Selanjutnya jadi giliranmu!
          </p>
          <Link
            className="landing-elevated-button mt-7 inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--voyage-deep)] px-5 text-xs font-semibold text-white transition-colors hover:bg-[var(--voyage-deep-hover)]"
            href="https://docs.google.com/spreadsheets/d/1bbnfOYTPHhN3obMEyrNU3yEoHzvSoJ5fCjtNWCiPdHM/edit?gid=0#gid=0"
            target="_blank"
          >
            Lihat alumni lainnya
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {alumni.map((person, index) => (
          <figure
            className={`motion-alumni-spread absolute ${positions[index]} hidden w-36 md:block lg:w-44`}
            data-alumni-card
            data-alumni-rotate={entryVectors[index].rotate}
            data-alumni-x={entryVectors[index].x}
            data-alumni-y={entryVectors[index].y}
            key={person.id}
            style={
              {
                "--card-float-delay": `${index * -0.9}s`,
                "--card-float-duration": `${5.2 + (index % 3) * 0.7}s`,
                "--card-float-rotate": `${index % 2 === 0 ? -1.8 : 1.8}deg`,
                "--card-float-x": `${index % 2 === 0 ? -9 : 9}px`,
                "--card-float-y": `${-14 - (index % 3) * 3}px`,
                "--motion-delay": `${portraitDelays[index]}ms`,
              } as React.CSSProperties
            }
          >
            <div className="home-alumni-card">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[12px]">
                <Image
                  alt={`${person.name} profile photo`}
                  fill
                  className="object-cover"
                  sizes="176px"
                  src={person.photoSrc}
                />
              </div>
              {person.logoSrc ? (
                <div className="home-alumni-campus-mark absolute right-3 top-3 size-10 rounded-[12px] bg-white p-1.5">
                  <Image
                    alt={person.logoAlt ?? ""}
                    fill
                    className="object-contain p-1.5"
                    sizes="40px"
                    src={person.logoSrc}
                  />
                </div>
              ) : null}
              <figcaption className="px-2 pb-1 pt-3 text-center text-xs font-semibold leading-5 text-[var(--voyage-deep)]">
                {person.name.split(" ")[0]} ·{" "}
                {person.university.split(" ").at(-1)}
              </figcaption>
            </div>
          </figure>
        ))}

        <div className="absolute inset-x-0 bottom-0 grid grid-cols-3 gap-2 md:hidden">
          {alumni.slice(0, 3).map((person, index) => (
            <div
              className="motion-alumni-spread"
              data-alumni-card
              data-alumni-rotate={index === 1 ? 0 : index === 0 ? -5 : 5}
              data-alumni-x={index === 0 ? -180 : index === 2 ? 180 : 0}
              data-alumni-y={index === 1 ? 72 : 48}
              key={person.id}
              style={
                {
                  "--motion-delay": `${index * 90}ms`,
                } as React.CSSProperties
              }
            >
              <figure
                className="home-alumni-card"
                style={
                  {
                    "--card-float-delay": `${index * -0.8}s`,
                    "--card-float-duration": `${5 + index * 0.6}s`,
                    "--card-float-rotate": `${index === 1 ? 1.4 : -1.4}deg`,
                    "--card-float-x": `${index === 1 ? 6 : -6}px`,
                    "--card-float-y": `${-10 - index * 2}px`,
                  } as React.CSSProperties
                }
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-[10px]">
                  <Image
                    alt={`${person.name} profile photo`}
                    fill
                    className="object-cover"
                    sizes="30vw"
                    src={person.photoSrc}
                  />
                </div>
                {person.logoSrc ? (
                  <div className="home-alumni-campus-mark absolute right-2 top-2 size-8 rounded-[10px] bg-white">
                    <Image
                      alt={person.logoAlt ?? ""}
                      fill
                      className="object-contain p-1.5"
                      sizes="32px"
                      src={person.logoSrc}
                    />
                  </div>
                ) : null}
                <figcaption className="px-1 pb-0.5 pt-2 text-center text-xs font-semibold leading-4 text-[var(--voyage-deep)]">
                  {person.name.split(" ")[0]} ·{" "}
                  {person.university.split(" ").at(-1)}
                </figcaption>
              </figure>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section
      className="reference-panel px-5 pb-18 pt-28 md:px-8 md:pt-32"
      data-motion-scene="testimonials"
      id="stories"
    >
      <div className="motion-scene-stage">
        <PanelHeading body="Cerita Voyager yang menemukan arah belajarnya.">
          Kata Mereka
        </PanelHeading>
        <TestimonialStage items={testimonials} />
      </div>
    </section>
  );
}

function QuestionsSection() {
  return (
    <section
      className="reference-panel px-5 pb-10 pt-28 md:px-8 md:pt-32"
      data-motion-scene="faq"
      id="faq"
    >
      <div className="motion-scene-stage mx-auto grid min-h-[700px] w-full max-w-[1100px] gap-10 lg:grid-cols-[0.72fr_1fr] lg:items-stretch">
        <div className="flex flex-col text-center lg:min-h-full">
          <PanelHeading body="Jawaban singkat sebelum mulai.">FAQ</PanelHeading>
          <div className="relative mx-auto mt-8 aspect-square w-44 md:w-52 lg:mt-auto lg:w-64">
            <Image
              alt="Maskot Vecalss menemani bagian pertanyaan"
              fill
              className="object-contain"
              sizes="256px"
              src="/brand/mascot-vecalss.png"
            />
          </div>
        </div>
        <FAQ
          className="motion-faq-list mx-auto mt-12 w-full max-w-[900px] lg:mt-0"
          items={faqItems}
          variant="minimal"
        />
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer
      className="relative border-t border-[var(--voyage-deep)]/12 px-6 pt-16 pb-4 md:px-12 md:pt-20 md:pb-6"
      data-motion-scene="footer"
    >
      <div className="motion-footer-content mx-auto grid w-full max-w-[1040px] gap-10 md:grid-cols-[1.35fr_0.7fr_0.7fr_0.8fr]">
        <div>
          <Link
            aria-label="Vecalss homepage"
            className="inline-flex items-center gap-3"
            href="/"
          >
            <Image
              alt=""
              className="h-11 w-auto"
              height={910}
              sizes="56px"
              src="/brand/logo-mark-cropped.png"
              width={1145}
            />
            <span
              className="text-2xl font-normal uppercase tracking-[0.08em] text-[var(--voyage-deep)]"
              style={{ fontFamily: "var(--font-sports-world)" }}
            >
              VECALSS
            </span>
          </Link>
          <p className="mt-6 max-w-[29ch] text-base font-semibold leading-7 text-[var(--voyage-deep)]">
            Ekosistem belajar yang menyatukan arah, latihan, dan pendampingan
            menuju PTN.
          </p>
          <ActionButtonLink
            className="landing-elevated-button mt-7 h-12 px-5 text-sm"
            href="/login"
            variant="marketing"
          >
            Mulai misimu
          </ActionButtonLink>
        </div>

        {footerLinks.map((group) => (
          <nav aria-label={group.title} key={group.title}>
            <h2 className="text-sm font-semibold text-[var(--voyage-deep)]">
              {group.title}
            </h2>
            <div className="mt-4 grid gap-3">
              {group.items.map((item) => (
                <Link
                  className="w-fit text-sm text-[var(--voyage-deep)]/78 underline-offset-4 hover:text-[var(--voyage-deep)] hover:underline"
                  href={item.href}
                  key={item.label}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        ))}

        <nav aria-label="Media sosial">
          <h2 className="text-sm font-semibold text-[var(--voyage-deep)]">
            Ikuti kami
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {footerSocialLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  aria-label={item.label}
                  className="landing-elevated-button landing-elevated-button-light flex size-11 items-center justify-center rounded-[12px] border border-[var(--voyage-deep)]/16 bg-white text-sm font-semibold text-[var(--voyage-deep)] transition-colors hover:border-[var(--voyage-deep)]/35"
                  href={item.href}
                  key={item.label}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5"
                    weight="regular"
                  />
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="mx-auto mt-6 w-full max-w-[1040px] pt-6 md:mt-8">
        <p className="text-xs text-[var(--voyage-deep)]/70">
          © 2026 Vecalss Learning Academy
        </p>
      </div>
    </footer>
  );
}

function HomePageModule() {
  return (
    <main
      className="reference-landing min-h-screen overflow-x-clip bg-[#eef2f0] text-[var(--voyage-deep)]"
      data-landing-motion-root
    >
      <LandingMotionController />
      <MarketingHeader currentPath="/" layout="landing" />
      <Hero />
      <MentorsSection />
      <ProgramsSection />
      <LearningLoopSection />
      <AlumniSection />
      <TestimonialsSection />
      <QuestionsSection />
      <LandingFooter />
    </main>
  );
}

export default HomePageModule;

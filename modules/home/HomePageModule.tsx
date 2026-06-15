import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Menu } from "lucide-react";
import { FAQ } from "./components/FAQ";

const navItems = [
  { label: "About us", href: "#about" },
  { label: "Programs", href: "#programs" },
  { label: "Features", href: "#features" },
  { label: "FAQ", href: "#faq" },
];

const footerItems = [
  { label: "About us", href: "#about" },
  { label: "Services", href: "#programs" },
  { label: "Use Cases", href: "#features" },
  { label: "Pricing", href: "#contact" },
  { label: "Blog", href: "#testimonials" },
];

const programCards = [
  {
    title: ["SNBT", "Intensive"],
    href: "#contact",
    art: "/landing-assets/program-stopwatch.svg",
    artAlt: "Stopwatch illustration",
    tone: "light",
    chipTone: "accent",
  },
  {
    title: ["Foundation", "Program"],
    href: "#contact",
    art: "/landing-assets/program-foundation.svg",
    artAlt: "Light bulb illustration",
    tone: "accent",
    chipTone: "white",
  },
  {
    title: ["Weekly", "Tryout"],
    href: "#contact",
    art: "/landing-assets/program-weekly.svg",
    artAlt: "Document illustration",
    tone: "dark",
    chipTone: "white",
  },
  {
    title: ["Smart Drill", "Program"],
    href: "#contact",
    art: "/landing-assets/program-drill.svg",
    artAlt: "Training illustration",
    tone: "light",
    chipTone: "accent",
  },
  {
    title: ["Vera AI", "Mentoring"],
    href: "#contact",
    art: "/landing-assets/program-mentoring.svg",
    artAlt: "AI mentoring illustration",
    tone: "accent",
    chipTone: "white",
  },
  {
    title: ["PTN", "Consultation"],
    href: "#contact",
    art: "/landing-assets/program-consultation.svg",
    artAlt: "Consultation illustration",
    tone: "dark",
    chipTone: "white",
  },
];

const testimonials = [
  {
    quote:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit.",
    name: "John Smith",
    meta: "Marketing Director at XYZ Corp",
  },
  {
    quote:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit.",
    name: "Andi Saputra",
    meta: "SMAN 68 Jakarta",
  },
  {
    quote:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit.",
    name: "Andi Savitri",
    meta: "SMAN 12 Pekalongan",
  },
];

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-[14px] bg-[#124c2b] px-[35px] py-[20px] text-center text-[18px] leading-7 font-normal text-white transition-colors duration-200 hover:bg-[#0e3b21] md:text-[20px]";

type SectionHeadingProps = {
  label: string;
  description: string;
  tone?: "accent" | "mint";
};

function BrandLogo({ compact = false }: { compact?: boolean }) {
  const iconSize = compact ? "h-[40px] w-[50px]" : "h-[55px] w-[68px]";
  const wordSize = compact ? "h-[30px] w-[168px]" : "h-[39px] w-[219px]";

  return (
    <div className="flex items-center">
      <div className={`${iconSize} relative shrink-0 overflow-hidden`}>
        <Image
          alt="Vecalss Learning Academy"
          fill
          className="absolute h-[281.41%] left-[-40.26%] max-w-none top-[-53.21%] w-[181.03%]"
          sizes={compact ? "50px" : "68px"}
          src="/landing-assets/logo-sprite.png"
        />
      </div>
      <div className={`${wordSize} relative shrink-0 overflow-hidden`}>
        <Image
          alt=""
          fill
          className="absolute h-[708.06%] left-[-0.03%] max-w-none top-[-385.48%] w-[100.06%]"
          sizes={compact ? "168px" : "219px"}
          src="/landing-assets/logo-sprite.png"
        />
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="relative h-12 w-[60px] overflow-hidden">
      <Image
        alt="Vecalss Learning Academy"
        fill
        className="absolute h-[281.41%] left-[-40.26%] max-w-none top-[-53.21%] w-[181.03%]"
        sizes="60px"
        src="/landing-assets/logo-sprite.png"
      />
    </div>
  );
}

function SectionHeading({
  label,
  description,
  tone = "accent",
}: SectionHeadingProps) {
  const badgeClass =
    tone === "mint" ? "bg-primary-200 text-black" : "bg-accent-300 text-black";

  return (
    <div className="flex w-full flex-col items-center gap-4 px-4 text-center md:flex-row md:items-start md:gap-10 md:px-[100px] md:text-left">
      <div className="flex shrink-0 flex-col items-center md:items-start">
        <span
          className={`${badgeClass} rounded-[7px] px-[7px] text-[32px] leading-none font-medium md:text-[40px]`}
        >
          {label}
        </span>
      </div>
      <p className="max-w-[653px] text-[16px] leading-tight text-black md:text-[18px]">
        {description}
      </p>
    </div>
  );
}

function ProgramCard({
  title,
  href,
  art,
  artAlt,
  tone,
  chipTone,
}: (typeof programCards)[number]) {
  const isDark = tone === "dark";
  const backgroundClass =
    tone === "accent"
      ? "bg-accent-300"
      : tone === "dark"
        ? "bg-[#124c2b]"
        : "bg-[#f3f3f3]";
  const labelClass =
    chipTone === "white" ? "bg-white text-black" : "bg-accent-300 text-black";
  const linkTone = isDark ? "text-white" : "text-black";
  const iconTone = isDark ? "bg-white text-[#124c2b]" : "bg-[#124c2b] text-white";

  return (
    <article
      className={`${backgroundClass} flex min-h-[217px] flex-col justify-between overflow-hidden rounded-[32px] border border-[#124c2b] p-7 shadow-[0px_5px_0px_0px_#191a23] md:h-[297px] md:flex-row md:items-center md:rounded-[45px] md:p-[50px]`}
    >
      <div className="flex flex-col gap-10 md:gap-[93px]">
        <div className="flex flex-col items-start">
          {title.map((line) => (
            <span
              key={line}
              className={`${labelClass} rounded-[7px] px-[7px] text-[24px] leading-none font-medium md:text-[30px]`}
            >
              {line}
            </span>
          ))}
        </div>
        <Link
          href={href}
          className={`inline-flex items-center gap-[15px] text-[18px] leading-7 font-normal md:text-[20px] ${linkTone}`}
        >
          <span
            className={`${iconTone} inline-flex size-9 items-center justify-center rounded-full border border-[#124c2b] md:size-[41px]`}
          >
            <ArrowUpRight className="size-4 md:size-[18px]" />
          </span>
          <span>Learn more</span>
        </Link>
      </div>
      <Image
        alt={artAlt}
        height={150}
        className="mt-6 h-[100px] w-[100px] self-end md:mt-0 md:h-[150px] md:w-[150px]"
        width={150}
        src={art}
      />
    </article>
  );
}

function TestimonialCard({
  testimonial,
  className,
}: {
  testimonial: (typeof testimonials)[number];
  className?: string;
}) {
  return (
    <article className={className}>
      <div className="relative rounded-[32px] border border-accent-300 bg-[#124c2b] px-6 py-7 text-white md:rounded-[45px] md:px-[52px] md:py-[48px]">
        <p className="text-[16px] leading-[1.45] md:text-[30px]/[1.28]">
          “{testimonial.quote}”
        </p>
        <div className="absolute bottom-[-18px] left-20 h-9 w-9 rotate-45 border-r border-b border-accent-300 bg-[#124c2b]" />
      </div>
      <div className="pt-8 pl-5 md:pt-10 md:pl-20">
        <p className="text-[20px] leading-tight font-medium text-accent-300">
          {testimonial.name}
        </p>
        <p className="text-[18px] leading-tight text-white">{testimonial.meta}</p>
      </div>
    </article>
  );
}

function NavigationDots({ active = 0 }: { active?: number }) {
  return (
    <div className="flex items-center gap-3 text-[12px]">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={index === active ? "text-accent-300" : "text-white"}
        >
          ✦
        </span>
      ))}
    </div>
  );
}

function SocialIcon({ platform }: { platform: "linkedin" | "facebook" | "twitter" }) {
  if (platform === "linkedin") {
    return (
      <svg
        aria-hidden="true"
        className="size-4"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle cx="5.25" cy="7.25" fill="currentColor" r="1.75" />
        <path
          d="M4 10.25h2.5V18H4zM10 10.25h2.4v1.12h.03c.4-.74 1.37-1.52 2.83-1.52 3.03 0 3.6 1.99 3.6 4.58V18H16.4v-3.1c0-1.48-.03-3.38-2.06-3.38-2.07 0-2.39 1.61-2.39 3.28V18H10z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (platform === "facebook") {
    return (
      <svg
        aria-hidden="true"
        className="size-4"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M13.62 20v-7.1h2.38l.36-2.77h-2.74V8.35c0-.8.22-1.34 1.37-1.34H16.1V4.54c-.19-.03-.86-.08-1.63-.08-1.62 0-2.73.99-2.73 2.8v1.87H9.9v2.77h1.84V20z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M18.9 7.15c-.49.22-1.01.36-1.56.43a2.72 2.72 0 0 0 1.2-1.5 5.41 5.41 0 0 1-1.73.66 2.72 2.72 0 0 0-4.64 2.48 7.71 7.71 0 0 1-5.6-2.84 2.72 2.72 0 0 0 .84 3.63 2.7 2.7 0 0 1-1.23-.34v.04c0 1.32.94 2.41 2.18 2.66a2.73 2.73 0 0 1-1.22.05 2.72 2.72 0 0 0 2.54 1.88A5.47 5.47 0 0 1 5.7 15.4a7.71 7.71 0 0 0 4.17 1.22c5 0 7.73-4.14 7.73-7.73v-.35a5.48 5.48 0 0 0 1.3-1.39"
        fill="currentColor"
      />
    </svg>
  );
}

export default function HomePageModule() {
  return (
    <main className="overflow-x-hidden bg-white text-[#191a23]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-20 px-0 py-4 md:gap-[280px] md:py-3">
        <section
          id="about"
          className="flex flex-col gap-8 md:gap-[60px]"
        >
          <header className="flex items-center justify-between px-4 py-1 md:px-[100px] md:py-5">
            <div className="hidden md:block">
              <BrandLogo />
            </div>

            <div className="md:hidden">
              <BrandLogo compact />
            </div>

            <nav className="hidden items-center gap-10 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-[20px] leading-7 text-black transition-colors duration-200 hover:text-[#124c2b]"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="#contact"
                className="rounded-[14px] border border-[#191a23] px-[35px] py-[20px] text-[20px] leading-7 text-black transition-colors duration-200 hover:bg-[#f3f3f3]"
              >
                Register Now
              </Link>
            </nav>

            <details className="relative md:hidden">
              <summary className="list-none rounded-full border border-[#d9dfdb] p-2 text-[#191a23] [&::-webkit-details-marker]:hidden">
                <Menu className="size-5" />
              </summary>
              <div className="absolute right-0 top-full z-20 mt-3 w-56 rounded-[24px] border border-[#191a23] bg-white p-4 shadow-[0px_5px_0px_0px_#191a23]">
                <nav className="flex flex-col gap-3">
                  {navItems.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="text-[18px] leading-7 text-black"
                    >
                      {item.label}
                    </Link>
                  ))}
                  <Link href="#contact" className={`${primaryButtonClass} mt-2 w-full`}>
                    Register Now
                  </Link>
                </nav>
              </div>
            </details>
          </header>

          <div className="flex flex-col gap-6 px-4 md:min-h-[768px] md:flex-row md:items-center md:justify-between md:px-[100px]">
            <div className="flex max-w-[531px] flex-col gap-5 md:gap-[35px]">
              <h1 className="max-w-[531px] text-[40px] leading-[1.1] font-medium text-black md:text-[60px]">
                Achieve Your Dream University
              </h1>
              <Image
                alt="Student achievement illustration"
                className="mx-auto h-[246px] w-[246px] md:hidden"
                height={246}
                src="/landing-assets/hero-rating.svg"
                width={246}
              />
              <p className="max-w-[498px] text-[18px] leading-[1.35] text-black md:text-[20px] md:leading-7">
                Master every topic through structured learning modules, realistic tryouts,
                personalized analytics, and Vera AI—your 24/7 dedicated tutor.
              </p>
              <Link href="#contact" className={`${primaryButtonClass} w-full md:w-fit`}>
                Register now
              </Link>
            </div>

            <Image
              alt="Student achievement illustration"
              className="hidden h-[350px] w-[350px] shrink-0 md:block"
              height={350}
              src="/landing-assets/hero-rating.svg"
              width={350}
            />
          </div>
        </section>

        <section id="programs" className="flex flex-col gap-12 md:gap-[48px]">
          <SectionHeading
            label="Programs"
            description="Explore our structured preparation programs designed to help you master the material, ace your exams, and secure your dream university seat."
          />

          <div className="grid gap-5 px-4 md:grid-cols-2 md:gap-10 md:px-[100px]">
            {programCards.map((card) => (
              <ProgramCard key={card.title.join("-")} {...card} />
            ))}
          </div>
        </section>

        <section className="px-4 md:px-[100px]">
          <div className="overflow-hidden rounded-[32px] bg-[#f3f3f3] px-6 py-10 md:flex md:h-[347px] md:items-center md:justify-between md:gap-[250px] md:rounded-[45px] md:px-[60px] md:py-0">
            <div className="flex max-w-[500px] flex-col gap-6">
              <h2 className="text-[28px] leading-[1.1] font-medium text-black md:text-[30px]">
                Let’s secure your dream campus!
              </h2>
              <p className="text-[18px] leading-tight text-black">
                Ready to ace the entrance test? Join Vecalss today to unlock structured
                learning modules, intensive weekly tryouts, and 24/7 personalized guidance
                from Vera AI!
              </p>
              <Link href="#contact" className={`${primaryButtonClass} w-full md:w-fit`}>
                Save your spot now!
              </Link>
            </div>

            <Image
              alt="Chat and guidance illustration"
              className="mx-auto mt-8 h-[175px] w-[175px] md:mt-0 md:h-[400px] md:w-[400px] md:-translate-y-6"
              height={400}
              src="/landing-assets/cta-chat.svg"
              width={400}
            />
          </div>
        </section>

        <section id="faq" className="flex flex-col gap-12 md:gap-[48px]">
          <SectionHeading
            label="FAQ"
            description="Everything you need to know about the Vecalss learning experience, programs, and AI features."
            tone="mint"
          />
          <div className="px-4 md:px-[100px]">
            <div className="mx-auto w-full max-w-[1234px]">
              <FAQ />
            </div>
          </div>
        </section>

        <section
          id="features"
          className="flex flex-col gap-12 md:gap-[48px]"
        >
          <SectionHeading
            label="Testimonials"
            description="Hear from Our Satisfied Clients: Read Our Testimonials to Learn More about Our Digital Marketing Services"
          />

          <div id="testimonials" className="px-4 md:px-[100px]">
            <div className="overflow-hidden rounded-[32px] border border-[#124c2b] bg-[#0b2d19] px-5 py-8 shadow-[0px_5px_0px_0px_#191a23] md:rounded-[45px] md:px-0 md:py-0">
              <div className="md:hidden">
                <TestimonialCard testimonial={testimonials[1]} />
                <div className="mt-8 flex items-center justify-between px-3 text-white">
                  <ArrowLeft className="size-5" />
                  <NavigationDots active={0} />
                  <ArrowRight className="size-5" />
                </div>
              </div>

              <div className="relative hidden h-[625px] md:block">
                <div
                  className="absolute top-[84px] flex gap-[50px]"
                  style={{ transform: "translateX(-339px)" }}
                >
                  {testimonials.map((testimonial) => (
                    <TestimonialCard
                      key={testimonial.name}
                      testimonial={testimonial}
                      className="w-[606px] shrink-0"
                    />
                  ))}
                </div>

                <div className="absolute right-0 bottom-[90px] left-0 flex items-center justify-center gap-[190px] text-white">
                  <ArrowLeft className="size-6" />
                  <NavigationDots active={0} />
                  <ArrowRight className="size-6" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="flex flex-col gap-12 md:gap-[48px]">
          <SectionHeading
            label="Contact Us"
            description="Connect with Us: Let’s Discuss Your Digital Marketing Needs"
            tone="mint"
          />

          <div className="px-4 md:px-[100px]">
            <div className="overflow-hidden rounded-[32px] bg-[#f3f3f3] px-5 py-8 md:flex md:items-start md:justify-between md:gap-[120px] md:rounded-[45px] md:px-[100px] md:py-[60px]">
              <form className="flex max-w-[556px] flex-1 flex-col gap-10">
                <fieldset className="flex items-center gap-6 text-[18px] text-[#0b2d19]">
                  <label className="inline-flex items-center gap-3">
                    <input
                      className="peer sr-only"
                      defaultChecked
                      name="contact-topic"
                      type="radio"
                      value="say-hi"
                    />
                    <span className="inline-flex size-7 items-center justify-center rounded-full border border-[#0b2d19] bg-white">
                      <span className="size-3 rounded-full bg-transparent peer-checked:bg-primary-200" />
                    </span>
                    <span>Say Hi</span>
                  </label>
                  <label className="inline-flex items-center gap-3">
                    <input
                      className="peer sr-only"
                      name="contact-topic"
                      type="radio"
                      value="quote"
                    />
                    <span className="inline-flex size-7 items-center justify-center rounded-full border border-[#0b2d19] bg-white">
                      <span className="size-3 rounded-full bg-transparent peer-checked:bg-primary-200" />
                    </span>
                    <span>Get a Quote</span>
                  </label>
                </fieldset>

                <div className="flex flex-col gap-[25px]">
                  <label
                    className="flex flex-col gap-[5px] text-[#0b2d19]"
                    htmlFor="contact-name"
                  >
                    <span className="text-[16px] leading-7">Name</span>
                    <input
                      autoComplete="name"
                      className="rounded-[14px] border border-[#0b2d19] bg-white px-[30px] py-[18px] text-[18px] text-[#0b2d19] outline-none placeholder:text-[#898989]"
                      id="contact-name"
                      name="name"
                      placeholder="Name"
                      type="text"
                    />
                  </label>

                  <label
                    className="flex flex-col gap-[5px] text-[#0b2d19]"
                    htmlFor="contact-email"
                  >
                    <span className="text-[16px] leading-7">Email*</span>
                    <input
                      autoComplete="email"
                      className="rounded-[14px] border border-[#0b2d19] bg-white px-[30px] py-[18px] text-[18px] text-[#0b2d19] outline-none placeholder:text-[#898989]"
                      id="contact-email"
                      name="email"
                      placeholder="Email"
                      type="email"
                    />
                  </label>

                  <label
                    className="flex flex-col gap-[5px] text-[#0b2d19]"
                    htmlFor="contact-message"
                  >
                    <span className="text-[16px] leading-7">Message*</span>
                    <textarea
                      className="min-h-[190px] rounded-[14px] border border-[#0b2d19] bg-white px-[30px] py-[18px] text-[18px] text-[#0b2d19] outline-none placeholder:text-[#898989]"
                      id="contact-message"
                      name="message"
                      placeholder="Message"
                    />
                  </label>
                </div>

                <button className={`${primaryButtonClass} w-full`} type="button">
                  Send Message
                </button>
              </form>

              <Image
                alt="Envelope illustration"
                className="hidden h-[465px] w-[465px] shrink-0 md:block"
                height={465}
                src="/landing-assets/contact-mail.svg"
                width={465}
              />
            </div>
          </div>
        </section>

        <footer className="overflow-hidden rounded-t-[32px] bg-[#0b2d19] px-6 pt-10 pb-12 text-white md:rounded-[45px] md:px-[113px] md:pt-[55px] md:pb-[50px]">
          <div className="flex flex-col items-center gap-10 text-center md:items-start md:text-left">
            <div className="flex w-full flex-col items-center gap-8 md:flex-row md:items-center md:justify-between">
              <BrandMark />

              <nav className="flex flex-wrap items-center justify-center gap-6 text-[20px] leading-[23px] underline underline-offset-4 md:gap-10">
                {footerItems.map((item) => (
                  <Link key={item.label} href={item.href}>
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="flex items-center gap-5">
                <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-white text-[#0b2d19]">
                  <SocialIcon platform="linkedin" />
                </span>
                <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-white text-[#0b2d19]">
                  <SocialIcon platform="facebook" />
                </span>
                <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-white text-[#0b2d19]">
                  <SocialIcon platform="twitter" />
                </span>
              </div>
            </div>

            <div className="flex w-full flex-col gap-5 md:max-w-[332px]">
              <span className="w-fit rounded-[7px] bg-accent-300 px-[7px] text-[20px] leading-[26px] font-medium text-black">
                Contact us
              </span>
              <div className="space-y-3 text-[18px] leading-[1.3]">
                <p>Email: info@vecalss.com</p>
                <p>Phone: 555-567-8901</p>
                <p>
                  Address: 1234 Main St
                  <br />
                  Moonstone City, Stardust State 12345
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-white/70 pt-6 md:mt-[50px] md:pt-[50px]">
            <div className="flex flex-col items-center gap-3 text-center text-[18px] md:flex-row md:gap-10 md:text-left">
              <p>© 2026 Vecalss. All Rights Reserved.</p>
              <Link href="#about" className="underline underline-offset-4">
                Privacy Policy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";

import { ContactForm } from "./components/contact-form";
import { FAQ } from "./components/FAQ";
import {
  ActionButtonLink,
  BrandLogo,
  SectionHeading,
} from "./components/home-primitives";
import { HomeFooter } from "./components/home-footer";
import { ProgramCard } from "./components/program-card";
import { TestimonialsCarousel } from "./components/testimonials-carousel";
import { navItems, programCards } from "./data";

export default function HomePageModule() {
  return (
    <main className="overflow-x-hidden bg-white text-secondary-900">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-20 px-0 py-4 md:gap-[280px] md:py-3">
        <section id="about" className="flex flex-col gap-8 md:gap-[60px]">
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
              <ActionButtonLink href="#contact" variant="brandOutline">
                Register Now
              </ActionButtonLink>
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
                  <ActionButtonLink className="mt-2 w-full" href="#contact">
                    Register Now
                  </ActionButtonLink>
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
              <ActionButtonLink className="w-full md:w-fit" href="#contact">
                Register now
              </ActionButtonLink>
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
              <ActionButtonLink className="w-full md:w-fit" href="#contact">
                Save your spot now!
              </ActionButtonLink>
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
            <TestimonialsCarousel />
          </div>
        </section>

        <section id="contact" className="flex flex-col gap-12 md:gap-[48px]">
          <SectionHeading
            label="Contact Us"
            description="Connect with Us: Let’s Discuss Your Digital Marketing Needs"
            tone="mint"
          />

          <div className="px-4 md:px-[100px]">
            <ContactForm />
          </div>
        </section>
      </div>

      <HomeFooter />
    </main>
  );
}
